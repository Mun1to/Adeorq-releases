// Los modos que un programa le pone a su terminal, para devolvérselos a una
// terminal que renace.
//
// ── EL FALLO QUE ARREGLA (Munir, 2026-09-21) ────────────────────────────────
//
// «Mi Adeorq ahora no se puede hacer scroll bien», con la píldora de «En pausa ·
// 52 líneas nuevas» encima de un Claude Code en pantalla completa, que es justo
// donde esa pausa no puede existir. Ese panel había salido a su propia ventana y
// había vuelto. Una terminal que renace (la ventana suelta, la vuelta al tablero,
// el rescate de un panel caído) se rehace con el HISTORIAL del panel, y el
// historial es solo el final de la conversación: Claude Code dice `ESC[?1049h`
// (pantalla alternativa) UNA vez, al arrancar, y a los pocos minutos de
// repintados esa orden ya se ha caído por delante del recorte. Medido en el
// Adeorq en marcha con `scripts/laboratorio/renacer-panel.mjs`: los seis paneles
// de Claude Code renacían en la pantalla normal con el programa dibujando la
// alternativa y el ratón encendido. Ahí Adeorq cree que el scroll es suyo,
// congela la salida, y la respuesta del programa a la rueda se queda en la cola.
// Con la pantalla se perdía todo lo demás que el programa pidió una sola vez: el
// pegado entre corchetes y el aviso de foco.
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
//
// Cada vez que el historial se corta, lo que queda detrás del corte se lee con
// esto, y lo que se conserva empieza por un PREÁMBULO que deja una xterm recién
// nacida en el mismo estado que tenía la de verdad en ese punto. Así el historial
// es siempre una grabación que se reproduce desde cero, la lea quien la lea.
//
// Solo se cuentan los modos que xterm.js atiende con las opciones de Adeorq y que
// cambian lo que se ve o lo que se le manda al programa. La salida sincronizada
// (`?2026`) no, porque dura un fotograma y restaurarla a medias dejaría la
// terminal sin pintar. El teclado de kitty y el `win32-input-mode` tampoco:
// Adeorq no enciende esas extensiones y xterm los ignora.

/// Por dónde va el lector de secuencias. Hace falta porque una secuencia puede
/// llegar partida entre dos lecturas, y porque dentro de un título (OSC) o de una
/// cadena de control (DCS) un `[?1049h` es texto, no una orden.
#[derive(Clone, Copy, PartialEq, Debug, Default)]
enum Estado {
    #[default]
    Suelo,
    Esc,
    EscIntermedio,
    Csi,
    Cadena,
    CadenaEsc,
}

/// Una secuencia con más parámetros que esto no es de las que se cuentan aquí.
/// El tope es para que un flujo raro no haga crecer el búfer sin freno.
const TOPE_PARAMS: usize = 64;

#[derive(Clone, Debug, Default)]
pub struct Modos {
    estado: Estado,
    params: Vec<u8>,
    marcador: u8,
    intermedio: u8,
    descartar: bool,
    es_osc: bool,
    /// Con qué código se abrió la pantalla alternativa (47, 1047 o 1049).
    alternativa: Option<u16>,
    /// El protocolo del ratón: 9, 1000, 1002 o 1003. Solo vale uno a la vez.
    raton: Option<u16>,
    /// Cómo se codifica el ratón: 1006 (SGR) o 1016 (SGR en píxeles).
    codificacion: Option<u16>,
    cursor_oculto: bool,
    teclas_aplicacion: bool,
    teclado_aplicacion: bool,
    sin_ajuste: bool,
    foco: bool,
    pegado: bool,
    tema: bool,
}

