// Compactar a tiempo, en una Adeorq aislada y con un Claude de mentira.
//
// Munir, 2026-10-22: «que sea casi obligatorio compactar en ese rango», del 50
// al 60 % de contexto. La lógica la pasa entera `pnpm bancos contexto`; esto
// mira lo que el banco no ve: que el panel de verdad lee el porcentaje de un
// transcript en disco, pinta el aviso que toca, y teclea `/fin` y `/compact`
// en el PTY solo cuando debe.
//
// El «Claude» es un script de node que se llama `claude.cmd` (para que la app
// lo tome por Claude Code), apunta en `recibido.log` cada línea que le teclean
// y toca la campana cuando aparece un fichero `campana` a su lado. El
// transcript lo escribe este guion en la casa de pruebas, con el porcentaje y
// el estado que toca en cada paso. Ningún CLI de verdad, ninguna cuenta.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/compactar-a-tiempo-de-verdad.mjs [carpeta-de-fotos]
//
// Tarda unos dos minutos: el panel relee el transcript cada veinte segundos.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const fotos = process.argv[2] ?? tmpdir();
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const SID = "5e55a1d2-6c0a-4b1e-9a77-0c0ffee00022";
const CLAUDE_FALSO = `import { appendFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
process.stdout.write("Claude de mentira: apunto lo que me tecleen.\\r\\n> ");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let linea = "";
process.stdin.on("data", (b) => {
  for (const ch of b.toString("utf8")) {
    if (ch === "\\r" || ch === "\\n") {
      const limpia = linea.replace(/\\x1b\\[[0-9;?]*[A-Za-z~]/g, "").replace(/[\\x00-\\x1f]/g, "");
      if (limpia) appendFileSync(join(aqui, "recibido.log"), limpia + "\\n");
      linea = "";
      process.stdout.write("\\r\\n> ");
    } else linea += ch;
  }
});
// Lo que pinta según el fichero que aparezca: la campana, el pie de turno de
// Claude Code mientras trabaja, o la pantalla en blanco de cuando ya no.
const pinta = { campana: "\\x07", trabajando: "\\r\\n* Pensando... (esc to interrupt)\\r\\n", quieto: "\\x1b[2J\\x1b[H> " };
setInterval(() => {
  for (const [f, texto] of Object.entries(pinta)) {
    if (!existsSync(join(aqui, f))) continue;
    rmSync(join(aqui, f), { force: true });
    process.stdout.write(texto);
  }
}, 150);
`;

