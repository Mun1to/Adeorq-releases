// Una página abierta en el panel web NO puede llamar a las órdenes de la app.
//
// El panel web (`WebPane.tsx`, `CanvasWeb.tsx`) pinta lo que le pidas en un
// `<iframe>` sin `sandbox` dentro de la ventana de Tauri. Si esa página llegara
// al puente de Tauri, podría hacer lo mismo que la interfaz: abrir terminales,
// escribir en ellas o leer las claves. Esto lo mide con el programa de verdad:
// sirve una sonda en otro origen (127.0.0.1, como cualquier servidor de
// desarrollo), la mete en un marco igual que el del panel y le pide que intente
// llegar al puente por los tres caminos que hay. Como control, la ventana
// misma llama a la misma orden y tiene que poder.
//
// La orden de prueba es `cierre_puede_fondo`: solo dice si el sistema puede
// seguir en segundo plano, sin efectos.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/marco-sin-tauri.mjs [ruta del .exe]
//
// Abre una ventana «Adeorq · DESARROLLO» unos veinte segundos, la manda al
// fondo sin foco y la maneja por el puerto de depuración. No toca la Adeorq
// instalada ni sus datos (casa, datos y navegador en una carpeta temporal; lo
// que eso no aísla se tapa con `GUARDA`, como en `mods-de-verdad.mjs`).
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9600 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-marco-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");

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

// La sonda: lo que haría una página cualquiera para llegar al puente.
const SONDA = `<!doctype html><meta charset="utf-8"><title>sonda</title><script>
(async () => {
  const r = {};
  const t = window.__TAURI_INTERNALS__;
  r.internosAqui = typeof t;
  if (t && t.invoke) {
    const probar = (cmd, args) => t.invoke(cmd, args).then((v) => "contesta " + JSON.stringify(v), (e) => "rechazado: " + String(e).slice(0, 160));
    r.invokeAqui = await probar("cierre_puede_fondo");
    // Las del núcleo van por otros permisos (core:default): también tienen
    // que quedarse fuera, o el marco podría disparar eventos de la ventana.
    r.invokeVersion = await probar("plugin:app|version");
    r.invokeEvento = await probar("plugin:event|emit", { event: "sonda-de-prueba", payload: null });
  }
  try { r.internosPadre = typeof window.parent.__TAURI_INTERNALS__; } catch (e) { r.internosPadre = "bloqueado: " + e.name; }
  for (const base of ["http://ipc.localhost", "ipc://localhost"]) {
    r["fetch " + base] = await fetch(base + "/cierre_puede_fondo", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Tauri-Callback": "1", "Tauri-Error": "2" },
      body: "{}",
    }).then(async (x) => "status " + x.status + " " + (await x.text()).slice(0, 120), (e) => "no llega: " + e.message);
  }
  await fetch("/informe", { method: "POST", body: JSON.stringify(r) });
})();
</script>`;

let informe = null;
const sonda = createServer((req, res) => {
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
  res.end(SONDA);
});
await new Promise((r) => sonda.listen(0, "127.0.0.1", r));
const URL_SONDA = `http://127.0.0.1:${sonda.address().port}/sonda.html`;

function abrirApp() {
  const hijo = spawn(EXE, [], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      // Que no intente coger el MCP de la Adeorq de verdad.
      ADEORQ_MCP_PUERTO: String(PUERTO + 1),
    },
  });
  hijo.unref();
  return hijo.pid;
}

/** La ventana de MI proceso, al fondo y sin foco. Comprueba antes que es la mía. */
function alFondo(pid) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { stdio: "ignore" }).status === 0;
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

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(join(BASE, "proyectos"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));

  app = abrirApp();
  dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`localStorage.setItem("adeorq-perfil", ${JSON.stringify(
    JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
  )})`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();

  // El control: la ventana misma sí llega a la orden.
  const control = await v.js(`window.__TAURI_INTERNALS__.invoke("cierre_puede_fondo").then((x) => "contesta " + JSON.stringify(x), (e) => "rechazado: " + String(e))`);
  dice(control === "contesta true", `la ventana de la app llama a la orden de prueba (${control})`);

  // La sonda, en un marco como el del panel web: sin sandbox, en otro origen.
  await v.js(`(() => {
    const f = document.createElement("iframe");
    f.className = "web-frame";
    f.src = ${JSON.stringify(URL_SONDA)};
    f.title = ${JSON.stringify(URL_SONDA)};
    f.style.cssText = "position:fixed;right:0;bottom:0;width:320px;height:200px;z-index:99999";
    document.body.appendChild(f);
  })()`);
  const r = await hasta(() => informe, 15_000);
  dice(Boolean(r), "la sonda carga dentro del marco y manda su informe");
  if (r) {
    console.log(JSON.stringify(r, null, 1));
    const contesta = (x) => typeof x === "string" && /^contesta|status 200/.test(x);
    dice(r.internosAqui === "undefined" || !contesta(r.invokeAqui), `el marco no tiene un puente que funcione (${r.internosAqui}${r.invokeAqui ? ", " + r.invokeAqui : ""})`);
    for (const k of ["invokeVersion", "invokeEvento"]) if (r[k] !== undefined) dice(!contesta(r[k]), `${k}: ${r[k]}`);
    dice(String(r.internosPadre).startsWith("bloqueado"), `el marco no llega al puente de la ventana (${r.internosPadre})`);
    for (const k of Object.keys(r).filter((k) => k.startsWith("fetch "))) dice(!contesta(r[k]), `${k}: ${r[k]}`);
  }
} catch (e) {
  fallos++;
  console.log(`FALLO ${e.message}`);
} finally {
  if (app) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  sonda.close();
  await dormir(800);
  rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
}
console.log(fallos ? `${fallos} fallo(s)` : "BIEN: una página del panel web no llega a las órdenes de la app");
process.exit(fallos ? 1 : 0);
