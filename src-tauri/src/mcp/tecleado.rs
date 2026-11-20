//! Un Claude Code tecleado en una consola con `send_command`.
//!
//! Adeorq reconoce a Claude por el COMANDO con el que nació el panel
//! (`rastros::es_claude`), y el de una consola es PowerShell. Un agente que
//! necesitaba lo que `open_pane` no daba (el Fable que pidió la persona, o el
//! esfuerzo antes del 2026-11-17) abría una consola y le tecleaba `claude …`, y esa
//! terminal quedaba fuera de todo: no se compactaba sola, `compactarme` y
//! `compactar_terminal` decían que no corría Claude Code, `get_active_panes` le
//! inventaba el modelo, y Munir acabó escribiendo el /compact a mano (2026-11-17,
//! la terminal de Moods: «¿por qué no se compacta solo como las demás?»).
//!
//! Ahora la línea que lanza a Claude se apunta como el comando de ese panel, con
//! un `--session-id` que le pone Adeorq: sin él habría que adivinar su
//! conversación por la más reciente de la carpeta, que puede ser de otra terminal.
//! Solo en un panel que nació consola pelada y solo si su pantalla está esperando
//! una orden (`espera_una_orden`): un «Claude, revisa…» mandado a un Codex o a un
//! Claude que ya corre es un mensaje, y apuntarlo le cambiaba hasta el escalón de
//! permisos (lo cazó la revisión aparte del 2026-11-17).

/// Lo que se le puede pedir a `claude` que contesta y sale, o que no es una
/// conversación: con eso no hay nada que reconocer.
const DE_UNA_VEZ: &[&str] = &["-p", "--print", "-v", "--version", "-h", "--help"];

/// Sus subcomandos (`claude --help`): ninguno abre una conversación.
const SUBCOMANDOS: &[&str] = &[
    "agents", "auth", "config", "doctor", "install", "mcp", "migrate-installer", "plugin", "setup-token", "update", "upgrade",
];

/// Lo que dice qué conversación es o retoma una. Una línea así no se apunta: la
/// conversación no la acuñó Adeorq, puede ser de Munir o de otra terminal, y
/// apuntarla haría a este panel su dueño (sus delegadas, su papelera). Solo vale
/// la que estrena Adeorq con su propio `--session-id`.
const DICE_CUAL: &[&str] = &["--session-id", "--resume", "-r", "--continue", "-c", "--fork-session"];

/// Si `texto` abre una conversación NUEVA de Claude Code en una consola, la línea
/// que hay que teclear de verdad: la misma con `--session-id <id>` justo detrás
/// del programa (no al final, donde un `# comentario`, un `; exit` o un `| …` se lo
/// tragarían). `None` para todo lo demás: otra orden, un `claude -p` que contesta y
/// sale, `claude mcp list`, un `--resume`, varias líneas, o sin aleatoriedad para
/// el id.
pub fn linea_de_claude(texto: &str, id_nuevo: impl FnOnce() -> Option<String>) -> Option<String> {
    let linea = texto.trim();
    if linea.contains(['\n', '\r']) {
        return None;
    }
    // `& "C:\…\claude.exe" …`: el operador de llamada de PowerShell.
    let desde = linea.strip_prefix('&').map_or(0, |r| linea.len() - r.trim_start().len());
    let cola = &linea[desde..];
    let largo = match cola.chars().next()? {
        c @ ('"' | '\'') => cola[1..].find(c)? + 2,
        _ => cola.find(char::is_whitespace).unwrap_or(cola.len()),
    };
    let fin = desde + largo;
    let programa = linea[desde..fin].trim_matches(['"', '\'']).to_lowercase();
    let nombre = programa.rsplit(['\\', '/']).next().unwrap_or(&programa);
    let nombre = [".exe", ".cmd", ".ps1"].iter().fold(nombre, |n, ext| n.strip_suffix(ext).unwrap_or(n));
    if nombre != "claude" {
        return None;
    }
    let resto: Vec<&str> = linea[fin..].split_whitespace().collect();
    if resto.first().is_some_and(|p| SUBCOMANDOS.contains(&p.to_lowercase().as_str())) {
        return None;
    }
    let bandera = |p: &&str| p.split('=').next().unwrap_or(p).to_string();
    if resto.iter().map(bandera).any(|b| DE_UNA_VEZ.contains(&b.as_str()) || DICE_CUAL.contains(&b.as_str())) {
        return None;
    }
    let id = id_nuevo()?;
    Some(format!("{} --session-id {id}{}", &linea[..fin], &linea[fin..]))
}

