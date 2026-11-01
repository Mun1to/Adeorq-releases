// Los fondos importados de la tarjeta y su vídeo largo, dentro de la app de
// verdad (`PerfilTarjeta.tsx`, `lib/exportarTarjeta.ts`, `fondos_tarjeta.rs`).
//
// `perfil-tarjeta.mjs` ya lo prueba todo con un doble de Tauri en un Brave.
// Esto mira lo que allí no existe:
//   · Rust copiando de verdad un vídeo de diez minutos a `tarjeta/fondos/` de
//     la carpeta de datos (sin `.part` al acabar) y el protocolo de assets
//     sirviéndolo a la vista previa, a la línea de tiempo y al motor.
//   · El recorte alargado hasta el final del clip y el MP4 de 1080p sacado a disco
//     a trozos por el puente (`tarjeta_video_*`, `fastStart: "reserve"`): el
//     archivo leído caja a caja y por `ffprobe`, lo que tardó, y la memoria
//     pico de los procesos del WebView2 de la aislada mientras salía.
//   · Cancelar a medias: ni el `.part` ni el destino se quedan en disco.
//   · Reiniciar de verdad el binario: el vídeo sigue en la tira, con su
//     recorte y los dos volúmenes.
//   · Quitarlo: se borra la copia de Adeorq y el original sigue donde estaba.
//
//   1. Un binario que sirva por el protocolo de assets la carpeta temporal de
//      la aislada (sus datos viven en %TEMP%, fuera del alcance de fábrica):
//        TAURI_CONFIG='{"app":{"security":{"assetProtocol":{"enable":true,"scope":["$APPLOCALDATA/**","$LOCALDATA/Adeorq/**","$TEMP/**"]}}}}' cargo build --manifest-path src-tauri/Cargo.toml
//      copiado fuera de C:\ct, y luego `cargo build` otra vez sin la variable.
//   2. `pnpm dev` (el binario de desarrollo carga de :1420).
//   3. Un vídeo largo con sonido, por ejemplo:
//        ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 600 -c:v libx264 -preset ultrafast -crf 32 -pix_fmt yuv420p -c:a aac -ac 2 diez-minutos.mp4
//   4. node scripts/laboratorio/tarjeta-fondos-de-verdad.mjs <exe copiado> <vídeo> [--fotos <carpeta>]
//
// La ventana va al fondo y sin foco; los diálogos los contesta la página. El
// MP4 de prueba se escribe en la carpeta temporal de la aislada y se borra con
// ella. Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";
import { leerMp4 } from "./mp4-cajas.mjs";

const EXE = process.argv[2] && resolve(process.argv[2]);
const VIDEO = process.argv[3] && resolve(process.argv[3]);
const IMAGEN = process.argv[4] && !process.argv[4].startsWith("--") ? resolve(process.argv[4]) : null;
const iFotos = process.argv.indexOf("--fotos");
const FOTOS = iFotos > 0 ? resolve(process.argv[iFotos + 1]) : null;
if (!EXE || !VIDEO || !existsSync(EXE) || !existsSync(VIDEO) || (IMAGEN && !existsSync(IMAGEN))) {
  console.error("uso: node scripts/laboratorio/tarjeta-fondos-de-verdad.mjs <exe> <vídeo> [<imagen>] [--fotos <carpeta>]");
  process.exit(2);
}
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const NOMBRE = basename(VIDEO);
const NOMBRE_IMAGEN = IMAGEN ? basename(IMAGEN) : null;
/** Por debajo de esto de memoria libre en el equipo, se cancela y se dice: el
    equipo es de quien trabaja (2026-11-01: Claude Code cortó una pasada de
    diez minutos porque el equipo entero se quedaba sin memoria). */
const LIBRE_MINIMA = 2048 * 1048576;
const libre = () => {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"], { encoding: "utf8" });
  return Number(r.stdout.trim()) * 1024;
};
const DEPURAR = 9600 + (process.pid % 100);
const MCP = 3600 + (process.pid % 100);

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

/** Los diálogos los contesta la página: nunca llega uno a Windows. */
const GUARDA = `(() => {
  const antes = window.fetch;
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.__dialogos = [];
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "dialog") {
      const ruta = plugin[2] === "save" ? window.__guardarEn || null : plugin[2] === "open" ? window.__abrirEn || null : null;
      window.__dialogos.push({ que: plugin[2], ruta });
      return responde(ruta);
    }
    if (plugin && plugin[1] === "opener") return responde(null);
    return antes(a, b);
  };
})()`;

