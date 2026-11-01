// Lo que en macOS no se parece ni a Windows ni a Linux.
//
// Fuera de Windows, Adeorq daba por hecho que "no es Windows" quería decir
// "es Linux": la carpeta de datos en `~/.local/share`, los procesos en `/proc`,
// el reposo con `systemd-inhibit`. En un Mac nada de eso existe. Este módulo es
// lo que falta, y está aparte para que Windows y Linux no tengan que leer ni una
// línea de lo que sigue: lo que depende del sistema va bajo
// `cfg(target_os = "macos")`, y las funciones puras (partir una ruta, juntar dos
// PATH) se compilan en todas partes para poder probarlas sin un Mac.
//
// Capítulo: `docs/contexto/mac.md`. NO PROBADO en un Mac de verdad.

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::path::PathBuf;

/// La carpeta de datos en un Mac: `~/Library/Application Support/Adeorq`.
///
/// No `~/.local/share/adeorq`, que es lo de Linux, por una razón concreta y no de
/// estilo: el protocolo `asset:` (el fondo de vídeo, las fotos, los fondos de la
/// tarjeta) solo sirve lo que cae dentro de `assetProtocol.scope` de
/// `tauri.conf.json`, y ahí está `$LOCALDATA/Adeorq/**`, que en macOS es
/// justo `~/Library/Application Support/Adeorq`. En `~/.local/share` no se vería
/// ni un fondo.
pub fn datos_en(casa: &str) -> PathBuf {
    std::path::Path::new(casa)
        .join("Library")
        .join("Application Support")
        .join("Adeorq")
}

/// La marca que rodea al PATH en lo que imprime la shell, porque una shell
/// interactiva escribe más cosas (el mensaje del día, un `neofetch` en el
/// `.zshrc`) y el PATH hay que sacarlo de en medio.
const MARCA: &str = "__ADEORQ_PATH__";

/// El PATH que la shell imprimió, sacado de entre las dos marcas. `None` si no
/// salió ninguno o salió vacío.
pub fn extraer_path(salida: &str) -> Option<String> {
    let desde = salida.find(MARCA)? + MARCA.len();
    let resto = &salida[desde..];
    let hasta = resto.find(MARCA)?;
    let ruta = resto[..hasta].trim();
    (!ruta.is_empty()).then(|| ruta.to_owned())
}

/// Junta el PATH de la shell del usuario con el que ya tenía la app: primero las
/// carpetas de la shell, en su orden (es el que él eligió), y detrás las que
/// solo tenía la app. Sin repetidas y sin vacías.
pub fn unir_path(de_la_shell: &str, actual: &str) -> String {
    let mut vistas = std::collections::HashSet::new();
    let mut salida: Vec<&str> = Vec::new();
    for dir in de_la_shell.split(':').chain(actual.split(':')) {
        if !dir.is_empty() && vistas.insert(dir) {
            salida.push(dir);
        }
    }
    salida.join(":")
}

/// Las carpetas donde un Mac pone los programas de línea de órdenes, para
/// cuando la shell no contesta a tiempo. Solo se añaden las que existen.
pub fn carpetas_habituales(casa: &str) -> Vec<String> {
    vec![
        "/opt/homebrew/bin".to_owned(),
        "/opt/homebrew/sbin".to_owned(),
        "/usr/local/bin".to_owned(),
        format!("{casa}/.local/bin"),
        format!("{casa}/.claude/local"),
        format!("{casa}/.bun/bin"),
        format!("{casa}/.cargo/bin"),
    ]
}

