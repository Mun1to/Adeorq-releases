// Install the shield where an agent cannot switch it off (decision C1).
//
//   node escudo/instalar.mjs                 shows what it would do, touches nothing
//   node escudo/instalar.mjs --preparar      creates the shield's folder, so Ajustes › Escudo appears
//   node escudo/instalar.mjs --aplicar       does it: asks Windows for its «Sí» once
//   node escudo/instalar.mjs --quitar        takes it all out again (also with the «Sí»)
//   node escudo/instalar.mjs --aplicar --destino <carpeta>   the same into a test folder, no «Sí»
//
// What goes where:
//   C:\Program Files\Adeorq Escudo\        gancho.mjs, lista.json, ajustes.json, llave-publica.der
//   C:\Program Files\ClaudeCode\managed-settings.json   the hooks for Claude Code (a user cannot remove them)
//   C:\ProgramData\OpenAI\Codex\requirements.toml       the hooks for Codex, required, and hooks pinned on
//   C:\ProgramData\gemini-cli\settings.json             the hooks for Gemini (Gemini lets any user turn
//                                                       them off: there the watcher is the real net)
// Contract and limits: docs/contexto/escudo.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, "..");
const args = process.argv.slice(2);
const tiene = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? null : args[i + 1];
};

const destino = valor("--destino");
const programas = destino ? path.join(destino, "Program Files") : process.env.ProgramFiles ?? "C:\\Program Files";
const programData = destino ? path.join(destino, "ProgramData") : process.env.ProgramData ?? "C:\\ProgramData";
const casa = valor("--casa") ?? os.homedir();
const datos = valor("--datos") ?? process.env.LOCALAPPDATA ?? path.join(casa, "AppData", "Local");
const proyectos = valor("--proyectos") ?? (fs.existsSync(path.join(datos, "Adeorq", "raiz.txt")) ? fs.readFileSync(path.join(datos, "Adeorq", "raiz.txt"), "utf8").trim() : "C:\\proyectos");
const nodeExe = process.execPath;

const CASA_ESCUDO = path.join(programas, "Adeorq Escudo");
const ESTADO = path.join(datos, "Adeorq", "escudo");
const LLAVE_USUARIO = path.join(ESTADO, "llave-publica.der");
const CLAUDE_MANAGED = path.join(programas, "ClaudeCode", "managed-settings.json");
const CODEX_REQ = path.join(programData, "OpenAI", "Codex", "requirements.toml");
const GEMINI_SYS = path.join(programData, "gemini-cli", "settings.json");
const MARCA = "adeorq-escudo";

const huella = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const barras = (p) => p.replace(/\\/g, "/");
const bash = (p) => barras(p).replace(/^([A-Za-z]):/, (m, l) => `/${l.toLowerCase()}`);

// ───────── what each CLI gets ─────────

function comandoBash(cli) {
  // Git Bash runs Claude Code's hooks. NODE_OPTIONS is dropped so a setting cannot load code into node.
  return `/usr/bin/env -u NODE_OPTIONS -u NODE_PATH "${bash(nodeExe)}" "${bash(path.join(CASA_ESCUDO, "gancho.mjs"))}" ${cli}`;
}
function comandoPowerShell(cli) {
  // Codex and Gemini run their hooks with `powershell -Command`.
  return `$env:NODE_OPTIONS=$null; $env:NODE_PATH=$null; & "${nodeExe}" "${path.join(CASA_ESCUDO, "gancho.mjs")}" ${cli}`;
}

export function ganchosClaude() {
  return {
    PreToolUse: [
      {
        matcher: "^(Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell)$|^mcp__claude_ai_Supabase__",
        hooks: [{ type: "command", shell: "bash", command: comandoBash("claude"), timeout: 360, onFailure: "block" }],
      },
    ],
    PostToolUse: [
      {
        matcher: "^(Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Read|WebFetch|WebSearch)$|^mcp__",
        hooks: [{ type: "command", shell: "bash", command: comandoBash("claude"), timeout: 30 }],
      },
    ],
  };
}

