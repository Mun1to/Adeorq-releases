//! Quién es de verdad el proceso que está al otro lado de una conexión al puerto.
//!
//! Hace falta para el `adeorq secreto` de una versión anterior. Tras actualizar, el
//! motor de terminales de la versión de antes sigue vivo y todas sus terminales llevan
//! su carpeta en el `PATH`, así que `adeorq` es ese cliente viejo, que pide la clave
//! sin decir de qué terminal viene. Sin esto, cada petición sacaba la ventana de «un
//! programa de fuera» desde las propias terminales de Munir, que decidió justo lo
//! contrario (`docs/contexto/secretos.md`).
//!
//! Y para el escalón: lo de fuera de Adeorq solo ve la lista (`Nivel::Lista`), y un
//! cliente sin contraseña que cuelga de una terminal (el puente de otra versión, un
//! CLI que limpia el entorno de sus servidores MCP) no es de fuera y no baja con ello.
//!
//! Con cualquier duda la respuesta es `None`, o sea «de fuera», con su ventana.
//! El motor aparte de fábrica solo existe en Windows: en los demás sistemas, `None`.

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;

use super::PanelCreido;
use crate::pedir_secreto::QuienPide;

/// Quién pide una clave. Una petición que presenta panel se decide solo por su
/// contraseña: `por_su_proceso` se consulta únicamente si no presentó ninguno.
pub(super) fn quien_pide(presentado: Option<(u32, PanelCreido)>, por_su_proceso: impl FnOnce() -> Option<u32>) -> QuienPide {
    match presentado {
        Some((n, PanelCreido::Suyo | PanelCreido::DeAntes)) => QuienPide::Terminal(n),
        Some((_, PanelCreido::No)) => QuienPide::Fuera,
        None => por_su_proceso().map_or(QuienPide::Fuera, QuienPide::Terminal),
    }
}

/// La terminal de la que cuelga quien abrió esta conexión, si cuelga de alguna.
pub(super) fn terminal_del_que_pide(app: &tauri::AppHandle, puntas: Option<(SocketAddr, SocketAddr)>) -> Option<u32> {
    let (panel, dueno) = terminal_y_proceso(app, puntas)?;
    crate::anotar(&format!("Una petición de clave sin terminal viene del proceso {dueno}, que cuelga de la terminal {panel}: es un `adeorq` de otra versión en su PATH."));
    Some(panel)
}

/// Si una conexión que no ha presentado contraseña cuelga de una terminal de Adeorq.
pub(super) fn cuelga_de_una_terminal(app: &tauri::AppHandle, puntas: Option<(SocketAddr, SocketAddr)>) -> bool {
    terminal_y_proceso(app, puntas).is_some()
}

fn terminal_y_proceso(app: &tauri::AppHandle, puntas: Option<(SocketAddr, SocketAddr)>) -> Option<(u32, u32)> {
    let (cliente, servidor) = puntas?;
    let paneles: HashMap<u32, u32> = crate::pty::fichas(app).into_iter().filter_map(|f| Some((f.pid?, f.id))).collect();
    terminal_al_otro_lado(cliente, servidor, &paneles)
}

/// Lo que dijo una línea `panel` sobre si esta conexión puede mirarse por su proceso.
/// Sin contraseña es un cliente que no la conoce (el puente de antes de la 0.9.239, o
/// uno sin entorno): se mira. Una contraseña mala no se arregla por colgar de una
/// terminal, y un número ya creído no necesita nada más.
pub(super) fn se_mira_por_su_proceso(creido: PanelCreido, trae_clave: bool) -> bool {
    creido == PanelCreido::No && !trae_clave
}

/// La terminal de la que desciende `inicio`, subiendo por los padres.
///
/// `padres` es la foto de procesos (pid → padre) y `paneles`, el pid de cada terminal
/// con su número. Windows guarda el pid del padre aunque ese padre ya haya muerto, y
/// ese número se puede reutilizar: un padre que nació después que su hijo no es su
/// padre. Un padre que ya no está, una fecha que no se puede leer o una vuelta en la
/// cadena terminan en `None`.
#[cfg_attr(not(windows), allow(dead_code))]
fn subir(inicio: u32, padres: &HashMap<u32, u32>, nacio: impl Fn(u32) -> Option<u64>, paneles: &HashMap<u32, u32>) -> Option<u32> {
    let mut actual = inicio;
    let mut vistos = HashSet::new();
    loop {
        let padre = *padres.get(&actual)?;
        if let Some(&panel) = paneles.get(&actual) {
            return Some(panel);
        }
        if !vistos.insert(actual) || !padres.contains_key(&padre) || nacio(padre)? > nacio(actual)? {
            return None;
        }
        actual = padre;
    }
}

