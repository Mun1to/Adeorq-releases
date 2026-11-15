//! La valla del ratón, traída de Klipse (encargo «Cajas aparte», 2026-11-15): encierra el
//! cursor en una pantalla o en una ventana con `ClipCursor`, para que un agente que mueve el
//! ratón no se salga de ahí. El plano y lo que no se pudo probar, en `docs/contexto/cajas.md`.
//!
//! Un solo hilo la lleva entera: la pone, la repone cada 50 ms (Windows la suelta en cuanto
//! cambia el foco, y otros programas la pisan), sigue a la ventana si se mueve o cambia de
//! tamaño, la suelta si la ventana se minimiza o se cierra, y escucha Ctrl+Alt+L para
//! quitarla. **Sin ese atajo no se pone**: encerrado en otra ventana o en otra pantalla, el
//! botón de Ajustes se queda fuera de su alcance.

// Fuera de Windows solo quedan los comandos, que dicen que no la hay.
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use std::sync::Mutex;

/// Píxeles que se le quitan a cada lado de una ventana, como en Klipse: así el ratón no
/// llega al borde de estirar y un agente no la agranda sin querer.
const MARGEN: i32 = 2;
/// Cada cuánto se repone la valla y se vuelve a medir la ventana (lo de Klipse).
const CADA_MS: u32 = 50;
/// Las ventanas que se ofrecen, como mucho.
const VENTANAS: usize = 30;

/// Un rectángulo de pantalla en píxeles físicos (la ventana de Adeorq es consciente del DPI
/// de cada monitor, así que lo que mide Windows y lo que se valla es lo mismo).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    izq: i32,
    arriba: i32,
    der: i32,
    abajo: i32,
}

impl Rect {
    fn valido(&self) -> bool {
        self.der > self.izq && self.abajo > self.arriba
    }

    /// Lo que tienen en común, o `None` si no se tocan.
    fn cortar(&self, o: &Rect) -> Option<Rect> {
        let r = Rect {
            izq: self.izq.max(o.izq),
            arriba: self.arriba.max(o.arriba),
            der: self.der.min(o.der),
            abajo: self.abajo.min(o.abajo),
        };
        r.valido().then_some(r)
    }

    /// `m` píxeles menos por lado; si eso lo hiciera desaparecer, se queda como estaba.
    fn encoger(&self, m: i32) -> Rect {
        let r = Rect { izq: self.izq + m, arriba: self.arriba + m, der: self.der - m, abajo: self.abajo - m };
        if r.valido() {
            r
        } else {
            *self
        }
    }
}

/// Dónde se encierra: una pantalla no se mueve, una ventana se mide en cada vuelta.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Objetivo {
    Pantalla(Rect),
    Ventana(isize),
}

/// Lo que la valla necesita del escritorio. Las pruebas lo fingen: así ninguna toca el
/// ratón ni el teclado de quien trabaja en el equipo.
trait Escritorio {
    /// Lo que se ve de la ventana, o `None` si ya no se puede vallar (cerrada, minimizada
    /// o escondida).
    fn ventana(&self, v: isize) -> Option<Rect>;
    /// Todas las pantallas juntas.
    fn pantalla_virtual(&self) -> Rect;
    /// `ClipCursor`; con `None`, la suelta. El error es el de `GetLastError`.
    fn vallar(&self, r: Option<Rect>) -> Result<(), i32>;
    /// Ctrl+Alt+L en el hilo que llama: `true` lo coge, `false` lo suelta.
    fn atajo(&self, coger: bool) -> bool;
}

enum Paso {
    Vallar(Rect),
    /// La ventana está entera fuera de todas las pantallas: se deja la valla que había.
    Igual,
    Soltar,
}

fn paso(e: &dyn Escritorio, o: &Objetivo) -> Paso {
    let r = match o {
        Objetivo::Pantalla(r) => *r,
        Objetivo::Ventana(v) => match e.ventana(*v) {
            Some(r) => r.encoger(MARGEN),
            None => return Paso::Soltar,
        },
    };
    // Recortada a lo que hay de pantalla: ClipCursor falla con una ventana que cuelga
    // fuera de todas.
    match r.cortar(&e.pantalla_virtual()) {
        Some(r) => Paso::Vallar(r),
        None => Paso::Igual,
    }
}

