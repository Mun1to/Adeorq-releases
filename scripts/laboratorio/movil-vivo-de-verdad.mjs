// La web del PC, en vivo en el móvil, de verdad. Munir, 2026-11-14: «que se
// puedan ver localhost etc desde el movil». Una Adeorq aislada (ver `aislada.mjs`)
// con el móvil en otro puerto (4398, así que su web en vivo va en el 4399); un
// `python -m http.server` y un `vite` de desarrollo que escuchan en 127.0.0.1,
// compartidos por el MCP como los compartiría un agente; y un navegador sin
// ventana, a 390 px, que entra por «Abrir en vivo» como entraría su teléfono.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/movil-vivo-de-verdad.mjs [carpeta para las fotos] [exe, con barras de Windows]
//
// Lo que mide: que sin pase no entra nadie; que un pase vale una vez y tres
// minutos (espera a que caduque uno, así que tarda unos tres minutos y medio);
// que solo se llega a la web compartida, nunca a un puerto que pida la petición
// ni a uno de Adeorq; que la cookie del proxy no abre la API del móvil ni la lee
// el JavaScript de la web; que pasan HTTP y el WebSocket del recargado en
// caliente de Vite; y que quitarla de «Para ver» corta el WebSocket al momento.
//
// Con `LAB_TAILSCALE=1` mide además el camino por Tailscale con el nombre de este
// PC: pone `tailscale serve --https=8444` hacia el proxy de la aislada, entra por
// HTTPS desde el navegador y lo quita al acabar (`--https=8444 off`). No toca el
// 8443 del móvil de Munir. La aislada sigue sin ver Tailscale: encender su móvil
// con él a la vista le pondría `tailscale serve` en el 8443. Sale con 1 si algo falla.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");
const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3197;
const DEPURAR = 9397;
const PUERTO_MOVIL = 4398;
const PUERTO_VIVO = PUERTO_MOVIL + 1;
const B = `http://127.0.0.1:${PUERTO_MOVIL}`;
const V = `http://127.0.0.1:${PUERTO_VIVO}`;
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const TAILSCALE = "C:/Program Files/Tailscale/tailscale.exe";
const CON_TAILSCALE = process.env.LAB_TAILSCALE === "1";

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 220)})` : ""}`);
  if (!bien) fallos.push(que);
};

const libre = () => new Promise((listo) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => listo(p)); }); });
const hijos = [];
const lanzar = (exe, args, opciones = {}) => {
  const h = spawn(exe, args, { stdio: "ignore", windowsHide: true, ...opciones });
  hijos.push(h);
  return h;
};

