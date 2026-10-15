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
    /// Si el programa de este panel está dibujando en la pantalla alternativa,
    /// o sea si el scroll es SUYO y no de Adeorq. Lo mantiene el lector (ver
    /// `marcar_pantalla`) y lo cuenta `get_active_panes` del MCP.
    pub pantalla_alternativa: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// Si el programa pidió el pegado entre corchetes (modo 2004). Claude Code
    /// lo pide; una PowerShell pelada, no. Lo usa `send_command` del MCP.
    pub pegado: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

/// El mapa de terminales. Detrás de un `Arc` para que el hilo que espera a cada
/// hijo pueda quitarlo del mapa sin pasar por Tauri: el mismo mapa lo usa la
/// app y, desde la etapa 1 de `terminales-fuera.md`, el proceso de terminales.
pub type Mapa = std::sync::Arc<Mutex<HashMap<u32, PtySession>>>;

#[derive(Default)]
pub struct PtyState(pub Mapa);

/// A dónde va lo que dicen las terminales. En la app, a la ventana como
/// eventos (`pty-data`, `pty-exit`, `pty-mudo`); en el proceso de terminales,
/// al cliente que esté enganchado, si hay alguno. Lo llaman los hilos de cada
/// panel: no puede bloquear (ver la nota del emisor en `abrir`).
pub trait Salida: Send + Sync + 'static {
    fn datos(&self, id: u32, texto: String);
    fn fin(&self, id: u32, code: Option<u32>);
    fn mudo(&self, id: u32);
}

/// La salida de la app: los eventos que escucha `TerminalPane`.
pub struct SalidaVentana(pub AppHandle);

impl Salida for SalidaVentana {
    fn datos(&self, id: u32, data: String) {
        let _ = self.0.emit("pty-data", PtyData { id, data });
    }
    fn fin(&self, id: u32, code: Option<u32>) {
        let _ = self.0.emit("pty-exit", PtyExit { id, code });
    }
    fn mudo(&self, id: u32) {
        let _ = self.0.emit("pty-mudo", PtyMudo { id });
    }
}

/// Lo que hace falta para abrir una terminal.
#[derive(Clone, Debug, serde::Deserialize, Serialize)]
pub struct Alta {
    pub id: u32,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub command: Option<Vec<String>>,
    /// El entorno propio de este panel (hoy, `CLAUDE_CONFIG_DIR`, que es lo que
    /// hace que una terminal sea de una cuenta). Un valor `@secreto:` se cambia
    /// por la clave aquí dentro, en quien abre el proceso.
    pub env: Option<HashMap<String, String>>,
}

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
///
/// Y lo que queda EMPIEZA por los modos que el programa tenía puestos en el
/// corte (`modos_terminal`). Sin eso, el `ESC[?1049h` con el que Claude Code
/// abre su pantalla completa se caía por delante a los pocos minutos, y toda
/// terminal que renacía de aquí (ventana suelta, vuelta al tablero, rescate)
/// nacía en la pantalla normal con el programa dibujando la otra: la rueda la
/// cogía Adeorq y congelaba la salida (Munir, 2026-09-21).
pub(crate) fn recortar_historial(hist: &mut String) {
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
    let (corte, preambulo) = crate::modos_terminal::cortar(hist, corte);
    hist.drain(..corte);
    hist.insert_str(0, &preambulo);
}

/// El candado del historial NO puede tumbar a nadie: guarda un búfer de texto,
/// no un invariante que respetar. Si un pánico lo dejó envenenado se recupera
/// lo que hubiera dentro y se sigue, porque lo contrario sería dejar un panel
/// sin historial para siempre por un susto del que ya nos hemos levantado.
pub(crate) fn tomar(hist: &Mutex<String>) -> std::sync::MutexGuard<'_, String> {
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
    alternativa: &std::sync::atomic::AtomicBool,
    pegado: &std::sync::atomic::AtomicBool,
    cola_modos: &mut Vec<u8>,
) -> Fin {
    let mut sustos = 0u32;
    loop {
        let vuelta = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            vaciar(reader, pending, history, tx, escuchan, alternativa, pegado, cola_modos)
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
/// Si el programa de un panel está dibujando en la PANTALLA ALTERNATIVA.
///
/// Se mira aquí, en el lector, porque es el único sitio por el que pasan todos
/// los bytes del proceso: `ESC[?1049h` la abre y `ESC[?1049l` la cierra. Sirve
/// para contestar de un vistazo la pregunta que costó dos sesiones enteras
/// («¿este panel va con el renderizador fullscreen de Claude Code o con el
/// clásico?»), que decide QUIÉN hace el scroll: el programa o Adeorq. Sale por
/// `get_active_panes` del MCP, al lado del tamaño.
pub(crate) fn marcar_pantalla(
    trozo: &[u8],
    cola: &mut Vec<u8>,
    alternativa: &std::sync::atomic::AtomicBool,
    pegado: &std::sync::atomic::AtomicBool,
) {
    // Una secuencia de siete bytes puede llegar partida entre dos lecturas, así
    // que se mira sobre la cola anterior más el trozo nuevo.
    let mut visto: Vec<u8> = Vec::with_capacity(cola.len() + trozo.len());
    visto.extend_from_slice(cola);
    visto.extend_from_slice(trozo);
    let ultima = |aguja: &[u8]| visto.windows(aguja.len()).rposition(|w| w == aguja);
    // Manda la ÚLTIMA de las dos: en un mismo trozo puede haber un ciclo entero.
    let marcar = |abre: &[u8], cierra: &[u8], modo: &std::sync::atomic::AtomicBool| {
        match (ultima(abre), ultima(cierra)) {
            (Some(a), Some(c)) => modo.store(a > c, std::sync::atomic::Ordering::Relaxed),
            (Some(_), None) => modo.store(true, std::sync::atomic::Ordering::Relaxed),
            (None, Some(_)) => modo.store(false, std::sync::atomic::Ordering::Relaxed),
            (None, None) => {}
        }
    };
    marcar(b"\x1b[?1049h", b"\x1b[?1049l", alternativa);
    // Y si el programa pidió el pegado entre corchetes (2004): es lo que decide
    // cómo le manda texto `send_command` del MCP, ver `mcp.rs`.
    marcar(b"\x1b[?2004h", b"\x1b[?2004l", pegado);
    let desde = visto.len().saturating_sub(7);
    *cola = visto[desde..].to_vec();
}

fn vaciar<R: Read>(
    reader: &mut R,
    pending: &mut Vec<u8>,
    history: &Mutex<String>,
    tx: &std::sync::mpsc::Sender<String>,
    escuchan: &mut bool,
    alternativa: &std::sync::atomic::AtomicBool,
    pegado: &std::sync::atomic::AtomicBool,
    cola_modos: &mut Vec<u8>,
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
                marcar_pantalla(&buf[..n], cola_modos, alternativa, pegado);
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
    let alta = Alta { id, cwd, cols, rows, command, env };
    if let Some(r) = crate::terminales::remoto(&app) {
        return tauri::async_runtime::spawn_blocking(move || r.crear(alta)).await.map_err(|e| e.to_string())?;
    }
    abrir(&state.0, alta, std::sync::Arc::new(SalidaVentana(app)))
}

/// Abre una terminal y la mete en el mapa. Es todo `pty_spawn` sin Tauri
/// dentro: lo que el panel dice va a `salida`, y es el mismo código el que
/// corre en la app y en el proceso de terminales.
pub fn abrir(mapa: &Mapa, alta: Alta, salida: std::sync::Arc<dyn Salida>) -> Result<(), String> {
    let Alta { id, cwd, cols, rows, command, env } = alta;
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
    if mapa.lock().unwrap_or_else(|e| e.into_inner()).contains_key(&id) {
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
    // El renderizador de Claude Code lo elige Claude Code, no Adeorq.
    //
    // La 0.9.158 (2026-09-11) ponía aquí `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`
    // para forzar el renderizador clásico, porque el «fullscreen» (pantalla
    // alternativa, ratón, scroll propio) había dejado a Munir sin poder subir por
    // sus conversaciones. Pero la causa no era ese renderizador: era que
    // `TerminalPane` congelaba la salida al ver la rueda, y en la pantalla
    // alternativa la rueda es del programa. Eso se arregló en el front ese mismo
    // día, y la variable sobraba. Peor: pisaba una decisión suya. Ese modo está
    // en SUS ajustes (`~/.claude/settings.json`, `"tui": "fullscreen"`, puesto el
    // 2026-09-10 a las 20:30), y en Windows Terminal lo tendría; aquí no.
    //
    // Y es justo el modo que resuelve lo que ninguna terminal puede resolver:
    // con el clásico, el texto viejo queda envuelto con saltos duros al ancho
    // de entonces (el «hueco» al maximizar, las palabras partidas al abrir un
    // panel); con el fullscreen es el propio Claude Code quien vuelve a dibujar
    // la conversación entera al ancho nuevo. Medido en un ConPTY de verdad
    // (`cargo test --lib fullscreen_en_conpty -- --ignored --nocapture`, 2.1.269):
    // al ensanchar de 100 a 140 columnas redibuja a 140, y seis golpes de rueda
    // SGR (lo que manda xterm) devuelven 42 KB con el principio de la
    // conversación. Si un día hace falta el clásico, `/tui default` dentro de
    // Claude Code lo pone para todas las terminales, incluida esta; y una
    // variable puesta en el sistema se hereda igual que siempre.
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
    let alternativa = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let alternativa_lector = alternativa.clone();
    let pegado = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let pegado_lector = pegado.clone();

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

    let salida_lector = salida.clone();
    std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::new();
        let mut escuchan = true;
        let mut cola_modos: Vec<u8> = Vec::new();
        let fin = vaciar_pase_lo_que_pase(
            id,
            &mut reader,
            &mut pending,
            &history_reader,
            &tx,
            &mut escuchan,
            &alternativa_lector,
            &pegado_lector,
            &mut cola_modos,
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
            salida_lector.mudo(id);
        }
        // Al soltar `tx` aquí, el emisor termina solo.
    });

    let salida_emisor = salida.clone();
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
            salida_emisor.datos(id, lote);
        }
    });

    // El insert va ANTES de arrancar el hilo que espera al hijo, y el orden es
    // el arreglo: con un proceso que muere al instante (CLI sin login, un
    // argumento inválido, un perfil de shell que aborta), el `remove` del
    // waiter corría antes que este insert, no encontraba nada, y la sesión
    // muerta se quedaba en el mapa para siempre. `pty_spawn` la veía y devolvía
    // éxito sin arrancar nada: una terminal en blanco que no revive jamás.
    mapa.lock().unwrap_or_else(|e| e.into_inner()).insert(
        id,
        PtySession {
            master: std::sync::Arc::new(Mutex::new(pair.master)),
            tx_entrada,
            killer,
            pid,
            cwd,
            command: command_clone,
            history,
            pantalla_alternativa: alternativa,
            pegado,
        },
    );

    let mapa_waiter = mapa.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code());
        mapa_waiter.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
        salida.fin(id, code);
    });

    Ok(())
}

/// ==========================================================================
/// ESCRIBIR UN TEXTO EN UN PANEL COMO LO HARÍA UNA PERSONA
///
/// Medido en el binario de Claude Code (2.1.289, `PJ=800` y su hook de pegado):
/// un trozo de más de 800 caracteres que le llega de golpe lo toma por un
/// PEGADO, y lo que hay dentro va a la caja tal cual, el `\r` incluido. Así
/// que «texto\r» en un solo `write` dejaba el mensaje escrito, con el aviso
/// «Removed 1 invisible character · review and press Enter to send», y quien
/// lo mandó creía que había salido (la sesión del radar, cuatro veces en una
/// noche, 2026-09-22; y el conserje y el chat de una sesión hacían lo mismo).
/// Un Intro que llega mientras el pegado aún se procesa lo guarda y lo pulsa
/// al acabar: justo lo que hace un Intro aparte. Por eso el texto y el Intro
/// van en dos escrituras con un respiro entre medias.
///
/// Si el programa pidió el pegado entre corchetes (modo 2004, que Claude Code
/// pide al arrancar), el texto va envuelto como lo mandaría una terminal de
/// verdad: `ESC[200~` … `ESC[201~`. Así es un pegado limpio, del tamaño que
/// sea. A una consola que no lo pidió (una PowerShell pelada) se le escribe
/// tal cual, que ahí los corchetes saldrían pintados.
/// ==========================================================================

/// Entre dos teclas, o entre el texto y su Intro. El pegado de Claude Code se
/// cierra en el tick siguiente; esto son muchos.
pub const ESPACIO_ENTRE_TECLAS: std::time::Duration = std::time::Duration::from_millis(120);

/// Los paneles que tienen terminal ahora mismo. Lo usan las decisiones para
/// saber si quien preguntó sigue ahí (`decisiones::vigencia`).
pub fn paneles_abiertos(app: &AppHandle) -> Vec<u32> {
    if let Some(r) = crate::terminales::remoto(app) {
        return r.fichas().into_iter().map(|f| f.id).collect();
    }
    let state = app.state::<PtyState>();
    let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    map.keys().copied().collect()
}

// ─── LO QUE SE PUEDE PREGUNTAR DE UNA TERMINAL ─────────────────────────────
//
// El resto de la app (el MCP, la ventana suelta, el pulso, las decisiones)
// pregunta por aquí y no mete la mano en el mapa. Es la costura para sacar las
// terminales a su propio proceso (`docs/contexto/terminales-fuera.md`): el día
// que vivan allí, cambia lo de dentro de estas funciones y nada de fuera.
// Todas cogen el candado del mapa lo justo para copiar y lo sueltan: es el
// mismo que atraviesa cada tecla.