/// Por qué se quitó la última valla.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Motivo {
    /// La quitaste tú (el botón, o poner otra).
    Pedido,
    /// Con Ctrl+Alt+L.
    Atajo,
    /// La ventana se minimizó, se escondió o se cerró.
    VentanaFuera,
}

/// La que está puesta, como la enseña la tarjeta.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Puesta {
    pub pantalla: Option<u32>,
    pub ventana: Option<i64>,
    pub nombre: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    pub disponible: bool,
    pub puesta: Option<Puesta>,
    pub motivo: Option<Motivo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pantalla {
    /// De izquierda a derecha, desde 1 (el número de Windows no sigue a la mesa).
    pub n: u32,
    pub ancho: i32,
    pub alto: i32,
    pub principal: bool,
    /// El ratón está en ella ahora (al pulsar en Ajustes, es la de Adeorq).
    pub raton: bool,
    #[serde(skip)]
    rect: Rect,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ventana {
    pub id: i64,
    pub titulo: String,
    pub app: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Sitios {
    pub pantallas: Vec<Pantalla>,
    pub ventanas: Vec<Ventana>,
}

/// La valla viva: el hilo que la lleva y lo que se enseña de ella.
struct Viva {
    tid: u32,
    hilo: std::thread::JoinHandle<()>,
    puesta: Puesta,
    vuelta: u64,
}

static VIVA: Mutex<Option<Viva>> = Mutex::new(None);
static MOTIVO: Mutex<Option<Motivo>> = Mutex::new(None);
static VUELTA: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Para avisar a la ventana cuando la valla se quita sola.
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

#[cfg(not(windows))]
const SOLO_WINDOWS: &str ="La valla del ratón es solo de Windows por ahora.";

fn cerrojo<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn estado() -> Estado {
    Estado {
        disponible: cfg!(windows),
        puesta: cerrojo(&VIVA).as_ref().map(|v| v.puesta.clone()),
        motivo: *cerrojo(&MOTIVO),
    }
}

/// Arranca el hilo de la valla y espera a que la ponga (o diga por qué no). El cerrojo de
/// `VIVA` se tiene hasta apuntarla, para que una valla que se quita sola en su primera
/// vuelta no deje apuntada una que ya no existe.
#[cfg(windows)]
fn arrancar(e: Box<dyn Escritorio + Send>, o: Objetivo, puesta: Puesta) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    let mut viva = cerrojo(&VIVA);
    let vuelta = VUELTA.fetch_add(1, Ordering::SeqCst) + 1;
    let (listo, llega) = std::sync::mpsc::channel();
    let hilo = std::thread::Builder::new()
        .name("valla".into())
        .spawn(move || {
            if let Some(motivo) = hilo::bucle(&*e, o, listo) {
                se_acabo(vuelta, motivo);
            }
        })
        .map_err(|e| e.to_string())?;
    match llega.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(Ok(tid)) => {
            *cerrojo(&MOTIVO) = None;
            *viva = Some(Viva { tid, hilo, puesta, vuelta });
            Ok(())
        }
        Ok(Err(porque)) => {
            drop(viva);
            let _ = hilo.join();
            Err(porque)
        }
        Err(_) => Err("La valla no arrancó.".into()),
    }
}

/// Lo llama el hilo al terminar: si era la valla apuntada (no la quitó nadie desde
/// fuera), se borra y se avisa a la ventana.
#[cfg(windows)]
fn se_acabo(vuelta: u64, motivo: Motivo) {
    let mut viva = cerrojo(&VIVA);
    if viva.as_ref().is_some_and(|v| v.vuelta == vuelta) {
        *viva = None;
        drop(viva);
        *cerrojo(&MOTIVO) = Some(motivo);
        if let Some(app) = APP.get() {
            use tauri::Emitter;
            let _ = app.emit("valla", estado());
        }
    }
}

/// Quita la valla que haya y espera a que su hilo la suelte.
fn quitar() {
    let viva = cerrojo(&VIVA).take();
    #[cfg(windows)]
    if let Some(v) = viva {
        use windows_sys::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
        unsafe { PostThreadMessageW(v.tid, WM_QUIT, 0, 0) };
        let _ = v.hilo.join();
        *cerrojo(&MOTIVO) = Some(Motivo::Pedido);
    }
    #[cfg(not(windows))]
    drop(viva);
}

