// Los encargos programados: «cada lunes a las 9, esto», y el cortacircuitos
// que los para si fallan tres veces seguidas.
//
// Munir los aprobó el 2026-10-10. El cortacircuitos estaba aparcado hasta que
// existiera algo que insistiera por su cuenta, y esto lo es: un encargo que
// nadie mira, que se lanza solo y que gasta cuota de verdad. Por eso nacen
// juntos, y por eso todo lo que decide vive aquí y no en la ventana: el
// presupuesto no lo guarda quien lo gasta (la misma ley que los topes del MCP,
// en `mcp.rs`).
//
// Lo que NO hace este archivo es abrir una terminal: eso es React. Le pide a la
// ventana un `open_pane`, que es el pedido que ya atiende para los agentes del
// MCP (`lib/puenteMcp.ts`), y mira después cómo acabó.
//
// Qué se sabe de cómo acabó, y qué no:
//   · NO NACIÓ: la ventana no contesta o contesta un error. Seguro.
//   · SE CERRÓ SOLA: el panel ya no está y nadie lo cerró desde Adeorq.
//   · TERMINÓ: su conversación acaba en una respuesta del agente. Ojo: eso es
//     «acabó hablando», no «salió bien»; también termina así un «no pude».
//   · TE ESPERA: está preguntando algo. Solo cuenta como fallo si sigue así
//     cuando toca la vez siguiente.
//
// El plano entero, con lo que se dejó fuera, en `docs/contexto/programados.md`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Cuántos caben. Veinte encargos que se lanzan solos ya son muchos.
pub const TOPE: usize = 20;
const TOPE_NOMBRE: usize = 60;
const TOPE_ENCARGO: usize = 4000;
/// Al tercer fallo seguido se para y avisa, en vez de insistir.
pub const FALLOS_PARA_CORTAR: u32 = 3;
/// Las últimas veces que se guardan de cada uno, para los puntos de su fila.
const GUARDADAS: usize = 3;
const HORA_MS: u64 = 3_600_000;