impl Modos {
    pub fn alimentar(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.byte(b);
        }
    }

    /// Fuera de cualquier secuencia: cortar aquí no parte ninguna orden.
    pub fn en_reposo(&self) -> bool {
        self.estado == Estado::Suelo
    }

    fn byte(&mut self, b: u8) {
        match self.estado {
            Estado::Suelo => {
                if b == 0x1b {
                    self.estado = Estado::Esc;
                }
            }
            Estado::Esc => match b {
                b'[' => {
                    self.estado = Estado::Csi;
                    self.params.clear();
                    self.marcador = 0;
                    self.intermedio = 0;
                    self.descartar = false;
                }
                b']' => {
                    self.estado = Estado::Cadena;
                    self.es_osc = true;
                }
                b'P' | b'_' | b'^' | b'X' => {
                    self.estado = Estado::Cadena;
                    self.es_osc = false;
                }
                // RIS: la terminal vuelve de fábrica, modos incluidos.
                b'c' => *self = Modos::default(),
                0x1b => {}
                0x20..=0x2f => self.estado = Estado::EscIntermedio,
                // Un control C0 aquí se ejecuta y la secuencia sigue abierta.
                0x00..=0x17 | 0x19 | 0x1c..=0x1f => {}
                _ => self.estado = Estado::Suelo,
            },
            Estado::EscIntermedio => match b {
                0x20..=0x2f | 0x00..=0x17 | 0x19 | 0x1c..=0x1f => {}
                0x1b => self.estado = Estado::Esc,
                _ => self.estado = Estado::Suelo,
            },
            Estado::Csi => match b {
                0x1b => self.estado = Estado::Esc,
                0x18 | 0x1a => self.estado = Estado::Suelo,
                0x3c..=0x3f if self.params.is_empty() && self.marcador == 0 && self.intermedio == 0 => {
                    self.marcador = b
                }
                0x30..=0x3f => {
                    // Un parámetro después de un intermedio, o un marcador que no
                    // va el primero, ya no es una secuencia válida; y una
                    // kilométrica no es de las nuestras.
                    if self.intermedio != 0 || b >= 0x3c || self.params.len() >= TOPE_PARAMS {
                        self.descartar = true;
                    } else {
                        self.params.push(b);
                    }
                }
                0x20..=0x2f => self.intermedio = b,
                0x40..=0x7e => {
                    self.estado = Estado::Suelo;
                    if !self.descartar {
                        self.despachar(b);
                    }
                }
                // Un control C0 dentro de un CSI se ejecuta y no lo corta.
                _ => {}
            },
            Estado::Cadena => match b {
                0x07 if self.es_osc => self.estado = Estado::Suelo,
                0x1b => self.estado = Estado::CadenaEsc,
                0x18 | 0x1a => self.estado = Estado::Suelo,
                _ => {}
            },
            Estado::CadenaEsc => {
                if b == b'\\' {
                    self.estado = Estado::Suelo;
                } else {
                    // Un ESC que no cierra la cadena la aborta y empieza otra
                    // secuencia, que es este mismo byte visto desde un ESC.
                    self.estado = Estado::Esc;
                    self.byte(b);
                }
            }
        }
    }

    fn despachar(&mut self, final_: u8) {
        match (self.marcador, self.intermedio, final_) {
            (b'?', 0, b'h') => self.privados(true),
            (b'?', 0, b'l') => self.privados(false),
            // DECSTR, el reinicio suave: lo mismo que borra xterm en su
            // `softReset` (los modos privados de su `CoreService`), que no toca
            // ni el ratón ni la pantalla.
            (0, b'!', b'p') => {
                self.cursor_oculto = false;
                self.teclas_aplicacion = false;
                self.teclado_aplicacion = false;
                self.sin_ajuste = false;
                self.foco = false;
                self.pegado = false;
                self.tema = false;
            }
            _ => {}
        }
    }

    fn privados(&mut self, activar: bool) {
        let params = std::mem::take(&mut self.params);
        for trozo in params.split(|&c| c == b';') {
            let Some(n) = std::str::from_utf8(trozo).ok().and_then(|s| s.parse::<u16>().ok()) else {
                continue;
            };
            match n {
                1 => self.teclas_aplicacion = activar,
                7 => self.sin_ajuste = !activar,
                25 => self.cursor_oculto = !activar,
                66 => self.teclado_aplicacion = activar,
                // xterm apaga el ratón con cualquiera de los cuatro.
                9 | 1000 | 1002 | 1003 => self.raton = activar.then_some(n),
                1006 | 1016 => self.codificacion = activar.then_some(n),
                1004 => self.foco = activar,
                2004 => self.pegado = activar,
                2031 => self.tema = activar,
                47 | 1047 | 1049 => {
                    if !activar {
                        self.alternativa = None;
                    } else if self.alternativa.is_none() {
                        self.alternativa = Some(n);
                    }
                }
                _ => {}
            }
        }
        self.params = params;
    }

    /// Lo que hay que escribirle a una xterm RECIÉN NACIDA para dejarla así.
    ///
    /// Solo lo que difiere de fábrica, y la pantalla lo primero: lo demás se
    /// pone ya dentro de ella, como lo hizo el programa.
    pub fn preambulo(&self) -> String {
        let mut s = String::new();
        let mut pon = |n: u16, activar: bool| {
            s.push_str(&format!("\x1b[?{n}{}", if activar { 'h' } else { 'l' }));
        };
        if let Some(n) = self.alternativa {
            pon(n, true);
        }
        if self.teclas_aplicacion {
            pon(1, true);
        }
        if self.sin_ajuste {
            pon(7, false);
        }
        if self.cursor_oculto {
            pon(25, false);
        }
        if self.teclado_aplicacion {
            pon(66, true);
        }
        if let Some(n) = self.raton {
            pon(n, true);
        }
        if let Some(n) = self.codificacion {
            pon(n, true);
        }
        if self.foco {
            pon(1004, true);
        }
        if self.pegado {
            pon(2004, true);
        }
        if self.tema {
            pon(2031, true);
        }
        s
    }
}

