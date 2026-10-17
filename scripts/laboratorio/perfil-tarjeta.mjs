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
//   · La tira: tu fondo de Adeorq primero, los tres de serie y «Subir».
//   · «Resaltar la cifra» apagado de fábrica, y encendido pinta la caja clara.
//   · Ningún proyecto sale hasta que lo eliges; elegido, su frase.
//   · Color, 9:16, y que se recuerdan al volver a abrir.
//   · Descargar: el PNG que llega a `guardar_tarjeta`, con su tamaño.
//   · Copiar: un `image/png` al portapapeles.
//   · Vídeo: sin un vídeo de fondo no se puede descargar; con uno subido, el
//     MP4 que llega leído caja a caja (H.264, el tamaño, los fotogramas), y
//     cancelar a medias.
//   · En inglés.
//   · Y con el editor abierto, `carceles.js` y `mayusculas.js`: lo del editor
//     tiene que salir limpio.
//
// Sale con 1 si algo falla. Con `--fotos` deja ahí las capturas.
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
  optimizeDeps: { include: ["mediabunny", "@tauri-apps/api/core", "@tauri-apps/plugin-dialog"] },
});
await vite.listen();
const BASE = vite.resolvedUrls.local[0].replace(/\/$/, "");

const { chromium } = createRequire(import.meta.url)(playwrightCore());
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
const ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true, viewport: { width: 1600, height: 1000 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));

// Las fechas en la hora de la ventana, que es la que cuenta el componente.
const dos = (n) => String(n).padStart(2, "0");
const ahora = new Date();
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
    cubo(60, { modelo: "claude-sonnet-5", carpeta: "C:\\proyectos\\VoCript", cacheLeida: 9000e6 }),
  ],
};
const mesLargo = (lang) => {
  const s = ahora.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { month: "long", year: "numeric" });
  return s[0].toUpperCase() + s.slice(1);
};

