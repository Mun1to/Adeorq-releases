// Pedir un token sin que pase por el agente.
//
// Un agente que necesita una clave no puede leerla: lo que lee queda en su
// transcript, que es un fichero en disco, y además vuelve al modelo en la
// vuelta siguiente. Hasta hoy la salida era abrir un bloc de notas y dejar un
// `token-loquesea.txt` en la carpeta del proyecto, que es exactamente lo que no
// debe existir (Munir, 2026-08-30: «me abren bloc de notas cuando se lo pido,
// después de tres veces peleándome con él»).
//
// Ahora el agente escribe una línea y ya:
//
//     adeorq secreto supabase --env SUPABASE_ACCESS_TOKEN -- supabase projects list
//
// `adeorq secreto` habla con la app por el mismo puerto que el MCP. Si el
// secreto no está guardado, se abre una ventana en Adeorq donde se pega, y el
// puente lanza el comando con la clave en su entorno y la salida tapada. El
// puente NO escribe la clave nunca, ni a una consola ni a una tubería: hasta el
// 2026-10-31 la escribía si su salida no era una consola, y `| cat` la sacaba.
//
// Para accidentes y lectura casual, no para un agente decidido: el comando lo
// elige él. Lo que protege y lo que no, en `docs/contexto/secretos.md`.
//
// Guardado va donde ya van los demás (`secrets.rs`): Gestor de Credenciales en
// Windows, fichero con permisos 600 en Linux. Aquí solo vive la ESPERA.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::Emitter;

/// Cuánto se espera a que alguien pegue el secreto antes de rendirse. Cinco
/// minutos es de sobra para ir a por el token y volver, y poco para que un
/// comando olvidado se quede colgado toda la noche.
const ESPERA: Duration = Duration::from_secs(300);

/// El prefijo con el que estos secretos viven en el almacén, para no chocar con
/// las claves de API de los proveedores (`api:claude` y compañía).
pub(crate) const ESPACIO: &str = "agente:";

/// Las peticiones que están esperando respuesta, por nombre de secreto.
fn esperando() -> &'static Mutex<HashMap<String, Sender<Option<String>>>> {
    static M: OnceLock<Mutex<HashMap<String, Sender<Option<String>>>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Un nombre de secreto válido: letras, números, guion y guion bajo.
///
/// Se valida porque acaba formando el nombre de una credencial de Windows y
/// llega de fuera, de la línea que escribe un agente. Ver `secrets.rs`, que hace
/// lo mismo por el mismo motivo.
fn nombre_valido(nombre: &str) -> bool {
    !nombre.is_empty()
        && nombre.len() <= 64
        && nombre
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Quién pide una clave: una terminal de Adeorq (con su contraseña, o una de
/// antes de que las hubiera) o algo de fuera de Adeorq.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QuienPide {
    Terminal(u32),
    Fuera,
}

/// Qué quiere quien pide: el valor (para lanzar un comando con él) o solo que
/// quede guardada, y si pide una NUEVA aunque ya haya una con ese nombre.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pide {
    pub valor: bool,
    pub nueva: bool,
}

impl Default for Pide {
    /// Lo que manda un `adeorq` de antes de esto: el valor, sin más.
    fn default() -> Self {
        Pide { valor: true, nueva: false }
    }
}

/// Lo que toca hacer con una petición. Separado de `atender` para poder
/// probarlo sin ventana.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Paso {
    /// Darla sin preguntar.
    Dar,
    /// Ya está guardada y no se pedía el valor: nada que hacer, ni ventana.
    YaGuardada,
    /// Guardada, pero la pide algo de fuera de Adeorq: «¿dársela esta vez?».
    PreguntarSiDar,
    /// La ventana de pegarla. `reemplaza`: ya había una con ese nombre.
    Pegar { reemplaza: bool },
    /// No está, pero hay guardadas con un nombre parecido: se le dice al agente
    /// en vez de pedirle a Munir que pegue otra vez lo que ya dio.
    Parecidas(Vec<String>),
}

fn decidir(guardada: bool, muerta: bool, quien: QuienPide, pide: Pide, parecidas: Vec<String>) -> Paso {
    if guardada && !pide.nueva && !muerta {
        return match (pide.valor, quien) {
            (false, _) => Paso::YaGuardada,
            (true, QuienPide::Fuera) => Paso::PreguntarSiDar,
            (true, QuienPide::Terminal(_)) => Paso::Dar,
        };
    }
    if !guardada && !pide.nueva && !parecidas.is_empty() {
        return Paso::Parecidas(parecidas);
    }
    Paso::Pegar { reemplaza: guardada }
}

/// Las claves guardadas cuyo nombre se parece al que se pide: el mismo nombre
/// con otras mayúsculas o separadores, uno dentro del otro, el mismo servicio
/// delante (`stripe-prueba` y `stripe-orquio-prueba`, medido el 2026-10-29: se
/// pegó la misma clave dos veces) o una errata de una o dos letras.
fn parecidas(pedido: &str, guardadas: &[String]) -> Vec<String> {
    let plano = |s: &str| s.to_ascii_lowercase().replace('_', "-");
    let p = plano(pedido);
    let servicio = |s: &str| s.split('-').next().unwrap_or_default().to_string();
    guardadas
        .iter()
        .filter(|g| {
            let g = plano(g);
            g != p
                && (g.contains(&p) || p.contains(&g) || (servicio(&g).len() >= 3 && servicio(&g) == servicio(&p)) || distancia(&g, &p) <= 2)
        })
        .cloned()
        .collect()
}

/// Cuántas letras hay que cambiar, quitar o poner para ir de una a otra.
fn distancia(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut fila: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut antes = fila[0];
        fila[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let arriba = fila[j + 1];
            fila[j + 1] = (antes + usize::from(ca != cb)).min(fila[j] + 1).min(arriba + 1);
            antes = arriba;
        }
    }
    fila[b.len()]
}