/// Dónde cortar un historial para quedarse con su final, y con qué empezar lo
/// que queda.
///
/// `desde` es el primer byte que se querría conservar. El corte se corre hacia
/// delante hasta un sitio donde no parta ni un carácter ni una secuencia de
/// escape: una orden cortada por la mitad se pintaría como texto («?1049h»
/// arriba del todo) o se comería lo que viniera detrás. Devuelve el byte de
/// corte y el preámbulo con los modos que estaban puestos en ese punto.
///
/// El historial tiene que ser una grabación reproducible desde cero, o sea que
/// su principio sea el principio de la sesión o un preámbulo de estos. Es lo que
/// garantiza `recortar_historial` en `pty.rs`.
pub fn cortar(hist: &str, desde: usize) -> (usize, String) {
    let bytes = hist.as_bytes();
    let mut corte = desde.min(bytes.len());
    while corte < bytes.len() && !hist.is_char_boundary(corte) {
        corte += 1;
    }
    let mut modos = Modos::default();
    modos.alimentar(&bytes[..corte]);
    while !modos.en_reposo() && corte < bytes.len() {
        modos.alimentar(&bytes[corte..corte + 1]);
        corte += 1;
    }
    // Un ESC seguido de una letra con tilde sale de la secuencia en el primer
    // byte de la letra: el corte tiene que volver a un límite de carácter.
    while corte < bytes.len() && !hist.is_char_boundary(corte) {
        corte += 1;
    }
    (corte, modos.preambulo())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tras(flujo: &[&[u8]]) -> Modos {
        let mut m = Modos::default();
        for t in flujo {
            m.alimentar(t);
        }
        m
    }

    /// Lo que manda Claude Code en su pantalla completa al arrancar, medido con
    /// la 2.1.269 en un ConPTY (`cargo test --lib fullscreen_en_conpty`).
    const ARRANQUE: &[u8] = b"\x1b[?1049h\x1b[2J\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?2004h\x1b[?1004h";

    #[test]
    fn lo_que_pide_claude_code_al_arrancar_vuelve_entero() {
        assert_eq!(
            tras(&[ARRANQUE]).preambulo(),
            "\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?1004h\x1b[?2004h"
        );
    }

    #[test]
    fn una_terminal_de_fabrica_no_necesita_preambulo() {
        assert_eq!(tras(&[b"hola\r\n\x1b[31mrojo\x1b[0m\x1b[H\x1b[2J"]).preambulo(), "");
    }

    #[test]
    fn al_salir_de_la_pantalla_alternativa_ya_no_se_pide() {
        let m = tras(&[ARRANQUE, b"...", b"\x1b[?1049l\x1b[?1003l\x1b[?1006l"]);
        assert_eq!(m.preambulo(), "\x1b[?1004h\x1b[?2004h");
    }

    #[test]
    fn una_secuencia_partida_entre_dos_lecturas_tambien_cuenta() {
        assert_eq!(tras(&[b"antes\x1b[?10", b"49h"]).preambulo(), "\x1b[?1049h");
        assert_eq!(tras(&[b"\x1b", b"[", b"?", b"2004", b"h"]).preambulo(), "\x1b[?2004h");
    }

    #[test]
    fn varios_modos_en_una_sola_orden() {
        assert_eq!(tras(&[b"\x1b[?1000;1006h"]).preambulo(), "\x1b[?1000h\x1b[?1006h");
    }

    #[test]
    fn el_cursor_oculto_y_el_ajuste_de_linea_se_cuentan_al_reves() {
        assert_eq!(tras(&[b"\x1b[?25l\x1b[?7l"]).preambulo(), "\x1b[?7l\x1b[?25l");
        assert_eq!(tras(&[b"\x1b[?25l\x1b[?7l\x1b[?25h\x1b[?7h"]).preambulo(), "");
    }

    #[test]
    fn dentro_de_un_titulo_lo_que_parece_una_orden_es_texto() {
        // Un agente puede poner lo que quiera en el título de la ventana, y el
        // final (BEL o ESC \) lo cierra sin dejar nada a medias.
        let m = tras(&[b"\x1b]0;mira [?1049h esto\x07", b"\x1b]2;[?2004h\x1b\\"]);
        assert_eq!(m.preambulo(), "");
        assert!(m.en_reposo());
    }

    #[test]
    fn un_esc_dentro_de_un_titulo_lo_corta_como_en_xterm() {
        // El parser de xterm (y el de cualquier VT) sale de la cadena en el ESC,
        // así que lo que viene detrás SÍ es una orden y la terminal la cumple.
        assert_eq!(tras(&[b"\x1b]0;titulo\x1b[?1049h"]).preambulo(), "\x1b[?1049h");
    }

    #[test]
    fn otros_modos_parecidos_no_se_confunden() {
        // `?104` no es nada, `>1049h` no es un modo privado, y `?1049$p` es
        // una PREGUNTA por el modo, no una orden.
        assert_eq!(tras(&[b"\x1b[?104h\x1b[>1049h\x1b[?1049$p\x1b[1049h"]).preambulo(), "");
    }

    #[test]
    fn el_reinicio_de_fabrica_lo_borra_todo() {
        assert_eq!(tras(&[ARRANQUE, b"\x1bc"]).preambulo(), "");
    }

    #[test]
    fn el_reinicio_suave_no_toca_ni_la_pantalla_ni_el_raton() {
        assert_eq!(tras(&[ARRANQUE, b"\x1b[!p"]).preambulo(), "\x1b[?1049h\x1b[?1003h\x1b[?1006h");
    }

    #[test]
    fn el_ultimo_protocolo_de_raton_es_el_que_vale() {
        assert_eq!(tras(&[b"\x1b[?1000h\x1b[?1003h"]).preambulo(), "\x1b[?1003h");
        assert_eq!(tras(&[b"\x1b[?1003h\x1b[?1000l"]).preambulo(), "");
    }

    #[test]
    fn cortar_no_parte_una_secuencia() {
        let hist = "linea\x1b[?1049hdentro";
        // Pedir el corte en mitad de `ESC[?1049h` lo lleva a justo después.
        let (corte, pre) = cortar(hist, 8);
        assert_eq!(&hist[corte..], "dentro");
        assert_eq!(pre, "\x1b[?1049h");
    }

    #[test]
    fn cortar_no_parte_un_caracter_ni_tras_un_esc() {
        // Un ESC suelto seguido de una tilde: la secuencia acaba en el primer
        // byte de la «é», y el corte tiene que saltar al siguiente carácter.
        let hist = "a\x1bé b";
        let (corte, _) = cortar(hist, 2);
        assert!(hist.is_char_boundary(corte));
        assert_eq!(&hist[corte..], " b");
    }

    #[test]
    fn cortar_al_principio_o_al_final_no_revienta() {
        assert_eq!(cortar("", 0), (0, String::new()));
        assert_eq!(cortar("abc", 99), (3, String::new()));
    }
}
