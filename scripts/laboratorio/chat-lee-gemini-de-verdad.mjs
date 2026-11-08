// El Chat lista y lee las conversaciones de Gemini CLI, de verdad.
//
// Gemini guarda cada sesión sola en `~/.gemini/tmp/<apodo>/chats/` (medido el
// 2026-11-08 con su 0.52.0), y Adeorq no las leía porque se había escrito que
// solo guardaba con `/chat save`. Una Adeorq aislada (ver `aislada.mjs`) con una
// casa falsa donde se siembra un proyecto de Gemini con la forma de su disco y
// texto inventado: el `.project_root` en minúsculas, como lo escribe en Windows,
// y una sesión con su cabecera, el `<session_context>` del CLI, un mensaje tuyo,
// una respuesta que se reescribe con su herramienta, el resultado de esa
// herramienta y la respuesta final. Luego se le pregunta a la app por sus
// comandos de verdad:
//   - `scan_sessions` la devuelve con fuente gemini, el id entero, su primer
//     mensaje como título y la carpeta con las mayúsculas del disco;
//   - `session_messages` devuelve sus turnos;
//   - el Chat enseña la marca de Gemini arriba (se mira la foto);
//   - `rename_session` y `delete_session` con fuente gemini la renombran y la
//     mandan a la papelera (es un fichero de la casa falsa).
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/chat-lee-gemini-de-verdad.mjs [exe]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const NOMBRE = "chat-gemini";
const ID = "7c1e5a90-3b2d-4f6e-9a8b-0c1d2e3f4a5b";
let fichero = "";
let demo = "";

