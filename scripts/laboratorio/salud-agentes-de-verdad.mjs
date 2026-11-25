// El aviso de la noche a los agentes (Ajustes › Salud, `lib/saludAgentesVivo.ts`)
// con un Claude Code, un Codex y un Gemini de verdad en una Adeorq aislada: al
// entrar en el aviso, a cada uno le llega tecleada UNA línea para cerrar y la
// envía a su modelo; a una consola, a un Claude con una pregunta en pantalla y a
// uno con un borrador tuyo en la caja, nada; al vaciar el borrador, le llega.
//
// Sin gastar: los tres CLI del PATH con casa y claves falsas contra una API de
// mentira en este proceso (la receta de `quieta-de-verdad.mjs` para Claude y la
// de `vuelta-arriba-otros-cli-de-verdad.mjs` para Codex y Gemini), que contesta
// «Hecho.» a todo; a «PREGUNTA DE PRUEBA», una pregunta con su menú.
//
// El horario se enciende cuando los cinco están listos, con el cierre a +10
// minutos de la hora de verdad (ya dentro de los 15 del aviso) y el despertar a
// +3 h, como `salud-tapa.js`.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/salud-agentes-de-verdad.mjs [exe]
//
// Sale con 1 si algo falla.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "sa";
const PUERTO = 43_000 + (process.pid % 800);
const DEPURAR = 9_300 + (process.pid % 50);
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle && !bien ? `\n      ${String(detalle).slice(0, 1500)}` : ""}`);
};
for (const k of Object.keys(process.env)) {
  if (/^(CLAUDE|ANTHROPIC)/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_API_KEY|CODEX_HOME|GEMINI_CLI_HOME|HTTPS?_PROXY|ALL_PROXY)$/i.test(k)) delete process.env[k];
}

/** La línea de la casa, en el idioma que tenga la app aislada. */
const AVISO = /Aviso de Salud|Health notice/;
/** La misma, en una pantalla a la que se le quitaron los espacios (`junto`). */
const AVISO_JUNTO = /AvisodeSalud|Healthnotice/;
const PREGUNTA = "PREGUNTA DE PRUEBA";

// ── La API de mentira de los tres ──────────────────────────────────────────
const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? c.content ?? "").join(" "));
/** Los turnos de verdad de cada uno (los de Claude, los que llevan herramientas:
    los sueltos, el título y demás, no cuentan). */
const recibido = { claude: [], gemini: [], codex: [] };
function claude(req, res, cuerpo) {
  let j = {};
  try {
    j = JSON.parse(cuerpo);
  } catch {}
  if (req.url.includes("count_tokens")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ input_tokens: 1000 }));
  }
  const ultimo = textoDe((j.messages ?? []).filter((m) => m.role === "user").at(-1));
  const turno = (j.tools ?? []).length > 0;
  if (turno) recibido.claude.push(ultimo);
  const herramientas = (j.tools ?? []).map((t) => t.name);
  const preguntar = turno && ultimo.includes(PREGUNTA);
  const n = Object.values(recibido).flat().length;
  const msg = { id: `msg_lab_${n}`, type: "message", role: "assistant", model: j.model ?? "claude-sonnet", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };
  const texto = "Hecho.";
  if (!j.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ...msg, content: [{ type: "text", text: texto }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 2 } }));
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const ev = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
  ev("message_start", { message: msg });
  if (preguntar) {
    // Un menú en pantalla: la pregunta de Claude Code si la tiene, y si no un permiso.
    const pregunta = herramientas.includes("AskUserQuestion");
    const entrada = pregunta
      ? { questions: [{ question: "¿Sigo con la prueba?", header: "Prueba", multiSelect: false, options: [{ label: "Sí", description: "Seguir" }, { label: "No", description: "Parar" }] }] }
      : { command: "echo laboratorio", description: "Prueba de laboratorio" };
    ev("content_block_start", { index: 0, content_block: { type: "tool_use", id: `toolu_lab_${n}`, name: pregunta ? "AskUserQuestion" : "Bash", input: {} } });
    ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(entrada) } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } });
  } else {
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } });
  }
  ev("message_stop", {});
  res.end();
}
const api = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    const json = (v) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v));
    };
    if (req.url.startsWith("/v1/messages")) return claude(req, res, cuerpo);
    if (/:streamGenerateContent/.test(req.url)) {
      recibido.gemini.push(cuerpo);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const r = { candidates: [{ content: { role: "model", parts: [{ text: "Hecho." }] }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
      return res.end(`data: ${JSON.stringify(r)}\r\n\r\n`);
    }
    if (/:generateContent/.test(req.url)) return json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ reasoning: "simple", model_choice: "flash" }) }] }, finishReason: "STOP", index: 0 }] });
    if (/:countTokens/.test(req.url)) return json({ totalTokens: 10 });
    if (req.method === "POST" && /\/responses$/.test(req.url.split("?")[0])) {
      recibido.codex.push(cuerpo);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const id = `resp_${recibido.codex.length}`;
      const eventos = [
        { type: "response.created", response: { id } },
        { type: "response.output_item.done", item: { type: "message", role: "assistant", id: `msg_${recibido.codex.length}`, content: [{ type: "output_text", text: "Hecho." }] } },
        { type: "response.completed", response: { id, usage: { input_tokens: 10, input_tokens_details: null, output_tokens: 2, output_tokens_details: null, total_tokens: 12 } } },
      ];
      return res.end(eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""));
    }
    if (/\/models/.test(req.url)) return json({ models: [] });
    json({});
  });
});
await new Promise((ok) => api.listen(0, "127.0.0.1", ok));
const URL_API = `http://127.0.0.1:${api.address().port}`;