/** La memoria de los procesos del WebView2 de la aislada (los reconoce su
    carpeta de navegador en la línea de comando): la suma y el que más. */
function memoria(carpeta) {
  return new Promise((ok) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${carpeta.replace(/'/g, "''")}*' } | ForEach-Object { "$($_.WorkingSetSize) $($_.PrivatePageCount)" }`]);
    let s = "";
    ps.stdout.on("data", (d) => (s += d));
    ps.on("close", () => {
      const filas = s.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split(" ").map(Number));
      ok({ total: filas.reduce((t, [w]) => t + w, 0), privada: filas.reduce((t, [, p]) => t + p, 0), mayor: Math.max(0, ...filas.map(([w]) => w)) });
    });
  });
}
const mb = (b) => `${Math.round(b / 1048576)} MB`;

let a;
try {
  a = await abrirAislada({ nombre: "tarjeta-fondos", exe: EXE, puertoMcp: MCP, depurar: DEPURAR, guarda: GUARDA });
  const fondos = join(a.base, "datos", "Adeorq", "tarjeta", "fondos");
  const navegador = join(a.base, "navegador");
  const js = (e) => a.v.js(e);
  const foto = async (archivo) => {
    if (!FOTOS) return;
    const r = await a.v.enviar("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(FOTOS, archivo), Buffer.from(r.data, "base64"));
  };
  await a.v.enviar("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });

  /** El Perfil, la tarjeta de octubre y la pestaña Vídeo. */
  const abrirVideo = async () => {
    await hasta(() => js(`!!document.querySelector('[data-tab="perfil"]')`), 20_000);
    await js(`document.querySelector('[data-tab="perfil"]').click()`);
    await dormir(800);
    await js(`window.dispatchEvent(new CustomEvent("adeorq:abrir-tarjeta", { detail: { desde: "2026-10-01", hasta: "2026-10-31" } }))`);
    await hasta(() => js(`!!document.querySelector(".pt-velo canvas.pt-lienzo")`), 120_000, 500);
    await js(`[...document.querySelectorAll(".pt-pestanas .pt-op")].find((b) => b.textContent.includes("Vídeo")).click()`);
    await dormir(500);
  };
  const tecla = (sel, key, veces = 1) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); for (let k = 0; k < ${veces}; k++) { el.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(key)}, bubbles: true })); } return true; })()`);
  const tramo = () => js(`document.querySelector(".pt-tramo")?.textContent ?? ""`);
  const vols = () => js(`[...document.querySelectorAll(".pt-volumen .pt-deslizador")].map((s) => s.getAttribute("aria-label") + " " + s.getAttribute("aria-valuetext")).join(", ")`);

  // 1. Importar: el diálogo contesta la ruta y Rust copia el archivo.
  await abrirVideo();
  await js(`window.__abrirEn = ${JSON.stringify(VIDEO)}; document.querySelector(".pt-subir").click(); true`);
  const t0 = Date.now();
  const llego = await hasta(() => js(`!!document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]')`), 120_000, 200);
  const copia = join(fondos, NOMBRE);
  dice(llego && existsSync(copia) && statSync(copia).size === statSync(VIDEO).size, `Rust copia ${mb(statSync(VIDEO).size)} a ${copia} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  dice(!readdirSync(fondos).some((f) => f.endsWith(".part")), `y no deja ningún .part (${readdirSync(fondos).join(", ")})`);
  const src = await js(`document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}] video')?.src ?? ""`);
  dice(/^http:\/\/asset\.localhost\//.test(src), `se sirve por el protocolo de assets (${src.slice(0, 60)}…)`);

  // 1b. Una imagen, en su pestaña: la misma pieza.
  const pestana = (texto) => js(`[...document.querySelectorAll(".pt-pestanas .pt-op")].find((b) => b.textContent.includes(${JSON.stringify(texto)})).click(); true`);
  if (IMAGEN) {
    await pestana("Imagen");
    await dormir(300);
    await js(`window.__abrirEn = ${JSON.stringify(IMAGEN)}; document.querySelector(".pt-subir").click(); true`);
    const laImagen = await hasta(() => js(`!!document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE_IMAGEN)}]')`), 30_000, 200);
    dice(laImagen && existsSync(join(fondos, NOMBRE_IMAGEN)), `la imagen también se copia a la carpeta de fondos (${readdirSync(fondos).join(", ")})`);
    await pestana("Vídeo");
    await dormir(300);
    await js(`document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]').click(); true`);
  }

  // 2. El recorte: de fábrica hasta el primer minuto; se alarga hasta el final
  // y se le quitan los cinco primeros segundos.
  const recorte = await hasta(() => js(`!!document.querySelector(".pt-recorte")`), 30_000);
  const dura = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO], { encoding: "utf8" }).stdout.trim());
  const reloj = (s) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
  const fabrica = `Empieza 0:00 · Termina ${reloj(Math.min(60, dura))} · Dura ${dura >= 59.5 ? reloj(Math.min(60, dura)) : `${Math.round(dura)} s`}`;
  dice(recorte && (await tramo()) === fabrica, `de fábrica (${await tramo()})`);
  const fotos = await hasta(() => js(`document.querySelectorAll(".pt-fotos img").length`), 30_000);
  dice(fotos >= 10, `la línea de tiempo con ${fotos} fotogramas del clip`);
  await tecla('.pt-tirador[data-cual="hasta"]', "End");
  await dormir(300);
  await tecla('.pt-tirador[data-cual="desde"]', "ArrowRight", 5);
  await dormir(300);
  const tramoPedido = `Empieza 0:05 · Termina ${reloj(dura)} · Dura ${reloj(dura - 5)}`;
  const aviso = await js(`document.querySelector(".pt-aviso")?.textContent ?? ""`);
  dice((await tramo()) === tramoPedido && (dura - 5 <= 60 || aviso === "Recomendado: menos de 1 minuto"), `recortado (${await tramo()}${aviso ? ` · ${aviso}` : ""})`);
  await tecla('.pt-deslizador[aria-label="Volumen de la vista previa"]', "ArrowRight", 3);
  await tecla('.pt-deslizador[aria-label="Volumen del vídeo"]', "ArrowLeft", 2);
  dice((await vols()) === "Volumen del vídeo 90 %, Volumen de la vista previa 45 %", `los volúmenes (${await vols()})`);
  await dormir(1500);
  await foto("de-verdad-1-diez-minutos.png");

  // 3. El MP4 de diez minutos, a disco a trozos, midiendo la memoria.
  const destino = join(a.base, "salida", "tarjeta larga ñ.mp4");
  mkdirSync(join(a.base, "salida"), { recursive: true });
  const reposo = await memoria(navegador);
  console.log(`      en reposo: ${mb(reposo.total)} entre todos los procesos del WebView2 (el mayor, ${mb(reposo.mayor)}; privada ${mb(reposo.privada)})`);
  await js(`window.__guardarEn = ${JSON.stringify(destino)}; [...document.querySelectorAll(".pt-accion")].find((b) => b.textContent.includes("Descargar vídeo")).click(); true`);
  const t1 = Date.now();
  let pico = reposo;
  let ultimo = "";
  let partePico = 0;
  let sinMemoria = 0;
  for (;;) {
    const queda = libre();
    if (queda < LIBRE_MINIMA) {
      sinMemoria = queda;
      await js(`[...document.querySelectorAll(".pt-acciones .pt-accion")].find((b) => b.textContent.includes("Cancelar"))?.click(); true`);
      console.log(`      PARO: al equipo le quedan ${mb(queda)} libres; cancelo la exportación`);
      break;
    }
    const m = await memoria(navegador);
    if (m.total > pico.total) pico = m;
    const parte = existsSync(`${destino}.part`) ? statSync(`${destino}.part`).size : 0;
    partePico = Math.max(partePico, parte);
    const p = await js(`document.querySelector(".pt-progreso")?.textContent ?? ""`).catch(() => "");
    if (p && p !== ultimo && /[05]0 %|\b0 %/.test(p)) console.log(`      ${p} · ${mb(m.total)} · .part ${mb(parte)} · ${Math.round((Date.now() - t1) / 1000)} s`);
    ultimo = p || ultimo;
    const fin = await js(`document.querySelector(".pt-estado")?.textContent ?? ""`).catch(() => "");
    if (fin && !p) break;
    if (Date.now() - t1 > 45 * 60_000) break;
    await dormir(2000);
  }
  if (sinMemoria) throw new Error(`parado: al equipo le quedaban ${mb(sinMemoria)} libres`);
  const tardo = (Date.now() - t1) / 1000;
  const estado = await js(`document.querySelector(".pt-estado")?.textContent ?? ""`);
  dice(/^Guardada en /.test(estado) && existsSync(destino) && !existsSync(`${destino}.part`), `«${estado}» en ${Math.round(tardo)} s, y el .part renombrado`);
  console.log(`      memoria pico: ${mb(pico.total)} entre todos (el mayor, ${mb(pico.mayor)}; privada ${mb(pico.privada)}); ${mb(pico.total - reposo.total)} más que en reposo`);
  const tam = existsSync(destino) ? statSync(destino).size : 0;
  if (tam) {
    const info = leerMp4(readFileSync(destino));
    dice(
      info.arriba?.filter((c) => c !== "free").join(" ") === "ftyp moov mdat" && info.codec === "avc1" && info.ancho === 1920 && info.alto === 1080 && info.muestras === Math.round(30 * Math.round((dura - 5) * 10) / 10),
      `leído caja a caja: ${info.arriba?.join(" ")}, ${info.codec}, ${info.ancho}×${info.alto}, ${info.muestras} fotogramas, ${info.segundos?.toFixed(2)} s, ${mb(tam)}`,
    );
    dice(info.sonido?.codec === "mp4a" && Math.abs(info.sonido.segundos - (dura - 5)) < 0.5, `con su pista AAC de ${info.sonido?.segundos?.toFixed(2)} s`);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,nb_frames:format=duration", "-of", "compact", destino], { encoding: "utf8" });
    dice(probe.status === 0 && /h264/.test(probe.stdout) && /aac/.test(probe.stdout), `ffprobe lo abre: ${probe.stdout.trim().replace(/\r?\n/g, " | ")}`);
  }

  // 4. Cancelar a medias.
  const otro = join(a.base, "salida", "cancelado.mp4");
  await js(`window.__guardarEn = ${JSON.stringify(otro)}; [...document.querySelectorAll(".pt-accion")].find((b) => b.textContent.includes("Descargar vídeo")).click(); true`);
  await hasta(() => js(`/[1-9] %/.test(document.querySelector(".pt-progreso")?.textContent ?? "")`), 120_000, 300);
  const aMedias = existsSync(`${otro}.part`);
  await js(`[...document.querySelectorAll(".pt-acciones .pt-accion")].find((b) => b.textContent.includes("Cancelar")).click(); true`);
  await hasta(() => js(`document.querySelector(".pt-estado")?.textContent === "Cancelado."`), 30_000, 300);
  await dormir(500);
  dice(aMedias && !existsSync(`${otro}.part`) && !existsSync(otro), `cancelar a medias borra el .part (había: ${aMedias}) y no deja el destino`);

  // 5. Reiniciar de verdad: el vídeo, su recorte y los volúmenes siguen.
  await a.reiniciar();
  await a.v.enviar("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1, mobile: false });
  await abrirVideo();
  const sigue = await hasta(() => js(`!!document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]')`), 30_000, 300);
  await js(`document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]').click(); true`);
  await hasta(() => js(`!!document.querySelector(".pt-recorte")`), 30_000);
  await dormir(500);
  dice(sigue && (await tramo()) === tramoPedido && (await vols()) === "Volumen del vídeo 90 %, Volumen de la vista previa 45 %", `tras reiniciar el binario, sigue en la tira con su recorte y los volúmenes (${await tramo()}; ${await vols()})`);
  await foto("de-verdad-2-tras-reiniciar.png");
  // Y el archivo se reproduce: un `<video>` con su dirección avanza solo.
  const avanza = await js(`(async () => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}] video').src.replace(/#.*$/, "");
    await v.play();
    await new Promise((r) => setTimeout(r, 1500));
    const t = v.currentTime;
    v.pause();
    v.removeAttribute("src");
    v.load();
    return t;
  })()`);
  dice(avanza > 0.5, `y el vídeo se reproduce tras reiniciar (avanzó ${avanza?.toFixed(2)} s en 1,5 s)`);
  if (IMAGEN) {
    await pestana("Imagen");
    await dormir(300);
    const img = await js(`(async () => {
      const b = document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE_IMAGEN)}]');
      if (!b) return "no está";
      const url = getComputedStyle(b).backgroundImage.replace(/^url\\("?|"?\\)$/g, "");
      const i = new Image();
      i.src = url;
      await i.decode();
      return i.naturalWidth + "×" + i.naturalHeight;
    })()`).catch((e) => String(e));
    dice(/^\d+×\d+$/.test(img), `y la imagen sigue y carga (${img})`);
    await pestana("Vídeo");
    await dormir(300);
  }

  // 6. Quitarlo: la copia de Adeorq se va, el original se queda.
  await js(`document.querySelector('.pt-mini-sitio:has(.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]) .pt-quitar').click(); true`);
  await hasta(() => js(`!document.querySelector('.pt-mini[aria-label=${JSON.stringify(NOMBRE)}]')`), 10_000, 200);
  await dormir(300);
  dice(!existsSync(copia) && existsSync(VIDEO), `quitado: la copia ya no está y el original sigue (${existsSync(VIDEO)})`);
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