/// Una fila de la tabla de conexiones de Windows: una de las dos puntas de una
/// conexión y el proceso que tiene esa punta.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Fila {
    local: SocketAddr,
    remota: SocketAddr,
    pid: u32,
}

/// El dueño de la punta `cliente` de la conexión `cliente` → `servidor`. Una fila sin
/// dueño es una conexión ya cerrada (el pid 0); dos dueños distintos, una duda.
#[cfg_attr(not(windows), allow(dead_code))]
fn dueno_en(filas: &[Fila], cliente: SocketAddr, servidor: SocketAddr) -> Option<u32> {
    let mut duenos = filas.iter().filter(|f| f.local == cliente && f.remota == servidor && f.pid != 0).map(|f| f.pid);
    let dueno = duenos.next()?;
    duenos.all(|p| p == dueno).then_some(dueno)
}

/// La terminal que hay detrás de una conexión, y el proceso por el que se la reconoció.
#[cfg(windows)]
fn terminal_al_otro_lado(cliente: SocketAddr, servidor: SocketAddr, paneles: &HashMap<u32, u32>) -> Option<(u32, u32)> {
    let dueno = dueno_en(&tabla_de_conexiones()?, cliente, servidor)?;
    let padres: HashMap<u32, u32> = crate::pulso::foto_procesos().into_iter().map(|(pid, padre, _)| (pid, padre)).collect();
    subir(dueno, &padres, nacio, paneles).map(|panel| (panel, dueno))
}

#[cfg(not(windows))]
fn terminal_al_otro_lado(_cliente: SocketAddr, _servidor: SocketAddr, _paneles: &HashMap<u32, u32>) -> Option<(u32, u32)> {
    None
}

/// Las conexiones TCP por IPv4 del equipo, con su dueño. El puerto del MCP solo
/// escucha en 127.0.0.1, así que IPv6 no hace falta.
#[cfg(windows)]
fn tabla_de_conexiones() -> Option<Vec<Fila>> {
    use std::net::{Ipv4Addr, SocketAddrV4};
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, TCP_TABLE_OWNER_PID_CONNECTIONS};
    const AF_INET: u32 = 2;
    const SIN_ESPACIO: u32 = 122;
    /// Cuántos `u32` ocupa una fila (`MIB_TCPROW_OWNER_PID`).
    const CAMPOS: usize = 6;

    // La tabla es un contador seguido de filas de `u32`, y puede crecer entre las
    // dos llamadas. Tres intentos: si sigue sin caber, es una duda más.
    let mut bytes = 0u32;
    let mut memoria: Vec<u32> = Vec::new();
    for _ in 0..3 {
        // SAFETY: el puntero y `bytes` describen `memoria`, que sigue viva durante la
        // llamada; con 0 bytes, Windows solo dice cuántos hacen falta.
        let r = unsafe { GetExtendedTcpTable(memoria.as_mut_ptr().cast(), &mut bytes, 0, AF_INET, TCP_TABLE_OWNER_PID_CONNECTIONS, 0) };
        match r {
            0 => {
                let (cuantas, filas) = memoria.split_first()?;
                let punta = |dir: u32, puerto: u32| SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::from(dir.to_ne_bytes()), u16::from_be(puerto as u16)));
                return Some(
                    filas
                        .chunks_exact(CAMPOS)
                        .take(*cuantas as usize)
                        .map(|c| Fila { local: punta(c[1], c[2]), remota: punta(c[3], c[4]), pid: c[5] })
                        .collect(),
                );
            }
            SIN_ESPACIO => memoria.resize((bytes as usize).div_ceil(4), 0),
            _ => return None,
        }
    }
    None
}

