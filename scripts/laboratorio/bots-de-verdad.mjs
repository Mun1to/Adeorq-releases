// Avisar a un bot, de punta a punta, en una Adeorq aislada y SIN mandar nada a nadie.
//
// Un servidor de mentira en este equipo hace de webhook de Grok Bot, y un
// `hermes` y un `openclaw` de mentira (dos `.cmd` que apuntan sus argumentos)
// van por delante en el `PATH`. La clave es de mentira y vive en el Gestor de
// Credenciales con un nombre propio de esta pasada (`ADEORQ_BOTS_CLAVE`), que se
// borra al acabar. El sonido, el aviso de Windows y el parpadeo de la barra de
// tareas se tapan en la página: ni el escritorio de Munir ni su equipo se enteran.
//
// Lo que mira:
//   - de fábrica nada está encendido y un aviso no hace nada;
//   - la sección de Ajustes (con foto, en español y en inglés): pegar la
//     dirección y la clave, encender, Probar;
//   - la clave no se guarda en el ajuste ni vuelve a la ventana;
//   - una campana de verdad (una terminal que toca la campana) llega a los tres;
//   - cinco terminales que acaban a la vez son UN mensaje, y el siguiente
//     espera su turno;
//   - un nombre de terminal con comillas, `&` y `%` no llega a una shell;
//   - un aviso que falla no saca nada y Ajustes dice cuál fue.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/bots-de-verdad.mjs [carpeta para las fotos] [exe]
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = process.argv[2] || tmpdir();
const exe = process.argv[3] ?? EXE;
mkdirSync(FOTOS, { recursive: true });
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const NOMBRE_CLAVE = `bot:lab-${process.pid}`;
const CLAVE = `clave-de-mentira-${process.pid}-${Date.now() % 100000}`;
const VENTANA_MS = 800;
const ESPACIO_MS = 4000;

