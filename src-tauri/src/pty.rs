use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
// El corral es de Windows, y es el único que guarda algo para siempre.
#[cfg(windows)]
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE};
#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};
// Solo lo usa `taskkill`, que es la versión de Windows de matar la rama.
#[cfg(windows)]
use crate::SinVentana;

/// Con qué nace una terminal si nadie dice otra cosa.
///
/// En Windows, PowerShell, que es la de la casa. En Linux, la del usuario:
/// `$SHELL` es la que él eligió, y caer en `/bin/sh` cuando no está es lo que
/// hace cualquier programa que abre una terminal.
#[cfg(windows)]
const DEFAULT_SHELL: &str = "powershell.exe";

#[cfg(not(windows))]
fn shell_de_fabrica() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_owned())
}

pub struct PtySession {
    /// Tras su propio candado, para poder RESIZEAR SIN el candado del mapa:
    /// un resize contra un ConPTY colgado puede no volver jamás, y si eso
    /// pasa con el candado del mapa cogido, arrastra la entrada de todos los
    /// paneles. Con el candado propio, un resize podrido pudre a su panel y
    /// a nadie más.
    pub master: std::sync::Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// La entrada del panel va por un canal a un hilo escritor propio, NUNCA
    /// directa a la tubería. Escribir directo era una trampa mortal: si el
    /// proceso del panel se cuelga y deja de leer su entrada, la tubería se
    /// llena, y la siguiente tecla se quedaba BLOQUEADA dentro de `pty_write`
    /// —que corre en el hilo de la ventana y con el candado del mapa cogido—.
    /// Resultado: un solo panel colgado dejaba TODA la app sin teclado, hasta
    /// el panel de al lado que estaba sano (le pasó a Munir con Antigravity,
    /// 2026-07-30). Mandar por el canal no bloquea jamás; el que espera, si
    /// hay que esperar, es el hilo escritor de ese panel y nadie más.
    pub tx_entrada: std::sync::mpsc::Sender<Vec<u8>>,
    pub killer: Box<dyn ChildKiller + Send + Sync>,
    /// El PID del hijo, para poder matar la RAMA entera y no solo a él.
    /// `claude.exe` es un lanzador: el agente de verdad es un `node` que cuelga
    /// de él, así que matar al hijo directo dejaba al agente corriendo.
    pub pid: Option<u32>,
    pub cwd: String,
    pub command: Option<Vec<String>>,
    pub history: std::sync::Arc<Mutex<String>>,
}

#[derive(Default)]
pub struct PtyState(pub Mutex<HashMap<u32, PtySession>>);

#[derive(Clone, Serialize)]
struct PtyData {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct PtyExit {
    id: u32,
    code: Option<u32>,
}

/// El panel se ha quedado MUDO: su lector se rindió con el proceso todavía
/// vivo. Nadie vacía ya su terminal, así que el agente se bloqueará en cuanto
/// intente escribir. Desde fuera no se nota nada, y por eso hay que contarlo.
#[derive(Clone, Serialize)]
struct PtyMudo {
    id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub path: String,
    pub has_git: bool,
}

/// ConPTY emits UTF-8, but a multi-byte sequence can be split across read
/// chunks; emitting the split halves through lossy conversion would corrupt
/// accented characters. Drain only up to the last complete sequence.
fn drain_utf8(pending: &mut Vec<u8>) -> String {
    match std::str::from_utf8(pending) {
        Ok(s) => {
            let out = s.to_owned();
            pending.clear();
            out
        }
        Err(e) => {
            let valid = e.valid_up_to();
            if e.error_len().is_none() {
                let out = String::from_utf8_lossy(&pending[..valid]).into_owned();
                let rest = pending.split_off(valid);
                *pending = rest;
                out
            } else {
                let out = String::from_utf8_lossy(pending).into_owned();
                pending.clear();
                out
            }
        }
    }
}

// async porque abrir el ConPTY y crear el proceso hijo tarda (más aún con el
// antivirus mirando), y un comando sin async corre en el hilo de la ventana:
// abrir una cuadrilla de seis paneles era una ristra de congelones.
/// Cuánto historial se guarda de cada panel, para que el MCP pueda leerlo.
const HIST_OBJETIVO: usize = 100_000;
/// Hasta dónde se le deja crecer antes de recortar. Recortar es mover el resto
/// de la cadena, o sea coste proporcional al tamaño: hacerlo en CADA trozo
/// leído era mover 100 KB por cada 8 KB que llegaban, en el único hilo que
/// tiene que ir rápido. Con el doble de margen se recorta una vez cada 100 KB
/// de salida en lugar de doce veces, y el coste medio se vuelve insignificante.
const HIST_TOPE: usize = 200_000;

/// Recorta el historial de un panel SIN romperlo nunca.
///
/// Esto es lo que congelaba las terminales, y venía del commit del MCP: el
/// recorte hacía `hist[hist.len() - 100_000..]`, o sea cortaba una cadena UTF-8
/// por un número de BYTES calculado a ciegas. Cuando ese byte caía en mitad de
/// un carácter —una tilde, un `─`, un `●`, cualquier cosa de las que pinta un
/// agente— Rust entraba en pánico y MATABA EL HILO LECTOR. Sin lector nadie
/// vacía el ConPTY, su búfer se llena, y el proceso se queda bloqueado al
/// escribir: cero CPU, para siempre, y sin un solo mensaje de error en ninguna
/// parte. Munir lo sufrió una noche entera en cualquier sesión que escribiera
/// mucho, que es justo lo que hace falta para llenar los 100 KB (2026-07-31).
///
/// Ahora el corte se lleva hasta un límite de carácter antes de tocar nada, y
/// se prefiere empezar en una línea limpia si hay una cerca.
fn recortar_historial(hist: &mut String) {
    if hist.len() <= HIST_TOPE {
        return;
    }
    // Un límite de carácter de verdad, avanzando desde la marca deseada.
    let mut corte = hist.len() - HIST_OBJETIVO;
    while corte < hist.len() && !hist.is_char_boundary(corte) {
        corte += 1;
    }
    // Y si hay un salto de línea a mano, se empieza justo después: así el
    // historial no arranca a mitad de una frase.
    if let Some(pos) = hist[corte..].find('\n') {
        corte += pos + 1;
    }
    hist.drain(..corte);
}

/// El candado del historial NO puede tumbar a nadie: guarda un búfer de texto,
/// no un invariante que respetar. Si un pánico lo dejó envenenado se recupera
/// lo que hubiera dentro y se sigue, porque lo contrario sería dejar un panel
/// sin historial para siempre por un susto del que ya nos hemos levantado.
fn tomar(hist: &Mutex<String>) -> std::sync::MutexGuard<'_, String> {
    hist.lock().unwrap_or_else(|e| e.into_inner())
}

