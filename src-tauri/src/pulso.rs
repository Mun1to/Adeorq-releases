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
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
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
}

/// Los nombres que cuentan como agente. Un `powershell.exe` es el envoltorio
/// que abre Adeorq; el que gasta y el que importa es lo que corre dentro.
const AGENTES: [&str; 6] = ["claude", "codex", "node", "agy", "gemini", "cursor"];

fn es_agente(nombre: &str) -> bool {
    let n = nombre.to_ascii_lowercase();
    AGENTES.iter().any(|a| n.starts_with(a))
}

/// Todos los procesos del sistema, con su padre y su nombre.
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
    for (pid, nombre) in &arbol {
        bytes += ram_de(*pid).unwrap_or(0);
        if es_agente(nombre) {
            agentes += 1;
        }
    }

    let (total, libre) = unsafe {
        let mut m: MEMORYSTATUSEX = std::mem::zeroed();
        m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut m) == 0 {
            (0, 0)
        } else {
            (m.ullTotalPhys, m.ullAvailPhys)
        }
    };
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
