// Sacar una terminal fuera de Adeorq, a su propia ventana de Windows.
//
// ── DE DÓNDE SALE ESTO ──────────────────────────────────────────────────────
//
// Se lo preguntó a Munir un niño que fue a su casa: «¿por qué las terminales no
// se pueden coger y poner en otro sitio?». No había ningún motivo.
//
// ── LO QUE NO PASA AQUÍ, QUE ES LO IMPORTANTE ───────────────────────────────
//
// El agente NO se entera. Su proceso vive en `PtyState`, en Rust, y esto no lo
// toca: ni lo mata, ni lo relanza, ni lo mueve. Lo único que cambia de sitio es
// QUIÉN LO PINTA. Por eso sacar una terminal a la otra pantalla no cuesta ni un
// proceso, ni un token, ni el hilo de la conversación.
//
// Y por eso la ventana nace pidiendo dos cosas que ya existían en la casa:
// engancharse al PTY que ya está abierto (`pty_spawn` sale por la puerta de
// arriba cuando el id ya está en el mapa) y el historial de ese panel
// (`pty_historial`, que ya se guardaba para el MCP).
//
// ── POR QUÉ LLEVA MARCO DE WINDOWS ──────────────────────────────────────────
//
// Lo pidió así: «una ventana normal y corriente de Windows». Con el marco del
// sistema, mover, maximizar, cerrar, encajar en un lado o mandarla a la otra
// pantalla lo hace Windows, gratis y bien. Una ventana sin marco obliga a
// escribir todo eso a mano y a hacerlo peor.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// La etiqueta de la ventana de un panel. Tiene que ser estable: es lo que
/// permite que pedir dos veces la misma terminal no abra dos ventanas.
fn etiqueta(id: u32) -> String {
    format!("suelta-{id}")
}

