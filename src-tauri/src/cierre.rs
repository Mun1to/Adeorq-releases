// Qué pasa cuando se le da a la X de la ventana.
//
// Hasta el 2026-10-10 la X cerraba la app, y la app se llevaba por delante a
// sus agentes (`RunEvent::Exit` → `pty::kill_all`) sin preguntar. Munir pidió
// lo que hacen los programas que tienen algo que perder: un aviso al cerrar,
// con la opción de dejar a los agentes trabajando en segundo plano o cerrarlo
// todo, y poder dejar la respuesta fijada.
//
// «En segundo plano» NO saca las terminales a otro proceso (eso sigue aparcado
// en `docs/MEJORAS.md`, con su porqué): la ventana se ESCONDE y este proceso
// sigue vivo, con un icono en la bandeja del sistema para volver o para cerrar
// del todo. Los agentes son hijos de este proceso: mientras viva, viven.
//
// La decisión la toma la ventana (`components/AlCerrar.tsx`), que es quien
// sabe cuántos agentes trabajan y qué dejó elegido el usuario. Aquí solo se
// para el cierre, se le pregunta y se hace lo que conteste. Con un seguro: si
// la ventana no contesta a tiempo (colgada, o sin llegar a cargar), la X
// cierra igual. Una X que no cierra es peor que un aviso que no sale.
//
// Solo en Windows. En Linux la bandeja depende de una librería del escritorio
// que no está probada en el AppImage ni en el `.rpm`, así que allí la X cierra
// como siempre y `cierre_puede_fondo` contesta que no.

use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager, State};

/// El evento que oye la ventana principal.
pub const PEDIDO: &str = "cierre:pedido";

#[derive(Default)]
pub struct Cierre {
    /// Cuántas veces se ha pedido cerrar, y hasta cuál contestó la ventana.
    pedidos: AtomicU64,
    acusados: AtomicU64,
}

/// ¿Contestó la ventana al pedido número `n`? Suelto para poder probarlo.
fn contestado(estado: &Cierre, n: u64) -> bool {
    estado.acusados.load(Ordering::SeqCst) >= n
}

/// La X de la ventana principal. Devuelve si hay que PARAR el cierre porque
/// se lo ha preguntado a la ventana.
#[cfg(windows)]
pub fn al_pedir_cierre(app: &AppHandle) -> bool {
    use tauri::Emitter;
    /// Lo que se espera a la ventana. Contesta en milisegundos si está viva;
    /// segundo y medio es el margen de una ventana ocupada pintando.
    const ESPERA: std::time::Duration = std::time::Duration::from_millis(1500);

    let estado = app.state::<Cierre>();
    let n = estado.pedidos.fetch_add(1, Ordering::SeqCst) + 1;
    if app.emit(PEDIDO, ()).is_err() {
        return false;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ESPERA);
        if !contestado(&app.state::<Cierre>(), n) {
            crate::anotar("la ventana no contestó al pedido de cierre: se cierra igual");
            app.exit(0);
        }
    });
    true
}

#[cfg(not(windows))]
pub fn al_pedir_cierre(_app: &AppHandle) -> bool {
    false
}

/// La ventana dice «te oigo»: desde aquí decide ella y el seguro se retira.
#[tauri::command(async)]
pub fn cierre_acuse(estado: State<'_, Cierre>) {
    estado
        .acusados
        .store(estado.pedidos.load(Ordering::SeqCst), Ordering::SeqCst);
}

/// ¿Se puede seguir en segundo plano en este sistema?
#[tauri::command(async)]
pub fn cierre_puede_fondo() -> bool {
    cfg!(windows)
}

/// Cerrar de verdad: sale la app y con ella sus terminales.
#[tauri::command(async)]
pub fn cierre_salir(app: AppHandle) {
    app.exit(0);
}

/// Esconder la ventana y quedarse en la bandeja. Los textos vienen de la
/// ventana, que es la que sabe en qué idioma está la app.
#[tauri::command(async)]
pub fn cierre_a_fondo(app: AppHandle, abrir: String, salir: String, pista: String) -> Result<(), String> {
    a_fondo(&app, abrir, salir, pista)
}

