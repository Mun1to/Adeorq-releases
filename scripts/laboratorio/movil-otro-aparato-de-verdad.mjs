// Emparejar otro aparato desde uno que ya lo está, de verdad (2026-11-13).
// Munir, desde clase, quería el código para emparejar el PC de clase y solo
// salía del botón de Ajustes > Móvil del PC de casa. Una Adeorq aislada (ver
// `aislada.mjs`) con el móvil encendido en su puerto; un «móvil» emparejado con
// el código del botón, que en su página saca otro con «Emparejar otro aparato»;
// el PC lo enseña en Ajustes > Móvil; y un segundo aparato, con su propio
// almacén, se empareja con él por la pantalla de siempre.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/movil-otro-aparato-de-verdad.mjs [carpeta para las fotos]
//
// Mide además lo que pide la seguridad: sin clave o con una inventada, 401; el
// rastro dice qué aparato lo pidió y nunca el código; el código sirve una vez,
// sustituye al anterior y cinco fallos lo queman. Tailscale, escondido como en
// `movil-para-ver-de-verdad.mjs`. Sale con 1 si algo falla.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3195;
const DEPURAR = 9395;
const PUERTO_MOVIL = 4395;
const B = `http://127.0.0.1:${PUERTO_MOVIL}`;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 220)})` : ""}`);
  if (!bien) fallos.push(que);
};

const sinProgramas = mkdtempSync(join(tmpdir(), "adeorq-sin-programas-"));
const PATH = ["C:\\WINDOWS\\system32", "C:\\WINDOWS", "C:\\WINDOWS\\System32\\Wbem", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0"].join(";");

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}`);
}

const pedirCodigo = (clave) =>
  fetch(`${B}/api/emparejar/codigo`, { method: "POST", headers: clave ? { Authorization: `Bearer ${clave}` } : {} })
    .then(async (r) => ({ estado: r.status, v: await r.json().catch(() => ({})) }));
const emparejar = (codigo, nombre) =>
  fetch(`${B}/api/emparejar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, nombre }) })
    .then(async (r) => ({ estado: r.status, v: await r.json().catch(() => ({})) }));

