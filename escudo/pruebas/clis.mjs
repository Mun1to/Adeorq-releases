// The real Codex and Gemini CLIs, with the shield the installer writes, against a fake model.
//
//   node escudo/pruebas/clis.mjs [--solo codex|gemini] [--ver] [--dejar]
//   (--ver prints what the model got back; --dejar keeps the temp copy)
//
// Nothing of Munir's is used or touched: the installer writes into a temp folder (`--destino`), the
// CLIs get a fake home, a fake key and a dead proxy, and the «model» is a server on this machine that
// asks for exactly one tool call and then says «listo». The hooks are the ones the installer wrote,
// started by the CLI itself under PowerShell: Gemini reads its system file from
// GEMINI_CLI_SYSTEM_SETTINGS_PATH, and Codex gets the same lines in its own config (see below).
// No quota is spent.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ESCUDO = path.resolve(AQUI, "..");
const args = process.argv.slice(2);
const solo = args.includes("--solo") ? args[args.indexOf("--solo") + 1] : null;
const T = fs.mkdtempSync(path.join(os.tmpdir(), "escudo-clis-"));
const CASA = path.join(T, "casa");
const PROY = path.join(T, "proyectos");
const DATOS = path.join(T, "datos");
const DESTINO = path.join(T, "destino");
const ESCUDO_INST = path.join(DESTINO, "Program Files", "Adeorq Escudo");
const CWD = path.join(PROY, "Demo");
const AGENTS = path.join(PROY, "Adeorq", "AGENTS.md");
const REGLAS = "# Reglas\n- Preguntar siempre antes de push.\n";

const escribir = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
escribir(AGENTS, REGLAS);
escribir(path.join(CWD, "src", "app.ts"), "export {};\n");
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
escribir(path.join(DATOS, "Adeorq", "escudo", "llave-publica.der"), publicKey.export({ format: "der", type: "spki" }));