// La web de python, tal cual la levantaría un agente.
const dirPy = mkdtempSync(join(tmpdir(), "vivo-python-"));
writeFileSync(join(dirPy, "index.html"), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#1f4fa3;color:#fff;font:600 26px system-ui,sans-serif"><h1 style="margin:0;padding:28px 24px">Hola desde python</h1></body></html>`);
const PUERTO_PY = await libre();
lanzar("python", ["-m", "http.server", String(PUERTO_PY), "--bind", "127.0.0.1", "--directory", dirPy]);

// Y un Vite de desarrollo con su recargado en caliente.
const dirVite = mkdtempSync(join(tmpdir(), "vivo-vite-"));
const principal = (version) => `document.getElementById("t").textContent = "versión ${version}";
if (import.meta.hot) import.meta.hot.accept();
`;
writeFileSync(join(dirVite, "index.html"), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vite en vivo</title>
<body style="margin:0;background:#6b2fb3;color:#fff;font:600 26px system-ui,sans-serif"><h1 style="margin:0;padding:28px 24px 8px">La web de Vite</h1><p id="t" style="margin:0;padding:0 24px">sin cargar</p>
<script>window.__cargas = (window.__cargas || 0) + 1;</script><script type="module" src="/main.js"></script></body></html>`);
writeFileSync(join(dirVite, "main.js"), principal(1));
// El service worker que intentará registrar desde el móvil (y que no debe quedarse).
writeFileSync(join(dirVite, "sw.js"), `self.addEventListener("fetch", () => {});\n`);
const PUERTO_VITE = await libre();
lanzar(process.execPath, [join(RAIZ, "node_modules", "vite", "bin", "vite.js"), dirVite, "--host", "127.0.0.1", "--port", String(PUERTO_VITE), "--strictPort"], { cwd: dirVite });

debe(Boolean(await hasta(async () => (await fetch(`http://127.0.0.1:${PUERTO_PY}/`).catch(() => null))?.ok, 15_000)), `python escucha en 127.0.0.1:${PUERTO_PY}`);
debe(Boolean(await hasta(async () => (await fetch(`http://127.0.0.1:${PUERTO_VITE}/`).catch(() => null))?.ok, 30_000)), `vite escucha en 127.0.0.1:${PUERTO_VITE}`);

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}`);
}

/** Una petición escrita a mano, para lo que `fetch` no deja mandar. */
const crudo = (puerto, texto) =>
  new Promise((listo) => {
    let d = "";
    const s = net.connect(puerto, "127.0.0.1", () => s.write(texto));
    s.on("data", (b) => (d += b));
    s.on("close", () => listo(d));
    s.on("error", () => listo(d));
    setTimeout(() => s.destroy(), 5000);
  });
const estado = (respuesta) => Number(/^HTTP\/1\.1 (\d{3})/.exec(respuesta)?.[1] ?? 0);

// Sin Tailscale a la vista: la carpeta de programas, vacía, y un PATH de sistema.
const sinProgramas = mkdtempSync(join(tmpdir(), "adeorq-sin-programas-"));
const PATH = ["C:\\WINDOWS\\system32", "C:\\WINDOWS", "C:\\WINDOWS\\System32\\Wbem", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0"].join(";");

const a = await abrirAislada({
  nombre: "vivo",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe: process.argv[3] || EXE,
  entorno: { PATH, Path: PATH, ADEORQ_MOVIL_PUERTO: String(PUERTO_MOVIL), ProgramW6432: sinProgramas, ProgramFiles: sinProgramas },
});
let ctx = null;
let tailscalePuesto = false;
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
try {
  const { v, demo } = a;
  const enc = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_encender", { encendido: true }).then((x) => JSON.stringify(x), (m) => "ERROR " + m)`);
  debe(!String(enc).startsWith("ERROR"), "el móvil se enciende", enc);
  debe(Boolean(await hasta(async () => (await fetch(`${B}/`).catch(() => null))?.ok, 20_000)), `la página del móvil contesta en el ${PUERTO_MOVIL}`);
  const sinPase = await hasta(() => fetch(`${V}/`).catch(() => null), 10_000);
  debe(sinPase?.status === 401 && /Ábrela desde Adeo/.test(await sinPase.text()), `la web en vivo escucha en el ${PUERTO_VIVO} y sin pase no entra nadie`, sinPase?.status);
  const codigo = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor, (m) => "ERROR " + m)`);
  const clave = (await (await fetch(`${B}/api/emparejar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, nombre: "Laboratorio" }) })).json()).clave;
  debe(Boolean(clave), "se empareja con el código de seis cifras");
  const AUT = { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" };

  // El agente comparte las dos webs, y una imagen para ver que esa no se abre en vivo.
  const m = a.puente(null);
  await m.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const comparte = (args) => m.llamar("compartir_en_el_movil", args);
  const rPy = await comparte({ title: "La web de python", port: PUERTO_PY, project: "demo" });
  debe(/Abrir en vivo/.test(rPy.texto ?? ""), "comparte la web de python, y el agente sabe que se abre en vivo", rPy.texto ?? rPy.error);
  const rVite = await comparte({ title: "La web de Vite", port: PUERTO_VITE, project: "demo" });
  debe(Boolean(rVite.texto), "comparte la web de Vite", rVite.texto ?? rVite.error);
  const foto = join(demo, "foto.png");
  copyFileSync(join(RAIZ, "src-tauri", "icons", "128x128@2x.png"), foto);
  await comparte({ title: "Una foto", path: foto });
  for (const p of [3012, 3013, 3014, PUERTO_MCP, PUERTO_MOVIL, PUERTO_VIVO]) {
    const r = await comparte({ title: "No", port: p });
    debe(/es de Adeorq/.test(r.error ?? ""), `el ${p} no se comparte: es de Adeorq`, r.error ?? r.texto);
  }
  const lista = (await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? [];
  const id = (t) => lista.find((c) => c.titulo === t)?.id;
  const [idPy, idVite, idFoto] = [id("La web de python"), id("La web de Vite"), id("Una foto")];
  debe(Boolean(idPy && idVite && idFoto), "las tres están en «Para ver»", lista.map((c) => c.titulo).join(", "));

  // El pase lo da el 3013, solo con la clave del móvil y solo para una web compartida.
  const pedirPase = (cid, cabeceras = AUT) => fetch(`${B}/api/vivo/pase`, { method: "POST", headers: cabeceras, body: JSON.stringify({ id: cid }) });
  debe((await pedirPase(idPy, { "Content-Type": "application/json" })).status === 401, "sin la clave del móvil no hay pase");
  const rFoto = await pedirPase(idFoto);
  debe(rFoto.status === 400 && /no es una web/.test((await rFoto.json()).error ?? ""), "una foto no se abre en vivo");
  debe((await pedirPase("0".repeat(32))).status === 404, "un id inventado no da pase");
  const pase = async (cid) => (await (await pedirPase(cid)).json()).url ?? "";
  // El que caduca, de un compartido aparte (la misma web otra vez): un pase nuevo
  // para lo mismo deja sin valor el que no se usó, y entonces no mediría la hora.
  const rOtra = await comparte({ title: "La web de python, otra vez", port: PUERTO_PY });
  const idPyOtra = ((await (await fetch(`${B}/api/compartidos`, { headers: AUT })).json()).compartidos ?? []).find((c) => c.titulo === "La web de python, otra vez")?.id;
  debe(Boolean(idPyOtra), "la misma web se puede compartir otra vez", rOtra.error);
  const viejo = await pase(idPyOtra);
  const viejoDesde = Date.now();
  debe(viejo.startsWith(`${V}/__adeorq/entrar?pase=`), "el pase entra por el otro puerto, el del proxy", viejo.replace(/pase=.*/, "pase=…"));

  // Entrar con el pase, sin navegador: se cambia por una cookie del proxy.
  const entrar = (url, extra = {}) => fetch(url, { redirect: "manual", ...extra });
  debe((await entrar(`${V}/__adeorq/entrar?pase=${"0".repeat(32)}`)).status === 403, "un pase inventado no entra");
  const sustituido = await pase(idPy);
  const unPase = await pase(idPy);
  debe((await entrar(sustituido)).status === 403, "un pase nuevo para lo mismo deja sin valor el que no se usó");
  debe((await entrar(unPase, { method: "POST" })).status === 405, "el pase solo se canjea con GET");
  const dentro = await entrar(unPase);
  const galleta = dentro.headers.getSetCookie().find((c) => c.startsWith("adeorq_vivo=")) ?? "";
  debe(dentro.status === 303 && dentro.headers.get("location") === "/" && /HttpOnly/.test(galleta) && /SameSite=Strict/.test(galleta), "con el pase entra: 303 a la web y una cookie HttpOnly y SameSite=Strict", `${dentro.status} ${galleta.replace(/=[^;]+/, "=…")}`);
  const token = /adeorq_vivo=([^;]+)/.exec(galleta)?.[1] ?? "";
  const GALLETA = { Cookie: `adeorq_vivo=${token}` };
  debe((await entrar(unPase)).status === 403, "y el mismo pase, ya usado, no vuelve a entrar");
  const portada = await fetch(`${V}/`, { headers: GALLETA });
  debe(portada.status === 200 && /Hola desde python/.test(await portada.text()), "con la cookie, el proxy sirve la web de python");
  const otraRuta = await fetch(`${V}/no-existe?puerto=3012`, { headers: GALLETA });
  debe(otraRuta.status === 404 && /SimpleHTTP/.test(otraRuta.headers.get("server") ?? ""), "cualquier ruta va a la web compartida, nunca a otro puerto", `${otraRuta.status} ${otraRuta.headers.get("server")}`);

  // Lo que el proxy no deja pasar.
  const absoluta = await crudo(PUERTO_VIVO, `GET http://127.0.0.1:3012/ HTTP/1.1\r\nHost: 127.0.0.1:3012\r\nCookie: adeorq_vivo=${token}\r\n\r\n`);
  debe(estado(absoluta) === 400, "una petición que pide otro puerto en la URL no pasa", absoluta.split("\r\n")[0]);
  const ajeno = await crudo(PUERTO_VIVO, `GET / HTTP/1.1\r\nHost: evil.example\r\nCookie: adeorq_vivo=${token}\r\n\r\n`);
  debe(estado(ajeno) === 421, "con un Host ajeno no pasa", ajeno.split("\r\n")[0]);
  debe((await fetch(`${V}/`, { headers: { ...GALLETA, Origin: "http://evil.example" } })).status === 403, "con un Origin ajeno no pasa");
  debe((await fetch(`${V}/__adeorq/otra`, { headers: GALLETA })).status === 404, "lo de Adeorq en el proxy es solo la entrada");
  debe((await fetch(`${B}/api/compartidos`, { headers: GALLETA })).status === 401, "la cookie del proxy no abre la API del móvil");
  const dePega = await fetch(`${V}/`, { headers: { Cookie: `adeorq_vivo=${"0".repeat(32)}` } });
  debe(dePega.status === 401 && dePega.headers.getSetCookie().some((c) => /Max-Age=0/.test(c)), "una cookie inventada no entra y se borra");
  // Un navegador, una web: entrar otra vez desde el mismo navegador tumba la sesión de antes.
  const otra = await entrar(await pase(idPy), { headers: GALLETA });
  const token2 = /adeorq_vivo=([^;]+)/.exec(otra.headers.getSetCookie().join(";"))?.[1] ?? "";
  debe(token2 && token2 !== token && (await fetch(`${V}/`, { headers: GALLETA })).status === 401, "entrar otra vez desde el mismo navegador cierra la sesión de antes");

  // De la revisión de Securo: todas las webs en vivo comparten este origen, así
  // que ni caché, ni service workers, ni lo que dejó otra web en él.
  const GALLETA2 = { Cookie: `adeorq_vivo=${token2}` };
  debe(dentro.headers.get("clear-site-data") === '"storage"', "entrar sin sesión de antes borra lo que otra web dejó en este origen", dentro.headers.get("clear-site-data"));
  debe(otra.headers.get("clear-site-data") === null, "volver a la misma web conserva lo suyo", otra.headers.get("clear-site-data"));
  const sinCache = await fetch(`${V}/`, { headers: GALLETA2 });
  debe(sinCache.status === 200 && sinCache.headers.get("cache-control") === "no-store", "lo que pasa por el proxy no se guarda en caché", `${sinCache.status} ${sinCache.headers.get("cache-control")}`);
  const sw = await fetch(`${V}/sw.js`, { headers: { ...GALLETA2, "Service-Worker": "script" } });
  debe(sw.status === 403, "no se instala ningún service worker", sw.status);
  const colada = await fetch(`${V}/`, { headers: { ...GALLETA2, "Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "script" } });
  debe(colada.status === 403, "otra web del mismo sitio no cuela un script con la cookie", colada.status);
  // Un aparato que se olvida pierde también lo que tenía abierto en vivo.
  const codigo2 = await v.js(`window.__TAURI_INTERNALS__.invoke("movil_emparejar").then((x) => x.valor, (m) => "ERROR " + m)`);
  const clave2 = (await (await fetch(`${B}/api/emparejar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: codigo2, nombre: "Otro aparato" }) })).json()).clave;
  const AUT2 = { Authorization: `Bearer ${clave2}`, "Content-Type": "application/json" };
  const entra2 = await entrar((await (await pedirPase(idPy, AUT2)).json()).url ?? `${V}/`);
  const GALLETA3 = { Cookie: `adeorq_vivo=${/adeorq_vivo=([^;]+)/.exec(entra2.headers.getSetCookie().join(";"))?.[1] ?? ""}` };
  debe((await fetch(`${V}/`, { headers: GALLETA3 })).status === 200, "otro aparato emparejado entra con su propio pase");
  await fetch(`${B}/api/olvidarme`, { method: "POST", headers: AUT2, body: "{}" });
  debe((await fetch(`${V}/`, { headers: GALLETA3 })).status === 401, "al olvidarse ese aparato, deja de ver la web en vivo");
  debe((await fetch(`${V}/`, { headers: GALLETA2 })).status === 200, "y el que sigue emparejado la sigue viendo");

  // En la página del móvil, como en su teléfono, y la web en otra pestaña.
  const { chromium } = createRequire(import.meta.url)(playwrightCore());
  ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const sockets = [];
  const consola = [];
  ctx.on("page", (p) => {
    p.on("websocket", (ws) => {
      const s = { url: ws.url(), abierto: Date.now(), cerrado: 0 };
      sockets.push(s);
      ws.on("close", () => (s.cerrado = Date.now()));
    });
    p.on("console", (msg) => consola.push(msg.text()));
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${B}/`);
  await page.evaluate((k) => localStorage.setItem("adeorq-movil-clave", k), clave);
  // La clave se lee al cargar: sin recargar, la página sigue sin emparejar.
  await page.reload();
  await page.waitForSelector("#abrir-cajon");
  await page.goto(`${B}/#ver=${idVite}`);
  const conBoton = await page.waitForSelector("#ver-vivo[href]", { timeout: 15_000 }).catch(() => null);
  if (!conBoton) throw new Error(`«Abrir en vivo» no tiene pase: ${await page.evaluate(() => document.getElementById("ver-vivo-nota")?.textContent ?? document.getElementById("visto")?.textContent ?? document.body.innerText.slice(0, 200))}`);
  const href = await page.getAttribute("#ver-vivo", "href");
  debe(href.startsWith(`${V}/__adeorq/entrar?pase=`), "«Abrir en vivo» lleva un pase ya pedido, como un enlace de verdad", href.replace(/pase=.*/, "pase=…"));
  await page.waitForFunction(() => document.querySelector(".ver-img")?.naturalWidth > 0, null, { timeout: 30_000 });
  debe(true, "la captura sigue ahí como vista previa");
  await page.screenshot({ path: join(FOTOS, "vivo-boton.png") });

  const [pestana] = await Promise.all([ctx.waitForEvent("page"), page.click("#ver-vivo")]);
  await pestana.waitForLoadState("load");
  await pestana.waitForFunction(() => document.getElementById("t")?.textContent === "versión 1", null, { timeout: 20_000 });
  debe(pestana.url() === `${V}/`, "se abre en otra pestaña, en la web y sin el pase en la dirección", pestana.url());
  const hmr = await hasta(() => sockets.find((s) => s.url.startsWith(`ws://127.0.0.1:${PUERTO_VIVO}/`)), 10_000, 200);
  debe(Boolean(hmr), "el WebSocket del recargado en caliente de Vite se abre a través del proxy", hmr?.url.replace(/token=.*/, "token=…") ?? consola.join(" | "));
  writeFileSync(join(dirVite, "main.js"), principal(2));
  const cambiado = await hasta(() => pestana.evaluate(() => document.getElementById("t")?.textContent === "versión 2" && window.__cargas === 1), 15_000, 200);
  debe(Boolean(cambiado), "cambiar el archivo en el PC cambia la web del móvil al momento, sin recargarla", consola.filter((t) => t.includes("vite")).join(" | "));
  const alcance = await pestana.evaluate(async (b) => {
    const r = { clave: localStorage.getItem("adeorq-movil-clave"), cookie: document.cookie };
    try { r.api = (await fetch(`${b}/api/compartidos`)).status; } catch { r.api = "bloqueada"; }
    return r;
  }, B);
  debe(alcance.clave === null && !/adeorq_vivo/.test(alcance.cookie) && alcance.api !== 200, "su JavaScript no llega a la clave del móvil, ni a la cookie del proxy, ni a la API del móvil", JSON.stringify(alcance));
  const registro = await pestana.evaluate(() => navigator.serviceWorker.register("/sw.js").then(() => "instalado", (e) => `rechazado: ${e.message}`));
  debe(registro.startsWith("rechazado"), "la web no puede instalar un service worker", registro);
  await pestana.evaluate(() => localStorage.setItem("de-vite", "1"));
  await pestana.screenshot({ path: join(FOTOS, "vivo-vite.png") });
  // Y al quitar el botón tras usarlo, se pide otro pase.
  debe(Boolean(await hasta(() => page.evaluate(() => document.querySelector("#ver-vivo")?.getAttribute("href")), 10_000, 200)), "tras tocarlo, «Abrir en vivo» se recarga con un pase nuevo");

  // Quitarla de «Para ver» corta al momento, también el WebSocket ya abierto.
  const quitada = Date.now();
  await fetch(`${B}/api/compartidos/quitar`, { method: "POST", headers: AUT, body: JSON.stringify({ id: idVite }) });
  const corte = await hasta(() => hmr?.cerrado || null, 5_000, 50);
  debe(Boolean(corte), "quitarla corta el WebSocket abierto", corte ? `${corte - quitada} ms` : "sigue abierto");
  const tras = await pestana.reload();
  debe(tras?.status() === 410 && /Ya no está compartida/.test(await pestana.content()), "y recargar dice que ya no está compartida", tras?.status());
  await pestana.screenshot({ path: join(FOTOS, "vivo-quitada.png") });
  await pestana.close();

  // La de python, por el navegador también.
  await page.goto(`${B}/#ver=${idPy}`);
  await page.waitForSelector("#ver-vivo[href]", { timeout: 15_000 });
  const [py] = await Promise.all([ctx.waitForEvent("page"), page.click("#ver-vivo")]);
  await py.waitForLoadState("load");
  debe(/Hola desde python/.test(await py.content()), "la web de python se abre en vivo desde el móvil");
  debe((await py.evaluate(() => localStorage.getItem("de-vite"))) === null, "lo que la web de Vite dejó en el navegador no le llega a la de python");
  debe((await page.evaluate(() => localStorage.getItem("adeorq-movil-clave"))) === clave, "y la página del móvil sigue emparejada (su origen no se toca)");
  await py.screenshot({ path: join(FOTOS, "vivo-python.png") });

  if (CON_TAILSCALE) {
    const estadoTs = JSON.parse(spawnSync(TAILSCALE, ["status", "--json"], { encoding: "utf8" }).stdout || "{}");
    const nombre = String(estadoTs.Self?.DNSName ?? "").replace(/\.$/, "");
    const antes = JSON.parse(spawnSync(TAILSCALE, ["serve", "status", "--json"], { encoding: "utf8" }).stdout || "{}");
    const ocupado = Object.keys(antes.Web ?? {}).some((k) => k.endsWith(":8444"));
    debe(nombre.endsWith(".ts.net") && !ocupado, "Tailscale: este PC tiene nombre y el 8444 está libre", `${nombre} ${ocupado ? "8444 ocupado" : ""}`);
    if (nombre && !ocupado) {
      const puesto = spawnSync(TAILSCALE, ["serve", "--bg", "--https=8444", V], { encoding: "utf8", timeout: 30_000 });
      tailscalePuesto = true;
      debe(puesto.status === 0, "Tailscale: el 8444 lleva al proxy de la aislada", (puesto.stdout + puesto.stderr).trim());
      // El 3013 da la dirección por Tailscale si el móvil vino por su nombre.
      const porTs = await new Promise((listo) => {
        const r = http.request(`${B}/api/vivo/pase`, { method: "POST", headers: { ...AUT, Host: `${nombre}:8443` } }, (res) => {
          let d = "";
          res.on("data", (b) => (d += b));
          res.on("end", () => listo(JSON.parse(d || "{}")));
        });
        r.on("error", () => listo({}));
        r.end(JSON.stringify({ id: idPy }));
      });
      debe(String(porTs.url).startsWith(`https://${nombre}:8444/__adeorq/entrar?pase=`), "Tailscale: el pase pedido por su nombre entra por el 8444 con HTTPS", String(porTs.url).replace(/pase=.*/, "pase=…"));
      const ts = await ctx.newPage();
      const t0 = Date.now();
      const r = await ts.goto(porTs.url, { timeout: 30_000 }).catch((e) => e);
      const html = await ts.content().catch(() => "");
      debe(/Hola desde python/.test(html), "Tailscale: el navegador entra por HTTPS y ve la web de python", `${r?.status?.() ?? r} en ${Date.now() - t0} ms, ${ts.url()}`);
      const segura = (await ctx.cookies(`https://${nombre}:8444/`)).find((c) => c.name === "adeorq_vivo");
      debe(Boolean(segura?.secure && segura?.httpOnly), "Tailscale: la cookie va marcada Secure y HttpOnly", JSON.stringify(segura ? { secure: segura.secure, httpOnly: segura.httpOnly, sameSite: segura.sameSite } : null));
      await ts.screenshot({ path: join(FOTOS, "vivo-tailscale.png") });
      await ts.close();
    }
  }

  // Vaciar «Para ver» corta lo que siga abierto.
  await fetch(`${B}/api/compartidos/vaciar`, { method: "POST", headers: AUT, body: "{}" });
  const vaciada = await py.reload();
  debe(vaciada?.status() === 410, "«Vaciar» corta también la web en vivo", vaciada?.status());

  // El pase del principio, caducado: vale tres minutos.
  const falta = viejoDesde + 3 * 60_000 + 2_000 - Date.now();
  if (process.env.LAB_RAPIDO === "1") {
    console.log("      (LAB_RAPIDO: sin esperar a que caduque el primer pase)");
  } else if (falta > 0) {
    console.log(`      (esperando ${Math.round(falta / 1000)} s a que caduque el primer pase)`);
    await dormir(falta);
  }
  if (process.env.LAB_RAPIDO !== "1") {
    const caducado = await entrar(viejo);
    debe(caducado.status === 403 && /ya no vale/.test(await caducado.text()), "un pase de hace más de tres minutos no entra");
  }
} catch (e) {
  debe(false, "el laboratorio entero", e?.stack ?? e);
} finally {
  if (tailscalePuesto) {
    const quitado = spawnSync(TAILSCALE, ["serve", "--https=8444", "off"], { encoding: "utf8", timeout: 30_000 });
    console.log(`      (Tailscale: 8444 quitado, ${quitado.status === 0 ? "bien" : (quitado.stdout + quitado.stderr).trim()})`);
  }
  await ctx?.close().catch(() => {});
  for (const h of hijos) spawnSync("taskkill", ["/PID", String(h.pid), "/T", "/F"], { stdio: "ignore" });
  await a.cerrar();
  for (const d of [perfil, sinProgramas, dirPy, dirVite]) rmSync(d, { recursive: true, force: true });
}
console.log(`\n${fallos.length ? `${fallos.length} fallos: ${fallos.join("; ")}` : "Todo en su sitio."}  Fotos en ${FOTOS}`);
process.exit(fallos.length ? 1 : 0);