/// Lo que se sabe de una terminal sin tocar su proceso.
#[derive(Clone, Debug)]
pub struct Ficha {
    pub id: u32,
    pub cwd: String,
    pub command: Option<Vec<String>>,
    pub pid: Option<u32>,
    /// «COLSxFILAS» que el PROCESO cree tener; `None` si su ConPTY está
    /// ocupado en un resize (se pregunta con `try_lock`: una consulta no puede
    /// quedarse colgada con un ConPTY colgado).
    pub tamano: Option<String>,
    /// En la pantalla alternativa el scroll es del programa (ver `marcar_pantalla`).
    pub alternativa: bool,
    /// Si pidió el pegado entre corchetes (modo 2004).
    pub pegado: bool,
}

fn ficha_de(id: u32, s: &PtySession) -> Ficha {
    let tamano = match s.master.try_lock() {
        Ok(m) => Some(m.get_size().map(|t| format!("{}x{}", t.cols, t.rows)).unwrap_or_else(|_| "?".into())),
        Err(_) => None,
    };
    Ficha {
        id,
        cwd: s.cwd.clone(),
        command: s.command.clone(),
        pid: s.pid,
        tamano,
        alternativa: s.pantalla_alternativa.load(std::sync::atomic::Ordering::Relaxed),
        pegado: s.pegado.load(std::sync::atomic::Ordering::Relaxed),
    }
}

/// Si esa terminal existe ahora mismo.
pub fn existe(app: &AppHandle, id: u32) -> bool {
    if let Some(r) = crate::terminales::remoto(app) {
        return r.existe(id);
    }
    let state = app.state::<PtyState>();
    let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    map.contains_key(&id)
}

/// La ficha de una terminal, si existe.
pub fn ficha(app: &AppHandle, id: u32) -> Option<Ficha> {
    if let Some(r) = crate::terminales::remoto(app) {
        return r.fichas().into_iter().find(|f| f.id == id);
    }
    let state = app.state::<PtyState>();
    let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    map.get(&id).map(|s| ficha_de(id, s))
}

/// Las fichas de todas, por número.
pub fn fichas(app: &AppHandle) -> Vec<Ficha> {
    if let Some(r) = crate::terminales::remoto(app) {
        return r.fichas();
    }
    fichas_de(&app.state::<PtyState>().0)
}

/// Lo último que dijo una terminal, como mucho `limite` bytes y cortado por un
/// límite de carácter (cortar UTF-8 por un byte a ciegas es un pánico, ver
/// `recortar_historial`), y si está en la pantalla alternativa.
pub fn cola_del_historial(app: &AppHandle, id: u32, limite: usize) -> Option<(String, bool)> {
    let (historial, alternativa) = match crate::terminales::remoto(app) {
        Some(r) => r.historia(id)?,
        None => {
            let state = app.state::<PtyState>();
            let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
            let s = map.get(&id)?;
            (s.history.clone(), s.pantalla_alternativa.load(std::sync::atomic::Ordering::Relaxed))
        }
    };
    let hist = tomar(&historial);
    let len = hist.len();
    if len <= limite {
        return Some((hist.clone(), alternativa));
    }
    let mut corte = len - limite;
    while corte < len && !hist.is_char_boundary(corte) {
        corte += 1;
    }
    Some((hist[corte..].to_string(), alternativa))
}

/// Una terminal que ya corre al abrir la ventana: la que aguantó en el proceso
/// de terminales mientras la app se caía (`terminales.rs`).
#[derive(Serialize)]
pub struct Viva {
    pub id: u32,
    pub cwd: String,
    pub command: Option<Vec<String>>,
}

/// Las terminales vivas, para que el tablero que se restaura se reenganche a
/// ellas en vez de abrir otras. Sin el proceso de terminales, al abrir la app
/// no hay ninguna.
#[tauri::command(async)]
pub fn pty_vivas(app: AppHandle) -> Vec<Viva> {
    fichas(&app).into_iter().map(|f| Viva { id: f.id, cwd: f.cwd, command: f.command }).collect()
}

/// El primer número de terminal que se puede repartir sin repetir ninguno de
/// esta «vida» (`conserje::arranque`). Con el proceso de terminales, la vida es
/// la suya y no basta con pasar de las vivas: si antes de actualizar hubo una
/// 9 que ya se cerró, una 9 nueva heredaría sus decisiones, sus avisos y sus
/// trabajos del conserje.
#[tauri::command(async)]
pub fn pty_primer_libre(app: AppHandle) -> u32 {
    let vivas = fichas(&app).into_iter().map(|f| f.id).max().unwrap_or(0);
    let usadas = crate::terminales::remoto(&app)
        .map(|r| r.mayor.load(std::sync::atomic::Ordering::Relaxed))
        .unwrap_or(0);
    vivas.max(usadas) + 1
}

/// Por el canal del panel, como toda la entrada (ver `tx_entrada`).
pub fn escribir_en_panel(app: &AppHandle, id: u32, bytes: Vec<u8>) -> Result<(), String> {
    let r = match crate::terminales::remoto(app) {
        Some(r) => r.escribir(id, bytes),
        None => escribir(&app.state::<PtyState>().0, id, bytes),
    };
    r.map_err(|e| if e == NO_ESTA { format!("Pane {} not found", id) } else { e })
}

// ─── LAS OPERACIONES, SOBRE EL MAPA ────────────────────────────────────────
//
// Las mismas para la app y para el proceso de terminales. Ninguna espera a
// nada con el candado del mapa cogido: o mandan por un canal, o copian lo que
// necesitan y lo sueltan.

/// Lo que se contesta cuando el panel no existe. Lo esperan así el front y el MCP.
pub const NO_ESTA: &str = "no such pty";

/// Manda bytes a la entrada del panel. Mandar al canal no bloquea nunca: si el
/// panel está colgado, el que espera es SU hilo escritor (ver `tx_entrada`).
pub fn escribir(mapa: &Mapa, id: u32, bytes: Vec<u8>) -> Result<(), String> {
    let map = mapa.lock().unwrap_or_else(|e| e.into_inner());
    let session = map.get(&id).ok_or(NO_ESTA)?;
    session.tx_entrada.send(bytes).map_err(|_| "pty cerrado".to_string())
}

/// Lo que ya se ha dicho en ese panel, como mucho `bytes` (ver `pty_historial`).
pub fn historial(mapa: &Mapa, id: u32, bytes: Option<usize>) -> Result<String, String> {
    let hist = {
        let map = mapa.lock().unwrap_or_else(|e| e.into_inner());
        map.get(&id).ok_or(NO_ESTA)?.history.clone()
    };
    let hist = tomar(&hist);
    let tope = bytes.unwrap_or(HIST_OBJETIVO);
    if hist.len() <= tope {
        return Ok(hist.clone());
    }
    let (corte, preambulo) = crate::modos_terminal::cortar(&hist, hist.len() - tope);
    Ok(format!("{preambulo}{}", &hist[corte..]))
}