/// Lo que hace la app cuando un agente pide un secreto (decisión A1 de Munir,
/// 2026-11-03: «las terminales de Adeorq sin preguntar, y cualquier otro
/// programa con un clic tuyo»).
///
/// Si ya está guardado y lo pide una terminal de Adeorq, se devuelve sin
/// molestar a nadie. Si lo pide algo de fuera, la ventana pregunta antes
/// («dársela esta vez / no»). Si no está guardado, se abre la ventana para
/// pegarlo, que ya es un clic de Munir. Cada entrega se apunta, sin el valor.
///
/// Desde el 2026-11-06 (D1 de «Claves que duran»): quien solo quiere que quede
/// guardada (`adeorq secreto x "para qué"`, sin comando) no recibe el valor ni
/// saca ventana si ya está (`Ok(None)`); antes se le mandaba el valor para
/// nada y, desde fuera de Adeorq, salía «Dársela esta vez» por cada uno. Y un
/// nombre que no está pero se parece a uno guardado no abre la ventana de pegar:
/// se le dice al agente cuál tiene, salvo que pida `nueva`.
pub fn atender(app: &tauri::AppHandle, nombre: &str, motivo: &str, quien: QuienPide, pide: Pide) -> Result<Option<String>, String> {
    if !nombre_valido(nombre) {
        return Err(
            "el nombre solo puede llevar letras, números, guion y guion bajo (64 como mucho)"
                .into(),
        );
    }
    let clave = format!("{ESPACIO}{nombre}");
    let guardada = crate::secrets::get(&clave);
    let de_fuera = quien == QuienPide::Fuera;
    let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let muerta = crate::claves_caducan::estado(nombre).is_some_and(|e| e.muerta(ahora));
    let parecidas_guardadas = if guardada.is_none() { parecidas(nombre, &leer_indice()) } else { Vec::new() };

    let reemplaza = match decidir(guardada.is_some(), muerta, quien, pide, parecidas_guardadas.clone()) {
        Paso::Dar => {
            apuntar_uso(nombre, quien);
            return Ok(guardada);
        }
        Paso::YaGuardada => return Ok(None),
        Paso::Parecidas(v) => {
            return Err(format!(
                "no hay ninguna clave «{nombre}». Guardadas con un nombre parecido: {}.\n\
                 Si es una de esas, usa ese nombre (`adeorq secreto --lista` las enseña todas).\n\
                 Si de verdad es otra clave, repite con --nueva y Adeorq se la pedirá a Munir.",
                v.join(", ")
            ));
        }
        Paso::PreguntarSiDar => false,
        Paso::Pegar { reemplaza } => reemplaza,
    };
    // Lo que se responde en la ventana: dársela (la guardada) o pegar una.
    let guardada = if reemplaza { None } else { guardada };

    let (tx, rx) = channel();
    {
        let mut mapa = esperando().lock().map_err(|_| "el buzón está roto")?;
        // Dos peticiones del mismo secreto a la vez: la segunda se rinde en vez
        // de abrir otra ventana encima. Pedir dos veces lo mismo es un bucle,
        // no una necesidad.
        if mapa.contains_key(nombre) {
            return Err(format!("ya hay una ventana abierta pidiendo «{nombre}»"));
        }
        mapa.insert(nombre.to_string(), tx);
    }

    // `deFuera`: la ventana dice que lo pide un programa de fuera de Adeorq.
    // `guardada`: entonces no hay nada que pegar, solo dársela o no.
    // `reemplaza`: ya había una con ese nombre (caducada, o el agente pide otra).
    // `parecidas`: guardadas con un nombre parecido, para no pegar dos veces la misma.
    let aviso = app.emit(
        "secreto-pedido",
        serde_json::json!({
            "nombre": nombre,
            "motivo": motivo,
            "deFuera": de_fuera,
            "guardada": guardada.is_some(),
            "reemplaza": reemplaza,
            "muerta": muerta,
            "parecidas": parecidas_guardadas,
        }),
    );
    if aviso.is_err() {
        esperando().lock().ok().map(|mut m| m.remove(nombre));
        return Err("no se pudo abrir la ventana para pegarlo".into());
    }

    let respuesta = rx.recv_timeout(ESPERA);
    esperando().lock().ok().map(|mut m| m.remove(nombre));

    match respuesta {
        // Solo guardarla: lo pegado se quedó en el almacén y no vuelve a nadie.
        Ok(Some(_)) if !pide.valor => Ok(None),
        Ok(Some(valor)) => {
            apuntar_uso(nombre, quien);
            Ok(Some(valor))
        }
        Ok(None) if guardada.is_some() => Err("no se la has dado".into()),
        Ok(None) => Err("lo has cancelado".into()),
        Err(_) => Err("nadie contestó a tiempo".into()),
    }
}

/// El front, cuando Munir contesta a un programa de fuera de Adeorq que pide
/// una clave ya guardada: dársela esta vez o no. El valor no pasa por el front:
/// se lee aquí del almacén.
#[tauri::command(async)]
pub fn secreto_permitir(nombre: String, dar: bool) -> Result<(), String> {
    if !nombre_valido(&nombre) {
        return Err("nombre no válido".into());
    }
    let valor = if dar { crate::secrets::get(&format!("{ESPACIO}{nombre}")) } else { None };
    let tx = esperando().lock().map_err(|_| "el buzón está roto")?.remove(&nombre);
    match tx {
        Some(tx) => {
            let _ = tx.send(valor);
            Ok(())
        }
        None => Err(format!("ya no había nadie esperando «{nombre}»")),
    }
}

/// La última vez que se entregó cada clave y a quién, para Ajustes («la usó la
/// terminal 4 hace 3 minutos»). Solo el nombre, cuándo y quién: el valor no.
#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Uso {
    /// Epoch en segundos.
    pub cuando: u64,
    /// El número de la terminal, o `None` si fue un programa de fuera de Adeorq.
    pub terminal: Option<u32>,
}

fn ruta_usos() -> Result<std::path::PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("secretos-de-agente-usos.json"))
}

fn leer_usos() -> HashMap<String, Uso> {
    ruta_usos()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn apuntar_uso(nombre: &str, quien: QuienPide) {
    static CERROJO: Mutex<()> = Mutex::new(());
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    let terminal = match quien {
        QuienPide::Terminal(n) => Some(n),
        QuienPide::Fuera => None,
    };
    crate::anotar(&match terminal {
        Some(n) => format!("Clave de agente «{nombre}» entregada a la terminal {n}."),
        None => format!("Clave de agente «{nombre}» entregada a un programa de fuera de Adeorq, con tu permiso."),
    });
    let mut usos = leer_usos();
    let cuando = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    usos.insert(nombre.to_string(), Uso { cuando, terminal });
    if let (Ok(p), Ok(txt)) = (ruta_usos(), serde_json::to_string(&usos)) {
        let _ = std::fs::write(p, txt);
    }
}

/// El front, cuando alguien pega el secreto o cierra la ventana.
///
/// `guardar` decide si queda en el almacén para la próxima vez o si vale solo
/// para este comando: un token de una tarde no tiene por qué quedarse a vivir.
#[tauri::command(async)]
pub fn secreto_responder(app: tauri::AppHandle, nombre: String, valor: Option<String>, guardar: bool) -> Result<(), String> {
    if !nombre_valido(&nombre) {
        return Err("nombre no válido".into());
    }
    if let (Some(v), true) = (valor.as_ref(), guardar) {
        crate::secrets::put(&format!("{ESPACIO}{nombre}"), v)?;
        apuntar(&nombre);
        // Al guardarla se le pregunta al servicio cuándo caduca, si lo dice.
        crate::claves_caducan::recien_guardada(&app, &nombre);
    }
    let tx = {
        let mut mapa = esperando().lock().map_err(|_| "el buzón está roto")?;
        mapa.remove(&nombre)
    };
    match tx {
        // El error de envío se traga a propósito: significa que el que
        // esperaba ya se cansó, y eso no es culpa de quien acaba de pegar.
        Some(tx) => {
            let _ = tx.send(valor);
            Ok(())
        }
        None => Err(format!("ya no había nadie esperando «{nombre}»")),
    }
}

/// El índice de nombres guardados.
///
/// El almacén de secretos sabe guardar, leer y olvidar, pero no ENUMERAR, y sin
/// enumerar un token guardado se queda ahí para siempre sin forma de verlo ni de
/// borrarlo. Se lleva aparte, en un fichero de la carpeta de datos, y solo con
/// los NOMBRES: el valor sigue viviendo únicamente en el almacén cifrado.
fn indice() -> Result<std::path::PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("secretos-de-agente.json"))
}

