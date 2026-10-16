// La cuota de los CLIs que NO son Claude.
//
// El panel de uso solo sabía leer Claude, así que trabajar con Codex era
// hacerlo sin ver el depósito (Munir, 2026-08-24: «en uso solo sale el de
// claude, haz que salga el de todos tus proveedores y cuentas»). Y no es que
// los demás no lo publiquen: es que cada uno lo publica a su manera.
//
// ── LO QUE SE COMPROBÓ EN ESTA MÁQUINA (2026-08-24) ───────────────────────
//
// Leyendo las carpetas de verdad de cada CLI, uno por uno:
//
//   codex     SÍ, y gratis. Cada turno escribe en su rollout un evento
//             `token_count` con un bloque `rate_limits` dentro: `used_percent`,
//             `window_minutes`, `resets_at` (epoch en segundos) y `plan_type`.
//             Es EXACTAMENTE lo que `/usage` le saca a Claude, pero ya en el
//             disco: no hay que lanzar ningún proceso ni esperar cinco segundos.
//   opencode  Tiene el dato y mejor que nadie (guarda el COSTE en dólares por
//             mensaje), pero dentro de un SQLite (`opencode.db`). Leerlo
//             obligaría a compilar SQLite entero dentro de Adeorq para pintar
//             dos números. Aparcado con su condición: entra el día que haya
//             otra cosa en la app que necesite SQLite, y entonces sale gratis.
//   gemini    NO. Su `~/.gemini/tmp/<proyecto>/logs.json` estaba vacío y no
//             guarda ni tokens ni cuota en ninguna parte de su carpeta.
//   qwen      NO. Su carpeta solo tiene extensiones, skills y el id de
//             instalación.
//   copilot   NO a la vista. Solo deja logs de proceso, sin cuota dentro.
//             PERO SE PREGUNTA (2026-10-15): su CLI tiene un modo headless que
//             habla JSON-RPC y contesta `account.getQuota` con su propio login
//             (`cuota_de_copilot`, abajo). Adeorq no toca ningún token.
//   gemini    Su cuota solo sale de una API interna de Google con el token del
//             CLI, y Google prohíbe por escrito usarlo desde otro programa, con
//             suspensión de la cuenta (`docs/resources/tos-privacy.md` del
//             repo `google-gemini/gemini-cli`). No se hace.
//   cursor    NO a la vista. Guarda los chats, no el gasto.
//
// El resto no están instalados aquí, así que no se dice nada de ellos: una
// columna inventada en este panel es peor que un hueco, porque un hueco se ve.
//
// Vuelto a mirar el 2026-10-07: Gemini CLI 0.52.0 sigue sin guardar tokens ni
// cuota en `~/.gemini` (ni en `tmp/<proyecto>/chats`, ni en `logs.json`, ni en
// `state.json`), y Kimi Code no tiene carpeta en esta máquina, así que no hay
// nada que leer de él todavía.
//
// La regla de la casa que esto respeta es la de siempre: se guarda por lo que
// el CLI SABE HACER (`usage` en `providers.ts`), no por su nombre, así que
// añadir el siguiente es escribir su lector aquí y encender su columna allí.

use crate::usage::{LimitLine, Limits};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// La carpeta de un CLI. `config_dir` la mueve (es lo que hace una cuenta
/// aparte); vacío significa la suya de siempre, bajo el perfil del usuario.
fn raiz(config_dir: Option<&str>, por_defecto: &str) -> Option<PathBuf> {
    match config_dir {
        Some(dir) if !dir.trim().is_empty() => Some(PathBuf::from(dir)),
        _ => std::env::var("USERPROFILE")
            .ok()
            .map(|h| Path::new(&h).join(por_defecto)),
    }
}

/// Cómo se llama una ventana de cuota, en las palabras que el panel ya traduce.
///
/// Codex no la nombra: da los minutos y ya. Y los minutos que da son reales de
/// esta máquina (43.200 = treinta días en el plan gratuito), así que la ventana
/// no se puede dar por supuesta ni cablear a «5 horas» como hace su propia
/// interfaz. Se traduce a las tres que el panel sabe decir.
fn ventana(minutos: u64) -> &'static str {
    if minutos <= 6 * 60 {
        "Current session"
    } else if minutos <= 10 * 24 * 60 {
        "Current week"
    } else {
        "Current month"
    }
}