/// Al salir de Adeorq: el ratón no se queda encerrado sin nadie que lo suelte.
pub fn al_salir() {
    quitar();
}

#[cfg(windows)]
mod hilo {
    use super::{paso, Escritorio, Motivo, Objetivo, Paso, CADA_MS};
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetMessageW, KillTimer, PeekMessageW, SetTimer, MSG, PM_NOREMOVE, WM_HOTKEY, WM_TIMER,
    };

    /// La valla entera, en el hilo que la llama: `listo` recibe el id del hilo (para
    /// mandarle `WM_QUIT`) o por qué no se pudo poner. Devuelve por qué acabó, o `None` si
    /// no llegó a ponerse.
    pub(super) fn bucle(
        e: &dyn Escritorio,
        o: Objetivo,
        listo: std::sync::mpsc::Sender<Result<u32, String>>,
    ) -> Option<Motivo> {
        let mut msg: MSG = unsafe { std::mem::zeroed() };
        // La cola de un hilo nace con su primera llamada de mensajes: sin esto, un
        // PostThreadMessageW que llegue antes del primer GetMessageW se pierde.
        unsafe { PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE) };
        let tid = unsafe { GetCurrentThreadId() };
        if !e.atajo(true) {
            let _ = listo.send(Err(
                "Ctrl+Alt+L lo tiene cogido otro programa, y sin ese atajo no podrías quitar la valla. No la pongo.".into(),
            ));
            return None;
        }
        let primera = match paso(e, &o) {
            Paso::Vallar(r) => e.vallar(Some(r)).map_err(|c| format!("Windows no dejó poner la valla (error {c}).")),
            Paso::Igual => Err("Esa ventana está fuera de todas las pantallas.".into()),
            Paso::Soltar => Err("Esa ventana ya no está, o está minimizada.".into()),
        };
        if let Err(porque) = primera {
            e.atajo(false);
            let _ = listo.send(Err(porque));
            return None;
        }
        let _ = listo.send(Ok(tid));

        let reloj = unsafe { SetTimer(std::ptr::null_mut(), 0, CADA_MS, None) };
        let motivo = loop {
            let r = unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) };
            // 0 es WM_QUIT (lo manda `quitar`); -1, un error de la cola.
            if r == 0 || r == -1 {
                break Motivo::Pedido;
            }
            match msg.message {
                WM_HOTKEY => break Motivo::Atajo,
                WM_TIMER => match paso(e, &o) {
                    Paso::Vallar(r) => {
                        let _ = e.vallar(Some(r));
                    }
                    Paso::Igual => {}
                    Paso::Soltar => break Motivo::VentanaFuera,
                },
                _ => {}
            }
        };
        unsafe { KillTimer(std::ptr::null_mut(), reloj) };
        let _ = e.vallar(None);
        e.atajo(false);
        Some(motivo)
    }
}