/// Una app que se abre desde el Finder no hereda el PATH de la terminal: arranca
/// con el de `launchd`, que es `/usr/bin:/bin:/usr/sbin:/sbin`. Sin esto no se
/// encuentra `claude` (que vive en `~/.local/bin`), ni `codex` o `gemini` (en
/// `/opt/homebrew/bin` o en la carpeta de `npm`), ni `git` más nuevo que el de
/// Apple. Se le pregunta una vez a la shell de login del usuario, que es quien
/// sabe su PATH, y se pone en el entorno del proceso: todo lo que Adeorq lance
/// después (cada terminal, `claude -p`, `git`) lo hereda.
///
/// Se llama ANTES de que nazca ningún otro hilo: cambiar el entorno con hilos
/// vivos no es seguro. Tiene un tope de cuatro segundos; si la shell se cuelga
/// (un `.zshrc` que pregunta algo), se la mata y se sigue con las carpetas de
/// siempre. Nunca falla: lo peor que pasa es quedarse como estaba.
#[cfg(target_os = "macos")]
pub fn heredar_path_del_usuario() {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    let actual = std::env::var("PATH").unwrap_or_default();
    let casa = std::env::var("HOME").unwrap_or_default();
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_owned());

    let script = format!("printf '%s%s%s' '{MARCA}' \"$PATH\" '{MARCA}'");
    // `-l -i`: de login para el `.zprofile` (donde Homebrew pone su `shellenv`) e
    // interactiva para el `.zshrc` (donde el instalador de Claude Code añade
    // `~/.local/bin`). La salida de error se tira: una shell interactiva sin
    // terminal se queja de que no tiene control de trabajos.
    let hijo = Command::new(&shell)
        .args(["-l", "-i", "-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let mut de_la_shell = None;
    if let Ok(mut hijo) = hijo {
        if let Some(mut tuberia) = hijo.stdout.take() {
            let (tx, rx) = std::sync::mpsc::channel();
            // Un hilo lee y el principal espera con tope: si algo que lanzó el
            // `.zshrc` se queda con la tubería abierta, el hilo se queda
            // colgado pero la app no.
            std::thread::spawn(move || {
                let mut texto = String::new();
                let mut bytes = Vec::new();
                let _ = tuberia.read_to_end(&mut bytes);
                texto.push_str(&String::from_utf8_lossy(&bytes));
                let _ = tx.send(texto);
            });
            if let Ok(texto) = rx.recv_timeout(Duration::from_secs(4)) {
                de_la_shell = extraer_path(&texto);
            }
        }
        let _ = hijo.kill();
        let _ = hijo.wait();
    }

    let base = match &de_la_shell {
        Some(p) => unir_path(p, &actual),
        None => actual.clone(),
    };
    let faltan: Vec<String> = carpetas_habituales(&casa)
        .into_iter()
        .filter(|d| std::path::Path::new(d).is_dir())
        .collect();
    let final_ = unir_path(&base, &faltan.join(":"));
    if final_ != actual {
        std::env::set_var("PATH", &final_);
    }
    crate::anotar(&format!(
        "macOS: PATH {} ({} carpetas)",
        if de_la_shell.is_some() { "heredado de la shell de login" } else { "con las carpetas habituales, la shell no contestó" },
        final_.split(':').count()
    ));
}

/// ¿Existe ese proceso? Sin `/proc`, que en macOS no hay: `kill` con la señal 0
/// no manda nada, solo pregunta. `EPERM` quiere decir que existe pero es de
/// otro usuario, que para esta pregunta es que sigue vivo.
#[cfg(target_os = "macos")]
pub fn pid_vivo(pid: u32) -> bool {
    if pid == 0 || pid > i32::MAX as u32 {
        return false;
    }
    // SAFETY: una consulta al sistema con un número, sin punteros ni memoria.
    let r = unsafe { libc::kill(pid as i32, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// Nombre con el que un proceso cuenta como agente. El instalador nativo de
/// Claude Code deja `~/.local/bin/claude` apuntando a un ejecutable que se llama
/// como su versión (`.../claude/versions/2.1.269`), y el kernel de macOS pone
/// de nombre el del fichero al que se llega, no el del enlace. Sin esto, un
/// Claude Code vivo contaría como un proceso llamado «2.1.269».
pub fn nombre_de_agente(nombre: &str, ruta: &str) -> String {
    let es_claude = ruta
        .split('/')
        .any(|trozo| trozo == "claude" || trozo == "claude-code" || trozo == ".claude");
    if es_claude && !nombre.to_ascii_lowercase().starts_with("claude") && !nombre.eq_ignore_ascii_case("node") {
        "claude".to_owned()
    } else {
        nombre.to_owned()
    }
}

#[cfg(target_os = "macos")]
fn texto_c(bytes: &[libc::c_char]) -> String {
    let fin = bytes.iter().position(|&c| c == 0).unwrap_or(bytes.len());
    let crudo: Vec<u8> = bytes[..fin].iter().map(|&c| c as u8).collect();
    String::from_utf8_lossy(&crudo).into_owned()
}

#[cfg(target_os = "macos")]
fn ruta_de(pid: i32) -> String {
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: el buffer es nuestro y se le dice su tamaño exacto.
    let n = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf8_lossy(&buf[..n as usize]).into_owned()
}

/// Todos los procesos como `(pid, padre, nombre)`, que es lo mismo que da
/// `/proc` en Linux y la foto de Toolhelp en Windows.
#[cfg(target_os = "macos")]
pub fn procesos() -> Vec<(u32, u32, String)> {
    let mut salida = Vec::new();
    // SAFETY: con el buffer nulo solo devuelve cuántos hay.
    let cuantos = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if cuantos <= 0 {
        return salida;
    }
    // Margen por si nacen procesos entre las dos llamadas.
    let mut pids = vec![0 as libc::pid_t; cuantos as usize + 64];
    let bytes = (pids.len() * std::mem::size_of::<libc::pid_t>()) as libc::c_int;
    // SAFETY: el buffer tiene `bytes` bytes y es de `pid_t`.
    let n = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
    if n <= 0 {
        return salida;
    }
    pids.truncate(n as usize);
    for pid in pids {
        if pid <= 0 {
            continue;
        }
        // SAFETY: estructura de ceros, que es un `proc_bsdinfo` válido.
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let tam = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
        // SAFETY: se pasa el puntero a `info` con su tamaño exacto.
        let leidos = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, (&mut info as *mut libc::proc_bsdinfo).cast(), tam) };
        if leidos != tam {
            continue;
        }
        let largo = texto_c(&info.pbi_name);
        let nombre = if largo.is_empty() { texto_c(&info.pbi_comm) } else { largo };
        let nombre = if nombre.is_empty() { nombre } else { nombre_de_agente(&nombre, &ruta_de(pid)) };
        salida.push((pid as u32, info.pbi_ppid, nombre));
    }
    salida
}

/// Memoria residente de un proceso, en bytes.
#[cfg(target_os = "macos")]
pub fn ram_de(pid: u32) -> Option<u64> {
    tarea_de(pid).map(|t| t.pti_resident_size)
}

/// Tiempo de CPU gastado por un proceso (usuario + sistema), en NANOSEGUNDOS.
/// El kernel lo cuenta en unidades de reloj de Mach, que en Apple Silicon no son
/// nanosegundos (cada una dura 41,67 ns): se pasan con `mach_timebase_info`.
#[cfg(target_os = "macos")]
pub fn cpu_de(pid: u32) -> Option<u64> {
    let t = tarea_de(pid)?;
    let mut base = libc::mach_timebase_info { numer: 0, denom: 0 };
    // SAFETY: rellena la estructura que le damos.
    if unsafe { libc::mach_timebase_info(&mut base) } != 0 || base.denom == 0 {
        return None;
    }
    let total = t.pti_total_user.saturating_add(t.pti_total_system);
    Some((total as u128 * base.numer as u128 / base.denom as u128) as u64)
}

#[cfg(target_os = "macos")]
fn tarea_de(pid: u32) -> Option<libc::proc_taskinfo> {
    // SAFETY: estructura de ceros, válida.
    let mut t: libc::proc_taskinfo = unsafe { std::mem::zeroed() };
    let tam = std::mem::size_of::<libc::proc_taskinfo>() as libc::c_int;
    // SAFETY: puntero a `t` con su tamaño exacto.
    let n = unsafe { libc::proc_pidinfo(pid as i32, libc::PROC_PIDTASKINFO, 0, (&mut t as *mut libc::proc_taskinfo).cast(), tam) };
    (n == tam).then_some(t)
}

/// Cuánta RAM tiene el Mac y cuánta queda de verdad libre, en bytes.
///
/// Libre es lo que el sistema puede dar sin molestar a nadie: páginas libres,
/// inactivas, especulativas y purgables. Las inactivas y las purgables parecen
/// ocupadas pero macOS las suelta en cuanto hace falta, igual que `MemAvailable`
/// en Linux; contar solo las libres diría «no queda nada» con el Mac sano.
#[cfg(target_os = "macos")]
pub fn memoria_sistema() -> (u64, u64) {
    let mut total: u64 = 0;
    let mut largo = std::mem::size_of::<u64>();
    // SAFETY: nombre C terminado en nul; se rellena un u64 con su tamaño.
    let ok = unsafe { libc::sysctlbyname(c"hw.memsize".as_ptr(), (&mut total as *mut u64).cast(), &mut largo, std::ptr::null_mut(), 0) };
    if ok != 0 {
        return (0, 0);
    }
    // SAFETY: estructura de ceros, válida.
    let mut vm: libc::vm_statistics64 = unsafe { std::mem::zeroed() };
    let mut cuenta = libc::HOST_VM_INFO64_COUNT;
    // SAFETY: se pasa `vm` con la cuenta de enteros que ocupa.
    let r = unsafe { libc::host_statistics64(libc::mach_host_self(), libc::HOST_VM_INFO64, (&mut vm as *mut libc::vm_statistics64).cast(), &mut cuenta) };
    if r != 0 {
        return (total, 0);
    }
    // SAFETY: una consulta al sistema sin punteros.
    let pagina = unsafe { libc::sysconf(libc::_SC_PAGESIZE) }.max(4096) as u64;
    let paginas = vm.free_count as u64 + vm.inactive_count as u64 + vm.speculative_count as u64 + vm.purgeable_count as u64;
    (total, (paginas * pagina).min(total))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_datos_caen_donde_el_protocolo_de_assets_los_sirve() {
        // `$LOCALDATA/Adeorq/**` de tauri.conf.json, que en macOS es esta carpeta.
        let d = datos_en("/Users/ana");
        assert_eq!(d, PathBuf::from("/Users/ana/Library/Application Support/Adeorq"));
        let conf = include_str!("../tauri.conf.json");
        assert!(conf.contains("$LOCALDATA/Adeorq/**"), "el alcance del protocolo de assets ya no cubre la carpeta de datos del Mac");
    }

    #[test]
    fn el_path_se_saca_de_entre_las_marcas_aunque_la_shell_hable_de_mas() {
        let salida = format!("Bienvenida, Ana\nÚltimo acceso hoy\n{MARCA}/opt/homebrew/bin:/usr/bin{MARCA}\n");
        assert_eq!(extraer_path(&salida).as_deref(), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(extraer_path("sin marcas"), None);
        assert_eq!(extraer_path(&format!("{MARCA}{MARCA}")), None, "vacío no es un PATH");
        assert_eq!(extraer_path(&format!("{MARCA}/usr/bin")), None, "falta la marca de cierre");
    }

    #[test]
    fn el_path_de_la_shell_manda_y_nada_se_repite() {
        let r = unir_path("/Users/ana/.local/bin:/opt/homebrew/bin:/usr/bin", "/usr/bin:/bin:/usr/sbin:/sbin");
        assert_eq!(r, "/Users/ana/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
        assert_eq!(unir_path("", "/usr/bin::/bin"), "/usr/bin:/bin", "las carpetas vacías sobran");
    }

    #[test]
    fn claude_nativo_cuenta_como_claude_aunque_su_fichero_se_llame_como_su_version() {
        let ruta = "/Users/ana/.local/share/claude/versions/2.1.269";
        assert_eq!(nombre_de_agente("2.1.269", ruta), "claude");
        assert_eq!(nombre_de_agente("claude", ruta), "claude");
        assert_eq!(nombre_de_agente("node", "/Users/ana/.nvm/versions/node/v22/bin/node"), "node");
        assert_eq!(nombre_de_agente("zsh", "/bin/zsh"), "zsh");
        // El de npm es un script de node: sigue llamándose node.
        assert_eq!(nombre_de_agente("node", "/Users/ana/.npm/claude-code/node"), "node");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn en_el_mac_de_verdad_el_proceso_propio_existe_y_aparece_en_la_lista() {
        let yo = std::process::id();
        assert!(pid_vivo(yo));
        assert!(!pid_vivo(0));
        let lista = procesos();
        assert!(lista.iter().any(|(pid, _, _)| *pid == yo), "mi propio proceso no sale en la foto");
        assert!(ram_de(yo).unwrap_or(0) > 0);
        assert!(cpu_de(yo).is_some());
        let (total, libre) = memoria_sistema();
        assert!(total > 0 && libre <= total);
    }
}
