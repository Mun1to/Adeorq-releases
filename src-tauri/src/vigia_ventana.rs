// La ventana que deja de contestar, dicha en el rastro.
//
// La página late cada dos segundos (`latido_ventana`, desde `src/lib/parones.ts`)
// y apunta ella misma sus parones largos. Pero si se queda colgada del todo no
// puede apuntar nada, así que aquí un hilo mira el latido: si una página que se
// estaba viendo lleva un rato sin latir, lo escribe, y al volver escribe cuánto
// estuvo parada. De paso mira si el hilo principal de la app contesta, porque
// las llamadas de la página pasan por él: sin eso, «la página no late» no
// distingue una página colgada de una app colgada (Munir, 2026-11-10, «se
// congela a veces Adeorq», con un rastro que no decía nada de ninguna de las dos).
//
// Y tres cosas más que con solo el latido se confundían con una página parada:
// el hilo principal que se para menos de quince segundos (nadie lo veía), el
// equipo entero parado (se tomaba por un portátil dormido y se borraba) y el
// proceso de la página que se cae o que WebView2 da por colgado.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

/// Sin latir esto, una página que se estaba viendo cuenta como parada. Largo a
/// propósito: lo corto ya lo apunta la propia página con lo que lo causó.
pub const UMBRAL: Duration = Duration::from_secs(15);
/// Cada cuánto mira el hilo.
const CADA: Duration = Duration::from_secs(2);
/// La sonda del hilo principal que tarda más que esto en atenderse es un parón
/// suyo, aunque no llegue a parar la página quince segundos.
const TARDE: Duration = Duration::from_secs(1);
/// Como mucho una línea de parón del hilo principal cada tanto, salvo que el
/// nuevo sea peor que el último escrito.
const ENTRE_APUNTES: Duration = Duration::from_secs(30);
/// El arranque no cuenta: crear la ventana tiene parado el hilo principal.
const ARRANQUE: Duration = Duration::from_secs(15);

static INICIO: OnceLock<Instant> = OnceLock::new();
/// Milisegundos desde el arranque del último latido; 0 mientras no ha latido nunca.
static LATIDO: AtomicU64 = AtomicU64::new(0);
/// Lo que dijo la página de sí misma en su último latido (`!document.hidden`).
static VISIBLE: AtomicBool = AtomicBool::new(false);
/// Lo que dice Windows de la ventana: delante de todo y sin minimizar. Lo apunta
/// el hilo principal, así que sigue al día aunque la página esté colgada.
static DELANTE: AtomicBool = AtomicBool::new(false);
/// Cuándo atendió el hilo principal la última sonda.
static PRINCIPAL: AtomicU64 = AtomicU64::new(0);
/// El mayor retraso de una sonda del hilo principal desde la última mirada.
static RETRASO: AtomicU64 = AtomicU64::new(0);
/// Sube cada vez que el equipo duerme o se para: una sonda pedida antes llega
/// tarde por eso y no por el hilo principal, así que no cuenta.
static TANDA: AtomicU64 = AtomicU64::new(0);

fn ahora_ms() -> u64 {
    (INICIO.get_or_init(Instant::now).elapsed().as_millis() as u64).max(1)
}

/// Si la ventana principal está delante de todo y sin minimizar. Con el foco
/// dentro del navegador de un panel (otro WebView, hijo de esta ventana) sigue
/// siendo esta la que está delante.
fn delante<R: Runtime>(w: &tauri::WebviewWindow<R>) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic};
        let Ok(h) = w.hwnd() else {
            return false;
        };
        let h = h.0 as usize;
        unsafe { GetForegroundWindow() as usize == h && IsIconic(h as _) == 0 }
    }
    #[cfg(not(windows))]
    {
        w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false)
    }
}

