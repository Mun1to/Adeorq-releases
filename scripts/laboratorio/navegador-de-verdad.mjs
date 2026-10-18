// El navegador de verdad (`src-tauri/src/navegador.rs`), probado con el programa de verdad.
//
// Lo que no se puede probar sin abrir la app: que la pestaña es un webview HIJO de la ventana
// (no aparece ninguna ventana nueva en el escritorio), que le cuenta a la interfaz su título, su
// dirección y si carga, que atrás funciona, que lo que una web quiere abrir en ventana nueva
// llega como pestaña, que da su foto, que lo que se guarda en ella sigue al reabrir, y las tres
// puertas de seguridad:
//
//   · una web de la pestaña no llega a las órdenes de la app (ni por `invoke` ni por `fetch`);
//   · no lee la carpeta de datos por el protocolo `asset` (por eso la pestaña nace en
//     `about:blank`: el permiso CORS de ese protocolo es para la PRIMERA dirección);
//   · la interfaz de Adeorq no arranca metida en un iframe (`main.tsx`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/navegador-de-verdad.mjs [ruta del .exe]
//
// Abre dos veces una ventana «Adeorq · DESARROLLO», unos treinta segundos cada una, al fondo y
// sin foco, y la maneja por el puerto de depuración. Casa, datos y navegador en una carpeta
// temporal. Lo único que toca de fuera es LEER el tamaño de `raiz.txt` de los datos de verdad,
// que es lo que el protocolo `asset` serviría (su alcance sale de la carpeta del sistema, no de
// la variable de entorno): la sonda solo cuenta si pudo, nunca lo que pone.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { APARTE, aparte } from "./perfil-aparte.mjs";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9700 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-navegador-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const ASSET = join(homedir(), "AppData", "Local", "Adeorq", "raiz.txt");

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

/* ── La web de pruebas ─────────────────────────────────────────────────── */

const SONDA = `<!doctype html><meta charset="utf-8"><title>sonda del navegador</title>
<body style="background:#f6f8fa;font:16px system-ui"><h1>Sonda</h1><a id="otra" href="/otra.html">otra</a><script>
(async () => {
  const r = { galletaAntes: document.cookie, guardadoAntes: localStorage.getItem("adeorq-prueba") };
  const t = window.__TAURI_INTERNALS__;
  if (t && t.invoke) {
    const probar = (cmd, args) => t.invoke(cmd, args).then((v) => "contesta " + JSON.stringify(v), (e) => "rechazado: " + String(e).slice(0, 120));
    r.invoke = await probar("cierre_puede_fondo");
    r.invokeAbrir = await probar("nav_abrir", { id: 9, url: "https://example.com", hueco: { x: 0, y: 0, ancho: 10, alto: 10 } });
    r.invokeEvento = await probar("plugin:event|emit", { event: "nav-estado", payload: { id: 1, titulo: "falso" } });
  }
  r.fetchIpc = await fetch("http://ipc.localhost/cierre_puede_fondo", { method: "POST", headers: { "Content-Type": "application/json", "Tauri-Callback": "1", "Tauri-Error": "2" }, body: "{}" })
    .then(async (x) => "status " + x.status + " " + (await x.text()).slice(0, 80), (e) => "no llega: " + e.message);
  const leer = (ruta) => fetch("http://asset.localhost/" + encodeURIComponent(ruta))
    .then(async (x) => "status " + x.status + ", " + (await x.text()).length + " caracteres", (e) => "no llega: " + e.message);
  r.asset = await leer(${JSON.stringify(ASSET)});
  r.assetPrueba = await leer(${JSON.stringify(join(DATOS, "raiz.txt"))});
  document.cookie = "galleta=1; Max-Age=86400; path=/";
  localStorage.setItem("adeorq-prueba", "sigue");
  await fetch("/informe", { method: "POST", body: JSON.stringify(r) });
})();
</script>`;

const OTRA = `<!doctype html><meta charset="utf-8"><title>la otra</title><body><p>otra página</p>
<button id="b" onclick="window.open('/nueva.html')">abrir</button><script>
setTimeout(() => window.open("/nueva.html", "_blank"), 300);
</script>`;

