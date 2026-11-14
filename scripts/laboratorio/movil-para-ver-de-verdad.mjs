// «Para ver», de verdad. Munir, 2026-11-07: «que en adeorq movil se puedan ver
// imagenes o webs temporales locales de lo que vas haciendo». Una Adeorq aislada
// (ver `aislada.mjs`) con el móvil encendido en otro puerto; un agente que, por el
// MCP, le comparte una imagen, una página de un solo archivo y una web que corre
// en este PC; y un navegador sin ventana, a 390 px y al doble de densidad, que lo
// abre en la página del móvil como lo abriría su teléfono, emparejado de verdad.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/movil-para-ver-de-verdad.mjs [carpeta para las fotos] [exe, con barras de Windows]
//
// Lo que mide, además de que se vea: que no se comparte lo protegido (una carpeta
// BUNKER, la ruta de sus bóvedas, una carpeta, algo fuera de las de trabajo, un
// puerto de Adeorq), que sin la clave del móvil no se ve nada, que la lista no
// dice rutas ni puertos, y que el JavaScript de una página compartida corre pero
// no llega a la clave del móvil ni a su API.
//
// Tailscale, escondido (ni en el PATH ni en `ProgramFiles`): encender el móvil con
// él a la vista le pondría `tailscale serve` a la red de Munir. El Edge sí se ve
// (`ProgramFiles(x86)`): es el que captura la web. Sale con 1 si algo falla.
import http from "node:http";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3196;
const DEPURAR = 9396;
const PUERTO_MOVIL = 4396;
const B = `http://127.0.0.1:${PUERTO_MOVIL}`;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 220)})` : ""}`);
  if (!bien) fallos.push(que);
};

// Una web que corre en este PC, como la que levanta un agente para enseñarla.
const web = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0a7f4f;color:#fff;font:600 28px system-ui,sans-serif"><h1 style="margin:0;padding:28px 24px 8px">Hola desde la web del PC</h1><p style="margin:0;padding:0 24px;font-size:18px">Ruta pedida: ${req.url.replace(/[<>&]/g, "")}</p></body></html>`);
});
await new Promise((listo) => web.listen(0, "127.0.0.1", listo));
const PUERTO_WEB = web.address().port;

// Sin Tailscale a la vista: la carpeta de programas, vacía, y un PATH de sistema.
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

