// Abrir una terminal con encargo desde fuera de Adeorq pide un clic.
//
// Decisión C1 de Munir, 2026-11-04: lo de fuera abre sin encargo, y con encargo
// sale una ventana con el texto, quién lo pide y en qué carpeta, «No / Abrir».
// Si nadie contesta no se abre, y eso es lo que se busca: que decida una persona.
//
// La terminal nace en el modo de Ajustes y sin marcar la carpeta de confianza,
// también con «Abrir»: el clic aprueba este texto en esta carpeta, no todo lo que
// el agente vaya a hacer después sin preguntar.
//
// El modelo es la ventana de las claves (`pedir_secreto.rs`). Aquí vive la espera;
// la ventana es `src/components/PedirAbrir.tsx`, y quién pasa por ella lo decide
// `apertura`. Lo cuenta `docs/contexto/decisiones-2026-10-07.md`.

use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::mcp_clientes::Nivel;

/// Cuánto espera un clic una llamada de fuera. Lo bastante para volver a la
/// ventana y leer el encargo, y corto para no dejar a nadie colgado.
const ESPERA: Duration = Duration::from_secs(120);

/// Cuánto se niega a preguntar otra vez después de un «No». Un agente que
/// reintenta al recibir un error volvería a sacar la ventana en el acto, y la
/// app no se podría usar: cada «No» traería otra, hasta el clic equivocado.
const TRAS_UN_NO: Duration = Duration::from_secs(30);

/// Lo más largo que se enseña. Lo que no se puede leer en la ventana no se manda,
/// y una línea de órdenes de Windows tampoco da para más.
const TOPE_ENCARGO: usize = 20_000;

/// Cómo nace lo que pide una conexión.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Apertura {
    /// En auto y con la carpeta marcada: la abre un agente de Adeorq, un encargo
    /// programado, un puente de casa, o algo de fuera a quien lo subieron a «Todo».
    ComoSiempre,
    /// En el modo de Ajustes y sin marcar la carpeta.
    EnSuModo,
    /// Lo mismo, y antes un clic de una persona.
    ConClic,
}

/// La regla de la C1. `de_fuera` lo decide `mcp::es_de_fuera`.
pub fn apertura(de_fuera: bool, nivel_de_fuera: Nivel, con_encargo: bool) -> Apertura {
    if !de_fuera || nivel_de_fuera == Nivel::Auto {
        Apertura::ComoSiempre
    } else if con_encargo {
        Apertura::ConClic
    } else {
        Apertura::EnSuModo
    }
}

/// La pregunta en curso. Una sola a la vez, como la de las claves.
struct Buzon {
    siguiente: u64,
    esperando: Option<(u64, Sender<bool>)>,
    ultimo_no: Option<Instant>,
}

static BUZON: Mutex<Buzon> = Mutex::new(Buzon::nuevo());

impl Buzon {
    const fn nuevo() -> Self {
        Self { siguiente: 0, esperando: None, ultimo_no: None }
    }

    /// Coger el turno de preguntar, o por qué no toca.
    fn ocupar(&mut self, ahora: Instant) -> Result<(u64, Receiver<bool>), String> {
        if self.esperando.is_some() {
            return Err("No se ha abierto: ya hay una ventana de Adeorq preguntando por otra terminal. Prueba cuando se conteste.".into());
        }
        if self.ultimo_no.is_some_and(|no| ahora.duration_since(no) < TRAS_UN_NO) {
            return Err("No se ha abierto: te han dicho que no hace un momento, no insistas.".into());
        }
        self.siguiente += 1;
        let (tx, rx) = channel();
        self.esperando = Some((self.siguiente, tx));
        Ok((self.siguiente, rx))
    }

    /// La respuesta de la ventana. La de una pregunta que ya no está en curso (se
    /// agotó su tiempo) no contesta a la siguiente: por eso va con su número.
    fn contestar(&mut self, peticion: u64, abrir: bool, ahora: Instant) -> Result<(), String> {
        match self.esperando.take() {
            Some((n, tx)) if n == peticion => {
                if !abrir {
                    self.ultimo_no = Some(ahora);
                }
                // Si quien esperaba ya se cansó, no es culpa de quien acaba de contestar.
                let _ = tx.send(abrir);
                Ok(())
            }
            otra => {
                self.esperando = otra;
                Err("ya no había nadie esperando esa respuesta".into())
            }
        }
    }

    fn soltar(&mut self, peticion: u64) {
        if self.esperando.as_ref().is_some_and(|(n, _)| *n == peticion) {
            self.esperando = None;
        }
    }
}

