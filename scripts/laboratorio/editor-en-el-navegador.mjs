// El editor por clic con la página en el navegador de verdad (un Chromium nativo, no un iframe).
//
// Prueba la vuelta entera con el programa de verdad: una web de Vite con `vite-plugin-adeorq`,
// abierta en el navegador de la derecha; se enciende el editor y la página NO pasa a un iframe;
// Adeorq le habla a la sonda (el cursor de editar aparece DENTRO de la página); un clic de verdad
// sobre el título lo señala; un «aplicar» viaja de Adeorq a la sonda, la sonda contesta
// «escribir», y `editor.rs` lo deja en el fichero fuente. Si cualquiera de los dos sentidos del
// puente (`nav_a_la_pagina` y el evento `nav-sonda`) se rompe, el fichero no cambia.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/editor-en-el-navegador.mjs [ruta del .exe]
//
// La web de prueba se crea en una carpeta temporal con un enlace a los `node_modules` de Adeorq
// (React, Vite y su plugin de React), y su Vite se para al acabar. En el laboratorio el navegador
// comparte proceso con la interfaz (ver `crear` en `navegador.rs`), así que su página sale también
// en el puerto de depuración: por ahí se le da el clic, que es un clic de ratón de verdad para
// Chromium.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APARTE, aparte, puertosDeDepuracion } from "./perfil-aparte.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9900 + (process.pid % 90);
const PUERTO_WEB = 5300 + (process.pid % 200);
const BASE = join(tmpdir(), `adeorq-editor-nav-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const WEB = join(BASE, "web");
const URL_WEB = `http://127.0.0.1:${PUERTO_WEB}/`;

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

/* ── La web de prueba ── */
function montarWeb() {
  mkdirSync(join(WEB, "src"), { recursive: true });
  writeFileSync(join(WEB, "package.json"), JSON.stringify({ name: "prueba-editor", private: true, type: "module" }));
  writeFileSync(join(WEB, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Prueba del editor</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
  writeFileSync(join(WEB, "src", "main.jsx"), `import { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\ncreateRoot(document.getElementById("root")).render(<App />);\n`);
  writeFileSync(join(WEB, "src", "App.jsx"), `export default function App() {\n  return (\n    <main style={{ padding: 40, fontFamily: "system-ui" }}>\n      <h1 id="titulo">Hola desde la prueba</h1>\n    </main>\n  );\n}\n`);
  const plugin = join(REPO, "vite-plugin-adeorq", "index.js").replace(/\\/g, "/");
  writeFileSync(join(WEB, "vite.config.mjs"), `import adeorq from "${plugin}";\nimport react from "@vitejs/plugin-react";\nexport default { plugins: [adeorq(), react()] };\n`);
  symlinkSync(join(REPO, "node_modules"), join(WEB, "node_modules"), "junction");
}

function arrancarVite() {
  return spawn(process.execPath, [join(REPO, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", String(PUERTO_WEB), "--strictPort"], {
    cwd: WEB,
    stdio: "ignore",
  });
}

/* ── La app, igual que en `navegador-de-verdad.mjs` ── */
function abrirApp() {
  const env = {
    ...process.env,
    LOCALAPPDATA: join(BASE, "datos"),
    USERPROFILE: join(BASE, "casa"),
    WEBVIEW2_USER_DATA_FOLDER: join(BASE, "interfaz"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${APARTE ? 0 : PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
    ADEORQ_MCP_PUERTO: String(PUERTO + 1),
    // Pestañas nativas con la carpeta forzada: solo en laboratorio (`modo_nativo`).
    ADEORQ_NAVEGADOR_LABORATORIO: "1",
  };
  // Con `ADEORQ_PERFIL_APARTE=1`, cada uno en su perfil, como en la app publicada.
  const hijo = spawn(EXE, [], { detached: true, stdio: "ignore", env: APARTE ? aparte(env, EXE) : env });
  hijo.unref();
  return hijo.pid;
}

const ps = (guion) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { encoding: "utf8" });

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

/** Se conecta a la página del puerto de depuración cuya dirección cumpla `es`. Con el perfil
    aparte hay dos motores y cada uno con su puerto (ver `puertosDeDepuracion`). */
async function conectar(es) {
  const destino = await hasta(async () => {
    for (const p of APARTE ? puertosDeDepuracion(BASE) : [PUERTO]) {
      const lista = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json().catch(() => []);
      const t = lista.find((x) => x.type === "page" && es(x.url));
      if (t) return t;
    }
    return null;
  }, 30_000);
  if (!destino) throw new Error("no aparece la página en el puerto de depuración");
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error("no conecta"));
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
  return { enviar, js, cerrar: () => ws.close() };
}

let pid = 0;
let vite = null;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(join(BASE, "proyectos"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  montarWeb();
  vite = arrancarVite();
  dice(Boolean(await hasta(() => fetch(URL_WEB).then((r) => r.ok), 30_000, 500)), `la web de prueba sirve en ${URL_WEB}`);

  pid = abrirApp();
  dice(await hasta(() => colocarVentana(pid, 1600, 950), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await conectar((u) => u.includes("localhost:1420"));
  await hasta(() => v.js("!!window.__TAURI_INTERNALS__"), 20_000);
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`(() => {
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }))});
    localStorage.setItem("adeorq-navegador-abierto", "1");
    localStorage.setItem("adeorq-navegador-ancho", "760");
    localStorage.setItem("adeorq-navegador", ${JSON.stringify(JSON.stringify({ tabs: [URL_WEB], activa: 0 }))});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await conectar((u) => u.includes("localhost:1420"));
  await hasta(() => v.js("!!window.__TAURI_INTERNALS__"), 20_000);
  await hasta(() => v.js(`(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Cabina/.test(x.textContent.trim())); b && b.click(); return !!document.querySelector(".nav"); })()`), 10_000);
  const titulo = await hasta(() => v.js(`(() => { const t = document.querySelector('.nav-pest[data-on="true"] .nav-pest-nom'); return t && /Prueba del editor/.test(t.textContent) ? t.textContent : null; })()`), 20_000, 400);
  dice(Boolean(titulo), `la web de prueba carga en el navegador nativo («${titulo}»)`);

  // Encender el editor.
  await v.js(`document.querySelector('.nav-acts [data-tip^="Editar esta página"]').click()`);
  await dormir(3800);
  const estado = await v.js(`({ editor: !!document.querySelector(".editor-web"), sinPlugin: !!document.querySelector(".ew-sinplugin"), marcos: document.querySelectorAll(".nav-hueco iframe").length })`);
  dice(estado.editor && !estado.sinPlugin, `el editor se enciende y la sonda contesta por el puente (${JSON.stringify(estado)})`);
  dice(estado.marcos === 0, "la página sigue en el Chromium nativo, sin pasar a un iframe");

  // Dentro de la página: Adeorq le ha dicho a la sonda que está editando.
  const p = await conectar((u) => u.startsWith(URL_WEB));
  const cursor = await hasta(() => p.js(`document.documentElement.style.cursor === "crosshair" && "crosshair"`), 5000, 200);
  dice(Boolean(cursor), "Adeorq → página: la sonda recibe «modo editar» (cursor de cruz dentro de la web)");
  // Los errores que caigan en la consola de TU web desde aquí: el primer puente
  // (`chrome.webview.postMessage` con texto) dejaba uno de Tauri por cada mensaje.
  await p.js(`(() => { window.__errores = []; const e = console.error.bind(console); console.error = (...a) => { window.__errores.push(String(a[0]).slice(0, 120)); e(...a); }; })()`);

  // Un clic de verdad sobre el título.
  const r = await p.js(`(() => { const b = document.getElementById("titulo").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await p.enviar("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
  }
  await dormir(500);

  // Aplicar un color, como al soltar el control: viaja a la sonda, vuelve como «escribir» y lo escribe Rust.
  const antes = readFileSync(join(WEB, "src", "App.jsx"), "utf8");
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_a_la_pagina", { id: 1, mensaje: { tipo: "aplicar", estilos: { color: "rgb(220, 38, 38)" } } })`);
  const despues = await hasta(() => {
    const t = readFileSync(join(WEB, "src", "App.jsx"), "utf8");
    return t !== antes ? t : null;
  }, 8000, 300);
  dice(Boolean(despues) && /220, 38, 38/.test(despues), "página → Adeorq → editor.rs: el color queda escrito en App.jsx");
  if (despues) console.log(despues.split("\n").find((l) => /titulo/.test(l))?.trim());
  const pintado = await p.js(`getComputedStyle(document.getElementById("titulo")).color`);
  dice(pintado === "rgb(220, 38, 38)", `y se ve en la página (${pintado})`);
  const errores = await p.js(`JSON.stringify(window.__errores)`);
  dice(errores === "[]", `la consola de la web queda limpia (${errores})`);

  // Una web de fuera no recibe recados del editor.
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_ir", { id: 1, url: "https://example.com/" })`);
  await hasta(() => v.js(`document.querySelector(".nav-url input").value.startsWith("example.com")`), 15_000, 400);
  const fuera = await v.js(`window.__TAURI_INTERNALS__.invoke("nav_a_la_pagina", { id: 1, mensaje: { tipo: "hola" } }).then(() => "entregado", (e) => "rechazado: " + e)`);
  dice(/^rechazado/.test(fuera), `a una web de fuera no le llega ningún recado (${fuera})`);

  // Una web de fuera con el editor encendido va en iframe. Esta finge ser la sonda: anuncia
  // la carpeta del proyecto de prueba y pide escribir en su título. No puede llegar a
  // `editor.rs` (revisión de seguridad del 2026-10-18: el canal del iframe no miraba quién
  // mandaba el mensaje). `127.0.0.2` es esta máquina, pero no es «localhost» para Adeorq.
  const fuente = readFileSync(join(WEB, "src", "App.jsx"), "utf8");
  const ini = fuente.indexOf("<h1");
  const loc = `src/App.jsx:${ini}:${fuente.indexOf(">", ini) + 1}`;
  const MALA = `<!doctype html><title>mala</title><script>
    const raiz = ${JSON.stringify(WEB.replace(/\\/g, "/"))};
    setInterval(() => {
      parent.postMessage({ de: "adeorq-sonda", tipo: "lista", url: location.href, raiz, marcados: 1 }, "*");
      parent.postMessage({ de: "adeorq-sonda", tipo: "escribir", loc: ${JSON.stringify(loc)}, estilos: { color: "rgb(1, 2, 3)" } }, "*");
    }, 300);
  </script>`;
  const mala = createServer((_req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(MALA);
  });
  await new Promise((ok) => mala.listen(0, "127.0.0.2", ok));
  await v.js(`window.__TAURI_INTERNALS__.invoke("nav_ir", { id: 1, url: "http://127.0.0.2:${mala.address().port}/" })`);
  await hasta(() => v.js(`document.querySelector(".nav-url input").value.startsWith("127.0.0.2")`), 10_000, 300);
  // Apagar y encender el editor sobre ella: así pasa a iframe.
  const boton = `document.querySelector('.nav-acts [data-tip="Salir del editor"], .nav-acts [data-tip^="Editar esta página"]')`;
  await v.js(`${boton}.click()`);
  await dormir(300);
  await v.js(`${boton}.click()`);
  const enMarco = await hasta(() => v.js(`document.querySelectorAll(".nav-hueco iframe").length`), 5000, 200);
  dice(enMarco === 1, "la web de fuera, con el editor encendido, va en un iframe");
  await dormir(3000);
  const tras = readFileSync(join(WEB, "src", "App.jsx"), "utf8");
  dice(tras === fuente, `una web de fuera que finge ser la sonda no escribe en tu proyecto${tras === fuente ? "" : ": " + tras.split("\n").find((l) => /titulo/.test(l))?.trim()}`);
  mala.close();
  p.cerrar();
  v.cerrar();
} catch (e) {
  fallos++;
  console.log(`FALLO ${e.message}`);
} finally {
  if (pid) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  if (vite) spawnSync("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });
  ps(`Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${BASE.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
  // Muertos, la carpeta todavía tarda en soltarse (medido: con 1,5 s a veces EPERM).
  await dormir(3000);
  // El enlace a los `node_modules` de Adeorq se quita SOLO y ANTES: un borrado recursivo que
  // lo atravesara vaciaría los de verdad. `rmdirSync` sobre una junction quita el enlace y no
  // entra; si por lo que sea sigue ahí, no se borra nada y se dice.
  const enlace = join(WEB, "node_modules");
  try {
    if (existsSync(enlace)) rmdirSync(enlace);
  } catch (e) {
    console.log(`(no pude quitar el enlace ${enlace}: ${e.code})`);
  }
  if (existsSync(enlace)) {
    console.log(`(NO borro ${BASE}: el enlace a node_modules sigue ahí; quítalo a mano con rmdir)`);
  } else {
    try {
      rmSync(BASE, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    } catch (e) {
      console.log(`(no pude borrar ${BASE}: ${e.code})`);
    }
  }
}
console.log(fallos ? `${fallos} fallo(s)` : "BIEN: el editor por clic habla con la página nativa en los dos sentidos y escribe en el fichero");
process.exit(fallos ? 1 : 0);
