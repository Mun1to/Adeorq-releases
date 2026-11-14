//! El contexto de las terminales visto desde el MCP: cuánto lleva cada una y
//! qué se le dice al agente que la maneja.
//!
//! «Orquio General», 2026-10-22 (BUZON): las seis terminales que abrió ese día
//! con `open_pane` acabaron entre 587.778 y 831.704 tokens. Parte fue suya (les
//! mandó trabajo extra con `send_command`) y parte que en una delegada no hay
//! nadie que pulse Compactar. Lo que pidió, como barrera: que `get_active_panes`
//! diga los tokens, que `send_command` avise desde el aviso y no mande trabajo
//! nuevo sin confirmarlo, que a quien la abrió se le avise al cruzar la raya
//! roja, que `close_pane` y `open_pane` digan el contexto, y una herramienta
//! `compactar_terminal`. Las rayas son las de la D7 (`src/lib/contexto.ts`), y
//! un test de abajo comprueba que estas dicen lo mismo.

/// Las rayas de la D7, en tokens y en % de la ventana: en cada una vale lo que
/// llegue antes, para que una ventana pequeña (Haiku, 200k) siga avisando.
pub const AVISO_TOKENS: u64 = 350_000;
pub const FIJO_TOKENS: u64 = 450_000;
pub const NUEVA_TOKENS: u64 = 600_000;
const AVISO_PCT: u64 = 50;
const FIJO_PCT: u64 = 60;
const NUEVA_PCT: u64 = 80;
/// Lo que el panel espera a que pare antes de dar el pedido por caducado
/// (`CADUCA_MS` en `contexto.ts`, en minutos).
const CADUCA_MIN: u64 = 30;

/// Dónde cae una raya en esta ventana (`raya` en `contexto.ts`).
fn raya(tokens: u64, pct: u64, ventana: u64) -> u64 {
    if ventana > 0 {
        tokens.min(ventana * pct / 100)
    } else {
        tokens
    }
}

/// 0 nada · 1 ya pesa · 2 compacta ya · 3 mejor una terminal nueva
/// (`nivelDeContexto` en `contexto.ts`).
pub fn nivel(usados: u64, ventana: u64) -> u8 {
    if usados == 0 {
        return 0;
    }
    (1..=3u8).rev().find(|&n| usados >= raya_de(n, ventana)).unwrap_or(0)
}

/// Los tokens de la raya `n` (1, 2 o 3) en esta ventana.
fn raya_de(n: u8, ventana: u64) -> u64 {
    match n {
        1 => raya(AVISO_TOKENS, AVISO_PCT, ventana),
        2 => raya(FIJO_TOKENS, FIJO_PCT, ventana),
        _ => raya(NUEVA_TOKENS, NUEVA_PCT, ventana),
    }
}

/// Lo que pesa la conversación de una terminal, leído de su transcript.
#[derive(Clone, Debug, PartialEq)]
pub struct Carga {
    pub usados: u64,
    pub ventana: u64,
    /// La conversación, para contar sus compactaciones.
    pub sesion: String,
}

impl Carga {
    pub fn nivel(&self) -> u8 {
        nivel(self.usados, self.ventana)
    }
    /// La raya que ya ha pasado, en tokens de su ventana.
    fn pasada(&self) -> u64 {
        raya_de(self.nivel().max(1), self.ventana)
    }
}

/// La carga de la conversación de Claude Code de un panel, leída de su
/// transcript igual que la cabecera del panel (`session_context`). Solo con la
/// conversación SABIDA: la de su comando (`--session-id`, `--resume`) o la que
/// aprendió la ventana. Sin ella no se adivina por la más reciente de la
/// carpeta, que puede ser la de otra terminal.
pub fn carga_de(cwd: &str, comando: Option<&[String]>, sabida: Option<&str>) -> Option<Carga> {
    let comando = comando?;
    if !crate::rastros::es_claude(comando) {
        return None;
    }
    let sesion = crate::rastros::sesion_del_comando(comando).or_else(|| {
        sabida
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
            .map(str::to_string)
    })?;
    // El hilo de un cliente MCP es un hilo suelto, no uno de Tokio: aquí se
    // puede esperar. El comando no espera a nada (lee el disco y vuelve).
    // Y solo si sigue corriendo en algún Claude Code: tras un `/clear`, o con
    // el CLI cerrado y su PowerShell debajo, ese transcript se queda quieto en
    // «lista» y 450k, y retendría todo lo que se le mande a la terminal.
    carga_si_corre(tauri::async_runtime::block_on(crate::sessions::session_context(cwd.to_string(), Some(sesion.clone())))?, sesion)
}