let informe = null;
const web = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/informe") {
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      informe = JSON.parse(cuerpo);
      res.end("ok");
    });
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (req.url === "/otra.html") return res.end(OTRA);
  if (req.url === "/nueva.html") return res.end("<!doctype html><title>nueva</title>nueva");
  res.end(SONDA);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const RAIZ = `http://127.0.0.1:${web.address().port}`;
const URL_SONDA = `${RAIZ}/sonda.html`;

/* ── La app ─────────────────────────────────────────────────────────────── */

/** `laboratorio: false` es como un equipo de empresa con la carpeta de WebView2 forzada. */
function abrirApp(laboratorio = true) {
  const env = {
    ...process.env,
    LOCALAPPDATA: join(BASE, "datos"),
    USERPROFILE: join(BASE, "casa"),
    WEBVIEW2_USER_DATA_FOLDER: join(BASE, "interfaz"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
    ADEORQ_MCP_PUERTO: String(PUERTO + 1),
    // Pestañas nativas con la carpeta forzada: solo en laboratorio (`modo_nativo`).
    ADEORQ_NAVEGADOR_LABORATORIO: "1",
  };
  if (!laboratorio) delete env.ADEORQ_NAVEGADOR_LABORATORIO;
  const hijo = spawn(EXE, [], {
    detached: true,
    stdio: "ignore",
    // Con `ADEORQ_PERFIL_APARTE=1`, cada uno en su perfil, como en la app publicada; el caso del
    // equipo de empresa sigue con su carpeta forzada.
    env: laboratorio && APARTE ? aparte(env, EXE) : env,
  });
  hijo.unref();
  return hijo.pid;
}

/** Las ventanas de primer nivel, visibles, de un proceso: si la pestaña fuera una ventana
    aparte (lo que pasaba con SetParent), aparecería aquí. */
function ventanasDe(pid) {
  const guion = `
    Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class V { public delegate bool F(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(F f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static int Cuenta(uint pid) { int n = 0; EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) n++; return true; }, IntPtr.Zero); return n; } }
"@
    [V]::Cuenta(${pid})`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/** La ventana de MI proceso, al fondo y sin foco, con un tamaño dado. */
function colocarVentana(pid, ancho, alto) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
    [void][W.U]::ShowWindow($p.MainWindowHandle, 9)
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 40, 40, ${ancho}, ${alto}, 0x0010)
  `;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { stdio: "ignore" }).status === 0;
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

/** Arranca la app, la prepara y deja escuchando los avisos del navegador. */
async function arrancar() {
  const pid = abrirApp();
  dice(await hasta(() => colocarVentana(pid, 1400, 900), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await interfaz();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`localStorage.setItem("adeorq-perfil", ${JSON.stringify(
    JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
  )})`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await interfaz();
  await v.js(`(async () => {
    window.__nav = [];
    const t = window.__TAURI_INTERNALS__;
    for (const ev of ["nav-estado", "nav-nueva", "nav-tecla"]) {
      const cb = t.transformCallback((e) => window.__nav.push({ ev, ...e.payload }));
      await t.invoke("plugin:event|listen", { event: ev, target: { kind: "Any" }, handler: cb });
    }
  })()`);
  return { pid, v };
}

const HUECO = { x: 700, y: 120, ancho: 640, alto: 520 };
const invocar = (v, cmd, args) =>
  v.js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((x) => ({ ok: x }), (e) => ({ error: String(e) }))`);
const avisos = (v) => v.js("window.__nav");