// ── La Adeorq aislada, con la casa de los tres ───────────────────────────────
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casaCodex = join(base, "casa", ".codex");
const casaClaude = join(base, "casa", ".claude");
const a = await abrirAislada({
  nombre,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe: process.argv[2] ?? EXE,
  sembrar: () => {
    const demo = join(base, "proyectos", "demo");
    mkdirSync(casaCodex, { recursive: true });
    writeFileSync(join(casaCodex, "auth.json"), JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-laboratorio-falsa-0000000000000000" }));
    writeFileSync(
      join(casaCodex, "config.toml"),
      [
        `model_provider = "laboratorio"`,
        `check_for_update_on_startup = false`,
        ``,
        `[model_providers.laboratorio]`,
        `name = "Laboratorio"`,
        `base_url = "${URL_API}/v1"`,
        `env_key = "OPENAI_API_KEY"`,
        `wire_api = "responses"`,
        `supports_websockets = false`,
        ``,
        `[projects."${demo.replace(/\\/g, "\\\\")}"]`,
        `trust_level = "trusted"`,
        ``,
      ].join("\r\n"),
    );
    const gem = join(base, "casa", ".gemini");
    mkdirSync(gem, { recursive: true });
    writeFileSync(join(gem, "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } }, ui: { theme: "Default" }, general: { disableAutoUpdate: true, disableUpdateNag: true }, privacy: { usageStatisticsEnabled: false } }));
    writeFileSync(join(gem, "trustedFolders.json"), JSON.stringify({ [demo]: "TRUST_FOLDER" }));
    mkdirSync(casaClaude, { recursive: true });
    const confianza = { hasTrustDialogAccepted: true, allowedTools: [] };
    writeFileSync(
      join(casaClaude, ".claude.json"),
      JSON.stringify({ hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] }, projects: { [demo.replace(/\\/g, "/")]: confianza, [demo]: confianza } }),
    );
    writeFileSync(join(casaClaude, "settings.json"), JSON.stringify({ model: "sonnet" }));
  },
  entorno: {
    CODEX_HOME: casaCodex,
    OPENAI_API_KEY: "sk-laboratorio-falsa-0000000000000000",
    GEMINI_API_KEY: "laboratorio-falsa-0000000000000000",
    GOOGLE_GEMINI_BASE_URL: URL_API,
    CLAUDE_CONFIG_DIR: casaClaude,
    ANTHROPIC_API_KEY: CLAVE,
    ANTHROPIC_BASE_URL: URL_API,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
  },
});

/** Un módulo de la app tal como lo cargó la ventana (con su `?t=` si lo tiene). */
const urlDe = (archivo) => `(performance.getEntriesByType("resource").map((e) => e.name).find((n) => new URL(n).pathname === "/src/lib/${archivo}") ?? "/src/lib/${archivo}")`;
const importar = (archivo) => `import(${urlDe(archivo)})`;
const pantalla = (id) =>
  a.v.js(`${importar("terminales.ts")}.then((m) => {
    const t = m.xtermDe(${id});
    if (!t) return "";
    const b = t.buffer.active;
    const filas = [];
    for (let i = 0; i < b.length; i++) filas.push(b.getLine(i)?.translateToString(true) ?? "");
    return filas.join("\\n");
  })`);
const estadoDe = (id) => a.v.js(`${importar("cabina.ts")}.then((m) => m.useCabina.getState().estados[${id}]?.state ?? null)`);
/** Sin espacios ni saltos: cada CLI parte las líneas largas a su manera. */
const junto = (t) => t.replace(/\s+/g, "");
const avisos = (cli) => recibido[cli].filter((c) => AVISO.test(c)).length;
const abajo = (t) => t.split("\n").filter((l) => l.trim()).slice(-12).map((l) => `        ${l}`).join("\n");
const hhmm = (min) => {
  const d = new Date(Date.now() + min * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const mira = a.puente(null);
try {
  await mira.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await mira.llamar("get_active_panes", {})).texto || ""), 15_000, 500);
  const abrir = async (cli, nombrePanel) => {
    const r = await mira.llamar("open_pane", { cli, cwd: a.demo, name: nombrePanel });
    const id = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
    if (!Number.isFinite(id)) throw new Error(`open_pane ${cli}: ${r.texto ?? r.error}`);
    return id;
  };
  const p = {
    claude: await abrir("claude", "claude-parada"),
    pregunta: await abrir("claude", "claude-pregunta"),
    borrador: await abrir("claude", "claude-borrador"),
    codex: await abrir("codex", "codex"),
    gemini: await abrir("gemini", "gemini"),
    consola: await abrir("shell", "consola"),
  };

  // Los tres Claude, en su caja; un turno cada uno para que su panel diga «lista».
  for (const k of ["claude", "pregunta", "borrador"]) {
    const caja = await hasta(async () => {
      const t = await pantalla(p[k]);
      return /for shortcuts|to cycle\)|Try "/i.test(t) && !/trust this folder/i.test(t);
    }, 90_000, 1000);
    dice(!!caja, `${k}: Claude Code arranca en su caja`, abajo(await pantalla(p[k])));
  }
  await dormir(1500);
  await mira.llamar("send_command", { paneId: p.claude, command: "hola" });
  await mira.llamar("send_command", { paneId: p.borrador, command: "hola" });
  await mira.llamar("send_command", { paneId: p.pregunta, command: PREGUNTA });
  for (const k of ["claude", "borrador"]) {
    const lista = await hasta(async () => (await estadoDe(p[k])) === "lista", 60_000, 1000);
    dice(!!lista, `${k}: contesta su turno y su panel dice «lista»`, `estado ${await estadoDe(p[k])}\n${abajo(await pantalla(p[k]))}`);
  }
  const menu = await hasta(async () => /Sigo con la prueba|Do you want to proceed|echo laboratorio/.test(await pantalla(p.pregunta)), 60_000, 1000);
  dice(!!menu, "pregunta: Claude Code se para con un menú en pantalla", abajo(await pantalla(p.pregunta)));

  // Codex y Gemini, como en la vuelta hacia arriba.
  await hasta(async () => (await pantalla(p.gemini)).includes("Type your message or @path/to/file"), 60_000, 1000);
  await hasta(async () => (await pantalla(p.codex)).includes("? for shortcuts"), 60_000, 1000);
  await dormir(3000);
  await mira.llamar("send_command", { paneId: p.codex, command: "hola" });
  for (let i = 0; i < 3 && !(await hasta(() => recibido.codex.length > 0, 10_000, 500)); i++) {
    await mira.llamar("send_keys", { paneId: p.codex, keys: ["enter"] });
  }
  const codexLista = await hasta(async () => (await estadoDe(p.codex)) === "lista", 60_000, 1000);
  dice(!!codexLista, "codex: contesta su turno y su panel dice «lista»", `estado ${await estadoDe(p.codex)}\n${abajo(await pantalla(p.codex))}`);

  // El borrador, escrito sin mandar, como quien deja algo a medias en la caja.
  await a.v.js(`${importar("pty.ts")}.then((m) => m.sendPty(${p.borrador}, "borrador de Munir", false)).then(() => "ok")`);
  await dormir(2000);
  const antes = { claude: recibido.claude.length, codex: recibido.codex.length, gemini: recibido.gemini.length };

  // ── El horario, encendido ahora: cierre a +10 min, dentro del aviso ──────────
  const salud = { activo: true, cierre: hhmm(10), porDia: false, dias: Array(7).fill("01:00"), avisoMin: 15, despierta: hhmm(180) };
  await a.v.js(`localStorage.setItem("adeorq-salud", ${JSON.stringify(JSON.stringify(salud))}); "ok"`);
  const empieza = Date.now();
  const llegan = await hasta(() => avisos("claude") >= 1 && avisos("codex") >= 1 && avisos("gemini") >= 1, 60_000, 500);
  const segundos = ((Date.now() - empieza) / 1000).toFixed(0);
  dice(avisos("claude") === 1, `claude parada: le llega la línea y la envía a su modelo (${segundos} s)`, `avisos ${avisos("claude")}\n${abajo(await pantalla(p.claude))}`);
  // Codex manda dos peticiones por turno, y cada una lleva el historial: aquí
  // basta con que llegue; cuántas veces se tecleó lo dice su pantalla, abajo.
  dice(avisos("codex") >= 1, "codex: le llega y la envía", `avisos ${avisos("codex")}\n${abajo(await pantalla(p.codex))}`);
  dice(avisos("gemini") === 1, "gemini: le llega y la envía", `avisos ${avisos("gemini")}\n${abajo(await pantalla(p.gemini))}`);
  if (llegan) {
    const linea = recibido.claude.find((c) => AVISO.test(c)) ?? "";
    dice(/ordenador|computer/.test(linea) && /\(\d{1,2}:\d\d\)/.test(linea), "la línea llega entera, con la hora entre paréntesis", linea);
  }
  const franja = await a.v.js(`document.querySelector(".salud-franja")?.textContent ?? ""`);
  dice(/\(\d{1,2}:\d\d\)/.test(franja), "y la franja del aviso se ve abajo", franja);

  // Lo que no tiene que llevarse nada, mirado otros 30 s.
  await dormir(30_000);
  const tPregunta = await pantalla(p.pregunta);
  dice(!AVISO_JUNTO.test(junto(tPregunta)) && /Sigo con la prueba|Do you want to proceed|echo laboratorio/.test(tPregunta), "con una pregunta en pantalla, no se le teclea nada y el menú sigue", abajo(tPregunta));
  const tBorrador = await pantalla(p.borrador);
  dice(!AVISO_JUNTO.test(junto(tBorrador)) && tBorrador.includes("borrador de Munir"), "con un borrador en la caja, no se le teclea nada y el borrador sigue", abajo(tBorrador));
  const tConsola = await pantalla(p.consola);
  dice(!AVISO_JUNTO.test(junto(tConsola)), "a una consola, nada", abajo(tConsola));
  /** Cuántas veces sale la línea en la pantalla de esa terminal. */
  const vecesEn = async (id) => junto(await pantalla(id)).split("AvisodeSalud").length - 1;
  const unaVez = async () => ({ claude: await vecesEn(p.claude), codex: await vecesEn(p.codex), gemini: await vecesEn(p.gemini) });
  const vistas = await unaVez();
  dice(vistas.claude === 1 && vistas.codex === 1 && vistas.gemini === 1, "una vez por noche: en cada pantalla sale una sola vez", JSON.stringify(vistas));

  // Al vaciar el borrador, le llega.
  await mira.llamar("send_keys", { paneId: p.borrador, keys: Array(17).fill("backspace") });
  const vacio = await hasta(() => avisos("claude") >= 2, 40_000, 500);
  dice(!!vacio, "al vaciar su caja, la del borrador también la recibe", `avisos ${avisos("claude")}\n${abajo(await pantalla(p.borrador))}`);
  await dormir(15_000);
  const despues = await unaVez();
  dice(avisos("claude") === 2 && JSON.stringify(despues) === JSON.stringify(vistas), "y nada más en los 15 s siguientes", JSON.stringify({ claudeApi: avisos("claude"), despues, antes }));
} catch (e) {
  dice(false, "el laboratorio terminó", String(e?.stack ?? e));
} finally {
  mira.cerrar();
  await a.cerrar();
  api.close();
}
console.log(fallos ? `\n${fallos} fallos` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
