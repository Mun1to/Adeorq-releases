// Las terminales delegadas, con el puente de verdad contra una Adeorq aislada.
//
// Munir, 2026-10-15: la terminal que abre un agente se da por terminada cuando
// el agente que la abrió la lee y ve su tarea hecha, y entonces «se elimina por
// completo, para mantener un espacio limpio, con su respectivo rastro de
// handoff o feedback». Esto lo recorre entero:
//
//   1. un agente (panel 50) abre una consola con `open_pane`;
//   2. `get_active_panes` le dice que la abrió él, y a otro (panel 51), quién;
//   3. cerrarla sin rastro no deja; con uno de una palabra, tampoco;
//   4. con su rastro se cierra, el archivo queda en `rastros\` con lo que hace
//      falta para encontrarla, y la ventana no enseña el aviso de «cerrada».
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/rastro-de-verdad.mjs
//
// Todo en una casa, unos datos y un navegador de usar y tirar, con el MCP en
// el 39313: no toca la Adeorq de Munir ni su 3012. La ventana va al fondo y
// sin foco al nacer, y `save_ui_state` se contesta desde la página (`GUARDA`),
// porque el estado de la barra vive en la carpeta de la app y no se aísla con
// variables: sin eso, abrir una terminal aquí escribiría encima del suyo.
// Sale con 1 si algo falla.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = "C:\\ct\\debug\\adeorq.exe";
const PUERTO = 39313;
const DEPURAR = 9341;
const BASE = join(tmpdir(), `adeorq-rastro-${process.pid}`);
const DEMO = join(BASE, "proyectos", "demo");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "BIEN" : "MAL "}  ${que}`);
  if (!ok) fallos.push(que);
};
async function hasta(fn, ms, cada = 300) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await dormir(cada);
  }
  return null;
}

mkdirSync(join(BASE, "datos", "Adeorq"), { recursive: true });
mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
mkdirSync(DEMO, { recursive: true });
writeFileSync(join(BASE, "datos", "Adeorq", "raiz.txt"), join(BASE, "proyectos"));
const env = {
  ...process.env,
  LOCALAPPDATA: join(BASE, "datos"),
  USERPROFILE: join(BASE, "casa"),
  WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEPURAR} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
  ADEORQ_MCP_PUERTO: String(PUERTO),
};

/** La ventana de pruebas al fondo y sin foco, mirando antes que es la MÍA. */
function alFondo(pid) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { stdio: "ignore" }).status === 0;
}

/** Lo que nunca sale de esta ventana: el estado de la barra (que es el de
 *  Munir), sus claves, lo que suena en su equipo y el actualizador. */
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

/** La ventana, por el protocolo de depuración de su navegador. */
async function ventana() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${DEPURAR}/json/list`)).json();
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

/** Un agente: el puente `--mcp` de verdad, presentándose como el panel `yo`. */
function puente(yo) {
  const p = spawn(EXE, ["--mcp"], { env: { ...env, ADEORQ_PANE_ID: String(yo) } });
  let buf = "";
  const pend = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(l);
        pend.get(m.id)?.(m);
      } catch {}
    }
  });
  let n = 0;
  const pedir = (method, params) =>
    new Promise((ok) => {
      const id = ++n;
      pend.set(id, ok);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => ok({ timeout: true }), 15000);
    });
  const llamar = async (name, args) => {
    const r = await pedir("tools/call", { name, arguments: args });
    if (r.timeout) return { error: "sin respuesta en 15 s" };
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.[0]?.text ?? JSON.stringify(r) };
  };
  return { pedir, llamar, cerrar: () => p.kill() };
}