const a = await abrirAislada({
  nombre: "para-ver",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe: process.argv[3] || EXE,
  entorno: { PATH, Path: PATH, ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL), ProgramW6432: sinProgramas, ProgramFiles: sinProgramas },
});
let ctx = null;
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
try {
  const { v, demo } = a;
  // Lo que el agente va a enseñar, en la carpeta de proyectos de la aislada.
  const tarjeta = join(demo, "tarjeta.png");
  copyFileSync(join(RAIZ, "src-tauri", "icons", "128x128@2x.png"), tarjeta);
  const plano = join(demo, "plano.html");
  writeFileSync(plano, `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font:17px system-ui,sans-serif;padding:18px;color:#123"><h1 style="font-size:24px">El plano de la tarjeta</h1><p id="r">Sin JavaScript todavía.</p>
<script>
(async () => {
  const r = {};
  try { r.clave = parent.localStorage.getItem("adeorq-movil-clave") ? "LEIDA" : "vacia"; } catch (e) { r.clave = "bloqueada"; }
  try { r.arriba = parent.document.title; } catch (e) { r.arriba = "bloqueada"; }
  try { const x = await fetch("/api/compartidos"); r.api = x.status; } catch (e) { r.api = "bloqueada"; }
  document.body.dataset.r = JSON.stringify(r);
  document.getElementById("r").textContent = "El JavaScript de esta página corre, y esto es lo que alcanza: " + JSON.stringify(r);
})();
</script></body></html>`);
  mkdirSync(join(demo, "BUNKER"), { recursive: true });
  copyFileSync(tarjeta, join(demo, "BUNKER", "foto.png"));

  // El móvil, encendido en su puerto, y emparejado con un código de verdad.
  const enc = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: true }).then((x) => JSON.stringify(x), (m) => "ERROR " + m)`);
  debe(!String(enc).startsWith("ERROR"), "el móvil se enciende", enc);
  debe(await hasta(async () => (await fetch(`${B}/`).catch(() => null))?.ok, 20_000, 300), `la página del móvil contesta en el ${PUERTO_MOVIL}`);
  const codigo = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor, (m) => "ERROR " + m)`);
  const emp = await (await fetch(`${B}/api/emparejar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, nombre: "Laboratorio" }) })).json();
  const clave = emp.clave;
  debe(Boolean(clave), "se empareja con el código de seis cifras", JSON.stringify(emp).slice(0, 80));
  const AUT = { Authorization: `Bearer ${clave}` };

  // El agente comparte por el MCP.
  const m = a.puente(null);
  await m.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const comparte = (args) => m.llamar("compartir_en_el_movil", args);
  const r1 = await comparte({ title: "La tarjeta, color 2", path: tarjeta, project: "demo" });
  debe(/Compartido «La tarjeta, color 2»/.test(r1.texto ?? ""), "comparte una imagen", r1.texto ?? r1.error);
  const r2 = await comparte({ title: "El plano de la tarjeta", path: plano, project: "demo" });
  debe(/marco cerrado/.test(r2.texto ?? ""), "comparte una página de un solo archivo", r2.texto ?? r2.error);
  const r3 = await comparte({ title: "La web del PC", port: PUERTO_WEB, urlPath: "/guia", project: "demo" });
  debe(/captura a ancho de móvil/.test(r3.texto ?? ""), "comparte una web que corre en este PC", r3.texto ?? r3.error);

  // Lo que no se comparte nunca.
  const no = async (args, patron, que) => {
    const r = await comparte({ title: "No", ...args });
    debe(Boolean(r.error) && patron.test(r.error), que, r.error ?? r.texto);
  };
  await no({ path: join(demo, "BUNKER", "foto.png") }, /carpeta protegida/, "una carpeta BUNKER, no");
  await no({ path: "C:\\Apps\\Random APPS\\obsidian\\BUNKER\\PERSONAL\\foto.png" }, /carpeta protegida/, "sus bóvedas BUNKER y PERSONAL, no");
  await no({ path: "C:\\proyectos\\Moneorq\\copias-mama\\recibo.png" }, /carpeta protegida/, "las copias de su madre, no");
  await no({ path: demo }, /nunca una carpeta/, "una carpeta entera, no");
  await no({ path: "C:\\Windows\\Web\\Wallpaper\\Windows\\img0.jpg" }, /Solo se comparte lo que está en|No encuentro/, "lo de fuera de las carpetas de trabajo, no");
  writeFileSync(join(demo, "notas.md"), "# notas\n");
  await no({ path: join(demo, "notas.md") }, /Solo se comparte una imagen/, "un archivo que no es imagen ni página, no");
  await no({ port: 3012 }, /es de Adeorq/, "un puerto de Adeorq, no");
  const libre = await new Promise((listo) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => listo(p)); }); });
  await no({ port: libre }, /No hay nada escuchando/, "un puerto donde no hay nada, no");

  // Por la API del móvil: sin la clave, nada; con ella, lo compartido y nada más.
  debe((await fetch(`${B}/api/compartidos`)).status === 401, "sin la clave del móvil no se ve la lista");
  const lista = (await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? [];
  debe(lista.length === 3, "la lista tiene las tres", lista.map((c) => c.titulo).join(", "));
  debe(lista.every((c) => !("ruta" in c) && !("puerto" in c) && !("camino" in c)), "la lista no dice rutas ni puertos");
  const de = (t) => lista.find((c) => c.tipo === t);
  debe((await fetch(`${B}/api/compartido?id=${de("imagen")?.id}`)).status === 401, "sin la clave no se ve la imagen");
  const img = Buffer.from(await (await fetch(`${B}/api/compartido?id=${de("imagen")?.id}`, { headers: AUT })).arrayBuffer());
  debe(img.equals(readFileSync(tarjeta)), "la imagen llega tal cual", `${img.length} bytes`);
  const pag = await fetch(`${B}/api/compartido?id=${de("pagina")?.id}`, { headers: AUT });
  debe(pag.headers.get("content-type")?.startsWith("text/plain") && (await pag.text()).includes("El plano de la tarjeta"), "la página llega como texto, nunca como página del origen del móvil");
  const t0 = Date.now();
  const cap = Buffer.from(await (await fetch(`${B}/api/compartido?id=${de("web")?.id}`, { headers: AUT })).arrayBuffer());
  const ancho = cap.length > 24 ? cap.readUInt32BE(16) : 0;
  debe(cap.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) && ancho === 824, "la web llega como captura a ancho de móvil", `${ancho} px de ancho, ${Date.now() - t0} ms`);
  for (const raro of ["..%5C..%5Cmovil.json", "C:%5CWindows%5Cwin.ini", "0".repeat(32)]) {
    debe((await fetch(`${B}/api/compartido?id=${raro}`, { headers: AUT })).status === 404, `un id inventado no lleva a nada (${raro.slice(0, 20)})`);
  }

  // Y en la página del móvil, como en su teléfono.
  const { chromium } = createRequire(import.meta.url)(playwrightCore());
  ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${B}/`);
  await page.evaluate((k) => localStorage.setItem("adeorq-movil-clave", k), clave);
  await page.reload();
  await page.waitForSelector("#abrir-cajon");
  await page.click("#abrir-cajon");
  await page.click('[data-ir="compartidos"]');
  await page.waitForSelector(".ver-tarjeta");
  debe(await hasta(() => page.evaluate(() => [...document.querySelectorAll(".ver-mini img")].filter((i) => i.naturalWidth > 0).length === 2), 30_000, 300), "las dos miniaturas de imagen salen en la lista");
  await page.screenshot({ path: join(FOTOS, "para-ver-lista.png") });
  // Ver la lista (y bajar las miniaturas, también la captura de la web) no cuenta como abrirla.
  const sinAbrir = (await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? [];
  debe(sinAbrir.length === 3 && sinAbrir.every((c) => !c.abierto && c.caduca - Date.now() > 11 * 3600_000), "ver la lista no cuenta como abrir: siguen sus 12 h", sinAbrir.map((c) => `${c.tipo} ${Math.round((c.caduca - Date.now()) / 60_000)} min`).join(", "));

  const abrir = async (tipo) => {
    await page.click(`.ver-tarjeta[data-tipo="${tipo}"]`);
    await page.waitForSelector("#visto");
  };
  await abrir("imagen");
  await page.waitForFunction(() => document.querySelector(".ver-img")?.naturalWidth > 0);
  debe((await page.evaluate(() => document.querySelector(".ver-img").naturalWidth)) === 256, "la imagen se abre a pantalla entera");
  await page.screenshot({ path: join(FOTOS, "para-ver-imagen.png") });
  await page.click("#atras");

  await abrir("web");
  await page.waitForFunction(() => document.querySelector(".ver-img")?.naturalWidth > 0, null, { timeout: 30_000 });
  debe((await page.evaluate(() => document.querySelector(".ver-img").naturalWidth)) === 824, "la web se ve como captura");
  // A lo ancho de la pantalla, ni más ni menos (la primera vez se salía y dejaba hueco).
  // Medido con la vista ya quieta: mientras entra deslizándose, la página mide unos píxeles más.
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== "running" || x.effect?.getTiming().iterations === Infinity));
  const medida = await page.evaluate(() => {
    const i = document.querySelector(".ver-img").getBoundingClientRect();
    const c = document.getElementById("visto");
    // Lo que se sale de lo ancho, si algo se sale: con eso se sabe quién ensancha la página.
    const fuera = [...document.querySelectorAll("body *")].filter((x) => x.getBoundingClientRect().right > innerWidth - 0.5 && x.getBoundingClientRect().width > 0).slice(-3).map((x) => `${x.tagName.toLowerCase()}.${x.className}:${Math.round(x.getBoundingClientRect().right)}`);
    return { izq: Math.round(i.left), ancho: Math.round(i.width), pantalla: innerWidth, caja: c.clientWidth, scroll: c.scrollLeft, clases: c.className, fuera, doc: document.documentElement.scrollWidth };
  });
  debe(medida.izq === 0 && medida.ancho === medida.pantalla, "la captura ocupa el ancho de la pantalla", JSON.stringify(medida));
  debe(await page.isVisible("#ver-otra"), "y se puede capturar otra vez");
  await page.click("#ver-otra");
  await page.waitForFunction(() => document.querySelector(".ver-img")?.naturalWidth > 0, null, { timeout: 30_000 });
  await page.screenshot({ path: join(FOTOS, "para-ver-web.png") });
  await page.click("#atras");

  await abrir("pagina");
  await page.waitForSelector("iframe.ver-pagina");
  debe((await page.getAttribute("iframe.ver-pagina", "sandbox")) === "allow-scripts", "la página va en un marco cerrado (sandbox sin allow-same-origin)");
  const marco = await hasta(() => page.frames().find((f) => f !== page.mainFrame()), 10_000, 200);
  const alcanza = marco && (await hasta(() => marco.evaluate(() => document.body.dataset.r || null), 10_000, 200));
  const r = alcanza ? JSON.parse(alcanza) : {};
  debe(Boolean(alcanza), "su JavaScript corre", alcanza);
  debe(r.clave === "bloqueada" && r.arriba === "bloqueada", "no llega a la clave del móvil ni a la página de arriba", alcanza);
  debe(r.api !== 200, "ni a la API del móvil", alcanza);
  await page.screenshot({ path: join(FOTOS, "para-ver-pagina.png") });

  // Un aviso abre lo compartido directamente.
  await page.goto(`${B}/#ver=${de("imagen")?.id}`);
  await page.waitForFunction(() => document.querySelector(".ver-img")?.naturalWidth > 0);
  debe(true, "el enlace de un aviso (#ver=) abre lo compartido");

  // Se limpia sola (Munir, 2026-11-14): lo abierto se va a la hora de mirarlo,
  // y desde la lista se quita una o se vacía todo, cada cosa a dos toques.
  const ahora = await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json();
  const abierta = (ahora.compartidos ?? []).find((c) => c.id === de("imagen")?.id);
  const leQueda = abierta ? abierta.caduca - Date.now() : 0;
  debe(Boolean(abierta?.abierto) && leQueda > 55 * 60_000 && leQueda <= 60 * 60_000, "lo abierto se va a la hora de mirarlo", JSON.stringify(abierta));
  await page.goto(`${B}/`);
  await page.waitForSelector("#abrir-cajon");
  await page.click("#abrir-cajon");
  await page.click('[data-ir="compartidos"]');
  await page.waitForSelector(".ver-tarjeta [data-quitar]");
  const pie = await page.evaluate(() => [...document.querySelectorAll(".ver-tarjeta")].map((t) => t.querySelector(".ver-pie").textContent));
  debe(pie.some((t) => /visto · se va en \d+ min/.test(t)), "la tarjeta de lo abierto dice «visto · se va en N min»", pie.join(" | "));
  debe(await page.isVisible("#ver-vaciar"), "«Vaciar» está arriba de la lista");
  await page.screenshot({ path: join(FOTOS, "para-ver-lista-limpia.png") });
  const quitar = `.ver-tarjeta[data-tipo="pagina"] [data-quitar]`;
  await page.click(quitar);
  debe((await page.textContent(quitar)) === "Toca otra vez", "el primer toque de «Quitar» solo lo arma");
  await page.screenshot({ path: join(FOTOS, "para-ver-quitar-armado.png") });
  await page.click(quitar);
  await page.waitForFunction(() => !document.querySelector('.ver-tarjeta[data-tipo="pagina"]'));
  const tras = (await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? [];
  debe(tras.length === 2 && !tras.some((c) => c.tipo === "pagina"), "«Quitar» la quita también en el PC", tras.map((c) => c.titulo).join(", "));
  debe((await fetch(`${B}/api/compartido?id=${de("pagina")?.id}`, { headers: AUT })).status === 404, "lo quitado ya no se sirve");
  await page.click("#ver-vaciar");
  debe((await page.textContent("#ver-vaciar")) === "Toca otra vez para vaciar", "el primer toque de «Vaciar» solo lo arma");
  await page.click("#ver-vaciar");
  await page.waitForSelector("#compartidos .vacio");
  const final = (await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? [];
  debe(final.length === 0, "«Vaciar» deja la lista vacía", final.map((c) => c.titulo).join(", "));
  await page.screenshot({ path: join(FOTOS, "para-ver-vacia.png") });
} catch (e) {
  debe(false, "el laboratorio entero", e?.stack ?? e);
} finally {
  await ctx?.close().catch(() => {});
  rmSync(perfil, { recursive: true, force: true });
  rmSync(sinProgramas, { recursive: true, force: true });
  web.close();
  await a.cerrar();
}
console.log(`\n${fallos.length ? `${fallos.length} fallos: ${fallos.join("; ")}` : "Todo en su sitio."}  Fotos en ${FOTOS}`);
process.exit(fallos.length ? 1 : 0);