/// Si la última línea con algo de la pantalla es una consola esperando una orden:
/// `PS C:\…>` (PowerShell), `C:\…>` (cmd), `…$` (bash) o `… %` (zsh). Con un
/// programa corriendo (un Claude Code ya abierto, que acaba en su pie), no: ahí
/// «claude …» es un mensaje para él, no un arranque.
pub fn espera_una_orden(pantalla: &[String]) -> bool {
    let llenas: Vec<&str> = pantalla.iter().rev().map(|l| l.trim()).filter(|l| !l.is_empty()).take(8).collect();
    let Some(l) = llenas.first().copied() else { return false };
    // `PS …>` o `C:\…>` no lo pinta nunca un Claude en marcha: vale aunque encima
    // quede el último cuadro de uno que ya salió.
    let unidad = l.as_bytes().get(1) == Some(&b':') && l.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    if (l.starts_with("PS ") || unidad) && l.ends_with('>') {
        return true;
    }
    // Lo que acaba en `$` o ` %`, sí («Contexto 45 %»): con la caja o el pie de
    // Claude Code a la vista, es él.
    let hay_claude = llenas.iter().any(|l| l.starts_with('❯') || ["for shortcuts", "shift+tab", "esc to interrupt", "auto mode"].iter().any(|m| l.contains(m)));
    !hay_claude && (l.ends_with('$') || l.ends_with(" %"))
}

/// Lo que se le dice a quien lo tecleó, detrás de «texto escrito». `ventana`: si
/// la ventana lo apuntó (una de una versión anterior no sabe).
pub fn parte(linea: &str, ventana: bool) -> String {
    let cual = crate::rastros::sesion_del_comando(&[linea.to_string()])
        .map(|s| format!(", con la conversación {s}"))
        .unwrap_or_default();
    let sola = if ventana {
        "se compacta sola como las demás, y compactarme la reconoce"
    } else {
        "compactarme la reconoce, pero esta ventana de Adeorq es de antes y no la compactará sola"
    };
    format!(
        " Adeorq cuenta ya esta consola como un Claude Code{cual} (le puse ese `--session-id` detrás del programa): {sola}. \
         Para un Claude con modelo y esfuerzo, mejor open_pane con `model` y `effort`: nace Claude desde el principio."
    )
}

/// Lo que se le dice cuando parecía un arranque de Claude y no se apuntó.
pub const SIN_APUNTAR: &str = " No la cuento como Claude Code: la consola no estaba esperando una orden (¿ya corría algo?), \
     así que no se compactará sola. Si es un Claude nuevo, ábrelo con open_pane(cli: \"claude\").";

// ─── LO APUNTADO SOBREVIVE A REINICIAR LA VENTANA ──────────────────────────
//
// Con las terminales en su proceso aparte (`terminales.rs`), reiniciar Adeorq (al
// actualizar, casi a diario) deja viva la consola y su Claude, pero lo apuntado en
// `Puente.tecleados` y en la ventana empezaba vacío: la terminal volvía a ser una
// consola, `compactarme` la rechazaba y no se compactaba sola (la S45 de winshotx,
// 2026-11-19, en el panel 57 tras instalar la 0.9.262). Por eso se guarda también en
// disco, por la vida de los números (`conserje::arranque`, la del proceso de
// terminales) y el número del panel: los dos sobreviven al reinicio, y juntos no se
// repiten nunca (`pty_primer_libre`). Nada secreto: ni la contraseña del panel ni
// nada que no se pudiera leer ya en su línea de comandos.

/// Lo de la vida de ahora no se poda nunca: su consola puede llevar días abierta. Lo
/// de otra vida de su canal, en el acto si la app está enganchada a su proceso de
/// terminales (en un canal vive uno solo: el de las otras murió), y si no lo está,
/// al mes, por si queda vivo uno al que no se pudo enganchar. Cada canal tiene su
/// archivo (`ruta_en`): la ventana de desarrollo comparte esta carpeta con la
/// instalada y no toca lo suyo (la revisión aparte del 2026-11-19).
const OLVIDO_MS: u64 = 30 * 24 * 3600 * 1000;

