// Conectar un bot con Adeorq, de punta a punta, en una Adeorq aislada y SIN mandar
// nada a ningún chat ni gastar modelo. Quien llama es «un programa cualquiera» (un
// socket de Node), el puente de Adeorq de verdad con su clave, y Hermes de verdad con
// un `HERMES_HOME` propio, que no toca el de Munir. OpenClaw no está instalado aquí:
// lo hace un `openclaw.cmd` de mentira que apunta sus argumentos.
//
// Lo que mira:
//   Fuera · lo que un programa de fuera alcanzaba sin clic:
//     · una flecha `auto` entre terminales del Lienzo le dejaba meter texto en otra;
//     · la respuesta de una decisión se tecleaba en la terminal que él dijera.
//   Hermes · con el botón de Ajustes de verdad:
//     · enseña lo que va a escribir, lo escribe sin tocar lo demás y deja una copia;
//     · el mismo agente en cada escalón, y lo que le llega y lo que no;
//     · con una clave mala o retirada no alcanza nada; diciendo llamarse «bot:hermes»
//       y sin clave, es lo de fuera;
//     · al desconectar deja de valer en el acto, también en la conexión abierta, sin
//       pasar a lo de fuera, y el archivo vuelve a como estaba, byte a byte;
//     · queda lo que hizo, sin el texto, y la clave no sale en ningún rastro.
//   OpenClaw · `openclaw mcp set` y `unset` con su JSON, y con su Gateway en marcha.
//   Grok Bot · `adeorq preguntar` con la línea que da Ajustes.
//   Sin Adeorq · un bot recibe un error claro.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/bots-conectar-de-verdad.mjs [exe]
//   LAB_FOTOS=<carpeta> deja las fotos de la sección y de la ventana.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const nombre = "bots-conectar";
const PUERTO = 39_531;
const DEPURAR = 9_533;
const FOTOS = process.env.LAB_FOTOS ?? tmpdir();
mkdirSync(FOTOS, { recursive: true });
let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `\n      ${String(detalle).slice(0, 400)}` : ""}`);
};

const HERMES_REAL = join(process.env.LOCALAPPDATA ?? "", "hermes", "hermes-agent", "venv", "Scripts");
const hermesExe = join(HERMES_REAL, "hermes.exe");

// Ningún CLI de la app aislada gasta cuota sin querer.
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY)$/i.test(k)) delete process.env[k];
}

// Lo que sobrevive a la aislada, que borra su carpeta al cerrar.
const fuera_de_la_aislada = mkdtempSync(join(tmpdir(), "adeorq-bots-conectar-"));
const exe = join(fuera_de_la_aislada, "adeorq.exe");
copyFileSync(process.argv[2] ?? EXE, exe);

// Un `claude` de mentira delante en el PATH: apunta un transcript con una respuesta de
// verdad, escribe en su pantalla algo que no se debe leer y toca la campana si se le pide.
const doble = join(fuera_de_la_aislada, "doble");
mkdirSync(doble, { recursive: true });
const MARCA = `MARCA-RELEVO-${process.pid}`;
const ENCARGO_SECRETO = `ENCARGO-SECRETO-${process.pid}`;
const PANTALLA_SECRETA = `PANTALLA-SECRETA-${process.pid}`;
writeFileSync(
  join(doble, "doble.mjs"),
  `import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const a = process.argv.slice(2);
const i = a.indexOf("--session-id");
const sid = i >= 0 ? a[i + 1] : "sin-id";
const dir = join(homedir(), ".claude", "projects", process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, sid + ".jsonl"), JSON.stringify({ type: "assistant", sessionId: sid, message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: ${JSON.stringify(MARCA)} }] } }) + "\\n");
console.log("ADEORQ-CLAUDE-DOBLE " + (process.env.ADEORQ_PANE_ID ?? "?"));
console.log(${JSON.stringify(PANTALLA_SECRETA)});
setInterval(() => {
  const f = join(${JSON.stringify(doble)}, "tocar-" + process.env.ADEORQ_PANE_ID);
  if (existsSync(f)) {
    rmSync(f, { force: true });
    process.stdout.write("\\x07");
  }
}, 200);
`,
);
writeFileSync(join(doble, "claude.cmd"), `@echo off\r\nnode "%~dp0doble.mjs" %*\r\n`);

// Un `openclaw` de mentira: apunta sus argumentos, y con «gateway-en-marcha» se niega.
writeFileSync(
  join(doble, "openclaw.mjs"),
  `import { appendFileSync, existsSync } from "node:fs";
appendFileSync(${JSON.stringify(join(doble, "openclaw.jsonl"))}, JSON.stringify(process.argv.slice(2)) + "\\n");
if (existsSync(${JSON.stringify(join(doble, "gateway-en-marcha"))})) {
  console.error("Refusing to change MCP configuration: stop the Gateway and retry.");
  process.exit(1);
}
`,
);
writeFileSync(join(doble, "openclaw.cmd"), `@echo off\r\nnode "%~dp0openclaw.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`);
const llamadasOpenclaw = () => {
  try {
    return readFileSync(join(doble, "openclaw.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// Un `config.yaml` como el de verdad: comentarios, saltos de Windows y ninguna lista de servidores.
const HERMES_HOME = join(fuera_de_la_aislada, "hermes");
mkdirSync(HERMES_HOME, { recursive: true });
const CONFIG = join(HERMES_HOME, "config.yaml");
const ORIGINAL = "# Hermes Agent CLI Configuration\r\n# Copy settings from this example\r\n\r\nmodel:\r\n  default: \"sin-modelo\"\r\n  # un comentario dentro\r\nterminal:\r\n  backend: local\r\n";
writeFileSync(CONFIG, ORIGINAL);

/** Una conexión cruda al puerto, como la abriría cualquier programa de este ordenador. */
async function cliente(quien, primeras = []) {
  const s = connect(PUERTO, "127.0.0.1");
  await new Promise((bien, mal) => {
    s.once("connect", bien);
    s.once("error", mal);
  });
  let buf = "";
  const pend = new Map();
  s.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!l) continue;
      try {
        const m = JSON.parse(l);
        pend.get(m.id)?.(m);
      } catch {}
    }
  });
  for (const p of primeras) s.write(JSON.stringify(p) + "\n");
  let n = 0;
  const pedir = (method, params, ms = 15_000) =>
    new Promise((bien) => {
      const id = ++n;
      pend.set(id, bien);
      s.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => bien({ error: { message: `sin respuesta en ${ms / 1000} s` } }), ms);
    });
  await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: quien, version: "9.9.9" } });
  s.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const llamar = async (name, args = {}, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  const herramientas = async () => ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name).sort();
  return { llamar, herramientas, cerrar: () => s.destroy() };
}

/** El puente de Adeorq de verdad, como lo lanza un bot: con su clave en el entorno. */
function puenteBot(env, clave) {
  const suyo = { ...env, ...(clave ? { ADEORQ_BOT_CLAVE: clave } : {}) };
  delete suyo.ADEORQ_PANE_ID;
  delete suyo.ADEORQ_PANE_CLAVE;
  const p = spawn(exe, ["--mcp"], { env: suyo });
  let buf = "";
  const pend = new Map();
  const avisos = [];
  let salio = null;
  p.on("exit", (c) => (salio = c));
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!l) continue;
      try {
        const m = JSON.parse(l);
        if (m.method) avisos.push(m.method);
        else pend.get(m.id)?.(m);
      } catch {}
    }
  });
  let n = 0;
  const pedir = (method, params, ms = 15_000) =>
    new Promise((bien) => {
      const id = ++n;
      pend.set(id, bien);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => bien({ error: { message: `sin respuesta en ${ms / 1000} s` } }), ms);
    });
  const llamar = async (name, args = {}, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.map((c) => c.text).join("\n") ?? "" };
  };
  const herramientas = async () => ((await pedir("tools/list", {})).result?.tools ?? []).map((t) => t.name).sort();
  const iniciar = () => pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "hermes", version: "0.19.0" } });
  return { pedir, llamar, herramientas, iniciar, avisos, salio: () => salio, cerrar: () => p.kill() };
}

