// El Perfil con TUS datos en el binario de verdad: tu uso, el porfolio en dos
// columnas y sin lo que no es un proyecto (la raíz del disco, la de proyectos,
// una carpeta con punto, la memoria de Claude: en «Otros», aquí y en la lista
// de la tarjeta), sus pestañas a 320 px y la tarjeta en «Total» guardada como PNG y
// como MP4 por el puente de Rust, con el diálogo de Windows contestado desde la
// página.
//
// `perfil-uso.js` y `perfil-tarjeta.mjs` prueban las piezas en Brave con un
// doble de Tauri, y `tarjeta-de-verdad.mjs` el motor con una historia de
// mentira. Esto junta las tres cosas que allí faltan: el Rust de verdad
// (`uso_historia` leyendo tus conversaciones, `guardar_tarjeta` escribiendo en
// disco), tus cifras y el WebView2 de la app.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/perfil-de-verdad.mjs [ruta del .exe] [--fotos <carpeta>]
//
// Sin ruta, copia C:\ct\debug\adeorq.exe a la carpeta temporal y lanza la
// copia: así otra sesión puede recompilar mientras tanto. Abre una ventana
// «Adeorq · DESARROLLO» un par de minutos, al fondo y sin foco, y la maneja por
// el puerto de depuración (`aislada.mjs`): ni ratón ni teclado. Solo en
// Windows; necesita `ffmpeg` y `ffprobe` en el PATH. Las fotos (el Perfil a
// 1.920, a 1.536 y a 320, y el editor en «Total») y lo guardado (el PNG y los
// dos MP4) quedan en `--fotos` (por defecto `.playwright-mcp/perfil-de-verdad`).
//
// Lo que es de verdad y lo que no:
//   · Tus datos: copia (nunca el original) de `%LOCALAPPDATA%\Adeorq\
//     uso-historia-2.json` en la carpeta de datos de la aislada, y `GUARDA_PERFIL`
//     cambia las cuentas que viajan en `uso_historia` por las carpetas que esa
//     caché ya conoce (`~/.claude`, `~/.codex` y las cuentas añadidas): Rust
//     solo LEE ahí, y lo que vuelve a guardar va a la copia. Los proyectos son
//     los de `C:\proyectos` (solo se listan).
//   · El diálogo de guardar (`plugin:dialog|save`) NUNCA llega a Windows: lo
//     contesta la página con una ruta de la carpeta de la prueba, o con «nada»
//     si la prueba no ha dicho dónde. Tampoco el explorador (`plugin:opener`).
//     Al acabar se mira que no haya caído nada nuevo en tus Descargas.
//   · Copiar no se pulsa: el portapapeles es el de quien trabaja.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";
import { leerPng } from "./mp4-cajas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const FOTOS = resolve(iFotos >= 0 ? args[iFotos + 1] : join(RAIZ, ".playwright-mcp", "perfil-de-verdad"));
const dado = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--fotos");
const CACHE = join(process.env.LOCALAPPDATA ?? "", "Adeorq", "uso-historia-2.json");
const DESCARGAS = join(process.env.USERPROFILE ?? "", "Downloads");
// Del rango que no pisa a nadie: depuración 9400-9449, MCP 39400-39449.
const DEPURAR = 9400 + (process.pid % 50);
const MCP = 39400 + (process.pid % 50);

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

/** Las carpetas de cuenta que tu caché ya conoce, con su CLI: lo mismo que
 *  pediría tu Adeorq, que tiene tus cuentas y la aislada no. */
function cuentasDeLaCache() {
  const raices = new Map();
  for (const clave of Object.keys(JSON.parse(readFileSync(CACHE, "utf8")))) {
    const ruta = clave.replace(/^\\\\\?\\/, "");
    const i = ruta.search(/\\(projects|sessions|archived_sessions)\\/);
    if (i <= 0) continue;
    const dir = ruta.slice(0, i);
    raices.set(dir.toLowerCase(), { provider: /codex/i.test(dir.split("\\").pop()) ? "codex" : "claude", dir });
  }
  return [...raices.values()];
}

/** Lo que el Perfil necesita además de `GUARDA`: tus cuentas, y ningún diálogo
 *  ni explorador fuera de la ventana. */
