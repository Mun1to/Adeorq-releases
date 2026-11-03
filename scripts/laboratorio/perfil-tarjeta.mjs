// La tarjeta para compartir tu uso (`PerfilTarjeta.tsx`) con su editor, en la
// ventana de verdad y con un doble de Tauri.
//
//   node scripts/laboratorio/perfil-tarjeta.mjs [--fotos <carpeta>]
//
// Levanta su propio Vite en 127.0.0.1 con la caché aparte (el :1420 suele ser
// de otra sesión, y empaquetar `mediabunny` en él le recargaría la ventana) y
// un Brave sin ventana con el `playwright-core` que el MCP ya se bajó. Rust es
// un doble: la historia de `perfil-uso.js` (hoy 2,5B, el récord de 20B hace 40
// días), el fondo de la casa es `web/assets/og.png`, el diálogo de guardar
// contesta una ruta y `guardar_tarjeta` se queda los bytes para leerlos aquí.
// El portapapeles es el del Brave de pruebas, no el de quien trabaja.
//
// Lo que mira, que no ven ni `pnpm bancos` ni el laboratorio del motor:
//   · El icono de compartir abre el mes; un día abre ese día; el récord, el
//     récord. El lienzo dice lo que pinta (su `aria-label`) y se pinta de
//     verdad (píxeles).
//   · La tira: tu fondo de Adeorq primero, los cuatro de serie y «Subir».
//   · «Resaltar la cifra» apagado de fábrica, y encendido pinta la caja clara.
//   · Ningún proyecto sale hasta que lo eliges; elegido, su frase.
//   · «Total»: todo desde tu primer día con uso, con los proyectos de siempre.
//   · Color, 9:16 (en la fila de Imagen · Vídeo), y que se recuerdan al volver
//     a abrir.
//   · Descargar: el PNG que llega a `guardar_tarjeta`, con su tamaño, y la
//     ruta de «Guardada en…», que al pulsarla abre su carpeta.
//   · Copiar: en Imagen, un `image/png` al portapapeles; en Vídeo, el MP4 entero
//     como archivo, sin preguntar dónde y sin ninguna foto.
//   · Vídeo: sin un vídeo de fondo no se puede descargar; con uno subido, el
//     MP4 que llega leído caja a caja (H.264, el tamaño, los fotogramas), y
//     cancelar a medias.
//   · «Sonido», solo en Vídeo y encendido de fábrica: la vista previa suena,
//     el MP4 lleva una pista AAC que dura lo que el vídeo, y apagado ni suena
//     ni la lleva.
//   · En inglés.
//   · Y con el editor abierto, `carceles.js` y `mayusculas.js`: lo del editor
//     tiene que salir limpio.
//
// Sale con 1 si algo falla. Con `--fotos` deja ahí las capturas.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { leerMp4, leerPng } from "./mp4-cajas.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const i = process.argv.indexOf("--fotos");
const FOTOS = i > 0 ? process.argv[i + 1] : null;
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

function playwrightCore() {
  const npx = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const d of existsSync(npx) ? readdirSync(npx) : []) {
    const p = join(npx, d, "node_modules", "playwright-core");
    if (existsSync(join(p, "package.json"))) return p;
  }
  throw new Error(`no encuentro playwright-core en ${npx}: abre una vez el MCP de Playwright para que se lo descargue`);
}

const cache = mkdtempSync(join(tmpdir(), "banco-perfil-tarjeta-vite-"));
const vite = await createServer({
  root: RAIZ,
  configFile: join(RAIZ, "vite.config.ts"),
  cacheDir: cache,
  logLevel: "error",
  clearScreen: false,
  server: { host: "127.0.0.1", port: 5700 + (process.pid % 100), strictPort: false, hmr: false },
  // Empaquetadas al arrancar: si Vite las descubre a mitad de la prueba, recarga la página.
  optimizeDeps: { include: ["mediabunny", "@tauri-apps/api/core", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-opener"] },
});
await vite.listen();
const BASE = vite.resolvedUrls.local[0].replace(/\/$/, "");

const { chromium } = createRequire(import.meta.url)(playwrightCore());
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
const ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 1600, height: 1000 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));

// Las fechas en la hora de la ventana, que es la que cuenta el componente. El
// día es fijo, no el de hoy: con el de hoy la prueba cambiaba según cuándo se
// lanzaba. Es un día 1 a propósito, el caso en que el mes en curso va «del 1
// al 1» y se abría como «Día» (2026-11-01). El reloj de la página se fija al
// mismo instante; los temporizadores siguen corriendo.
const dos = (n) => String(n).padStart(2, "0");
const ahora = new Date(2026, 10, 1, 12, 0, 0);
await ctx.clock.setFixedTime(ahora);
const hoy = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
const horaDe = (dias) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias, 12).toISOString().slice(0, 13);
const cubo = (dias, extra) => ({ hora: horaDe(dias), cli: "claude", modelo: "claude-opus-5-5", carpeta: "C:\\proyectos\\Adeorq", entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0, respuestas: 1, ...extra });
const historia = {
  archivos: 3,
  cubos: [
    cubo(0, { carpeta: "C:\\proyectos\\adeorq", entrada: 2e6, salida: 4e6, cacheEscrita: 6e6, cacheLeida: 944e6 }),
    cubo(0, { cacheLeida: 1044e6 }),
    cubo(0, { cli: "codex", modelo: "gpt-5.6-terra", carpeta: "C:\\proyectos\\Orquio", cacheLeida: 500e6 }),
    cubo(40, { modelo: "claude-opus-5", cacheLeida: 20000e6 }),
    cubo(75, { modelo: "claude-sonnet-5", carpeta: "C:\\proyectos\\VoCript", cacheLeida: 9000e6 }),
  ],
};
const mesLargo = (lang) => {
  const s = ahora.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { month: "long", year: "numeric" });
  return s[0].toUpperCase() + s.slice(1);
};

