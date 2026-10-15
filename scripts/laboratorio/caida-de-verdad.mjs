// «Que las terminales aguanten si Adeorq se cae», con una VENTANA de verdad.
//
// Las pruebas de Rust (`cargo test --lib terminales`, `proceso_de_verdad`) miran
// el proceso de terminales y su cliente; `reenganche.js` mira la ventana con un
// doble. Esto junta las dos mitades: el binario de desarrollo entero, con su
// ventana, tirado a la fuerza y vuelto a abrir.
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/caida-de-verdad.mjs [ruta del .exe]
//
// Abre una ventana «Adeorq · DESARROLLO» en el escritorio dos veces, unos
// cuarenta segundos en total, y la maneja por dentro (el puerto de depuración
// del WebView): ni ratón ni teclado. Solo en Windows.
//
// No toca la Adeorq instalada ni sus datos: la casa (`USERPROFILE`), los datos
// (`LOCALAPPDATA`) y el perfil del navegador (`WEBVIEW2_USER_DATA_FOLDER`) van a
// una carpeta temporal, el canal de terminales es propio y el MCP va por su
// propio puerto (`ADEORQ_MCP_PUERTO`). El estado de la barra vive en la carpeta
// de la app (`%APPDATA%`), que no se aísla con variables: `save_ui_state` y
// `load_ui_state` se contestan desde la página (`GUARDA`), y la ventana va al
// fondo y sin foco. Solo mata procesos que ha lanzado él o que salen del
// fichero de señas de SU canal.
//
// Además de las terminales, mira lo que tiene que seguir valiendo tras la
// caída (2026-10-15): la «vida» de los números es la del proceso de
// terminales (`conserje_arranque` igual antes y después), una decisión pedida
// por la terminal uno sigue viva, el enlace del MCP de un agente
// (`adeorq.exe --mcp`) contesta «se está reiniciando» sin la app y se
// reengancha solo al volver, y no se reparte otra vez un número ya usado.
//
// La trampa que costó encontrar: con una casa falsa recién creada el puerto de
// depuración NO se abre. El argumento llega al navegador (se ve en su línea de
// comandos) y nadie escucha. Desde Chromium 136 el puerto se niega si la
// carpeta de datos es «la de siempre», y para saber cuál es la de siempre el
// navegador pregunta por `AppData\Local` de la casa: si no existe, no lo sabe y
// se niega por si acaso. Basta con crearla antes del primer arranque. No era el
// puerto, ni la ruta, ni quién lanza el proceso: se descartaron los tres.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9400 + (process.pid % 100);
const MCP = 39314;
const CANAL = `caida${process.pid}`;
const BASE = join(tmpdir(), `adeorq-caida-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const PROYECTO = join(BASE, "proyectos", "demo");
const SEÑAS = join(DATOS, "terminales", `${CANAL}.json`);

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
    cwd: PROYECTO,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      ADEORQ_TERMINALES_CANAL: CANAL,
      ADEORQ_MCP_PUERTO: String(MCP),
    },
  });
  hijo.unref();
  return hijo.pid;
}

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

/** El enlace del MCP de un agente que vive en la terminal `panel`, como lo
 *  lanza Claude Code: por su entrada y su salida, una línea por mensaje. */
function enlaceMcp(panel) {
  const p = spawn(EXE, ["--mcp"], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ADEORQ_MCP_PUERTO: String(MCP), ADEORQ_PANE_ID: String(panel) },
  });
  const esperando = new Map();
  // Un enlace que se murió (el de antes de este arreglo) no tumba la prueba:
  // su petición se queda sin respuesta y eso es lo que se mide.
  p.stdin.on("error", () => {});
  createInterface({ input: p.stdout }).on("line", (l) => {
    try {
      const m = JSON.parse(l);
      esperando.get(m.id)?.(m);
      esperando.delete(m.id);
    } catch {}
  });
  let n = 0;
  const pedir = (method, params = {}) =>
    new Promise((ok) => {
      const id = ++n;
      const plazo = setTimeout(() => {
        esperando.delete(id);
        ok(null);
      }, 10_000);
      esperando.set(id, (m) => {
        clearTimeout(plazo);
        ok(m);
      });
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { pid: p.pid, pedir, cerrar: () => p.stdin.end() };
}

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
  const inv = (cmd, args = {}) => js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  // La guarda, para esta página y para las que vengan al recargar.
  await enviar("Page.enable");
  await enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await js(GUARDA);
  return { enviar, js, inv, cerrar: () => ws.close() };
}

const sinColores = (t) => t.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
const historial = async (v, id) => sinColores(await v.inv("pty_historial", { id, bytes: 6000 }));
const ultimoTic = (t) => Math.max(0, ...[...t.matchAll(/tic (\d+)/g)].map((m) => Number(m[1])));
const señas = () => JSON.parse(readFileSync(SEÑAS, "utf8"));

let app = 0;
let motor = 0;
let mcp = null;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  // El ajuste es un fichero y se lee al ARRANCAR, antes de que la ventana abra
  // nada; y la raíz en disco evita que el primer arranque mire `C:\proyectos`.
  mkdirSync(join(DATOS, "terminales"), { recursive: true });
  mkdirSync(PROYECTO, { recursive: true });
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  writeFileSync(join(DATOS, "terminales", "encendido"), "1");
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));

  // ------------------------------------------------------------ primera vida
  app = abrirApp();
  dice(Boolean(await hasta(() => alFondo(app), 12_000, 200)), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  // El primer arranque sale con la bienvenida: se deja hecho y se le da un
  // tablero de dos terminales, que al recargar abre él por el camino de siempre.
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
    localStorage.setItem("adeorq-layout", ${JSON.stringify(
      JSON.stringify({
        panes: [
          { name: "demo · uno", cwd: PROYECTO },
          { name: "demo · dos", cwd: PROYECTO },
        ],
        cols: [
          { w: 1, hs: [1], idx: [0] },
          { w: 1, hs: [1], idx: [1] },
        ],
        ocultos: [],
      }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();

  dice(await v.inv("terminales_aparte"), "el ajuste está encendido en la ventana");
  const antes = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length === 2 ? l : null;
  }, 30_000);
  if (!antes) throw new Error("el tablero no abrió sus dos terminales");
  const [uno, dos] = antes.map((t) => t.id).sort((a, b) => a - b);
  motor = (await hasta(() => existsSync(SEÑAS) && señas().pid, 5000)) || 0;
  dice(motor > 0 && vivo(motor), `el proceso de terminales corre aparte (pid ${motor})`);

  await dormir(2500);
  await v.inv("pty_write", { id: uno, data: "echo marca-de-la-uno\r" });
  await v.inv("pty_write", { id: dos, data: '1..600 | % { "tic $_"; Start-Sleep 1 }\r' });
  // Seis segundos: que el contador avance y que el tablero, con el número de
  // cada terminal ya apuntado, llegue al disco del navegador.
  await dormir(6000);
  const ticAntes = ultimoTic(await historial(v, dos));
  dice((await historial(v, uno)).includes("marca-de-la-uno"), "la uno tiene su marca antes de la caída");
  dice(ticAntes > 0, `la dos cuenta (va por el ${ticAntes})`);

  // Lo que tiene que seguir valiendo: la vida de los números, y un agente de
  // la uno con su enlace del MCP que le pregunta algo a Munir.
  const vida = await v.inv("conserje_arranque");
  mcp = enlaceMcp(uno);
  const hola = await mcp.pedir("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "caida-de-verdad", version: "1" } });
  dice(Boolean(hola?.result), "el enlace del MCP de un agente de la uno se presenta");
  const pregunta = await mcp.pedir("tools/call", {
    name: "ask_decision",
    arguments: { title: "Prueba de la caída", paneId: uno, questions: [{ title: "¿Sigue viva?", options: [{ text: "sí" }, { text: "no" }] }] },
  });
  const decision = pregunta?.result?.content?.[0]?.text?.match(/Decisión (\w+) creada/)?.[1];
  dice(Boolean(decision), `la uno pregunta algo por el MCP (${decision ?? JSON.stringify(pregunta)})`);
  v.cerrar();

  // ------------------------------------------------------------ la caída
  // Solo el proceso de la app, sin su árbol: lo mismo que un fallo.
  process.kill(app);
  await dormir(4000);
  dice(!vivo(app), "la app ha muerto");
  dice(vivo(motor), "el proceso de terminales sigue vivo sin ella");
  const sinApp = await mcp.pedir("tools/list");
  dice(
    vivo(mcp.pid) && /reiniciando/.test(sinApp?.error?.message ?? ""),
    `sin la app, el enlace del MCP sigue vivo y contesta que se está reiniciando (${JSON.stringify(sinApp?.error?.message ?? sinApp)})`,
  );

  // ------------------------------------------------------------ la vuelta
  app = abrirApp();
  dice(Boolean(await hasta(() => alFondo(app), 12_000, 200)), "la ventana que vuelve va al fondo, sin foco");
  v = await ventana();
  const despues = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length >= 2 && (await v.js("document.querySelectorAll('.xterm').length")) >= 2 ? l : null;
  }, 30_000);
  const ids = (despues ?? []).map((t) => t.id).sort((a, b) => a - b);
  dice(ids.length === 2 && ids[0] === uno && ids[1] === dos, `la ventana vuelve y encuentra las mismas dos terminales (${ids.join(", ")})`);
  dice(señas().pid === motor, "es el mismo proceso de terminales, no uno nuevo");
  await dormir(2500);
  dice((await historial(v, uno)).includes("marca-de-la-uno"), "la uno conserva lo que dijo");
  const ticDespues = ultimoTic(await historial(v, dos));
  dice(ticDespues > ticAntes + 3, `la dos siguió contando sin la app (del ${ticAntes} al ${ticDespues})`);
  const tablero = JSON.parse((await v.js("localStorage.getItem('adeorq-layout')")) ?? "{}");
  const paneles = tablero.panes ?? [];
  dice(
    paneles.length === 2 && paneles.some((p) => p.pty === uno) && paneles.some((p) => p.pty === dos),
    `cada panel recoge su terminal (${paneles.map((p) => `${p.name} = ${p.pty}`).join("; ")})`,
  );
  dice(!paneles.some((p) => /recuperada/.test(p.name)), "ninguna sale como «recuperada»: las dos tenían dueño");
  // Dos veces la palabra: la orden que se teclea y lo que contesta el shell.
  const contesto = () => hasta(async () => (await historial(v, uno)).split("escrito-al-volver").length > 2, 8000);
  await v.inv("pty_write", { id: uno, data: "echo escrito-al-volver\r" });
  let acepta = await contesto();
  if (!acepta) {
    console.log("      la primera escritura no llegó; cola de la uno: " + JSON.stringify((await historial(v, uno)).slice(-160)));
    await v.inv("pty_write", { id: uno, data: "echo escrito-al-volver\r" });
    acepta = (await contesto()) && "a la segunda";
  }
  dice(acepta === true, `la terminal recogida sigue aceptando teclas${acepta === "a la segunda" ? " (la PRIMERA escritura se perdió)" : ""}`);

  const vidaDespues = await v.inv("conserje_arranque");
  dice(vidaDespues === vida, `la vida de los números es la misma tras la caída (${vida} y ${vidaDespues})`);
  const suya = (await v.inv("decisiones_listar")).find((d) => d.id === decision);
  dice(suya?.vigencia === "viva", `la pregunta de la uno sigue viva, no «sin nadie detrás» (${suya?.vigencia})`);
  const deVuelta = await hasta(async () => {
    const r = await mcp.pedir("tools/list");
    return r?.result?.tools?.length ? r : null;
  }, 30_000, 1000);
  dice(Boolean(deVuelta), `el enlace del MCP se reengancha solo, sin /mcp (${deVuelta?.result?.tools?.length ?? 0} herramientas)`);
  const libre = await v.inv("pty_primer_libre");
  dice(libre > dos, `una terminal nueva no repite número de esta vida (el primero libre es el ${libre})`);

  // ------------------------------------------------------------ el cierre de verdad
  // Salir bien es despedirse: el proceso de terminales se lleva todo.
  await v.inv("plugin:process|exit", { code: 0 }).catch(() => {});
  dice(await hasta(() => !vivo(motor) && !vivo(app), 10_000), "al salir bien, el proceso de terminales se cierra con ella");
} catch (e) {
  dice(false, e.message);
} finally {
  mcp?.cerrar();
  for (const pid of [app, motor, mcp?.pid]) if (pid && vivo(pid)) process.kill(pid);
  await dormir(1500);
  // El navegador puede tardar un momento en soltar su carpeta.
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