/// Cuántas veces se compactó ya esa conversación (`compactaciones.rs`).
pub fn compactaciones(cwd: &str, c: &Carga) -> u32 {
    crate::compactaciones::session_compactions(cwd.to_string(), Some(c.sesion.clone()))
}

/// «412.000»: los tokens como se leen en español.
pub fn miles(n: u64) -> String {
    let cifras = n.to_string();
    let mut out = String::with_capacity(cifras.len() + cifras.len() / 3);
    for (i, ch) in cifras.chars().enumerate() {
        if i > 0 && (cifras.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(ch);
    }
    out
}

/// Lo que se le dice de una terminal en `get_active_panes`: sus tokens y, si
/// ha pasado una raya, qué hacer.
pub fn en_la_lista(id: u32, c: &Carga) -> String {
    let de = if c.ventana > 0 { format!(" de {}", miles(c.ventana)) } else { String::new() };
    let consejo = consejo(id, c).map(|t| format!(" ({t})")).unwrap_or_default();
    format!(", Contexto: {} tokens{de}{consejo}", miles(c.usados))
}

/// El consejo de cada raya, o nada por debajo del aviso.
pub fn consejo(id: u32, c: &Carga) -> Option<String> {
    let pasa = miles(c.pasada());
    match c.nivel() {
        0 => None,
        1 => Some(format!("pasa de {pasa}: cada respuesta suya relee todo eso, así que no le mandes trabajo nuevo grande")),
        2 => Some(format!(
            "pasa de {pasa}: compáctala con compactar_terminal({id}) o ciérrala con close_pane y su rastro y abre otra con el traspaso"
        )),
        _ => Some(format!(
            "pasa de {pasa}: mejor ciérrala con close_pane y su rastro y abre otra con el traspaso; compactarla tanto pierde detalle"
        )),
    }
}

/// Si lo que se va a teclear es trabajo nuevo: un mensaje para el modelo. Una
/// orden de barra (`/compact`, `/fin`) o el número de un menú, no.
pub fn es_trabajo_nuevo(texto: &str) -> bool {
    let t = texto.trim();
    !t.is_empty() && !t.starts_with('/') && !crate::pty::es_tecla_de_menu(t)
}

/// Si la terminal está esperando que le contesten: una pregunta suya
/// («pregunta», el «Type something» de una AskUserQuestion), una pregunta en
/// prosa al final de su turno («ofrece»), o un menú en pantalla (un permiso, que
/// el transcript cuenta como herramienta en marcha). Contestarle no es trabajo
/// nuevo: el texto de un permiso o un «no» pasan aunque no sean un número
/// (revisión de `1954cf0`, 2026-10-30).
pub fn espera_respuesta(estado: &str, pantalla: Option<&[String]>) -> bool {
    matches!(estado, "pregunta" | "ofrece") || pantalla.is_some_and(menu_en_pantalla)
}

/// Un menú de Claude Code esperando abajo. Se reconoce por su pie, que dice
/// cómo se contesta («Esc to cancel · Tab to amend» en un permiso, «Enter to
/// select · … · Esc to cancel» en una pregunta, medidos en la 2.1.302), o por
/// la pregunta del permiso. Solo en las últimas filas con algo: más arriba es
/// historia, y la caja vacía debajo dice que ya se contestó.
fn menu_en_pantalla(pantalla: &[String]) -> bool {
    pantalla
        .iter()
        .rev()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .take(12)
        .take_while(|l| *l != "❯" && *l != ">")
        .any(|l| l.contains("Esc to cancel") || l.starts_with("Enter to ") || l.contains("Do you want to proceed?"))
}

/// Si `send_command` se queda con un texto para una terminal que ya pasó el
/// aviso: solo el trabajo nuevo, y no la respuesta a lo que está preguntando.
/// `pantalla` se pide solo si el transcript no lo dice ya.
pub fn retiene(texto: &str, cwd: &str, c: &Carga, pantalla: impl FnOnce() -> Option<Vec<String>>) -> bool {
    if !es_trabajo_nuevo(texto) {
        return false;
    }
    let estado = tauri::async_runtime::block_on(crate::sessions::session_context(cwd.to_string(), Some(c.sesion.clone())))
        .map(|i| i.state)
        .unwrap_or_default();
    !espera_respuesta(&estado, None) && !pantalla().is_some_and(|p| menu_en_pantalla(&p))
}

/// Lo que pesa, si esa conversación sigue corriendo en algún Claude Code.
fn carga_si_corre(c: crate::sessions::ContextInfo, sesion: String) -> Option<Carga> {
    (c.used > 0 && c.viva).then_some(Carga { usados: c.used, ventana: c.window, sesion })
}

/// Por qué `send_command` no ha mandado trabajo nuevo a una terminal cargada.
pub fn retenido(id: u32, c: &Carga) -> String {
    format!(
        "Panel {id}: no lo he mandado. Lleva {} tokens de contexto (pasa de {}) y cada respuesta suya relee todo eso: \
         un encargo nuevo ahí sale caro y la empuja a compactarse a mitad. Mejor compáctala antes con \
         compactar_terminal({id}), o ciérrala con close_pane y su rastro y abre otra con el traspaso. Si es una \
         respuesta corta a lo que ya está haciendo, o lo quieres mandar igual, repítelo con confirm: true.",
        miles(c.usados),
        miles(c.pasada())
    )
}

/// Si toca avisar a quien la abrió: al cruzar la raya roja, una vez por raya.
/// `avisadas` guarda la última raya avisada de cada terminal, y se olvida
/// cuando baja del aviso (tras compactar), para que la subida siguiente vuelva
/// a avisar. Del aviso y no de la raya roja: una terminal que ronda los 450k
/// avisaba en cada subida, y la ventana olvida lo visto al mismo sitio
/// (`ctxVisto` en `TerminalPane.tsx`).
pub fn toca_avisar(avisadas: &mut std::collections::HashMap<u32, u8>, id: u32, nivel: u8) -> bool {
    if nivel < 2 {
        if nivel == 0 {
            avisadas.remove(&id);
        }
        return false;
    }
    if avisadas.get(&id).is_some_and(|&antes| antes >= nivel) {
        return false;
    }
    avisadas.insert(id, nivel);
    true
}

/// El aviso que se le pega a quien la abrió en su siguiente llamada al MCP.
/// Dice lo que va a pasar solo (`crearTraspaso` en `contexto.ts`): una
/// delegada compacta sola a la campana de un turno acabado, salvo que ya se
/// haya compactado dos veces (D4), y entonces lo decide quien la abrió.
pub fn aviso_a_quien_la_abrio(id: u32, carpeta: &str, c: &Carga, veces: u32) -> String {
    let cabeza = format!(
        "Aviso de Adeorq: la terminal {id} que abriste ({carpeta}) lleva {} tokens de contexto, pasada la raya de {}",
        miles(c.usados),
        miles(c.pasada())
    );
    if veces >= 2 {
        format!(
            "{cabeza}, y ya se compactó {veces} veces, así que no se compacta sola otra vez (cada resumen se hace sobre el \
             anterior y pierde detalle). Ciérrala con close_pane y su rastro y abre otra con el traspaso o, si quieres \
             seguir en ella, compáctala tú con compactar_terminal({id})."
        )
    } else {
        format!(
            "{cabeza}. En cuanto acabe su turno, Adeorq le escribe solo /fin sin commits y luego /compact (nunca mientras \
             trabaja): no le mandes trabajo nuevo hasta entonces. Si su tarea ya está hecha, mejor ciérrala con close_pane \
             y su rastro."
        )
    }
}

/// Por qué `compactar_terminal` no toca esa terminal, o `None`.
pub fn no_se_compacta(id: u32, es_claude: bool, delegada: bool) -> Option<String> {
    if !es_claude {
        return Some(format!(
            "La terminal {id} no corre Claude Code, y /fin y /compact solo los entiende Claude Code. Si pesa demasiado, \
             ciérrala con close_pane y su rastro y abre otra."
        ));
    }
    if !delegada {
        return Some(format!(
            "La terminal {id} no la abrió un agente con open_pane: es de Munir, y en sus terminales no se compacta sin su \
             clic (lo decidió él). Si pesa demasiado, díselo: tiene el botón Compactar en el aviso de esa terminal."
        ));
    }
    None
}

/// Lo que contesta `compactar_terminal`. `antes` es la fase del traspaso que
/// tenía el panel («nada», «esperando», «cerrando»).
pub fn parte_de_compactar(id: u32, c: Option<&Carga>, antes: &str, veces: u32) -> String {
    if antes != "nada" {
        let como = if antes == "cerrando" {
            "ya escribe su traspaso y, cuando acabe, va el /compact"
        } else {
            "espera a que acabe su turno para empezar"
        };
        return format!(
            "Terminal {id}: ya tenía un traspaso en marcha ({como}), así que no se empieza otro. Mírala con read_pane_screen({id})."
        );
    }
    let lleva = c.map(|c| format!(" Lleva {} tokens.", miles(c.usados))).unwrap_or_default();
    let de_mas = if veces >= 2 {
        format!(
            " Ya se compactó {veces} veces y cada resumen pierde detalle: la próxima, quizá mejor cerrarla con su rastro y abrir otra con el traspaso."
        )
    } else {
        String::new()
    };
    format!(
        "Terminal {id}: pedido.{lleva} En cuanto acabe su turno (si está trabajando se espera: nunca se le teclea a mitad), \
         Adeorq le escribe /fin sin commits para que deje su traspaso y, cuando ese acabe, /compact. Mírala con \
         read_pane_screen({id}); si en {CADUCA_MIN} minutos no ha parado, el pedido caduca y hay que volver a pedirlo.{de_mas}"
    )
}

/// Lo que se le dice a quien cierra: con cuánto contexto acabó.
pub fn al_cerrar(c: Option<&Carga>) -> String {
    c.map(|c| format!(" Su contexto al cerrarla: {} tokens.", miles(c.usados))).unwrap_or_default()
}

/// Lo que se le dice a quien abre otra: cuánto llevan las que ya tiene.
pub fn tus_otras(otras: &[(u32, Carga)]) -> String {
    if otras.is_empty() {
        return String::new();
    }
    let cada: Vec<String> = otras
        .iter()
        .map(|(id, c)| {
            let consejo = consejo(*id, c).map(|t| format!(" ({t})")).unwrap_or_default();
            format!("{id}: {} tokens{consejo}", miles(c.usados))
        })
        .collect();
    format!("\nTus otras terminales abiertas con open_pane: {}.", cada.join("; "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn carga(k: u64, ventana: u64) -> Carga {
        Carga { usados: k * 1000, ventana, sesion: "s".into() }
    }

    /// «se usan esas, no números nuevos»: las de aquí son las de la ventana.
    #[test]
    fn las_rayas_son_las_de_contexto_ts() {
        let ts = include_str!("../../../src/lib/contexto.ts");
        let valor = |nombre: &str| -> u64 {
            let linea = ts
                .lines()
                .find(|l| l.starts_with(&format!("export const {nombre} = ")))
                .unwrap_or_else(|| panic!("contexto.ts ya no tiene {nombre}"));
            linea.split('=').nth(1).unwrap().trim().trim_end_matches(';').replace('_', "").parse().unwrap()
        };
        assert_eq!(valor("AVISO_TOKENS"), AVISO_TOKENS);
        assert_eq!(valor("FIJO_TOKENS"), FIJO_TOKENS);
        assert_eq!(valor("NUEVA_TOKENS"), NUEVA_TOKENS);
        assert_eq!(valor("AVISO_PCT"), AVISO_PCT);
        assert_eq!(valor("FIJO_PCT"), FIJO_PCT);
        assert_eq!(valor("NUEVA_PCT"), NUEVA_PCT);
        let caduca = ts.lines().find(|l| l.starts_with("export const CADUCA_MS = ")).expect("contexto.ts ya no tiene CADUCA_MS");
        assert_eq!(caduca, format!("export const CADUCA_MS = {CADUCA_MIN} * 60_000;"), "el plazo que se le dice al agente");
    }

    /// Los mismos casos que `pnpm bancos contexto`.
    #[test]
    fn el_nivel_es_el_de_la_cabecera() {
        let m = 1_000_000;
        assert_eq!(nivel(349_000, m), 0);
        assert_eq!(nivel(350_000, m), 1);
        assert_eq!(nivel(449_000, m), 1);
        assert_eq!(nivel(450_000, m), 2);
        assert_eq!(nivel(599_000, m), 2);
        assert_eq!(nivel(600_000, m), 3);
        assert_eq!(nivel(99_000, 200_000), 0);
        assert_eq!(nivel(100_000, 200_000), 1, "Haiku: el 50 % llega antes que los 350k");
        assert_eq!(nivel(120_000, 200_000), 2);
        assert_eq!(nivel(160_000, 200_000), 3);
        assert_eq!(nivel(450_000, 0), 2, "sin ventana sabida, los tokens");
        assert_eq!(nivel(0, 0), 0);
    }

    #[test]
    fn los_tokens_se_leen_con_sus_puntos() {
        assert_eq!(miles(412_345), "412.345");
        assert_eq!(miles(1_000_000), "1.000.000");
        assert_eq!(miles(999), "999");
        assert_eq!(miles(0), "0");
    }

    /// Lo que pidió Orquio General: los tokens en la lista, y qué hacer al pasar
    /// cada raya, con la raya de ESA ventana.
    #[test]
    fn la_lista_dice_los_tokens_y_que_hacer() {
        let t = en_la_lista(3, &carga(120, 1_000_000));
        assert!(t.contains("Contexto: 120.000 tokens de 1.000.000"), "{t}");
        assert!(consejo(3, &carga(120, 1_000_000)).is_none());
        let t = en_la_lista(3, &carga(400, 1_000_000));
        assert!(t.contains("400.000") && t.contains("350.000"), "{t}");
        let t = en_la_lista(3, &carga(462, 1_000_000));
        assert!(t.contains("450.000") && t.contains("compactar_terminal(3)") && t.contains("close_pane"), "{t}");
        let t = en_la_lista(3, &carga(612, 1_000_000));
        assert!(t.contains("600.000") && t.contains("abre otra"), "{t}");
        let t = en_la_lista(3, &carga(125, 200_000));
        assert!(t.contains("120.000") && t.contains("compactar_terminal(3)"), "Haiku compacta a 120k: {t}");
    }

    #[test]
    fn trabajo_nuevo_es_un_mensaje_y_no_una_orden() {
        assert!(es_trabajo_nuevo("arregla el login"));
        assert!(es_trabajo_nuevo("sí, sigue"));
        assert!(!es_trabajo_nuevo("/compact Conserva lo hecho"));
        assert!(!es_trabajo_nuevo("  /fin sin commits"));
        assert!(!es_trabajo_nuevo("2"), "el número de un menú");
        assert!(!es_trabajo_nuevo(""));
        assert!(!es_trabajo_nuevo("   "));
    }

    /// Revisión de `1954cf0`: contestar a lo que la terminal está preguntando
    /// no es trabajo nuevo, aunque no sea un número. Pantallas de verdad de
    /// Claude Code 2.1.302 (`scripts/laboratorio/doble-movil.mjs`).
    #[test]
    fn contestar_a_una_pregunta_no_es_trabajo_nuevo() {
        let filas = |s: &[&str]| s.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        let caja = filas(&["● Hecho.", "", "────────────────── Web ─", "❯ ", "──────────────────"]);
        // El «Type something» de una pregunta suya, y un «no» a una pregunta en prosa.
        assert!(espera_respuesta("pregunta", None));
        assert!(espera_respuesta("ofrece", Some(&caja)));
        // Un permiso en pantalla, aunque el transcript diga que hay una herramienta en marcha.
        let permiso = filas(&[
            " Bash command",
            "   pnpm publicar-version notas.md",
            " Do you want to proceed?",
            " ❯ 1. Yes",
            "   2. Yes, and don't ask again for pnpm publicar-version commands in C:\\proyectos\\Webs",
            "   3. No, and tell Claude what to do differently (esc)",
            "",
            " Esc to cancel · Tab to amend",
        ]);
        assert!(espera_respuesta("a_medias", Some(&permiso)));
        let pregunta = filas(&[
            "❯ 1. Instalador",
            "     Una página con casillas antes de instalar",
            "  2. En los dos sitios",
            "  4. Type something.",
            "────────",
            "  5. Chat about this",
            "",
            "Enter to select · Tab/Arrow keys to navigate · Esc to cancel",
        ]);
        assert!(espera_respuesta("a_medias", Some(&pregunta)));
        // Parada sin preguntar nada, o trabajando: un mensaje sí es trabajo nuevo.
        assert!(!espera_respuesta("lista", Some(&caja)));
        assert!(!espera_respuesta("a_medias", Some(&filas(&["✻ Pensando… (12s · esc to interrupt)", "────", "❯ ", "────"]))));
        assert!(!espera_respuesta("lista", None));
        // Un permiso de hace rato, ya contestado y con la caja debajo, no cuenta.
        let viejo: Vec<String> = permiso.iter().cloned().chain(caja.iter().cloned()).chain((0..20).map(|i| format!("línea {i}"))).collect();
        assert!(!espera_respuesta("lista", Some(&viejo)));
    }

    /// Una conversación que ya no corre en ningún Claude Code (tras `/clear`, o
    /// con Claude Code cerrado y el PowerShell de `-NoExit` debajo) se quedaba
    /// en «lista» y 450k para siempre: `send_command` lo retenía todo.
    #[test]
    fn una_conversacion_que_ya_no_corre_no_cuenta() {
        let info = |viva: bool| crate::sessions::ContextInfo {
            model: "Opus 5.5".into(),
            used: 450_000,
            window: 1_000_000,
            percent: 45,
            agents_live: 0,
            agents_total: 0,
            session_id: "s".into(),
            folder: "f".into(),
            state: "lista".into(),
            title: String::new(),
            viva,
            sin_cuota: false,
        };
        assert_eq!(carga_si_corre(info(true), "s".into()).map(|c| c.usados), Some(450_000));
        assert_eq!(carga_si_corre(info(false), "s".into()), None);
    }

    #[test]
    fn lo_retenido_dice_por_que_y_como_seguir() {
        let t = retenido(5, &carga(612, 1_000_000));
        for frase in ["612.000", "no lo he mandado", "compactar_terminal(5)", "close_pane", "confirm: true"] {
            assert!(t.contains(frase), "falta «{frase}»: {t}");
        }
    }

    /// Una vez por raya, y otra vez si baja y vuelve a cruzar.
    #[test]
    fn a_quien_la_abrio_se_le_avisa_una_vez_por_raya() {
        let mut av = HashMap::new();
        assert!(!toca_avisar(&mut av, 3, 1), "el aviso de 350k no se le pega a cada llamada");
        assert!(toca_avisar(&mut av, 3, 2));
        assert!(!toca_avisar(&mut av, 3, 2), "la segunda llamada ya no");
        assert!(toca_avisar(&mut av, 3, 3), "a los 600k, otra vez");
        assert!(!toca_avisar(&mut av, 3, 3));
        assert!(!toca_avisar(&mut av, 3, 0), "compactó: se olvida");
        assert!(toca_avisar(&mut av, 3, 2), "y la subida siguiente vuelve a avisar");
        assert!(toca_avisar(&mut av, 4, 2), "cada terminal la suya");
    }

    /// Revisión de `1954cf0`: se olvidaba al bajar de 450k, y una terminal que
    /// baila alrededor de la raya (448k, 451k, 449k…) avisaba en cada subida.
    /// Se olvida al bajar del aviso (350k), como la ventana (`contexto.ts`).
    #[test]
    fn el_aviso_no_se_repite_rondando_la_raya() {
        let mut av = HashMap::new();
        assert!(toca_avisar(&mut av, 3, 2));
        assert!(!toca_avisar(&mut av, 3, 1), "bajó a 448k");
        assert!(!toca_avisar(&mut av, 3, 2), "y volvió a 451k: ya se le dijo");
        assert!(!toca_avisar(&mut av, 3, 0), "compactó de verdad: por debajo de 350k");
        assert!(toca_avisar(&mut av, 3, 2), "ahora sí es otra subida");
    }

    #[test]
    fn el_aviso_dice_si_se_compactara_sola() {
        let t = aviso_a_quien_la_abrio(3, "C:\\proyectos\\Web", &carga(462, 1_000_000), 0);
        for frase in ["terminal 3", "C:\\proyectos\\Web", "462.000", "/fin sin commits", "/compact", "close_pane"] {
            assert!(t.contains(frase), "falta «{frase}»: {t}");
        }
        let t = aviso_a_quien_la_abrio(3, "C:\\x", &carga(462, 1_000_000), 2);
        assert!(t.contains("2 veces") && t.contains("no se compacta sola") && t.contains("compactar_terminal(3)"), "{t}");
    }

    /// D8: en las terminales de Munir, sin su clic no se compacta.
    #[test]
    fn solo_se_compactan_las_delegadas_de_claude() {
        assert_eq!(no_se_compacta(3, true, true), None);
        let de_munir = no_se_compacta(3, true, false).expect("una de Munir no");
        assert!(de_munir.contains("sin su clic") && de_munir.contains("open_pane"), "{de_munir}");
        let codex = no_se_compacta(3, false, true).expect("una que no es Claude Code no");
        assert!(codex.contains("Claude Code"), "{codex}");
    }

    #[test]
    fn compactar_dice_que_espera_y_lo_que_va_a_teclear() {
        let t = parte_de_compactar(3, Some(&carga(462, 1_000_000)), "nada", 0);
        for frase in ["462.000", "/fin sin commits", "/compact", "acabe su turno", "read_pane_screen(3)", "30 minutos"] {
            assert!(t.contains(frase), "falta «{frase}»: {t}");
        }
        let t = parte_de_compactar(3, None, "cerrando", 0);
        assert!(t.contains("ya") && t.contains("en marcha") && !t.contains("tokens"), "{t}");
        let t = parte_de_compactar(3, Some(&carga(462, 1_000_000)), "nada", 2);
        assert!(t.contains("2 veces"), "{t}");
    }

    #[test]
    fn cerrar_y_abrir_dicen_el_contexto() {
        assert!(al_cerrar(Some(&carga(612, 1_000_000))).contains("612.000 tokens"));
        assert_eq!(al_cerrar(None), "");
        let t = tus_otras(&[(3, carga(462, 1_000_000)), (5, carga(120, 1_000_000))]);
        assert!(t.contains("3: 462.000") && t.contains("5: 120.000") && t.contains("compactar_terminal(3)"), "{t}");
        assert!(!t.contains("compactar_terminal(5)"), "la de 120k no necesita consejo: {t}");
        assert_eq!(tus_otras(&[]), "");
    }
}