/// Cambia el tamaño del ConPTY de un panel. BLOQUEA (es `ResizePseudoConsole`):
/// se llama desde un hilo de bloqueo, nunca desde la ventana. Ver `pty_resize`.
pub fn tamano(mapa: &Mapa, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    // El candado del mapa se suelta ANTES de tocar el ConPTY.
    let master = {
        let map = mapa.lock().unwrap_or_else(|e| e.into_inner());
        map.get(&id).ok_or(NO_ESTA)?.master.clone()
    };
    let master = master.try_lock().map_err(|e| match e {
        std::sync::TryLockError::WouldBlock => "ocupado: otro resize en curso en este panel".to_string(),
        std::sync::TryLockError::Poisoned(_) => "master envenenado".to_string(),
    })?;
    master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

/// Si en la rama de procesos de `pid` hay un Claude Code vivo.
fn claude_en_la_rama(pid: u32, procesos: &[(u32, u32, String)]) -> bool {
    let mut rama = vec![pid];
    let mut i = 0;
    while i < rama.len() {
        let padre = rama[i];
        for (hijo, p, nombre) in procesos {
            if *p == padre && !rama.contains(hijo) {
                if nombre.to_ascii_lowercase().starts_with("claude") {
                    return true;
                }
                rama.push(*hijo);
            }
        }
        i += 1;
    }
    false
}

/// Despedir a un programa por las buenas: hasta tres Ctrl+C, y esperar a que
/// se vaya. Devuelve si se fue.
///
/// Por qué (2026-10-15): Claude Code apunta cada arranque en pantalla completa
/// en `fullscreenBootPending` del `~/.claude.json` y lo borra al cerrarse bien.
/// Un proceso que ya no existe con su apunte puesto es un «fallo», y al llegar
/// al tope APAGA la pantalla completa en todo el equipo (`fullscreenAutoDisabled`).
/// Adeorq cerraba con `taskkill /F`: al actualizar, los cuatro paneles de Claude
/// de Munir murieron a la vez y la versión nueva arrancó con la pantalla completa
/// apagada (y con ella la selección que copia sola al arrastrar). Medido en una
/// casa falsa (`doble_ctrl_c_borra_el_apunte_de_pantalla_completa`): con Ctrl+C
/// sale solo y borra su apunte; con `taskkill` el apunte se queda.
///
/// Tres y no dos: si la caja tiene texto, el primero la vacía; si está
/// trabajando, el primero lo interrumpe; en los dos casos hacen falta otros dos.
/// Antes de cada uno se mira si sigue, para no mandarle nada de más.
pub(crate) fn despedir_con(escribir: &dyn Fn(&[u8]), sigue: &dyn Fn() -> bool, espera: std::time::Duration) -> bool {
    use std::time::{Duration, Instant};
    for vez in 0..3 {
        if vez > 0 {
            std::thread::sleep(Duration::from_millis(350));
        }
        if !sigue() {
            return true;
        }
        escribir(b"\x03");
    }
    let inicio = Instant::now();
    while inicio.elapsed() < espera {
        if !sigue() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    !sigue()
}

/// Lo que cuesta despedir a un Claude Code antes de matarlo: lo medido sale en
/// menos de un segundo, y esto es el tope por si no contesta.
const ESPERA_DESPEDIDA: std::time::Duration = std::time::Duration::from_millis(2500);

/// Despide por las buenas a los Claude Code de esas ramas, a la vez, antes de
/// que `matar_rama` acabe con lo que quede. Las ramas sin Claude Code no se
/// tocan: una consola no sale con Ctrl+C, y esperarla sería tiempo perdido.
fn despedir_claudes(paneles: &[(u32, std::sync::mpsc::Sender<Vec<u8>>)]) {
    let procesos = crate::pulso::foto_procesos();
    let con_claude: Vec<_> = paneles.iter().filter(|(pid, _)| claude_en_la_rama(*pid, &procesos)).collect();
    if con_claude.is_empty() {
        return;
    }
    let escribir = |b: &[u8]| {
        for (_, tx) in &con_claude {
            let _ = tx.send(b.to_vec());
        }
    };
    let sigue = || {
        let ahora = crate::pulso::foto_procesos();
        con_claude.iter().any(|(pid, _)| claude_en_la_rama(*pid, &ahora))
    };
    despedir_con(&escribir, &sigue, ESPERA_DESPEDIDA);
}

/// Mata un panel y toda su rama. Devuelve si existía. Tarda (`taskkill` y la
/// despedida de Claude Code): no desde la ventana.
pub fn matar(mapa: &Mapa, id: u32) -> bool {
    // El PID se saca y se suelta el candado ANTES de despedir y de llamar a
    // taskkill: esperar a un proceso externo con el mapa bloqueado congela
    // cualquier otra terminal que quiera escribir mientras tanto.
    let panel = {
        let map = mapa.lock().unwrap_or_else(|e| e.into_inner());
        match map.get(&id) {
            Some(session) => (session.pid, session.tx_entrada.clone()),
            None => return false,
        }
    };
    if let (Some(pid), tx) = &panel {
        despedir_claudes(&[(*pid, tx.clone())]);
    }
    if let Some(session) = mapa.lock().unwrap_or_else(|e| e.into_inner()).get_mut(&id) {
        let _ = session.killer.kill();
    }
    if let Some(pid) = panel.0 {
        matar_rama(pid);
    }
    true
}

/// Los paneles del mapa que tienen proceso, con su entrada.
fn paneles_con_proceso(mapa: &Mapa) -> Vec<(u32, std::sync::mpsc::Sender<Vec<u8>>)> {
    let Ok(map) = mapa.lock() else {
        return Vec::new();
    };
    map.values().filter_map(|s| s.pid.map(|p| (p, s.tx_entrada.clone()))).collect()
}

/// Despide a todos los Claude Code de la app sin matar nada más: lo que se
/// llama justo antes de que el instalador de una actualización cierre la app
/// de golpe (`terminales_por_actualizar`).
pub fn despedir_todas(app: &AppHandle) {
    despedir_claudes(&paneles_con_proceso(&app.state::<PtyState>().0));
}

/// Mata todas las terminales del mapa, con su rama. Antes despide a la vez a
/// todos los Claude Code (`despedir_claudes`), o cada cierre de Adeorq contaría
/// como un fallo suyo por panel.
pub fn matar_todas(mapa: &Mapa) {
    despedir_claudes(&paneles_con_proceso(mapa));
    let pids: Vec<u32> = {
        let Ok(mut map) = mapa.lock() else {
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

/// Las fichas de un mapa, por número (ver `Ficha`).
pub fn fichas_de(mapa: &Mapa) -> Vec<Ficha> {
    let map = mapa.lock().unwrap_or_else(|e| e.into_inner());
    let mut v: Vec<Ficha> = map.iter().map(|(id, s)| ficha_de(*id, s)).collect();
    v.sort_by_key(|f| f.id);
    v
}

/// El texto como lo mandaría una terminal al pegar, si el programa lo pidió.
/// Los saltos van como `\r`, que es lo que una terminal manda por cada línea
/// pegada; dentro de los corchetes Claude Code los toma como líneas, no como
/// Intros.
pub fn envuelto_para_pegar(texto: &str, pegado: bool) -> Vec<u8> {
    let normal = texto.replace("\r\n", "\n").replace('\n', "\r");
    if pegado {
        format!("\x1b[200~{normal}\x1b[201~").into_bytes()
    } else {
        normal.into_bytes()
    }
}

/// Una respuesta a un menú: un número suelto del 1 al 9. Se TECLEA y sin Intro
/// detrás. Medido el 2026-10-08 contra una pregunta de verdad de Claude Code
/// 2.1.295 (`menu_en_claude`, leyendo su transcript): el «2» pegado no lo ve
/// nadie y el Intro coge la opción marcada, la 1; tecleado, elige la 2 al
/// momento, y un Intro detrás ya contestaría la pregunta SIGUIENTE. Así una
/// sesión que contestó «2» a otra subió con la 1 un commit ajeno a la web
/// pública de Munir.
pub fn es_tecla_de_menu(texto: &str) -> bool {
    matches!(texto.trim().as_bytes(), [b'1'..=b'9'])
}

/// Lo que hizo `mandar_texto` con el texto.
#[derive(Debug, PartialEq)]
pub enum Mandado {
    Pegado,
    Escrito,
    /// Un número de menú: tecleado y sin Intro, aunque se pidiera.
    Tecla,
}

/// Una orden de barra con un bloque de varias líneas detrás (`/compact` con el
/// mensaje de compactación) se parte en la orden y el resto. Pegada entera,
/// Claude Code la toma por un pegado y se la manda al modelo como un prompt
/// (`<pasted_content>/compact …`) sin ejecutar nada; con la orden tecleada y
/// el resto pegado, el bloque le llega entero en `<command-args>`. Medido en la
/// 2.1.294 con un PTY suelto, leyendo su transcript (2026-10-08).
pub fn orden_y_resto(texto: &str) -> Option<(&str, &str)> {
    if !texto.starts_with('/') || !texto.contains('\n') {
        return None;
    }
    let fin = texto.find(char::is_whitespace)?;
    let orden = &texto[..fin];
    let nombre_valido = orden.len() > 1
        && orden[1..].chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.'));
    let resto = texto[fin..].trim_start();
    (nombre_valido && !resto.is_empty()).then_some((orden, resto))
}

/// Escribe el texto y, si se pide, pulsa Intro aparte. Duerme entre medias:
/// nunca desde el hilo de la ventana.
pub fn mandar_texto(app: &AppHandle, id: u32, texto: &str, enviar: bool) -> Result<Mandado, String> {
    let pegado = ficha(app, id).ok_or(format!("Pane {} not found", id))?.pegado;
    // Solo en un programa que pidió el pegado entre corchetes, que es donde
    // hay menús así; en una consola, un «2» es un «2» y lleva su Intro.
    if pegado && es_tecla_de_menu(texto) {
        escribir_en_panel(app, id, texto.trim().as_bytes().to_vec())?;
        return Ok(Mandado::Tecla);
    }
    match orden_y_resto(texto).filter(|_| pegado) {
        Some((orden, resto)) => {
            escribir_en_panel(app, id, format!("{orden} ").into_bytes())?;
            std::thread::sleep(ESPACIO_ENTRE_TECLAS);
            escribir_en_panel(app, id, envuelto_para_pegar(resto, true))?;
        }
        None if !texto.is_empty() => escribir_en_panel(app, id, envuelto_para_pegar(texto, pegado))?,
        None => {}
    }
    if enviar {
        if !texto.is_empty() {
            std::thread::sleep(ESPACIO_ENTRE_TECLAS);
        }
        escribir_en_panel(app, id, b"\r".to_vec())?;
    }
    Ok(if pegado { Mandado::Pegado } else { Mandado::Escrito })
}

/// Lo mismo, para la ventana: el conserje y el chat de una sesión mandan
/// párrafos enteros, y tenían la misma trampa que el MCP.
#[tauri::command(async)]
pub fn pty_send(app: AppHandle, id: u32, texto: String, enviar: bool) -> Result<(), String> {
    mandar_texto(&app, id, &texto, enviar).map(|_| ())
}

#[tauri::command]
pub fn pty_write(app: AppHandle, state: State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    // Corre en el hilo de la ventana a propósito (`hilo.rs`): mandar al canal
    // del panel no bloquea nunca, y al proceso de terminales tampoco (va por
    // el canal de su hilo escritor).
    if let Some(r) = crate::terminales::remoto(&app) {
        return r.escribir(id, data.into_bytes());
    }
    escribir(&state.0, id, data.into_bytes())
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
///
/// Y tampoco parte una secuencia de escape, y lo que devuelve empieza por los
/// modos que el programa tenía puestos en el corte: la terminal que nace de
/// esto tiene que acabar en la MISMA pantalla que la de verdad, con el mismo
/// ratón y el mismo pegado. Ver `modos_terminal`.
#[tauri::command]
pub fn pty_historial(app: AppHandle, state: State<'_, PtyState>, id: u32, bytes: Option<usize>) -> Result<String, String> {
    // Del espejo, en el proceso de terminales: este comando corre en el hilo
    // de la ventana y no puede esperar a la conexión.
    if let Some(r) = crate::terminales::remoto(&app) {
        return r.historial(id, bytes);
    }
    historial(&state.0, id, bytes)
}

// async por la misma ley que todo lo que toca la tubería de un panel: el
// `resize` habla con el ConPTY, y el ConPTY de un panel colgado puede no
// contestar JAMÁS. Con esto síncrono, esa llamada se quedaba clavada en el
// hilo de la ventana y la app entera moría con ella — ni teclado, ni menús,
// ni el panel sano de al lado (2026-07-30, la última pieza del «no me deja
// ni escribir»). En async, un resize atascado se pudre él solo en su hilo.
//
// Y desde la 0.9.159 se pudre en un hilo de BLOQUEO, no en uno del runtime, y
// no espera al candado. `async fn` no basta: el `resize` del ConPTY es una
// llamada síncrona (`ResizePseudoConsole`) y `master.lock()` un `Mutex` de la
// biblioteca estándar, así que un resize colgado se quedaba con un hilo
// trabajador de Tokio entero. Con el tope de 5 s de la cola del front y su
// vigilante de 3 s, cada nuevo intento se ponía a la cola del mismo candado y
// se llevaba otro hilo: con tantos hilos como núcleos, en un par de minutos
// ningún comando `async` de la app contestaba. El congelón otra vez, con
// retardo. `spawn_blocking` usa el conjunto de hilos de bloqueo (cientos), y
// `try_lock` contesta «ocupado» en el acto si hay otro resize en curso en ese
// panel: la cola del front no lo confirma y el vigilante lo vuelve a pedir.
#[tauri::command]
pub async fn pty_resize(app: AppHandle, state: State<'_, PtyState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(r) = crate::terminales::remoto(&app) {
        return tauri::async_runtime::spawn_blocking(move || r.tamano(id, cols, rows)).await.map_err(|e| e.to_string())?;
    }
    let mapa = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || tamano(&mapa, id, cols, rows))
        .await
        .map_err(|e| e.to_string())?
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
pub async fn pty_kill(app: AppHandle, state: State<'_, PtyState>, id: u32) -> Result<(), String> {
    // Se apunta antes de matar: el hilo que espera al hijo puede avisar de su
    // fin en cuanto `matar` le dé la señal, y quien lo escuche tiene que saber
    // ya que lo cerraste tú (`programados.rs`).
    if existe(&app, id) {
        let mut a_mano = CERRADAS_A_MANO.lock().unwrap_or_else(|e| e.into_inner());
        if !a_mano.contains(&id) {
            a_mano.push(id);
        }
    }
    if let Some(r) = crate::terminales::remoto(&app) {
        tauri::async_runtime::spawn_blocking(move || r.matar(id)).await.map_err(|e| e.to_string())??;
        return Ok(());
    }
    let mapa = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || matar(&mapa, id)).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Los paneles que se cerraron DESDE Adeorq (la X, un agente por el MCP, el
/// Capataz) en este arranque. Es lo único que separa «la cerraste tú» de «se
/// murió sola», y de eso depende que un encargo programado cuente o no un
/// fallo (`programados.rs`). Unos cuantos números por sesión de trabajo: no
/// hace falta podarla.
static CERRADAS_A_MANO: Mutex<Vec<u32>> = Mutex::new(Vec::new());

pub fn cerrada_a_mano(id: u32) -> bool {
    CERRADAS_A_MANO.lock().unwrap_or_else(|e| e.into_inner()).contains(&id)
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
    // Con el proceso de terminales, cerrar Adeorq de verdad es despedirse: el
    // proceso mata a todas y se va. Una caída no llega aquí, y entonces
    // aguantan (Munir, 2026-10-11).
    if let Some(r) = crate::terminales::remoto(app) {
        crate::terminales::al_cerrar_la_app(&r);
    }
    matar_todas(&app.state::<PtyState>().0);
}

/// Los proyectos del panel: las subcarpetas de la carpeta madre, más los que el
/// usuario haya añadido a mano desde cualquier sitio del disco (`extras`).
///
/// `sin_raiz` es quien no tiene carpeta madre y no la quiere: sus proyectos son
/// exactamente los `extras`, y sin este flag habría que inventarle una carpeta
/// para leerla, que es como sus Descargas acababan pareciendo un repositorio.
#[tauri::command(async)]
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
    use super::{
        envuelto_para_pegar, marcar_pantalla, orden_y_resto, recortar_historial, tomar, vaciar_pase_lo_que_pase,
        Fin, HIST_OBJETIVO, HIST_TOPE,
    };
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    /// Quién hace el scroll en un panel, leído del propio flujo de bytes.
    ///
    /// Importa acertar: si la marca dice «normal» cuando el programa está
    /// dibujando en la alternativa, un reporte de scroll manda a buscar la causa
    /// en la capa de Adeorq, que ahí ni siquiera actúa.
    mod quien_hace_el_scroll {
        use super::*;

        /// Pasa los trozos por el lector como llegarían de la tubería.
        fn tras(trozos: &[&[u8]]) -> bool {
            let alternativa = AtomicBool::new(false);
            let pegado = AtomicBool::new(false);
            let mut cola = Vec::new();
            for t in trozos {
                marcar_pantalla(t, &mut cola, &alternativa, &pegado);
            }
            alternativa.load(Ordering::Relaxed)
        }

        /// Lo que se le escribe a un panel: a Claude Code, como un pegado de
        /// verdad y sin ningún `\r` suelto dentro; a una consola pelada, tal cual.
        #[test]
        fn el_texto_va_como_pegado_solo_si_el_programa_lo_pidio() {
            assert_eq!(envuelto_para_pegar("hola", true), b"\x1b[200~hola\x1b[201~".to_vec());
            assert_eq!(envuelto_para_pegar("hola", false), b"hola".to_vec());
            // Un salto dentro del texto va como lo manda una terminal al pegar.
            assert_eq!(envuelto_para_pegar("a\nb\r\nc", true), b"\x1b[200~a\rb\rc\x1b[201~".to_vec());
        }

        /// Un número suelto contesta a un menú; lo demás es un mensaje.
        #[test]
        fn solo_un_numero_suelto_es_respuesta_de_menu() {
            use super::super::es_tecla_de_menu;
            for si in ["1", "2", " 9 ", "3\n"] {
                assert!(es_tecla_de_menu(si), "{si:?}");
            }
            for no in ["", "0", "10", "y", "2 por favor", "sí", "1."] {
                assert!(!es_tecla_de_menu(no), "{no:?}");
            }
        }

        /// `/compact` con su bloque: la orden aparte y el bloque entero detrás.
        /// Lo de una línea, lo que no es una orden y la orden sola, tal cual.
        #[test]
        fn una_orden_con_bloque_se_parte_en_orden_y_resto() {
            assert_eq!(orden_y_resto("/compact # Resumen\nlínea 2"), Some(("/compact", "# Resumen\nlínea 2")));
            assert_eq!(orden_y_resto("/compact\n# Resumen\nlínea 2"), Some(("/compact", "# Resumen\nlínea 2")));
            assert_eq!(orden_y_resto("/plugin:orden a\nb"), Some(("/plugin:orden", "a\nb")));
            assert_eq!(orden_y_resto("/compact céntrate en el scroll"), None);
            assert_eq!(orden_y_resto("/compact\n"), None);
            assert_eq!(orden_y_resto("mira /compact\nesto"), None);
            assert_eq!(orden_y_resto("/ruta/de/un/fichero es esta\ny más"), None);
            assert_eq!(orden_y_resto("/ hola\nadiós"), None);
        }

        /// El pegado entre corchetes va por el mismo lector: Claude Code lo pide
        /// al arrancar y lo quita al salir, y `send_command` tiene que saberlo.
        #[test]
        fn el_pegado_entre_corchetes_se_marca_igual() {
            let alternativa = AtomicBool::new(false);
            let pegado = AtomicBool::new(false);
            let mut cola = Vec::new();
            marcar_pantalla(b"\x1b[?1049h\x1b[?20", &mut cola, &alternativa, &pegado);
            assert!(!pegado.load(Ordering::Relaxed));
            marcar_pantalla(b"04h", &mut cola, &alternativa, &pegado);
            assert!(pegado.load(Ordering::Relaxed), "partido entre dos lecturas también cuenta");
            marcar_pantalla(b"\x1b[?2004l\x1b[?1049l", &mut cola, &alternativa, &pegado);
            assert!(!pegado.load(Ordering::Relaxed));
            assert!(!alternativa.load(Ordering::Relaxed));
        }

        #[test]
        fn al_abrir_la_pantalla_alternativa_manda_el_programa() {
            assert!(tras(&[b"[?1049h[2Jhola"]));
        }

        #[test]
        fn al_cerrarla_vuelve_a_mandar_adeorq() {
            assert!(!tras(&[b"[?1049h", b"texto", b"[?1049l"]));
        }

        #[test]
        fn una_secuencia_partida_entre_dos_lecturas_tambien_cuenta() {
            // El caso real: `read` corta donde le toca, no donde conviene.
            assert!(tras(&[b"antes[?10", b"49h[2J"]));
        }

        #[test]
        fn en_el_mismo_trozo_manda_la_ultima() {
            assert!(!tras(&[b"[?1049h dentro [?1049l fuera"]));
            assert!(tras(&[b"[?1049l fuera [?1049h dentro"]));
        }

        #[test]
        fn el_texto_normal_no_cambia_nada() {
            assert!(!tras(&[b"una salida cualquiera
"]));
            assert!(tras(&[b"[?1049h", b"una salida cualquiera
"]));
        }

        #[test]
        fn no_se_confunde_con_otros_modos_parecidos() {
            // `?1049` es el del historial; `?1047` y `?47` son otros búferes que
            // Claude Code no usa, y `?104` a secas no es nada.
            assert!(!tras(&[b"[?1047h[?104h[?47h"]));
        }
    }

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
            vaciar_pase_lo_que_pase(
                7,
                &mut terminal,
                &mut pending,
                &hist,
                &tx,
                &mut escuchan,
                &AtomicBool::new(false),
                &AtomicBool::new(false),
                &mut Vec::new(),
            )
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
            vaciar_pase_lo_que_pase(
                7,
                &mut terminal,
                &mut pending,
                &hist,
                &tx,
                &mut escuchan,
                &AtomicBool::new(false),
                &AtomicBool::new(false),
                &mut Vec::new(),
            )
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

    /// El fallo del 2026-09-21: tras un rato de repintados, el historial de un
    /// Claude Code en pantalla completa ya no decía que lo estaba, y la terminal
    /// que renacía de él nacía en la pantalla normal con el ratón del programa
    /// puesto. Aquí se recorta como lo hace el lector, fotograma a fotograma.
    #[test]
    fn el_historial_recortado_sigue_diciendo_en_que_pantalla_esta_el_programa() {
        let arranque = "\x1b[?1049h\x1b[2J\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?2004h";
        let fotograma =
            "\x1b[?25l\x1b[H● Treinta minutos sin caídas: el radar lleva arriba\x1b[K\r\n\x1b[?25h";
        let mut hist = String::from(arranque);
        for _ in 0..20_000 {
            hist.push_str(fotograma);
            recortar_historial(&mut hist);
        }
        assert!(hist.len() <= HIST_TOPE + 64, "tiene que haber recortado");
        // Lo que se conserva empieza por la pantalla y el ratón del programa,
        // con el cursor como estaba justo en el corte (oculto a mitad de
        // fotograma)...
        assert!(
            hist.starts_with("\x1b[?1049h\x1b[?25l\x1b[?1003h\x1b[?1006h\x1b[?2004h\x1b[?25h"),
            "el historial no empieza por los modos del programa: {:?}",
            &hist[..80]
        );
        // ...y reproducido entero deja la terminal como está la de verdad.
        let (_, al_final) = crate::modos_terminal::cortar(&hist, hist.len());
        assert_eq!(al_final, "\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h");
    }

    /// Lo mismo con los fotogramas DE VERDAD de un panel, para que los mire una
    /// xterm de verdad. El historial se saca del Adeorq en marcha con
    /// `node scripts/laboratorio/renacer-panel.mjs <panel> --guardar <fichero>`,
    /// y aquí se le pone delante el arranque de Claude Code (que ese historial ya
    /// perdió), se pasa por el recorte como lo haría el lector (en vueltas hasta
    /// que haya recortado varias veces) y se corta como `pty_historial`. Lo que sale se juzga con
    /// `node scripts/laboratorio/renacer-panel.mjs --fichero <salida> <cols> <filas>`.
    ///
    /// `ADEORQ_BANCO_HISTORIAL=<fichero> cargo test --lib renacer_con_fotogramas_reales -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn renacer_con_fotogramas_reales() {
        let origen = std::env::var("ADEORQ_BANCO_HISTORIAL").expect("falta ADEORQ_BANCO_HISTORIAL");
        let real = std::fs::read_to_string(&origen).expect("no se pudo leer el historial");
        let arranque = "\x1b[?1049h\x1b[2J\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?2004h\x1b[?1004h";
        let mut hist = String::from(arranque);
        let mut entrado = 0usize;
        while entrado < 3 * HIST_TOPE {
            // De 8 KB en 8 KB, que es lo que lee el lector del PTY.
            let mut resto = real.as_str();
            while !resto.is_empty() {
                let mut n = resto.len().min(8192);
                while !resto.is_char_boundary(n) {
                    n += 1;
                }
                hist.push_str(&resto[..n]);
                recortar_historial(&mut hist);
                entrado += n;
                resto = &resto[n..];
            }
        }
        let (corte, preambulo) = crate::modos_terminal::cortar(&hist, hist.len().saturating_sub(HIST_OBJETIVO));
        let entregado = format!("{preambulo}{}", &hist[corte..]);
        let salida = format!("{origen}.renacido");
        std::fs::write(&salida, &entregado).unwrap();
        println!(
            "entraron {entrado} bytes, el historial guarda {} y pty_historial entrega {} empezando por {:?}\nescrito en {salida}",
            hist.len(),
            entregado.len(),
            preambulo
        );
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

/// Que la variable de entorno deje a Claude Code en su renderizador clásico.
///
/// `cargo test --lib pantalla_alternativa -- --ignored --nocapture`
///
/// Arranca `claude` de verdad en un ConPTY, con `CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER=1`
/// para que se vaya tras el primer dibujo, y mira si escribe `ESC[?1049h` (la
/// pantalla alternativa). Dos veces: sin la variable, como control de que esta
/// versión de Claude Code SÍ entra (con el `tui: "fullscreen"` de los ajustes
/// del usuario); y con ella, que es el interruptor que la 0.9.158 ponía en
/// `pty_spawn` y la 0.9.159 retiró. Se queda como medida del interruptor.
/// Contesta al `ESC[6n` del ConPTY, que sin respuesta deja el proceso mudo y el
/// veredicto al revés (ver la memoria del laboratorio del PTY).
#[cfg(all(test, windows))]
mod pantalla_alternativa {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn arranque_de_claude(sin_pantalla_alternativa: bool) -> Vec<u8> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo abrir el ConPTY");
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/c", "claude"]);
        // Una carpeta sin proyecto: que la prueba no deje sesiones en los suyos.
        cmd.cwd(std::env::temp_dir());
        cmd.env("TERM", "xterm-256color");
        cmd.env("CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER", "1");
        if sin_pantalla_alternativa {
            cmd.env("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN", "1");
        }
        let mut hijo = pair.slave.spawn_command(cmd).expect("no arrancó claude");
        drop(pair.slave);
        let mut lector = pair.master.try_clone_reader().expect("sin lector");
        let mut escritor = pair.master.take_writer().expect("sin escritor");
        let salida = Arc::new(Mutex::new(Vec::new()));
        let recogida = salida.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = lector.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let trozo = &buf[..n];
                if trozo.windows(4).any(|w| w == b"\x1b[6n") {
                    let _ = escritor.write_all(b"\x1b[1;1R");
                }
                recogida.lock().unwrap().extend_from_slice(trozo);
            }
        });
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(25) {
            if let Ok(Some(_)) = hijo.try_wait() {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        let _ = hijo.kill();
        std::thread::sleep(Duration::from_millis(300));
        let v = salida.lock().unwrap().clone();
        v
    }

    #[test]
    #[ignore = "arranca claude de verdad; se lanza a mano"]
    fn la_variable_deja_a_claude_en_el_renderizador_clasico() {
        let alternativa = |b: &[u8]| b.windows(8).any(|w| w == b"\x1b[?1049h");
        let sin_variable = arranque_de_claude(false);
        let con_variable = arranque_de_claude(true);
        println!(
            "\nsin la variable: {} bytes, pantalla alternativa: {}\ncon la variable: {} bytes, pantalla alternativa: {}\n",
            sin_variable.len(),
            alternativa(&sin_variable),
            con_variable.len(),
            alternativa(&con_variable)
        );
        assert!(
            !sin_variable.is_empty() && !con_variable.is_empty(),
            "claude no escribió nada: mira si se contesta al ESC[6n"
        );
        assert!(
            alternativa(&sin_variable),
            "(control) esta versión de Claude Code debería entrar en pantalla alternativa sin la variable"
        );
        assert!(
            !alternativa(&con_variable),
            "con CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 no debería entrar"
        );
    }
}

/// Qué hace el renderizador «fullscreen» de Claude Code en un ConPTY cuando le
/// cambian el ancho y cuando le llega la rueda, medido y no supuesto.
///
/// ```text
/// ADEORQ_BANCO_SESION=<id> ADEORQ_BANCO_CWD=<carpeta> \
///   cargo test --lib fullscreen_en_conpty -- --ignored --nocapture
/// ```
///
/// Hace falta una sesión con conversación: se copia su `.jsonl` a la carpeta de
/// proyecto que Claude Code asocia al `cwd` (`~/.claude/projects/<cwd con «:» y
/// «\» cambiados por «-»>/`) y se arranca `claude --resume <id>` en ese `cwd`.
/// Con el `tui: "fullscreen"` de los ajustes del usuario, el programa entra en
/// la pantalla alternativa; aquí se mira (1) si al ensanchar el ConPTY vuelve a
/// dibujar su caja al ancho nuevo (la tira de `─` más larga antes y después) y
/// (2) si contesta a un evento de rueda SGR (`ESC[<64;x;yM`, lo que manda xterm
/// con el seguimiento del ratón encendido) con un dibujo nuevo. Es lo que
/// decide si Adeorq puede ser una terminal normal con ese renderizador o tiene
/// que seguir forzando el clásico. Que la sesión copiada tenga conversación de
/// verdad (con una de un solo mensaje la rueda «no hace nada»), y al acabar,
/// borrar esa carpeta de `~/.claude/projects/`: si se queda, la sesión copiada
/// sale en la lista de sesiones de Adeorq como un proyecto más.
#[cfg(all(test, windows))]
mod fullscreen_en_conpty {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    fn contiene(b: &[u8], s: &[u8]) -> bool {
        b.windows(s.len()).any(|w| w == s)
    }

    /// La tira más larga de `─` (E2 94 80): el ancho al que se dibujó una caja.
    fn tira_mas_larga(b: &[u8]) -> usize {
        let mut mejor = 0;
        let mut actual = 0;
        let mut i = 0;
        while i + 3 <= b.len() {
            if &b[i..i + 3] == b"\xe2\x94\x80" {
                actual += 1;
                mejor = mejor.max(actual);
                i += 3;
            } else {
                actual = 0;
                i += 1;
            }
        }
        mejor
    }

    /// El texto visible de un trozo, sin secuencias de escape, para leerlo.
    fn texto_plano(b: &[u8]) -> String {
        let s = String::from_utf8_lossy(b);
        let mut fuera = String::new();
        let mut chars = s.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '\x1b' {
                match chars.next() {
                    Some('[') | Some('?') => {
                        while let Some(&n) = chars.peek() {
                            chars.next();
                            if n.is_ascii_alphabetic() || n == '@' || n == '~' {
                                break;
                            }
                        }
                    }
                    Some(']') => {
                        while let Some(n) = chars.next() {
                            if n == '\x07' {
                                break;
                            }
                            if n == '\x1b' {
                                chars.next();
                                break;
                            }
                        }
                    }
                    _ => {}
                }
            } else if !c.is_control() || c == '\n' {
                fuera.push(c);
            }
        }
        fuera.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Espera a que la salida lleve `quieto` sin crecer, o `tope` en total.
    fn esperar_quieto(salida: &Arc<Mutex<Vec<u8>>>, quieto: Duration, tope: Duration) {
        let inicio = Instant::now();
        let mut ultimo = salida.lock().unwrap().len();
        let mut desde = Instant::now();
        while inicio.elapsed() < tope {
            std::thread::sleep(Duration::from_millis(100));
            let ahora = salida.lock().unwrap().len();
            if ahora != ultimo {
                ultimo = ahora;
                desde = Instant::now();
            } else if desde.elapsed() >= quieto {
                return;
            }
        }
    }

    #[test]
    #[ignore = "arranca claude --resume de verdad sobre una sesión copiada; se lanza a mano"]
    fn el_fullscreen_redibuja_al_ancho_nuevo_y_atiende_la_rueda() {
        let sesion = std::env::var("ADEORQ_BANCO_SESION")
            .expect("ADEORQ_BANCO_SESION=<id de la sesión copiada a la carpeta de proyecto del cwd>");
        let cwd = std::env::var("ADEORQ_BANCO_CWD").expect("ADEORQ_BANCO_CWD=<carpeta donde arrancar>");

        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo abrir el ConPTY");
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/c", "claude", "--resume", &sesion]);
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env_remove("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN");
        cmd.env_remove("CLAUDE_CODE_CHILD_SESSION");
        let mut hijo = pair.slave.spawn_command(cmd).expect("no arrancó claude");
        let pid = hijo.process_id().expect("sin pid");
        drop(pair.slave);
        let mut lector = pair.master.try_clone_reader().expect("sin lector");
        let escritor = Arc::new(Mutex::new(pair.master.take_writer().expect("sin escritor")));
        let salida = Arc::new(Mutex::new(Vec::new()));
        let recogida = salida.clone();
        let contesta = escritor.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = lector.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let trozo = &buf[..n];
                if contiene(trozo, b"\x1b[6n") {
                    let _ = contesta.lock().unwrap().write_all(b"\x1b[1;1R");
                }
                recogida.lock().unwrap().extend_from_slice(trozo);
            }
        });

        // 1. Que arranque y dibuje la conversación a 100 columnas.
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(40) {
            if contiene(&salida.lock().unwrap(), b"\x1b[?1049h") {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        esperar_quieto(&salida, Duration::from_secs(3), Duration::from_secs(30));
        let a = salida.lock().unwrap().clone();
        let alternativa = contiene(&a, b"\x1b[?1049h");
        let raton = contiene(&a, b"\x1b[?1006h") || contiene(&a, b"\x1b[?1000h");
        let tira_a = tira_mas_larga(&a);

        // 2. Ensanchar: ¿vuelve a dibujar a 140?
        pair.master
            .resize(PtySize { rows: 40, cols: 140, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo redimensionar");
        esperar_quieto(&salida, Duration::from_secs(2), Duration::from_secs(15));
        let b = salida.lock().unwrap()[a.len()..].to_vec();
        let tira_b = tira_mas_larga(&b);

        // 3. La rueda hacia arriba, como la manda xterm con SGR (botón 64).
        for _ in 0..6 {
            let _ = escritor.lock().unwrap().write_all(b"\x1b[<64;50;15M");
            std::thread::sleep(Duration::from_millis(60));
        }
        esperar_quieto(&salida, Duration::from_secs(2), Duration::from_secs(10));
        let c = salida.lock().unwrap()[a.len() + b.len()..].to_vec();

        /* Por las buenas, no a taskkill: un Claude Code matado a media vida en
           fullscreen deja su marca de arranque huérfana en el `.claude.json` del
           usuario, y a los dos el renderizador se apaga en la máquina ENTERA
           (pasó el 2026-09-12). El porqué entero, en `cerrar_limpio`. */
        let _ = escritor.lock().unwrap().write_all(b"/exit\r");
        let inicio_salida = Instant::now();
        while inicio_salida.elapsed() < Duration::from_secs(10) {
            if matches!(hijo.try_wait(), Ok(Some(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        if !matches!(hijo.try_wait(), Ok(Some(_))) {
            super::matar_rama(pid);
            std::thread::sleep(Duration::from_millis(500));
        }
        super::rueda_en_fullscreen::comprobar_config_limpia();

        println!(
            "\narranque: {} bytes · pantalla alternativa: {alternativa} · ratón pedido: {raton} · caja más ancha: {tira_a}\n\
             tras ensanchar a 140: {} bytes · caja más ancha: {tira_b}\n\
             tras 6 golpes de rueda: {} bytes · vuelve a posicionar el cursor: {}\n",
            a.len(),
            b.len(),
            c.len(),
            contiene(&c, b"\x1b[") && (contiene(&c, b"H") || contiene(&c, b"\x1b[2J")),
        );
        let recorte = |b: &[u8], n: usize| texto_plano(b).chars().take(n).collect::<String>();
        println!("texto del arranque (recortado): {}\n", recorte(&a, 700));
        println!("texto tras ensanchar (recortado): {}\n", recorte(&b, 700));
        println!("texto tras la rueda (recortado): {}\n", recorte(&c, 500));

        assert!(alternativa, "(control) con tui=fullscreen esta versión debería entrar en pantalla alternativa");
        assert!(raton, "el renderizador fullscreen debería pedir el seguimiento del ratón");
        assert!(tira_a >= 60, "no llegó a dibujar la caja a 100 columnas (tira {tira_a})");
        assert!(
            tira_b > tira_a + 20,
            "al ensanchar no redibujó más ancho (antes {tira_a}, después {tira_b})"
        );
        assert!(!c.is_empty(), "la rueda no provocó ninguna respuesta del programa");
    }
}

/// Cuánto salta la conversación de Claude Code por CADA golpe de rueda, y si
/// depende de que la terminal diga quién es.
///
/// ```text
/// python scripts/laboratorio/sesion-numerada.py <carpeta> 400     # deja el id por stdout
/// ADEORQ_BANCO_SESION=<id> ADEORQ_BANCO_CWD=<carpeta> \
///   cargo test --lib rueda_en_fullscreen -- --ignored --nocapture
/// ```
///
/// ── POR QUÉ NUMERADA ─────────────────────────────────────────────────────────
///
/// Munir, 2026-09-12: *«cuando hago scroll hacia arriba una vez sube a la mitad
/// de la conversación al instante»*. Para medir eso hay que saber DÓNDE está la
/// vista antes y después, y con una conversación normal habría que comparar
/// texto y adivinar. `sesion-numerada.py` fabrica una sesión donde cada
/// respuesta es `HITO 0001`, `HITO 0002`… así que los números que el programa
/// dibuja dicen el sitio exacto, y la resta es el salto en renglones.
///
/// ── LO QUE SE MIDE ───────────────────────────────────────────────────────────
///
/// Un golpe de rueda del ratón es UN evento para el programa: xterm manda un
/// solo `ESC[<64;x;yM` por `WheelEvent`, aunque el gesto valga tres renglones
/// (`MouseService._sendEvent`, un único `_triggerMouseEvent`). Así que si un
/// golpe mueve media conversación, quien multiplica es Claude Code, no Adeorq.
/// Y su binario dice de qué depende: `wheelScrollAccelerationEnabled` (por
/// defecto encendida) usa una **curva de decaimiento** en Windows salvo que
/// reconozca al emulador como xterm.js, que responde muchos eventos por gesto
/// («wheelFlood»); lo reconoce por la respuesta a XTVERSION (`ESC[>0q`), que
/// xterm.js contesta con `ESC P>|xterm.js(<versión>) ESC \`
/// (`InputHandler.ts:1775`). Por eso el banco mide las dos: contestando esa
/// consulta y sin contestarla.
#[cfg(all(test, windows))]
mod rueda_en_fullscreen {
    use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    /// La versión de `@xterm/xterm` del `package.json`: lo que contesta el xterm
    /// de un panel cuando le preguntan quién es.
    const XTERM: &str = "6.1.0-beta.302";

    pub(super) struct Panel {
        pub(super) salida: Arc<Mutex<Vec<u8>>>,
        pub(super) escritor: Arc<Mutex<Box<dyn Write + Send>>>,
        _master: Box<dyn MasterPty + Send>,
        hijo: Box<dyn portable_pty::Child + Send + Sync>,
        pid: u32,
    }

    /// Cerrar un Claude Code de laboratorio POR LAS BUENAS, y por qué importa.
    ///
    /// ── LO QUE COSTÓ (2026-09-12) ────────────────────────────────────────────
    ///
    /// Claude Code apunta cada arranque en fullscreen como «pendiente» en el
    /// `~/.claude.json` DEL USUARIO y lo borra al salir bien. Un proceso matado
    /// deja esa marca huérfana, y el arranque siguiente la cuenta como un
    /// arranque fallido; a los dos, escribe `fullscreenAutoDisabled` y **apaga
    /// el renderizador fullscreen en la máquina entera**, no solo en el
    /// laboratorio. Este banco lo hizo: mató cuatro procesos con `taskkill` y
    /// dejó a Munir en el renderizador clásico sin que nadie lo pidiera, además
    /// de estropear su propia medida (las pasadas salían alternando fullscreen
    /// sí y no, y parecía que dependía de lo que se medía).
    ///
    /// Así que se sale con `/exit`, que es lo que hace una persona, y solo se
    /// mata si no obedece. Y al final de cada test, `comprobar_config_limpia()`.
    pub(super) fn cerrar_limpio(p: &mut Panel) {
        let _ = p.escritor.lock().unwrap().write_all(b"/exit\r");
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(10) {
            if matches!(p.hijo.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        // Por las malas, y que se note en la salida del test.
        eprintln!("  (no salió con /exit: se mata, mira el .claude.json al acabar)");
        super::matar_rama(p.pid);
        std::thread::sleep(Duration::from_millis(400));
    }

    /// Que el laboratorio no se haya llevado por delante los ajustes de nadie.
    ///
    /// Se llama al final de cada test de este archivo que arranque un Claude
    /// Code de verdad. Si salta, el arreglo está escrito en el propio mensaje.
    pub(super) fn comprobar_config_limpia() {
        let Ok(perfil) = std::env::var("USERPROFILE") else { return };
        let ruta = std::path::Path::new(&perfil).join(".claude.json");
        let Ok(texto) = std::fs::read_to_string(&ruta) else { return };
        assert!(
            !texto.contains("\"fullscreenAutoDisabled\""),
            "este banco ha dejado el renderizador fullscreen APAGADO en esta máquina \
             (`fullscreenAutoDisabled` en {}). Se quita con el guion \
             `scripts/laboratorio/restaurar-fullscreen.py`, o con `/tui fullscreen` dentro de Claude Code.",
            ruta.display()
        );
    }

    fn contiene(b: &[u8], s: &[u8]) -> bool {
        b.windows(s.len()).any(|w| w == s)
    }

    /// El texto que se VE, sin las secuencias de escape que lo colocan.
    ///
    /// Hace falta para leer los hitos: el renderizador no escribe «HITO 0394»
    /// seguido, escribe `HITO` y luego `ESC[1C` para saltar la columna del
    /// espacio, así que buscar la cadena entera no encuentra ni uno (primera
    /// versión de este banco: cuatro pasadas diciendo «no dibujó ningún hito»
    /// con los hitos delante).
    pub(super) fn sin_escapes(b: &[u8]) -> String {
        let s = String::from_utf8_lossy(b);
        let mut fuera = String::new();
        let mut chars = s.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '\x1b' => match chars.next() {
                    Some('[') => {
                        // CSI: parámetros e intermedios hasta la letra final.
                        for n in chars.by_ref() {
                            if n.is_ascii_alphabetic() || n == '@' || n == '~' {
                                break;
                            }
                        }
                        // Un salto de columna deja hueco, como el espacio que sustituye.
                        fuera.push(' ');
                    }
                    Some(']') | Some('P') => {
                        // OSC y DCS: hasta la campana o el ST.
                        while let Some(n) = chars.next() {
                            if n == '\x07' {
                                break;
                            }
                            if n == '\x1b' {
                                chars.next();
                                break;
                            }
                        }
                    }
                    _ => {}
                },
                c if c.is_control() && c != '\n' => fuera.push(' '),
                c => fuera.push(c),
            }
        }
        fuera
    }

    /// Los `HITO NNNN` que aparecen en un trozo de salida, en orden.
    fn hitos(b: &[u8]) -> Vec<u32> {
        let s = sin_escapes(b);
        let mut fuera = Vec::new();
        let bytes = s.as_bytes();
        let mut i = 0;
        while i + 4 <= bytes.len() {
            if &bytes[i..i + 4] == b"HITO" {
                let resto: String = s[i + 4..]
                    .chars()
                    .skip_while(|c| c.is_whitespace())
                    .take(4)
                    .collect();
                if resto.len() == 4 && resto.chars().all(|c| c.is_ascii_digit()) {
                    if let Ok(v) = resto.parse() {
                        fuera.push(v);
                    }
                }
                i += 4;
            } else {
                i += 1;
            }
        }
        fuera
    }

    /// Abre un panel con `claude --resume` y un hilo que contesta como xterm.
    ///
    /// `decir_quien_soy` es lo único que cambia entre las dos pasadas: contestar
    /// o no a `ESC[>0q`. A `ESC[6n` se contesta SIEMPRE, porque sin eso el
    /// proceso se queda mudo y la medida sale al revés (ver la memoria del
    /// laboratorio del PTY).
    pub(super) fn abrir(sesion: &str, cwd: &str, cols: u16, rows: u16, decir_quien_soy: bool) -> Panel {
        abrir_con(&["--resume", sesion], cwd, cols, rows, decir_quien_soy)
    }

    /// Lo mismo con los argumentos que sean (una sesión nueva con `--session-id`,
    /// otro modelo…).
    pub(super) fn abrir_con(args: &[&str], cwd: &str, cols: u16, rows: u16, decir_quien_soy: bool) -> Panel {
        abrir_en_casa(args, cwd, cols, rows, decir_quien_soy, None)
    }

    /// Lo mismo con otra casa (`USERPROFILE` y `HOME`): su `~/.claude.json` y su
    /// `~/.claude` son los de esa carpeta y no los de Munir. Es lo que hay que
    /// usar para medir cualquier cosa que Claude Code apunte en su configuración.
    pub(super) fn abrir_en_casa(args: &[&str], cwd: &str, cols: u16, rows: u16, decir_quien_soy: bool, casa: Option<&std::path::Path>) -> Panel {
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo abrir el ConPTY");
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/c", "claude"]);
        cmd.args(args);
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        // Lanzado desde una sesión de Claude Code, el hijo hereda sus `CLAUDE*`
        // y se cree su subagente: no guarda transcript, y otras cosas que no se
        // ven. Fuera todas menos la ruta del Git Bash, que la necesita.
        for (k, _) in std::env::vars() {
            if k.starts_with("CLAUDE") && k != "CLAUDE_CODE_GIT_BASH_PATH" {
                cmd.env_remove(&k);
            }
        }
        cmd.env_remove("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN");
        cmd.env_remove("CLAUDE_CODE_SCROLL_SPEED");
        if let Some(casa) = casa {
            cmd.env("USERPROFILE", casa);
            cmd.env("HOME", casa);
        }
        let mut hijo = pair.slave.spawn_command(cmd).expect("no arrancó claude");
        let pid = hijo.process_id().expect("sin pid");
        let _ = &mut hijo;
        drop(pair.slave);
        let mut lector = pair.master.try_clone_reader().expect("sin lector");
        let escritor: Arc<Mutex<Box<dyn Write + Send>>> =
            Arc::new(Mutex::new(pair.master.take_writer().expect("sin escritor")));
        let salida = Arc::new(Mutex::new(Vec::new()));
        let recogida = salida.clone();
        let contesta = escritor.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = lector.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let trozo = &buf[..n];
                let mut respuesta: Vec<u8> = Vec::new();
                if contiene(trozo, b"\x1b[6n") {
                    respuesta.extend_from_slice(b"\x1b[1;1R");
                }
                if decir_quien_soy && contiene(trozo, b"\x1b[>0q") {
                    respuesta.extend_from_slice(format!("\x1bP>|xterm.js({XTERM})\x1b\\").as_bytes());
                }
                if contiene(trozo, b"\x1b[c") {
                    respuesta.extend_from_slice(b"\x1b[?1;2c");
                }
                if !respuesta.is_empty() {
                    let _ = contesta.lock().unwrap().write_all(&respuesta);
                }
                recogida.lock().unwrap().extend_from_slice(trozo);
            }
        });
        Panel { salida, escritor, _master: pair.master, hijo, pid }
    }

    /// Espera a que la salida lleve `quieto` sin crecer, o `tope` en total.
    pub(super) fn esperar_quieto(salida: &Arc<Mutex<Vec<u8>>>, quieto: Duration, tope: Duration) {
        let inicio = Instant::now();
        let mut ultimo = salida.lock().unwrap().len();
        let mut desde = Instant::now();
        while inicio.elapsed() < tope {
            std::thread::sleep(Duration::from_millis(100));
            let ahora = salida.lock().unwrap().len();
            if ahora != ultimo {
                ultimo = ahora;
                desde = Instant::now();
            } else if desde.elapsed() >= quieto {
                return;
            }
        }
    }

    /// Un golpe de rueda hacia arriba: lo que manda xterm por cada `WheelEvent`.
    fn rueda_arriba(p: &Panel, veces: usize, pausa: Duration) {
        for _ in 0..veces {
            let _ = p.escritor.lock().unwrap().write_all(b"\x1b[<64;40;12M");
            std::thread::sleep(pausa);
        }
    }

    /// Dónde está la vista: el hito más pequeño y el más grande de lo último
    /// dibujado. Devuelve `None` si el programa no pintó ningún hito.
    fn donde(b: &[u8]) -> Option<(u32, u32)> {
        let h = hitos(b);
        if h.is_empty() {
            return None;
        }
        Some((*h.iter().min().unwrap(), *h.iter().max().unwrap()))
    }

    fn medir(sesion: &str, cwd: &str, decir_quien_soy: bool, golpes: usize, pausa_ms: u64) -> String {
        let mut p = abrir(sesion, cwd, 100, 30, decir_quien_soy);
        // Hasta que dibuje la conversación de verdad, no hasta que se calle: un
        // `--resume` de 400 turnos tarda en pintar, y medir antes deja la vista
        // de partida vacía, que parece un fallo del programa y no lo es.
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(60) {
            if !hitos(&p.salida.lock().unwrap()).is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        esperar_quieto(&p.salida, Duration::from_secs(3), Duration::from_secs(40));
        let arranque = p.salida.lock().unwrap().clone();
        let alternativa = contiene(&arranque, b"\x1b[?1049h");
        let pregunto = contiene(&arranque, b"\x1b[>0q");
        let antes = donde(&arranque);

        rueda_arriba(&p, golpes, Duration::from_millis(pausa_ms));
        esperar_quieto(&p.salida, Duration::from_millis(1200), Duration::from_secs(12));
        let tras = p.salida.lock().unwrap()[arranque.len()..].to_vec();
        let despues = donde(&tras);

        cerrar_limpio(&mut p);

        /* Cuando no hay hitos, lo que hace falta es lo que el programa DIJO: sin
           esto el banco solo sabe decir «no dibujó nada», que es justo la frase
           que obliga a adivinar. */
        let plano = |b: &[u8], n: usize| -> String {
            let s = String::from_utf8_lossy(b);
            let limpio: String = s
                .chars()
                .filter(|c| !c.is_control() || *c == '\n')
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            limpio.chars().take(n).collect()
        };
        let salto = match (antes, despues) {
            (Some((_, a_max)), Some((d_min, d_max))) => {
                format!("saltó {} renglones (de ~{a_max} a {d_min}..{d_max})", a_max as i64 - d_max as i64)
            }
            (_, None) => format!(
                "el programa no dibujó ningún hito al rodar · dijo: «{}»",
                plano(&tras, 300)
            ),
            (None, _) => format!(
                "no se vio ningún hito en el arranque · dijo: «{}»",
                plano(&arranque, 300)
            ),
        };
        format!(
            "xtversion contestado: {decir_quien_soy} (lo preguntó: {pregunto}) · pantalla alternativa: {alternativa} · \
             {golpes} golpe(s) cada {pausa_ms} ms · vista antes: {antes:?} · después: {despues:?} · {salto} · {} bytes",
            tras.len()
        )
    }

    /// Cuántas veces aparece una secuencia en lo que escribió el programa.
    fn cuantas(b: &[u8], aguja: &[u8]) -> usize {
        if aguja.is_empty() || b.len() < aguja.len() {
            return 0;
        }
        b.windows(aguja.len()).filter(|w| *w == aguja).count()
    }

    /// Las señales sobre las que Adeorq monta su anti-salto en el renderizador
    /// CLÁSICO, contadas en el de hoy.
    ///
    /// `TerminalPane` no adivina cuándo el CLI rehace la pantalla: escucha dos
    /// cosas que el programa dice en voz alta. `ESC[3J` (borrar el historial)
    /// es cuándo apuntar a qué distancia del final estabas, y el bloque de
    /// salida sincronizada (`ESC[?2026h` … `ESC[?2026l`) es cuándo el repintado
    /// terminó y se puede volver a colocar la vista. Si una versión nueva de
    /// Claude Code deja de mandarlas, esa capa no falla: deja de existir, y
    /// vuelve el salto de los doce reportes sin que nadie haya tocado Adeorq.
    /// Por eso se cuentan aquí, y por eso este test dice los números en vez de
    /// limitarse a pasar.
    #[test]
    #[ignore = "arranca claude de verdad en el renderizador clásico; se lanza a mano"]
    fn el_renderizador_clasico_sigue_anunciando_sus_repintados() {
        let sesion = std::env::var("ADEORQ_BANCO_SESION").expect("ADEORQ_BANCO_SESION=<id>");
        let cwd = std::env::var("ADEORQ_BANCO_CWD").expect("ADEORQ_BANCO_CWD=<carpeta>");

        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo abrir el ConPTY");
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/c", "claude", "--resume", &sesion]);
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        // El clásico a propósito: es el que usa quien pide `/tui default`, y el
        // que le toca a Codex y a cualquier CLI que no entre en la alternativa.
        cmd.env("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN", "1");
        cmd.env_remove("CLAUDE_CODE_CHILD_SESSION");
        let mut hijo = pair.slave.spawn_command(cmd).expect("no arrancó claude");
        let pid = hijo.process_id().expect("sin pid");
        drop(pair.slave);
        let mut lector = pair.master.try_clone_reader().expect("sin lector");
        let escritor = Arc::new(Mutex::new(pair.master.take_writer().expect("sin escritor")));
        let salida = Arc::new(Mutex::new(Vec::new()));
        let recogida = salida.clone();
        let contesta = escritor.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = lector.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let trozo = &buf[..n];
                if contiene(trozo, b"\x1b[6n") {
                    let _ = contesta.lock().unwrap().write_all(b"\x1b[1;1R");
                }
                if contiene(trozo, b"\x1b[>0q") {
                    let _ = contesta
                        .lock()
                        .unwrap()
                        .write_all(format!("\x1bP>|xterm.js({XTERM})\x1b\\").as_bytes());
                }
                recogida.lock().unwrap().extend_from_slice(trozo);
            }
        });

        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(60) {
            if !hitos(&salida.lock().unwrap()).is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        esperar_quieto(&salida, Duration::from_secs(3), Duration::from_secs(40));
        let visto = salida.lock().unwrap().clone();

        // Y que repinte de verdad: se le escribe una letra, que le hace redibujar
        // su caja de entrada, y se mira si anuncia ese repintado como antes.
        let antes = visto.len();
        let _ = escritor.lock().unwrap().write_all(b"h");
        esperar_quieto(&salida, Duration::from_secs(2), Duration::from_secs(10));
        let tras_teclear = salida.lock().unwrap()[antes..].to_vec();

        let _ = escritor.lock().unwrap().write_all(b"\x1b");
        let _ = escritor.lock().unwrap().write_all(b"/exit\r");
        let fin = Instant::now();
        while fin.elapsed() < Duration::from_secs(10) {
            if matches!(hijo.try_wait(), Ok(Some(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        if !matches!(hijo.try_wait(), Ok(Some(_))) {
            super::matar_rama(pid);
            std::thread::sleep(Duration::from_millis(400));
        }

        let alternativa = contiene(&visto, b"\x1b[?1049h");
        let ed3 = cuantas(&visto, b"\x1b[3J");
        let ed2 = cuantas(&visto, b"\x1b[2J");
        let sync_abre = cuantas(&visto, b"\x1b[?2026h");
        let sync_cierra = cuantas(&visto, b"\x1b[?2026l");
        // Y qué modos enciende, que deciden quién recibe la rueda: con el ratón
        // puesto, xterm deja de mover su historial y le manda el gesto al
        // programa (`Viewport`: `handleMouseWheel: !(type & WHEEL)`).
        let raton = cuantas(&visto, b"\x1b[?1000h") + cuantas(&visto, b"\x1b[?1002h")
            + cuantas(&visto, b"\x1b[?1003h");
        let raton_sgr = cuantas(&visto, b"\x1b[?1006h");
        let foco = cuantas(&visto, b"\x1b[?1004h");
        println!(
            "\nrenderizador clásico · pantalla alternativa: {alternativa} · {} bytes al arrancar\n\
             borrar historial (ESC[3J): {ed3} · borrar pantalla (ESC[2J): {ed2} · \
             bloque sincronizado: {sync_abre} aperturas y {sync_cierra} cierres\n\
             seguimiento del ratón: {raton} (SGR: {raton_sgr}) · aviso de foco: {foco}\n\
             al teclear una letra: {} bytes · ESC[3J: {} · bloque sincronizado: {}\n",
            visto.len(),
            tras_teclear.len(),
            cuantas(&tras_teclear, b"\x1b[3J"),
            cuantas(&tras_teclear, b"\x1b[?2026h"),
        );
        comprobar_config_limpia();
        assert!(!alternativa, "(control) con la variable no debería entrar en la alternativa");
        /* Y aquí NO hay assert de que mande `ESC[3J` ni el bloque sincronizado,
           porque medido el 2026-09-12 con la 2.1.269 no manda NINGUNO de los
           dos (cero y cero, ni al arrancar ni al teclear). Ese es el dato: la
           capa de colocado de `TerminalPane` se quedó sin sus dos señales, así
           que en el renderizador clásico de hoy no hace nada. No se pone en
           rojo permanente (una comprobación que siempre falla ya está muerta):
           lo que hace este banco es DECIR los números cada vez que se lanza. */
    }

    #[test]
    #[ignore = "arranca claude --resume de verdad sobre una sesión numerada; se lanza a mano"]
    fn un_golpe_de_rueda_no_deberia_mover_media_conversacion() {
        let sesion = std::env::var("ADEORQ_BANCO_SESION").expect("ADEORQ_BANCO_SESION=<id de la sesión numerada>");
        let cwd = std::env::var("ADEORQ_BANCO_CWD").expect("ADEORQ_BANCO_CWD=<carpeta donde arrancar>");

        let mudo_1 = medir(&sesion, &cwd, false, 1, 0);
        let dicho_1 = medir(&sesion, &cwd, true, 1, 0);
        let mudo_5 = medir(&sesion, &cwd, false, 5, 60);
        let dicho_5 = medir(&sesion, &cwd, true, 5, 60);
        /* Y un GIRO de rueda, que es lo que hace una mano: no un clic suelto,
           sino veinte eventos en trescientos milisegundos. Es donde entra la
           aceleración de Claude Code, que crece con los eventos seguidos y es
           la única forma conocida de que un gesto se lleve media conversación
           por delante. Las dos, porque de reconocer al emulador depende qué
           curva usa: con «wheelFlood» (xterm.js, que manda muchos eventos por
           gesto) multiplica poco, y sin reconocerlo usa la curva de decaimiento
           de Windows. */
        let mudo_giro = medir(&sesion, &cwd, false, 20, 15);
        let dicho_giro = medir(&sesion, &cwd, true, 20, 15);
        println!(
            "\nSIN decir quién soy, 1 golpe: {mudo_1}\nDICIENDO quién soy, 1 golpe: {dicho_1}\n\
             SIN decir quién soy, 5 golpes: {mudo_5}\nDICIENDO quién soy, 5 golpes: {dicho_5}\n\
             SIN decir quién soy, GIRO de 20: {mudo_giro}\nDICIENDO quién soy, GIRO de 20: {dicho_giro}\n"
        );
        comprobar_config_limpia();
        assert!(
            dicho_1.contains("saltó") && mudo_1.contains("saltó"),
            "alguna pasada no llegó a medir el salto; mira la línea de arriba"
        );
    }

    /// Cuántos apuntes de «arranque en pantalla completa sin cerrar» hay en el
    /// `.claude.json` de una casa, y si ya apagó la pantalla completa.
    fn apuntes(casa: &std::path::Path) -> (usize, bool) {
        let v: serde_json::Value = std::fs::read_to_string(casa.join(".claude.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        (v["fullscreenBootPending"].as_object().map(|o| o.len()).unwrap_or(0), v.get("fullscreenAutoDisabled").is_some())
    }

    /// Por qué Adeorq apagaba la pantalla completa de Claude Code al
    /// actualizarse (2026-10-15, `fullscreenAutoDisabled` con 4 «fallos» en la
    /// casa de Munir, a la hora exacta en que arrancó la versión nueva).
    ///
    /// Claude Code apunta cada arranque en pantalla completa en
    /// `fullscreenBootPending` y lo borra al cerrarse bien. Un proceso que ya no
    /// existe con su apunte puesto cuenta como un fallo, y al llegar al tope
    /// apaga la pantalla completa en todo el equipo. Esto lo mide en una casa
    /// FALSA (`USERPROFILE` a una carpeta temporal), nunca en la de Munir: el
    /// apunte con el panel vivo, después de un doble Ctrl+C y después de
    /// `taskkill`, que es como cerraba Adeorq.
    ///
    /// `cargo test --lib doble_ctrl_c -- --ignored --nocapture`. Sin sesión
    /// iniciada en esa casa no gasta nada: no se le manda ningún mensaje.
    #[test]
    #[ignore = "arranca claude de verdad, en una casa falsa"]
    fn doble_ctrl_c_borra_el_apunte_de_pantalla_completa() {
        let casa = std::env::temp_dir().join(format!("adeorq-casa-fullscreen-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&casa);
        std::fs::create_dir_all(casa.join(".claude")).unwrap();
        std::fs::write(casa.join(".claude").join("settings.json"), r#"{"tui":"fullscreen"}"#).unwrap();
        let cwd = casa.to_string_lossy().to_string();
        let clave = cwd.replace('\\', "/");
        std::fs::write(
            casa.join(".claude.json"),
            serde_json::json!({
                "hasCompletedOnboarding": true,
                "numStartups": 3,
                "projects": { clave: { "hasTrustDialogAccepted": true } }
            })
            .to_string(),
        )
        .unwrap();

        // Con la despedida de verdad (`despedir_con` y `claude_en_la_rama`, lo
        // mismo que hace `matar`), con la caja vacía y con texto escrito en
        // ella; y de control, `taskkill` como cerraba Adeorq hasta hoy.
        let mut resultados = Vec::new();
        for (nombre, texto, por_las_buenas) in [("despedida, caja vacía", "", true), ("despedida, caja con texto", "esto se queda sin mandar", true), ("taskkill", "", false)] {
            let p = abrir_en_casa(&[], &cwd, 120, 36, true, Some(&casa));
            esperar_quieto(&p.salida, Duration::from_secs(4), Duration::from_secs(40));
            if !texto.is_empty() {
                let _ = p.escritor.lock().unwrap().write_all(texto.as_bytes());
                std::thread::sleep(Duration::from_millis(600));
            }
            let vivo = apuntes(&casa).0;
            let alternativa = contiene(&p.salida.lock().unwrap(), b"\x1b[?1049h");
            let inicio = Instant::now();
            let salio = if por_las_buenas {
                let escribir = |b: &[u8]| {
                    let _ = p.escritor.lock().unwrap().write_all(b);
                };
                let sigue = || super::claude_en_la_rama(p.pid, &crate::pulso::foto_procesos());
                super::despedir_con(&escribir, &sigue, Duration::from_secs(8))
            } else {
                false
            };
            let tardo = inicio.elapsed();
            super::matar_rama(p.pid);
            std::thread::sleep(Duration::from_millis(800));
            resultados.push((nombre, alternativa, vivo, apuntes(&casa).0, salio, tardo));
        }
        let fin = apuntes(&casa);
        for (nombre, alt, vivo, despues, salio, tardo) in &resultados {
            println!("{nombre}: pantalla alternativa {alt}, apuntes con el panel vivo {vivo}, al cerrar {despues}, salió solo {salio} en {:.1} s", tardo.as_secs_f32());
        }
        println!("al final: apuntes {}, pantalla completa apagada {}", fin.0, fin.1);
        let _ = std::fs::remove_dir_all(&casa);
        for (nombre, alt, vivo, despues, salio, _) in &resultados[..2] {
            assert!(*alt && *vivo > 0, "{nombre}: no llegó a arrancar en pantalla completa con su apunte: la medida no vale");
            assert!(*salio && *despues == 0, "{nombre}: la despedida no lo cierra bien y su apunte se queda");
        }
        assert!(resultados[2].3 > 0, "el control con taskkill debería dejar su apunte: si no, la medida no distingue");
    }

    /// La rama: un Claude Code bajo el `cmd.exe` del panel, a dos niveles, y
    /// uno de otro panel que no cuenta.
    #[test]
    fn se_encuentra_el_claude_de_la_rama_y_no_el_de_otra() {
        let procesos = vec![
            (100, 1, "cmd.exe".to_string()),
            (101, 100, "conhost.exe".to_string()),
            (102, 100, "claude.exe".to_string()),
            (200, 1, "cmd.exe".to_string()),
            (201, 200, "powershell.exe".to_string()),
            (300, 1, "cmd.exe".to_string()),
            (301, 999, "claude.exe".to_string()),
            (400, 1, "cmd.exe".to_string()),
            (401, 400, "powershell.exe".to_string()),
            (402, 401, "Claude.exe".to_string()),
        ];
        assert!(super::claude_en_la_rama(100, &procesos));
        assert!(!super::claude_en_la_rama(200, &procesos));
        assert!(!super::claude_en_la_rama(300, &procesos));
        assert!(super::claude_en_la_rama(400, &procesos));
    }
}

/// Que si Adeorq muere, sus agentes mueren con él (META 13), probado con
/// procesos de verdad y sin tocar ningún panel de Munir.
///
/// `cargo test --lib corral_de_procesos`
#[cfg(all(test, windows))]
mod corral_de_procesos {
    use super::*;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::System::JobObjects::{IsProcessInJob, QueryInformationJobObject};
    use windows_sys::Win32::System::Threading::PROCESS_QUERY_LIMITED_INFORMATION;

    /// Un proceso que vive medio minuto si nadie lo mata.
    fn ping_largo() -> std::process::Child {
        std::process::Command::new("ping.exe")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .spawn()
            .expect("no arrancó ping")
    }

    /// Lo que hace Adeorq con cada panel: meterlo en SU corral, y ese corral
    /// tiene puesto «matar al cerrarse».
    #[test]
    fn cada_panel_entra_en_el_corral_que_mata_al_cerrarse() {
        let corral = corral().expect("Windows no dejó crear el corral");
        let mut hijo = ping_largo();
        meter_en_el_corral(hijo.id());
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, hijo.id());
            assert!(!h.is_null());
            let mut dentro: i32 = 0;
            assert_ne!(IsProcessInJob(h, corral.0, &mut dentro), 0);
            CloseHandle(h);
            assert_eq!(dentro, 1, "el proceso tiene que estar dentro del corral");
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            let ok = QueryInformationJobObject(
                corral.0,
                JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                std::ptr::null_mut(),
            );
            assert_ne!(ok, 0);
            assert_ne!(
                info.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                0,
                "el corral tiene que matar al cerrarse"
            );
        }
        let _ = hijo.kill();
        let _ = hijo.wait();
    }

    /// Y lo que hace Windows cuando el corral se cierra, que es lo que pasa al
    /// morir Adeorq muera como muera: lo de dentro muere sin que corra una
    /// línea nuestra. Con un corral aparte, para no cerrar el de verdad.
    #[test]
    fn al_cerrarse_el_corral_muere_lo_que_hay_dentro() {
        let mut hijo = ping_largo();
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            assert!(!job.is_null());
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            assert_ne!(
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                ),
                0
            );
            let h = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, hijo.id());
            assert_ne!(AssignProcessToJobObject(job, h), 0, "error {}", GetLastError());
            CloseHandle(h);
            assert!(hijo.try_wait().unwrap().is_none(), "antes de cerrar el corral sigue vivo");
            // El último handle del job: a partir de aquí ya no depende de nadie.
            CloseHandle(job);
        }
        let inicio = Instant::now();
        while hijo.try_wait().unwrap().is_none() {
            assert!(
                inicio.elapsed() < Duration::from_secs(5),
                "ping sigue vivo cinco segundos después de cerrar el corral"
            );
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

/// El Intro de `send_command`, medido contra un Claude Code de verdad.
///
/// `cargo test --lib intro_en_claude -- --ignored --nocapture`
///
/// Gasta UN mensaje corto de tu suscripción (Haiku, «contesta OK») y no deja
/// sesión en tu lista (`SinRastro`). Primero reproduce el fallo de antes (el
/// texto y el `\r` en una sola escritura: Claude Code lo toma por un pegado y
/// se queda con todo en la caja, avisando «review and press Enter to send»), y
/// luego hace lo de ahora (pegado entre corchetes e Intro aparte) y comprueba
/// que el aviso no sale. Si el CONTROL deja de fallar es que Claude Code cambió
/// su detección de pegado, y entonces hay que volver a mirar `PJ` en su binario.
#[cfg(all(test, windows))]
mod intro_en_claude {
    use super::rueda_en_fullscreen::{abrir_con, cerrar_limpio, comprobar_config_limpia, esperar_quieto, sin_escapes};
    use super::{envuelto_para_pegar, ESPACIO_ENTRE_TECLAS};
    use std::io::Write;
    use std::time::{Duration, Instant};

    fn atascado(visto: &str) -> bool {
        visto.contains("press Enter to send") || visto.contains("Pasted text #") || visto.contains("invisible character")
    }

    #[test]
    #[ignore = "arranca claude de verdad y gasta un mensaje de tu suscripción"]
    fn el_intro_aparte_entra_y_el_junto_se_queda_en_la_caja() {
        let rastro = crate::foreman::SinRastro::nueva();
        // Una carpeta que ya es de confianza, o el arranque se para en la pregunta.
        let cwd = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_string_lossy().to_string();
        let mut p = abrir_con(&["--session-id", rastro.id(), "--model", "haiku"], &cwd, 120, 36, true);
        let escribir = |p: &super::rueda_en_fullscreen::Panel, b: &[u8]| {
            p.escritor.lock().unwrap().write_all(b).expect("no se pudo escribir");
        };
        let desde_entonces = |p: &super::rueda_en_fullscreen::Panel, desde: usize| {
            let s = p.salida.lock().unwrap();
            sin_escapes(&s[desde.min(s.len())..])
        };

        // Hasta que pida el pegado entre corchetes: ahí ya hay caja.
        let inicio = Instant::now();
        loop {
            let pidio = p.salida.lock().unwrap().windows(8).any(|w| w == b"\x1b[?2004h");
            if pidio {
                break;
            }
            assert!(inicio.elapsed() < Duration::from_secs(40), "claude no pidió el pegado entre corchetes en 40 s");
            std::thread::sleep(Duration::from_millis(200));
        }
        esperar_quieto(&p.salida, Duration::from_millis(1500), Duration::from_secs(20));

        let texto = "Contesta solo con la palabra OK, sin nada más. ".repeat(20);
        assert!(texto.len() > 800, "tiene que pasar del umbral de pegado de Claude Code");

        // Lo de antes: el texto y el Intro en UNA escritura.
        let desde = p.salida.lock().unwrap().len();
        escribir(&p, format!("{texto}\r").as_bytes());
        esperar_quieto(&p.salida, Duration::from_millis(1500), Duration::from_secs(10));
        let visto = desde_entonces(&p, desde);
        let antes = atascado(&visto);
        println!("\n  texto y \\r juntos: {}", if antes { "se quedó en la caja (el fallo de siempre)" } else { "entró" });
        let cola: String = visto.lines().filter(|l| !l.trim().is_empty()).rev().take(12).collect::<Vec<_>>().into_iter().rev().map(|l| format!("    | {}\n", l.trim_end())).collect();
        println!("  lo último que pintó:\n{cola}");
        let atascado_bin = std::env::temp_dir().join("adeorq-intro-atascado.bin");
        std::fs::write(&atascado_bin, p.salida.lock().unwrap().clone()).unwrap();
        println!("  bytes de la pantalla con el texto atascado: {}", atascado_bin.display());

        // Dos Esc seguidos vacían la caja («double tap esc to clear input»).
        let desde = p.salida.lock().unwrap().len();
        escribir(&p, b"\x1b");
        std::thread::sleep(Duration::from_millis(100));
        escribir(&p, b"\x1b");
        esperar_quieto(&p.salida, Duration::from_millis(1000), Duration::from_secs(10));
        let visto = desde_entonces(&p, desde);
        let cola: String = visto.lines().filter(|l| !l.trim().is_empty()).rev().take(8).collect::<Vec<_>>().into_iter().rev().map(|l| format!("    | {}\n", l.trim_end())).collect();
        println!("  tras los dos Esc:\n{cola}");

        // Lo de ahora: pegado entre corchetes, respiro, Intro.
        let desde = p.salida.lock().unwrap().len();
        escribir(&p, &envuelto_para_pegar(&texto, true));
        std::thread::sleep(ESPACIO_ENTRE_TECLAS);
        escribir(&p, b"\r");
        esperar_quieto(&p.salida, Duration::from_millis(1500), Duration::from_secs(10));
        // Que termine de contestar antes de mirar: el mensaje enviado se ve
        // desplegado en la conversación (en la caja va plegado como
        // «[Pasted text #N]»), y detrás viene la respuesta.
        esperar_quieto(&p.salida, Duration::from_secs(3), Duration::from_secs(90));
        let visto = desde_entonces(&p, desde);
        let entro = visto.contains("Contesta solo con la palabra OK, sin nada más. Contesta");
        println!("  pegado e Intro aparte: {}", if entro { "entró" } else { "se quedó en la caja" });
        let cola: String = visto.lines().filter(|l| !l.trim().is_empty()).rev().take(30).collect::<Vec<_>>().into_iter().rev().map(|l| format!("    | {}\n", l.trim_end())).collect();
        println!("  lo último que pintó:\n{cola}");
        // Los bytes enteros, para pintarlos en una xterm sin ventana y ver la
        // PANTALLA final (`node scripts/laboratorio/pantalla-de-bytes.mjs`):
        // es lo que lee `se_quedo_en_la_caja` en la app de verdad.
        let enviado = std::env::temp_dir().join("adeorq-intro-enviado.bin");
        std::fs::write(&enviado, p.salida.lock().unwrap().clone()).unwrap();
        println!("  bytes de la pantalla con el mensaje enviado: {}", enviado.display());

        cerrar_limpio(&mut p);
        comprobar_config_limpia();

        assert!(antes, "(control) lo de antes ya no se queda en la caja: ¿cambió Claude Code su detección de pegado?");
        assert!(entro, "el Intro aparte tiene que entrar");
    }
}

/// Contestar a un menú de Claude Code con `send_command`, medido de verdad.
///
/// `cargo test --lib menu_en_claude -- --ignored --nocapture`
///
/// Lo que pasó el 2026-10-08: una sesión le contestó «2» a la pregunta de otra
/// terminal («¿subo solo lo del panel?») y salió la opción 1, que subía también
/// un commit ajeno a la web pública. Aquí Claude Code (Haiku) hace una pregunta
/// de verdad con AskUserQuestion y se le contesta «la 2» de tres maneras; el
/// oráculo es la respuesta que queda en su transcript, no la pantalla.
///
/// Lo que salió en la 2.1.295: pegado e Intro, «Rojo» (la 1); tecleado y sin
/// Intro, «Azul» (elige al momento); flecha abajo e Intro, «Azul». Antes de
/// esto se probó el menú del tema de la bienvenida y NO sirve: ese no hace caso
/// a los números, solo a las flechas.
#[cfg(all(test, windows))]
mod menu_en_claude {
    use super::rueda_en_fullscreen::{cerrar_limpio, comprobar_config_limpia, esperar_quieto, sin_escapes};
    use super::ESPACIO_ENTRE_TECLAS;
    use std::io::Write;
    use std::time::{Duration, Instant};

    /// La respuesta que quedó apuntada en el transcript de una sesión.
    fn respuesta_apuntada(id: &str) -> Option<String> {
        let perfil = std::env::var("USERPROFILE").ok()?;
        let proyectos = std::path::Path::new(&perfil).join(".claude").join("projects");
        let archivo = std::fs::read_dir(&proyectos).ok()?.filter_map(|d| d.ok()).map(|d| d.path().join(format!("{id}.jsonl"))).find(|p| p.exists())?;
        let texto = std::fs::read_to_string(archivo).ok()?;
        texto.lines().filter(|l| l.contains("tool_result")).find_map(|l| {
            let v: serde_json::Value = serde_json::from_str(l).ok()?;
            v["message"]["content"].as_array()?.iter().find_map(|b| {
                let c = &b["content"];
                c.as_str().map(str::to_owned).or_else(|| c.as_array()?.iter().find_map(|x| x["text"].as_str().map(str::to_owned)))
            })
        })
    }

    /// Una pregunta de verdad (AskUserQuestion, la de «¿subo los dos?») y tres
    /// maneras de contestarle «la 2». Gasta mensajes cortos de Haiku.
    #[test]
    #[ignore = "arranca claude de verdad y gasta seis mensajes cortos de Haiku"]
    fn contestar_la_dos_a_una_pregunta_de_claude() {
        let cwd = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_string_lossy().to_string();
        let maneras: [(&str, &[&[u8]]); 3] = [
            ("pegado e Intro (lo de antes)", &[b"\x1b[200~2\x1b[201~", b"\r"]),
            ("tecleado y sin Intro (lo que hace ahora mandar_texto)", &[b"2"]),
            ("flecha abajo e Intro (send_keys)", &[b"\x1b[B", b"\r"]),
        ];
        let mut fuera = Vec::new();
        for (nombre, teclas) in maneras {
            let rastro = crate::foreman::SinRastro::nueva();
            let mut p = super::rueda_en_fullscreen::abrir_con(&["--session-id", rastro.id(), "--model", "haiku"], &cwd, 120, 40, true);
            let inicio = Instant::now();
            while !p.salida.lock().unwrap().windows(8).any(|w| w == b"\x1b[?2004h") {
                assert!(inicio.elapsed() < Duration::from_secs(40), "claude no pidió el pegado entre corchetes");
                std::thread::sleep(Duration::from_millis(200));
            }
            esperar_quieto(&p.salida, Duration::from_millis(1500), Duration::from_secs(20));
            let pide = "Usa ahora la herramienta AskUserQuestion con UNA pregunta, «¿Qué color?», y dos opciones en este orden: «Rojo» y «Azul». No hagas nada más.";
            let desde = p.salida.lock().unwrap().len();
            p.escritor.lock().unwrap().write_all(&super::envuelto_para_pegar(pide, true)).unwrap();
            std::thread::sleep(ESPACIO_ENTRE_TECLAS);
            p.escritor.lock().unwrap().write_all(b"\r").unwrap();
            let inicio = Instant::now();
            loop {
                let visto = sin_escapes(&p.salida.lock().unwrap()[desde..]);
                if visto.contains("Azul") && (visto.contains("to select") || visto.contains("navigate")) {
                    break;
                }
                assert!(inicio.elapsed() < Duration::from_secs(120), "no salió la pregunta");
                std::thread::sleep(Duration::from_millis(300));
            }
            esperar_quieto(&p.salida, Duration::from_millis(1500), Duration::from_secs(10));
            for t in teclas {
                p.escritor.lock().unwrap().write_all(t).unwrap();
                std::thread::sleep(ESPACIO_ENTRE_TECLAS);
            }
            esperar_quieto(&p.salida, Duration::from_secs(3), Duration::from_secs(60));
            let apuntada = respuesta_apuntada(rastro.id());
            println!("  {nombre}: {}", apuntada.as_deref().unwrap_or("(no contestó nada)"));
            fuera.push(apuntada);
            // Por si se quedó la pregunta abierta: Esc la cancela.
            let _ = p.escritor.lock().unwrap().write_all(b"\x1b");
            std::thread::sleep(Duration::from_millis(500));
            cerrar_limpio(&mut p);
        }
        comprobar_config_limpia();
        let dice = |i: usize, que: &str| fuera[i].as_deref().is_some_and(|s| s.contains(que));
        assert!(dice(0, "Rojo"), "(control) el «2» pegado ya no elige la 1: ¿cambió Claude Code?");
        assert!(dice(1, "Azul"), "el «2» tecleado tiene que elegir la 2");
        assert!(dice(2, "Azul"), "la flecha abajo e Intro tienen que elegir la 2");
    }
}

/// La carrera de los `pty_resize`, medida en un ConPTY de verdad.
///
/// `cargo test --lib carrera -- --ignored --nocapture`
///
/// Cada `pty_resize` es un comando `async`, y Tauri lanza cada llamada como
/// una tarea INDEPENDIENTE del runtime (`respond_async_serialized` →
/// `async_runtime::spawn`). Si el front manda varios tamaños seguidos, nada
/// garantiza que se ejecuten en el orden en que se pidieron: el ConPTY se queda
/// con el último que se EJECUTA. Aquí se lanzan igual que las lanzaría Tauri
/// (mismo `spawn`, mismo candado sobre el `master`) y se mira con qué tamaño
/// acaba el proceso. El arreglo vive en el front (`lib/tamanoPty.ts`): uno en
/// vuelo por terminal, y al volver se manda lo último.
#[cfg(all(test, windows))]
mod carrera {
    use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
    use std::sync::{Arc, Mutex};

    #[test]
    #[ignore = "abre un ConPTY de verdad y mide una carrera; se lanza a mano"]
    fn varios_resize_en_vuelo_no_acaban_en_el_ultimo_pedido() {
        let pair = native_pty_system()
            .openpty(PtySize { rows: 28, cols: 80, pixel_width: 0, pixel_height: 0 })
            .expect("no se pudo abrir el ConPTY");
        let mut hijo = pair
            .slave
            .spawn_command(CommandBuilder::new("cmd.exe"))
            .expect("no arrancó cmd.exe");
        // Alguien tiene que LEER lo que el ConPTY escribe, o su tubería se llena
        // y `ResizePseudoConsole` no vuelve jamás (cada resize hace que conhost
        // repinte la pantalla entera por esa tubería). Es la misma razón por la
        // que en la app el lector vive en su propio hilo; sin esto, el primer
        // intento de este banco se quedó colgado un cuarto de hora.
        let mut lector = pair.master.try_clone_reader().expect("sin lector del ConPTY");
        std::thread::spawn(move || {
            use std::io::Read;
            let mut basura = [0u8; 8192];
            while let Ok(n) = lector.read(&mut basura) {
                if n == 0 {
                    break;
                }
            }
        });
        let master: Arc<Mutex<Box<dyn MasterPty + Send>>> = Arc::new(Mutex::new(pair.master));

        // Lo que manda un panel al animarse y luego rebotar: 77 → … → 110 → 77 → 110.
        let mut pedidos: Vec<u16> = (77..=110).step_by(3).collect();
        pedidos.extend([77, 110]);
        let ultimo = *pedidos.last().unwrap();

        let rondas = 200;
        let mut mal = 0;
        for _ in 0..rondas {
            let tareas: Vec<_> = pedidos
                .iter()
                .map(|&cols| {
                    let m = master.clone();
                    // Exactamente lo que hace `pty_resize`: coger el candado y redimensionar.
                    tauri::async_runtime::spawn(async move {
                        let m = m.lock().unwrap();
                        let _ = m.resize(PtySize { rows: 28, cols, pixel_width: 0, pixel_height: 0 });
                    })
                })
                .collect();
            tauri::async_runtime::block_on(async {
                for t in tareas {
                    let _ = t.await;
                }
            });
            let tiene = master.lock().unwrap().get_size().unwrap().cols;
            if tiene != ultimo {
                mal += 1;
            }
        }
        let _ = hijo.kill();
        println!(
            "\n{rondas} rondas de {} tamaños en vuelo: el ConPTY acabó con un tamaño que NO era el último pedido en {mal}\n",
            pedidos.len()
        );
        assert!(
            mal > 0,
            "la carrera no se ha visto esta vez; si deja de verse nunca, este banco sobra"
        );
    }
}

/// El motor sin Tauri (`abrir` y las operaciones sobre el mapa): lo que corre
/// igual en la app y en el proceso de terminales. Una terminal de verdad, con
/// `cmd`: que lo que dice llegue a la salida, que lo escrito le llegue, que el
/// historial lo guarde y que su fin se avise y la saque del mapa.
#[cfg(all(test, windows))]
mod motor {
    use super::*;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    #[derive(Default)]
    struct Apuntes {
        datos: Mutex<String>,
        fin: Mutex<Option<Option<u32>>>,
    }
    struct Libreta(Arc<Apuntes>);
    impl Salida for Libreta {
        fn datos(&self, _id: u32, texto: String) {
            self.0.datos.lock().unwrap().push_str(&texto);
        }
        fn fin(&self, _id: u32, code: Option<u32>) {
            *self.0.fin.lock().unwrap() = Some(code);
        }
        fn mudo(&self, _id: u32) {}
    }

    fn hasta(cond: impl Fn() -> bool, ms: u64) -> bool {
        let fin = Instant::now() + Duration::from_millis(ms);
        while Instant::now() < fin {
            if cond() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        cond()
    }

    #[test]
    fn una_terminal_entera_por_el_motor() {
        let mapa: Mapa = Default::default();
        let apuntes = Arc::new(Apuntes::default());
        let alta = Alta {
            id: 7,
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            cols: 100,
            rows: 30,
            command: Some(vec!["cmd.exe".into(), "/q".into(), "/k".into(), "echo motor-listo".into()]),
            env: None,
        };
        abrir(&mapa, alta.clone(), Arc::new(Libreta(apuntes.clone()))).expect("no abrió");
        // El ConPTY pregunta dónde está el cursor y no pinta nada hasta que se
        // le contesta. En la app contesta xterm; aquí, la prueba.
        assert!(hasta(|| apuntes.datos.lock().unwrap().contains("\x1b[6n"), 8000), "el ConPTY no preguntó por el cursor");
        escribir(&mapa, 7, b"\x1b[1;1R".to_vec()).unwrap();
        assert!(hasta(|| apuntes.datos.lock().unwrap().contains("motor-listo"), 8000), "la salida no llegó: {:?}", apuntes.datos.lock().unwrap());
        let ficha = fichas_de(&mapa).into_iter().find(|f| f.id == 7).expect("no está en el mapa");
        assert!(ficha.pid.is_some() && ficha.command.as_ref().unwrap()[0] == "cmd.exe");

        // Abrir otra vez el mismo número se engancha, no abre otro proceso.
        abrir(&mapa, alta, Arc::new(Libreta(apuntes.clone()))).unwrap();
        assert_eq!(fichas_de(&mapa).len(), 1);

        escribir(&mapa, 7, b"echo eco-%COMSPEC:~0,0%escrito\r".to_vec()).unwrap();
        assert!(hasta(|| apuntes.datos.lock().unwrap().contains("eco-escrito"), 8000), "lo escrito no llegó");
        assert!(historial(&mapa, 7, None).unwrap().contains("eco-escrito"), "el historial no lo guardó");
        tamano(&mapa, 7, 120, 40).unwrap();
        assert_eq!(fichas_de(&mapa)[0].tamano.as_deref(), Some("120x40"));
        assert_eq!(escribir(&mapa, 99, vec![]).unwrap_err(), NO_ESTA);

        escribir(&mapa, 7, b"exit\r".to_vec()).unwrap();
        assert!(hasta(|| apuntes.fin.lock().unwrap().is_some(), 8000), "no avisó del fin");
        assert!(fichas_de(&mapa).is_empty(), "un panel acabado sigue en el mapa");
    }

    #[test]
    fn matar_se_lleva_la_rama() {
        let mapa: Mapa = Default::default();
        let apuntes = Arc::new(Apuntes::default());
        let alta = Alta {
            id: 1,
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            cols: 80,
            rows: 24,
            command: Some(vec!["ping.exe".into(), "-n".into(), "60".into(), "127.0.0.1".into()]),
            env: None,
        };
        abrir(&mapa, alta, Arc::new(Libreta(apuntes.clone()))).unwrap();
        assert!(matar(&mapa, 1));
        assert!(hasta(|| apuntes.fin.lock().unwrap().is_some(), 8000), "matar no terminó el proceso");
        assert!(!matar(&mapa, 1), "matar lo que ya no está no es nada");
    }
}