/// Cuándo nació un proceso, en la unidad de `FILETIME`. `None` si Windows no deja
/// mirarlo o ya no existe.
#[cfg(windows)]
fn nacio(pid: u32) -> Option<u64> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    // SAFETY: el identificador se comprueba antes de usarlo y se cierra una sola vez;
    // las cuatro fechas son variables locales que viven durante la llamada.
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut creado = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut salida, mut nucleo, mut usuario) = (creado, creado, creado);
        let bien = GetProcessTimes(h, &mut creado, &mut salida, &mut nucleo, &mut usuario);
        CloseHandle(h);
        (bien != 0).then(|| (u64::from(creado.dwHighDateTime) << 32) | u64::from(creado.dwLowDateTime))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La misma fecha para todos: el orden de nacimiento se prueba aparte.
    fn igual(_: u32) -> Option<u64> {
        Some(1)
    }

    fn mapa(pares: &[(u32, u32)]) -> HashMap<u32, u32> {
        pares.iter().copied().collect()
    }

    #[test]
    fn subiendo_por_los_padres_se_llega_a_la_terminal() {
        // adeorq → bash → claude → powershell, que es la terminal 38 → el motor.
        let padres = mapa(&[(50, 40), (40, 30), (30, 20), (20, 10), (10, 1), (1, 0)]);
        let paneles = mapa(&[(20, 38)]);
        assert_eq!(subir(50, &padres, igual, &paneles), Some(38));
        assert_eq!(subir(20, &padres, igual, &paneles), Some(38), "la propia terminal también lo es");
    }

    #[test]
    fn lo_que_no_cuelga_de_una_terminal_no_es_una_terminal() {
        let padres = mapa(&[(50, 40), (40, 1), (1, 0), (20, 1)]);
        assert_eq!(subir(50, &padres, igual, &mapa(&[(20, 38)])), None);
        assert_eq!(subir(1, &padres, igual, &mapa(&[(20, 38)])), None, "el motor está por encima, no por debajo");
        assert_eq!(subir(50, &padres, igual, &HashMap::new()), None, "sin terminales no hay nada que encontrar");
    }

    #[test]
    fn una_vuelta_en_la_cadena_termina() {
        let padres = mapa(&[(1, 2), (2, 3), (3, 1)]);
        assert_eq!(subir(1, &padres, igual, &mapa(&[(9, 38)])), None);
        let raiz = mapa(&[(0, 0)]);
        assert_eq!(subir(0, &raiz, igual, &mapa(&[(9, 38)])), None, "el pid 0 es su propio padre");
    }

    #[test]
    fn un_padre_muerto_corta_la_cadena() {
        // 40 ya no está: no se salta para buscar a la terminal.
        let padres = mapa(&[(50, 40), (20, 1), (1, 0)]);
        assert_eq!(subir(50, &padres, igual, &mapa(&[(20, 38), (40, 39)])), None);
    }

    #[test]
    fn un_pid_reutilizado_no_es_el_padre() {
        // El padre de 50 murió y su número lo tiene ahora la terminal, nacida después.
        let padres = mapa(&[(50, 20), (20, 1), (1, 0)]);
        let nacimientos = mapa(&[(50, 100), (20, 200), (1, 1)]);
        let nacio = |p: u32| nacimientos.get(&p).map(|n| u64::from(*n));
        assert_eq!(subir(50, &padres, nacio, &mapa(&[(20, 38)])), None);
    }

    #[test]
    fn una_fecha_que_no_se_puede_leer_es_una_duda() {
        let padres = mapa(&[(50, 20), (20, 1), (1, 0)]);
        assert_eq!(subir(50, &padres, |p| (p != 20).then_some(1), &mapa(&[(20, 38)])), None);
        assert_eq!(subir(50, &padres, |p| (p != 50).then_some(1), &mapa(&[(20, 38)])), None);
    }

    #[test]
    fn quien_presenta_panel_se_decide_por_su_contrasena() {
        let nunca = || -> Option<u32> { panic!("con panel no se mira el proceso") };
        assert_eq!(quien_pide(Some((4, PanelCreido::Suyo)), nunca), QuienPide::Terminal(4));
        assert_eq!(quien_pide(Some((4, PanelCreido::DeAntes)), nunca), QuienPide::Terminal(4));
        assert_eq!(quien_pide(Some((4, PanelCreido::No)), nunca), QuienPide::Fuera, "una contraseña mala no se arregla por descender de una terminal");
        assert_eq!(quien_pide(None, || Some(7)), QuienPide::Terminal(7));
        assert_eq!(quien_pide(None, || None), QuienPide::Fuera);
    }

    #[test]
    fn una_linea_panel_dice_si_se_mira_su_proceso() {
        assert!(se_mira_por_su_proceso(PanelCreido::No, false), "un número sin contraseña");
        assert!(!se_mira_por_su_proceso(PanelCreido::No, true), "una contraseña mala no se arregla");
        assert!(!se_mira_por_su_proceso(PanelCreido::Suyo, true));
        assert!(!se_mira_por_su_proceso(PanelCreido::DeAntes, false), "ya está creído");
    }

    #[test]
    fn de_las_dos_puntas_cuenta_la_del_cliente() {
        let cliente: SocketAddr = "127.0.0.1:50000".parse().unwrap();
        let servidor: SocketAddr = "127.0.0.1:3012".parse().unwrap();
        let otro: SocketAddr = "127.0.0.1:50001".parse().unwrap();
        let suya = Fila { local: cliente, remota: servidor, pid: 7 };
        let del_servidor = Fila { local: servidor, remota: cliente, pid: 9 };
        let cerrada = Fila { local: cliente, remota: servidor, pid: 0 };
        let de_otro = Fila { local: otro, remota: servidor, pid: 8 };
        assert_eq!(dueno_en(&[del_servidor, cerrada, de_otro, suya], cliente, servidor), Some(7));
        assert_eq!(dueno_en(&[del_servidor, cerrada, de_otro], cliente, servidor), None);
        assert_eq!(dueno_en(&[suya, Fila { pid: 8, ..suya }], cliente, servidor), None, "dos dueños son una duda");
    }

    /// Con un socket de verdad y la tabla de verdad: si el orden de los bytes de la
    /// dirección o del puerto estuviera mal, aquí no se encontraría.
    #[cfg(windows)]
    #[test]
    fn la_tabla_de_verdad_dice_de_quien_es_una_conexion() {
        let escucha = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let cliente = std::net::TcpStream::connect(escucha.local_addr().unwrap()).unwrap();
        let (_aceptada, desde) = escucha.accept().unwrap();
        assert_eq!(desde, cliente.local_addr().unwrap());
        let yo = std::process::id();
        let servidor = escucha.local_addr().unwrap();
        assert_eq!(dueno_en(&tabla_de_conexiones().unwrap(), desde, servidor), Some(yo));
        assert_eq!(terminal_al_otro_lado(desde, servidor, &mapa(&[(yo, 38)])), Some((38, yo)));
        assert_eq!(terminal_al_otro_lado(desde, servidor, &mapa(&[(u32::MAX, 38)])), None);
        assert!(nacio(yo).is_some());
    }

    /// Lo que cuesta mirar el proceso de una conexión que no cuelga de ninguna terminal,
    /// que es lo que paga cada llamada de un programa de fuera: la tabla de conexiones,
    /// la foto de procesos y subir hasta arriba. Se mide, no se comprueba:
    /// `cargo test --lib cuanto_cuesta_mirar -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn cuanto_cuesta_mirar_el_proceso_de_una_conexion_de_fuera() {
        let escucha = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let _cliente = std::net::TcpStream::connect(escucha.local_addr().unwrap()).unwrap();
        let (_aceptada, desde) = escucha.accept().unwrap();
        let servidor = escucha.local_addr().unwrap();
        let ninguna = HashMap::new();
        let mut tiempos: Vec<f64> = (0..200)
            .map(|_| {
                let t = std::time::Instant::now();
                assert_eq!(terminal_al_otro_lado(desde, servidor, &ninguna), None);
                t.elapsed().as_secs_f64() * 1000.0
            })
            .collect();
        tiempos.sort_by(f64::total_cmp);
        let procesos = crate::pulso::foto_procesos().len();
        let conexiones = tabla_de_conexiones().map_or(0, |t| t.len());
        println!(
            "MEDIDA {procesos} procesos, {conexiones} conexiones: mediana {:.2} ms, p95 {:.2} ms, máx {:.2} ms",
            tiempos[100],
            tiempos[190],
            tiempos[199]
        );
    }

    /// Un hijo de verdad cuelga de su padre, y deja de hacerlo si se dice que la
    /// terminal es otro proceso.
    #[cfg(windows)]
    #[test]
    fn un_hijo_de_verdad_desciende_de_su_padre() {
        let mut hijo = std::process::Command::new("cmd").args(["/c", "ping -n 30 127.0.0.1 >nul"]).spawn().unwrap();
        let padres: HashMap<u32, u32> = crate::pulso::foto_procesos().into_iter().map(|(p, m, _)| (p, m)).collect();
        let yo = std::process::id();
        let con_terminal = subir(hijo.id(), &padres, nacio, &mapa(&[(yo, 38)]));
        let sin_terminal = subir(hijo.id(), &padres, nacio, &mapa(&[(hijo.id() + 1, 38)]));
        let _ = hijo.kill();
        let _ = hijo.wait();
        assert_eq!(con_terminal, Some(38));
        assert_eq!(sin_terminal, None);
    }
}