/// La vida de quien escribe: la de los números (`conserje::arranque`) y si la app
/// está enganchada al proceso de terminales de su canal.
#[derive(Clone, Copy, Debug)]
pub struct Vida {
    pub arranque: u64,
    pub enganchada: bool,
}

/// El archivo de un canal (`terminales::canal`, «estable» la instalada y
/// «desarrollo» la de desarrollo).
pub fn ruta_en(dir: &std::path::Path, canal: &str) -> std::path::PathBuf {
    dir.join(format!("tecleados-{canal}.json"))
}

/// Lo que se le tecleó a un panel, guardado.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct Apunte {
    /// La vida de los números en que se tecleó (`conserje::arranque`).
    pub arranque: u64,
    pub panel: u32,
    /// La línea con su `--session-id`, como la lee `la_ficha`.
    pub comando: Vec<String>,
    /// Cuándo, para olvidar lo de otras vidas.
    pub ms: u64,
}

pub type Libro = Vec<Apunte>;

/// Lo guardado, o nada si no hay o no se entiende: perderlo es volver a como
/// estaba antes (la consola vuelve a ser consola), no un error que pare nada.
pub fn leer(ruta: &std::path::Path) -> Libro {
    std::fs::read_to_string(ruta).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// Lo escriben `send_command` y el cierre del panel a la vez: un cambio entero de
/// cada vez. Entre la instalada y la de desarrollo no hace falta: cada canal tiene
/// su archivo (`ruta_en`).
static CANDADO: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Lee, cambia con `f`, olvida lo viejo de otras vidas y lo deja en disco.
///
/// Si el archivo está pero no se puede leer (cogido por otro programa, o con bytes
/// que no son UTF-8), no se toca: contarlo como vacío dejaba en él solo lo nuevo y
/// se perdían las demás consolas (la revisión aparte del 2026-11-19). Uno que se lee
/// pero no se entiende sí se rehace: de él no hay nada que salvar.
pub fn cambiar(ruta: &std::path::Path, vida: Vida, ahora_ms: u64, f: impl FnOnce(&mut Libro)) -> Result<(), String> {
    let _uno = CANDADO.lock().unwrap_or_else(|e| e.into_inner());
    let mut libro: Libro = serde_json::from_str(&crate::leer_para_reescribir(ruta)?).unwrap_or_default();
    f(&mut libro);
    libro.retain(|a| a.arranque == vida.arranque || (!vida.enganchada && ahora_ms.saturating_sub(a.ms) < OLVIDO_MS));
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    }
    let texto = serde_json::to_string_pretty(&libro).map_err(|e| e.to_string())?;
    // Uno por proceso: `CANDADO` solo pone en fila a los hilos de este.
    let tmp = ruta.with_extension(format!("json.{}.tmp", std::process::id()));
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("no pude guardar {}: {e}", ruta.display())
    })
}

/// Lo de este panel en esta vida, en vez de lo que hubiera.
pub fn apuntar(libro: &mut Libro, a: Apunte) {
    olvidar(libro, a.arranque, a.panel);
    libro.push(a);
}

pub fn olvidar(libro: &mut Libro, arranque: u64, panel: u32) {
    libro.retain(|a| (a.arranque, a.panel) != (arranque, panel));
}

/// Lo de esta vida de los paneles que siguen vivos: lo que hay que recuperar al
/// volver a engancharse al proceso de terminales.
pub fn los_de_ahora(libro: &Libro, arranque: u64, vivos: &[u32]) -> Vec<(u32, Vec<String>)> {
    libro
        .iter()
        .filter(|a| a.arranque == arranque && vivos.contains(&a.panel) && !a.comando.is_empty())
        .map(|a| (a.panel, a.comando.clone()))
        .collect()
}

/// `%LOCALAPPDATA%\Adeorq\tecleados-<canal>.json`.
fn ruta() -> Option<std::path::PathBuf> {
    crate::dir_datos().ok().map(|d| ruta_en(&d, &crate::terminales::canal()))
}

fn vida_de_ahora(app: &tauri::AppHandle) -> Vida {
    Vida { arranque: crate::conserje::arranque(), enganchada: crate::terminales::remoto(app).is_some() }
}

