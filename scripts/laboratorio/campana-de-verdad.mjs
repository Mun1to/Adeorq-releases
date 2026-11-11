// La campana de Claude Code y el fin de turno de Adeorq, con un Claude Code DE
// VERDAD y sin gastar. Salió del 2026-11-11: `compactarme` no llegaba nunca a su
// `/compact` porque Claude Code 2.1.322 no tocó la campana al acabar el turno, y
// de esa campana (`term.onBell` en TerminalPane.tsx) colgaban el brillo de
// «terminó», su aviso, la raya roja de 400k y la segunda mitad de compactar.
//
// Lo que dice su código (2.1.322, leído en el binario): la campana es UNO de los
// canales de su aviso de «Claude is waiting for your input», y ese aviso sale a
// los `messageIdleNotifThresholdMs` (60 s) de quedarse parado, no al acabar. Con
// el canal de fábrica («auto») solo avisa en Terminal de Apple, iTerm, kitty y
// ghostty: en un xterm.js, nunca. Esto lo mide en una Adeorq aislada, con su
// casa, una clave falsa y una API de mentira en este proceso (`ANTHROPIC_BASE_URL`):
//
//   A. «auto» (sin `preferredNotifChannel`, como el de Munir): campanas al acabar
//      un turno y en los 70 s siguientes; y si el brillo y el aviso de «terminó»
//      llegan igual, una vez.
//   B. «terminal_bell» (en su `.claude/settings.local.json`): la campana llega
//      al minuto, no al acabar; el brillo y el aviso, al acabar y UNA vez (la
//      campana del minuto no vuelve a avisar).
//   E. `compactar_terminal` de quien la abrió: tras su `/fin sin commits`, el
//      `/compact` llega sin campana.
//   F. La raya roja: una delegada a 420k compacta sola, `/fin sin commits` y
//      luego `/compact`, sin campana.
//
// Cada pasada es una carpeta de proyecto y su propio Claude Code, a la vez. Los
// avisos no salen de la ventana (ni notificación de Windows, ni el parpadeo de la
// barra, ni el móvil, ni el sonido): se apuntan en la página y se cuentan.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/campana-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Sale con 1 si algo falla.
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3197;
const DEPURAR = 9397;
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
/** Lo que contesta la skill `/fin` de la casa aislada. */
const FIN = "LAB-FIN-HECHO";
/** El principio de `ordenDeCompactar` (lib/contexto.ts): va detrás del `/compact`. */
const ORDEN = "Conserva el estado real del repo";
/** Lo que se espera tras acabar un turno: pasado el aviso de los 60 s. */
const OBSERVAR_MS = 75_000;
/** Lo que tarda en contestar el modelo de mentira. */
const TARDA_MS = 3000;
mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 400)})` : ""}`);
  if (!bien) fallos.push(que);
  return bien;
};
const seg = (ms) => (ms == null ? "nunca" : `${(ms / 1000).toFixed(1)} s`);

// ─── La API de mentira ──────────────────────────────────────────────────────
/** Por pasada: cuándo acabó de contestar cada cosa. */
const api = {};
const dePasada = (todo) => /lab-([A-Z])\b/.exec(todo)?.[1] ?? null;
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
    const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? (typeof c.content === "string" ? c.content : "")).join(" "));
    const todo = (j.messages ?? []).map(textoDe).join("\n");
    const ultimo = textoDe((j.messages ?? []).filter((m) => m.role === "user").at(-1));
    const pasada = dePasada(todo);
    if (!pasada) return error();
    const p = (api[pasada] ??= { orden: [] });
    // La raya roja: la pasada F dice llevar 420k hasta que se compacta. Y cada
    // respuesta, un poco más, como un transcript de verdad.
    const tokens = (pasada === "F" && !p.resumen ? 420_000 : 1_000) + 500 * p.orden.length;
    // Como un modelo de verdad, tarda: un turno de 0 s cabe entero entre dos
    // miradas a la pantalla y no se ve trabajar (pasó en la primera pasada).
    const sse = async (texto, que) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
      ev("message_start", { message: { id: `msg_lab_${Date.now()}`, type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: tokens, output_tokens: 1 } } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      await dormir(TARDA_MS);
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { input_tokens: tokens, output_tokens: 5 } });
      ev("message_stop", {});
      res.end();
      p.orden.push(que);
      p[que] ??= Date.now();
    };
    // El resumen de un `/compact` con la orden de Adeorq detrás (todos: se cuentan).
    if (ultimo.includes(ORDEN)) return sse(`<summary>Resumen de la pasada ${pasada}.</summary>`, "resumen");
    // Lo demás que pide Claude Code por su cuenta (título, sugerencias) no lleva herramientas.
    if (!(j.tools ?? []).length || /^\s*\[SUGGESTION MODE/.test(ultimo)) return error();
    if (ultimo.includes(FIN)) return sse(`${FIN}.`, "fin");
    if (/lab-[A-Z]\b/.test(ultimo) && !p.hola) return sse("Hola.", "hola");
    return sse("Recibido.", "otra");
  });
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const PUERTO_API = servidor.address().port;