/// Cuándo se lanza. Dos formas y ninguna más: sin expresiones de cron, que
/// nadie sabe leer de memoria y aquí no hacen falta.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Cuando {
    /// Unos días de la semana a una hora. 1 es lunes y 7 domingo; «cada día»
    /// son los siete. La hora, «HH:MM» en hora local.
    Semanal { dias: Vec<u8>, hora: String },
    /// Cada tantas horas, de 1 a 168 (una semana).
    Cada { horas: u32 },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Resultado {
    Hecho,
    Fallo,
    /// No se lanzó, o no se pudo juzgar, sin que sea culpa del encargo. No
    /// suma ni resta en el cortacircuitos.
    Saltado,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Pasada {
    pub cuando: u64,
    pub resultado: Resultado,
    pub detalle: String,
}

/// La sesión que abrió la última vez.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Corrida {
    pub inicio: u64,
    pub panel: u32,
    /// Con qué arranque de Adeorq va ese número de panel: vuelven a empezar
    /// en 1 cada vez que se abre la app.
    pub arranque: u64,
    /// Ya se apuntó cómo acabó. Se guarda igual para poder cerrar su terminal
    /// cuando nazca la siguiente.
    #[serde(default)]
    pub juzgada: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Corte {
    pub cuando: u64,
    pub motivo: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Encargo {
    pub id: String,
    pub nombre: String,
    pub encargo: String,
    /// La carpeta donde nace la sesión.
    pub cwd: String,
    pub cuando: Cuando,
    /// El interruptor de la persona. `cortado` es el del freno: son dos campos
    /// para que la pantalla pueda decir POR QUÉ está parado.
    pub activo: bool,
    pub creado: u64,
    /// Cuándo se lanzó la última vez, en milisegundos.
    #[serde(default)]
    pub ultima: u64,
    /// El día LOCAL de la última vez («2026-10-12»). Es lo que impide lanzarlo
    /// dos veces el mismo día, sin hacer cuentas de husos horarios.
    #[serde(default)]
    pub ultimo_dia: String,
    #[serde(default)]
    pub corrida: Option<Corrida>,
    #[serde(default)]
    pub ultimas: Vec<Pasada>,
    #[serde(default)]
    pub fallos_seguidos: u32,
    #[serde(default)]
    pub cortado: Option<Corte>,
}

#[derive(Serialize, Deserialize, Default)]
struct Almacen {
    version: u32,
    encargos: Vec<Encargo>,
}

/// La hora de la pared, que es con la que piensa quien programa algo.
#[derive(Clone, Debug, PartialEq)]
pub struct Local {
    /// «2026-10-12».
    pub fecha: String,
    /// 1 lunes … 7 domingo.
    pub dia: u8,
    /// Minutos desde medianoche.
    pub minutos: u16,
}

/// Lo que pide la pantalla al crear uno o al editarlo.
#[derive(Deserialize, Clone, Debug)]
pub struct Pedido {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub nombre: String,
    pub encargo: String,
    pub cwd: String,
    pub cuando: Cuando,
}

fn limpio(s: &str, tope: usize) -> String {
    s.trim().chars().take(tope).collect()
}

/// «09:05» → 545. Nada que no sea HH:MM vale.
pub fn minutos_de(hora: &str) -> Option<u16> {
    let (h, m) = hora.trim().split_once(':')?;
    if h.is_empty() || h.len() > 2 || m.len() != 2 {
        return None;
    }
    let (h, m) = (h.parse::<u16>().ok()?, m.parse::<u16>().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Deja el pedido como se va a guardar, o dice qué arreglar.
pub fn validar(p: &Pedido) -> Result<(String, String, String, Cuando), String> {
    let encargo = limpio(&p.encargo, TOPE_ENCARGO);
    if encargo.is_empty() {
        return Err("Falta el encargo: qué tiene que hacer.".into());
    }
    let cwd = p.cwd.trim().to_string();
    if cwd.is_empty() {
        return Err("Falta el proyecto donde se abre.".into());
    }
    let cuando = match &p.cuando {
        Cuando::Semanal { dias, hora } => {
            let mut d: Vec<u8> = dias.iter().copied().filter(|x| (1..=7).contains(x)).collect();
            d.sort_unstable();
            d.dedup();
            if d.is_empty() {
                return Err("Elige al menos un día de la semana.".into());
            }
            let m = minutos_de(hora).ok_or("La hora tiene que ser HH:MM, de 00:00 a 23:59.")?;
            Cuando::Semanal { dias: d, hora: format!("{:02}:{:02}", m / 60, m % 60) }
        }
        Cuando::Cada { horas } => {
            if !(1..=168).contains(horas) {
                return Err("«Cada N horas» va de 1 a 168 (una semana).".into());
            }
            Cuando::Cada { horas: *horas }
        }
    };
    let nombre = match limpio(&p.nombre, TOPE_NOMBRE) {
        n if n.is_empty() => limpio(encargo.lines().next().unwrap_or(""), 40),
        n => n,
    };
    Ok((nombre, encargo, cwd, cuando))
}

/// ¿Toca lanzarlo ahora?
///
/// Las ejecuciones perdidas no necesitan código aparte: encender el PC el lunes
/// a las 11 lo lanza a las 11, y el martes ya no, porque no es su día. Tres
/// lunes perdidos no lanzan tres, porque solo se mira hoy.
pub fn toca(e: &Encargo, ahora: u64, local: &Local) -> bool {
    if !e.activo || e.cortado.is_some() {
        return false;
    }
    match &e.cuando {
        Cuando::Semanal { dias, hora } => {
            let Some(m) = minutos_de(hora) else { return false };
            dias.contains(&local.dia) && local.minutos >= m && e.ultimo_dia != local.fecha
        }
        Cuando::Cada { horas } => {
            // Recién creado cuenta desde que se creó: si no, nacería lanzándose.
            let base = e.ultima.max(e.creado);
            ahora >= base + u64::from((*horas).max(1)) * HORA_MS
        }
    }
}

/// ¿Ya pasó hoy su hora? Al crearlo o editarlo a las 10 con «lunes 09:00», un
/// lunes, `toca` diría que sí en el acto: se da el día por hecho y empieza la
/// vez siguiente. Guardar un formulario no es pedir que se lance.
fn ya_paso_hoy(cuando: &Cuando, local: &Local) -> bool {
    match cuando {
        Cuando::Semanal { dias, hora } => {
            dias.contains(&local.dia) && minutos_de(hora).is_some_and(|m| local.minutos >= m)
        }
        Cuando::Cada { .. } => false,
    }
}

/// Apunta cómo fue una vez. Devuelve si con esta se ACABA de cortar.
pub fn apuntar(e: &mut Encargo, ahora: u64, resultado: Resultado, detalle: &str) -> bool {
    e.ultimas.insert(0, Pasada { cuando: ahora, resultado, detalle: detalle.to_string() });
    e.ultimas.truncate(GUARDADAS);
    match resultado {
        Resultado::Hecho => e.fallos_seguidos = 0,
        Resultado::Saltado => {}
        Resultado::Fallo => {
            e.fallos_seguidos += 1;
            if e.fallos_seguidos >= FALLOS_PARA_CORTAR && e.cortado.is_none() {
                e.cortado = Some(Corte { cuando: ahora, motivo: detalle.to_string() });
                return true;
            }
        }
    }
    false
}

/// Lo que se ve de la sesión de la vez anterior.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Visto {
    Trabaja,
    Termino,
    /// Está preguntando algo y nadie le contesta.
    Espera,
    /// Ya no está, y la cerró alguien desde Adeorq.
    CerradaAMano,
    /// Ya no está y nadie la cerró: su proceso murió.
    SeCerro,
    /// Sigue abierta y no se puede decir qué hace (la ventana no contesta, o
    /// todavía no tiene conversación).
    NoSeSabe,
}

/// Lo que el reloj necesita del resto de la app. Va aparte para poder recorrer
/// tres lunes en una prueba sin ventana, sin terminales y sin esperar.
pub trait Puertas {
    fn abrir(&mut self, e: &Encargo) -> Result<u32, String>;
    fn mirar(&mut self, panel: u32) -> Visto;
    fn cerrar(&mut self, panel: u32);
    /// El cortacircuitos acaba de saltar con este encargo.
    fn cortado(&mut self, e: &Encargo);
}

fn archivo(dir: &Path) -> PathBuf {
    dir.join("programados.json")
}

/// Todos. Un archivo que EXISTE y no se entiende es un error, no una lista
/// vacía: darlo por vacío haría que el siguiente guardado se lo cargara.
pub fn leer(dir: &Path) -> Result<Vec<Encargo>, String> {
    let f = archivo(dir);
    let crudo = match std::fs::read(&f) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    serde_json::from_slice::<Almacen>(&crudo)
        .map(|a| a.encargos)
        .map_err(|e| format!("programados.json no se puede leer ({e}). No se toca hasta que lo arregles o lo borres."))
}

pub fn guardar(dir: &Path, encargos: &[Encargo]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let destino = archivo(dir);
    let temporal = destino.with_extension("json.tmp");
    let cuerpo = serde_json::to_vec_pretty(&Almacen { version: 1, encargos: encargos.to_vec() }).map_err(|e| e.to_string())?;
    std::fs::write(&temporal, cuerpo).map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, &destino).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })
}