/// La página dice que sigue viva y si se la está viendo. Solo toca números en
/// memoria: ni disco ni esperas. Devuelve si la ventana está delante, que es lo
/// que la página no ve cuando el foco lo tiene el navegador de un panel.
#[tauri::command]
pub fn latido_ventana(window: tauri::WebviewWindow, visible: bool) -> bool {
    LATIDO.store(ahora_ms(), Ordering::Relaxed);
    VISIBLE.store(visible, Ordering::Relaxed);
    let d = delante(&window);
    DELANTE.store(d, Ordering::Relaxed);
    d
}

/// Lo que hay que escribir tras mirar.
#[derive(Debug, PartialEq)]
pub enum Aviso {
    /// La página lleva `segundos` sin latir; `principal_parado` dice si el hilo
    /// principal de la app tampoco contesta.
    Parada { segundos: u64, principal_parado: bool },
    /// Volvió a latir tras `segundos` parada.
    Vuelta { segundos: u64 },
    /// El hilo principal tardó `ms` en atender una sonda; `mas` parones suyos
    /// callados desde el último apunte, el mayor de `peor` ms.
    PrincipalTarde { ms: u64, mas: u32, peor: u64 },
    /// Parones del hilo principal que no llegó a contar ningún apunte.
    PrincipalCallados { veces: u32, peor: u64 },
    /// Entre dos miradas pasaron `segundos` sin que el equipo durmiera: estuvo
    /// parado entero, este hilo incluido.
    Equipo { segundos: u64 },
}

/// Lo que se ve en cada mirada. Todo en milisegundos desde el arranque.
#[derive(Clone, Copy, Default)]
pub struct Mirada {
    pub ahora: u64,
    pub latido: u64,
    /// Lo último que dijo la página: si la estaban viendo.
    pub pagina_visible: bool,
    /// Lo que dice Windows ahora: si la ventana está delante.
    pub delante: bool,
    pub principal: u64,
    /// El mayor retraso de una sonda del hilo principal desde la mirada anterior.
    pub retraso: u64,
    /// Cuánto de lo que pasó desde la mirada anterior estuvo el equipo dormido.
    /// Fuera de Windows no se sabe y va `None`.
    pub dormido: Option<u64>,
}

/// El estado del que mira. Puro: el reloj y los latidos se le pasan, para que
/// sus pruebas no tengan que esperar quince segundos de verdad.
#[derive(Default)]
pub struct Vigia {
    /// El último latido de antes de pararse, si está parada y ya se dijo.
    parada_desde: Option<u64>,
    /// Lo de antes de esto no cuenta: el equipo estuvo dormido.
    contar_desde: u64,
    ultima_mirada: Option<u64>,
    /// Cuándo se puso la ventana delante por última vez.
    delante_desde: u64,
    delante_antes: bool,
    /// Los parones del hilo principal: el último apunte y los callados.
    tarde_escrito: Option<(u64, u64)>,
    tarde_callados: u32,
    tarde_peor: u64,
}

