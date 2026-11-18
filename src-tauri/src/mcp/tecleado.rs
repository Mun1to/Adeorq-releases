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

    #[test]
    fn sin_aleatoriedad_no_se_apunta() {
        // Sin id propio sería un Claude sin conversación sabida: justo lo que no se quiere.
        assert_eq!(linea_de_claude("claude --effort max", || None), None);
        let a = id_nuevo().unwrap();
        assert_ne!(a, id_nuevo().unwrap());
        assert_eq!((a.len(), &a[14..15]), (36, "4"), "{a}");
    }
}