fn leer_indice() -> Vec<String> {
    let Ok(p) = indice() else { return Vec::new() };
    let Ok(txt) = std::fs::read_to_string(p) else { return Vec::new() };
    serde_json::from_str(&txt).unwrap_or_default()
}

fn escribir_indice(nombres: &[String]) {
    if let Ok(p) = indice() {
        if let Ok(txt) = serde_json::to_string(nombres) {
            let _ = std::fs::write(p, txt);
        }
    }
}

fn apuntar(nombre: &str) {
    let mut v = leer_indice();
    if !v.iter().any(|x| x == nombre) {
        v.push(nombre.to_string());
        v.sort();
        escribir_indice(&v);
    }
}

/// Los nombres guardados, para quien comprueba si caducan (`claves_caducan.rs`).
pub(crate) fn nombres_guardados() -> Vec<String> {
    leer_indice()
}

/// Un secreto de agente guardado, como lo enseña Ajustes.
#[derive(Clone, Debug, serde::Serialize)]
pub struct SecretoDeAgente {
    pub nombre: String,
    pub uso: Option<Uso>,
    /// Si vale y cuándo caduca, si su servicio lo dice. Sin el valor.
    pub caducidad: Option<crate::claves_caducan::Estado>,
}

/// Los secretos de agente que ya están guardados, para poder verlos y borrarlos
/// desde Ajustes, con la última vez que se entregaron. Solo los NOMBRES: el
/// valor no vuelve nunca al front.
#[tauri::command(async)]
pub fn secretos_de_agente() -> Vec<SecretoDeAgente> {
    let usos = leer_usos();
    let mut caducidad = crate::claves_caducan::leer();
    leer_indice()
        .into_iter()
        .map(|nombre| SecretoDeAgente { uso: usos.get(&nombre).cloned(), caducidad: caducidad.remove(&nombre), nombre })
        .collect()
}

/// Los nombres guardados, para `adeorq secreto --lista`: que un agente vea qué
/// claves hay antes de pedirle a Munir una que ya dio con otro nombre. Solo
/// nombres, servicio y fechas, lo mismo que hay en los ficheros de la carpeta de
/// datos: el valor no.
pub fn lista() -> serde_json::Value {
    let usos = leer_usos();
    let mut caducidad = crate::claves_caducan::leer();
    let claves: Vec<serde_json::Value> = leer_indice()
        .into_iter()
        .map(|nombre| {
            let c = caducidad.remove(&nombre).unwrap_or_default();
            serde_json::json!({
                "nombre": nombre,
                "servicio": c.servicio.map(crate::claves_caducan::Servicio::nombre),
                "caduca": c.caduca,
                "vale": c.vale,
                "usada": usos.get(&nombre).map(|u| u.cuando),
            })
        })
        .collect();
    serde_json::json!({ "claves": claves })
}

/// Olvidar uno.
#[tauri::command(async)]
pub fn secreto_de_agente_olvidar(nombre: String) -> Result<(), String> {
    if !nombre_valido(&nombre) {
        return Err("nombre no válido".into());
    }
    crate::secrets::forget(&format!("{ESPACIO}{nombre}"))?;
    let v: Vec<String> = leer_indice().into_iter().filter(|x| *x != nombre).collect();
    escribir_indice(&v);
    crate::claves_caducan::olvidar(&nombre);
    Ok(())
}

/// Cómo se usa, para quien lo escribe mal. Es lo que lee el agente.
const USO: &str = concat!(
    "Uso:\n",
    "    adeorq secreto --lista                                  las claves que ya hay (solo nombres)\n",
    "    adeorq secreto <nombre> \"<para qué>\"                    pedirla y guardarla\n",
    "    adeorq secreto <nombre> [--env VARIABLE] -- <comando> [args…]\n",
    "    adeorq secreto <nombre> --nueva \"<para qué>\"            pedir otra (la de antes ya no vale)\n\n",
    "La tercera forma lanza <comando> con la clave en la variable de entorno\n",
    "(por defecto el nombre en mayúsculas, con _ en vez de -), y en su salida la\n",
    "clave sale como ***. La clave no se escribe nunca en texto, ni por consola\n",
    "ni por tubería: si necesitas verla, no es para ti. `X=$(adeorq secreto x)`\n",
    "no da la clave: deja X vacía.\n\n",
    "Antes de pedir una clave nueva, mira --lista: si ya está con otro nombre, usa\n",
    "ese nombre y no le pidas a Munir que la pegue otra vez.\n\n",
    "Ejemplo:\n",
    "    adeorq secreto supabase --env SUPABASE_ACCESS_TOKEN -- supabase projects list"
);

/// Lo que se pidió en la línea de `adeorq secreto`.
#[derive(Debug, PartialEq)]
struct Peticion {
    nombre: String,
    motivo: String,
    /// `None`: solo pedirla y guardarla. `Some`: la variable y el comando.
    lanzar: Option<(String, Vec<String>)>,
    /// `--nueva`: pedir otra aunque haya una guardada con ese nombre.
    nueva: bool,
}

/// Una variable de entorno con forma de variable: la escribe el agente y
/// acaba en el entorno de otro programa.
fn variable_valida(v: &str) -> bool {
    let mut c = v.chars();
    matches!(c.next(), Some(p) if p.is_ascii_alphabetic() || p == '_')
        && c.all(|x| x.is_ascii_alphanumeric() || x == '_')
}

/// Leer `<nombre> [para qué…] [--env VAR] [-- comando args…]`.
fn leer_peticion(args: &[String]) -> Result<Peticion, String> {
    let (nombre, resto) = args.split_first().ok_or(USO)?;
    if nombre == "--" || nombre.starts_with("--") {
        return Err(USO.into());
    }
    let corte = resto.iter().position(|a| a == "--");
    let (antes, despues) = match corte {
        Some(i) => (&resto[..i], Some(&resto[i + 1..])),
        None => (resto, None),
    };
    let mut motivo = Vec::new();
    let mut variable = None;
    let mut nueva = false;
    let mut i = 0;
    while i < antes.len() {
        if antes[i] == "--nueva" {
            nueva = true;
            i += 1;
        } else if antes[i] == "--env" {
            let v = antes.get(i + 1).ok_or("a --env le falta el nombre de la variable")?;
            if !variable_valida(v) {
                return Err(format!("«{v}» no es un nombre de variable de entorno"));
            }
            variable = Some(v.clone());
            i += 2;
        } else {
            motivo.push(antes[i].as_str());
            i += 1;
        }
    }
    let lanzar = match despues {
        None if variable.is_some() => return Err(format!("a --env le falta el comando.\n\n{USO}")),
        None => None,
        Some([]) => return Err(format!("después de -- va el comando.\n\n{USO}")),
        Some(cmd) => {
            let v = variable.unwrap_or_else(|| nombre.to_ascii_uppercase().replace('-', "_"));
            if !variable_valida(&v) {
                return Err(format!("«{v}» no vale como variable: ponle --env VARIABLE"));
            }
            Some((v, cmd.to_vec()))
        }
    };
    Ok(Peticion { nombre: nombre.clone(), motivo: motivo.join(" "), lanzar, nueva })
}