/// Lo apunta en este arranque (`Puente.tecleados`, lo que lee `la_ficha`) y en disco.
pub(super) fn guardar(app: &tauri::AppHandle, panel: u32, linea: &str) {
    use tauri::Manager;
    let comando = vec![linea.to_string()];
    app.state::<super::Puente>().tecleados.lock().unwrap().insert(panel, comando.clone());
    let Some(ruta) = ruta() else { return };
    let (vida, ms) = (vida_de_ahora(app), super::ahora_ms());
    if let Err(e) = cambiar(&ruta, vida, ms, |l| apuntar(l, Apunte { arranque: vida.arranque, panel, comando, ms })) {
        crate::anotar(&format!("tecleados: no pude guardar el del panel {panel}: {e}"));
    }
}

/// El panel se cerró desde Adeorq (la X, `close_pane`): se olvida aquí y en disco.
/// Solo va al disco si había algo, porque tras reengancharse lo guardado de cada
/// panel vivo ya está en memoria (`recuperar`). No se llama desde el fin de un
/// PTY: al cortarse la conexión con el proceso de terminales para actualizar,
/// la app da por terminadas todas (`terminales.rs`) y estarían vivas.
pub(crate) fn olvidar_panel(app: &tauri::AppHandle, panel: u32) {
    use tauri::Manager;
    let Some(puente) = app.try_state::<super::Puente>() else { return };
    if puente.tecleados.lock().unwrap().remove(&panel).is_none() {
        return;
    }
    let Some(ruta) = ruta() else { return };
    let vida = vida_de_ahora(app);
    if let Err(e) = cambiar(&ruta, vida, super::ahora_ms(), |l| olvidar(l, vida.arranque, panel)) {
        crate::anotar(&format!("tecleados: no pude olvidar el del panel {panel}: {e}"));
    }
}

/// Lo guardado, para volver a engancharse (`al_reengancharse`).
pub(super) fn guardado() -> Libro {
    ruta().map(|r| leer(&r)).unwrap_or_default()
}

/// La app acaba de engancharse a un proceso de terminales que ya corría: lo
/// tecleado en sus paneles vivos (`los_de_ahora`) vuelve a contar.
pub(super) fn recuperar(app: &tauri::AppHandle, de_ahora: Vec<(u32, Vec<String>)>) {
    use tauri::Manager;
    let puente = app.state::<super::Puente>();
    let mut mapa = puente.tecleados.lock().unwrap();
    for (panel, comando) in de_ahora {
        mapa.entry(panel).or_insert(comando);
    }
}

/// Lo tecleado en ese panel, para la ventana que se vuelve a enganchar a él
/// (`pty_vivas`, `recogerTecleados` en `lib/claudeTecleado.ts`).
pub(crate) fn de(app: &tauri::AppHandle, panel: u32) -> Option<Vec<String>> {
    use tauri::Manager;
    app.try_state::<super::Puente>()?.tecleados.lock().unwrap().get(&panel).cloned()
}