fn buzon() -> std::sync::MutexGuard<'static, Buzon> {
    BUZON.lock().unwrap_or_else(|e| e.into_inner())
}

/// Lo que dice la ventana al que preguntó, en palabras que un agente sepa leer.
fn esperar(rx: &Receiver<bool>, espera: Duration) -> Result<(), String> {
    match rx.recv_timeout(espera) {
        Ok(true) => Ok(()),
        Ok(false) => Err("No se ha abierto: quien usa Adeorq ha dicho que no.".into()),
        Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => Err(
            "No se ha abierto: nadie ha contestado a la ventana de Adeorq. Con un encargo hace falta el clic de una persona; sin encargo se abre sin preguntar."
                .into(),
        ),
    }
}

/// Los caracteres que no pintan nada, o le dan la vuelta al texto, y que un modelo
/// sí lee: los de formato de Unicode y los que dejan un hueco sin ser un espacio. Las
/// «etiquetas» (U+E0000) son un alfabeto entero invisible con el que cabe un encargo
/// escondido dentro de otro.
fn no_se_ve(c: char) -> bool {
    matches!(c,
        '\u{00AD}' | '\u{034F}' | '\u{0600}'..='\u{0605}' | '\u{061C}' | '\u{06DD}' | '\u{070F}' | '\u{08E2}'
        | '\u{115F}' | '\u{1160}' | '\u{17B4}' | '\u{17B5}' | '\u{180B}'..='\u{180F}'
        | '\u{200B}'..='\u{200F}' | '\u{2028}'..='\u{202E}' | '\u{2060}'..='\u{206F}' | '\u{2800}' | '\u{3164}'
        | '\u{FE00}'..='\u{FE0F}' | '\u{FEFF}' | '\u{FFA0}' | '\u{FFF0}'..='\u{FFFB}'
        | '\u{110BD}' | '\u{110CD}' | '\u{13430}'..='\u{1345F}' | '\u{1BCA0}'..='\u{1BCA3}' | '\u{1D173}'..='\u{1D17A}'
        | '\u{E0000}'..='\u{E0FFF}')
}

/// Lo que llega de fuera, tal como se puede leer: sin caracteres de control ni
/// los que no se ven (`no_se_ve`), para que lo que enseña la ventana no diga otra
/// cosa que lo que se manda. Se marcan en vez de quitarse.
fn a_la_vista(texto: &str) -> String {
    texto
        .chars()
        .map(|c| match c {
            '\n' | '\t' => c,
            c if c.is_control() || no_se_ve(c) => '\u{FFFD}',
            c => c,
        })
        .collect()
}

/// El nombre con que se presenta, en una línea y corto.
fn nombre_a_la_vista(quien: &str) -> String {
    a_la_vista(quien).split_whitespace().collect::<Vec<_>>().join(" ").chars().take(60).collect()
}

/// Preguntar y esperar. `Ok` es que alguien ha pulsado «Abrir»; un `Err` es lo que
/// contesta `open_pane`. `quien` es el nombre que se puso él, que no prueba nada,
/// salvo con `es_bot`: es un bot conectado, y eso lo dice su clave.
pub fn preguntar(app: &tauri::AppHandle, quien: &str, es_bot: bool, cli: &str, carpeta: &str, encargo: &str) -> Result<(), String> {
    if encargo.chars().count() > TOPE_ENCARGO {
        return Err(format!("No se ha abierto: el encargo pasa de {TOPE_ENCARGO} caracteres y no se puede enseñar entero."));
    }
    let (peticion, rx) = buzon().ocupar(Instant::now())?;
    let nombre = nombre_a_la_vista(quien);
    let aviso = app.emit(
        "abrir-pedido",
        serde_json::json!({
            "peticion": peticion,
            "quien": nombre,
            "bot": es_bot,
            "cli": cli,
            "carpeta": a_la_vista(carpeta),
            "encargo": a_la_vista(encargo),
        }),
    );
    if aviso.is_err() {
        buzon().soltar(peticion);
        return Err("No se ha abierto: la ventana de Adeorq no responde.".into());
    }
    let res = esperar(&rx, ESPERA);
    buzon().soltar(peticion);
    // También a las demás ventanas, y a la que se quedó abierta si nadie contestó.
    let _ = app.emit("abrir-pedido-fin", peticion);
    let quien_lo_pide = if es_bot { format!("El bot {nombre}") } else { format!("Un programa de fuera de Adeorq (dice ser «{nombre}»)") };
    crate::anotar(&format!(
        "{quien_lo_pide} pidió abrir {cli} con encargo en {}: {}.",
        a_la_vista(carpeta),
        if res.is_ok() { "se abrió con tu clic" } else { "no se abrió" }
    ));
    res
}