/// Lo que corre cuando un agente escribe `adeorq secreto …`, en el proceso que
/// lanza el agente en su terminal. Devuelve el código de salida.
///
/// **La clave no sale nunca en texto**: ni por consola ni por tubería. O se
/// guarda y no se imprime nada, o va a la variable de entorno del comando que
/// se lanza, con la salida de ese comando pasada por `Tapador`.
///
/// Esto para los accidentes (un `echo`, un `--verbose`, un error que repite la
/// cabecera) y la lectura casual. No para a un agente decidido: el comando lo
/// elige él, y `-- sh -c 'echo $X | base64'` la saca. Ver `docs/contexto/secretos.md`.
pub fn principal(args: &[String]) -> i32 {
    if args.first().map(String::as_str) == Some("--lista") {
        return match crate::mcp::puerto().and_then(listar) {
            Ok(texto) => {
                // Por la salida normal: son nombres, y quien lo pide quiere leerlos.
                println!("{texto}");
                0
            }
            Err(e) => {
                eprintln!("{e}");
                1
            }
        };
    }
    let p = match leer_peticion(args) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{e}");
            return 2;
        }
    };
    let pide = Pide { valor: p.lanzar.is_some(), nueva: p.nueva };
    let valor = match crate::mcp::puerto().and_then(|puerto| traer(puerto, &p.nombre, &p.motivo, pide)) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let (variable, comando) = match p.lanzar {
        None => {
            eprintln!(
                "La clave «{}» está guardada. Úsala así, sin verla:\n\n    adeorq secreto {} --env VARIABLE -- <comando> [args…]\n\n\
                 (`X=$(adeorq secreto {})` no la da: X se queda vacía.)",
                p.nombre, p.nombre, p.nombre
            );
            return 0;
        }
        Some(l) => l,
    };
    // Un Adeorq de antes de esto puede contestar sin valor a quien sí lo pedía.
    let Some(valor) = valor.filter(|v| !v.is_empty()) else {
        eprintln!("la clave «{}» está vacía", p.nombre);
        return 1;
    };
    match lanzar(&valor, &variable, &comando, &mut std::io::stdout(), &mut std::io::stderr()) {
        Ok((codigo, cola)) => {
            if codigo != 0 {
                if let Some(senal) = parece_clave_rechazada(&cola) {
                    let veredicto = crate::mcp::puerto().ok().and_then(|puerto| avisar_fallo(puerto, &p.nombre).ok());
                    eprintln!("{}", tras_un_rechazo(&p.nombre, senal, veredicto.as_ref()));
                }
            }
            codigo
        }
        Err(e) => {
            eprintln!("{e}");
            127
        }
    }
}

/// Lo que dice la salida de un comando cuando el servicio rechazó la clave. En
/// minúsculas, y comparado con la salida en minúsculas.
const SENALES: &[&str] = &[
    "401 unauthorized",
    "http 401",
    "status 401",
    "status: 401",
    "status code 401",
    "error 401",
    "(401)",
    "\"code\":401",
    "\"status\":401",
    "token expired",
    "token has expired",
    "token is expired",
    "expired token",
    "jwt expired",
    "invalid api token",
    "invalid api key",
    "invalid_api_key",
    "api key not valid",
    "incorrect api key",
    "invalid access token",
    "invalid token",
    "invalid_token",
    "bad credentials",
    "authentication error",
    "authentication_error",
    "invalid authentication credentials",
    "unauthorized",
    "unauthenticated",
    "token caducado",
    "clave caducada",
    "no autorizado",
];

/// Si la salida de un comando que falló dice que el servicio rechazó la clave, la
/// señal que lo dice. Las líneas del propio `adeorq secreto` no cuentan: con dos
/// anidados, el de fuera leería el aviso del de dentro y culparía a su clave.
fn parece_clave_rechazada(salida: &str) -> Option<&'static str> {
    let propia = salida.lines().filter(|l| !l.contains("adeorq secreto")).collect::<Vec<_>>().join("\n").to_lowercase();
    SENALES.iter().copied().find(|s| propia.contains(s))
}

/// Lo que se le dice al agente cuando el comando falló con la clave rechazada:
/// que pare de probar y cómo pedir otra, o que la clave vale y el fallo es otro.
fn tras_un_rechazo(nombre: &str, senal: &str, veredicto: Option<&serde_json::Value>) -> String {
    let servicio = veredicto.and_then(|v| v["servicio"].as_str());
    let pedir = format!("    adeorq secreto {nombre} --nueva \"para qué la quieres\"");
    match (veredicto.and_then(|v| v["veredicto"].as_str()), servicio) {
        (Some("no_vale"), Some(s)) => format!(
            "\nadeorq secreto: la clave «{nombre}» ya no vale ({s} la rechaza: caducó o la borraron).\n\
             No sigas probando con ella. Pídele una nueva a Munir con:\n\n{pedir}\n\n\
             Adeorq ya le ha avisado de que dejó de valer."
        ),
        (Some("vale"), Some(s)) => format!(
            "\nadeorq secreto: el comando falló con «{senal}», pero {s} dice que la clave «{nombre}» sigue valiendo.\n\
             El fallo viene de otra cosa (los permisos de la clave, otra cuenta, otra clave): no pidas una nueva por esto."
        ),
        _ => format!(
            "\nadeorq secreto: el comando falló con «{senal}». Si es la clave «{nombre}» la que no vale,\n\
             no sigas probando con la misma: pídele una nueva a Munir con:\n\n{pedir}"
        ),
    }
}

/// Lanzar el comando con la clave en `variable` y su salida tapada.
///
/// La entrada se hereda (un comando que pregunta sigue pudiendo preguntar); la
/// salida y los errores pasan por aquí, así que el hijo ya no ve una consola y
/// los programas que pintan en color lo pintarán en plano.
///
/// Devuelve el código del hijo y la cola de lo que escribió (ya tapada), para
/// saber si falló porque el servicio rechazó la clave.
fn lanzar(
    valor: &str,
    variable: &str,
    comando: &[String],
    salida: &mut (dyn std::io::Write + Send),
    errores: &mut (dyn std::io::Write + Send),
) -> Result<(i32, String), String> {
    use std::process::{Command, Stdio};

    let programa = resolver(&comando[0]);
    let mut hijo = Command::new(&programa)
        .args(&comando[1..])
        .env(variable, valor)
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo lanzar «{}»: {e}", comando[0]))?;
    let mut su_salida = hijo.stdout.take().ok_or("sin salida del comando")?;
    let mut sus_errores = hijo.stderr.take().ok_or("sin errores del comando")?;
    let (cola_salida, cola_errores) = std::thread::scope(|s| {
        let h = s.spawn(|| Tapador::new(valor).copiar(&mut sus_errores, errores));
        let a = Tapador::new(valor).copiar(&mut su_salida, salida);
        (a, h.join().unwrap_or_default())
    });
    let estado = hijo.wait().map_err(|e| e.to_string())?;
    let cola = format!("{}\n{}", String::from_utf8_lossy(&cola_salida), String::from_utf8_lossy(&cola_errores));
    Ok((estado.code().unwrap_or(1), cola))
}