const hijo = spawn(EXE, [], { cwd: DEMO, detached: true, stdio: "ignore", env });
hijo.unref();
const app = hijo.pid;
let v;
try {
  debe(Boolean(await hasta(() => alFondo(app), 12_000, 200)), "la ventana de pruebas va al fondo, sin foco");
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  // Sin la bienvenida: la app entera montada, que es donde vive el oyente del MCP.
  await v.js(`localStorage.setItem("adeorq-lang", "es"); localStorage.setItem("adeorq-perfil", ${JSON.stringify(
    JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
  )}); "ok"`);
  await v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await hasta(async () => {
    const r = spawnSync("powershell", ["-NoProfile", "-Command", `if (Get-NetTCPConnection -LocalPort ${PUERTO} -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]);
    return r.status === 0;
  }, 30_000, 500);
  await dormir(2000);

  const yo = puente(50);
  const otro = puente(51);
  await yo.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await otro.pedir("initialize", { clientInfo: { name: "claude-code" } });

  // 1. Abre una consola, como un agente que reparte trabajo.
  const abierta = await yo.llamar("open_pane", { cli: "shell", cwd: DEMO, name: "Delegada de prueba", brief: "" });
  const id = Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(abierta.texto || "")?.[1]);
  debe(Number.isFinite(id) && id > 0, `open_pane abre una terminal (${(abierta.error || abierta.texto || "").slice(0, 110)})`);

  // 2. Quién la abrió, según quién pregunte. El proceso nace cuando la ventana
  // monta el panel, un instante después de que `open_pane` conteste.
  const linea = (t) => (t || "").split("\n").find((l) => l.startsWith(`ID: ${id},`)) || "";
  debe(Boolean(await hasta(async () => linea((await yo.llamar("get_active_panes", {})).texto), 15_000, 500)), "la terminal aparece en la lista");
  const suya = linea((await yo.llamar("get_active_panes", {})).texto);
  debe(/Abierta por: ti \(cuando su tarea esté hecha, ciérrala con close_pane y su rastro\)/.test(suya), `a quien la abrió le dice que es suya («${suya.slice(0, 170)}»)`);
  const ajena = linea((await otro.llamar("get_active_panes", {})).texto);
  debe(/Abierta por: el panel 50/.test(ajena), `a otro le dice quién la abrió («${ajena.slice(0, 170)}»)`);

  // 3. Sin rastro, o con uno que no cuenta nada, no se cierra.
  const sinRastro = await yo.llamar("close_pane", { paneId: id });
  debe(/Falta `rastro`/.test(sinRastro.error || ""), `sin rastro no la cierra («${(sinRastro.error || sinRastro.texto || "").slice(0, 90)}»)`);
  const corto = await yo.llamar("close_pane", { paneId: id, rastro: "hecho" });
  debe(/Falta `rastro`/.test(corto.error || ""), "con un rastro de una palabra, tampoco");
  debe(linea((await yo.llamar("get_active_panes", {})).texto) !== "", "y la terminal sigue abierta");

  // 4. Con su rastro, se va entera y el rastro queda.
  const rastro = "Listó la carpeta demo y no encontró nada que arreglar. Su parte quedó en este rastro; no queda nada pendiente.";
  const cerrada = await yo.llamar("close_pane", { paneId: id, rastro });
  debe(/cerrada y su agente parado\. Su rastro quedó en /.test(cerrada.texto || ""), `con su rastro la cierra («${(cerrada.error || cerrada.texto || "").slice(0, 130)}»)`);
  await dormir(800);
  debe(linea((await yo.llamar("get_active_panes", {})).texto) === "", "ya no está entre las terminales");
  const dir = join(BASE, "datos", "Adeorq", "rastros");
  const archivos = existsSync(dir) ? readdirSync(dir) : [];
  debe(archivos.length === 1 && /-delegada-de-prueba\.md$/.test(archivos[0]), `un archivo de rastro con su nombre (${archivos.join(", ") || "ninguno"})`);
  const md = archivos[0] ? readFileSync(join(dir, archivos[0]), "utf8") : "";
  debe(md.includes(rastro) && md.includes("La abrió el panel 50 y la cerró el panel 50") && md.includes(DEMO), "el rastro lleva lo que hizo, quién la abrió y la cerró, y su carpeta");
  const aviso = await v.js(`document.querySelector(".deshacer-pill")?.textContent ?? ""`);
  debe(aviso === "", `la ventana no enseña el aviso de «cerrada» («${aviso}»)`);

  yo.cerrar();
  otro.cerrar();
} catch (e) {
  fallos.push(String(e));
  console.log("REVENTÓ", e);
} finally {
  v?.cerrar();
  spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  await dormir(1000);
  rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
}
console.log(fallos.length ? `\n${fallos.length} MAL` : "\nTodo BIEN");
process.exit(fallos.length ? 1 : 0);
