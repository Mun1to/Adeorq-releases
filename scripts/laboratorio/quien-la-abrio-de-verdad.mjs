// Las terminales que abre un agente, a través de un reinicio de Adeorq y al
// cerrarse, con el puente de verdad contra una Adeorq aislada y Claudes de
// mentira.
//
// La Suprema, 2026-10-30 (BUZON, fallos 2 y 3): tras reiniciar, sus delegadas
// salían sin «Abierta por» y en `acceptEdits` en vez de `auto`, y una que
// cerró Munir con la X desapareció sin rastro ni aviso. Lo que se mira aquí:
//   1. tras reiniciar, `get_active_panes` le dice a quien la abrió «Abierta
//      por: ti», la cabecera dice «de: …», vuelve en `auto` y se compacta sola
//      a los 400k como antes (`1954cf0`), y `close_pane` le sigue pidiendo rastro;
//   1b. con el proceso aparte, lo mismo tras una actualización, que no mata a
//      las terminales: siguen con su número y nadie las vuelve a abrir;
//   2. la que cierra Munir con la X deja su rastro, y `get_active_panes` y
//      `read_pane_screen` dicen cómo y cuándo se cerró;
//   3. lo mismo con la que se cierra con `close_pane`, la que sale sola (su
//      proceso termina) y la que no vuelve al reiniciar.
//
// Cada «Claude» es un script de node que se llama `claude.cmd`, delante en el
// PATH de la app: apunta sus argumentos y lo que le teclean, toca la campana y
// sale con código 3 cuando aparece el fichero que toca. Ningún CLI de verdad.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/quien-la-abrio-de-verdad.mjs [otro adeorq.exe]
//
// Con `LAB_TERMINALES_APARTE=1` delante, las terminales van en su proceso
// aparte, como en la Adeorq publicada de Windows (`aislada.mjs`).
//
// Tarda unos tres minutos. Sale con 1 si algo falla.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${String(detalle).slice(0, 500)})` : ""}`);
};

const SID_M = "5e55a1d2-6c0a-4b1e-9a77-0c0ffee00040";
// Como Claude Code, se apunta en ~/.claude/sessions/<pid>.json (sin eso su
// conversación no «corre» y nadie la compacta) y pinta su caja de entrada.
const CLAUDE_FALSO = `import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const i = a.findIndex((x) => x === "--session-id" || x === "--resume");
const sid = i >= 0 ? a[i + 1] : "sin";
appendFileSync(join(aqui, "argumentos.log"), JSON.stringify(a) + "\\n");
const registro = join(process.env.USERPROFILE ?? "", ".claude", "sessions", process.pid + ".json");
mkdirSync(dirname(registro), { recursive: true });
writeFileSync(registro, JSON.stringify({ pid: process.pid, sessionId: sid, cwd: process.cwd(), kind: "interactive" }));
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
setInterval(() => {
  const c = join(aqui, "campana-" + sid);
  if (existsSync(c)) {
    rmSync(c, { force: true });
    process.stdout.write("\\x07");
  }
  // Morirse con su terminal: el panel corre «cmd /k», que sigue vivo si solo
  // sale el CLI; esto es la caída de la terminal entera.
  if (existsSync(join(aqui, "salir-" + sid))) {
    rmSync(join(aqui, "salir-" + sid), { force: true });
    rmSync(registro, { force: true });
    try { process.kill(process.ppid); } catch {}
    process.exit(3);
  }
}, 150);
`;

