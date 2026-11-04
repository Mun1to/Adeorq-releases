// Cuánta memoria gasta sacar un vídeo largo de la tarjeta, dentro de la app de
// verdad (`lib/exportarTarjeta.ts`, `PerfilTarjeta.tsx`).
//
// Importa el vídeo, lo deja entero como tramo, lo saca a disco con «Descargar
// vídeo» y mide cada 2 s la memoria de todo el árbol de la ventana (los
// procesos de WebView2 de la aislada, y de ellos el mayor y el montón de JS),
// más la que le queda libre al equipo. Si esa baja de 5 GB, la prueba se corta
// sola y cierra lo suyo: el equipo es de quien trabaja.
//
//   node scripts/laboratorio/tarjeta-memoria-de-verdad.mjs <exe> <vídeo> [--sin-sonido] [--fotos <carpeta>]
//
// El binario es el de `tarjeta-fondos-de-verdad.mjs` (alcance de assets en
// %TEMP%; su receta, en su cabecera) y `pnpm dev` en el 1420. Copia el exe fuera
// de C:\ct antes: otra terminal puede recompilarlo. Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";
import { leerMp4 } from "./mp4-cajas.mjs";

const EXE = process.argv[2] && resolve(process.argv[2]);
const VIDEO = process.argv[3] && resolve(process.argv[3]);
const SIN_SONIDO = process.argv.includes("--sin-sonido");
const iFotos = process.argv.indexOf("--fotos");
const FOTOS = iFotos > 0 ? resolve(process.argv[iFotos + 1]) : null;
if (!EXE || !VIDEO || !existsSync(EXE) || !existsSync(VIDEO)) {
  console.error("uso: node scripts/laboratorio/tarjeta-memoria-de-verdad.mjs <exe> <vídeo> [--sin-sonido] [--fotos <carpeta>]");
  process.exit(2);
}
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const NOMBRE = basename(VIDEO);
const GB = 1073741824;
const LIBRE_MINIMA = 5 * GB;
const mb = (b) => `${Math.round(b / 1048576)} MB`;
const libre = () => {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"], { encoding: "utf8" });
  return Number(r.stdout.trim()) * 1024;
};
const DEPURAR = 9700 + (process.pid % 100);
const MCP = 3700 + (process.pid % 100);

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

const GUARDA = `(() => {
  const antes = window.fetch;
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "dialog") return responde(plugin[2] === "save" ? window.__guardarEn || null : plugin[2] === "open" ? window.__abrirEn || null : null);
    if (plugin && plugin[1] === "opener") return responde(null);
    return antes(a, b);
  };
})()`;

