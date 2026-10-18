// Un navegador de verdad dentro de la ventana de Adeorq.
//
// ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
//
// El panel web era un iframe, y medio internet se niega a entrar en uno
// (github.com sale en blanco) y ahí no se inicia sesión en nada. Munir pidió
// «uno de verdad, que se abre a la derecha como un panel grande» y eligió el
// 2026-10-18, mirando maquetas, un Chromium DENTRO de Adeorq: WebView2, que es
// el motor de Edge y el mismo que ya pinta la interfaz.
//
// Aquí antes vivía otra cosa: meter la ventana de TU Brave con `SetParent`.
// Se quitó el 2026-08-29 tras tres reportes de lo mismo (la ventana se escapaba
// al escritorio) porque la técnica obligaba a adivinar cuál de las ventanas de
// Chromium era la nuestra. Esto no adivina nada: cada pestaña es un webview
// HIJO de la ventana principal (`Window::add_child`, feature `unstable` de
// Tauri), del mismo proceso, así que no hay ventana que pueda escaparse.
//
// ── LO QUE HAY QUE SABER ANTES DE TOCAR ESTO ────────────────────────────────
//
//  · NACE EN `about:blank` Y LUEGO NAVEGA. No es estética. Tauri le pone a cada
//    webview su protocolo `asset` (que sirve `%LOCALAPPDATA%\Adeorq\**`, donde
//    están las cuentas y los secretos) con un permiso CORS para el origen de su
//    PRIMERA dirección (`manager/webview.rs`, `window_origin`). Si naciera en
//    `https://github.com`, los scripts de github.com podrían leer esa carpeta.
//    Naciendo en blanco, el permiso queda para `http://about.localhost`, que no
//    es ninguna web. Lo fija la prueba de laboratorio de `docs/contexto/navegador.md`.
//  · Los protocolos de la app no se pueden quitar a un solo webview (son de la
//    app entera), así que `permitida` le cierra la puerta a sus direcciones
//    (`*.localhost` y, en desarrollo, el `devUrl`) y el front no arranca dentro
//    de él (`main.tsx`).
//  · Una web de aquí NO llega a los comandos de Adeorq: Tauri rechaza la IPC de
//    un origen remoto si ninguna capacidad lo nombra en `remote`, y ninguna lo
//    hace. Por eso los permisos de la interfaz van por `webviews` y no por
//    `windows` (`capabilities/default.json`): por ventana se extenderían a todos
//    sus webviews, también a este.
//  · Perfil PROPIO en `<datos>\navegador`: las sesiones que inicies aquí no se
//    mezclan con el almacén de la interfaz. Y con el filtro anti-phishing de
//    Microsoft (SmartScreen) encendido, que wry apaga de fábrica pensando en la
//    interfaz de una app y no en un navegador; como en Edge, eso le manda a
//    Microsoft las direcciones que visitas para comprobarlas.
//  · ESCONDER, NO CERRAR, mientras Adeorq siga abierta: en wry 0.57, cerrar un
//    webview hijo le quita a la ventana la escucha que redimensiona el webview
//    principal (su `Drop`). Una pestaña cerrada se esconde, vuelve a `about:blank`
//    y se reutiliza para la siguiente.
//  · Nada de lo que pinta la interfaz puede quedar ENCIMA: el webview hijo es una
//    ventana nativa por delante del DOM. El front lo resuelve como VS Code: foto
//    de la página (`nav_foto`) y esconderlo mientras un menú pisa su hueco. La
//    foto primero y luego esconder: WebView2 no fotografía lo que no se ve.
//  · Es de WINDOWS. En Linux, Tauri 2.12 no sabe colocar los webviews hijos (los
//    apila uno debajo de otro, tauri#10420); hasta que salga el arreglo
//    (wry#1745), `nav_disponible` dice que no y el panel sigue con el iframe.
//  · Las medidas que manda el front son píxeles de CSS, que aquí son lógicos:
//    Tauri los pasa a físicos con la escala de la ventana EN ESE MOMENTO, así que
//    al cambiar de monitor (uno de Munir va al 125 %) el front los vuelve a mandar.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

/// Dónde va la página, en píxeles de CSS relativos a la ventana.
#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Hueco {
    pub x: f64,
    pub y: f64,
    pub ancho: f64,
    pub alto: f64,
}

/// Lo que el panel necesita saber de una pestaña. Solo va lo que cambió.
#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    pub id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub titulo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cargando: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atras: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adelante: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icono: Option<String>,
    /// Por qué no cargó: `sin-respuesta` (la web no contesta), `certificado` o
    /// `fallo`. Una navegación cancelada (otra la sustituye) no es un error.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
}

const EV_ESTADO: &str = "nav-estado";
const EV_NUEVA: &str = "nav-nueva";
const EV_TECLA: &str = "nav-tecla";
const EV_SONDA: &str = "nav-sonda";

fn etiqueta(id: u32) -> String {
    format!("nav-{id}")
}

/// ¿Es una web de esta máquina? Solo ahí hay editor por clic: la sonda la sirve
/// el plugin de Vite de TU proyecto (`vite-plugin-adeorq`), y es lo único con
/// lo que el puente del editor acepta hablar.
pub fn es_local(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
}

