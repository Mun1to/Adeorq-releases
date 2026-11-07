// La llave del escudo: Windows Hello firma y la llave pública comprueba.
//
// Lo único que un agente engañado no puede hacer con el usuario de Munir es
// firmar con esta llave: la privada vive en el TPM y cada firma pide el PIN o
// la huella en el cuadro seguro de Windows (`docs/contexto/escudo.md`, «Por qué
// la firma es del PIN de Windows»). Por eso aquí no hay ningún camino que firme
// sin ese cuadro en la Adeorq que se publica.
//
// En desarrollo, y solo con `ADEORQ_ESCUDO_FIRMA_DE_PRUEBA` puesta, firma una
// llave RSA de software (módulo `prueba`) para poder probar la ventana entera sin
// el PIN de Munir. Ese módulo no existe en la release: `cfg(debug_assertions)`.

/// El nombre de la credencial en Windows Hello. El gancho no lo usa (solo
/// tiene la llave pública), pero quien la busque en el equipo, sí.
pub const CREDENCIAL: &str = "Adeorq Escudo";

#[cfg(windows)]
mod en_windows {
    use super::CREDENCIAL;
    use windows::core::HSTRING;
    use windows::Security::Credentials::{KeyCredential, KeyCredentialCreationOption, KeyCredentialManager, KeyCredentialStatus};
    use windows::Security::Cryptography::Core::{AsymmetricAlgorithmNames, AsymmetricKeyAlgorithmProvider, CryptographicEngine, CryptographicPublicKeyBlobType};
    use windows::Security::Cryptography::CryptographicBuffer;
    use windows::Storage::Streams::IBuffer;
    use windows::Win32::System::Com::{CoIncrementMTAUsage, CoInitializeEx, COINIT_MULTITHREADED};