/// Por qué terminó el lector de un panel.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Fin {
    /// El proceso cerró su salida. Es el final normal.
    Limpio,
    /// El lector se rindió con el proceso vivo todavía. Lo peor que puede
    /// pasar, y por eso se cuenta hacia arriba en vez de morir en silencio.
    Roto,
}

/// Vacía la terminal de un panel hasta el final, SOBREVIVIENDO A LOS PÁNICOS.
///
/// Es la lección de la noche del 31: bastó una línea que cortaba UTF-8 por un
/// byte a ciegas para que Rust entrara en pánico, matara el hilo lector, y con
/// él dejara al panel mudo PARA SIEMPRE sin un solo aviso en ninguna parte. Ese
/// fallo concreto está arreglado, pero el diseño seguía siendo el mismo:
/// cualquier otro descuido futuro en este camino volvería a colgar una terminal
/// en silencio. Ya no. Un pánico se recoge, se tira lo único que pudo quedar en
/// un estado raro —lo que se acumula— y se SIGUE VACIANDO, que es lo que de
/// verdad importa. Rendirse solo si el pánico vuelve en cada vuelta.
///
/// El respiro entre intentos, en una constante para que los tests no se lo
/// coman entero: el del pánico permanente daría diez cabezadas de medio
/// segundo por pasada.
#[cfg(not(test))]
const RESPIRO_TRAS_PANICO_MS: u64 = 500;
#[cfg(test)]
const RESPIRO_TRAS_PANICO_MS: u64 = 1;

fn vaciar_pase_lo_que_pase<R: Read>(
    id: u32,
    reader: &mut R,
    pending: &mut Vec<u8>,
    history: &Mutex<String>,
    tx: &std::sync::mpsc::Sender<String>,
    escuchan: &mut bool,
) -> Fin {
    let mut sustos = 0u32;
    loop {
        let vuelta = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            vaciar(reader, pending, history, tx, escuchan)
        }));
        match vuelta {
            Ok(fin) => return fin,
            Err(carga) => {
                sustos += 1;
                // La CARGA del pánico se apunta aquí porque el gancho global no
                // la vio nunca: en el rastro de Munir hay meses de «entró en
                // pánico» y ni UNA línea del gancho con su sitio (comprobado el
                // 2026-08-15). Un pánico relanzado con `resume_unwind` no pasa
                // por el gancho, así que este es el único lugar que lo tiene en
                // la mano. Sin esto, el fallo del panel 7 es invisible.
                let que = carga
                    .downcast_ref::<&str>()
                    .map(|s| (*s).to_owned())
                    .or_else(|| carga.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "una carga que no es texto".to_owned());
                crate::anotar(&format!(
                    "el lector del panel {id} entró en pánico ({sustos}ª vez) y sigue vaciando: {que}"
                ));
                tomar(history).clear();
                pending.clear();
                // Diez seguidos es que el pánico está en CADA vuelta: se corta
                // antes de convertir un fallo en un hilo girando en el vacío.
                //
                // Eran tres, y con el reintento inmediato los tres cabían en el
                // MISMO segundo (rastro del 2026-08-15, panel 7: las tres veces
                // a las 17:31:36): un tropiezo pasajero se convertía en rendirse
                // al instante, y rendirse aquí es una terminal MUDA con el
                // agente vivo, que es lo peor que sabe hacer este archivo. El
                // respiro de abajo hace además que diez intentos sean unos
                // cinco segundos de margen de verdad, no diez vueltas de bucle.
                if sustos >= 10 {
                    return Fin::Roto;
                }
                std::thread::sleep(std::time::Duration::from_millis(RESPIRO_TRAS_PANICO_MS));
            }
        }
    }
}