/// Un `rate_limits` de Codex, ya convertido a las líneas del panel.
///
/// Una ventana cuya renovación ya pasó se da por RENOVADA: 0 % y la renovación
/// siguiente, la vieja más tantas ventanas como hagan falta para llegar al
/// futuro. Codex solo reescribe este bloque cuando trabaja, así que su última
/// foto se queda en el disco tal cual; y con ella en 100 %, el freno de los
/// encargos programados no le dejaba trabajar nunca más (2026-10-16: una hora
/// después de renovarse, Adeorq seguía leyendo «Current month · 100 %» y la
/// prueba de `programado-codex-de-verdad.mjs` se saltaba).
fn lineas_de(rate: &Value, ahora_ms: i64) -> Vec<LimitLine> {
    let mut out = Vec::new();
    for clave in ["primary", "secondary"] {
        let Some(v) = rate.get(clave).filter(|v| !v.is_null()) else {
            continue;
        };
        let Some(pct) = v.get("used_percent").and_then(Value::as_f64) else {
            continue;
        };
        let minutos = v
            .get("window_minutes")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        // `resets_at` viene en SEGUNDOS y el panel cuenta en milisegundos. Una
        // renovación mil veces más cerca de lo que toca se lee como «en 1 min»
        // y no chirría: por eso el factor va aquí y no en quien lo pinta.
        let mut resets_at = v
            .get("resets_at")
            .and_then(Value::as_i64)
            .map(|s| s * 1000)
            .unwrap_or(0);
        let mut percent = pct.round().clamp(0.0, 100.0) as u8;
        if resets_at > 0 && resets_at <= ahora_ms {
            percent = 0;
            let ventana_ms = i64::try_from(minutos).unwrap_or(0) * 60_000;
            resets_at = if ventana_ms > 0 {
                resets_at + ((ahora_ms - resets_at) / ventana_ms + 1) * ventana_ms
            } else {
                0
            };
        }
        out.push(LimitLine {
            label: ventana(minutos).to_owned(),
            percent,
            resets: String::new(),
            resets_at,
        });
    }
    out
}

/// Los rollouts de Codex, del más reciente al más viejo.
///
/// Están en `sessions/AAAA/MM/DD/rollout-<fecha>-<id>.jsonl`, y el nombre lleva
/// la fecha delante, así que ordenar por nombre ordena por tiempo sin tener que
/// preguntarle al disco por cada archivo.
fn rollouts(raiz: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let base = raiz.join("sessions");
    let Ok(anos) = std::fs::read_dir(&base) else {
        return out;
    };
    for ano in anos.flatten().filter(|e| e.path().is_dir()) {
        let Ok(meses) = std::fs::read_dir(ano.path()) else {
            continue;
        };
        for mes in meses.flatten().filter(|e| e.path().is_dir()) {
            let Ok(dias) = std::fs::read_dir(mes.path()) else {
                continue;
            };
            for dia in dias.flatten().filter(|e| e.path().is_dir()) {
                let Ok(files) = std::fs::read_dir(dia.path()) else {
                    continue;
                };
                out.extend(
                    files
                        .flatten()
                        .map(|f| f.path())
                        .filter(|p| p.extension().is_some_and(|e| e == "jsonl")),
                );
            }
        }
    }
    out.sort();
    out.reverse();
    out
}

/// Cuántos rollouts se miran hacia atrás buscando una cuota.
///
/// Una sesión de Codex puede acabar sin ningún `token_count` (la abres y la
/// cierras), así que mirar solo el último archivo deja el panel en blanco por
/// nada. Doce es un día largo de trabajo y sigue siendo leer doce archivos, que
/// en disco no se nota.
const MIRAR_ATRAS: usize = 12;