// ─── La Adeorq aislada ──────────────────────────────────────────────────────
for (const k of Object.keys(process.env)) {
  if ((/^CLAUDE/i.test(k) && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_CLAVE" || k === "ADEORQ_PANE_ID" || k === "ADEORQ_TERMINALES_CANAL") delete process.env[k];
}
const exe = process.argv[3] ? resolve(process.argv[3]) : EXE;
const PASADAS = { A: "auto", B: "terminal_bell", E: "auto", F: "auto" };
const carpetas = {};
// La cuenta de la casa aislada: bienvenida pasada, la clave falsa aprobada, una
// carpeta de proyecto confiada por pasada (B con la campana en su settings.local),
// sin el compactado automático del CLI (la raya F dice 420k) y la skill `/fin`.
const sembrar = (datos) => {
  const casa = resolve(datos, "..", "..", "casa");
  const proyectos = resolve(datos, "..", "..", "proyectos");
  const confiada = { hasTrustDialogAccepted: true, allowedTools: [] };
  const projects = {};
  for (const [letra, canal] of Object.entries(PASADAS)) {
    const dir = join(proyectos, `campana-${letra.toLowerCase()}`);
    carpetas[letra] = dir;
    mkdirSync(join(dir, ".claude"), { recursive: true });
    if (canal !== "auto") writeFileSync(join(dir, ".claude", "settings.local.json"), JSON.stringify({ preferredNotifChannel: canal }));
    projects[dir.replace(/\\/g, "/")] = confiada;
    projects[dir] = confiada;
  }
  mkdirSync(join(casa, ".claude", "skills", "fin"), { recursive: true });
  writeFileSync(join(casa, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "dark", autoCompactEnabled: false, customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] }, projects }));
  writeFileSync(join(casa, ".claude", "settings.json"), JSON.stringify({ tui: "fullscreen" }));
  writeFileSync(join(casa, ".claude", "skills", "fin", "SKILL.md"), `---\nname: fin\ndescription: Cierre de sesión de laboratorio.\n---\n\nContesta exactamente «${FIN}» y nada más.\n`);
};

/** Lo que no sale de la ventana y se cuenta: el sonido de «terminó», las
 *  notificaciones de Windows, el parpadeo de la barra y los avisos al móvil y al bot. */
const GUARDA = `(() => {
  const lab = (window.__lab = window.__lab || { avisos: [], sonidos: 0, campanas: {}, leyendo: {} });
  const nada = () => new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : k === "state" ? "running" : k === "currentTime" ? 0 : nada()), apply: () => nada(), construct: () => nada() });
  window.AudioContext = function () { lab.sonidos++; return nada(); };
  window.Notification = class { static permission = "denied"; static requestPermission() { return Promise.resolve("denied"); } };
  // Como Munir en otra ventana: el aviso de «terminó» solo sale con Adeorq detrás,
  // y la ventana de pruebas, aun al fondo, dice tener el foco.
  document.hasFocus = () => false;
  const real = window.fetch.bind(window);
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    const cmd = (url.match(/^https?:\\/\\/ipc\\.localhost\\/(.+)$/) || [])[1];
    if (cmd && (cmd === "movil_avisar" || cmd === "bot_avisar" || /^plugin:(notification|window)\\|(notify|request_user_attention|is_permission_granted|request_permission)$/.test(cmd))) {
      if (cmd === "movil_avisar") { let d = {}; try { d = JSON.parse(b && b.body); } catch {} lab.avisos.push({ en: Date.now(), ...d }); }
      const valor = /is_permission_granted/.test(cmd) ? false : /request_permission/.test(cmd) ? "denied" : null;
      return Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    return real(a, b);
  };
})()`;

/** Cuenta las campanas (BEL fuera de una cadena OSC, DCS, APC o PM) de cada
 *  terminal en lo que llega del PTY, con la hora. */
