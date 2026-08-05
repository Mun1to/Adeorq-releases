// Adeorq in his Discord activity (META 7).
//
// Discord's own client opens a named pipe on this machine, \\.\pipe\discord-ipc-N,
// and anything that can write to it can set the activity of whoever is logged
// in there. So: no server, no account, no token to store, and nothing leaves
// the computer except what Discord itself then shows on his profile.
//
// The wire format is four bytes of opcode, four of length, then JSON, all
// little endian. Two opcodes are enough: 0 to say hello with the application
// id, 1 for every command after that. That is small enough to write here
// rather than take a crate for it, and it keeps the dependency list honest.
//
// The shape of this module is not a style choice, it is the bug of 2026-07-26
// made structural. A Windows pipe handle opened the normal way is synchronous,
// and synchronous handles serialise their own I/O: while a read is parked
// waiting for Discord to say something, a write on that same pipe waits behind
// it. Not for a while. For good. A reader thread sitting on the pipe therefore
// deadlocks the very next write, which is exactly what happened, and because
// Tauri runs a plain command on the main thread it took the whole window down
// with it: the app froze mid-restore and froze again on every start after.
//
// Hence: one thread owns the pipe and does one thing at a time on it, write
// then read the answer, and everyone else asks it through a channel with a
// deadline. Nothing else touches the pipe, ever.
//
// WHAT gets shown is decided in the UI, not here: this module only carries the
// two lines it is handed. That is deliberate. The rule (his, and right) is
// that the name of a private project never reaches anyone's Discord unless he
// turns it on, and streaming mode overrides even that, so the decision belongs
// where the streaming state lives.

use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Discord's own limit for both lines of an activity.
const MAX_LEN: usize = 120;
/// A local pipe answers at once or something is wrong.
const HELLO_TIMEOUT: Duration = Duration::from_secs(3);
/// Same idea once connected, with room for a busy Discord.
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);

static NONCE: AtomicU64 = AtomicU64::new(1);

/// One exchange with Discord: a frame out, its answer back.
struct Job {
    op: u32,
    payload: String,
    done: mpsc::Sender<Result<String, String>>,
}

pub struct Link {
    client_id: String,
    /// The only way to the pipe. Dropping it ends the thread that owns it.
    jobs: mpsc::Sender<Job>,
    /// False once that thread has stopped serving, whatever the reason.
    alive: Arc<AtomicBool>,
    /// When the current stretch of work began, in epoch seconds: Discord turns
    /// it into the "for 25 minutes" line and counts up on its own.
    since: u64,
}

#[derive(Default)]
pub struct DiscordState(Mutex<Option<Link>>);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn frame(op: u32, payload: &str) -> Vec<u8> {
    let bytes = payload.as_bytes();
    let mut buf = Vec::with_capacity(8 + bytes.len());
    buf.extend_from_slice(&op.to_le_bytes());
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
    buf
}

fn read_frame(pipe: &mut impl Read) -> std::io::Result<String> {
    let mut head = [0u8; 8];
    pipe.read_exact(&mut head)?;
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
    // A sane cap: every real answer is a few hundred bytes, and a bogus length
    // must not turn into a gigabyte allocation.
    if len > 64 * 1024 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "respuesta demasiado grande",
        ));
    }
    let mut body = vec![0u8; len];
    pipe.read_exact(&mut body)?;
    Ok(String::from_utf8_lossy(&body).into_owned())
}

/// The thread that owns the pipe. One job at a time, write then read, so the
/// handle never has two operations racing on it. It ends when the last sender
/// goes away or the pipe breaks, and says so through `alive` either way.
fn serve(mut pipe: impl Read + Write, jobs: mpsc::Receiver<Job>, alive: Arc<AtomicBool>) {
    for job in jobs {
        let answer = pipe
            .write_all(&frame(job.op, &job.payload))
            .and_then(|_| pipe.flush())
            .and_then(|_| read_frame(&mut pipe))
            .map_err(|e| format!("se ha cortado la conexión con Discord: {e}"));
        let broke = answer.is_err();
        let _ = job.done.send(answer);
        if broke {
            break;
        }
    }
    alive.store(false, Ordering::Relaxed);
}

impl Link {
    /// Hands one frame to the pipe's thread and waits for Discord's answer.
    /// A deadline rather than a plain wait: the whole point of this module is
    /// that nothing here is allowed to hang around forever.
    fn ask(&self, op: u32, payload: &str, wait: Duration) -> Result<String, String> {
        let (done, back) = mpsc::channel();
        self.jobs
            .send(Job {
                op,
                payload: payload.to_string(),
                done,
            })
            .map_err(|_| "la conexión con Discord se ha cerrado".to_string())?;
        match back.recv_timeout(wait) {
            Ok(answer) => answer,
            Err(_) => {
                // Still waiting on Discord: this link is not to be trusted
                // again, and the next call will start a fresh one.
                self.alive.store(false, Ordering::Relaxed);
                Err("Discord no ha contestado a tiempo".into())
            }
        }
    }