/// Lo que la sonda manda, si de verdad es de la sonda: un objeto con su marca y
/// un `tipo`. El resto de mensajes de la página se ignoran.
pub fn de_la_sonda(json: &str) -> Option<serde_json::Value> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    (v.get("de")?.as_str()? == "adeorq-sonda" && v.get("tipo")?.is_string()).then_some(v)
}

/// La dirección por la que la sonda le habla a Adeorq desde el navegador de verdad.
/// `.invalid` no existe en ninguna parte: nunca sale a la red, la coge
/// `win::enganchar` antes de que salga y contesta él.
pub const SONDA_URL: &str = "https://adeorq-sonda.invalid/";

/// Lo que la sonda manda por `SONDA_URL`, si viene de una web de esta máquina.
///
/// El `Referer` es lo que dice QUIÉN lo manda, y una página no lo puede falsear:
/// sin él, un iframe de otra web metido en tu localhost (un vídeo, un widget)
/// podría mandar recados en nombre de la sonda. Si no viene, no pasa.
pub fn de_la_sonda_por_url(uri: &str, referer: Option<&str>) -> Option<serde_json::Value> {
    if !uri.starts_with(SONDA_URL) {
        return None;
    }
    let quien: tauri::Url = referer?.parse().ok()?;
    if !es_local(&quien) {
        return None;
    }
    let u: tauri::Url = uri.parse().ok()?;
    let (_, datos) = u.query_pairs().find(|(k, _)| k == "d")?;
    de_la_sonda(&datos)
}

/// El JavaScript que le entrega un recado a la sonda como si llegara del iframe
/// de siempre: un `message` con la página como origen (sin iframe, la página es
/// su propio `parent`, que es lo que la sonda comprueba). El recado va
/// serializado por serde, así que no hay forma de que cierre la cadena.
pub fn recado_js(mensaje: &serde_json::Value) -> Option<String> {
    let mut m = mensaje.as_object()?.clone();
    m.insert("de".into(), "adeorq".into());
    let datos = serde_json::to_string(&m).ok()?;
    Some(format!(
        "window.dispatchEvent(new MessageEvent('message',{{data:{datos},source:window}}))"
    ))
}

fn avisar<S: Serialize + Clone>(app: &AppHandle, evento: &str, carga: S) {
    // Solo a la interfaz: los demás webviews (las pestañas) no tienen por qué
    // enterarse de lo que pasa en las otras.
    let _ = app.emit_to(EventTarget::webview("main"), evento, carga);
}

/// ¿Puede ir el navegador a esta dirección?
///
/// Solo webs (`http`, `https`) y la página en blanco. Fuera las direcciones con
/// las que Tauri sirve la propia app en Windows (`http://tauri.localhost`,
/// `asset.localhost`, `ipc.localhost`…: cualquier `*.localhost` que no sea
/// `localhost` a secas) y, en desarrollo, el `devUrl`, que es la interfaz de
/// Adeorq servida por Vite: una pestaña con la propia app dentro tendría sus
/// mismos permisos. `localhost:<puerto>` sí entra, que es donde viven las webs
/// que estás construyendo (en una build de release, el 1420 es de tus proyectos
/// Tauri, no de Adeorq).
pub fn permitida(url: &tauri::Url) -> bool {
    match url.scheme() {
        "about" => return url.as_str() == "about:blank",
        "http" | "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    if host.ends_with(".localhost") {
        return false;
    }
    if cfg!(debug_assertions) {
        let puerto = url.port_or_known_default();
        let local = host == "localhost" || host == "127.0.0.1" || host == "[::1]";
        if local && puerto == Some(1420) {
            return false;
        }
    }
    true
}

/// Lo que se le pide a una dirección escrita a mano antes de abrirla.
fn leer(url: &str) -> Result<tauri::Url, String> {
    let u: tauri::Url = url
        .trim()
        .parse()
        .map_err(|e| format!("«{url}» no es una dirección: {e}"))?;
    if !permitida(&u) {
        return Err(format!("el navegador de Adeorq no abre «{u}»"));
    }
    Ok(u)
}

/// ¿Hay navegador de verdad en este sistema? Si no, el panel usa el iframe.
#[tauri::command]
pub fn nav_disponible() -> bool {
    cfg!(windows)
        && modo_nativo(
            std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some(),
            std::env::var_os("ADEORQ_NAVEGADOR_LABORATORIO").is_some(),
        )
}

/// Con `WEBVIEW2_USER_DATA_FOLDER` puesto (algunos equipos de empresa, y los
/// laboratorios para no tocar la Adeorq instalada), WebView2 mete TODOS los
/// webviews del proceso en esa carpeta, y dos webviews en la misma carpeta
/// tienen que llevar las mismas opciones o el segundo no nace
/// (`ERROR_INVALID_STATE`, medido). La pestaña tendría que llevar las de la
/// interfaz, y entre ellas `--use-fake-ui-for-media-stream`: cualquier web se
/// llevaba el micrófono sin preguntar (medido; un oyente de permisos no llega a
/// tiempo, Chromium acepta antes). Así que ahí no hay pestañas nativas: van en
/// iframe. Solo los laboratorios, que lo piden con su propia variable, usan
/// pestañas nativas con el perfil compartido.
pub fn modo_nativo(carpeta_forzada: bool, laboratorio: bool) -> bool {
    !carpeta_forzada || laboratorio
}