const guardaPerfil = (cuentas) => `(() => {
  const antes = window.fetch;
  const CUENTAS = ${JSON.stringify(cuentas)};
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.__uso = [];
  window.__dialogos = [];
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "dialog") {
      const ruta = plugin[2] === "save" ? window.__guardarEn || null : null;
      window.__dialogos.push({ que: plugin[2], ruta });
      return responde(ruta);
    }
    if (plugin && plugin[1] === "opener") return responde(null);
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    if (m && m[1] === "uso_historia" && b && typeof b.body === "string") {
      const pedido = JSON.parse(b.body);
      pedido.cuentas = CUENTAS;
      const t0 = performance.now();
      return antes(a, { ...b, body: JSON.stringify(pedido) }).then((r) => {
        r.clone().json().then((h) => window.__uso.push({ ms: Math.round(performance.now() - t0), archivos: h.archivos, cubos: h.cubos?.length ?? 0, proyectos: pedido.proyectos?.length ?? 0 }), () => {});
        return r;
      });
    }
    return antes(a, b);
  };
})()`;

/** Lo que hay en tus Descargas tocado desde `desde` (ms). */
const descargasDesde = (desde) => {
  try {
    return readdirSync(DESCARGAS).filter((n) => {
      try {
        return statSync(join(DESCARGAS, n)).mtimeMs >= desde;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};

/** Las pistas de un MP4, leídas por ffprobe. */
function pistas(ruta) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,duration,sample_rate,channels:format=duration", "-of", "json", ruta], { encoding: "utf8" });
  if (r.status !== 0) return { error: r.stderr || String(r.error) };
  const j = JSON.parse(r.stdout);
  const audio = j.streams.find((s) => s.codec_type === "audio");
  // Lo más alto que suena, en dB: una pista llena de silencio también es una pista.
  const vol = audio && spawnSync("ffmpeg", ["-v", "info", "-i", ruta, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
  const pico = vol && Number(vol.stderr.match(/max_volume: (-?[\d.]+) dB/)?.[1]);
  return { video: j.streams.find((s) => s.codec_type === "video"), audio, pico, segundos: Number(j.format?.duration) };
}

const empezo = Date.now();
let exe = dado && resolve(dado);
let copia = null;
let a = null;
try {
  if (!existsSync(CACHE)) throw new Error(`no está tu caché de uso (${CACHE}): abre el Perfil en tu Adeorq una vez`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  if (!exe) {
    copia = join(tmpdir(), `adeorq-perfil-de-verdad-${process.pid}.exe`);
    copyFileSync("C:\\ct\\debug\\adeorq.exe", copia);
    exe = copia;
  }
  if (!existsSync(exe)) throw new Error(`no está ${exe}: compila antes con cargo build`);
  mkdirSync(FOTOS, { recursive: true });
  const cuentas = cuentasDeLaCache();
  console.log(`      cuentas de tu caché: ${cuentas.map((c) => `${c.provider} ${c.dir}`).join(" · ")}`);

  a = await abrirAislada({
    nombre: "perfil-de-verdad",
    exe,
    puertoMcp: MCP,
    depurar: DEPURAR,
    fotos: FOTOS,
    raiz: "C:\\proyectos",
    sembrar: (datos) => copyFileSync(CACHE, join(datos, "uso-historia-2.json")),
    guarda: guardaPerfil(cuentas),
  });
  const { v } = a;
  dice(true, "la ventana de pruebas va al fondo, sin foco, con su casa, sus datos y su navegador");
  const pantalla = (ancho, alto, escala = 1) => v.enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: escala, mobile: false });
  const foto = async (archivo) => {
    const r = await v.enviar("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(FOTOS, archivo), Buffer.from(r.data, "base64"));
    return join(FOTOS, archivo);
  };

  // ── Tu uso, con tus datos ──
  await pantalla(1920, 1032);
  await hasta(() => v.js(`!!document.querySelector('[data-tab="perfil"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="perfil"]').click()`);
  const t0 = Date.now();
  const pinto = await hasta(() => v.js(`!!document.querySelector(".pu-cifra > b") && !document.querySelector(".pu .espera")`), 300_000, 500);
  dice(pinto, `el Perfil pinta tu uso (${Math.round((Date.now() - t0) / 1000)} s)`);
  const uso = await v.js("window.__uso");
  const ultima = uso.at(-1);
  dice(ultima?.archivos > 0 && ultima.cubos > 0 && ultima.proyectos > 1, `uso_historia lee tus ${ultima?.archivos ?? 0} conversaciones (${ultima?.cubos ?? 0} cubos, ${ultima?.proyectos ?? 0} proyectos, ${((ultima?.ms ?? 0) / 1000).toFixed(1)} s)`);
  const cifra = await v.js(`document.querySelector(".pu-cifra > b").textContent`);
  const fila = await v.js(`document.querySelector(".pu-fila").innerText.replace(/\\s+/g, " ")`);
  dice(/^\d+(,\d)?[KMB]$/.test(cifra) && /Récord /.test(fila), `la cifra del mes «${cifra}» y su fila («${fila}»)`);

  // ── El porfolio en Proyectos, a 1.920 y a 1.536 (su portátil al 125 %) ──
  const columnas = `(() => {
    const l = document.querySelector(".pu-lista");
    const filas = [...l.querySelectorAll(".pu-parte")];
    const x = [...new Set(filas.map((f) => Math.round(f.getBoundingClientRect().left)))];
    const cortados = filas.map((f) => f.querySelector(".pu-parte-nombre")).filter((n) => n && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent);
    const seg = filas.findIndex((f) => Math.round(f.getBoundingClientRect().left) === x[1]);
    return {
      columnas: getComputedStyle(l).gridTemplateColumns.split(" ").length,
      filas: filas.length,
      xs: x,
      // Se leen de arriba abajo: la segunda columna empieza en la fila de la primera.
      deArribaAbajo: seg > 0 && Math.abs(filas[seg].getBoundingClientRect().top - filas[0].getBoundingClientRect().top) < 2,
      ultima: filas.at(-1)?.querySelector(".pu-parte-nombre")?.textContent,
      cortados,
      caja: Math.round(document.querySelector(".pu-porfolio").getBoundingClientRect().width),
    };
  })()`;
  const enProyectos = await v.js(`document.querySelector('.pu-pestanas [aria-selected="true"]')?.textContent`);
  dice(enProyectos === "Proyectos", `el porfolio se abre en Proyectos («${enProyectos}»)`);
  // Lo que no es un proyecto (Munir, 2026-10-18): la raíz del disco, la de
  // proyectos, una carpeta con punto y lo de Claude Code van a «Otros».
  const NO_SON = ["C:", "proyectos", ".playwright-mcp", "memory", "C--", "config", "munito-contenido"];
  const lista = await v.js(`[...document.querySelectorAll(".pu-lista .pu-parte")].map((f) => ({ nombre: f.querySelector(".pu-parte-nombre").textContent, tokens: f.querySelector("em").textContent, parte: f.querySelector("b").textContent }))`);
  const colados = lista.filter((f) => NO_SON.includes(f.nombre)).map((f) => f.nombre);
  const otros = lista.find((f) => f.nombre === "Otros");
  dice(
    lista.length > 1 && !colados.length && Boolean(otros),
    `el porfolio sin lo que no es un proyecto${colados.length ? ` (se cuelan: ${colados.join(", ")})` : ""}, con «Otros» ${otros ? `${otros.tokens} · ${otros.parte}` : "que no sale"}: ${lista.map((f) => f.nombre).join(", ")}`,
  );
  for (const [ancho, alto, escala, nombre] of [
    [1920, 1032, 1, "1920"],
    [1536, 816, 1.25, "1536"],
  ]) {
    await pantalla(ancho, alto, escala);
    await dormir(600);
    await v.js(`document.querySelector(".pu-porfolio").scrollIntoView({ block: "center" })`);
    await dormir(300);
    const c = await v.js(columnas);
    dice(c.columnas === 2 && c.deArribaAbajo && c.filas >= 6, `a ${ancho} px, ${c.filas} proyectos en dos columnas leídas de arriba abajo (caja de ${c.caja} px, columnas en x=${c.xs.join(" y ")}, la última «${c.ultima}»)`);
    dice(c.cortados.length === 0, `a ${ancho} px, ningún nombre cortado${c.cortados.length ? ` (${c.cortados.join(", ")})` : ""}`);
    console.log(`      foto: ${await foto(`perfil-${nombre}.png`)}`);
  }
  const vigilantes = { carceles: (await carceles(v, ".pu")).fallos, mayusculas: (await mayusculas(v, ".pu")).fallos };
  dice(!vigilantes.carceles.length && !vigilantes.mayusculas.length, `tu uso, sin cárceles ni mayúsculas espaciadas${vigilantes.carceles.length + vigilantes.mayusculas.length ? ` (${[...vigilantes.carceles, ...vigilantes.mayusculas].join(" · ")})` : ""}`);

  // ── Las pestañas a 320 px: las tres enteras, sin salirse de su caja ──
  await pantalla(320, 720);
  await dormir(600);
  await v.js(`document.querySelector(".pu-pestanas").scrollIntoView({ block: "center" })`);
  await dormir(300);
  const pestanas = await v.js(`(() => {
    const caja = document.querySelector(".pu-porfolio").getBoundingClientRect();
    return [...document.querySelectorAll(".pu-pestanas button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { texto: b.textContent, entera: b.scrollWidth <= b.clientWidth + 1 && r.left >= caja.left - 0.5 && r.right <= caja.right + 0.5 && r.right <= innerWidth, izq: Math.round(r.left), der: Math.round(r.right), caja: [Math.round(caja.left), Math.round(caja.right)] };
    });
  })()`);
  const fuera = pestanas.filter((p) => !p.entera);
  dice(pestanas.length === 3 && fuera.length === 0, `a 320 px, las tres pestañas enteras dentro de su caja${fuera.length ? ` (se cortan: ${fuera.map((p) => `${p.texto} ${p.izq}-${p.der} en ${p.caja.join("-")}`).join(", ")})` : ""}`);
  // Y la lista se lee: sin la barra, el nombre se queda con el sitio.
  const nombre = await v.js(`Math.round(document.querySelector(".pu-parte-nombre").getBoundingClientRect().width)`);
  const cifrasFuera = await v.js(`[...document.querySelectorAll(".pu-parte em, .pu-parte b")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)`);
  dice(nombre >= 80 && cifrasFuera.length === 0, `a 320 px, el nombre de cada proyecto tiene sitio (${nombre} px) y cada cifra cabe en su columna${cifrasFuera.length ? ` (se salen: ${cifrasFuera.join(", ")})` : ""}`);
  console.log(`      foto: ${await foto("perfil-320.png")}`);
  for (const nombre of ["Modelos", "Proveedores", "Proyectos"]) {
    await v.js(`[...document.querySelectorAll(".pu-pestanas button")].find((b) => b.textContent === ${JSON.stringify(nombre)}).click()`);
    await dormir(150);
  }

  // ── La tarjeta en «Total», como imagen y como vídeo, guardada de verdad ──
  await pantalla(1920, 1032);
  await dormir(500);
  const salida = join(a.base, "Tarjetas de prueba");
  mkdirSync(salida, { recursive: true });
  const lienzo = "document.querySelector('canvas.pt-lienzo')?.getAttribute('aria-label') ?? ''";
  const estado = "document.querySelector('.pt-estado')?.textContent ?? ''";
  const pulsar = (sel, texto) =>
    v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${texto ? `x.textContent.trim() === ${JSON.stringify(texto)}` : "true"}); if (!b || b.disabled) return false; b.click(); return true; })()`);
  const guardarComo = async (archivo, boton) => {
    const ruta = join(salida, archivo);
    await v.js(`window.__guardarEn = ${JSON.stringify(ruta)}; true`);
    const t = Date.now();
    await pulsar(".pt-accion", boton);
    const dijo = await hasta(async () => {
      const e = await v.js(estado);
      return /^(Guardada en|No ha salido)/.test(e) && e;
    }, 180_000, 500);
    await v.js("window.__guardarEn = null; true");
    return { ruta, dijo, s: ((Date.now() - t) / 1000).toFixed(1) };
  };

  await pulsar(".pu-compartir");
  dice(await hasta(() => v.js(lienzo), 10_000), "el icono de compartir abre la tarjeta");
  dice(await pulsar(".pt-barra .pt-op", "Total"), "«Total» se puede elegir");
  const total = await hasta(async () => {
    const l = await v.js(lienzo);
    return /^Desde el \d+ de \S+ de \d{4}/.test(l) && l;
  }, 5000);
  dice(Boolean(total), `la tarjeta cuenta desde tu primer día («${total || (await v.js(lienzo))}»)`);
  // Su lista de proyectos cuenta igual que el porfolio: desde el primer día, ninguno de esos.
  await pulsar(".pt-elegir-btn");
  const elegibles = await v.js(`[...document.querySelectorAll('.pt-lista [role="option"]')].slice(1).map((b) => b.firstChild.textContent)`);
  await pulsar(".pt-elegir-btn");
  const coladosTarjeta = elegibles.filter((n) => NO_SON.includes(n));
  dice(elegibles.length > 1 && !coladosTarjeta.length, `la tarjeta ofrece ${elegibles.length} proyectos y ninguno de los que no lo son${coladosTarjeta.length ? ` (se cuelan: ${coladosTarjeta.join(", ")})` : ""}`);

  const png = await guardarComo("tarjeta total.png", "Descargar");
  const infoPng = existsSync(png.ruta) ? leerPng(readFileSync(png.ruta)) : {};
  dice(infoPng.firma && infoPng.ancho === 1920 && infoPng.alto === 1080, `Descargar guarda el PNG por el puente: ${infoPng.ancho}×${infoPng.alto}, ${existsSync(png.ruta) ? Math.round(statSync(png.ruta).size / 1024) : 0} KB («${png.dijo}»)`);
  if (existsSync(png.ruta)) copyFileSync(png.ruta, join(FOTOS, "tarjeta-total.png"));

  // El vídeo: con un fondo de vídeo subido por el selector, que es lo que lo enciende.
  dice(await pulsar(".pt-pestanas .pt-op", "Vídeo"), "la pestaña Vídeo está viva en el WebView2");
  const fondo = join(a.base, "fondo de prueba.mp4");
  const hecho = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", fondo]);
  if (hecho.error || hecho.status !== 0) throw new Error(`ffmpeg no hizo el fondo: ${hecho.error ?? hecho.stderr}`);
  const { root } = await v.enviar("DOM.getDocument", { depth: 0 });
  const { nodeId } = await v.enviar("DOM.querySelector", { nodeId: root.nodeId, selector: ".pt-tira input[type=file]" });
  await v.enviar("DOM.setFileInputFiles", { nodeId, files: [fondo] });
  dice(await hasta(() => v.js(`document.querySelector('.pt-mini[aria-pressed="true"]')?.getAttribute('aria-label') === 'fondo de prueba.mp4'`), 10_000), "el vídeo subido queda de fondo");
  const conSonido = await v.js(`document.querySelector('.pt-sonido .pt-interruptor')?.getAttribute('aria-pressed')`);
  dice(conSonido === "true", `«Sonido» encendido de fábrica (${conSonido})`);
  dice(/^Desde el /.test(await v.js(lienzo)), "y la tarjeta sigue en «Total»");
  await dormir(800);
  console.log(`      foto: ${await foto("editor-total.png")}`);

  const mp4 = await guardarComo("tarjeta total.mp4", "Descargar vídeo");
  const p1 = existsSync(mp4.ruta) ? pistas(mp4.ruta) : { error: "no está" };
  dice(
    p1.video?.codec_name === "h264" && p1.video.width === 1920 && p1.video.height === 1080 && Math.abs(p1.segundos - 3) < 0.1,
    `el MP4 existe y ffprobe lo abre: ${p1.error ?? `${p1.video?.codec_name} ${p1.video?.width}×${p1.video?.height}, ${p1.segundos?.toFixed(2)} s, ${Math.round(statSync(mp4.ruta).size / 1024)} KB en ${mp4.s} s`} («${mp4.dijo}»)`,
  );
  dice(
    p1.audio?.codec_name === "aac" && Math.abs(Number(p1.audio.duration) - Number(p1.video?.duration)) < 0.1 && p1.pico > -20,
    `con «Sonido», su pista de audio: ${p1.audio ? `${p1.audio.codec_name} ${p1.audio.sample_rate} Hz ${p1.audio.channels} canales, ${Number(p1.audio.duration).toFixed(2)} s, pico ${p1.pico} dB` : "ninguna"}`,
  );
  if (existsSync(mp4.ruta)) copyFileSync(mp4.ruta, join(FOTOS, "tarjeta-total.mp4"));

  await pulsar(".pt-sonido .pt-interruptor");
  dice((await v.js(`document.querySelector('.pt-sonido .pt-interruptor').getAttribute('aria-pressed')`)) === "false", "«Sonido» se apaga");
  const mudo = await guardarComo("tarjeta total sin sonido.mp4", "Descargar vídeo");
  const p2 = existsSync(mudo.ruta) ? pistas(mudo.ruta) : { error: "no está" };
  dice(p2.video?.codec_name === "h264" && !p2.audio, `sin «Sonido», el MP4 sale sin pista de audio (${p2.error ?? `${p2.video?.codec_name}, audio: ${p2.audio?.codec_name ?? "ninguno"}`})`);

  const dialogos = await v.js("window.__dialogos");
  dice(dialogos.length === 3 && dialogos.every((d) => d.que === "save" && d.ruta?.startsWith(salida)), `los tres «Guardar como» los contesta la página, ninguno llega a Windows (${dialogos.map((d) => d.que).join(", ")})`);
  await v.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true");
  dice(await hasta(() => v.js("!document.querySelector('.pt-velo')"), 3000), "Escape cierra la tarjeta");
} catch (e) {
  dice(false, e.message);
} finally {
  await a?.cerrar();
  if (copia) await hasta(() => (rmSync(copia, { force: true }), true), 20_000, 1000);
}
const nuevas = descargasDesde(empezo).filter((n) => /adeorq|tarjeta/i.test(n));
dice(nuevas.length === 0, `nada nuevo de la tarjeta en tus Descargas${nuevas.length ? ` (${nuevas.join(", ")})` : ""}`);
console.log(`\nfotos y lo guardado: ${FOTOS}`);
console.log(fallos ? `${fallos} en rojo.` : "Todo en verde.");
process.exit(fallos ? 1 : 0);
