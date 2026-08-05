// What is playing and its controls, straight from Windows.
//
// Deliberately NOT the Spotify Web API: that would mean registering an app,
// an OAuth dance, storing tokens and a Premium account just to press "next".
// Windows already publishes the media session of whatever is playing (SMTC)
// and Core Audio exposes a per-app volume, so Adeorq asks the OS instead. It
// works with Spotify closed-source, with the browser, or with anything else.
use serde::Serialize;
use windows::core::Interface;
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    /// Which app owns the session, so the UI can say "Spotify" and no more.
    pub app: String,
    /// 0..100 for the app's own volume, None when it has no audio session.
    pub volume: Option<u8>,
}

async fn manager() -> Option<GlobalSystemMediaTransportControlsSessionManager> {
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .ok()?
        .await
        .ok()
}

/// Prefer Spotify when it has a session; otherwise whatever is in front.
async fn session() -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    let mgr = manager().await?;
    if let Ok(list) = mgr.GetSessions() {
        for s in list {
            let id = s
                .SourceAppUserModelId()
                .map(|i| i.to_string())
                .unwrap_or_default();
            if id.to_lowercase().contains("spotify") {
                return Some(s);
            }
        }
    }
    mgr.GetCurrentSession().ok()
}

fn friendly_app(id: &str) -> String {
    let low = id.to_lowercase();
    if low.contains("spotify") {
        "Spotify".into()
    } else if low.contains("chrome") || low.contains("brave") || low.contains("msedge") {
        "Navegador".into()
    } else {
        id.split('!').next_back().unwrap_or(id).replace(".exe", "")
    }
}

fn process_name(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            h,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(h);
        ok.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        Some(path.rsplit('\\').next()?.to_lowercase())
    }
}

/// Runs `f` with the audio session volume of the first process whose name
/// contains `needle` (spotify.exe). COM is initialised per call: these run on
/// Tauri's command threads, not on a single dedicated one.
fn with_app_volume<T>(needle: &str, f: impl FnOnce(&ISimpleAudioVolume) -> Option<T>) -> Option<T> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None).ok()?;
        let sessions = manager.GetSessionEnumerator().ok()?;
        for i in 0..sessions.GetCount().ok()? {
            let Ok(ctl) = sessions.GetSession(i) else {
                continue;
            };
            let Ok(ctl2) = ctl.cast::<IAudioSessionControl2>() else {
                continue;
            };
            let Ok(pid) = ctl2.GetProcessId() else {
                continue;
            };
            if process_name(pid).is_some_and(|n| n.contains(needle)) {
                if let Ok(vol) = ctl2.cast::<ISimpleAudioVolume>() {
                    return f(&vol);
                }
            }
        }
        None
    }
}

#[tauri::command]
pub async fn media_now() -> Option<NowPlaying> {
    let s = session().await?;
    let props = s.TryGetMediaPropertiesAsync().ok()?.await.ok()?;
    let title = props.Title().map(|t| t.to_string()).unwrap_or_default();
    if title.trim().is_empty() {
        return None;
    }
    let artist = props.Artist().map(|a| a.to_string()).unwrap_or_default();
    let playing = s
        .GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|st| st.0 == 4) // 4 = Playing
        .unwrap_or(false);
    let app = friendly_app(
        &s.SourceAppUserModelId()
            .map(|i| i.to_string())
            .unwrap_or_default(),
    );
    let volume = with_app_volume("spotify", |v| unsafe {
        v.GetMasterVolume().ok().map(|f| (f * 100.0).round() as u8)
    });
    Some(NowPlaying {
        title,
        artist,
        playing,
        app,
        volume,
    })
}

#[tauri::command]
pub async fn media_next() -> Result<(), String> {
    let s = session().await.ok_or("no hay nada sonando")?;
    s.TrySkipNextAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn media_prev() -> Result<(), String> {
    let s = session().await.ok_or("no hay nada sonando")?;
    s.TrySkipPreviousAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn media_playpause() -> Result<(), String> {
    let s = session().await.ok_or("no hay nada sonando")?;
    s.TryTogglePlayPauseAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets Spotify's own volume (0..100), leaving the rest of Windows alone.
#[tauri::command]
pub fn media_set_volume(percent: u8) -> Result<(), String> {
    let level = (percent.min(100) as f32) / 100.0;
    with_app_volume("spotify", |v| unsafe {
        v.SetMasterVolume(level, std::ptr::null()).ok().map(|_| ())
    })
    .ok_or_else(|| "Spotify no tiene sonido activo ahora mismo".to_owned())
}
