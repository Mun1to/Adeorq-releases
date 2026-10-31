// Todo lo que carga la ventana de Adeorq, medido, y lo que la CSP le bloquea.
//
// La CSP de `tauri.conf.json` solo rige en el programa con la interfaz DENTRO
// (`http://tauri.localhost`); el binario de desarrollo carga de `localhost:1420`
// y no la lleva. Por eso este laboratorio pide uno empaquetado:
//
//   1. pnpm build
//   2. CARGO_TARGET_DIR=C:\ct\csp cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol
//      (en otra carpeta que C:\ct\debug, que es de las demás sesiones; ~2 min con la caché)
//   3. node scripts/laboratorio/csp-ventana.mjs C:\ct\csp\debug\adeorq.exe
//
// Abre la app aislada (casa, datos y navegador en una carpeta temporal, ver
// `aislada.mjs`) y recorre lo que carga algo: todas las pestañas y secciones
// de Ajustes, el fondo con foto y con vídeo, un mod, el lienzo con una
// terminal (xterm y su WebGL) y una web en iframe con la sonda del editor.
// Escucha `securitypolicyviolation` todo el rato. La web del iframe es de este
// guion y prueba, con clics de verdad, lo que el `sandbox` no debe quitar
// (scripts, almacenamiento, WebGL, formularios, ventanas, descargas) y lo que
// sí (llevarse la ventana entera a otra dirección). Las descargas se deniegan
// por el puerto de depuración: no llega nada a tu carpeta de Descargas.
//
// Sale con 1 si hay una sola violación de CSP o si el iframe no hace lo que debe.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXE = process.argv[2] ?? "C:\\ct\\csp\\debug\\adeorq.exe";
const DEPURAR = 9700 + (process.pid % 100);
const MCP = 3700 + (process.pid % 100);

let fallos = 0;
const dice = (bien, que) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