await page.route(`${BASE}/__fondo/**`, (r) => r.fulfill({ contentType: "image/png", body: readFileSync(join(RAIZ, "web", "assets", "og.png")) }));
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
  window.__copiado = [];
  Object.defineProperty(navigator, "clipboard", {
    value: { write: async (items) => window.__copiado.push(items.map((x) => x.types).flat()), writeText: async () => {} },
  });
  const aBase64 = (u8) => {
    let s = "";
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
  let escucha = 1;
  const contestar = (cmd, args, opciones) => {
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
      case "guardar_tarjeta":
        window.__guardados.push({ ruta: decodeURIComponent(opciones?.headers?.ruta ?? ""), b64: aBase64(args) });
        return null;
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
  dice(JSON.stringify(await pulsado(".pt-barra .pt-op")) === JSON.stringify(["Mes", "16:9"]), `«Mes» y 16:9 de fábrica (${await pulsado(".pt-barra .pt-op")})`);
  dice(await page.$eval(".pt-barra .pt-op >> nth=1", (b) => b.disabled), "«Día» apagado si no se abrió desde un día");
  dice((await page.$eval(".pt-interruptor", (b) => b.getAttribute("aria-pressed"))) === "false", "«Resaltar la cifra» apagado de fábrica");
  const tira = await page.$$eval(".pt-tira .pt-mini", (bs) => bs.map((b) => b.getAttribute("aria-label")));
  dice(JSON.stringify(tira) === JSON.stringify(["Tu fondo de Adeorq", "Cristal azul", "Aurora", "Noche"]), `la tira: tu fondo primero y los tres de serie (${tira})`);
  dice((await pulsado(".pt-mini"))[0] === "Tu fondo de Adeorq", "elegido, tu fondo");
  dice(/Subir imagen\s*hasta 10 MB/.test(await page.$eval(".pt-subir", (b) => b.textContent)), "y «Subir imagen» al final");
  await foto("1-mes");

  // 2. Un fondo de serie, y «Resaltar la cifra» pinta la caja clara.
  await page.click('.pt-mini[aria-label="Cristal azul"]');
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
  await page.click('.pt-barra .pt-op:has-text("9:16")');
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
  await page.click('.pt-accion:has-text("Copiar")');
  await page.waitForFunction(() => window.__copiado.length > 0, null, { timeout: 15000 });
  dice(JSON.stringify(await page.evaluate(() => window.__copiado[0])) === JSON.stringify(["image/png"]), "Copiar deja un PNG en el portapapeles");
  dice(/^Copiada/.test(await estado()), `y lo dice (${await estado()})`);
  await cerrar();
  dice(true, "Escape la cierra");

  // 6. Un día abre ese día; el récord, el récord. Lo elegido se recuerda; el proyecto no.
  await page.click(".pu-mes button[data-hoy]");
  await abierta();
  const deHoy = await etiqueta();
  const fechaHoy = ahora.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  dice(deHoy?.startsWith(`${fechaHoy}: 2,5B Tokens`), `un día abre ese día (${deHoy})`);
  dice((await pulsado(".pt-barra .pt-op")).includes(`Día ${ahora.getDate()}`), `con «Día ${ahora.getDate()}» elegido`);
  dice(JSON.stringify(await pulsado(".pt-muestra")) === JSON.stringify(["Morado"]) && (await pulsado(".pt-barra .pt-op")).includes("9:16"), "el color y el formato se recuerdan");
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

  // 7. Vídeo: sin vídeo de fondo no se descarga; con uno subido, el MP4.
  await page.click(".pu-compartir");
  await abierta();
  await page.click('.pt-pestanas .pt-op:has-text("Vídeo")');
  dice((await page.$$(".pt-tira .pt-mini")).length === 0, "en Vídeo, sin vídeos de fondo, solo «Subir vídeo»");
  const bajarVideo = page.locator('.pt-accion:has-text("Descargar vídeo")');
  dice((await bajarVideo.isDisabled()) && /vídeo de fondo/.test((await bajarVideo.getAttribute("data-tip")) ?? ""), "y «Descargar vídeo» apagado, diciendo por qué");
  // Un vídeo de fondo de dos segundos, hecho con el propio motor: cada fotograma de otro color.
  const mp4Fondo = await page.evaluate(async () => {
    const m = await import("/src/lib/exportarTarjeta.ts");
    const b = await m.exportarVideo((ctx, w, h, _f, t) => {
      ctx.fillStyle = `hsl(${Math.round(t * 180)}, 70%, 45%)`;
      ctx.fillRect(0, 0, w, h);
    }, { ancho: 640, alto: 360, fps: 30, segundos: 2 });
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
    return btoa(s);
  });
  await page.setInputFiles(".pt-tira input[type=file]", { name: "mi fondo.mp4", mimeType: "video/mp4", buffer: Buffer.from(mp4Fondo, "base64") });
  await page.locator('.pt-mini[aria-label="mi fondo.mp4"]').waitFor({ timeout: 5000 });
  dice((await pulsado(".pt-mini"))[0] === "mi fondo.mp4", "el vídeo subido queda elegido");
  await page.waitForTimeout(800);
  const h1 = await huella();
  await page.waitForTimeout(500);
  const h2 = await huella();
  dice(h1 !== h2, "la vista previa se mueve con el vídeo");
  await foto("4-video");
  await bajarVideo.click();
  await page.locator(".pt-progreso").waitFor({ timeout: 5000 });
  dice(/Sacando el vídeo… \d+ %/.test(await page.$eval(".pt-progreso", (p) => p.textContent)), "mientras sale, el progreso y «Cancelar»");
  await page.waitForFunction(() => window.__guardados.length > 1, null, { timeout: 60000 });
  const mp4 = await page.evaluate(() => window.__guardados[1]);
  const info = leerMp4(Buffer.from(mp4.b64, "base64"));
  dice(
    info.arriba?.join(" ") === "ftyp moov mdat" && info.codec === "avc1" && info.ancho === 1080 && info.alto === 1920 && info.muestras === 90,
    `Descargar vídeo guarda un MP4: ${info.arriba?.join(" ")}, ${info.codec}, ${info.ancho}×${info.alto}, ${info.muestras} fotogramas (un fondo de 2 s da 3 s)`,
  );
  dice(/\.mp4$/.test(mp4.ruta), `con su extensión (${mp4.ruta})`);
  await page.click('.pt-accion:has-text("Descargar vídeo")');
  await page.locator(".pt-progreso").waitFor({ timeout: 5000 });
  await page.click('.pt-acciones .pt-accion:has-text("Cancelar")');
  await page.waitForFunction(() => document.querySelector(".pt-estado")?.textContent === "Cancelado.", null, { timeout: 5000 }).catch(() => {});
  dice((await estado()) === "Cancelado." && (await page.evaluate(() => window.__guardados.length)) === 2, `cancelar a medias no guarda nada (${await estado()})`);
  await cerrar();

  // 8. En inglés.
  await abrirPerfil("vez=2&lang=en");
  await page.click(".pu-compartir");
  await abierta();
  const en = await etiqueta();
  dice(en?.startsWith(`${mesLargo("en")}: 2.5B Tokens`) && /New 12M/.test(en) && /Active days 1/.test(en), `en inglés (${en})`);
  const textos = await page.$eval(".pt-debajo", (d) => d.innerText.replace(/\s+/g, " "));
  dice(/Image Video/.test(textos) && /Highlight the number/.test(textos) && /Month Day Record/.test(textos) && /Download Copy/.test(textos), `el editor en inglés (${textos.slice(0, 120)}…)`);
  await page.click('.pt-barra .pt-op:has-text("16:9")');
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