const a = await abrirAislada({ nombre: "compactar", puertoMcp: 47_000 + (process.pid % 900), depurar: 9750 + (process.pid % 100), exe: EXE, fotos });
try {
  const falso = join(a.base, "falso");
  mkdirSync(falso, { recursive: true });
  writeFileSync(join(falso, "claude-falso.mjs"), CLAUDE_FALSO);
  writeFileSync(join(falso, "claude.cmd"), `@echo off\r\nnode "%~dp0claude-falso.mjs" %*\r\n`);
  const recibido = join(falso, "recibido.log");
  // Una skill `fin` en la casa de pruebas: sin ella la app manda, como debe, el
  // texto de la casa en vez del `/fin` (ese camino lo pasa el banco).
  mkdirSync(join(a.base, "casa", ".claude", "skills", "fin"), { recursive: true });
  writeFileSync(join(a.base, "casa", ".claude", "skills", "fin", "SKILL.md"), "---\nname: fin\ndescription: Cierre de sesión de prueba.\n---\n\nCierre.\n");
  const ordenes = () => (existsSync(recibido) ? readFileSync(recibido, "utf8").split("\n").filter((l) => /^\/(fin|compact)\b/.test(l)) : []);

  // El transcript de la sesión, donde lo busca Rust: `~/.claude/projects/<carpeta codificada>`.
  const dirT = join(a.base, "casa", ".claude", "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(dirT, { recursive: true });
  const transcript = join(dirT, `${SID}.jsonl`);
  const linea = (pct, estado) =>
    JSON.stringify({
      type: "assistant",
      cwd: a.demo,
      sessionId: SID,
      message: {
        model: "claude-opus-5-5",
        role: "assistant",
        content: estado === "a_medias" ? [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pnpm build" } }] : [{ type: "text", text: "Hecho." }],
        usage: { input_tokens: pct * 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }) + "\n";
  const escribir = (pct, estado) => appendFileSync(transcript, linea(pct, estado));
  writeFileSync(transcript, linea(55, "lista"));

  // Un tablero con un panel: el Claude de mentira, en la carpeta demo.
  await a.v.js(`localStorage.setItem("adeorq-layout", ${JSON.stringify(
    JSON.stringify({ panes: [{ name: "demo · claude", cwd: a.demo, command: ["cmd.exe", "/c", join(falso, "claude.cmd")] }], cols: [{ w: 1, hs: [1], idx: [0] }], ocultos: [] }),
  )}); "ok"`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!document.querySelector("[data-pane-id]"); })()`), 30_000, 500);
  // Lo que pinta va a un lienzo, no al DOM: se mira que el script ya escucha.
  writeFileSync(join(falso, "campana"), "");
  const vivo = await hasta(() => !existsSync(join(falso, "campana")), 20_000, 400);
  dice(!!vivo, "el panel arranca el Claude de mentira");

  const aviso = () =>
    a.v.js(`(() => {
      const w = document.querySelector("[data-pane-id] .pane-ctx-warn");
      if (!w) return "null";
      return JSON.stringify({ nivel: w.dataset.nivel, fase: w.dataset.fase, grave: w.dataset.grave, texto: w.querySelector("span")?.textContent ?? "", botones: [...w.querySelectorAll("button")].map((b) => b.textContent.trim()) });
    })()`).then((x) => JSON.parse(x ?? "null"));
  const foto = async (nombre) => {
    const r = await a.v.js(`(() => { const p = document.querySelector("[data-pane-id]"); const w = p?.querySelector(".pane-ctx-warn"); if (!p) return "null"; const a = p.getBoundingClientRect(); const b = (w ?? p.querySelector(".pane-head")).getBoundingClientRect(); return JSON.stringify({ x: a.x, y: a.y, width: a.width, height: b.bottom - a.y + 14 }); })()`).then((x) => JSON.parse(x ?? "null"));
    if (r) console.log(`      foto: ${await a.foto(r, `compactar-${nombre}.png`)}`);
  };
  const campana = async () => {
    writeFileSync(join(falso, "campana"), "");
    await dormir(4500);
  };

  // ── 50 %: el aviso con Compactar ─────────────────────────────────────────
  let w = await hasta(aviso, 25_000, 500);
  dice(w?.nivel === "1" && w?.grave === "false", "al 55 % sale el aviso ámbar", JSON.stringify(w));
  dice(!!w?.botones.includes("Compactar") && w?.botones.includes("×"), "con Compactar y su ×", JSON.stringify(w?.botones));
  await foto("50");
  await campana();
  dice(ordenes().length === 0, "al 55 % la campana no teclea nada", JSON.stringify(ordenes()));

  // ── 60 % con «Avisar y esperar al botón»: fijo, sin ×, y nada solo ───────
  await a.v.js(`localStorage.setItem("adeorq-compactar-solo", "no"); "ok"`);
  escribir(62, "lista");
  w = await hasta(async () => ((await aviso())?.nivel === "2" ? aviso() : null), 30_000, 1000);
  dice(w?.grave === "true" && /compacta ya/.test(w?.texto ?? ""), "al 62 % el aviso pasa a rojo y dice que compactes", JSON.stringify(w));
  dice(!!w && !w.botones.includes("×") && w.botones.includes("Ahora no"), "sin ×: solo «Ahora no» lo quita", JSON.stringify(w?.botones));
  await foto("60-sin-solo");
  await campana();
  dice(ordenes().length === 0, "con el modo «no» la campana no teclea nada", JSON.stringify(ordenes()));

  // ── 60 % de fábrica (Munir, A1: solo y sin commits), a mitad de una tarea ─
  await a.v.js(`localStorage.removeItem("adeorq-compactar-solo"); "ok"`);
  escribir(62, "a_medias");
  await campana();
  dice(ordenes().length === 0, "con herramientas en marcha la campana no teclea nada", JSON.stringify(ordenes()));
  w = await aviso();
  // La campana de un turno a medias ya lo deja armado: dice que espera al turno.
  dice(w?.fase === "esperando" && /acabe este turno/.test(w?.texto ?? "") && w?.botones.includes("Ahora no"), "y el aviso dice que compactará en cuanto acabe el turno", JSON.stringify(w));
  await foto("60-solo");

  // ── El transcript dice «lista», pero la pantalla dice que sigue ──────────
  // «que cuando todavía esté trabajando no compactar auto» (Munir).
  const pintar = (f) => {
    writeFileSync(join(falso, f), "");
    return hasta(() => !existsSync(join(falso, f)), 5000, 100);
  };
  escribir(62, "lista");
  await pintar("trabajando");
  await campana();
  dice(ordenes().length === 0, "con «esc to interrupt» en pantalla la campana no teclea nada, aunque el transcript diga lista", JSON.stringify(ordenes()));

  // ── El turno acaba de verdad: /fin sin commits, y luego /compact ─────────
  await pintar("quieto");
  await campana();
  dice(JSON.stringify(ordenes()) === JSON.stringify(["/fin sin commits"]), "con el turno acabado la campana manda /fin sin commits", JSON.stringify(ordenes()));
  w = await aviso();
  dice(w?.fase === "cerrando" && /traspaso/.test(w?.texto ?? ""), "y el aviso dice que está escribiendo el traspaso", JSON.stringify(w));
  await foto("cerrando");
  escribir(62, "a_medias");
  await campana();
  dice(ordenes().length === 1, "un permiso a mitad del /fin no suelta el /compact", JSON.stringify(ordenes()));
  escribir(63, "lista");
  await campana();
  const o = ordenes();
  dice(o.length === 2 && /^\/compact Conserva el estado real del repo/.test(o[1]), "al acabar el /fin, el /compact con qué conservar", JSON.stringify(o));

  // ── Compactó: el aviso se va, y vuelve en la subida siguiente ────────────
  appendFileSync(transcript, JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 630_000, postTokens: 30_000 } }) + "\n");
  w = await hasta(async () => ((await aviso()) === null ? "fuera" : null), 30_000, 1000);
  dice(w === "fuera", "tras compactar (3 %) el aviso se va");
  escribir(81, "lista");
  w = await hasta(async () => ((await aviso())?.nivel === "3" ? aviso() : null), 30_000, 1000);
  dice(w?.nivel === "3" && w?.botones.includes("Nueva con traspaso"), "y vuelve en la subida siguiente (81 %), con Nueva con traspaso", JSON.stringify(w));
  await foto("80");

  // ── «Ahora no» lo para ───────────────────────────────────────────────────
  await a.v.js(`[...document.querySelectorAll("[data-pane-id] .pane-ctx-warn button")].find((b) => b.textContent.trim() === "Ahora no")?.click(); "ok"`);
  await dormir(500);
  await campana();
  dice(ordenes().length === 2, "con «Ahora no» la campana ya no teclea nada", JSON.stringify(ordenes()));
  dice((await aviso()) === null, "y el aviso se quita");
  if (fallos) console.log(`      lo que le llegó al Claude de mentira: ${JSON.stringify(existsSync(recibido) ? readFileSync(recibido, "utf8") : "")}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