function tomlTexto(s) {
  return `'${s}'`; // literal string: backslashes stay as they are; the commands carry no single quote
}

export function requisitosCodex() {
  const pre = comandoPowerShell("codex");
  return [
    `# ${MARCA}: written by escudo/instalar.mjs. Hooks here are required and a user config cannot remove them.`,
    "[features]",
    "hooks = true",
    "",
    "[[hooks.PreToolUse]]",
    `matcher = ${tomlTexto("^(Bash|apply_patch)$")}`,
    "[[hooks.PreToolUse.hooks]]",
    'type = "command"',
    `command = ${tomlTexto(pre)}`,
    "timeout = 360",
    "",
    "[[hooks.PostToolUse]]",
    `matcher = ${tomlTexto("^(Bash|apply_patch)$|^mcp__")}`,
    "[[hooks.PostToolUse.hooks]]",
    'type = "command"',
    `command = ${tomlTexto(pre)}`,
    "timeout = 30",
    "",
  ].join("\n");
}

export function ajustesGemini() {
  const c = comandoPowerShell("gemini");
  return {
    hooksConfig: { enabled: true },
    hooks: {
      BeforeTool: [{ matcher: "^(run_shell_command|write_file|replace)$", hooks: [{ type: "command", name: MARCA, command: c, timeout: 360000 }] }],
      AfterTool: [{ matcher: "^(run_shell_command|write_file|replace|web_fetch|google_web_search|read_file|read_many_files)$", hooks: [{ type: "command", name: `${MARCA}-despues`, command: c, timeout: 30000 }] }],
    },
  };
}

function ajustesGancho() {
  return { casa, proyectos, datos, programas, puerto: 3012, abrir_navegador: true, memoria: "manchada", mancha_min: 60, plazo_rojo_min: 30, reinicio_por_fuera: true };
}

// ───────── the plan ─────────

