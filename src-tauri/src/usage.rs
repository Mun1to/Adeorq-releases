// What Munir has actually spent, read from Claude Code's own stats cache
// (~/.claude/stats-cache.json). No API call, no quota burnt: the CLI already
// keeps this file up to date, and Adeorq only reads it.
//
// It is NOT the subscription's official percentage: that lives inside
// Anthropic's servers and only `/usage` inside a session can show it. This is
// real work done, which is the number that tells him how the week is going.
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use crate::SinVentana;

const LIMITS_TIMEOUT: Duration = Duration::from_secs(60);

/// The config folder of an account. `None` is the main one (`~/.claude`); any
/// other account is a folder of its own, which is exactly what
/// CLAUDE_CONFIG_DIR gives us: separate login, separate stats, same CLI.
pub fn config_root(config_dir: Option<&str>) -> Option<PathBuf> {
    match config_dir {
        Some(dir) if !dir.trim().is_empty() => Some(PathBuf::from(dir)),
        _ => std::env::var("USERPROFILE")
            .ok()
            .map(|h| Path::new(&h).join(".claude")),
    }
}

fn stats_path(config_dir: Option<&str>) -> Option<PathBuf> {
    Some(config_root(config_dir)?.join("stats-cache.json"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSlice {
    /// Readable name ("Opus 5").
    pub model: String,
    pub tokens: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPoint {
    pub date: String,
    pub tokens: u64,
    pub sessions: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    /// Last day the CLI recomputed its stats.
    pub updated: String,
    /// Tokens over the last 7 days, most recent last (for the sparkline).
    pub week: Vec<DayPoint>,
    pub week_tokens: u64,
    pub week_sessions: u64,
    pub week_messages: u64,
    /// Which models did the work this week.
    pub by_model: Vec<ModelSlice>,
    pub total_sessions: u64,
    pub total_messages: u64,
}

fn pretty(id: &str) -> String {
    let core = id.split('[').next().unwrap_or(id);
    let mut parts = core.split('-').skip(1);
    let Some(family) = parts.next() else {
        return id.to_owned();
    };
    let nums: Vec<&str> = parts
        .filter(|p| p.chars().all(|c| c.is_ascii_digit()))
        .take(2)
        .collect();
    let mut name = family.to_owned();
    if let Some(first) = name.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    if nums.is_empty() {
        name
    } else {
        format!("{name} {}", nums.join("."))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInfo {
    /// "max", "pro"... as Claude Code stores it.
    pub subscription: String,
    /// The rate limit tier that goes with the plan.
    pub tier: String,
}

/// Which plan is signed in. Reads ONLY these two fields from the credentials
/// file: the tokens next to them are never read, returned or logged.
// async porque un comando sin async corre en el hilo de la ventana, y estos
// dos los sondea el panel de uso: cada lectura del disco congelaba la UI.
/// Un día de trabajo, ya sumado entre todas las cuentas.
#[derive(Serialize, Default, Clone)]
pub struct DiaUso {
    /// `AAAA-MM-DD`, tal cual lo escribe el CLI.
    pub fecha: String,
    pub mensajes: u64,
    pub sesiones: u64,
    pub tokens: u64,
}

/// Todo lo que se ha trabajado, para la pantalla de bienvenida.
#[derive(Serialize, Default)]
pub struct Historia {
    /// Ordenados de más viejo a más nuevo, sin huecos rellenados: un día que no
    /// existe aquí es un día que no se trabajó, y eso es lo que corta una racha.
    pub dias: Vec<DiaUso>,
    pub total_sesiones: u64,
    pub total_mensajes: u64,
    pub por_modelo: Vec<ModelSlice>,
    /// 24 casillas, de las 0 a las 23.
    pub horas: Vec<u64>,
    /// Cuándo empezó todo, en ISO. Vacío si no consta.
    pub desde: String,
    /// La fecha que el propio CLI dice haber calculado. Se enseña porque este
    /// archivo NO se rehace en cada turno: puede ir varios días por detrás, y
    /// dar sus números como si fueran de hoy sería mentir.
    pub calculado: String,
    /// De cuántas cuentas salen estos números.
    pub cuentas: u64,
}

/// La historia de uso, sumando todas las cuentas que se le pasen.
///
/// Sale del `stats-cache.json` que Claude Code ya mantiene: ni una llamada a la
/// API, ni un token gastado. Cada cuenta es una carpeta con su propio archivo
/// (ver `config_root`), así que trabajar con dos cuentas partía las cifras en
/// dos mitades que no se veían juntas en ningún sitio.
///
/// Codex no entra y no es un olvido: no publica nada equivalente. Se miró su
/// carpeta el 2026-08-08 y solo guarda los rollouts, sin contadores.
#[tauri::command]
pub async fn stats_historia(config_dirs: Vec<String>) -> Historia {
    // Vacío = solo la principal, que es lo que quiere decir `None` aquí.
    let mut raices: Vec<Option<String>> = vec![None];
    raices.extend(config_dirs.into_iter().filter(|d| !d.trim().is_empty()).map(Some));

    let mut por_dia: std::collections::BTreeMap<String, DiaUso> = Default::default();
    let mut out = Historia { horas: vec![0; 24], ..Default::default() };

    for raiz in raices {
        let Some(path) = stats_path(raiz.as_deref()) else {
            continue;
        };
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        out.cuentas += 1;
        out.total_sesiones += v["totalSessions"].as_u64().unwrap_or(0);
        out.total_mensajes += v["totalMessages"].as_u64().unwrap_or(0);

        // La más antigua de todas las cuentas manda: es cuándo empezó ÉL.
        if let Some(d) = v["firstSessionDate"].as_str() {
            if out.desde.is_empty() || d < out.desde.as_str() {
                out.desde = d.to_owned();
            }
        }
        // Y de la fecha de cálculo, la más VIEJA: es hasta dónde llega el dato
        // menos fresco, o sea hasta dónde se puede prometer que esto es cierto.
        if let Some(d) = v["lastComputedDate"].as_str() {
            if out.calculado.is_empty() || d < out.calculado.as_str() {
                out.calculado = d.to_owned();
            }
        }

        if let Some(map) = v["hourCounts"].as_object() {
            for (h, n) in map {
                if let Ok(i) = h.parse::<usize>() {
                    if i < 24 {
                        out.horas[i] += n.as_u64().unwrap_or(0);
                    }
                }
            }
        }

        for day in v["dailyActivity"].as_array().into_iter().flatten() {
            let Some(fecha) = day["date"].as_str() else { continue };
            let d = por_dia.entry(fecha.to_owned()).or_insert_with(|| DiaUso {
                fecha: fecha.to_owned(),
                ..Default::default()
            });
            d.mensajes += day["messageCount"].as_u64().unwrap_or(0);
            d.sesiones += day["sessionCount"].as_u64().unwrap_or(0);
        }

        for day in v["dailyModelTokens"].as_array().into_iter().flatten() {
            let Some(fecha) = day["date"].as_str() else { continue };
            let d = por_dia.entry(fecha.to_owned()).or_insert_with(|| DiaUso {
                fecha: fecha.to_owned(),
                ..Default::default()
            });
            if let Some(map) = day["tokensByModel"].as_object() {
                for (modelo, n) in map {
                    let n = n.as_u64().unwrap_or(0);
                    d.tokens += n;
                    let nombre = pretty(modelo);
                    match out.por_modelo.iter_mut().find(|s| s.model == nombre) {
                        Some(slice) => slice.tokens += n,
                        None => out.por_modelo.push(ModelSlice { model: nombre, tokens: n }),
                    }
                }
            }
        }
    }

    out.por_modelo.sort_by(|a, b| b.tokens.cmp(&a.tokens));
    // BTreeMap ya los da ordenados por fecha, que es lo que necesitan las
    // rachas: al ser `AAAA-MM-DD`, el orden de texto ES el orden de calendario.
    out.dias = por_dia.into_values().collect();
    out
}

#[tauri::command]
pub async fn plan_info(config_dir: Option<String>) -> Option<PlanInfo> {
    let path = config_root(config_dir.as_deref())?.join(".credentials.json");
    let v: Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let oauth = &v["claudeAiOauth"];
    let subscription = oauth["subscriptionType"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let tier = oauth["rateLimitTier"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    (!subscription.is_empty() || !tier.is_empty()).then_some(PlanInfo { subscription, tier })
}

#[tauri::command]
pub async fn usage_report(config_dir: Option<String>) -> Option<UsageReport> {
    let text = std::fs::read_to_string(stats_path(config_dir.as_deref())?).ok()?;
    let v: Value = serde_json::from_str(&text).ok()?;

    let days = v["dailyModelTokens"].as_array()?;
    let activity = v["dailyActivity"].as_array().cloned().unwrap_or_default();
    let recent: Vec<&Value> = days.iter().rev().take(7).collect();

    let mut week = Vec::new();
    let mut by_model: Vec<ModelSlice> = Vec::new();
    let mut week_tokens = 0u64;
    for day in recent.iter().rev() {
        let date = day["date"].as_str().unwrap_or_default().to_owned();
        let mut tokens = 0u64;
        if let Some(map) = day["tokensByModel"].as_object() {
            for (model, n) in map {
                let n = n.as_u64().unwrap_or(0);
                tokens += n;
                let name = pretty(model);
                match by_model.iter_mut().find(|s| s.model == name) {
                    Some(slice) => slice.tokens += n,
                    None => by_model.push(ModelSlice {
                        model: name,
                        tokens: n,
                    }),
                }
            }
        }
        let sessions = activity
            .iter()
            .find(|a| a["date"].as_str() == Some(&date))
            .and_then(|a| a["sessionCount"].as_u64())
            .unwrap_or(0);
        week_tokens += tokens;
        week.push(DayPoint {
            date,
            tokens,
            sessions,
        });
    }
    by_model.sort_by(|a, b| b.tokens.cmp(&a.tokens));

    let dates: Vec<&str> = week.iter().map(|d| d.date.as_str()).collect();
    let (week_sessions, week_messages) = activity
        .iter()
        .filter(|a| dates.contains(&a["date"].as_str().unwrap_or_default()))
        .fold((0u64, 0u64), |(s, m), a| {
            (
                s + a["sessionCount"].as_u64().unwrap_or(0),
                m + a["messageCount"].as_u64().unwrap_or(0),
            )
        });

    Some(UsageReport {
        updated: v["lastComputedDate"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        week,
        week_tokens,
        week_sessions,
        week_messages,
        by_model,
        total_sessions: v["totalSessions"].as_u64().unwrap_or(0),
        total_messages: v["totalMessages"].as_u64().unwrap_or(0),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitLine {
    /// "Current session", "Current week (all models)", "Current week (Fable)".
    pub label: String,
    pub percent: u8,
    /// When it goes back to zero, as the CLI words it.
    pub resets: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub lines: Vec<LimitLine>,
    /// The "Last 24h · N requests · N sessions" summary, if present.
    pub note: String,
}

fn claude_exe() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        let p = Path::new(&home)
            .join(".local")
            .join("bin")
            .join("claude.exe");
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("claude")
}

/// A session id of our own for each `-p` call, so its transcript can be found
/// and removed afterwards. Not cryptographic: it only has to be unique on this
/// machine, and a v4-shaped string is what the CLI accepts.
fn throwaway_id() -> String {
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let a = nanos ^ (n << 32);
    let b = nanos.rotate_left(17).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ n;
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        (a & 0xfff) as u16,
        (b >> 48) as u16 & 0xfff,
        b & 0xffff_ffff_ffff
    )
}

/// Deletes the transcript that a throwaway `-p` call left behind. The file is
/// named after the session id, so a walk of ~/.claude/projects finds it
/// wherever the CLI decided to file it.
fn drop_transcript(config_dir: Option<&str>, id: &str) {
    let Some(root) = config_root(config_dir).map(|r| r.join("projects")) else {
        return;
    };
    let name = format!("{id}.jsonl");
    let Ok(dirs) = std::fs::read_dir(&root) else {
        return;
    };
    for dir in dirs.flatten() {
        let candidate = dir.path().join(&name);
        if candidate.is_file() {
            let _ = std::fs::remove_file(&candidate);
            return;
        }
    }
}

/// The plan's real limits. `/usage` is a LOCAL slash command: run through
/// `claude -p` it answers with the card and costs nothing (zero turns, zero
/// tokens, verified), so Adeorq can refresh it on its own without ever typing
/// into one of Munir's terminals.
///
/// It does leave a transcript, though, and that turned Munir's own session
/// list into 59 untitled entries in one night: the panel that watches the
/// quota was littering the panel that lists the work. So each call gets a
/// session id of ours and the file is removed as soon as the answer is read.
/// (CLAUDE_CODE_CHILD_SESSION was tried first and no longer suppresses it.)
#[tauri::command]
pub async fn usage_limits(config_dir: Option<String>) -> Result<Limits, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let id = throwaway_id();
        let mut cmd = std::process::Command::new(claude_exe());
        cmd.args([
            "-p",
            "/usage",
            "--output-format",
            "json",
            "--session-id",
            &id,
        ])
        .sin_ventana()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());
        // Same command, another account: the CLI reads its whole identity from
        // this folder, so the answer is that account's limits, still costing 0.
        if let Some(dir) = config_dir.as_deref().filter(|d| !d.trim().is_empty()) {
            cmd.env("CLAUDE_CONFIG_DIR", dir);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("no pude lanzar claude: {e}"))?;

        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > LIMITS_TIMEOUT => {
                    let _ = child.kill();
                    drop_transcript(config_dir.as_deref(), &id);
                    return Err("claude tardó demasiado".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(150)),
                Err(e) => {
                    drop_transcript(config_dir.as_deref(), &id);
                    return Err(e.to_string());
                }
            }
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        // Whatever happened, the throwaway session does not belong in his list.
        drop_transcript(config_dir.as_deref(), &id);
        let wrapper: Value = serde_json::from_str(String::from_utf8_lossy(&out.stdout).trim())
            .map_err(|e| format!("respuesta ilegible: {e}"))?;
        let text = wrapper["result"].as_str().unwrap_or_default();

        let mut lines = Vec::new();
        let mut note = String::new();
        for raw in text.lines() {
            let line = raw.trim();
            if note.is_empty() && line.starts_with("Last 24h") {
                note = line.to_owned();
            }
            // "Current session: 42% used · resets Jul 26, 2:30am (Europe/Madrid)"
            let Some((label, rest)) = line.split_once(':') else {
                continue;
            };
            if !label.starts_with("Current") || !rest.contains('%') {
                continue;
            }
            let percent = rest
                .split('%')
                .next()
                .and_then(|n| n.trim().parse::<f32>().ok())
                .map(|n| n.round() as u8);
            let Some(percent) = percent else { continue };
            let resets = rest
                .split_once("resets")
                .map(|(_, r)| r.trim().trim_end_matches('.').to_owned())
                .unwrap_or_default();
            lines.push(LimitLine {
                label: label.trim().to_owned(),
                percent,
                resets,
            });
        }
        if lines.is_empty() {
            return Err("el CLI no devolvió límites".into());
        }
        Ok(Limits { lines, note })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// La cuota de CADA cuenta, contra las cuentas de verdad de esta máquina.
    ///
    /// El panel de uso solo sabía leer la de siempre, así que trabajar con una
    /// segunda cuenta era hacerlo sin ver el depósito (Munir, 2026-08-07). Lo
    /// que hay que demostrar es que la MISMA orden, con `CLAUDE_CONFIG_DIR`
    /// puesto, contesta los límites de esa otra cuenta y no los de la primera.
    ///
    /// Va en `#[ignore]` porque lanza el CLI de verdad (sin gastar cuota:
    /// `/usage` es un comando local) y tarda unos segundos:
    /// `cargo test --lib la_cuota_de_cada_cuenta -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn la_cuota_de_cada_cuenta() {
        use tauri::async_runtime::block_on;
        let mut cuentas: Vec<Option<String>> = vec![None];
        cuentas.extend(
            crate::accounts::list_account_dirs()
                .into_iter()
                .filter(|d| Path::new(d).join(".credentials.json").is_file())
                .map(Some),
        );
        println!("\n{} cuentas con sesión iniciada", cuentas.len());
        for dir in cuentas {
            let nombre = dir
                .as_deref()
                .and_then(|d| d.rsplit(['\\', '/']).next())
                .unwrap_or("~/.claude")
                .to_owned();
            let plan = block_on(plan_info(dir.clone()))
                .map(|p| p.subscription)
                .unwrap_or_else(|| "?".into());
            let trabajo = block_on(usage_report(dir.clone()))
                .map(|r| format!("{} tokens esta semana", r.week_tokens))
                .unwrap_or_else(|| "sin stats todavía".into());
            match block_on(usage_limits(dir)) {
                Ok(l) => {
                    let resumen: Vec<String> = l
                        .lines
                        .iter()
                        .map(|x| format!("{} {}%", x.label, x.percent))
                        .collect();
                    println!("  {nombre} · plan {plan} · {trabajo}\n      {}", resumen.join(" · "));
                }
                Err(e) => println!("  {nombre} · plan {plan} · {trabajo}\n      SIN LÍMITES: {e}"),
            }
        }
    }
}