fn apuntar_y_avisar(e: &mut Encargo, ahora: u64, r: Resultado, detalle: &str, p: &mut dyn Puertas) {
    if apuntar(e, ahora, r, detalle) {
        p.cortado(e);
    }
}

/// Una vuelta del reloj. Devuelve si cambió algo.
///
/// Dos pasos por encargo: primero se mira cómo acabó la vez anterior, y luego
/// si toca lanzarlo. Como mucho UNA apertura por vuelta: cinco encargos «cada
/// día a las 9» nacen de treinta en treinta segundos, no de golpe.
pub fn vuelta(dir: &Path, ahora: u64, local: &Local, arranque: u64, p: &mut dyn Puertas) -> Result<bool, String> {
    let mut todos = leer(dir)?;
    let mut cambio = false;
    let mut abierta = false;

    for i in 0..todos.len() {
        // 1. La vez anterior, si sigue sin juzgar.
        let mut pendiente: Option<Visto> = None;
        if let Some(c) = todos[i].corrida.clone().filter(|c| !c.juzgada) {
            if c.arranque != arranque {
                // Adeorq se cerró con ella abierta: murió con la app, y de cómo
                // iba no queda nada que mirar. No es culpa del encargo.
                todos[i].corrida = None;
                apuntar(&mut todos[i], ahora, Resultado::Saltado, "Adeorq se cerró con la sesión a medias");
                cambio = true;
            } else {
                match p.mirar(c.panel) {
                    Visto::Termino => {
                        if let Some(c) = todos[i].corrida.as_mut() {
                            c.juzgada = true;
                        }
                        apuntar(&mut todos[i], ahora, Resultado::Hecho, "");
                        cambio = true;
                    }
                    Visto::SeCerro => {
                        todos[i].corrida = None;
                        apuntar_y_avisar(&mut todos[i], ahora, Resultado::Fallo, "la terminal se cerró sola antes de terminar", p);
                        cambio = true;
                    }
                    Visto::CerradaAMano => {
                        todos[i].corrida = None;
                        apuntar(&mut todos[i], ahora, Resultado::Saltado, "se cerró desde Adeorq antes de terminar");
                        cambio = true;
                    }
                    v => pendiente = Some(v),
                }
            }
        }

        // 2. ¿Toca?
        if abierta || !toca(&todos[i], ahora, local) {
            continue;
        }
        // El turno se da por gastado ANTES de hacer nada con él: como mucho una
        // vez, aunque la app se caiga justo después.
        todos[i].ultima = ahora;
        todos[i].ultimo_dia = local.fecha.clone();
        cambio = true;

        if let Some(v) = pendiente {
            // La anterior sigue abierta: no se lanza otra encima.
            match v {
                Visto::Trabaja => {
                    apuntar(&mut todos[i], ahora, Resultado::Saltado, "la vez anterior sigue trabajando");
                }
                Visto::Espera => apuntar_y_avisar(&mut todos[i], ahora, Resultado::Fallo, "la vez anterior sigue esperando una respuesta tuya", p),
                _ => {
                    // De esa no se va a saber más: se suelta, para que la
                    // siguiente vez pueda nacer una nueva.
                    todos[i].corrida = None;
                    apuntar_y_avisar(&mut todos[i], ahora, Resultado::Fallo, "de la vez anterior no se supo cómo acabó", p);
                }
            }
            continue;
        }

        guardar(dir, &todos)?;
        // La de la vez anterior, si terminó y sigue ahí tal cual, se cierra al
        // nacer la nueva. Si alguien siguió hablando con ella, no se toca.
        if let Some(c) = todos[i].corrida.take() {
            if c.arranque == arranque && p.mirar(c.panel) == Visto::Termino {
                p.cerrar(c.panel);
            }
        }
        match p.abrir(&todos[i]) {
            Ok(panel) => todos[i].corrida = Some(Corrida { inicio: ahora, panel, arranque, juzgada: false }),
            Err(e) => {
                let detalle = format!("no nació: {}", limpio(&e, 160));
                apuntar_y_avisar(&mut todos[i], ahora, Resultado::Fallo, &detalle, p);
            }
        }
        abierta = true;
    }

    if cambio {
        guardar(dir, &todos)?;
    }
    Ok(cambio)
}

// ── De aquí abajo, lo que toca la app de verdad ─────────────────────────────

/// Quien lee y escribe el archivo lo hace de uno en uno: el reloj y la pantalla
/// editan el mismo, y dos «leer, cambiar y guardar» a la vez pierden uno.
static CANDADO: Mutex<()> = Mutex::new(());
static RELOJ: AtomicBool = AtomicBool::new(false);

fn tomar() -> std::sync::MutexGuard<'static, ()> {
    CANDADO.lock().unwrap_or_else(|e| e.into_inner())
}

fn ahora_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// La hora local. Solo en Windows: es la v1, igual que el segundo plano.
#[cfg(windows)]
pub fn hora_local() -> Option<Local> {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut t) };
    Some(Local {
        fecha: format!("{:04}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay),
        // Windows cuenta desde el domingo (0); aquí el lunes es 1 y el domingo 7.
        dia: if t.wDayOfWeek == 0 { 7 } else { t.wDayOfWeek as u8 },
        minutos: t.wHour * 60 + t.wMinute,
    })
}

#[cfg(not(windows))]
pub fn hora_local() -> Option<Local> {
    None
}

pub const EVENTO_CAMBIAN: &str = "programados:cambian";

