// El navegador de la derecha (`components/Navegador.tsx`), mirado en pantalla con la app de verdad.
//
// `navegador-de-verdad.mjs` prueba el motor llamando a Rust a mano. Esto prueba lo que se VE:
// abre la app aislada con el navegador abierto en github.com (que en un iframe sale en blanco),
// le pone algo de la interfaz encima del hueco como haría un menú, y comprueba que la página se
// cambia por su foto mientras está tapada y vuelve al quitarlo. Deja fotos de la ventana entera
// hechas con `PrintWindow`, que sí captura el panel nativo (una captura de la página por el
// puerto de depuración no lo vería: no es DOM).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/navegador-en-pantalla.mjs <carpeta para las fotos> [ruta del .exe]
//
// Necesita internet (abre github.com). La ventana va al fondo y sin foco; casa, datos y
// navegador en una carpeta temporal.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const FOTOS = resolve(process.argv[2] ?? ".");
const EXE = process.argv[3] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9800 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-nav-pantalla-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const WEB = "https://github.com/Mun1to/Adeorq-releases";

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

function abrirApp() {
  const hijo = spawn(EXE, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "interfaz"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      ADEORQ_MCP_PUERTO: String(PUERTO + 1),
      // Pestañas nativas con la carpeta forzada: solo en laboratorio (`modo_nativo`).
      ADEORQ_NAVEGADOR_LABORATORIO: "1",
    },
  });
  hijo.unref();
  return hijo.pid;
}

const ps = (guion) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { encoding: "utf8" });

/** Mi ventana, al fondo, sin foco y con el tamaño pedido. Dos veces: medido, una orden de
    tamaño de cada dos no llega (ver `navegador-de-verdad.mjs`). */
function colocarVentana(pid, ancho, alto) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
    [void][W.U]::ShowWindow($p.MainWindowHandle, 9)
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 40, 40, ${ancho}, ${alto}, 0x0010)
    Start-Sleep -Milliseconds 300
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 40, 40, ${ancho}, ${alto}, 0x0010)
  `;
  return ps(guion).status === 0;
}

/** Foto de la ventana entera con PrintWindow (PW_RENDERFULLCONTENT), aunque esté detrás.
    La ventana se busca entre las del proceso por ser la más grande y visible: `MainWindowHandle`
    a veces da una auxiliar de 16×16 (medido el 2026-10-18). */
function foto(pid, ruta) {
  const guion = `
    Add-Type -AssemblyName System.Drawing
    Add-Type @"
using System; using System.Runtime.InteropServices;
public class PW { [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint f);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  public delegate bool F(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(F f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public struct R { public int L, T, D, B; }
  public static IntPtr Mayor(uint pid) { IntPtr mejor = IntPtr.Zero; long area = 0;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); R r;
      if (p == pid && IsWindowVisible(h) && GetWindowRect(h, out r)) { long a = (long)(r.D - r.L) * (r.B - r.T); if (a > area) { area = a; mejor = h; } }
      return true; }, IntPtr.Zero); return mejor; } }