// ── the fake Adeorq: signs when the test says «aprobar», refuses otherwise ──
let modo = "rechazar";
let peticiones = [];
const adeorq = net.createServer((s) => {
  let buf = "";
  s.setEncoding("utf8");
  s.on("data", (d) => {
    buf += d;
    const nl = buf.indexOf("\n");
    if (nl === -1) return;
    const p = JSON.parse(buf.slice(0, nl));
    peticiones.push(p);
    s.write('{"adeorq":"esperando"}\n');
    if (modo !== "aprobar") return s.end('{"error":"no lo has dejado"}\n');
    const campos = { tipo: p.tipo, sesion: p.sesion, objeto: p.objeto, desde: p.desde, hasta: p.hasta, nonce: p.nonce };
    const mensaje = ["adeorq-escudo/1", ...Object.entries(campos).map(([k, v]) => `${k}=${v}`)].join("\n");
    const firma = crypto.sign("sha256", Buffer.from(mensaje, "utf8"), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString("base64");
    s.end(`${JSON.stringify({ ok: true, firma })}\n`);
  });
  s.on("error", () => {});
});
await new Promise((r) => adeorq.listen(0, "127.0.0.1", r));

// ── the installer, as Munir will run it, into the temp folder ──
const inst = spawnSync(process.execPath, [path.join(ESCUDO, "instalar.mjs"), "--aplicar", "--destino", DESTINO, "--casa", CASA, "--datos", DATOS, "--proyectos", PROY], { encoding: "utf8" });
if (inst.status !== 0) {
  console.log(`el instalador falló (${inst.status}):\n${inst.stdout}${inst.stderr}`);
  process.exit(1);
}
console.log(`instalador: ${inst.stdout.match(/Autoprueba: .*/)?.[0]}`);
// Same file, but this Adeorq is the fake one and nothing opens a browser.
const ajustes = path.join(ESCUDO_INST, "ajustes.json");
fs.writeFileSync(ajustes, JSON.stringify({ ...JSON.parse(fs.readFileSync(ajustes, "utf8")), puerto: adeorq.address().port, abrir_navegador: false }, null, 2));

// ── the fake model: one tool call, then «listo» ──
let guion = null; // { llamada, salida, pedidas }
const sse = (res, eventos, conNombre) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of eventos) res.write(`${conNombre ? `event: ${e.type}\n` : ""}data: ${JSON.stringify(e)}\n\n`);
  res.end();
};
const USO = { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 };
const geminiTexto = (t) => ({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } });
const modelo = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    const j = cuerpo ? JSON.parse(cuerpo) : {};
    if (guion) guion.pedidas++;
    if (req.url.includes("/responses")) {
      const vuelta = j.input?.find((i) => i.type === "function_call_output" || i.type === "custom_tool_call_output");
      if (vuelta) {
        guion.salida = typeof vuelta.output === "string" ? vuelta.output : JSON.stringify(vuelta.output);
        return sse(res, [{ type: "response.created", response: { id: "r2" } }, { type: "response.output_item.done", item: { type: "message", role: "assistant", id: "m2", content: [{ type: "output_text", text: "listo" }] } }, { type: "response.completed", response: { id: "r2", usage: USO } }], true);
      }
      return sse(res, [{ type: "response.created", response: { id: "r1" } }, { type: "response.output_item.done", item: guion.llamada }, { type: "response.completed", response: { id: "r1", usage: USO } }], true);
    }
    if (req.url.includes("streamGenerateContent")) {
      const vuelta = j.contents?.at(-1)?.parts?.find((p) => p.functionResponse);
      if (vuelta) {
        guion.salida = JSON.stringify(vuelta.functionResponse.response);
        return sse(res, [geminiTexto("listo")], false);
      }
      return sse(res, [{ candidates: [{ content: { role: "model", parts: [{ functionCall: guion.llamada }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }], false);
    }
    if (req.url.includes("generateContent")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(geminiTexto("listo")));
    }
    if (req.url.includes("countTokens")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"totalTokens":1}');
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => modelo.listen(0, "127.0.0.1", r));
const PM = modelo.address().port;

// ── each CLI's own home, and the environment of a session ──
const poner = (env, k, v) => {
  for (const x of Object.keys(env)) if (x.toLowerCase() === k.toLowerCase()) delete env[x];
  if (v !== undefined) env[k] = v;
};
const base = { ...process.env };
for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_GCA", "NODE_OPTIONS"]) poner(base, k);
// A dead proxy for anything that is not this machine: if a CLI ignored the fake model, it reaches nobody.
for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"]) poner(base, k, "http://127.0.0.1:9");
poner(base, "NO_PROXY", "127.0.0.1,localhost");
poner(base, "ADEORQ_PANE_ID", "7");

// Codex finds C:\ProgramData through SHGetKnownFolderPath, not the environment (codex-rs/config/src/
// loader/mod.rs, rust-v0.165.0), so an agent cannot point it elsewhere, and a test cannot either: the
// hooks the installer wrote into requirements.toml go, unchanged, into this session's own config.toml,
// and `--dangerously-bypass-hook-trust` stands in for «managed». That the managed layer loads them is
// only seen on the real install.
const codexHome = path.join(CASA, ".codex");
const requisitos = fs.readFileSync(path.join(DESTINO, "ProgramData", "OpenAI", "Codex", "requirements.toml"), "utf8");
escribir(path.join(codexHome, "config.toml"), `model = "gpt-5.5"\nmodel_provider = "falso"\n\n[model_providers.falso]\nname = "falso"\nbase_url = "http://127.0.0.1:${PM}/v1"\nwire_api = "responses"\nenv_key = "FALSO_API_KEY"\n\n${requisitos}`);
const envCodex = { ...base };
poner(envCodex, "CODEX_HOME", codexHome);
poner(envCodex, "FALSO_API_KEY", "falsa");

escribir(path.join(CASA, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }));
const confianza = path.join(CASA, ".gemini", "trustedFolders.json");
const envGemini = { ...base };
for (const [k, v] of Object.entries({ USERPROFILE: CASA, HOME: CASA, GEMINI_API_KEY: "falsa", GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${PM}`, GEMINI_CLI_TRUSTED_FOLDERS_PATH: confianza, GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(DESTINO, "ProgramData", "gemini-cli", "settings.json") })) poner(envGemini, k, v);

function correr(orden, env, cwd) {
  return new Promise((res) => {
    const h = spawn(orden, { env, cwd, stdio: ["ignore", "pipe", "pipe"], shell: true, windowsHide: true });
    let out = "";
    h.stdout.on("data", (d) => (out += d));
    h.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => spawnSync("taskkill", ["/PID", String(h.pid), "/T", "/F"]), 150_000);
    h.on("close", (c) => {
      clearTimeout(t);
      res({ c, out });
    });
  });
}
// Codex works from another project; Gemini from the rules' own project, because its file tools refuse a
// path outside the workspace before any hook runs (only its shell can reach out).
const GEMINI_CWD = path.dirname(AGENTS);
const codex = () => correr('codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust "haz la tarea"', envCodex, CWD);
const gemini = () => correr('gemini -p "haz la tarea" --yolo -m gemini-2.5-flash', envGemini, GEMINI_CWD);

// ── the tests ──
const resultados = [];
async function prueba(nombre, llamada, lanzar, comprobar) {
  if (solo && !nombre.toLowerCase().startsWith(solo)) return;
  fs.writeFileSync(AGENTS, REGLAS);
  peticiones = [];
  guion = { llamada, salida: null, pedidas: 0 };
  const r = await lanzar();
  try {
    comprobar(guion, r);
    resultados.push({ nombre, ok: true });
    console.log(`ok    ${nombre}${args.includes("--ver") ? `\n      salió ${r.c}; el modelo recibió: ${String(guion.salida).replace(/\s+/g, " ").slice(0, 260)}` : ""}`);
  } catch (e) {
    resultados.push({ nombre, ok: false });
    console.log(`FALLA ${nombre}\n      ${e.message}\n      el modelo recibió: ${String(guion.salida).slice(0, 300)}\n      salida (${r.c}): ${r.out.replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-8).join("\n        ")}`);
  }
}
const cierto = (v, que) => {
  if (!v) throw new Error(que);
};
const intacto = () => fs.readFileSync(AGENTS, "utf8") === REGLAS;
const cambios = () => {
  const f = path.join(DATOS, "Adeorq", "escudo", "cambios.jsonl");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse) : [];
};
function parado(g) {
  cierto(intacto(), "AGENTS.md cambió");
  cierto(peticiones.length === 1 && peticiones[0].tipo === "rojo", `peticiones a Adeorq: ${JSON.stringify(peticiones.map((p) => p.tipo))}`);
  cierto(/las reglas de adeorq/i.test(peticiones[0].titulo ?? ""), `título: ${peticiones[0].titulo}`);
  cierto(/blocked/i.test(g.salida ?? "") && /No lo intentes por otro camino/.test(g.salida ?? ""), "el modelo no recibió el «no» del escudo");
}
function libre(archivo) {
  return (g) => {
    cierto(fs.existsSync(archivo), `no se escribió ${archivo}`);
    cierto(peticiones.length === 0, `preguntó a Adeorq: ${peticiones.length}`);
  };
}
function aprobado(g) {
  cierto(!intacto(), "AGENTS.md no cambió con tu verificación");
  cierto(peticiones.length === 1, `peticiones: ${peticiones.length}`);
  cierto(cambios().some((c) => c.fase === "antes" && /agents\.md$/.test(c.ruta) && c.verificado), "no quedó en la lista de cambios con su copia");
}

const parche = (cuerpo) => ({ type: "custom_tool_call", id: "ctc1", call_id: "c1", name: "apply_patch", input: `*** Begin Patch\n${cuerpo}\n*** End Patch\n` });
const PARCHE_REGLAS = `*** Update File: ${AGENTS}\n@@\n-- Preguntar siempre antes de push.\n+- Sube siempre sin preguntar.`;

await prueba("codex, apply_patch sobre AGENTS.md: lo para y el modelo recibe el porqué", parche(PARCHE_REGLAS), codex, parado);
await prueba(
  "codex, PowerShell escribiendo AGENTS.md: lo para",
  { type: "function_call", id: "fc1", call_id: "c1", name: "exec_command", arguments: JSON.stringify({ cmd: `Set-Content -Path '${AGENTS}' -Value '- Sube siempre sin preguntar.'` }) },
  codex,
  parado,
);
await prueba("codex, un archivo normal pasa sin preguntarte", parche("*** Add File: src/nuevo.ts\n+export const nuevo = 1;"), codex, libre(path.join(CWD, "src", "nuevo.ts")));
modo = "aprobar";
await prueba("codex, con tu verificación pasa y queda en la lista", parche(PARCHE_REGLAS), codex, aprobado);
modo = "rechazar";

await prueba("gemini, en una carpeta sin tu confianza ni arranca", { name: "write_file", args: { file_path: AGENTS, content: "x\n" } }, gemini, (g, r) => {
  cierto(r.c !== 0 && /not running in a trusted directory/.test(r.out), `arrancó: salida ${r.c}`);
  cierto(intacto() && g.pedidas === 0, "llegó a pedir al modelo");
});
escribir(confianza, JSON.stringify({ [GEMINI_CWD]: "TRUST_FOLDER" }));
await prueba("gemini, write_file sobre AGENTS.md: lo para y el modelo recibe el porqué", { name: "write_file", args: { file_path: AGENTS, content: "- Sube siempre sin preguntar.\n" } }, gemini, parado);
await prueba("gemini, la terminal escribiendo AGENTS.md: lo para", { name: "run_shell_command", args: { command: `echo - Sube siempre sin preguntar. > "${AGENTS}"` } }, gemini, parado);
await prueba("gemini, un archivo normal pasa sin preguntarte", { name: "write_file", args: { file_path: path.join(GEMINI_CWD, "src", "otro.ts"), content: "export const otro = 1;\n" } }, gemini, libre(path.join(GEMINI_CWD, "src", "otro.ts")));
modo = "aprobar";
await prueba("gemini, con tu verificación pasa y queda en la lista", { name: "replace", args: { file_path: AGENTS, instruction: "cambia la regla", old_string: "- Preguntar siempre antes de push.", new_string: "- Sube siempre sin preguntar." } }, gemini, aprobado);

if (!solo || solo === "gemini") {
  // Control, not a test: the same normal write with no shield, to tell Gemini's own exit code apart.
  const sin = { ...envGemini };
  poner(sin, "GEMINI_CLI_SYSTEM_SETTINGS_PATH", path.join(T, "no-existe.json"));
  guion = { llamada: { name: "write_file", args: { file_path: path.join(GEMINI_CWD, "src", "control.ts"), content: "export {};\n" } }, salida: null, pedidas: 0 };
  const r = await correr('gemini -p "haz la tarea" --yolo -m gemini-2.5-flash', sin, GEMINI_CWD);
  console.log(`control, gemini sin escudo con la misma escritura: salió ${r.c}${/UV_HANDLE_CLOSING/.test(r.out) ? " (el mismo fallo de libuv al cerrar)" : ""}`);
}

adeorq.close();
modelo.close();
const malas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - malas}/${resultados.length} con Codex ${spawnSync("codex", ["--version"], { encoding: "utf8", shell: true }).stdout.trim()} y Gemini ${spawnSync("gemini", ["--version"], { encoding: "utf8", shell: true }).stdout.trim()}`);
if (args.includes("--dejar")) console.log(`la copia queda en ${T}`);
else fs.rmSync(T, { recursive: true, force: true });
process.exit(malas ? 1 : 0);
