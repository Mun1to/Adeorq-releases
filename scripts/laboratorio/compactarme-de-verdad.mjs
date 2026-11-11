// `compactarme` de punta a punta, con un Claude Code DE VERDAD y sin gastar.
// Munir, 2026-11-11: «que una sesión se autocompacte con el skill de fin mensaje de
// compactación + que se retome automáticamente».
//
// El oráculo es lo que le llega al modelo. Claude Code corre con su carpeta de
// configuración propia, una clave falsa y una API de mentira en este proceso
// (`ANTHROPIC_BASE_URL`), y con el MCP de la Adeorq aislada en su `.claude.json`:
//   1. Se le escribe «lab-compactarme» y el «modelo» llama a `compactarme` con un
//      bloque de varias líneas, sin `seguir` (el de la casa), y acaba su turno.
//   2. Adeorq no teclea nada a mitad del turno: el `/compact` llega DESPUÉS de que
//      el modelo reciba la respuesta de la herramienta.
//   3. La petición de resumir trae el bloque entero, con sus saltos de línea.
//   4. Al acabar de compactar, a la API le llega el «sigue» de la casa, ya sobre el
//      resumen y sin la conversación de antes.
//   5. Y nadie más puede: un agente sin terminal, o que dice ser esa terminal sin
//      su contraseña, recibe un no.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/compactarme-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Sale con 1 si algo falla.
import http from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3198;
const DEPURAR = 9398;
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const MARCA = "LAB-BLOQUE-7731";
const BLOQUE = `# COMPACTACIÓN, Sesión de laboratorio (${MARCA})\n\n## Qué se hizo\n1. Probar compactarme con tildes: ñ, «comillas».\n\n## Pendiente\n- Que siga sola.`;
const RESUMEN = "Resumen de laboratorio: se probó compactarme y queda que siga sola.";
mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 400)})` : ""}`);
  if (!bien) fallos.push(que);
  return bien;
};

// ─── La API de mentira ──────────────────────────────────────────────────────
/** Lo que le llega, en orden: «pide» (llama a compactarme), «resultado» (vuelve
    la respuesta de la herramienta), «resumir», «sigue». */
