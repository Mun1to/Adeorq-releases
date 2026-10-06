// Avisos Web Push al móvil: que el conserje te avise aunque la página esté
// cerrada, cuando una sesión te pregunta algo o termina.
//
// Dos normas, y las dos se cumplen aquí sin librería de push por encima:
//
//   RFC 8291  cómo se cifra el aviso para que solo lo lea ese móvil: un secreto
//             compartido P-256 con la clave que dio el navegador, HKDF y
//             AES-128-GCM, con la cabecera `aes128gcm` de RFC 8188.
//   RFC 8292  cómo se firma la petición (VAPID): un JWT ES256 con la clave de
//             esta app, para que el servicio de push (el de Google, el de
//             Mozilla…) sepa de quién viene.
//
// El cifrado se comprueba contra el ejemplo de la propia RFC 8291 (apéndice A),
// byte a byte, y la firma se verifica con la clave pública: lo único que no
// se puede probar desde este PC es que el móvil de verdad lo reciba.

use base64::Engine;
use p256::ecdsa::signature::Signer;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;

/// A quién le pertenece esta app, para el servicio de push (`sub` del JWT).
const QUIEN: &str = "https://adeorq.com";
/// Cuánto guarda el servicio el aviso si el móvil está apagado.
const TTL_SEGUNDOS: u32 = 24 * 3600;

/// Lo que el navegador del móvil da al suscribirse.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Suscripcion {
    pub endpoint: String,
    /// La clave pública P-256 del móvil (`keys.p256dh`), en base64url.
    pub p256dh: String,
    /// El secreto de autenticación (`keys.auth`), en base64url.
    pub auth: String,
}

/// Las claves VAPID de esta instalación: una vez creadas no cambian, porque el
/// móvil se suscribe CON la pública y un cambio invalidaría la suscripción.
#[derive(Serialize, Deserialize)]
pub struct ClavesVapid {
    privada: String,
    pub publica: String,
}

impl ClavesVapid {
    fn nuevas() -> Result<Self, String> {
        let sk = clave_privada_nueva()?;
        let publica = sk.public_key().to_encoded_point(false);
        Ok(Self { privada: B64.encode(sk.to_bytes()), publica: B64.encode(publica.as_bytes()) })
    }

    fn secreta(&self) -> Result<p256::SecretKey, String> {
        let bytes = B64.decode(&self.privada).map_err(|e| e.to_string())?;
        p256::SecretKey::from_slice(&bytes).map_err(|e| e.to_string())
    }
}

fn clave_privada_nueva() -> Result<p256::SecretKey, String> {
    // Un escalar al azar vale casi siempre; si no, otro.
    for _ in 0..8 {
        let mut b = [0u8; 32];
        getrandom::fill(&mut b).map_err(|e| e.to_string())?;
        if let Ok(sk) = p256::SecretKey::from_slice(&b) {
            return Ok(sk);
        }
    }
    Err("no he podido crear una clave P-256".into())
}

fn ruta_claves() -> Result<std::path::PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("push-vapid.json"))
}

/// Las claves de esta app, creándolas la primera vez.
pub fn claves_vapid() -> Result<ClavesVapid, String> {
    let ruta = ruta_claves()?;
    if let Ok(texto) = std::fs::read_to_string(&ruta) {
        if let Ok(c) = serde_json::from_str::<ClavesVapid>(&texto) {
            if c.secreta().is_ok() {
                return Ok(c);
            }
        }
    }
    let c = ClavesVapid::nuevas()?;
    let tmp = ruta.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string(&c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &ruta).map_err(|e| e.to_string())?;
    Ok(c)
}

/// RFC 8291: el aviso cifrado para ESE móvil, con la cabecera de RFC 8188
/// delante (sal, tamaño de registro, y la clave pública de un solo uso).
pub fn cifrar(
    ua_publica: &[u8],
    auth: &[u8],
    texto: &[u8],
    as_secreta: &p256::SecretKey,
    sal: [u8; 16],
) -> Result<Vec<u8>, String> {
    use aes_gcm::aead::{Aead, KeyInit};
    use hkdf::Hkdf;

    let ua = p256::PublicKey::from_sec1_bytes(ua_publica).map_err(|_| "la clave del móvil no es una clave P-256")?;
    let as_publica = as_secreta.public_key().to_encoded_point(false);
    let secreto = p256::ecdh::diffie_hellman(as_secreta.to_nonzero_scalar(), ua.as_affine());

    // IKM = HKDF-Expand(HKDF-Extract(auth, ecdh_secret), "WebPush: info\0" || ua_public || as_public, 32)
    let mut info_clave = b"WebPush: info\0".to_vec();
    info_clave.extend_from_slice(ua_publica);
    info_clave.extend_from_slice(as_publica.as_bytes());
    let mut ikm = [0u8; 32];
    Hkdf::<Sha256>::new(Some(auth), secreto.raw_secret_bytes())
        .expand(&info_clave, &mut ikm)
        .map_err(|e| e.to_string())?;

    // CEK y nonce, de la sal.
    let hk = Hkdf::<Sha256>::new(Some(&sal), &ikm);
    let mut cek = [0u8; 16];
    hk.expand(b"Content-Encoding: aes128gcm\0", &mut cek).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; 12];
    hk.expand(b"Content-Encoding: nonce\0", &mut nonce).map_err(|e| e.to_string())?;

    // Un solo registro: el texto y el delimitador del último (0x02).
    let mut claro = texto.to_vec();
    claro.push(0x02);
    let cifrado = aes_gcm::Aes128Gcm::new((&cek).into())
        .encrypt(aes_gcm::Nonce::from_slice(&nonce), claro.as_slice())
        .map_err(|_| "no se pudo cifrar el aviso")?;

    // Cabecera RFC 8188: salt(16) | rs(4) | idlen(1) | keyid(65) | registros.
    let mut fuera = Vec::with_capacity(86 + cifrado.len());
    fuera.extend_from_slice(&sal);
    fuera.extend_from_slice(&4096u32.to_be_bytes());
    fuera.push(as_publica.as_bytes().len() as u8);
    fuera.extend_from_slice(as_publica.as_bytes());
    fuera.extend_from_slice(&cifrado);
    Ok(fuera)
}