/// VACIAR LA TERMINAL ES OBLIGATORIO, PASE LO QUE PASE.
///
/// Este bucle es lo único que separa a un agente de quedarse mudo. Si deja de
/// leer, el búfer del ConPTY se llena, y un proceso que escribe en una salida
/// llena se queda BLOQUEADO: cero CPU, para siempre, y sin un solo mensaje de
/// error en ninguna parte. Desde fuera es idéntico a que la terminal se
/// congele, y es lo que le pasaba a Munir en cuanto el agente escribía mucho
/// —un diagnóstico del proyecto, por ejemplo— mientras un «hola» iba bien
/// porque casi no escribe (2026-07-30).
///
/// Antes se salía con `Err(_) => break`, o sea ante CUALQUIER error, incluido
/// uno pasajero del ConPTY del que se vuelve. Y también se salía si el emisor
/// ya no estaba. Las dos salidas condenaban al hijo al bloqueo. Ahora: los
/// errores pasajeros se reintentan, y si ya no hay a quién enviarle nada se
/// sigue leyendo y se tira lo leído, porque vaciar importa más que entregar.
fn vaciar<R: Read>(
    reader: &mut R,
    pending: &mut Vec<u8>,
    history: &Mutex<String>,
    tx: &std::sync::mpsc::Sender<String>,
    escuchan: &mut bool,
) -> Fin {
    let mut buf = [0u8; 8192];
    let mut fallos = 0u32;
    loop {
        match reader.read(&mut buf) {
            // Fin de verdad: el proceso cerró su salida.
            Ok(0) => return Fin::Limpio,
            Err(e) => {
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
                ) {
                    continue;
                }
                // Cinco seguidos sí es definitivo; uno suelto no.
                fallos += 1;
                if fallos >= 5 {
                    return Fin::Roto;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Ok(n) => {
                fallos = 0;
                pending.extend_from_slice(&buf[..n]);
                let text = drain_utf8(pending);
                if !text.is_empty() {
                    {
                        let mut hist = tomar(history);
                        hist.push_str(&text);
                        recortar_historial(&mut hist);
                    }
                    if *escuchan && tx.send(text).is_err() {
                        // El panel se fue. Se deja de enviar, NO de leer.
                        *escuchan = false;
                    }
                }
            }
        }
    }
}

// ─── EL CORRAL ────────────────────────────────────────────────────────────
//
// Darle a la X ya está resuelto: `kill_all` recorre las terminales y mata cada
// rama. Pero esa es la ÚNICA forma de cerrar que nos avisa. Si Adeorq se
// cuelga, si Munir la mata desde el Administrador de tareas o si el proceso se
// cae, nadie llega a llamar a `kill_all` y los `claude.exe` y `powershell.exe`
// de cada panel siguen vivos: sin ventana donde verlos, gastando memoria y
// cuota, hasta que alguien los descubre a mano en el Administrador de tareas.
// Es el mismo estropicio del 2026-07-30, solo que por la puerta de atrás.
//
// La red que no depende de nuestro código es un Job Object de Windows con
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. Cada hijo del PTY entra en el job, y
// cuando se cierra el último handle del job —cosa que hace el propio Windows al
// morir Adeorq, muera como muera— el sistema mata todo lo que hay dentro. No
// hace falta que se ejecute ni una línea nuestra, que es justo lo que no se
// puede dar por hecho en un cierre anormal.
//
// DOS DECISIONES QUE SON EL MOTIVO DE QUE ESTO NO SEA PELIGROSO:
//
// 1. El job va SIN NOMBRE. Con nombre, `CreateJobObjectW` devuelve el job que
//    YA existe en vez de crear uno, así que dos Adeorq a la vez —la app
//    instalada y una ventana de desarrollo, que es el día a día de esta casa—
//    compartirían corral, y cerrar una se llevaría por delante los agentes de
//    la otra. Sin nombre, cada proceso tiene el suyo y no hay manera de tocar
//    lo ajeno.
//
// 2. Al corral entra SOLO lo que lanza este `pty_spawn`, igual que `kill_all`
//    solo toca lo que hay en `PtyState`. Nada de buscar procesos por nombre:
//    los `claude.exe` que aparecen en la máquina suelen ser hijos de la app de
//    escritorio de Claude, no huérfanos nuestros, y meterlos aquí sería
//    firmarles la sentencia cada vez que Munir cierra Adeorq.

/// El handle del corral. `HANDLE` es un puntero crudo, y por eso Rust no lo
/// deja vivir en un `static` sin permiso explícito. Aquí el permiso está
/// justificado: este handle solo se LEE y se le pasa al kernel, que sí es
/// seguro entre hilos, y no se cierra JAMÁS —cerrarlo mataría en el acto a
/// todos los paneles, que es precisamente lo que el flag hace por nosotros
/// cuando el proceso muere—.
#[cfg(windows)]
#[derive(Clone, Copy)]
struct Corral(HANDLE);
#[cfg(windows)]
unsafe impl Send for Corral {}
#[cfg(windows)]
unsafe impl Sync for Corral {}

/// El corral se crea UNA sola vez, la primera que se abre un panel.
///
/// Si Windows no deja crearlo (permisos raros, una política de empresa, un
/// entorno donde los jobs están capados), se devuelve `None` y Adeorq sigue
/// comportándose EXACTAMENTE como antes de que esto existiera: la X sigue
/// matando a los agentes y lo único que se pierde es la red bajo el cierre
/// anormal. Una app que no arranca sería mucho peor que un huérfano.
#[cfg(windows)]
fn corral() -> Option<Corral> {
    static CORRAL: OnceLock<Option<Corral>> = OnceLock::new();
    *CORRAL.get_or_init(|| unsafe {
        // Sin atributos de seguridad (nulo) y SIN NOMBRE (nulo): ver el punto 1
        // de arriba. El nulo del nombre es la parte que no se puede cambiar.
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            crate::anotar(&format!(
                "no se pudo crear el corral de procesos (error {}): los paneles quedan sin red ante un cierre anormal",
                GetLastError()
            ));
            return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        // El flag es TODO el asunto. Y no se pide BREAKAWAY_OK a propósito: sin
        // él, un hijo no puede sacar del corral a los nietos que abra aunque lo
        // intente, y `claude.exe` abre un `node` que es el agente de verdad.
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let puesto = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if puesto == 0 {
            // Un corral sin ese flag es un corral con la puerta abierta: no
            // mataría a nadie al cerrarse y encima metería a los hijos en un
            // job que no les aporta nada. Se cierra y se sigue sin él.
            crate::anotar(&format!(
                "el corral no acepta matar al cerrarse (error {}): se descarta y todo sigue como antes",
                GetLastError()
            ));
            CloseHandle(job);
            return None;
        }
        Some(Corral(job))
    })
}

/// Mete a un recién nacido en el corral. Se llama JUSTO después de crearlo.
///
/// Falle lo que falle aquí, el panel funciona igual de bien: lo único que se
/// pierde es la red del cierre anormal, y queda anotado en el rastro para poder
/// mirarlo después en vez de suponerlo.
///
/// LO QUE ESTO **NO** GARANTIZA, dicho claro en lugar de fingir que está
/// cubierto:
///
/// - `portable-pty` crea el proceso YA CORRIENDO, no suspendido, así que entre
///   que nace y que entra al corral hay una rendija de microsegundos. Un hijo
///   que lanzara un nieto justo ahí lo dejaría fuera. Cerrar esa rendija
///   exigiría parchear `portable-pty` para arrancar suspendido y reanudar
///   después de asignar, y no compensa por lo que se gana.
/// - Si el hijo ya venía dentro de OTRO Job Object, Windows anida los dos
///   (Windows 8 y posteriores lo permiten), pero si el job de fuera no admite
///   anidamiento la asignación falla y ESE panel se queda sin red. No es
///   hipotético: pasa si a Adeorq la lanza algo que ya trabaja con jobs.
/// - El corral no sustituye a `kill_all` ni a `pty_kill`: mata al cerrarse la
///   app, no al cerrarse un panel. Los dos caminos siguen haciendo falta.
#[cfg(windows)]
fn meter_en_el_corral(pid: u32) {
    let Some(corral) = corral() else { return };
    unsafe {
        // Los dos permisos EXACTOS que pide `AssignProcessToJobObject` y ni uno
        // más: para encerrar a un proceso no hace falta poder leer su memoria.
        let h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if h.is_null() {
            crate::anotar(&format!(
                "no se pudo abrir el proceso {pid} para meterlo en el corral: error {}",
                GetLastError()
            ));
            return;
        }
        if AssignProcessToJobObject(corral.0, h) == 0 {
            crate::anotar(&format!(
                "el proceso {pid} se quedó fuera del corral: error {}",
                GetLastError()
            ));
        }
        // El handle del PROCESO sí se cierra: la pertenencia al job ya está
        // hecha y no depende de que lo mantengamos abierto. El del JOB no.
        CloseHandle(h);
    }
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: u32,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<Vec<String>>,
    // Extra environment for this pane only. Today it carries CLAUDE_CONFIG_DIR,
    // which is what makes a terminal belong to one account.
    env: Option<HashMap<String, String>>,
) -> Result<(), String> {
    // ── Ese panel YA está abierto ────────────────────────────────────────────
    //
    // Hasta hoy esto abría un proceso nuevo sin mirar, y al meterlo en el mapa
    // pisaba al que ya estaba: el primer agente se quedaba corriendo sin nadie
    // que lo leyera ni pudiera matarlo, o sea un huérfano de manual. No pasaba
    // nunca porque un id solo se pedía una vez, y eso deja de ser cierto en
    // cuanto una terminal se puede sacar a su propia ventana (Munir,
    // 2026-08-13): la ventana nueva monta el mismo panel y pide su PTY.
    //
    // Así que engancharse a lo que ya hay no es un caso raro, es el caso
    // normal, y salir por aquí es lo que hace que sacar una terminal no cueste
    // ni un proceso más.
    if state.0.lock().unwrap().contains_key(&id) {
        return Ok(());
    }
    let command_clone = command.clone();
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = match command {
        Some(argv) if !argv.is_empty() => {
            let mut c = CommandBuilder::new(&argv[0]);
            for arg in &argv[1..] {
                c.arg(arg);
            }
            c
        }
        _ => {
            #[cfg(windows)]
            {
                let mut c = CommandBuilder::new(DEFAULT_SHELL);
                c.arg("-NoLogo");
                c
            }
            // La shell de Linux se abre de login (`-l`) para que el PATH y los
            // alias del usuario estén puestos: sin eso, `claude` no se
            // encuentra en la mitad de las instalaciones.
            #[cfg(not(windows))]
            {
                let mut c = CommandBuilder::new(shell_de_fabrica());
                c.arg("-l");
                c
            }
        }
    };
    cmd.cwd(&cwd);
    // If Adeorq itself was launched from inside a Claude Code session (dev
    // builds, tests), the CLI's child-session marker leaks into our PTYs and
    // silently disables transcript saving for every claude run in a pane.
    // Adeorq terminals are always first-class sessions: never propagate it.
    cmd.env_remove("CLAUDE_CODE_CHILD_SESSION");
    // Colour: TUI agents ask the environment what the terminal can paint, and
    // xterm.js paints 24-bit, so declare it. NO_COLOR is the killer: whoever
    // launches Adeorq can leak it in (agent harnesses set it to keep tool
    // output plain) and then every pane renders black and white. A terminal
    // pane is a terminal, not a log pipe: strip it and force colour on.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env_remove("NO_COLOR");
    cmd.env("FORCE_COLOR", "3");
    cmd.env("CLICOLOR_FORCE", "1");
    // QUIÉN ERES. Un agente dentro de una terminal de Adeorq no tenía forma de
    // saber en qué panel vive, y sin eso no puede pedir por MCP que se dibuje
    // una flecha DESDE él: sabe los números de los demás (`get_active_panes`) y
    // no el suyo. Va en el entorno y no por el prompt porque lo hereda todo lo
    // que nazca dentro, incluido el puente `adeorq.exe --mcp`, que es nieto del
    // panel y de otra forma no podría identificarse.
    // Ver `docs/SUPREMA.md`.
    cmd.env("ADEORQ_PANE_ID", id.to_string());
    // Y que `adeorq` se pueda escribir a secas. Hace falta para pedir un token
    // sin enseñarlo (`adeorq secreto <nombre>`, ver `pedir_secreto.rs`), y la
    // app no está en el PATH del sistema: se instala en su propia carpeta. Se
    // añade DELANTE por lo de siempre, que un `adeorq` de otro sitio no gane, y
    // solo si no estaba ya, para que reabrir terminales no vaya alargando la
    // variable sin freno.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(carpeta) = exe.parent().map(|p| p.to_string_lossy().to_string()) {
            let sep = if cfg!(windows) { ';' } else { ':' };
            let actual = std::env::var("PATH").unwrap_or_default();
            if !actual.split(sep).any(|t| t == carpeta) {
                cmd.env("PATH", format!("{carpeta}{sep}{actual}"));
            }
        }
    }
    // Last, so a pane's own settings win over the defaults above.
    for (key, value) in env.into_iter().flatten() {
        if value.is_empty() {
            cmd.env_remove(&key);
            continue;
        }
        // Una clave de API no viaja por el front. Cuando una terminal necesita
        // una, el front manda el MARCADOR `@secreto:api:claude` y aquí se
        // cambia por la clave de verdad, que sale del Gestor de Credenciales y
        // entra directa en el proceso hijo. Así la clave no pasa por el
        // WebView, ni por el estado de React, ni por una captura de pantalla.
        if let Some(nombre) = value.strip_prefix("@secreto:") {
            match crate::secrets::get(nombre) {
                Some(real) => cmd.env(&key, real),
                // Sin clave guardada NO se pone la variable: mejor que el CLI
                // diga «no hay credenciales» a arrancar con la palabra
                // «@secreto:api:claude» dentro y fallar diciendo cualquier cosa.
                None => cmd.env_remove(&key),
            }
            continue;
        }
        cmd.env(&key, &value);
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let pid = child.process_id();
    // Al corral lo ANTES posible, antes de montar hilos o de tocar el mapa: el
    // hijo ya está corriendo y cada instante que pasa fuera es un instante en el
    // que podría abrir un nieto que se quedara sin encerrar. Ver `corral()`.
    //
    // En Linux no hace falta corral y no es una carencia: el propio sistema ya
    // lo hace. Cada terminal nace en su SESIÓN, con el pseudoterminal como
    // terminal de control; cuando Adeorq muere —como muera—, el extremo maestro
    // se cierra, el núcleo manda SIGHUP a esa sesión y los agentes se van con
    // ella. Es el mismo seguro que el flag KILL_ON_JOB_CLOSE de Windows, solo
    // que en Unix viene de fábrica desde hace cuarenta años.
    #[cfg(windows)]
    if let Some(pid) = pid {
        meter_en_el_corral(pid);
    }

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();

    // El hilo escritor del panel: el único que toca la tubería de entrada.
    // Ver el comentario de `tx_entrada` en PtySession. Muere solo cuando la
    // sesión se borra del mapa (se suelta el emisor) o la tubería se rompe.
    let (tx_entrada, rx_entrada) = std::sync::mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        for data in rx_entrada {
            // Si esto falla, lo que Munir acaba de teclear NO ha llegado a
            // ninguna parte y el panel deja de aceptar teclas sin decir nada.
            // Casi siempre es que el proceso ya se había muerto, pero eso hay
            // que poder comprobarlo después en vez de suponerlo.
            if let Err(e) = writer.write_all(&data).and_then(|_| writer.flush()) {
                crate::anotar(&format!("el panel {id} perdió el teclado: {e}"));
                break;
            }
        }
    });

    let history = std::sync::Arc::new(Mutex::new(String::new()));
    let history_reader = history.clone();

    // El hilo que LEE la terminal ya no es el que la EMITE, y esa separación es
    // todo el arreglo.
    //
    // Antes se emitía DENTRO del bucle de lectura. Mientras el agente solo
    // pinta su ruedecita eso va sobrado, pero en cuanto empieza a escribir su
    // respuesta de verdad la cosa se cae por su propio peso: cada trozo leído
    // era un mensaje al WebView, el WebView no daba abasto, `emit` empezaba a
    // tardar, y como esa llamada estaba dentro del bucle, EL BUCLE DEJABA DE
    // LEER. Ahí se acaba el asunto: si nadie vacía la salida del ConPTY, su
    // búfer se llena, y un proceso que escribe en una salida llena se queda
    // BLOQUEADO. O sea que no se congelaba la ventana: se congelaba el agente,
    // porque le habíamos tapado la boca. Eso es el «arranca bien y a los diez
    // segundos se para todo y deja de trabajar» (Munir, 2026-07-30).
    //
    // Ahora el lector solo lee y suelta el texto por el canal, así que vacía la
    // terminal SIEMPRE, pase lo que pase con la pantalla. Y el emisor agrupa lo
    // que llegue dentro de un fotograma: cien mensajes por segundo se quedan en
    // sesenta como mucho, que es tanto como puede pintar una pantalla, y lo que
    // se ve es exactamente lo mismo.
    let (tx, rx) = std::sync::mpsc::channel::<String>();

    let app_lector = app.clone();
    std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::new();
        let mut escuchan = true;
        let fin = vaciar_pase_lo_que_pase(
            id,
            &mut reader,
            &mut pending,
            &history_reader,
            &tx,
            &mut escuchan,
        );
        if !pending.is_empty() {
            let text = String::from_utf8_lossy(&pending).into_owned();
            if !text.is_empty() {
                tomar(&history_reader).push_str(&text);
                let _ = tx.send(text);
            }
        }
        // Rendirse con el proceso vivo deja el panel mudo, y eso NO se nota
        // desde fuera: se cuenta, para que el panel plante el «⚡ Reanimar» en
        // el acto en vez de esperar a que el vigía lo sospeche tres minutos
        // más tarde. Si el proceso ya había terminado, `pty-exit` llega antes
        // y el panel se cierra: entonces este aviso no lo escucha nadie, que
        // es exactamente lo que debe pasar.
        if fin == Fin::Roto {
            crate::anotar(&format!("el panel {id} se quedó mudo: su lector se rindió"));
            let _ = app_lector.emit("pty-mudo", PtyMudo { id });
        }
        // Al soltar `tx` aquí, el emisor termina solo.
    });

    let app_reader = app.clone();
    std::thread::spawn(move || {
        use std::sync::mpsc::RecvTimeoutError;
        use std::time::{Duration, Instant};
        /// Un fotograma. Lo que caiga dentro viaja junto.
        const VENTANA: Duration = Duration::from_millis(16);
        /// Tope por si el agente vuelca algo enorme de golpe (un `cat` a un
        /// fichero grande): antes que un mensaje de varios MB, varios seguidos.
        const MAX: usize = 256 * 1024;
        while let Ok(primero) = rx.recv() {
            let mut lote = primero;
            let hasta = Instant::now() + VENTANA;
            while lote.len() < MAX {
                let queda = hasta.saturating_duration_since(Instant::now());
                if queda.is_zero() {
                    break;
                }
                match rx.recv_timeout(queda) {
                    Ok(mas) => lote.push_str(&mas),
                    Err(RecvTimeoutError::Timeout) => break,
                    // El lector ha terminado: se manda lo último y se sale.
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            let _ = app_reader.emit("pty-data", PtyData { id, data: lote });
        }
    });

    // El insert va ANTES de arrancar el hilo que espera al hijo, y el orden es
    // el arreglo: con un proceso que muere al instante (CLI sin login, un
    // argumento inválido, un perfil de shell que aborta), el `remove` del
    // waiter corría antes que este insert, no encontraba nada, y la sesión
    // muerta se quedaba en el mapa para siempre. `pty_spawn` la veía y devolvía
    // éxito sin arrancar nada: una terminal en blanco que no revive jamás.
    state.0.lock().unwrap().insert(
        id,
        PtySession {
            master: std::sync::Arc::new(Mutex::new(pair.master)),
            tx_entrada,
            killer,
            pid,
            cwd,
            command: command_clone,
            history,
        },
    );

    let app_waiter = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code());
        let pty_state = app_waiter.state::<PtyState>();
        pty_state.0.lock().unwrap().remove(&id);
        let _ = app_waiter.emit("pty-exit", PtyExit { id, code });
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let session = map.get(&id).ok_or("no such pty")?;
    // Mandar al canal no bloquea nunca: si el panel está colgado, el que
    // espera es SU hilo escritor, no el hilo de la ventana con el candado.
    session
        .tx_entrada
        .send(data.into_bytes())
        .map_err(|_| "pty cerrado".to_string())
}