/// El nombre del panel, listo para viajar dentro de una dirección.
///
/// A mano y sin traerse una crate para esto: lo que hay que cubrir son los
/// nombres que escribe una persona («Web · Layco», «Bugs & tests»), y ahí lo
/// único que rompe la dirección es el `&`, el espacio y los acentos. Se deja
/// pasar lo que la norma llama «no reservado» y todo lo demás va en hexadecimal
/// byte a byte, que es lo que hace el `encodeURIComponent` del otro lado.
fn para_url(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Saca el panel `id` a su propia ventana.
///
/// `x` e `y` son PÍXELES FÍSICOS de la pantalla, no los del navegador. En este
/// equipo hay tres monitores y uno va al 125 % (un 1920x1200 que Windows
/// presenta como 1536x960), así que mezclar las dos medidas colocaría la
/// ventana en otro sitio, o en otro monitor. Todo lo que cruza esta frontera va
/// en físico y se convierte una sola vez, arriba.
#[tauri::command]
pub async fn sacar_panel(
    app: AppHandle,
    id: u32,
    nombre: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
    ancho: Option<f64>,
    alto: Option<f64>,
) -> Result<(), String> {
    // El panel tiene que existir de verdad. Si no, se abriría una ventana con
    // una terminal muerta dentro y sin forma de saber por qué.
    {
        let state = app.state::<crate::pty::PtyState>();
        let map = state.0.lock().map_err(|_| "el mapa de terminales está roto")?;
        if !map.contains_key(&id) {
            return Err(format!("la terminal {id} ya no existe"));
        }
    }

    // Ya estaba fuera: se trae al frente en vez de abrir una segunda ventana
    // sobre la misma terminal, que es lo que duplicaría el teclado.
    if let Some(v) = app.get_webview_window(&etiqueta(id)) {
        let _ = v.unminimize();
        let _ = v.set_focus();
        return Ok(());
    }

    // ── Y AQUÍ LA PARTE QUE COSTÓ UNA TARDE ────────────────────────────────
    //
    // La ventana se construye EN EL HILO PRINCIPAL, no aquí.
    //
    // Este comando es `async`, así que corre en un hilo del runtime, no en el de
    // la ventana. Y en Windows una ventana pertenece al hilo que la crea: es ese
    // hilo el que tiene que bombear sus mensajes, y cuando el runtime da ese
    // hilo por terminado y lo recicla, la ventana se queda sin quien la atienda
    // y Windows se la lleva. Desde fuera se ve exactamente como lo contó Munir:
    // «se popea un segundo y se oculta» (2026-08-15). Y encaja con lo demás que
    // se midió ese día: la ventana no aparecía por ninguna parte —ni oculta, ni
    // minimizada, ni fuera de pantalla— y su evento de cierre no llegaba nunca,
    // porque no se cerró por la puerta buena: se murió con su hilo.
    //
    // `run_on_main_thread` la construye donde debe. El canal es para traerse el
    // resultado de vuelta, que si no esto no sabría si salió bien.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let app_h = app.clone();
    let nombre_h = nombre.clone();
    app.run_on_main_thread(move || {
        let mut b = WebviewWindowBuilder::new(
            &app_h,
            etiqueta(id),
            // La misma página que la ventana principal: es `main.tsx` quien mira
            // este parámetro y decide montar una sola terminal en vez de la app
            // entera. Un HTML aparte sería un segundo sitio donde arreglar cada
            // cosa de una terminal.
            // El nombre va codificado: lo escribe el usuario y puede llevar
            // espacios, tildes o un `&`, que partiría la dirección en dos.
            WebviewUrl::App(
                format!(
                    "index.html?suelta={id}&nombre={}",
                    para_url(nombre_h.as_deref().unwrap_or_default())
                )
                .into(),
            ),
        )
        .title(nombre_h.as_deref().unwrap_or("Adeorq"))
        .inner_size(ancho.unwrap_or(900.0), alto.unwrap_or(600.0))
        .min_inner_size(360.0, 240.0)
        // Con marco, que es lo que la hace «una ventana normal y corriente».
        .decorations(true)
        // Y SIN transparencia ni acrílico, al revés que la principal: una ventana
        // suelta se va a poner encima de un editor o de un navegador, y un fondo
        // translúcido sobre eso deja el texto de la terminal ilegible.
        .transparent(false)
        // Al frente y con el foco puesto. Sin esto puede nacer DETRÁS de Adeorq,
        // que suele estar maximizada, y entonces sacar una terminal se ve como que
        // la terminal ha desaparecido (Munir, 2026-08-14).
        .focused(true)
        .visible(true);

        if let (Some(x), Some(y)) = (x, y) {
            b = b.position(x, y);
        } else {
            b = b.center();
        }

        let salida = match b.build() {
            Ok(v) => {
                // Cuando esa ventana se cierre, la terminal tiene que VOLVER al
                // tablero, no desaparecer del mundo. Se avisa desde aquí y no
                // desde el front de la ventana suelta porque cerrarla con la X
                // de Windows no le da tiempo a ejecutar nada: para cuando React
                // se entera, ya no hay ventana.
                //
                // El aviso se emite a TODAS las ventanas, así que la principal
                // lo oye. La que se está muriendo también, y le da igual.
                let app2 = app_h.clone();
                v.on_window_event(move |e| {
                    // TODO lo que le pasa queda escrito, no solo su muerte: con
                    // un único evento vigilado no había forma de saber si se
                    // cerró por la puerta buena, si su página se cayó o si nunca
                    // llegó a pintarse.
                    let que = match e {
                        tauri::WindowEvent::CloseRequested { .. } => Some("le han pedido cerrarse"),
                        tauri::WindowEvent::Destroyed => Some("destruida"),
                        tauri::WindowEvent::Focused(true) => Some("tiene el foco"),
                        tauri::WindowEvent::Focused(false) => Some("ha perdido el foco"),
                        _ => None,
                    };
                    if let Some(que) = que {
                        crate::anotar(&format!("ventana suelta {id}: {que}"));
                    }
                    if matches!(e, tauri::WindowEvent::Destroyed) {
                        use tauri::Emitter;
                        let _ = app2.emit("suelta:vuelve", id);
                    }
                });
                // Y al frente del todo, por si el gestor de ventanas la dejó
                // detrás pese al `focused`. Falla en silencio: no tenerla
                // enfocada no impide usarla.
                let _ = v.set_focus();
                crate::anotar(&format!("terminal {id} sacada a su propia ventana"));
                Ok(())
            }
            Err(e) => Err(format!("no pude abrir la ventana: {e}")),
        };
        let _ = tx.send(salida);
    })
    .map_err(|e| format!("no pude pedirle la ventana al hilo principal: {e}"))?;

    // Diez segundos de espera como mucho. Si el hilo principal estuviera
    // atascado, es mejor un error que un botón que no contesta nunca.
    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "el hilo principal no contestó a tiempo".to_string())?
}

