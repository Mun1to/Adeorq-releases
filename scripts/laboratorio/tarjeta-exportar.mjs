// La tarjeta de uso exportada como MP4 y como PNG (`lib/exportarTarjeta.ts`),
// con WebCodecs de verdad en un Brave sin ventana.
//
//   node scripts/laboratorio/tarjeta-exportar.mjs [--guardar <carpeta>]
//
// Levanta su propio Vite en 127.0.0.1 (con su caché aparte, para no pisar la
// del `pnpm dev` de otra sesión), abre un Brave de usar y tirar con el
// `playwright-core` que el MCP ya se bajó, y desde la página importa el módulo
// de verdad. Lo que mira:
//   · Un vídeo de fondo de UN segundo, hecho con el propio módulo, cada
//     fotograma de un gris distinto (el gris aguanta la compresión mejor que
//     un color). Una tarjeta vertical de DOS segundos encima: cada fotograma
//     tiene que llevar el fondo de su instante, y en el segundo segundo, el
//     fondo vuelve a empezar. Si el fondo fuera con el reloj, los grises
//     saldrían saltados o repetidos.
//   · El MP4 por dentro, leído aquí en Node: `ftyp`, el `moov` DELANTE del
//     `mdat` (lo que piden las redes), H.264 (`avc1`), la duración, el tamaño
//     y un fotograma por cada uno que se pintó.
//   · Que el MP4 se puede volver a leer: se saca un PNG con ese MP4 de fondo
//     en el segundo 1,5 y tiene que salir el gris de su fotograma.
//   · El PNG con una imagen de fondo: firma, tamaño y el píxel del fondo.
//   · Cancelar a medias corta en el acto con un `AbortError`.
//   · Lo que tarda una de diez segundos en horizontal, que es lo que esperará
//     quien la exporte.
//
// Sale con 1 si algo falla. Con `--guardar` deja el MP4 y los PNG en esa
// carpeta para mirarlos.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { leerMp4, leerPng } from "./mp4-cajas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRAVE = "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
const i = process.argv.indexOf("--guardar");
const GUARDAR = i > 0 ? process.argv[i + 1] : null;

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

// ── Vite propio, con la caché en una carpeta temporal.
const cache = mkdtempSync(join(tmpdir(), "banco-tarjeta-vite-"));
const vite = await createServer({
  root: RAIZ,
  configFile: join(RAIZ, "vite.config.ts"),
  cacheDir: cache,
  logLevel: "error",
  clearScreen: false,
  server: { host: "127.0.0.1", port: 5600 + (process.pid % 100), strictPort: false, hmr: false },
  // Empaquetadas al arrancar: si Vite las descubre a mitad de la prueba, recarga la página.
  optimizeDeps: { include: ["mediabunny", "@tauri-apps/api/core", "@tauri-apps/plugin-dialog"] },
});
await vite.listen();
const BASE = vite.resolvedUrls.local[0].replace(/\/$/, "");

const { chromium } = createRequire(import.meta.url)(playwrightCore());
const perfil = mkdtempSync(join(tmpdir(), "banco-brave-"));
const ctx = await chromium.launchPersistentContext(perfil, { executablePath: BRAVE, headless: true });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => console.log(`(error en la página) ${e.message}`));