let pid = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(join(BASE, "proyectos"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));

  /* ── Primera vuelta ── */
  let { pid: p1, v } = await arrancar();
  pid = p1;
  const disponible = await invocar(v, "nav_disponible", {});
  dice(disponible.ok === true, `en Windows hay navegador de verdad (${JSON.stringify(disponible)})`);

  // La interfaz, metida en un iframe, no arranca (aquí es del mismo origen y se puede mirar).
  const enMarco = await v.js(`new Promise((ok) => {
    const f = document.createElement("iframe");
    f.src = location.origin + "/";
    f.style.cssText = "position:fixed;left:0;top:0;width:200px;height:120px;opacity:0";
    document.body.appendChild(f);
    setTimeout(() => { const raiz = f.contentDocument && f.contentDocument.getElementById("root"); ok(raiz ? raiz.childElementCount : -1); f.remove(); }, 4000);
  })`);
  dice(enMarco === 0, `la interfaz de Adeorq no arranca metida en un iframe (hijos en #root: ${enMarco})`);

  const antes = ventanasDe(pid);
  const abierta = await invocar(v, "nav_abrir", { id: 1, url: URL_SONDA, hueco: HUECO });
  dice(!abierta.error, `nav_abrir abre la sonda (${JSON.stringify(abierta)})`);
  const r = await hasta(() => informe, 15_000);
  dice(Boolean(r), "la sonda carga en la pestaña y manda su informe");
  if (r) {
    console.log(JSON.stringify(r, null, 1));
    const contesta = (x) => typeof x === "string" && /^contesta|^status 200/.test(x);
    for (const k of ["invoke", "invokeAbrir", "invokeEvento", "fetchIpc"]) {
      if (r[k] !== undefined) dice(!contesta(r[k]), `la web no llega a la app por ${k}: ${r[k]}`);
    }
    // Que no llegue NI la respuesta: un 403 querría decir que el permiso CORS ya la dejó
    // pasar y que solo la paró el alcance del protocolo, que es otra puerta.
    for (const k of ["asset", "assetPrueba"]) {
      dice(/^no llega/.test(r[k]), `la web no lee la carpeta de datos por el protocolo asset (${k}): ${r[k]}`);
    }
  }
  await dormir(800);
  dice(ventanasDe(pid) === antes, `ninguna ventana nueva en el escritorio (${antes} antes, ${ventanasDe(pid)} después)`);

  let a = await avisos(v);
  dice(a.some((x) => x.ev === "nav-estado" && x.titulo === "sonda del navegador"), "la interfaz se entera del título");
  dice(a.some((x) => x.ev === "nav-estado" && x.url === URL_SONDA), "la interfaz se entera de la dirección");
  dice(a.some((x) => x.ev === "nav-estado" && x.cargando === false), "la interfaz se entera de cuándo termina de cargar");
  dice(!a.some((x) => x.titulo === "falso"), "un aviso falso de la web no llega a la interfaz");

  const foto = await invocar(v, "nav_foto", { id: 1 });
  dice(typeof foto.ok === "string" && foto.ok.startsWith("data:image/jpeg;base64,") && foto.ok.length > 2000, `da su foto (${foto.ok ? foto.ok.length + " caracteres" : foto.error})`);

  // Ir a otra, que pide abrir una ventana nueva, y volver atrás.
  informe = null;
  await invocar(v, "nav_ir", { id: 1, url: `${RAIZ}/otra.html` });
  dice(Boolean(await hasta(async () => (await avisos(v)).some((x) => x.ev === "nav-nueva" && x.url === `${RAIZ}/nueva.html`), 8000)), "lo que la web abre en ventana nueva llega como pestaña");
  dice(Boolean(await hasta(async () => (await avisos(v)).some((x) => x.ev === "nav-estado" && x.atras === true), 8000)), "la interfaz sabe que hay atrás");
  dice(ventanasDe(pid) === antes, "y el window.open no ha sacado ninguna ventana");
  await invocar(v, "nav_accion", { id: 1, accion: "atras" });
  dice(Boolean(await hasta(() => informe, 8000)), "atrás vuelve a la sonda");

  const otraVez = await invocar(v, "nav_abrir", { id: 2, url: "http://tauri.localhost/", hueco: HUECO });
  dice(Boolean(otraVez.error), `no abre la propia app (${otraVez.error ?? "la abrió"})`);

  // Cerrar la pestaña la esconde, y la ventana sigue redimensionando su interfaz (en wry
  // 0.57, DESTRUIR un webview hijo le quitaría esa escucha a la ventana).
  //
  // La orden de tamaño va dos veces: medido el 2026-10-18 SIN navegador, una de cada dos
  // `SetWindowPos` seguidas no cambia el ancho (alterna: no, sí, no, sí). Es del arnés, no
  // de la app; con una sola orden este paso fallaba por eso.
  await invocar(v, "nav_cerrar", { id: 1 });
  const anchoAntes = await v.js("window.innerWidth");
  const cambiado = async () => {
    const w = await v.js("window.innerWidth");
    return w !== anchoAntes ? w : null;
  };
  colocarVentana(pid, 1100, 800);
  let anchoDespues = await hasta(cambiado, 2500);
  if (!anchoDespues) {
    colocarVentana(pid, 1100, 800);
    anchoDespues = await hasta(cambiado, 2500);
  }
  dice(Boolean(anchoDespues), `con la pestaña cerrada, la interfaz sigue al tamaño de la ventana (${anchoAntes} → ${anchoDespues})`);

  // Salir como se sale, para que el navegador guarde lo suyo en disco.
  await v.js(`window.__TAURI_INTERNALS__.invoke("plugin:process|exit", { code: 0 }).catch(() => {})`).catch(() => {});
  v.cerrar();
  await hasta(() => spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" }).stdout.includes(String(pid)) ? null : true, 10_000);
  await dormir(1500);

  /* ── Segunda vuelta: lo guardado sigue ── */
  informe = null;
  ({ pid, v } = await arrancar());
  await invocar(v, "nav_abrir", { id: 1, url: URL_SONDA, hueco: HUECO });
  const r2 = await hasta(() => informe, 15_000);
  dice(Boolean(r2) && /galleta=1/.test(r2.galletaAntes), `la galleta sigue al reabrir Adeorq (${r2 && r2.galletaAntes})`);
  dice(Boolean(r2) && r2.guardadoAntes === "sigue", `y el localStorage de la web también (${r2 && r2.guardadoAntes})`);
  await v.js(`window.__TAURI_INTERNALS__.invoke("plugin:process|exit", { code: 0 }).catch(() => {})`).catch(() => {});
  v.cerrar();
  await hasta(() => (spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf8" }).stdout.includes(String(pid)) ? null : true), 10_000);
  await dormir(1500);

  /* ── Tercera vuelta: un equipo con la carpeta de WebView2 forzada ──
     Sin el permiso del laboratorio no hay pestañas nativas: compartirían perfil con la
     interfaz, y con él `--use-fake-ui-for-media-stream`, que dejaba a cualquier web llevarse
     el micrófono sin preguntar (medido; revisión de seguridad del 2026-10-18). */
  pid = abrirApp(false);
  dice(await hasta(() => colocarVentana(pid, 1400, 900), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  v = await interfaz();
  const sinNativo = await invocar(v, "nav_disponible", {});
  dice(sinNativo.ok === false, `con la carpeta forzada, el navegador va en iframe (${JSON.stringify(sinNativo)})`);
  const negado = await invocar(v, "nav_abrir", { id: 1, url: URL_SONDA, hueco: HUECO });
  dice(Boolean(negado.error), `y no abre pestañas nativas (${negado.error ?? "la abrió"})`);
  v.cerrar();
} catch (e) {
  fallos++;
  console.log(`FALLO ${e.message}`);
} finally {
  if (pid) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  // Un navegador de WebView2 puede quedar huérfano con la carpeta cogida: se reconoce porque su
  // línea de comandos lleva la ruta de esta pasada, que es única (ver `de-quien-de-verdad.mjs`).
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${BASE.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore" });
  web.close();
  // Muertos, la carpeta todavía tarda en soltarse (medido: con 1,5 s a veces EPERM).
  await dormir(3000);
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
  } catch (e) {
    console.log(`(no pude borrar ${BASE}: ${e.code})`);
  }
}
console.log(fallos ? `${fallos} fallo(s)` : "BIEN: el navegador de verdad abre, avisa, no se escapa y no deja entrar a nadie");
process.exit(fallos ? 1 : 0);
