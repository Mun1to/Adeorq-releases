// El Ctrl+C de después de arrastrar para copiar, en una Adeorq aislada y sin gastar:
//   1. un Claude Code de verdad a pantalla completa, con un turno colgado en una API
//      de mentira: arrastrar copia, el Ctrl+C de después no corta el turno, y pasados
//      los 3 s sí lo corta;
//   2. un programa con el ratón que NO copia: su Ctrl+C llega aunque haya arrastre;
//   3. una consola sin ratón: el arrastre es de xterm, el primer Ctrl+C copia y el
//      segundo llega, como siempre.
//
// El portapapeles de Munir no se toca: el de la página es de mentira, y un Claude
// Code en Windows copia TAMBIÉN por su cuenta (`Set-Clipboard`, leído en su binario
// 2.1.317: lo hace si no cree estar por SSH), así que corre con `SSH_CONNECTION`. Se
// comprueba con el contador del portapapeles (`GetClipboardSequenceNumber`, sin leer
// el contenido). Claude Code corre con su carpeta de configuración propia y una clave
// de mentira, como en `modelo-de-sesion-de-verdad.mjs`, y se cierra por las buenas.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/ctrl-c-arrastre-de-verdad.mjs [exe]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const TRABAJO = join(tmpdir(), `adeorq-ctrl-c-${process.pid}`);
const CONFIG = join(TRABAJO, "claude");
const CARPETA = join(TRABAJO, "proyecto");
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "OK  " : "MAL "} ${que}`);
  if (!ok) fallos.push(que);
};

/** Cuántas veces se ha escrito en el portapapeles del sistema, sin leerlo. */
const contadorPortapapeles = () =>
  spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", `Add-Type -Namespace L -Name C -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();'; [L.C]::GetClipboardSequenceNumber()`],
    { encoding: "utf8" },
  ).stdout.trim();

// La API de mentira: cuelga el turno que lleva la marca, y lo demás contesta un error.
const api = { colgados: 0, cortados: 0 };
const servidor = http.createServer((pet, res) => {
  let cuerpo = "";
  pet.on("data", (d) => (cuerpo += d));
  pet.on("end", () => {
    const u = (() => {
      try {
        const m = (JSON.parse(cuerpo).messages ?? []).filter((x) => x.role === "user").at(-1);
        return typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? "").join(" ");
      } catch {
        return "";
      }
    })();
    if (!pet.url.includes("/v1/messages") || !u.includes("hola de prueba") || /Write the title/.test(u)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "laboratorio" } }));
      return;
    }
    // Un turno que no acaba: el modelo va soltando texto y Claude Code repinta.
    api.colgados++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const evento = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
    evento("message_start", { message: { id: "msg_lab", type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
    evento("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    let n = 0;
    const goteo = setInterval(() => evento("content_block_delta", { index: 0, delta: { type: "text_delta", text: `Linea ${++n} que el modelo va soltando.\n\n` } }), 400);
    res.on("close", () => {
      clearInterval(goteo);
      api.cortados++;
    });
  });
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));

mkdirSync(CONFIG, { recursive: true });
mkdirSync(CARPETA, { recursive: true });
writeFileSync(
  join(CONFIG, ".claude.json"),
  JSON.stringify({
    hasCompletedOnboarding: true,
    theme: "dark",
    customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: { [CARPETA.replace(/\\/g, "/")]: { hasTrustDialogAccepted: true, allowedTools: [] }, [CARPETA]: { hasTrustDialogAccepted: true, allowedTools: [] } },
  }),
);
writeFileSync(join(CONFIG, "settings.json"), JSON.stringify({ tui: "fullscreen" }));

// Un programa que apunta lo que le llega por la entrada, byte a byte.
const PROGRAMA = join(TRABAJO, "programa.cjs");
writeFileSync(
  PROGRAMA,
  `const fs = require("fs");
const [conRaton, log] = process.argv.slice(2);
process.stdin.setRawMode(true);
process.stdin.resume();
if (conRaton === "1") process.stdout.write("\\x1b[?1049h\\x1b[?1000h\\x1b[?1002h\\x1b[?1006h");
for (let i = 0; i < 12; i++) console.log("  una linea para seleccionar con el raton " + i);
process.stdin.on("data", (d) => fs.appendFileSync(log, d.toString("hex") + "\\n"));
`,
);

// El portapapeles de la página, de mentira, antes de que nazca ningún panel.
const GUARDA_PORTAPAPELES = `(() => {
  window.__copiado = [];
  const doble = {
    read: async () => [],
    readText: async () => "",
    writeText: async (t) => { window.__copiado.push(t); },
    write: async () => { window.__copiado.push("(write)"); },
  };
  Object.defineProperty(Navigator.prototype, "clipboard", { get: () => doble, configurable: true });
})()`;