/* ── La web del iframe ─────────────────────────────────────────────────── */
const golpes = [];
const SONDA = readFileSync(join(RAIZ, "vite-plugin-adeorq", "sonda.js"), "utf8").replace("__ADEORQ_RAIZ__", JSON.stringify("C:/lab/demo"));
const di = `const di = (k, v) => parent.postMessage({ lab: { k, v } }, "*");`;
const PAGINA = `<!doctype html><meta charset="utf-8"><title>lab</title>
<style>body{margin:0;font:14px sans-serif} .b{display:block;box-sizing:border-box;width:200px;height:40px;margin:0 0 10px;border:0;background:#ddd;color:#000;text-decoration:none}</style>
<button class="b" id="b0">ventana</button>
<a class="b" id="b1" href="/descarga" download="lab.txt">descarga</a>
<form action="/form" method="post"><button class="b" id="b2" name="x" value="1">formulario</button></form>
<button class="b" id="b3">llevarse la ventana</button>
<script>${di}
di("script", true);
try { localStorage.setItem("lab", "1"); di("almacen", localStorage.getItem("lab") === "1"); } catch (e) { di("almacen", String(e).slice(0, 80)); }
try { di("webgl", !!document.createElement("canvas").getContext("webgl")); } catch (e) { di("webgl", String(e).slice(0, 80)); }
document.getElementById("b0").onclick = () => { let w = null; try { w = window.open("/emergente", "_blank"); } catch (e) {} di("ventana", !!w); };
document.getElementById("b3").onclick = () => { try { top.location.href = location.origin + "/fuera"; di("arriba", "intentado"); } catch (e) { di("arriba", "bloqueado"); } };
</script>
<script src="/@adeorq/sonda.js"></script>`;
const servidor = createServer((req, res) => {
  golpes.push(req.method + " " + req.url);
  const html = (s) => (res.writeHead(200, { "content-type": "text/html; charset=utf-8" }), res.end(s));
  if (req.url === "/") return html(PAGINA);
  if (req.url === "/@adeorq/sonda.js") return res.writeHead(200, { "content-type": "text/javascript" }), res.end(SONDA);
  if (req.url === "/form") return html(`<script>${di} di("formulario", true); setTimeout(() => location.href = "/", 300);</script>`);
  if (req.url === "/descarga") return res.writeHead(200, { "content-type": "text/plain", "content-disposition": "attachment; filename=lab.txt" }), res.end("lab");
  if (req.url === "/emergente") return html("<title>emergente</title>emergente");
  if (req.url === "/fuera") return html("<title>fuera</title>la ventana de Adeorq se ha ido de casa");
  res.writeHead(404), res.end();
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${servidor.address().port}/`;

/* ── Lo que escucha la ventana desde antes de cargar ───────────────────── */
const OIDO = `(() => {
  const L = (window.__lab = { csp: [], cargas: {}, trabajadores: [], marco: [], sonda: [] });
  const apunta = (clave) => (L.cargas[clave] = (L.cargas[clave] || 0) + 1);
  const clase = (url, como) => {
    try { const u = new URL(url, location.href); apunta((/^(blob|data):$/.test(u.protocol) ? u.protocol : u.origin) + " " + como); } catch {}
  };
  document.addEventListener("securitypolicyviolation", (e) => L.csp.push({ directiva: e.effectiveDirective, bloqueado: e.blockedURI, en: (e.sourceFile || "").slice(-50) + ":" + e.lineNumber, muestra: (e.sample || "").slice(0, 60) }));
  const W = window.Worker;
  window.Worker = function (u, o) { L.trabajadores.push(String(u).slice(0, 30)); clase(String(u), "worker"); return new W(u, o); };
  window.Worker.prototype = W.prototype;
  const f = window.fetch;
  window.fetch = function (a, b) { clase(typeof a === "string" ? a : (a && a.url) || String(a), "fetch"); return f.apply(this, arguments); };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => clase(e.name, e.initiatorType))).observe({ type: "resource", buffered: true });
  window.addEventListener("message", (e) => {
    if (e.data && e.data.lab) L.marco.push({ ...e.data.lab, origen: e.origin });
    if (e.data && e.data.de === "adeorq-sonda") L.sonda.push({ tipo: e.data.tipo, origen: e.origin });
  });
  /* Lo que hay en el DOM ahora mismo: de dónde viene cada src/href, y cuántos
     estilos en línea y hojas <style> hay (los de React, xterm y los mods). */
  L.barrer = () => {
    document.querySelectorAll("[src],link[href],video,source").forEach((n) => n.src || n.href ? clase(n.src || n.href, "dom-" + n.tagName.toLowerCase()) : 0);
    L.cargas["estilo en línea (atributo)"] = Math.max(L.cargas["estilo en línea (atributo)"] || 0, document.querySelectorAll("[style]").length);
    L.cargas["hojas <style>"] = Math.max(L.cargas["hojas <style>"] || 0, document.querySelectorAll("style").length);
    L.cargas["fuentes cargadas"] = Math.max(L.cargas["fuentes cargadas"] || 0, [...document.fonts].filter((x) => x.status === "loaded").length);
    L.cargas["lienzos webgl"] = Math.max(L.cargas["lienzos webgl"] || 0, [...document.querySelectorAll("canvas")].filter((c) => { try { return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }).length);
  };
})()`;

/* ── Lo que se siembra ─────────────────────────────────────────────────── */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const sembrar = (datos) => {
  mkdirSync(join(datos, "mods", "lab-csp"), { recursive: true });
  writeFileSync(join(datos, "mods", "lab-csp", "mod.json"), JSON.stringify({ id: "lab-csp", nombre: "Laboratorio CSP", hecho_para: "0.9.235", tipo: "estilo" }));
  writeFileSync(join(datos, "mods", "lab-csp", "estilo.css"), ".topbar { --lab-csp: 1; }");
  writeFileSync(join(datos, "fondo-lab.png"), PNG);
  writeFileSync(join(datos, "fondo-lab.mp4"), Buffer.alloc(64));
  writeFileSync(
    join(datos, "lienzo.json"),
    JSON.stringify({
      kind: "adeorq-lienzo",
      v: 1,
      guardado: new Date().toISOString(),
      proyecto: "demo",
      nodos: [
        { tipo: "term", id: "7", x: 0, y: 0, w: 560, h: 360, kind: "shell", proyecto: "demo", cmd: ["cmd.exe", "/k", "echo lab"] },
        { tipo: "web", id: "9", x: 620, y: 0, w: 560, h: 420, url: WEB },
      ],
      flechas: [],
      trazos: [],
    }),
  );
};

/* ── El navegador por dentro: descargas y ventanas nuevas ──────────────── */
async function navegadorEntero() {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${DEPURAR}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok, mal) => ((ws.onopen = ok), (ws.onerror = mal)));
  const eventos = [];
  let n = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method) eventos.push(m);
  };
  const enviar = (method, params = {}) => ws.send(JSON.stringify({ id: ++n, method, params }));
  enviar("Browser.setDownloadBehavior", { behavior: "deny", eventsEnabled: true });
  enviar("Target.setDiscoverTargets", { discover: true });
  return { eventos, enviar, cerrar: () => ws.close() };
}

const a = await abrirAislada({ nombre: "csp", puertoMcp: MCP, depurar: DEPURAR, exe: EXE, sembrar, guarda: OIDO });
let nav;
try {
  const { v } = a;
  nav = await navegadorEntero();
  const lab = (expr) => v.js(`(() => { const L = window.__lab; ${expr} })()`);
  const clic = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) await v.enviar("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };

  // Los mods vienen apagados de fábrica: se encienden para que su hoja cuente.
  await v.js(`localStorage.setItem("adeorq-mods", "1"); "ok"`);
  await v.enviar("Page.reload");
  await hasta(() => v.js(`document.readyState === "complete" && !!window.__lab && !!document.querySelector(".topbar")`), 20_000);
  await dormir(2500);
  console.log(`origen de la ventana: ${await v.js("location.origin")}`);
  await v.js(`fetch("https://example.invalid/csp-sonda").catch(() => 0); "ok"`);
  await dormir(800);
  const puesta = (await lab("return L.csp.filter((c) => c.bloqueado.includes('example.invalid')).length")) > 0;
  dice(puesta, `la CSP está en vigor (${puesta ? "bloquea una petición a example.invalid" : "la ventana no tiene CSP"})`);

  // Todas las pestañas, y dentro de Ajustes todas sus secciones.
  const pestanas = await v.js(`[...document.querySelectorAll('.topbar .tab[data-tab]')].map((b) => b.dataset.tab)`);
  for (const p of pestanas) {
    if (p === "agenda") continue; // abre la brújula con SU cuenta: la guarda la tapa, pero no se pasea
    await v.js(`document.querySelector('.topbar .tab[data-tab="${p}"]').click(); "ok"`);
    await dormir(900);
    await lab("L.barrer()");
    if (p === "ajustes") {
      const n = await v.js(`document.querySelectorAll(".set-tab").length`);
      for (let i = 0; i < n; i++) {
        await v.js(`document.querySelectorAll(".set-tab")[${i}].click(); "ok"`);
        await dormir(400);
        await lab("L.barrer()");
      }
    }
  }
  console.log(`pestañas recorridas: ${pestanas.filter((p) => p !== "agenda").join(", ")} (Agenda fuera: usa la cuenta de la brújula)`);

  // Lo que el recorrido no pisa solo, hecho como lo hace la app: imágenes del
  // lienzo y de Archivos (`blob:` y `data:`), la voz (`<audio>` con `data:`),
  // el PDF del editor (`blob:` en un iframe), un worker `blob:` y la brújula
  // de la Agenda (sin credenciales: contesta 401 y basta para ver la CSP).
  const sueltas = await v.js(`(async () => {
    const png = Uint8Array.from(atob(${JSON.stringify(PNG.toString("base64"))}), (c) => c.charCodeAt(0));
    const img = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok("carga"); i.onerror = () => ok("error"); i.src = src; });
    const r = {};
    r.imagenBlob = await img(URL.createObjectURL(new Blob([png], { type: "image/png" })));
    r.imagenData = await img("data:image/png;base64,${PNG.toString("base64")}");
    const a = document.createElement("audio"); a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="; a.load();
    const f = document.createElement("iframe"); f.style.display = "none"; f.src = URL.createObjectURL(new Blob(["%PDF-1.1"], { type: "application/pdf" })); document.body.appendChild(f);
    try { const w = new Worker(URL.createObjectURL(new Blob(["postMessage(1)"], { type: "text/javascript" }))); r.worker = await new Promise((ok) => { w.onmessage = () => ok("corre"); w.onerror = () => ok("error"); setTimeout(() => ok("mudo"), 2000); }); w.terminate(); } catch (e) { r.worker = String(e).slice(0, 60); }
    r.brujula = await new Promise((ok) => { const x = new XMLHttpRequest(); x.open("GET", "https://ijraewpmsgwmxmfgwwae.supabase.co/rest/v1/"); x.onload = () => ok("contesta " + x.status); x.onerror = () => ok("error"); x.send(); });
    r.mod = getComputedStyle(document.querySelector(".topbar")).getPropertyValue("--lab-csp").trim() || "no aplicado";
    await new Promise((ok) => setTimeout(ok, 800));
    f.remove();
    return r;
  })()`);
  console.log(`sueltas: ${JSON.stringify(sueltas)}`);
  dice(sueltas.imagenBlob === "carga" && sueltas.imagenData === "carga", "las imágenes blob: y data: cargan");
  dice(sueltas.worker === "corre", `un worker blob: corre (${sueltas.worker})`);
  dice(/contesta/.test(sueltas.brujula), `la brújula de la Agenda se alcanza (${sueltas.brujula})`);
  dice(sueltas.mod === "1", `el mod sembrado se aplica (${sueltas.mod})`);

  // El fondo, con foto y con vídeo: la app lo copia a sus datos y lo sirve por `asset:`.
  for (const f of ["fondo-lab.png", "fondo-lab.mp4"]) {
    const r = await v.js(`window.__TAURI_INTERNALS__.invoke("set_fondo", { path: ${JSON.stringify(join(a.base, "datos", "Adeorq", f))} }).then(() => "", (x) => String(x))`);
    if (r) console.log(`  set_fondo ${f}: ${r}`);
    await v.enviar("Page.reload");
    await hasta(() => v.js(`document.readyState === "complete" && !!window.__lab && !!document.querySelector(".app, #root > *")`), 20_000);
    await dormir(2500);
    await lab("L.barrer()");
    console.log(`  fondo ${f}: ${await v.js(`[...document.querySelectorAll("img[src*='fondo'],video[src*='fondo'],video source")].map((n) => n.tagName + " " + (n.src || "").slice(0, 60)).join(" | ") || "no se pinta"`)}`);
  }

  // El lienzo: la terminal (xterm, WebGL) y la web en iframe con la sonda.
  await v.js(`document.querySelector('.topbar .tab[data-tab="lienzo"]').click(); "ok"`);
  const marco = await hasta(() => v.js(`(() => { const f = document.querySelector("iframe.web-frame"); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, esc: r.width / f.offsetWidth, sandbox: f.getAttribute("sandbox") }; })()`), 20_000);
  await hasta(() => lab("return L.marco.some((m) => m.k === 'script') || null"), 15_000);
  await dormir(1500);
  await lab("L.barrer()");
  console.log(`iframe del lienzo: sandbox=${JSON.stringify(marco?.sandbox)}`);

  // La sonda contesta al saludo de Adeorq, y con qué origen ve a la ventana.
  await v.js(`document.querySelector("iframe.web-frame").contentWindow.postMessage({ de: "adeorq", tipo: "hola" }, "*"); "ok"`);
  await dormir(800);
  const sonda = await lab("return L.sonda");
  dice(sonda.some((m) => m.tipo === "lista"), `la sonda del iframe habla con la ventana (${sonda.map((m) => m.tipo).join(", ") || "nada"})`);

  // Los clics de verdad: la tapa primero (el lienzo la pone encima de la web).
  const tapa = await v.js(`(() => { const t = document.querySelector(".web-tapa"); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (tapa) await clic(tapa.x, tapa.y);
  await dormir(400);
  // El lienzo encuadra con una animación: el sitio bueno es el de ahora.
  Object.assign(marco, await v.js(`(() => { const f = document.querySelector("iframe.web-frame"); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, esc: r.width / f.offsetWidth }; })()`));
  const boton = (i) => ({ x: marco.x + 100 * marco.esc, y: marco.y + (20 + i * 50) * marco.esc });
  const debajo = await v.js(`(() => { const p = ${JSON.stringify(boton(0))}; const e = document.elementFromPoint(p.x, p.y); return (e ? e.tagName + "." + e.className : "nada") + " en " + Math.round(p.x) + "," + Math.round(p.y) + " de " + innerWidth + "x" + innerHeight; })()`);
  console.log(`tapa ${tapa ? "pulsada" : "no había"}; debajo del primer botón: ${debajo}`);
  for (const i of [0, 1]) {
    const b = boton(i);
    await clic(b.x, b.y);
    await dormir(1200);
  }
  const b2 = boton(2);
  await clic(b2.x, b2.y);
  await hasta(() => lab("return L.marco.some((m) => m.k === 'formulario') || null"), 6_000);
  await dormir(1200); // vuelve a «/» sola
  // Se lee todo ANTES del último clic: si la web se lleva la ventana, lo
  // apuntado en ella se pierde con la página.
  await lab("L.barrer()");
  const fin = await lab("return { csp: L.csp, cargas: L.cargas, trabajadores: L.trabajadores }");
  const marcoDice = await lab("return L.marco");
  const b3 = boton(3);
  await clic(b3.x, b3.y);
  await dormir(2000);
  const arriba = await lab("return L.marco.filter((m) => m.k === 'arriba').map((m) => m.v).pop()").catch(() => null);

  const de = (k) => marcoDice.filter((m) => m.k === k).map((m) => m.v).pop();
  const descargas = nav.eventos.filter((e) => e.method === "Browser.downloadWillBegin").length;
  const emergentes = nav.eventos.filter((e) => e.method === "Target.targetCreated" && /emergente/.test(e.params?.targetInfo?.url ?? "")).map((e) => e.params.targetInfo.targetId);
  for (const id of emergentes) nav.enviar("Target.closeTarget", { targetId: id });
  const seFue = golpes.includes("GET /fuera");
  dice(de("script") === true, "en el iframe corren los scripts");
  dice(de("almacen") === true, `y tiene su almacenamiento (${de("almacen")})`);
  dice(de("webgl") === true, `y WebGL (${de("webgl")})`);
  dice(de("formulario") === true, "y envía formularios");
  // Medido el 2026-10-31 con la ventana SIN sandbox: `window.open` ya daba null, porque la
  // ventana principal de Tauri no abre emergentes. Se apunta, no se exige.
  console.log(`     ventanas: window.open dice ${de("ventana")}, ${emergentes.length} destino(s) nuevo(s), ${golpes.includes("GET /emergente") ? "con" : "sin"} petición`);
  dice(descargas > 0, `y descarga (${descargas} descarga(s) empezada(s), denegada(s) por el laboratorio)`);
  dice(!seFue, `pero no se lleva la ventana de Adeorq a otra dirección (${arriba ?? "sin respuesta"}${seFue ? ", y la ventana ha cargado /fuera" : ""})`);
  if (seFue) {
    await v.js(`history.back(); "ok"`).catch(() => {});
    await dormir(2000);
  }

  // El inventario.
  {
    console.log("\nlo que carga la ventana (origen y cómo, con cuántas veces):");
    for (const [k, n] of Object.entries(fin.cargas).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);
    console.log(`  workers: ${fin.trabajadores.join(", ") || "ninguno"}`);
    const reales = fin.csp.filter((c) => !c.bloqueado.includes("example.invalid"));
    console.log(`\nviolaciones de CSP: ${reales.length}`);
    for (const c of reales.slice(0, 25)) console.log(`  ${c.directiva}  ${c.bloqueado}  ${c.en}  ${c.muestra}`);
    dice(reales.length === 0, "cero violaciones de CSP en todo el recorrido");
  }
} finally {
  nav?.cerrar();
  await a.cerrar();
  servidor.close();
}
console.log(fallos ? `\n${fallos} fallo(s).` : "\nLa ventana carga lo suyo y nada más.");
process.exit(fallos ? 1 : 0);