/// Lo que ya se ha dicho en ese panel, para pintarlo en una ventana que acaba
/// de nacer.
///
/// Sacar una terminal a su propia ventana no puede dejarla en blanco: el
/// proceso sigue vivo y lleva media conversación dentro, así que la ventana
/// nueva empieza escribiendo esto en su xterm y sigue por donde iba.
///
/// El corte va por CARÁCTER y no por byte. Una tilde ocupa dos bytes y un
/// dibujo de esos que pinta Claude ocupa tres o cuatro: cortar por el byte de
/// en medio parte el carácter, y en Rust eso no devuelve texto raro, entra en
/// pánico. Es exactamente el fallo que ya se arregló una vez en
/// `recortar_historial`.
#[tauri::command]
pub fn pty_historial(state: State<'_, PtyState>, id: u32, bytes: Option<usize>) -> Result<String, String> {
    let map = state.0.lock().unwrap();
    let session = map.get(&id).ok_or("no such pty")?;
    let hist = session.history.lock().unwrap_or_else(|e| e.into_inner());
    let tope = bytes.unwrap_or(HIST_OBJETIVO);
    if hist.len() <= tope {
        return Ok(hist.clone());
    }
    let mut corte = hist.len() - tope;
    while corte < hist.len() && !hist.is_char_boundary(corte) {
        corte += 1;
    }
    Ok(hist[corte..].to_string())
}

