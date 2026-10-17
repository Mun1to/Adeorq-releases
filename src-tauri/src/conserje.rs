// El conserje: el chat principal que lo conecta todo.
//
// ── LO QUE PIDIÓ MUNIR (2026-09-30), CON SUS PALABRAS ───────────────────────
//
// «Es todo en un chat y dentro de ese chat se ven diferentes pestañas o cosas
// trabajando; si haces clic vas a esa sesión. El chat principal es un conserje
// que conecta todo.» Tú hablas con el conserje; él entiende lo que quieres,
// recomienda el modelo (si el router está encendido), abre la sesión de trabajo
// con el CLI que toca y le pasa las instrucciones. Las sesiones se ven como
// pestañas dentro del mismo chat.
//
// ── LA MEMORIA POR ÍNDICE, QUE ES LO QUE ESTE ARCHIVO RESUELVE ──────────────
//
// El problema, con su captura: una sesión de Claude Code al 60 % de contexto,
// 607.573 fichas, y Adeorq avisando de que «cada mensaje las paga todas otra
// vez». Una conversación larga dentro de un CLI solo sabe ACUMULAR. Su hipótesis:
// un índice comprimido, y que el agente descomprima lo que necesite.
//
// Así que la conversación del conserje NO vive en un CLI: vive aquí, en un
// fichero por conversación, y a cada mensaje el modelo recibe solo esto:
//
//   1. el ÍNDICE: una línea por cada turno viejo (quién habló y de qué);
//   2. lo ÚLTIMO, entero: los turnos más recientes tal cual;
//   3. las PESTAÑAS: qué sesiones de trabajo hay abiertas y para qué;
//   4. y una herramienta, `leer_turno`, para traerse entero el turno viejo que
//      le haga falta. Eso es el «descomprimir».
//
// Y no es fe: la prueba de referencia de memoria (LongMemEval, ICLR 2025) midió
// que el mismo modelo acierta 0,87 con solo lo necesario y 0,61 con las 115.000
// palabras enteras. Llevar de más no es solo caro: responde peor.
//
// El trabajo pesado no pasa por aquí: lo hacen las sesiones de trabajo, cada una
// con UN encargo, que es lo que impide que ninguna llegue a las 600.000 fichas.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;

/// Cuántos turnos del final van enteros. Los de antes van al índice.
pub const ENTEROS: usize = 4;

/// Tope de cada turno entero. Una respuesta con un volcado de mil líneas no
/// puede comerse la ventana entera: si hace falta todo, está `leer_turno`.
pub const TOPE_TURNO: usize = 4_000;

/// Tope del contexto entero que se le da al conserje, en caracteres. Unas 6.000
/// fichas: sobra para decidir qué hacer, y cabe en cualquier modelo barato.
pub const TOPE_CONTEXTO: usize = 24_000;

/// Largo de una línea del índice.
const LINEA_INDICE: usize = 140;

/// Lo que el conserje escribe al final de cada respuesta para el índice.
pub const MARCA_RESUMEN: &str = "RESUMEN:";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Turno {
    pub n: u32,
    /// `tu`, `conserje` o, en un enjambre, `sesion`: lo que contestó una de las
    /// sesiones del grupo al acabar su turno.
    pub rol: String,
    pub texto: String,
    /// La línea que va al índice cuando el turno deja de estar entre los últimos.
    pub resumen: String,
    /// Segundos desde 1970.
    pub cuando: u64,
    /// Quién habla cuando el turno es de una sesión: su nombre.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub de: String,
}

/// Una sesión de trabajo que abrió el conserje: una pestaña del chat. En un
/// enjambre no la abrió él: ya estaba abierta y Munir la metió en el grupo.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Trabajo {
    /// El panel de Adeorq donde vive. Es por lo que se la encuentra.
    pub panel: u32,
    pub cli: String,
    pub modelo: String,
    #[serde(default)]
    pub cuenta: String,
    pub carpeta: String,
    /// Para qué se abrió, en una frase.
    pub encargo: String,
    pub abierto: u64,
    /// Quién eligió el modelo, `router` o `tu`, apuntado AL ABRIR: apagar el
    /// router después no reescribe quién eligió lo que ya estaba abierto.
    #[serde(default)]
    pub eligio: String,
    /// El porqué del router, tal cual lo dijo.
    #[serde(default)]
    pub porque: String,
    /// En qué turno lo abrió el conserje: su tarjeta va justo después.
    #[serde(default)]
    pub turno: u32,
    /// El id de su sesión, apuntado en cuanto se sabe. Es lo que deja volver a
    /// ella cuando el PANEL ya se cerró: la conversación sigue en el disco.
    #[serde(default)]
    pub sesion: String,
    /// El arranque de Adeorq en que se abrió (ver `arranque`). Lo pone Rust al
    /// apuntarlo, no el front. Cero en las de antes: cuentan como de otro.
    #[serde(default)]
    pub arranque: u64,
    /// Munir quitó su pestaña. La tarjeta sigue en el hilo, que es el registro
    /// de lo que se abrió; solo deja de ser una pestaña.
    #[serde(default)]
    pub soltado: bool,
    /// En un enjambre: cómo se llama la sesión, que es por lo que Munir la
    /// nombra («dile a la del login»).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub nombre: String,
}

/// Los números de panel vuelven a empezar en 1 cada vez que se abre Adeorq
/// (`nextId` en `App.tsx`), así que el «panel 3» de ayer es hoy otra terminal.
/// Cada trabajo se apunta con el arranque en que nació, y los de otro son
/// historia: ni se les pide estado ni se les escribe. En milisegundos, que en
/// nanosegundos no cabe entero en un número de JavaScript.
///
/// Con las terminales en su propio proceso (`terminales.rs`), la «vida» de los
/// números es la de ESE proceso, no la de la app: tras una actualización la
/// terminal 4 sigue siendo la misma, y sus decisiones, sus trabajos del
/// conserje y sus avisos del móvil tienen que seguir valiendo. Lo fija
/// `terminales::arrancar` antes de que nadie lo lea; se lee una vez y no cambia
/// en toda la vida de la app.
pub fn arranque() -> u64 {
    static A: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *A.get_or_init(|| DEL_PROCESO.get().copied().unwrap_or_else(abierta))
}

/// Cuándo nació el proceso de terminales al que se enganchó la app.
static DEL_PROCESO: std::sync::OnceLock<u64> = std::sync::OnceLock::new();

/// Cuándo se abrió esta app.
fn abierta() -> u64 {
    static B: std::sync::OnceLock<u64> = std::sync::OnceLock::new();
    *B.get_or_init(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(1)
    })
}

/// La app se enganchó a un proceso de terminales nacido en `a`: esa es la vida
/// de los números. Si alguien ya leyó el arranque, se queda el que leyó (lo de
/// siempre) y se apunta, porque mezclar dos dentro de una vida sería peor.
pub fn fijar_arranque(a: u64) {
    abierta();
    if a == 0 {
        return;
    }
    let _ = DEL_PROCESO.set(a);
    if arranque() != a {
        crate::anotar("terminales: el arranque ya se había leído; se queda el de la app");
    }
}

/// Desde cuándo vale una decisión que no tiene terminal apuntada: desde que se
/// abrió ESTA app. Con un proceso de terminales que vive más que ella, el
/// arranque es más viejo, y lo pedido por un Capataz de una vida anterior de la
/// app (que murió con ella) saldría como vivo para siempre.
pub fn desde_para_lo_suelto(arranque: u64) -> u64 {
    if DEL_PROCESO.get().is_some() {
        arranque.max(abierta())
    } else {
        arranque
    }
}

impl Trabajo {
    /// Si su panel es de este arranque, o sea si el número apunta a SU terminal.
    pub fn de_ahora(&self) -> bool {
        self.arranque == arranque()
    }
    /// Si el conserje le puede escribir: de este arranque y con su pestaña.
    pub fn escribible(&self) -> bool {
        self.de_ahora() && !self.soltado
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct Conversacion {
    pub id: String,
    #[serde(default)]
    pub titulo: String,
    #[serde(default)]
    pub turnos: Vec<Turno>,
    #[serde(default)]
    pub trabajos: Vec<Trabajo>,
    /// Si el router elige el modelo de cada trabajo. Munir: «el router puedes
    /// activarlo y desactivarlo».
    #[serde(default = "encendido")]
    pub router: bool,
    #[serde(default)]
    pub creada: u64,
    /// Con qué modelo piensa el PROPIO conserje en esta conversación. El router
    /// elige el de las sesiones que abre, no este. Munir, 2026-10-05: «¿por qué
    /// no puedes elegir el modelo del conserje?». Vacío es el de siempre.
    #[serde(default)]
    pub cerebro: String,
    /// El modelo de las SESIONES cuando el router está apagado, elegido en la
    /// pastilla del PC. Va en la conversación para que el móvil use el mismo:
    /// antes vivía solo en la caja del PC y el móvil caía al de por defecto.
    /// Vacío es «el de por defecto de Ajustes, o Sonnet».
    #[serde(default)]
    pub fijo: String,
    /// Es un ENJAMBRE del lienzo: sus trabajos son sesiones que ya estaban
    /// abiertas y que Munir juntó en un grupo, y quien contesta es Adeo, que
    /// reparte entre ellas lo que se escribe en la caja común (ver
    /// `SISTEMA_ENJAMBRE`). No sale en la lista del Chat: vive en su pieza.
    #[serde(default, skip_serializing_if = "es_falso")]
    pub enjambre: bool,
}

fn encendido() -> bool {
    true
}

fn es_falso(b: &bool) -> bool {
    !*b
}

/// Los modelos con los que puede pensar el conserje. Lista cerrada: el nombre
/// va a la línea de órdenes de `claude`, así que no entra nada que no esté aquí.
pub const CEREBROS: [&str; 3] = ["haiku", "sonnet", "opus"];

/// Sonnet por lo mismo que el Capataz (`foreman.rs`): de acertar aquí depende
/// qué sesiones se abren, y eso no es un recado; pero tampoco hace el trabajo.
const CEREBRO_POR_DEFECTO: &str = "sonnet";

/// El de un enjambre. Munir, 2026-10-13: «Adeo es el que lo orquesta junto a
/// Haiku u otro modelo más pequeño que mejora los prompts y los manda a cada
/// sesión». Aquí no se decide qué sesiones se abren: se reparte entre las que
/// hay, y eso sí es un recado.
const CEREBRO_DE_ENJAMBRE: &str = "haiku";

/// Cuántas sesiones caben en un enjambre. El doble que una cuadrilla del
/// Capataz (seis), porque estas ya estaban abiertas: juntarlas no gasta nada.
pub const MAX_MIEMBROS: usize = 12;

/// Lo que se guarda de la respuesta de una sesión en el hilo del grupo. Entera
/// está en su transcript; aquí va lo que cabe leer en una tarjeta.
pub const TOPE_RESPUESTA: usize = 6_000;

impl Conversacion {
    /// El modelo con el que piensa: el elegido si es de la lista, si no el de siempre.
    pub fn cerebro(&self) -> &'static str {
        let de_siempre = if self.enjambre { CEREBRO_DE_ENJAMBRE } else { CEREBRO_POR_DEFECTO };
        CEREBROS.iter().copied().find(|c| *c == self.cerebro).unwrap_or(de_siempre)
    }
}

pub fn ahora() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Un id solo puede ser esto: va a un nombre de archivo, así que un `..\algo`
/// sería salirse de la carpeta. Se RECHAZA, no se limpia (igual que `chat.rs`).
fn ruta(id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.len() > 64
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("id de conversación no válido".into());
    }
    let dir = crate::dir_datos()?.join("conserje");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{id}.json")))
}

/// Una conversación guardada. Nueva y vacía si todavía no existe.
pub fn leer(id: &str) -> Result<Conversacion, String> {
    let p = ruta(id)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("conversación ilegible: {e}")),
        Err(_) => Ok(Conversacion {
            id: id.to_string(),
            router: true,
            creada: ahora(),
            ..Default::default()
        }),
    }
}