/** Los procesos del WebView2 de la aislada: suma, el mayor y el privado. */
function memoria(carpeta) {
  return new Promise((ok) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${carpeta.replace(/'/g, "''")}*' } | ForEach-Object { "$($_.WorkingSetSize) $($_.PrivatePageCount)" }; Get-Process -Name '${basename(EXE, ".exe")}' -ErrorAction SilentlyContinue | ForEach-Object { "R $($_.WorkingSet64)" }`]);
    let s = "";
    ps.stdout.on("data", (d) => (s += d));
    ps.on("close", () => {
      const lineas = s.trim().split(/\r?\n/).filter(Boolean);
      const rust = lineas.filter((l) => l.startsWith("R ")).reduce((t, l) => t + Number(l.slice(2)), 0);
      const filas = lineas.filter((l) => !l.startsWith("R ")).map((l) => l.split(" ").map(Number));
      ok({ rust, total: filas.reduce((t, [w]) => t + w, 0), privada: filas.reduce((t, [, p]) => t + p, 0), mayor: Math.max(0, ...filas.map(([w]) => w)) });
    });
  });
}

let a;
try {
  a = await abrirAislada({ nombre: "tarjeta-memoria", exe: EXE, puertoMcp: MCP, depurar: DEPURAR, guarda: GUARDA });
  const navegador = join(a.base, "navegador");
  const js = (e) => a.v.js(e);
  const foto = async (archivo) => {
    if (!FOTOS) return;
    const r = await a.v.enviar("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(FOTOS, archivo), Buffer.from(r.data, "base64"));
  };
  await a.v.enviar("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });

  await hasta(() => js(`!!document.querySelector('[data-tab="perfil"]')`), 20_000);
  await js(`document.querySelector('[data-tab="perfil"]').click()`);
  await dormir(800);
  await js(`window.dispatchEvent(new CustomEvent("adeorq:abrir-tarjeta", { detail: { desde: "2026-10-01", hasta: "2026-10-31" } }))`);
  await hasta(() => js(`!!document.querySelector(".pt-velo canvas.pt-lienzo")`), 120_000, 500);
  await js(`[...document.querySelectorAll(".pt-pestanas .pt-op")].find((b) => b.textContent.includes("Vídeo")).click()`);
  await dormir(500);
  await js(`window.__abrirEn = ${JSON.stringify(VIDEO)}; document.querySelector(".pt-subir").click(); true`);
  await hasta(() => js(`!!document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]')`), 180_000, 200);
  await js(`document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]').click(); true`);
  await hasta(() => js(`!!document.querySelector(".pt-recorte")`), 30_000);
  const dura = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO], { encoding: "utf8" }).stdout.trim());
  await js(`(() => { const el = document.querySelector('.pt-tirador[data-cual="hasta"]'); el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); el.dispatchEvent(new KeyboardEvent("keyup", { key: "End", bubbles: true })); return true; })()`);
  await dormir(500);
  console.log(`      tramo: ${await js(`document.querySelector(".pt-tramo")?.textContent ?? ""`)}`);
  // El interruptor «Sonido» (encendido de fábrica).
  const suena = await js(`(() => { const b = [...document.querySelectorAll("button,label,[role=switch]")].find((e) => /^Sonido$/.test(e.textContent.trim())); return b ? (b.getAttribute("aria-pressed") ?? b.getAttribute("aria-checked") ?? "?") : "no está"; })()`);
  console.log(`      interruptor Sonido: ${suena}`);
  if (SIN_SONIDO) await js(`[...document.querySelectorAll("button,label,[role=switch]")].find((e) => /^Sonido$/.test(e.textContent.trim()))?.click(); true`);
  await dormir(2500);
  await foto("memoria-1-antes.png");

  const destino = join(a.base, "salida", "larga.mp4");
  mkdirSync(join(a.base, "salida"), { recursive: true });
  const reposo = await memoria(navegador);
  const jsReposo = await js(`performance.memory?.usedJSHeapSize ?? 0`);
  console.log(`      en reposo: ${mb(reposo.total)} (mayor ${mb(reposo.mayor)}; privada ${mb(reposo.privada)}) · montón JS ${mb(jsReposo)} · libre ${mb(libre())}`);
  await js(`window.__guardarEn = ${JSON.stringify(destino)}; [...document.querySelectorAll(".pt-accion")].find((b) => b.textContent.includes("Descargar vídeo")).click(); true`);
  const t1 = Date.now();
  let pico = reposo;
  let picoJs = jsReposo;
  let minLibre = Infinity;
  let parado = 0;
  let ultimoP = "";
  for (;;) {
    const queda = libre();
    minLibre = Math.min(minLibre, queda);
    // Solo si la culpa es de esta prueba: que otras sesiones aprieten el equipo
    // no es motivo para cortarla (y 700 MB sobre el reposo ya lo es).
    if (queda < LIBRE_MINIMA && pico.total - reposo.total > 700 * 1048576) {
      parado = queda;
      await js(`[...document.querySelectorAll(".pt-acciones .pt-accion")].find((b) => b.textContent.includes("Cancelar"))?.click(); true`).catch(() => {});
      console.log(`      PARO: al equipo le quedan ${mb(queda)} libres; cancelo la exportación`);
      break;
    }
    const m = await memoria(navegador);
    if (m.total > pico.total) pico = m;
    const heap = await js(`performance.memory?.usedJSHeapSize ?? 0`).catch(() => 0);
    picoJs = Math.max(picoJs, heap);
    const p = await js(`document.querySelector(".pt-progreso")?.textContent ?? ""`).catch(() => "");
    if (p && p !== ultimoP && /(^|\D)\d?[05] %/.test(p)) console.log(`      ${p} · árbol ${mb(m.total)} (mayor ${mb(m.mayor)}) · Rust ${mb(m.rust)} · JS ${mb(heap)} · libre ${mb(queda)} · ${Math.round((Date.now() - t1) / 1000)} s`);
    ultimoP = p || ultimoP;
    const fin = await js(`document.querySelector(".pt-estado")?.textContent ?? ""`).catch(() => "");
    // Acabó: el estado dice algo y ya no hay progreso, o el MP4 está en su sitio
    // sin su `.part` (con diez minutos la primera no siempre llegaba a verse).
    if ((fin && !p) || (existsSync(destino) && !existsSync(`${destino}.part`))) break;
    if (Date.now() - t1 > 40 * 60_000) break;
    await dormir(2000);
  }
  const tardo = (Date.now() - t1) / 1000;
  const estado = await js(`document.querySelector(".pt-estado")?.textContent ?? ""`).catch(() => "");
  console.log(`      RESULTADO ${Math.round(dura)} s de vídeo · tardó ${Math.round(tardo)} s · pico del árbol ${mb(pico.total)} (el mayor ${mb(pico.mayor)}; privada ${mb(pico.privada)}) · pico montón JS ${mb(picoJs)} · mínimo libre del equipo ${mb(minLibre)}`);
  if (parado) throw new Error(`parado: al equipo le quedaban ${mb(parado)} libres`);
  dice(/^Guardada en /.test(estado) && existsSync(destino), `«${estado}»`);
  if (existsSync(destino)) {
    const info = leerMp4(readFileSync(destino));
    console.log(`      archivo ${mb(statSync(destino).size)}: ${info.arriba?.join(" ")}, ${info.codec} ${info.ancho}×${info.alto}, ${info.muestras} fotogramas, ${info.segundos?.toFixed(2)} s${info.sonido ? `, sonido ${info.sonido.codec} ${info.sonido.segundos?.toFixed(2)} s` : ", sin sonido"}`);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,nb_frames,duration:format=duration", "-of", "compact", destino], { encoding: "utf8" });
    console.log(`      ffprobe: ${probe.stdout.trim().replace(/\r?\n/g, " | ")}`);
    dice(info.arriba?.filter((c) => c !== "free").join(" ") === "ftyp moov mdat", "el moov va delante");
    if (FOTOS) {
      const f = join(FOTOS, "memoria-2-ultimo-fotograma.png");
      spawnSync("ffmpeg", ["-v", "error", "-y", "-sseof", "-1", "-i", destino, "-frames:v", "1", "-update", "1", f]);
      console.log(`      último fotograma: ${f}`);
    }
  }
  await foto("memoria-3-despues.png");
  const errores = await js(`(window.__errores ?? []).join(" | ")`).catch(() => "");
  if (errores) console.log(`      errores de la página: ${errores}`);
} catch (e) {
  console.error(e);
  fallos++;
} finally {
  await a?.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
