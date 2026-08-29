// TU navegador, dentro de la ventana de Adeorq.
//
// ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
//
// El panel de vista previa que ya había pinta con el motor web que trae el
// sistema (Edge en Windows), y ahí no están ni tus extensiones, ni froede, ni
// tus sesiones iniciadas, ni tu bloqueador. Munir pidió lo otro, con estas
// palabras: «que puedas tener TU navegador dentro de Adeorq».
//
// Yo dije primero que no se podía. Me equivoqué, y por eso está escrito aquí:
// una ventana de OTRO proceso sí se puede meter dentro de la tuya en Windows.
// Se llama reparenting, y es la misma API de ventanas de siempre.
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
//
//   1. Se mira qué navegador es el predeterminado (registro de Windows), para
//      abrir el TUYO y no uno elegido por nosotros.
//   2. Se apunta qué ventanas hay ANTES de lanzar nada.
//   3. Se lanza con `--app=<url>`, que es como Chromium abre una ventana sin
//      pestañas ni barra de direcciones (esas las pone el panel de Adeorq).
//   4. Se busca la ventana NUEVA comparando con la lista de antes. No se busca
//      por PID a propósito: si el navegador ya estaba abierto, la ventana la
//      crea el proceso que ya existía y el que lanzamos muere en el acto. Y
//      ese proceso de antes es justamente el que tiene tu sesión.
//   5. `SetParent` dentro de la ventana de Adeorq, se le quitan el marco y la
//      barra de título, y se coloca en su hueco.
//
// ── LO QUE HAY QUE SABER ANTES DE TOCAR ESTO ────────────────────────────────
//
//  · Es de WINDOWS. En Linux los comandos existen igual y contestan que ahí no,
//    para que el front no tenga que preguntar antes de llamar. No es dejadez:
//    bajo Wayland no hay forma de meter la ventana de otro proceso en la tuya,
//    y con X11 sería otra API distinta (XEmbed).
//  · Las medidas van en PÍXELES FÍSICOS. Munir tiene tres monitores y uno al
//    125 %: pasar píxeles de CSS coloca la ventana en otro sitio.
//  · Salir de aquí tiene DOS formas y no dan igual. `cerrar` la cierra, que es
//    lo que espera quien cierra la pestaña. `soltar` le devuelve el marco y la
//    deja en el escritorio, y eso solo vale al cerrar Adeorq entero, para que
//    la página no se pierda con la ventana de la que colgaba.

#[derive(serde::Serialize)]
pub struct Empotrada {
    /// Qué navegador se abrió, para poder decirlo en la interfaz.
    pub programa: String,
}

/* ── La implementación, que es toda de Windows ──────────────────────────── */

