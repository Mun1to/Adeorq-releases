// Compactar a tiempo, en una Adeorq aislada y con un Claude de mentira.
//
// Munir, 2026-10-22: «que sea casi obligatorio compactar en ese rango», y el
// mismo día (D7) las rayas por TOKENS: 300k avisa, 400k compacta, 600k ofrece
// una terminal nueva. La lógica la pasa entera `pnpm bancos contexto`; esto
// mira lo que el banco no ve: que el panel de verdad lee los tokens de un
// transcript en disco (Opus: ventana de un millón), pinta el aviso que toca, y
// teclea `/fin` y `/compact` en el PTY solo cuando debe.
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
// Tarda unos tres minutos: el panel relee el transcript cada veinte segundos.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
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
// Con qué nació: la terminal nueva de «Nueva con traspaso» trae ahí su primer mensaje.
appendFileSync(join(aqui, "argumentos.log"), JSON.stringify(process.argv.slice(2)) + "\\n");
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

// La carpeta del Claude de mentira va delante en el PATH de la app: así la
// terminal que abre «Nueva con traspaso» (un `claude …` de verdad en la línea)
// es otro Claude de mentira y no el CLI. Es la misma ruta que `abrirAislada`
// da a su casa; en Windows la variable se llama `Path`, y se respeta.
const clavePath = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const falsoDe = join(tmpdir(), `adeorq-compactar-${process.pid}`, "falso");
const a = await abrirAislada({
  nombre: "compactar",
  puertoMcp: 47_000 + (process.pid % 900),
  depurar: 9750 + (process.pid % 100),
  exe: EXE,
  fotos,
  entorno: { [clavePath]: `${falsoDe};${process.env[clavePath] ?? ""}` },
});
try {
  const falso = join(a.base, "falso");
  if (falso !== falsoDe) throw new Error(`la casa no es la esperada: ${a.base}`);
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
  const linea = (k, estado, texto = "Hecho.") =>
    JSON.stringify({
      type: "assistant",
      cwd: a.demo,
      sessionId: SID,
      message: {
        model: "claude-opus-5-5",
        role: "assistant",
        content: estado === "a_medias" ? [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pnpm build" } }] : [{ type: "text", text: texto }],
        usage: { input_tokens: k * 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }) + "\n";
  const escribir = (k, estado) => appendFileSync(transcript, linea(k, estado));
  writeFileSync(transcript, linea(350, "lista"));

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

  /** El aviso del primer panel, o del panel `id`. */
  const aviso = (id) =>
    a.v.js(`(() => {
      const w = document.querySelector(${JSON.stringify(id ? `[data-pane-id="${id}"] .pane-ctx-warn` : "[data-pane-id] .pane-ctx-warn")});
      if (!w) return "null";
      return JSON.stringify({ nivel: w.dataset.nivel, fase: w.dataset.fase, grave: w.dataset.grave, deMas: w.dataset.deMas, texto: w.querySelector("span")?.textContent ?? "", botones: [...w.querySelectorAll("button")].map((b) => b.textContent.trim()) });
    })()`).then((x) => JSON.parse(x ?? "null"));
  const foto = async (nombre) => {
    const r = await a.v.js(`(() => { const p = document.querySelector("[data-pane-id]"); const w = p?.querySelector(".pane-ctx-warn"); if (!p) return "null"; const a = p.getBoundingClientRect(); const b = (w ?? p.querySelector(".pane-head")).getBoundingClientRect(); return JSON.stringify({ x: a.x, y: a.y, width: a.width, height: b.bottom - a.y + 14 }); })()`).then((x) => JSON.parse(x ?? "null"));
    if (r) console.log(`      foto: ${await a.foto(r, `compactar-${nombre}.png`)}`);
  };
  const campana = async () => {
    writeFileSync(join(falso, "campana"), "");
    await dormir(4500);
  };

  // ── 300k: el aviso con Compactar (el 35 % de un millón: antes no avisaba) ─
  let w = await hasta(aviso, 25_000, 500);
  dice(w?.nivel === "1" && w?.grave === "false" && /350k tokens/.test(w?.texto ?? ""), "a 350k sale el aviso ámbar, dicho en tokens", JSON.stringify(w));
  dice(!!w?.botones.includes("Compactar") && w?.botones.includes("×"), "con Compactar y su ×", JSON.stringify(w?.botones));
  await foto("300k");
  await campana();
  dice(ordenes().length === 0, "a 350k la campana no teclea nada", JSON.stringify(ordenes()));

  // ── 400k con «Avisar y esperar al botón»: fijo, sin ×, y nada solo ───────
  await a.v.js(`localStorage.setItem("adeorq-compactar-solo", "no"); "ok"`);
  escribir(420, "lista");
  w = await hasta(async () => ((await aviso())?.nivel === "2" ? aviso() : null), 30_000, 1000);
  dice(w?.grave === "true" && /compacta ya/.test(w?.texto ?? ""), "a 420k el aviso pasa a rojo y dice que compactes", JSON.stringify(w));
  dice(!!w && !w.botones.includes("×") && w.botones.includes("Ahora no"), "sin ×: solo «Ahora no» lo quita", JSON.stringify(w?.botones));
  await foto("400k-sin-solo");
  await campana();
  dice(ordenes().length === 0, "con el modo «no» la campana no teclea nada", JSON.stringify(ordenes()));

  // ── 400k de fábrica (Munir, A1: solo y sin commits), a mitad de una tarea ─
  await a.v.js(`localStorage.removeItem("adeorq-compactar-solo"); "ok"`);
  escribir(420, "a_medias");
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
  escribir(420, "lista");
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
  escribir(420, "a_medias");
  await campana();
  dice(ordenes().length === 1, "un permiso a mitad del /fin no suelta el /compact", JSON.stringify(ordenes()));
  escribir(430, "lista");
  await campana();
  const o = ordenes();
  dice(o.length === 2 && /^\/compact Conserva el estado real del repo/.test(o[1]), "al acabar el /fin, el /compact con qué conservar", JSON.stringify(o));

  // ── Compactó: el aviso se va, y vuelve en la subida siguiente ────────────
  appendFileSync(transcript, JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 630_000, postTokens: 30_000 } }) + "\n");
  w = await hasta(async () => ((await aviso()) === null ? "fuera" : null), 30_000, 1000);
  dice(w === "fuera", "tras compactar (30k) el aviso se va");
  escribir(610, "lista");
  w = await hasta(async () => ((await aviso())?.nivel === "3" ? aviso() : null), 30_000, 1000);
  dice(w?.nivel === "3" && w?.botones.includes("Nueva con traspaso"), "y vuelve en la subida siguiente (610k, el 61 %), con Nueva con traspaso", JSON.stringify(w));
  await foto("600k");
  dice((await a.v.js(`document.querySelector("[data-pane-id] .pane-ctx")?.dataset.hot ?? ""`)) === "true", "y la píldora de la cabecera se pone al rojo a la vez (antes, al 80 %)");

  // ── «Ahora no» lo para ───────────────────────────────────────────────────
  await a.v.js(`[...document.querySelectorAll("[data-pane-id] .pane-ctx-warn button")].find((b) => b.textContent.trim() === "Ahora no")?.click(); "ok"`);
  await dormir(500);
  await campana();
  dice(ordenes().length === 2, "con «Ahora no» la campana ya no teclea nada", JSON.stringify(ordenes()));
  dice((await aviso()) === null, "y el aviso se quita");

  // ── Ya compactada dos veces: ofrece una terminal nueva (Munir, D4) ───────
  const viejo = await a.v.js(`document.querySelector("[data-pane-id]")?.dataset.paneId ?? ""`);
  const pulsar = (id, texto) =>
    a.v.js(`[...document.querySelectorAll('[data-pane-id="${id}"] .pane-ctx-warn button')].find((b) => b.textContent.trim() === ${JSON.stringify(texto)})?.click(); "ok"`);
  appendFileSync(transcript, JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "auto", preTokens: 820_000, postTokens: 30_000 } }) + "\n");
  // El aviso ya estaba quitado («Ahora no»): se espera a que el panel LEA la
  // compactación (por debajo de los 300k: su cabecera, de un millón, bajo el 30 %), que es lo que olvida lo visto.
  const pildora = () => a.v.js(`document.querySelector('[data-pane-id="${viejo}"] .ctx-bar')?.parentElement?.textContent?.trim() ?? ""`);
  w = await hasta(async () => (parseInt(await pildora(), 10) < 30 ? "leida" : null), 35_000, 1000);
  dice(w === "leida", "el panel lee la segunda compactación (por debajo de los 300k)", await pildora());
  escribir(440, "lista");
  w = await hasta(async () => {
    const x = await aviso();
    return x?.nivel === "2" && x?.deMas === "true" ? x : null;
  }, 35_000, 1000);
  dice(/ya compactada 2 veces/.test(w?.texto ?? "") && !!w?.botones.includes("Nueva con traspaso"), "a 440k y compactada dos veces, ofrece una terminal nueva", JSON.stringify(w));
  await foto("dos-veces");
  await campana();
  dice(ordenes().length === 2, "y la campana NO compacta una tercera vez", JSON.stringify(ordenes()));
  await pulsar(viejo, "Nueva con traspaso");
  const tras = await hasta(() => (ordenes().length === 3 ? ordenes() : null), 8000, 300);
  dice(tras?.[2] === "/fin", "con su clic va el /fin (el entero: lo ha pulsado él)", JSON.stringify(ordenes()));
  // Lo que contesta el /fin: largo, como el de verdad (más de los 4.000
  // caracteres que `last_reply` da de fábrica), con el «Retomar» al final.
  const resumen = Array.from({ length: 80 }, (_, i) => `${i + 1}. Paso hecho con su ruta, C:\\proyectos\\demo\\fichero-${i}.ts, y su porqué.`).join("\n");
  const respuestaFin = `**Cerrado.**\n\n## Resumen de la sesión\n${resumen}\n\n## Mensaje de compactación\n\`\`\`\n# COMPACTACIÓN, demo\n- nada\n\`\`\`\n\n## Retomar la sesión\n\`\`\`\n# RETOMAR, demo (guardado el 2026-10-22)\n\nRetomo esto. Antes de proponer nada:\n\n- Carpeta: ${a.demo}. Lee su AGENTS.md y su BUZON.md.\n\`\`\`\n\nTodo sincronizado.`;
  appendFileSync(transcript, linea(440, "lista", respuestaFin));
  await campana();
  const argumentos = join(falso, "argumentos.log");
  const nueva = await hasta(() => {
    const l = existsSync(argumentos) ? readFileSync(argumentos, "utf8").split("\n").filter(Boolean) : [];
    return l.length >= 2 ? l[l.length - 1] : null;
  }, 25_000, 400);
  dice(/# RETOMAR, demo/.test(nueva ?? ""), "al acabar el /fin nace la terminal nueva con el bloque «Retomar» de primer mensaje", nueva ?? "no nació");
  dice(!!(await hasta(() => a.v.js(`document.querySelectorAll("[data-pane-id]").length === 2 || null`), 10_000, 400)), "y está en la Cabina, al lado de la vieja");
  const rastros = join(a.base, "datos", "Adeorq", "rastros");
  const conRastro = await hasta(() => existsSync(rastros) && readdirSync(rastros).some((f) => readFileSync(join(rastros, f), "utf8").includes(SID)), 8000, 300);
  dice(!!conRastro, "la vieja deja su rastro, con su conversación, para que la barra la archive");
  w = await aviso(viejo);
  dice(w?.fase === "relevada" && !!w?.botones.includes("Cerrar esta"), "y su aviso ofrece cerrarla", JSON.stringify(w));
  dice(ordenes().length === 3, "sin /compact en la vieja", JSON.stringify(ordenes()));
  await foto("relevada");
  await pulsar(viejo, "Cerrar esta");
  dice(!!(await hasta(() => a.v.js(`(!document.querySelector('[data-pane-id="${viejo}"]') && document.querySelectorAll("[data-pane-id]").length === 1) || null`), 10_000, 400)), "con su clic se cierra la vieja y la nueva sigue");
  if (fallos) console.log(`      lo que le llegó al Claude de mentira: ${JSON.stringify(existsSync(recibido) ? readFileSync(recibido, "utf8") : "")}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