/// Lo de verdad: Windows.
#[cfg(windows)]
mod escritorio {
    use super::{Escritorio, Pantalla, Rect, Ventana, VENTANAS};
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, MonitorFromPoint, HDC, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        ClipCursor, EnumWindows, GetAncestor, GetClassNameW, GetCursorPos, GetSystemMetrics, GetWindowLongW, GetWindowRect,
        GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, GA_ROOT,
        GWL_EXSTYLE, MONITORINFOF_PRIMARY, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        WS_EX_TOOLWINDOW,
    };

    const ID_ATAJO: i32 = 1;
    const TECLA_L: u32 = 0x4C;
    /// Lo más pequeño que vale la pena ofrecer: por debajo es un aviso, un menú o una
    /// ventana de ayuda invisible, nunca un sitio donde trabajar (lo de Klipse).
    const ANCHO_MIN: i32 = 180;
    const ALTO_MIN: i32 = 120;
    /// Ventanas del propio escritorio que salen como «la de debajo» y nunca son destino.
    const DEL_ESCRITORIO: [&str; 5] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow"];

    impl From<RECT> for Rect {
        fn from(r: RECT) -> Self {
            Rect { izq: r.left, arriba: r.top, der: r.right, abajo: r.bottom }
        }
    }

    impl From<Rect> for RECT {
        fn from(r: Rect) -> Self {
            RECT { left: r.izq, top: r.arriba, right: r.der, bottom: r.abajo }
        }
    }

    pub(super) struct DeVerdad;

    impl Escritorio for DeVerdad {
        fn ventana(&self, v: isize) -> Option<Rect> {
            let h = v as HWND;
            se_ve(h).then(|| rect_de(h)).flatten()
        }

        fn pantalla_virtual(&self) -> Rect {
            unsafe {
                let (x, y) = (GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN));
                Rect { izq: x, arriba: y, der: x + GetSystemMetrics(SM_CXVIRTUALSCREEN), abajo: y + GetSystemMetrics(SM_CYVIRTUALSCREEN) }
            }
        }

        fn vallar(&self, r: Option<Rect>) -> Result<(), i32> {
            let hecho = match r {
                Some(r) => {
                    let r = RECT::from(r);
                    unsafe { ClipCursor(&r) }
                }
                None => unsafe { ClipCursor(std::ptr::null()) },
            };
            if hecho != 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error().raw_os_error().unwrap_or(0))
            }
        }

        fn atajo(&self, coger: bool) -> bool {
            unsafe {
                if coger {
                    RegisterHotKey(std::ptr::null_mut(), ID_ATAJO, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, TECLA_L) != 0
                } else {
                    UnregisterHotKey(std::ptr::null_mut(), ID_ATAJO) != 0
                }
            }
        }
    }

    /// Una ventana de verdad, a la vista y sin minimizar.
    fn se_ve(h: HWND) -> bool {
        !h.is_null() && unsafe { IsWindow(h) != 0 && IsWindowVisible(h) != 0 && IsIconic(h) == 0 }
    }

    /// Lo que se ve de una ventana: el marco que pinta el DWM, sin el borde invisible de
    /// estirar que suma `GetWindowRect` en Windows 10 y 11.
    fn rect_de(h: HWND) -> Option<Rect> {
        let mut r: RECT = unsafe { std::mem::zeroed() };
        let dwm = unsafe {
            DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS as u32, (&mut r as *mut RECT).cast(), std::mem::size_of::<RECT>() as u32)
        };
        let r = Rect::from(r);
        if dwm == 0 && r.valido() {
            return Some(r);
        }
        let mut r: RECT = unsafe { std::mem::zeroed() };
        let r = (unsafe { GetWindowRect(h, &mut r) } != 0).then(|| Rect::from(r))?;
        r.valido().then_some(r)
    }

    fn texto(h: HWND, clase: bool) -> String {
        let mut b = [0u16; 256];
        let n = unsafe {
            if clase {
                GetClassNameW(h, b.as_mut_ptr(), b.len() as i32)
            } else {
                GetWindowTextW(h, b.as_mut_ptr(), b.len() as i32)
            }
        };
        String::from_utf16_lossy(&b[..n.max(0) as usize])
    }

    /// El programa de una ventana («brave»), o nada si no se deja leer (los elevados).
    fn app_de(h: HWND) -> String {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(h, &mut pid) };
        if pid == 0 {
            return String::new();
        }
        let p = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if p.is_null() {
            return String::new();
        }
        let mut b = [0u16; 260];
        let mut n = b.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(p, PROCESS_NAME_WIN32, b.as_mut_ptr(), &mut n) } != 0;
        unsafe { CloseHandle(p) };
        if !ok {
            return String::new();
        }
        let ruta = String::from_utf16_lossy(&b[..n as usize]);
        let nombre = ruta.rsplit('\\').next().unwrap_or_default();
        nombre.strip_suffix(".exe").or_else(|| nombre.strip_suffix(".EXE")).unwrap_or(nombre).to_string()
    }

    /// El DWM la esconde (una app de la tienda dormida, otro escritorio virtual): pasa por
    /// visible y no está en pantalla.
    fn escondida(h: HWND) -> bool {
        let mut v = 0u32;
        let hr = unsafe { DwmGetWindowAttribute(h, DWMWA_CLOAKED as u32, (&mut v as *mut u32).cast(), 4) };
        hr == 0 && v != 0
    }

    pub(super) fn titulo(v: isize) -> String {
        texto(v as HWND, false)
    }

    unsafe extern "system" fn una_ventana(h: HWND, l: LPARAM) -> windows_sys::core::BOOL {
        let lista = unsafe { &mut *(l as *mut Vec<Ventana>) };
        if lista.len() >= VENTANAS {
            return 0;
        }
        let vale = se_ve(h)
            && unsafe { GetAncestor(h, GA_ROOT) } == h
            && unsafe { GetWindowTextLengthW(h) } > 0
            && unsafe { GetWindowLongW(h, GWL_EXSTYLE) } as u32 & WS_EX_TOOLWINDOW == 0
            && !DEL_ESCRITORIO.contains(&texto(h, true).as_str())
            && !escondida(h)
            && rect_de(h).is_some_and(|r| r.der - r.izq >= ANCHO_MIN && r.abajo - r.arriba >= ALTO_MIN);
        if vale {
            lista.push(Ventana { id: h as i64, titulo: texto(h, false), app: app_de(h) });
        }
        1
    }

    /// Las ventanas donde tiene sentido encerrar el ratón, de la de delante a la de atrás.
    pub(super) fn ventanas() -> Vec<Ventana> {
        let mut lista: Vec<Ventana> = Vec::new();
        unsafe { EnumWindows(Some(una_ventana), (&mut lista as *mut Vec<Ventana>) as LPARAM) };
        lista
    }

    unsafe extern "system" fn una_pantalla(h: HMONITOR, _: HDC, _: *mut RECT, l: LPARAM) -> windows_sys::core::BOOL {
        let lista = unsafe { &mut *(l as *mut Vec<(HMONITOR, Rect, bool)>) };
        let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if unsafe { GetMonitorInfoW(h, &mut info) } != 0 {
            lista.push((h, Rect::from(info.rcMonitor), info.dwFlags & MONITORINFOF_PRIMARY != 0));
        }
        1
    }

    /// Las pantallas, de izquierda a derecha.
    pub(super) fn pantallas() -> Vec<Pantalla> {
        let mut lista: Vec<(HMONITOR, Rect, bool)> = Vec::new();
        unsafe {
            EnumDisplayMonitors(std::ptr::null_mut(), std::ptr::null(), Some(una_pantalla), (&mut lista as *mut Vec<(HMONITOR, Rect, bool)>) as LPARAM)
        };
        let mut p = POINT { x: 0, y: 0 };
        let la_del_raton = (unsafe { GetCursorPos(&mut p) } != 0).then(|| unsafe { MonitorFromPoint(p, MONITOR_DEFAULTTONEAREST) });
        lista.sort_by_key(|(_, r, _)| (r.izq, r.arriba));
        lista
            .into_iter()
            .enumerate()
            .map(|(i, (h, r, principal))| Pantalla {
                n: i as u32 + 1,
                ancho: r.der - r.izq,
                alto: r.abajo - r.arriba,
                principal,
                raton: la_del_raton == Some(h),
                rect: r,
            })
            .collect()
    }
}

