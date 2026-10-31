// El tope de contexto de las terminales que abre un agente, con el puente de
// verdad contra una Adeorq aislada y Claudes de mentira.
//
// «Orquio General», 2026-10-22 (BUZON): sus seis delegadas de ese día acabaron
// entre 588k y 832k tokens. Lo que se pidió y se mira aquí, por el MCP:
//   1. `get_active_panes` dice los tokens de cada terminal y qué hacer;
//   2. `send_command` no manda trabajo nuevo a una que pasa de 300k sin
//      `confirm: true`, y avisa cuando lo manda;
//   3. a quien la abrió se le avisa una vez al cruzar los 400k, y la delegada
//      se compacta sola a su campana (`/fin sin commits` y `/compact`) aunque
//      el ajuste de Munir diga «no»; la de Munir, con «no», no;
//   4. `close_pane` y `open_pane` dicen el contexto;
//   5. `compactar_terminal` espera a que pare (transcript y pantalla), y no
//      toca las terminales de Munir.
//
// Y lo que vio la revisión de `1954cf0` (2026-10-30), que son caminos por los
// que tecleaba donde no debía:
//   R1. un Codex con «claude» en su encargo no se toma por Claude Code, aunque
//       la conversación más reciente de la carpeta pase de 400k;
//   R3. tras un `/clear` (o con Claude Code cerrado) la conversación de antes
//       ya no cuenta: ni en la lista, ni para retener, ni para compactar;
//   R4. contestar a una pregunta suya no es trabajo nuevo;
//   R5. el aviso a quien la abrió no se repite rondando la raya.
//
// Cada «Claude» es un script de node que se llama `claude.cmd` (la app lo toma
// por Claude Code, y está delante en el PATH de la app, así que la delegada
// que abre `open_pane` también es uno). Sabe qué conversación es por su
// `--session-id`, apunta en `recibido-<id>.log` cada línea que le teclean y
// toca la campana o pinta su pie de turno cuando aparece el fichero que toca.
// Como el de verdad (2.1.314), pinta su caja entre dos rayas y se apunta en
// `~/.claude/sessions/<pid>.json` mientras corre; con `clear-<id>` pasa ese
// registro a otra conversación, como `/clear`, y con `salir-<id>` lo borra y
// sale, y queda el PowerShell. El Codex de mentira solo apunta y toca la
// campana. Los transcripts los escribe este guion. Ningún CLI de verdad,
// ninguna cuenta.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/tope-de-contexto-de-verdad.mjs
//
// Con `LAB_TERMINALES_APARTE=1` delante, las terminales van en su proceso
// aparte, como en la Adeorq publicada de Windows (`aislada.mjs`).
//
// Tarda un par de minutos. Sale con 1 si algo falla.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${String(detalle).slice(0, 400)})` : ""}`);
};