/// Se escribe al lado y se renombra: un corte a mitad no puede dejar una
/// conversación a medias que luego no se pueda leer.
pub fn guardar(c: &Conversacion) -> Result<(), String> {
    let p = ruta(&c.id)?;
    let texto = serde_json::to_string(c).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(texto.as_bytes()).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Los comandos corren cada uno en su hilo y un envío tarda minutos: sin esto,
/// lo que cambiaras mientras el conserje piensa (el modelo, el router, una
/// pestaña cerrada) se perdía al guardar él su respuesta encima.
static ESCRIBIENDO: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Leer, cambiar y guardar una conversación sin que otro cambio se cuele entre
/// medias.
fn cambiar<T>(id: &str, f: impl FnOnce(&mut Conversacion) -> T) -> Result<T, String> {
    let _cerrojo = ESCRIBIENDO.lock().unwrap_or_else(|e| e.into_inner());
    let mut c = leer(id)?;
    let r = f(&mut c);
    guardar(&c)?;
    Ok(r)
}

/// Todas las conversaciones, la más reciente primero, sin sus turnos: para la
/// lista de la izquierda no hace falta leer cien mil caracteres de cada una.
/// Cada una con el id, el título, su último turno, cuántas sesiones abrió y
/// la carpeta de la última (el móvil la cuelga de ese proyecto).
pub fn lista() -> Vec<(String, String, u64, usize, String)> {
    let Ok(dir) = crate::dir_datos().map(|d| d.join("conserje")) else { return Vec::new() };
    let Ok(ficheros) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut fuera = Vec::new();
    for f in ficheros.flatten() {
        let p = f.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(s) = std::fs::read_to_string(&p) else { continue };
        let Ok(c) = serde_json::from_str::<Conversacion>(&s) else { continue };
        // Elegir el modelo o el router antes de hablar ya guarda el fichero:
        // sin un solo mensaje, en la lista sería una fila vacía.
        if c.turnos.is_empty() {
            continue;
        }
        // Un enjambre no es una conversación del Chat: vive en su pieza del
        // lienzo. En la lista (y en el móvil, que lee la misma) sería un chat
        // del conserje con pestañas que él no abrió.
        if c.enjambre {
            continue;
        }
        let ultimo = c.turnos.last().map(|t| t.cuando).unwrap_or(c.creada);
        let carpeta = c.trabajos.last().map(|w| w.carpeta.clone()).unwrap_or_default();
        fuera.push((c.id, c.titulo, ultimo, c.trabajos.len(), carpeta));
    }
    fuera.sort_by(|a, b| b.2.cmp(&a.2));
    fuera
}

/// Corta por CARACTERES, nunca por bytes: una tilde a mitad de corte es un
/// pánico en Rust, y ese fallo ya dejó una noche entera las terminales mudas.
fn corto(s: &str, max: usize) -> String {
    let limpio = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if limpio.chars().count() <= max {
        return limpio;
    }
    let mut t: String = limpio.chars().take(max.saturating_sub(1)).collect();
    t.push('…');
    t
}

/// La línea de índice de lo que dijo Munir: la primera frase, recortada. No
/// hace falta un modelo para esto, y así el índice no cuesta nada.
pub fn resumen_de_lo_tuyo(texto: &str) -> String {
    // Un texto con cabecera y lista, que es justo lo que devuelve Mejorar
    // («Dos encargos, por orden:» y 1., 2.), se quedaba en la cabecera: el
    // índice decía «Dos encargos, por orden:» y nada de lo encargado.
    if let Some((cabecera, puntos)) = cabecera_y_lista(texto) {
        return corto(&format!("{cabecera} {}", puntos.join("; ")), LINEA_INDICE);
    }
    let primera = texto
        .split(['\n', '.', '?', '!'])
        .map(str::trim)
        .find(|s| !s.is_empty())
        .unwrap_or(texto);
    corto(primera, LINEA_INDICE)
}

/// El título de una conversación. Si empieza por cabecera y lista, la
/// cabecera («Dos encargos, por orden:») no distingue una de otra: se
/// titula con lo encargado.
fn titulo_de(texto: &str) -> String {
    match cabecera_y_lista(texto) {
        Some((_, puntos)) => corto(&puntos.join(" · "), 60),
        None => corto(&resumen_de_lo_tuyo(texto), 60),
    }
}

/// «Algo:» en la primera línea y al menos un punto de lista debajo. Los puntos
/// salen sin su marca (`1.`, `2)`, `-`, `*`, `•`) ni el punto final.
fn cabecera_y_lista(texto: &str) -> Option<(String, Vec<String>)> {
    let mut lineas = texto.lines().map(str::trim).filter(|l| !l.is_empty());
    let cabecera = lineas.next()?;
    if !cabecera.ends_with(':') {
        return None;
    }
    let puntos: Vec<String> = lineas
        .filter_map(|l| {
            let sin_numero = l.trim_start_matches(|c: char| c.is_ascii_digit());
            let resto = if sin_numero.len() < l.len() {
                sin_numero.strip_prefix(['.', ')'])?
            } else {
                l.strip_prefix(['-', '*', '•'])?
            };
            let resto = resto.trim().trim_end_matches('.');
            (!resto.is_empty()).then(|| resto.to_string())
        })
        .collect();
    (!puntos.is_empty()).then(|| (cabecera.to_string(), puntos))
}

/// Separa la respuesta del conserje de su línea de índice.
///
/// Se le pide que acabe con `RESUMEN: …` en su propia línea; así el comprimir
/// sale en la MISMA llamada y no en otra que costaría otro viaje. Si se le
/// olvida, el índice se queda con el principio de la respuesta, que es peor
/// pero no miente.
pub fn separar_resumen(respuesta: &str) -> (String, String) {
    if let Some(pos) = respuesta.rfind(MARCA_RESUMEN) {
        // Solo cuenta si está al principio de una línea: un «RESUMEN:» citado a
        // mitad de frase no es la marca.
        let antes = &respuesta[..pos];
        if antes.is_empty() || antes.ends_with('\n') {
            let resumen = respuesta[pos + MARCA_RESUMEN.len()..].trim();
            let texto = antes.trim_end().to_string();
            if !resumen.is_empty() {
                return (texto, corto(resumen, LINEA_INDICE));
            }
            return (texto.clone(), resumen_de_lo_tuyo(&texto));
        }
    }
    (respuesta.trim().to_string(), resumen_de_lo_tuyo(respuesta))
}

impl Conversacion {
    pub fn apuntar(&mut self, rol: &str, texto: &str, resumen: &str) -> &Turno {
        let n = self.turnos.last().map(|t| t.n + 1).unwrap_or(1);
        if self.titulo.is_empty() && rol == "tu" {
            self.titulo = titulo_de(texto);
        }
        self.turnos.push(Turno {
            n,
            rol: rol.to_string(),
            texto: texto.to_string(),
            resumen: resumen.to_string(),
            cuando: ahora(),
            de: String::new(),
        });
        self.turnos.last().expect("recién puesto")
    }

    /// Lo que contestó una sesión de un enjambre, apuntado en el hilo del grupo
    /// con su nombre. Dice si lo apuntó.
    ///
    /// El lienzo lo pide cada vez que ve acabar a una sesión, y una terminal que
    /// se relee o un tablero que se reabre la ven acabar otra vez: si lo último
    /// que hay de ESA sesión es este mismo texto, no se repite.
    pub fn apuntar_respuesta(&mut self, de: &str, texto: &str) -> bool {
        let texto = texto.trim();
        if texto.is_empty() {
            return false;
        }
        let guardado: String = if texto.chars().count() > TOPE_RESPUESTA {
            let cabe: String = texto.chars().take(TOPE_RESPUESTA).collect();
            format!("{cabe}\n\n[… sigue en su terminal]")
        } else {
            texto.to_string()
        };
        let ya = self.turnos.iter().rev().find(|t| t.rol == "sesion" && t.de == de).map(|t| t.texto == guardado);
        if ya == Some(true) {
            return false;
        }
        let primera = guardado.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
        let resumen = corto(primera, LINEA_INDICE);
        self.apuntar("sesion", &guardado, &resumen);
        if let Some(t) = self.turnos.last_mut() {
            t.de = de.to_string();
        }
        true
    }

    /// Las sesiones de un enjambre, ENTERAS: lo que había se sustituye.
    ///
    /// Quien sabe cuáles son es el lienzo (se añaden y se quitan allí, y un
    /// tablero reabierto las trae con otro número de panel), así que no se
    /// apuntan de una en una: cada cambio manda la lista como queda. Todas
    /// llevan el arranque de ahora, que es lo que le deja a Adeo escribirles.
    pub fn poner_miembros(&mut self, miembros: Vec<Trabajo>) {
        let mut puestos: Vec<Trabajo> = Vec::new();
        for mut m in miembros {
            if puestos.len() >= MAX_MIEMBROS || puestos.iter().any(|p| p.panel == m.panel) {
                continue;
            }
            m.arranque = arranque();
            m.soltado = false;
            m.nombre = corto(&m.nombre, 80);
            puestos.push(m);
        }
        self.trabajos = puestos;
    }

    /// Quién firma un turno delante del modelo. `entero` es para lo último,
    /// donde se le recuerda cuál de las voces es la suya.
    fn firma(&self, t: &Turno, entero: bool) -> String {
        match t.rol.as_str() {
            "tu" => "Munir".to_string(),
            "sesion" => format!("La sesión «{}»", t.de),
            _ if !entero => if self.enjambre { "Adeo" } else { "conserje" }.to_string(),
            _ => if self.enjambre { "Tú (Adeo)" } else { "Tú (conserje)" }.to_string(),
        }
    }

    /// Deja la conversación lista para un mensaje tuyo y devuelve el contexto
    /// que tiene que ver el conserje.
    ///
    /// El contexto se arma ANTES de apuntar el mensaje (va aparte al final del
    /// prompt; si no, saldría dos veces). Y reintentar tras un fallo manda lo
    /// MISMO otra vez: si lo último es ese mismo mensaje tuyo sin contestar, se
    /// quita antes, o cada reintento dejaba tu frase repetida en la
    /// conversación y en su índice.
    pub fn preparar(&mut self, texto: &str, estados: &dyn Fn(u32) -> String) -> String {
        let reintento = self.turnos.last().map(|t| t.rol == "tu" && t.texto == texto).unwrap_or(false);
        if reintento {
            self.turnos.pop();
        }
        let contexto = self.contexto(estados);
        self.apuntar("tu", texto, &resumen_de_lo_tuyo(texto));
        contexto
    }

    /// Apunta un trabajo que se ACABA de abrir, que siempre es de este
    /// arranque. Poner al día uno que ya estaba es otro camino
    /// (`apuntar_sesion`): con uno solo, «llega sin arranque» no distinguía uno
    /// nuevo de uno de antes de que existiera el campo, y el de antes se
    /// duplicaba en cada puesta al día (medido: la interfaz entraba en bucle).
    pub fn apuntar_trabajo(&mut self, mut trabajo: Trabajo) {
        trabajo.arranque = arranque();
        trabajo.soltado = false;
        match self.trabajos.iter_mut().find(|t| t.panel == trabajo.panel && t.arranque == trabajo.arranque) {
            Some(t) => *t = trabajo,
            None => self.trabajos.push(trabajo),
        }
    }

    /// La sesión de un trabajo, apuntada en su sitio y sin tocar nada más. Se
    /// reconoce por panel Y arranque: el panel solo se repite entre arranques.
    pub fn apuntar_sesion(&mut self, panel: u32, arranque: u64, sesion: &str) {
        for t in self.trabajos.iter_mut().filter(|t| t.panel == panel && t.arranque == arranque) {
            t.sesion = sesion.to_string();
        }
    }

    pub fn soltar(&mut self, panel: u32, arranque: u64) {
        for t in self.trabajos.iter_mut().filter(|t| t.panel == panel && t.arranque == arranque) {
            t.soltado = true;
        }
    }

    /// Un turno entero, por su número: lo que pide la herramienta `leer_turno`.
    pub fn turno(&self, n: u32) -> Option<&Turno> {
        self.turnos.iter().find(|t| t.n == n)
    }

    /// EL CONTEXTO POR ÍNDICE. Es lo único que el conserje ve de la conversación.
    ///
    /// `estados` dice cómo va cada pestaña (por su panel), y lo pone quien
    /// llama, que es quien sabe leer las sesiones sin gastar un token.
    pub fn contexto(&self, estados: &dyn Fn(u32) -> String) -> String {
        let mut enteros = String::new();
        let desde = self.turnos.len().saturating_sub(ENTEROS);
        for t in &self.turnos[desde..] {
            let quien = self.firma(t, true);
            let cuerpo: String = t.texto.chars().take(TOPE_TURNO).collect();
            let cortado = if t.texto.chars().count() > TOPE_TURNO {
                format!("\n[… cortado: pide leer_turno({}) para verlo entero]", t.n)
            } else {
                String::new()
            };
            enteros.push_str(&format!("\n#{} {quien}:\n{cuerpo}{cortado}\n", t.n));
        }

        let mut pestanas = String::new();
        for w in self.trabajos.iter().filter(|w| !w.soltado) {
            // Las de otro arranque van sin número: ese panel hoy es de otro, y
            // un número a la vista es una invitación a escribirle.
            let (donde, estado) = if w.de_ahora() {
                (format!("panel {}", w.panel), estados(w.panel))
            } else {
                ("sin panel".to_string(), "cerrada: de otra vez que se abrió Adeorq".to_string())
            };
            if self.enjambre {
                // En un enjambre no hay «para qué se abrió»: hay un nombre, que
                // es por lo que Munir la llama.
                pestanas.push_str(&format!(
                    "- {donde} · «{}» · {} {} · {} · {estado}\n",
                    w.nombre, w.cli, w.modelo, w.carpeta,
                ));
                continue;
            }
            pestanas.push_str(&format!(
                "- {donde} · {} {} · {} · para: {} · {estado}\n",
                w.cli,
                w.modelo,
                w.carpeta,
                corto(&w.encargo, 100),
            ));
        }

        // El índice, de lo más viejo a lo más nuevo. Si no cabe, se caen las
        // líneas MÁS VIEJAS y se dice cuántas: lo reciente importa más, y lo
        // caído sigue disponible con `leer_turno`.
        let lineas: Vec<String> = self.turnos[..desde]
            .iter()
            .map(|t| format!("#{} {}: {}", t.n, self.firma(t, false), corto(&t.resumen, LINEA_INDICE)))
            .collect();
        let fijo = enteros.chars().count() + pestanas.chars().count() + 600;
        let hueco = TOPE_CONTEXTO.saturating_sub(fijo);
        let mut usado = 0;
        let mut caben = 0;
        for l in lineas.iter().rev() {
            let largo = l.chars().count() + 1;
            if usado + largo > hueco {
                break;
            }
            usado += largo;
            caben += 1;
        }
        let caidas = lineas.len() - caben;

        let mut fuera = String::new();
        if !lineas.is_empty() {
            fuera.push_str("== ÍNDICE DE LA CONVERSACIÓN (lo de antes, una línea por turno) ==\n");
            if caidas > 0 {
                fuera.push_str(&format!(
                    "(y {caidas} turnos más antiguos que no caben: pídelos con leer_turno si hacen falta)\n"
                ));
            }
            for l in &lineas[caidas..] {
                fuera.push_str(l);
                fuera.push('\n');
            }
            fuera.push_str("Si necesitas un turno de estos entero, pídelo con leer_turno(número).\n\n");
        }
        if !pestanas.is_empty() {
            fuera.push_str(if self.enjambre {
                "== SESIONES DEL ENJAMBRE ==\n"
            } else {
                "== PESTAÑAS: sesiones de trabajo abiertas ==\n"
            });
            fuera.push_str(&pestanas);
            fuera.push('\n');
        }
        fuera.push_str("== LO ÚLTIMO, ENTERO ==");
        fuera.push_str(&enteros);
        fuera
    }
}

// ─── LO QUE DEVUELVE EL CONSERJE, Y LA REJA ───────────────────────────────────
//
// El conserje NO abre sesiones ni escribe en ellas: dice qué haría, y lo hace
// la app. Es el principio de la casa («el modelo interpreta, el código
// determinista restringe») y es lo que hace que el interruptor del router sea
// de verdad: cada trabajo pasa por `recetar` en el front, con sus 33 casos
// probados, en vez de quedar a merced de lo que el modelo diga que eligió.

/// Una cosa que el conserje quiere que pase.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Accion {
    /// Abrir una sesión de trabajo con UN encargo.
    Abrir {
        encargo: String,
        carpeta: String,
        /// Lo que el router necesita para elegir: `recado`, `oficio` o `juicio`.
        #[serde(default)]
        clase: String,
        /// `baja` o `alta`: si equivocarse se nota tarde.
        #[serde(default)]
        consecuencia: String,
        #[serde(default)]
        largo: bool,
        /// `codigo`, `texto`, `lectura` o `diseno`.
        #[serde(default)]
        trabajo: String,
    },
    /// Escribir en una sesión que YA abrió el conserje (contestarle, seguir).
    Escribir { panel: u32, texto: String },
}