function sembrar(datos) {
  const base = dirname(dirname(datos));
  demo = join(base, "proyectos", "demo");
  const proyecto = join(base, "casa", ".gemini", "tmp", "demo");
  const chats = join(proyecto, "chats");
  mkdirSync(chats, { recursive: true });
  writeFileSync(join(proyecto, ".project_root"), demo.toLowerCase());
  const t = (s) => new Date(Date.now() - (60 - s) * 1000).toISOString();
  const herramienta = { id: "t1", name: "read_file", args: { file_path: "guardar.ts" }, status: "success", displayName: "ReadFile", description: "guardar.ts" };
  const lineas = [
    { sessionId: ID, projectHash: "0".repeat(64), startTime: t(0), lastUpdated: t(0), kind: "main" },
    { $set: { messages: [{ id: "c0", timestamp: t(0), type: "user", content: [{ text: "<session_context>\nThis is the Gemini CLI.\n</session_context>" }] }], lastUpdated: t(0) } },
    { id: "u1", timestamp: t(1), type: "user", content: [{ text: "Mira por qué falla el guardado" }] },
    { $set: { lastUpdated: t(1) } },
    { id: "g1", timestamp: t(2), type: "gemini", content: "Voy a leer el archivo.", thoughts: [], model: "gemini-3-flash" },
    { id: "g1", timestamp: t(2), type: "gemini", content: "Voy a leer el archivo.", thoughts: [], model: "gemini-3-flash", toolCalls: [herramienta] },
    { id: "r1", timestamp: t(3), type: "user", content: [{ functionResponse: { id: "t1", name: "read_file", response: { output: "export {}" } } }] },
    { $set: { lastUpdated: t(3) } },
    { id: "g2", timestamp: t(4), type: "gemini", content: "Falta esperar a la promesa.", thoughts: [], model: "gemini-3-flash" },
    { $set: { lastUpdated: t(4) } },
  ];
  const fecha = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  fichero = join(chats, `session-${fecha}-${ID.slice(0, 8)}.jsonl`);
  writeFileSync(fichero, lineas.map((l) => JSON.stringify(l)).join("\n") + "\n");

  // Y una de Codex, porque el Chat solo pinta la fila de marcas con dos
  // clientes o más (`clientes.length > 1` en `ChatView.tsx`).
  const dia = join(base, "casa", ".codex", "sessions", "2026", "11", "08");
  mkdirSync(dia, { recursive: true });
  const ahora = new Date().toISOString();
  const codex = "019a0b0c-1d2e-7f30-8a41-b52c63d74e85";
  writeFileSync(join(dia, `rollout-2026-11-08T10-00-00-${codex}.jsonl`), [
    { timestamp: ahora, type: "session_meta", payload: { id: codex, cwd: demo, timestamp: ahora, originator: "codex_cli_rs", cli_version: "0.50.0" } },
    { timestamp: ahora, type: "event_msg", payload: { type: "user_message", message: "otra cosa" } },
  ].map((l) => JSON.stringify(l)).join("\n") + "\n");
}

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};
const invocar = (a, comando, args = {}) =>
  a.v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(comando)}, ${JSON.stringify(args)})`);

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: NOMBRE, puertoMcp, depurar: 9800 + (process.pid % 100), exe, sembrar });
try {
  const lista = await invocar(a, "scan_sessions");
  const s = lista.find((x) => x.id === ID);
  dice(!!s, "scan_sessions devuelve la sesión de Gemini con su id entero", JSON.stringify(lista.map((x) => [x.fuente, x.id])));
  if (s) {
    dice(s.fuente === "gemini", "con fuente gemini", s.fuente);
    dice(s.title === "Mira por qué falla el guardado", "y su primer mensaje de verdad como título, no el <session_context>", s.title);
    dice(s.cwd === demo, "la carpeta vuelve con las mayúsculas del disco aunque Gemini la apunte en minúsculas", `${s.cwd} ≠ ${demo}`);
    dice(s.resumeCwd === demo, "y se retoma desde ella", s.resumeCwd);
    dice(s.project === "demo", "en el proyecto demo", s.project);
    dice(s.fresh === "activa", "activa", s.fresh);
  }

  const turnos = await invocar(a, "session_messages", { cwd: demo, sessionId: ID, max: 60 });
  const vistos = turnos.map((t) => [t.rol, t.texto]);
  dice(
    JSON.stringify(vistos) === JSON.stringify([["tu", "Mira por qué falla el guardado"], ["agente", "Voy a leer el archivo.\n\nFalta esperar a la promesa."]]),
    "session_messages devuelve sus dos turnos, sin el contexto del CLI ni el resultado de la herramienta",
    JSON.stringify(vistos),
  );
  dice(JSON.stringify(turnos[1]?.herramientas) === '["read_file"]', "la herramienta del mensaje reescrito cuenta una vez", JSON.stringify(turnos[1]?.herramientas));

  // El Chat: la marca de Gemini arriba, con la sesión dentro. Se mira en la foto.
  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  // La pestaña lleva dentro su etiqueta «beta»: su texto es «Chatbeta».
  const enChat = await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /^\\s*Chat/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  if (enChat) {
    // Las marcas viven en la pestaña «Sesiones» del Chat, con el nombre en `data-tip`.
    await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".chat-pestana")].find((x) => /Sesiones/.test(x.textContent ?? "")); b?.click(); return !!b; })()`), 10_000);
    const marca = await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".chat-cliente")].find((x) => /gemini/i.test(x.dataset.tip ?? "")); b?.click(); return !!b; })()`), 15_000, 500);
    dice(!!marca, "el Chat enseña la marca de Gemini");
    const fila = await hasta(() => a.v.js(`(() => { const f = [...document.querySelectorAll(".chat-fila")].find((x) => /Mira por qué falla/.test(x.textContent ?? "")); f?.click(); return !!f; })()`), 10_000, 500);
    dice(!!fila, "y dentro, la sesión con su título");
    const leida = await hasta(() => a.v.js(`document.body.innerText.includes("Falta esperar a la promesa.")`), 10_000, 500);
    dice(!!leida, "al abrirla sale la conversación");
    await dormir(800);
    console.log(`      foto: ${await a.foto(null, "chat-lee-gemini.png")}`);
  } else {
    dice(false, "la pestaña Chat no está");
  }

  await invocar(a, "rename_session", { folder: "", sessionId: ID, title: "Guardado roto", fuente: "gemini" });
  const renombrada = (await invocar(a, "scan_sessions")).find((x) => x.id === ID);
  dice(renombrada?.title === "Guardado roto", "rename_session con fuente gemini le cambia el título", renombrada?.title);

  await invocar(a, "delete_session", { folder: "", sessionId: ID, fuente: "gemini" });
  dice(!existsSync(fichero), "delete_session con fuente gemini manda su fichero a la papelera", fichero);
  const despues = (await invocar(a, "scan_sessions")).find((x) => x.id === ID);
  dice(!despues, "y ya no sale");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