const a = await abrirAislada({
  nombre: "otro-aparato",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe: EXE,
  entorno: { PATH, Path: PATH, ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL), ProgramW6432: sinProgramas, ProgramFiles: sinProgramas },
});
let navegador = null;
try {
  const { v, base } = a;
  const rastro = join(base, "datos", "Adeorq", "rastro.log");
  const enAjustes = () => v.js(`document.querySelector(".movil-codigo strong")?.textContent ?? null`);

  // 1. El móvil encendido y un primer aparato emparejado con el código del botón.
  const enc = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: true }).then((x) => JSON.stringify(x), (m) => "ERROR " + m)`);
  debe(!String(enc).startsWith("ERROR"), "el móvil se enciende", enc);
  debe(await hasta(async () => (await fetch(`${B}/`).catch(() => null))?.ok, 20_000, 300), `la página del móvil contesta en el ${PUERTO_MOVIL}`);
  const delBoton = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor, (m) => "ERROR " + m)`);
  const primero = await emparejar(delBoton, "Android · Chrome");
  const clave = primero.v.clave;
  debe(Boolean(clave), "el primer aparato se empareja con el código del botón", JSON.stringify(primero.v).slice(0, 80));

  // 2. Ajustes > Móvil abierto en el PC, sin ningún código a la vista.
  await v.js(`localStorage.setItem("adeorq-ajustes-seccion", "movil"); document.querySelector('[data-tab="ajustes"]').click(); true`);
  debe(await hasta(() => v.js(`!!document.querySelector(".movil-emparejar")`), 15_000, 300), "Ajustes > Móvil se abre en el PC");
  debe((await enAjustes()) === null, "de entrada, Ajustes no enseña ningún código");

  // 3. Sin clave, o con una inventada, no sale nada.
  debe((await pedirCodigo(null)).estado === 401, "sin clave, 401");
  debe((await pedirCodigo("x".repeat(43))).estado === 401, "con una clave inventada, 401");

  // 4. El móvil lo saca desde su página, como lo haría Munir.
  const { chromium } = createRequire(import.meta.url)(playwrightCore());
  navegador = await chromium.launch({ executablePath: BRAVE, headless: true });
  const opciones = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" };
  const movil = await (await navegador.newContext(opciones)).newPage();
  await movil.goto(`${B}/`);
  await movil.evaluate((c) => localStorage.setItem("adeorq-movil-clave", c), clave);
  await movil.goto(`${B}/?r=1`);
  await movil.waitForSelector("#abrir-cajon");
  await movil.click("#abrir-cajon");
  await movil.click("#cajon .a-ajustes");
  await movil.waitForSelector("#pedir-codigo");
  await movil.click("#pedir-codigo");
  await movil.waitForSelector(".codigo-otro strong", { timeout: 8000 });
  const cifras = await movil.$eval(".codigo-otro strong", (s) => s.textContent);
  const quedan = await movil.$eval("#otro-quedan", (s) => s.textContent);
  const donde = await movil.$eval(".otro-donde b", (s) => s.textContent);
  debe(/^\d{3} \d{3}$/.test(cifras), "el móvil enseña seis cifras", cifras);
  debe(/^Vale (10:00|9:5\d)$/.test(quedan), "con su cuenta atrás de diez minutos", quedan);
  debe(donde === B, "y la dirección que abrir en el otro aparato", donde);
  await movil.$eval("#otro-aparato", (c) => c.scrollIntoView({ block: "center" }));
  await movil.screenshot({ path: join(FOTOS, "otro-aparato-de-verdad-movil.png") });
  const codigo = cifras.replace(" ", "");

  // 5. El PC lo enseña en Ajustes > Móvil sin tocar nada, y el rastro dice quién, nunca cuál.
  const visto = await hasta(async () => ((await enAjustes()) === cifras ? cifras : null), 8_000, 300);
  debe(visto === cifras, "Ajustes > Móvil del PC enseña el mismo código", (await enAjustes()) ?? "nada");
  await a.foto(null, "otro-aparato-de-verdad-pc.png").catch(() => {});
  const lineas = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  debe(/«Android · Chrome» pidió un código para emparejar otro aparato/.test(lineas), "el rastro dice qué aparato lo pidió", lineas.split("\n").filter((l) => /pidió un código/.test(l)).join(" | "));
  debe(!lineas.includes(codigo) && !lineas.includes(cifras), "y no dice el código");
  debe(!readFileSync(join(base, "datos", "Adeorq", "movil.json"), "utf8").includes(codigo), "ni queda en movil.json");

  // 6. Otro aparato, con su propio almacén, se empareja con él por la pantalla de siempre.
  const otro = await (await navegador.newContext({ ...opciones, colorScheme: "light" })).newPage();
  await otro.goto(`${B}/`);
  await otro.waitForSelector("#codigo");
  debe(/Ajustes > Emparejar otro aparato/.test(await otro.$eval(".emparejar p", (p) => p.textContent)), "la pantalla de emparejar dice que el código sale también de otro aparato");
  await otro.fill("#codigo", codigo);
  await otro.fill("#nombre", "Windows · Edge");
  await otro.click("#entrar");
  await otro.waitForSelector(".emparejar", { state: "detached", timeout: 8000 }).catch(() => {});
  const clave2 = await otro.evaluate(() => localStorage.getItem("adeorq-movil-clave"));
  debe(Boolean(clave2) && clave2 !== clave && !(await otro.$(".emparejar")), "el otro aparato entra con su propia clave");
  const yo = await fetch(`${B}/api/yo`, { headers: { Authorization: `Bearer ${clave2}` } }).then((r) => r.json());
  debe(yo.nombre === "Windows · Edge", "y el PC lo conoce por su nombre", JSON.stringify(yo).slice(0, 80));
  await otro.screenshot({ path: join(FOTOS, "otro-aparato-de-verdad-dentro.png") });
  const estado = JSON.parse(await v.js(`window.__TAURI_INTERNALS__.invoke("movil_estado").then((x) => JSON.stringify(x))`));
  debe(estado.dispositivos.length === 2 && !estado.codigo, "Ajustes cuenta dos aparatos y el código ya no vale", JSON.stringify(estado.dispositivos.map((d) => d.nombre)));
  debe(await hasta(async () => (await enAjustes()) === null, 6_000, 300), "en Ajustes el código se apaga solo al emparejar");
  debe((await emparejar(codigo, "Tercero")).estado === 403, "el mismo código no sirve dos veces");

  // 7. Uno nuevo sustituye al del botón, y cinco fallos lo queman aunque luego se acierte.
  const delBoton2 = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor)`);
  const delMovil = (await pedirCodigo(clave2)).v.valor;
  if (delBoton2 !== delMovil) debe((await emparejar(delBoton2, "Viejo")).estado === 403, "el código del botón deja de valer al sacar otro desde un aparato");
  const malo = delMovil === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await emparejar(malo, "Intruso");
  debe((await emparejar(delMovil, "Intruso")).estado === 403, "cinco fallos lo queman aunque luego se acierte");
  const fin = JSON.parse(await v.js(`window.__TAURI_INTERNALS__.invoke("movil_estado").then((x) => JSON.stringify(x))`));
  debe(fin.dispositivos.length === 2, "nadie más entró", fin.dispositivos.length);
} catch (e) {
  debe(false, "el laboratorio se cayó", e?.stack ?? e);
} finally {
  await navegador?.close().catch(() => {});
  await a.cerrar();
  rmSync(sinProgramas, { recursive: true, force: true });
}
console.log(fallos.length ? `\n${fallos.length} fallos` : "\nTodo en verde.");
process.exit(fallos.length ? 1 : 0);