/// RFC 8292: el JWT que dice al servicio de push que esto viene de esta app.
pub fn jwt_vapid(endpoint: &str, claves: &ClavesVapid, ahora: u64) -> Result<String, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|e| e.to_string())?;
    let aud = format!("{}://{}", url.scheme(), url.host_str().unwrap_or(""));
    let cabeza = B64.encode(br#"{"typ":"JWT","alg":"ES256"}"#);
    let cuerpo = B64.encode(
        serde_json::json!({ "aud": aud, "exp": ahora + 12 * 3600, "sub": QUIEN }).to_string(),
    );
    let firmable = format!("{cabeza}.{cuerpo}");
    let firma: p256::ecdsa::Signature = p256::ecdsa::SigningKey::from(&claves.secreta()?).sign(firmable.as_bytes());
    Ok(format!("{firmable}.{}", B64.encode(firma.to_bytes())))
}

fn ahora() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Lo que contesta el servicio de push.
#[derive(Debug, PartialEq)]
pub enum Entregado {
    /// Lo aceptó (201 o 200).
    Si,
    /// Esa suscripción ya no existe (404 o 410): hay que olvidarla.
    Caducada,
    /// Otra cosa, con el código.
    No(u16),
}

/// Manda un aviso a un móvil. El texto va como JSON con `titulo`, `cuerpo` y
/// `url`, que es lo que lee el service worker de `movil.html`.
pub async fn enviar(sub: &Suscripcion, titulo: &str, cuerpo: &str, url: &str) -> Result<Entregado, String> {
    let claves = claves_vapid()?;
    let ua_publica = B64.decode(&sub.p256dh).map_err(|_| "p256dh no es base64url")?;
    let auth = B64.decode(&sub.auth).map_err(|_| "auth no es base64url")?;
    let mut sal = [0u8; 16];
    getrandom::fill(&mut sal).map_err(|e| e.to_string())?;
    let carga = serde_json::json!({ "titulo": titulo, "cuerpo": cuerpo, "url": url }).to_string();
    // Una clave de un solo uso por aviso, como pide la RFC.
    let cuerpo_cifrado = cifrar(&ua_publica, &auth, carga.as_bytes(), &clave_privada_nueva()?, sal)?;
    let jwt = jwt_vapid(&sub.endpoint, &claves, ahora())?;

    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = cliente
        .post(&sub.endpoint)
        .header("Authorization", format!("vapid t={jwt}, k={}", claves.publica))
        .header("Content-Encoding", "aes128gcm")
        .header("Content-Type", "application/octet-stream")
        .header("TTL", TTL_SEGUNDOS.to_string())
        .header("Urgency", "high")
        .body(cuerpo_cifrado)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(match res.status().as_u16() {
        200 | 201 => Entregado::Si,
        404 | 410 => Entregado::Caducada,
        otro => Entregado::No(otro),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El ejemplo de RFC 8291, apéndice A, byte a byte.
    #[test]
    fn cifra_exactamente_como_el_ejemplo_de_la_rfc_8291() {
        let texto = B64.decode("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24").unwrap();
        assert_eq!(texto, b"When I grow up, I want to be a watermelon");
        let ua_publica = B64.decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4").unwrap();
        let auth = B64.decode("BTBZMqHH6r4Tts7J_aSIgg").unwrap();
        let as_privada = B64.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw").unwrap();
        let as_secreta = p256::SecretKey::from_slice(&as_privada).unwrap();
        assert_eq!(
            B64.encode(as_secreta.public_key().to_encoded_point(false).as_bytes()),
            "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"
        );
        let sal: [u8; 16] = B64.decode("DGv6ra1nlYgDCS1FRnbzlw").unwrap().try_into().unwrap();
        let fuera = cifrar(&ua_publica, &auth, &texto, &as_secreta, sal).unwrap();
        assert_eq!(
            B64.encode(&fuera),
            "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
        );
    }

    /// El JWT lleva lo que pide RFC 8292 y lo firma esta clave: se verifica con
    /// la pública, que es lo que hará el servicio de push.
    #[test]
    fn el_jwt_vapid_se_verifica_con_la_clave_publica_y_lleva_lo_que_pide_la_rfc() {
        use p256::ecdsa::signature::Verifier;
        let claves = ClavesVapid::nuevas().unwrap();
        let jwt = jwt_vapid("https://fcm.googleapis.com/fcm/send/abc123", &claves, 1_700_000_000).unwrap();
        let partes: Vec<&str> = jwt.split('.').collect();
        assert_eq!(partes.len(), 3);
        let cabeza: serde_json::Value = serde_json::from_slice(&B64.decode(partes[0]).unwrap()).unwrap();
        assert_eq!(cabeza["alg"], "ES256");
        let cuerpo: serde_json::Value = serde_json::from_slice(&B64.decode(partes[1]).unwrap()).unwrap();
        assert_eq!(cuerpo["aud"], "https://fcm.googleapis.com");
        assert_eq!(cuerpo["exp"], 1_700_000_000 + 12 * 3600);
        assert_eq!(cuerpo["sub"], QUIEN);
        let publica = p256::PublicKey::from_sec1_bytes(&B64.decode(&claves.publica).unwrap()).unwrap();
        let firma = p256::ecdsa::Signature::from_slice(&B64.decode(partes[2]).unwrap()).unwrap();
        p256::ecdsa::VerifyingKey::from(&publica)
            .verify(format!("{}.{}", partes[0], partes[1]).as_bytes(), &firma)
            .expect("la firma tiene que ser de esta clave");
    }

    /// Un aviso cifrado lo puede descifrar el móvil con su clave y nada más:
    /// se hace aquí el papel del móvil (RFC 8291 al revés).
    #[test]
    fn solo_el_movil_con_su_clave_lo_descifra() {
        use aes_gcm::aead::{Aead, KeyInit};
        use hkdf::Hkdf;
        let ua_secreta = clave_privada_nueva().unwrap();
        let ua_publica = ua_secreta.public_key().to_encoded_point(false).as_bytes().to_vec();
        let auth = [7u8; 16];
        let as_secreta = clave_privada_nueva().unwrap();
        let fuera = cifrar(&ua_publica, &auth, b"{\"titulo\":\"hola\"}", &as_secreta, [1u8; 16]).unwrap();

        let sal = &fuera[..16];
        let as_publica = &fuera[21..86];
        let cifrado = &fuera[86..];
        let as_pk = p256::PublicKey::from_sec1_bytes(as_publica).unwrap();
        let secreto = p256::ecdh::diffie_hellman(ua_secreta.to_nonzero_scalar(), as_pk.as_affine());
        let mut info = b"WebPush: info\0".to_vec();
        info.extend_from_slice(&ua_publica);
        info.extend_from_slice(as_publica);
        let mut ikm = [0u8; 32];
        Hkdf::<Sha256>::new(Some(&auth), secreto.raw_secret_bytes()).expand(&info, &mut ikm).unwrap();
        let hk = Hkdf::<Sha256>::new(Some(sal), &ikm);
        let mut cek = [0u8; 16];
        hk.expand(b"Content-Encoding: aes128gcm\0", &mut cek).unwrap();
        let mut nonce = [0u8; 12];
        hk.expand(b"Content-Encoding: nonce\0", &mut nonce).unwrap();
        let claro = aes_gcm::Aes128Gcm::new((&cek).into()).decrypt(aes_gcm::Nonce::from_slice(&nonce), cifrado).unwrap();
        assert_eq!(&claro, b"{\"titulo\":\"hola\"}\x02");

        // Con otra clave de móvil no sale nada.
        let otra = clave_privada_nueva().unwrap();
        let secreto2 = p256::ecdh::diffie_hellman(otra.to_nonzero_scalar(), as_pk.as_affine());
        let mut ikm2 = [0u8; 32];
        Hkdf::<Sha256>::new(Some(&auth), secreto2.raw_secret_bytes()).expand(&info, &mut ikm2).unwrap();
        let hk2 = Hkdf::<Sha256>::new(Some(sal), &ikm2);
        let mut cek2 = [0u8; 16];
        hk2.expand(b"Content-Encoding: aes128gcm\0", &mut cek2).unwrap();
        let mut nonce2 = [0u8; 12];
        hk2.expand(b"Content-Encoding: nonce\0", &mut nonce2).unwrap();
        assert!(aes_gcm::Aes128Gcm::new((&cek2).into()).decrypt(aes_gcm::Nonce::from_slice(&nonce2), cifrado).is_err());
    }
}