fn avisar_cambio(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let _ = app.emit(EVENTO_CAMBIAN, ());
}

/// Las puertas de verdad: la ventana, las terminales y el móvil.
struct Reales<'a> {
    app: &'a tauri::AppHandle,
    /// Lo que dice la ventana de sus paneles, preguntado una vez por vuelta.
    paneles: Option<Vec<serde_json::Value>>,
}

impl Reales<'_> {
    fn estado_de(&mut self, panel: u32) -> Option<String> {
        if self.paneles.is_none() {
            self.paneles = crate::mcp::pedir_a_la_ventana_con(self.app, "paneles", serde_json::json!({}), std::time::Duration::from_secs(4))
                .ok()
                .and_then(|r| r.datos)
                .and_then(|d| d.as_array().cloned());
        }
        let lista = self.paneles.as_ref()?;
        let p = lista.iter().find(|p| p["id"].as_u64() == Some(u64::from(panel)))?;
        Some(p["state"].as_str().unwrap_or("").to_string())
    }
}

impl Puertas for Reales<'_> {
    fn abrir(&mut self, e: &Encargo) -> Result<u32, String> {
        // Solo Claude en la v1: es del único del que se sabe leer cómo acabó.
        let r = crate::mcp::pedir_a_la_ventana(
            self.app,
            "open_pane",
            serde_json::json!({ "cli": "claude", "cwd": e.cwd, "brief": e.encargo, "name": e.nombre }),
        )?;
        self.paneles = None;
        r.pane_id.ok_or_else(|| "la ventana no dijo qué terminal abrió".to_string())
    }

    fn mirar(&mut self, panel: u32) -> Visto {
        if !crate::pty::paneles_abiertos(self.app).contains(&panel) {
            return if crate::pty::cerrada_a_mano(panel) { Visto::CerradaAMano } else { Visto::SeCerro };
        }
        // El vocabulario es el de `last_message_state` (sessions.rs).
        match self.estado_de(panel).as_deref() {
            Some("lista") | Some("ofrece") => Visto::Termino,
            Some("pregunta") => Visto::Espera,
            Some("a_medias") | Some("tuya") => Visto::Trabaja,
            _ => Visto::NoSeSabe,
        }
    }

    fn cerrar(&mut self, panel: u32) {
        let _ = crate::mcp::pedir_a_la_ventana(self.app, "close_pane", serde_json::json!({ "paneId": panel }));
        self.paneles = None;
    }

    fn cortado(&mut self, e: &Encargo) {
        let motivo = e.cortado.as_ref().map(|c| c.motivo.clone()).unwrap_or_default();
        crate::anotar(&format!("programados: «{}» se para tras {FALLOS_PARA_CORTAR} fallos seguidos ({motivo})", e.nombre));
        let _ = crate::movil::movil_avisar(
            self.app.clone(),
            "Encargo programado parado".into(),
            format!("«{}» falló {FALLOS_PARA_CORTAR} veces seguidas y no se lanza más hasta que lo rearmes. {motivo}", e.nombre),
            None,
        );
    }
}

/// El hilo del reloj: espera a que la app termine de arrancar y mira cada
/// treinta segundos.
///
/// En una compilación de desarrollo NO arranca, salvo que se pida con
/// `ADEORQ_PROGRAMADOS=1`: `pnpm tauri dev` comparte la carpeta de datos con la
/// Adeorq instalada, y dos relojes sobre el mismo archivo lanzarían cada
/// encargo dos veces.
pub fn arrancar(app: tauri::AppHandle) {
    if cfg!(debug_assertions) && std::env::var("ADEORQ_PROGRAMADOS").is_err() {
        return;
    }
    if hora_local().is_none() {
        return;
    }
    RELOJ.store(true, Ordering::SeqCst);
    // Para probarlo sin esperar minuto y medio, y solo en desarrollo.
    let espera = if cfg!(debug_assertions) { 10 } else { 90 };
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(espera));
        loop {
            if let (Ok(dir), Some(local)) = (crate::dir_datos_creado(), hora_local()) {
                let cambio = {
                    let _g = tomar();
                    let mut p = Reales { app: &app, paneles: None };
                    vuelta(&dir, ahora_ms(), &local, crate::conserje::arranque(), &mut p)
                };
                match cambio {
                    Ok(true) => avisar_cambio(&app),
                    Ok(false) => {}
                    Err(e) => crate::anotar(&format!("programados: {e}")),
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(30));
        }
    });
}

/// Lo que pinta la pantalla.
#[derive(Serialize)]
pub struct Estado {
    /// En este sistema se pueden lanzar solos (hoy, solo Windows).
    puede: bool,
    /// El reloj está corriendo en ESTA ventana (en la de desarrollo, no).
    reloj: bool,
    encargos: Vec<Encargo>,
}

fn estado(encargos: Vec<Encargo>) -> Estado {
    Estado { puede: hora_local().is_some(), reloj: RELOJ.load(Ordering::SeqCst), encargos }
}

#[tauri::command(async)]
pub fn programados_listar() -> Result<Estado, String> {
    let _g = tomar();
    Ok(estado(leer(&crate::dir_datos_creado()?)?))
}

/// Cambia uno, por su id, y devuelve la lista como quedó.
fn cambiar(app: &tauri::AppHandle, id: &str, f: impl FnOnce(&mut Encargo)) -> Result<Estado, String> {
    let _g = tomar();
    let dir = crate::dir_datos_creado()?;
    let mut todos = leer(&dir)?;
    let e = todos.iter_mut().find(|e| e.id == id).ok_or("Ese encargo ya no está.")?;
    f(e);
    guardar(&dir, &todos)?;
    avisar_cambio(app);
    Ok(estado(todos))
}

