// Lo que Adeorq le está costando a tu equipo, dicho en números.
//
// Una ventana con seis terminales dentro, cada una con su agente, no es una
// aplicación ligera por mucho que el instalador ocupe cuatro megas: cada
// `claude` es un Node entero. Antes había que abrir el Administrador de tareas
// y sumar a mano procesos con el mismo nombre para saber si el equipo iba
// lento por Adeorq o por otra cosa (Munir, 2026-07-31).
//
// Se mide el ÁRBOL, no el proceso: la ventana sola gasta poco, y lo que pesa
// son sus nietos. Y se compara siempre con lo que tiene la máquina, porque
// «1,8 GB» no dice nada si no sabes si tienes 8 o 64.
//
// Sin `sysinfo` ni ninguna otra dependencia: Windows ya publica estos números
// y traer un crate con media docena de dependencias detrás para leer cuatro
// campos sale más caro de mantener que llamar a la API.

use serde::Serialize;
use std::collections::HashMap;
use std::time::Instant;
#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
#[cfg(windows)]
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(windows)]
use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
#[cfg(windows)]
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
};

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pulso {
    /// Megas que ocupa el árbol entero de Adeorq: la ventana y todo lo que
    /// cuelga de ella.
    pub ram_mb: u64,
    /// Qué porcentaje de la RAM del equipo es eso.
    pub ram_pct: u32,
    /// Megas y porcentaje que hay en uso en TODO el equipo, para saber si el
    /// que va apretado es Adeorq o la máquina.
    pub sistema_mb: u64,
    pub sistema_pct: u32,
    pub total_mb: u64,
    /// Cuántos procesos cuelgan de Adeorq, la ventana incluida.
    pub procesos: u32,
    /// De esos, cuántos son un agente de verdad (claude, codex, node…) y no un
    /// powershell de paso. Es el número que dice si te has dejado algo abierto.
    pub agentes: u32,
    /// Cuánta CPU del EQUIPO se está llevando el árbol entero, de 0 a 100, como
    /// lo cuenta el Administrador de tareas. 0 en la primera lectura, porque un
    /// porcentaje de CPU es siempre trabajo hecho entre dos momentos.
    pub cpu_pct: u32,
    /// Cuántos hilos tiene la máquina, para poder decir «de N» si hace falta.
    pub nucleos: u32,
}

/// Un tic de los de Windows son 100 ns; en Linux, `/proc` da tics de reloj, que
/// son 1/100 de segundo en cualquier sistema de escritorio actual.
#[cfg(windows)]
const UNIDAD_CPU: f64 = 1e-7;
#[cfg(not(windows))]
const UNIDAD_CPU: f64 = 0.01;

/// Los nombres que cuentan como agente. Un `powershell.exe` es el envoltorio
/// que abre Adeorq; el que gasta y el que importa es lo que corre dentro.
const AGENTES: [&str; 6] = ["claude", "codex", "node", "agy", "gemini", "cursor"];

fn es_agente(nombre: &str) -> bool {
    let n = nombre.to_ascii_lowercase();
    AGENTES.iter().any(|a| n.starts_with(a))
}