/// Abre `url` en la pestaña `id`, creándola si no existe, y la pone en su hueco.
///
/// `async` por obligación: `add_child` se bloquea en Windows si se llama desde
/// un comando síncrono (está en la documentación de Tauri, wry#583).
#[tauri::command(async)]
pub fn nav_abrir(app: AppHandle, id: u32, url: String, hueco: Hueco) -> Result<(), String> {
    if !nav_disponible() {
        return Err("aquí el navegador va en iframe (ver `modo_nativo`)".into());
    }
    let destino = leer(&url)?;
    let w = match app.get_webview(&etiqueta(id)) {
        Some(w) => w,
        None => crear(&app, id, hueco)?,
    };
    colocar(&w, hueco)?;
    w.show().map_err(|e| e.to_string())?;
    w.navigate(destino).map_err(|e| e.to_string())
}

/// Moverla, estirarla o esconderla. Se llama al cambiar el hueco del panel, al
/// cambiar de pestaña o de vista, y cuando algo de la interfaz pisa la página.
#[tauri::command(async)]
pub fn nav_colocar(app: AppHandle, id: u32, hueco: Hueco, visible: bool) -> Result<(), String> {
    let Some(w) = app.get_webview(&etiqueta(id)) else {
        return Ok(());
    };
    if visible {
        colocar(&w, hueco)?;
        w.show().map_err(|e| e.to_string())
    } else {
        w.hide().map_err(|e| e.to_string())
    }
}

/// Ir a otra dirección en una pestaña que ya existe.
#[tauri::command(async)]
pub fn nav_ir(app: AppHandle, id: u32, url: String) -> Result<(), String> {
    let destino = leer(&url)?;
    let w = app
        .get_webview(&etiqueta(id))
        .ok_or("esa pestaña no existe")?;
    w.navigate(destino).map_err(|e| e.to_string())
}

/// Atrás, adelante, recargar o parar.
#[tauri::command(async)]
pub fn nav_accion(app: AppHandle, id: u32, accion: String) -> Result<(), String> {
    let w = app
        .get_webview(&etiqueta(id))
        .ok_or("esa pestaña no existe")?;
    #[cfg(windows)]
    {
        w.with_webview(move |pw| unsafe {
            let Ok(core) = pw.controller().CoreWebView2() else {
                return;
            };
            let _ = match accion.as_str() {
                "atras" => core.GoBack(),
                "adelante" => core.GoForward(),
                "recargar" => core.Reload(),
                "parar" => core.Stop(),
                _ => Ok(()),
            };
        })
        .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (w, accion);
        Err("el navegador de verdad solo existe en Windows".into())
    }
}

/// Devolverle el foco a la interfaz desde la página: Ctrl+L con la página
/// enfocada, o un atajo de Adeorq. El front no puede hacerlo solo, porque
/// `set_webview_focus` no está entre sus permisos (`core:default`).
#[tauri::command(async)]
pub fn nav_foco_interfaz(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview("main").ok_or("no encuentro la interfaz")?;
    w.set_focus().map_err(|e| e.to_string())
}

/// Dar el foco a la página (al pulsar en su hueco desde la interfaz).
#[tauri::command(async)]
pub fn nav_foco(app: AppHandle, id: u32) -> Result<(), String> {
    let w = app
        .get_webview(&etiqueta(id))
        .ok_or("esa pestaña no existe")?;
    w.set_focus().map_err(|e| e.to_string())
}

/// Una foto de la página, para ponerla en su sitio mientras está escondida.
///
/// Devuelve un `data:` JPEG. Se pide con el protocolo de depuración del propio
/// WebView2 (`Page.captureScreenshot`), que da la imagen ya en base64.
#[tauri::command(async)]
pub fn nav_foto(app: AppHandle, id: u32) -> Result<String, String> {
    let w = app
        .get_webview(&etiqueta(id))
        .ok_or("esa pestaña no existe")?;
    #[cfg(windows)]
    {
        use std::sync::mpsc;
        let (tx, rx) = mpsc::channel::<Result<String, String>>();
        w.with_webview(move |pw| unsafe { win::foto(&pw.controller(), tx) })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|_| "la página no dio su foto a tiempo".to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = w;
        Err("el navegador de verdad solo existe en Windows".into())
    }
}

/// Cerrar la pestaña: se esconde y vuelve a la página en blanco. Ver la
/// cabecera: cerrar el webview de verdad rompería el redimensionado de la
/// ventana, así que se queda para la próxima pestaña con ese número.
#[tauri::command(async)]
pub fn nav_cerrar(app: AppHandle, id: u32) -> Result<(), String> {
    let Some(w) = app.get_webview(&etiqueta(id)) else {
        return Ok(());
    };
    w.hide().map_err(|e| e.to_string())?;
    w.navigate("about:blank".parse().expect("about:blank es una dirección"))
        .map_err(|e| e.to_string())
}