    /// El hilo de un comando no trae COM puesto; si ya lo tenía de otra forma,
    /// da igual (como en `autostart.rs`).
    ///
    /// Y el apartamento de COM se queda vivo hasta que se cierre Adeorq. Sin
    /// eso, cuando morían todos los hilos que lo habían abierto (los de los
    /// comandos mueren solos al rato), Windows lo desmontaba, y el crate
    /// `windows` seguía usando las fábricas que había guardado de él: la firma
    /// siguiente era un acceso a memoria inválida. Medido con dos pruebas
    /// seguidas (`el_protocolo_de_punta_a_punta` y luego `la_firma_de_prueba…`):
    /// juntas, el proceso caía; cada una sola, no.
    pub(super) fn com() {
        static VIVO: std::sync::OnceLock<()> = std::sync::OnceLock::new();
        VIVO.get_or_init(|| {
            // SAFETY: solo sube la cuenta del apartamento; la galleta se
            // pierde a propósito para que nunca baje.
            let _ = unsafe { CoIncrementMTAUsage() };
        });
        // SAFETY: inicializar COM en el hilo actual no toca memoria de nadie.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    }

    pub(super) fn buffer(bytes: &[u8]) -> Result<IBuffer, String> {
        CryptographicBuffer::CreateFromByteArray(bytes).map_err(|e| e.to_string())
    }

    pub(super) fn bytes(b: &IBuffer) -> Result<Vec<u8>, String> {
        let mut arr = windows::core::Array::<u8>::new();
        CryptographicBuffer::CopyToByteArray(b, &mut arr).map_err(|e| e.to_string())?;
        Ok(arr.to_vec())
    }

    /// Lo que dice cada estado de Windows Hello, en frases para Munir.
    fn que_paso(s: KeyCredentialStatus) -> String {
        match s {
            KeyCredentialStatus::UserCanceled => "Has cancelado el PIN de Windows.".into(),
            KeyCredentialStatus::NotFound => "La llave de Windows Hello todavía no existe: créala en Ajustes › Escudo.".into(),
            KeyCredentialStatus::UserPrefersPassword => "Windows ha pedido la contraseña en vez del PIN, y el escudo solo firma con el PIN o la huella.".into(),
            KeyCredentialStatus::SecurityDeviceLocked => "El chip de seguridad del equipo está bloqueado por demasiados intentos. Espera un rato y vuelve a probar.".into(),
            KeyCredentialStatus::CredentialAlreadyExists => "La llave ya existía.".into(),
            otro => format!("Windows Hello no ha podido firmar (código {}).", otro.0),
        }
    }

    pub fn disponible() -> Result<bool, String> {
        com();
        KeyCredentialManager::IsSupportedAsync()
            .and_then(|a| a.join())
            .map_err(|e| format!("no he podido preguntar a Windows Hello: {e}"))
    }

    fn abrir() -> Result<KeyCredential, String> {
        com();
        let r = KeyCredentialManager::OpenAsync(&HSTRING::from(CREDENCIAL))
            .and_then(|a| a.join())
            .map_err(|e| format!("no he podido abrir la llave de Windows Hello: {e}"))?;
        match r.Status().map_err(|e| e.to_string())? {
            KeyCredentialStatus::Success => r.Credential().map_err(|e| e.to_string()),
            otro => Err(que_paso(otro)),
        }
    }

    /// Crear la llave (o abrir la que ya hay) y devolver su parte pública en
    /// SubjectPublicKeyInfo DER, que es lo que lee el gancho. Crearla pide el PIN.
    pub fn crear() -> Result<Vec<u8>, String> {
        if !disponible()? {
            return Err("Windows Hello no está puesto en este equipo: ponle un PIN en Configuración › Cuentas › Opciones de inicio de sesión.".into());
        }
        let r = super::al_frente_mientras(|| {
            KeyCredentialManager::RequestCreateAsync(&HSTRING::from(CREDENCIAL), KeyCredentialCreationOption::FailIfExists)
                .and_then(|a| a.join())
                .map_err(|e| format!("Windows Hello no ha podido crear la llave: {e}"))
        })?;
        let llave = match r.Status().map_err(|e| e.to_string())? {
            KeyCredentialStatus::Success => r.Credential().map_err(|e| e.to_string())?,
            KeyCredentialStatus::CredentialAlreadyExists => abrir()?,
            otro => return Err(que_paso(otro)),
        };
        let publica = llave
            .RetrievePublicKeyWithBlobType(CryptographicPublicKeyBlobType::X509SubjectPublicKeyInfo)
            .map_err(|e| format!("no he podido leer la llave pública: {e}"))?;
        bytes(&publica)
    }

    /// Firmar con el PIN: RSASSA-PKCS1-v1_5 con SHA-256 sobre `mensaje`, que es
    /// lo que hace `RequestSignAsync`.
    pub fn firmar(mensaje: &[u8]) -> Result<Vec<u8>, String> {
        let llave = abrir()?;
        let datos = buffer(mensaje)?;
        let r = super::al_frente_mientras(|| {
            llave
                .RequestSignAsync(&datos)
                .and_then(|a| a.join())
                .map_err(|e| format!("Windows Hello no ha podido firmar: {e}"))
        })?;
        match r.Status().map_err(|e| e.to_string())? {
            KeyCredentialStatus::Success => bytes(&r.Result().map_err(|e| e.to_string())?),
            otro => Err(que_paso(otro)),
        }
    }

    /// Si `firma` es de `mensaje` con la llave pública `publica` (DER). Es la
    /// misma cuenta que hace el gancho: si aquí no casa, allí tampoco.
    pub fn comprobar(publica: &[u8], mensaje: &[u8], firma: &[u8]) -> Result<bool, String> {
        com();
        let rsa = AsymmetricAlgorithmNames::RsaSignPkcs1Sha256().map_err(|e| e.to_string())?;
        let prov = AsymmetricKeyAlgorithmProvider::OpenAlgorithm(&rsa).map_err(|e| e.to_string())?;
        let llave = prov
            .ImportPublicKeyWithBlobType(&buffer(publica)?, CryptographicPublicKeyBlobType::X509SubjectPublicKeyInfo)
            .map_err(|e| format!("la llave pública no se entiende: {e}"))?;
        // Una firma de otro tamaño hace fallar la llamada en vez de dar `false`:
        // para quien pregunta es lo mismo, no vale.
        Ok(CryptographicEngine::VerifySignature(&llave, &buffer(mensaje)?, &buffer(firma)?).unwrap_or(false))
    }

    /// El cuadro del PIN puede salir DETRÁS de una app de escritorio (lo cuenta
    /// KeePassWinHello, que lo arregla igual): mientras dura `f`, se busca la
    /// ventana de ese cuadro y se trae al frente.
    pub fn traer_el_cuadro(hecho: &std::sync::atomic::AtomicBool) {
        use std::sync::atomic::Ordering;
        use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, GetForegroundWindow, SetForegroundWindow};
        let clase: Vec<u16> = "Credential Dialog Xaml Host".encode_utf16().chain(Some(0)).collect();
        let fin = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !hecho.load(Ordering::SeqCst) && std::time::Instant::now() < fin {
            // SAFETY: la cadena acaba en cero y vive toda la llamada; las otras
            // dos solo miran y piden el foco para una ventana que existe.
            unsafe {
                let w = FindWindowW(clase.as_ptr(), std::ptr::null());
                if !w.is_null() && GetForegroundWindow() != w {
                    SetForegroundWindow(w);
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
    }
}

/// Mientras corre `f` (que espera al cuadro de Windows Hello), un hilo al lado
/// trae ese cuadro al frente si sale detrás.
#[cfg(windows)]
fn al_frente_mientras<T>(f: impl FnOnce() -> T) -> T {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    let hecho = Arc::new(AtomicBool::new(false));
    let vigia = {
        let hecho = hecho.clone();
        std::thread::spawn(move || en_windows::traer_el_cuadro(&hecho))
    };
    let r = f();
    hecho.store(true, Ordering::SeqCst);
    let _ = vigia.join();
    r
}

/// Si este equipo tiene Windows Hello puesto. `None` fuera de Windows.
pub fn disponible() -> Option<bool> {
    #[cfg(windows)]
    {
        #[cfg(debug_assertions)]
        if prueba::activo() {
            return Some(true);
        }
        en_windows::disponible().ok()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Crear la llave y devolver su parte pública (DER).
pub fn crear() -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        #[cfg(debug_assertions)]
        if prueba::activo() {
            return prueba::publica();
        }
        en_windows::crear()
    }
    #[cfg(not(windows))]
    {
        Err("el escudo solo funciona en Windows".into())
    }
}

/// Firmar `mensaje`. En la release, siempre con el cuadro de Windows Hello.
pub fn firmar(mensaje: &[u8]) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        #[cfg(debug_assertions)]
        if prueba::activo() {
            return prueba::firmar(mensaje);
        }
        en_windows::firmar(mensaje)
    }
    #[cfg(not(windows))]
    {
        let _ = mensaje;
        Err("el escudo solo funciona en Windows".into())
    }
}

/// Si `firma` es de `mensaje` con la llave pública `publica` (DER).
pub fn comprobar(publica: &[u8], mensaje: &[u8], firma: &[u8]) -> Result<bool, String> {
    #[cfg(windows)]
    {
        en_windows::comprobar(publica, mensaje, firma)
    }
    #[cfg(not(windows))]
    {
        let _ = (publica, mensaje, firma);
        Err("el escudo solo funciona en Windows".into())
    }
}

/// Cómo se llama el archivo de la llave pública que exporta esta Adeorq. Con el
/// firmante de prueba, otro nombre: una llave de software cuya privada está en
/// el disco NUNCA puede acabar copiada a Archivos de programa por
/// `escudo/instalar.mjs`, que copia `llave-publica.der`.
pub fn archivo_de_la_publica() -> &'static str {
    #[cfg(all(windows, debug_assertions))]
    if prueba::activo() {
        return "llave-publica-de-prueba.der";
    }
    "llave-publica.der"
}