#[cfg(windows)]
fn poner(pantalla: Option<u32>, ventana: Option<i64>) -> Result<(), String> {
    use escritorio::DeVerdad;
    let (objetivo, puesta) = match (pantalla, ventana) {
        (Some(n), None) => {
            let p = escritorio::pantallas().into_iter().find(|p| p.n == n).ok_or("Esa pantalla ya no está.")?;
            (Objetivo::Pantalla(p.rect), Puesta { pantalla: Some(n), ventana: None, nombre: format!("la pantalla {n}") })
        }
        (None, Some(id)) => {
            let v = id as isize;
            if DeVerdad.ventana(v).is_none() {
                return Err("Esa ventana ya no está, o está minimizada.".into());
            }
            let titulo: String = escritorio::titulo(v).chars().take(60).collect();
            (Objetivo::Ventana(v), Puesta { pantalla: None, ventana: Some(id), nombre: titulo })
        }
        _ => return Err("Elige una pantalla o una ventana.".into()),
    };
    quitar();
    arrancar(Box::new(DeVerdad), objetivo, puesta)
}

#[tauri::command(async)]
pub fn valla_estado() -> Estado {
    estado()
}

#[tauri::command(async)]
pub fn valla_sitios() -> Sitios {
    #[cfg(windows)]
    return Sitios { pantallas: escritorio::pantallas(), ventanas: escritorio::ventanas() };
    #[cfg(not(windows))]
    Sitios { pantallas: Vec::new(), ventanas: Vec::new() }
}

