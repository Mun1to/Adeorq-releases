// What Munir has actually spent, read from Claude Code's own stats cache
// (~/.claude/stats-cache.json). No API call, no quota burnt: the CLI already
// keeps this file up to date, and Adeorq only reads it.
//
// It is NOT the subscription's official percentage: that lives inside
// Anthropic's servers and only `/usage` inside a session can show it. This is
// real work done, which is the number that tells him how the week is going.
use serde::Serialize;
use serde_json::Value;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
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
        .creation_flags(CREATE_NO_WINDOW)
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