// async por la misma ley que todo lo que toca la tubería de un panel: el
// `resize` habla con el ConPTY, y el ConPTY de un panel colgado puede no
// contestar JAMÁS. Con esto síncrono, esa llamada se quedaba clavada en el
// hilo de la ventana y la app entera moría con ella — ni teclado, ni menús,
// ni el panel sano de al lado (2026-07-30, la última pieza del «no me deja
// ni escribir»). En async, un resize atascado se pudre él solo en su hilo.
#[tauri::command]
pub async fn pty_resize(state: State<'_, PtyState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    // El candado del mapa se suelta ANTES de tocar el ConPTY.
    let master = {
        let map = state.0.lock().unwrap();
        map.get(&id).ok_or("no such pty")?.master.clone()
    };
    let master = master.lock().map_err(|_| "master envenenado".to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

/// Mata un proceso Y TODO LO QUE CUELGA DE ÉL.
///
/// Matar al hijo directo no basta y ese era el fallo: `claude.exe` es un
/// lanzador que abre el agente de verdad como proceso aparte, así que cerrar la
/// terminal mataba el lanzador y dejaba al agente vivo, corriendo por su cuenta
/// y gastando cuota sin ventana donde verlo. Munir acabó con doce `claude.exe`
/// sueltos en la máquina y con sesiones que seguían apareciendo como abiertas
/// después de darles a la X (2026-07-30).
///
/// `/T` es la rama entera, `/F` sin preguntar. Y sin ventana: sin el flag, cada
/// cierre de panel asoma una consola negra un instante.
#[cfg(windows)]
fn matar_rama(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .sin_ventana()
        .output();
}

/// Lo mismo en Linux, y sale más barato que en Windows: `portable-pty` abre
/// cada terminal en su propia SESIÓN, así que el hijo es líder de un grupo de
/// procesos que lleva su mismo número. Una señal a `-pid` va al grupo entero,
/// que es exactamente la rama que hay que matar, sin llamar a ningún programa
/// de fuera.
///
/// Primero por las buenas (TERM) y, si sigue ahí, por las malas (KILL): un
/// agente a medias tiene cosas que cerrar, y matarlo en seco le deja el
/// transcript a medio escribir.
#[cfg(not(windows))]
fn matar_rama(pid: u32) {
    let grupo = -(pid as i32);
    // SAFETY: `kill` con un pgid negativo es la llamada de siempre; no toca
    // memoria nuestra y el peor caso es un ESRCH que no nos importa.
    unsafe {
        libc::kill(grupo, libc::SIGTERM);
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
    unsafe {
        libc::kill(grupo, libc::SIGKILL);
    }
}

#[tauri::command]
pub async fn pty_kill(state: State<'_, PtyState>, id: u32) -> Result<(), String> {
    // El PID se saca y se suelta el candado ANTES de llamar a taskkill: esperar
    // a un proceso externo con el mapa bloqueado congela cualquier otra
    // terminal que quiera escribir mientras tanto.
    let pid = {
        let mut map = state.0.lock().unwrap();
        match map.get_mut(&id) {
            Some(session) => {
                let _ = session.killer.kill();
                session.pid
            }
            None => return Ok(()),
        }
    };
    if let Some(pid) = pid {
        matar_rama(pid);
    }
    Ok(())
}

/// Cierra TODAS las terminales. Se llama cuando Adeorq se va a cerrar.
///
/// Sin esto, darle a la X de la ventana hacía desaparecer la interfaz y dejaba
/// a los agentes corriendo en segundo plano: sin ventana donde verlos, sin
/// forma de pararlos que no fuera el Administrador de tareas, y gastando cuota
/// mientras tanto. Munir los encontraba «todavía activos» al volver a abrir
/// (2026-07-30).
///
/// Solo toca lo que ha abierto Adeorq: lo que hay en `PtyState` y nada más.
/// Buscar procesos por nombre sería más «completo» y mucho peor, porque se
/// llevaría por delante la app de escritorio de Claude y cualquier terminal que
/// él tenga abierta por su cuenta.
pub fn kill_all(app: &AppHandle) {
    let pids: Vec<u32> = {
        let state = app.state::<PtyState>();
        let Ok(mut map) = state.0.lock() else {
            return;
        };
        map.values_mut()
            .filter_map(|s| {
                let _ = s.killer.kill();
                s.pid
            })
            .collect()
    };
    for pid in pids {
        matar_rama(pid);
    }
}

/// Los proyectos del panel: las subcarpetas de la carpeta madre, más los que el
/// usuario haya añadido a mano desde cualquier sitio del disco (`extras`).
///
/// `sin_raiz` es quien no tiene carpeta madre y no la quiere: sus proyectos son
/// exactamente los `extras`, y sin este flag habría que inventarle una carpeta
/// para leerla, que es como sus Descargas acababan pareciendo un repositorio.
#[tauri::command]
pub fn list_projects(
    raiz: Option<String>,
    sin_raiz: Option<bool>,
    extras: Option<Vec<String>>,
) -> Result<Vec<Project>, String> {
    let mut projects: Vec<Project> = Vec::new();
    if sin_raiz != Some(true) {
        let base = crate::workspace::raiz_de(raiz);
        projects = std::fs::read_dir(&base)
            .map_err(|e| format!("{}: {e}", base.display()))?
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') || name.starts_with('_') || name == "node_modules" {
                    return None;
                }
                let path = entry.path();
                let has_git = path.join(".git").exists();
                Some(Project {
                    name,
                    path: path.to_string_lossy().into_owned(),
                    has_git,
                })
            })
            .collect();
    }
    // Y los de fuera. Una carpeta que ya no está se calla en vez de romper la
    // lista entera: un disco desconectado no puede dejarte sin panel.
    for ruta in extras.unwrap_or_default() {
        let path = std::path::PathBuf::from(ruta.trim_end_matches(['\\', '/']));
        if !path.is_dir() {
            continue;
        }
        let ya = path.to_string_lossy().to_lowercase();
        if projects.iter().any(|p| p.path.to_lowercase() == ya) {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        projects.push(Project {
            name,
            has_git: path.join(".git").exists(),
            path: path.to_string_lossy().into_owned(),
        });
    }
    projects.sort_by(|a, b| {
        b.has_git
            .cmp(&a.has_git)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(projects)
}

#[cfg(test)]
mod tests {
    use super::{recortar_historial, tomar, vaciar_pase_lo_que_pase, Fin, HIST_OBJETIVO, HIST_TOPE};
    use std::sync::Mutex;

    /// Silencia el mensaje de pánico mientras corre el bloque: estos tests los
    /// PROVOCAN a propósito y su rastro en la salida solo confunde al leerla.
    fn sin_ruido<T>(f: impl FnOnce() -> T) -> T {
        let anterior = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let salida = f();
        std::panic::set_hook(anterior);
        salida
    }

    /// Una terminal que revienta las primeras veces que se la lee, y luego se
    /// porta bien. Hace de cualquier descuido futuro dentro del lector.
    struct TerminalQueRevienta {
        sustos: u32,
        entregado: bool,
    }

    impl std::io::Read for TerminalQueRevienta {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if self.sustos > 0 {
                self.sustos -= 1;
                panic!("un descuido cualquiera dentro del lector");
            }
            if self.entregado {
                return Ok(0); // el proceso cerró su salida: fin normal
            }
            self.entregado = true;
            let dato = b"hola, sigo vivo";
            buf[..dato.len()].copy_from_slice(dato);
            Ok(dato.len())
        }
    }

    /// LO QUE COSTÓ UNA NOCHE: un pánico dentro del lector mataba el hilo, y
    /// sin lector nadie vacía la terminal y el agente se queda bloqueado al
    /// escribir. Ahora el pánico se recoge y se sigue vaciando.
    #[test]
    fn un_panico_no_mata_al_lector() {
        let hist = Mutex::new(String::new());
        let (tx, rx) = std::sync::mpsc::channel();
        let mut pending = Vec::new();
        let mut escuchan = true;
        let mut terminal = TerminalQueRevienta {
            sustos: 1,
            entregado: false,
        };

        let fin = sin_ruido(|| {
            vaciar_pase_lo_que_pase(7, &mut terminal, &mut pending, &hist, &tx, &mut escuchan)
        });

        assert_eq!(fin, Fin::Limpio, "tenia que llegar hasta el final del todo");
        assert_eq!(
            rx.recv().unwrap(),
            "hola, sigo vivo",
            "y entregar lo que llego DESPUES del panico"
        );
    }

    /// Pero si el pánico vuelve en cada vuelta, no se gira en el vacío: se
    /// abandona diciéndolo, para que el panel pueda plantar el «⚡ Reanimar».
    #[test]
    fn si_el_panico_vuelve_siempre_se_rinde_y_lo_cuenta() {
        let hist = Mutex::new(String::new());
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut pending = Vec::new();
        let mut escuchan = true;
        let mut terminal = TerminalQueRevienta {
            sustos: u32::MAX,
            entregado: false,
        };

        let fin = sin_ruido(|| {
            vaciar_pase_lo_que_pase(7, &mut terminal, &mut pending, &hist, &tx, &mut escuchan)
        });

        assert_eq!(fin, Fin::Roto, "tenia que rendirse contandolo");
    }

    /// Un pánico con el candado del historial en la mano lo envenena para
    /// siempre. Eso NO puede costar el historial del panel: es texto, no un
    /// invariante que respetar.
    #[test]
    fn un_candado_envenenado_no_pierde_el_historial() {
        let hist = std::sync::Arc::new(Mutex::new(String::from("lo que llevaba dicho")));
        let otro = hist.clone();
        let _ = sin_ruido(|| {
            std::thread::spawn(move || {
                let _guardia = otro.lock().unwrap();
                panic!("revienta con el candado cogido");
            })
            .join()
        });

        assert!(hist.lock().is_err(), "el candado tenia que estar envenenado");
        assert_eq!(&*tomar(&hist), "lo que llevaba dicho");
    }

    /// El pánico que congelaba las terminales, reproducido.
    ///
    /// El recorte viejo hacía `hist[hist.len() - 100_000..]`, cortando la
    /// cadena por un byte a ciegas. Basta con que ese byte caiga en mitad de un
    /// carácter para que Rust reviente y se lleve por delante el hilo lector
    /// del PTY — y con él la única cosa que vacía la terminal. Aquí el
    /// historial es todo de caracteres de tres bytes, así que dos de cada tres
    /// posiciones posibles son un corte ilegal.
    #[test]
    fn recortar_no_revienta_a_mitad_de_un_caracter() {
        // Los que de verdad pinta un agente: cajas, viñetas y acentos.
        for relleno in ["─", "│", "●", "⎿", "á"] {
            let mut hist = relleno.repeat(HIST_TOPE); // muy por encima del tope
            let antes = hist.len();
            recortar_historial(&mut hist); // <- el viejo entraba en pánico aquí
            assert!(hist.len() < antes, "tiene que recortar con {relleno}");
            // Deja los 100 KB pedidos menos, como mucho, lo que mida un
            // carácter: el corte se corre hasta un límite legal.
            assert!(
                hist.len() + 4 >= HIST_OBJETIVO,
                "se ha pasado recortando con {relleno}: quedan {} bytes",
                hist.len()
            );
            // Y lo que queda sigue siendo texto legal, no medio carácter.
            assert!(
                std::str::from_utf8(hist.as_bytes()).is_ok(),
                "el historial ha quedado roto con {relleno}"
            );
        }
    }

    /// Por debajo del tope no se toca: recortar en cada trozo leído era mover
    /// 100 KB por cada 8 KB que llegaban, en el hilo que no puede ir lento.
    #[test]
    fn por_debajo_del_tope_no_se_toca() {
        let mut hist = "a".repeat(HIST_TOPE);
        recortar_historial(&mut hist);
        assert_eq!(hist.len(), HIST_TOPE, "no debia recortar nada todavia");
    }

    /// Recortar deja el historial empezando en una línea limpia cuando puede.
    #[test]
    fn empieza_en_una_linea_limpia() {
        let mut hist = "x".repeat(HIST_TOPE);
        hist.push('\n');
        hist.push_str(&"y".repeat(HIST_OBJETIVO));
        recortar_historial(&mut hist);
        assert!(
            hist.starts_with('y'),
            "deberia arrancar justo despues del salto de linea"
        );
    }
}