/// Lo que llega al front después de cada mensaje.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Respuesta {
    pub texto: String,
    pub acciones: Vec<Accion>,
    /// Lo que la reja tiró y por qué, para que se vea en vez de desaparecer.
    pub descartes: Vec<String>,
}

/// Como mucho tantas sesiones nuevas por mensaje. Un «haz esto» mal entendido
/// no puede abrir diez Claudes de golpe.
pub const MAX_ABRIR: usize = 4;

const APERTURA: &str = "<acciones>";
const CIERRE: &str = "</acciones>";

/// Separa lo que dice el conserje de sus acciones y de su línea de índice.
///
/// Tolerante a propósito, como `interpretar` en el router: si el bloque de
/// acciones no es JSON válido se pierden las acciones y se dice, pero la
/// respuesta a Munir llega igual.
pub fn leer_respuesta(bruta: &str) -> (String, Vec<Accion>, String, Vec<String>) {
    let mut descartes = Vec::new();
    let mut acciones = Vec::new();
    let mut resto = bruta.to_string();
    if let (Some(a), Some(c)) = (bruta.find(APERTURA), bruta.rfind(CIERRE)) {
        if c > a {
            let dentro = bruta[a + APERTURA.len()..c].trim();
            // Por si el modelo lo envuelve en ```json.
            let dentro = dentro.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
            if !dentro.is_empty() {
                match serde_json::from_str::<Vec<Accion>>(dentro) {
                    Ok(v) => acciones = v,
                    Err(e) => descartes.push(format!("las acciones no se entendían ({e}), así que no se ha hecho nada")),
                }
            }
            resto = format!("{}{}", &bruta[..a], &bruta[c + CIERRE.len()..]);
        }
    }
    let (texto, resumen) = separar_resumen(&resto);
    (texto, acciones, resumen, descartes)
}

/// LA REJA. Lo que no pasa por aquí no se hace, diga lo que diga el modelo.
///
/// - Una carpeta tiene que existir y estar dentro de la carpeta de proyectos:
///   el conserje no abre sesiones en `C:\Windows` porque se le ocurra.
/// - Solo se escribe en paneles que abrió ÉL en esta conversación: no puede
///   meterse en una terminal tuya que no tenga que ver.
/// - Un tope de sesiones nuevas por mensaje.
/// - Lo que el router necesita se normaliza a sus valores; lo que no se
///   reconoce cae al valor prudente, no al barato.
pub fn filtrar(
    acciones: Vec<Accion>,
    conv: &Conversacion,
    raiz: &std::path::Path,
    existe: &dyn Fn(&std::path::Path) -> bool,
) -> (Vec<Accion>, Vec<String>) {
    let mut buenas = Vec::new();
    let mut fuera = Vec::new();
    let raiz_plana = raiz.to_string_lossy().to_lowercase().replace('/', "\\");
    let mut abiertas = 0;
    for a in acciones {
        match a {
            Accion::Abrir { encargo, carpeta, clase, consecuencia, largo, trabajo } => {
                let encargo = encargo.trim().to_string();
                if encargo.is_empty() {
                    fuera.push("un trabajo sin encargo".into());
                    continue;
                }
                let ruta = std::path::PathBuf::from(carpeta.trim());
                let plana = ruta.to_string_lossy().to_lowercase().replace('/', "\\");
                if !plana.starts_with(&raiz_plana) || plana.contains("..") || !existe(&ruta) {
                    fuera.push(format!("«{}» no es una carpeta de tus proyectos", carpeta.trim()));
                    continue;
                }
                if abiertas >= MAX_ABRIR {
                    fuera.push(format!("más de {MAX_ABRIR} sesiones de golpe: «{}» se queda fuera", corto(&encargo, 60)));
                    continue;
                }
                abiertas += 1;
                let clase = match clase.as_str() {
                    "recado" | "oficio" | "juicio" => clase,
                    _ => "oficio".into(),
                };
                // Lo que no se sabe es ALTO: equivocarse en «baja» abarata
                // justo lo que no había que abaratar.
                let consecuencia = if consecuencia == "baja" { consecuencia } else { "alta".into() };
                let trabajo = match trabajo.as_str() {
                    "codigo" | "texto" | "lectura" | "diseno" => trabajo,
                    _ => "codigo".into(),
                };
                buenas.push(Accion::Abrir {
                    encargo,
                    carpeta: ruta.to_string_lossy().to_string(),
                    clase,
                    consecuencia,
                    largo,
                    trabajo,
                });
            }
            Accion::Escribir { panel, texto } => {
                if texto.trim().is_empty() {
                    continue;
                }
                if !conv.trabajos.iter().any(|t| t.panel == panel && t.escribible()) {
                    fuera.push(if conv.enjambre {
                        format!("el panel {panel} no es de este enjambre, así que no se le escribe")
                    } else {
                        format!("el panel {panel} no lo abrió el conserje, así que no se le escribe")
                    });
                    continue;
                }
                buenas.push(Accion::Escribir { panel, texto });
            }
        }
    }
    (buenas, fuera)
}

/// Lo que la reja dejó fuera, en inglés, para la app en inglés. Las rejas
/// escriben en español y lo traduce esto al final, en un solo sitio, para no
/// cambiar la firma de `filtrar` y de sus pruebas. Un aviso que no reconoce
/// sale tal cual: `cada_aviso_de_la_reja_tiene_su_ingles` los produce todos con
/// las funciones de verdad, así que retocar uno en español la pone en rojo.
pub fn descarte_en_ingles(s: &str) -> String {
    let entre = |a: &str, b: &str| s.strip_prefix(a).and_then(|r| r.strip_suffix(b)).map(str::to_string);
    if let Some(e) = entre("las acciones no se entendían (", "), así que no se ha hecho nada") {
        return format!("the actions could not be read ({e}), so nothing was done");
    }
    if s == "un trabajo sin encargo" {
        return "a job without a task".into();
    }
    if let Some(c) = entre("«", "» no es una carpeta de tus proyectos") {
        return format!("“{c}” is not one of your project folders");
    }
    if let Some(x) = entre(&format!("más de {MAX_ABRIR} sesiones de golpe: «"), "» se queda fuera") {
        return format!("more than {MAX_ABRIR} sessions at once: “{x}” is left out");
    }
    if let Some(p) = entre("el panel ", " no es de este enjambre, así que no se le escribe") {
        return format!("panel {p} is not in this swarm, so nothing was written to it");
    }
    if let Some(p) = entre("el panel ", " no lo abrió el conserje, así que no se le escribe") {
        return format!("panel {p} was not opened by the concierge, so nothing was written to it");
    }
    if let Some(x) = entre("un enjambre no abre sesiones (se añaden desde el lienzo): «", "» no se ha abierto") {
        return format!("a swarm does not open sessions (they are added from the canvas): “{x}” was not opened");
    }
    if let Some(p) = entre(
        "el panel ",
        " te está preguntando algo, así que no le ha llegado el reparto: contéstale a él solo",
    ) {
        return format!("panel {p} is asking you something, so the round did not reach it: answer it on its own");
    }
    s.to_string()
}

/// Cómo empieza el estado de una sesión que le está preguntando algo a Munir.
/// Es la palabra de `PALABRA.pregunta` en `lib/conserje.ts`: si cambia allí,
/// cambia aquí, y `la_reja_del_enjambre_no_reparte_a_quien_pregunta` lo vigila.
const PREGUNTA: &str = "te pregunta";

/// LA REJA DEL ENJAMBRE, que va delante de la de siempre.
///
/// - Un enjambre no abre sesiones: se le añaden desde el lienzo, a la vista.
/// - Un reparto (escribir a MÁS de una) se salta a la que le está preguntando
///   algo a Munir. Lo que se le escriba a esa caería en su menú, y un Intro
///   detrás elige la opción marcada: el 2026-10-08 un «2» mandado así eligió la
///   1 y subió un commit que no era. Escribirle a ella SOLA sí pasa: eso es
///   contestarle.
/// - Dos mensajes a la misma sesión se juntan en uno: dos pegados seguidos le
///   llegan como dos turnos, y el segundo mientras todavía lee el primero.
pub fn filtrar_enjambre(acciones: Vec<Accion>, estados: &dyn Fn(u32) -> String) -> (Vec<Accion>, Vec<String>) {
    let mut fuera = Vec::new();
    let mut escritos: Vec<(u32, String)> = Vec::new();
    for a in acciones {
        match a {
            Accion::Abrir { encargo, .. } => fuera.push(format!(
                "un enjambre no abre sesiones (se añaden desde el lienzo): «{}» no se ha abierto",
                corto(&encargo, 60)
            )),
            Accion::Escribir { panel, texto } => match escritos.iter_mut().find(|(p, _)| *p == panel) {
                Some((_, junto)) => {
                    junto.push_str("\n\n");
                    junto.push_str(texto.trim());
                }
                None => escritos.push((panel, texto.trim().to_string())),
            },
        }
    }
    let reparto = escritos.len() > 1;
    let mut buenas = Vec::new();
    for (panel, texto) in escritos {
        if reparto && estados(panel).starts_with(PREGUNTA) {
            fuera.push(format!(
                "el panel {panel} te está preguntando algo, así que no le ha llegado el reparto: contéstale a él solo"
            ));
            continue;
        }
        buenas.push(Accion::Escribir { panel, texto });
    }
    (buenas, fuera)
}

/// Cómo tiene que comportarse Adeo al frente de un enjambre.
pub const SISTEMA_ENJAMBRE: &str = r#"Eres ADEO y diriges un ENJAMBRE: un grupo de sesiones de trabajo que Munir ya tenía abiertas y ha juntado en una sola pieza del lienzo de Adeorq. Él escribe UNA vez en la caja del grupo (muchas veces dictando por voz, así que interpreta la intención); tú decides a qué sesión o sesiones va, se lo reescribes a cada una para que lo entienda a la primera, y le cuentas a él a quién se lo has mandado. Tú NO haces el trabajo ni abres sesiones: repartes entre las que hay.

A QUIÉN SE LO MANDAS
- Las sesiones están en SESIONES DEL ENJAMBRE: su panel, su nombre entre comillas, con qué corre, su carpeta y cómo va.
- Si él nombra una (por su nombre, por su proyecto o por el CLI que corre), va a esa y solo a esa.
- Si no nombra ninguna, va a la que ya lleva ese tema o ese proyecto: se ve en su nombre y en su carpeta.
- Si son varias cosas, cada cosa a su sesión. La misma cosa no se manda a dos, salvo que él diga «a todas».
- Entre dos que valen, mejor la que ha terminado que la que está trabajando, y mejor la que lleva menos contexto gastado. Si todas trabajan, mándalo a la que toque y dile a él que se le queda en cola.
- A una sesión que le está preguntando algo a Munir no le mandes un encargo: dile a él cuál es. Solo se le escribe para CONTESTAR lo que pregunta, y a ella sola.
- De una que dice «no se sabe» no sabes si trabaja o ha acabado: puedes escribirle, pero díselo a él.
- Si no está claro a quién va, PREGUNTA antes de mandar nada.

CÓMO SE LO REESCRIBES
- Corrige lo que el dictado haya roto, quita muletillas y, si son varios pasos, ponlos en una lista en el orden en que los dijo.
- No añadas requisitos, archivos ni suposiciones que él no haya dicho, y no quites nada de lo que pide. No cambies nombres propios ni palabras técnicas.
- Si dos sesiones de la misma carpeta reciben trabajo a la vez, dile a cada una qué lleva la otra, para que no toquen lo mismo.

LO QUE VES
- Lo que contesta cada sesión al terminar aparece en la conversación con su nombre. Con eso le cuentas a Munir cómo va el grupo, y le pasas a una sesión lo que otra ha dejado dicho si él lo pide.
- No ves la conversación entera: ves un ÍNDICE de lo viejo y lo último entero. Si necesitas un turno viejo, pídelo con leer_turno(conversacion, n). Si necesitas ver qué hace una sesión, read_pane_transcript.