/// Cuánto se guarda del final de cada salida para mirar si la clave se rechazó.
const COLA: usize = 8 * 1024;

/// En Windows, `Command` solo busca `<programa>.exe` en el `PATH`, y la mitad de
/// las herramientas que lanza un agente (`supabase`, `wrangler`, `vercel`, todo
/// lo que instala npm) son un `.cmd`. Se busca como lo haría la consola.
#[cfg(windows)]
fn resolver(programa: &str) -> std::ffi::OsString {
    let p = std::path::Path::new(programa);
    if p.extension().is_some() || p.components().count() > 1 {
        return programa.into();
    }
    let extensiones = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        for ext in extensiones.split(';').filter(|e| !e.is_empty()) {
            let candidato = dir.join(format!("{programa}{ext}"));
            if candidato.is_file() {
                return candidato.into_os_string();
            }
        }
    }
    programa.into()
}

/// En Linux y macOS `Command` ya busca en el `PATH` como la shell.
#[cfg(not(windows))]
fn resolver(programa: &str) -> std::ffi::OsString {
    programa.into()
}

/// El filtro de la salida del hijo: cambia la clave por `***`, como hace
/// GitHub Actions con sus secretos.
///
/// Trabaja por trozos según llegan, y la clave puede venir partida entre dos.
/// Por eso se queda solo con la cola que PODRÍA ser el principio de la clave, y
/// suelta todo lo demás en el acto: una pregunta como `¿Seguro? [s/N] ` se ve
/// enseguida, no cuando el programa escriba algo más.
struct Tapador {
    clave: Vec<u8>,
    pendiente: Vec<u8>,
}

impl Tapador {
    fn new(clave: &str) -> Self {
        Self { clave: clave.as_bytes().to_vec(), pendiente: Vec::new() }
    }

    fn empujar(&mut self, datos: &[u8]) -> Vec<u8> {
        if self.clave.is_empty() {
            return datos.to_vec();
        }
        self.pendiente.extend_from_slice(datos);
        let buf = std::mem::take(&mut self.pendiente);
        let mut fuera = Vec::with_capacity(buf.len());
        let mut i = 0;
        while i < buf.len() {
            let resto = &buf[i..];
            if resto.starts_with(&self.clave) {
                fuera.extend_from_slice(b"***");
                i += self.clave.len();
            } else if self.clave.starts_with(resto) {
                self.pendiente = resto.to_vec();
                break;
            } else {
                fuera.push(buf[i]);
                i += 1;
            }
        }
        fuera
    }

    fn terminar(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.pendiente)
    }

    /// Copiar de `origen` a `destino` tapando, hasta que el hijo cierre.
    /// Devuelve los últimos `COLA` bytes de lo que salió, ya tapados.
    fn copiar(mut self, origen: &mut dyn std::io::Read, destino: &mut (dyn std::io::Write + Send)) -> Vec<u8> {
        let mut trozo = [0u8; 8192];
        let mut cola: Vec<u8> = Vec::new();
        let mut guardar = |b: &[u8]| {
            cola.extend_from_slice(b);
            if cola.len() > COLA {
                cola.drain(..cola.len() - COLA);
            }
        };
        loop {
            match origen.read(&mut trozo) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let limpio = self.empujar(&trozo[..n]);
                    // Si quien lee se ha ido, se sigue leyendo para que el hijo no
                    // se bloquee escribiendo en una tubería llena.
                    let _ = destino.write_all(&limpio).and_then(|_| destino.flush());
                    guardar(&limpio);
                }
            }
        }
        let resto = self.terminar();
        let _ = destino.write_all(&resto).and_then(|_| destino.flush());
        guardar(&resto);
        cola
    }
}

/// Traer el valor, hablando con la app por su puerto.
///
/// El puerto es un parámetro y no una constante para poder probar el protocolo
/// contra un servidor de mentira: en la máquina de trabajo el 3012 lo tiene la
/// Adeorq de verdad, así que sin esto no habría forma de probarlo.
/// Mandar una línea a la app y leer una de vuelta, con tope. Para lo que no
/// espera a ninguna persona: la lista y el aviso de que una clave falló.
fn una_pregunta(puerto: u16, peticion: &serde_json::Value, tope: std::time::Duration) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, BufReader, Write};
    let stream = std::net::TcpStream::connect(("127.0.0.1", puerto))
        .map_err(|_| "Adeorq no está abierto, o su puerto lo tiene otra ventana".to_string())?;
    let mut escritor = crate::clon_sin_herencia(&stream).map_err(|e| e.to_string())?;
    let mut lector = BufReader::new(stream);
    lector.get_ref().set_read_timeout(Some(tope)).map_err(|e| e.to_string())?;
    writeln!(escritor, "{peticion}").and_then(|_| escritor.flush()).map_err(|e| e.to_string())?;
    let mut linea = String::new();
    lector
        .read_line(&mut linea)
        .map_err(|_| "esta versión de Adeorq no sabe contestar a esto: actualízala".to_string())?;
    let v: serde_json::Value = serde_json::from_str(&linea).map_err(|_| "esta versión de Adeorq no sabe contestar a esto: actualízala".to_string())?;
    match v["error"].as_str() {
        Some(e) => Err(e.to_string()),
        None => Ok(v),
    }
}

/// `adeorq secreto --lista`: los nombres guardados, en texto para el agente.
fn listar(puerto: u16) -> Result<String, String> {
    let v = una_pregunta(puerto, &serde_json::json!({ "adeorq": "secretos" }), std::time::Duration::from_secs(5))?;
    Ok(texto_de_lista(&v, ahora()))
}

