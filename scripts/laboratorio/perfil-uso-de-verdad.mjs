// Tu uso en el Perfil con el PROGRAMA de verdad leyendo TUS conversaciones.
//
// `pnpm bancos usoDelPerfil` mira las cuentas y `perfil-uso.js` la pieza con un
// doble. Esto junta las mitades: el binario de desarrollo entero, con su
// `uso_historia` de Rust leyendo los transcripts de quien lo lanza (solo los
// lee) y la pieza pintando lo que devuelve.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/perfil-uso-de-verdad.mjs [ruta del .exe]
//
// Abre una ventana «Adeorq · DESARROLLO» un par de minutos (la primera lectura
// de 4,7 GB tarda unos 80 s en debug) y la maneja por dentro, por el puerto de
// depuración del WebView: ni ratón ni teclado, y nada más nacer va al fondo sin
// foco. Solo en Windows. Deja la foto en `FOTO` (o en `.playwright-mcp`).
//
// Lo que aísla: datos (`LOCALAPPDATA`, donde Rust guarda lo leído), casa
// (`USERPROFILE`) y navegador. Para que lea tus conversaciones sin darle tu casa
// entera, `GUARDA` cambia en la página la carpeta de las cuentas que viaja en
// `uso_historia` por la de verdad (`~/.claude` y `~/.codex`); y la lista de
// proyectos sale de `C:\proyectos`, que solo se lista. Lo que no aísla el resto
// de variables (el estado de la barra, el reproductor, las claves) se tapa
// igual que en `mods-de-verdad.mjs`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9500 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-perfil-uso-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const CASA_REAL = process.env.USERPROFILE ?? "";
const PROYECTOS = process.env.PROYECTOS ?? "C:\\proyectos";
const FOTO = process.env.FOTO ?? "C:/proyectos/Adeorq/.playwright-mcp/perfil-uso-de-verdad.png";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
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
    cwd: BASE,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      // Su propio MCP: el 3012 es el de la Adeorq que esté abierta de verdad.
      ADEORQ_MCP_PUERTO: String(PUERTO + 100),
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

/** Lo que la casa de pruebas no aísla, tapado; y las cuentas, a tu casa de verdad. */
const GUARDA = `(() => {
  const real = window.fetch.bind(window);
  const CASA = ${JSON.stringify(CASA_REAL)};
  window.__usoTarda = [];
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/supabase\\.co|openrouter\\.ai/.test(url)) return Promise.reject(new TypeError("Failed to fetch"));
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "updater" && plugin[2] === "check") return responde(null);
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    if (m && ["media_now", "secret_get", "secret_put", "secret_forget", "openrouter_info", "save_ui_state"].includes(m[1])) return responde(null);
    if (m && m[1] === "load_ui_state") return responde("{}");
    if (m && m[1] === "uso_historia" && b && typeof b.body === "string") {
      const args = JSON.parse(b.body);
      args.cuentas = args.cuentas.map((c) => ({ ...c, dir: c.dir || CASA + "\\\\." + c.provider }));
      window.__usoPedido = args;
      const t0 = performance.now();
      return real(a, { ...b, body: JSON.stringify(args) }).then((r) => { window.__usoTarda.push(Math.round(performance.now() - t0)); return r; });
    }
    return real(a, b);
  };
})()`;

/** La ventana, por el protocolo de depuración: evaluar y llamar a Tauri. */
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