CÓMO TERMINAS CADA RESPUESTA
1. Tu texto para Munir, en español y de tú: a quién se lo has mandado y, si no es evidente, por qué. Una o dos frases. No le repitas el encargo.
2. Si hay que escribirle a alguna sesión, un bloque así (JSON válido, nada más dentro), con el panel que sale en SESIONES DEL ENJAMBRE:
<acciones>
[{"tipo":"escribir","panel":7,"texto":"..."}]
</acciones>
3. Y SIEMPRE una última línea con el resumen de este turno para tu índice, de menos de 140 letras:
RESUMEN: a quién le has mandado qué, en una frase."#;

/// Cómo tiene que comportarse el conserje. En español y a Munir, como el Capataz.
pub const SISTEMA: &str = r#"Eres el CONSERJE de Adeorq: el chat principal desde el que Munir dirige sus sesiones de trabajo. Él te habla (muchas veces dictando por voz, así que interpreta la intención); tú entiendes qué quiere, lo partes en trabajos y abres una sesión de trabajo para cada uno. Tú NO haces el trabajo: lo encargas, lo sigues y le cuentas.

CÓMO CONTESTAS
- En español, de tú, directo y corto. Nada de «he usado la herramienta X».
- Si te falta algo que cambia el resultado (en qué proyecto, qué significa lo que dijo), PREGÚNTALO antes de abrir nada.
- Si una sesión le está preguntando algo, díselo con la pregunta concreta.

CUÁNDO ABRES UNA SESIÓN
- Un trabajo = una sesión = UN encargo. Dos cosas distintas son dos sesiones.
- Un trabajo grande que se parte en piezas que no tocan los mismos archivos ni esperan la respuesta de otra (otra zona del repo, otra función, una revisión) son varias sesiones a la vez, una por pieza y como mucho cuatro por mensaje: así acaba antes. Lo que es un solo hilo (un bug, un archivo) va en una sola.
- La carpeta tiene que ser real: mírala con get_projects si no estás seguro. Nunca la inventes.
- El encargo se escribe para el agente que lo va a hacer: qué hay que conseguir, en qué carpeta, y qué NO debe tocar si él lo dijo. Sin adornos.
- Para cada trabajo di cómo es, que es lo que usa el router para elegir el modelo (tú no eliges modelo):
  clase: "recado" (mecánico: renombrar, buscar, formatear), "oficio" (el grueso del trabajo normal) o "juicio" (arquitectura, seguridad, revisar a otro, lo que sale caro si se equivoca sin que se note).
  consecuencia: "alta" si un error se notaría tarde; "baja" si se ve enseguida.
  trabajo: "codigo", "texto", "lectura" o "diseno". largo: true si es largo.
- Para seguir con una sesión que ya abriste (contestarle, darle más datos), usa "escribir" con su número de panel. Solo en las que abriste tú: están en PESTAÑAS.

TU MEMORIA
- No ves la conversación entera: ves un ÍNDICE de lo viejo y lo último entero. Si necesitas un turno viejo, pídelo con leer_turno(conversacion, n). No adivines lo que se dijo.
- Para saber cómo se hacen las cosas en esta casa (lo que Munir ya corrigió a otras sesiones), usa buscar_memoria antes de suponer.

CÓMO TERMINAS CADA RESPUESTA
1. Tu texto para Munir.
2. Si hay que abrir o escribir, un bloque así (JSON válido, nada más dentro):
<acciones>
[{"tipo":"abrir","encargo":"...","carpeta":"C:\\proyectos\\Proyecto","clase":"oficio","consecuencia":"alta","largo":false,"trabajo":"codigo"},
 {"tipo":"escribir","panel":7,"texto":"..."}]
</acciones>
3. Y SIEMPRE una última línea con el resumen de este turno para tu índice, de menos de 140 letras:
RESUMEN: lo que has hecho o contestado, en una frase."#;

/// Las herramientas que puede usar: mirar y recordar, nunca mover. Abrir y
/// escribir las hace la app, tras la reja.
pub const MANOS: &[&str] = &[
    "mcp__adeorq__get_projects",
    "mcp__adeorq__get_active_panes",
    "mcp__adeorq__read_pane_transcript",
    "mcp__adeorq__get_usage",
    "mcp__adeorq__buscar_memoria",
    "mcp__adeorq__leer_memoria",
    "mcp__adeorq__leer_turno",
];

/// Lo que se ve mientras piensa: una frase por herramienta, no su nombre, en el
/// idioma de la app.
pub fn frase_de_paso(bloque: &serde_json::Value, en: bool) -> Option<String> {
    let nombre = bloque["name"].as_str()?.trim_start_matches("mcp__adeorq__");
    let e = &bloque["input"];
    let pregunta = || corto(e["pregunta"].as_str().unwrap_or(""), 50);
    Some(match (nombre, en) {
        ("get_projects", false) => "Mirando tus proyectos".to_string(),
        ("get_projects", true) => "Looking at your projects".to_string(),
        ("get_active_panes", false) => "Mirando las sesiones abiertas".to_string(),
        ("get_active_panes", true) => "Looking at the open sessions".to_string(),
        ("read_pane_transcript", false) => format!("Leyendo la sesión del panel {}", e["paneId"]),
        ("read_pane_transcript", true) => format!("Reading the session in panel {}", e["paneId"]),
        ("get_usage", false) => "Mirando cuánta semana te queda".to_string(),
        ("get_usage", true) => "Checking how much of your week is left".to_string(),
        ("buscar_memoria", false) => format!("Buscando en la memoria: «{}»", pregunta()),
        ("buscar_memoria", true) => format!("Searching the memory: “{}”", pregunta()),
        ("leer_memoria", false) => "Leyendo una nota de la memoria".to_string(),
        ("leer_memoria", true) => "Reading a note from the memory".to_string(),
        ("leer_turno", false) => format!("Repasando el turno {}", e["n"]),
        ("leer_turno", true) => format!("Going over turn {}", e["n"]),
        _ => return None,
    })
}

/// Quién le habla al conserje y en qué idioma está la app. Lo manda la ventana
/// con cada mensaje (`conserjeEnviar`), sacado del perfil y del idioma.
///
/// Los prompts de esta casa están escritos en español y a Munir. Sin esto, con
/// la app en inglés el conserje contestaba en español, y a cualquiera que no
/// fuera Munir le llamaba Munir. Para él no cambia nada: con su nombre (o sin
/// ninguno) y en español, no se añade ni una línea.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Quien {
    #[serde(default)]
    pub nombre: String,
    #[serde(default)]
    pub idioma: String,
}

impl Quien {
    pub fn en_ingles(&self) -> bool {
        self.idioma == "en"
    }

    /// Su nombre, si es otro que Munir. «Munir Torres» también es Munir: si no,
    /// el prompt le diría «llámale Munir Torres, nunca Munir».
    fn otro_nombre(&self) -> Option<&str> {
        let n = self.nombre.trim();
        let es_munir = n.split_whitespace().next().is_some_and(|p| p.eq_ignore_ascii_case("munir"));
        (!n.is_empty() && !es_munir).then_some(n)
    }

    /// Cómo firma lo que dice ahora, en la cabecera de su mensaje.
    pub fn firma(&self) -> &str {
        self.otro_nombre().unwrap_or("Munir")
    }

    /// Lo que se le añade al prompt, justo antes de su mensaje: vacío si es
    /// Munir en español.
    pub fn al_prompt(&self) -> String {
        let mut s = String::new();
        if let Some(n) = self.otro_nombre() {
            s.push_str(&format!(
                "- Quien te habla se llama {n}. Donde estas instrucciones dicen «Munir», es {n}: llámale así, nunca Munir.\n"
            ));
        }
        if self.en_ingles() {
            s.push_str(
                "- Contesta SIEMPRE en inglés, aunque estas instrucciones y lo que se dijo antes estén en español. \
                 Los encargos y los mensajes a las sesiones, también en inglés. Lo que el formato pide tal \
                 cual no se traduce: las marcas <acciones> y RESUMEN:, las claves del JSON y sus valores \
                 fijos, como \"oficio\" o \"abrir\".\n",
            );
        }
        if s.is_empty() {
            s
        } else {
            format!("\n\n## Con quién hablas\n{s}")
        }
    }
}

// ─── LOS COMANDOS DE LA APP ───────────────────────────────────────────────────

/// Una fila de la lista de conversaciones: lo justo para pintarla.
#[derive(Clone, Debug, Serialize)]
pub struct Ficha {
    pub id: String,
    pub titulo: String,
    pub cuando: u64,
    pub trabajos: usize,
    /// La carpeta de su última sesión: el proyecto del que cuelga en el móvil.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub carpeta: String,
}

#[tauri::command(async)]
pub fn conserje_lista() -> Vec<Ficha> {
    lista()
        .into_iter()
        .map(|(id, titulo, cuando, trabajos, carpeta)| Ficha { id, titulo, cuando, trabajos, carpeta })
        .collect()
}

#[tauri::command(async)]
pub fn conserje_leer(id: String) -> Result<Conversacion, String> {
    leer(&id)
}

/// El interruptor del router, que es de cada conversación.
#[tauri::command(async)]
pub fn conserje_router(id: String, encendido: bool) -> Result<(), String> {
    cambiar(&id, |c| c.router = encendido)
}

/// La app apunta aquí la sesión que acaba de abrir por orden del conserje:
/// así se convierte en una pestaña y el conserje la ve en su contexto.
#[tauri::command(async)]
pub fn conserje_trabajo(id: String, trabajo: Trabajo) -> Result<(), String> {
    cambiar(&id, |c| c.apuntar_trabajo(trabajo))
}

/// El id de la sesión de una pestaña, en cuanto el panel lo dice: es lo que
/// deja volver a ella cuando el panel ya se cerró.
#[tauri::command(async)]
pub fn conserje_sesion(id: String, panel: u32, arranque: u64, sesion: String) -> Result<(), String> {
    cambiar(&id, |c| c.apuntar_sesion(panel, arranque, &sesion))
}

/// Quitar una pestaña (la sesión se cerró). La tarjeta se queda en el hilo.
#[tauri::command(async)]
pub fn conserje_soltar(id: String, panel: u32, arranque: u64) -> Result<(), String> {
    cambiar(&id, |c| c.soltar(panel, arranque))
}

/// El arranque de ahora, para que el front sepa qué pestañas son de su panel.
#[tauri::command(async)]
pub fn conserje_arranque() -> u64 {
    arranque()
}

#[tauri::command(async)]
pub fn conserje_olvidar(id: String) -> Result<(), String> {
    let p = ruta(&id)?;
    let _ = std::fs::remove_file(p);
    Ok(())
}

/// Con qué modelo piensa el conserje en esta conversación (ver `cerebro`).
#[tauri::command(async)]
pub fn conserje_cerebro(id: String, cerebro: String) -> Result<(), String> {
    if !CEREBROS.contains(&cerebro.as_str()) {
        return Err(format!("«{cerebro}» no es un modelo con el que pueda pensar el conserje"));
    }
    cambiar(&id, |c| c.cerebro = cerebro)
}

/// El modelo de las sesiones con el router apagado (ver `fijo`). Vacío lo
/// devuelve al de por defecto.
#[tauri::command(async)]
pub fn conserje_fijo(id: String, modelo: String) -> Result<(), String> {
    if !modelo.is_empty() && !CEREBROS.contains(&modelo.as_str()) {
        return Err(format!("«{modelo}» no es un modelo que se pueda fijar"));
    }
    cambiar(&id, |c| c.fijo = modelo)
}

/// Hace de una conversación un enjambre, o le cambia el nombre. La pide el
/// lienzo al crear la pieza y al renombrarla.
#[tauri::command(async)]
pub fn conserje_enjambre(id: String, nombre: String) -> Result<(), String> {
    let nombre = corto(&nombre, 60);
    cambiar(&id, |c| {
        c.enjambre = true;
        if !nombre.is_empty() {
            c.titulo = nombre;
        }
    })
}

/// Las sesiones de un enjambre, tal como quedan (ver `poner_miembros`). Solo
/// en un enjambre: en una conversación del Chat, la reja promete que el
/// conserje no escribe en una terminal que no abrió él, y esto la abriría.
#[tauri::command(async)]
pub fn conserje_miembros(id: String, miembros: Vec<Trabajo>) -> Result<(), String> {
    cambiar(&id, |c| {
        if !c.enjambre {
            return Err("esa conversación no es un enjambre".to_string());
        }
        c.poner_miembros(miembros);
        Ok(())
    })?
}

/// Una sesión del enjambre acaba de terminar su turno: lo que contestó entra
/// en el hilo del grupo. Dice si era nuevo. De un panel que no es del grupo
/// no se apunta nada.
#[tauri::command(async)]
pub fn conserje_dijo(id: String, panel: u32, texto: String) -> Result<bool, String> {
    cambiar(&id, |c| {
        if !c.enjambre {
            return false;
        }
        let Some(w) = c.trabajos.iter().find(|w| w.panel == panel && w.escribible()).cloned() else {
            return false;
        };
        c.apuntar_respuesta(&w.nombre, &texto)
    })
}

/// Más que una llamada suelta: el conserje mira antes de hablar, y a veces
/// repasa un turno viejo o busca en la memoria.
const TIEMPO_CONSERJE: std::time::Duration = std::time::Duration::from_secs(180);

/// Las conversaciones que están pensando ahora, cada una con su botón de parar.
/// Una sola por conversación: el PC y el móvil podían mandar a la vez, y la que
/// acababa última borraba los turnos de la otra.
static EN_CURSO: std::sync::Mutex<Vec<(String, std::sync::Arc<std::sync::atomic::AtomicBool>)>> =
    std::sync::Mutex::new(Vec::new());

/// Mientras vive, esa conversación está pensando; al soltarse (con respuesta,
/// con error o parada) deja de estarlo.
struct Pensando(String);