const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const corto = (r) => (r.error ?? r.texto ?? "").replace(/\s+/g, " ").slice(0, 200);
const RASTRO = "Laboratorio de bots: esta terminal se abrió para medir lo que alcanza quien llama desde fuera de Adeorq, y no deja nada.";

const a = await abrirAislada({
  nombre,
  fueraConTodo: false,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe,
  fotos: FOTOS,
  entorno: { PATH: `${doble};${HERMES_REAL};${process.env.PATH}`, HERMES_HOME },
});
const claves = [];
try {
  const { v, demo, env } = a;
  const hermes = (...args) => spawnSync(hermesExe, args, { env: { ...env, HERMES_HOME }, encoding: "utf8", timeout: 90_000 });
  const invocar = (orden, args = {}) =>
    v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(orden)}, ${JSON.stringify(args)}).then((r) => JSON.stringify({ ok: r }), (e) => JSON.stringify({ mal: String(e) }))`).then((s) => JSON.parse(s));

  // ════ Fuera · lo que un programa de fuera alcanza sin clic ════════════════
  console.log("\n── Fuera · lo que alcanza sin clic");
  // Las flechas solo existen en el Lienzo: las terminales tienen que nacer allí.
  ok(!!(await hasta(() => v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Lienzo/.test(x.textContent ?? "")); t?.click(); return !!t && !!document.querySelector(".react-flow"); })()`), 20_000, 500)), "el Lienzo está a la vista");
  // En «Leer y abrir»: aquí se mide lo que alcanza con flechas y decisiones, que de
  // fábrica ya no le llegan (A1, en `seguridad-local-de-verdad.mjs`), y la lista con
  // los comandos es como este laboratorio ve en qué modo nace una terminal.
  await invocar("mcp_clientes_poner", { nombre: "fuera", nivel: "plan" });
  const fuera = await cliente("un-programa");
  const origen = numero(await fuera.llamar("open_pane", { cli: "claude", cwd: demo, name: "Origen" }));
  const destino = numero(await fuera.llamar("open_pane", { cli: "shell", cwd: demo, name: "Destino" }));
  ok(origen > 0 && destino > 0, `abre dos terminales sin encargo (${origen} y ${destino})`);
  // Sin saltos de línea: una marca larga puede partirse en dos renglones. Es la sospecha
  // de un rojo que salió una vez en «con ese clic…», sin detalle y sin repetirse.
  const pantalla = async (id) => ((await fuera.llamar("read_pane_screen", { paneId: id })).texto ?? "").replace(/\r?\n/g, "");
  ok(!!(await hasta(async () => /ADEORQ-CLAUDE-DOBLE/.test(await pantalla(origen)), 20_000, 500)), "el doble de Claude arranca en la de origen");
  await hasta(async () => (await pantalla(destino)).trim().length > 0, 15_000, 500);

  // La flecha `auto`: cuando el de origen acaba su turno, su respuesta se teclea en el destino.
  const flecha = await fuera.llamar("link_panes", { from: origen, to: destino, auto: true });
  console.log(`      link_panes contesta: ${corto(flecha)}`);
  writeFileSync(join(doble, `tocar-${origen}`), "");
  const entro = await hasta(async () => (await pantalla(destino)).includes(MARCA), 12_000, 500);
  ok(!entro, "una flecha `auto` pedida desde fuera NO mete texto en otra terminal sin un clic", "la respuesta del agente de origen entró sola en la terminal de destino");
  const enBarra = await v.js(`[...document.querySelectorAll(".relay-bar .relay")].map((r) => r.textContent.trim()).join(" | ")`);
  ok(!entro && /Destino/.test(enBarra ?? ""), "se queda esperando su clic en la barra de relevos", enBarra ?? "");
  await v.js(`document.querySelector(".relay-bar .relay-btn")?.click(), "ok"`);
  ok(!!(await hasta(async () => (await pantalla(destino)).includes(MARCA), 12_000, 500)), "con ese clic, la respuesta llega a la terminal de destino", (await pantalla(destino)).slice(-300));

  // Una decisión con `paneId`: lo que elijas se teclea en esa terminal, y las opciones las puso él.
  const otro = await cliente("otro-programa");
  const ajena = numero(await otro.llamar("open_pane", { cli: "shell", cwd: demo, name: "Ajena" }));
  otro.cerrar();
  const decidir = (paneId) =>
    fuera.llamar("ask_decision", {
      title: "¿Seguimos?",
      paneId,
      questions: [{ title: "¿Seguimos?", options: [{ text: `echo ${MARCA}-DECISION` }, { text: "No" }] }],
    });
  await fuera.llamar("get_active_panes");
  const contraAjena = await decidir(ajena);
  ok(!!contraAjena.error, "una decisión pedida desde fuera NO se teclea en una terminal que no abrió él", corto(contraAjena));
  const contraSuya = await decidir(destino);
  ok(!contraSuya.error, "en una que abrió él, sí", corto(contraSuya));
  const tercero = await cliente("tercer-programa");
  await tercero.llamar("get_active_panes");
  const cierreRaro = await tercero.llamar("close_pane", { paneId: 2 ** 32 + ajena, rastro: RASTRO });
  ok(!!cierreRaro.error && /Ajena/.test((await tercero.llamar("get_active_panes")).texto ?? ""), "un programa de fuera no cierra una ajena con 2^32 más su número", corto(cierreRaro));
  tercero.cerrar();
  const alCerrar = await fuera.llamar("close_pane", { paneId: origen, rastro: RASTRO });
  ok(!alCerrar.error, "cierra lo que abrió, para dejar sitio");
  // Lo cerrado deja de contar en el acto, y las de otro programa no son las tuyas.
  ok(/Siguen abiertas 1 tuyas\. Entre todos los agentes hay 2 abiertas/.test(alCerrar.texto ?? ""), "y dice cuántas son suyas y cuántas hay entre todos, sin contar la que acaba de cerrar", alCerrar.texto);

  // ════ Hermes · con el botón de Ajustes ═══════════════════════════════════
  console.log("\n── Hermes · conectar con el botón de Ajustes");
  const abrirBots = async () => {
    await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
    await dormir(900);
    await v.js(`(() => { const b = [...document.querySelectorAll(".set-tab")].find((x) => x.querySelector(".set-tab-nom")?.textContent.trim() === "Bots"); if (b && !b.hasAttribute("data-on")) b.click(); return !!b; })()`);
    await dormir(700);
  };
  const enBot = (bot) => `.bot-conexion[data-bot="${bot}"]`;
  // Una terminal que nace se lleva la vista: antes de tocar la sección, se vuelve a ella.
  const aLaSeccion = async (bot) => {
    if (!(await v.js(`!!document.querySelector(${JSON.stringify(enBot(bot))})?.offsetParent`))) await abrirBots();
  };
  const pulsar = async (bot, texto) => {
    await aLaSeccion(bot);
    return v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(enBot(bot) + " button")})].find((x) => x.textContent.trim() === ${JSON.stringify(texto)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
  };
  const textoDe = async (bot) => {
    await aLaSeccion(bot);
    return v.js(`document.querySelector(${JSON.stringify(enBot(bot))})?.innerText ?? ""`);
  };
  const foto = async (archivo) => {
    const r = await v.enviar("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(FOTOS, `${archivo}.png`), Buffer.from(r.data, "base64"));
  };
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await abrirBots();
  const seccion = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
  ok(/Conectar un bot/.test(seccion) && /Conectar Hermes/.test(seccion) && /Conectar OpenClaw/.test(seccion) && /Darle una clave/.test(seccion), "Ajustes › Bots ofrece conectar los tres", seccion.slice(0, 300));
  await foto("conectar-es-1920-sin-conectar");
  // Quien abre Ajustes y no conecta nada no lanza a Hermes: `hermes config path` tarda
  // segundos y deja su carpeta `logs`. Lo que se refresca cada 6 s tampoco, y su aviso de
  // actualizaciones (`.update_check`) ni se toca.
  await dormir(7_000);
  ok(!existsSync(join(HERMES_HOME, "logs")) && !existsSync(join(HERMES_HOME, ".update_check")) && readdirSync(HERMES_HOME).length === 1, "abrir Bots no lanza a Hermes ni toca su carpeta", readdirSync(HERMES_HOME).join());

  ok(await pulsar("hermes", "Conectar Hermes"), "se pulsa «Conectar Hermes»");
  ok(!!(await hasta(() => v.js(`!!document.querySelector(${JSON.stringify(enBot("hermes") + " .bot-texto")})`), 30_000, 400)), "enseña lo que va a escribir");
  const vista = await textoDe("hermes");
  ok(vista.includes(HERMES_HOME) && /mcp_servers/.test(vista) && /ADEORQ_BOT_CLAVE/.test(vista), "con el archivo de verdad, el que dice su propio Hermes", vista);
  ok(!/ADEORQ_BOT_CLAVE: '[0-9a-f]{64}'/.test(vista), "y sin la clave");
  ok(readFileSync(CONFIG, "utf8") === ORIGINAL, "todavía no ha escrito nada");
  await foto("conectar-es-1920-vista");
  ok(await pulsar("hermes", "Escribirlo"), "se pulsa «Escribirlo»");
  ok(!!(await hasta(() => v.js(`document.querySelector(${JSON.stringify(enBot("hermes"))})?.innerText.includes("Desconectar")`), 30_000, 400)), "queda conectado");

  const escrito = readFileSync(CONFIG, "utf8");
  ok(escrito.startsWith(ORIGINAL), "lo que había queda byte a byte");
  const clave = /ADEORQ_BOT_CLAVE: '([0-9a-f]{64})'/.exec(escrito)?.[1];
  ok(!!clave, "con su clave en el `env` de la entrada", escrito.slice(ORIGINAL.length));
  claves.push(clave);
  ok(escrito.includes(`ADEORQ_MCP_PUERTO: '${PUERTO}'`), "y el puerto de esta Adeorq, para no hablar con otra");
  const copias = readdirSync(HERMES_HOME).filter((f) => f.startsWith("config.yaml.antes-de-adeorq-"));
  ok(copias.length === 1 && readFileSync(join(HERMES_HOME, copias[0]), "utf8") === ORIGINAL, "deja una copia del archivo de antes", copias.join());
  const libro = () => readFileSync(join(a.base, "datos", "Adeorq", "bots_conexion.json"), "utf8");
  ok(!libro().includes(clave) && /"huella"/.test(libro()), "de la clave, Adeorq guarda solo la huella");

  // Hermes de verdad, con su orden: sin chat y sin modelo.
  const lista = hermes("mcp", "list");
  ok(/adeorq/.test(lista.stdout ?? ""), "`hermes mcp list` de verdad la ve", `${lista.stdout}${lista.stderr}`);
  const prueba = hermes("mcp", "test", "adeorq");
  console.log(`      hermes mcp test: ${(prueba.stdout ?? "").replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").slice(0, 260)}`);
  ok(prueba.status === 0 && /get_active_panes/.test(prueba.stdout ?? "") && !/get_projects|open_pane|send_command/.test(prueba.stdout ?? ""), "`hermes mcp test` de verdad conecta y ve las de «Mira», y solo esas", `${prueba.status} ${prueba.stdout}${prueba.stderr}`);
  // Lo que Hermes imprime y lo que apunta en sus registros tampoco lleva la clave.
  const registrosDeHermes = readdirSync(join(HERMES_HOME, "logs"), { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
  const enRegistros = registrosDeHermes.filter((e) => readFileSync(join(e.parentPath, e.name), "latin1").includes(clave)).map((e) => e.name);
  ok(!`${lista.stdout}${lista.stderr}${prueba.stdout}${prueba.stderr}`.includes(clave) && enRegistros.length === 0, `Hermes no enseña la clave ni la guarda en sus ${registrosDeHermes.length} registros`, enRegistros.join());

  // Una terminal ajena con un encargo y una pantalla que el bot no debe leer.
  const conClic = async (quien, args, contestar, fotoDeLaVentana) => {
    const p = quien.llamar("open_pane", args, 130_000);
    const titulo = await hasta(() => v.js(`document.querySelector(".abrir-modal .modal-title")?.textContent ?? null`), 15_000, 200);
    const cuerpo = await v.js(`document.querySelector(".abrir-modal")?.innerText ?? ""`);
    if (fotoDeLaVentana) await foto(fotoDeLaVentana);
    await dormir(900);
    await v.js(`document.querySelector(".abrir-modal ${contestar === "abrir" ? ".np-btn" : ".modal-cancel"}")?.click(), "ok"`);
    return { r: await p, titulo, cuerpo };
  };
  const secreta = await conClic(fuera, { cli: "claude", cwd: demo, name: "Secreta", brief: ENCARGO_SECRETO }, "abrir");
  const F = numero(secreta.r);
  ok(F > 0, `lo de fuera abre con tu clic una terminal con encargo (${F})`, corto(secreta.r));
  ok(!!(await hasta(async () => (await pantalla(F)).includes(PANTALLA_SECRETA), 20_000, 500)), "y su pantalla lleva lo que no se debe leer");

  console.log("\n── Hermes en «Mira», el escalón con el que nace");
  const bot = puenteBot(env, clave);
  const ini = await bot.iniciar();
  ok(ini.result?.capabilities?.tools?.listChanged === true, "el puerto le dice que su lista puede cambiar");
  ok(/connected to it as Hermes/.test(ini.result?.instructions ?? "") && !/Split from the start/.test(ini.result?.instructions ?? ""), "y le habla como a un bot, no como a un agente de dentro", ini.result?.instructions);
  const vistas = await bot.herramientas();
  ok(JSON.stringify(vistas) === JSON.stringify(["get_active_panes", "get_usage", "read_pane_screen", "read_pane_transcript"]), "ve la lista, el uso y leer lo suyo", vistas.join());
  const lPanes = await bot.llamar("get_active_panes");
  ok(new RegExp(`ID: ${F}\\b`).test(lPanes.texto ?? "") && /Programa: claude/.test(lPanes.texto ?? ""), "la lista de terminales le llega", corto(lPanes));
  ok(!(lPanes.texto ?? "").includes(ENCARGO_SECRETO) && !/Command:/.test(lPanes.texto ?? ""), "sin el comando, que lleva el encargo entero", lPanes.texto);
  ok(!(await bot.llamar("get_usage")).error, "y el uso");
  for (const [h, args] of [
    ["read_pane_screen", { paneId: F }],
    ["read_pane_transcript", { paneId: F }],
  ]) {
    const r = await bot.llamar(h, args);
    ok(!!r.error && !JSON.stringify(r).includes(PANTALLA_SECRETA), `${h} de una ajena, no`, corto(r));
    // Un número que no cabe en 32 bits no es otra terminal: cortado, era esa misma.
    const grande = await bot.llamar(h, { paneId: 2 ** 32 + F });
    ok(!!grande.error && !JSON.stringify(grande).includes(PANTALLA_SECRETA), `${h} con 2^32 más su número, tampoco`, corto(grande));
  }
  for (const [h, args] of [
    ["leer_memoria", { id: "x" }],
    ["buscar_memoria", { pregunta: "algo que buscar" }],
    ["leer_turno", { conversacion: "x", n: 1 }],
    ["get_agenda", { project: "demo" }],
    ["get_decision", {}],
    ["ask_decision", { title: "x", questions: [] }],
    ["get_mods", {}],
    ["get_projects", {}],
    ["open_pane", { cli: "shell", cwd: demo }],
    ["link_panes", { from: F, to: destino }],
    ["send_command", { paneId: destino, command: "echo no" }],
    ["send_keys", { paneId: destino, keys: ["enter"] }],
    ["close_pane", { paneId: F }],
    ["compactar_terminal", { paneId: F }],
  ]) {
    const r = await bot.llamar(h, args);
    ok(!!r.error && /Ajustes > Bots/.test(r.error), `${h}, no, y dice dónde se cambia`, corto(r));
  }

  console.log("\n── Una clave que no vale no da nada, y sin clave es lo de fuera");
  const mala = puenteBot(env, "0".repeat(64));
  const iniMala = await mala.iniciar();
  ok(/no longer valid/.test(iniMala.result?.instructions ?? ""), "con una clave mala, el puerto se lo dice al conectarse", iniMala.result?.instructions);
  ok(JSON.stringify(await mala.herramientas()) === "[]", "y no ve ninguna herramienta");
  const malaLee = await mala.llamar("read_pane_screen", { paneId: F });
  ok(/ya no vale/.test(malaLee.error ?? "") && !JSON.stringify(malaLee).includes(PANTALLA_SECRETA), "y lo que pida, le contesta que esa clave no vale", corto(malaLee));
  mala.cerrar();
  const herramientasDeFuera = await fuera.herramientas();
  const impostor = await cliente("bot:hermes");
  ok(JSON.stringify(await impostor.herramientas()) === JSON.stringify(herramientasDeFuera), "diciendo llamarse «bot:hermes» y sin clave, es lo de fuera");
  await invocar("mcp_clientes_poner", { nombre: "fuera", nivel: null });
  const deFabrica = await impostor.herramientas();
  ok(deFabrica.includes("get_active_panes") && !deFabrica.includes("get_agenda") && !deFabrica.includes("leer_memoria"), "y con lo de fuera de fábrica, sin clave no lee más que un bot", deFabrica.join());
  const sigueBot = await bot.herramientas();
  ok(JSON.stringify(sigueBot) === JSON.stringify(["get_active_panes", "get_usage", "read_pane_screen", "read_pane_transcript"]), "bajar lo de fuera no le cambia nada al bot con su clave", sigueBot.join());
  await invocar("mcp_clientes_poner", { nombre: "fuera", nivel: "plan" });
  impostor.cerrar();
  const impostor2 = await cliente("hermes", [{ adeorq: "bot", clave: clave.slice(0, 63) }]);
  ok(JSON.stringify(await impostor2.herramientas()) === "[]", "con un trozo de la clave, no ve nada");
  impostor2.cerrar();

  console.log("\n── Hermes en «Abre con mi clic»");
  const avisosAntes = bot.avisos.length;
  ok(await pulsar("hermes", "Abre con mi clic"), "se elige en Ajustes");
  ok(!!(await hasta(() => bot.avisos.length > avisosAntes, 5_000, 100)), "y al bot le llega el aviso de que mire su lista", bot.avisos.join());
  const vistasPlan = await bot.herramientas();
  ok(vistasPlan.includes("open_pane") && vistasPlan.includes("get_projects") && !vistasPlan.includes("send_command") && !vistasPlan.includes("leer_memoria"), "ya ve abrir, y no escribir ni la memoria", vistasPlan.join());
  const sinEncargo = await bot.llamar("open_pane", { cli: "shell", cwd: demo, name: "Del bot" });
  const T1 = numero(sinEncargo);
  ok(T1 > 0 && !(await v.js(`!!document.querySelector(".abrir-modal")`)), `sin encargo abre sin ventana (${T1})`, corto(sinEncargo));
  ok(!/send_command/.test(sinEncargo.texto ?? "") && /quien usa Adeorq/.test(sinEncargo.texto ?? ""), "y no le manda usar send_command, que no tiene", sinEncargo.texto);
  const conEncargo = await conClic(bot, { cli: "claude", cwd: demo, name: "Con encargo", brief: "haz esto" }, "abrir", "ventana-es");
  const T2 = numero(conEncargo.r);
  ok(T2 > 0, `con encargo sale la ventana y con «Abrir» abre (${T2})`, corto(conEncargo.r));
  ok(/^Hermes quiere abrir una terminal/.test(conEncargo.titulo ?? ""), "la ventana dice que es Hermes, sin el «dice llamarse»", conEncargo.titulo);
  ok(!/Dice llamarse/.test(conEncargo.cuerpo) && /haz esto/.test(conEncargo.cuerpo), "y enseña el encargo", conEncargo.cuerpo);
  const comandoDe = (id, texto) => new RegExp(`ID: ${id}\\b[^\\n]*`).exec(texto ?? "")?.[0] ?? "";
  const desdeFuera = (await fuera.llamar("get_active_panes")).texto;
  ok(!/--permission-mode auto/.test(comandoDe(T2, desdeFuera)), "nace en el modo de Ajustes, no en auto", comandoDe(T2, desdeFuera));
  ok(!!(await hasta(async () => !(await bot.llamar("read_pane_screen", { paneId: T2 })).error, 20_000, 500)), "lee lo que abrió él");
  ok(!!(await hasta(async () => ((await bot.llamar("read_pane_screen", { paneId: T2 })).texto ?? "").includes(PANTALLA_SECRETA), 20_000, 500)), "con lo que hay en su pantalla");
  const ajenaEnPlan = await bot.llamar("read_pane_screen", { paneId: F });
  ok(!!ajenaEnPlan.error && !JSON.stringify(ajenaEnPlan).includes(PANTALLA_SECRETA), "y sigue sin leer la ajena", corto(ajenaEnPlan));
  ok(!!(await bot.llamar("send_command", { paneId: T1, command: "echo no" })).error, "y no escribe, ni en la suya");
  ok(/Abierta por: ti/.test(comandoDe(T1, (await bot.llamar("get_active_panes")).texto)), "la lista le dice cuáles abrió él");
  ok(!(await bot.llamar("close_pane", { paneId: T1, rastro: RASTRO })).error, "cierra la suya");
  ok(!!(await bot.llamar("close_pane", { paneId: destino, rastro: RASTRO })).error, "y no la de otro");
  // Su número se recuerda por el bot, no por la conexión: reconecta y sigue siendo suya.
  const bot2 = puenteBot(env, clave);
  await bot2.iniciar();
  await bot2.llamar("get_active_panes");
  ok(!(await bot2.llamar("read_pane_screen", { paneId: T2 })).error, "con otra conexión, la que abrió sigue siendo suya");
  bot2.cerrar();
  const de = await hasta(() => v.js(`document.querySelector('[data-pane-id="${T2}"] .pane-de')?.textContent ?? null`), 8_000, 300);
  ok(/Hermes/.test(de ?? ""), "su cabecera dice de quién es", de ?? "");
  const conNo = await conClic(bot, { cli: "claude", cwd: demo, name: "No", brief: "otra cosa" }, "no");
  ok(/dicho que no/.test(conNo.r.error ?? ""), "con «No», un error que lo dice", corto(conNo.r));

  console.log("\n── Hermes en «Manda sin preguntar»");
  await foto("conectar-es-1920-conectado");
  const frase = await textoDe("hermes");
  ok(/quien engañe al bot manda en tu ordenador/.test(frase), "la frase está al lado, antes de elegirlo", frase);
  ok(await pulsar("hermes", "Manda sin preguntar"), "se elige en Ajustes, a mano");
  await dormir(400);
  const vistasAuto = await bot.herramientas();
  ok(vistasAuto.includes("send_command") && vistasAuto.includes("leer_memoria") && vistasAuto.includes("link_panes"), "ya lo ve todo", vistasAuto.join());
  ok(((await bot.llamar("read_pane_screen", { paneId: F })).texto ?? "").includes(PANTALLA_SECRETA), "lee cualquier terminal");
  ok(((await bot.llamar("get_active_panes")).texto ?? "").includes(ENCARGO_SECRETO), "y la lista entera, con sus comandos");
  const escribe = `ESCRITO-POR-EL-BOT-${process.pid}`;
  ok(!(await bot.llamar("send_command", { paneId: destino, command: `echo ${escribe}` })).error, "escribe en cualquier terminal");
  ok(!!(await hasta(async () => (await pantalla(destino)).includes(escribe), 12_000, 500)), "y llega de verdad");
  // Una consola de Adeorq, con su contraseña de verdad, donde el programa se conoce por
  // su nombre: decir «bot:hermes» no le da lo de Hermes, que ahora mismo lo tiene todo.
  await bot.llamar("send_command", { paneId: destino, command: "cmd /c echo ADEORQ-CLAVE=%ADEORQ_PANE_CLAVE%" });
  const claveDestino = await hasta(async () => /ADEORQ-CLAVE=([0-9a-f]{64})/.exec(await pantalla(destino))?.[1], 12_000, 400);
  ok(!!claveDestino, "se lee la contraseña de una consola de Adeorq");
  const pelada = await cliente("bot:hermes", [{ adeorq: "panel", id: destino, clave: claveDestino }]);
  const vistasPelada = await pelada.herramientas();
  ok(vistasPelada.includes("open_pane") && !vistasPelada.includes("send_command"), "una consola de Adeorq que dice llamarse «bot:hermes» no tiene sus permisos", vistasPelada.join());
  pelada.cerrar();
  const sinVentana = await bot.llamar("open_pane", { cli: "claude", cwd: demo, name: "Sola", brief: "sin preguntar" }, 15_000);
  const T3 = numero(sinVentana);
  ok(T3 > 0 && !(await v.js(`!!document.querySelector(".abrir-modal")`)), `abre con encargo sin ventana (${T3})`, corto(sinVentana));
  ok(/--permission-mode auto/.test(comandoDe(T3, (await bot.llamar("get_active_panes")).texto)), "y nace en auto");
  const conFlecha = await bot.llamar("link_panes", { from: destino, to: T3, auto: true });
  ok(/automática/.test(conFlecha.texto ?? "") || /Lienzo/.test(conFlecha.error ?? ""), "y a él sí se le deja pedir una flecha automática", corto(conFlecha));

  console.log("\n── Lo que hizo");
  await dormir(6500);
  const enPantalla = await textoDe("hermes");
  ok(/Abrió una terminal · terminal \d+/.test(enPantalla) && /Escribió en una terminal · terminal \d+|Leyó una terminal · terminal \d+|Miró las terminales/.test(enPantalla), "la sección enseña lo último que hizo, en palabras llanas", enPantalla);
  await foto("conectar-es-1920-todo");
  const guardado = libro();
  ok(!guardado.includes(escribe) && !guardado.includes(ENCARGO_SECRETO) && !guardado.includes("sin preguntar"), "y no guarda el texto de nada");
  ok(/"fallo": true/.test(guardado) && /"herramienta": "send_command"/.test(guardado), "y queda lo que se le negó");
  await bot.llamar(`INVENTADA-${process.pid}`);
  ok(!libro().includes(`INVENTADA-${process.pid}`), "y una herramienta inventada no escribe su nombre en la lista");

  console.log("\n── OpenClaw · `openclaw mcp set` y su Gateway");
  writeFileSync(join(doble, "gateway-en-marcha"), "");
  ok(await pulsar("openclaw", "Conectar OpenClaw"), "se pulsa «Conectar OpenClaw»");
  ok(!!(await hasta(() => v.js(`!!document.querySelector(${JSON.stringify(enBot("openclaw") + " .bot-texto")})`), 15_000, 300)), "enseña la orden");
  const vistaOC = await textoDe("openclaw");
  ok(/openclaw mcp set adeorq/.test(vistaOC) && !/[0-9a-f]{64}/.test(vistaOC), "sin la clave", vistaOC);
  ok(await pulsar("openclaw", "Escribirlo"), "se pulsa «Escribirlo»");
  ok(!!(await hasta(async () => /Gateway en marcha/.test(await textoDe("openclaw")), 15_000, 300)), "con su Gateway en marcha lo dice en claro", await textoDe("openclaw"));
  const filasTrasFallo = (await invocar("bots_conexiones")).ok;
  ok(filasTrasFallo?.find((f) => f.bot === "openclaw")?.conectado === false, "y no queda a medias: no está conectado");
  const conGateway = llamadasOpenclaw().at(-1);
  const claveFallida = conGateway?.[3] ? JSON.parse(conGateway[3]).env?.ADEORQ_BOT_CLAVE : null;
  rmSync(join(doble, "gateway-en-marcha"), { force: true });
  ok(await pulsar("openclaw", "Escribirlo"), "parado el Gateway, se pulsa otra vez");
  ok(!!(await hasta(async () => /Desconectar/.test(await textoDe("openclaw")), 15_000, 300)), "queda conectado");
  const orden = llamadasOpenclaw().at(-1);
  ok(orden?.[0] === "mcp" && orden?.[1] === "set" && orden?.[2] === "adeorq", "lanza `openclaw mcp set adeorq …`", JSON.stringify(orden));
  const json = (() => {
    try {
      return JSON.parse(orden?.[3] ?? "");
    } catch {
      return null;
    }
  })();
  ok(!!json?.command && json?.args?.[0] === "--mcp" && /^[0-9a-f]{64}$/.test(json?.env?.ADEORQ_BOT_CLAVE ?? ""), "con su JSON entero a través de un .cmd, comillas incluidas", orden?.[3]);
  const claveOC = json?.env?.ADEORQ_BOT_CLAVE;
  claves.push(claveOC);
  if (claveFallida) claves.push(claveFallida);
  ok(claveOC !== clave, "con otra clave que la de Hermes");
  const oc = puenteBot(env, claveOC);
  await oc.iniciar();
  ok(JSON.stringify(await oc.herramientas()) === JSON.stringify(["get_active_panes", "get_usage", "read_pane_screen", "read_pane_transcript"]), "nace en «Mira», aunque Hermes esté en «Manda sin preguntar»");
  ok(!!(await oc.llamar("read_pane_screen", { paneId: T2 })).error || !!(await oc.llamar("get_active_panes")) === false, "y lo que abrió Hermes no es suyo");
  await oc.llamar("get_active_panes");
  const deOtroBot = await oc.llamar("read_pane_screen", { paneId: T2 });
  ok(!!deOtroBot.error, "ni mirando antes la lista", corto(deOtroBot));
  oc.cerrar();
  ok(await pulsar("openclaw", "Desconectar"), "se desconecta");
  ok(!!(await hasta(() => JSON.stringify(llamadasOpenclaw().at(-1)) === JSON.stringify(["mcp", "unset", "adeorq"]), 15_000, 300)), "y lanza `openclaw mcp unset adeorq`", JSON.stringify(llamadasOpenclaw().at(-1)));

  console.log("\n── Grok Bot · `adeorq preguntar`");
  ok(await pulsar("grok", "Darle una clave"), "se pulsa «Darle una clave»");
  const lineaGrok = await hasta(() => v.js(`document.querySelector(${JSON.stringify(enBot("grok") + " .bot-texto")})?.textContent ?? null`), 10_000, 300);
  ok(/ADEORQ_BOT_CLAVE='[0-9a-f]{64}'/.test(lineaGrok ?? "") && /preguntar get_active_panes/.test(lineaGrok ?? ""), "enseña la línea para pegar", lineaGrok);
  const claveGrok = /ADEORQ_BOT_CLAVE='([0-9a-f]{64})'/.exec(lineaGrok ?? "")?.[1];
  claves.push(claveGrok);
  await foto("conectar-es-1920-grok");
  // La línea tal cual, como la ejecutaría su app de escritorio.
  const tal = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", lineaGrok], { env, encoding: "utf8", timeout: 40_000 });
  ok(tal.status === 0 && /Arranque de Adeorq/.test(tal.stdout ?? "") && !(tal.stdout ?? "").includes(ENCARGO_SECRETO), "la línea funciona, y con su clave ve lo de «Mira»", `${tal.status} ${tal.stdout}${tal.stderr}`);
  const preguntar = (args, conClave = claveGrok) =>
    spawnSync(exe, ["preguntar", ...args], { env: { ...env, ...(conClave ? { ADEORQ_BOT_CLAVE: conClave } : {}) }, encoding: "utf8", timeout: 40_000 });
  const pregunta = preguntar(["read_pane_screen", JSON.stringify({ paneId: F })]);
  ok(/«demo · Secreta»/.test(tal.stdout ?? ""), "y lo que no es ASCII llega entero, que PowerShell 5.1 lo rompía", tal.stdout);
  // PowerShell 5.1 le quita las comillas a un JSON: nombre=valor no depende de eso.
  const conPares = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", lineaGrok.replace("preguntar get_active_panes", `preguntar read_pane_screen paneId=${F}`)], { env, encoding: "utf8", timeout: 40_000 });
  ok(/solo lee y cierra/.test(conPares.stdout ?? "") && !(conPares.stdout ?? "").includes(PANTALLA_SECRETA), "desde PowerShell, con nombre=valor, le llega el número y se le niega, y el error se ve", `${conPares.status} ${conPares.stdout}${conPares.stderr}`);
  const sinComillas = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", lineaGrok.replace("preguntar get_active_panes", `preguntar read_pane_screen '{"paneId":${F}}'`)], { env, encoding: "utf8", timeout: 40_000 });
  ok(/paneId=3/.test(sinComillas.stdout ?? ""), "con el JSON entre comillas, PowerShell se las quita y el error dice cómo escribirlo", `${sinComillas.status} ${sinComillas.stdout}`);
  ok(pregunta.status === 1 && /solo lee y cierra/.test(pregunta.stdout ?? "") && !(pregunta.stdout ?? "").includes(PANTALLA_SECRETA), "una ajena se le niega, con código 1", `${pregunta.status} ${pregunta.stdout}${pregunta.stderr}`);
  const sinClave = preguntar(["read_pane_screen", JSON.stringify({ paneId: F })], null);
  ok(sinClave.status === 0 && (sinClave.stdout ?? "").includes(PANTALLA_SECRETA), "sin clave es lo de fuera, que sí lee: por eso se le da una", `${sinClave.status} ${sinClave.stderr}`);
  const malUso = preguntar([]);
  ok(malUso.status === 2 && /Uso:/.test(malUso.stdout ?? ""), "sin nada que preguntar, dice cómo se usa");
  ok(await pulsar("grok", "Desconectar"), "se le retira la clave");
  await dormir(500);
  const trasRetirar = preguntar(["get_agenda", JSON.stringify({ project: "demo" })]);
  ok(trasRetirar.status === 1 && /ya no vale/.test(trasRetirar.stdout ?? ""), "y con la clave retirada no hace nada, y dice por qué", `${trasRetirar.status} ${trasRetirar.stdout}`);

  console.log("\n── Desconectar a Hermes");
  const antesDeRetirar = await bot.llamar("send_command", { paneId: destino, command: "echo sigo-mandando" });
  ok(!antesDeRetirar.error, "justo antes, todavía escribe");
  const alPulsar = Date.now();
  ok(await pulsar("hermes", "Desconectar"), "se pulsa «Desconectar»");
  // Lo que entra antes de que Rust la retire todavía escribe: se mide desde el clic.
  const retirado = await hasta(async () => (await bot.llamar("send_command", { paneId: destino, command: "echo todavia" })).error ?? null, 5_000, 20);
  console.log(`      del clic a dejar de valer: ${Date.now() - alPulsar} ms`);
  ok(!!retirado, "en su conexión abierta deja de escribir");
  const YA_RETIRADA = `YA-RETIRADA-${process.pid}`;
  const trasRetirarla = (await bot.llamar("send_command", { paneId: destino, command: `echo ${YA_RETIRADA}` })).error ?? "";
  ok(/ya no vale/.test(trasRetirarla), "y lo que pide, le contesta que esa clave no vale", trasRetirarla);
  await dormir(1500);
  ok(!(await pantalla(destino)).includes(YA_RETIRADA), "y lo que pide después de eso no se teclea");
  // Retirar no le sube nada: le llega el aviso de que mire su lista, y la lista está vacía.
  ok(JSON.stringify(await bot.herramientas()) === "[]", "en su conexión abierta ya no ve ninguna herramienta");
  const leeTrasRetirar = await bot.llamar("read_pane_screen", { paneId: F });
  ok(!!leeTrasRetirar.error && !JSON.stringify(leeTrasRetirar).includes(PANTALLA_SECRETA), "ni lee una terminal, que en lo de fuera sí podría", corto(leeTrasRetirar));
  ok(!!(await bot.llamar("get_active_panes")).error, "ni la lista");
  ok(!!(await hasta(() => readFileSync(CONFIG, "utf8") === ORIGINAL, 30_000, 500)), "y su archivo vuelve a estar como estaba, byte a byte", readFileSync(CONFIG, "utf8"));
  ok(!/adeorq/.test(hermes("mcp", "list").stdout ?? ""), "`hermes mcp list` de verdad ya no la ve");
  const retirada = puenteBot(env, clave);
  await retirada.iniciar();
  ok(JSON.stringify(await retirada.herramientas()) === "[]", "al reengancharse con la clave retirada, tampoco ve nada");
  retirada.cerrar();
  // Un Hermes de verdad al que se le quedó la entrada escrita con la clave retirada.
  const conEntradaVieja = join(fuera_de_la_aislada, "hermes-entrada-vieja");
  mkdirSync(conEntradaVieja, { recursive: true });
  writeFileSync(join(conEntradaVieja, "config.yaml"), escrito);
  const pruebaVieja = spawnSync(hermesExe, ["mcp", "test", "adeorq"], { env: { ...env, HERMES_HOME: conEntradaVieja }, encoding: "utf8", timeout: 90_000 });
  const salidaVieja = `${pruebaVieja.stdout ?? ""}${pruebaVieja.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  console.log(`      hermes mcp test con la clave retirada: ${salidaVieja.replace(/\s+/g, " ").slice(0, 260)}`);
  ok(!/Traceback/.test(salidaVieja) && !/get_active_panes/.test(salidaVieja), "Hermes de verdad con la entrada vieja no se cae, y no ve ninguna herramienta", salidaVieja);
  const filas = (await invocar("bots_conexiones")).ok;
  const deHermes = filas?.find((f) => f.bot === "hermes");
  ok(deHermes?.conectado === false && deHermes?.nivel === "mirar", "y al volver a conectarlo nacería abajo", JSON.stringify(deHermes));

  console.log("\n── Hermes · archivos raros");
  const copiasDeHermes = () => readdirSync(HERMES_HOME).filter((f) => f.startsWith("config.yaml.antes-de-adeorq-")).length;
  const noSeToca = async (texto, por, que) => {
    writeFileSync(CONFIG, texto);
    const antes = copiasDeHermes();
    const r = await invocar("bots_conectar", { bot: "hermes" });
    const conectado = (await invocar("bots_conexiones")).ok?.find((f) => f.bot === "hermes")?.conectado;
    ok(por.test(r.mal ?? "") && readFileSync(CONFIG, "utf8") === texto && copiasDeHermes() === antes && conectado === false, `${que}: se dice, no se toca, no deja copia y no queda conectado`, JSON.stringify(r));
  };
  await noSeToca("a: [\n", /no entiendo la forma/, "un archivo que no se lee");
  await noSeToca("mcp_servers:\n  fotos: 3\n  - raro\n", /no entiendo la forma/, "una lista que no se lee");
  await noSeToca("mcp_servers:\n  adeorq:\n    command: propia\n", /no puse yo/, "una entrada `adeorq` hecha a mano");
  writeFileSync(CONFIG, ORIGINAL);
  chmodSync(CONFIG, 0o444);
  const antesSoloLectura = copiasDeHermes();
  const soloLectura = await invocar("bots_conectar", { bot: "hermes" });
  ok(/solo lectura/.test(soloLectura.mal ?? "") && readFileSync(CONFIG, "utf8") === ORIGINAL && copiasDeHermes() === antesSoloLectura, "uno de solo lectura: se dice, no se toca y no deja copia", JSON.stringify(soloLectura));
  chmodSync(CONFIG, 0o666);

  // Con la lista ya escrita y vacía: Hermes la ve, y al quitarla su línea vuelve tal cual.
  const conListaVacia = "# mis cosas\nmcp_servers: {} # nada\nmodel:\n  default: \"sin-modelo\"\n";
  writeFileSync(CONFIG, conListaVacia);
  ok(!(await invocar("bots_conectar", { bot: "hermes" })).mal, "una lista vacía se rellena");
  ok(/adeorq/.test(hermes("mcp", "list").stdout ?? ""), "`hermes mcp list` de verdad la lee");
  await invocar("bots_desconectar", { bot: "hermes" });
  ok(readFileSync(CONFIG, "utf8") === conListaVacia, "y al desconectar queda byte a byte, con su `{}` y su comentario", readFileSync(CONFIG, "utf8"));

  // Sin salto al final, que es como deja un archivo más de un editor.
  const sinSalto = "model:\n  default: \"sin-modelo\"";
  writeFileSync(CONFIG, sinSalto);
  ok(!(await invocar("bots_conectar", { bot: "hermes" })).mal, "un archivo sin salto al final se conecta");
  ok(/adeorq/.test(hermes("mcp", "list").stdout ?? ""), "`hermes mcp list` de verdad la lee");
  await invocar("bots_desconectar", { bot: "hermes" });
  ok(readFileSync(CONFIG, "utf8") === sinSalto, "y al desconectar queda byte a byte, sin ese salto", JSON.stringify(readFileSync(CONFIG, "utf8")));

  // Hermes reescribe el archivo entero al guardar: su entrada se queda y se sigue pudiendo quitar.
  writeFileSync(CONFIG, ORIGINAL);
  ok(!(await invocar("bots_conectar", { bot: "hermes" })).mal, "se conecta otra vez");
  const guardado1 = hermes("config", "set", "model.default", "otro-modelo");
  const reescrito = readFileSync(CONFIG, "utf8");
  ok(guardado1.status === 0 && /otro-modelo/.test(reescrito) && !/un comentario dentro/.test(reescrito) && /ADEORQ_BOT_CLAVE/.test(reescrito), "Hermes guarda de verdad, sin comentarios, y su entrada sigue", `${guardado1.status} ${guardado1.stderr} ${reescrito.slice(0, 300)}`);
  ok(!(await invocar("bots_desconectar", { bot: "hermes" })).ok?.aviso, "se desconecta sin aviso");
  const trasGuardar = readFileSync(CONFIG, "utf8");
  ok(!/adeorq/i.test(trasGuardar) && /otro-modelo/.test(trasGuardar), "se quita su entrada y lo que guardó Hermes se queda", trasGuardar.slice(0, 300));
  ok(!/adeorq/.test(hermes("mcp", "list").stdout ?? ""), "`hermes mcp list` de verdad ya no la ve, y no se cae");

  // Un enlace (los dotfiles de mucha gente) sigue siendo un enlace. En Windows crearlo pide modo de desarrollador.
  const destinoEnlace = join(fuera_de_la_aislada, "config-de-verdad.yaml");
  writeFileSync(destinoEnlace, ORIGINAL);
  rmSync(CONFIG, { force: true });
  let conEnlace = true;
  try {
    symlinkSync(destinoEnlace, CONFIG, "file");
  } catch (e) {
    conEnlace = false;
    console.log(`      SALTADO el enlace: ${e.code}`);
  }
  if (conEnlace) {
    ok(!(await invocar("bots_conectar", { bot: "hermes" })).mal, "con un enlace, se conecta");
    ok(lstatSync(CONFIG).isSymbolicLink() && /ADEORQ_BOT_CLAVE/.test(readFileSync(destinoEnlace, "utf8")), "sigue siendo un enlace, y lo escrito está en su destino");
    await invocar("bots_desconectar", { bot: "hermes" });
    ok(lstatSync(CONFIG).isSymbolicLink() && readFileSync(destinoEnlace, "utf8") === ORIGINAL, "y al desconectar, su destino queda byte a byte");
    rmSync(CONFIG, { force: true });
  }
  writeFileSync(CONFIG, ORIGINAL);
  await dormir(6500);
  // Solo se enseñan las 5 últimas, y lo último fue escribir hasta que se le retiró.
  ok(/Escribió en una terminal · terminal \d+/.test(await textoDe("hermes")), "lo que hizo sigue a la vista: es lo primero que se mirará", await textoDe("hermes"));
  const clientes = readFileSync(join(a.base, "datos", "Adeorq", "mcp_clientes.json"), "utf8");
  ok(!/"bot:hermes":\s*"/.test(clientes), "y no le queda ningún permiso guardado", clientes);
  ok(JSON.parse(clientes).niveles?.fuera === "plan", "y con todo esto, la fila «Fuera de Adeorq» sigue como la dejó este laboratorio al empezar", clientes);
  const filasMcp = (await invocar("mcp_clientes_leer")).ok;
  ok(!filasMcp?.some((c) => c.nombre.startsWith("bot:")), "un bot no sale en la tabla de los clientes");
  ok(/no se puede|se cambia/i.test((await invocar("mcp_clientes_poner", { nombre: "bot:hermes", nivel: "auto" })).mal ?? ""), "ni se sube por ella", JSON.stringify(await invocar("mcp_clientes_leer")));
  bot.cerrar();

  console.log("\n── Ningún rastro lleva una clave");
  const rastro = join(a.base, "datos", "Adeorq", "rastro.log");
  const textoRastro = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  ok(/Bots: Hermes conectado/.test(textoRastro) && /pasa a «auto»/.test(textoRastro), "el rastro cuenta lo que pasó", textoRastro.slice(-400));
  for (const c of claves.filter(Boolean)) {
    if (textoRastro.includes(c) || libro().includes(c)) ok(false, "una clave salió en un rastro", c.slice(0, 6));
  }
  ok(true, `las ${claves.filter(Boolean).length} claves de esta pasada no salen en el rastro ni en su libro`);

  console.log("\n── La sección y la ventana, en español y en inglés");
  ok(await pulsar("hermes", "Conectar Hermes"), "se vuelve a enseñar lo que escribiría");
  await hasta(() => v.js(`!!document.querySelector(${JSON.stringify(enBot("hermes") + " .bot-texto")})`), 30_000, 400);
  const c = await carceles(v, ".set-hoja");
  ok((c?.fallos ?? []).length === 0, "sin cárceles", JSON.stringify(c?.fallos ?? c));
  const m = await mayusculas(v, ".set-hoja");
  ok((m?.fallos ?? m?.length ?? 0) === 0 || (Array.isArray(m?.fallos) && m.fallos.length === 0), "sin mayúsculas espaciadas", JSON.stringify(m));
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await dormir(500);
  await foto("conectar-es-1280");
  const ancho = await v.js(`(() => { const h = document.querySelector(".set-hoja"); return h ? h.scrollWidth - h.clientWidth : -1; })()`);
  ok(ancho <= 0, "a 1280 no se sale de lado", String(ancho));
  await v.js(`localStorage.setItem("adeorq-lang", "en"); "ok"`);
  await v.enviar("Page.reload");
  await dormir(4000);
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
  await dormir(900);
  await v.js(`(() => { const b = [...document.querySelectorAll(".set-tab")].find((x) => x.querySelector(".set-tab-nom")?.textContent.trim() === "Bots"); if (b && !b.hasAttribute("data-on")) b.click(); return !!b; })()`);
  await dormir(1200);
  const enIngles = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
  ok(/Connect a bot/.test(enIngles) && /Connect Hermes/.test(enIngles) && /Give it a key/.test(enIngles), "en inglés", enIngles.slice(0, 300));
  ok(!/Conectar|Darle una clave/.test(enIngles), "sin nada en español", enIngles);
  await foto("conectar-en-1920");
  // Y la ventana en inglés, con Hermes otra vez: lo de antes se cerró al desconectarlo.
  ok(await pulsar("hermes", "Connect Hermes"), "se vuelve a conectar, en inglés");
  await hasta(() => v.js(`!!document.querySelector(${JSON.stringify(enBot("hermes") + " .bot-texto")})`), 30_000, 400);
  ok(await pulsar("hermes", "Write it"), "se pulsa «Write it»");
  await hasta(() => v.js(`document.querySelector(${JSON.stringify(enBot("hermes"))})?.innerText.includes("Disconnect")`), 30_000, 400);
  const claveEn = /ADEORQ_BOT_CLAVE: '([0-9a-f]{64})'/.exec(readFileSync(CONFIG, "utf8"))?.[1];
  ok(claveEn && claveEn !== clave, "con otra clave: la de antes no vuelve a valer");
  ok(await pulsar("hermes", "Opens with my click"), "se elige «Opens with my click»");
  const botEn = puenteBot(env, claveEn);
  await botEn.iniciar();
  const enIng = await conClic(botEn, { cli: "claude", cwd: demo, name: "In English", brief: "do this" }, "no", "ventana-en");
  ok(/^Hermes wants to open a terminal/.test(enIng.titulo ?? ""), "la ventana, en inglés", `${enIng.titulo} ${corto(enIng.r)}`);
  ok(/Open it only if you asked for it/.test(enIng.cuerpo) && !/Ábrela/.test(enIng.cuerpo), "sin nada en español", enIng.cuerpo);
  // Los topes de 6 vivas y 12 por hora le siguen valiendo con todo: el de vivas, hasta
  // que salte. Va al final porque deja sin hueco a lo que venga después.
  ok(await pulsar("hermes", "In charge, no asking"), "se le da todo");
  await dormir(400);
  let tope = "";
  for (let i = 0; i < 8 && !tope; i++) {
    const r = await botEn.llamar("open_pane", { cli: "shell", cwd: demo, name: `Tope ${i}` });
    if (r.error) tope = r.error;
  }
  ok(/Tope|tope/.test(tope), "y los topes siguen valiendo para él", tope);
  botEn.cerrar();
  fuera.cerrar();
} finally {
  await a.cerrar();
}

// ════ Sin Adeorq · un bot recibe un error claro ═══════════════════════════
console.log("\n── Sin Adeorq abierta");
const sinApp = { ...process.env, ADEORQ_MCP_PUERTO: String(PUERTO) };
delete sinApp.ADEORQ_PANE_ID;
delete sinApp.ADEORQ_PANE_CLAVE;
const solo = spawnSync(exe, ["preguntar", "get_usage", "{}"], { env: { ...sinApp, ADEORQ_BOT_CLAVE: "a".repeat(64) }, encoding: "utf8", timeout: 20_000 });
ok(solo.status === 1 && /Adeorq no está abierta/.test(solo.stdout ?? ""), "`adeorq preguntar` lo dice, con código 1", `${solo.status} ${solo.stdout}`);
const huerfano = puenteBot(sinApp, "a".repeat(64));
const iniHuerfano = await huerfano.iniciar();
ok(!!iniHuerfano.result, "el puente de un bot no se cae, y contesta", JSON.stringify(iniHuerfano));
const llamadaHuerfana = await huerfano.llamar("get_usage");
ok(/Adeorq no está abierta en este ordenador/.test(llamadaHuerfana.error ?? ""), "y al llamar a algo, el error lo dice", corto(llamadaHuerfana));
huerfano.cerrar();
const sinClave = puenteBot(sinApp, null);
sinClave.pedir("initialize", {}).catch(() => {});
await hasta(() => sinClave.salio() != null, 8_000, 200);
ok(sinClave.salio() != null && sinClave.salio() !== 0, "sin clave de bot, sale como siempre", String(sinClave.salio()));
sinClave.cerrar();
rmSync(fuera_de_la_aislada, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exitCode = fallos ? 1 : 0;