impl Vigia {
    pub fn mirar(&mut self, m: Mirada) -> Vec<Aviso> {
        let mut avisos = vec![];
        let cada = CADA.as_millis() as u64;
        // Lo que pasó desde la mirada anterior. Si fue mucho más de lo que
        // tocaba, o el equipo se suspendió (un portátil cerrado, que no es una
        // página parada) o se paró entero, este hilo incluido.
        let mut retraso = m.retraso;
        if let Some(antes) = self.ultima_mirada {
            let hueco = m.ahora.saturating_sub(antes);
            // Sin saber cuánto durmió (fuera de Windows), un hueco grande se
            // toma por sueño.
            let durmio = m.dormido.is_some_and(|d| d >= 1000);
            if durmio || hueco > cada * 5 {
                // Solo con la página a la vista: con la tapa cerrada en espera
                // moderna, Windows congela las apps sin contarlo como sueño, y
                // eso no es un parón de nadie.
                if !durmio && m.dormido.is_some() && m.pagina_visible {
                    avisos.push(Aviso::Equipo { segundos: (hueco - cada) / 1000 });
                }
                self.contar_desde = m.ahora;
                retraso = 0;
            }
        }
        self.ultima_mirada = Some(m.ahora);

        // El hilo principal que llega tarde, aunque sea poco.
        let arranque = ARRANQUE.as_millis() as u64;
        if retraso >= TARDE.as_millis() as u64 && m.ahora >= arranque {
            let toca = match self.tarde_escrito {
                None => true,
                Some((cuando, cuanto)) => m.ahora.saturating_sub(cuando) >= ENTRE_APUNTES.as_millis() as u64 || retraso > cuanto,
            };
            if toca {
                avisos.push(Aviso::PrincipalTarde { ms: retraso, mas: self.tarde_callados, peor: self.tarde_peor });
                self.tarde_escrito = Some((m.ahora, retraso));
                self.tarde_callados = 0;
                self.tarde_peor = 0;
            } else {
                self.tarde_callados += 1;
                self.tarde_peor = self.tarde_peor.max(retraso);
            }
        } else if self.tarde_callados > 0 {
            if let Some((cuando, _)) = self.tarde_escrito {
                if m.ahora.saturating_sub(cuando) >= ENTRE_APUNTES.as_millis() as u64 {
                    avisos.push(Aviso::PrincipalCallados { veces: self.tarde_callados, peor: self.tarde_peor });
                    self.tarde_escrito = Some((m.ahora, self.tarde_peor));
                    self.tarde_callados = 0;
                    self.tarde_peor = 0;
                }
            }
        }

        // Se está viendo si lo dijo la página o, si se puso delante DESPUÉS de
        // su último latido, si lo dice Windows: una página que se cuelga tapada
        // ya no puede avisar de que la han destapado. Y al revés no: con la
        // ventana delante todo el rato y la página escondida (la pantalla
        // apagada), manda la página, que duerme sus relojes y late a ratos.
        if m.delante && !self.delante_antes {
            self.delante_desde = m.ahora;
        }
        self.delante_antes = m.delante;
        if m.latido == 0 {
            return avisos;
        }
        let por_windows = !m.pagina_visible && m.delante && self.delante_desde > m.latido;
        let visible = m.pagina_visible || por_windows;
        let mut desde = m.latido.max(self.contar_desde);
        if por_windows {
            desde = desde.max(self.delante_desde);
        }
        let sin_latir = m.ahora.saturating_sub(desde);
        match self.parada_desde {
            Some(antes) if m.latido > antes => {
                self.parada_desde = None;
                avisos.push(Aviso::Vuelta { segundos: (m.latido - antes) / 1000 });
            }
            Some(_) => {}
            None if visible && sin_latir >= UMBRAL.as_millis() as u64 => {
                self.parada_desde = Some(m.latido);
                avisos.push(Aviso::Parada {
                    segundos: sin_latir / 1000,
                    // Atendiendo, la última sonda es de hace un `CADA`: el hilo
                    // la apunta en cuanto se pide, y se mira tras dormir eso.
                    principal_parado: m.ahora.saturating_sub(m.principal.max(self.contar_desde)) > cada * 2,
                });
            }
            None => {}
        }
        avisos
    }

    /// Desde cuándo cuenta: cambia cuando el equipo durmió o se paró entero, y
    /// entonces las sondas del hilo principal pedidas antes ya no miden nada.
    pub fn contar_desde(&self) -> u64 {
        self.contar_desde
    }
}

/// Cuánto ha dormido el equipo en total desde que arrancó, en milisegundos:
/// lo que lleva el reloj de interrupciones que cuenta el sueño menos lo que
/// lleva el mismo reloj sin él (los dos documentados así por Microsoft, en
/// «Interrupt Time»).
#[cfg(windows)]
fn dormido_total() -> Option<u64> {
    use windows_sys::Win32::System::WindowsProgramming::{QueryInterruptTime, QueryUnbiasedInterruptTime};
    // Los dos en unidades de 100 ns.
    let mut con_sueno = 0u64;
    let mut sin_sueno = 0u64;
    unsafe { QueryInterruptTime(&mut con_sueno) };
    if unsafe { QueryUnbiasedInterruptTime(&mut sin_sueno) } == 0 {
        return None;
    }
    Some(con_sueno.saturating_sub(sin_sueno) / 10_000)
}
#[cfg(not(windows))]
fn dormido_total() -> Option<u64> {
    None
}