const a = await abrirAislada({ nombre: "ctrl-c", puertoMcp: 39497, depurar: 9497, exe: process.argv[2] || undefined, guarda: GUARDA_PORTAPAPELES });
const { v } = a;
const agente = a.puente(null);
const CASA = homedir();
const contadorAntes = contadorPortapapeles();
let claude = 0;

const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);
const copiado = () => v.js(`JSON.stringify(window.__copiado)`).then(JSON.parse);
const vaciarCopiado = () => v.js(`(window.__copiado = [], "ok")`);

async function panelNuevo(nombre) {
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: CARPETA, name: nombre, brief: "" });
  const id = Number(/^Terminal (\d+) abierta/.exec(r.texto ?? "")?.[1]);
  if (!id) throw new Error(`no abrió el panel: ${r.texto ?? r.error}`);
  await hasta(() => v.js(`!!document.querySelector('[data-pane-id="${id}"] .xterm-helper-textarea')`), 30_000, 500);
  await dormir(2500);
  return id;
}

/** La tecla por la propia xterm: un evento del DOM no dispara el «copiar» del navegador. */
const ctrlC = (id) =>
  v.js(`(() => {
    const ta = document.querySelector('[data-pane-id="${id}"] .xterm-helper-textarea');
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", keyCode: 67, which: 67, ctrlKey: true, bubbles: true, cancelable: true }));
    return "ok";
  })()`);

/** Arrastrar con el ratón de la página (eventos de entrada del WebView, no el de Munir). */
async function arrastrar(id) {
  const r = await v.js(`(() => { const b = document.querySelector('[data-pane-id="${id}"] .xterm-screen').getBoundingClientRect(); return JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height }); })()`).then(JSON.parse);
  const y = r.y + Math.min(60, r.h / 3);
  const x0 = r.x + 10;
  const x1 = r.x + Math.min(400, r.w - 10);
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y });
  await v.enviar("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + ((x1 - x0) * i) / 8, y: y + i * 2, button: "left", buttons: 1 });
    await dormir(30);
  }
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y + 16, button: "left", buttons: 0, clickCount: 1 });
  return Date.now();
}

/** Lo que le ha llegado a un `programa.cjs`, y si entre ello hay un Ctrl+C. */
const leLlego = (log) => (existsSync(log) ? readFileSync(log, "utf8") : "");
const cuantosCtrlC = (log) => leLlego(log).split(/\r?\n/).filter((l) => l === "03").length;