/// La última cuota que Codex apuntó, leída de su propio rastro.
///
/// Se lee de ATRÁS hacia delante dentro de cada archivo: el bloque bueno es el
/// último que escribió, y un rollout de una sesión larga tiene cientos.
fn cuota_de_codex(config_dir: Option<&str>) -> Result<Limits, String> {
    let raiz = raiz(config_dir, ".codex").ok_or("no encuentro tu carpeta de usuario")?;
    if !raiz.is_dir() {
        return Err("Codex no ha escrito nada en esta máquina todavía".into());
    }
    let mut plan = String::new();
    for archivo in rollouts(&raiz).into_iter().take(MIRAR_ATRAS) {
        let Ok(texto) = std::fs::read_to_string(&archivo) else {
            continue;
        };
        for linea in texto.lines().rev() {
            if !linea.contains("rate_limits") {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(linea) else {
                continue;
            };
            let Some(rate) = v
                .get("payload")
                .and_then(|p| p.get("rate_limits"))
                .filter(|r| !r.is_null())
            else {
                continue;
            };
            let ahora_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
                .unwrap_or(0);
            let lineas = lineas_de(rate, ahora_ms);
            if lineas.is_empty() {
                continue;
            }
            if let Some(p) = rate.get("plan_type").and_then(Value::as_str) {
                plan = p.to_owned();
            }
            return Ok(Limits {
                lines: lineas,
                note: String::new(),
                plan,
            });
        }
    }
    Err("Codex no ha apuntado ninguna cuota todavía: abre una sesión y pregúntale algo".into())
}

/// Las líneas de una respuesta de `account.getQuota` de Copilot.
///
/// `remainingPercentage` es lo que QUEDA y el panel pinta lo usado. Lo que no
/// tiene tope (`isUnlimitedEntitlement`, o `entitlementRequests` a -1) o no
/// entra en el plan (cero peticiones y `hasQuota` falso, el «premium» del plan
/// gratuito) no se pinta: una barra al 0 % o al 100 % ahí sería un número
/// inventado. La renovación solo se da si es futura; la del plan gratuito
/// llegó con la hora de la propia pregunta (medido el 2026-10-15).
fn lineas_de_copilot(resultado: &Value, ahora_s: u64) -> Vec<LimitLine> {
    let Some(cubos) = resultado.get("quotaSnapshots").and_then(Value::as_object) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (clave, nombre) in [("premium_interactions", "Premium"), ("chat", "Chat"), ("completions", "Completions")] {
        let Some(c) = cubos.get(clave) else {
            continue;
        };
        let derecho = c.get("entitlementRequests").and_then(Value::as_i64).unwrap_or(0);
        let ilimitado = c.get("isUnlimitedEntitlement").and_then(Value::as_bool).unwrap_or(false) || derecho < 0;
        let fuera_del_plan = derecho == 0 && !c.get("hasQuota").and_then(Value::as_bool).unwrap_or(true);
        let Some(queda) = c.get("remainingPercentage").and_then(Value::as_f64) else {
            continue;
        };
        if ilimitado || fuera_del_plan {
            continue;
        }
        let renueva = c
            .get("resetDate")
            .and_then(Value::as_str)
            .and_then(|s| crate::sessions::iso_a_segundos(&format!("{}Z", s.trim_end_matches('Z'))))
            .filter(|&s| s > ahora_s + 60)
            .map(|s| s as i64 * 1000)
            .unwrap_or(0);
        out.push(LimitLine {
            label: format!("Current month ({nombre})"),
            percent: (100.0 - queda).round().clamp(0.0, 100.0) as u8,
            resets: String::new(),
            resets_at: renueva,
        });
    }
    out
}

/// Cuánto le queda a Copilot, preguntándoselo a su propio CLI.
///
/// `copilot --headless --stdio` es el modo que usa su SDK oficial: JSON-RPC
/// con tramas `Content-Length`, como un servidor de lenguaje. Se saluda con
/// `connect` y se pide `account.getQuota`, que contesta con el login del CLI:
/// Adeorq no lee ni pasa ningún token. Unos dos segundos, y sin gastar nada
/// (medido con la 1.0.75 el 2026-10-15). Al acabar se mata la rama entera,
/// que en Windows el CLI es un `node` debajo de un `cmd`.
fn cuota_de_copilot() -> Result<Limits, String> {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::process::{Command, Stdio};
    use std::time::Duration;
    use crate::SinVentana;

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/c", "copilot"]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new("copilot");
    let mut hijo = cmd
        .args(["--headless", "--no-auto-update", "--stdio"])
        .sin_ventana()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("no pude lanzar copilot: {e}"))?;
    let mut entrada = hijo.stdin.take().ok_or("copilot no abrió su entrada")?;
    let salida = hijo.stdout.take().ok_or("copilot no abrió su salida")?;

    // Las tramas se leen en otro hilo, para poder dejar de esperar.
    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    std::thread::spawn(move || {
        let mut r = BufReader::new(salida);
        loop {
            let mut largo = None;
            loop {
                let mut linea = String::new();
                if r.read_line(&mut linea).unwrap_or(0) == 0 {
                    return;
                }
                let linea = linea.trim();
                if linea.is_empty() {
                    break;
                }
                if let Some(n) = linea.strip_prefix("Content-Length:") {
                    largo = n.trim().parse::<usize>().ok();
                }
            }
            let Some(n) = largo.filter(|&n| n <= 1 << 20) else {
                return;
            };
            let mut cuerpo = vec![0; n];
            if r.read_exact(&mut cuerpo).is_err() {
                return;
            }
            if let Ok(v) = serde_json::from_slice::<Value>(&cuerpo) {
                if tx.send(v).is_err() {
                    return;
                }
            }
        }
    });

    let hasta = std::time::Instant::now() + Duration::from_secs(20);
    let mut pedir = |id: u64, metodo: &str, params: Value| -> Result<Value, String> {
        let cuerpo = serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": metodo, "params": params }).to_string();
        write!(entrada, "Content-Length: {}\r\n\r\n{}", cuerpo.len(), cuerpo).map_err(|e| e.to_string())?;
        entrada.flush().map_err(|e| e.to_string())?;
        loop {
            let queda = hasta.saturating_duration_since(std::time::Instant::now());
            let m = rx.recv_timeout(queda).map_err(|_| "copilot no contestó a tiempo".to_string())?;
            if m.get("id").and_then(Value::as_u64) != Some(id) {
                continue; // un aviso suyo, no la respuesta
            }
            if let Some(e) = m.get("error") {
                return Err(format!("copilot dijo: {}", e.get("message").and_then(Value::as_str).unwrap_or("error")));
            }
            return Ok(m.get("result").cloned().unwrap_or(Value::Null));
        }
    };
    let respuesta = pedir(1, "connect", serde_json::json!({}))
        .and_then(|_| pedir(2, "account.getQuota", serde_json::json!({})));

    #[cfg(windows)]
    let _ = Command::new("taskkill")
        .args(["/PID", &hijo.id().to_string(), "/T", "/F"])
        .sin_ventana()
        .output();
    let _ = hijo.kill();
    let _ = hijo.wait();

    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let lineas = lineas_de_copilot(&respuesta?, ahora);
    if lineas.is_empty() {
        return Err("Copilot no tiene ningún límite que contar en tu plan".into());
    }
    Ok(Limits {
        lines: lineas,
        note: String::new(),
        plan: String::new(),
    })
}