// Los fondos «importados» viven aquí, en Node, por su nombre: el protocolo de
// assets del doble los sirve con `Range`, como el de Tauri (el `<video>` y
// `mediabunny` piden trozos). Lo demás es el fondo de la casa.
const archivos = new Map();
await page.route(`${BASE}/__fondo/**`, (r) => {
  const nombre = decodeURIComponent(new URL(r.request().url()).pathname.slice("/__fondo/".length)).split("\\").pop();
  const b = archivos.get(nombre);
  if (!b) return r.fulfill({ contentType: "image/png", body: readFileSync(join(RAIZ, "web", "assets", "og.png")) });
  const tipo = /\.png$/i.test(nombre) ? "image/png" : "video/mp4";
  const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers().range ?? "");
  if (!m) return r.fulfill({ contentType: tipo, headers: { "accept-ranges": "bytes" }, body: b });
  const desde = Number(m[1]);
  const hasta = Math.min(b.length - 1, m[2] ? Number(m[2]) : b.length - 1);
  return r.fulfill({
    status: 206,
    contentType: tipo,
    headers: { "accept-ranges": "bytes", "content-range": `bytes ${desde}-${hasta}/${b.length}` },
    body: b.subarray(desde, hasta + 1),
  });
});
await page.addInitScript(({ historia }) => {
  const q = new URLSearchParams(location.search);
  if (sessionStorage.getItem("banco-tarjeta") !== q.get("vez")) {
    localStorage.clear();
    sessionStorage.setItem("banco-tarjeta", q.get("vez") ?? "");
    localStorage.setItem("adeorq-lang", q.get("lang") ?? "es");
    localStorage.setItem("adeorq-perfil", JSON.stringify({ nombre: "Sam", arroba: "sam", sinRaiz: true, hecho: true, tour: true, clis: ["claude", "codex"] }));
  }
  const oyentes = {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__guardados = [];
  window.__abrir = [];
  window.__porImportar = {};
  window.__quitados = [];
  window.__cancelados = [];
  window.__partes = {};
  window.__copiado = [];
  window.__archivosCopiados = [];
  // La carpeta de fondos de la tarjeta: en `sessionStorage`, que aguanta una
  // recarga de la página (el «reinicio» de la app) y no la siguiente prueba.
  const disco = () => JSON.parse(sessionStorage.getItem("banco-disco") ?? "[]");
  const aDisco = (d) => sessionStorage.setItem("banco-disco", JSON.stringify(d));
  // Cuántas veces se pinta un sonido entero (cada sonido nuevo de la caché).
  window.__pintados = 0;
  const pintar = OfflineAudioContext.prototype.startRendering;
  OfflineAudioContext.prototype.startRendering = function (...a) {
    window.__pintados++;
    return pintar.apply(this, a);
  };
  // A dónde va cada sonido que suena: la ganancia de la vista previa.
  const conectar = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destino, ...a) {
    if (this instanceof AudioBufferSourceNode) this.__destino = destino;
    return conectar.call(this, destino, ...a);
  };
  window.__niveles = [];
  // El último volumen que se le puso a un vídeo: el de la vista previa no
  // está en la página, se pinta en el lienzo.
  const vol = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    get() { return vol.get.call(this); },
    set(x) { window.__volumen = x; vol.set.call(this, x); },
  });
  window.__ensenadas = [];
  // Cada sonido que empieza a sonar por el altavoz, con lo que dura: así se ve
  // que la vista previa suena. Los de un `OfflineAudioContext` no suenan: son
  // los ruidos con los que se pinta el sonido.
  window.__sonando = [];
  const empezar = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    if (!(this.context instanceof OfflineAudioContext)) {
      window.__sonando.push(this.buffer?.duration ?? 0);
      window.__niveles.push(this.__destino?.gain?.value ?? null);
    }
    return empezar.apply(this, a);
  };
  Object.defineProperty(navigator, "clipboard", {
    value: { write: async (items) => window.__copiado.push(items.map((x) => x.types).flat()), writeText: async () => {} },
  });
  const aBase64 = (u8) => {
    let s = "";
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
  let escucha = 1;
  window.__orden = [];
  const contestar = (cmd, args, opciones) => {
    if (/^(plugin:dialog\|save|tarjeta_video_)/.test(cmd) && cmd !== "tarjeta_video_escribir") window.__orden.push(cmd);
    switch (cmd) {
      case "plugin:event|listen": (oyentes[args.event] ??= []).push(args.handler); return escucha++;
      case "plugin:event|unlisten": return null;
      case "pty_spawn": return null;
      case "fijar_partes": return null;
      case "list_projects": return [{ name: "Adeorq", path: "C:\\proyectos\\Adeorq", hasGit: true }, { name: "Orquio", path: "C:\\proyectos\\Orquio", hasGit: true }];
      case "detect_clis": return args.exes.filter(([id]) => id === "claude" || id === "codex").map(([id]) => ({ id, path: `C:\\bin\\${id}.exe` }));
      case "account_ready": return true;
      case "goals_read": return { date: args.date, path: "C:\\datos\\objetivos\\hoy.md", goals: [] };
      case "memoria_vaults": return [];
      case "list_skills": return [];
      case "usage_limits": return { lines: [], note: "", plan: "" };
      case "get_fondo": return "C:\\datos\\Adeorq\\fondo.png";
      case "uso_historia": return new Promise((ok) => setTimeout(() => ok(historia), 800));
      case "plugin:dialog|save": return `C:\\Salida\\${args.options?.defaultPath ?? "tarjeta"}`;
      case "plugin:dialog|open": return window.__abrir.shift() ?? null;
      case "tarjeta_fondos": return disco().map((g) => g.meta);
      case "tarjeta_fondo_importar": {
        const p = window.__porImportar[args.path];
        if (!p) throw new Error("no encuentro ese archivo");
        const d = disco();
        const ya = d.find((g) => g.huella === p.huella);
        if (ya) return ya.meta;
        const meta = { nombre: p.nombre, ruta: `C:\\datos\\Adeorq\\tarjeta\\fondos\\${p.nombre}`, video: p.video, bytes: p.bytes };
        aDisco([{ meta, huella: p.huella }, ...d]);
        // Lo que tarda una copia grande, para ver «Copiando…».
        return new Promise((ok) => setTimeout(() => ok(meta), 1200));
      }
      case "tarjeta_fondo_quitar":
        aDisco(disco().filter((g) => g.meta.nombre !== args.nombre));
        window.__quitados.push(args.nombre);
        return null;
      case "tarjeta_video_empezar": window.__partes[args.ruta] = []; return null;
      case "tarjeta_video_escribir": {
        const ruta = decodeURIComponent(opciones?.headers?.ruta ?? "");
        if (!window.__partes[ruta]) throw new Error("no puedo escribir el vídeo");
        window.__partes[ruta].push([Number(opciones.headers.posicion), args.slice()]);
        return null;
      }
      case "tarjeta_video_acabar": {
        const ps = window.__partes[args.ruta];
        const u8 = new Uint8Array(Math.max(...ps.map(([p, d]) => p + d.length)));
        for (const [p, d] of ps) u8.set(d, p);
        window.__guardados.push({ ruta: args.ruta, b64: aBase64(u8), trozos: ps.length });
        delete window.__partes[args.ruta];
        return null;
      }
      case "tarjeta_video_cancelar": delete window.__partes[args.ruta]; window.__cancelados.push(args.ruta); return null;
      case "tarjeta_copia_ruta": return `C:\\datos\\Adeorq\\tarjeta\\copias\\123\\${args.nombre}`;
      case "tarjeta_copiar_archivo": window.__archivosCopiados.push(args.ruta); return null;
      case "guardar_tarjeta":
        window.__guardados.push({ ruta: decodeURIComponent(opciones?.headers?.ruta ?? ""), b64: aBase64(args) });
        return null;
      case "plugin:opener|reveal_item_in_dir": window.__ensenadas.push(args.paths); return null;
      default: throw new Error(`sin doble: ${cmd}`);
    }
  };
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {
      invoke: (cmd, args, opciones) => Promise.resolve().then(() => contestar(cmd, args, opciones)),
      transformCallback: (cb) => { const id = Math.floor(Math.random() * 1e9); window[`_${id}`] = cb; return id; },
      convertFileSrc: (ruta) => `/__fondo/${encodeURIComponent(ruta)}`,
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    },
  });
}, { historia });

/** Importar un fondo como lo hace la app: «Subir», el diálogo contesta su
    ruta y el doble de Rust lo «copia» a la carpeta de fondos. */