/// Todos los procesos del sistema, con su padre y su nombre.
#[cfg(windows)]
fn foto_procesos() -> Vec<(u32, u32, String)> {
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() {
            return out;
        }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut e) != 0 {
            loop {
                let fin = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(0);
                let nombre = String::from_utf16_lossy(&e.szExeFile[..fin]);
                out.push((e.th32ProcessID, e.th32ParentProcessID, nombre));
                if Process32NextW(snap, &mut e) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

/// Los megas que ocupa un proceso. `None` si el sistema no deja mirarlo, que
/// pasa con los procesos protegidos y no es un error.
#[cfg(windows)]
fn ram_de(pid: u32) -> Option<u64> {
    unsafe {
        let h: HANDLE = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
            0,
            pid,
        );
        if h.is_null() {
            return None;
        }
        let mut pmc: PROCESS_MEMORY_COUNTERS = std::mem::zeroed();
        let cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let ok = GetProcessMemoryInfo(h, &mut pmc, cb);
        CloseHandle(h);
        if ok == 0 {
            return None;
        }
        Some(pmc.WorkingSetSize as u64)
    }
}

/// El tiempo de CPU que lleva gastado un proceso desde que nació, en unidades
/// de 100 nanosegundos (que es lo que da Windows, y aquí no se convierte a
/// nada: solo se van a restar dos lecturas).
///
/// Se suma el tiempo de núcleo y el de usuario porque los dos son trabajo del
/// proceso: en Adeorq una buena parte del gasto es pintar, que pasa por el
/// controlador de la tarjeta y cuenta como tiempo de núcleo.
#[cfg(windows)]
fn cpu_de(pid: u32) -> Option<u64> {
    unsafe {
        let h: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut creado: FILETIME = std::mem::zeroed();
        let mut salida: FILETIME = std::mem::zeroed();
        let mut nucleo: FILETIME = std::mem::zeroed();
        let mut usuario: FILETIME = std::mem::zeroed();
        let ok = GetProcessTimes(h, &mut creado, &mut salida, &mut nucleo, &mut usuario);
        CloseHandle(h);
        if ok == 0 {
            return None;
        }
        let junta = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
        Some(junta(nucleo) + junta(usuario))
    }
}

#[cfg(not(windows))]
fn cpu_de(pid: u32) -> Option<u64> {
    // `/proc/<pid>/stat`: los campos 14 y 15 son utime y stime, en tics de
    // reloj. No se convierten a segundos por lo mismo que en Windows: solo se
    // van a restar dos lecturas, y el tic se cancela al dividir.
    let texto = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // El nombre del ejecutable va entre paréntesis y puede llevar espacios
    // dentro, así que se corta por el ÚLTIMO paréntesis y no por el primero.
    let resto = &texto[texto.rfind(')')? + 1..];
    let campos: Vec<&str> = resto.split_whitespace().collect();
    // Tras el paréntesis, el primer campo es `state`, que es el 3.º del
    // archivo: utime es el 14.º, o sea el índice 11 desde aquí.
    let utime: u64 = campos.get(11)?.parse().ok()?;
    let stime: u64 = campos.get(12)?.parse().ok()?;
    Some(utime + stime)
}

/// La lectura anterior, para poder restar. El porcentaje de CPU de un instante
/// no existe: es siempre trabajo hecho ENTRE dos momentos, así que la primera
/// vez que se pregunta no hay respuesta y se devuelve 0.
static ANTES: std::sync::Mutex<Option<(Instant, u64)>> = std::sync::Mutex::new(None);

/* ------------------------------------------------------ lo mismo, leyendo /proc

   En Linux no hace falta ninguna API: el núcleo publica todo esto como
   archivos. `/proc/<pid>/stat` trae el nombre y el padre en la misma línea, y
   `/proc/<pid>/statm` la memoria residente en páginas. Es más simple que la
   versión de Windows, no un remiendo.
*/

/// El tamaño de página, para pasar de páginas a bytes. Se pregunta una vez.
#[cfg(not(windows))]
fn tam_pagina() -> u64 {
    // SAFETY: una consulta al sistema sin punteros ni memoria compartida.
    let n = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    if n > 0 { n as u64 } else { 4096 }
}

#[cfg(not(windows))]
fn foto_procesos() -> Vec<(u32, u32, String)> {
    let mut out = Vec::new();
    let Ok(dir) = std::fs::read_dir("/proc") else {
        return out;
    };
    for e in dir.flatten() {
        let nombre_dir = e.file_name();
        let Some(txt) = nombre_dir.to_str() else { continue };
        let Ok(pid) = txt.parse::<u32>() else { continue };
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
            continue;
        };
        // El formato es `pid (nombre con espacios) estado ppid ...`. El nombre
        // va entre paréntesis Y PUEDE LLEVAR ESPACIOS, así que se corta por el
        // ÚLTIMO paréntesis y no por el tercer campo: partir por espacios es el
        // error clásico al leer esto.
        let Some(ini) = stat.find('(') else { continue };
        let Some(fin) = stat.rfind(')') else { continue };
        let nombre = stat[ini + 1..fin].to_owned();
        let resto: Vec<&str> = stat[fin + 1..].split_whitespace().collect();
        // resto[0] es el estado; resto[1], el padre.
        let ppid = resto.get(1).and_then(|x| x.parse::<u32>().ok()).unwrap_or(0);
        out.push((pid, ppid, nombre));
    }
    out
}

#[cfg(not(windows))]
fn ram_de(pid: u32) -> Option<u64> {
    let statm = std::fs::read_to_string(format!("/proc/{pid}/statm")).ok()?;
    // El segundo número es la memoria RESIDENTE en páginas, que es el
    // equivalente del WorkingSetSize de Windows.
    let paginas: u64 = statm.split_whitespace().nth(1)?.parse().ok()?;
    Some(paginas * tam_pagina())
}

/// Cuánta RAM tiene el equipo y cuánta queda de verdad libre.
///
/// `MemAvailable` y no `MemFree`: el segundo no cuenta la caché de disco, que
/// el sistema suelta en cuanto hace falta, así que en un Linux con horas de uso
/// diría que no queda nada cuando queda casi todo.
#[cfg(not(windows))]
fn memoria_sistema() -> (u64, u64) {
    let Ok(txt) = std::fs::read_to_string("/proc/meminfo") else {
        return (0, 0);
    };
    let campo = |clave: &str| -> u64 {
        txt.lines()
            .find(|l| l.starts_with(clave))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|n| n.parse::<u64>().ok())
            .map(|kb| kb * 1024)
            .unwrap_or(0)
    };
    (campo("MemTotal:"), campo("MemAvailable:"))
}