fn s(ms: u64) -> String {
    format!("{:.1} s", ms as f64 / 1000.0).replace('.', ",")
}

/// En la ventana de desarrollo, un punto de parada en DevTools para la página
/// igual que un cuelgue: se dice, para no perseguirlo como un fallo.
const DE_DESARROLLO: &str = if cfg!(debug_assertions) {
    " (en la ventana de desarrollo: un punto de parada de DevTools da lo mismo)"
} else {
    ""
};

fn escribir(aviso: Aviso) {
    let linea = match aviso {
        Aviso::Parada { segundos, principal_parado } => format!(
            "ventana: la página lleva {segundos} s sin contestar; el hilo principal de la app {}{DE_DESARROLLO}",
            if principal_parado {
                "TAMPOCO contesta, así que la parada es de la app (una orden de Tauri que no suelta el hilo), no de la página"
            } else {
                "sí contesta, así que la parada es de la página (su código o su dibujo)"
            }
        ),
        Aviso::Vuelta { segundos } => format!("ventana: la página volvió a contestar tras {segundos} s parada"),
        Aviso::PrincipalTarde { ms, mas, peor } => {
            let resto = if mas > 0 {
                format!(" · y {mas} {} más antes de este, el mayor de {}", if mas > 1 { "parones" } else { "parón" }, s(peor))
            } else {
                String::new()
            };
            format!(
                "ventana: el hilo principal de la app estuvo parado {} (una orden de Tauri que no suelta el hilo, o la propia ventana){resto}",
                s(ms)
            )
        }
        Aviso::PrincipalCallados { veces, peor } => format!(
            "ventana: el hilo principal de la app se paró {veces} {} más tras el último apunte, la mayor {}",
            if veces > 1 { "veces" } else { "vez" },
            s(peor)
        ),
        Aviso::Equipo { segundos } => format!(
            "ventana: el equipo entero estuvo parado unos {segundos} s sin dormirse (ni el vigía pudo mirar): no es cosa de Adeorq, es la máquina (memoria, disco o la gráfica)"
        ),
    };
    crate::anotar(&linea);
}

/// El hilo que mira, una vez al arrancar.
pub fn vigilar<R: Runtime>(app: AppHandle<R>) {
    let _ = ahora_ms();
    enganchar_caidas(&app);
    std::thread::Builder::new()
        .name("vigia-ventana".into())
        .spawn(move || {
            let mut vigia = Vigia::default();
            let mut dormido_antes = dormido_total();
            loop {
                // El hilo principal se apunta cuando le llega su turno: si está
                // parado, el número se queda viejo, y al soltarse dice cuánto
                // tardó en atender esta sonda.
                let pedida = ahora_ms();
                let tanda = TANDA.load(Ordering::Relaxed);
                let a = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let ahora = ahora_ms();
                    PRINCIPAL.store(ahora, Ordering::Relaxed);
                    if TANDA.load(Ordering::Relaxed) == tanda {
                        RETRASO.fetch_max(ahora.saturating_sub(pedida), Ordering::Relaxed);
                    }
                    if let Some(w) = a.get_webview_window("main") {
                        DELANTE.store(delante(&w), Ordering::Relaxed);
                    }
                });
                std::thread::sleep(CADA);
                let dormido_ahora = dormido_total();
                let dormido = match (dormido_antes, dormido_ahora) {
                    (Some(a), Some(b)) => Some(b.saturating_sub(a)),
                    _ => None,
                };
                dormido_antes = dormido_ahora;
                let desde = vigia.contar_desde();
                let avisos = vigia.mirar(Mirada {
                    ahora: ahora_ms(),
                    latido: LATIDO.load(Ordering::Relaxed),
                    pagina_visible: VISIBLE.load(Ordering::Relaxed),
                    delante: DELANTE.load(Ordering::Relaxed),
                    principal: PRINCIPAL.load(Ordering::Relaxed),
                    retraso: RETRASO.swap(0, Ordering::Relaxed),
                    dormido,
                });
                if vigia.contar_desde() != desde {
                    TANDA.fetch_add(1, Ordering::Relaxed);
                }
                for aviso in avisos {
                    escribir(aviso);
                }
            }
        })
        .ok();
}