/// Crear uno o editarlo. Editarlo lo REARMA: quien lo toca ya lo ha mirado.
#[tauri::command(async)]
pub fn programado_guardar(app: tauri::AppHandle, pedido: Pedido) -> Result<Estado, String> {
    let (nombre, encargo, cwd, cuando) = validar(&pedido)?;
    if !Path::new(&cwd).is_dir() {
        return Err(format!("Esa carpeta no existe: {cwd}"));
    }
    let _g = tomar();
    let dir = crate::dir_datos_creado()?;
    let mut todos = leer(&dir)?;
    let ahora = ahora_ms();
    let hoy = hora_local().filter(|l| ya_paso_hoy(&cuando, l)).map(|l| l.fecha);
    match pedido.id.as_deref().filter(|i| !i.is_empty()) {
        Some(id) => {
            let e = todos.iter_mut().find(|e| e.id == id).ok_or("Ese encargo ya no está.")?;
            if e.cuando != cuando {
                // Con otro horario, hoy empieza de cero: salvo que su hora ya
                // haya pasado, que entonces empieza la vez siguiente.
                e.ultimo_dia = hoy.unwrap_or_default();
                e.creado = ahora;
            }
            (e.nombre, e.encargo, e.cwd, e.cuando) = (nombre, encargo, cwd, cuando);
            e.cortado = None;
            e.fallos_seguidos = 0;
        }
        None => {
            if todos.len() >= TOPE {
                return Err(format!("Ya hay {TOPE} encargos programados, que es el tope. Borra alguno."));
            }
            let mut n = ahora;
            while todos.iter().any(|e| e.id == format!("p{n:x}")) {
                n += 1;
            }
            todos.push(Encargo {
                id: format!("p{n:x}"),
                nombre,
                encargo,
                cwd,
                cuando,
                activo: true,
                creado: ahora,
                ultima: 0,
                ultimo_dia: hoy.unwrap_or_default(),
                corrida: None,
                ultimas: Vec::new(),
                fallos_seguidos: 0,
                cortado: None,
            });
        }
    }
    guardar(&dir, &todos)?;
    avisar_cambio(&app);
    Ok(estado(todos))
}

#[tauri::command(async)]
pub fn programado_borrar(app: tauri::AppHandle, id: String) -> Result<Estado, String> {
    let _g = tomar();
    let dir = crate::dir_datos_creado()?;
    let mut todos = leer(&dir)?;
    todos.retain(|e| e.id != id);
    guardar(&dir, &todos)?;
    avisar_cambio(&app);
    Ok(estado(todos))
}

#[tauri::command(async)]
pub fn programado_activar(app: tauri::AppHandle, id: String, activo: bool) -> Result<Estado, String> {
    cambiar(&app, &id, |e| e.activo = activo)
}

/// Quitarle el freno. Solo a mano: nunca se rearma por tiempo.
#[tauri::command(async)]
pub fn programado_rearmar(app: tauri::AppHandle, id: String) -> Result<Estado, String> {
    cambiar(&app, &id, |e| {
        e.cortado = None;
        e.fallos_seguidos = 0;
    })
}

