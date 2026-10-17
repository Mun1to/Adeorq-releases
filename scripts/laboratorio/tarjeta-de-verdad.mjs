// La tarjeta exportada (`lib/exportarTarjeta.ts`) dentro de la app de verdad:
// el WebView2 de Tauri, su puente y su protocolo de archivos.
//
// `tarjeta-exportar.mjs` ya prueba el vídeo en un Brave sin ventana. Esto mira
// lo que allí no existe:
//   · WebCodecs en el WebView2 de la app, no en un navegador.
//   · Guardar por el puente (`guardar_tarjeta`, los bytes en crudo y la ruta
//     escapada en una cabecera), con una carpeta con tildes, eñes y espacios;
//     y que se niegue a escribir un `.exe` o una ruta relativa.
//   · Un vídeo de fondo servido por el protocolo de archivos de Tauri
//     (`convertFileSrc`), que es como llega el fondo de la casa. Ese protocolo
//     contesta los rangos de mil en mil KB: el fondo lleva ruido arriba para
//     pesar varios megas y que la lectura tenga que pedir varios trozos. El
//     ruido no se puede comprimir y el codificador, sin bits, repite algún
//     fotograma del fondo; por eso cada fotograma de la tarjeta se compara con
//     lo que `ffmpeg` (tiene que estar en el PATH) lee de ESE archivo, no con
//     el gris que se quiso pintar.
//
// Lo que NO hace a propósito: copiar al portapapeles. Es el de Windows, el de
// quien está trabajando, y la primera versión de esta prueba se colgó en ese
// paso con lo suyo a medio guardar. `copiarImagen` es la misma llamada que ya
// usa la copia de capturas del lienzo (`CanvasImage.tsx`).
//
//   1. Un binario de desarrollo que cargue de :1490 y sirva archivos de la
//      carpeta temporal de la prueba (el :1420 suele ser de otra sesión, y
//      empaquetar `mediabunny` en su Vite le recargaría la página):
//        TAURI_CONFIG='{"build":{"devUrl":"http://127.0.0.1:1490"},"app":{"security":{"assetProtocol":{"enable":true,"scope":["$TEMP/adeorq-tarjeta/**"]}}}}' cargo build --manifest-path src-tauri/Cargo.toml
//      copiado fuera de C:\ct (cp C:/ct/debug/adeorq.exe <otra carpeta>), y
//      después `cargo build` otra vez SIN la variable, para que el de C:\ct
//      vuelva a cargar del :1420 que esperan las demás sesiones.
//   2. node scripts/laboratorio/tarjeta-de-verdad.mjs <ruta del .exe copiado>
//
// Levanta él mismo el Vite del :1490, con su caché aparte. Abre una ventana
// «Adeorq · DESARROLLO» medio minuto, la manda al fondo sin foco nada más nacer
// y la maneja por el puerto de depuración: ni ratón ni teclado. La casa, los
// datos, el navegador y el MCP son de pruebas (lo mismo que `mods-de-verdad.mjs`).
// Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { leerMp4, leerPng } from "./mp4-cajas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Resuelta con contrabarras: es lo que devuelve Get-Process, y con barras
// normales `alFondo` no la reconocía como suya y dejaba la ventana delante.
const EXE = process.argv[2] && resolve(process.argv[2]);
const PUERTO = 9700 + (process.pid % 100);
const BASE = join(tmpdir(), "adeorq-tarjeta", String(process.pid));
const DATOS = join(BASE, "datos", "Adeorq");
// Donde se guarda: con lo que una cabecera HTTP no admite tal cual.
const SALIDA = join(BASE, "Vídeos de Muñi", "año 2026");

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (que, ms, cada = 300) => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await Promise.resolve(que()).catch(() => null);
    if (v) return v;
    if (Date.now() > fin) return null;
    await dormir(cada);
  }
};

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

const ps = (guion) =>
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", guion], { encoding: "utf8" });

function abrirApp() {
  const hijo = spawn(EXE, [], {
    cwd: BASE,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      ADEORQ_MCP_PUERTO: String(PUERTO + 1000),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
    },
  });
  hijo.unref();
  return hijo.pid;
}

/** La ventana de MI proceso, al fondo y sin foco. Comprueba antes que es la mía. */
function alFondo(pid) {
  return (
    ps(`
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `).status === 0
  );
}

/** Lo que la casa de pruebas no aísla, tapado en la página antes de que cargue. */
const GUARDA = `(() => {
  const real = window.fetch.bind(window);
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/supabase\\.co|openrouter\\.ai/.test(url)) return Promise.reject(new TypeError("Failed to fetch"));
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "updater" && plugin[2] === "check") return responde(null);
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    if (m && ["media_now", "secret_get", "secret_put", "secret_forget", "openrouter_info", "save_ui_state"].includes(m[1])) return responde(null);
    if (m && m[1] === "load_ui_state") return responde("{}");
    return real(a, b);
  };
})()`;

