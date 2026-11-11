// Elegir desde el móvil, de punta a punta y sin gastar. Munir, 2026-11-09, desde
// clase: «está muy mal lo de elegir desde el móvil en Adeorq móvil, no funciona
// bien lo de seleccionar etc». No dijo cuál, así que se miden las dos:
//   1. los menús de un Claude Code DE VERDAD vistos desde la página del móvil: una
//      pregunta (AskUserQuestion) de una opción, una de tres preguntas con una de
//      casillas en medio, «Escribir otra respuesta» y un permiso de Bash; en su chat
//      y desde «Decisiones» (pasos 1 a 5), cuánto tardan los botones en salir y en
//      irse, y una pregunta en texto numerado (7);
//   2. una tarjeta de `ask_decision` contestada en «Decisiones» (6).
// Y de dónde escribe (Munir, 2026-11-10): lo que manda el móvil le llega al agente
// con «[móvil] » delante, y lo que contesta a un menú, sin ella (6, 7 y 8).
// `PASOS=1,7` lanza solo esos.
//
// El oráculo no es la pantalla: es lo que le llega al modelo. Claude Code corre con
// su carpeta de configuración propia, una clave falsa y una API de mentira en este
// proceso (`ANTHROPIC_BASE_URL`): la API le pide la pregunta como lo haría el modelo
// y apunta el `tool_result` que vuelve con lo que eligió el móvil. Ningún mensaje sale
// de la máquina. La respuesta a una decisión la apunta un programa que escribe lo que
// le teclean.
//
// El móvil es un Brave sin ventana a 390 × 844, táctil, emparejado con su código.
// Tailscale, escondido para la app (ni en el PATH ni en `ProgramFiles`): encender el
// móvil con él a la vista le pondría `tailscale serve` a la red de Munir. Claude Code
// corre con `SSH_CONNECTION` para no copiar nada a su portapapeles.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/movil-elegir-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Con `PAGINA=<ruta de un movil.html>` la página del móvil es esa y no la del
// binario (la API sigue siendo la del binario): así se mide un arreglo de la página
// sin recompilar. Sale con 1 si algo falla.
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3197;
const DEPURAR = 9397;
const PUERTO_MOVIL = 4397;
const B = `http://127.0.0.1:${PUERTO_MOVIL}`;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const PAGINA = process.env.PAGINA ? readFileSync(process.env.PAGINA, "utf8") : null;
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 300)})` : ""}`);
  if (!bien) fallos.push(que);
  return bien;
};

// ─── La API de mentira ──────────────────────────────────────────────────────
// Lo que el «modelo» pregunta en cada caso, con la forma de AskUserQuestion.
const PREGUNTAS = {
  "lab-una": [{
    question: "¿Qué color le ponemos al botón de enviar?", header: "Color", multiSelect: false,
    options: [{ label: "Azul", description: "El de siempre" }, { label: "Verde", description: "Como el de Mac" }, { label: "Naranja", description: "Para que se vea más" }],
  }],
  "lab-varias": [
    { question: "¿Qué día lo publicamos?", header: "Día", multiSelect: false, options: [{ label: "Lunes", description: "Antes de clase" }, { label: "Martes", description: "Por la tarde" }, { label: "Miércoles", description: "Con calma" }] },
    { question: "¿Qué partes enseñamos en el vídeo?", header: "Partes", multiSelect: true, options: [{ label: "Cabina", description: "Las terminales" }, { label: "Lienzo", description: "Todo junto" }, { label: "Memoria", description: "Lo que recuerda" }, { label: "Chat", description: "Hablar con Adeo" }] },
    { question: "¿A qué hora sale?", header: "Hora", multiSelect: false, options: [{ label: "Por la mañana", description: "A las nueve" }, { label: "Por la noche", description: "A las diez" }] },
  ],
  "lab-otra": [{
    question: "¿Cómo llamamos a la versión?", header: "Nombre", multiSelect: false,
    options: [{ label: "Brisa", description: "Corto" }, { label: "Marea", description: "Suena bien" }],
  }],
};
const api = { resultados: [], vistos: [], textos: [], usos: 0 };
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
    // Solo el bucle principal lleva las herramientas: el título, las sugerencias
    // y lo demás de lado se contestan con un error.
    if (!pet.url.includes("/v1/messages") || !j || !(j.tools ?? []).some((t) => t.name === "AskUserQuestion")) return error();
    const u = (j.messages ?? []).filter((m) => m.role === "user").at(-1);
    const piezas = typeof u?.content === "string" ? [{ type: "text", text: u.content }] : (u?.content ?? []);
    const resultado = piezas.find((c) => c.type === "tool_result");
    const texto = piezas.filter((c) => c.type === "text").map((c) => c.text).join(" ");
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
    if (resultado) {
      const contenido = typeof resultado.content === "string" ? resultado.content : (resultado.content ?? []).map((c) => c.text ?? "").join(" ");
      if (!api.resultados.some((r) => r.id === resultado.tool_use_id)) api.resultados.push({ id: resultado.tool_use_id, contenido, error: !!resultado.is_error });
      return sse([{ type: "text", text: "Recibido." }], "end_turn");
    }
    // La sugerencia en gris de Claude Code también lleva las herramientas: no es un turno.
    if (/^\s*\[SUGGESTION MODE/.test(texto)) return error();
    api.textos.push(texto);
    const caso = Object.keys(PREGUNTAS).find((k) => texto.includes(k)) ?? ["lab-permiso", "lab-texto"].find((k) => texto.includes(k));
    // Lo demás (la respuesta a una pregunta en texto, por ejemplo) se contesta sin más.
    if (!caso) return sse([{ type: "text", text: "Recibido." }], "end_turn");
    api.vistos.push(texto.slice(-200));
    const id = `toolu_lab_${++api.usos}`;
    // Una pregunta en texto numerado, como las piden las terminales cuando está en el móvil.
    if (caso === "lab-texto") return sse([{ type: "text", text: "Tengo dos caminos para el scroll:\n\n1. Arreglarlo ya con el parche corto\n2. Dejarlo para mañana y medirlo antes\n\n¿Cuál prefieres?" }], "end_turn");
    // Un `echo` solo lo deja pasar sin preguntar: crear una carpeta sí pregunta.
    if (caso === "lab-permiso") return sse([{ type: "tool_use", id, name: "Bash", input: { command: "mkdir lab-permiso && echo lab-permiso-hecho", description: "Crea una carpeta de prueba" } }], "tool_use");
    return sse([{ type: "tool_use", id, name: "AskUserQuestion", input: { questions: PREGUNTAS[caso] } }], "tool_use");
  });
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const PUERTO_API = servidor.address().port;
/** El `tool_result` que vuelve tras `n` herramientas pedidas, cuando llegue. */
const resultadoDe = (id) => hasta(() => api.resultados.find((r) => r.id === id), 20_000, 200);