const SID_M = "5e55a1d2-6c0a-4b1e-9a77-0c0ffee00030";
const CLAUDE_FALSO = `import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const i = a.findIndex((x) => x === "--session-id" || x === "--resume");
const sid = i >= 0 ? a[i + 1] : "sin";
appendFileSync(join(aqui, "argumentos.log"), JSON.stringify(a) + "\\n");
const registro = join(process.env.USERPROFILE ?? "", ".claude", "sessions", process.pid + ".json");
const apuntar = (id) => {
  mkdirSync(dirname(registro), { recursive: true });
  writeFileSync(registro, JSON.stringify({ pid: process.pid, sessionId: id, cwd: process.cwd(), kind: "interactive" }));
};
apuntar(sid);
const RAYA = "─".repeat(50);
const caja = "\\r\\n" + RAYA + "\\r\\n❯ \\r\\n" + RAYA + "\\r\\n  ? for shortcuts";
process.stdout.write("Claude de mentira: apunto lo que me tecleen." + caja);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let linea = "";
process.stdin.on("data", (b) => {
  for (const ch of b.toString("utf8")) {
    if (ch === "\\r" || ch === "\\n") {
      const limpia = linea.replace(/\\x1b\\[[0-9;?]*[A-Za-z~]/g, "").replace(/[\\x00-\\x1f]/g, "");
      if (limpia) appendFileSync(join(aqui, "recibido-" + sid + ".log"), limpia + "\\n");
      linea = "";
      process.stdout.write(caja);
    } else linea += ch;
  }
});
const pinta = { campana: "\\x07", trabajando: "\\r\\n* Pensando... (esc to interrupt)\\r\\n", quieto: "\\x1b[2J\\x1b[H" + caja.slice(2) };
setInterval(() => {
  for (const [f, texto] of Object.entries(pinta)) {
    const r = join(aqui, f + "-" + sid);
    if (!existsSync(r)) continue;
    rmSync(r, { force: true });
    process.stdout.write(texto);
  }
  if (existsSync(join(aqui, "clear-" + sid))) {
    rmSync(join(aqui, "clear-" + sid), { force: true });
    apuntar(randomUUID());
  }
  if (existsSync(join(aqui, "salir-" + sid))) {
    rmSync(join(aqui, "salir-" + sid), { force: true });
    rmSync(registro, { force: true });
    process.exit(0);
  }
}, 150);
`;
const CODEX_FALSO = `import { appendFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
process.stdout.write("Codex de mentira: apunto lo que me tecleen.\\r\\n› ");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let linea = "";
process.stdin.on("data", (b) => {
  for (const ch of b.toString("utf8")) {
    if (ch === "\\r" || ch === "\\n") {
      const limpia = linea.replace(/\\x1b\\[[0-9;?]*[A-Za-z~]/g, "").replace(/[\\x00-\\x1f]/g, "");
      if (limpia) appendFileSync(join(aqui, "recibido-codex.log"), limpia + "\\n");
      linea = "";
      process.stdout.write("\\r\\n› ");
    } else linea += ch;
  }
});
setInterval(() => {
  const r = join(aqui, "campana-codex");
  if (!existsSync(r)) return;
  rmSync(r, { force: true });
  process.stdout.write("\\x07");
}, 150);
`;