function plan() {
  const pasos = [];
  const llave = fs.existsSync(LLAVE_USUARIO) ? fs.readFileSync(LLAVE_USUARIO) : null;
  const fuente = (n) => fs.readFileSync(path.join(AQUI, n));
  pasos.push({ ruta: path.join(CASA_ESCUDO, "gancho.mjs"), contenido: fuente("gancho.mjs") });
  pasos.push({ ruta: path.join(CASA_ESCUDO, "lista.json"), contenido: fuente("lista.json") });
  pasos.push({ ruta: path.join(CASA_ESCUDO, "ajustes.json"), contenido: Buffer.from(`${JSON.stringify(ajustesGancho(), null, 2)}\n`) });
  pasos.push({ ruta: path.join(CASA_ESCUDO, "llave-publica.der"), contenido: llave, falta: llave ? null : `no está tu llave en ${LLAVE_USUARIO}: créala antes en Adeorq › Ajustes › Escudo` });
  // Claude Code: merge into an existing managed file instead of replacing it
  let gestionado = {};
  if (fs.existsSync(CLAUDE_MANAGED)) {
    try {
      gestionado = JSON.parse(fs.readFileSync(CLAUDE_MANAGED, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      pasos.push({ ruta: CLAUDE_MANAGED, falta: "ya existe y no es JSON válido: no lo piso" });
    }
  }
  const hooks = { ...(gestionado.hooks ?? {}) };
  for (const [ev, grupos] of Object.entries(ganchosClaude())) hooks[ev] = [...(hooks[ev] ?? []).filter((g) => !JSON.stringify(g).includes("Adeorq Escudo")), ...grupos];
  pasos.push({ ruta: CLAUDE_MANAGED, contenido: Buffer.from(`${JSON.stringify({ ...gestionado, hooks }, null, 2)}\n`), copia: fs.existsSync(CLAUDE_MANAGED) });
  for (const [ruta, contenido] of [
    [CODEX_REQ, Buffer.from(requisitosCodex())],
    [GEMINI_SYS, Buffer.from(`${JSON.stringify(ajustesGemini(), null, 2)}\n`)],
  ]) {
    if (fs.existsSync(ruta) && !fs.readFileSync(ruta, "utf8").includes(MARCA)) pasos.push({ ruta, falta: "ya existe y no es mío: no lo piso. Júntalo a mano o bórralo antes." });
    else pasos.push({ ruta, contenido });
  }
  return pasos;
}

function comprobarRepo() {
  if (destino) return { ok: true, texto: "prueba en una carpeta aparte: no hace falta que el repo esté limpio" };
  try {
    const sucio = execFileSync("git", ["-C", REPO, "status", "--porcelain", "--", "escudo"], { encoding: "utf8" }).trim();
    const head = execFileSync("git", ["-C", REPO, "log", "-1", "--format=%h %s", "--", "escudo"], { encoding: "utf8" }).trim();
    if (sucio) return { ok: false, texto: `escudo/ tiene cambios sin commit:\n${sucio}\nSolo se instala lo que está en un commit, para que se sepa qué se instaló.` };
    return { ok: true, texto: `escudo/ igual que el commit ${head}` };
  } catch (e) {
    return { ok: false, texto: `no pude mirar git: ${e.message}` };
  }
}

function esAdmin() {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"], { encoding: "utf8" });
  return r.stdout.trim() === "True";
}

function cerrar(dir) {
  // Only administrators and the system write here; users read and run. ProgramData lets any user
  // create files in a new folder unless this is cut.
  if (destino) return;
  execFileSync("icacls", [dir, "/inheritance:r", "/grant:r", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-545:(OI)(CI)RX"], { stdio: "ignore" });
}

function escribir(p) {
  fs.mkdirSync(path.dirname(p.ruta), { recursive: true });
  if (p.copia) fs.copyFileSync(p.ruta, `${p.ruta}.antes-del-escudo`);
  fs.writeFileSync(p.ruta, p.contenido); // Buffers: no BOM, which would break the JSON readers
}

function autoprueba() {
  // The installed hook, asked about two things that need no window: a normal file passes, its own
  // folder is denied. A protected file would open your verification, so it is not tried here.
  const g = path.join(CASA_ESCUDO, "gancho.mjs");
  const preg = (file_path) => spawnSync(nodeExe, [g, "claude"], { input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "instalar-autoprueba", cwd: proyectos, tool_name: "Write", tool_input: { file_path, content: "x" } }), encoding: "utf8", env: { ...process.env, ADEORQ_PANE_ID: "" } });
  const normal = preg(path.join(proyectos, "no-existe-autoprueba.txt"));
  const propio = preg(path.join(CASA_ESCUDO, "gancho.mjs"));
  const okNormal = normal.status === 0 && !normal.stdout;
  const okPropio = /"permissionDecision":"deny"/.test(propio.stdout);
  return { ok: okNormal && okPropio, texto: `un archivo normal pasa: ${okNormal ? "sí" : "NO"}; el propio escudo se niega: ${okPropio ? "sí" : "NO"}` };
}

// ───────── main ─────────

function principal() {
  const modo = tiene("--quitar") ? "quitar" : tiene("--aplicar") ? "aplicar" : tiene("--preparar") ? "preparar" : "simular";
  if (modo === "preparar") {
    fs.mkdirSync(ESTADO, { recursive: true });
    console.log(`Hecho: ${ESTADO} existe. Abre Adeorq › Ajustes › Escudo y crea tu contraseña, tu pregunta y tu llave de Windows Hello.`);
    return 0;
  }
  const pasos = plan();
  const repo = comprobarRepo();
  console.log(`El escudo, ${modo === "simular" ? "simulado (no toco nada)" : modo}${destino ? ` en ${destino}` : ""}\n`);
  console.log(`  ${repo.texto}`);
  if (modo === "quitar") {
    const borrar = [CASA_ESCUDO, CODEX_REQ, GEMINI_SYS].filter((p) => fs.existsSync(p));
    if (!destino && !esAdmin() && !tiene("--elevado")) return elevar();
    for (const p of borrar) fs.rmSync(p, { recursive: true, force: true });
    if (fs.existsSync(CLAUDE_MANAGED)) {
      const m = JSON.parse(fs.readFileSync(CLAUDE_MANAGED, "utf8").replace(/^\uFEFF/, ""));
      for (const ev of Object.keys(m.hooks ?? {})) m.hooks[ev] = m.hooks[ev].filter((g) => !JSON.stringify(g).includes("Adeorq Escudo"));
      for (const ev of Object.keys(m.hooks ?? {})) if (!m.hooks[ev].length) delete m.hooks[ev];
      if (m.hooks && !Object.keys(m.hooks).length) delete m.hooks;
      if (Object.keys(m).length) fs.writeFileSync(CLAUDE_MANAGED, `${JSON.stringify(m, null, 2)}\n`);
      else fs.rmSync(CLAUDE_MANAGED);
    }
    console.log("  Quitado. Los agentes vuelven a escribir sin preguntarte.");
    return 0;
  }
  for (const p of pasos) {
    const estado = p.falta ? `FALTA: ${p.falta}` : `${p.contenido.length} bytes, huella ${huella(p.contenido).slice(0, 12)}${p.copia ? " (guardo el de antes en .antes-del-escudo)" : ""}`;
    console.log(`  ${p.ruta}\n      ${estado}`);
  }
  const faltas = pasos.filter((p) => p.falta);
  if (modo === "simular") {
    console.log(`\n${faltas.length || !repo.ok ? "Todavía no se puede instalar: arriba dice por qué." : "Todo listo. Para hacerlo de verdad: node escudo/instalar.mjs --aplicar"}`);
    return 0;
  }
  if (faltas.length || !repo.ok) {
    console.log("\nNo instalo nada: arriba dice qué falta.");
    return 1;
  }
  if (!destino && !esAdmin() && !tiene("--elevado")) return elevar();
  for (const p of pasos) escribir(p);
  for (const d of [CASA_ESCUDO, path.dirname(CODEX_REQ), path.dirname(GEMINI_SYS)]) cerrar(d);
  const a = autoprueba();
  console.log(`\n  Autoprueba: ${a.texto}`);
  console.log(a.ok ? "\nInstalado. Abre una terminal nueva para que Claude Code, Codex y Gemini lo carguen." : "\nInstalado, pero la autoprueba FALLA: quítalo con --quitar y avisa.");
  return a.ok ? 0 : 1;
}

function elevar() {
  // One «Sí» of Windows: the same script, elevated, with this user's folders passed in (an elevated
  // copy could otherwise read another account's).
  const resto = args.filter((a) => a !== "--elevado");
  const lista = [path.join(AQUI, "instalar.mjs"), ...resto, "--elevado", "--casa", casa, "--datos", datos, "--proyectos", proyectos].map((a) => `'${a.replace(/'/g, "''")}'`).join(",");
  console.log("\n  Windows te va a pedir su «Sí» de administrador (la pantalla oscura). Es para escribir en Archivos de programa.");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", `$p = Start-Process -FilePath '${nodeExe}' -ArgumentList ${lista} -Verb RunAs -Wait -PassThru; exit $p.ExitCode`], { stdio: "inherit" });
  console.log(r.status === 0 ? "  Hecho." : `  No se instaló (salida ${r.status}). Si dijiste «No» en la pantalla oscura, es eso.`);
  return r.status ?? 1;
}

const LOG = path.join(ESTADO, "instalacion.log");
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (tiene("--elevado")) {
    // The elevated window closes when it ends: what it says goes to a log the first window prints.
    const lineas = [];
    const log = console.log;
    console.log = (...x) => {
      lineas.push(x.join(" "));
      log(...x);
    };
    let codigo = 1;
    try {
      codigo = principal();
    } catch (e) {
      console.log(`ERROR: ${e.stack ?? e}`);
    }
    fs.mkdirSync(ESTADO, { recursive: true });
    fs.writeFileSync(LOG, `${lineas.join("\n")}\n`);
    process.exitCode = codigo;
  } else {
    if (fs.existsSync(LOG)) fs.rmSync(LOG);
    const codigo = principal();
    if (fs.existsSync(LOG)) console.log(`\n${fs.readFileSync(LOG, "utf8")}`);
    process.exitCode = codigo;
  }
}