// ── Los falsos ─────────────────────────────────────────────────────────────
const carpeta = mkdtempSync(join(tmpdir(), "adeorq-bots-"));
const falsos = join(carpeta, "bin");
mkdirSync(falsos);
writeFileSync(
  join(falsos, "registrar.mjs"),
  `import { appendFileSync, existsSync } from "node:fs";
const [programa, ...args] = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(carpeta, "llamadas.jsonl"))}, JSON.stringify({ programa, args }) + "\\n");
if (existsSync(${JSON.stringify(join(carpeta, "fallar-"))} + programa)) {
  console.error("Error: telegram is not configured");
  process.exit(1);
}
`,
);
for (const p of ["hermes", "openclaw"]) {
  writeFileSync(join(falsos, `${p}.cmd`), `@echo off\r\nnode "%~dp0registrar.mjs" ${p} %*\r\nexit /b %ERRORLEVEL%\r\n`);
}
const llamadas = () => {
  try {
    return readFileSync(join(carpeta, "llamadas.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

const webhook = { peticiones: [], codigo: 200 };
const servidor = createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (d) => (cuerpo += d));
  req.on("end", () => {
    let json = null;
    try {
      json = JSON.parse(cuerpo);
    } catch {}
    webhook.peticiones.push({ metodo: req.method, auth: req.headers.authorization ?? "", json, crudo: cuerpo });
    res.writeHead(webhook.codigo, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const URL_WEBHOOK = `http://127.0.0.1:${servidor.address().port}/hook/abc`;

// Lo que se tapa en la página: el aviso de Windows, el parpadeo de la barra y el sonido.
const GUARDA_AVISOS = `(() => {
  const real = window.fetch.bind(window);
  window.fetch = (a, b) => {
    const url = decodeURIComponent(typeof a === "string" ? a : (a && a.url) || "");
    if (/plugin:notification\\|notify|plugin:window\\|request_user_attention/.test(url)) {
      return Promise.resolve(new Response("null", { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
    }
    // El título y el cuerpo del aviso, que son los mismos que los del de escritorio.
    if (/movil_avisar/.test(url) && b && typeof b.body === "string") {
      try {
        (window.__avisos ||= []).push(JSON.parse(b.body));
      } catch {}
    }
    return real(a, b);
  };
  window.AudioContext = undefined;
  // Una ventana manejada por el protocolo de depuración dice tener el foco aunque
  // esté al fondo, y un aviso solo sale hacia el móvil o un bot si NO lo tienes.
  document.hasFocus = () => false;
})()`;

const puertoMcp = 47_000 + (process.pid % 900);
const depurar = 9650 + (process.pid % 100);
const a = await abrirAislada({
  nombre: "bots",
  puertoMcp,
  depurar,
  exe,
  fotos: FOTOS,
  guarda: GUARDA_AVISOS,
  entorno: {
    PATH: `${falsos}${delimiter}${process.env.PATH}`,
    ADEORQ_BOTS_CLAVE: NOMBRE_CLAVE,
    ADEORQ_BOTS_VENTANA_MS: String(VENTANA_MS),
    ADEORQ_BOTS_ESPACIO_MS: String(ESPACIO_MS),
  },
});
const { v } = a;
const invocar = (orden, args = {}) =>
  v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(orden)}, ${JSON.stringify(args)}).then((r) => JSON.stringify({ ok: r }), (e) => JSON.stringify({ mal: String(e) }))`).then((s) => JSON.parse(s));
const foto = async (nombre) => {
  const r = await v.enviar("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(FOTOS, `${nombre}.png`), Buffer.from(r.data, "base64"));
};
const escribir = (selector, texto) =>
  v.js(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(texto)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
const soltar = (selector) => v.js(`(document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new FocusEvent("focusout", { bubbles: true })), true)`);
const pulsar = (texto, dentro = ".settings") =>
  v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(dentro + " button")})].find((x) => x.textContent.trim() === ${JSON.stringify(texto)}); b?.click(); return !!b; })()`);
const abrirBots = async () => {
  await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
  await dormir(900);
  await v.js(`(() => { const b = [...document.querySelectorAll(".set-tab")].find((x) => x.querySelector(".set-tab-nom")?.textContent.trim() === "Bots"); if (b && !b.hasAttribute("data-on")) b.click(); return !!b; })()`);
  await dormir(700);
};

try {
  // ── De fábrica ───────────────────────────────────────────────────────────
  const e0 = (await invocar("bots_estado")).ok;
  dice(e0 && !e0.ajustes.grok.activo && !e0.ajustes.hermes.activo && !e0.ajustes.openclaw.activo, "de fábrica no hay ningún bot encendido");
  dice(e0?.hermes_instalado === true && e0?.openclaw_instalado === true, "detecta el Hermes y el OpenClaw que hay en el PATH", JSON.stringify(e0));
  dice(e0?.clave_grok === false, "y no hay clave");
  const sin = await invocar("bot_avisar", { terminal: "api", proyecto: "web", estado: "termino", ingles: false });
  dice(sin.ok === false, "con todo apagado, un aviso no se apunta");
  await dormir(VENTANA_MS + 1500);
  dice(webhook.peticiones.length === 0 && llamadas().length === 0, "y no sale nada hacia fuera");

  // ── La sección de Ajustes ───────────────────────────────────────────────
  await a.v.js(`localStorage.setItem("adeorq-lang", "es"); "ok"`);
  await abrirBots();
  const antes = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
  dice(/Avisar a un bot/.test(antes) && /Grok Bot/.test(antes) && /Hermes/.test(antes) && /OpenClaw/.test(antes), "Ajustes › Bots enseña los tres", antes.slice(0, 200));
  dice(/nunca lo que hay en la pantalla/.test(antes), "y dice con una frase que nunca manda la pantalla");
  dice(/gasta de su cuota/.test(antes), "y avisa de que Probar gasta de la cuota de Grok Bot");
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await dormir(500);
  await foto("bots-es-1920-vacio");

  await escribir('.bot-bloque input[placeholder="https://…"]', URL_WEBHOOK);
  await soltar('.bot-bloque input[placeholder="https://…"]');
  await dormir(500);
  await escribir('.bot-bloque input[type="password"]', CLAVE);
  dice(await pulsar("Guardar la clave"), "se pulsa «Guardar la clave»");
  await dormir(700);
  const e1 = (await invocar("bots_estado")).ok;
  dice(e1?.clave_grok === true && e1?.ajustes.grok.url === URL_WEBHOOK, "la dirección y la clave quedan guardadas", JSON.stringify(e1?.ajustes));
  const leida = (await invocar("secret_get", { key: NOMBRE_CLAVE })).ok;
  dice(leida === null, "la ventana no puede leer la clave de vuelta (secret_get da null)", String(leida));
  const json = readFileSync(join(a.base, "datos", "Adeorq", "bots.json"), "utf8");
  dice(!json.includes(CLAVE), "y la clave no está en bots.json");

  // Probar Grok Bot: UNA llamada, con la clave, solo metadatos
  dice(await pulsar("Probar"), "se pulsa Probar en Grok Bot (el primero)");
  await hasta(() => webhook.peticiones.length >= 1, 8000, 200);
  const p0 = webhook.peticiones[0];
  dice(p0?.metodo === "POST" && p0?.auth === `Bearer ${CLAVE}`, "el webhook recibe un POST con la clave como Bearer", p0?.auth);
  dice(p0?.json?.test === true && p0?.json?.source === "adeorq" && Array.isArray(p0?.json?.terminals), "con el cuerpo de la prueba (source, test, text, terminals)", p0?.crudo);
  await dormir(600);
  const txt1 = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
  dice(/La prueba llegó/.test(txt1), "la sección dice que la prueba llegó");

  // Encender Grok Bot por el interruptor
  await v.js(`(() => { const c = document.querySelector('.bot-bloque input[type="checkbox"]'); c?.click(); return !!c; })()`);
  await dormir(700);
  const e2 = (await invocar("bots_estado")).ok;
  dice(e2?.ajustes.grok.activo === true, "el interruptor de Grok Bot lo enciende");

  // Hermes y OpenClaw
  const hay = await v.js(`document.querySelectorAll('.bot-bloque input[type="checkbox"]').length`);
  dice(hay === 3, "hay tres interruptores (Hermes y OpenClaw instalados)", String(hay));
  const g =await invocar("bots_guardar", {
    ajustes: {
      grok: { activo: true, url: URL_WEBHOOK },
      hermes: { activo: true, destino: "telegram:-100123:7" },
      openclaw: { activo: true, canal: "telegram", destino: "@mi_chat" },
    },
  });
  dice(g.ok?.ajustes?.hermes?.activo === true && g.ok?.ajustes?.openclaw?.activo === true, "se encienden los tres con sus destinos", JSON.stringify(g));
  const malo = await invocar("bots_guardar", { ajustes: { grok: { activo: false, url: "http://example.com/x" }, hermes: { activo: false, destino: "" }, openclaw: { activo: false, canal: "", destino: "" } } });
  dice(malo.mal && /https/.test(malo.mal), "un webhook por http a otro sitio se rechaza", JSON.stringify(malo));
  const malo2 = await invocar("bots_guardar", { ajustes: { grok: { activo: false, url: "" }, hermes: { activo: true, destino: "--evil" }, openclaw: { activo: false, canal: "", destino: "" } } });
  dice(malo2.mal && /Hermes/.test(malo2.mal), "un destino que parece una opción se rechaza", JSON.stringify(malo2));
  await foto("bots-es-1920-encendido");

  // ── Una campana de verdad ───────────────────────────────────────────────
  webhook.peticiones.length = 0;
  rmSync(join(carpeta, "llamadas.jsonl"), { force: true });
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const r = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "ClienteWeb", brief: "" });
  const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
  dice(Number.isFinite(id), "se abre una terminal llamada ClienteWeb", r.texto ?? r.error);
  await hasta(() => v.js(`!!document.querySelector('[data-pane-id="${id}"]')`), 15_000, 400);
  await dormir(2500);
  webhook.peticiones.length = 0;
  rmSync(join(carpeta, "llamadas.jsonl"), { force: true });
  // El primer envío de este laboratorio fue la prueba: el espacio ya pasó de largo.
  // Callada después de la campana: si la consola vuelve a pintar el prompt, la
  // terminal deja de estar «terminada» y el aviso se cancela solo (con razón).
  // La campana la toca un programa (como un agente): `[Console]::Write` no la pasa.
  await agente.llamar("send_command", { paneId: id, command: `node -e "process.stdout.write(String.fromCharCode(7)); setTimeout(function () {}, 60000)"` });
  const llego = await hasta(() => webhook.peticiones.length >= 1 && llamadas().length >= 2, 20_000, 300);
  dice(!!llego, "la campana de una terminal llega al webhook, a Hermes y a OpenClaw", `webhook ${webhook.peticiones.length}, programas ${llamadas().length}`);
  const pc = webhook.peticiones[0];
  const t0 = pc?.json?.terminals?.[0];
  dice(t0?.name === "ClienteWeb" && t0?.state === "finished" && t0?.project === "demo", "dice qué terminal, su proyecto (demo) y que terminó", JSON.stringify(pc?.json));
  const aviso = JSON.parse((await v.js(`JSON.stringify(window.__avisos?.at(-1) ?? null)`)) ?? "null");
  dice(aviso?.titulo === "demo · terminó" && aviso?.cuerpo === "ClienteWeb", "el aviso de escritorio y el del móvil dicen el proyecto, no «Adeorq · terminó»", JSON.stringify(aviso));
  const claves = Object.keys(pc?.json ?? {}).sort().join(",");
  dice(claves === "source,terminals,test,text", "y nada más que eso en el cuerpo", claves);
  const lh = llamadas().find((l) => l.programa === "hermes");
  const lo = llamadas().find((l) => l.programa === "openclaw");
  dice(JSON.stringify(lh?.args.slice(0, 4)) === JSON.stringify(["send", "--to", "telegram:-100123:7", "--quiet"]) && /ClienteWeb/.test(lh?.args[4] ?? ""), "Hermes recibe: send --to <destino> --quiet <texto>", JSON.stringify(lh));
  dice(JSON.stringify(lo?.args.slice(0, 7)) === JSON.stringify(["message", "send", "--channel", "telegram", "--target", "@mi_chat", "--message"]) && /ClienteWeb/.test(lo?.args[7] ?? ""), "OpenClaw recibe: message send --channel --target --message <texto>", JSON.stringify(lo));

  // ── Sin ráfagas ─────────────────────────────────────────────────────────
  await dormir(ESPACIO_MS + 1500);
  webhook.peticiones.length = 0;
  rmSync(join(carpeta, "llamadas.jsonl"), { force: true });
  await Promise.all(["uno", "dos", "tres", "cuatro", "cinco"].map((n) => invocar("bot_avisar", { terminal: n, proyecto: "web", estado: "termino", ingles: false })));
  await hasta(() => webhook.peticiones.length >= 1, 8000, 200);
  await dormir(VENTANA_MS + 1200);
  dice(webhook.peticiones.length === 1 && webhook.peticiones[0].json.terminals.length === 5, "cinco terminales a la vez son UN mensaje con las cinco", `${webhook.peticiones.length} mensajes`);
  dice(llamadas().length === 2, "y UNA llamada a cada programa", String(llamadas().length));
  const segundo = Date.now();
  await invocar("bot_avisar", { terminal: "seis", proyecto: "web", estado: "espera", ingles: false });
  await dormir(VENTANA_MS + 600);
  dice(webhook.peticiones.length === 1, "otro aviso justo después NO sale todavía (espera su turno)");
  await hasta(() => webhook.peticiones.length >= 2, ESPACIO_MS + 4000, 200);
  dice(webhook.peticiones.length === 2 && webhook.peticiones[1].json.terminals[0].state === "waiting", "sale cuando pasa el espacio, y dice que espera", `${webhook.peticiones.length} · ${Date.now() - segundo} ms`);

  // ── Un nombre con una shell dentro ──────────────────────────────────────
  await dormir(ESPACIO_MS + 800);
  rmSync(join(carpeta, "llamadas.jsonl"), { force: true });
  const sucio = 'x" & echo PWNED> pwned.txt & "%PATH%^';
  await invocar("bot_avisar", { terminal: sucio, proyecto: "p&q", estado: "termino", ingles: false });
  await hasta(() => llamadas().length >= 2, 12_000, 200);
  const texto = llamadas().find((l) => l.programa === "hermes")?.args.at(-1) ?? "";
  dice(llamadas().length === 2 && !/["&%^<>|]/.test(texto), "un nombre con comillas, & y % llega limpio", texto);
  const pwned = [join(carpeta, "pwned.txt"), join(a.demo, "pwned.txt"), join(falsos, "pwned.txt"), join(process.cwd(), "pwned.txt")].some((f) => existsSync(f));
  dice(!pwned, "y no se ejecutó nada (no hay pwned.txt en ningún sitio)");

  // ── Un aviso que falla ──────────────────────────────────────────────────
  await dormir(ESPACIO_MS + 800);
  writeFileSync(join(carpeta, "fallar-hermes"), "");
  webhook.codigo = 500;
  await invocar("bot_avisar", { terminal: "api", proyecto: "web", estado: "termino", ingles: false });
  await hasta(async () => {
    const e = (await invocar("bots_estado")).ok;
    return e?.ultimos?.["Grok Bot"]?.ok === false && e?.ultimos?.Hermes?.ok === false;
  }, 12_000, 300);
  const e3 = (await invocar("bots_estado")).ok;
  dice(e3?.ultimos?.["Grok Bot"]?.ok === false && /500/.test(e3.ultimos["Grok Bot"].error ?? ""), "si el webhook contesta 500, queda dicho", JSON.stringify(e3?.ultimos?.["Grok Bot"]));
  dice(e3?.ultimos?.Hermes?.ok === false && /telegram is not configured/.test(e3.ultimos.Hermes.error ?? ""), "si Hermes falla, queda dicho con lo que dijo", JSON.stringify(e3?.ultimos?.Hermes));
  dice(e3?.ultimos?.OpenClaw?.ok === true, "y el que va bien no se ve afectado");
  await abrirBots();
  await dormir(7000); // la sección relee cada seis segundos
  const txt2 = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
  dice(/El último aviso no llegó/.test(txt2), "Ajustes dice que el último aviso no llegó", txt2.slice(-400));
  const ventanas = await v.js(`document.querySelectorAll('[role="dialog"], .modal, .toast').length`);
  dice(ventanas === 0, "y no sale ningún diálogo ni aviso en medio", String(ventanas));
  await foto("bots-es-1920-fallo");

  // ── En inglés y a 1280 ──────────────────────────────────────────────────
  await v.js(`localStorage.setItem("adeorq-lang", "en"); "ok"`);
  await v.enviar("Page.reload");
  await dormir(2500);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await abrirBots();
  const en =
    (await hasta(async () => {
      const t = await v.js(`document.querySelector(".set-hoja")?.innerText ?? ""`);
      return /Notify a bot/.test(t) ? t : null;
    }, 20_000, 500)) ?? (await v.js(`document.querySelector(".set-hoja")?.innerText ?? document.body.innerText.slice(0, 200)`));
  dice(/Notify a bot/.test(en) && /Webhook address/.test(en) && /never what is on the screen/.test(en), "en inglés, la sección sale en inglés", en.slice(0, 160));
  dice(!/Dirección|Clave|Probar|Avisar/.test(en), "y sin palabras en español", en.match(/Dirección|Clave|Probar|Avisar/)?.[0] ?? "");
  await foto("bots-en-1920-fallo");
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await dormir(600);
  await foto("bots-en-1280");
  const desborda = await v.js(`(() => { const h = document.querySelector(".set-hoja"); return h ? h.scrollWidth - h.clientWidth : -1; })()`);
  dice(desborda <= 1, "sin desbordar de lado a 1280", String(desborda));

  // ── Limpieza de la clave ────────────────────────────────────────────────
  await invocar("bots_clave_quitar");
  const quedan = spawnSync("cmdkey", ["/list"], { encoding: "utf8" }).stdout ?? "";
  dice(!quedan.includes(NOMBRE_CLAVE), "la clave de mentira se borra del Gestor de Credenciales al acabar");
} catch (e) {
  fallos++;
  console.log(`FALLO la prueba se rompió: ${e?.stack ?? e}`);
} finally {
  try {
    await invocar("bots_clave_quitar");
  } catch {}
  await a.cerrar();
  servidor.close();
  rmSync(carpeta, { recursive: true, force: true });
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