/// Un id de conversación nuevo (UUID v4), como el que pone `lanzar.ts` a cada
/// Claude que abre la ventana. `None` si el sistema no da aleatoriedad: un id a
/// ceros lo compartirían todas.
pub fn id_nuevo() -> Option<String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).ok()?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    Some(format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32]))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0006490e-5bba-4a1e-9a77-0c0ffee00001";
    fn con(texto: &str) -> Option<String> {
        linea_de_claude(texto, || Some(ID.to_string()))
    }

    #[test]
    fn la_linea_que_abre_claude_lleva_su_conversacion() {
        // La de Moods, tal cual se tecleó el 2026-11-17.
        let moods = con("claude --model opus --permission-mode auto --effort max").unwrap();
        assert_eq!(moods, format!("claude --session-id {ID} --model opus --permission-mode auto --effort max"));
        assert!(crate::rastros::es_claude(&[moods.clone()]));
        assert_eq!(crate::rastros::sesion_del_comando(&[moods]).as_deref(), Some(ID));
        assert_eq!(con("  claude  ").as_deref(), Some(format!("claude --session-id {ID}").as_str()));
        assert_eq!(con("claude.exe --model fable").unwrap(), format!("claude.exe --session-id {ID} --model fable"));
        // La ruta entre comillas, con espacios: el id va detrás de la comilla que la cierra.
        assert_eq!(
            con(r#"& "C:\Users\Mi Casa\.local\bin\claude.exe" --effort xhigh"#).unwrap(),
            format!(r#"& "C:\Users\Mi Casa\.local\bin\claude.exe" --session-id {ID} --effort xhigh"#)
        );
        // Lo que va detrás de la llamada no se traga el id (el revisor, 2026-11-17).
        for (l, sale) in [
            ("claude --model opus # para Moods", "--model opus # para Moods"),
            ("claude --effort max; exit", "--effort max; exit"),
            ("claude -- \"prompt\"", "-- \"prompt\""),
        ] {
            assert_eq!(con(l).unwrap(), format!("claude --session-id {ID} {sale}"), "{l}");
        }
    }

    #[test]
    fn una_conversacion_que_no_estrena_adeorq_no_se_apunta() {
        // Podría ser de Munir o de otra terminal: apuntarla haría a este panel su dueño.
        for l in ["claude --resume 572c3eb8-4cba", "claude -c", "claude --continue", "claude --session-id=abc", "claude --resume=x", "claude -r", "claude --session-id 0006490e-5bba"] {
            assert_eq!(con(l), None, "{l}");
        }
    }

    #[test]
    fn solo_cuenta_si_la_consola_espera_una_orden() {
        let p = |l: &str| espera_una_orden(&[l.to_string(), String::new(), "   ".to_string()]);
        assert!(p(r"PS C:\Users\Muni\proyectos\demo>"));
        assert!(p(r"C:\Windows\System32>"));
        assert!(p("munir@pc:~/demo$"));
        assert!(p("munir@mac demo %"));
        // Claude Code ya corriendo: su caja, su pie, su contexto en tanto por ciento.
        for l in ["❯", "> ", "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt", "? for shortcuts", "Context left until auto-compact: 9%", ""] {
            assert!(!p(l), "{l}");
        }
        assert!(!espera_una_orden(&[]));
        // Un pie suyo que acaba como un prompt (la revisión aparte): con su caja encima, no.
        let claude = |pie: &str| ["❯".to_string(), "────".to_string(), pie.to_string()];
        assert!(!espera_una_orden(&claude("Contexto 45 %")));
        assert!(!espera_una_orden(&claude("Coste 0,42 $")));
        // El último cuadro de un Claude que ya salió, encima de un `PS …>` nuevo: espera.
        assert!(espera_una_orden(&["❯".to_string(), "  ⏵⏵ auto mode on (shift+tab to cycle)".to_string(), r"PS C:\x>".to_string()]));
    }

    #[test]
    fn lo_que_no_abre_una_conversacion_no_se_toca() {
        for l in [
            "claude -p \"hola\"",
            "claude --print hola",
            "claude --version",
            "claude -h",
            "claude mcp list",
            "claude doctor",
            "claude update",
            "codex --model x",
            "claudes",
            "echo claude",
            "claude, mira esto",
            "",
            "claude\nclaude",
        ] {
            assert_eq!(con(l), None, "{l}");
        }
    }

    /// La revisión aparte del 2026-11-19 (BAJA 2): un archivo que no se podía leer
    /// (cogido por otro programa, o con un byte que no es UTF-8) contaba como vacío,
    /// y la escritura siguiente dejaba en él solo lo nuevo: se perdía lo de las
    /// demás consolas vivas.
    #[test]
    fn un_archivo_que_no_se_puede_leer_no_se_pisa() {
        let dir = std::env::temp_dir().join(format!("adeorq-tecleados-ilegible-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ruta = dir.join("tecleados.json");
        // Otra consola viva, y un 0xE9 suelto (una «é» guardada en ANSI) que no es UTF-8.
        let mut bytes = br#"[{"arranque":7,"panel":3,"comando":["claude --session-id x # caf"#.to_vec();
        bytes.push(0xE9);
        bytes.extend_from_slice(br#""],"ms":7}]"#);
        std::fs::write(&ruta, &bytes).unwrap();
        let nuevo = Apunte { arranque: 7, panel: 4, comando: vec!["claude --session-id y".into()], ms: 8 };
        assert!(cambiar(&ruta, Vida { arranque: 7, enganchada: false }, 8, |l| apuntar(l, nuevo)).is_err(), "lo reescribió sin haberlo podido leer");
        assert_eq!(std::fs::read(&ruta).unwrap(), bytes, "se perdió lo de la otra consola");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn carpeta(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-tecleados-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn apunte(arranque: u64, panel: u32, ms: u64) -> Apunte {
        Apunte { arranque, panel, comando: vec![format!("claude --session-id {arranque}-{panel}")], ms }
    }
    const HOY: u64 = 1_795_500_000_000;
    const DIA: u64 = 24 * 3600 * 1000;

    /// La revisión aparte del 2026-11-19 (BAJA 3): la ventana de desarrollo usa la
    /// misma carpeta que la instalada, y al guardar lo suyo podaba lo de la
    /// instalada con más de un mes aunque su consola siguiera viva.
    #[test]
    fn la_ventana_de_desarrollo_no_toca_lo_de_la_instalada() {
        let dir = carpeta("canales");
        let (instalada, desarrollo) = (ruta_en(&dir, "estable"), ruta_en(&dir, "desarrollo"));
        // Una consola de la instalada tecleada hace 40 días, viva en su proceso.
        cambiar(&instalada, Vida { arranque: 100, enganchada: true }, HOY - 40 * DIA, |l| apuntar(l, apunte(100, 3, HOY - 40 * DIA))).unwrap();
        // La de desarrollo guarda las suyas, enganchada a su proceso y sin enganchar.
        cambiar(&desarrollo, Vida { arranque: 200, enganchada: true }, HOY, |l| apuntar(l, apunte(200, 1, HOY))).unwrap();
        cambiar(&desarrollo, Vida { arranque: 300, enganchada: false }, HOY, |l| apuntar(l, apunte(300, 1, HOY))).unwrap();
        assert_eq!(los_de_ahora(&leer(&instalada), 100, &[3]).len(), 1, "la de desarrollo podó una consola viva de la instalada");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// En su canal, lo de la vida de ahora no se poda nunca; lo de otras, en el acto
    /// si está enganchada a su proceso (el de las otras murió), y si no, al mes.
    #[test]
    fn en_su_canal_lo_de_otras_vidas_se_poda_segun_este_enganchada() {
        let dir = carpeta("poda");
        let ruta = ruta_en(&dir, "estable");
        let vidas = || {
            let mut v: Vec<(u64, u32)> = leer(&ruta).iter().map(|a| (a.arranque, a.panel)).collect();
            v.sort();
            v
        };
        cambiar(&ruta, Vida { arranque: 9, enganchada: false }, HOY, |l| {
            apuntar(l, apunte(7, 1, HOY - 31 * DIA));
            apuntar(l, apunte(8, 2, HOY - 29 * DIA));
            apuntar(l, apunte(9, 3, HOY - 90 * DIA));
        })
        .unwrap();
        assert_eq!(vidas(), vec![(8, 2), (9, 3)]);
        cambiar(&ruta, Vida { arranque: 9, enganchada: true }, HOY, |_| {}).unwrap();
        assert_eq!(vidas(), vec![(9, 3)]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// La revisión aparte del 2026-11-19 (BAJA 3): el temporal se llamaba siempre
    /// `….json.tmp`, el mismo para la instalada y para la de desarrollo, y una podía
    /// renombrar como suyo el que la otra estaba escribiendo.
    #[test]
    fn el_temporal_que_compartian_no_se_toca() {
        let dir = carpeta("temporal");
        let ruta = ruta_en(&dir, "estable");
        let ajeno = ruta.with_extension("json.tmp");
        std::fs::write(&ajeno, "[a medio escribir").unwrap();
        cambiar(&ruta, Vida { arranque: 1, enganchada: true }, HOY, |l| apuntar(l, apunte(1, 1, HOY))).unwrap();
        assert_eq!(std::fs::read_to_string(&ajeno).ok().as_deref(), Some("[a medio escribir"), "se usó el temporal de otro proceso");
        assert_eq!(los_de_ahora(&leer(&ruta), 1, &[1]).len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sin_aleatoriedad_no_se_apunta() {
        // Sin id propio sería un Claude sin conversación sabida: justo lo que no se quiere.
        assert_eq!(linea_de_claude("claude --effort max", || None), None);
        let a = id_nuevo().unwrap();
        assert_ne!(a, id_nuevo().unwrap());
        assert_eq!((a.len(), &a[14..15]), (36, "4"), "{a}");
    }
}