/// Lo que la ventana suelta necesita saber del panel que va a pintar.
///
/// Se le pregunta a Rust en vez de mandárselo en la dirección de la ventana
/// porque aquí está el dato de verdad: si la terminal se movió de carpeta o
/// arrancó con otro comando, esto lo sabe y una dirección escrita hace un rato
/// no. Lo único que viaja por la dirección es el nombre, que se lo inventa el
/// usuario y Rust no tiene por qué conocer.
#[derive(serde::Serialize)]
pub struct DatosPanel {
    pub cwd: String,
    pub command: Option<Vec<String>>,
}

#[tauri::command]
pub fn datos_panel(app: AppHandle, id: u32) -> Result<DatosPanel, String> {
    let state = app.state::<crate::pty::PtyState>();
    let map = state.0.lock().map_err(|_| "el mapa de terminales está roto")?;
    let s = map.get(&id).ok_or(format!("la terminal {id} ya no existe"))?;
    Ok(DatosPanel {
        cwd: s.cwd.clone(),
        command: s.command.clone(),
    })
}

/// Dónde está el ratón AHORA, en píxeles físicos de la pantalla.
///
/// Es lo que convierte «he arrastrado la cabecera hasta fuera» en una ventana
/// puesta justo ahí. Se pregunta a Windows y no al navegador a propósito: el
/// WebView solo sabe de su propia ventana y de sus píxeles escalados, así que
/// no puede decir si el ratón está sobre el segundo monitor ni en qué punto de
/// él.
#[tauri::command]
pub fn raton_en_pantalla(app: AppHandle) -> Result<(f64, f64), String> {
    let p = app.cursor_position().map_err(|e| e.to_string())?;
    Ok((p.x, p.y))
}

/// Devuelve la terminal a Adeorq: cierra su ventana suelta.
///
/// Cerrarla a mano con la X de Windows hace lo mismo, porque el front avisa al
/// desmontarse. Esto existe para el botón de dentro.
#[tauri::command]
pub fn devolver_panel(app: AppHandle, id: u32) -> Result<(), String> {
    if let Some(v) = app.get_webview_window(&etiqueta(id)) {
        v.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{etiqueta, para_url};

    /// La etiqueta es lo que impide abrir dos ventanas sobre la misma terminal,
    /// así que tiene que salir igual siempre y distinta por panel.
    #[test]
    fn la_etiqueta_es_estable_y_propia() {
        assert_eq!(etiqueta(3), etiqueta(3));
        assert_ne!(etiqueta(3), etiqueta(30));
    }

    /// Un nombre con `&` partiría la dirección en dos y la ventana nacería con
    /// medio nombre y un parámetro inventado. Es el caso por el que existe esto.
    #[test]
    fn el_ampersand_no_parte_la_direccion() {
        assert_eq!(para_url("Bugs & tests"), "Bugs%20%26%20tests");
    }

    /// Las tildes y los signos que Munir escribe de verdad en los nombres.
    #[test]
    fn las_tildes_viajan_enteras() {
        // La «ñ» son DOS bytes en UTF-8 y los dos tienen que salir escapados:
        // escapar por carácter en vez de por byte da una dirección que el otro
        // lado no sabe deshacer.
        assert_eq!(para_url("Diseño"), "Dise%C3%B1o");
        assert_eq!(para_url("Web · Layco"), "Web%20%C2%B7%20Layco");
    }

    /// Lo que no hace falta tocar, no se toca: una dirección llena de escapes
    /// innecesarios es más difícil de leer el día que algo falle.
    #[test]
    fn lo_llano_se_queda_llano() {
        assert_eq!(para_url("Layco-web_2.0~"), "Layco-web_2.0~");
        assert_eq!(para_url(""), "");
    }
}
