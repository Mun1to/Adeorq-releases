// Lo que hace el sondeo, según su primer argumento. Cada modo es una de las pruebas de
// `docs/contexto/tiendas.md`, hecha DESDE DENTRO del paquete; `../medir.ps1` las lanza y
// mira desde fuera lo que dejaron. Todo lo que cuenta se escribe en
// `%USERPROFILE%\.sondeo`, que ningún paquete redirige: así el resultado llega aunque
// el proceso no tenga consola ni su `AppData` sea privado.
//
//   identidad          su nombre de paquete (o SIN-PAQUETE)                     (T2)
//   eco                lee una línea de la entrada y la devuelve por la salida  (T3)
//   crear              crea ficheros y una clave de registro en varios sitios   (T1)
//   hijos              lanza `cmd` y `powershell` y les hace mirar su mundo     (T2)
//   servir <puerto>    escucha en 127.0.0.1 y contesta una línea                (T6)
//   motor              se copia a AppData y se lanza aparte, como el motor      (T4)
//   vivir              lo que hace esa copia: mirar su mundo y latir            (T4, T5)
//   arranque           la tarea de arranque de Windows, como `autostart.rs`
//   (nada)             una sola instancia por un mutex con nombre               (T7)

use std::io::{BufRead, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

fn var(nombre: &str) -> String {
    std::env::var(nombre).unwrap_or_default()
}

/// Dónde deja lo que cuenta: `%USERPROFILE%\.sondeo`.
fn resultados() -> PathBuf {
    PathBuf::from(var("USERPROFILE")).join(".sondeo")
}

fn anotar(nombre: &str, texto: &str) {
    let d = resultados();
    let _ = std::fs::create_dir_all(&d);
    let _ = std::fs::write(d.join(nombre), texto);
}

/// El nombre completo del paquete con el que corre este proceso, o `SIN-PAQUETE`: la
/// misma pregunta que `packaged.rs` de Adeorq.
pub fn paquete() -> String {
    use windows_sys::Win32::Foundation::{APPMODEL_ERROR_NO_PACKAGE, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
    let mut n: u32 = 128;
    let mut b = [0u16; 128];
    // SAFETY: `n` y `b` viven toda la llamada y `n` es el tamaño de `b`.
    let r = unsafe { GetCurrentPackageFullName(&mut n, b.as_mut_ptr()) };
    if r == APPMODEL_ERROR_NO_PACKAGE {
        "SIN-PAQUETE".into()
    } else if r == ERROR_SUCCESS {
        String::from_utf16_lossy(&b[..(n as usize).saturating_sub(1)])
    } else {
        format!("ERROR-{r}")
    }
}

fn ahora_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

pub fn principal() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("identidad") => identidad(),
        Some("eco") => eco(&args[2..]),
        Some("crear") => crear(),
        Some("hijos") => hijos(),
        Some("servir") => servir(args.get(2).and_then(|p| p.parse().ok()).unwrap_or(3012)),
        Some("motor") => motor(),
        Some("vivir") => vivir(),
        Some("arranque") => arranque(),
        _ => una_sola(),
    }
}

fn identidad() {
    let p = paquete();
    anotar("identidad.txt", &format!("paquete={p}\nexe={:?}\n", std::env::current_exe().ok()));
    println!("{p}");
}

/// T3: lo que un cliente de fuera necesita de `adeorq.exe --mcp` por el alias: que le
/// llegue la entrada, que su salida vuelva, y su entorno y sus argumentos.
fn eco(resto: &[String]) {
    let mut linea = String::new();
    let leidos = std::io::stdin().lock().read_line(&mut linea).unwrap_or(0);
    let salida = format!(
        "eco:{}|paquete={}|pane={}|cwd={}|args={}|leidos={leidos}",
        linea.trim_end(),
        paquete(),
        var("ADEORQ_PANE_ID"),
        std::env::current_dir().map(|d| d.display().to_string()).unwrap_or_default(),
        resto.join(" "),
    );
    println!("{salida}");
    let _ = std::io::stdout().flush();
    eprintln!("error-estandar-ok");
}

fn escribir(dir: &PathBuf, nombre: &str, texto: &str) -> bool {
    std::fs::create_dir_all(dir).and_then(|_| std::fs::write(dir.join(nombre), texto)).is_ok()
}