fn ahora() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Una fecha en segundos desde 1970 como `2026-12-06`, sin crates de fechas.
fn dia(seg: u64) -> String {
    // El inverso de `claves_caducan::leer_fecha` (algoritmo «civil_from_days»).
    let z = (seg / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

fn texto_de_lista(v: &serde_json::Value, ahora: u64) -> String {
    let claves = v["claves"].as_array().cloned().unwrap_or_default();
    if claves.is_empty() {
        return "No hay ninguna clave guardada todavía. Pídela con:\n    adeorq secreto <nombre> \"para qué\"".into();
    }
    let ancho = claves.iter().filter_map(|c| c["nombre"].as_str()).map(str::len).max().unwrap_or(0);
    let mut s = String::from("Claves guardadas (solo los nombres: el valor no sale nunca):\n");
    for c in &claves {
        let nombre = c["nombre"].as_str().unwrap_or_default();
        let mut nota = Vec::new();
        if let Some(sv) = c["servicio"].as_str() {
            nota.push(sv.to_string());
        }
        let caduca = c["caduca"].as_u64();
        match (c["vale"].as_bool(), caduca) {
            (Some(false), _) => nota.push("YA NO VALE: pide otra con --nueva".into()),
            (_, Some(t)) if t <= ahora => nota.push(format!("CADUCÓ el {}: pide otra con --nueva", dia(t))),
            (_, Some(t)) => nota.push(format!("caduca el {}", dia(t))),
            (Some(true), None) => nota.push("vale".into()),
            _ => {}
        }
        s.push_str(&format!("  {nombre:<ancho$}  {}\n", nota.join(" · ")));
    }
    s.push_str("\nÚsalas así, sin verlas:\n    adeorq secreto <nombre> --env VARIABLE -- <comando> [args…]");
    s
}

/// Avisar a la app de que un comando falló con la clave rechazada, y traer lo que
/// dice su servicio. Lo de la red lo hace la app: aquí no está la clave.
fn avisar_fallo(puerto: u16, nombre: &str) -> Result<serde_json::Value, String> {
    // Hasta tres preguntas de quince segundos a Cloudflare (un token de cuenta).
    una_pregunta(puerto, &serde_json::json!({ "adeorq": "secreto_no_vale", "nombre": nombre }), std::time::Duration::from_secs(50))
}

fn traer(puerto: u16, nombre: &str, motivo: &str, pide: Pide) -> Result<Option<String>, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;

    if !nombre_valido(nombre) {
        return Err("el nombre solo puede llevar letras, números, guion y guion bajo".into());
    }

    let stream = TcpStream::connect(("127.0.0.1", puerto))
        .map_err(|_| "Adeorq no está abierto, o su puerto lo tiene otra ventana".to_string())?;
    // Sin tope de tiempo en la lectura: al otro lado hay una persona buscando un
    // token, y los cinco minutos de espera los pone la app, no esto.
    let mut escritor = crate::clon_sin_herencia(&stream).map_err(|e| e.to_string())?;
    let mut lector = BufReader::new(stream);

    // Desde qué terminal de Adeorq se pide, con su contraseña: dentro de una, la
    // clave llega sin preguntar; desde fuera, Adeorq pregunta (decisión A1).
    // `solo_guardar`: sin comando no hace falta el valor, y no se pide. Un Adeorq
    // de antes no lo conoce y lo manda igual: entonces se tira.
    let mut peticion = serde_json::json!({
        "adeorq": "secreto",
        "nombre": nombre,
        "motivo": motivo,
        "solo_guardar": !pide.valor,
        "nueva": pide.nueva,
    });
    if let Some(id) = std::env::var("ADEORQ_PANE_ID").ok().and_then(|v| v.trim().parse::<u32>().ok()) {
        peticion["panel"] = serde_json::json!(id);
        if let Ok(c) = std::env::var(crate::pty::VARIABLE_CLAVE_DE_PANEL) {
            peticion["clave"] = serde_json::json!(c.trim());
        }
    }
    writeln!(escritor, "{peticion}").map_err(|e| e.to_string())?;
    escritor.flush().map_err(|e| e.to_string())?;

    // El acuse tiene tope corto: dice si al otro lado hay una Adeorq que sabe de
    // esto. Un Adeorq viejo sirviendo el puerto se queda callado, y sin este
    // tope quien pregunta se colgaba para siempre sin decir por qué.
    lector
        .get_ref()
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let mut acuse = String::new();
    lector.read_line(&mut acuse).map_err(|_| {
        "esta versión de Adeorq no sabe pedir claves: actualízala, o cierra la ventana "
            .to_owned()
            + "vieja que tiene cogido el puerto."
    })?;
    if !acuse.contains("esperando") {
        return Err("Adeorq no ha entendido la petición".into());
    }

    // Y a partir de aquí el tope es largo: al otro lado hay una persona buscando
    // un token. Un pelo por encima de lo que espera la app, para que quien se
    // rinda primero sea ella y el mensaje lo ponga ella.
    lector
        .get_ref()
        .set_read_timeout(Some(std::time::Duration::from_secs(330)))
        .map_err(|e| e.to_string())?;
    let mut linea = String::new();
    lector
        .read_line(&mut linea)
        .map_err(|_| "Adeorq dejó de contestar".to_string())?;
    let res: serde_json::Value = serde_json::from_str(&linea).map_err(|e| e.to_string())?;
    if let Some(error) = res["error"].as_str() {
        return Err(error.to_string());
    }
    if let Some(v) = res["valor"].as_str() {
        // Sin comando no se quería: no se queda ni en memoria más de la cuenta.
        return Ok(pide.valor.then(|| v.to_string()));
    }
    if res["guardada"] == true {
        return Ok(None);
    }
    Err("respuesta sin valor".into())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// El protocolo entero contra un servidor de mentira: se manda la petición,
    /// se contesta, y el valor llega. Con puerto propio porque el 3012 lo tiene
    /// la Adeorq de verdad en la máquina de trabajo.
    #[test]
    fn el_protocolo_trae_el_valor_y_cuenta_los_errores() {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let oreja = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();

        std::thread::spawn(move || {
            for flujo in oreja.incoming().take(2) {
                let flujo = flujo.unwrap();
                let mut escritor = flujo.try_clone().unwrap();
                let mut linea = String::new();
                BufReader::new(flujo).read_line(&mut linea).unwrap();
                let v: serde_json::Value = serde_json::from_str(&linea).unwrap();
                // Lo que manda el cliente tiene que ser reconocible.
                assert_eq!(v["adeorq"], "secreto");
                writeln!(escritor, "{{\"adeorq\":\"esperando\"}}").unwrap();
                let res = if v["nombre"] == "supabase" {
                    serde_json::json!({ "valor": "sbp_tokendeprueba" })
                } else {
                    serde_json::json!({ "error": "lo has cancelado" })
                };
                writeln!(escritor, "{res}").unwrap();
            }
        });

        assert_eq!(
            traer(puerto, "supabase", "listar proyectos", Pide::default()).unwrap().as_deref(),
            Some("sbp_tokendeprueba")
        );
        assert_eq!(traer(puerto, "otro", "", Pide::default()).unwrap_err(), "lo has cancelado");
    }

    /// Sin comando no se pide el valor (`solo_guardar`), y si un Adeorq de antes
    /// lo manda igual, se tira. Con `guardada` y sin valor, es que ya estaba.
    #[test]
    fn sin_comando_no_se_pide_el_valor_y_si_llega_se_tira() {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let oreja = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for (i, flujo) in oreja.incoming().take(2).enumerate() {
                let flujo = flujo.unwrap();
                let mut escritor = flujo.try_clone().unwrap();
                let mut linea = String::new();
                BufReader::new(flujo).read_line(&mut linea).unwrap();
                tx.send(linea).unwrap();
                writeln!(escritor, "{{\"adeorq\":\"esperando\"}}").unwrap();
                // La primera, como la app nueva; la segunda, como una de antes.
                let res = if i == 0 { r#"{"guardada":true}"# } else { r#"{"valor":"sbp_no_deberia_quedarse"}"# };
                writeln!(escritor, "{res}").unwrap();
            }
        });
        let solo = Pide { valor: false, nueva: true };
        assert_eq!(traer(puerto, "supabase", "", solo).unwrap(), None);
        let enviado: serde_json::Value = serde_json::from_str(&rx.recv().unwrap()).unwrap();
        assert_eq!((enviado["solo_guardar"].as_bool(), enviado["nueva"].as_bool()), (Some(true), Some(true)));
        assert_eq!(traer(puerto, "supabase", "", solo).unwrap(), None, "el valor de una app vieja no se queda");
    }

    /// Lo que decide la app con cada petición, sin ventana.
    #[test]
    fn lo_que_se_hace_con_cada_peticion() {
        let t = QuienPide::Terminal(4);
        let f = QuienPide::Fuera;
        let valor = Pide::default();
        let solo = Pide { valor: false, nueva: false };
        let nueva = Pide { valor: true, nueva: true };
        // Guardada: a una terminal se le da; a lo de fuera, se pregunta.
        assert_eq!(decidir(true, false, t, valor, vec![]), Paso::Dar);
        assert_eq!(decidir(true, false, f, valor, vec![]), Paso::PreguntarSiDar);
        // Sin comando y guardada: nada, ni ventana, ni a lo de fuera (antes: «Dársela esta vez»).
        assert_eq!(decidir(true, false, t, solo, vec![]), Paso::YaGuardada);
        assert_eq!(decidir(true, false, f, solo, vec![]), Paso::YaGuardada);
        // Caducada, o pedida nueva: la ventana de pegar, diciendo que sustituye.
        assert_eq!(decidir(true, true, t, valor, vec![]), Paso::Pegar { reemplaza: true });
        assert_eq!(decidir(true, false, t, nueva, vec![]), Paso::Pegar { reemplaza: true });
        // No está y hay una parecida: se le dice al agente, no se le pide a Munir.
        assert_eq!(decidir(false, false, t, valor, vec!["supabase-orquio".into()]), Paso::Parecidas(vec!["supabase-orquio".into()]));
        // Salvo que diga que es otra.
        assert_eq!(decidir(false, false, t, nueva, vec!["supabase-orquio".into()]), Paso::Pegar { reemplaza: false });
        assert_eq!(decidir(false, false, t, valor, vec![]), Paso::Pegar { reemplaza: false });
    }

    /// Los nombres de verdad que hay guardados (medido el 2026-11-06, solo
    /// nombres): qué se parece a qué.
    #[test]
    fn los_nombres_parecidos_salen_y_los_distintos_no() {
        let guardadas: Vec<String> = [
            "azure-openai-orquio", "claude-api", "cloudflare-orquio", "elevenlabs-orquio", "gemini-orquio",
            "gemini-orquio-pago", "munitoai-orquio", "resend-envio-orquio", "stripe-orquio-prueba", "stripe-prueba",
            "supabase-orquio", "zadarma-orquio-key", "zadarma-orquio-secret",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(parecidas("supabase", &guardadas), vec!["supabase-orquio"]);
        assert_eq!(parecidas("SUPABASE_ORQUIO", &guardadas), Vec::<String>::new(), "es la misma, no una parecida");
        assert_eq!(parecidas("stripe-orquio", &guardadas), vec!["stripe-orquio-prueba", "stripe-prueba"]);
        assert_eq!(parecidas("cloudfare-orquio", &guardadas), vec!["cloudflare-orquio"], "una errata");
        assert_eq!(parecidas("eleven-labs", &guardadas), Vec::<String>::new());
        assert_eq!(parecidas("github-adeorq", &guardadas), Vec::<String>::new());
        assert_eq!(parecidas("vercel", &guardadas), Vec::<String>::new());
        assert_eq!(distancia("cloudflare", "cloudfare"), 1);
        assert_eq!(distancia("", "abc"), 3);
    }

    #[test]
    fn nueva_se_lee_en_las_dos_formas() {
        let p = leer_peticion(&a(&["cloudflare-orquio", "--nueva", "para", "desplegar"])).unwrap();
        assert!(p.nueva);
        assert_eq!(p.motivo, "para desplegar");
        let p = leer_peticion(&a(&["x", "--nueva", "--env", "X_TOKEN", "--", "cmd"])).unwrap();
        assert!(p.nueva && p.lanzar.is_some());
        assert!(!leer_peticion(&a(&["x", "y"])).unwrap().nueva);
    }

    /// Las salidas de verdad de los CLI cuando la clave no vale, y lo que no lo es.
    #[test]
    fn se_reconoce_una_clave_rechazada_y_no_se_inventa() {
        for (salida, senal) in [
            ("✘ [ERROR] A request to the Cloudflare API failed.\n  Authentication error [code: 10000]", "authentication error"),
            ("HTTP 401: Bad credentials (https://api.github.com/user)", "http 401"),
            ("Unexpected error retrieving remote project status: {\"message\":\"Unauthorized\"}", "unauthorized"),
            ("Error: 401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\"}}", "authentication_error"),
            ("requests.exceptions.HTTPError: 401 Client Error: Unauthorized for url", "unauthorized"),
            ("{\"error\":{\"code\":400,\"message\":\"API key not valid. Please pass a valid API key.\"}}", "api key not valid"),
            ("The token has expired", "token has expired"),
        ] {
            assert_eq!(parece_clave_rechazada(salida), Some(senal), "{salida}");
        }
        for salida in ["Error: no such file or directory", "Error en la línea 401 del fichero", "403 Forbidden: missing permission", ""] {
            assert_eq!(parece_clave_rechazada(salida), None, "{salida}");
        }
        // El aviso de otro `adeorq secreto` anidado no cuenta.
        let aviso = tras_un_rechazo("x", "unauthorized", None);
        assert_eq!(parece_clave_rechazada(&aviso), None, "{aviso}");
    }

    #[test]
    fn el_aviso_tras_un_rechazo_dice_que_hacer() {
        let no = serde_json::json!({ "veredicto": "no_vale", "servicio": "Cloudflare" });
        let m = tras_un_rechazo("cloudflare-orquio", "authentication error", Some(&no));
        assert!(m.contains("ya no vale") && m.contains("No sigas probando") && m.contains("adeorq secreto cloudflare-orquio --nueva"), "{m}");
        let si = serde_json::json!({ "veredicto": "vale", "servicio": "Supabase" });
        let m = tras_un_rechazo("supabase-orquio", "unauthorized", Some(&si));
        assert!(m.contains("sigue valiendo") && m.contains("no pidas una nueva"), "{m}");
        let m = tras_un_rechazo("elevenlabs-orquio", "invalid api key", None);
        assert!(m.contains("Si es la clave «elevenlabs-orquio»") && m.contains("--nueva"), "{m}");
    }

    #[test]
    fn la_lista_enseña_nombres_y_fechas() {
        assert_eq!(dia(1_796_551_200), "2026-12-06");
        assert_eq!(dia(0), "1970-01-01");
        assert_eq!(dia(951_782_400), "2000-02-29");
        let hoy = 1_796_000_000;
        let v = serde_json::json!({ "claves": [
            { "nombre": "cloudflare-orquio", "servicio": "Cloudflare", "caduca": 1_796_551_200u64, "vale": true },
            { "nombre": "supabase-orquio", "servicio": "Supabase", "caduca": null, "vale": false },
            { "nombre": "elevenlabs-orquio", "servicio": null, "caduca": null, "vale": null },
        ]});
        let t = texto_de_lista(&v, hoy);
        assert!(t.contains("cloudflare-orquio  Cloudflare · caduca el 2026-12-06"), "{t}");
        assert!(t.contains("supabase-orquio    Supabase · YA NO VALE"), "{t}");
        assert!(t.contains("elevenlabs-orquio  \n"), "{t}");
        assert!(texto_de_lista(&serde_json::json!({ "claves": [] }), hoy).contains("No hay ninguna"));
    }

    /// Un comando que falla con un 401 deja la señal en la cola, ya tapada.
    #[test]
    fn la_cola_de_un_comando_que_falla_trae_el_rechazo() {
        #[cfg(windows)]
        let cmd = a(&["cmd", "/c", "echo HTTP 401: Bad credentials con %K% 1>&2 & exit 1"]);
        #[cfg(not(windows))]
        let cmd = a(&["sh", "-c", "echo HTTP 401: Bad credentials con $K >&2; exit 1"]);
        let (mut salida, mut errores) = (Vec::new(), Vec::new());
        let (codigo, cola) = lanzar("ghp_x7", "K", &cmd, &mut salida, &mut errores).unwrap();
        assert_eq!(codigo, 1);
        assert_eq!(parece_clave_rechazada(&cola), Some("http 401"));
        assert!(cola.contains("con ***") && !cola.contains("ghp_x7"), "{cola:?}");
    }

    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    /// Sin `--` solo se pide y se guarda: no hay forma de que la clave salga
    /// por una tubería (`adeorq secreto supabase | cat` la imprimía).
    #[test]
    fn sin_comando_no_hay_nada_que_imprimir() {
        let p = leer_peticion(&a(&["supabase", "para", "listar", "proyectos"])).unwrap();
        assert_eq!(p.motivo, "para listar proyectos");
        assert_eq!(p.lanzar, None);
        // Y la vieja forma de leerla ya no existe en el código.
        let fuente = include_str!("pedir_secreto.rs");
        assert!(!fuente.contains(&["fn ", "escribir_si"].concat()));
    }

    #[test]
    fn la_linea_se_lee_con_su_variable_y_su_comando() {
        let p = leer_peticion(&a(&["mi-token", "para", "x", "--", "wrangler", "--", "deploy"])).unwrap();
        assert_eq!(p.motivo, "para x");
        assert_eq!(p.lanzar, Some(("MI_TOKEN".into(), a(&["wrangler", "--", "deploy"]))));
        let p = leer_peticion(&a(&["supabase", "--env", "SUPABASE_ACCESS_TOKEN", "--", "supabase"])).unwrap();
        assert_eq!(p.lanzar.unwrap().0, "SUPABASE_ACCESS_TOKEN");
        // Lo que no vale, con su explicación y nunca con la clave (no la hay aún).
        assert!(leer_peticion(&a(&["x", "--"])).is_err());
        assert!(leer_peticion(&a(&["x", "--env", "A=B", "--", "c"])).is_err());
        assert!(leer_peticion(&a(&["x", "--env", "A"])).is_err());
        assert!(leer_peticion(&a(&[])).is_err());
    }

    /// El filtro tapa la clave aunque llegue partida en trozos, y no se guarda
    /// lo que no puede ser clave (una pregunta sin salto de línea sale ya).
    #[test]
    fn el_tapador_tapa_aunque_llegue_partida() {
        let mut t = Tapador::new("sbp_abc123");
        let mut fuera = Vec::new();
        for trozo in ["token=sbp_a", "bc", "123 y ", "otra sbp_abc123", "\n¿Seguro? "] {
            fuera.extend(t.empujar(trozo.as_bytes()));
        }
        assert_eq!(String::from_utf8(fuera.clone()).unwrap(), "token=*** y otra ***\n¿Seguro? ");
        // Un principio de clave que al final no lo era sale tal cual.
        let mut t = Tapador::new("sbp_abc123");
        let mut fuera = t.empujar(b"sbp_ab");
        assert!(fuera.is_empty());
        fuera.extend(t.empujar(b"X"));
        fuera.extend(t.terminar());
        assert_eq!(fuera, b"sbp_abX");
    }

    /// El hijo recibe la clave en su variable, y lo que escribe por salida y por
    /// errores sale tapado.
    #[test]
    fn el_hijo_la_recibe_y_su_salida_sale_tapada() {
        #[cfg(windows)]
        let cmd = a(&["cmd", "/c", "if %MI_CLAVE%==sbp_x7 (echo recibida %MI_CLAVE%) & echo error %MI_CLAVE% 1>&2 & exit 3"]);
        #[cfg(not(windows))]
        let cmd = a(&["sh", "-c", "[ \"$MI_CLAVE\" = sbp_x7 ] && echo recibida $MI_CLAVE; echo error $MI_CLAVE >&2; exit 3"]);
        let (mut salida, mut errores) = (Vec::new(), Vec::new());
        let (codigo, _) = lanzar("sbp_x7", "MI_CLAVE", &cmd, &mut salida, &mut errores).unwrap();
        let (salida, errores) = (String::from_utf8_lossy(&salida), String::from_utf8_lossy(&errores));
        assert!(salida.contains("recibida ***"), "el hijo no la recibió: {salida:?}");
        assert!(errores.contains("error ***"), "{errores:?}");
        assert!(!salida.contains("sbp_x7") && !errores.contains("sbp_x7"));
        assert_eq!(codigo, 3, "el código del hijo pasa tal cual");
    }

    /// El fallo que costó una prueba colgada: un Adeorq viejo sirviendo el
    /// puerto recibe la petición, no la entiende y se queda callado. Antes eso
    /// dejaba al que preguntaba esperando para siempre.
    #[test]
    fn si_al_otro_lado_no_entienden_no_se_queda_colgado() {
        use std::net::TcpListener;

        let oreja = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();
        std::thread::spawn(move || {
            // Acepta y no dice nada, como el Adeorq de antes de esto.
            let _mudo: Vec<_> = oreja.incoming().take(1).collect();
            std::thread::sleep(std::time::Duration::from_secs(20));
        });

        let empezo = std::time::Instant::now();
        let e = traer(puerto, "supabase", "", Pide::default()).unwrap_err();
        assert!(empezo.elapsed() < std::time::Duration::from_secs(12), "tardó demasiado en rendirse");
        assert!(e.contains("actualízala"), "y tiene que decir qué hacer: {e}");
    }

    /// Un nombre inventado no llega ni a abrir el socket.
    #[test]
    fn un_nombre_raro_no_sale_de_casa() {
        assert!(traer(1, "api:claude", "", Pide::default()).unwrap_err().contains("solo puede llevar"));
    }

    #[test]
    fn el_nombre_se_valida_porque_llega_de_fuera() {
        assert!(nombre_valido("supabase"));
        assert!(nombre_valido("CLOUDFLARE_API_TOKEN"));
        assert!(nombre_valido("token-de-hoy"));
        // Lo que no puede pasar: vacío, con separadores, o largo de más.
        assert!(!nombre_valido(""));
        assert!(!nombre_valido("api:claude"));
        assert!(!nombre_valido("../otro"));
        assert!(!nombre_valido("con espacio"));
        assert!(!nombre_valido(&"x".repeat(65)));
        assert!(nombre_valido(&"x".repeat(64)));
    }
}