const api = { orden: [], resultado: null, resumir: null, sigue: null, herramientas: null };
const servidor = http.createServer((pet, res) => {
  let cuerpo = "";
  pet.on("data", (d) => (cuerpo += d));
  pet.on("end", () => {
    const error = () => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "laboratorio" } }));
    };
    let j = null;
    try {
      j = JSON.parse(cuerpo);
    } catch {}
    if (!pet.url.includes("/v1/messages") || !j) return error();
    const sse = (bloques, parada) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
      ev("message_start", { message: { id: `msg_lab_${Date.now()}`, type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
      bloques.forEach((b, index) => {
        if (b.type === "text") {
          ev("content_block_start", { index, content_block: { type: "text", text: "" } });
          ev("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
        } else {
          ev("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
          ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
        }
        ev("content_block_stop", { index });
      });
      ev("message_delta", { delta: { stop_reason: parada, stop_sequence: null }, usage: { output_tokens: 5 } });
      ev("message_stop", {});
      res.end();
    };
    const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? (typeof c.content === "string" ? c.content : "")).join(" "));
    const todo = (j.messages ?? []).map(textoDe).join("\n");
    const u = (j.messages ?? []).filter((m) => m.role === "user").at(-1);
    const ultimo = textoDe(u);
    // La petición de resumir: la única que lleva el bloque en el último mensaje.
    if (ultimo.includes(MARCA) && !api.resumir) {
      api.resumir = ultimo;
      api.orden.push("resumir");
      return sse([{ type: "text", text: `<summary>${RESUMEN}</summary>` }], "end_turn");
    }
    const nombres = (j.tools ?? []).map((t) => t.name);
    if (!nombres.includes("mcp__adeorq__compactarme")) return error();
    if (/^\s*\[SUGGESTION MODE/.test(ultimo)) return error();
    api.herramientas ??= nombres;
    const resultado = (Array.isArray(u?.content) ? u.content : []).find((c) => c.type === "tool_result");
    if (resultado && !api.resultado) {
      api.resultado = { texto: textoDe({ content: resultado.content }), error: !!resultado.is_error };
      api.orden.push("resultado");
      return sse([{ type: "text", text: "Listo: me compacto al acabar este mensaje." }], "end_turn");
    }
    if (ultimo.includes("lab-compactarme") && !api.orden.includes("pide")) {
      api.orden.push("pide");
      return sse([{ type: "tool_use", id: "toolu_lab_compactarme", name: "mcp__adeorq__compactarme", input: { mensaje: BLOQUE } }], "tool_use");
    }
    if (/compactad/i.test(ultimo) && !api.sigue) {
      api.sigue = { ultimo, todo };
      api.orden.push("sigue");
      return sse([{ type: "text", text: "Sigo con lo pendiente." }], "end_turn");
    }
    return sse([{ type: "text", text: "Recibido." }], "end_turn");
  });
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const PUERTO_API = servidor.address().port;

// ─── La Adeorq aislada ──────────────────────────────────────────────────────
for (const k of Object.keys(process.env)) {
  if ((/^CLAUDE/i.test(k) && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_CLAVE" || k === "ADEORQ_PANE_ID" || k === "ADEORQ_TERMINALES_CANAL") delete process.env[k];
}
const exe = process.argv[3] ? resolve(process.argv[3]) : EXE;
let CASA = null;
// La cuenta de la casa aislada: bienvenida pasada, la clave falsa aprobada, el MCP
// de ESTA Adeorq (su puerto) y compactarme sin preguntar.
const sembrarClaude = (datos) => {
  const casa = resolve(datos, "..", "..", "casa");
  CASA = casa;
  const demo = resolve(datos, "..", "..", "proyectos", "demo");
  const confiada = { hasTrustDialogAccepted: true, allowedTools: [] };
  mkdirSync(join(casa, ".claude"), { recursive: true });
  writeFileSync(join(casa, ".claude.json"), JSON.stringify({
    hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: { [demo.replace(/\\/g, "/")]: confiada, [demo]: confiada },
    mcpServers: { adeorq: { type: "stdio", command: exe, args: ["--mcp"], env: { ADEORQ_MCP_PUERTO: String(PUERTO_MCP) } } },
  }));
  writeFileSync(join(casa, ".claude", "settings.json"), JSON.stringify({ tui: "fullscreen", permissions: { allow: ["mcp__adeorq__compactarme"] } }));
};

const a = await abrirAislada({
  nombre: "compactarme",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe,
  sembrar: sembrarClaude,
  entorno: {
    ANTHROPIC_API_KEY: CLAVE, ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_API}`, SSH_CONNECTION: "laboratorio", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_NO_FLICKER: "1",
    // Las herramientas del MCP en la lista de la petición, no detrás de su buscador.
    ENABLE_TOOL_SEARCH: "false",
  },
});
try {
  const { v, demo } = a;
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);

  const abierta = await agente.llamar("open_pane", { cli: "claude", cwd: demo, name: "Se compacta sola", brief: "" });
  const claude = Number(/Terminal\s+(\d+)/.exec(abierta.texto ?? "")?.[1]);
  if (!claude) throw new Error(`no abrió el Claude: ${abierta.texto ?? abierta.error}`);
  const caja = await hasta(async () => (/for shortcuts|to cycle\)|Try "/i.test(await pantalla(claude)) ? true : null), 90_000, 1000);
  if (!caja) throw new Error(`Claude Code no llegó a su caja:\n${await pantalla(claude)}`);
  await dormir(2500);

  // 5. Nadie más: sin terminal, y diciendo ser esa terminal sin su contraseña.
  const sinPanel = await agente.llamar("compactarme", { mensaje: BLOQUE });
  debe(/ADEORQ_PANE_ID/.test(sinPanel.error ?? sinPanel.texto ?? ""), "un agente sin terminal no puede", sinPanel.error ?? sinPanel.texto);
  const impostor = a.puente(claude);
  await impostor.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "impostor", version: "1" } });
  const finge = await impostor.llamar("compactarme", { mensaje: BLOQUE });
  impostor.cerrar();
  debe(!/^Hecho/.test(finge.texto ?? ""), "quien dice ser esa terminal sin su contraseña no puede", finge.error ?? finge.texto);
  await dormir(1500);
  debe(!/\/compact/.test(await pantalla(claude)), "y a la terminal no le llegó ningún /compact");

  // 1 a 4. La sesión se compacta a sí misma.
  await teclear(claude, "lab-compactarme");
  await dormir(400);
  await teclear(claude, "\r");
  const pidio = await hasta(() => api.orden.includes("pide") || null, 30_000, 200);
  if (!pidio) throw new Error(`el modelo de mentira no recibió el encargo (¿falta el MCP en la lista?):\n${await pantalla(claude)}`);
  await hasta(() => api.resultado, 30_000, 200);
  debe(api.resultado && !api.resultado.error && /^Hecho\./.test(api.resultado.texto), "compactarme contesta que lo hará al acabar el turno", api.resultado?.texto);
  writeFileSync(join(FOTOS, "compactarme-1-tras-pedirlo.txt"), await pantalla(claude));

  const resumio = await hasta(() => api.resumir, 60_000, 300);
  debe(Boolean(resumio), "Adeorq teclea el /compact y Claude Code pide el resumen", await pantalla(claude));
  debe(api.orden.indexOf("resumir") > api.orden.indexOf("resultado"), "el /compact llega DESPUÉS de acabar el turno, no a mitad", api.orden.join(" → "));
  const lineas = BLOQUE.split("\n").filter((l) => l.trim());
  debe(Boolean(resumio) && lineas.every((l) => api.resumir.includes(l)), "la petición de resumir trae el bloque entero, línea a línea", lineas.filter((l) => !api.resumir?.includes(l)).join(" | "));

  const siguio = await hasta(() => api.sigue, 60_000, 300);
  writeFileSync(join(FOTOS, "compactarme-2-al-final.txt"), await pantalla(claude));
  debe(Boolean(siguio), "al acabar de compactar, Adeorq le escribe que siga y le llega al modelo", await pantalla(claude));
  if (siguio) {
    debe(/Sigue con lo pendiente del resumen/.test(api.sigue.ultimo), "con el «sigue» de la casa", api.sigue.ultimo.slice(0, 200));
    debe(api.sigue.todo.includes(RESUMEN), "ya sobre el resumen", api.sigue.todo.slice(0, 300));
    debe(!api.sigue.todo.includes("lab-compactarme"), "y sin la conversación de antes");
  }
  debe(api.orden.join(" ") === "pide resultado resumir sigue", "en orden: pide, contesta, resume y sigue", api.orden.join(" → "));

  // El transcript tiene su marca de compactación.
  const proyectos = join(CASA, ".claude", "projects");
  const jsonl = existsSync(proyectos) ? readdirSync(proyectos).flatMap((d) => readdirSync(join(proyectos, d)).filter((f) => f.endsWith(".jsonl")).map((f) => join(proyectos, d, f))) : [];
  const marcas = jsonl.reduce((n, f) => n + (readFileSync(f, "utf8").match(/"subtype":"compact_boundary"/g) ?? []).length, 0);
  debe(marcas === 1, "una sola compactación en el transcript", `${marcas} en ${jsonl.length} conversaciones`);
  await a.foto(null, "compactarme-3-ventana.png");
} catch (e) {
  fallos.push(String(e?.message ?? e));
  console.log(`MAL   ${e?.stack ?? e}`);
} finally {
  await a.cerrar();
  servidor.close();
}
console.log(fallos.length ? `\n${fallos.length} MAL:\n  ${fallos.join("\n  ")}` : "\nTodo bien.");
process.exitCode = fallos.length ? 1 : 0;