const TEXTO = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.innerText ?? "").replace(/\\s+/g, " ").trim()`;
const LISTA = `[...document.querySelectorAll(".pu-lista .pu-parte")].map((f) => [...f.children].map((c) => c.textContent).filter(Boolean).join(" "))`;
const PESTANA = (n) => `[...document.querySelectorAll(".pu-pestanas button")].find((b) => b.textContent.trim() === ${JSON.stringify(n)})?.click()`;

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");
  if (!existsSync(join(CASA_REAL, ".claude", "projects"))) throw new Error(`no hay conversaciones de Claude en ${CASA_REAL}`);

  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), PROYECTOS);

  app = abrirApp();
  dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", arroba: "prueba", raiz: PROYECTOS, sinRaiz: false, extras: [], leerSesiones: false, clis: ["claude", "codex"], hecho: true, tour: true }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await hasta(() => v.js(`!!document.querySelector('[data-tab="perfil"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="perfil"]').click()`);

  // Mientras lee: la rueda, nunca en blanco.
  const rueda = await hasta(() => v.js(`document.querySelector(".pu .espera")?.textContent ?? ""`), 5000, 100);
  dice(/Leyendo tus conversaciones/.test(rueda ?? ""), `mientras lee, la rueda con su frase («${rueda ?? "nada"}»)`);
  const t0 = Date.now();
  const leyo = await hasta(() => v.js(`!!document.querySelector(".pu-cifra")`), 300_000, 1000);
  dice(leyo, `la primera lectura acaba y pinta (${Math.round((Date.now() - t0) / 1000)} s)`);
  const pedido = await v.js("window.__usoPedido");
  dice(pedido?.cuentas?.length >= 1 && pedido.proyectos?.length > 1, `uso_historia recibe las cuentas y ${pedido?.proyectos?.length ?? 0} proyectos del panel`);

  const resumen = {
    cifra: await v.js(TEXTO(".pu-cifra > b")),
    etiqueta: await v.js(TEXTO(".pu-cifra > em")),
    fila: await v.js(TEXTO(".pu-fila")),
    proyectos: await v.js(LISTA),
  };
  await v.js(PESTANA("Modelos"));
  resumen.modelos = await v.js(LISTA);
  await v.js(PESTANA("Proveedores"));
  resumen.proveedores = await v.js(LISTA);
  await v.js(PESTANA("Proyectos"));
  resumen.mes = await v.js(`[...document.querySelectorAll(".pu-mes button")].map((b) => b.textContent).join(" | ")`);
  resumen.anio = await v.js(`document.querySelectorAll(".pu-anio button:not(:disabled)").length`);
  console.log(JSON.stringify(resumen, null, 1));
  dice(/^\d+(,\d)? [KMB]$/.test(resumen.cifra) && /Nuevos \d/.test(resumen.fila) && /Récord /.test(resumen.fila), "la cifra del mes, «Nuevos» y el récord");
  dice(resumen.proyectos.length > 0 && !resumen.proyectos.some((p) => /^web /i.test(p)), "los proyectos con su nombre (ningún «web» suelto)");
  dice(resumen.anio > 0, `el año con días que se pueden tocar (${resumen.anio})`);

  // La segunda vez solo lee lo nuevo: volver al Perfil no puede costar otro minuto.
  await v.js(`document.querySelector('[data-tab="panel"]').click()`);
  await dormir(500);
  await v.js(`document.querySelector('[data-tab="perfil"]').click()`);
  await hasta(async () => ((await v.js("window.__usoTarda.length")) >= 2 ? true : null), 120_000, 500);
  const tardas = await v.js("window.__usoTarda");
  dice(tardas.length >= 2 && tardas[1] < 15_000, `volver al Perfil relee solo lo nuevo (${tardas.map((x) => `${(x / 1000).toFixed(1)} s`).join(", ")})`);

  await v.js(`document.querySelector(".pu")?.scrollIntoView({ block: "start" })`);
  await dormir(400);
  const foto = await v.enviar("Page.captureScreenshot", { format: "png" });
  mkdirSync(join(FOTO, ".."), { recursive: true });
  writeFileSync(FOTO, Buffer.from(foto.data, "base64"));
  console.log(`foto: ${FOTO}`);
  v.cerrar();
} catch (e) {
  dice(false, e.message);
} finally {
  // Con su árbol, que el navegador cuelga de la app.
  if (app && vivo(app)) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  await dormir(1500);
  for (let i = 0; i < 5 && existsSync(BASE); i++) {
    try {
      rmSync(BASE, { recursive: true, force: true });
    } catch {
      await dormir(1000);
    }
  }
}

console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