/// Quién cuelga de quién, indexado una sola vez. Está separado de `arbol_de`
/// porque medir seis terminales pedía construir este mismo mapa seis veces
/// sobre la misma foto: el trabajo se hace una vez y se reparte.
fn indice_de_hijos(procesos: &[(u32, u32, String)]) -> HashMap<u32, Vec<(u32, String)>> {
    let mut hijos: HashMap<u32, Vec<(u32, String)>> = HashMap::new();
    for (pid, padre, nombre) in procesos {
        hijos.entry(*padre).or_default().push((*pid, nombre.clone()));
    }
    hijos
}

/// Los descendientes de un pid, él incluido. Se recorre por niveles y no en
/// recursión para que un árbol raro no pueda desbordar la pila.
fn arbol_de(raiz: u32, procesos: &[(u32, u32, String)]) -> Vec<(u32, String)> {
    let hijos = indice_de_hijos(procesos);
    arbol_con_indice(raiz, procesos, &hijos)
}

fn arbol_con_indice(
    raiz: u32,
    procesos: &[(u32, u32, String)],
    hijos: &HashMap<u32, Vec<(u32, String)>>,
) -> Vec<(u32, String)> {
    let propio = procesos
        .iter()
        .find(|(pid, _, _)| *pid == raiz)
        .map(|(p, _, n)| (*p, n.clone()));
    let mut out: Vec<(u32, String)> = propio.into_iter().collect();
    let mut cola = vec![raiz];
    // Tope de seguridad: un ciclo de PIDs reutilizados no puede colgar esto.
    let mut vistos = 0;
    while let Some(p) = cola.pop() {
        vistos += 1;
        if vistos > 2000 {
            break;
        }
        if let Some(cs) = hijos.get(&p) {
            for (pid, nombre) in cs {
                out.push((*pid, nombre.clone()));
                cola.push(*pid);
            }
        }
    }
    out
}

#[tauri::command]
pub async fn pulso() -> Pulso {
    let procesos = foto_procesos();
    let yo = std::process::id();
    let arbol = arbol_de(yo, &procesos);

    let mut bytes = 0u64;
    let mut agentes = 0u32;
    let mut cpu_ahora = 0u64;
    for (pid, nombre) in &arbol {
        bytes += ram_de(*pid).unwrap_or(0);
        cpu_ahora += cpu_de(*pid).unwrap_or(0);
        if es_agente(nombre) {
            agentes += 1;
        }
    }

    // La CPU del ÁRBOL entero, que es la parte que casi nadie mide bien: el
    // trabajo de Adeorq no está en `adeorq.exe`, está en los `msedgewebview2`
    // que cuelgan de él y que son los que pintan. Mirando solo la ventana sale
    // un 4 % y la conclusión de que no pasa nada (medido el 2026-08-07).
    //
    // Y se reparte entre los núcleos, como hace el Administrador de tareas: un
    // 100 % aquí es la máquina entera, no un núcleo. Sin dividir, un equipo de
    // 16 hilos daría cifras de tres dígitos que no se parecen a nada de lo que
    // él ve en Windows.
    let nucleos = std::thread::available_parallelism().map(|n| n.get() as f64).unwrap_or(1.0);
    let cpu_pct = {
        let ahora = Instant::now();
        let mut guardado = ANTES.lock().unwrap_or_else(|e| e.into_inner());
        let salida = match *guardado {
            Some((cuando, antes)) => {
                let paso = ahora.duration_since(cuando).as_secs_f64();
                let gastado = cpu_ahora.saturating_sub(antes) as f64 * UNIDAD_CPU;
                // Menos de un cuarto de segundo entre lecturas da un cociente
                // que oscila muchísimo por el redondeo del reloj: se prefiere
                // repetir la cifra anterior a enseñar un número que salta.
                if paso < 0.25 {
                    None
                } else {
                    Some(((gastado / paso / nucleos) * 100.0).round().min(100.0) as u32)
                }
            }
            // La primera lectura no tiene con qué compararse.
            None => Some(0),
        };
        if salida.is_some() {
            *guardado = Some((ahora, cpu_ahora));
        }
        salida.unwrap_or(0)
    };

    #[cfg(windows)]
    let (total, libre) = unsafe {
        let mut m: MEMORYSTATUSEX = std::mem::zeroed();
        m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut m) == 0 {
            (0, 0)
        } else {
            (m.ullTotalPhys, m.ullAvailPhys)
        }
    };
    #[cfg(not(windows))]
    let (total, libre) = memoria_sistema();
    let usado = total.saturating_sub(libre);
    let mb = |b: u64| b / 1_048_576;
    let pct = |parte: u64| {
        if total == 0 {
            0
        } else {
            ((parte as f64 / total as f64) * 100.0).round() as u32
        }
    };

    Pulso {
        ram_mb: mb(bytes),
        ram_pct: pct(bytes),
        sistema_mb: mb(usado),
        sistema_pct: pct(usado),
        total_mb: mb(total),
        procesos: arbol.len() as u32,
        agentes,
        cpu_pct,
        nucleos: nucleos as u32,
    }
}