/// Un recado del editor por clic para la sonda de la página (la otra mitad del
/// puente está en `win::enganchar`, que trae lo que la sonda contesta).
///
/// Solo si lo que hay ahora en la pestaña es una web de esta máquina: si la
/// pestaña ya navegó a otra parte, el recado no sale. Es un evento DENTRO de la
/// página, no un permiso: la página no gana acceso a ningún comando de Adeorq.
#[tauri::command(async)]
pub fn nav_a_la_pagina(app: AppHandle, id: u32, mensaje: serde_json::Value) -> Result<(), String> {
    let w = app
        .get_webview(&etiqueta(id))
        .ok_or("esa pestaña no existe")?;
    let url = w.url().map_err(|e| e.to_string())?;
    if !es_local(&url) {
        return Err("el editor por clic solo habla con webs de esta máquina".into());
    }
    let js = recado_js(&mensaje).ok_or("el recado tiene que ser un objeto")?;
    w.eval(js).map_err(|e| e.to_string())
}

fn colocar(w: &tauri::Webview, h: Hueco) -> Result<(), String> {
    w.set_bounds(tauri::Rect {
        position: tauri::LogicalPosition::new(h.x, h.y).into(),
        size: tauri::LogicalSize::new(h.ancho.max(1.0), h.alto.max(1.0)).into(),
    })
    .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn crear(app: &AppHandle, id: u32, h: Hueco) -> Result<tauri::Webview, String> {
    use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};

    let ventana = app
        .get_window("main")
        .ok_or("no encuentro la ventana principal")?;

    let a_titulo = app.clone();
    let a_carga = app.clone();
    let a_nueva = app.clone();
    let mut builder = WebviewBuilder::new(
        etiqueta(id),
        tauri::WebviewUrl::External("about:blank".parse().expect("about:blank es una dirección")),
    );
    /* Perfil propio y SmartScreen. Con la carpeta de WebView2 forzada solo se
    llega aquí desde un laboratorio (`modo_nativo`), y entonces la pestaña tiene
    que llevar los argumentos de la interfaz o no nace. */
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        builder = builder.additional_browser_args(&args_de_la_interfaz(app));
    } else {
        builder = builder
            .data_directory(crate::dir_datos_creado()?.join("navegador"))
            // Los dos primeros son los que wry pone de fábrica; el tercero que
            // pone (`msSmartScreenProtection`) se queda fuera: ver la cabecera.
            .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI");
    }
    let builder = builder
        .on_navigation(permitida)
        .on_document_title_changed(move |_w, titulo| {
            avisar(
                &a_titulo,
                EV_ESTADO,
                Estado {
                    id,
                    titulo: Some(titulo),
                    ..Default::default()
                },
            );
        })
        .on_page_load(move |_w, p| {
            let cargando = matches!(p.event(), PageLoadEvent::Started);
            avisar(
                &a_carga,
                EV_ESTADO,
                Estado {
                    id,
                    cargando: Some(cargando),
                    ..Default::default()
                },
            );
        })
        // Lo que una web quiere abrir en ventana nueva (`target=_blank`,
        // `window.open`) se abre como pestaña del panel. Una ventana de verdad sí
        // sería algo que se va al escritorio.
        .on_new_window(move |url, _| {
            if permitida(&url) {
                avisar(
                    &a_nueva,
                    EV_NUEVA,
                    serde_json::json!({ "id": id, "url": url.as_str() }),
                );
            }
            NewWindowResponse::Deny
        })
        .focused(false);

    let w = ventana
        .add_child(
            builder,
            tauri::LogicalPosition::new(h.x, h.y),
            tauri::LogicalSize::new(h.ancho.max(1.0), h.alto.max(1.0)),
        )
        .map_err(|e| e.to_string())?;
    let app2 = app.clone();
    w.with_webview(move |pw| unsafe { win::enganchar(app2, id, &pw.controller()) })
        .map_err(|e| e.to_string())?;
    Ok(w)
}

/// Los argumentos con los que nació el webview de la interfaz: los de
/// `tauri.conf.json` o, si no hay, los que wry pone de fábrica.
#[cfg(windows)]
fn args_de_la_interfaz(app: &AppHandle) -> String {
    app.config()
        .app
        .windows
        .first()
        .and_then(|w| w.additional_browser_args.clone())
        .unwrap_or_else(|| "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".into())
}

#[cfg(not(windows))]
fn crear(_app: &AppHandle, _id: u32, _h: Hueco) -> Result<tauri::Webview, String> {
    Err("el navegador de verdad solo existe en Windows".into())
}

/* ── Lo que solo da WebView2 ────────────────────────────────────────────── */