/// El front, cuando alguien pulsa «No» o «Abrir».
#[tauri::command(async)]
pub fn abrir_contestar(peticion: u64, abrir: bool) -> Result<(), String> {
    buzon().contestar(peticion, abrir, Instant::now())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn la_regla_de_la_c1() {
        use Apertura::*;
        // Lo de fuera: con encargo, clic; sin encargo, en su modo.
        for nivel in [Nivel::Mirar, Nivel::Plan] {
            assert_eq!(apertura(true, nivel, true), ConClic);
            assert_eq!(apertura(true, nivel, false), EnSuModo);
        }
        // Subido a «Todo», no pregunta: lo decidió quien lo subió.
        assert_eq!(apertura(true, Nivel::Auto, true), ComoSiempre);
        assert_eq!(apertura(true, Nivel::Auto, false), ComoSiempre);
        // Lo de dentro no depende de cómo esté la fila de fuera.
        for nivel in [Nivel::Mirar, Nivel::Plan, Nivel::Auto] {
            assert_eq!(apertura(false, nivel, true), ComoSiempre);
            assert_eq!(apertura(false, nivel, false), ComoSiempre);
        }
    }

    #[test]
    fn una_pregunta_a_la_vez() {
        let ahora = Instant::now();
        let mut b = Buzon::nuevo();
        let (n, rx) = b.ocupar(ahora).unwrap();
        assert!(b.ocupar(ahora).is_err(), "la segunda se rinde");
        b.contestar(n, true, ahora).unwrap();
        assert!(esperar(&rx, Duration::from_millis(1)).is_ok());
        assert!(b.ocupar(ahora).is_ok(), "un «Abrir» deja preguntar otra vez");
    }

    #[test]
    fn la_respuesta_de_una_ventana_vieja_no_contesta_a_la_nueva() {
        let ahora = Instant::now();
        let mut b = Buzon::nuevo();
        let (vieja, _rx) = b.ocupar(ahora).unwrap();
        b.soltar(vieja);
        let (nueva, rx) = b.ocupar(ahora).unwrap();
        assert!(b.contestar(vieja, true, ahora).is_err());
        assert!(rx.try_recv().is_err(), "nadie ha contestado a la nueva");
        b.contestar(nueva, false, ahora).unwrap();
        assert!(esperar(&rx, Duration::from_millis(1)).unwrap_err().contains("dicho que no"));
    }

    #[test]
    fn tras_un_no_no_se_vuelve_a_preguntar_enseguida() {
        let ahora = Instant::now();
        let mut b = Buzon::nuevo();
        let (n, _rx) = b.ocupar(ahora).unwrap();
        b.contestar(n, false, ahora).unwrap();
        assert!(b.ocupar(ahora + Duration::from_secs(29)).unwrap_err().contains("no insistas"));
        assert!(b.ocupar(ahora + TRAS_UN_NO).is_ok());
    }

    #[test]
    fn si_nadie_contesta_no_se_abre() {
        let (_tx, rx) = channel::<bool>();
        assert!(esperar(&rx, Duration::from_millis(10)).unwrap_err().contains("nadie"));
    }

    #[test]
    fn lo_que_se_ve_es_lo_que_hay() {
        // Lo que da la vuelta al texto o no se ve, marcado; los saltos, tal cual.
        assert_eq!(a_la_vista("a\u{202E}b\u{200B}c\u{1B}[2Jd\ne\tf"), "a\u{FFFD}b\u{FFFD}c\u{FFFD}[2Jd\ne\tf");
        assert_eq!(a_la_vista("el encargo: ñandú, 日本語"), "el encargo: ñandú, 日本語");
        // Los que no pintan nada y un modelo sí lee: letras «etiqueta» (texto
        // entero escondido), selectores, rellenos que parecen un espacio vacío.
        for oculto in ['\u{E0041}', '\u{E0001}', '\u{E0100}', '\u{FFF9}', '\u{034F}', '\u{115F}', '\u{3164}', '\u{FFA0}', '\u{17B4}', '\u{180B}', '\u{1D173}', '\u{2800}', '\u{0600}'] {
            assert_eq!(a_la_vista(&format!("a{oculto}b")), "a\u{FFFD}b", "U+{:04X} no se ve y no sale marcado", oculto as u32);
        }
        // El nombre, en una línea y corto.
        assert_eq!(nombre_a_la_vista("  hermes\n\n  agent "), "hermes agent");
        assert_eq!(nombre_a_la_vista(&"x".repeat(200)).chars().count(), 60);
    }
}