impl Pensando {
    fn empezar(id: &str) -> Result<(Self, std::sync::Arc<std::sync::atomic::AtomicBool>), String> {
        let mut en_curso = EN_CURSO.lock().unwrap_or_else(|e| e.into_inner());
        if en_curso.iter().any(|(i, _)| i == id) {
            return Err("el conserje todavía está con lo anterior en esta conversación".into());
        }
        let parar = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        en_curso.push((id.to_string(), parar.clone()));
        Ok((Pensando(id.to_string()), parar))
    }
}

impl Drop for Pensando {
    fn drop(&mut self) {
        EN_CURSO.lock().unwrap_or_else(|e| e.into_inner()).retain(|(i, _)| *i != self.0);
    }
}

/// El botón de parar del chat: solo para la conversación que lo pulsa.
#[tauri::command]
pub fn conserje_parar(id: String) {
    let en_curso = EN_CURSO.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((_, parar)) = en_curso.iter().find(|(i, _)| *i == id) {
        parar.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

/// El prompt entero de un turno: el papel, la conversación, con quién habla y
/// lo que acaba de decir. Lo de con quién va justo antes de su mensaje, que es
/// lo último que lee el modelo.
fn montar_prompt(sistema: &str, id: &str, contexto: &str, quien: &Quien, texto: &str) -> String {
    format!(
        "{sistema}\n\n## Esta conversación\nconversacion: {id}\n\n{contexto}{}\n\n## Lo que te dice {} ahora\n{texto}",
        quien.al_prompt(),
        quien.firma()
    )
}

/// Un mensaje al conserje. Lo que dice vuelve en la respuesta; lo que va
/// haciendo mientras piensa sale por el evento `conserje-paso`.
///
/// `estados` es cómo va cada pestaña, por su panel («trabajando», «te pregunta
/// algo»…): lo sabe el front sin gastar un token, y sin esto el conserje no
/// podría decirte cuál te espera.
#[tauri::command]
pub async fn conserje_enviar(
    app: tauri::AppHandle,
    id: String,
    texto: String,
    estados: std::collections::HashMap<String, String>,
    quien: Option<Quien>,
) -> Result<Respuesta, String> {
    let quien = quien.unwrap_or_default();
    let en = quien.en_ingles();
    let texto = texto.trim().to_string();
    if texto.is_empty() {
        return Err("no hay nada que mandar".into());
    }
    let (_pensando, parar) = Pensando::empezar(&id)?;
    // El contexto se arma ANTES de apuntar el mensaje nuevo: va aparte, al
    // final del prompt, y si no saldría dos veces. Y lo tuyo se guarda YA: si
    // la llamada falla, lo que dijiste no se pierde.
    let estado_de = |p: u32| estados.get(&p.to_string()).cloned().unwrap_or_default();
    let (contexto, modelo, enjambre) =
        cambiar(&id, |c| (c.preparar(&texto, &estado_de), c.cerebro(), c.enjambre))?;

    // Un enjambre es la misma conversación con otro papel: no abre, reparte.
    let sistema = if enjambre { SISTEMA_ENJAMBRE } else { SISTEMA };
    let prompt = montar_prompt(sistema, &id, &contexto, &quien, &texto);
    let cfg = crate::foreman::config_mcp()?;
    let id2 = id.clone();
    let pasos = Box::new(move |paso: String| {
        use tauri::Emitter;
        let _ = app.emit("conserje-paso", serde_json::json!({ "id": id2, "paso": paso }));
    });
    let bruta = tauri::async_runtime::spawn_blocking(move || correr(&prompt, modelo, Some(&cfg), &parar, en, pasos))
        .await
        .map_err(|e| e.to_string())??;

    let (dice, acciones, resumen, mut descartes) = leer_respuesta(&bruta);
    let raiz = crate::workspace::raiz_por_defecto();
    let dice = if !dice.is_empty() { dice } else if en { "Done.".to_string() } else { "Hecho.".to_string() };
    // Sobre la conversación de AHORA, no la de hace un minuto.
    let acciones = cambiar(&id, |conv| {
        let acciones = if conv.enjambre {
            let (acciones, fuera) = filtrar_enjambre(acciones, &estado_de);
            descartes.extend(fuera);
            acciones
        } else {
            acciones
        };
        let (acciones, fuera) = filtrar(acciones, conv, &raiz, &|p| p.is_dir());
        descartes.extend(fuera);
        conv.apuntar("conserje", &dice, &resumen);
        acciones
    })?;
    if en {
        descartes = descartes.iter().map(|d| descarte_en_ingles(d)).collect();
    }
    Ok(Respuesta { texto: dice, acciones, descartes })
}

/// La llamada de verdad: `claude -p` con la suscripción de Munir, las manos de
/// mirar y recordar, y cada paso contado mientras ocurre.
///
/// Todo lo que el Capataz ya pagó está aquí: el rastro que se borra al salir
/// (`SinRastro`), solo el MCP de Adeorq (`--strict-mcp-config`), la puerta de
/// atrás cerrada (`--disallowedTools`), nunca `--bare` (no leería el login) y un
/// hilo que lee la salida mientras se produce, porque una respuesta larga con
/// la tubería sin vaciar deja el proceso bloqueado hasta el tiempo límite.
///
/// `cfg` es el MCP de Adeorq; sin él (el banco, que no tiene ventana) el
/// conserje contesta sin herramientas. `pasos` recibe lo que va haciendo, en
/// inglés si `en`.
fn correr(
    prompt: &str,
    modelo: &str,
    cfg: Option<&std::path::Path>,
    parar: &std::sync::atomic::AtomicBool,
    en: bool,
    pasos: Box<dyn Fn(String) + Send>,
) -> Result<String, String> {
    use crate::SinVentana;
    use std::io::BufRead;

    let sesion = crate::foreman::SinRastro::nueva();
    let mut cmd = std::process::Command::new(crate::foreman::claude_exe());
    cmd.args(["-p", prompt, "--model", modelo, "--output-format", "stream-json", "--verbose"])
        .args(["--session-id", sesion.id()])
        .arg("--strict-mcp-config");
    if let Some(cfg) = cfg {
        cmd.arg("--mcp-config").arg(cfg).arg("--allowedTools");
        for m in MANOS {
            cmd.arg(m);
        }
    }
    cmd.arg("--disallowedTools")
        .args(["Bash", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Read", "Glob", "Grep"]);
    let mut child = cmd
        .current_dir(crate::workspace::raiz_por_defecto())
        .sin_ventana()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("no pude lanzar claude: {e}"))?;

    let salida = child.stdout.take().ok_or("claude no dio salida")?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        for linea in std::io::BufReader::new(salida).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&linea) else { continue };
            match v["type"].as_str() {
                Some("assistant") => {
                    for b in v["message"]["content"].as_array().unwrap_or(&vec![]) {
                        if b["type"] == "tool_use" {
                            if let Some(f) = frase_de_paso(b, en) {
                                pasos(f);
                            }
                        }
                    }
                }
                Some("result") => {
                    let _ = tx.send(if v["is_error"].as_bool().unwrap_or(false) {
                        Err(format!("claude devolvió error: {}", v["result"].as_str().unwrap_or("desconocido")))
                    } else {
                        v["result"].as_str().map(|s| s.to_owned()).ok_or_else(|| "la respuesta no trae texto".to_owned())
                    });
                }
                _ => {}
            }
        }
    });

    let inicio = std::time::Instant::now();
    loop {
        if parar.load(std::sync::atomic::Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("parado".into());
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if inicio.elapsed() > TIEMPO_CONSERJE => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("el conserje se quedó pensando demasiado (3 min); reintenta".into());
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    }
    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(r) => r,
        Err(_) => {
            let mut err = String::new();
            if let Some(mut e) = child.stderr.take() {
                use std::io::Read;
                let _ = e.read_to_string(&mut err);
            }
            Err(format!("claude no devolvió nada: {}", err.trim()))
        }
    }
}

// ─── MEJORAR LO QUE DICTASTE ──────────────────────────────────────────────────

/// El encargo para quien reescribe. La regla que importa es la segunda: una
/// mejora que AÑADE requisitos no es una mejora, es cambiarle a Munir lo que
/// quería decir, y el agente de después lo hará al pie de la letra.
const MEJORAR: &str = r#"Munir ha escrito (a menudo dictando por voz) este mensaje para un agente de programación. Reescríbelo para que se entienda a la primera.

HAZ: corrige lo que el dictado haya roto, quita muletillas y repeticiones, y si pide varias cosas ponlas en una lista numerada en el orden en que las dijo.
NO HAGAS: no añadas ningún dato, requisito, archivo ni suposición que no esté en su texto; no quites nada que pida; no cambies nombres propios ni palabras técnicas; no respondas a lo que pide.
De tú y con su tono. Devuelve SOLO el texto reescrito: sin comillas, sin títulos, sin explicar qué has cambiado.
EL IDIOMA: el del mensaje, nunca el de estas instrucciones. Si está en inglés, la respuesta va en inglés; no lo traduzcas.
LANGUAGE: reply in the language of the message below, not the language of these instructions. If it is in English, answer in English. Never translate it.

Su mensaje:
"#;

/// Reescribe lo de la caja. Con Haiku, que es un recado de verdad: rápido y
/// barato, y el que decide si se queda es Munir, que lo lee antes de mandarlo.
#[tauri::command]
pub async fn conserje_mejorar(texto: String) -> Result<String, String> {
    let texto = texto.trim().to_string();
    if texto.chars().count() < 8 {
        return Err("es demasiado corto para mejorarlo".into());
    }
    let sale = crate::foreman::preguntar_con(format!("{MEJORAR}{texto}"), "haiku").await?;
    revisar_mejora(&texto, &sale)
}