const importar = async (nombre, b64, video = true) => {
  archivos.set(nombre, Buffer.from(b64, "base64"));
  const ruta = `C:\\Origen\\${nombre}`;
  const huella = createHash("sha1").update(b64).digest("hex");
  await page.evaluate(([ruta, p]) => {
    window.__porImportar[ruta] = p;
    window.__abrir.push(ruta);
  }, [ruta, { nombre, video, bytes: Math.round((b64.length * 3) / 4), huella }]);
  await page.click(".pt-subir");
  await page.locator(`.pt-mini[aria-label="${nombre}"]`).waitFor({ timeout: 10000 });
};
/** Un vídeo hecho con el propio motor, cada instante de otro tono (`tono(t)`), en base64. */
const hacerVideo = (segundos, { fps = 30, ancho = 640, alto = 360, la = false } = {}) =>
  page.evaluate(async ([segundos, fps, ancho, alto, la]) => {
    const m = await import("/src/lib/exportarTarjeta.ts");
    let sonido = null;
    if (la) {
      const ctx = new OfflineAudioContext(2, Math.ceil(segundos * 48000), 48000);
      const o = ctx.createOscillator();
      o.frequency.value = 440;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(ctx.destination);
      o.start();
      sonido = await ctx.startRendering();
    }
    const b = await m.exportarVideo((c, w, h, _f, t) => {
      c.fillStyle = `hsl(${Math.round((t * 25) % 360)}, 70%, 45%)`;
      c.fillRect(0, 0, w, h);
    }, { ancho, alto, fps, segundos, sonido });
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
    return btoa(s);
  }, [segundos, fps, ancho, alto, la]);
/** El pico del sonido que lleva un MP4 guardado (`__guardados[i]`). */
const picoDe = (i) =>
  page.evaluate(async (i) => {
    const bin = atob(window.__guardados[i].b64);
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    const m = await import("/src/lib/exportarTarjeta.ts");
    const a = await m.sonidoDelFondo(new Blob([u8], { type: "video/mp4" }), 2);
    if (!a) return null;
    // El centro, lejos de la entrada y del cierre.
    const d = a.getChannelData(0).subarray(a.sampleRate * 0.3, a.sampleRate * 1.5);
    let p = 0;
    for (const x of d) p = Math.max(p, Math.abs(x));
    return p;
  }, i);
const tramoTexto = () => page.$eval(".pt-tramo", (s) => s.textContent).catch(() => "");
const foto = async (nombre) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, `${nombre}.png`) }); };
const etiqueta = () => page.$eval("canvas.pt-lienzo", (c) => c.getAttribute("aria-label"));
const pulsado = (sel) => page.$$eval(sel, (bs) => bs.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("aria-label") || b.textContent.trim()));
const estado = () => page.$eval(".pt-estado", (p) => p.textContent).catch(() => "");
/** Cuántos píxeles de una columna del lienzo (a `x` centésimas del ancho) son del color pedido. */
const enColumna = (x, rgb) =>
  page.$eval("canvas.pt-lienzo", (c, [x, rgb]) => {
    const d = c.getContext("2d").getImageData(Math.round((c.width * x) / 100), 0, 1, c.height).data;
    let n = 0;
    for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - rgb[0]) + Math.abs(d[k + 1] - rgb[1]) + Math.abs(d[k + 2] - rgb[2]) < 18) n++;
    return { n, u: c.width / 100 };
  }, [x, rgb]);
const huella = () => page.$eval("canvas.pt-lienzo", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let k = 0; k < d.length; k += 97) h = (h * 31 + d[k]) >>> 0; return h; });
const abrirPerfil = async (q) => {
  await page.goto(`${BASE}/?${q}`);
  await page.locator('[data-tab="perfil"]').waitFor({ timeout: 20000 });
  await page.click('[data-tab="perfil"]');
  await page.locator(".pu-cifra").waitFor({ timeout: 15000 });
};
const abierta = async () => { await page.locator(".pt-velo").waitFor({ timeout: 5000 }); await page.waitForTimeout(400); };
const cerrar = async () => { await page.keyboard.press("Escape"); await page.locator(".pt-velo").waitFor({ state: "detached", timeout: 3000 }); };
/** Que la fila de Imagen · Vídeo y la barra quepan cada una en una línea. */
const enUnaLinea = async (cuando, filas = [".pt-pestanas", ".pt-barra"]) => {
  for (const fila of filas) {
    const f = await page.$eval(fila, (b) => {
      const hijos = [...b.children].filter((h) => h.getBoundingClientRect().width > 0);
      // Por el centro y no por arriba: la fila va centrada y cada pieza tiene su alto.
      const centros = hijos.map((h) => h.getBoundingClientRect()).map((r) => r.top + r.height / 2).sort((a, b) => a - b);
      return {
        lineas: centros.filter((c, i) => i === 0 || c - centros[i - 1] > 4).length,
        ancho: Math.round(b.getBoundingClientRect().width),
        piezas: hijos.map((h) => `${h.className}:${Math.round(h.getBoundingClientRect().width)}`).join(" "),
      };
    });
    dice(f.lineas === 1, `${cuando} ${fila} cabe en una línea (${f.lineas} en ${f.ancho} px: ${f.piezas})`);
  }
};