#[cfg(windows)]
mod win {
    use super::{avisar, de_la_sonda_por_url, Estado, EV_ESTADO, EV_SONDA, EV_TECLA, SONDA_URL};
    use std::sync::mpsc::Sender;
    use tauri::AppHandle;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{
        take_pwstr, AcceleratorKeyPressedEventHandler, CallDevToolsProtocolMethodCompletedHandler,
        FaviconChangedEventHandler, HistoryChangedEventHandler, NavigationCompletedEventHandler,
        SourceChangedEventHandler, WebResourceRequestedEventHandler,
    };
    use windows::core::{w, Interface, BOOL, HSTRING, PWSTR};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_MENU, VK_SHIFT};

    /// Lo que Tauri no cuenta: la dirección cuando cambia sin recargar (GitHub
    /// navega así), si hay atrás y adelante, el icono, las teclas de Adeorq y
    /// lo que dice la sonda del editor por clic.
    pub unsafe fn enganchar(app: AppHandle, id: u32, ctrl: &ICoreWebView2Controller) {
        let Ok(core) = ctrl.CoreWebView2() else {
            return;
        };
        let mut token = 0i64;

        // El editor por clic: sin iframe, la sonda de tu web (`vite-plugin-adeorq/sonda.js`)
        // habla pidiendo `SONDA_URL`, y aquí se coge esa petición antes de que salga.
        //
        // Antes iba por `chrome.webview.postMessage`, y tenía dos pegas medidas el
        // 2026-10-18: como objeto no llegaba nunca (el oyente de wry falla con los
        // objetos y WebView2 corta ahí la cadena), y como texto lo leía también la IPC
        // de Tauri, que dejaba un `console.error` en la consola de tu web por cada
        // mensaje. El oyente de peticiones de wry devuelve `Ok` con lo que no es suyo,
        // así que este sí corre. Solo pasa lo que viene de una web de esta máquina (su
        // `Referer`) y con la marca de la sonda.
        let a = app.clone();
        let _ = core.AddWebResourceRequestedFilter(
            &HSTRING::from(format!("{SONDA_URL}*")),
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
        );
        let _ = core.add_WebResourceRequested(
            &WebResourceRequestedEventHandler::create(Box::new(move |wv, args| {
                let (Some(wv), Some(args)) = (wv, args) else {
                    return Ok(());
                };
                let peticion = args.Request()?;
                let mut uri = PWSTR::null();
                peticion.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                if !uri.starts_with(SONDA_URL) {
                    return Ok(());
                }
                let cabeceras = peticion.Headers()?;
                let mut hay = BOOL(0);
                cabeceras.Contains(w!("Referer"), &mut hay)?;
                let referer = if hay.as_bool() {
                    let mut v = PWSTR::null();
                    cabeceras.GetHeader(w!("Referer"), &mut v)?;
                    Some(take_pwstr(v))
                } else {
                    None
                };
                if let Some(mensaje) = de_la_sonda_por_url(&uri, referer.as_deref()) {
                    avisar(
                        &a,
                        EV_SONDA,
                        serde_json::json!({ "id": id, "mensaje": mensaje }),
                    );
                }
                // Siempre una respuesta vacía: lo que no es de la sonda tampoco sale a la red.
                let env = wv.cast::<ICoreWebView2_2>()?.Environment()?;
                let vacia = env.CreateWebResourceResponse(
                    None,
                    204,
                    &HSTRING::from("No Content"),
                    &HSTRING::new(),
                )?;
                args.SetResponse(&vacia)?;
                Ok(())
            })),
            &mut token,
        );

        let a = app.clone();
        let _ = core.add_SourceChanged(
            &SourceChangedEventHandler::create(Box::new(move |wv, _| {
                if let Some(wv) = wv {
                    let mut s = PWSTR::null();
                    wv.Source(&mut s)?;
                    avisar(
                        &a,
                        EV_ESTADO,
                        Estado {
                            id,
                            url: Some(take_pwstr(s)),
                            ..Default::default()
                        },
                    );
                }
                Ok(())
            })),
            &mut token,
        );

        let a = app.clone();
        let _ = core.add_HistoryChanged(
            &HistoryChangedEventHandler::create(Box::new(move |wv, _| {
                if let Some(wv) = wv {
                    let (mut atras, mut adelante) = (BOOL(0), BOOL(0));
                    wv.CanGoBack(&mut atras)?;
                    wv.CanGoForward(&mut adelante)?;
                    avisar(
                        &a,
                        EV_ESTADO,
                        Estado {
                            id,
                            atras: Some(atras.as_bool()),
                            adelante: Some(adelante.as_bool()),
                            ..Default::default()
                        },
                    );
                }
                Ok(())
            })),
            &mut token,
        );

        // Si no cargó, por qué: con eso el panel dice «esta web no contesta» en
        // vez de dejarte delante de la página de error de Edge sin más.
        let a = app.clone();
        let _ = core.add_NavigationCompleted(
            &NavigationCompletedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut bien = BOOL(0);
                args.IsSuccess(&mut bien)?;
                // Si el servidor contestó (un 404, el 429 del captcha de Google), la
                // página está ahí con lo suyo, como en cualquier navegador: no es un
                // fallo. WebView2 lo da como `IsSuccess` falso y estado desconocido, y
                // salía «esta página no ha podido cargar» encima (medido el 2026-10-18).
                let mut codigo = 0i32;
                if let Ok(a2) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>() {
                    let _ = a2.HttpStatusCode(&mut codigo);
                }
                if !bien.as_bool() && codigo == 0 {
                    let mut estado = COREWEBVIEW2_WEB_ERROR_STATUS::default();
                    args.WebErrorStatus(&mut estado)?;
                    if let Some(error) = error_de(estado) {
                        avisar(
                            &a,
                            EV_ESTADO,
                            Estado {
                                id,
                                error: Some(error),
                                ..Default::default()
                            },
                        );
                    }
                }
                Ok(())
            })),
            &mut token,
        );

        if let Ok(c15) = core.cast::<ICoreWebView2_15>() {
            let a = app.clone();
            let _ = c15.add_FaviconChanged(
                &FaviconChangedEventHandler::create(Box::new(move |wv, _| {
                    if let Some(wv) = wv.and_then(|w| w.cast::<ICoreWebView2_15>().ok()) {
                        let mut s = PWSTR::null();
                        wv.FaviconUri(&mut s)?;
                        let icono = take_pwstr(s);
                        avisar(
                            &a,
                            EV_ESTADO,
                            Estado {
                                id,
                                icono: Some(icono),
                                ..Default::default()
                            },
                        );
                    }
                    Ok(())
                })),
                &mut token,
            );
        }

        let a = app;
        let _ = ctrl.add_AcceleratorKeyPressed(
            &AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut tipo = COREWEBVIEW2_KEY_EVENT_KIND::default();
                args.KeyEventKind(&mut tipo)?;
                if tipo != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
                    return Ok(());
                }
                let mut vk = 0u32;
                args.VirtualKey(&mut vk)?;
                let pulsada = |k: u16| GetKeyState(k as i32) < 0;
                let tecla = super::tecla_de_adeorq(
                    vk,
                    pulsada(VK_CONTROL.0),
                    pulsada(VK_SHIFT.0),
                    pulsada(VK_MENU.0),
                );
                if let Some(tecla) = tecla {
                    args.SetHandled(true)?;
                    avisar(
                        &a,
                        EV_TECLA,
                        serde_json::json!({ "id": id, "tecla": tecla }),
                    );
                }
                Ok(())
            })),
            &mut token,
        );
    }

    /// Cómo se cuenta un fallo de navegación. Cancelada no es fallo: pasa cada
    /// vez que una navegación sustituye a otra (pulsar un enlace mientras carga).
    pub fn error_de(s: COREWEBVIEW2_WEB_ERROR_STATUS) -> Option<&'static str> {
        match s {
            COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED => None,
            COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_COMMON_NAME_IS_INCORRECT
            | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED
            | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_REVOKED
            | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_IS_INVALID
            | COREWEBVIEW2_WEB_ERROR_STATUS_CLIENT_CERTIFICATE_CONTAINS_ERRORS => {
                Some("certificado")
            }
            COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE
            | COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT
            | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED
            | COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET
            | COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED
            | COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT
            | COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED => Some("sin-respuesta"),
            _ => Some("fallo"),
        }
    }

    pub unsafe fn foto(ctrl: &ICoreWebView2Controller, tx: Sender<Result<String, String>>) {
        let core = match ctrl.CoreWebView2() {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
                return;
            }
        };
        let tx2 = tx.clone();
        let hecho =
            CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |res, json| {
                let r = res.map_err(|e| e.to_string()).and_then(|_| {
                    let v: serde_json::Value =
                        serde_json::from_str(&json).map_err(|e| e.to_string())?;
                    let datos = v["data"].as_str().ok_or("la foto vino sin imagen")?;
                    Ok(format!("data:image/jpeg;base64,{datos}"))
                });
                let _ = tx2.send(r);
                Ok(())
            }));
        if let Err(e) = core.CallDevToolsProtocolMethod(
            w!("Page.captureScreenshot"),
            w!(r#"{"format":"jpeg","quality":82}"#),
            &hecho,
        ) {
            let _ = tx.send(Err(e.to_string()));
        }
    }
}

