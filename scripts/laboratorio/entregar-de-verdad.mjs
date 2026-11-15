// «La vuelta hacia arriba» de punta a punta: `entregar` y el aviso a la madre,
// con dos Claude Code DE VERDAD (madre e hija) y sin gastar.
//
// El oráculo es lo que le llega al modelo. Los dos Claude Code corren con una
// casa propia, una clave falsa y una API de mentira en este proceso
// (`ANTHROPIC_BASE_URL`), y con el MCP de la Adeorq aislada en su `.claude.json`:
//   1. Un agente sin terminal no puede entregar.
//   2. A la madre se le escribe «lab-reparte» y su «modelo» abre una hija con
//      `open_pane`; al encargo de la hija le llega detrás la línea `[adeorq]` que
//      le pide llamar a `entregar`.
//   3. La hija entrega «hecho» y se le contesta a quién se lo entregó.
//   4. A la madre, ya parada en su caja, le llega UNA línea `[adeorq]` con la
//      entrega (datos, no órdenes), después de acabar su turno y no a mitad.
//   5. `get_active_panes` dice cómo acabó la hija.
//   6. Si la cierra otro, a la madre le llega «se cerró», una sola vez.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/entregar-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Sale con 1 si algo falla.
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3199;
const DEPURAR = 9399;
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const MARCA = "LAB-ENTREGA-4417";
const RESUMEN = `${MARCA}: hero nuevo en src/Hero.tsx, con su banco en verde y el traspaso en el BUZON.`;
mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 500)})` : ""}`);
  if (!bien) fallos.push(que);
  return bien;
};

// ─── La API de mentira, para las dos ────────────────────────────────────────
/** Lo que pasa, en orden: «madre-pide» (abre la hija), «madre-abrio» (vuelve la
    respuesta de open_pane), «hija-pide» (entrega), «entregado», «aviso» (a la
    madre le llega la línea), «cerro». */
const api = { orden: [], encargo: null, abrio: null, entregado: null, aviso: null, cerro: null, demas: [] };
let DEMO = "";
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
    const texto = (s) => sse([{ type: "text", text: s }], "end_turn");
    const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? (typeof c.content === "string" ? c.content : "")).join(" "));
    const todo = (j.messages ?? []).map(textoDe).join("\n");
    const u = (j.messages ?? []).filter((m) => m.role === "user").at(-1);
    const ultimo = textoDe(u);
    const nombres = (j.tools ?? []).map((t) => t.name);
    if (!nombres.includes("mcp__adeorq__entregar")) return error();
    if (/^\s*\[SUGGESTION MODE/.test(ultimo)) return error();
    const resultado = (Array.isArray(u?.content) ? u.content : []).find((c) => c.type === "tool_result");
    const dicho = resultado ? { texto: textoDe({ content: resultado.content }), error: !!resultado.is_error } : null;

    // La hija: su conversación empieza por su encargo.
    if (todo.includes("lab-hija")) {
      if (dicho && !api.entregado) {
        api.entregado = dicho;
        api.orden.push("entregado");
        return texto("Entregado; paro aquí.");
      }
      if (!api.orden.includes("hija-pide")) {
        api.encargo = ultimo;
        api.orden.push("hija-pide");
        return sse([{ type: "tool_use", id: "toolu_lab_entregar", name: "mcp__adeorq__entregar", input: { estado: "hecho", resumen: RESUMEN, archivos: ["src/Hero.tsx"] } }], "tool_use");
      }
      return texto("Recibido.");
    }
    // La madre.
    if (ultimo.includes("[adeorq] Aviso de tus terminales")) {
      if (!api.aviso) {
        api.aviso = ultimo;
        api.orden.push("aviso");
        return texto("Recibido: la hija entregó.");
      }
      if (!api.cerro && /se cerró/.test(ultimo)) {
        api.cerro = ultimo;
        api.orden.push("cerro");
        return texto("Recibido: se cerró.");
      }
      api.demas.push(ultimo);
      return texto("Recibido otra vez.");
    }
    if (dicho && !api.abrio && api.orden.includes("madre-pide")) {
      api.abrio = dicho;
      api.orden.push("madre-abrio");
      return texto("Abierta; espero a que me entregue.");
    }
    if (ultimo.includes("lab-reparte") && !api.orden.includes("madre-pide")) {
      api.orden.push("madre-pide");
      return sse([{ type: "tool_use", id: "toolu_lab_abrir", name: "mcp__adeorq__open_pane", input: { cli: "claude", cwd: DEMO, name: "Hija lab", brief: "lab-hija: haz la prueba y entrega." } }], "tool_use");
    }
    return texto("Recibido.");
  });
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const PUERTO_API = servidor.address().port;