const CONTAR_CAMPANAS = `(() => {
  const lab = window.__lab;
  if (lab.oyendo) return "ya";
  lab.oyendo = true;
  const T = window.__TAURI_INTERNALS__;
  T.invoke("plugin:event|listen", { event: "pty-data", target: { kind: "Any" }, handler: T.transformCallback((e) => {
    const { id, data } = e.payload || {};
    if (id == null || typeof data !== "string") return;
    let m = lab.leyendo[id] || 0;
    for (const c of data) {
      if (m === 0) { if (c === "\\x1b") m = 1; else if (c === "\\x07") (lab.campanas[id] = lab.campanas[id] || []).push(Date.now()); }
      else if (m === 1) m = c === "]" ? 2 : "P_^X".includes(c) ? 4 : 0;
      else if (m === 2) { if (c === "\\x07") m = 0; else if (c === "\\x1b") m = 3; }
      else if (m === 3) m = c === "\\\\" ? 0 : 2;
      else if (m === 4) { if (c === "\\x1b") m = 5; }
      else if (m === 5) m = c === "\\\\" ? 0 : 4;
    }
    lab.leyendo[id] = m;
  }) });
  return "ok";
})()`;

const a = await abrirAislada({
  nombre: "campana",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe,
  sembrar,
  guarda: GUARDA,
  entorno: { ANTHROPIC_API_KEY: CLAVE, ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_API}`, SSH_CONNECTION: "laboratorio", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_NO_FLICKER: "1" },
});
try {
  const { v } = a;
  await v.js(CONTAR_CAMPANAS);
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  const teclear = (id, data) => v.js(`window.__TAURI_INTERNALS__.invoke("pty_write", { id: ${id}, data: ${JSON.stringify(data)} }).then(() => "ok")`);
  const lab = () => v.js(`JSON.parse(JSON.stringify(window.__lab))`);
  const brilla = (id) => v.js(`document.querySelector('[data-pane-id="${id}"]')?.getAttribute("data-done") === "true"`);

  // Las cuatro, cada una con su Claude Code; y detrás una consola, que se queda
  // con el foco: el brillo de «terminó» no se enciende en la que tienes delante.
  const panel = {};
  for (const letra of Object.keys(PASADAS)) {
    const r = await agente.llamar("open_pane", { cli: "claude", cwd: carpetas[letra], name: `Campana ${letra}`, brief: "" });
    panel[letra] = Number(/Terminal\s+(\d+)/.exec(r.texto ?? "")?.[1]);
    if (!panel[letra]) throw new Error(`no abrió la ${letra}: ${r.texto ?? r.error}`);
  }
  const consola = await agente.llamar("open_pane", { cli: "shell", cwd: carpetas.A, name: "Consola", brief: "" });
  const idConsola = Number(/Terminal\s+(\d+)/.exec(consola.texto ?? "")?.[1]);
  for (const letra of Object.keys(PASADAS)) {
    const caja = await hasta(async () => (/for shortcuts|to cycle\)|Try "/i.test(await pantalla(panel[letra])) ? true : null), 90_000, 1000);
    if (!caja) throw new Error(`Claude Code de la ${letra} no llegó a su caja:\n${await pantalla(panel[letra])}`);
  }
  await dormir(2500);
  const conFoco = await v.js(`[...document.querySelectorAll('[data-pane-id][data-focused="true"]')].map((e) => e.getAttribute("data-pane-id"))`);
  debe(!Object.values(panel).map(String).some((id) => conFoco.includes(id)), "ninguna de las cuatro tiene el foco", `foco en ${conFoco.join(",") || "ninguna"}, consola ${idConsola}`);
  const campanasAntes = (await lab()).campanas;

  // Un turno en cada una. Un Intro que llega pegado al texto lo toma por parte
  // del pegado y se queda en la caja: se repite hasta que la API lo recibe.
  for (const letra of Object.keys(PASADAS)) await teclear(panel[letra], `lab-${letra} hola`);
  await dormir(1000);
  for (let vez = 0; vez < 4 && !Object.keys(PASADAS).every((l) => api[l]?.hola); vez++) {
    for (const letra of Object.keys(PASADAS)) if (!api[letra]?.hola) await teclear(panel[letra], "\r");
    await hasta(() => (Object.keys(PASADAS).every((l) => api[l]?.hola) ? true : null), 5_000, 200);
  }
  const contestadas = await hasta(() => (Object.keys(PASADAS).every((l) => api[l]?.hola) ? true : null), 30_000, 200);
  if (!contestadas) {
    const faltan = Object.keys(PASADAS).filter((l) => !api[l]?.hola);
    const pantallas = await Promise.all(faltan.map(async (l) => `── ${l} ──\n${await pantalla(panel[l])}`));
    throw new Error(`no contestó a ${faltan.join(", ")}:\n${pantallas.join("\n")}`);
  }

  // E: lo pide quien la abrió, con su turno ya acabado.
  await hasta(async () => /for shortcuts|to cycle\)|Try "/i.test(await pantalla(panel.E)) || null, 15_000, 500);
  const pedido = await agente.llamar("compactar_terminal", { paneId: panel.E });
  console.log(`      compactar_terminal(${panel.E}): ${(pedido.texto ?? pedido.error ?? "").split("\n")[0].slice(0, 200)}`);

  // Se mira durante 75 s: el brillo, cuándo llega, y las campanas.
  const primerBrillo = {};
  const fin = Date.now() + OBSERVAR_MS;
  while (Date.now() < fin) {
    for (const letra of ["A", "B"]) if (primerBrillo[letra] == null && (await brilla(panel[letra]))) primerBrillo[letra] = Date.now();
    await dormir(500);
  }
  const visto = await lab();
  writeFileSync(join(FOTOS, "campana-avisos.json"), JSON.stringify({ api, visto, panel }, null, 2));
  for (const letra of Object.keys(PASADAS)) writeFileSync(join(FOTOS, `campana-${letra}.txt`), await pantalla(panel[letra]));
  await a.foto(null, "campana-ventana.png");

  const campanasDe = (letra) => (visto.campanas[panel[letra]] ?? []).filter((t) => !(campanasAntes[panel[letra]] ?? []).includes(t));
  const avisosDe = (letra) => visto.avisos.filter((x) => x.tipo === "termino" && String(x.cuerpo ?? "").includes(`Campana ${letra}`));
  const tras = (letra, t) => (t == null ? null : t - api[letra].hola);

  // ── Lo medido ─────────────────────────────────────────────────────────────
  console.log("\n— Medido —");
  for (const letra of ["A", "B"]) {
    const c = campanasDe(letra).map((t) => tras(letra, t));
    console.log(`      ${letra} (${PASADAS[letra]}): campanas tras acabar el turno: ${c.length ? c.map(seg).join(", ") : "ninguna"}; brillo: ${seg(tras(letra, primerBrillo[letra]))}; avisos de «terminó»: ${avisosDe(letra).map((x) => seg(tras(letra, x.en))).join(", ") || "ninguno"}`);
  }
  const cA = campanasDe("A");
  const cB = campanasDe("B").map((t) => tras("B", t));
  debe(cA.length === 0, "A, con el canal de fábrica, Claude Code no toca la campana al acabar ni en los 75 s siguientes", `${cA.length}`);
  debe(cB.length >= 1 && cB.every((ms) => ms > 50_000), "B, con terminal_bell, la toca, pero al minuto de quedarse parado y no al acabar", cB.map(seg).join(", "));

  // ── Lo de Adeorq, sin depender de la campana ──────────────────────────────
  console.log("\n— Adeorq —");
  for (const letra of ["A", "B"]) {
    const b = tras(letra, primerBrillo[letra]);
    debe(b != null && b < 15_000, `${letra}: el brillo de «terminó» se enciende al acabar el turno`, seg(b));
    const av = avisosDe(letra);
    debe(av.length === 1 && tras(letra, av[0].en) < 15_000, `${letra}: un solo aviso de «terminó», al acabar`, av.map((x) => seg(tras(letra, x.en))).join(", ") || "ninguno");
  }
  debe(Boolean(api.E?.fin), "E: compactar_terminal manda su /fin sin commits", (api.E?.orden ?? []).join(" → "));
  debe(Boolean(api.E?.resumen) && api.E.resumen > api.E.fin, "E: y al acabar el /fin, el /compact llega sin campana", (api.E?.orden ?? []).join(" → "));
  debe(Boolean(api.F?.fin), "F: a 420k, la delegada empieza sola con /fin sin commits", (api.F?.orden ?? []).join(" → "));
  debe(Boolean(api.F?.resumen) && api.F.resumen > api.F.fin, "F: y luego se compacta", (api.F?.orden ?? []).join(" → "));
  for (const letra of ["E", "F"]) {
    const n = (api[letra]?.orden ?? []).filter((x) => x === "resumen").length;
    debe(n <= 1, `${letra}: un solo /compact`, `${n}`);
  }
} catch (e) {
  fallos.push(String(e?.message ?? e));
  console.log(`MAL   ${e?.stack ?? e}`);
} finally {
  await a.cerrar();
  servidor.close();
}
console.log(fallos.length ? `\n${fallos.length} MAL:\n  ${fallos.join("\n  ")}` : "\nTodo bien.");
process.exitCode = fallos.length ? 1 : 0;
