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
//   cursor    NO a la vista. Guarda los chats, no el gasto.
//
// El resto no están instalados aquí, así que no se dice nada de ellos: una
// columna inventada en este panel es peor que un hueco, porque un hueco se ve.
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
fn lineas_de(rate: &Value) -> Vec<LimitLine> {
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
        let resets_at = v
            .get("resets_at")
            .and_then(Value::as_i64)
            .map(|s| s * 1000)
            .unwrap_or(0);
        out.push(LimitLine {
            label: ventana(minutos).to_owned(),
            percent: pct.round().clamp(0.0, 100.0) as u8,
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
            let lineas = lineas_de(rate);
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

    /// Las tres ventanas, con los minutos que Codex da de verdad.
    #[test]
    fn las_ventanas_de_codex() {
        assert_eq!(ventana(300), "Current session"); // 5 h, el plan de pago
        assert_eq!(ventana(10_080), "Current week"); // 7 días
        assert_eq!(ventana(43_200), "Current month"); // 30 días, el gratuito
    }
}