const clavePath = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const falsoDe = join(tmpdir(), `adeorq-tope-${process.pid}`, "falso");
const a = await abrirAislada({
  nombre: "tope",
  puertoMcp: 46_000 + (process.pid % 900),
  depurar: 9650 + (process.pid % 100),
  exe: EXE,
  entorno: { [clavePath]: `${falsoDe};${process.env[clavePath] ?? ""}` },
});
try {
  const falso = join(a.base, "falso");
  if (falso !== falsoDe) throw new Error(`la casa no es la esperada: ${a.base}`);
  mkdirSync(falso, { recursive: true });
  writeFileSync(join(falso, "claude-falso.mjs"), CLAUDE_FALSO);
  writeFileSync(join(falso, "claude.cmd"), `@echo off\r\nnode "%~dp0claude-falso.mjs" %*\r\n`);
  writeFileSync(join(falso, "codex-falso.mjs"), CODEX_FALSO);
  writeFileSync(join(falso, "codex.cmd"), `@echo off\r\nnode "%~dp0codex-falso.mjs" %*\r\n`);
  mkdirSync(join(a.base, "casa", ".claude", "skills", "fin"), { recursive: true });
  writeFileSync(join(a.base, "casa", ".claude", "skills", "fin", "SKILL.md"), "---\nname: fin\ndescription: Cierre de sesión de prueba.\n---\n\nCierre.\n");

  /** Lo que le llegó tecleado a la conversación `sid`. */
  const recibido = (sid) => {
    const r = join(falso, `recibido-${sid}.log`);
    return existsSync(r) ? readFileSync(r, "utf8").split("\n").filter(Boolean) : [];
  };
  const ordenes = (sid) => recibido(sid).filter((l) => /^\/(fin|compact)\b/.test(l));
  const pintar = (f, sid) => {
    writeFileSync(join(falso, `${f}-${sid}`), "");
    return hasta(() => !existsSync(join(falso, `${f}-${sid}`)), 8000, 100);
  };
  /** La campana del turno, y lo que tarda el panel en asentar y leer. */
  const campana = async (sid) => {
    await pintar("campana", sid);
    await dormir(4500);
  };

  // Los transcripts, donde los busca Rust: `~/.claude/projects/<carpeta codificada>`.
  const dirT = join(a.base, "casa", ".claude", "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(dirT, { recursive: true });
  const linea = (sid, k, estado) =>
    JSON.stringify({
      type: "assistant",
      cwd: a.demo,
      sessionId: sid,
      message: {
        model: "claude-opus-5-5",
        role: "assistant",
        content:
          estado === "a_medias"
            ? [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pnpm build" } }]
            : [{ type: "text", text: estado === "ofrece" ? "Hecho. ¿Lo subo a la rama o lo dejo así?" : "Hecho." }],
        usage: { input_tokens: k * 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }) + "\n";
  const escribir = (sid, k, estado = "lista") => appendFileSync(join(dirT, `${sid}.jsonl`), linea(sid, k, estado));
  const compactada = (sid) =>
    appendFileSync(join(dirT, `${sid}.jsonl`), JSON.stringify({ type: "system", subtype: "compact_boundary", compactMetadata: { trigger: "manual", preTokens: 430_000, postTokens: 30_000 } }) + "\n");

  // La terminal de Munir: un Claude de mentira con 450k, y su ajuste en «no»
  // (que su terminal no se compacte sola). La delegada tiene que hacerlo igual.
  escribir(SID_M, 450);
  await a.v.js(`localStorage.setItem("adeorq-compactar-solo", "no"); localStorage.setItem("adeorq-layout", ${JSON.stringify(
    JSON.stringify({ panes: [{ name: "demo · claude", cwd: a.demo, command: ["cmd.exe", "/c", join(falso, "claude.cmd"), "--session-id", SID_M] }], cols: [{ w: 1, hs: [1], idx: [0] }], ocultos: [] }),
  )}); "ok"`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!document.querySelector("[data-pane-id]"); })()`), 30_000, 500);
  dice(!!(await hasta(() => existsSync(join(falso, "argumentos.log")), 20_000, 300)), "la terminal de Munir arranca su Claude de mentira");

  // El agente: el puente `--mcp` de verdad, como el panel 50.
  const yo = a.puente(50);
  await yo.pedir("initialize", { clientInfo: { name: "claude-code" } });
  /** Todo lo que contesta, no solo el primer trozo: el aviso va detrás. */
  const llamar = async (name, args = {}) => {
    const r = await yo.pedir("tools/call", { name, arguments: args });
    if (r.timeout) return { error: "sin respuesta en 15 s", texto: "" };
    if (r.error) return { error: r.error.message, texto: "" };
    return { texto: (r.result?.content ?? []).map((c) => c.text).join("\n"), isError: !!r.result?.isError };
  };
  const lineaDe = (texto, re) => (texto || "").split("\n").find((l) => re.test(l)) ?? "";

  // ── 1. La lista dice los tokens ─────────────────────────────────────────
  let lista = (await hasta(async () => {
    const t = (await llamar("get_active_panes")).texto;
    return lineaDe(t, new RegExp(SID_M)) ? t : null;
  }, 20_000, 500)) ?? "";
  const deMunir = lineaDe(lista, new RegExp(SID_M));
  const idM = Number(/^ID: (\d+)/.exec(deMunir)?.[1]);
  dice(/Contexto: 450\.000 tokens de 1\.000\.000 \(pasa de 400\.000: compáctala con compactar_terminal\(\d+\)/.test(deMunir), "get_active_panes dice los tokens de la terminal de Munir y qué hacer", deMunir);

  // ── 5a. Las de Munir no se compactan por el MCP ─────────────────────────
  const noDeMunir = await llamar("compactar_terminal", { paneId: idM });
  dice(/sin su\s+clic/.test(noDeMunir.error ?? ""), "compactar_terminal no toca una terminal de Munir", JSON.stringify(noDeMunir));

  // ── La delegada ─────────────────────────────────────────────────────────
  const abierta = await llamar("open_pane", { cli: "claude", cwd: a.demo, name: "Delegada", brief: "Prueba: espera órdenes." });
  const idD = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(abierta.texto)?.[1]);
  dice(Number.isFinite(idD) && idD > 0 && idD !== idM, "open_pane abre la delegada", abierta.error ?? abierta.texto);
  lista = (await hasta(async () => {
    const t = (await llamar("get_active_panes")).texto;
    return /--session-id [0-9a-f-]{36}/.test(lineaDe(t, new RegExp(`^ID: ${idD},`))) ? t : null;
  }, 20_000, 500)) ?? "";
  const SID_D = /--session-id ([0-9a-f-]{36})/.exec(lineaDe(lista, new RegExp(`^ID: ${idD},`)))?.[1];
  dice(!!SID_D, "la delegada nace con su --session-id", lineaDe(lista, new RegExp(`^ID: ${idD},`)));
  dice(!!(await hasta(() => recibido(SID_D).length >= 0 && readFileSync(join(falso, "argumentos.log"), "utf8").includes(SID_D), 20_000, 300)), "y es un Claude de mentira (el del PATH)");
  if (a.aparte) {
    const m = a.motor();
    dice(m.pid > 0 && m.terminales >= 2 && m.enLaApp === 0, "las dos terminales cuelgan del proceso aparte, ninguna de la app", JSON.stringify(m));
  }
  escribir(SID_D, 120);
  lista = (await llamar("get_active_panes")).texto;
  const deD = lineaDe(lista, new RegExp(`^ID: ${idD},`));
  dice(/Contexto: 120\.000 tokens de 1\.000\.000,/.test(deD) && !/pasa de/.test(deD), "a 120k la lista dice los tokens sin consejo", deD);

  // ── 2. send_command ─────────────────────────────────────────────────────
  let r = await llamar("send_command", { paneId: idD, command: "Primera tarea de prueba" });
  await dormir(800);
  dice(!r.isError && !/Ojo/.test(r.texto) && recibido(SID_D).includes("Primera tarea de prueba"), "a 120k send_command manda sin más", JSON.stringify(r));
  escribir(SID_D, 350);
  r = await llamar("send_command", { paneId: idD, command: "Segunda tarea grande" });
  await dormir(800);
  dice(r.isError && /no lo he mandado/.test(r.texto) && /350\.000/.test(r.texto) && /confirm: true/.test(r.texto), "a 350k el trabajo nuevo NO se manda, y dice por qué y cómo seguir", JSON.stringify(r));
  dice(!recibido(SID_D).includes("Segunda tarea grande"), "y no le llega", JSON.stringify(recibido(SID_D)));
  r = await llamar("send_command", { paneId: idD, command: "sí, sigue", confirm: true });
  await dormir(800);
  dice(!r.isError && /Ojo: lleva 350\.000 tokens/.test(r.texto) && recibido(SID_D).includes("sí, sigue"), "con confirm: true sí se manda, con el aviso", JSON.stringify(r));
  r = await llamar("send_command", { paneId: idD, command: "/status" });
  await dormir(800);
  dice(!r.isError && recibido(SID_D).includes("/status"), "una orden de barra pasa sin confirmar", JSON.stringify(r));
  // R4. Su turno acaba en una pregunta en prosa: contestarla no es trabajo nuevo.
  escribir(SID_D, 360, "ofrece");
  r = await llamar("send_command", { paneId: idD, command: "no, déjalo así" });
  await dormir(800);
  dice(!r.isError && recibido(SID_D).includes("no, déjalo así"), "R4: a 360k, contestar a su pregunta en prosa pasa sin confirm", JSON.stringify(r));

  // ── 3. El aviso a quien la abrió, una vez ───────────────────────────────
  escribir(SID_D, 420);
  r = await llamar("get_projects");
  dice(new RegExp(`Aviso de Adeorq: la terminal ${idD} que abriste .*420\\.000 tokens.*/fin sin commits`).test(r.texto), "a 420k, la siguiente llamada de quien la abrió lleva el aviso", r.texto);
  r = await llamar("get_projects");
  dice(!/Aviso de Adeorq/.test(r.texto), "y la siguiente ya no lo repite");
  // R5. Rondando la raya: baja a 390k y vuelve a 425k sin haber compactado.
  escribir(SID_D, 390);
  await llamar("get_projects");
  escribir(SID_D, 425);
  r = await llamar("get_projects");
  dice(!/Aviso de Adeorq/.test(r.texto), "R5: bajó a 390k y volvió a 425k: no se le repite el aviso", r.texto);
  const otro = a.puente(51);
  await otro.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const r51 = await otro.pedir("tools/call", { name: "get_projects", arguments: {} });
  dice(!JSON.stringify(r51).includes("Aviso de Adeorq"), "a otro agente no se le avisa de las que no abrió");

  // ── 3b. Se compacta sola a su campana; la de Munir («no»), no ────────────
  await campana(SID_M);
  dice(ordenes(SID_M).length === 0, "la terminal de Munir con su ajuste en «no» no se compacta sola", JSON.stringify(ordenes(SID_M)));
  await campana(SID_D);
  dice(JSON.stringify(ordenes(SID_D)) === JSON.stringify(["/fin sin commits"]), "la delegada a 420k manda /fin sin commits a su campana, aunque el ajuste diga «no»", JSON.stringify(ordenes(SID_D)));
  escribir(SID_D, 430);
  await campana(SID_D);
  let o = ordenes(SID_D);
  dice(o.length === 2 && /^\/compact Conserva el estado real del repo/.test(o[1]), "y al acabar el /fin, el /compact", JSON.stringify(o));
  compactada(SID_D);

  // ── 5b. compactar_terminal en una delegada ──────────────────────────────
  escribir(SID_D, 380, "a_medias");
  r = await llamar("compactar_terminal", { paneId: idD });
  dice(!r.error && /pedido\. Lleva 380\.000 tokens/.test(r.texto) && /\/fin sin commits/.test(r.texto), "compactar_terminal lo pide y dice lo que hará", JSON.stringify(r));
  r = await llamar("compactar_terminal", { paneId: idD });
  dice(/ya tenía un traspaso en marcha/.test(r.texto), "pedido dos veces, no empieza otro", JSON.stringify(r));
  await dormir(3000);
  dice(ordenes(SID_D).length === 2, "con herramientas en marcha no le teclea nada", JSON.stringify(ordenes(SID_D)));
  escribir(SID_D, 385);
  await pintar("trabajando", SID_D);
  await campana(SID_D);
  dice(ordenes(SID_D).length === 2, "con «esc to interrupt» en pantalla, aunque el transcript diga lista, tampoco", JSON.stringify(ordenes(SID_D)));
  await pintar("quieto", SID_D);
  await campana(SID_D);
  o = ordenes(SID_D);
  dice(o.length === 3 && o[2] === "/fin sin commits", "parada de verdad, /fin sin commits", JSON.stringify(o));
  escribir(SID_D, 390);
  await campana(SID_D);
  o = ordenes(SID_D);
  dice(o.length === 4 && /^\/compact /.test(o[3]), "y al acabar, /compact", JSON.stringify(o));

  // ── 4. open_pane y close_pane dicen el contexto ─────────────────────────
  const segunda = await llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Consola", brief: "" });
  const idS = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(segunda.texto)?.[1]);
  dice(new RegExp(`Tus otras terminales abiertas con open_pane: ${idD}: 390\\.000 tokens`).test(segunda.texto), "open_pane dice cuánto llevan las otras que ya abrió", segunda.texto);
  await hasta(async () => lineaDe((await llamar("get_active_panes")).texto, new RegExp(`^ID: ${idS},`)), 15_000, 500);
  const rastro = "Prueba del tope de contexto: no hizo nada de verdad, era un Claude de mentira. No queda nada pendiente.";
  r = await llamar("close_pane", { paneId: idD, rastro });
  dice(/Su contexto al cerrarla: 390\.000 tokens\./.test(r.texto), "close_pane dice con cuánto contexto acabó", r.error ?? r.texto);
  r = await llamar("close_pane", { paneId: idS, rastro });
  dice(!r.error && !/Su contexto/.test(r.texto), "una consola, sin transcript, no se inventa un número", r.error ?? r.texto);

  // ── R1. Un Codex con «claude» en su encargo no es Claude Code ───────────
  // La terminal de Munir pasa a ser la conversación más reciente de la
  // carpeta, cargada y parada: es la que leía un panel sin conversación sabida.
  escribir(SID_M, 455);
  const recibidoCodex = () => {
    const f = join(falso, "recibido-codex.log");
    return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : [];
  };
  const cdx = await llamar("open_pane", { cli: "codex", cwd: a.demo, name: "Codex", brief: "Revisa lo que dejó la sesión de claude, sin tocar su Claude Code." });
  const idC = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(cdx.texto)?.[1]);
  dice(Number.isFinite(idC) && idC > 0, "R1: open_pane abre un Codex (de mentira) con «claude» en su encargo", cdx.error ?? cdx.texto);
  await hasta(async () => lineaDe((await llamar("get_active_panes")).texto, new RegExp(`^ID: ${idC},`)), 15_000, 500);
  await dormir(3000);
  writeFileSync(join(falso, "campana-codex"), "");
  await hasta(() => !existsSync(join(falso, "campana-codex")), 8000, 100);
  await dormir(4500);
  dice(!recibidoCodex().some((l) => /^\/(fin|compact)\b/.test(l)), "R1: a su campana no se le teclea /fin, aunque la más reciente de la carpeta pase de 400k", JSON.stringify(recibidoCodex()));
  await llamar("close_pane", { paneId: idC, rastro });

  // ── R3. Tras un /clear, o con Claude Code cerrado, la de antes no cuenta ─
  const otra = await llamar("open_pane", { cli: "claude", cwd: a.demo, name: "Delegada 2", brief: "Prueba: espera órdenes." });
  const idE = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(otra.texto)?.[1]);
  lista = (await hasta(async () => {
    const t = (await llamar("get_active_panes")).texto;
    return /--session-id [0-9a-f-]{36}/.test(lineaDe(t, new RegExp(`^ID: ${idE},`))) ? t : null;
  }, 20_000, 500)) ?? "";
  const SID_E = /--session-id ([0-9a-f-]{36})/.exec(lineaDe(lista, new RegExp(`^ID: ${idE},`)))?.[1];
  dice(!!SID_E && !!(await hasta(() => readFileSync(join(falso, "argumentos.log"), "utf8").includes(SID_E), 20_000, 300)), "R3: otra delegada, con su Claude de mentira", otra.error ?? otra.texto);
  escribir(SID_E, 450);
  lista = (await llamar("get_active_panes")).texto;
  dice(/Contexto: 450\.000 tokens/.test(lineaDe(lista, new RegExp(`^ID: ${idE},`))), "R3: mientras corre, la lista le cuenta sus 450k", lineaDe(lista, new RegExp(`^ID: ${idE},`)));
  await llamar("get_projects"); // el aviso de su raya, para que no se pegue a lo de abajo
  await pintar("clear", SID_E);
  await dormir(500);
  lista = (await llamar("get_active_panes")).texto;
  dice(!/Contexto:/.test(lineaDe(lista, new RegExp(`^ID: ${idE},`))), "R3: tras el /clear, la lista ya no le cuenta los 450k de antes", lineaDe(lista, new RegExp(`^ID: ${idE},`)));
  r = await llamar("send_command", { paneId: idE, command: "Tarea tras el clear" });
  await dormir(800);
  dice(!r.isError && !/Ojo/.test(r.texto) && recibido(SID_E).includes("Tarea tras el clear"), "R3: y send_command no la retiene", JSON.stringify(r));
  await campana(SID_E);
  dice(ordenes(SID_E).length === 0, "R3: y a su campana no se compacta: los 450k son de la conversación de antes", JSON.stringify(ordenes(SID_E)));
  await pintar("salir", SID_E);
  await dormir(2500);
  r = await llamar("send_command", { paneId: idE, command: "# era el PowerShell que queda" });
  dice(!r.isError && !/no lo he mandado/.test(r.texto), "R3: con Claude Code cerrado y su PowerShell debajo, send_command no retiene", JSON.stringify(r));
  await llamar("close_pane", { paneId: idE, rastro });
  if (fallos) console.log(`      a la delegada le llegó: ${JSON.stringify(recibido(SID_D ?? "x"))}\n      a la de Munir: ${JSON.stringify(recibido(SID_M))}\n      a la segunda: ${JSON.stringify(recibido(SID_E ?? "x"))}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
