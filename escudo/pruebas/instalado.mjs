// After a real install: do Codex and Gemini load the shield from C:\ProgramData by themselves?
//
//   node escudo/pruebas/instalado.mjs [--solo codex|gemini] [--ver]
//
// clis.mjs proves the hooks work but has to hand them to Codex through its own config, because Codex
// finds C:\ProgramData through Windows and not the environment. This one runs after `instalar.mjs
// --aplicar`, gives each CLI a fake model, a fake home and no hooks of its own, and asks for one write
// into C:\Program Files\Adeorq Escudo. The shield denies that at once, without asking Adeorq, so no red
// window opens. If a CLI did not load the shield, the write still fails, because a user cannot write
// there; the test tells the two apart by what the model got back. No quota is spent, nothing of Munir's
// is changed (the shield only appends one «denegado» line to its own registro.jsonl per CLI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const solo = args.includes("--solo") ? args[args.indexOf("--solo") + 1] : null;
const PROGRAMAS = process.env.ProgramFiles ?? "C:\\Program Files";
const DATOS_PROG = process.env.ProgramData ?? "C:\\ProgramData";
const LISTA = path.join(PROGRAMAS, "Adeorq Escudo", "lista.json");
const INSTALADOS = [LISTA, path.join(DATOS_PROG, "OpenAI", "Codex", "requirements.toml"), path.join(DATOS_PROG, "gemini-cli", "settings.json")];
const faltan = INSTALADOS.filter((p) => !fs.existsSync(p));
if (faltan.length) {
  console.log(`El escudo no está instalado (falta ${faltan.join(", ")}): primero node escudo/instalar.mjs --aplicar`);
  process.exit(1);
}
const antes = fs.readFileSync(LISTA);

const T = fs.mkdtempSync(path.join(os.tmpdir(), "escudo-instalado-"));
const CASA = path.join(T, "casa");
const CWD = path.join(T, "Demo");
const escribir = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
escribir(path.join(CWD, "src", "app.ts"), "export {};\n");

// ── the fake model: one tool call, then «listo» (same protocol as clis.mjs) ──
let guion = null;
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

// ── each CLI with its own home and no hooks of its own: anything that runs came from C:\ProgramData ──
const poner = (env, k, v) => {
  for (const x of Object.keys(env)) if (x.toLowerCase() === k.toLowerCase()) delete env[x];
  if (v !== undefined) env[k] = v;
};
const base = { ...process.env };
for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_GCA", "NODE_OPTIONS", "GEMINI_CLI_SYSTEM_SETTINGS_PATH"]) poner(base, k);
for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"]) poner(base, k, "http://127.0.0.1:9");
poner(base, "NO_PROXY", "127.0.0.1,localhost");

const codexHome = path.join(CASA, ".codex");
escribir(path.join(codexHome, "config.toml"), `model = "gpt-5.5"\nmodel_provider = "falso"\n\n[model_providers.falso]\nname = "falso"\nbase_url = "http://127.0.0.1:${PM}/v1"\nwire_api = "responses"\nenv_key = "FALSO_API_KEY"\n`);
const envCodex = { ...base };
poner(envCodex, "CODEX_HOME", codexHome);
poner(envCodex, "FALSO_API_KEY", "falsa");

escribir(path.join(CASA, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }));
const confianza = path.join(CASA, ".gemini", "trustedFolders.json");
escribir(confianza, JSON.stringify({ [CWD]: "TRUST_FOLDER" }));
const envGemini = { ...base };
for (const [k, v] of Object.entries({ USERPROFILE: CASA, HOME: CASA, GEMINI_API_KEY: "falsa", GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${PM}`, GEMINI_CLI_TRUSTED_FOLDERS_PATH: confianza })) poner(envGemini, k, v);

function correr(orden, env) {
  return new Promise((res) => {
    const h = spawn(orden, { env, cwd: CWD, stdio: ["ignore", "pipe", "pipe"], shell: true, windowsHide: true });
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

const resultados = [];
async function prueba(nombre, llamada, orden, env) {
  if (solo && !nombre.toLowerCase().startsWith(solo)) return;
  guion = { llamada, salida: null, pedidas: 0 };
  const r = await correr(orden, env);
  const salida = String(guion.salida ?? "");
  const ok = /blocked/i.test(salida) && /parte del propio escudo/.test(salida) && fs.readFileSync(LISTA).equals(antes);
  resultados.push(ok);
  const ver = args.includes("--ver") || !ok;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${ver ? `\n      salió ${r.c}; el modelo recibió: ${salida.replace(/\s+/g, " ").slice(0, 300) || "(nada)"}` : ""}`);
  if (!ok) console.log(`      salida: ${r.out.replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-8).join("\n        ")}`);
}

await prueba(
  "codex carga el escudo de C:\\ProgramData\\OpenAI\\Codex sin nada en su config",
  { type: "custom_tool_call", id: "ctc1", call_id: "c1", name: "apply_patch", input: `*** Begin Patch\n*** Update File: ${LISTA}\n@@\n-{\n+{ \n*** End Patch\n` },
  'codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "haz la tarea"',
  envCodex,
);
await prueba(
  "gemini carga el escudo de C:\\ProgramData\\gemini-cli sin nada en su config",
  { name: "run_shell_command", args: { command: `echo x > "${LISTA}"` } },
  'gemini -p "haz la tarea" --yolo -m gemini-2.5-flash',
  envGemini,
);

modelo.close();
fs.rmSync(T, { recursive: true, force: true });
const malas = resultados.filter((x) => !x).length;
console.log(`\n${resultados.length - malas}/${resultados.length} con el escudo instalado`);
process.exit(malas ? 1 : 0);