async function ventana() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    return lista.find((t) => t.type === "page" && t.url.includes("127.0.0.1:1490"));
  }, 30_000);
  if (!destino) throw new Error("la ventana no abrió su puerto de depuración (¿el .exe carga de :1490?)");
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error("no conecta con la ventana"));
  });
  let n = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    if (m.error) p.mal(new Error(m.error.message));
    else p.ok(m.result);
  };
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = ++n;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  // Con tope: una página que no contesta no puede dejar la prueba colgada con
  // la ventana abierta, que es lo que pasó la primera vez.
  const js = async (expr, ms = 120_000) => {
    let reloj;
    const tope = new Promise((_, mal) => (reloj = setTimeout(() => mal(new Error(`la página no contesta en ${ms / 1000} s`)), ms)));
    const r = await Promise.race([enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }), tope]).finally(() => clearTimeout(reloj));
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, cerrar: () => ws.close() };
}

let app = 0;
let vite = null;
const cache = join(BASE, "vite");
try {
  if (!EXE || !existsSync(EXE)) throw new Error("uso: node scripts/laboratorio/tarjeta-de-verdad.mjs <adeorq.exe que carga de :1490> (ver la cabecera)");
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), BASE);

  vite = await createServer({
    root: RAIZ,
    configFile: join(RAIZ, "vite.config.ts"),
    cacheDir: cache,
    logLevel: "error",
    clearScreen: false,
    server: { host: "127.0.0.1", port: 1490, strictPort: true, hmr: false },
    optimizeDeps: { include: ["mediabunny", "@tauri-apps/api/core", "@tauri-apps/plugin-dialog"] },
  });
  await vite.listen();

  app = abrirApp();
  // Si no se puede mandar al fondo, se para aquí: una ventana delante de quien
  // está trabajando durante medio minuto no es una prueba, es un estorbo.
  if (!(await hasta(() => alFondo(app), 15_000, 200))) throw new Error("la ventana de pruebas no se dejó mandar al fondo: se para antes de estorbar");
  dice(true, "la ventana de pruebas va al fondo, sin foco");
  const v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: BASE, sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => v.js("!!window.__TAURI_INTERNALS__ && document.readyState === 'complete'"), 20_000);
  console.log(`      ${await v.js("navigator.userAgent.match(/Edg\\/[\\d.]+/)?.[0] ?? navigator.userAgent")}`);

  // Las funciones del módulo, a mano de cada paso.
  await v.js(`(async () => {
    window.__t = await import("/src/lib/exportarTarjeta.ts");
    window.__guardar = (blob, ruta) => blob.arrayBuffer().then((b) =>
      window.__TAURI_INTERNALS__.invoke("guardar_tarjeta", new Uint8Array(b), { headers: { ruta: encodeURIComponent(ruta) } })
    ).then(() => "", (x) => String(x));
    return true;
  })()`);

  dice(await v.js("window.__t.videoDisponible(1080, 1920, 30)"), "videoDisponible en el WebView2 de la app: H.264 a 1080×1920");

  // El fondo, hecho por ffmpeg como el vídeo de cualquiera: dos segundos a
  // 1280×720, cada fotograma con su gris (8 + 8·n en 0-255) y ruido arriba para
  // que pese varios megas. A calidad fija (`-qp 12`): sin control de bits que
  // se quede corto, cada fotograma sale con el gris que le toca.
  const fondo = join(SALIDA, "fondo de prueba.mp4");
  mkdirSync(SALIDA, { recursive: true });
  const hecho = spawnSync("ffmpeg", [
    "-v", "error", "-f", "lavfi",
    "-i", "color=c=black:s=1280x720:r=30:d=2,format=yuv420p,geq=lum='if(lt(Y,160),random(1)*255,16+(8+8*mod(N,30))*219/255)':cb=128:cr=128",
    "-c:v", "libx264", "-qp", "12", "-pix_fmt", "yuv420p", "-y", fondo,
  ]);
  if (hecho.error || hecho.status !== 0) throw new Error(`ffmpeg no hizo el fondo: ${hecho.error ?? hecho.stderr}`);
  const pesa = readFileSync(fondo).length;
  dice(pesa > 1000 * 1024 * 2, `el fondo pesa más de dos trozos del protocolo (${(pesa / 1048576).toFixed(1)} MB)`);

  // La tarjeta vertical con ese fondo, leído por convertFileSrc.
  const r2 = await v.js(`(async () => {
    const url = window.__TAURI_INTERNALS__.convertFileSrc(${JSON.stringify(fondo)}, "asset");
    const vistos = [];
    const t0 = performance.now();
    const blob = await window.__t.exportarVideo((ctx, w, h, f, t) => {
      if (f) {
        const s = Math.max(w / f.width, h / f.height);
        ctx.drawImage(f, (w - f.width * s) / 2, (h - f.height * s) / 2, f.width * s, f.height * s);
      }
      vistos.push(ctx.getImageData(w >> 1, h >> 1, 1, 1).data[0]);
      ctx.fillStyle = "#ff7a1a";
      ctx.fillRect(0, h - 240, w, 240);
    }, { ancho: 1080, alto: 1920, fps: 30, segundos: 3, fondo: url });
    const ms = Math.round(performance.now() - t0);
    return { url, vistos, ms, bytes: blob.size, error: await window.__guardar(blob, ${JSON.stringify(join(SALIDA, "tarjeta.mp4"))}) };
  })()`);
  // El gris de cada fotograma del fondo en el punto que cae en el centro de la
  // tarjeta (cubrir 1280×720 con 1080×1920 deja el centro en 640,360), leído
  // por ffmpeg: la luma cruda, sin su conversión de rango, devuelta a 0-255.
  const crudo = spawnSync("ffmpeg", ["-v", "error", "-i", fondo, "-vf", "crop=2:2:640:360", "-pix_fmt", "yuv420p", "-f", "rawvideo", "-"], { maxBuffer: 1e8 });
  const delFondo = [];
  for (let k = 0; crudo.stdout && k < crudo.stdout.length; k += 6) delFondo.push(Math.round(((crudo.stdout[k] - 16) * 255) / 219));
  const limpio = delFondo.length === 60 && delFondo.every((g, n) => Math.abs(g - (8 + 8 * (n % 30))) <= 3);
  dice(limpio, `el fondo de ffmpeg tiene en cada fotograma el gris que le toca (${delFondo.slice(0, 8).join(" ")}…)`);
  const malos = r2.vistos.map((x, n) => (Math.abs(x - delFondo[n % 60]) <= 3 ? null : `${n}:${x}≠${delFondo[n % 60]}`)).filter(Boolean);
  dice(r2.url.startsWith("http://asset.localhost/"), `el fondo llega por el protocolo de archivos (${r2.url.slice(0, 40)}…)`);
  dice(malos.length === 0, `cada fotograma lleva el fondo de su instante, leído a trozos, y vuelve a empezar a los 2 s${malos.length ? ` (${malos.slice(0, 6).join(", ")})` : ""}`);
  dice(r2.error === "", `guardar_tarjeta escribe el MP4 en una carpeta con tildes, eñes y espacios${r2.error ? ` (${r2.error})` : ""}`);
  const mp4 = existsSync(join(SALIDA, "tarjeta.mp4")) ? readFileSync(join(SALIDA, "tarjeta.mp4")) : Buffer.alloc(0);
  dice(mp4.length === r2.bytes, `y llega entero al disco (${mp4.length} de ${r2.bytes} bytes)`);
  const info = leerMp4(mp4);
  dice(
    info.arriba?.join(" ") === "ftyp moov mdat" && info.codec === "avc1" && info.ancho === 1080 && info.alto === 1920 && info.muestras === 90 && Math.abs(info.segundos - 3) < 0.04,
    `el MP4 guardado: ${info.arriba?.join(" ")}, ${info.codec}, ${info.ancho}×${info.alto}, ${info.muestras} fotogramas, ${info.segundos?.toFixed(3)} s`,
  );
  console.log(`      tarjeta vertical de 3 s con fondo de vídeo: ${r2.ms} ms, ${(r2.bytes / 1024).toFixed(0)} KB`);

  // La imagen, guardada y copiada.
  const r3 = await v.js(`(async () => {
    const png = await window.__t.exportarImagen((ctx, w, h) => {
      ctx.fillStyle = "rgb(20,140,220)"; ctx.fillRect(0, 0, w, h);
    }, { ancho: 1920, alto: 1080 });
    const malos = {
      exe: await window.__guardar(png, ${JSON.stringify(join(SALIDA, "tarjeta.exe"))}),
      relativa: await window.__guardar(png, "tarjeta.png"),
    };
    return { error: await window.__guardar(png, ${JSON.stringify(join(SALIDA, "tarjeta.png"))}), malos };
  })()`);
  const png = existsSync(join(SALIDA, "tarjeta.png")) ? leerPng(readFileSync(join(SALIDA, "tarjeta.png"))) : {};
  dice(r3.error === "" && png.firma && png.ancho === 1920 && png.alto === 1080, `el PNG guardado: firma y ${png.ancho}×${png.alto}${r3.error ? ` (${r3.error})` : ""}`);
  dice(Boolean(r3.malos.exe) && !existsSync(join(SALIDA, "tarjeta.exe")), `un .exe no se escribe («${r3.malos.exe}»)`);
  dice(Boolean(r3.malos.relativa), `una ruta relativa tampoco («${r3.malos.relativa}»)`);

  // El portapapeles no se toca (ver la cabecera): solo que la llamada existe.
  dice(await v.js("typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function'"), "el WebView2 tiene ClipboardItem y clipboard.write (copiar, SIN copiar de verdad)");
  v.cerrar();
} catch (e) {
  console.error(e);
  fallos++;
} finally {
  if (app) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  await vite?.close();
  await dormir(1000);
  rmSync(BASE, { recursive: true, force: true });
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