/// Volver del segundo plano: la ventana delante y la bandeja, recogida.
#[tauri::command(async)]
pub fn cierre_volver(app: AppHandle) {
    volver(&app);
}

/// El nombre del icono de la bandeja, para encontrarlo y quitarlo.
#[cfg(windows)]
const BANDEJA: &str = "adeorq-fondo";

#[cfg(windows)]
fn a_fondo(app: &AppHandle, abrir: String, salir: String, pista: String) -> Result<(), String> {
    let ventana = app
        .get_webview_window("main")
        .ok_or("no encuentro la ventana principal")?;
    // El icono se crea en el hilo de la ventana: en Windows sus clics llegan
    // por la cola de mensajes del hilo que lo creó, y este comando corre en
    // uno del runtime que no tiene ninguna.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(poner_bandeja(&app2, &abrir, &salir, &pista));
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "la bandeja no contestó".to_string())??;
    // Primero el icono y luego esconder: si el icono falla, la ventana sigue a
    // la vista y no hay una app viva a la que no se pueda volver.
    ventana.hide().map_err(|e| e.to_string())?;
    crate::anotar("la ventana pasa a segundo plano: los agentes siguen");
    Ok(())
}

#[cfg(windows)]
fn poner_bandeja(app: &AppHandle, abrir: &str, salir: &str, pista: &str) -> Result<(), String> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    // Uno solo: si ya estaba (se escondió dos veces seguidas), se rehace con
    // los textos de ahora, que pueden venir en otro idioma.
    let _ = app.remove_tray_by_id(BANDEJA);
    let m_abrir = MenuItemBuilder::with_id("abrir", abrir).build(app).map_err(|e| e.to_string())?;
    let m_salir = MenuItemBuilder::with_id("salir", salir).build(app).map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(app)
        .item(&m_abrir)
        .separator()
        .item(&m_salir)
        .build()
        .map_err(|e| e.to_string())?;
    let mut bandeja = TrayIconBuilder::with_id(BANDEJA)
        .tooltip(pista)
        .menu(&menu)
        // El clic izquierdo trae la ventana; el menú es del derecho.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "abrir" => volver(app),
            "salir" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|icono, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                volver(icono.app_handle());
            }
        });
    if let Some(icono) = app.default_window_icon() {
        bandeja = bandeja.icon(icono.clone());
    }
    bandeja.build(app).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn a_fondo(_app: &AppHandle, _abrir: String, _salir: String, _pista: String) -> Result<(), String> {
    Err("en este sistema Adeorq no se queda en segundo plano".into())
}

/// Trae la ventana y recoge la bandeja. Lo llaman el icono, su menú, el
/// comando y abrir Adeorq otra vez (`single_instance`, en `lib.rs`).
pub fn volver(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("main") {
        let _ = v.unminimize();
        let _ = v.show();
        let _ = v.set_focus();
    }
    #[cfg(windows)]
    {
        // Quitarlo también va en el hilo de la ventana, que es donde nació.
        let app2 = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = app2.remove_tray_by_id(BANDEJA);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_seguro_solo_se_retira_si_la_ventana_contesto_a_ese_pedido() {
        let c = Cierre::default();
        // Primer pedido, nadie contesta: el seguro cierra.
        let n1 = c.pedidos.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(!contestado(&c, n1));
        // La ventana contesta: ese pedido queda en sus manos.
        c.acusados.store(c.pedidos.load(Ordering::SeqCst), Ordering::SeqCst);
        assert!(contestado(&c, n1));
        // Un segundo pedido (canceló el aviso y volvió a darle a la X) no
        // hereda el acuse del primero: si ahora la ventana está colgada, cierra.
        let n2 = c.pedidos.fetch_add(1, Ordering::SeqCst) + 1;
        assert!(!contestado(&c, n2));
    }
}