try {
  // Una página vacía en el origen de Vite (127.0.0.1 es contexto seguro, que WebCodecs pide).
  await page.route(`${BASE}/banco-tarjeta.html`, (r) =>
    r.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>banco</title>" }),
  );
  await page.goto(`${BASE}/banco-tarjeta.html`);

  const r = await page.evaluate(async () => {
    const m = await import("/src/lib/exportarTarjeta.ts");
    const aBase64 = async (b) => {
      const u8 = new Uint8Array(await b.arrayBuffer());
      let s = "";
      for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
      return btoa(s);
    };
    const gris = (n) => 8 + n * 8;
    const centro = (ctx, w, h) => ctx.getImageData(w >> 1, h >> 1, 1, 1).data;
    const fuera = { disponible: await m.videoDisponible(1080, 1920, 30) };

    // El fondo: un segundo a 30 fps, cada fotograma con su gris.
    const fondo = await m.exportarVideo(
      (ctx, w, h, _f, t) => {
        const n = Math.round(t * 30);
        ctx.fillStyle = `rgb(${gris(n)},${gris(n)},${gris(n)})`;
        ctx.fillRect(0, 0, w, h);
      },
      { ancho: 640, alto: 360, fps: 30, segundos: 1 },
    );
    fuera.fondoBytes = fondo.size;

    // La tarjeta: el fondo cubriendo, y encima un rótulo que no toca el centro.
    const vistos = [];
    let avisos = 0;
    const pintar = (ctx, w, h, f, t) => {
      if (f) {
        const fw = f.width, fh = f.height;
        const s = Math.max(w / fw, h / fh);
        ctx.drawImage(f, (w - fw * s) / 2, (h - fh * s) / 2, fw * s, fh * s);
      }
      vistos.push(centro(ctx, w, h)[0]);
      ctx.fillStyle = "#ff7a1a";
      ctx.fillRect(0, 0, w, 200);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(`${t.toFixed(2)} s`, 40, 130);
    };
    const t0 = performance.now();
    const tarjeta = await m.exportarVideo(pintar, {
      ancho: 1080, alto: 1920, fps: 30, segundos: 2, fondo,
      alProgreso: () => avisos++,
    });
    fuera.msTarjeta = Math.round(performance.now() - t0);
    fuera.avisos = avisos;
    fuera.vistos = vistos.map((v) => Math.round((v - 8) / 8));
    fuera.mp4 = await aBase64(tarjeta);
    fuera.tipo = tarjeta.type;

    // Volver a leer el MP4: un PNG con él de fondo, en el segundo 1,5.
    let releido = null;
    const png1 = await m.exportarImagen(
      (ctx, w, h, f) => {
        if (f) ctx.drawImage(f, 0, 0, w, h);
        releido = { centro: centro(ctx, w, h)[0], rotulo: [...ctx.getImageData(w >> 1, 100, 1, 1).data].slice(0, 3) };
      },
      { ancho: 1080, alto: 1920, fondo: tarjeta, t: 1.5 },
    );
    fuera.releido = releido;
    fuera.png1 = await aBase64(png1);

    // El PNG con una imagen de fondo (un archivo, como el de un <input>).
    const lienzo = document.createElement("canvas");
    lienzo.width = 300; lienzo.height = 200;
    const c2 = lienzo.getContext("2d");
    c2.fillStyle = "rgb(20,140,220)"; c2.fillRect(0, 0, 300, 200);
    const imagen = await new Promise((ok) => lienzo.toBlob(ok, "image/png"));
    let pixel = null;
    const png2 = await m.exportarImagen(
      (ctx, w, h, f) => { ctx.drawImage(f, 0, 0, w, h); pixel = [...centro(ctx, w, h)].slice(0, 3); },
      { ancho: 1920, alto: 1080, fondo: imagen },
    );
    fuera.pixelImagen = pixel;
    fuera.png2 = await aBase64(png2);

    // Cancelar a medias.
    const corte = new AbortController();
    let t1 = 0;
    try {
      await m.exportarVideo(() => {}, {
        ancho: 1920, alto: 1080, fps: 30, segundos: 20,
        alProgreso: (h) => { if (h > 0.05 && !t1) { t1 = performance.now(); corte.abort(); } },
        senal: corte.signal,
      });
      fuera.cancelado = "terminó entero";
    } catch (e) {
      fuera.cancelado = e.name;
    }
    fuera.msCancelar = Math.round(performance.now() - t1);

    // Lo que espera quien exporta: diez segundos en horizontal, sobre el fondo de vídeo.
    const t2 = performance.now();
    const larga = await m.exportarVideo(pintar, { ancho: 1920, alto: 1080, fps: 30, segundos: 10, fondo });
    fuera.msDiez = Math.round(performance.now() - t2);
    fuera.bytesDiez = larga.size;
    return fuera;
  });

  dice(r.disponible, "videoDisponible: este Chromium codifica H.264 a 1080×1920");
  dice(r.tipo === "video/mp4", `el archivo sale como video/mp4 (${r.tipo})`);
  dice(r.avisos === 60, `un aviso de progreso por fotograma (${r.avisos} de 60)`);
  const esperado = Array.from({ length: 60 }, (_, n) => n % 30);
  const malos = r.vistos.map((v, n) => (v === esperado[n] ? null : `${n}:${v}≠${esperado[n]}`)).filter(Boolean);
  dice(malos.length === 0, `cada fotograma lleva el fondo de su instante, y el fondo vuelve a empezar al segundo${malos.length ? ` (${malos.slice(0, 6).join(", ")})` : ""}`);

  const mp4 = Buffer.from(r.mp4, "base64");
  const info = leerMp4(mp4);
  dice(info.arriba[0] === "ftyp", `empieza por ftyp (${info.arriba.join(" ")})`);
  dice(info.arriba.indexOf("moov") >= 0 && info.arriba.indexOf("moov") < info.arriba.indexOf("mdat"), "el moov va delante del mdat");
  dice(info.codec === "avc1", `H.264 (${info.codec})`);
  dice(Math.abs(info.segundos - 2) < 0.04, `dura 2 s (${info.segundos?.toFixed(3)})`);
  dice(info.ancho === 1080 && info.alto === 1920, `mide 1080×1920 (${info.ancho}×${info.alto})`);
  dice(info.muestras === 60, `60 fotogramas dentro (${info.muestras}; ${info.claves} clave)`);
  dice(r.releido && Math.round((r.releido.centro - 8) / 8) === 15, `releído en el 1,5 s sale el gris del fotograma 15 (${r.releido && Math.round((r.releido.centro - 8) / 8)})`);
  dice(r.releido && r.releido.rotulo[0] > 200 && r.releido.rotulo[2] < 80, `y el rótulo naranja sigue arriba (${r.releido?.rotulo})`);

  const png1 = leerPng(Buffer.from(r.png1, "base64"));
  dice(png1.firma && png1.ancho === 1080 && png1.alto === 1920, `PNG con vídeo de fondo: firma y 1080×1920 (${png1.ancho}×${png1.alto})`);
  const png2 = leerPng(Buffer.from(r.png2, "base64"));
  dice(png2.firma && png2.ancho === 1920 && png2.alto === 1080, `PNG con imagen de fondo: firma y 1920×1080 (${png2.ancho}×${png2.alto})`);
  // ±2: decodificar el PNG del fondo pasa por la conversión de color, y redondea.
  const cerca = r.pixelImagen && [20, 140, 220].every((v, k) => Math.abs(r.pixelImagen[k] - v) <= 2);
  dice(cerca, `y su fondo llega tal cual (${r.pixelImagen}, se pintó 20,140,220)`);

  dice(r.cancelado === "AbortError" && r.msCancelar < 1000, `cancelar a medias falla con AbortError, y en menos de un segundo (${r.cancelado}, ${r.msCancelar} ms)`);
  console.log(`      tarjeta vertical de 2 s: ${r.msTarjeta} ms, ${(mp4.length / 1024).toFixed(0)} KB`);
  console.log(`      horizontal de 10 s con vídeo de fondo: ${r.msDiez} ms, ${(r.bytesDiez / 1048576).toFixed(1)} MB`);

  if (GUARDAR) {
    mkdirSync(GUARDAR, { recursive: true });
    writeFileSync(join(GUARDAR, "tarjeta.mp4"), mp4);
    writeFileSync(join(GUARDAR, "tarjeta-video-de-fondo.png"), Buffer.from(r.png1, "base64"));
    writeFileSync(join(GUARDAR, "tarjeta-imagen-de-fondo.png"), Buffer.from(r.png2, "base64"));
    console.log(`      guardados en ${GUARDAR}`);
  }
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
