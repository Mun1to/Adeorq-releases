// Las cajas: una terminal que nace en un sistema limpio aparte y se tira al
// cerrarla (Munir, 2026-11-15, K1 L3 N1: «que trabajen en su propio ordenador
// virtual probando las cosas ahí sin molestar el mío»). El plano entero, con sus
// riesgos y sus fuentes: `docs/contexto/cajas.md`.
//
// Cómo viaja: una marca en el entorno del panel, `ADEORQ_CAJA=docker:ubuntu`. El
// `env` de un panel ya llega hasta `pty_spawn` desde la Cabina y el Lienzo y se
// guarda con el tablero, así que la caja no necesita un campo propio en ningún
// sitio. `pty_spawn` la ve, llama a `preparar` y abre en la terminal un
// `docker run` en vez del programa: el mismo `Alta`, con otro comando.
//
// Lo que ve la caja: la carpeta de la terminal montada en `/work/<nombre>`, y en
// las de un agente una casa propia de las cajas (`<datos>\cajas\casa` en `/root`)
// donde se guarda su inicio de sesión. Nada más del PC. Al cerrar la terminal
// (`al_cerrar`, `al_terminar`, `tirar_todas`) el contenedor se tira.

use crate::SinVentana;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// La variable del panel que pide la caja. La quita `preparar`: no llega ni al
/// cliente de Docker ni a lo de dentro.
pub const VARIABLE: &str = "ADEORQ_CAJA";

/// El encargo de una terminal con encargo, que viaja por el entorno del cliente
/// de Docker (`-e ADEORQ_ENCARGO`, solo el nombre) y no por su línea de órdenes.
const ENCARGO: &str = "ADEORQ_ENCARGO";

/// La etiqueta que tienen todos los contenedores de las cajas, y las que dicen de
/// qué Adeorq son (`terminales::canal`: la instalada, la de desarrollo o una
/// prueba) y de qué terminal. Con eso se tiran sin tocar nunca los de otra.
const ETIQUETA: &str = "adeorq.caja";
const ETIQUETA_CANAL: &str = "adeorq.canal";
const ETIQUETA_PANEL: &str = "adeorq.panel";

/// Lo que puede gastar una caja. Docker Desktop tiene además su propio techo (la
/// memoria de su máquina virtual); esto es para que una sola no se lo coma.
const MEMORIA: &str = "6g";
const PROCESOS: &str = "4096";

/// Hasta cuánto se espera a que Docker Desktop arranque la primera vez.
const ESPERA_DOCKER: Duration = Duration::from_secs(180);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Distro {
    Ubuntu,
    Fedora,
    Debian,
}

impl Distro {
    pub fn id(self) -> &'static str {
        match self {
            Distro::Ubuntu => "ubuntu",
            Distro::Fedora => "fedora",
            Distro::Debian => "debian",
        }
    }

    fn nombre(self) -> &'static str {
        match self {
            Distro::Ubuntu => "Ubuntu",
            Distro::Fedora => "Fedora",
            Distro::Debian => "Debian",
        }
    }

    /// La imagen oficial de la que sale. `latest` y `stable` a propósito: una
    /// caja es para probar en el sistema de HOY, y la de un agente se reconstruye
    /// cuando cambia su receta (`etiqueta_de_imagen`).
    fn base(self) -> &'static str {
        match self {
            Distro::Ubuntu => "ubuntu:latest",
            Distro::Fedora => "fedora:latest",
            Distro::Debian => "debian:stable",
        }
    }

    /// La receta de la imagen de las cajas con agente: la de siempre más lo que
    /// un agente necesita (git, curl, node) y los CLI que corren en Linux. Cada
    /// CLI en su `RUN` y con `||`: que uno no se instale no deja sin caja a los
    /// demás, y dentro se ve con un «command not found».
    fn receta(self) -> String {
        let paquetes = match self {
            Distro::Ubuntu | Distro::Debian => {
                "ENV DEBIAN_FRONTEND=noninteractive\n\
                 RUN apt-get update \\\n \
                 && apt-get install -y --no-install-recommends bash ca-certificates curl git less nano procps python3 nodejs npm ripgrep \\\n \
                 && rm -rf /var/lib/apt/lists/*\n"
            }
            Distro::Fedora => {
                "RUN dnf install -y --setopt=install_weak_deps=False bash ca-certificates curl git less nano procps-ng python3 nodejs npm ripgrep which \\\n \
                 && dnf clean all\n"
            }
        };
        let mut r = format!("FROM {}\nENV LANG=C.UTF-8\n{paquetes}", self.base());
        for (paquete, cli) in CLIS_DE_LA_IMAGEN {
            r.push_str(&format!(
                "RUN npm install -g {paquete} && npm cache clean --force || echo \"[caja] {cli} no se pudo instalar en esta imagen\"\n"
            ));
        }
        r
    }
}