"@
    $p = Get-Process -Id ${pid}
    if ($p.Path -ne '${EXE.replace(/'/g, "''")}') { exit 1 }
    $h = [PW]::Mayor(${pid})
    if ($h -eq [IntPtr]::Zero) { exit 1 }
    $r = New-Object PW+R
    [void][PW]::GetWindowRect($h, [ref]$r)
    $b = New-Object System.Drawing.Bitmap ($r.D - $r.L), ($r.B - $r.T)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $dc = $g.GetHdc()
    [void][PW]::PrintWindow($h, $dc, 2)
    $g.ReleaseHdc($dc)
    $b.Save('${ruta.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
  `;
  return ps(guion).status === 0;
}

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

async function interfaz() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    return lista.find((t) => t.type === "page" && t.url.includes("localhost:1420"));
  }, 30_000);
  if (!destino) throw new Error("la ventana no abrió su puerto de depuración");
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
  const js = async (expr) => {
    const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, cerrar: () => ws.close() };
}

let pid = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  mkdirSync(FOTOS, { recursive: true });
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(join(BASE, "proyectos"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));

  pid = abrirApp();
  dice(await hasta(() => colocarVentana(pid, 1600, 950), 12_000, 200), "la ventana de pruebas va al fondo, sin foco, a 1600×950");
  let v = await interfaz();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`(() => {
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }))});
    localStorage.setItem("adeorq-navegador-abierto", "1");
    localStorage.setItem("adeorq-navegador-ancho", "760");
    localStorage.setItem("adeorq-navegador", ${JSON.stringify(JSON.stringify({ tabs: [WEB], activa: 0 }))});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await interfaz();

  // A la Cabina, que es donde vive el navegador.
  await hasta(() => v.js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Cabina/.test(x.textContent.trim())); b && b.click(); return !!document.querySelector(".nav"); })()`), 10_000);
  const nav = await hasta(() => v.js(`(() => { const n = document.querySelector(".nav"); if (!n) return null; const r = n.getBoundingClientRect(); return r.width > 100 ? { ancho: Math.round(r.width), alto: Math.round(r.height) } : null; })()`), 10_000);
  dice(Boolean(nav), `el navegador se ve a la derecha (${JSON.stringify(nav)})`);

  const titulo = await hasta(() => v.js(`(() => { const t = document.querySelector('.nav-pest[data-on="true"] .nav-pest-nom'); const s = t && t.textContent; return s && /Adeorq/i.test(s) ? s : null; })()`), 25_000, 500);
  dice(Boolean(titulo), `github.com carga y su título llega a la pestaña («${titulo}»)`);
  const direccion = await v.js(`document.querySelector(".nav-url input").value`);
  dice(/github\.com\/Mun1to\/Adeorq-releases/.test(direccion), `la dirección se ve sin el https:// («${direccion}»)`);
  await dormir(2500);
  dice(foto(pid, join(FOTOS, "1-github.png")), `foto: ${join(FOTOS, "1-github.png")}`);

  // Algo de la interfaz encima del hueco, como un menú: la página se cambia por su foto.
  await v.js(`(() => {
    const h = document.querySelector(".nav-hueco").getBoundingClientRect();
    const m = document.createElement("div");
    m.id = "menu-de-prueba";
    m.textContent = "Un menú de la interfaz encima de la página";
    m.style.cssText = "position:fixed;z-index:9999;padding:18px 22px;border-radius:8px;background:#1b2436;color:#e6edfa;font:600 15px system-ui;box-shadow:0 12px 32px rgba(0,0,0,.45);left:" + (h.left + 40) + "px;top:" + (h.top + 40) + "px";
    document.body.appendChild(m);
  })()`);
  const tapada = await hasta(() => v.js(`!!document.querySelector(".nav-foto")`), 4000, 100);
  dice(tapada, "con algo encima del hueco, la página se cambia por su foto");
  await dormir(600);
  dice(foto(pid, join(FOTOS, "2-menu-encima.png")), `foto: ${join(FOTOS, "2-menu-encima.png")} (el menú tiene que verse entero)`);
  await v.js(`document.getElementById("menu-de-prueba").remove()`);
  const vuelve = await hasta(() => v.js(`!document.querySelector(".nav-foto")`), 4000, 100);
  dice(vuelve, "al quitarlo, vuelve la página de verdad");
  await dormir(800);
  dice(foto(pid, join(FOTOS, "3-sin-menu.png")), `foto: ${join(FOTOS, "3-sin-menu.png")}`);

  // Usarlo con el ratón, como Munir: clics de verdad para Chromium (por el puerto de
  // depuración de la interfaz, sin tocar el escritorio).
  const clic = async (x, y) => {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await v.enviar("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
  };
  const centro = (sel) => v.js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const cuantas = () => v.js(`document.querySelectorAll(".nav-pest:not([data-muere])").length`);

  let c = await centro(".nav-mas");
  await clic(c.x, c.y);
  dice(Boolean(await hasta(async () => (await cuantas()) === 2 && (await v.js(`!!document.querySelector(".nav-vacio")`)), 3000, 100)), "el + abre una pestaña en blanco con los puertos para elegir");
  dice(await v.js(`document.activeElement === document.querySelector(".nav-url input")`), "y deja el cursor en la dirección para escribir");
  await dormir(400);
  dice(foto(pid, join(FOTOS, "4-pestana-nueva.png")), `foto: ${join(FOTOS, "4-pestana-nueva.png")}`);

  // Una palabra suelta se busca, como en cualquier navegador: Munir escribió «casa» y el panel
  // fue a `http://casa` («no se encontró la dirección IP del servidor de casa», 2026-10-18).
  await v.enviar("Input.insertText", { text: "casa" });
  for (const type of ["keyDown", "keyUp"]) await v.enviar("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  // Con el puerto de depuración abierto Google suele contestar con su captcha (`/sorry/…`,
  // un 429) en vez de los resultados: vale igual, lo que se mide es adónde fue.
  const buscada = await hasta(() => v.js(`(() => { const d = document.querySelector(".nav-url input").value; return /google\\.[a-z.]+\\/(search\\?.*q=casa|sorry\\/.*q%3Dcasa)/.test(d) ? d : null; })()`), 20_000, 400);
  dice(Boolean(buscada), `escribir «casa» la busca en Google («${buscada}»)`);
  await dormir(1500);
  dice(await v.js(`!document.querySelector(".nav-aviso")`), "y no sale «no ha podido cargar» encima de lo que Google contesta");
  dice(foto(pid, join(FOTOS, "4b-busqueda.png")), `foto: ${join(FOTOS, "4b-busqueda.png")}`);

  // Una web que contesta con un error (un 404 con su página) se ha cargado; una que no existe, no.
  const errores = createServer((req, res) => {
    res.statusCode = 404;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>no está</title><h1>404, pero con su página</h1>");
  });
  await new Promise((ok) => errores.listen(0, "127.0.0.1", ok));
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_ir", { id: 2, url: "http://127.0.0.1:${errores.address().port}/nada" })`);
  await hasta(() => v.js(`document.querySelector('.nav-pest[data-on="true"] .nav-pest-nom')?.textContent === "no está"`), 8000, 200);
  await dormir(1200);
  dice(await v.js(`!document.querySelector(".nav-aviso")`), "un 404 con su página no saca el aviso de que no cargó");
  errores.close();
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_ir", { id: 2, url: "http://no-existe.invalid/" })`);
  const aviso = await hasta(() => v.js(`document.querySelector(".nav-aviso")?.textContent ?? null`), 10_000, 200);
  dice(/no contesta/.test(aviso ?? ""), `una web que no existe sí lo saca («${aviso}»)`);
  c = await centro('.nav-pest[data-on="true"] .nav-pest-x');
  await clic(c.x, c.y);
  dice(Boolean(await hasta(async () => (await cuantas()) === 1 && (await v.js(`!document.querySelector(".nav-vacio")`)), 3000, 100)), "su ✕ la cierra y vuelve a la de github");

  // Estirar el panel con el tirador: 120 px hacia la izquierda.
  const ancho0 = await v.js(`Math.round(document.querySelector(".nav").getBoundingClientRect().width)`);
  c = await centro(".nav-tirador");
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await v.enviar("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
  for (let k = 1; k <= 6; k++) {
    await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x - 20 * k, y: c.y, button: "left", buttons: 1 });
    await dormir(30);
  }
  await v.enviar("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x - 120, y: c.y, button: "left", clickCount: 1 });
  const ancho1 = await v.js(`Math.round(document.querySelector(".nav").getBoundingClientRect().width)`);
  const guardado = await v.js(`localStorage.getItem("adeorq-navegador-ancho")`);
  dice(ancho1 - ancho0 >= 110 && Number(guardado) === ancho1, `el tirador lo estira y se recuerda (${ancho0} → ${ancho1}, guardado ${guardado})`);
  await dormir(700);
  dice(foto(pid, join(FOTOS, "5-estirado.png")), `foto: ${join(FOTOS, "5-estirado.png")} (la página tiene que seguir al panel)`);

  // Una web que abre diez ventanas de golpe: cada pestaña es un Chromium entero, así que
  // entran tres por ráfaga (revisión de seguridad del 2026-10-18).
  const bucle = createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(req.url === "/" ? `<!doctype html><title>bucle</title><script>for (let i = 0; i < 10; i++) window.open("/" + i);</script>` : "<title>hija</title>hija");
  });
  await new Promise((ok) => bucle.listen(0, "127.0.0.1", ok));
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_ir", { id: 1, url: "http://127.0.0.1:${bucle.address().port}/" })`);
  await dormir(2500);
  const tras = await cuantas();
  dice(tras === 4, `de diez ventanas que pide una web entran tres (${tras} pestañas en total)`);
  bucle.close();
  v.cerrar();
} catch (e) {
  fallos++;
  console.log(`FALLO ${e.message}`);
} finally {
  if (pid) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  // Un navegador de WebView2 puede quedar huérfano con la carpeta cogida: se reconoce porque su
  // línea de comandos lleva la ruta de esta pasada, que es única (ver `de-quien-de-verdad.mjs`).
  ps(`Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${BASE.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
  // Muertos, la carpeta todavía tarda en soltarse (medido: con 1,5 s a veces EPERM).
  await dormir(3000);
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
  } catch (e) {
    console.log(`(no pude borrar ${BASE}: ${e.code})`);
  }
}
console.log(fallos ? `${fallos} fallo(s)` : "BIEN: el navegador se ve, carga github.com y ningún menú queda debajo de la página");
process.exit(fallos ? 1 : 0);