/// El `Run` de `HKCU`: lo que escribe `auto-launch` para arrancar con Windows. Devuelve el
/// código de Windows (0 = escrito).
fn escribir_run() -> u32 {
    use windows_sys::Win32::System::Registry::{RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ};
    let ancho = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    let clave = ancho("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let nombre = ancho("SondeoT1");
    let valor = ancho("C:\\sondeo-arranque.exe");
    // SAFETY: punteros a vectores vivos durante la llamada; el identificador se cierra.
    unsafe {
        let mut h: HKEY = std::ptr::null_mut();
        let r = RegCreateKeyExW(HKEY_CURRENT_USER, clave.as_ptr(), 0, std::ptr::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, std::ptr::null(), &mut h, std::ptr::null_mut());
        if r != 0 {
            return r;
        }
        let r = RegSetValueExW(h, nombre.as_ptr(), 0, REG_SZ, valor.as_ptr() as *const u8, (valor.len() * 2) as u32);
        RegCloseKey(h);
        r
    }
}

/// T1: ¿qué ve de fuera lo que la app crea en cada sitio? Aquí solo se CREA; mirar
/// desde fuera lo hace `medir.ps1`.
fn crear() {
    let local = PathBuf::from(var("LOCALAPPDATA"));
    let roaming = PathBuf::from(var("APPDATA"));
    let casa = PathBuf::from(var("USERPROFILE"));
    let mut informe = String::new();
    let sitios = [
        ("local", local.join("SondeoT1")),
        ("roaming", roaming.join("SondeoT1")),
        ("locallow", casa.join("AppData").join("LocalLow").join("SondeoT1")),
        ("casa", casa.join(".sondeo-datos")),
    ];
    for (nombre, dir) in &sitios {
        informe += &format!("escribe_{nombre}={}\n", escribir(dir, "hecho-por-la-app.txt", nombre));
    }
    // Lo que ya existía fuera (lo deja `medir.ps1` antes): ¿lo ve la app, y puede modificarlo?
    let previo = local.join("SondeoFuera").join("previo.txt");
    informe += &format!("ve_lo_previo_de_fuera={}\n", previo.exists());
    informe += &format!("lee_lo_previo={}\n", std::fs::read_to_string(&previo).unwrap_or_default().trim());
    let modifica = std::fs::OpenOptions::new().append(true).open(&previo).and_then(|mut f| f.write_all(b"modificado-por-la-app\n"));
    informe += &format!("modifica_lo_previo={}\n", modifica.is_ok());
    informe += &format!("registro_run={}\n", escribir_run());
    informe += &format!("paquete={}\n", paquete());
    anotar("t1.txt", &informe);
}

/// T2: los hijos que lanza el paquete, ¿ven el `AppData` de verdad? ¿tienen la identidad?
fn hijos() {
    let local = var("LOCALAPPDATA");
    let res = resultados();
    let _ = std::fs::create_dir_all(&res);
    // `powershell` crea la carpeta (el sondeo no), escribe y cuenta su identidad.
    let guion = format!(
        r#"$d = Join-Path $env:LOCALAPPDATA 'SondeoT2'
New-Item -ItemType Directory -Force $d | Out-Null
'hijo-ps' | Set-Content (Join-Path $d 'hijo-ps.txt')
Add-Type -Namespace S -Name P -MemberDefinition '[DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern int GetCurrentPackageFullName(ref int n, System.Text.StringBuilder b);'
$n = 300
$b = New-Object System.Text.StringBuilder 300
$r = [S.P]::GetCurrentPackageFullName([ref]$n, $b)
"codigo=$r nombre=$($b.ToString())" | Set-Content '{res}\t2-hijo-ps.txt'"#,
        res = res.display()
    );
    let ps = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoProfile", "-NonInteractive", "-Command", &guion])
        .status();
    // Y `cmd` escribe en la misma carpeta, ya creada por otro hijo. `raw_arg`: las comillas
    // de una ruta dentro de un argumento normal las escapa Rust como `\"`, que `cmd` no entiende.
    let cmd = Command::new("cmd")
        .creation_flags(CREATE_NO_WINDOW)
        .raw_arg(format!("/c echo hijo-cmd> \"{local}\\SondeoT2\\hijo-cmd.txt\""))
        .status();
    anotar("t2.txt", &format!("cmd={cmd:?}\nps={ps:?}\npaquete={}\n", paquete()));
}

/// T6: un servidor de una sola respuesta en 127.0.0.1, como el puerto 3012 del MCP.
fn servir(puerto: u16) {
    let Ok(l) = std::net::TcpListener::bind(("127.0.0.1", puerto)) else {
        anotar("t6.txt", &format!("no_pudo_escuchar={puerto}\n"));
        return;
    };
    let _ = l.set_nonblocking(true);
    anotar("t6-escucha.txt", &format!("escuchando={puerto}\npaquete={}\n", paquete()));
    let limite = ahora_ms() + 90_000;
    while ahora_ms() < limite {
        match l.accept() {
            Ok((mut s, _)) => {
                let _ = s.set_nonblocking(false);
                let _ = s.set_read_timeout(Some(Duration::from_secs(5)));
                let mut linea = String::new();
                let _ = std::io::BufReader::new(&s).read_line(&mut linea);
                let _ = writeln!(s, "eco:{}", linea.trim_end());
                anotar("t6.txt", &format!("recibido={}\n", linea.trim_end()));
                return;
            }
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
    anotar("t6.txt", "nadie_conecto\n");
}

/// T4: como `terminales::ejecutable_del_motor` + `lanzar`: se copia a una carpeta de
/// `AppData` y se lanza aparte, sin colgar del proceso que lo lanzó.
fn motor() {
    let dir = PathBuf::from(var("LOCALAPPDATA")).join("SondeoMotor");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(dir.join("clave.txt"), "secreto-del-padre");
    let Ok(yo) = std::env::current_exe() else { return };
    let copia = dir.join("motor.exe");
    let copiado = std::fs::copy(&yo, &copia);
    // Primero como lo hace Adeorq (separado y fuera del trabajo del padre); si el
    // sistema no deja salirse del trabajo, sin eso, y se anota.
    let con_salida = Command::new(&copia).arg("vivir").creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB).spawn();
    let (lanzado, como) = match con_salida {
        Ok(h) => (Ok(h.id()), "con BREAKAWAY".to_string()),
        Err(e1) => match Command::new(&copia).arg("vivir").creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP).spawn() {
            Ok(h) => (Ok(h.id()), format!("sin BREAKAWAY (con BREAKAWAY: {e1})")),
            Err(e2) => (Err(e2.to_string()), "ninguno".to_string()),
        },
    };
    anotar(
        "t4-padre.txt",
        &format!("paquete={}\ncopiado={:?}\nlanzado={lanzado:?}\ncomo={como}\ncopia={}\n", paquete(), copiado.map_err(|e| e.to_string()), copia.display()),
    );
}

/// T4 y T5: lo que hace el proceso lanzado aparte: mirar su mundo y latir hasta que le digan.
fn vivir() {
    let dir = PathBuf::from(var("LOCALAPPDATA")).join("SondeoMotor");
    anotar(
        "t4-hijo.txt",
        &format!(
            "paquete={}\nve_la_clave_del_padre={:?}\nexe={:?}\npid={}\n",
            paquete(),
            std::fs::read_to_string(dir.join("clave.txt")).ok(),
            std::env::current_exe().ok(),
            std::process::id()
        ),
    );
    let parar = resultados().join("parar");
    while !parar.exists() {
        anotar("latido.txt", &format!("{}|{}", std::process::id(), ahora_ms()));
        std::thread::sleep(Duration::from_millis(500));
    }
    anotar("t4-hijo-fin.txt", "paro_a_peticion\n");
}

/// El arranque con Windows de un paquete, con la misma llamada que `autostart.rs`.
fn arranque() {
    use windows::core::HSTRING;
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    // SAFETY: inicializar COM en este hilo no toca memoria de nadie.
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let nombre = |s: StartupTaskState| match s {
        StartupTaskState::Enabled => "Enabled",
        StartupTaskState::Disabled => "Disabled",
        StartupTaskState::DisabledByUser => "DisabledByUser",
        StartupTaskState::DisabledByPolicy => "DisabledByPolicy",
        StartupTaskState::EnabledByPolicy => "EnabledByPolicy",
        _ => "otro",
    };
    let mut informe = format!("paquete={}\n", paquete());
    match StartupTask::GetAsync(&HSTRING::from("SondeoStartup")).and_then(|a| a.join()) {
        Err(e) => informe += &format!("GetAsync=ERROR {e}\n"),
        Ok(t) => {
            informe += &format!("estado_inicial={}\n", t.State().map(nombre).unwrap_or("?"));
            let pedido = t.RequestEnableAsync().and_then(|a| a.join());
            informe += &format!("RequestEnable={}\n", pedido.as_ref().map(|s| nombre(*s)).unwrap_or("ERROR"));
            informe += &format!("estado_tras_encender={}\n", t.State().map(nombre).unwrap_or("?"));
            informe += &format!("Disable={:?}\n", t.Disable().is_ok());
            informe += &format!("estado_final={}\n", t.State().map(nombre).unwrap_or("?"));
        }
    }
    anotar("arranque.txt", &informe);
}

/// T7: una sola instancia por un mutex con nombre en el espacio de la sesión, que es lo que
/// usa `tauri-plugin-single-instance`. Se lanza sin argumentos desde `shell:AppsFolder`.
fn una_sola() {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    let nombre: Vec<u16> = "Local\\sondeo-una-sola-instancia".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: `nombre` vive toda la llamada; el mutex se queda abierto hasta que muere el proceso.
    let ya = unsafe {
        let _m = CreateMutexW(std::ptr::null(), 0, nombre.as_ptr());
        GetLastError() == ERROR_ALREADY_EXISTS
    };
    anotar(&format!("unica-{}.txt", std::process::id()), &format!("{}\npaquete={}\n", if ya { "segunda" } else { "primera" }, paquete()));
    if !ya {
        std::thread::sleep(Duration::from_secs(25));
    }
}