/// Las teclas que, con el foco en la página, son de Adeorq y no de la web.
///
/// Las de un navegador (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+Tab) y los atajos globales
/// de la app, que son todos Ctrl+Mayús (`lib/atajosGlobales.ts`): sin esto, con
/// la página enfocada no llegarían nunca, porque la página es otro webview.
/// F5, Ctrl+R, Alt+flechas y el resto los atiende el propio Chromium.
pub fn tecla_de_adeorq(vk: u32, ctrl: bool, mayus: bool, alt: bool) -> Option<&'static str> {
    if !ctrl || alt {
        return None;
    }
    const TAB: u32 = 0x09;
    const ABAJO: u32 = 0x28;
    const DERECHA: u32 = 0x27;
    if vk == TAB {
        return Some(if mayus {
            "pestana-anterior"
        } else {
            "pestana-siguiente"
        });
    }
    if mayus {
        return match vk {
            ABAJO => Some("ctrl-mayus-abajo"),
            DERECHA => Some("ctrl-mayus-derecha"),
            // D F A M P E T, los de `atajosGlobales.ts`.
            0x44 => Some("ctrl-mayus-d"),
            0x46 => Some("ctrl-mayus-f"),
            0x41 => Some("ctrl-mayus-a"),
            0x4D => Some("ctrl-mayus-m"),
            0x50 => Some("ctrl-mayus-p"),
            0x45 => Some("ctrl-mayus-e"),
            0x54 => Some("ctrl-mayus-t"),
            _ => None,
        };
    }
    match vk {
        0x54 => Some("nueva-pestana"),
        0x57 => Some("cerrar-pestana"),
        0x4C => Some("direccion"),
        _ => None,
    }
}