/// La reja de la mejora: si el resultado se ha ido de largo, no se da por bueno.
/// Un dictado de dos líneas que vuelve convertido en diez es que se ha
/// inventado cosas, y eso es justo lo prohibido.
pub fn revisar_mejora(original: &str, mejorado: &str) -> Result<String, String> {
    let limpio = mejorado.trim().trim_matches('"').trim().to_string();
    if limpio.is_empty() {
        return Err("la mejora ha salido vacía: se queda lo tuyo".into());
    }
    let (a, b) = (original.chars().count(), limpio.chars().count());
    if b > a * 3 + 200 {
        return Err("la mejora se ha alargado demasiado (se estaría inventando cosas): se queda lo tuyo".into());
    }
    Ok(limpio)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn quien(nombre: &str, idioma: &str) -> Quien {
        Quien { nombre: nombre.into(), idioma: idioma.into() }
    }

    #[test]
    fn a_munir_en_espanol_no_se_le_anade_nada() {
        for q in [quien("Munir", "es"), quien("munir", "es"), quien("Munir Torres", "es"), quien("", "es"), quien("  ", ""), Quien::default()] {
            assert_eq!(q.al_prompt(), "", "{q:?}");
            assert_eq!(q.firma(), "Munir");
        }
    }

    #[test]
    fn con_la_app_en_ingles_contesta_en_ingles() {
        let p = quien("Munir", "en").al_prompt();
        assert!(p.contains("## Con quién hablas") && p.contains("SIEMPRE en inglés"), "{p}");
        assert!(!p.contains("se llama"), "a Munir no se le cambia el nombre: {p}");
    }

    #[test]
    fn a_quien_no_es_munir_se_le_llama_por_su_nombre() {
        let q = quien("Sam", "en");
        let p = q.al_prompt();
        assert!(p.contains("se llama Sam") && p.contains("nunca Munir") && p.contains("en inglés"), "{p}");
        assert_eq!(q.firma(), "Sam");
        let es = quien("Lucía", "es").al_prompt();
        assert!(es.contains("se llama Lucía") && !es.contains("inglés"), "{es}");
    }

    #[test]
    fn cada_paso_tiene_su_frase_en_los_dos_idiomas() {
        let raro = |s: &str| s.chars().any(|c| "áéíóúñ¿¡«»".contains(c));
        for (nombre, entrada) in [
            ("get_projects", json!({})),
            ("mcp__adeorq__get_active_panes", json!({})),
            ("read_pane_transcript", json!({ "paneId": 4 })),
            ("get_usage", json!({})),
            ("buscar_memoria", json!({ "pregunta": "cómo se publica" })),
            ("leer_memoria", json!({})),
            ("leer_turno", json!({ "n": 3 })),
        ] {
            let b = json!({ "name": nombre, "input": entrada });
            let es = frase_de_paso(&b, false).expect(nombre);
            let en = frase_de_paso(&b, true).expect(nombre);
            assert_ne!(es, en, "{nombre}");
            // Lo que trae la pregunta va tal cual; el resto de la frase, en inglés.
            assert!(!raro(&en.replace("cómo se publica", "")), "{nombre}: {en}");
        }
        assert!(frase_de_paso(&json!({ "name": "Bash", "input": {} }), true).is_none());
    }

    fn con(n: usize) -> Conversacion {
        let mut c = Conversacion { id: "prueba".into(), router: true, ..Default::default() };
        for i in 1..=n {
            let (rol, texto) = if i % 2 == 1 {
                ("tu", format!("pregunta número {i}, sobre el tema {i}"))
            } else {
                ("conserje", format!("respuesta número {i}"))
            };
            let resumen = if rol == "tu" { resumen_de_lo_tuyo(&texto) } else { format!("contesté la {i}") };
            c.apuntar(rol, &texto, &resumen);
        }
        c
    }

    fn sin_estados(_: u32) -> String {
        "trabajando".into()
    }

    #[test]
    fn una_conversacion_corta_va_entera_y_sin_indice() {
        let ctx = con(3).contexto(&sin_estados);
        assert!(!ctx.contains("ÍNDICE"), "con tres turnos no hay nada que comprimir:\n{ctx}");
        assert!(ctx.contains("pregunta número 1"));
        assert!(ctx.contains("pregunta número 3"));
    }

    /// EL CASO QUE LO JUSTIFICA: una conversación larga no crece en el contexto.
    /// Los viejos entran como una línea y los últimos enteros.
    #[test]
    fn una_conversacion_larga_se_comprime_en_el_indice() {
        let c = con(40);
        let ctx = c.contexto(&sin_estados);
        assert!(ctx.contains("ÍNDICE"));
        assert!(ctx.contains("#1 Munir: pregunta número 1"), "el turno 1 tiene que estar en el índice");
        assert!(ctx.contains("#2 conserje: contesté la 2"));
        // Los cuatro últimos, enteros y con su número.
        for n in 37..=40 {
            assert!(ctx.contains(&format!("#{n} ")), "falta el turno {n}");
        }
        assert!(!ctx.contains("#37 Munir: pregunta"), "el 37 va entero, no como línea de índice");
    }

    /// Y aunque la conversación sea eterna, el contexto tiene techo.
    #[test]
    fn el_contexto_no_pasa_del_tope_aunque_la_conversacion_sea_eterna() {
        let c = con(2000);
        let ctx = c.contexto(&sin_estados);
        assert!(
            ctx.chars().count() <= TOPE_CONTEXTO + 1000,
            "el contexto mide {} y el tope es {TOPE_CONTEXTO}",
            ctx.chars().count()
        );
        assert!(ctx.contains("turnos más antiguos que no caben"), "hay que decir que se han caído");
        // Lo que se cae es lo VIEJO: el penúltimo del índice sigue.
        assert!(ctx.contains("#1996 "), "lo reciente del índice tiene que seguir");
        assert!(!ctx.contains("#1 Munir"), "lo más viejo es lo que se cae");
    }

    #[test]
    fn un_turno_enorme_se_corta_y_se_dice_como_verlo() {
        let mut c = con(1);
        c.apuntar("conserje", &"x".repeat(TOPE_TURNO * 3), "un volcado enorme");
        let ctx = c.contexto(&sin_estados);
        assert!(ctx.contains("pide leer_turno(2)"));
        assert!(ctx.chars().count() < TOPE_TURNO * 2);
    }

    #[test]
    fn las_pestanas_salen_con_su_estado() {
        let mut c = con(2);
        c.trabajos.push(Trabajo {
            panel: 7,
            cli: "claude".into(),
            modelo: "opus".into(),
            cuenta: String::new(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            encargo: "arreglar el scroll".into(),
            abierto: 0,
            eligio: "router".into(),
            porque: String::new(),
            turno: 0,
            sesion: String::new(),
            arranque: arranque(),
            soltado: false,
            ..Default::default()
        });
        let ctx = c.contexto(&|p| if p == 7 { "te está preguntando algo".into() } else { String::new() });
        assert!(ctx.contains("panel 7 · claude opus"));
        assert!(ctx.contains("te está preguntando algo"));
    }

    #[test]
    fn el_resumen_se_separa_de_la_respuesta() {
        let (texto, resumen) = separar_resumen("Abro Claude en Adeorq para el scroll.\n\nRESUMEN: abrí un Claude para el scroll");
        assert_eq!(texto, "Abro Claude en Adeorq para el scroll.");
        assert_eq!(resumen, "abrí un Claude para el scroll");
    }

    #[test]
    fn un_resumen_citado_a_mitad_de_frase_no_es_la_marca() {
        let (texto, resumen) = separar_resumen("La palabra RESUMEN: aparece aquí pero no al principio.");
        assert!(texto.contains("RESUMEN:"), "no hay que comerse el texto");
        assert!(resumen.starts_with("La palabra"));
    }

    #[test]
    fn sin_resumen_el_indice_usa_el_principio() {
        let (_, resumen) = separar_resumen("Hecho. He abierto dos sesiones.");
        assert_eq!(resumen, "Hecho");
    }

    #[test]
    fn el_titulo_sale_de_lo_primero_que_dices() {
        let mut c = Conversacion { id: "t".into(), ..Default::default() };
        c.apuntar("tu", "Quiero que arregles el scroll de las terminales. Y luego lo otro.", "");
        assert_eq!(c.titulo, "Quiero que arregles el scroll de las terminales");
    }

    /// Desde el PC y desde el móvil a la vez: la segunda se rechaza en vez de
    /// pisar los turnos de la primera, y Parar solo toca la suya.
    #[test]
    fn una_conversacion_piensa_de_una_en_una_y_se_para_sola() {
        use std::sync::atomic::Ordering;
        let (a, parar_a) = Pensando::empezar("banco-una-en-una-a").unwrap();
        let (_b, parar_b) = Pensando::empezar("banco-una-en-una-b").unwrap();
        assert!(Pensando::empezar("banco-una-en-una-a").is_err(), "dos envíos a la vez a la misma");
        conserje_parar("banco-una-en-una-b".into());
        assert!(parar_b.load(Ordering::Relaxed));
        assert!(!parar_a.load(Ordering::Relaxed), "parar la B no para la A");
        drop(a);
        assert!(Pensando::empezar("banco-una-en-una-a").is_ok(), "al acabar se puede volver a mandar");
    }

    /// El modelo del conserje: el elegido si es de la lista; si no, ni vacío ni
    /// inventado llegan a la línea de órdenes, sale el de siempre.
    #[test]
    fn el_conserje_piensa_con_el_modelo_elegido_y_solo_con_uno_de_la_lista() {
        let mut c = Conversacion::default();
        assert_eq!(c.cerebro(), "sonnet", "sin elegir, el de siempre");
        c.cerebro = "opus".into();
        assert_eq!(c.cerebro(), "opus");
        c.cerebro = "opus --dangerously-skip-permissions".into();
        assert_eq!(c.cerebro(), "sonnet", "lo que no es de la lista no pasa");
        let viejo: Conversacion = serde_json::from_str(r#"{"id":"x"}"#).unwrap();
        assert_eq!(viejo.cerebro(), "sonnet", "una conversación de antes del campo sigue igual");
    }

    /// Lo que devuelve Mejorar: cabecera y lista. Antes el título y el índice
    /// se quedaban en «Dos encargos, por orden:».
    #[test]
    fn un_texto_mejorado_se_titula_y_se_indexa_por_lo_encargado() {
        let mejorado = "Dos encargos, por orden:\n1. El radar se cae cada dos horas: busca la causa.\n2) El scroll de las terminales: mira qué pasa.";
        let mut c = Conversacion { id: "t".into(), ..Default::default() };
        c.apuntar("tu", mejorado, &resumen_de_lo_tuyo(mejorado));
        assert!(c.titulo.starts_with("El radar se cae cada dos horas"), "título: {}", c.titulo);
        assert!(c.titulo.contains(" · El scroll"), "título: {}", c.titulo);
        let indice = resumen_de_lo_tuyo(mejorado);
        assert!(indice.contains("radar") && indice.contains("scroll"), "índice: {indice}");
        // Una línea que acaba en dos puntos sin lista debajo sigue como antes.
        assert_eq!(resumen_de_lo_tuyo("Mira esto:\nes largo"), "Mira esto:");
    }

    #[test]
    fn cortar_no_parte_una_tilde() {
        let s = "ñ".repeat(500);
        let t = corto(&s, 10);
        assert_eq!(t.chars().count(), 10);
    }

    const CON_ACCIONES: &str = "Son dos trabajos, abro dos sesiones.\n\n<acciones>\n[{\"tipo\":\"abrir\",\"encargo\":\"arregla el scroll\",\"carpeta\":\"C:\\\\proyectos\\\\Adeorq\",\"clase\":\"juicio\",\"consecuencia\":\"alta\",\"largo\":true,\"trabajo\":\"codigo\"},{\"tipo\":\"escribir\",\"panel\":7,\"texto\":\"sí, tócalo\"}]\n</acciones>\nRESUMEN: abrí una sesión para el scroll y contesté al panel 7";

    #[test]
    fn la_respuesta_trae_texto_acciones_y_resumen_por_separado() {
        let (texto, acciones, resumen, descartes) = leer_respuesta(CON_ACCIONES);
        assert_eq!(texto, "Son dos trabajos, abro dos sesiones.");
        assert_eq!(acciones.len(), 2);
        assert!(matches!(&acciones[0], Accion::Abrir { clase, .. } if clase == "juicio"));
        assert!(matches!(&acciones[1], Accion::Escribir { panel: 7, .. }));
        assert_eq!(resumen, "abrí una sesión para el scroll y contesté al panel 7");
        assert!(descartes.is_empty());
    }

    #[test]
    fn unas_acciones_rotas_no_se_comen_la_respuesta() {
        let (texto, acciones, _, descartes) =
            leer_respuesta("Te abro una sesión.\n<acciones>[{\"tipo\":\"abrir\", roto</acciones>\nRESUMEN: nada");
        assert_eq!(texto, "Te abro una sesión.");
        assert!(acciones.is_empty());
        assert_eq!(descartes.len(), 1, "hay que decir que no se ha hecho nada");
    }

    #[test]
    fn las_acciones_envueltas_en_bloque_de_codigo_tambien_valen() {
        let (_, acciones, _, _) = leer_respuesta("Va.\n<acciones>\n```json\n[{\"tipo\":\"escribir\",\"panel\":3,\"texto\":\"hola\"}]\n```\n</acciones>");
        assert_eq!(acciones.len(), 1);
    }

    #[test]
    fn sin_acciones_es_solo_una_respuesta() {
        let (texto, acciones, resumen, _) = leer_respuesta("La del radar sigue midiendo.\nRESUMEN: conté cómo va el radar");
        assert_eq!(texto, "La del radar sigue midiendo.");
        assert!(acciones.is_empty());
        assert_eq!(resumen, "conté cómo va el radar");
    }

    fn abrir(carpeta: &str) -> Accion {
        Accion::Abrir {
            encargo: "hacer algo".into(),
            carpeta: carpeta.into(),
            clase: "juicio".into(),
            consecuencia: "alta".into(),
            largo: false,
            trabajo: "codigo".into(),
        }
    }

    /// LA REJA: lo que el modelo diga no sale de la carpeta de proyectos ni se
    /// mete en paneles que no son suyos.
    #[test]
    fn la_reja_no_deja_salir_de_la_carpeta_de_proyectos() {
        let conv = con(1);
        let raiz = std::path::Path::new("C:\\proyectos");
        let todo_existe = |_: &std::path::Path| true;
        let (buenas, fuera) = filtrar(
            vec![
                abrir("C:\\proyectos\\Adeorq"),
                abrir("C:\\Windows\\System32"),
                abrir("C:\\proyectos\\..\\Users\\Muni"),
            ],
            &conv,
            raiz,
            &todo_existe,
        );
        assert_eq!(buenas.len(), 1, "solo la de dentro de proyectos");
        assert_eq!(fuera.len(), 2);
    }

    #[test]
    fn la_reja_no_abre_en_una_carpeta_que_no_existe() {
        let (buenas, fuera) = filtrar(
            vec![abrir("C:\\proyectos\\Inventado")],
            &con(1),
            std::path::Path::new("C:\\proyectos"),
            &|_| false,
        );
        assert!(buenas.is_empty());
        assert!(fuera[0].contains("Inventado"));
    }

    #[test]
    fn la_reja_solo_escribe_en_los_paneles_del_conserje() {
        let mut conv = con(1);
        conv.trabajos.push(Trabajo {
            panel: 7,
            cli: "claude".into(),
            modelo: "opus".into(),
            cuenta: String::new(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            encargo: "x".into(),
            abierto: 0,
            eligio: "router".into(),
            porque: String::new(),
            turno: 0,
            sesion: String::new(),
            arranque: arranque(),
            soltado: false,
            ..Default::default()
        });
        let (buenas, fuera) = filtrar(
            vec![
                Accion::Escribir { panel: 7, texto: "sigue".into() },
                Accion::Escribir { panel: 2, texto: "rm -rf".into() },
            ],
            &conv,
            std::path::Path::new("C:\\proyectos"),
            &|_| true,
        );
        assert_eq!(buenas.len(), 1);
        assert!(fuera[0].contains("panel 2"));
    }

    fn trabajo(panel: u32, arranque: u64) -> Trabajo {
        Trabajo {
            panel,
            cli: "claude".into(),
            modelo: "sonnet".into(),
            cuenta: String::new(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            encargo: format!("el trabajo del panel {panel}"),
            abierto: 0,
            eligio: "router".into(),
            porque: String::new(),
            turno: 2,
            sesion: String::new(),
            arranque,
            soltado: false,
            ..Default::default()
        }
    }

    /// El fallo que se vio leyendo: los paneles vuelven a contar desde 1 al
    /// abrir Adeorq, y el «panel 7» de ayer es hoy otra terminal de Munir.
    #[test]
    fn la_reja_no_escribe_en_el_panel_de_otro_arranque() {
        let mut conv = con(1);
        conv.trabajos.push(trabajo(7, 12345));
        let (buenas, fuera) = filtrar(
            vec![Accion::Escribir { panel: 7, texto: "sí, bórralo".into() }],
            &conv,
            std::path::Path::new("C:\\proyectos"),
            &|_| true,
        );
        assert!(buenas.is_empty(), "le escribió a una terminal que ya no es suya");
        assert!(fuera[0].contains("panel 7"));
        let ctx = conv.contexto(&|_| "trabajando".into());
        assert!(ctx.contains("sin panel"), "el contexto le enseña un número que hoy es de otro:\n{ctx}");
        assert!(!ctx.contains("- panel 7"));
    }

    #[test]
    fn soltar_quita_la_pestana_y_deja_la_tarjeta() {
        let mut conv = con(1);
        conv.apuntar_trabajo(trabajo(7, 0));
        let hoy = arranque();
        conv.soltar(7, hoy);
        assert_eq!(conv.trabajos.len(), 1, "la tarjeta es el registro de lo que se abrió");
        assert!(conv.trabajos[0].soltado);
        let (buenas, _) = filtrar(
            vec![Accion::Escribir { panel: 7, texto: "sigue".into() }],
            &conv,
            std::path::Path::new("C:\\proyectos"),
            &|_| true,
        );
        assert!(buenas.is_empty(), "una pestaña quitada ya no se escribe");
        assert!(!conv.contexto(&|_| "trabajando".into()).contains("el trabajo del panel 7"));
    }

    #[test]
    fn poner_al_dia_conserva_su_arranque_y_su_sitio() {
        let mut conv = con(1);
        conv.trabajos.push(trabajo(3, 12345));
        // Uno de antes de que existiera el campo: arranque 0.
        conv.trabajos.push(trabajo(5, 0));
        conv.apuntar_trabajo(trabajo(3, 0));
        conv.apuntar_trabajo(trabajo(4, 777));
        assert_eq!(conv.trabajos.len(), 4, "el 3 de ayer y el 3 de hoy son dos trabajos");
        assert_eq!(conv.trabajos[2].arranque, arranque(), "uno nuevo lleva el arranque de ahora");
        assert_eq!(conv.trabajos[3].arranque, arranque(), "venga con lo que venga");
        conv.apuntar_sesion(3, 12345, "abc");
        conv.apuntar_sesion(5, 0, "def");
        assert_eq!(conv.trabajos[0].sesion, "abc", "se pone al día en su sitio, no al final");
        assert_eq!(conv.trabajos[0].arranque, 12345, "poner al día no la hace pasar por de hoy");
        assert_eq!(conv.trabajos[1].sesion, "def");
        assert_eq!(conv.trabajos[1].arranque, 0, "el de antes del campo se pone al día sin duplicarse");
        assert_eq!(conv.trabajos.len(), 4);
        assert_eq!(conv.trabajos[2].sesion, "", "la sesión del 3 de ayer no es la del 3 de hoy");
    }

    #[test]
    fn la_reja_pone_tope_a_las_sesiones_de_golpe() {
        let muchas = (0..10).map(|_| abrir("C:\\proyectos\\Adeorq")).collect();
        let (buenas, fuera) = filtrar(muchas, &con(1), std::path::Path::new("C:\\proyectos"), &|_| true);
        assert_eq!(buenas.len(), MAX_ABRIR);
        assert_eq!(fuera.len(), 10 - MAX_ABRIR);
    }

    /// Lo que no se reconoce cae al lado PRUDENTE: una consecuencia rara es
    /// «alta», para que el router no abarate lo que no debía.
    #[test]
    fn lo_desconocido_cae_al_lado_prudente() {
        let a = Accion::Abrir {
            encargo: "algo".into(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            clase: "urgentisimo".into(),
            consecuencia: "media".into(),
            largo: false,
            trabajo: "magia".into(),
        };
        let (buenas, _) = filtrar(vec![a], &con(1), std::path::Path::new("C:\\proyectos"), &|_| true);
        match &buenas[0] {
            Accion::Abrir { clase, consecuencia, trabajo, .. } => {
                assert_eq!(clase, "oficio");
                assert_eq!(consecuencia, "alta");
                assert_eq!(trabajo, "codigo");
            }
            otra => panic!("salió {otra:?}"),
        }
    }

    #[test]
    fn una_mejora_que_se_inventa_cosas_no_pasa() {
        let original = "mira lo del radar que se cae";
        assert!(revisar_mejora(original, &"x".repeat(600)).is_err(), "diez veces más largo es inventar");
        assert!(revisar_mejora(original, "   ").is_err());
        assert_eq!(
            revisar_mejora(original, "\"El radar se cae: busca la causa.\"").unwrap(),
            "El radar se cae: busca la causa.",
            "las comillas que añada el modelo sobran"
        );
    }

    /// Con la app en inglés y alguien que no es Munir: que conteste en inglés,
    /// le llame por su nombre y escriba el encargo en inglés, con el prompt
    /// que monta la app (`montar_prompt`). Y que la mejora del dictado no lo
    /// pase al español.
    ///
    /// Gasta dos llamadas de tu suscripción (el cerebro de fábrica y Haiku).
    /// `cargo test --lib el_conserje_de_verdad_habla_ingles -- --ignored --nocapture`
    ///
    /// Con `ANTES=1` monta el prompt como era hasta el 2026-10-15, sin decirle
    /// con quién habla, y tiene que FALLAR: así se vio que contestaba en español.
    #[test]
    #[ignore]
    fn el_conserje_de_verdad_habla_ingles_a_quien_lo_usa() {
        let antes = std::env::var("ANTES").is_ok();
        let q = if antes { Quien::default() } else { quien("Sam", "en") };
        let mut c = Conversacion { id: "banco".into(), router: true, ..Default::default() };
        c.apuntar("tu", "hi", "greeting");
        c.apuntar("conserje", "Hi, what are we doing?", "greeted");
        let texto = "fix the terminal scroll jumping in Adeorq when a side panel opens";
        let contexto = format!(
            "{}\n\n## Tus proyectos (no tienes herramientas en esta prueba)\nC:\\proyectos\\Adeorq",
            c.contexto(&|_| String::new())
        );
        let prompt = montar_prompt(SISTEMA, "banco", &contexto, &q, texto);
        assert!(antes || prompt.contains("## Lo que te dice Sam ahora"));
        let parar = std::sync::atomic::AtomicBool::new(false);
        let bruta = correr(&prompt, CEREBRO_POR_DEFECTO, None, &parar, !antes, Box::new(|p| println!("  paso: {p}"))).expect("el conserje no contestó");
        let (dice, acciones, _, descartes) = leer_respuesta(&bruta);
        println!("--- dice ---\n{dice}\n--- acciones ---\n{acciones:?}");
        assert!(descartes.is_empty(), "el bloque de acciones tiene que ser JSON válido");
        let espanol = |s: &str| s.chars().any(|c| "áéíóúñ¿¡".contains(c)) || [" el ", " la ", " que ", " para ", " una "].iter().any(|p| s.to_lowercase().contains(p));
        assert!(!espanol(&dice), "tiene que contestar en inglés: {dice}");
        assert!(!dice.contains("Munir"), "a Sam no se le llama Munir: {dice}");
        // La marca del índice va tal cual: traducida a «SUMMARY:», la línea se
        // quedaría en el chat y el índice cogería el resumen de reserva.
        assert!(!dice.contains("SUMMARY") && !dice.contains("RESUMEN"), "la marca del resumen no se traduce: {dice}");
        for a in &acciones {
            if let Accion::Abrir { encargo, .. } = a {
                assert!(!espanol(encargo), "el encargo, en inglés: {encargo}");
            }
        }

    }

    /// La mejora del dictado no traduce: un dictado en inglés vuelve en inglés y
    /// uno en español, en español. Varias veces, porque Haiku no es fijo: con la
    /// orden solo en español, de dos pasadas una volvió traducida (2026-10-15).
    /// Gasta cuatro llamadas de Haiku de tu suscripción.
    /// `cargo test --lib la_mejora_de_verdad_no_traduce -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn la_mejora_de_verdad_no_traduce() {
        let espanol = |s: &str| s.chars().any(|c| "áéíóúñ¿¡".contains(c)) || [" el ", " la ", " que ", " para ", " una "].iter().any(|p| s.to_lowercase().contains(p));
        let mejorar = |d: &str| {
            tauri::async_runtime::block_on(crate::foreman::preguntar_con(format!("{MEJORAR}{d}"), "haiku")).expect("la mejora no contestó")
        };
        let dictado = "uh so look at the radar thing that keeps crashing every two hours and also that scroll thing I told you about";
        for vuelta in 1..=3 {
            let m = mejorar(dictado);
            println!("--- en inglés, vuelta {vuelta} ---\n{m}");
            assert!(!espanol(&m), "vuelta {vuelta}: un dictado en inglés sale en inglés: {m}");
        }
        let m = mejorar("oye mira a ver lo del radar que se cae cada dos horas y ya de paso lo del scroll ese");
        println!("--- en español ---\n{m}");
        assert!(espanol(&m), "un dictado en español sigue en español: {m}");
    }

    /// EL CONTRATO CON EL MODELO, probado con el de verdad: que el conserje
    /// conteste en el formato que la reja sabe leer. Es lo más frágil de todo
    /// esto, porque no lo decide el código sino un prompt.
    ///
    /// Gasta dos llamadas de tu suscripción (una de Sonnet y una de Haiku) y no
    /// deja rastro en tu lista de sesiones (`SinRastro`). Sin las herramientas
    /// de Adeorq, que en un test no hay ventana a la que hablar.
    ///
    /// `cargo test --lib el_conserje_de_verdad -- --ignored --nocapture`
    ///
    /// Con otro cerebro, `CEREBRO=opus` (o `haiku`) delante: el formato lo tiene
    /// que cumplir cualquiera de los que se pueden elegir, no solo el de fábrica.
    #[test]
    #[ignore]
    fn el_conserje_de_verdad_contesta_en_su_formato() {
        let cerebro = std::env::var("CEREBRO").unwrap_or_default();
        let cerebro = CEREBROS.iter().copied().find(|m| *m == cerebro).unwrap_or(CEREBRO_POR_DEFECTO);
        println!("piensa con {cerebro}");
        let mut c = Conversacion { id: "banco".into(), router: true, ..Default::default() };
        c.apuntar("tu", "hola, soy Munir", "saludo");
        c.apuntar("conserje", "Hola, dime qué hacemos.", "saludé");
        let texto = "arregla lo del scroll de las terminales en Adeorq y de paso mira por qué el radar de crypto/radar-bot se cae cada dos horas";
        let prompt = format!(
            "{SISTEMA}\n\n## Esta conversación\nconversacion: banco\n\n{}\n\n## Tus proyectos (no tienes herramientas en esta prueba)\nC:\\proyectos\\Adeorq\nC:\\proyectos\\crypto\\radar-bot\n\n## Lo que te dice Munir ahora\n{texto}",
            c.contexto(&|_| String::new())
        );
        let inicio = std::time::Instant::now();
        let parar = std::sync::atomic::AtomicBool::new(false);
        let bruta = correr(&prompt, cerebro, None, &parar, false, Box::new(|p| println!("  paso: {p}"))).expect("el conserje no contestó");
        println!("--- contestó en {:.1} s ---\n{bruta}\n---", inicio.elapsed().as_secs_f32());
        let (dice, acciones, resumen, descartes) = leer_respuesta(&bruta);
        let (buenas, fuera) = filtrar(acciones, &c, std::path::Path::new("C:\\proyectos"), &|p| p.is_dir());
        println!("texto: {dice}\nacciones buenas: {buenas:?}\nfuera: {fuera:?}\ndescartes: {descartes:?}\nresumen: {resumen}");
        assert!(!dice.is_empty(), "tiene que decirle algo a Munir");
        assert!(descartes.is_empty(), "el bloque de acciones tiene que ser JSON válido");
        // Son dos trabajos distintos: dos sesiones. «Lo del scroll» no dice qué
        // fallo es, y Opus (medido el 2026-10-06) abre el radar y pregunta por el
        // scroll antes de abrirlo a ciegas; eso también es partirlo bien.
        let abiertas = buenas.iter().filter(|a| matches!(a, Accion::Abrir { .. })).count();
        assert!(
            abiertas == 2 || (abiertas == 1 && dice.contains('?')),
            "son dos trabajos distintos: dos sesiones, o una y la pregunta por la otra (abrió {abiertas})"
        );
        assert!(!resumen.is_empty() && resumen.chars().count() <= 141, "falta la línea de índice");

        let dictado = "oye mira a ver lo del radar que se cae cada dos horas y ya de paso lo del scroll ese que te dije";
        let mejorado = tauri::async_runtime::block_on(crate::foreman::preguntar_con(format!("{MEJORAR}{dictado}"), "haiku"))
            .expect("la mejora no contestó");
        println!("--- mejora ---\nantes: {dictado}\ndespués: {mejorado}");
        assert!(revisar_mejora(dictado, &mejorado).is_ok());
    }

    /// Reintentar tras un fallo no deja tu mensaje repetido.
    #[test]
    fn reintentar_no_repite_tu_mensaje() {
        let mut c = con(2);
        c.preparar("abre una sesión para el radar", &sin_estados);
        // El conserje falló y no contestó; se reintenta lo mismo.
        c.preparar("abre una sesión para el radar", &sin_estados);
        let mias = c.turnos.iter().filter(|t| t.texto == "abre una sesión para el radar").count();
        assert_eq!(mias, 1, "tiene que quedar una sola vez");
        // Pero decir lo mismo DESPUÉS de una respuesta es otro mensaje, y cuenta.
        c.apuntar("conserje", "Hecho.", "hecho");
        c.preparar("abre una sesión para el radar", &sin_estados);
        assert_eq!(c.turnos.iter().filter(|t| t.texto == "abre una sesión para el radar").count(), 2);
    }

    #[test]
    fn el_mensaje_nuevo_no_va_en_su_propio_contexto() {
        let mut c = con(2);
        let ctx = c.preparar("una frase que no estaba", &sin_estados);
        assert!(!ctx.contains("una frase que no estaba"), "va aparte, al final del prompt");
        assert_eq!(c.turnos.last().unwrap().texto, "una frase que no estaba");
    }

    #[test]
    fn un_id_con_ruta_se_rechaza() {
        assert!(ruta("../fuera").is_err());
        assert!(ruta("a\\b").is_err());
        assert!(ruta("").is_err());
    }

    // ─── EL ENJAMBRE ─────────────────────────────────────────────────────────

    fn miembro(panel: u32, nombre: &str, carpeta: &str) -> Trabajo {
        Trabajo {
            panel,
            cli: "claude".into(),
            modelo: "sonnet".into(),
            carpeta: carpeta.into(),
            nombre: nombre.into(),
            ..Default::default()
        }
    }

    fn enjambre() -> Conversacion {
        let mut c = Conversacion { id: "grupo".into(), router: true, enjambre: true, ..Default::default() };
        c.poner_miembros(vec![
            miembro(3, "Arreglar el login", "C:\\proyectos\\Vidorq"),
            miembro(5, "La portada", "C:\\proyectos\\Adeorq"),
        ]);
        c
    }

    fn escribir(panel: u32, texto: &str) -> Accion {
        Accion::Escribir { panel, texto: texto.into() }
    }

    /// Cada aviso que puede dejar la reja, sacado de las funciones de verdad, y
    /// su inglés: ni una palabra de español y con su dato dentro.
    #[test]
    fn cada_aviso_de_la_reja_tiene_su_ingles() {
        let raiz = std::path::Path::new("C:\\proyectos");
        let mut avisos = Vec::new();
        avisos.extend(leer_respuesta("Va.\n<acciones>[{\"tipo\":\"abrir\", roto</acciones>").3);
        let sin_encargo = Accion::Abrir {
            encargo: "  ".into(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            clase: "oficio".into(),
            consecuencia: "baja".into(),
            largo: false,
            trabajo: "codigo".into(),
        };
        avisos.extend(filtrar(vec![sin_encargo, abrir("D:\\otra\\cosa")], &con(1), raiz, &|_| true).1);
        avisos.extend(filtrar((0..MAX_ABRIR + 1).map(|_| abrir("C:\\proyectos\\Adeorq")).collect(), &con(1), raiz, &|_| true).1);
        avisos.extend(filtrar(vec![escribir(99, "hola")], &con(1), raiz, &|_| true).1);
        avisos.extend(filtrar(vec![escribir(99, "hola")], &enjambre(), raiz, &|_| true).1);
        avisos.extend(filtrar_enjambre(vec![abrir("C:\\proyectos\\Adeorq")], &|_| String::new()).1);
        let pregunta = |p: u32| if p == 3 { format!("{PREGUNTA} algo") } else { String::new() };
        avisos.extend(filtrar_enjambre(vec![escribir(3, "a"), escribir(5, "b")], &pregunta).1);
        assert_eq!(avisos.len(), 8, "{avisos:#?}");
        let espanol = |s: &str| s.chars().any(|c| "áéíóúñ¿¡«»".contains(c)) || [" el ", " la ", " que ", " no se "].iter().any(|p| s.contains(p));
        for a in &avisos {
            let en = descarte_en_ingles(a);
            assert!(en != *a && !espanol(&en), "sin inglés: «{a}» -> «{en}»");
        }
        assert!(descarte_en_ingles(&avisos[2]).contains("D:\\otra\\cosa"));
        assert_eq!(descarte_en_ingles("otra cosa que no es de la reja"), "otra cosa que no es de la reja");
    }

    /// Una sesión que entra en el grupo queda escribible: sin el arranque de
    /// ahora, la reja de siempre la tomaría por una de otro día.
    #[test]
    fn los_miembros_de_un_enjambre_son_de_este_arranque_y_se_sustituyen() {
        let mut c = enjambre();
        assert!(c.trabajos.iter().all(|w| w.escribible()));
        // Sale la del panel 3 y entra la del 9: la lista es la que llega.
        c.poner_miembros(vec![
            miembro(5, "La portada", "C:\\proyectos\\Adeorq"),
            miembro(9, "Las pruebas", "C:\\proyectos\\Adeorq"),
            miembro(9, "repetida", "C:\\proyectos\\Adeorq"),
        ]);
        let paneles: Vec<u32> = c.trabajos.iter().map(|w| w.panel).collect();
        assert_eq!(paneles, vec![5, 9], "ni la que salió ni la repetida");
        let muchos = (1..=30).map(|p| miembro(p, "x", "C:\\proyectos\\Adeorq")).collect();
        c.poner_miembros(muchos);
        assert_eq!(c.trabajos.len(), MAX_MIEMBROS);
    }

    #[test]
    fn un_enjambre_piensa_con_haiku_si_no_eliges_otro() {
        let mut c = enjambre();
        assert_eq!(c.cerebro(), "haiku");
        c.cerebro = "opus".into();
        assert_eq!(c.cerebro(), "opus");
        assert_eq!(con(1).cerebro(), "sonnet", "el conserje del Chat sigue con el suyo");
    }

    /// Adeo ve a cada sesión con su nombre y su carpeta, que es como Munir las
    /// llama, y lo que contestaron firmado por ellas.
    #[test]
    fn el_contexto_de_un_enjambre_nombra_a_sus_sesiones() {
        let mut c = enjambre();
        c.apuntar("tu", "que la del login pruebe con dos usuarios", "probar el login con dos usuarios");
        c.apuntar("conserje", "Se lo he mandado a «Arreglar el login».", "mandé la prueba al login");
        assert!(c.apuntar_respuesta("Arreglar el login", "Probado con dos usuarios: entra el segundo."));
        let ctx = c.contexto(&|p| if p == 3 { "ha terminado".into() } else { "trabajando".into() });
        assert!(ctx.contains("== SESIONES DEL ENJAMBRE =="), "{ctx}");
        assert!(ctx.contains("- panel 3 · «Arreglar el login» · claude sonnet · C:\\proyectos\\Vidorq · ha terminado"), "{ctx}");
        assert!(ctx.contains("Tú (Adeo):"), "{ctx}");
        assert!(ctx.contains("La sesión «Arreglar el login»:\nProbado con dos usuarios"), "{ctx}");
        assert!(!ctx.contains("PESTAÑAS"), "{ctx}");
    }

    /// Una terminal que se relee vuelve a decir que acabó: su respuesta no
    /// puede salir dos veces en el hilo. Otra respuesta suya sí es nueva.
    #[test]
    fn la_respuesta_de_una_sesion_no_se_repite() {
        let mut c = enjambre();
        assert!(c.apuntar_respuesta("La portada", "Hecho: la portada carga."));
        assert!(!c.apuntar_respuesta("La portada", "  Hecho: la portada carga.\n"));
        assert!(c.apuntar_respuesta("Arreglar el login", "Hecho: la portada carga."), "es de otra sesión");
        assert!(c.apuntar_respuesta("La portada", "Y el pie también."));
        assert!(!c.apuntar_respuesta("La portada", "   "));
        let suyos = c.turnos.iter().filter(|t| t.rol == "sesion").count();
        assert_eq!(suyos, 3);
        let ultimo = c.turnos.last().unwrap();
        assert_eq!(ultimo.de, "La portada");
        // Un volcado no se guarda entero: está en su terminal.
        assert!(c.apuntar_respuesta("La portada", &"línea de un volcado\n".repeat(2_000)));
        assert!(c.turnos.last().unwrap().texto.chars().count() < TOPE_RESPUESTA + 40);
    }

    /// EL CASO QUE COSTÓ UN COMMIT AJENO: un reparto no cae en el menú de una
    /// sesión que está preguntando. Contestarle a ella sola sí pasa.
    #[test]
    fn la_reja_del_enjambre_no_reparte_a_quien_pregunta() {
        // La palabra es la de `PALABRA.pregunta`, en `lib/conserje.ts`.
        let estados = |p: u32| if p == 5 { "te pregunta algo".to_string() } else { "ha terminado".to_string() };
        let (buenas, fuera) = filtrar_enjambre(vec![escribir(3, "prueba el login"), escribir(5, "repasa la portada")], &estados);
        assert_eq!(buenas, vec![escribir(3, "prueba el login")]);
        assert!(fuera.iter().any(|f| f.contains("panel 5") && f.contains("preguntando")), "{fuera:?}");

        let (buenas, fuera) = filtrar_enjambre(vec![escribir(5, "sí, sube solo lo del panel")], &estados);
        assert_eq!(buenas, vec![escribir(5, "sí, sube solo lo del panel")], "a ella sola es contestarle");
        assert!(fuera.is_empty());
    }

    #[test]
    fn la_reja_del_enjambre_ni_abre_ni_manda_dos_veces_a_la_misma() {
        let abrir = Accion::Abrir {
            encargo: "montar las pruebas".into(),
            carpeta: "C:\\proyectos\\Adeorq".into(),
            clase: "oficio".into(),
            consecuencia: "alta".into(),
            largo: false,
            trabajo: "codigo".into(),
        };
        let (buenas, fuera) =
            filtrar_enjambre(vec![abrir, escribir(3, "primero esto"), escribir(3, "y luego esto")], &|_| String::new());
        assert_eq!(buenas, vec![escribir(3, "primero esto\n\ny luego esto")]);
        assert!(fuera.iter().any(|f| f.contains("no abre sesiones")), "{fuera:?}");

        // Y detrás va la reja de siempre: un panel que no es del grupo, fuera.
        let c = enjambre();
        let (buenas, fuera) = filtrar(vec![escribir(3, "a una del grupo"), escribir(8, "a una de fuera")], &c, std::path::Path::new("C:\\proyectos"), &|_| true);
        assert_eq!(buenas, vec![escribir(3, "a una del grupo")]);
        assert!(fuera.iter().any(|f| f.contains("panel 8") && f.contains("enjambre")), "{fuera:?}");
    }

    /// Un enjambre guardado y vuelto a leer es el mismo, y una conversación de
    /// las de antes (sin los campos nuevos) se guarda igual que estaba.
    #[test]
    fn los_campos_del_enjambre_no_tocan_las_conversaciones_de_antes() {
        let mut c = enjambre();
        c.apuntar_respuesta("La portada", "Hecho.");
        let vuelta: Conversacion = serde_json::from_str(&serde_json::to_string(&c).unwrap()).unwrap();
        assert_eq!(vuelta, c);

        let vieja = con(2);
        let texto = serde_json::to_string(&vieja).unwrap();
        for campo in ["enjambre", "\"de\"", "\"nombre\""] {
            assert!(!texto.contains(campo), "{campo} no tiene que salir en una conversación del Chat: {texto}");
        }
    }

    /// Adeo de verdad, con el modelo pequeño: si no reparte con el formato y
    /// a la sesión que toca, el enjambre no funciona, y eso no lo decide el
    /// código sino un prompt.
    ///
    /// Gasta dos llamadas cortas de tu suscripción y no deja rastro en tu lista
    /// de sesiones. Sin las herramientas de Adeorq, como el del conserje.
    ///
    /// `cargo test --lib el_enjambre_de_verdad -- --ignored --nocapture`
    /// (`CEREBRO=sonnet` delante para probarlo con otro).
    #[test]
    #[ignore]
    fn el_enjambre_de_verdad_reparte_en_su_formato() {
        let cerebro = std::env::var("CEREBRO").unwrap_or_default();
        let cerebro = CEREBROS.iter().copied().find(|m| *m == cerebro).unwrap_or(CEREBRO_DE_ENJAMBRE);
        println!("piensa con {cerebro}");
        let mut c = enjambre();
        let estados = |p: u32| if p == 3 { "ha terminado, contexto al 20 %".to_string() } else { "trabajando, contexto al 55 %".to_string() };
        let preguntar = |c: &Conversacion, texto: &str| {
            let prompt = format!(
                "{SISTEMA_ENJAMBRE}\n\n## Esta conversación\nconversacion: grupo\n\n{}\n\n## Lo que te dice Munir ahora\n{texto}",
                c.contexto(&estados)
            );
            let inicio = std::time::Instant::now();
            let parar = std::sync::atomic::AtomicBool::new(false);
            let bruta = correr(&prompt, cerebro, None, &parar, false, Box::new(|p| println!("  paso: {p}"))).expect("Adeo no contestó");
            println!("--- contestó en {:.1} s ---\n{bruta}\n---", inicio.elapsed().as_secs_f32());
            let (dice, acciones, resumen, descartes) = leer_respuesta(&bruta);
            assert!(descartes.is_empty(), "el bloque de acciones tiene que ser JSON válido: {descartes:?}");
            let (acciones, fuera) = filtrar_enjambre(acciones, &estados);
            let (acciones, fuera2) = filtrar(acciones, c, std::path::Path::new("C:\\proyectos"), &|_| true);
            println!("texto: {dice}\nacciones: {acciones:?}\nfuera: {fuera:?} {fuera2:?}\nresumen: {resumen}");
            assert!(!dice.is_empty(), "tiene que decirle algo a Munir");
            assert!(!resumen.is_empty() && resumen.chars().count() <= 141, "falta la línea de índice");
            (dice, acciones)
        };

        // Un encargo dictado, sin nombrar a nadie: va a la que lleva ese tema.
        let (dice, acciones) = preguntar(&c, "oye mira que en el login de vidorq si entras con dos usuarios a la vez el segundo se queda colgado, que lo arregle");
        assert_eq!(acciones.len(), 1, "es una sola cosa y de una sola sesión");
        let Accion::Escribir { panel, texto } = &acciones[0] else { panic!("un enjambre solo escribe") };
        assert_eq!(*panel, 3, "es el tema de «Arreglar el login», que además ha terminado");
        assert!(texto.to_lowercase().contains("usuario"), "el encargo se reescribe, no se pierde: {texto}");
        c.apuntar("tu", "lo del login con dos usuarios", "arreglar el login con dos usuarios");
        c.apuntar("conserje", &dice, "mandé el arreglo al login");

        // Nombrada por lo suyo: a esa y solo a esa, aunque esté trabajando.
        let (_, acciones) = preguntar(&c, "dile a la de la portada que cuando acabe me pase una captura");
        assert_eq!(acciones.len(), 1);
        assert!(matches!(&acciones[0], Accion::Escribir { panel: 5, .. }), "la de la portada es «La portada», en el panel 5");
    }
}