/// Si esta Adeorq está firmando con la llave de prueba (solo en desarrollo).
pub fn de_prueba() -> bool {
    #[cfg(all(windows, debug_assertions))]
    {
        prueba::activo()
    }
    #[cfg(not(all(windows, debug_assertions)))]
    {
        false
    }
}

/// El firmante de software, para probar sin el PIN de Munir. Solo existe en
/// desarrollo y en los tests: la prueba de que no está en la release es buscar
/// `AVISO` en el binario de release (ver `docs/contexto/escudo.md`).
#[cfg(all(windows, debug_assertions))]
pub mod prueba {
    use super::en_windows::{buffer, bytes, com};
    use windows::Security::Cryptography::Core::{
        AsymmetricAlgorithmNames, AsymmetricKeyAlgorithmProvider, CryptographicEngine, CryptographicKey, CryptographicPrivateKeyBlobType,
        CryptographicPublicKeyBlobType,
    };

    /// Una marca que solo vive en este módulo: si aparece en el binario de
    /// release, el firmante de prueba se ha colado en lo que se publica.
    pub const AVISO: &str = "FIRMANTE-DE-PRUEBA-DEL-ESCUDO-NO-PUBLICAR";

    pub fn activo() -> bool {
        std::env::var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA").is_ok_and(|v| v == "1")
    }

    fn proveedor() -> Result<AsymmetricKeyAlgorithmProvider, String> {
        com();
        let rsa = AsymmetricAlgorithmNames::RsaSignPkcs1Sha256().map_err(|e| e.to_string())?;
        AsymmetricKeyAlgorithmProvider::OpenAlgorithm(&rsa).map_err(|e| e.to_string())
    }

    /// La llave de prueba: la que ya hay en la carpeta del escudo o una nueva.
    fn llave() -> Result<CryptographicKey, String> {
        let ruta = super::super::carpeta()?.join("llave-de-prueba.p8");
        let prov = proveedor()?;
        if let Ok(guardada) = std::fs::read(&ruta) {
            return prov
                .ImportKeyPairWithBlobType(&buffer(&guardada)?, CryptographicPrivateKeyBlobType::Pkcs8RawPrivateKeyInfo)
                .map_err(|e| format!("{AVISO}: {e}"));
        }
        let nueva = prov.CreateKeyPair(2048).map_err(|e| e.to_string())?;
        let privada = nueva
            .ExportPrivateKeyWithBlobType(CryptographicPrivateKeyBlobType::Pkcs8RawPrivateKeyInfo)
            .map_err(|e| e.to_string())?;
        if let Some(d) = ruta.parent() {
            std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
        }
        std::fs::write(&ruta, bytes(&privada)?).map_err(|e| e.to_string())?;
        Ok(nueva)
    }

    pub fn publica() -> Result<Vec<u8>, String> {
        let k = llave()?;
        bytes(&k.ExportPublicKeyWithBlobType(CryptographicPublicKeyBlobType::X509SubjectPublicKeyInfo).map_err(|e| e.to_string())?)
    }

    pub fn firmar(mensaje: &[u8]) -> Result<Vec<u8>, String> {
        let k = llave()?;
        bytes(&CryptographicEngine::Sign(&k, &buffer(mensaje)?).map_err(|e| e.to_string())?)
    }
}