/// La cuota de un cliente cualquiera que no sea Claude.
///
/// Devuelve el MISMO tipo que Claude a propósito: el panel tiene un solo camino
/// para pintar una barra de porcentaje, y en cuanto hubiera dos empezarían a
/// diferenciarse solos. Lo que cambia entre clientes es de dónde sale el
/// número, y eso se queda aquí dentro.
#[tauri::command(async)]
pub async fn usage_of(provider: String, config_dir: Option<String>) -> Result<Limits, String> {
    match provider.as_str() {
        "codex" => cuota_de_codex(config_dir.as_deref()),
        // Lanza un proceso y espera hasta dos segundos: fuera del hilo de Tauri.
        "copilot" => tauri::async_runtime::spawn_blocking(cuota_de_copilot)
            .await
            .map_err(|e| e.to_string())?,
        // Ni un `Ok` vacío ni un cero: quien no publica su cuota lo dice con
        // estas palabras, y el panel las enseña. Un 0 % sería mentir con un
        // número, que es la única mentira que en este panel no se perdona.
        otro => Err(format!("{otro} no publica su cuota en el disco")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La cuota de Codex, contra la carpeta de verdad de esta máquina.
    ///
    /// En `#[ignore]` porque depende de que Codex haya trabajado aquí alguna
    /// vez, que es cierto en la máquina de Munir y no tiene por qué serlo en la
    /// de nadie más:
    /// `cargo test --lib la_cuota_de_codex -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn la_cuota_de_codex() {
        match cuota_de_codex(None) {
            Ok(l) => {
                println!("\nplan: {}", if l.note.is_empty() { "?" } else { &l.note });
                for x in &l.lines {
                    println!("  {} · {}% · resets_at {}", x.label, x.percent, x.resets_at);
                }
                assert!(!l.lines.is_empty(), "no salió ninguna línea");
            }
            Err(e) => println!("\nsin cuota: {e}"),
        }
    }

    /// La de Copilot, preguntada a su CLI de verdad en esta máquina (solo lee):
    /// `cargo test --lib la_cuota_de_copilot -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn la_cuota_de_copilot() {
        let t = std::time::Instant::now();
        let l = cuota_de_copilot().expect("copilot tenía que contestar");
        println!("\nen {:?}", t.elapsed());
        for x in &l.lines {
            println!("  {} · {}% · resets_at {}", x.label, x.percent, x.resets_at);
        }
        assert!(!l.lines.is_empty());
    }

    /// La respuesta de verdad de su plan gratuito (2026-10-15, Copilot 1.0.75):
    /// chat y autocompletado salen; el premium, que su plan no trae, no; y la
    /// renovación, que llegó con la hora de la propia pregunta, tampoco.
    #[test]
    fn la_cuota_de_copilot_se_lee_sin_inventar() {
        let ahora = crate::sessions::iso_a_segundos("2026-10-15T03:29:44Z").unwrap();
        let cubo = |derecho: i64, usadas: i64, queda: f64, hay: bool, renueva: &str| {
            serde_json::json!({ "isUnlimitedEntitlement": false, "entitlementRequests": derecho, "usedRequests": usadas,
                "remainingPercentage": queda, "hasQuota": hay, "resetDate": renueva })
        };
        let gratis = serde_json::json!({ "quotaSnapshots": {
            "chat": cubo(200, 0, 100.0, true, "2026-10-15T03:29:44.897Z"),
            "completions": cubo(2000, 0, 100.0, true, "2026-10-15T03:29:44.897Z"),
            "premium_interactions": cubo(0, 0, 0.0, false, "2026-10-15T03:29:44.897Z"),
        }});
        let l = lineas_de_copilot(&gratis, ahora);
        let resumen: Vec<_> = l.iter().map(|x| (x.label.as_str(), x.percent, x.resets_at)).collect();
        assert_eq!(resumen, [("Current month (Chat)", 0, 0), ("Current month (Completions)", 0, 0)]);

        let pro = serde_json::json!({ "quotaSnapshots": {
            "premium_interactions": cubo(300, 225, 25.0, true, "2026-11-01T00:00:00Z"),
            "chat": serde_json::json!({ "isUnlimitedEntitlement": true, "entitlementRequests": -1, "remainingPercentage": 100.0 }),
        }});
        let l = lineas_de_copilot(&pro, ahora);
        assert_eq!(l.len(), 1, "el chat ilimitado no se pinta");
        assert_eq!((l[0].label.as_str(), l[0].percent), ("Current month (Premium)", 75));
        assert_eq!(l[0].resets_at, crate::sessions::iso_a_segundos("2026-11-01T00:00:00Z").unwrap() as i64 * 1000);
        assert!(lineas_de_copilot(&serde_json::json!({}), ahora).is_empty());
    }

    /// Una foto vieja de Codex, con la renovación ya pasada, no frena: la
    /// ventana cuenta como renovada y la renovación siguiente sale del ciclo.
    /// La viva se queda como está.
    #[test]
    fn una_ventana_de_codex_ya_renovada_no_frena() {
        let mes = 43_200_i64 * 60_000;
        let renovo = 1_792_173_502_000_i64;
        let rate = serde_json::json!({
            "primary": { "used_percent": 100.0, "window_minutes": 43_200, "resets_at": renovo / 1000 },
            "secondary": { "used_percent": 40.0, "window_minutes": 300, "resets_at": (renovo + 3 * 3_600_000) / 1000 },
        });
        // Una hora después de la renovación de la del mes.
        let ahora = renovo + 3_600_000;
        let l = lineas_de(&rate, ahora);
        assert_eq!((l[0].percent, l[0].resets_at), (0, renovo + mes), "la del mes, renovada y con la siguiente dentro de un mes");
        assert_eq!((l[1].percent, l[1].resets_at), (40, renovo + 3 * 3_600_000), "la que aún no renueva, igual");
        // Si pasaron varias ventanas, la siguiente sigue siendo futura y del mismo ciclo.
        let tarde = lineas_de(&rate, renovo + 2 * mes + 5);
        assert_eq!((tarde[0].percent, tarde[0].resets_at), (0, renovo + 3 * mes));
        // Sin minutos de ventana no se inventa la siguiente.
        let sin = serde_json::json!({ "primary": { "used_percent": 90.0, "resets_at": renovo / 1000 } });
        assert_eq!((lineas_de(&sin, ahora)[0].percent, lineas_de(&sin, ahora)[0].resets_at), (0, 0));
    }

    /// Las tres ventanas, con los minutos que Codex da de verdad.
    #[test]
    fn las_ventanas_de_codex() {
        assert_eq!(ventana(300), "Current session"); // 5 h, el plan de pago
        assert_eq!(ventana(10_080), "Current week"); // 7 días
        assert_eq!(ventana(43_200), "Current month"); // 30 días, el gratuito
    }
}