/// Lo que WebView2 cuenta de sus procesos y Tauri no escucha: que se cayó el de
/// la página, el de gráficos o el del navegador, o que da la página por colgada
/// (no contesta a lo que se le teclea). Sin esto, una página muerta salía en el
/// rastro como «la página lleva N s sin contestar», igual que una colgada.
fn enganchar_caidas<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.with_webview(|pw| unsafe { caidas::enganchar(&pw.controller()) });
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
mod caidas {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{take_pwstr, ProcessFailedEventHandler};
    use windows::core::{Interface, PWSTR};

    pub fn que_proceso(tipo: COREWEBVIEW2_PROCESS_FAILED_KIND) -> &'static str {
        match tipo {
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => {
                "WebView2 da la página por colgada: no contesta a lo que se le teclea o se le pulsa"
            }
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => {
                "se cayó el proceso de la página: la ventana se queda en blanco o congelada hasta recargarla"
            }
            COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED => "se cayó el proceso de un marco de la página",
            COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED => {
                "se cayó el proceso de gráficos del WebView (se rehace solo; si se repite, la gráfica o su controlador)"
            }
            COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => {
                "se cayó el proceso principal del WebView: la ventana ya no pinta nada"
            }
            COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED => "se cayó un proceso auxiliar del WebView",
            _ => "se cayó otro proceso del WebView",
        }
    }

    pub fn por_que(r: COREWEBVIEW2_PROCESS_FAILED_REASON) -> &'static str {
        match r {
            COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE => "no contestaba",
            COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED => "lo mataron desde fuera",
            COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED => "se estrelló",
            COREWEBVIEW2_PROCESS_FAILED_REASON_LAUNCH_FAILED => "no pudo arrancar",
            COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY => "se quedó sin memoria",
            _ => "sin motivo conocido",
        }
    }

    pub unsafe fn enganchar(ctrl: &ICoreWebView2Controller) {
        let Ok(core) = ctrl.CoreWebView2() else {
            return;
        };
        let mut token = 0i64;
        let _ = core.add_ProcessFailed(
            &ProcessFailedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut tipo = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                args.ProcessFailedKind(&mut tipo)?;
                let mut detalle = String::new();
                if let Ok(a2) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
                    let mut r = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
                    let mut codigo = 0i32;
                    let mut nombre = PWSTR::null();
                    let _ = a2.Reason(&mut r);
                    let _ = a2.ExitCode(&mut codigo);
                    let _ = a2.ProcessDescription(&mut nombre);
                    let nombre = take_pwstr(nombre);
                    detalle = format!(
                        " ({}, código {codigo}{})",
                        por_que(r),
                        if nombre.is_empty() { String::new() } else { format!(", {nombre}") }
                    );
                }
                crate::anotar(&format!("ventana: {}{detalle}", que_proceso(tipo)));
                Ok(())
            })),
            &mut token,
        );
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const S: u64 = 1000;

    /// Una mirada de una ventana sana a los `t` segundos, que se cambia en cada prueba.
    fn sana(t: u64) -> Mirada {
        Mirada {
            ahora: t * S,
            latido: t * S - 500,
            pagina_visible: true,
            delante: true,
            principal: t * S - 2 * S,
            retraso: 5,
            dormido: Some(0),
        }
    }

    #[test]
    fn sin_latido_todavia_no_dice_nada() {
        let mut v = Vigia::default();
        assert_eq!(v.mirar(Mirada { latido: 0, ..sana(60) }), vec![]);
    }

    #[test]
    fn una_pagina_que_late_no_dice_nada() {
        let mut v = Vigia::default();
        for t in (2..120).step_by(2) {
            assert_eq!(v.mirar(sana(t)), vec![], "a los {t} s");
        }
    }

    #[test]
    fn parada_y_vuelta_se_dicen_una_vez_cada_una() {
        let mut v = Vigia::default();
        let mut avisos = vec![];
        // Late hasta el segundo 10, se para hasta el 47 y vuelve.
        for t in (2..70).step_by(2) {
            let latido = if t <= 10 { t * S } else if t < 48 { 10 * S } else { t * S };
            for a in v.mirar(Mirada { latido, ..sana(t) }) {
                avisos.push((t, a));
            }
        }
        assert_eq!(
            avisos,
            vec![
                (26, Aviso::Parada { segundos: 16, principal_parado: false }),
                (48, Aviso::Vuelta { segundos: 38 }),
            ]
        );
    }

    #[test]
    fn distingue_si_tampoco_contesta_el_hilo_principal() {
        let mut v = Vigia::default();
        for t in (2..12).step_by(2) {
            v.mirar(Mirada { latido: t * S, ..sana(t) });
        }
        // La última sonda que atendió fue la de dos segundos DESPUÉS del último
        // latido: con el umbral de quince, eso salía «sí contesta».
        let mut aviso = vec![];
        for t in (12..40).step_by(2) {
            aviso = v.mirar(Mirada { latido: 10 * S, principal: 12 * S, retraso: 0, ..sana(t) });
            if !aviso.is_empty() {
                break;
            }
        }
        assert_eq!(aviso, vec![Aviso::Parada { segundos: 16, principal_parado: true }]);
    }

    #[test]
    fn escondida_no_cuenta_como_parada() {
        let mut v = Vigia::default();
        v.mirar(Mirada { latido: 2 * S, pagina_visible: false, delante: false, ..sana(2) });
        for t in (4..200).step_by(2) {
            assert_eq!(v.mirar(Mirada { latido: 2 * S, pagina_visible: false, delante: false, ..sana(t) }), vec![], "a los {t} s");
        }
    }

    #[test]
    fn con_la_pantalla_apagada_manda_la_pagina() {
        // La ventana sigue delante, pero en el segundo 20 la página se escondió
        // (pantalla apagada) y sus relojes laten una vez por minuto: eso no es
        // una parada.
        let mut v = Vigia::default();
        for t in (2..20).step_by(2) {
            v.mirar(sana(t));
        }
        for t in (20..300).step_by(2) {
            let latido = 20 * S + ((t - 20) / 60) * 60 * S;
            assert_eq!(v.mirar(Mirada { latido, pagina_visible: false, ..sana(t) }), vec![], "a los {t} s");
        }
    }

    #[test]
    fn una_pagina_que_se_cuelga_tapada_se_apunta_al_destaparla() {
        let mut v = Vigia::default();
        // Tapada desde el segundo 10: dijo «escondida» en su último latido y
        // luego se colgó.
        for t in (2..10).step_by(2) {
            v.mirar(Mirada { latido: t * S, ..sana(t) });
        }
        let mut avisos = vec![];
        for t in (10..100).step_by(2) {
            let delante = t >= 60;
            for a in v.mirar(Mirada { latido: 10 * S, pagina_visible: false, delante, ..sana(t) }) {
                avisos.push((t, a));
            }
        }
        // Se puso delante en el 60: a los quince de eso, no a los cincuenta del latido.
        assert_eq!(avisos, vec![(76, Aviso::Parada { segundos: 16, principal_parado: false })]);
    }

    #[test]
    fn un_portatil_dormido_no_es_una_parada() {
        let mut v = Vigia::default();
        for t in (2..12).step_by(2) {
            v.mirar(Mirada { latido: t * S, ..sana(t) });
        }
        // Cerró la tapa en el segundo 10 y la abrió en el 3610: la primera mirada
        // de después ve una hora sin latir, pero no ha pasado nada.
        let despierta = Mirada { latido: 10 * S, principal: 10 * S, retraso: 3_600_000, dormido: Some(3_598_000), ..sana(3610) };
        assert_eq!(v.mirar(despierta), vec![]);
        assert_eq!(v.mirar(Mirada { latido: 3611 * S, ..sana(3612) }), vec![]);
    }

    #[test]
    fn el_equipo_entero_parado_se_dice_y_no_se_toma_por_sueno() {
        let mut v = Vigia::default();
        for t in (2..20).step_by(2) {
            v.mirar(sana(t));
        }
        // Del 18 al 48 ni este hilo pudo mirar, y el equipo no durmió.
        let avisos = v.mirar(Mirada { latido: 47 * S, retraso: 0, ..sana(48) });
        assert_eq!(avisos, vec![Aviso::Equipo { segundos: 28 }]);
    }

    #[test]
    fn la_tapa_cerrada_en_espera_moderna_no_es_el_equipo_parado() {
        // Windows congela la app con la tapa cerrada sin contarlo como sueño;
        // la página ya había dicho que se escondía.
        let mut v = Vigia::default();
        for t in (2..20).step_by(2) {
            v.mirar(sana(t));
        }
        let vuelta = Mirada { latido: 18 * S, pagina_visible: false, retraso: 0, ..sana(900) };
        assert_eq!(v.mirar(vuelta), vec![]);
    }

    #[test]
    fn un_paron_corto_del_hilo_principal_se_apunta() {
        let mut v = Vigia::default();
        for t in (2..20).step_by(2) {
            v.mirar(sana(t));
        }
        assert_eq!(
            v.mirar(Mirada { retraso: 4200, ..sana(20) }),
            vec![Aviso::PrincipalTarde { ms: 4200, mas: 0, peor: 0 }]
        );
        // Uno menor enseguida se calla; uno peor se escribe ya.
        assert_eq!(v.mirar(Mirada { retraso: 1500, ..sana(22) }), vec![]);
        assert_eq!(
            v.mirar(Mirada { retraso: 6000, ..sana(24) }),
            vec![Aviso::PrincipalTarde { ms: 6000, mas: 1, peor: 1500 }]
        );
        // Los callados que nadie cuenta salen solos pasado el plazo.
        assert_eq!(v.mirar(Mirada { retraso: 1200, ..sana(26) }), vec![]);
        let mut resto = vec![];
        for t in (28..70).step_by(2) {
            resto.extend(v.mirar(sana(t)));
        }
        assert_eq!(resto, vec![Aviso::PrincipalCallados { veces: 1, peor: 1200 }]);
    }

    /// Los dos relojes de Windows de verdad: despierto, entre dos lecturas no
    /// duerme nada.
    #[cfg(windows)]
    #[test]
    fn los_relojes_de_windows_no_ven_sueno_estando_despierto() {
        let a = dormido_total().expect("QueryUnbiasedInterruptTime contesta");
        std::thread::sleep(Duration::from_millis(300));
        let b = dormido_total().expect("QueryUnbiasedInterruptTime contesta");
        // Cada reloj avanza a saltos de un tic (hasta 16 ms): entre leer uno y
        // otro puede caer uno, hacia cualquiera de los dos lados.
        assert!((b as i64 - a as i64).abs() < 100, "durmió {} ms en 300 despierto", b as i64 - a as i64);
    }

    #[test]
    fn el_arranque_no_cuenta_para_el_hilo_principal() {
        let mut v = Vigia::default();
        assert_eq!(v.mirar(Mirada { retraso: 5000, ..sana(4) }), vec![]);
    }
}