/// Lo que gasta UNA terminal, no la suma de todas.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PanePulso {
    /// El mismo id que usa el panel en la ventana: quien pregunta ya lo tiene.
    pub id: u32,
    pub ram_mb: u64,
    /// Cuántos procesos cuelgan de esa terminal, ella incluida.
    pub procesos: u32,
    /// Si dentro hay un agente de verdad y no solo el PowerShell de paso. Un
    /// panel parado ocupa memoria pero no está trabajando, y no es lo mismo.
    pub agente: bool,
}

/// La memoria de cada terminal por separado.
///
/// `pulso()` responde a «¿va lento el equipo por Adeorq?»; esta responde a la
/// otra pregunta, la que se hace con seis agentes abiertos y tres apartados:
/// **cuál de ellos me está costando**. Se mide igual, el ÁRBOL entero de cada
/// panel, porque `claude.exe` es un lanzador y quien de verdad ocupa es el
/// `node` que cuelga de él.
///
/// Una sola foto de procesos para todos: pedirla por panel sería recorrer la
/// tabla del sistema una vez por terminal para el mismo dato.
#[tauri::command(async)]
pub async fn pulso_panes(pty: tauri::State<'_, crate::pty::PtyState>) -> Result<Vec<PanePulso>, String> {
    // El candado de este mapa es el MISMO que atraviesa cada tecla que
    // escribes (ver la nota de `tx_entrada` en `pty.rs`). Así que se coge solo
    // para copiar los pids y se suelta antes de mirar los procesos, que es lo
    // lento: enseñar cuánta memoria gasta un panel no puede dejar a la app sin
    // teclado ni un instante.
    let raices: Vec<(u32, u32)> = {
        let mapa = pty.0.lock().map_err(|e| e.to_string())?;
        let mut v: Vec<(u32, u32)> = mapa
            .iter()
            .filter_map(|(id, s)| s.pid.map(|pid| (*id, pid)))
            .collect();
        v.sort_unstable();
        v
    };
    if raices.is_empty() {
        return Ok(Vec::new());
    }

    let procesos = foto_procesos();
    let hijos = indice_de_hijos(&procesos);
    let mut out = Vec::with_capacity(raices.len());
    for (id, pid) in raices {
        let arbol = arbol_con_indice(pid, &procesos, &hijos);
        let mut bytes = 0u64;
        let mut agente = false;
        for (p, nombre) in &arbol {
            bytes += ram_de(*p).unwrap_or(0);
            if es_agente(nombre) {
                agente = true;
            }
        }
        out.push(PanePulso {
            id,
            ram_mb: bytes / 1_048_576,
            procesos: arbol.len() as u32,
            agente,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_powershell_wrapper_is_not_an_agent() {
        // El powershell es el envoltorio que abre Adeorq; el que gasta es lo
        // que corre dentro, y es lo único que hay que contar.
        assert!(!es_agente("powershell.exe"));
        assert!(!es_agente("conhost.exe"));
        assert!(es_agente("claude.exe"));
        assert!(es_agente("node.exe"));
        assert!(es_agente("Codex.exe"), "el nombre puede venir con mayúsculas");
    }

    #[test]
    fn the_tree_includes_the_root_and_its_grandchildren() {
        // adeorq -> powershell -> claude, y un proceso ajeno que no debe salir.
        let procesos = vec![
            (10, 1, "adeorq.exe".into()),
            (20, 10, "powershell.exe".into()),
            (30, 20, "claude.exe".into()),
            (40, 1, "chrome.exe".into()),
        ];
        let arbol = arbol_de(10, &procesos);
        let pids: Vec<u32> = arbol.iter().map(|(p, _)| *p).collect();
        assert!(pids.contains(&10), "la ventana");
        assert!(pids.contains(&20), "el hijo");
        assert!(pids.contains(&30), "el NIETO, que es el que gasta");
        assert!(!pids.contains(&40), "lo ajeno no cuenta");
        assert_eq!(arbol.len(), 3);
    }

    /// Un padre que se apunta a sí mismo colgaría un recorrido ingenuo.
    #[test]
    fn a_cycle_cannot_hang_it() {
        let procesos = vec![(7, 7, "raro.exe".into())];
        let arbol = arbol_de(7, &procesos);
        assert!(!arbol.is_empty());
    }
}
