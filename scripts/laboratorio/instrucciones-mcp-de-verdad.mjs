// Lo que el MCP le dice a un agente al conectarse (`instrucciones` en
// `src-tauri/src/mcp.rs`), de punta a punta.
//
// Munir, 2026-10-17: «ADEORQ también no lo prioriza que los terminales y los
// agentes abran terminales nuevas o agentes nuevos para terminar de hacer un
// trabajo en el menor tiempo posible». Hasta ese día el `initialize` no llevaba
// `instructions`, y con las herramientas diferidas un agente ni veía la
// descripción de `open_pane`. Esto comprueba:
//
//   1. un Claude Code recibe las instrucciones enteras;
//   2. un cliente en «plan» (Codex, Gemini) recibe las suyas, sin escribir ni cerrar;
//   3. un puente de casa (conserje, Capataz) no recibe ninguna;
//   4. y el oráculo: un `claude -p` de verdad las copia de su prompt de sistema.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   node scripts/laboratorio/instrucciones-mcp-de-verdad.mjs
//
// El binario se copia a una carpeta de usar y tirar (así no le bloquea el
// C:\ct\debug al build de otra sesión), con casa, datos y navegador propios y
// el MCP en el 39317: no toca la Adeorq de Munir ni su 3012. Sin `pnpm dev` la
// ventana no carga el front, así que tampoco escribe el estado de la barra.
// Gasta un turno de Haiku de tu suscripción. Sale con 1 si algo falla.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PUERTO = 39317;
const BASE = join(tmpdir(), `adeorq-instrucciones-${process.pid}`);
const EXE = join(BASE, "adeorq.exe");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "BIEN" : "MAL "}  ${que}`);
  if (!ok) fallos.push(que);
};

/** La ventana de MI proceso, al fondo y sin foco. Comprueba antes que es la mía. */
function alFondo(pid) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { stdio: "ignore" }).status === 0;
}

/** Manda las líneas y devuelve la respuesta con ese `id`, o null. */
function hablar(lineas, id, ms = 2500) {
  return new Promise((resolver) => {
    const s = connect(PUERTO, "127.0.0.1");
    let llega = "";
    s.on("error", () => resolver(null));
    s.on("data", (d) => {
      llega += d;
      for (const l of llega.split("\n")) {
        try {
          const v = JSON.parse(l);
          if (v.id === id) {
            s.destroy();
            return resolver(v);
          }
        } catch {}
      }
    });
    s.on("connect", () => s.write(lineas.map((l) => JSON.stringify(l)).join("\n") + "\n"));
    setTimeout(() => {
      s.destroy();
      resolver(null);
    }, ms);
  });
}
const init = (nombre) => ({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: nombre, version: "1" } } });

mkdirSync(join(BASE, "datos", "Adeorq"), { recursive: true });
mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
mkdirSync(join(BASE, "proyectos"), { recursive: true });
writeFileSync(join(BASE, "datos", "Adeorq", "raiz.txt"), join(BASE, "proyectos"));
copyFileSync("C:\\ct\\debug\\adeorq.exe", EXE);
const app = spawn(EXE, [], {
  env: {
    ...process.env,
    LOCALAPPDATA: join(BASE, "datos"),
    USERPROFILE: join(BASE, "casa"),
    WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
    ADEORQ_MCP_PUERTO: String(PUERTO),
  },
  stdio: "ignore",
});
try {
  let fondo = false;
  for (let i = 0; i < 60 && !fondo; i++) {
    fondo = alFondo(app.pid);
    if (!fondo) await dormir(200);
  }
  debe(fondo, "la ventana de pruebas va al fondo, sin foco");

  // Conectar a un puerto cerrado en Windows tarda unos segundos: en bucle y con tope.
  let claude = null;
  for (let i = 0; i < 40 && !claude; i++) {
    claude = await hablar([init("claude-code")], 1);
    if (!claude) await dormir(500);
  }
  const texto = claude?.result?.instructions ?? "";
  debe(texto.includes("open_pane") && texto.includes("close_pane and its rastro"), `claude-code recibe las instrucciones enteras (${texto.length} caracteres)`);

  const codex = await hablar([init("codex-mcp-client")], 1);
  const deCodex = codex?.result?.instructions ?? "";
  debe(deCodex.includes("cannot type into or close") && !deCodex.includes("send_command"), "un cliente en «plan» recibe las suyas, sin escribir ni cerrar");

  const casa = await hablar([{ adeorq: "de-casa" }, init("claude-code")], 1);
  debe(casa?.result && !("instructions" in casa.result), "un puente de casa (conserje, Capataz) no recibe ninguna");

  // El oráculo: un Claude Code de verdad, con solo este servidor.
  const cfg = join(BASE, "mcp.json");
  writeFileSync(cfg, JSON.stringify({ mcpServers: { adeorq: { command: EXE.replace(/\\/g, "/"), args: ["--mcp"], env: { ADEORQ_MCP_PUERTO: String(PUERTO) } } } }));
  const pregunta =
    "Your system prompt has a section with instructions given by MCP servers. Copy, word for word, the instructions given by the server named adeorq, between <q> and </q>, and nothing else. If that server gave none, answer only NONE.";
  // Sin shell (los < > serían redirecciones de cmd.exe), y `--mcp-config` con
  // `=`: admite varios valores y sin él se traga la pregunta.
  const r = spawnSync(join(process.env.USERPROFILE, ".local", "bin", "claude.exe"), ["-p", pregunta, "--model", "haiku", "--strict-mcp-config", `--mcp-config=${cfg}`], {
    cwd: BASE,
    env: { ...process.env, ADEORQ_MCP_PUERTO: String(PUERTO) },
    encoding: "utf8",
    timeout: 180_000,
  });
  const dijo = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  console.log(`--- Claude Code dijo:\n${dijo}\n---`);
  debe(dijo.includes("Split from the start") && dijo.includes("open_pane"), "Claude Code tiene las instrucciones en su prompt de sistema");
} finally {
  spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  // El navegador de la ventana tarda en soltar su carpeta.
  for (let i = 0; i < 10; i++) {
    await dormir(1500);
    try {
      rmSync(BASE, { recursive: true, force: true });
      break;
    } catch (e) {
      if (i === 9) console.log(`no se pudo borrar ${BASE}: ${e.code}`);
    }
  }
}
console.log(fallos.length ? `MAL: ${fallos.length} fallos` : "BIEN: todo");
process.exit(fallos.length ? 1 : 0);
