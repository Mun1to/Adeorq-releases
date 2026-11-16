// `send_command` a un Codex de verdad: que el Intro ENVÍE lo pegado y no se
// quede como un salto de línea dentro de su caja (t202, 2026-11-16).
//
// Codex 0.165 toma por salto de línea un Intro que llega en los 120 ms que
// siguen a un pegado (`PASTE_ENTER_SUPPRESS_WINDOW` en
// `codex-rs/tui/src/bottom_pane/paste_burst.rs`), y Adeorq esperaba justo eso
// entre el texto y el Intro (`mandar_texto` en `pty.rs`). Se mandan varias
// órdenes seguidas y se cuenta cuántas llegan a la API sin pulsar otra vez.
//
// Sin gastar: el Codex del PATH, con casa y clave falsas, contra una API de
// mentira en este proceso que contesta «Hecho.» (ver
// `vuelta-arriba-otros-cli-de-verdad.mjs`, de donde sale la receta).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   node node_modules/vite/bin/vite.js --port 1420 --strictPort --host 127.0.0.1   (y apagarlo al acabar)
//   node scripts/laboratorio/intro-en-codex-de-verdad.mjs [exe]
//
// Sale con 1 si alguna se queda sin enviar.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "ic";
const PUERTO = 43_000 + (process.pid % 800);
const DEPURAR = 9_800 + (process.pid % 100);
// Cuanto más larga, más tarda Codex en leerla, y más tarde abre su ventana: con
// 120 ms se quedaban las de 175 caracteres o más (16-nov).
const LARGOS = [135, 175, 205, 400, 800, 1500, 3000];
const VECES = LARGOS.length;
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_API_KEY|ANTHROPIC_API_KEY|CODEX_HOME|HTTPS?_PROXY|ALL_PROXY)$/i.test(k)) delete process.env[k];
}

/** El cuerpo de cada turno que llega: así se sabe qué orden se ENVIÓ. */
const recibido = [];
const api = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    const json = (v) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v));
    };
    if (req.method === "POST" && /\/responses$/.test(req.url.split("?")[0])) {
      recibido.push(cuerpo);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const id = `resp_${recibido.length}`;
      const eventos = [
        { type: "response.created", response: { id } },
        { type: "response.output_item.done", item: { type: "message", role: "assistant", id: `msg_${recibido.length}`, content: [{ type: "output_text", text: "Hecho." }] } },
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

// Corto a propósito: Codex deja el socket de su servidor de fondo dentro de su
// carpeta, y una ruta larga no le cabe («path must be shorter than SUN_LEN»).
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casaCodex = join(base, "casa", ".codex");
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
  },
  entorno: { CODEX_HOME: casaCodex, OPENAI_API_KEY: "sk-laboratorio-falsa-0000000000000000" },
});

const urlDe = (archivo) => `(performance.getEntriesByType("resource").map((e) => e.name).find((n) => new URL(n).pathname === "/src/lib/${archivo}") ?? "/src/lib/${archivo}")`;
const pantalla = (id) =>
  a.v.js(`import(${urlDe("terminales.ts")}).then((m) => {
    const t = m.xtermDe(${id});
    if (!t) return "";
    const b = t.buffer.active;
    const filas = [];
    for (let i = 0; i < b.length; i++) filas.push(b.getLine(i)?.translateToString(true) ?? "");
    return filas.join("\\n");
  })`);

const mira = a.puente(null);
let fallo = "";
const sinEnviar = [];
try {
  await mira.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await hasta(async () => /Arranque de Adeorq/.test((await mira.llamar("get_active_panes", {})).texto || ""), 15_000, 500);
  const r = await mira.llamar("open_pane", { cli: "codex", cwd: a.demo, name: "codex-intro" });
  const id = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
  if (!Number.isFinite(id)) throw new Error(`open_pane codex: ${r.texto ?? r.error}`);
  // Lo tecleado antes de que acabe de arrancar se pierde: hasta su pie de atajos.
  if (!(await hasta(async () => (await pantalla(id)).includes("? for shortcuts"), 60_000, 1000))) throw new Error("Codex no llegó a su caja");
  await dormir(3000);

  for (let i = 1; i <= VECES; i++) {
    // Largas como una orden de verdad entre sesiones, con su marca para encontrarla.
    const marca = `lab-intro-${i}`;
    let orden = `${marca}: mira el BUZON.md, termina lo que dejó la otra sesión en la carpeta de la web y cuéntame en dos líneas qué queda`;
    while (orden.length < LARGOS[i - 1]) orden += " y por qué";
    const antes = recibido.length;
    await mira.llamar("send_command", { paneId: id, command: orden });
    const llego = await hasta(() => recibido.slice(antes).some((c) => c.includes(marca)), 8_000, 250);
    console.log(`${llego ? "enviada  " : "SIN ENVIAR"} ${marca} (${orden.length} caracteres)`);
    if (!llego) {
      sinEnviar.push(marca);
      // Se envía a mano para que no se junte con la siguiente.
      await mira.llamar("send_keys", { paneId: id, keys: ["enter"] });
      await hasta(() => recibido.slice(antes).some((c) => c.includes(marca)), 8_000, 250);
    }
    // Que acabe su turno («Hecho.») y vuelva a su caja.
    await hasta(async () => (await pantalla(id)).includes("? for shortcuts"), 15_000, 500);
    await dormir(1500);
  }
} catch (e) {
  fallo = String(e?.stack ?? e);
} finally {
  await a.cerrar();
  api.close();
}
if (fallo) console.log(`FALLO ${fallo}`);
console.log(`\n${VECES - sinEnviar.length} de ${VECES} enviadas con un solo Intro.${sinEnviar.length ? ` Sin enviar: ${sinEnviar.join(", ")}` : ""}`);
process.exitCode = fallo || sinEnviar.length ? 1 : 0;