#[cfg(windows)]
mod win {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, RRF_RT_REG_SZ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowLongPtrW, IsWindow, IsWindowVisible, PostMessageW,
        SetParent, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_STYLE, HWND_TOP,
        SWP_NOACTIVATE, SWP_NOZORDER, SW_HIDE, SW_SHOWNA, WM_CLOSE, WS_CAPTION, WS_CHILD, WS_POPUP,
        WS_THICKFRAME, WS_VISIBLE,
    };

    /// Las ventanas que hemos metido dentro, por id de panel. Hace falta para
    /// poder moverlas, esconderlas y soltarlas después.
    fn metidas() -> &'static Mutex<HashMap<u32, isize>> {
        static M: OnceLock<Mutex<HashMap<u32, isize>>> = OnceLock::new();
        M.get_or_init(|| Mutex::new(HashMap::new()))
    }

    /// La clase de las ventanas de Chromium. La tienen todas: Brave, Chrome,
    /// Edge, Vivaldi u Opera son el mismo motor con otra chapa.
    const CLASE_CHROMIUM: &str = "Chrome_WidgetWin_1";

    struct Cosecha {
        hwnds: Vec<isize>,
    }

    /// El callback de `EnumWindows`. Devuelve 1 para «sigue enumerando»: en
    /// esta versión de `windows-sys` el tipo es un `i32` pelado, sin alias.
    unsafe extern "system" fn recoger(hwnd: HWND, lparam: LPARAM) -> i32 {
        let cosecha = &mut *(lparam as *mut Cosecha);
        if IsWindowVisible(hwnd) != 0 && clase_de(hwnd) == CLASE_CHROMIUM {
            cosecha.hwnds.push(hwnd as isize);
        }
        1
    }

    fn clase_de(hwnd: HWND) -> String {
        let mut buf = [0u16; 128];
        let n = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    fn ventanas_de_navegador() -> Vec<isize> {
        let mut cosecha = Cosecha { hwnds: Vec::new() };
        unsafe {
            EnumWindows(Some(recoger), &mut cosecha as *mut Cosecha as LPARAM);
        }
        cosecha.hwnds
    }

    fn leer_registro(raiz: HKEY, clave: &str, valor: Option<&str>) -> Option<String> {
        let clave: Vec<u16> = clave.encode_utf16().chain(std::iter::once(0)).collect();
        let valor: Option<Vec<u16>> =
            valor.map(|v| v.encode_utf16().chain(std::iter::once(0)).collect());
        let mut buf = [0u16; 1024];
        let mut len = (buf.len() * 2) as u32;
        let ok = unsafe {
            RegGetValueW(
                raiz,
                clave.as_ptr(),
                valor.as_ref().map_or(std::ptr::null(), |v| v.as_ptr()),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                buf.as_mut_ptr() as *mut _,
                &mut len,
            )
        };
        if ok != 0 {
            return None;
        }
        // `len` vuelve en BYTES y contando el cero final.
        let chars = (len as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..chars]))
    }

    /// La ruta del ejecutable del navegador predeterminado. Sale de la elección
    /// que el usuario hizo en Windows, no de una lista nuestra: si mañana
    /// cambia de navegador, esto cambia solo.
    pub fn por_defecto() -> Option<String> {
        let prog = leer_registro(
            HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice",
            Some("ProgId"),
        )?;
        let cmd = leer_registro(
            HKEY_CLASSES_ROOT,
            &format!(r"{prog}\shell\open\command"),
            None,
        )?;
        // Viene como `"C:\...\brave.exe" --single-argument %1`: nos quedamos con
        // lo que hay entre las primeras comillas.
        Some(cmd.split('"').nth(1)?.to_string())
    }

    fn esperar_ventana_nueva(antes: &[isize]) -> Option<isize> {
        // Ocho segundos de margen: en frío el navegador tarda lo suyo, y en
        // caliente esto sale a la primera vuelta.
        for _ in 0..160 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            for h in ventanas_de_navegador() {
                if !antes.contains(&h) {
                    return Some(h);
                }
            }
        }
        None
    }

    pub fn empotrar(
        padre: isize,
        id: u32,
        url: &str,
        x: i32,
        y: i32,
        ancho: i32,
        alto: i32,
    ) -> Result<String, String> {
        let exe = por_defecto().ok_or("no se pudo saber cuál es tu navegador")?;
        let programa = std::path::Path::new(&exe)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "navegador".into());

        // Si ya había una en este panel, primero se suelta: dos ventanas
        // superpuestas en el mismo hueco es peor que ninguna.
        soltar(id);

        let antes = ventanas_de_navegador();
        std::process::Command::new(&exe)
            .arg(format!("--app={url}"))
            .spawn()
            .map_err(|e| format!("no arrancó {programa}: {e}"))?;

        let nueva = esperar_ventana_nueva(&antes)
            .ok_or_else(|| format!("{programa} no llegó a abrir su ventana"))?;

        unsafe {
            // Fuera el marco, la barra de título y el borde de estirar: eso lo
            // pone el panel, y dentro de otra ventana no significan nada.
            let estilo = GetWindowLongPtrW(nueva as HWND, GWL_STYLE) as u64;
            let limpio = (estilo & !(WS_POPUP as u64 | WS_CAPTION as u64 | WS_THICKFRAME as u64))
                | WS_CHILD as u64
                | WS_VISIBLE as u64;
            SetWindowLongPtrW(nueva as HWND, GWL_STYLE, limpio as isize);
            SetParent(nueva as HWND, padre as HWND);
            SetWindowPos(
                nueva as HWND,
                HWND_TOP,
                x,
                y,
                ancho.max(1),
                alto.max(1),
                SWP_NOACTIVATE,
            );
        }

        metidas().lock().unwrap().insert(id, nueva);
        Ok(programa)
    }

    pub fn mover(id: u32, x: i32, y: i32, ancho: i32, alto: i32) {
        let Some(h) = metidas().lock().unwrap().get(&id).copied() else {
            return;
        };
        unsafe {
            if IsWindow(h as HWND) == 0 {
                return;
            }
            SetWindowPos(
                h as HWND,
                HWND_TOP,
                x,
                y,
                ancho.max(1),
                alto.max(1),
                SWP_NOACTIVATE | SWP_NOZORDER,
            );
        }
    }

    pub fn ver(id: u32, visible: bool) {
        let Some(h) = metidas().lock().unwrap().get(&id).copied() else {
            return;
        };
        unsafe {
            if IsWindow(h as HWND) != 0 {
                // `SW_SHOWNA` y no `SW_SHOW`: enseñarla no debe robarle el
                // teclado a la terminal en la que estuvieras escribiendo.
                ShowWindow(h as HWND, if visible { SW_SHOWNA } else { SW_HIDE });
            }
        }
    }

    /// Le devuelve su marco y su sitio en el escritorio. La página no se
    /// pierde: se va a su ventana, que es lo que uno espera al cerrar el panel.
    pub fn soltar(id: u32) {
        let Some(h) = metidas().lock().unwrap().remove(&id) else {
            return;
        };
        unsafe {
            if IsWindow(h as HWND) == 0 {
                return;
            }
            SetParent(h as HWND, std::ptr::null_mut());
            let estilo = GetWindowLongPtrW(h as HWND, GWL_STYLE) as u64;
            let devuelto = (estilo & !(WS_CHILD as u64))
                | WS_POPUP as u64
                | WS_CAPTION as u64
                | WS_THICKFRAME as u64;
            SetWindowLongPtrW(h as HWND, GWL_STYLE, devuelto as isize);
            ShowWindow(h as HWND, SW_SHOWNA);
        }
    }

    /// La cierra de verdad, como si le hubieras dado a su X.
    ///
    /// Es lo que hace falta al cerrar la pestaña o el panel, y es distinto de
    /// `soltar`: soltar la devuelve al escritorio, así que cerrar el panel
    /// hacía APARECER una ventana de navegador en vez de quitarla. Y al cambiar
    /// de dirección pasaba lo mismo sin que nadie cerrara nada, porque el panel
    /// suelta la vieja y abre otra: navegar diez veces dejaba diez ventanas.
    ///
    /// Se manda `WM_CLOSE`, que es el mismo mensaje que la X: si la página
    /// tuviera algo que preguntar antes de irse, lo pregunta. No se mata el
    /// proceso, que es el navegador entero de Munir con todo lo demás dentro.
    pub fn cerrar(id: u32) {
        let Some(h) = metidas().lock().unwrap().remove(&id) else {
            return;
        };
        unsafe {
            if IsWindow(h as HWND) == 0 {
                return;
            }
            // Esconderla primero: sigue siendo hija del panel, y verla
            // desaparecer es más limpio que ver el hueco vacío repintarse.
            ShowWindow(h as HWND, SW_HIDE);
            PostMessageW(h as HWND, WM_CLOSE, 0, 0);
        }
    }

    pub fn soltar_todas() {
        let ids: Vec<u32> = metidas().lock().unwrap().keys().copied().collect();
        for id in ids {
            soltar(id);
        }
    }

    #[cfg(test)]
    mod pruebas {
        use super::*;

        /// Que cerrar CIERRE, que es justo lo que no hacía.
        ///
        /// Va marcada `ignore` porque abre una ventana de navegador de verdad
        /// en el escritorio de quien la lance, y eso no puede pasar en cada
        /// `cargo test`. Se corre a mano:
        ///
        /// ```text
        /// cargo test --manifest-path src-tauri/Cargo.toml cierra_la_ventana -- --ignored --nocapture
        /// ```
        #[test]
        #[ignore = "abre una ventana de navegador de verdad; se lanza a mano"]
        fn cerrar_cierra_la_ventana_de_verdad() {
            let exe = por_defecto().expect("no se pudo saber cuál es el navegador por defecto");
            let antes = ventanas_de_navegador();
            std::process::Command::new(&exe)
                .arg("--app=about:blank")
                .spawn()
                .expect("no arrancó el navegador");
            let nueva = esperar_ventana_nueva(&antes).expect("no llegó a abrir su ventana");

            // Sin `SetParent`: lo que se prueba es el cierre, y meterla dentro
            // de otra ventana pediría una ventana padre que aquí no hay.
            metidas().lock().unwrap().insert(u32::MAX, nueva);
            assert_eq!(unsafe { IsWindow(nueva as HWND) }, 1, "debería estar viva");

            cerrar(u32::MAX);

            // Se le da tiempo a Chromium a atender el `WM_CLOSE`: es un mensaje
            // en su cola, no una orden inmediata.
            let mut viva = true;
            for _ in 0..60 {
                if unsafe { IsWindow(nueva as HWND) } == 0 {
                    viva = false;
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            assert!(!viva, "la ventana seguía viva seis segundos después de cerrarla");
            assert!(
                !metidas().lock().unwrap().contains_key(&u32::MAX),
                "cerrarla tiene que sacarla del mapa, o el panel siguiente la creería suya"
            );
        }
    }
}

/* ── Los comandos, que existen en los dos sistemas ──────────────────────── */

/// Abre `url` en tu navegador y mete su ventana dentro del panel `id`.
/// Las medidas van en píxeles FÍSICOS de la pantalla, no de CSS.
#[tauri::command]
pub async fn empotrar_navegador(
    ventana: tauri::Window,
    id: u32,
    url: String,
    x: i32,
    y: i32,
    ancho: i32,
    alto: i32,
) -> Result<Empotrada, String> {
    #[cfg(windows)]
    {
        let padre = ventana.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let programa = win::empotrar(padre, id, &url, x, y, ancho, alto)?;
        Ok(Empotrada { programa })
    }
    #[cfg(not(windows))]
    {
        let _ = (&ventana, id, &url, x, y, ancho, alto);
        Err("meter el navegador dentro de la ventana solo funciona en Windows".into())
    }
}

/// Colocarla donde esté ahora su panel. Se llama al mover o estirar el mosaico.
#[tauri::command]
pub async fn mover_navegador(id: u32, x: i32, y: i32, ancho: i32, alto: i32) -> Result<(), String> {
    #[cfg(windows)]
    win::mover(id, x, y, ancho, alto);
    #[cfg(not(windows))]
    let _ = (id, x, y, ancho, alto);
    Ok(())
}

/// Taparla sin cerrarla: lo usa el mosaico cuando otro panel se pone a pantalla
/// completa o cuando el suyo se aparta. Una ventana metida dentro no entiende
/// de CSS, así que esconderla es cosa de Windows.
#[tauri::command]
pub async fn ver_navegador(id: u32, visible: bool) -> Result<(), String> {
    #[cfg(windows)]
    win::ver(id, visible);
    #[cfg(not(windows))]
    let _ = (id, visible);
    Ok(())
}

#[tauri::command]
pub async fn soltar_navegador(id: u32) -> Result<(), String> {
    #[cfg(windows)]
    win::soltar(id);
    #[cfg(not(windows))]
    let _ = id;
    Ok(())
}

/// Cerrarla. Es lo que quiere el panel al cerrar su pestaña: que la ventana se
/// vaya, no que reaparezca en el escritorio.
#[tauri::command]
pub async fn cerrar_navegador(id: u32) -> Result<(), String> {
    #[cfg(windows)]
    win::cerrar(id);
    #[cfg(not(windows))]
    let _ = id;
    Ok(())
}

/// Todas, al cerrar Adeorq. Sin esto, las ventanas se quedarían colgando de una
/// ventana que ya no existe.
pub fn soltar_todas() {
    #[cfg(windows)]
    win::soltar_todas();
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
        assert!(block_on(puerto_escucha(puerto)), "con alguien escuchando debía ser true");

        drop(oido);
        assert!(
            !block_on(puerto_escucha(puerto)),
            "sin nadie escuchando debía ser false",
        );
    }
}