try {
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  // La ventana vive al fondo y sin foco: se emula el foco, o el OSC 52 no copiaría nunca.
  await v.enviar("Emulation.setFocusEmulationEnabled", { enabled: true });

  // ── 1. Claude Code a pantalla completa, con un turno en marcha ──────────
  console.log("\n── Un Claude Code de verdad a pantalla completa");
  claude = await panelNuevo("Claude de verdad");
  await teclear(
    claude,
    `$env:USERPROFILE='${CASA}'; $env:HOME='${CASA}'; $env:SSH_CONNECTION='laboratorio'; $env:CLAUDE_CODE_NO_FLICKER='1'; $env:CLAUDE_CONFIG_DIR='${CONFIG}'; $env:ANTHROPIC_API_KEY='${CLAVE}'; $env:ANTHROPIC_BASE_URL='http://127.0.0.1:${servidor.address().port}'; claude --strict-mcp-config\r`,
  );
  const caja = await hasta(async () => (/for shortcuts|to cycle\)|Try "/i.test(await pantalla(claude)) ? true : null), 90_000, 1000);
  if (!caja) throw new Error(`Claude Code no llegó a su caja:\n${await pantalla(claude)}`);
  await dormir(1500);
  const lista = (await agente.llamar("get_active_panes", {})).texto ?? "";
  debe(lista.split("\n").some((l) => l.startsWith(`ID: ${claude},`) && /Pantalla: alternativa/.test(l)), "Claude Code va en pantalla alternativa");

  await ctrlC(claude);
  const control = await hasta(async () => (/Ctrl-C again/i.test(await pantalla(claude)) ? true : null), 5_000, 200);
  debe(!!control, "CONTROL: sin arrastrar, el Ctrl+C le llega a Claude Code");
  await hasta(async () => (/Ctrl-C again/i.test(await pantalla(claude)) ? null : true), 8_000, 300);

  await teclear(claude, "hola de prueba");
  await dormir(300);
  await teclear(claude, "\r");
  const enMarcha = await hasta(() => (api.colgados >= 1 ? true : null), 20_000, 200);
  debe(!!enMarcha, "hay un turno en marcha, soltando texto desde la API de mentira");
  await dormir(2500);

  await vaciarCopiado();
  const soltado = await arrastrar(claude);
  const copia = await hasta(async () => ((await copiado()).length ? true : null), 1_500, 50);
  debe(!!copia, `arrastrar copia: ${JSON.stringify((await copiado()).map((t) => t.slice(0, 40)))}`);
  // Por costumbre, y más de una vez: con la selección puesta, Claude Code se come el
  // primero (copia y la borra), y el segundo ya era una interrupción.
  await ctrlC(claude);
  const primero = Date.now() - soltado;
  await dormir(450);
  const trasPrimero = api.cortados;
  await ctrlC(claude);
  const segundo = Date.now() - soltado;
  await dormir(1000);
  debe(trasPrimero === 0, `el Ctrl+C a los ${primero} ms de soltar no corta el turno`);
  debe(api.cortados === 0, `y otro a los ${segundo} ms, tampoco (cortados: ${api.cortados})`);

  // Pasado el rato le llegan todos: si aún tiene la selección, el primero es para ella.
  await dormir(Math.max(0, soltado + 3200 - Date.now()));
  let pulsados = 0;
  let cortado = api.cortados >= 1;
  while (!cortado && pulsados < 3) {
    await ctrlC(claude);
    pulsados++;
    cortado = !!(await hasta(() => (api.cortados >= 1 ? true : null), 1_500, 100));
  }
  debe(cortado, `pasados los 3 s corta como siempre, a los ${Date.now() - soltado} ms de soltar y con ${pulsados} Ctrl+C`);

  // ── 2. Un programa con el ratón que no copia ────────────────────────────
  console.log("\n── Un programa con el ratón que no copia nada");
  const conRaton = await panelNuevo("Con ratón");
  const logRaton = join(TRABAJO, "raton.log");
  await teclear(conRaton, `node "${PROGRAMA}" 1 "${logRaton}"\r`);
  await hasta(async () => (/para seleccionar/.test(await pantalla(conRaton)) ? true : null), 15_000, 300);
  await ctrlC(conRaton);
  debe(!!(await hasta(() => (cuantosCtrlC(logRaton) === 1 ? true : null), 3_000, 100)), "CONTROL: sin arrastrar, su Ctrl+C llega");
  await vaciarCopiado();
  await arrastrar(conRaton);
  await dormir(200);
  await ctrlC(conRaton);
  debe(!!(await hasta(() => (cuantosCtrlC(logRaton) === 2 ? true : null), 3_000, 100)), "tras arrastrar sin que copie nada, su Ctrl+C llega igual");
  debe(/3c3/.test(leLlego(logRaton)), "el arrastre fue suyo: le llegaron los movimientos del ratón");

  // ── 3. Una consola sin ratón: el Ctrl+C normal ──────────────────────────
  console.log("\n── Un programa sin ratón: el Ctrl+C de siempre");
  const sinRaton = await panelNuevo("Sin ratón");
  const logSin = join(TRABAJO, "sin.log");
  await teclear(sinRaton, `node "${PROGRAMA}" 0 "${logSin}"\r`);
  await hasta(async () => (/para seleccionar/.test(await pantalla(sinRaton)) ? true : null), 15_000, 300);
  await vaciarCopiado();
  await arrastrar(sinRaton);
  await dormir(200);
  await ctrlC(sinRaton);
  await dormir(500);
  debe((await copiado()).length === 1 && cuantosCtrlC(logSin) === 0, `con selección de xterm, Ctrl+C copia y no le llega: ${JSON.stringify((await copiado()).map((t) => t.slice(0, 40)))}`);
  await ctrlC(sinRaton);
  debe(!!(await hasta(() => (cuantosCtrlC(logSin) === 1 ? true : null), 3_000, 100)), "y el siguiente, sin selección, llega en el acto");

  debe(contadorPortapapeles() === contadorAntes, `el portapapeles de Munir no se ha tocado (contador ${contadorAntes})`);
} catch (e) {
  debe(false, `el laboratorio se cayó: ${e.stack || e}`);
} finally {
  if (claude) {
    for (let i = 0; i < 3; i++) {
      await teclear(claude, "\x03").catch(() => {});
      await dormir(500);
      await teclear(claude, "\x03").catch(() => {});
      if (await hasta(async () => (/PS [A-Z]:\\.*>\s*$/m.test(await pantalla(claude)) ? true : null), 8000, 400)) break;
    }
  }
  await a.cerrar();
  servidor.close();
  servidor.closeAllConnections?.();
  rmSync(TRABAJO, { recursive: true, force: true });
}
console.log(fallos.length ? `\n${fallos.length} fallos` : "\nTodo bien.");
process.exit(fallos.length ? 1 : 0);