const exe = process.argv[2] || EXE;
const clavePath = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const falsoDe = join(tmpdir(), `adeorq-quien-${process.pid}`, "falso");
const demoDe = join(tmpdir(), `adeorq-quien-${process.pid}`, "proyectos", "demo");
// Un encargo programado que toca nada más arrancar (el reloj de desarrollo mira
// a los 10 s y luego cada 30): su terminal también la abre un agente.
const PROGRAMADO = "Informe de prueba";
const a = await abrirAislada({
  nombre: "quien",
  puertoMcp: 47_000 + (process.pid % 900),
  depurar: 9750 + (process.pid % 100),
  exe,
  entorno: { [clavePath]: `${falsoDe};${process.env[clavePath] ?? ""}`, ADEORQ_PROGRAMADOS: "1" },
  sembrar: (datos) =>
    writeFileSync(
      join(datos, "programados.json"),
      JSON.stringify({
        version: 1,
        encargos: [
          { id: "pquien", nombre: PROGRAMADO, encargo: "Prueba programada: espera órdenes.", cwd: demoDe, cli: "claude", cuando: { tipo: "cada", horas: 1 }, activo: true, creado: Date.now() - 3_600_000 + 20_000, ultima: 0, ultimoDia: "", corrida: null, ultimas: [], fallosSeguidos: 0, cortado: null },
        ],
      }),
    ),
});
try {
  const falso = join(a.base, "falso");
  if (falso !== falsoDe) throw new Error(`la casa no es la esperada: ${a.base}`);
  mkdirSync(falso, { recursive: true });
  writeFileSync(join(falso, "claude-falso.mjs"), CLAUDE_FALSO);
  writeFileSync(join(falso, "claude.cmd"), `@echo off\r\nnode "%~dp0claude-falso.mjs" %*\r\n`);
  mkdirSync(join(a.base, "casa", ".claude", "skills", "fin"), { recursive: true });
  writeFileSync(join(a.base, "casa", ".claude", "skills", "fin", "SKILL.md"), "---\nname: fin\ndescription: Cierre de sesión de prueba.\n---\n\nCierre.\n");
  const rastros = join(a.base, "datos", "Adeorq", "rastros");

  /** Los argumentos de cada arranque de la conversación `sid`, en orden. */
  const arranques = (sid) =>
    existsSync(join(falso, "argumentos.log"))
      ? readFileSync(join(falso, "argumentos.log"), "utf8").split("\n").filter((l) => l.includes(sid)).map((l) => JSON.parse(l))
      : [];
  const modo = (args) => args[args.indexOf("--permission-mode") + 1];
  const recibido = (sid) => {
    const r = join(falso, `recibido-${sid}.log`);
    return existsSync(r) ? readFileSync(r, "utf8").split("\n").filter(Boolean) : [];
  };
  const tocar = (f, sid) => {
    writeFileSync(join(falso, `${f}-${sid}`), "");
    return hasta(() => !existsSync(join(falso, `${f}-${sid}`)), 8000, 100);
  };

  // Los transcripts, donde los busca Rust.
  const dirT = join(a.base, "casa", ".claude", "projects", a.demo.replace(/[^A-Za-z0-9]/g, "-"));
  mkdirSync(dirT, { recursive: true });
  const escribir = (sid, k) =>
    appendFileSync(
      join(dirT, `${sid}.jsonl`),
      JSON.stringify({
        type: "assistant",
        cwd: a.demo,
        sessionId: sid,
        message: { model: "claude-opus-5-5", role: "assistant", content: [{ type: "text", text: "Hecho." }], usage: { input_tokens: k * 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      }) + "\n",
    );

  // La madre: una terminal de Munir con su conversación, y su ajuste de
  // compactar en «no», que a una delegada no le afecta.
  escribir(SID_M, 20);
  await a.v.js(`localStorage.setItem("adeorq-compactar-solo", "no"); localStorage.setItem("adeorq-layout", ${JSON.stringify(
    JSON.stringify({ panes: [{ name: "demo · madre", cwd: a.demo, command: ["cmd.exe", "/c", join(falso, "claude.cmd"), "--permission-mode", "acceptEdits", "--session-id", SID_M] }], cols: [{ w: 1, hs: [1], idx: [0] }], ocultos: [] }),
  )}); "ok"`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  const enCabina = () =>
    hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!document.querySelector("[data-pane-id]"); })()`), 30_000, 500);
  await enCabina();

  /** Un agente presentándose como `panel`, con todo lo que contesta. */
  const agente = async (panel) => {
    const p = a.puente(panel);
    await p.pedir("initialize", { clientInfo: { name: "claude-code" } });
    const llamar = async (name, args = {}) => {
      const r = await p.pedir("tools/call", { name, arguments: args });
      if (r.timeout) return { error: "sin respuesta en 15 s", texto: "" };
      if (r.error) return { error: r.error.message, texto: "" };
      return { texto: (r.result?.content ?? []).map((c) => c.text).join("\n"), isError: !!r.result?.isError };
    };
    return { llamar };
  };
  const lineaDe = (texto, re) => (texto || "").split("\n").find((l) => re.test(l)) ?? "";
  /** Con el proceso aparte, que sus consolas cuelguen de él y ninguna de la app. */
  const enElMotor = (cuantas) => {
    if (!a.aparte) return;
    const m = a.motor();
    dice(m.pid > 0 && m.terminales >= cuantas && m.enLaApp === 0, `las ${cuantas} terminales cuelgan del proceso aparte, ninguna de la app`, JSON.stringify(m));
  };
  /** Su línea en la lista de las que ya no están (no la del panel que aún muere). */
  const cerradaDe = (texto, sid) => (sid ? (texto || "").split("\n").find((l) => l.startsWith("- ") && l.includes(sid)) ?? "" : "");
  /** El panel que corre la conversación `sid`, según `get_active_panes`. */
  const panelDe = async (quien, sid) => {
    const t = await hasta(async () => {
      const x = (await quien.llamar("get_active_panes")).texto;
      return lineaDe(x, new RegExp(`^ID: \\d+,.*${sid}`)) ? x : null;
    }, 30_000, 500);
    return { id: Number(/^ID: (\d+)/.exec(lineaDe(t, new RegExp(`^ID: \\d+,.*${sid}`)))?.[1]), lista: t ?? "" };
  };

  const mirón = await agente(null);
  const idM = (await panelDe(mirón, SID_M)).id;
  dice(idM > 0, "la madre arranca su Claude de mentira", idM);
  const madre = await agente(idM);

  /** Abre una delegada y devuelve su panel y su conversación. */
  const abrir = async (name) => {
    const r = await madre.llamar("open_pane", { cli: "claude", cwd: a.demo, name, brief: "Prueba: espera órdenes." });
    const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto)?.[1]);
    const t = await hasta(async () => {
      const x = (await madre.llamar("get_active_panes")).texto;
      return /--session-id [0-9a-f-]{36}/.test(lineaDe(x, new RegExp(`^ID: ${id},`))) ? x : null;
    }, 20_000, 500);
    const sid = /--session-id ([0-9a-f-]{36})/.exec(lineaDe(t, new RegExp(`^ID: ${id},`)))?.[1];
    return { id, sid };
  };
  const uno = await abrir("Delegada uno");
  const dos = await abrir("Delegada dos");
  const tres = await abrir("Delegada tres");
  dice(!!(uno.sid && dos.sid && tres.sid), "open_pane abre tres delegadas con su conversación", JSON.stringify({ uno, dos, tres }));
  enElMotor(4);
  dice(!!(await hasta(() => arranques(uno.sid).length, 15_000, 300)) && modo(arranques(uno.sid)[0]) === "auto", "una delegada nace en modo auto", JSON.stringify(arranques(uno.sid)));
  escribir(uno.sid, 30);
  escribir(dos.sid, 30);
  escribir(tres.sid, 30);
  const antes = (await madre.llamar("get_active_panes")).texto;
  dice(/Abierta por: ti/.test(lineaDe(antes, new RegExp(`^ID: ${uno.id},`))), "antes de reiniciar, «Abierta por: ti»", lineaDe(antes, new RegExp(`^ID: ${uno.id},`)));

  // La terminal del encargo programado: nadie hace clic en ella, así que para
  // el MCP también es de un agente.
  const deProgramado = (t) => lineaDe(t, /^ID: \d+,.*Prueba programada/);
  const lineaP = await hasta(async () => deProgramado((await madre.llamar("get_active_panes")).texto) || null, 120_000, 2000);
  const idP = Number(/^ID: (\d+)/.exec(lineaP ?? "")?.[1]);
  // Al reiniciar vuelve con `--resume` y sin el encargo: se la reconoce por su conversación.
  const sidP = /--session-id ([0-9a-f-]{36})/.exec(lineaP ?? "")?.[1] ?? "nada";
  dice(new RegExp(`Abierta por: el encargo programado «${PROGRAMADO}»`).test(lineaP ?? ""), "la terminal de un encargo programado dice quién la abrió", lineaP);
  const compactarP = await madre.llamar("compactar_terminal", { paneId: idP });
  dice(!/sin su\s+clic/.test(compactarP.error ?? compactarP.texto), "y compactar_terminal no la toma por una de Munir", JSON.stringify(compactarP));

  // «Se perdió al restaurar»: la tercera no vuelve, porque se quita del tablero
  // guardado justo antes de cerrar (el guardado solo se reescribe al cambiar
  // algo en la Cabina).
  await dormir(2500);
  await a.v.js(`(() => {
    const l = JSON.parse(localStorage.getItem("adeorq-layout"));
    const i = l.panes.findIndex((p) => (p.command || []).join(" ").includes(${JSON.stringify(tres.sid)}));
    l.panes.splice(i, 1);
    l.cols = l.cols.map((c) => ({ ...c, idx: c.idx.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)), hs: c.hs.filter((_, k) => c.idx[k] !== i) })).filter((c) => c.idx.length);
    localStorage.setItem("adeorq-layout", JSON.stringify(l));
    return "ok";
  })()`);
  await dormir(3000);

  // ── 1. Reiniciar ────────────────────────────────────────────────────────
  await a.reiniciar();
  await enCabina();
  let mirón2 = await agente(null);
  const idM2 = (await panelDe(mirón2, SID_M)).id;
  const id1 = (await panelDe(mirón2, uno.sid)).id;
  const id2 = (await panelDe(mirón2, dos.sid)).id;
  dice(idM2 > 0 && id1 > 0 && id2 > 0, "tras reiniciar vuelven la madre y dos delegadas", JSON.stringify({ idM2, id1, id2 }));
  enElMotor(3);
  let madre2 = await agente(idM2);
  let lista = (await madre2.llamar("get_active_panes")).texto;
  dice(/Abierta por: ti/.test(lineaDe(lista, new RegExp(`^ID: ${id1},`))), "tras reiniciar, a la madre le sigue diciendo «Abierta por: ti»", lineaDe(lista, new RegExp(`^ID: ${id1},`)));
  const otraVista = (await mirón2.llamar("get_active_panes")).texto;
  dice(new RegExp(`Abierta por: el panel ${idM2}\\b`).test(lineaDe(otraVista, new RegExp(`^ID: ${id1},`))), "y a otro, «Abierta por: el panel» de la madre con su número de ahora", lineaDe(otraVista, new RegExp(`^ID: ${id1},`)));
  const ultimo = arranques(uno.sid).at(-1) ?? [];
  dice(arranques(uno.sid).length >= 2 && modo(ultimo) === "auto", "vuelve en modo auto, como nació", JSON.stringify(ultimo));
  const de = await hasta(() => a.v.js(`document.querySelector('[data-pane-id="${id1}"] .pane-de')?.textContent ?? ""`), 8000, 300);
  dice(/de: /.test(de ?? ""), "su cabecera vuelve a decir «de: …»", de);
  const linea3 = cerradaDe(lista, tres.sid);
  dice(/no está abierta en este arranque/.test(linea3) && /Delegada tres/.test(linea3), "la que no volvió sale entre las que ya no están, con su nombre y su conversación", linea3 || lista);
  const lineaP2 = lineaDe(lista, new RegExp(`^ID: \\d+,.*${sidP}`));
  dice(new RegExp(`Abierta por: el encargo programado «${PROGRAMADO}»`).test(lineaP2), "la del encargo programado vuelve siendo suya", lineaP2 || lista);

  // ── 1b. Actualizar, con el proceso aparte ───────────────────────────────
  // La tarjeta de actualizar no se despide del proceso de terminales: siguen
  // vivas y la versión que vuelve las recoge con su número, sin abrir otra con
  // `--resume`. Es el reinicio de la Adeorq publicada de Munir; lo de abajo (el
  // tope, la X, la que sale sola) corre ya sobre las recogidas.
  if (a.aparte) {
    const motorAntes = a.motor().pid;
    const vecesUno = arranques(uno.sid).length;
    await a.reiniciar({ actualizando: true });
    await enCabina();
    mirón2 = await agente(null);
    const tras = { madre: (await panelDe(mirón2, SID_M)).id, uno: (await panelDe(mirón2, uno.sid)).id, dos: (await panelDe(mirón2, dos.sid)).id };
    const motorTras = a.motor().pid;
    dice(motorAntes > 0 && motorTras === motorAntes && tras.madre === idM2 && tras.uno === id1 && tras.dos === id2, "al actualizar, siguen en el mismo proceso de terminales y con su número", JSON.stringify({ motorAntes, motorTras, tras, antes: { madre: idM2, uno: id1, dos: id2 } }));
    dice(arranques(uno.sid).length === vecesUno, "y su Claude no se vuelve a abrir con --resume", JSON.stringify(arranques(uno.sid)));
    madre2 = await agente(idM2);
    lista = (await madre2.llamar("get_active_panes")).texto;
    dice(/Abierta por: ti/.test(lineaDe(lista, new RegExp(`^ID: ${id1},`))), "tras actualizar, a la madre le sigue diciendo «Abierta por: ti»", lineaDe(lista, new RegExp(`^ID: ${id1},`)));
    const deTras = await hasta(() => a.v.js(`document.querySelector('[data-pane-id="${id1}"] .pane-de')?.textContent ?? ""`), 8000, 300);
    dice(/de: /.test(deTras ?? ""), "y su cabecera, «de: …»", deTras);
    const lineaP3 = lineaDe(lista, new RegExp(`^ID: \\d+,.*${sidP}`));
    dice(new RegExp(`Abierta por: el encargo programado «${PROGRAMADO}»`).test(lineaP3), "y la del encargo programado sigue siendo suya", lineaP3 || lista);
  }

  // El tope de contexto de `1954cf0` sigue valiendo tras reiniciar: a los 400k,
  // a su campana, /fin sin commits aunque el ajuste de Munir diga «no».
  escribir(uno.sid, 420);
  await tocar("campana", uno.sid);
  await dormir(4500);
  dice(recibido(uno.sid).includes("/fin sin commits"), "tras reiniciar se compacta sola a los 400k", JSON.stringify(recibido(uno.sid)));
  const sinRastro = await madre2.llamar("close_pane", { paneId: id1 });
  dice(/Falta `rastro`/.test(sinRastro.error ?? ""), "y close_pane le sigue pidiendo su rastro", JSON.stringify(sinRastro));

  // ── 2. La X de Munir ────────────────────────────────────────────────────
  const antesX = existsSync(rastros) ? readdirSync(rastros).length : 0;
  await a.v.js(`document.querySelector('[data-pane-id="${id1}"] .pane-close')?.click(); "ok"`);
  const md = await hasta(() => {
    if (!existsSync(rastros)) return null;
    const f = readdirSync(rastros).map((n) => readFileSync(join(rastros, n), "utf8")).find((t) => t.includes(uno.sid));
    return f ?? null;
  }, 10_000, 300);
  dice(!!md && /la cerró Munir con la X/.test(md), "la X sobre una delegada restaurada deja su rastro", md ?? `rastros: ${antesX}`);
  lista = (await madre2.llamar("get_active_panes")).texto;
  const linea1 = cerradaDe(lista, uno.sid);
  dice(/Delegada uno/.test(linea1) && /a mano/.test(linea1) && /\d\d:\d\d/.test(linea1) && /rastro/.test(linea1), "get_active_panes dice que la cerró Munir a mano, cuándo y dónde está su rastro", linea1 || lista);
  const pantalla = await madre2.llamar("read_pane_screen", { paneId: id1 });
  dice(/a mano/.test(pantalla.error ?? pantalla.texto), "read_pane_screen de la cerrada dice cómo se cerró", JSON.stringify(pantalla));

  // ── 3. El proceso sale solo ─────────────────────────────────────────────
  await tocar("salir", dos.sid);
  const linea2 = await hasta(async () => lineaDe((await madre2.llamar("get_active_panes")).texto, new RegExp(`${dos.sid}.*salió`)), 15_000, 500);
  dice(/Delegada dos/.test(linea2 ?? "") && /con código \d+/.test(linea2 ?? ""), "la que se cae sola: su proceso salió, con su código", linea2);

  // ── 4. close_pane ───────────────────────────────────────────────────────
  const cuatro = await (async () => {
    const r = await madre2.llamar("open_pane", { cli: "claude", cwd: a.demo, name: "Delegada cuatro", brief: "Prueba." });
    return Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto)?.[1]);
  })();
  const sid4 = (await hasta(async () => /--session-id ([0-9a-f-]{36})/.exec(lineaDe((await madre2.llamar("get_active_panes")).texto, new RegExp(`^ID: ${cuatro},`)))?.[1], 20_000, 500)) ?? "";
  const cerrada = await madre2.llamar("close_pane", { paneId: cuatro, rastro: "Prueba de quién la abrió: no hizo nada de verdad, era un Claude de mentira. Nada pendiente." });
  dice(!cerrada.error, "close_pane cierra la cuarta con su rastro", JSON.stringify(cerrada));
  // Su PTY tarda un instante en irse del todo: hasta entonces aún sale como viva.
  const linea4 = (await hasta(async () => cerradaDe((await madre2.llamar("get_active_panes")).texto, sid4) || null, 10_000, 500)) ?? "";
  dice(/Delegada cuatro/.test(linea4) && /close_pane/.test(linea4) && new RegExp(`panel ${idM2}`).test(linea4), "get_active_panes dice que la cerró close_pane y quién", linea4 || `sid4=${sid4}`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