/// Los CLI que lleva la imagen de las cajas con agente, por su paquete de npm.
const CLIS_DE_LA_IMAGEN: &[(&str, &str)] = &[
    ("@anthropic-ai/claude-code", "claude"),
    ("@openai/codex", "codex"),
    ("@google/gemini-cli", "gemini"),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Caja {
    Docker(Distro),
}

/// Lo que se acepta en `ADEORQ_CAJA` y en el `caja` de `open_pane`. Lo demás es
/// un error con la lista: nunca «sin caja» en silencio.
pub fn leer(valor: &str) -> Result<Caja, String> {
    match valor.trim().to_ascii_lowercase().as_str() {
        "docker:ubuntu" | "ubuntu" => Ok(Caja::Docker(Distro::Ubuntu)),
        "docker:fedora" | "fedora" => Ok(Caja::Docker(Distro::Fedora)),
        "docker:debian" | "debian" => Ok(Caja::Docker(Distro::Debian)),
        otro => Err(format!(
            "No conozco la caja «{otro}». Las que hay: docker:ubuntu, docker:fedora y docker:debian."
        )),
    }
}

// ─── EL PROGRAMA DE DENTRO ──────────────────────────────────────────────────
//
// El front arma el comando de una terminal para el sistema donde corre Adeorq
// (`lib/comandos.ts`, `lib/arranque.ts`): en Windows, `cmd.exe /k "chcp 65001
// >nul && <línea>"`, o PowerShell cuando lleva un encargo. Dentro de la caja hay
// un Linux, así que esa misma línea se saca y se le da a bash. Lo que no se sabe
// traducir NO se abre: mejor un error que un programa a medias.

/// Lo que corre dentro de la caja: la línea para bash (vacía = una shell) y el
/// encargo, que va aparte.
#[derive(Debug, PartialEq, Eq)]
pub struct Dentro {
    pub linea: String,
    pub encargo: Option<String>,
}

pub fn programa_de_dentro(command: Option<&[String]>) -> Result<Dentro, String> {
    let Some(argv) = command.filter(|a| !a.is_empty()) else {
        return Ok(Dentro { linea: String::new(), encargo: None });
    };
    let exe = Path::new(&argv[0])
        .file_name()
        .map(|n| n.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let (linea, encargo) = match exe.as_str() {
        "cmd.exe" | "cmd" if argv.len() == 3 && matches!(argv[1].to_ascii_lowercase().as_str(), "/k" | "/c") => {
            let resto = argv[2].trim();
            let linea = resto.strip_prefix("chcp 65001 >nul && ").unwrap_or(resto);
            (linea.trim().to_string(), None)
        }
        "powershell.exe" | "powershell" | "pwsh.exe" | "pwsh" => {
            let i = argv.iter().position(|a| a.eq_ignore_ascii_case("-Command")).ok_or_else(no_se_traduce)?;
            let guion = argv.get(i + 1).ok_or_else(no_se_traduce)?;
            linea_de_powershell(guion)?
        }
        "bash" | "zsh" | "sh" if argv.len() == 3 && argv[1] == "-lc" => {
            // Fuera de Windows el front ya habla bash: se quita su `exec <shell> -i`.
            let guion = argv[2].trim();
            let linea = guion
                .rsplit_once("; exec ")
                .filter(|(_, cola)| cola.ends_with(" -i"))
                .map(|(l, _)| l)
                .unwrap_or(guion);
            (linea.trim().to_string(), None)
        }
        _ => return Err(no_se_traduce()),
    };
    // Un programa de Windows por su ruta (`& 'C:\…\agy.exe'`) no está en un Linux.
    if linea.contains(":\\") || linea.starts_with('&') || linea.to_ascii_lowercase().contains(".exe") {
        return Err("Ese programa es de Windows y no corre en una caja Linux. Ábrelo sin caja, o abre en la caja una terminal o Claude Code, Codex o Gemini.".into());
    }
    Ok(Dentro { linea, encargo })
}

fn no_se_traduce() -> String {
    "No sé abrir ese programa dentro de una caja. En una caja se abre una terminal o Claude Code, Codex o Gemini.".into()
}

/// Saca la línea y el encargo del PowerShell de `lineaConEncargo` (`lib/arranque.ts`).
fn linea_de_powershell(guion: &str) -> Result<(String, Option<String>), String> {
    const ANTES: &str = "$env:ADEORQ_ENCARGO = '";
    const COLA: &str = " --% \"%ADEORQ_ENCARGO%\"";
    let Some(cuerpo) = guion.trim().strip_prefix(ANTES) else {
        // Sin encargo: una línea de PowerShell suelta no se traduce.
        return Err(no_se_traduce());
    };
    let (citado, resto) = cadena_de_powershell(cuerpo).ok_or_else(no_se_traduce)?;
    let encargo = deshacer_msvc(&citado);
    let resto = resto.trim_start().strip_prefix(';').unwrap_or(resto).trim();
    let resto = resto.strip_suffix(COLA).ok_or_else(no_se_traduce)?;
    // Con un programa por su nombre, `programaDeVerdad` lo deja en `$adeorqExe`
    // y la línea acaba en `& $adeorqExe @adeorqPre<banderas>`.
    const LLAMADA: &str = "& $adeorqExe @adeorqPre";
    let linea = match resto.rfind(LLAMADA) {
        Some(i) => {
            let banderas = &resto[i + LLAMADA.len()..];
            let programa = resto
                .strip_prefix("$adeorqExe = '")
                .and_then(|r| r.split_once('\''))
                .map(|(p, _)| p)
                .ok_or_else(no_se_traduce)?;
            format!("{programa}{banderas}")
        }
        None => resto.to_string(),
    };
    Ok((linea.trim().to_string(), Some(encargo)))
}

/// Una cadena de PowerShell entre comillas simples, ya abierta: devuelve su texto
/// y lo que va detrás. Las comillas tipográficas también cierran, y doblada
/// cualquiera de ellas es la comilla misma.
fn cadena_de_powershell(s: &str) -> Option<(String, &str)> {
    const COMILLAS: [char; 5] = ['\'', '‘', '’', '‚', '‛'];
    let mut texto = String::new();
    let mut it = s.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if COMILLAS.contains(&c) {
            match it.peek() {
                Some(&(_, d)) if COMILLAS.contains(&d) => {
                    texto.push(c);
                    it.next();
                }
                _ => return Some((texto, &s[i + c.len_utf8()..])),
            }
        } else {
            texto.push(c);
        }
    }
    None
}

/// Deshace el escapado de MSVC con el que `lineaConEncargo` mete el encargo
/// entre comillas dobles: `2n+1` barras y comilla son `n` barras y una comilla;
/// `2n` barras al final son `n`; el resto de barras van tal cual.
fn deshacer_msvc(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' {
            let mut n = 0;
            while i + n < chars.len() && chars[i + n] == '\\' {
                n += 1;
            }
            let siguiente = chars.get(i + n).copied();
            match siguiente {
                Some('"') => {
                    out.extend(std::iter::repeat_n('\\', n / 2));
                    out.push('"');
                    i += n + 1;
                }
                None => {
                    out.extend(std::iter::repeat_n('\\', n / 2));
                    i += n;
                }
                Some(_) => {
                    out.extend(std::iter::repeat_n('\\', n));
                    i += n;
                }
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Entre comillas simples para bash.
fn citar_bash(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// El nombre de la carpeta dentro de la caja: `/work/<esto>`.
fn nombre_de_carpeta(cwd: &str) -> String {
    let n: String = Path::new(cwd.trim_end_matches(['\\', '/']))
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '-' })
        .collect();
    let n = n.trim_matches(['-', '.']).to_string();
    if n.is_empty() { "proyecto".into() } else { n }
}

/// Lo que bash ejecuta dentro: el aviso de dónde está, el programa y, cuando
/// acaba, una shell, para que la terminal no se cierre sola (lo mismo que hace
/// el `/k` de `cmd`).
fn guion_de_dentro(distro: Distro, cwd: &str, carpeta: &str, dentro: &Dentro) -> String {
    let aviso = format!(
        "Caja {}: un Linux nuevo solo para esta terminal. Ve solo {cwd} (aquí, /work/{carpeta}) y se tira al cerrarla.",
        distro.nombre()
    );
    let mut g = format!("printf '\\033[2m%s\\033[0m\\n' {}; ", citar_bash(&aviso));
    if !dentro.linea.is_empty() {
        g.push_str(&dentro.linea);
        if dentro.encargo.is_some() {
            g.push_str(&format!(" \"${ENCARGO}\""));
        }
        g.push_str("; ");
    }
    g.push_str("exec bash -l");
    g
}

/// Una caja necesita la imagen con agentes cuando lo de dentro no es una shell.
fn con_agente(dentro: &Dentro) -> bool {
    !dentro.linea.is_empty()
}

/// La etiqueta de la imagen de las cajas con agente: cambia con su receta.
fn etiqueta_de_imagen(distro: Distro) -> String {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(distro.receta().as_bytes());
    let corto: String = h.iter().take(5).map(|b| format!("{b:02x}")).collect();
    format!("adeorq-caja-{}:{corto}", distro.id())
}

pub struct Plan {
    pub imagen: String,
    pub con_agente: bool,
    pub nombre: String,
    pub argumentos: Vec<String>,
    pub encargo: Option<String>,
}

/// Los argumentos de `docker run` para una terminal. Puro: lo prueba
/// `pruebas::los_argumentos_de_docker` sin Docker.
pub fn plan(caja: Caja, id: u32, cwd: &str, command: Option<&[String]>, canal: &str, casa: &Path, sufijo: &str, env: &HashMap<String, String>) -> Result<Plan, String> {
    let Caja::Docker(distro) = caja;
    let dentro = programa_de_dentro(command)?;
    let carpeta = nombre_de_carpeta(cwd);
    let agente = con_agente(&dentro);
    let imagen = if agente { etiqueta_de_imagen(distro) } else { distro.base().to_string() };
    let nombre = format!("adeorq-caja-{canal}-{id}-{sufijo}");
    let mut a: Vec<String> = vec![
        "run".into(),
        "--rm".into(),
        "-it".into(),
        "--init".into(),
        "--name".into(),
        nombre.clone(),
        "--hostname".into(),
        format!("caja-{}", distro.id()),
        "--label".into(),
        format!("{ETIQUETA}=1"),
        "--label".into(),
        format!("{ETIQUETA_CANAL}={canal}"),
        "--label".into(),
        format!("{ETIQUETA_PANEL}={id}"),
        "--security-opt".into(),
        "no-new-privileges".into(),
        "--pids-limit".into(),
        PROCESOS.into(),
        "--memory".into(),
        MEMORIA.into(),
        "-v".into(),
        format!("{cwd}:/work/{carpeta}"),
    ];
    if agente {
        a.push("-v".into());
        a.push(format!("{}:/root", casa.display()));
    }
    a.extend(["-w".into(), format!("/work/{carpeta}")]);
    for v in ["TERM=xterm-256color", "COLORTERM=truecolor", "LANG=C.UTF-8"] {
        a.extend(["-e".into(), v.to_string()]);
    }
    // Por su NOMBRE: el valor lo coge Docker de su propio entorno, así que ni el
    // encargo ni una clave aparecen en la línea de órdenes (que cualquiera ve).
    if dentro.encargo.is_some() {
        a.extend(["-e".into(), ENCARGO.into()]);
    }
    let mut claves: Vec<&String> = env.keys().filter(|k| se_pasa_a_la_caja(k)).collect();
    claves.sort();
    for k in claves {
        a.extend(["-e".into(), k.clone()]);
    }
    a.push(imagen.clone());
    a.extend(["bash".into(), "-lc".into(), guion_de_dentro(distro, cwd, &carpeta, &dentro)]);
    Ok(Plan { imagen, con_agente: agente, nombre, argumentos: a, encargo: dentro.encargo })
}

/// Las variables del panel que entran en la caja: solo las de una clave de API
/// que el panel ya llevaba (la de «abrir con clave» de Cuentas, o OpenRouter).
/// Las de la cuenta (`CLAUDE_CONFIG_DIR`…) son rutas del PC y allí no valen.
fn se_pasa_a_la_caja(nombre: &str) -> bool {
    !nombre.starts_with("ADEORQ_") && ["_API_KEY", "_AUTH_TOKEN", "_OAUTH_TOKEN", "_BASE_URL"].iter().any(|s| nombre.ends_with(s))
}

// ─── DOCKER ─────────────────────────────────────────────────────────────────

/// El `docker` de este equipo: el del PATH o el de Docker Desktop, que en una
/// instalación por usuario vive en `%LOCALAPPDATA%\Programs\DockerDesktop`. En
/// Linux, también `podman`, que entiende los mismos argumentos.
pub fn docker() -> Option<PathBuf> {
    let nombres: &[&str] = if cfg!(windows) { &["docker.exe"] } else { &["docker", "podman"] };
    let path = std::env::var_os("PATH").unwrap_or_default();
    for nombre in nombres {
        for dir in std::env::split_paths(&path) {
            let p = dir.join(nombre);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    #[cfg(windows)]
    {
        let mut sitios = vec![PathBuf::from(r"C:\Program Files\Docker\Docker\resources\bin\docker.exe")];
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            sitios.push(PathBuf::from(local).join(r"Programs\DockerDesktop\resources\bin\docker.exe"));
        }
        if let Some(casa) = crate::dir_casa() {
            sitios.push(casa.join(r"AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe"));
        }
        return sitios.into_iter().find(|p| p.is_file());
    }
    #[allow(unreachable_code)]
    None
}

/// Un `docker …` con tope de tiempo y sin ventana. Devuelve su salida si acabó
/// bien.
fn docker_con_tope(exe: &Path, args: &[&str], tope: Duration) -> Result<String, String> {
    let mut hijo = Command::new(exe)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .sin_ventana()
        .spawn()
        .map_err(|e| format!("no pude lanzar docker: {e}"))?;
    let hasta = Instant::now() + tope;
    loop {
        match hijo.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < hasta => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = hijo.kill();
                let _ = hijo.wait();
                return Err(format!("docker {} no contestó en {} s", args.first().unwrap_or(&""), tope.as_secs()));
            }
        }
    }
    let salida = hijo.wait_with_output().map_err(|e| e.to_string())?;
    if salida.status.success() {
        Ok(String::from_utf8_lossy(&salida.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&salida.stderr).trim().to_string())
    }
}

fn motor_vivo(exe: &Path) -> bool {
    docker_con_tope(exe, &["info", "--format", "{{.ServerVersion}}"], Duration::from_secs(30)).is_ok()
}

/// Que Docker conteste. Si es Docker Desktop y está parado, se enciende: pedir
/// una caja es pedir Docker. Si no se puede, el error dice qué hacer.
fn asegurar_motor(exe: &Path, avisar: &dyn Fn(&str)) -> Result<(), String> {
    if motor_vivo(exe) {
        return Ok(());
    }
    let es_desktop = docker_con_tope(exe, &["desktop", "version"], Duration::from_secs(10)).is_ok();
    if !es_desktop {
        return Err(if cfg!(windows) {
            "Docker no está en marcha. Abre Docker Desktop y vuelve a abrir esta terminal.".into()
        } else {
            "Docker no está en marcha. Arráncalo (`sudo systemctl start docker`) y vuelve a abrir esta terminal.".into()
        });
    }
    avisar("Encendiendo Docker Desktop. La primera vez tarda uno o dos minutos…");
    let tope = ESPERA_DOCKER.as_secs().to_string();
    docker_con_tope(exe, &["desktop", "start", "--timeout", &tope], ESPERA_DOCKER + Duration::from_secs(10))
        .map_err(|e| format!("Docker Desktop no arrancó: {e}"))?;
    let hasta = Instant::now() + Duration::from_secs(60);
    while Instant::now() < hasta {
        if motor_vivo(exe) {
            avisar("Docker Desktop ya está en marcha.");
            return Ok(());
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    Err("Docker Desktop dice que arrancó, pero no contesta. Mira su ventana y vuelve a abrir esta terminal.".into())
}

/// La imagen de las cajas con agente: se construye la primera vez (unos
/// minutos), enseñando en la terminal lo que va haciendo.
fn asegurar_imagen(exe: &Path, distro: Distro, etiqueta: &str, dir: &Path, avisar: &dyn Fn(&str)) -> Result<(), String> {
    if docker_con_tope(exe, &["image", "inspect", "--format", "{{.Id}}", etiqueta], Duration::from_secs(15)).is_ok() {
        return Ok(());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    std::fs::write(dir.join("Dockerfile"), distro.receta()).map_err(|e| e.to_string())?;
    avisar(&format!(
        "Preparando la imagen de las cajas de {} con Claude Code, Codex y Gemini. Solo la primera vez: unos minutos.",
        distro.nombre()
    ));
    let mut hijo = Command::new(exe)
        .args(["build", "--progress=plain", "-t", etiqueta])
        .arg(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .sin_ventana()
        .spawn()
        .map_err(|e| format!("no pude lanzar docker build: {e}"))?;
    // BuildKit cuenta su avance por stderr; stdout se vacía aparte para que
    // ninguna de las dos tuberías se llene y lo pare.
    let mut fuera = hijo.stdout.take();
    let vaciar = std::thread::spawn(move || {
        if let Some(o) = fuera.as_mut() {
            let _ = std::io::copy(o, &mut std::io::sink());
        }
    });
    let mut ultimas: Vec<String> = Vec::new();
    if let Some(err) = hijo.stderr.take() {
        for linea in BufReader::new(err).lines().map_while(Result::ok) {
            avisar(&linea);
            ultimas.push(linea);
            if ultimas.len() > 12 {
                ultimas.remove(0);
            }
        }
    }
    let _ = vaciar.join();
    let fin = hijo.wait().map_err(|e| e.to_string())?;
    if fin.success() {
        Ok(())
    } else {
        Err(format!("no se pudo preparar la imagen de la caja:\r\n{}", ultimas.join("\r\n")))
    }
}

/// Los contenedores de las cajas de este Adeorq (su canal), con su terminal.
fn de_este_canal(exe: &Path, canal: &str) -> Vec<(String, Option<u32>)> {
    let filtro_canal = format!("label={ETIQUETA_CANAL}={canal}");
    let formato = format!("{{{{.ID}}}} {{{{.Label \"{ETIQUETA_PANEL}\"}}}}");
    let filtro = format!("label={ETIQUETA}=1");
    let args = ["ps", "-a", "--filter", filtro.as_str(), "--filter", filtro_canal.as_str(), "--format", formato.as_str()];
    let Ok(salida) = docker_con_tope(exe, &args, Duration::from_secs(10)) else {
        return Vec::new();
    };
    salida
        .lines()
        .filter_map(|l| {
            let mut p = l.split_whitespace();
            let id = p.next()?.to_string();
            Some((id, p.next().and_then(|n| n.parse().ok())))
        })
        .collect()
}

fn tirar(exe: &Path, ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    let mut args: Vec<&str> = vec!["rm", "-f"];
    args.extend(ids.iter().map(String::as_str));
    if let Err(e) = docker_con_tope(exe, &args, Duration::from_secs(20)) {
        crate::anotar(&format!("caja: no pude tirar {}: {e}", ids.join(", ")));
    }
}

// ─── LAS CAJAS VIVAS ────────────────────────────────────────────────────────

/// Las terminales de este arranque que nacieron en una caja, con su contenedor.
static VIVAS: Mutex<Option<HashMap<u32, String>>> = Mutex::new(None);

pub fn es_caja(id: u32) -> bool {
    VIVAS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|m| m.contains_key(&id))
}

fn apuntar(id: u32, nombre: &str) {
    VIVAS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(id, nombre.to_string());
}

fn olvidar(id: u32) -> Option<String> {
    VIVAS.lock().unwrap_or_else(|e| e.into_inner()).as_mut()?.remove(&id)
}

/// La carpeta de las cajas, dentro de la de datos de Adeorq.
fn carpeta() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("cajas"))
}

fn sufijo() -> String {
    let mut b = [0u8; 3];
    let _ = getrandom::fill(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Prepara la caja de una terminal que va a nacer y devuelve su `Alta` con el
/// `docker run` dentro. Tarda: puede encender Docker Desktop y construir una
/// imagen. Lo que va haciendo se cuenta con `avisar`, que lo pinta en el panel.
/// `viva` dice si una terminal sigue abierta, para tirar solo las cajas huérfanas.
pub fn preparar(alta: crate::pty::Alta, avisar: &dyn Fn(&str), viva: &dyn Fn(u32) -> bool) -> Result<crate::pty::Alta, String> {
    preparar_con(alta, &crate::terminales::canal(), &carpeta()?, avisar, viva)
}

/// `preparar` con su canal y su carpeta, para que una prueba no toque los de nadie.
fn preparar_con(alta: crate::pty::Alta, canal: &str, dir: &Path, avisar: &dyn Fn(&str), viva: &dyn Fn(u32) -> bool) -> Result<crate::pty::Alta, String> {
    let mut env = alta.env.clone().unwrap_or_default();
    let pedida = env.remove(VARIABLE).unwrap_or_default();
    let caja = leer(&pedida)?;
    // Apuntada desde ya: prepararla puede tardar minutos, y `open_pane` mira si
    // la terminal va a una caja para no dejar nunca a un agente en el PC.
    apuntar(alta.id, "");
    let id = alta.id;
    preparar_en(caja, alta, env, canal, dir, avisar, viva).inspect_err(|_| {
        olvidar(id);
    })
}

fn preparar_en(caja: Caja, alta: crate::pty::Alta, mut env: HashMap<String, String>, canal: &str, dir: &Path, avisar: &dyn Fn(&str), viva: &dyn Fn(u32) -> bool) -> Result<crate::pty::Alta, String> {
    let Caja::Docker(distro) = caja;
    let exe = docker().ok_or("No encuentro Docker en este equipo. Instala Docker Desktop (o Docker en Linux) para abrir terminales en una caja.")?;
    let casa = dir.join("casa");
    let plan = plan(caja, alta.id, &alta.cwd, alta.command.as_deref(), canal, &casa, &sufijo(), &env)?;
    if plan.con_agente {
        std::fs::create_dir_all(&casa).map_err(|e| format!("{}: {e}", casa.display()))?;
    }

    asegurar_motor(&exe, avisar)?;
    // Las de este canal cuya terminal ya no existe: quedaron de una caída.
    let huerfanas: Vec<String> = de_este_canal(&exe, canal)
        .into_iter()
        .filter(|(_, panel)| panel.is_none_or(|p| p == alta.id || !viva(p)))
        .map(|(id, _)| id)
        .collect();
    if !huerfanas.is_empty() {
        crate::anotar(&format!("caja: tiro {} contenedores huérfanos del canal {canal}", huerfanas.len()));
        tirar(&exe, &huerfanas);
    }
    if plan.con_agente {
        asegurar_imagen(&exe, distro, &plan.imagen, &dir.join(format!("imagen-{}", distro.id())), avisar)?;
    }

    if let Some(e) = &plan.encargo {
        env.insert(ENCARGO.into(), e.clone());
    }
    let mut command = vec![exe.to_string_lossy().into_owned()];
    command.extend(plan.argumentos);
    apuntar(alta.id, &plan.nombre);
    crate::anotar(&format!("caja: la terminal {} nace en {} ({})", alta.id, plan.nombre, plan.imagen));
    Ok(crate::pty::Alta { command: Some(command), env: Some(env), ..alta })
}

/// Una terminal que se cierra desde Adeorq: su contenedor se tira. El cliente de
/// Docker muere con la terminal, pero el contenedor no tiene por qué (medido en
/// `docs/contexto/cajas.md`), así que se tira por su etiqueta.
pub fn al_cerrar(id: u32) {
    if olvidar(id).is_none() {
        return;
    }
    std::thread::spawn(move || tirar_la_de(id, &crate::terminales::canal()));
}

fn tirar_la_de(id: u32, canal: &str) {
    let Some(exe) = docker() else { return };
    let ids: Vec<String> = de_este_canal(&exe, canal).into_iter().filter(|(_, p)| *p == Some(id)).map(|(c, _)| c).collect();
    tirar(&exe, &ids);
}

/// La terminal acabó sola (el programa salió): `--rm` ya la tira, y esto la
/// tira también si el cliente de Docker murió antes que ella.
pub fn al_terminar(id: u32) {
    al_cerrar(id);
}

/// Adeorq se cierra de verdad: todas las cajas de este canal. No se llama al
/// actualizar, cuando las terminales siguen en el proceso de terminales.
pub fn tirar_todas() {
    let hay = VIVAS.lock().unwrap_or_else(|e| e.into_inner()).take().is_some_and(|m| !m.is_empty());
    if !hay {
        return;
    }
    let Some(exe) = docker() else { return };
    let ids: Vec<String> = de_este_canal(&exe, &crate::terminales::canal()).into_iter().map(|(c, _)| c).collect();
    tirar(&exe, &ids);
}

/// Si en este equipo se puede abrir una caja ahora, para el selector de terminal
/// nueva: hay `docker` (no hace falta que esté en marcha: se enciende al pedirla).
#[tauri::command(async)]
pub fn cajas_disponibles() -> bool {
    docker().is_some()
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn v(xs: &[&str]) -> Vec<String> {
        xs.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn se_leen_las_cajas_y_lo_demas_es_un_error() {
        assert_eq!(leer("docker:ubuntu"), Ok(Caja::Docker(Distro::Ubuntu)));
        assert_eq!(leer(" Docker:Fedora "), Ok(Caja::Docker(Distro::Fedora)));
        assert_eq!(leer("debian"), Ok(Caja::Docker(Distro::Debian)));
        assert!(leer("").is_err());
        assert!(leer("docker:arch").unwrap_err().contains("docker:ubuntu"));
    }

    #[test]
    fn una_consola_pelada_es_una_shell() {
        assert_eq!(programa_de_dentro(None).unwrap(), Dentro { linea: String::new(), encargo: None });
    }

    #[test]
    fn la_linea_de_cmd_se_saca_tal_cual() {
        let c = v(&["cmd.exe", "/k", "chcp 65001 >nul && claude --permission-mode auto --session-id 1234abcd-0000 --model opus"]);
        let d = programa_de_dentro(Some(&c)).unwrap();
        assert_eq!(d.linea, "claude --permission-mode auto --session-id 1234abcd-0000 --model opus");
        assert_eq!(d.encargo, None);
    }

    /// Lo que escribe `lineaConEncargo` (`lib/arranque.ts`) en PowerShell, para
    /// un programa por su nombre: el encargo vuelve entero, con sus comillas.
    #[test]
    fn el_encargo_de_powershell_vuelve_entero() {
        let encargo = r#"haz "esto" & lo otro, it’s 100% \ y C:\ruta\"#;
        // El escapado de `lineaConEncargo`: MSVC y luego doblar las comillas simples.
        let msvc = {
            let mut s = String::new();
            let mut barras = 0;
            for c in encargo.chars() {
                if c == '\\' {
                    barras += 1;
                    continue;
                }
                if c == '"' {
                    s.extend(std::iter::repeat_n('\\', barras * 2));
                    s.push_str("\\\"");
                } else {
                    s.extend(std::iter::repeat_n('\\', barras));
                    s.push(c);
                }
                barras = 0;
            }
            s.extend(std::iter::repeat_n('\\', barras * 2));
            s
        };
        let doblado: String = msvc.chars().flat_map(|c| if "'‘’‚‛".contains(c) { vec![c, c] } else { vec![c] }).collect();
        let guion = format!(
            "$env:ADEORQ_ENCARGO = '{doblado}'; $adeorqExe = 'claude'; $adeorqPre = @(); $adeorqCmd = Get-Command 'claude' -ErrorAction SilentlyContinue | Select-Object -First 1; if (...) {{ ... }}; & $adeorqExe @adeorqPre --permission-mode auto --session-id 9f --model opus --% \"%ADEORQ_ENCARGO%\""
        );
        let c = v(&["powershell.exe", "-NoLogo", "-NoExit", "-Command", &guion]);
        let d = programa_de_dentro(Some(&c)).unwrap();
        assert_eq!(d.linea, "claude --permission-mode auto --session-id 9f --model opus");
        assert_eq!(d.encargo.as_deref(), Some(encargo));
    }

    #[test]
    fn la_linea_de_bash_pierde_su_exec() {
        let c = v(&["/bin/bash", "-lc", "codex --full-auto; exec /bin/bash -i"]);
        assert_eq!(programa_de_dentro(Some(&c)).unwrap().linea, "codex --full-auto");
    }

    #[test]
    fn un_programa_de_windows_no_entra() {
        let c = v(&["powershell.exe", "-NoLogo", "-NoExit", "-Command", "$env:ADEORQ_ENCARGO = 'hola'; & 'C:\\x\\agy.exe' --mode accept-edits --% \"%ADEORQ_ENCARGO%\""]);
        assert!(programa_de_dentro(Some(&c)).unwrap_err().contains("Windows"));
        assert!(programa_de_dentro(Some(&v(&["notepad.exe"]))).is_err());
    }

    #[test]
    fn los_argumentos_de_docker() {
        let mut env = HashMap::new();
        env.insert("CLAUDE_CONFIG_DIR".to_string(), "C:\\x".to_string());
        env.insert("ANTHROPIC_API_KEY".to_string(), "@secreto:api:claude".to_string());
        env.insert("ADEORQ_PANE_ID".to_string(), "3".to_string());
        let c = v(&["cmd.exe", "/k", "chcp 65001 >nul && claude --session-id ab"]);
        // Una ruta de verdad de cada sistema: en Linux la barra invertida no separa carpetas.
        let cwd = if cfg!(windows) { r"C:\proyectos\Mi Web" } else { "/home/yo/proyectos/Mi Web" };
        let casa = if cfg!(windows) { r"C:\datos\cajas\casa" } else { "/home/yo/datos/cajas/casa" };
        let p = plan(Caja::Docker(Distro::Fedora), 3, cwd, Some(&c), "lab-1", Path::new(casa), "a1b2c3", &env).unwrap();
        let a = p.argumentos.join(" | ");
        assert!(p.con_agente);
        assert!(p.imagen.starts_with("adeorq-caja-fedora:"), "{}", p.imagen);
        assert_eq!(p.nombre, "adeorq-caja-lab-1-3-a1b2c3");
        let montaje = format!("-v | {cwd}:/work/Mi-Web");
        let montaje_casa = format!("-v | {casa}:/root");
        for trozo in ["run | --rm | -it | --init", "--label | adeorq.caja=1", "--label | adeorq.canal=lab-1", "--label | adeorq.panel=3", montaje.as_str(), montaje_casa.as_str(), "-w | /work/Mi-Web", "-e | ANTHROPIC_API_KEY", "no-new-privileges"] {
            assert!(a.contains(trozo), "falta «{trozo}» en {a}");
        }
        // La cuenta es una ruta del PC, y la contraseña del panel no entra nunca.
        assert!(!a.contains("CLAUDE_CONFIG_DIR") && !a.contains("ADEORQ_PANE"), "{a}");
        let guion = p.argumentos.last().unwrap();
        assert!(guion.contains("claude --session-id ab; exec bash -l"), "{guion}");
        // Sin encargo, nada de ADEORQ_ENCARGO.
        assert!(!a.contains("ADEORQ_ENCARGO"));
    }

    #[test]
    fn una_shell_va_en_la_imagen_limpia_y_sin_casa() {
        let p = plan(Caja::Docker(Distro::Ubuntu), 1, r"C:\proyectos\X", None, "estable", Path::new("C:\\casa"), "00", &HashMap::new()).unwrap();
        assert!(!p.con_agente);
        assert_eq!(p.imagen, "ubuntu:latest");
        assert!(!p.argumentos.iter().any(|a| a.ends_with(":/root")));
        assert!(p.argumentos.last().unwrap().ends_with("exec bash -l"));
    }

    #[test]
    fn el_encargo_va_por_el_entorno_y_no_por_la_linea() {
        let guion = "$env:ADEORQ_ENCARGO = 'borra todo; rm -rf /'; claude --x --% \"%ADEORQ_ENCARGO%\"";
        let c = v(&["powershell.exe", "-NoLogo", "-NoExit", "-Command", guion]);
        let p = plan(Caja::Docker(Distro::Debian), 2, "/home/m/p", Some(&c), "estable", Path::new("/c"), "00", &HashMap::new()).unwrap();
        assert_eq!(p.encargo.as_deref(), Some("borra todo; rm -rf /"));
        assert!(!p.argumentos.iter().any(|a| a.contains("rm -rf")), "{:?}", p.argumentos);
        assert!(p.argumentos.last().unwrap().contains("claude --x \"$ADEORQ_ENCARGO\"; exec bash -l"));
    }

    /// LA CAJA DE VERDAD: una terminal con un ConPTY real que nace en un
    /// contenedor nuevo, ve solo su carpeta, escribe en ella, y desaparece al
    /// cerrarla. Mide también si el contenedor sobrevive a que muera el cliente
    /// de Docker (por eso existe `al_cerrar`). Necesita Docker en marcha; canal y
    /// carpeta propios, así que no toca las cajas de nadie:
    ///
    /// `cargo test --lib caja::pruebas::la_caja_de_verdad -- --ignored --nocapture`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn la_caja_de_verdad() {
        use crate::pty::{abrir, escribir, matar, Alta, Mapa, Salida};
        use std::sync::Arc;
        #[derive(Default)]
        struct Apuntes(Mutex<String>);
        struct Libreta(Arc<Apuntes>);
        impl Salida for Libreta {
            fn datos(&self, _: u32, t: String) {
                self.0 .0.lock().unwrap().push_str(&t);
            }
            fn fin(&self, _: u32, _: Option<u32>) {}
            fn mudo(&self, _: u32) {}
        }
        let hasta = |f: &dyn Fn() -> bool, s: u64| {
            let fin = Instant::now() + Duration::from_secs(s);
            while Instant::now() < fin && !f() {
                std::thread::sleep(Duration::from_millis(100));
            }
            f()
        };
        let pid = std::process::id();
        let canal = format!("lab-caja-{pid}");
        let base = std::env::temp_dir().join(format!("adeorq-caja-prueba-{pid}"));
        let proyecto = base.join("MiProyecto");
        std::fs::create_dir_all(&proyecto).unwrap();
        std::fs::write(proyecto.join("marca-del-proyecto.txt"), "hola").unwrap();
        let exe = docker().expect("sin docker");
        assert!(motor_vivo(&exe), "Docker no está en marcha: `docker desktop start`");
        let contar = || de_este_canal(&exe, &canal).len();

        let mut env = HashMap::new();
        env.insert(VARIABLE.to_string(), "docker:ubuntu".to_string());
        let alta = Alta { id: 41, cwd: proyecto.to_string_lossy().into_owned(), cols: 120, rows: 30, command: None, env: Some(env), clave: None };
        let avisos = Mutex::new(Vec::<String>::new());
        let alta = preparar_con(alta, &canal, &base.join("datos"), &|t| avisos.lock().unwrap().push(t.to_string()), &|_| false).expect("no preparó la caja");
        assert!(es_caja(41));
        assert!(!alta.env.as_ref().unwrap().contains_key(VARIABLE), "la marca no se quitó");
        println!("orden: {}", alta.command.as_ref().unwrap().join(" "));

        let mapa: Mapa = Default::default();
        let apuntes = Arc::new(Apuntes::default());
        abrir(&mapa, alta, Arc::new(Libreta(apuntes.clone()))).expect("no abrió");
        let dicho = || apuntes.0.lock().unwrap().clone();
        assert!(hasta(&|| dicho().contains("\x1b[6n"), 20), "el ConPTY no preguntó por el cursor");
        escribir(&mapa, 41, b"\x1b[1;1R".to_vec()).unwrap();
        // La primera vez baja la imagen: hasta dos minutos.
        assert!(hasta(&|| dicho().contains("Caja Ubuntu"), 180), "no salió el aviso de la caja:\n{}", dicho());
        assert!(hasta(&|| contar() == 1, 20), "no hay un contenedor del canal");
        escribir(&mapa, 41, b"echo DENTRO=$(hostname) WORK=$(ls /work) PROY=$(ls /work/MiProyecto | tr '\\n' ,) ROOT=$(ls -A /root | wc -l); echo escrito-en-la-caja > /work/MiProyecto/hecho-dentro.txt; echo LISTO-DE-MIRAR\r".to_vec()).unwrap();
        assert!(hasta(&|| dicho().matches("LISTO-DE-MIRAR").count() >= 2, 30), "no contestó:\n{}", dicho());
        let todo = dicho();
        let linea = todo.lines().find(|l| l.contains("DENTRO=caja")).unwrap_or_default().to_string();
        println!("dentro: {linea}");
        assert!(linea.contains("DENTRO=caja-ubuntu"), "{linea}");
        assert!(linea.contains("WORK=MiProyecto PROY=marca-del-proyecto.txt,"), "ve otra cosa que su carpeta: {linea}");
        assert!(linea.contains("ROOT=0") || linea.contains("ROOT=") , "{linea}");
        assert_eq!(std::fs::read_to_string(proyecto.join("hecho-dentro.txt")).unwrap().trim(), "escrito-en-la-caja");

        // Se mata el cliente, como la X de un panel: ¿sigue el contenedor?
        assert!(matar(&mapa, 41));
        std::thread::sleep(Duration::from_secs(4));
        let tras_matar = contar();
        println!("contenedores tras matar el cliente de Docker (4 s): {tras_matar}");
        tirar_la_de(41, &canal);
        olvidar(41);
        assert!(hasta(&|| contar() == 0, 30), "el contenedor no se tiró");
        println!("tras tirar: {}", contar());
        println!("avisos: {:?}", avisos.lock().unwrap());
        let _ = std::fs::remove_dir_all(&base);
    }

    /// La imagen de las cajas con agente, construida de verdad, y sus CLI
    /// arrancando dentro (`--version`, sin red de modelo ni cuota). Tarda minutos.
    /// `ADEORQ_CAJA_DISTRO=ubuntu|fedora|debian` (Debian si no se dice):
    /// `cargo test --lib caja::pruebas::la_imagen_con_agente -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn la_imagen_con_agente() {
        let distro = match std::env::var("ADEORQ_CAJA_DISTRO").as_deref() {
            Ok("ubuntu") => Distro::Ubuntu,
            Ok("fedora") => Distro::Fedora,
            _ => Distro::Debian,
        };
        let exe = docker().expect("sin docker");
        let dir = std::env::temp_dir().join(format!("adeorq-caja-imagen-{}", std::process::id()));
        let etiqueta = etiqueta_de_imagen(distro);
        let lineas = Mutex::new(0usize);
        asegurar_imagen(&exe, distro, &etiqueta, &dir, &|_| *lineas.lock().unwrap() += 1).expect("no se construyó");
        println!("{etiqueta}: {} líneas de avance", lineas.lock().unwrap());
        for cli in ["node", "claude", "codex", "gemini"] {
            let r = docker_con_tope(&exe, &["run", "--rm", &etiqueta, cli, "--version"], Duration::from_secs(60));
            println!("{cli} --version: {}", match &r { Ok(s) => s.trim().to_string(), Err(e) => format!("FALLA {e}") });
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn la_receta_cambia_la_etiqueta() {
        assert_ne!(etiqueta_de_imagen(Distro::Ubuntu), etiqueta_de_imagen(Distro::Debian));
        assert!(Distro::Fedora.receta().starts_with("FROM fedora:latest"));
        assert!(Distro::Ubuntu.receta().contains("@anthropic-ai/claude-code"));
    }
}