// ─── La Adeorq aislada ──────────────────────────────────────────────────────
// Lanzado desde una terminal de Claude Code, el entorno trae SU sesión (y su canal
// de mensajes): el Claude de la prueba no la hereda. Sí la ruta de su bash.
for (const k of Object.keys(process.env)) {
  if ((/^CLAUDE/i.test(k) && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_CLAVE" || k === "ADEORQ_TERMINALES_CANAL") delete process.env[k];
}
const sinProgramas = mkdtempSync(join(tmpdir(), "adeorq-sin-programas-"));
// El PATH de siempre (ahí está `claude`) sin la carpeta de Tailscale.
const PATH_APP = (process.env.PATH ?? "").split(";").filter((d) => d && !/tailscale/i.test(d)).join(";");
// La cuenta principal de la casa aislada es la de la prueba: ya pasada la
// bienvenida, la clave falsa aprobada y a pantalla completa, como la suya. Es donde
// la app busca los transcripts (sin ellos no sabría que la terminal pregunta).
const sembrarClaude = (datos) => {
  const casa = resolve(datos, "..", "..", "casa");
  const demo = resolve(datos, "..", "..", "proyectos", "demo");
  const confiada = { hasTrustDialogAccepted: true, allowedTools: [] };
  mkdirSync(join(casa, ".claude"), { recursive: true });
  writeFileSync(join(casa, ".claude.json"), JSON.stringify({
    hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: { [demo.replace(/\\/g, "/")]: confiada, [demo]: confiada },
  }));
  writeFileSync(join(casa, ".claude", "settings.json"), JSON.stringify({ tui: "fullscreen" }));
};
// Con su ruta de Windows: la aislada mira que la ventana sea de ESE ejecutable.
const exe = process.argv[3] ? resolve(process.argv[3]) : EXE;

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}`);
}

const a = await abrirAislada({
  nombre: "elegir",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe,
  sembrar: sembrarClaude,
  entorno: {
    PATH: PATH_APP, Path: PATH_APP, ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL), ProgramW6432: sinProgramas, ProgramFiles: sinProgramas,
    // Lo que heredan las terminales: la API de mentira, sin portapapeles del sistema ni actualizarse.
    ANTHROPIC_API_KEY: CLAVE, ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_API}`, SSH_CONNECTION: "laboratorio", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_NO_FLICKER: "1",
  },
});
let ctx = null;
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
const comillas = (s) => `'${String(s).replace(/'/g, "''")}'`;
try {
  const { v, demo, base } = a;
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);
  async function panelNuevo(nombre) {
    const r = await agente.llamar("open_pane", { cli: "shell", cwd: demo, name: nombre, brief: "" });
    const id = Number(/^Terminal (\d+) abierta/.exec(r.texto ?? "")?.[1]);
    if (!id) throw new Error(`no abrió el panel: ${r.texto ?? r.error}`);
    await hasta(() => v.js(`!!document.querySelector('[data-pane-id="${id}"] .xterm-helper-textarea')`), 30_000, 500);
    await dormir(2500);
    return id;
  }

  // Un Claude Code abierto como los abre Adeorq (su cuenta, su sesión conocida),
  // que es como lo tiene Munir: la app sabe de él lo mismo que de los suyos.
  const abierta = await agente.llamar("open_pane", { cli: "claude", cwd: demo, name: "Claude de verdad", brief: "" });
  const claude = Number(/Terminal\s+(\d+)/.exec(abierta.texto ?? "")?.[1]);
  if (!claude) throw new Error(`no abrió el Claude: ${abierta.texto ?? abierta.error}`);
  console.log(`      open_pane: ${(abierta.texto ?? "").split("\n").slice(0, 3).join(" ⏎ ")}`);
  const caja = await hasta(async () => (/for shortcuts|to cycle\)|Try "/i.test(await pantalla(claude)) ? true : null), 90_000, 1000);
  if (!caja) throw new Error(`Claude Code no llegó a su caja:\n${await pantalla(claude)}`);
  await dormir(1500);

  // El que apunta lo que le teclean: ahí cae la respuesta de una decisión.
  const LOG = join(base, "tecleado.log");
  const PROGRAMA = join(base, "apunta.cjs");
  writeFileSync(PROGRAMA, `const fs = require("fs");
process.stdin.setRawMode(true);
process.stdin.resume();
console.log("apuntando lo que llega");
process.stdin.on("data", (d) => fs.appendFileSync(${JSON.stringify(LOG)}, d.toString("utf8")));
`);
  const apunta = await panelNuevo("Apunta");
  // Hasta tres veces: si la consola aún arranca, lo tecleado se pierde.
  let apuntando = false;
  for (let i = 0; i < 3 && !apuntando; i++) {
    await teclear(apunta, `& ${comillas(process.execPath)} ${comillas(PROGRAMA)}\r`);
    apuntando = Boolean(await hasta(async () => /apuntando lo que llega/.test(await pantalla(apunta)), 15_000, 500));
  }
  debe(apuntando, "el programa que apunta lo que le teclean arranca", (await pantalla(apunta)).split("\n").filter((l) => l.trim()).slice(-4).join(" ⏎ "));
  // Con `EXTRA=<n>`, n consolas más en la cabina: la del Claude se queda pequeña,
  // como en la suya con varias abiertas.
  for (let i = 0; i < Number(process.env.EXTRA || 0); i++) await panelNuevo(`Consola ${i + 1}`);
  const tamano = async () => ((await agente.llamar("get_active_panes", {})).texto ?? "").split("\n").find((l) => l.startsWith(`ID: ${claude},`))?.match(/\b\d+x\d+\b/)?.[0] ?? "?";
  console.log(`      la terminal de Claude mide ${await tamano()}`);

  // El móvil, encendido en su puerto y emparejado con un código de verdad.
  const enc = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: true }).then((x) => JSON.stringify(x), (m) => "ERROR " + m)`);
  debe(!String(enc).startsWith("ERROR"), "el móvil se enciende", enc);
  debe(await hasta(async () => (await fetch(`${B}/`).catch(() => null))?.ok, 20_000, 300), `la página del móvil contesta en el ${PUERTO_MOVIL}`);
  const codigo = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor, (m) => "ERROR " + m)`);
  const emp = await (await fetch(`${B}/api/emparejar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, nombre: "Laboratorio" }) })).json();
  const clave = emp.clave;
  debe(Boolean(clave), "se empareja con el código de seis cifras");
  const AUT = { Authorization: `Bearer ${clave}` };
  const arranque = (await (await fetch(`${B}/api/terminales`, { headers: AUT })).json()).arranque;
  const estadoDe = async (panel) => ((await (await fetch(`${B}/api/terminales`, { headers: AUT })).json()).terminales ?? []).find((t) => t.panel === panel)?.estado;

  const { chromium } = createRequire(import.meta.url)(playwrightCore());
  ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  if (PAGINA) {
    // La página de la carpeta de trabajo, con las cabeceras de la de verdad (su CSP).
    await page.route(`${B}/`, async (ruta) => {
      const r = await ruta.fetch();
      await ruta.fulfill({ response: r, body: PAGINA });
    });
  }
  const erroresDePagina = [];
  page.on("pageerror", (e) => erroresDePagina.push(String(e)));
  // Lo que el móvil le manda a una terminal, para leerlo si algo no llega.
  const mandado = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/terminal\/(escribir|tecla)$/.test(r.url())) mandado.push(r.postData());
  });
  // Las peticiones del móvil que tardan: si los botones llegan tarde, por qué.
  const lentas = [];
  page.on("requestfinished", (r) => {
    const t = r.timing();
    if (/\/api\//.test(r.url()) && t.responseEnd > 1500) lentas.push(`${new URL(r.url()).pathname} ${Math.round(t.responseEnd)} ms`);
  });
  // Y lo que el móvil recibió de la terminal en cada vuelta: cuándo, en qué estado y si ya traía la pregunta.
  const vueltas = [];
  page.on("response", async (r) => {
    if (!/\/api\/terminal\?/.test(r.url())) return;
    try {
      const v = await r.json();
      const texto = JSON.stringify(v.trozos ?? v.filas ?? "");
      vueltas.push({ t: Date.now(), estado: v.estado, color: texto.includes("Qué color") });
    } catch {}
  });
  await page.goto(`${B}/`);
  await page.evaluate((k) => localStorage.setItem("adeorq-movil-clave", k), clave);

  let foto = 0;
  // Con la foto del móvil va la pantalla del PC en ese momento, en texto.
  const fotografiar = async (que) => {
    const n = String(++foto).padStart(2, "0");
    writeFileSync(join(FOTOS, `elegir-${n}-${que}.txt`), await pantalla(claude));
    await page.screenshot({ path: join(FOTOS, `elegir-${n}-${que}.png`) });
  };
  /** Lo que el móvil enseña ahora como pregunta, dentro de `sel`. */
  const menuEnElMovil = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return {
      que: el.querySelector(".ahora-que, .preg-que")?.textContent ?? "",
      ops: [...el.querySelectorAll(".opciones-menu button")].map((b) => ({ n: b.dataset.num, texto: b.querySelector(".op-txt > span")?.textContent, marcada: b.getAttribute("aria-pressed"), apagado: b.disabled })),
      listo: !!el.querySelector(".menu-listo"),
      nota: [...el.querySelectorAll(".nota")].map((n) => n.textContent).join(" | "),
      ancho: document.documentElement.scrollWidth,
    };
  }, sel);
  /** Hasta que el móvil enseñe la pregunta `texto` (sus botones), o null. */
  const esperarPregunta = (sel, texto, ms = 25_000) => hasta(async () => {
    const m = await menuEnElMovil(sel);
    return m && m.que.includes(texto) && m.ops.length ? m : null;
  }, ms, 150);
  /** Cuánto sigue el móvil enseñando la pregunta `texto` tras contestarla. */
  const cuantoSigue = async (sel, texto, ms = 8000) => {
    const t0 = Date.now();
    await hasta(async () => {
      const m = await menuEnElMovil(sel);
      return !m || !m.que.includes(texto) ? true : null;
    }, ms, 100);
    return Date.now() - t0;
  };
  /** Pide a Claude Code el caso y espera la pregunta en su pantalla. */
  async function preguntar(caso, enPantalla) {
    const antes = api.usos;
    await teclear(claude, caso);
    await dormir(400);
    await teclear(claude, "\r");
    if (!(await hasta(() => api.usos > antes, 20_000, 200))) throw new Error(`la API de mentira no recibió «${caso}»:\n${await pantalla(claude)}`);
    const id = `toolu_lab_${api.usos}`;
    if (!(await hasta(async () => (await pantalla(claude)).includes(enPantalla), 20_000, 300))) throw new Error(`Claude Code no pintó «${enPantalla}»:\n${await pantalla(claude)}`);
    return id;
  }
  const respuestaDe = (r) => r?.contenido ?? "(nada)";
  /** El chat de la terminal de Claude en el móvil, como al tocar su aviso. */
  const alChat = async () => {
    await page.goto(`${B}/?r=1#terminal=${claude}@${arranque}`);
    await page.waitForSelector("#ahora", { state: "attached" });
    await dormir(1200);
  };

  const PASOS = new Set((process.env.PASOS || "1,2,3,4,5,6,7,8").split(","));
  const toca = (n) => PASOS.has(String(n));

  // ─── 1. Una pregunta de una opción, en el chat de su terminal ─────────────
  if (toca(1)) {
  console.log("\n── 1. Una pregunta de una opción, en el chat de la terminal");
  // El móvil ya está mirando la terminal cuando pregunta, como quien abre el aviso.
  await alChat();
  const t1 = await preguntar("lab-una", "Qué color");
  // Desde que la pregunta está en la pantalla del PC: lo que dice el PC y cuándo
  // salen los botones en el móvil (su sondeo es de 3 s).
  const tPc = Date.now();
  const vistosEstados = [];
  const m1 = await hasta(async () => {
    const s = await estadoDe(claude);
    if (vistosEstados.at(-1)?.[0] !== s) vistosEstados.push([s, Date.now() - tPc]);
    const m = await menuEnElMovil("#ahora");
    return m && m.que.includes("Qué color") && m.ops.length ? m : null;
  }, 30_000, 200);
  const tardo = Date.now() - tPc;
  console.log(`      estados del PC: ${JSON.stringify(vistosEstados)}; botones en el móvil a los ${tardo} ms${lentas.length ? `; peticiones lentas: ${lentas.join(", ")}` : ""}`);
  console.log(`      vueltas del móvil: ${vueltas.filter((x) => x.t >= tPc - 4000).map((x) => `${x.t - tPc} ms ${x.estado}${x.color ? "+pregunta" : ""}`).join(" · ")}`);
  // Es su primer mensaje: el PC aún tiene que encontrar su transcript para saber
  // su sesión (y el móvil, para abrir su chat). Con la sesión ya sabida, el paso 2.
  debe(Boolean(m1) && tardo < 8000, "los botones salen en el móvil a los pocos segundos de preguntar, también en una sesión recién abierta", `${tardo} ms; ${JSON.stringify(vistosEstados)}`);
  await fotografiar("una-antes");
  // Y en el PC, su barra de botones, como con un permiso (la regla es la misma).
  const barra = await v.js(`(() => { const b = document.querySelector(".pane-ask"); return b ? b.querySelector(".ask-hint").textContent + " | " + [...b.querySelectorAll(".ask-btn")].map((x) => x.textContent).join(", ") : ""; })()`);
  debe(/Azul/.test(barra) && /Verde/.test(barra), "y el PC enseña su barra con las opciones", barra || "(sin barra)");
  await a.foto(null, "elegir-pc-barra.png");
  if (m1) {
    // La vista entra deslizándose: el ancho se mide ya quieta.
    await dormir(1000);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    debe(ancho <= 390, "nada se sale por la derecha", ancho);
    await page.tap('#ahora .opciones-menu button[data-num="2"]');
    const sigue = await cuantoSigue("#ahora", "Qué color");
    await fotografiar("una-despues");
    const r = await resultadoDe(t1);
    debe(/="Verde"/.test(respuestaDe(r)), "le llega «Verde» al modelo", respuestaDe(r));
    debe(sigue < 2500, "tras tocarla, la pregunta contestada deja de estar en el móvil enseguida", `${sigue} ms`);
    // Contestada (y el «modelo» ya dijo «Recibido.»), el móvil deja de decir que te pregunta.
    const tR = Date.now();
    const yaNo = await hasta(async () => {
      const tipo = await page.evaluate(() => document.getElementById("ahora")?.dataset.tipo ?? "");
      return tipo && !["pregunta", "espera"].includes(tipo) ? tipo : null;
    }, 30_000, 200);
    await fotografiar("una-contestada");
    debe(Boolean(yaNo) && Date.now() - tR < 8000, "y deja de decir «te pregunta» en unos segundos", `${Date.now() - tR} ms, ahora dice «${yaNo}»`);
  }

  }
  // ─── 2. Tres preguntas, la del medio de casillas ──────────────────────────
  if (toca(2)) {
  console.log("\n── 2. Tres preguntas seguidas, la del medio de casillas");
  await alChat();
  const t2 = await preguntar("lab-varias", "Qué día");
  const tm2 = Date.now();
  const m2 = await esperarPregunta("#ahora", "Qué día");
  debe(Boolean(m2), "el móvil enseña la primera", JSON.stringify(m2 ?? (await menuEnElMovil("#ahora"))));
  debe(Date.now() - tm2 < 5000, "con la sesión ya sabida, los botones salen en un sondeo del móvil", `${Date.now() - tm2} ms`);
  await fotografiar("varias-1");
  if (m2) {
    await page.tap('#ahora .opciones-menu button[data-num="2"]');
    const t0 = Date.now();
    const q2 = await esperarPregunta("#ahora", "Qué partes");
    debe(Boolean(q2), "tras elegir la primera, el móvil enseña la segunda", JSON.stringify(await menuEnElMovil("#ahora")));
    console.log(`      la segunda tardó ${Date.now() - t0} ms en salir en el móvil`);
    await fotografiar("varias-2");
    if (q2) {
      debe(q2.listo && q2.ops.some((o) => o.marcada === "false"), "la de casillas sale con sus casillas y con «Listo»", JSON.stringify(q2));
      for (const n of ["1", "3"]) {
        await page.tap(`#ahora .opciones-menu button[data-num="${n}"]`);
        const t = Date.now();
        const marcada = await hasta(async () => (await menuEnElMovil("#ahora"))?.ops.find((o) => o.n === n)?.marcada === "true", 8000, 100);
        debe(Boolean(marcada), `la casilla ${n} sale marcada en el móvil`, `${Date.now() - t} ms; ${JSON.stringify(await menuEnElMovil("#ahora"))}`);
      }
      await fotografiar("varias-2-marcadas");
      const pc = await pantalla(claude);
      debe(/\[✔\] Cabina|\[✔\]\s+Cabina|✔.*Cabina/.test(pc) && /✔.*Memoria/.test(pc), "y en el PC están marcadas Cabina y Memoria", pc.split("\n").filter((l) => /Cabina|Lienzo|Memoria|Chat/.test(l)).join(" | "));
      await page.tap("#ahora .menu-listo");
      const q3 = await esperarPregunta("#ahora", "qué hora");
      debe(Boolean(q3), "«Listo» lleva a la tercera", JSON.stringify(await menuEnElMovil("#ahora")));
      await fotografiar("varias-3");
      if (q3) {
        await page.tap('#ahora .opciones-menu button[data-num="1"]');
        const repaso = await hasta(async () => {
          const m = await menuEnElMovil("#ahora");
          return m?.ops.some((o) => /Enviar respuestas|Submit/.test(o.texto ?? "")) ? m : null;
        }, 10_000, 150);
        debe(Boolean(repaso), "tras la última, el móvil enseña el repaso con «Enviar respuestas»", JSON.stringify(await menuEnElMovil("#ahora")));
        await fotografiar("varias-repaso");
        if (repaso) {
          const enviar = repaso.ops.find((o) => /Enviar respuestas|Submit/.test(o.texto ?? ""));
          await page.tap(`#ahora .opciones-menu button[data-num="${enviar.n}"]`);
          const r = await resultadoDe(t2);
          const dicho = respuestaDe(r);
          debe(/="Martes"/.test(dicho) && /="Cabina, Memoria"/.test(dicho) && /="Por la mañana"/.test(dicho), "le llegan Martes, Cabina y Memoria, y Por la mañana", dicho);
        }
      }
    }
  }

  }
  // ─── 3. «Escribir otra respuesta» ─────────────────────────────────────────
  if (toca(3)) {
  console.log("\n── 3. Escribir otra respuesta");
  await alChat();
  const t3 =await preguntar("lab-otra", "Cómo llamamos");
  const m3 = await esperarPregunta("#ahora", "Cómo llamamos");
  debe(Boolean(m3), "el móvil enseña la pregunta", JSON.stringify(m3 ?? (await menuEnElMovil("#ahora"))));
  if (m3) {
    await page.tap("#ahora .opciones-menu button[data-escribir]");
    await page.fill("#ahora .menu-escribir textarea", "Estela de lunes");
    await fotografiar("otra-escrita");
    await page.tap("#ahora .menu-mandar");
    const r = await resultadoDe(t3);
    debe(/="Estela de lunes"/.test(respuestaDe(r)), "le llega lo escrito, tal cual", respuestaDe(r));
    await fotografiar("otra-despues");
  }

  }
  // ─── 4. Un permiso de Bash ────────────────────────────────────────────────
  if (toca(4)) {
  console.log("\n── 4. Un permiso de Bash");
  await alChat();
  // En modo auto el `echo` pasa sin preguntar: al manual, con Shift+Tab.
  for (let i = 0; i < 6 && !/manual mode on/i.test(await pantalla(claude)); i++) {
    await teclear(claude, "\x1b[Z");
    await dormir(700);
  }
  debe(/manual mode on/i.test(await pantalla(claude)), "Claude Code pasa al modo manual");
  const t4 = await preguntar("lab-permiso", "Do you want to proceed?");
  const m4 = await esperarPregunta("#ahora", "Do you want to proceed?");
  debe(Boolean(m4), "el móvil enseña el permiso", JSON.stringify(m4 ?? (await menuEnElMovil("#ahora"))));
  await fotografiar("permiso");
  if (m4) {
    await page.tap('#ahora .opciones-menu button[data-num="1"]');
    const r = await resultadoDe(t4);
    debe(/lab-permiso-hecho/.test(respuestaDe(r)) && !r.error, "el permiso se da y el comando corre", respuestaDe(r));
  }

  }
  // ─── 5. Lo mismo desde «Decisiones» ───────────────────────────────────────
  if (toca(5)) {
  console.log("\n── 5. Una pregunta de la terminal, contestada desde «Decisiones»");
  const t5 = await preguntar("lab-varias", "Qué día");
  await page.goto(`${B}/?r=1`);
  await page.waitForSelector("#abrir-cajon");
  await page.tap("#abrir-cajon");
  await page.tap('[data-ir="decisiones"]');
  const t0d = Date.now();
  const d1 = await esperarPregunta(".preg-term", "Qué día", 30_000);
  debe(Boolean(d1), "en Decisiones sale la pregunta de la terminal", `${Date.now() - t0d} ms; estado ${await estadoDe(claude)}; ${JSON.stringify(await menuEnElMovil(".preg-term"))}`);
  console.log(`      salió en Decisiones a los ${Date.now() - t0d} ms`);
  await fotografiar("decisiones-1");
  if (d1) {
    await page.tap('.preg-term .opciones-menu button[data-num="3"]');
    const d2 = await esperarPregunta(".preg-term", "Qué partes");
    debe(Boolean(d2), "tras elegir, Decisiones enseña la segunda", JSON.stringify(await menuEnElMovil(".preg-term")));
    await fotografiar("decisiones-2");
    if (d2) {
      await page.tap('.preg-term .opciones-menu button[data-num="2"]');
      const marcada = await hasta(async () => (await menuEnElMovil(".preg-term"))?.ops.find((o) => o.n === "2")?.marcada === "true", 8000, 100);
      debe(Boolean(marcada), "la casilla sale marcada en Decisiones", JSON.stringify(await menuEnElMovil(".preg-term")));
      await page.tap(".preg-term .menu-listo");
      const d3 = await esperarPregunta(".preg-term", "qué hora");
      debe(Boolean(d3), "«Listo» lleva a la tercera en Decisiones", JSON.stringify(await menuEnElMovil(".preg-term")));
      if (d3) {
        await page.tap('.preg-term .opciones-menu button[data-num="2"]');
        const rep = await hasta(async () => {
          const m = await menuEnElMovil(".preg-term");
          return m?.ops.some((o) => /Enviar respuestas|Submit/.test(o.texto ?? "")) ? m : null;
        }, 10_000, 150);
        debe(Boolean(rep), "y el repaso", JSON.stringify(await menuEnElMovil(".preg-term")));
        if (rep) {
          await page.tap(`.preg-term .opciones-menu button[data-num="${rep.ops.find((o) => /Enviar respuestas|Submit/.test(o.texto ?? "")).n}"]`);
          const dicho = respuestaDe(await resultadoDe(t5));
          debe(/="Miércoles"/.test(dicho) && /="Lienzo"/.test(dicho) && /="Por la noche"/.test(dicho), "le llegan Miércoles, Lienzo y Por la noche", dicho);
        }
      }
    }
  }

  }
  // ─── 6. Una decisión de `ask_decision` ────────────────────────────────────
  if (toca(6)) {
  console.log("\n── 6. Una decisión de ask_decision");
  await agente.llamar("get_active_panes", {});
  const pedida = await agente.llamar("ask_decision", {
    title: "La portada nueva", context: "Dos cosas de la portada.", project: "demo", paneId: apunta,
    questions: [
      { title: "¿Qué foto va arriba?", options: [{ text: "El cielo", detail: "La de siempre" }, { text: "El mar", recommended: true, detail: "Más calma" }, { text: "La montaña" }] },
      { title: "¿Qué dice el botón?", options: [{ text: "Descargar" }, { text: "Probar gratis" }] },
    ],
  });
  const idDec = /\b(d[0-9a-f]{6,22})\b/.exec(pedida.texto ?? "")?.[1];
  debe(Boolean(idDec), "el agente pide la decisión", pedida.texto ?? pedida.error);
  if (idDec) {
    await page.goto(`${B}/?r=1#decision=${idDec}`);
    await page.waitForSelector(".pregunta-d");
    await dormir(800);
    await fotografiar("decision");
    // La vista entra deslizándose desde la derecha: se mide ya quieta (hasta 3 s),
    // y si algo se sale, se dice qué.
    const quieta = await hasta(() => page.evaluate(() => (document.documentElement.scrollWidth <= innerWidth ? true : null)), 3000, 150);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    const fuera = quieta ? "" : await page.evaluate(() => [...document.querySelectorAll("body *")].filter((x) => x.getBoundingClientRect().right > innerWidth + 0.5).slice(0, 4).map((x) => `${x.tagName.toLowerCase()}.${x.className}`).join(", "));
    debe(Boolean(quieta), "la decisión no se sale por la derecha", `${ancho} ${fuera}`);
    await page.tap('.pregunta-d[data-q="A"] label.opcion:nth-of-type(2)');
    const marcadaA = await page.evaluate(() => document.querySelector('input[name="q-A"]:checked')?.value ?? null);
    debe(marcadaA === "2", "tocar la opción 2 la marca", marcadaA);
    await page.tap('.libre[data-q="B"]');
    await page.fill('.libre[data-q="B"]', "Empezar ya");
    await fotografiar("decision-rellena");
    const listo = await page.evaluate(() => !document.getElementById("enviar-dec").disabled);
    debe(listo, "con las dos contestadas se puede enviar");
    await page.tap("#enviar-dec");
    await dormir(6500);
    await fotografiar("decision-enviada");
    const llegado = await hasta(() => (existsSync(LOG) && /Munir ha contestado/.test(readFileSync(LOG, "utf8")) ? readFileSync(LOG, "utf8") : null), 10_000, 300);
    debe(Boolean(llegado) && /opción 2, «El mar»/.test(llegado) && /«Empezar ya»/.test(llegado), "la respuesta se teclea en la terminal que preguntó", llegado ?? `(nada; su pantalla: ${(await pantalla(apunta)).split("\n").filter((l) => l.trim()).slice(-4).join(" ⏎ ")})`);
    debe(/^\[móvil\] Munir ha contestado/.test(llegado ?? ""), "y con la marca del móvil delante", (llegado ?? "").slice(0, 60));
  }

  }
  // ─── 7. Una pregunta en texto numerado ────────────────────────────────────
  // Así preguntan las terminales cuando Munir está en el móvil (la Suprema se lo
  // pidió el 9-nov): no es un menú del CLI, es un mensaje que acaba en pregunta.
  if (toca(7)) {
    console.log("\n── 7. Una pregunta en texto numerado");
    await alChat();
    const antes = api.textos.length;
    await preguntar("lab-texto", "Cuál prefieres");
    // Si el móvil le pone botones a las opciones, tocar una tiene que contestar.
    const m7 = await hasta(async () => {
      const m = await menuEnElMovil("#ahora");
      return m?.ops.some((o) => /Dejarlo para mañana/.test(o.texto ?? "")) ? m : null;
    }, 25_000, 200);
    await fotografiar("texto-numerado");
    if (m7) {
      console.log(`      el móvil lo pinta como pregunta: «${m7.que}» con ${m7.ops.length} botones`);
      await page.tap(`#ahora .opciones-menu button[data-num="${m7.ops.find((o) => /Dejarlo para mañana/.test(o.texto ?? "")).n}"]`);
      const dicho = await hasta(() => api.textos.slice(antes + 1).find((t) => /\b2\b|mañana/.test(t)), 10_000, 200);
      await fotografiar("texto-numerado-tocado");
      const caja = (await pantalla(claude)).split("\n").filter((l) => /^\s*❯/.test(l)).at(-1) ?? "";
      debe(Boolean(dicho), "tocar la 2 le manda la respuesta al agente", `${dicho ?? "no le llegó nada"}; su caja: «${caja.trim()}»; el móvil mandó ${mandado.slice(-2).join(" y ")}`);
      if (dicho) debe(/\[móvil\] 2\. Dejarlo para mañana/.test(dicho), "como un mensaje del móvil que dice la opción", dicho.slice(-120));
      // Lo que se tecleó y no se mandó se queda en su caja: se vacía con dos Esc.
      if (!dicho) {
        await teclear(claude, "\x1b");
        await dormir(200);
        await teclear(claude, "\x1b");
      }
    } else {
      // Sin botones también vale: se contesta escribiendo, y eso ya funciona.
      debe(true, "una pregunta en texto no sale como menú: se contesta en la caja");
    }
  }
  // ─── 8. Lo que se escribe en la caja ──────────────────────────────────────
  // De dónde escribe (Munir, 2026-11-10): un mensaje llega con «[móvil] »; un
  // número suelto con un menú delante lo elige; y un mensaje con un menú delante
  // no se manda, que su Intro elegiría la opción marcada.
  if (toca(8)) {
    console.log("\n── 8. La caja de escribir");
    await alChat();
    const escribir = async (txt) => {
      await page.fill("#texto", txt);
      await page.tap("#enviar");
    };
    let antes = api.textos.length;
    await escribir("sigue con lo del radar");
    const msg = await hasta(() => api.textos.slice(antes).find((t) => /lo del radar/.test(t)), 15_000, 200);
    debe(/(^|\s)\[móvil\] sigue con lo del radar$/.test((msg ?? "").trim()), "un mensaje de la caja le llega con la marca del móvil", (msg ?? "no le llegó").slice(-120));

    await preguntar("lab-texto", "Cuál prefieres");
    await dormir(4000);
    antes = api.textos.length;
    await escribir("2");
    const dos = await hasta(() => api.textos.slice(antes).find((t) => /\b2\b/.test(t)), 15_000, 200);
    debe(/(^|\s)\[móvil\] 2$/.test((dos ?? "").trim()),"un «2» escrito en la caja contesta a una pregunta en texto (con su Intro)", `${dos ?? "no le llegó"}; su caja: «${((await pantalla(claude)).split("\n").filter((l) => /^\s*❯/.test(l)).at(-1) ?? "").trim()}»`);

    const t8 = await preguntar("lab-una", "Qué color");
    const m8 = await esperarPregunta("#ahora", "Qué color");
    debe(Boolean(m8), "con un menú delante, el móvil lo enseña");
    if (m8) {
      await escribir("3");
      const r = await resultadoDe(t8);
      debe(/="Naranja"/.test(respuestaDe(r)), "un «3» escrito en la caja elige la 3 del menú", respuestaDe(r));
    }

    const t9 = await preguntar("lab-otra", "Cómo llamamos");
    await esperarPregunta("#ahora", "Cómo llamamos");
    antes = api.textos.length;
    await escribir("esto no es una opción");
    await dormir(2500);
    const aviso = await page.evaluate(() => document.getElementById("fallo")?.textContent ?? "");
    const sigue = (await pantalla(claude)).includes("Cómo llamamos");
    debe(sigue && !api.resultados.some((r) => r.id === t9) && /menú/.test(aviso), "un mensaje con un menú delante no se manda, y se dice por qué", `aviso «${aviso}», menú en el PC: ${sigue}`);
    await fotografiar("caja-con-menu");
    // Y se contesta con su botón, que es lo que pide el aviso.
    await page.tap('#ahora .opciones-menu button[data-num="1"]');
    debe(/="Brisa"/.test(respuestaDe(await resultadoDe(t9))), "y luego se contesta con su botón");
  }
  debe(!erroresDePagina.length, "la página no tira errores", erroresDePagina.join(" | "));
  // Claude Code se va por las buenas.
  await teclear(claude, "\x03");
  await dormir(300);
  await teclear(claude, "\x03");
} catch (e) {
  debe(false, "el laboratorio entero", e?.stack ?? e);
} finally {
  await ctx?.close().catch(() => {});
  rmSync(perfil, { recursive: true, force: true });
  rmSync(sinProgramas, { recursive: true, force: true });
  servidor.close();
  await a.cerrar();
}
console.log(`\n${fallos.length ? `${fallos.length} fallos: ${fallos.join("; ")}` : "Todo en su sitio."}  Fotos en ${FOTOS}`);
process.exit(fallos.length ? 1 : 0);