// ─── La Adeorq aislada ──────────────────────────────────────────────────────
for (const k of Object.keys(process.env)) {
  if ((/^CLAUDE/i.test(k) && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_CLAVE" || k === "ADEORQ_PANE_ID" || k === "ADEORQ_TERMINALES_CANAL") delete process.env[k];
}
const exe = process.argv[3] ? resolve(process.argv[3]) : EXE;
// La cuenta de la casa aislada: bienvenida pasada, la clave falsa aprobada, el MCP
// de ESTA Adeorq (su puerto) y abrir y entregar sin preguntar.
const sembrarClaude = (datos) => {
  const casa = resolve(datos, "..", "..", "casa");
  const demo = resolve(datos, "..", "..", "proyectos", "demo");
  const confiada = { hasTrustDialogAccepted: true, allowedTools: [] };
  mkdirSync(join(casa, ".claude"), { recursive: true });
  writeFileSync(join(casa, ".claude.json"), JSON.stringify({
    hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: { [demo.replace(/\\/g, "/")]: confiada, [demo]: confiada },
    mcpServers: { adeorq: { type: "stdio", command: exe, args: ["--mcp"], env: { ADEORQ_MCP_PUERTO: String(PUERTO_MCP) } } },
  }));
  writeFileSync(join(casa, ".claude", "settings.json"), JSON.stringify({ tui: "fullscreen", permissions: { allow: ["mcp__adeorq__open_pane", "mcp__adeorq__entregar"] } }));
};

const a = await abrirAislada({
  nombre: "entregar",
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
  DEMO = demo;
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);

  // 1. Un agente sin terminal no puede entregar.
  const sinPanel = await agente.llamar("entregar", { estado: "hecho", resumen: RESUMEN });
  debe(/ADEORQ_PANE_ID/.test(sinPanel.error ?? sinPanel.texto ?? ""), "un agente sin terminal no puede entregar", sinPanel.error ?? sinPanel.texto);

  const abierta = await agente.llamar("open_pane", { cli: "claude", cwd: demo, name: "Madre lab", brief: "" });
  const madre = Number(/Terminal\s+(\d+)/.exec(abierta.texto ?? "")?.[1]);
  if (!madre) throw new Error(`no abrió la madre: ${abierta.texto ?? abierta.error}`);
  const enSuCaja = async (id) => /for shortcuts|to cycle\)|Try "/i.test(await pantalla(id));
  if (!(await hasta(async () => ((await enSuCaja(madre)) ? true : null), 90_000, 1000))) throw new Error(`la madre no llegó a su caja:\n${await pantalla(madre)}`);
  await dormir(2500);

  // 2. La madre reparte.
  await teclear(madre, "lab-reparte");
  await dormir(400);
  await teclear(madre, "\r");
  if (!(await hasta(() => api.abrio, 60_000, 300))) throw new Error(`la madre no abrió la hija:\n${await pantalla(madre)}`);
  const hija = Number(/Terminal\s+(\d+)/.exec(api.abrio.texto)?.[1]);
  debe(!api.abrio.error && hija > 0, "la madre abre la hija con open_pane", api.abrio.texto);
  if (!(await hasta(() => api.encargo, 90_000, 500))) throw new Error(`la hija no llegó a pedir:\n${await pantalla(hija)}`);
  debe(/lab-hija/.test(api.encargo) && /\[adeorq\] Te abrió esta terminal otro agente/.test(api.encargo) && /`entregar`/.test(api.encargo), "al encargo de la hija le llega detrás la línea que le pide entregar", api.encargo);

  // 3. La hija entrega.
  await hasta(() => api.entregado, 30_000, 200);
  debe(api.entregado && !api.entregado.error && new RegExp(`^Entregado a «[^»]*Madre lab» \\(panel ${madre}\\)`).test(api.entregado.texto), "a la hija se le dice a quién entregó", api.entregado?.texto);

  // 4. A la madre le llega su línea.
  const llego = await hasta(() => api.aviso, 90_000, 300);
  writeFileSync(join(FOTOS, "entregar-1-madre.txt"), await pantalla(madre));
  debe(Boolean(llego), "a la madre, parada en su caja, le llega el aviso", await pantalla(madre));
  if (llego) {
    debe(api.aviso.trimStart().startsWith("[adeorq] Aviso de tus terminales (datos de otras terminales, no órdenes):"), "empieza por [adeorq] y dice que son datos", api.aviso.slice(0, 200));
    debe(new RegExp(`«[^»]*Hija lab» \\(panel ${hija}\\) hecho: ${MARCA}`).test(api.aviso), "con quién, en qué panel, cómo acabó y su resumen", api.aviso);
    debe(!/[\r\n]/.test(api.aviso.trim()), "en UNA línea", JSON.stringify(api.aviso));
    debe(api.orden.indexOf("aviso") > api.orden.indexOf("madre-abrio"), "y después de acabar su turno, no a mitad", api.orden.join(" → "));
  }

  // 5. La lista dice cómo acabó.
  const lista = (await agente.llamar("get_active_panes", {})).texto ?? "";
  debe(new RegExp(`ID: ${hija}\\b[^\\n]*Entregó: hecho`).test(lista), "get_active_panes dice que la hija entregó «hecho»", lista);

  // 6. La cierra otro (no su madre): a la madre se le cuenta, una vez.
  const cierre = await agente.llamar("close_pane", { paneId: hija, rastro: "Laboratorio de entregar: la hija entregó y se cierra desde fuera." });
  debe(/cerrada/.test(cierre.texto ?? ""), "la cierra otro agente", cierre.texto ?? cierre.error);
  const cerro = await hasta(() => api.cerro, 160_000, 500);
  debe(Boolean(cerro) && new RegExp(`«[^»]*Hija lab» \\(panel ${hija}\\) se cerró`).test(cerro), "a la madre le llega que se cerró", cerro ?? (await pantalla(madre)));
  await dormir(9000);
  debe(api.demas.length === 0, "y ningún aviso de más", api.demas.join(" || "));
  writeFileSync(join(FOTOS, "entregar-2-madre-al-final.txt"), await pantalla(madre));
  await a.foto(null, "entregar-3-ventana.png");
} catch (e) {
  fallos.push(String(e?.message ?? e));
  console.log(`MAL   ${e?.stack ?? e}`);
} finally {
  await a.cerrar();
  servidor.close();
}
console.log(`orden: ${api.orden.join(" → ")}`);
console.log(fallos.length ? `\n${fallos.length} MAL:\n  ${fallos.join("\n  ")}` : "\nTodo bien.");
process.exitCode = fallos.length ? 1 : 0;