/// Pone la valla en la pantalla `n` (de `valla_sitios`) o en la ventana `id`.
#[tauri::command(async)]
pub fn valla_poner(app: tauri::AppHandle, pantalla: Option<u32>, ventana: Option<i64>) -> Result<Estado, String> {
    let _ = APP.set(app);
    #[cfg(windows)]
    {
        poner(pantalla, ventana)?;
        Ok(estado())
    }
    #[cfg(not(windows))]
    {
        let _ = (pantalla, ventana);
        Err(SOLO_WINDOWS.into())
    }
}

#[tauri::command(async)]
pub fn valla_quitar() -> Estado {
    quitar();
    estado()
}

#[cfg(all(test, windows))]
mod pruebas {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::System::StationsAndDesktops::{CreateWindowStationW, SetProcessWindowStation};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClipCursor, PostThreadMessageW, WM_HOTKEY, WM_QUIT};

    const PANTALLA: Rect = Rect { izq: 0, arriba: 0, der: 1920, abajo: 1080 };
    /// `WINSTA_ALL_ACCESS` of winuser.h, which windows-sys does not declare.
    const TODO_EL_ACCESO: u32 = 0x37F;

    /// Un escritorio de mentira: apunta cada valla y cada atajo, y la ventana se mueve o
    /// se va cuando la prueba quiere.
    struct Falso {
        ventana: Mutex<Option<Rect>>,
        atajo_libre: bool,
        vallas: Mutex<Vec<Option<Rect>>>,
        atajos: Mutex<Vec<bool>>,
    }

    impl Falso {
        fn nuevo(ventana: Option<Rect>, atajo_libre: bool) -> Arc<Falso> {
            Arc::new(Falso { ventana: Mutex::new(ventana), atajo_libre, vallas: Mutex::new(Vec::new()), atajos: Mutex::new(Vec::new()) })
        }
        fn vallas(&self) -> Vec<Option<Rect>> {
            cerrojo(&self.vallas).clone()
        }
    }

    impl Escritorio for Arc<Falso> {
        fn ventana(&self, _: isize) -> Option<Rect> {
            *cerrojo(&self.ventana)
        }
        fn pantalla_virtual(&self) -> Rect {
            PANTALLA
        }
        fn vallar(&self, r: Option<Rect>) -> Result<(), i32> {
            cerrojo(&self.vallas).push(r);
            Ok(())
        }
        fn atajo(&self, coger: bool) -> bool {
            cerrojo(&self.atajos).push(coger);
            !coger || self.atajo_libre
        }
    }

    /// La valla en su hilo, como la arranca Adeorq; devuelve el id del hilo y su final.
    fn en_su_hilo(f: &Arc<Falso>, o: Objetivo) -> (Result<u32, String>, std::thread::JoinHandle<Option<Motivo>>) {
        let (listo, llega) = mpsc::channel();
        let f = f.clone();
        let hilo = std::thread::spawn(move || hilo::bucle(&f, o, listo));
        (llega.recv_timeout(Duration::from_secs(5)).unwrap(), hilo)
    }

    fn hasta(que: impl Fn() -> bool) {
        let fin = Instant::now() + Duration::from_secs(3);
        while !que() {
            assert!(Instant::now() < fin, "no pasó en 3 s");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn recorta_y_encoge_sin_hacer_desaparecer() {
        let r = Rect { izq: 100, arriba: 50, der: 500, abajo: 400 };
        assert_eq!(r.encoger(2), Rect { izq: 102, arriba: 52, der: 498, abajo: 398 });
        let fina = Rect { izq: 0, arriba: 0, der: 3, abajo: 3 };
        assert_eq!(fina.encoger(2), fina, "encogida desaparecería: se queda como estaba");
        let colgando = Rect { izq: 1800, arriba: -40, der: 2400, abajo: 300 };
        assert_eq!(colgando.cortar(&PANTALLA), Some(Rect { izq: 1800, arriba: 0, der: 1920, abajo: 300 }));
        assert_eq!(Rect { izq: 3000, arriba: 0, der: 3500, abajo: 300 }.cortar(&PANTALLA), None);
    }

    #[test]
    fn la_ventana_se_valla_con_su_margen_y_se_suelta_al_irse() {
        let f = Falso::nuevo(Some(Rect { izq: 100, arriba: 100, der: 900, abajo: 700 }), true);
        assert!(matches!(paso(&f, &Objetivo::Ventana(7)), Paso::Vallar(Rect { izq: 102, arriba: 102, der: 898, abajo: 698 })));
        *cerrojo(&f.ventana) = Some(Rect { izq: 5000, arriba: 0, der: 5600, abajo: 400 });
        assert!(matches!(paso(&f, &Objetivo::Ventana(7)), Paso::Igual), "fuera de todas las pantallas se deja la de antes");
        *cerrojo(&f.ventana) = None;
        assert!(matches!(paso(&f, &Objetivo::Ventana(7)), Paso::Soltar));
        assert!(matches!(paso(&f, &Objetivo::Pantalla(PANTALLA)), Paso::Vallar(PANTALLA)), "una pantalla no depende de ninguna ventana");
    }

    #[test]
    fn se_repone_sigue_a_la_ventana_y_ctrl_alt_l_la_quita() {
        let f = Falso::nuevo(Some(Rect { izq: 100, arriba: 100, der: 900, abajo: 700 }), true);
        let (tid, hilo) = en_su_hilo(&f, Objetivo::Ventana(7));
        let tid = tid.unwrap();
        // Repuesta cada 50 ms: en medio segundo, unas cuantas.
        hasta(|| f.vallas().len() >= 4);
        assert!(f.vallas().iter().all(|v| *v == Some(Rect { izq: 102, arriba: 102, der: 898, abajo: 698 })));
        // La ventana se mueve: la valla la sigue.
        *cerrojo(&f.ventana) = Some(Rect { izq: 300, arriba: 200, der: 1100, abajo: 800 });
        hasta(|| f.vallas().last() == Some(&Some(Rect { izq: 302, arriba: 202, der: 1098, abajo: 798 })));
        assert_ne!(unsafe { PostThreadMessageW(tid, WM_HOTKEY, 1, 0) }, 0);
        assert_eq!(hilo.join().unwrap(), Some(Motivo::Atajo));
        assert_eq!(f.vallas().last(), Some(&None), "al acabar, el ratón queda suelto");
        assert_eq!(*cerrojo(&f.atajos), vec![true, false], "el atajo se coge al poner y se suelta al quitar");
    }

    #[test]
    fn se_suelta_sola_si_la_ventana_se_minimiza() {
        let f = Falso::nuevo(Some(Rect { izq: 100, arriba: 100, der: 900, abajo: 700 }), true);
        let (tid, hilo) = en_su_hilo(&f, Objetivo::Ventana(7));
        assert!(tid.is_ok());
        *cerrojo(&f.ventana) = None;
        assert_eq!(hilo.join().unwrap(), Some(Motivo::VentanaFuera));
        assert_eq!(f.vallas().last(), Some(&None));
    }

    #[test]
    fn quitarla_desde_fuera_la_suelta() {
        let f = Falso::nuevo(None, true);
        let (tid, hilo) = en_su_hilo(&f, Objetivo::Pantalla(PANTALLA));
        assert_ne!(unsafe { PostThreadMessageW(tid.unwrap(), WM_QUIT, 0, 0) }, 0);
        assert_eq!(hilo.join().unwrap(), Some(Motivo::Pedido));
        assert_eq!(f.vallas().first(), Some(&Some(PANTALLA)));
        assert_eq!(f.vallas().last(), Some(&None));
    }

    #[test]
    fn sin_el_atajo_no_se_pone() {
        let f = Falso::nuevo(None, false);
        let (tid, hilo) = en_su_hilo(&f, Objetivo::Pantalla(PANTALLA));
        assert!(tid.unwrap_err().contains("Ctrl+Alt+L"));
        assert_eq!(hilo.join().unwrap(), None);
        assert!(f.vallas().is_empty(), "sin forma de quitarla, ni se intenta");
    }

    #[test]
    fn una_ventana_que_no_esta_no_coge_el_atajo() {
        let f = Falso::nuevo(None, true);
        let (tid, hilo) = en_su_hilo(&f, Objetivo::Ventana(7));
        assert!(tid.unwrap_err().contains("ya no está"));
        assert_eq!(hilo.join().unwrap(), None);
        assert_eq!(*cerrojo(&f.atajos), vec![true, false], "lo cogió y lo devolvió");
    }

    /// Por el estado de Adeorq (`arrancar` y `quitar`), con el escritorio de mentira.
    #[test]
    fn el_estado_dice_la_que_hay() {
        let f = Falso::nuevo(None, true);
        let puesta = Puesta { pantalla: Some(2), ventana: None, nombre: "la pantalla 2".into() };
        arrancar(Box::new(f.clone()), Objetivo::Pantalla(PANTALLA), puesta).unwrap();
        assert_eq!(estado().puesta.and_then(|p| p.pantalla), Some(2));
        quitar();
        let e = estado();
        assert!(e.puesta.is_none());
        assert_eq!(e.motivo, Some(Motivo::Pedido));
        assert_eq!(f.vallas().last(), Some(&None));
    }

    /// Solo lee: las pantallas y las ventanas de este equipo, sin tocar nada.
    #[test]
    fn ve_las_pantallas_y_las_ventanas() {
        let p = escritorio::pantallas();
        assert!(!p.is_empty());
        assert_eq!(p.iter().filter(|p| p.principal).count(), 1, "{p:?}");
        assert!(p.iter().all(|p| p.ancho > 0 && p.alto > 0));
        assert!(p.windows(2).all(|d| d[0].rect.izq <= d[1].rect.izq), "de izquierda a derecha");
        assert!(escritorio::ventanas().iter().all(|v| !v.titulo.is_empty()));
    }

    fn valla_de_ahora() -> RECT {
        let mut r: RECT = unsafe { std::mem::zeroed() };
        assert_ne!(unsafe { GetClipCursor(&mut r) }, 0);
        r
    }

    /// `ClipCursor` de verdad, en un proceso hijo que se muda a su propia estación de
    /// ventanas: desde ahí Windows no le deja tocar el ratón de quien trabaja en el equipo.
    /// Comprueba las dos cosas: que el hijo recibe el error y que la valla de este equipo
    /// sigue igual que antes.
    #[test]
    fn en_otra_estacion_no_toca_tu_raton() {
        let antes = valla_de_ahora();
        let salida = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["valla::pruebas::desde_una_estacion_propia", "--exact", "--ignored", "--nocapture"])
            .env("ADEORQ_VALLA_PRUEBA", format!("{} {} {} {}", antes.left, antes.top, antes.right, antes.bottom))
            .output()
            .unwrap();
        let dijo = String::from_utf8_lossy(&salida.stdout);
        let despues = valla_de_ahora();
        assert!(salida.status.success() && dijo.contains("1 passed"), "{dijo}\n{}", String::from_utf8_lossy(&salida.stderr));
        if let Some(l) = dijo.lines().find(|l| l.starts_with("ClipCursor")) {
            println!("{l}");
        }
        assert_eq!(
            (antes.left, antes.top, antes.right, antes.bottom),
            (despues.left, despues.top, despues.right, despues.bottom),
            "la valla de este equipo cambió"
        );
    }

    #[test]
    #[ignore = "la lanza en_otra_estacion_no_toca_tu_raton, en un proceso aparte"]
    fn desde_una_estacion_propia() {
        // La misma valla que ya tiene el equipo (la pantalla entera si no hay ninguna):
        // aunque Windows la dejara pasar, no cambiaría nada para quien lo usa.
        let n: Vec<i32> = std::env::var("ADEORQ_VALLA_PRUEBA").unwrap().split(' ').map(|x| x.parse().unwrap()).collect();
        let la_de_ahora = Rect { izq: n[0], arriba: n[1], der: n[2], abajo: n[3] };
        unsafe {
            let estacion = CreateWindowStationW(std::ptr::null(), 0, TODO_EL_ACCESO, std::ptr::null());
            assert!(!estacion.is_null(), "sin estación propia esta prueba podría tocar el ratón de verdad");
            assert_ne!(SetProcessWindowStation(estacion), 0, "sin estación propia esta prueba podría tocar el ratón de verdad");
        }
        let r = escritorio::DeVerdad.vallar(Some(la_de_ahora));
        println!("ClipCursor desde una estación propia: {r:?}");
        // 1459 es ERROR_REQUIRES_INTERACTIVE_WINDOWSTATION, y 5 un acceso denegado.
        assert!(matches!(r, Err(1459) | Err(5)), "ClipCursor funcionó fuera de la estación de la sesión: {r:?}");
    }
}