try {
  await abrirPerfil("vez=1");

  // 1. El icono de compartir abre el mes en curso.
  dice((await page.$(".pu-compartir")) !== null, "con la tarjeta, tu uso vuelve a enseñar el icono de compartir");
  await page.click(".pu-compartir");
  await abierta();
  const mes = await etiqueta();
  dice(mes?.startsWith(`${mesLargo("es")}: 2,5B Tokens`), `el icono abre el mes en curso (${mes})`);
  dice(!/ en Adeorq| en Orquio/.test(mes), "sin elegir proyecto, ninguno sale en la tarjeta");
  dice(/Nuevos 12M/.test(mes) && /Claude Code 80 %/.test(mes) && /Días activos 1/.test(mes) && /@sam/.test(mes), `las filas y tu @ (${mes})`);
  dice(JSON.stringify(await pulsado(".pt-barra .pt-op")) === JSON.stringify(["Mes"]), `«Mes» de fábrica (${await pulsado(".pt-barra .pt-op")})`);
  dice(JSON.stringify(await pulsado(".pt-pestanas .pt-formato .pt-op")) === JSON.stringify(["16:9"]), `y 16:9, al lado de Imagen · Vídeo (${await pulsado(".pt-pestanas .pt-formato .pt-op")})`);
  dice(await page.$eval(".pt-barra .pt-op >> nth=1", (b) => b.disabled), "«Día» apagado si no se abrió desde un día");
  dice((await page.$eval(".pt-interruptor", (b) => b.getAttribute("aria-pressed"))) === "false", "«Resaltar la cifra» apagado de fábrica");
  const tira = await page.$$eval(".pt-tira .pt-mini", (bs) => bs.map((b) => b.getAttribute("aria-label")));
  dice(JSON.stringify(tira) === JSON.stringify(["Tu fondo de Adeorq", "ASCII", "Solo los bordes", "Grano de película", "Proa de cristal"]), `la tira: tu fondo primero y los cuatro de serie (${tira})`);
  dice((await pulsado(".pt-mini"))[0] === "Tu fondo de Adeorq", "elegido, tu fondo");
  dice((await page.$eval(".pt-subir", (b) => b.textContent.trim())) === "Subir imagen", "y «Subir imagen» al final, sin límite de tamaño");
  await foto("1-mes");

  // 2. Un fondo de serie, y «Resaltar la cifra» pinta la caja clara.
  await page.click('.pt-mini[aria-label="ASCII"]');
  await page.waitForTimeout(300);
  const sinCaja = await enColumna(44, [234, 243, 255]);
  await page.click(".pt-interruptor");
  await page.waitForTimeout(150);
  const conCaja = await enColumna(44, [234, 243, 255]);
  dice(sinCaja.n < conCaja.u && conCaja.n > 6 * conCaja.u, `resaltar pinta la caja clara a lo ancho de la columna (${sinCaja.n} → ${conCaja.n} px de ${conCaja.u.toFixed(1)} por centésima)`);

  // 3. El proyecto, solo si se elige.
  await page.click(".pt-elegir-btn");
  const lista = await page.$$eval(".pt-lista button", (bs) => bs.map((b) => b.textContent));
  dice(JSON.stringify(lista) === JSON.stringify(["Ninguno", "Adeorq2B", "Orquio500M"]), `la lista: ninguno y los proyectos del mes, «adeorq» junto a «Adeorq» (${lista})`);
  await page.click(".pt-lista button >> text=Adeorq");
  dice(/2B en Adeorq · 80 %/.test(await etiqueta()), `elegido, su frase (${await etiqueta()})`);
  dice((await page.$(".pt-lista")) === null, "la lista se cierra al elegir");

  // 4. Color y formato.
  await page.click('.pt-muestra[aria-label="Morado"]');
  dice(JSON.stringify(await pulsado(".pt-muestra")) === JSON.stringify(["Morado"]), "el color elegido");
  await page.click('.pt-formato .pt-op:has-text("9:16")');
  await page.waitForTimeout(300);
  const lados = await page.$eval("canvas.pt-lienzo", (c) => [c.width, c.height]);
  dice(lados[1] > lados[0] * 1.7, `9:16 pone la tarjeta de pie (${lados})`);
  await foto("2-vertical-resaltada-proyecto");

  // 5. Descargar y copiar.
  await page.click('.pt-accion:has-text("Descargar")');
  await page.waitForFunction(() => window.__guardados.length > 0, null, { timeout: 15000 });
  const png = await page.evaluate(() => window.__guardados[0]);
  const infoPng = leerPng(Buffer.from(png.b64, "base64"));
  dice(infoPng.firma && infoPng.ancho === 1080 && infoPng.alto === 1920, `Descargar guarda un PNG de 1080×1920 (${infoPng.ancho}×${infoPng.alto})`);
  dice(/^C:\\Salida\\adeorq-uso-\d{4}-\d{2}-\d{2}\.png$/.test(png.ruta), `con el nombre propuesto (${png.ruta})`);
  dice(/^Guardada en C:\\Salida\\/.test(await estado()), `y lo dice (${await estado()})`);
  const colorRuta = () => page.$eval(".pt-estado .pt-ruta", (b) => getComputedStyle(b).color);
  const enReposo = await colorRuta();
  await page.hover(".pt-estado .pt-ruta");
  await page.waitForTimeout(300);
  dice(enReposo !== (await colorRuta()), `la ruta se enciende al pasar el ratón (${enReposo} → ${await colorRuta()})`);
  await foto("2b-guardada-al-pasar");
  await page.click(".pt-estado .pt-ruta");
  await page.waitForFunction(() => window.__ensenadas.length > 0, null, { timeout: 3000 }).catch(() => {});
  const ensenada = await page.evaluate(() => window.__ensenadas[0]);
  dice(JSON.stringify(ensenada) === JSON.stringify([png.ruta]), `la ruta se pulsa y abre su carpeta con el archivo marcado (${ensenada})`);
  await page.click('.pt-accion:has-text("Copiar")');
  await page.waitForFunction(() => window.__copiado.length > 0, null, { timeout: 15000 });
  dice(JSON.stringify(await page.evaluate(() => window.__copiado[0])) === JSON.stringify(["image/png"]), "Copiar deja un PNG en el portapapeles");
  dice(/^Copiada/.test(await estado()), `y lo dice (${await estado()})`);
  dice(!(await page.$('.pt-interruptor:has-text("Sonido")')), "en Imagen no hay «Sonido»");
  await cerrar();
  dice(true, "Escape la cierra");

  // 6. Un día abre ese día; el récord, el récord. Lo elegido se recuerda; el proyecto no.
  await page.click(".pu-mes button[data-hoy]");
  await abierta();
  const deHoy = await etiqueta();
  const fechaHoy = ahora.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  dice(deHoy?.startsWith(`${fechaHoy}: 2,5B Tokens`), `un día abre ese día (${deHoy})`);
  dice((await pulsado(".pt-barra .pt-op")).includes(`Día ${ahora.getDate()}`), `con «Día ${ahora.getDate()}» elegido`);
  dice(JSON.stringify(await pulsado(".pt-muestra")) === JSON.stringify(["Morado"]) && (await pulsado(".pt-formato .pt-op")).includes("9:16"), "el color y el formato se recuerdan");
  dice(!/ en Adeorq/.test(deHoy), "el proyecto no: vuelve a «Ninguno»");
  await page.click('.pt-barra .pt-op:has-text("Mes")');
  dice((await etiqueta())?.startsWith(mesLargo("es")), "y desde un día se puede pasar a su mes");
  await cerrar();
  await page.click(".pu-record");
  await abierta();
  const rec = await etiqueta();
  dice(/^Tu récord · \d+ de [a-z]+: 20B Tokens/.test(rec) && /Total del mes 20B/.test(rec), `el récord abre su tarjeta (${rec})`);
  dice((await pulsado(".pt-barra .pt-op")).includes("Récord"), "con «Récord» elegido");
  await foto("3-record");
  await cerrar();

  // 6b. «Total»: todo desde tu primer día con uso (hace 75 días), con los
  //     proyectos de siempre en la lista.
  await page.click(".pu-compartir");
  await abierta();
  await page.click('.pt-barra .pt-op:has-text("Total")');
  const tot = await etiqueta();
  const dia60 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 75).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  dice(tot?.startsWith(`Desde el ${dia60}: 32B Tokens`), `«Total» cuenta desde tu primer día con uso (${tot})`);
  dice(/Nuevos 12M/.test(tot) && /Claude Code 98 %/.test(tot) && /Días activos 3/.test(tot), `con sus filas (${tot})`);
  dice(JSON.stringify(await pulsado(".pt-barra .pt-op")) === JSON.stringify(["Total"]), `con «Total» elegido (${await pulsado(".pt-barra .pt-op")})`);
  await page.click(".pt-elegir-btn");
  const deSiempre = await page.$$eval(".pt-lista button", (bs) => bs.map((b) => b.textContent));
  dice(JSON.stringify(deSiempre) === JSON.stringify(["Ninguno", "Adeorq22B", "VoCript9B", "Orquio500M"]), `la lista, los proyectos de siempre (${deSiempre})`);
  await page.click(".pt-lista button >> text=VoCript");
  dice(/9B en VoCript · 29 %/.test(await etiqueta()), `y su frase sobre el total (${await etiqueta()})`);
  await foto("3b-total");
  await cerrar();

  // 7. Vídeo: sin vídeo de fondo no se descarga; con uno subido, el MP4.
  await page.click(".pu-compartir");
  await abierta();
  await page.click('.pt-pestanas .pt-op:has-text("Vídeo")');
  dice((await page.$$(".pt-tira .pt-mini")).length === 0, "en Vídeo, sin vídeos de fondo, solo «Subir vídeo»");
  const bajarVideo = page.locator('.pt-accion:has-text("Descargar vídeo")');
  dice((await bajarVideo.isDisabled()) && /vídeo de fondo/.test((await bajarVideo.getAttribute("data-tip")) ?? ""), "y «Descargar vídeo» apagado, diciendo por qué");
  const copiarVideo = page.locator(".pt-acciones .pt-accion", { hasText: "Copiar" });
  dice(await copiarVideo.isDisabled(), "y «Copiar» también: sin vídeo no hay nada que copiar");
  // Un vídeo de fondo de dos segundos, hecho con el propio motor: cada fotograma de otro color.
  const mp4Fondo = await hacerVideo(2);
  archivos.set("mi fondo.mp4", Buffer.from(mp4Fondo, "base64"));
  await page.evaluate((p) => {
    window.__porImportar["C:\\Origen\\mi fondo.mp4"] = p;
    window.__abrir.push("C:\\Origen\\mi fondo.mp4");
  }, { nombre: "mi fondo.mp4", video: true, bytes: 1, huella: "uno" });
  await page.click(".pt-subir");
  await page.waitForTimeout(700);
  const copiando = await page.$eval(".pt-subir", (b) => ({ texto: b.textContent.trim(), apagado: b.disabled }));
  dice(copiando.apagado && copiando.texto === "Copiando…", `mientras Rust copia, «Subir» dice «Copiando…» (${copiando.texto})`);
  await page.locator('.pt-mini[aria-label="mi fondo.mp4"]').waitFor({ timeout: 5000 });
  dice((await pulsado(".pt-mini"))[0] === "mi fondo.mp4", "el vídeo importado queda elegido");
  dice(
    (await page.$eval('.pt-mini[aria-label="mi fondo.mp4"] video', (v) => v.getAttribute("src"))).startsWith("/__fondo/"),
    "y se sirve por el protocolo de assets desde la carpeta de Adeorq, no desde la memoria",
  );
  await page.waitForTimeout(800);
  const h1 = await huella();
  await page.waitForTimeout(500);
  const h2 = await huella();
  dice(h1 !== h2, "la vista previa se mueve con el vídeo");
  const sonido = page.locator('.pt-interruptor:has-text("Sonido")');
  dice((await sonido.getAttribute("aria-pressed")) === "true", "en Vídeo, «Sonido» encendido de fábrica");
  const sonando = await page.evaluate(() => window.__sonando);
  dice(sonando.length > 0 && Math.abs(sonando[0] - 3) < 0.01, `y la vista previa suena, tanto como el vídeo que saldrá (${sonando.map((s) => s.toFixed(2))} s)`);
  await foto("4-video");
  await bajarVideo.click();
  await page.locator(".pt-progreso").waitFor({ timeout: 5000 });
  dice(/Sacando el vídeo… \d+ %/.test(await page.$eval(".pt-progreso", (p) => p.textContent)), "mientras sale, el progreso y «Cancelar»");
  await page.waitForFunction(() => window.__guardados.length > 1, null, { timeout: 60000 });
  const mp4 = await page.evaluate(() => window.__guardados[1]);
  const info = leerMp4(Buffer.from(mp4.b64, "base64"));
  dice(
    info.arriba?.filter((c) => c !== "free").join(" ") === "ftyp moov mdat" && info.codec === "avc1" && info.ancho === 1080 && info.alto === 1920 && info.muestras === 90,
    `Descargar vídeo guarda un MP4: ${info.arriba?.join(" ")}, ${info.codec}, ${info.ancho}×${info.alto}, ${info.muestras} fotogramas (un fondo de 2 s da 3 s)`,
  );
  dice(/\.mp4$/.test(mp4.ruta), `con su extensión (${mp4.ruta})`);
  const orden = await page.evaluate(() => window.__orden.slice(-3).join(" > "));
  dice(
    orden === "plugin:dialog|save > tarjeta_video_empezar > tarjeta_video_acabar" && (await page.evaluate(() => Object.keys(window.__partes).length)) === 0,
    `primero el «Guardar como», luego a disco a trozos (${mp4.trozos}) y el .part renombrado (${orden})`,
  );
  const s = info.sonido;
  dice(
    s?.codec === "mp4a" && s.canales === 2 && s.frecuencia === 48000 && Math.abs(s.segundos - info.segundos) < 0.1,
    `con «Sonido», una pista AAC que dura lo que el vídeo (${s ? `${s.codec}, ${s.canales} canales, ${s.frecuencia} Hz, ${s.segundos.toFixed(3)} s de ${info.segundos.toFixed(3)}` : "sin pista"})`,
  );
  // Al acabar de sacarlo la vista previa vuelve a sonar: se cuenta después de eso.
  await page.waitForTimeout(600);
  const sonadas = await page.evaluate(() => window.__sonando.length);
  await sonido.click();
  dice((await sonido.getAttribute("aria-pressed")) === "false", "«Sonido» se apaga");
  await page.waitForTimeout(400);
  dice((await page.evaluate(() => window.__sonando.length)) === sonadas, "y la vista previa deja de sonar");
  await bajarVideo.click();
  await page.waitForFunction(() => window.__guardados.length > 2, null, { timeout: 60000 });
  const mudo = leerMp4(Buffer.from((await page.evaluate(() => window.__guardados[2])).b64, "base64"));
  dice(mudo.codec === "avc1" && mudo.muestras === 90 && mudo.sonido === null, `apagado, el MP4 sale sin pista de audio (${mudo.sonido ? mudo.sonido.codec : "ninguna"})`);
  await sonido.click();
  await page.click('.pt-accion:has-text("Descargar vídeo")');
  await page.locator(".pt-progreso").waitFor({ timeout: 5000 });
  await page.click('.pt-acciones .pt-accion:has-text("Cancelar")');
  await page.waitForFunction(() => document.querySelector(".pt-estado")?.textContent === "Cancelado.", null, { timeout: 5000 }).catch(() => {});
  dice(
    (await estado()) === "Cancelado." && (await page.evaluate(() => window.__guardados.length)) === 3 && (await page.evaluate(() => window.__cancelados.length)) === 1,
    `cancelar a medias no guarda nada y borra el .part (${await estado()})`,
  );

  // Copiar en Vídeo: el MP4 como archivo, nunca una foto de un fotograma.
  // «Cuando le das a copiar el vídeo se copia un frame en imagen, no la dirección del vídeo de tu ordenador.»
  const fotosAntes = await page.evaluate(() => window.__copiado.length);
  const guardadosAntes = await page.evaluate(() => window.__guardados.length);
  const ordenAntes = await page.evaluate(() => window.__orden.length);
  await copiarVideo.click();
  await page.waitForFunction(() => window.__archivosCopiados.length > 0, null, { timeout: 60000 }).catch(() => {});
  const copiado = await page.evaluate(() => window.__archivosCopiados[0]);
  dice((await page.evaluate(() => window.__copiado.length)) === fotosAntes, "Copiar en Vídeo no deja una foto en el portapapeles");
  dice(/^C:\\datos\\Adeorq\\tarjeta\\copias\\123\\adeorq-uso-\d{4}-\d{2}-\d{2}\.mp4$/.test(copiado ?? ""), `y deja el archivo, en la carpeta de Adeorq y con su nombre (${copiado})`);
  const copiaMp4 = (await page.evaluate(() => window.__guardados.at(-1))) ?? {};
  const infoCopia = copiaMp4.b64 && (await page.evaluate(() => window.__guardados.length)) > guardadosAntes ? leerMp4(Buffer.from(copiaMp4.b64, "base64")) : {};
  dice(copiaMp4.ruta === copiado && infoCopia.codec === "avc1" && infoCopia.muestras === 90, `ese archivo es el MP4 entero (${infoCopia.codec}, ${infoCopia.muestras} fotogramas)`);
  dice(
    (await page.evaluate((n) => window.__orden.slice(n).join(" > "), ordenAntes)) === "tarjeta_video_empezar > tarjeta_video_acabar",
    `sin preguntar dónde guardarlo (${await page.evaluate((n) => window.__orden.slice(n).join(" > "), ordenAntes)})`,
  );
  dice(/^Copiado: pégalo donde quieras\. Está en C:\\datos\\/.test(await estado()), `y lo dice, con su dirección (${await estado()})`);
  await copiarVideo.click();
  await page.locator(".pt-progreso").waitFor({ timeout: 5000 });
  dice(/Sacando el vídeo… \d+ %/.test(await page.$eval(".pt-progreso", (p) => p.textContent)), "mientras sale, el mismo progreso y «Cancelar»");
  await page.click('.pt-acciones .pt-accion:has-text("Cancelar")');
  await page.waitForFunction(() => document.querySelector(".pt-estado")?.textContent === "Cancelado.", null, { timeout: 5000 }).catch(() => {});
  dice((await estado()) === "Cancelado." && (await page.evaluate(() => window.__archivosCopiados.length)) === 1, `cancelar no toca el portapapeles (${await estado()})`);
  // Lo de abajo cuenta los vídeos guardados por su posición.
  await page.evaluate((n) => { window.__guardados.length = n; }, guardadosAntes);

  // Los sonidos: «Golpe» de fábrica y «Contador»; sin sonido propio en el fondo, no hay «Del vídeo».
  const origenes = () => page.$$eval('.pt-sonido [role=group] .pt-op', (bs) => bs.map((b) => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`));
  dice(JSON.stringify(await origenes()) === JSON.stringify(["Golpe*", "Contador"]), `«Golpe» de fábrica y «Contador»; un fondo mudo no ofrece el suyo (${await origenes()})`);
  const antes = await page.evaluate(() => window.__sonando.length);
  await page.click('.pt-sonido [role=group] .pt-op:has-text("Contador")');
  // Elegir otro empieza una vuelta nueva: la cifra está abajo y sube.
  await page.waitForTimeout(120);
  if (FOTOS) await page.locator("canvas.pt-lienzo").screenshot({ path: join(FOTOS, "4b-cifra-subiendo.png") });
  await page.waitForTimeout(1500);
  if (FOTOS) await page.locator("canvas.pt-lienzo").screenshot({ path: join(FOTOS, "4c-cifra-plantada.png") });
  const tras = await page.evaluate(() => window.__sonando.slice(-1)[0]);
  dice((await page.evaluate(() => window.__sonando.length)) > antes && Math.abs(tras - 3) < 0.01, "«Contador» elegido suena en la vista previa");

  // Un fondo con su propio sonido, un La de 440 Hz: aparece «Del vídeo», y ese es el que sale.
  await importar("con sonido.mp4", await hacerVideo(2, { la: true }));
  await page.locator('.pt-sonido [role=group] .pt-op:has-text("Del vídeo")').waitFor({ timeout: 8000 }).catch(() => {});
  dice(JSON.stringify(await origenes()) === JSON.stringify(["Golpe", "Contador*", "Del vídeo"]), `con un fondo que suena, «Del vídeo» se puede elegir (${await origenes()})`);
  // La barra es corta, como la de Axiom: en Vídeo, con los tres sonidos, cada fila cabe en una línea.
  await enUnaLinea("en Vídeo");
  await page.click('.pt-sonido [role=group] .pt-op:has-text("Del vídeo")');
  await bajarVideo.click();
  await page.waitForFunction(() => window.__guardados.length > 3, null, { timeout: 60000 });
  const delFondo = await page.evaluate(async () => {
    const g = window.__guardados[3];
    const bin = atob(g.b64);
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    const m = await import("/src/lib/exportarTarjeta.ts");
    const a = await m.sonidoDelFondo(new Blob([u8], { type: "video/mp4" }), 2.5);
    if (!a) return null;
    // La frecuencia por los cruces por cero de medio segundo del centro.
    const d = a.getChannelData(0).subarray(a.sampleRate * 0.5, a.sampleRate * 1);
    let cruces = 0;
    for (let k = 1; k < d.length; k++) if ((d[k - 1] < 0) !== (d[k] < 0)) cruces++;
    return cruces;
  });
  const infoDelFondo = leerMp4(Buffer.from((await page.evaluate(() => window.__guardados[3])).b64, "base64"));
  dice(
    infoDelFondo.sonido?.codec === "mp4a" && Math.abs(infoDelFondo.sonido.segundos - infoDelFondo.segundos) < 0.1 && delFondo !== null && Math.abs(delFondo - 440) < 12,
    `«Del vídeo» mete en el MP4 el sonido del fondo, su La (${delFondo ?? "nada"} cruces por segundo en medio segundo ≈ 440 Hz, ${infoDelFondo.sonido?.segundos?.toFixed(3)} s de ${infoDelFondo.segundos?.toFixed(3)})`,
  );

  // 7b. Los dos volúmenes: el del vídeo va dentro del MP4; el de la vista
  // previa solo se oye editando, y nace al 30 %.
  const vols = () => page.$$eval(".pt-volumen .pt-deslizador", (s) => s.map((x) => `${x.getAttribute("aria-label")} ${x.getAttribute("aria-valuetext")}`).join(", "));
  dice((await vols()) === "Volumen del vídeo 100 %, Volumen de la vista previa 30 %", `de fábrica (${await vols()})`);
  await page.waitForTimeout(300);
  dice(Math.abs((await page.evaluate(() => window.__volumen)) - 0.3) < 1e-6, `«Del vídeo» suena por el <video> al 30 % (${await page.evaluate(() => window.__volumen)})`);
  await page.focus('.pt-deslizador[aria-label="Volumen de la vista previa"]');
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.focus('.pt-deslizador[aria-label="Volumen del vídeo"]');
  for (let k = 0; k < 10; k++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  dice((await vols()) === "Volumen del vídeo 50 %, Volumen de la vista previa 20 %", `con las flechas (${await vols()})`);
  dice(Math.abs((await page.evaluate(() => window.__volumen)) - 0.1) < 1e-6, `lo que se oye es vídeo × vista previa: 0,5 × 0,2 (${await page.evaluate(() => window.__volumen)})`);
  await bajarVideo.click();
  await page.waitForFunction(() => window.__guardados.length > 4, null, { timeout: 60000 });
  const [p100, p50] = [await picoDe(3), await picoDe(4)];
  dice(p100 && p50 && Math.abs(p50 / p100 - 0.5) < 0.05, `el MP4 al 50 % mide la mitad de pico que al 100 % (${p50?.toFixed(3)} de ${p100?.toFixed(3)}: ${(p50 / p100).toFixed(3)})`);
  await page.click('.pt-sonido [role=group] .pt-op:has-text("Golpe")');
  await page.waitForTimeout(500);
  const nivelGolpe = await page.evaluate(() => window.__niveles.slice(-1)[0]);
  dice(Math.abs(nivelGolpe - 0.1) < 1e-6, `«Golpe» pasa por la misma ganancia, 0,5 × 0,2 (${nivelGolpe})`);

  // 7c. El recorte, en un clip de 12 s: de fábrica entero; los tiradores con
  // el ratón y con el teclado; la vista previa y el MP4, solo ese tramo.
  await importar("doce.mp4", await hacerVideo(12, { fps: 10, ancho: 320, alto: 180 }));
  await page.locator(".pt-recorte").waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
  dice((await tramoTexto()) === "Empieza 0:00 · Termina 0:12 · Dura 12 s", `de fábrica, el clip entero (${await tramoTexto()})`);
  await page.waitForFunction(() => document.querySelectorAll(".pt-fotos img").length >= 10, null, { timeout: 8000 }).catch(() => {});
  dice((await page.$$(".pt-fotos img")).length >= 10, `la línea de tiempo lleva los fotogramas del clip (${(await page.$$(".pt-fotos img")).length})`);
  const caja = await page.$eval(".pt-recorte", (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
  const pintadosAntes = await page.evaluate(() => window.__pintados);
  await page.mouse.move(caja.x + 2, caja.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(caja.x + (caja.w * 3 * k) / 12 / 12, caja.y);
  await page.waitForTimeout(300);
  const pintadosArrastrando = await page.evaluate(() => window.__pintados);
  const enArrastre = await tramoTexto();
  await page.mouse.up();
  await page.waitForTimeout(700);
  const pintadosSoltado = await page.evaluate(() => window.__pintados);
  dice(enArrastre === "Empieza 0:03 · Termina 0:12 · Dura 9 s", `el tirador de inicio con el ratón, en texto mientras se arrastra (${enArrastre})`);
  dice(pintadosArrastrando === pintadosAntes && pintadosSoltado === pintadosAntes + 1, `arrastrando no se hace ningún sonido; al soltar, uno (${pintadosAntes} → ${pintadosArrastrando} → ${pintadosSoltado})`);
  await page.focus('.pt-tirador[data-cual="hasta"]');
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  dice((await tramoTexto()) === "Empieza 0:03 · Termina 0:10 · Dura 7 s", `el de fin con las flechas (${await tramoTexto()})`);
  const tirador = await page.$eval('.pt-tirador[data-cual="hasta"]', (t) => `${t.getAttribute("role")} ${t.getAttribute("aria-valuetext")}`);
  dice(tirador === "slider 0:10", `y el lector de pantalla lo lee (${tirador})`);
  const ultimo = await page.evaluate(() => window.__sonando.slice(-1)[0]);
  dice(Math.abs(ultimo - 7) < 0.01, `la vista previa suena lo que dura el tramo (${ultimo?.toFixed(2)} s)`);
  const marcas = [];
  for (let k = 0; k < 4; k++) {
    marcas.push(await page.$eval(".pt-marca", (m) => parseFloat(m.style.left)));
    await page.waitForTimeout(400);
  }
  dice(new Set(marcas.map((m) => m.toFixed(1))).size > 1 && marcas.every((m) => m >= 24 && m <= 85), `la marca de por dónde va avanza dentro del tramo (${marcas.map((m) => m.toFixed(1)).join(", ")} %)`);
  if (FOTOS) await foto("6-recorte");
  await bajarVideo.click();
  await page.waitForFunction(() => window.__guardados.length > 5, null, { timeout: 60000 });
  const recortado = leerMp4(Buffer.from((await page.evaluate(() => window.__guardados[5])).b64, "base64"));
  dice(recortado.muestras === 210 && Math.abs(recortado.sonido?.segundos - 7) < 0.1, `el MP4 sale de ese tramo: ${recortado.muestras} fotogramas (7 s a 30), sonido de ${recortado.sonido?.segundos?.toFixed(2)} s`);
  // Su primer fotograma es el del segundo 3 del clip, no el del 0.
  const colores = await page.evaluate(async (b64Doce) => {
    const m = await import("/src/lib/exportarTarjeta.ts");
    const blob = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return new Blob([u], { type: "video/mp4" }); };
    const pixel = async (fondo, t) => {
      const png = await m.exportarImagen((c, w, h, f) => c.drawImage(f, 0, 0, w, h), { ancho: 16, alto: 16, fondo, t });
      const img = await createImageBitmap(png);
      const c = new OffscreenCanvas(16, 16).getContext("2d");
      c.drawImage(img, 0, 0);
      return [...c.getImageData(1, 1, 1, 1).data.slice(0, 3)];
    };
    return { salida: await pixel(blob(window.__guardados[5].b64), 0.05), en3: await pixel(blob(b64Doce), 3.05), en0: await pixel(blob(b64Doce), 0.05) };
  }, archivos.get("doce.mp4").toString("base64"));
  const lejos = (a, b) => a.reduce((s, x, k) => s + Math.abs(x - b[k]), 0);
  dice(lejos(colores.salida, colores.en3) * 3 < lejos(colores.salida, colores.en0), `y empieza en el segundo 3 del clip (${colores.salida} ≈ ${colores.en3}, lejos de ${colores.en0})`);

  // 7d. Sin límite: un clip de 70 s propone su primer minuto y se alarga.
  await importar("largo.mp4", await hacerVideo(70, { fps: 2, ancho: 160, alto: 90 }));
  await page.locator(".pt-recorte").waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
  dice((await tramoTexto()) === "Empieza 0:00 · Termina 1:00 · Dura 1:00" && !(await page.$(".pt-aviso")), `uno largo propone su primer minuto, sin aviso (${await tramoTexto()})`);
  await page.focus('.pt-tirador[data-cual="hasta"]');
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  const aviso = await page.$eval(".pt-aviso", (a) => a.textContent).catch(() => "");
  dice((await tramoTexto()) === "Empieza 0:00 · Termina 1:10 · Dura 1:10" && aviso === "Recomendado: menos de 1 minuto", `se alarga hasta el final y avisa (${await tramoTexto()} · ${aviso})`);
  dice(!(await bajarVideo.isDisabled()), "y el aviso no bloquea nada");
  await enUnaLinea("con el recorte y el aviso,", [".pt-pestanas", ".pt-tiempo-fila >> nth=0", ".pt-tiempo-fila >> nth=1", ".pt-barra"]);

  // 7e. La tira con ocho vídeos: «Subir» siempre a la vista, sin barra de
  // scroll, la rueda la desliza y el mismo archivo dos veces no se duplica.
  for (let k = 1; k <= 4; k++) await importar(`clip ${k}.mp4`, await hacerVideo(2 + k / 10, { fps: 10, ancho: 160, alto: 90 }));
  const nVideos = (await page.$$(".pt-tira .pt-mini")).length;
  await page.evaluate((p) => { window.__porImportar["C:\\Otra\\clip 1.mp4"] = p; window.__abrir.push("C:\\Otra\\clip 1.mp4"); }, {
    nombre: "clip 1 (copia).mp4", video: true, bytes: 1, huella: createHash("sha1").update(archivos.get("clip 1.mp4").toString("base64")).digest("hex"),
  });
  await page.click(".pt-subir");
  await page.waitForTimeout(800);
  dice(nVideos === 8 && (await page.$$(".pt-tira .pt-mini")).length === 8, `el mismo archivo otra vez no se duplica (${nVideos} y ${(await page.$$(".pt-tira .pt-mini")).length})`);
  const tira8 = await page.evaluate(() => {
    const t = document.querySelector(".pt-editor").getBoundingClientRect();
    const l = document.querySelector(".pt-tira-lista");
    const s = document.querySelector(".pt-subir").getBoundingClientRect();
    return { subir: s.right <= t.right + 1 && s.left >= t.left && s.width > 0, desliza: l.scrollWidth > l.clientWidth, barra: l.offsetHeight - l.clientHeight };
  });
  dice(tira8.subir && tira8.desliza && tira8.barra === 0, `con ocho, «Subir» a la vista y la tira se desliza sin barra (${JSON.stringify(tira8)})`);
  const centroTira = await page.$eval(".pt-tira-lista", (l) => { l.scrollLeft = 0; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(centroTira.x, centroTira.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  dice((await page.$eval(".pt-tira-lista", (l) => l.scrollLeft)) > 0, `la rueda la desliza de lado (${await page.$eval(".pt-tira-lista", (l) => l.scrollLeft)} px)`);
  await page.$eval(".pt-tira-lista", (l) => { l.scrollLeft = 0; });
  await page.click('.pt-mini[aria-label="doce.mp4"]');
  await page.waitForTimeout(800);
  await foto("7-tira-ocho-16x9-es");

  // 7f. Quitar uno con la X al pasar por encima, y otro con el teclado.
  const sitio = page.locator('.pt-mini-sitio:has(.pt-mini[aria-label="clip 4.mp4"])');
  const antesDeMirar = await sitio.locator(".pt-quitar").evaluate((x) => getComputedStyle(x).opacity);
  await sitio.hover();
  await page.waitForTimeout(300);
  const alMirar = await sitio.locator(".pt-quitar").evaluate((x) => getComputedStyle(x).opacity);
  dice(antesDeMirar === "0" && alMirar === "1", `la X sale al pasar por encima (${antesDeMirar} → ${alMirar})`);
  await sitio.locator(".pt-quitar").click();
  await page.waitForTimeout(300);
  await page.focus('.pt-mini[aria-label="clip 3.mp4"]');
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  const quitados = await page.evaluate(() => window.__quitados.join(", "));
  dice(quitados === "clip 4.mp4, clip 3.mp4" && (await page.$$(".pt-tira .pt-mini")).length === 6, `quitados con la X y con Supr, solo la copia de Adeorq (${quitados})`);
  await cerrar();

  // 7g. «Reiniciar»: la página se recarga; los vídeos, el recorte y los
  // volúmenes siguen ahí.
  await abrirPerfil("vez=1");
  await page.click(".pu-compartir");
  await abierta();
  await page.click('.pt-pestanas .pt-op:has-text("Vídeo")');
  await page.waitForTimeout(400);
  const reabierta = await page.$$eval(".pt-tira .pt-mini", (bs) => bs.map((b) => b.getAttribute("aria-label")).join(", "));
  dice(reabierta === "clip 2.mp4, clip 1.mp4, largo.mp4, doce.mp4, con sonido.mp4, mi fondo.mp4", `al reabrir, los importados siguen en la tira (${reabierta})`);
  await page.click('.pt-mini[aria-label="doce.mp4"]');
  await page.locator(".pt-recorte").waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  dice((await tramoTexto()) === "Empieza 0:03 · Termina 0:10 · Dura 7 s" && (await vols()) === "Volumen del vídeo 50 %, Volumen de la vista previa 20 %", `con su recorte y los volúmenes (${await tramoTexto()}; ${await vols()})`);

  // 7h. El editor cabe sin scroll, en 16:9 y en 9:16, a 1920 y a 1536 (su
  // portátil al 125 %, con y sin la barra de tareas).
  for (const [w, h] of [[1920, 1080], [1920, 1000], [1536, 864], [1536, 790]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const f of ["16:9", "9:16"]) {
      await page.click(`.pt-formato .pt-op:has-text("${f}")`);
      await page.waitForTimeout(250);
      const m = await page.$eval(".pt-velo", (v) => ({ sobra: v.scrollHeight - v.clientHeight, alto: Math.round(document.querySelector(".pt-lienzo")?.getBoundingClientRect().height ?? 0) }));
      dice(m.sobra <= 0, `a ${w}×${h} en ${f} el editor cabe sin scroll (${m.sobra} px de más; la tarjeta mide ${m.alto} de alto)`);
      if (w === 1920 && h === 1080) await foto(`8-video-${f.replace(":", "x")}-es`);
    }
  }
  await page.click('.pt-formato .pt-op:has-text("16:9")');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await cerrar();

  // 7i. Quien abre la tarjeta dice qué es (`que`). Sin decirlo, se deduce de
  // las fechas como antes: un tramo es un mes y un solo día es un día.
  const abrirCon = async (detail) => {
    await page.evaluate((d) => window.dispatchEvent(new CustomEvent("adeorq:abrir-tarjeta", { detail: d })), detail);
    await abierta();
    const r = await pulsado(".pt-barra .pt-op");
    await cerrar();
    return r.join(",");
  };
  const conQue = await abrirCon({ desde: hoy, hasta: hoy, que: "mes" });
  const sinQueTramo = await abrirCon({ desde: "2026-10-01", hasta: "2026-10-31" });
  const sinQueDia = await abrirCon({ desde: "2026-10-20", hasta: "2026-10-20" });
  dice(conQue === "Mes" && sinQueTramo === "Mes" && sinQueDia === "Día 20", `«del 1 al 1» con que: "mes" es un mes; sin «que», un tramo es un mes y un día es un día (${conQue} · ${sinQueTramo} · ${sinQueDia})`);

  // 8. En inglés.
  await abrirPerfil("vez=2&lang=en");
  await page.click(".pu-compartir");
  await abierta();
  const en = await etiqueta();
  dice(en?.startsWith(`${mesLargo("en")}: 2.5B Tokens`) && /New 12M/.test(en) && /Active days 1/.test(en), `en inglés (${en})`);
  const textos = await page.$eval(".pt-debajo", (d) => d.innerText.replace(/\s+/g, " "));
  dice(/Image Video 16:9 9:16/.test(textos) && /Highlight the number/.test(textos) && /Month Day Record All time/.test(textos) && /Download Copy/.test(textos), `el editor en inglés (${textos.slice(0, 120)}…)`);
  await page.click('.pt-formato .pt-op:has-text("16:9")');
  await page.click('.pt-barra .pt-op:has-text("All time")');
  const enTotal = await etiqueta();
  const dia60en = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 75).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  dice(enTotal?.startsWith(`Since ${dia60en}: 32B Tokens`) && /Active days 3/.test(enTotal), `«All time» en inglés (${enTotal})`);
  await foto("5a-ingles-total");
  await page.click('.pt-pestanas .pt-op:has-text("Video")');
  await enUnaLinea("en inglés, en Vídeo y con «All time»,");
  await page.click('.pt-mini[aria-label="doce.mp4"]');
  await page.locator(".pt-recorte").waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
  dice((await tramoTexto()) === "Starts 0:00 · Ends 0:12 · Lasts 12 s" && (await vols()) === "Video volume 100%, Preview volume 30%", `el recorte y los volúmenes en inglés (${await tramoTexto()}; ${await vols()})`);
  await enUnaLinea("en inglés, con el recorte,", [".pt-tiempo-fila >> nth=0", ".pt-tiempo-fila >> nth=1"]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const f of ["16:9", "9:16"]) {
    await page.click(`.pt-formato .pt-op:has-text("${f}")`);
    await page.waitForTimeout(500);
    const sobra = await page.$eval(".pt-velo", (v) => v.scrollHeight - v.clientHeight);
    dice(sobra <= 0, `en inglés a 1920×1080 en ${f}, sin scroll (${sobra})`);
    await foto(`9-video-${f.replace(":", "x")}-en`);
  }
  await page.click('.pt-formato .pt-op:has-text("16:9")');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.click('.pt-pestanas .pt-op:has-text("Image")');
  await page.click('.pt-barra .pt-op:has-text("Month")');
  await page.click(".pt-elegir-btn");
  await foto("5-ingles-lista");

  // 9. Con el editor abierto: ni cárceles ni mayúsculas espaciadas en lo suyo.
  for (const guion of ["carceles.js", "mayusculas.js"]) {
    const fn = (0, eval)(`(${readFileSync(join(AQUI, guion), "utf8")})`);
    const r = await fn(page);
    const suyas = r.fallos.filter((f) => /\.pt-|pt-velo|pt-/.test(f));
    dice(suyas.length === 0, `${guion}: el editor limpio${suyas.length ? ` (${suyas.join(" | ")})` : ""}`);
    const ajenas = r.fallos.filter((f) => !suyas.includes(f));
    if (ajenas.length) console.log(`      (fuera del editor, no es suyo: ${ajenas.join(" | ")})`);
  }

  dice(errores.length === 0, `ningún error en la página${errores.length ? ` (${errores.join(" | ")})` : ""}`);
} catch (e) {
  console.error(e);
  fallos++;
} finally {
  await ctx.close();
  await vite.close();
  rmSync(perfil, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