    fn healthy(&self, id: &str) -> bool {
        self.client_id == id && self.alive.load(Ordering::Relaxed)
    }
}

/// Discord numbers its pipes: the second client on a machine gets -1, and so on.
fn open_pipe() -> Option<File> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{i}");
        if let Ok(f) = OpenOptions::new().read(true).write(true).open(&path) {
            return Some(f);
        }
    }
    None
}

/// Says hello and waits for Discord's READY before calling itself connected.
fn connect(client_id: &str) -> Result<Link, String> {
    let pipe = open_pipe().ok_or("Discord no está abierto en este equipo")?;
    let (jobs, queue) = mpsc::channel();
    let alive = Arc::new(AtomicBool::new(true));
    let flag = alive.clone();
    thread::spawn(move || serve(pipe, queue, flag));

    let link = Link {
        client_id: client_id.to_string(),
        jobs,
        alive,
        since: now(),
    };
    let hello = format!(r#"{{"v":1,"client_id":"{}"}}"#, client_id.replace('"', ""));
    let msg = link.ask(0, &hello, HELLO_TIMEOUT)?;
    if msg.contains("\"READY\"") {
        return Ok(link);
    }
    // A refusal comes back as {"code":4000,"message":"Invalid Client ID"} and
    // the pipe closes. Verified against a real Discord on 2026-07-26, which is
    // why this reads its `message` instead of guessing a shape.
    Err(match refusal(&msg).as_deref() {
        Some("Invalid Client ID") => "Discord no reconoce ese identificador de aplicación".into(),
        Some(other) => format!("Discord no ha aceptado la conexión: {other}"),
        None => format!(
            "Discord respondió algo inesperado: {}",
            msg.chars().take(120).collect::<String>()
        ),
    })
}

/// The reason Discord gave for saying no, if that is what the frame is.
fn refusal(frame: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(frame)
        .ok()?
        .get("message")?
        .as_str()
        .map(str::to_string)
}

fn clamp(text: &str) -> String {
    let clean = text.trim();
    if clean.chars().count() <= MAX_LEN {
        return clean.to_string();
    }
    clean.chars().take(MAX_LEN - 1).collect::<String>() + "…"
}

/**
 * Publishes the activity, connecting first if needed.
 *
 * `details` is the top line and `status` the one under it, both already
 * decided by the UI. `restart` starts the clock again, for when the work
 * genuinely changed rather than just its wording.
 *
 * `async` is load-bearing, not decoration: a plain Tauri command runs on the
 * main thread, the one that pumps the window. Talking to somebody else's
 * process has no business on that thread, whatever guarantees this module
 * thinks it makes.
 */
#[tauri::command(async)]
pub fn discord_set(
    state: tauri::State<'_, DiscordState>,
    client_id: String,
    details: String,
    status: String,
    restart: bool,
) -> Result<(), String> {
    let id = client_id.trim().to_string();
    if id.is_empty() {
        return Err("falta el identificador de la aplicación de Discord".into());
    }
    let mut slot = state.0.lock().map_err(|_| "estado bloqueado")?;

    // A different application id is a different app, and a link whose thread
    // has stopped is no link at all: either way, start over.
    if !slot.as_ref().is_some_and(|l| l.healthy(&id)) {
        *slot = None;
    }
    if slot.is_none() {
        *slot = Some(connect(&id)?);
    }
    let link = slot.as_mut().expect("acabo de ponerlo");
    if restart {
        link.since = now();
    }

    let activity = serde_json::json!({
        "cmd": "SET_ACTIVITY",
        "nonce": NONCE.fetch_add(1, Ordering::Relaxed).to_string(),
        "args": {
            "pid": std::process::id(),
            "activity": {
                "details": clamp(&details),
                "state": clamp(&status),
                "timestamps": { "start": link.since },
                "assets": { "large_image": "adeorq", "large_text": "Adeorq" },
            }
        }
    })
    .to_string();

    let sent = link.ask(1, &activity, REPLY_TIMEOUT);
    if sent.is_err() {
        // Discord went away under us: drop the link so the next call redials.
        *slot = None;
    }
    sent.map(|_| ())
}

/// Takes the activity down and hangs up. Safe to call when never connected.
/// Off the main thread for the same reason as `discord_set`.
#[tauri::command(async)]
pub fn discord_clear(state: tauri::State<'_, DiscordState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "estado bloqueado")?;
    if let Some(link) = slot.as_ref() {
        let clear = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "nonce": NONCE.fetch_add(1, Ordering::Relaxed).to_string(),
            "args": { "pid": std::process::id(), "activity": null }
        })
        .to_string();
        let _ = link.ask(1, &clear, REPLY_TIMEOUT);
    }
    *slot = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_carries_opcode_and_length_little_endian() {
        let f = frame(1, "hi");
        assert_eq!(&f[0..4], &[1, 0, 0, 0]);
        assert_eq!(&f[4..8], &[2, 0, 0, 0]);
        assert_eq!(&f[8..], b"hi");
    }

    #[test]
    fn long_lines_are_cut_to_discords_limit() {
        let long = "a".repeat(300);
        let out = clamp(&long);
        assert_eq!(out.chars().count(), MAX_LEN);
        assert!(out.ends_with('…'));
    }

    #[test]
    fn short_lines_are_left_alone_but_trimmed() {
        assert_eq!(clamp("  Programando  "), "Programando");
    }

    #[test]
    fn a_refusal_is_read_from_its_own_message() {
        let frame = r#"{"code":4000,"message":"Invalid Client ID"}"#;
        assert_eq!(refusal(frame).as_deref(), Some("Invalid Client ID"));
        assert_eq!(refusal(r#"{"cmd":"DISPATCH","evt":"READY"}"#), None);
        assert_eq!(refusal("not json at all"), None);
    }

    /// A pipe that answers with canned frames and remembers what it was told.
    struct FakePipe {
        said: Vec<u8>,
        hears: std::io::Cursor<Vec<u8>>,
    }

    impl FakePipe {
        fn answering(replies: &[&str]) -> Self {
            let mut bytes = Vec::new();
            for r in replies {
                bytes.extend_from_slice(&frame(1, r));
            }
            FakePipe {
                said: Vec::new(),
                hears: std::io::Cursor::new(bytes),
            }
        }
    }

    impl Write for FakePipe {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.said.extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl Read for FakePipe {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            self.hears.read(buf)
        }
    }

    fn link_to(pipe: FakePipe) -> (Link, thread::JoinHandle<()>) {
        let (jobs, queue) = mpsc::channel();
        let alive = Arc::new(AtomicBool::new(true));
        let flag = alive.clone();
        let hand = thread::spawn(move || serve(pipe, queue, flag));
        (
            Link {
                client_id: "id".into(),
                jobs,
                alive,
                since: 0,
            },
            hand,
        )
    }

    #[test]
    fn a_question_gets_its_own_answer_back() {
        let (link, _hand) = link_to(FakePipe::answering(&[r#"{"evt":"READY"}"#, r#"{"ok":1}"#]));
        assert_eq!(
            link.ask(0, "hola", REPLY_TIMEOUT).unwrap(),
            r#"{"evt":"READY"}"#
        );
        assert_eq!(link.ask(1, "otra", REPLY_TIMEOUT).unwrap(), r#"{"ok":1}"#);
        assert!(link.alive.load(Ordering::Relaxed));
    }

    #[test]
    fn a_pipe_that_stops_answering_kills_the_link() {
        // One reply, two questions: the second finds the pipe at its end.
        let (link, hand) = link_to(FakePipe::answering(&[r#"{"evt":"READY"}"#]));
        assert!(link.ask(0, "hola", REPLY_TIMEOUT).is_ok());
        assert!(link.ask(1, "otra", REPLY_TIMEOUT).is_err());
        hand.join().expect("el hilo termina solo");
        assert!(!link.alive.load(Ordering::Relaxed));
        // And a dead link is never reused, whatever the id says.
        assert!(!link.healthy("id"));
    }

    #[test]
    fn a_link_is_only_healthy_for_its_own_id() {
        let (link, _hand) = link_to(FakePipe::answering(&[r#"{"evt":"READY"}"#]));
        assert!(link.healthy("id"));
        assert!(!link.healthy("otro"));
    }

    /// Not part of the suite: it needs Discord actually open. Run it by hand
    /// with `cargo test -- --ignored --nocapture` to see that the pipe is
    /// found, the hello lands, Discord answers AND a real activity round trip
    /// completes, which is the half that used to hang. A made-up id is
    /// expected to come back rejected; put a real one in ADEORQ_DISCORD_ID to
    /// check the whole thing, without the id ever living in the source.
    #[test]
    #[ignore]
    fn the_real_discord_answers() {
        let id = std::env::var("ADEORQ_DISCORD_ID")
            .unwrap_or_else(|_| "000000000000000000".to_string());
        let started = std::time::Instant::now();
        let link = match connect(&id) {
            Ok(l) => {
                println!("READY en {:?}", started.elapsed());
                l
            }
            Err(e) => {
                println!("Discord dice, en {:?}: {e}", started.elapsed());
                return;
            }
        };
        let activity = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "nonce": "test",
            "args": {
                "pid": std::process::id(),
                "activity": {
                    "details": "Probando el transporte",
                    "state": "Desde los tests",
                    "timestamps": { "start": now() },
                    "assets": { "large_image": "adeorq", "large_text": "Adeorq" },
                }
            }
        })
        .to_string();
        let sent = std::time::Instant::now();
        match link.ask(1, &activity, REPLY_TIMEOUT) {
            Ok(answer) => println!(
                "actividad publicada en {:?}: {}",
                sent.elapsed(),
                answer.chars().take(160).collect::<String>()
            ),
            Err(e) => println!("no ha entrado, en {:?}: {e}", sent.elapsed()),
        }
        println!("hilo del pipe vivo: {}", link.alive.load(Ordering::Relaxed));
        // Long enough to look at his profile before the process exits.
        thread::sleep(Duration::from_secs(10));
    }
}