/// ¿Hay alguien escuchando en ese puerto de esta máquina?
///
/// Es la mitad que le falta al cazador de localhost del front
/// (`src/lib/puertos.ts`). Encontrar `http://localhost:3000` en la salida de
/// una terminal NO significa que ahí haya un servidor: un agente escribe esa
/// dirección en su respuesta todo el rato, y abrir una pestaña cada vez sería
/// un castigo. Preguntándole al puerto, la prosa se cae sola y solo queda lo
/// que de verdad está levantado.
///
/// Se prueba con IPv4 y con IPv6, porque un servidor que se anuncia como
/// `localhost` puede estar escuchando solo en `::1` (Node lo hace desde la 17)
/// o solo en `127.0.0.1`. Probar una sola de las dos deja fuera la mitad de los
/// servidores por un detalle que el usuario no tiene por qué saber.
#[tauri::command(async)]
pub async fn puerto_escucha(puerto: u16) -> bool {
    use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
    use std::time::Duration;
    // Corto a propósito: es un servidor de esta misma máquina, así que o
    // contesta en un parpadeo o no está. Un plazo largo dejaría la pestaña
    // abriéndose medio segundo después de que la terminal lo dijera.
    const PLAZO: Duration = Duration::from_millis(250);
    let candidatos = [
        SocketAddr::from((Ipv4Addr::LOCALHOST, puerto)),
        SocketAddr::from((Ipv6Addr::LOCALHOST, puerto)),
    ];
    candidatos
        .iter()
        .any(|d| TcpStream::connect_timeout(d, PLAZO).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Que la pregunta del puerto responda la verdad por los dos lados.
    ///
    /// Se levanta un servidor de mentira aquí mismo en vez de mirar uno real:
    /// así el caso vale en cualquier máquina y no depende de que Munir tenga
    /// algo arrancado. El puerto lo elige el sistema (`:0`) para no chocar con
    /// nada que ya esté escuchando.
    #[test]
    fn el_puerto_dice_la_verdad() {
        use std::net::TcpListener;
        use tauri::async_runtime::block_on;

        let oido = TcpListener::bind(("127.0.0.1", 0)).expect("no pude abrir un puerto");
        let puerto = oido.local_addr().unwrap().port();
        assert!(
            block_on(puerto_escucha(puerto)),
            "con alguien escuchando debía ser true"
        );

        drop(oido);
        assert!(
            !block_on(puerto_escucha(puerto)),
            "sin nadie escuchando debía ser false",
        );
    }

    fn u(s: &str) -> tauri::Url {
        s.parse().unwrap()
    }

    /// Las webs entran; la propia app, sus protocolos y lo que no es web, no.
    #[test]
    fn solo_entra_lo_que_es_una_web() {
        assert!(permitida(&u("https://github.com/Mun1to")));
        assert!(permitida(&u("http://localhost:5173/")));
        assert!(permitida(&u("http://127.0.0.1:3000/")));
        assert!(permitida(&u("about:blank")));

        assert!(
            !permitida(&u("http://tauri.localhost/")),
            "la interfaz de Adeorq"
        );
        assert!(!permitida(&u(
            "http://asset.localhost/C:/Users/x/AppData/Local/Adeorq/x"
        )));
        assert!(!permitida(&u("http://ipc.localhost/pty_write")));
        assert!(!permitida(&u("file:///C:/Windows/win.ini")));
        assert!(!permitida(&u("javascript:alert(1)")));
        assert!(!permitida(&u("about:settings")));
        if cfg!(debug_assertions) {
            assert!(
                !permitida(&u("http://localhost:1420/")),
                "el devUrl de Adeorq"
            );
        }
    }

    /// Con la carpeta de WebView2 forzada no hay pestañas nativas, salvo que las
    /// pida un laboratorio: compartirían perfil y permisos de micro con la interfaz.
    #[test]
    fn con_la_carpeta_forzada_el_navegador_va_en_iframe() {
        assert!(
            modo_nativo(false, false),
            "lo normal: nativo, con perfil propio"
        );
        assert!(!modo_nativo(true, false), "carpeta forzada: iframe");
        assert!(
            modo_nativo(true, true),
            "el laboratorio lo pide a propósito"
        );
    }

    /// El puente del editor solo habla con webs de esta máquina.
    #[test]
    fn el_editor_solo_habla_con_localhost() {
        assert!(es_local(&u("http://localhost:5173/")));
        assert!(es_local(&u("http://127.0.0.1:3000/x")));
        assert!(es_local(&u("http://[::1]:8080/")));
        assert!(!es_local(&u("https://github.com/")));
        assert!(
            !es_local(&u("http://localhost.evil.com/")),
            "un dominio que empieza igual"
        );
        assert!(!es_local(&u("http://tauri.localhost/")));
        assert!(!es_local(&u("about:blank")));
    }

    /// Solo pasa lo que lleva la marca de la sonda y un tipo.
    #[test]
    fn solo_pasa_lo_que_es_de_la_sonda() {
        assert!(de_la_sonda(r#"{"de":"adeorq-sonda","tipo":"lista","raiz":"C:/p"}"#).is_some());
        assert!(
            de_la_sonda(r#"{"de":"adeorq-sonda"}"#).is_none(),
            "sin tipo"
        );
        assert!(de_la_sonda(r#"{"de":"otra","tipo":"lista"}"#).is_none());
        assert!(
            de_la_sonda(r#""adeorq-sonda""#).is_none(),
            "un texto suelto"
        );
        assert!(de_la_sonda("no es json").is_none());
    }

    /// Por la dirección de la sonda solo pasa lo de una web de esta máquina.
    #[test]
    fn la_sonda_habla_por_su_direccion_y_solo_desde_localhost() {
        let d = "%7B%22de%22%3A%22adeorq-sonda%22%2C%22tipo%22%3A%22lista%22%7D";
        let uri = format!("{SONDA_URL}?d={d}");
        let v = de_la_sonda_por_url(&uri, Some("http://127.0.0.1:5173/"))
            .expect("desde localhost pasa");
        assert_eq!(v["tipo"], "lista");
        assert!(
            de_la_sonda_por_url(&uri, None).is_none(),
            "sin Referer no se sabe quién es"
        );
        assert!(
            de_la_sonda_por_url(&uri, Some("https://www.youtube.com/")).is_none(),
            "un iframe de fuera metido en tu web"
        );
        assert!(
            de_la_sonda_por_url(
                &format!("https://otra.invalid/?d={d}"),
                Some("http://localhost:5173/")
            )
            .is_none(),
            "otra dirección"
        );
        assert!(
            de_la_sonda_por_url(
                &format!("{SONDA_URL}?d=%7B%7D"),
                Some("http://localhost:5173/")
            )
            .is_none(),
            "sin la marca de la sonda"
        );
    }

    /// El recado lleva la marca de Adeorq y no puede cerrar la cadena de JS.
    #[test]
    fn el_recado_no_se_escapa_del_js() {
        let js =
            recado_js(&serde_json::json!({ "tipo": "previa", "x": "')});alert(1);//" })).unwrap();
        assert!(js.starts_with("window.dispatchEvent(new MessageEvent('message',{data:{"));
        assert!(js.ends_with("},source:window}))"));
        assert!(js.contains(r#""de":"adeorq""#));
        // La comilla simple va dentro de una cadena JSON entre comillas dobles: es texto.
        assert!(js.contains(r#""x":"')});alert(1);//""#));
        assert!(
            recado_js(&serde_json::json!("texto")).is_none(),
            "tiene que ser un objeto"
        );
    }

    /// Que una web que no contesta se diga, y que cambiar de página a medio
    /// cargar no se lea como un fallo.
    #[cfg(windows)]
    #[test]
    fn un_fallo_de_red_se_cuenta_y_una_cancelacion_no() {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        let e = super::win::error_de;
        assert_eq!(
            e(COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT),
            Some("sin-respuesta")
        );
        assert_eq!(
            e(COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED),
            Some("sin-respuesta")
        );
        assert_eq!(
            e(COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED),
            Some("certificado")
        );
        assert_eq!(e(COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED), None);
        assert_eq!(
            e(COREWEBVIEW2_WEB_ERROR_STATUS_UNEXPECTED_ERROR),
            Some("fallo")
        );
    }

    /// Las teclas de la app salen de la página; las de la web, no.
    #[test]
    fn las_teclas_de_adeorq_y_las_de_la_web() {
        assert_eq!(
            tecla_de_adeorq(0x54, true, false, false),
            Some("nueva-pestana")
        );
        assert_eq!(
            tecla_de_adeorq(0x57, true, false, false),
            Some("cerrar-pestana")
        );
        assert_eq!(tecla_de_adeorq(0x4C, true, false, false), Some("direccion"));
        assert_eq!(
            tecla_de_adeorq(0x09, true, true, false),
            Some("pestana-anterior")
        );
        assert_eq!(
            tecla_de_adeorq(0x50, true, true, false),
            Some("ctrl-mayus-p")
        );
        // Lo de la página se queda en la página: Ctrl+C, Ctrl+F, una letra sola.
        assert_eq!(tecla_de_adeorq(0x43, true, false, false), None);
        assert_eq!(tecla_de_adeorq(0x46, true, false, false), None);
        assert_eq!(tecla_de_adeorq(0x54, false, false, false), None);
        // Y AltGr (que Windows da como Ctrl+Alt) no es un atajo: es escribir.
        assert_eq!(tecla_de_adeorq(0x45, true, false, true), None);
    }
}