/// «Probar ahora»: lo lanza ya, sin mirar el horario y sin gastar el turno de
/// hoy. Lo que no se salta es lo de no pisar a la vez anterior.
#[tauri::command(async)]
pub fn programado_probar(app: tauri::AppHandle, id: String) -> Result<Estado, String> {
    let _g = tomar();
    let dir = crate::dir_datos_creado()?;
    let mut todos = leer(&dir)?;
    let arranque = crate::conserje::arranque();
    let mut p = Reales { app: &app, paneles: None };
    let e = todos.iter_mut().find(|e| e.id == id).ok_or("Ese encargo ya no está.")?;
    if let Some(c) = e.corrida.as_ref().filter(|c| !c.juzgada && c.arranque == arranque) {
        if !matches!(p.mirar(c.panel), Visto::SeCerro | Visto::CerradaAMano) {
            return Err("La vez anterior sigue abierta: ciérrala o espera a que termine.".into());
        }
    }
    let ahora = ahora_ms();
    match p.abrir(e) {
        Ok(panel) => e.corrida = Some(Corrida { inicio: ahora, panel, arranque, juzgada: false }),
        Err(err) => {
            // Una prueba que no nace se dice, pero no cuenta para el freno: la
            // has lanzado tú y la estás mirando.
            apuntar(e, ahora, Resultado::Saltado, &format!("la prueba no nació: {}", limpio(&err, 160)));
            guardar(&dir, &todos)?;
            avisar_cambio(&app);
            return Err(err);
        }
    }
    guardar(&dir, &todos)?;
    avisar_cambio(&app);
    Ok(estado(todos))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> PathBuf {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let d = std::env::temp_dir().join(format!("adeorq-programados-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    /// Un lunes cualquiera, a tal hora. La semana `s` es la fecha: lo único que
    /// importa de ella es que cambie de un lunes al siguiente.
    fn lunes(s: u32, hora: &str) -> Local {
        Local { fecha: format!("2026-10-{:02}", 5 + 7 * s), dia: 1, minutos: minutos_de(hora).unwrap() }
    }

    fn encargo(cuando: Cuando) -> Encargo {
        Encargo {
            id: "p1".into(),
            nombre: "Dependencias".into(),
            encargo: "Revisa las dependencias".into(),
            cwd: "C:\\proyectos\\Adeorq".into(),
            cuando,
            activo: true,
            creado: 1_000,
            ultima: 0,
            ultimo_dia: String::new(),
            corrida: None,
            ultimas: Vec::new(),
            fallos_seguidos: 0,
            cortado: None,
        }
    }

    fn los_lunes_a_las_9() -> Cuando {
        Cuando::Semanal { dias: vec![1], hora: "09:00".into() }
    }

    /// Unas puertas de mentira que apuntan lo que se les pide.
    #[derive(Default)]
    struct Falsas {
        /// Lo que contesta `abrir`: el número del panel, o el error.
        nace: Option<u32>,
        visto: std::collections::HashMap<u32, Visto>,
        abiertas: Vec<String>,
        cerradas: Vec<u32>,
        cortes: Vec<String>,
        /// La carpeta, para comprobar qué había en disco al pedir el panel.
        dir: Option<PathBuf>,
        dia_en_disco_al_abrir: Vec<String>,
    }

    impl Puertas for Falsas {
        fn abrir(&mut self, e: &Encargo) -> Result<u32, String> {
            self.abiertas.push(e.id.clone());
            if let Some(d) = &self.dir {
                let en_disco = leer(d).unwrap().into_iter().find(|x| x.id == e.id).map(|x| x.ultimo_dia).unwrap_or_default();
                self.dia_en_disco_al_abrir.push(en_disco);
            }
            self.nace.ok_or_else(|| "la ventana de Adeorq no contestó a tiempo".to_string())
        }
        fn mirar(&mut self, panel: u32) -> Visto {
            self.visto.get(&panel).copied().unwrap_or(Visto::NoSeSabe)
        }
        fn cerrar(&mut self, panel: u32) {
            self.cerradas.push(panel);
        }
        fn cortado(&mut self, e: &Encargo) {
            self.cortes.push(e.id.clone());
        }
    }

    #[test]
    fn un_pedido_mal_hecho_dice_que_arreglar() {
        let bueno = Pedido { id: None, nombre: "  ".into(), encargo: " Revisa las dependencias\ny dime ".into(), cwd: " C:\\p ".into(), cuando: Cuando::Semanal { dias: vec![7, 1, 1, 9], hora: "9:05".into() } };
        let (nombre, encargo, cwd, cuando) = validar(&bueno).unwrap();
        assert_eq!(nombre, "Revisa las dependencias", "sin nombre, lleva el principio del encargo");
        assert_eq!(encargo, "Revisa las dependencias\ny dime");
        assert_eq!(cwd, "C:\\p");
        assert_eq!(cuando, Cuando::Semanal { dias: vec![1, 7], hora: "09:05".into() }, "días ordenados y sin repetir, hora con dos cifras");

        let con = |f: &dyn Fn(&mut Pedido)| {
            let mut p = bueno.clone();
            f(&mut p);
            validar(&p)
        };
        assert!(con(&|p| p.encargo = "  ".into()).is_err());
        assert!(con(&|p| p.cwd = "".into()).is_err());
        assert!(con(&|p| p.cuando = Cuando::Semanal { dias: vec![0, 8], hora: "09:00".into() }).is_err(), "sin ningún día que valga");
        for mala in ["24:00", "9", "09:60", "nueve", "09:5", "", "123:00"] {
            assert!(con(&|p| p.cuando = Cuando::Semanal { dias: vec![1], hora: mala.into() }).is_err(), "la hora {mala:?} no vale");
        }
        assert!(con(&|p| p.cuando = Cuando::Cada { horas: 0 }).is_err());
        assert!(con(&|p| p.cuando = Cuando::Cada { horas: 169 }).is_err());
        assert!(con(&|p| p.cuando = Cuando::Cada { horas: 168 }).is_ok());
    }

    #[test]
    fn toca_su_dia_desde_su_hora_y_una_sola_vez() {
        let mut e = encargo(los_lunes_a_las_9());
        assert!(!toca(&e, 0, &lunes(0, "08:59")), "antes de su hora, no");
        assert!(toca(&e, 0, &lunes(0, "09:00")));
        assert!(toca(&e, 0, &lunes(0, "11:30")), "encender el PC a las 11:30 lo lanza a las 11:30");
        let martes = Local { fecha: "2026-10-06".into(), dia: 2, minutos: 600 };
        assert!(!toca(&e, 0, &martes), "el martes ya no: no es su día");

        e.ultimo_dia = lunes(0, "09:00").fecha;
        assert!(!toca(&e, 0, &lunes(0, "18:00")), "el mismo día, una vez");
        assert!(toca(&e, 0, &lunes(3, "09:00")), "tres lunes después toca UNA vez, no tres");

        e.activo = false;
        assert!(!toca(&e, 0, &lunes(3, "09:00")), "apagado no se lanza");
        e.activo = true;
        e.cortado = Some(Corte { cuando: 1, motivo: "x".into() });
        assert!(!toca(&e, 0, &lunes(3, "09:00")), "cortado tampoco");
    }

    #[test]
    fn cada_n_horas_cuenta_desde_la_ultima_y_no_nace_lanzandose() {
        let mut e = encargo(Cuando::Cada { horas: 6 });
        let l = lunes(0, "10:00");
        assert!(!toca(&e, e.creado + 5 * HORA_MS, &l), "recién creado espera sus seis horas");
        assert!(toca(&e, e.creado + 6 * HORA_MS, &l));
        e.ultima = e.creado + 6 * HORA_MS;
        assert!(!toca(&e, e.ultima + HORA_MS, &l));
        assert!(toca(&e, e.ultima + 40 * HORA_MS, &l), "tras dos días apagado, una vez");
    }

    #[test]
    fn guardar_un_horario_cuya_hora_ya_paso_no_lo_lanza_en_el_acto() {
        assert!(ya_paso_hoy(&los_lunes_a_las_9(), &lunes(0, "10:00")));
        assert!(!ya_paso_hoy(&los_lunes_a_las_9(), &lunes(0, "08:00")));
        assert!(!ya_paso_hoy(&Cuando::Cada { horas: 1 }, &lunes(0, "10:00")));
    }

    #[test]
    fn al_tercer_fallo_seguido_se_corta_y_el_cuarto_lunes_no_abre() {
        let d = dir();
        guardar(&d, &[encargo(los_lunes_a_las_9())]).unwrap();
        let mut p = Falsas::default();
        for s in 0..3 {
            assert!(vuelta(&d, 10_000 + u64::from(s), &lunes(s, "09:00"), 7, &mut p).unwrap());
        }
        let e = leer(&d).unwrap().remove(0);
        assert_eq!(p.abiertas.len(), 3, "lo intentó los tres lunes");
        assert_eq!(e.fallos_seguidos, 3);
        assert!(e.cortado.is_some(), "al tercero, cortado");
        assert_eq!(p.cortes, vec!["p1"], "y avisa UNA vez");
        assert!(e.ultimas.iter().all(|u| u.resultado == Resultado::Fallo && u.detalle.starts_with("no nació")));

        assert!(!vuelta(&d, 20_000, &lunes(3, "09:00"), 7, &mut p).unwrap(), "el cuarto lunes no cambia nada");
        assert_eq!(p.abiertas.len(), 3, "ni abre");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn el_turno_se_gasta_en_disco_antes_de_pedir_la_terminal() {
        let d = dir();
        guardar(&d, &[encargo(los_lunes_a_las_9())]).unwrap();
        let mut p = Falsas { nace: Some(4), dir: Some(d.clone()), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();
        assert_eq!(p.dia_en_disco_al_abrir, vec![lunes(0, "09:00").fecha], "al pedir el panel, el día ya estaba escrito");
        let e = leer(&d).unwrap().remove(0);
        assert_eq!(e.corrida, Some(Corrida { inicio: 10_000, panel: 4, arranque: 7, juzgada: false }));
        assert!(!vuelta(&d, 10_030, &lunes(0, "09:01"), 7, &mut p).unwrap(), "la vuelta siguiente no la lanza otra vez");
        assert_eq!(p.abiertas.len(), 1);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn terminar_pone_el_contador_a_cero_y_su_terminal_se_cierra_al_nacer_la_siguiente() {
        let d = dir();
        let mut e = encargo(los_lunes_a_las_9());
        e.fallos_seguidos = 2;
        guardar(&d, &[e]).unwrap();
        let mut p = Falsas { nace: Some(4), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();
        p.visto.insert(4, Visto::Trabaja);
        assert!(!vuelta(&d, 10_030, &lunes(0, "09:01"), 7, &mut p).unwrap(), "mientras trabaja no se apunta nada");
        p.visto.insert(4, Visto::Termino);
        assert!(vuelta(&d, 10_060, &lunes(0, "09:20"), 7, &mut p).unwrap());
        let e = leer(&d).unwrap().remove(0);
        assert_eq!(e.fallos_seguidos, 0, "un «hecho» borra los fallos de antes");
        assert_eq!(e.ultimas[0].resultado, Resultado::Hecho);
        assert!(e.corrida.as_ref().is_some_and(|c| c.juzgada), "juzgada, pero se recuerda su terminal");
        assert!(p.cerradas.is_empty(), "y sigue abierta para que la leas");

        p.nace = Some(9);
        vuelta(&d, 20_000, &lunes(1, "09:00"), 7, &mut p).unwrap();
        assert_eq!(p.cerradas, vec![4], "al nacer la del lunes siguiente se cierra la anterior");
        assert_eq!(leer(&d).unwrap()[0].corrida.as_ref().map(|c| c.panel), Some(9));
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn si_seguiste_hablando_con_la_anterior_no_se_te_cierra() {
        let d = dir();
        guardar(&d, &[encargo(los_lunes_a_las_9())]).unwrap();
        let mut p = Falsas { nace: Some(4), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();
        p.visto.insert(4, Visto::Termino);
        vuelta(&d, 10_060, &lunes(0, "09:20"), 7, &mut p).unwrap();
        // Durante la semana le escribes tú, y el lunes está trabajando.
        p.visto.insert(4, Visto::Trabaja);
        p.nace = Some(9);
        vuelta(&d, 20_000, &lunes(1, "09:00"), 7, &mut p).unwrap();
        assert!(p.cerradas.is_empty(), "una terminal donde se sigue trabajando no se cierra sola");
        assert_eq!(p.abiertas.len(), 2, "y la nueva nace igual");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn lo_que_no_es_culpa_del_encargo_no_cuenta_para_el_freno() {
        let d = dir();
        guardar(&d, &[encargo(los_lunes_a_las_9())]).unwrap();
        let mut p = Falsas { nace: Some(4), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();
        p.visto.insert(4, Visto::CerradaAMano);
        vuelta(&d, 10_030, &lunes(0, "09:05"), 7, &mut p).unwrap();
        let e = leer(&d).unwrap().remove(0);
        assert_eq!((e.ultimas[0].resultado, e.fallos_seguidos, e.corrida.is_none()), (Resultado::Saltado, 0, true), "cerrada desde Adeorq");

        // La semana siguiente nace otra, y Adeorq se cierra con ella abierta.
        p.nace = Some(5);
        vuelta(&d, 20_000, &lunes(1, "09:00"), 7, &mut p).unwrap();
        vuelta(&d, 30_000, &lunes(1, "12:00"), 8, &mut p).unwrap();
        let e = leer(&d).unwrap().remove(0);
        assert_eq!((e.ultimas[0].resultado, e.fallos_seguidos, e.corrida.is_none()), (Resultado::Saltado, 0, true), "Adeorq se cerró a mitad");
        assert!(e.ultimas[0].detalle.contains("Adeorq se cerró"));

        // Y una que se muere sola sí cuenta.
        p.nace = Some(6);
        vuelta(&d, 40_000, &lunes(2, "09:00"), 8, &mut p).unwrap();
        p.visto.insert(6, Visto::SeCerro);
        vuelta(&d, 40_030, &lunes(2, "09:01"), 8, &mut p).unwrap();
        assert_eq!(leer(&d).unwrap()[0].fallos_seguidos, 1);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn con_la_anterior_abierta_no_se_lanza_otra_encima() {
        let d = dir();
        guardar(&d, &[encargo(los_lunes_a_las_9())]).unwrap();
        let mut p = Falsas { nace: Some(4), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();

        p.visto.insert(4, Visto::Trabaja);
        vuelta(&d, 20_000, &lunes(1, "09:00"), 7, &mut p).unwrap();
        let e = leer(&d).unwrap().remove(0);
        assert_eq!((e.ultimas[0].resultado, e.fallos_seguidos), (Resultado::Saltado, 0), "si trabaja, se salta");
        assert_eq!(p.abiertas.len(), 1);

        p.visto.insert(4, Visto::Espera);
        vuelta(&d, 30_000, &lunes(2, "09:00"), 7, &mut p).unwrap();
        let e = leer(&d).unwrap().remove(0);
        assert_eq!((e.ultimas[0].resultado, e.fallos_seguidos), (Resultado::Fallo, 1), "una semana esperándote es un fallo");
        assert!(e.corrida.is_some(), "y se sigue mirando: si le contestas y termina, cuenta");
        assert_eq!(p.abiertas.len(), 1, "sin abrir otra");

        p.visto.insert(4, Visto::Termino);
        vuelta(&d, 30_030, &lunes(2, "09:30"), 7, &mut p).unwrap();
        assert_eq!(leer(&d).unwrap()[0].fallos_seguidos, 0);

        // De la que nunca se supo nada: fallo, y se suelta para que nazca otra.
        let mut q = Falsas { nace: Some(8), ..Default::default() };
        let d2 = dir();
        guardar(&d2, &[encargo(los_lunes_a_las_9())]).unwrap();
        vuelta(&d2, 10_000, &lunes(0, "09:00"), 7, &mut q).unwrap();
        vuelta(&d2, 20_000, &lunes(1, "09:00"), 7, &mut q).unwrap();
        let e = leer(&d2).unwrap().remove(0);
        assert_eq!((e.ultimas[0].resultado, e.corrida.is_none(), q.abiertas.len()), (Resultado::Fallo, true, 1));
        vuelta(&d2, 30_000, &lunes(2, "09:00"), 7, &mut q).unwrap();
        assert_eq!(q.abiertas.len(), 2, "la vez siguiente ya puede nacer una nueva");
        std::fs::remove_dir_all(&d).ok();
        std::fs::remove_dir_all(&d2).ok();
    }

    #[test]
    fn dos_que_tocan_a_la_vez_nacen_en_vueltas_distintas() {
        let d = dir();
        let mut otro = encargo(los_lunes_a_las_9());
        otro.id = "p2".into();
        guardar(&d, &[encargo(los_lunes_a_las_9()), otro]).unwrap();
        let mut p = Falsas { nace: Some(4), ..Default::default() };
        vuelta(&d, 10_000, &lunes(0, "09:00"), 7, &mut p).unwrap();
        assert_eq!(p.abiertas, vec!["p1"], "una apertura por vuelta");
        p.nace = Some(5);
        vuelta(&d, 10_030, &lunes(0, "09:00"), 7, &mut p).unwrap();
        assert_eq!(p.abiertas, vec!["p1", "p2"]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn un_archivo_roto_no_se_da_por_vacio_ni_se_pisa() {
        let d = dir();
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(archivo(&d), b"{ esto no es json").unwrap();
        assert!(leer(&d).is_err());
        let mut p = Falsas::default();
        assert!(vuelta(&d, 1, &lunes(0, "09:00"), 7, &mut p).is_err());
        assert_eq!(std::fs::read(archivo(&d)).unwrap(), b"{ esto no es json", "sigue como estaba");
        assert!(leer(&dir()).unwrap().is_empty(), "y sin archivo, lista vacía");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn el_archivo_se_escribe_con_la_forma_que_lee_la_pantalla() {
        let mut e = encargo(los_lunes_a_las_9());
        e.cortado = Some(Corte { cuando: 5, motivo: "x".into() });
        e.fallos_seguidos = 3;
        let j = serde_json::to_value(&e).unwrap();
        assert_eq!(j["cuando"], serde_json::json!({ "tipo": "semanal", "dias": [1], "hora": "09:00" }));
        assert_eq!(j["fallosSeguidos"], 3);
        assert_eq!(j["ultimoDia"], "");
        assert_eq!(serde_json::to_value(Cuando::Cada { horas: 6 }).unwrap(), serde_json::json!({ "tipo": "cada", "horas": 6 }));
        assert_eq!(serde_json::to_value(Resultado::Saltado).unwrap(), "saltado");
        // Y uno escrito por una versión anterior, sin los campos nuevos, entra.
        let viejo = r#"{"id":"p1","nombre":"n","encargo":"e","cwd":"c","cuando":{"tipo":"cada","horas":2},"activo":true,"creado":1}"#;
        assert!(serde_json::from_str::<Encargo>(viejo).is_ok());
    }
}
