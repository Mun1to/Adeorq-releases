// Lo que toca el agente, con el PROGRAMA de verdad, un git de verdad y un
// transcript escrito en el disco.
//
// `cargo test --lib tocados::` mira el lector, `pnpm bancos tocados` la cuenta
// y `archivos-agente.js` la cara con un doble. Esto junta las mitades: el
// binario de desarrollo entero, con su ventana, leyendo por el puente de Tauri
// el transcript de una sesión y el estado de un repositorio que nacen aquí
// (`docs/contexto/archivos.md`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/archivos-agente-de-verdad.mjs [ruta del .exe]
//
// Con `--mirar` no comprueba nada: deja la ventana DELANTE y repite el
// recorrido despacio, una vuelta tras otra (cada una con su edición y su commit
// de verdad), hasta que cierres la ventana o pasen diez minutos. Es la forma de
// enseñárselo a alguien: se ve moverse, que es lo que una foto no cuenta.
//
// El recorrido es el del vídeo que trajo Munir el 2026-10-12, hecho de verdad:
// la sesión lee un test, lanza una edición que se queda esperando, la edición
// se hace (el archivo cambia en el disco), lanza el commit y el commit entra.
// A cada paso se añade al transcript lo que Claude Code habría escrito y se
// mira qué pinta el panel.
//
// Abre una ventana «Adeorq · DESARROLLO» algo más de un minuto y la maneja por
// dentro (el puerto de depuración del WebView): ni ratón ni teclado. Nada más
// nacer la manda al fondo sin darle el foco. Solo en Windows.
//
// No toca la Adeorq instalada, ni sus datos, ni ninguna sesión de nadie: la
// casa (`USERPROFILE`, donde vive `.claude`), los datos (`LOCALAPPDATA`) y el
// perfil del navegador van a una carpeta temporal, igual que en
// `mods-de-verdad.mjs`. Y el `claude` que arranca la terminal del tablero es uno
// de mentira, puesto delante en el PATH de la ventana de pruebas: Adeorq retoma
// la sesión de un panel al abrirlo (`claude --resume <id>`), así que con el de
// verdad se abría un Claude Code en su pantalla de bienvenida. Pasó la primera
// vez; no tenía cuenta en esa casa y no gastó nada, pero una prueba no lanza
// el CLI de nadie.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MIRAR = process.argv.includes("--mirar");
const EXE = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9600 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-archivos-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const CASA = join(BASE, "casa");
const PROYECTO = join(BASE, "proyectos", "weather-app");
const SESION = "11111111-2222-4333-8444-555555555555";
// Como `encode_claude`: todo lo que no es letra ni número, un guion.
const TRANSCRIPT = join(CASA, ".claude", "projects", PROYECTO.replace(/[^A-Za-z0-9]/g, "-"), `${SESION}.jsonl`);
const FOTO = "C:/proyectos/Adeorq/.playwright-mcp/archivos-agente-de-verdad.png";

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

/** Git en el proyecto de pruebas, sin la identidad ni los hooks de quien lanza esto. */
function git(...args) {
  const r = spawnSync("git", ["-C", PROYECTO, "-c", "user.name=Prueba", "-c", "user.email=prueba@adeorq.invalid", "-c", "core.hooksPath=.sin-hooks", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Una línea del transcript, como las escribe Claude Code. `hace` son segundos atrás. */
function apuntar(tipo, contenido, hace = 0) {
  const linea = { type: tipo, timestamp: new Date(Date.now() - hace * 1000).toISOString(), cwd: PROYECTO, sessionId: SESION, isSidechain: false, message: { role: tipo, content: contenido } };
  appendFileSync(TRANSCRIPT, `${JSON.stringify(linea)}\n`);
}
const uso = (id, name, input) => ({ type: "tool_use", id, name, input });
const respuesta = (id) => [{ type: "tool_result", tool_use_id: id, content: "ok" }];

function abrirApp() {
  // El `claude` de mentira, delante de todo lo demás. En Windows la variable se
  // llama `Path` o `PATH` según quién la puso: se quita la que haya y se pone una.
  const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "path"));
  const hijo = spawn(EXE, [], {
    cwd: PROYECTO,
    detached: true,
    stdio: "ignore",
    env: {
      ...entorno,
      Path: `${join(BASE, "bin")};${process.env.PATH ?? ""}`,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: CASA,
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
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
  return { enviar, js, inv, cerrar: () => ws.close() };
}

/** Lo que pinta el panel, leído de la página. */
const PANEL = `(() => {
  const limpio = (e) => e?.textContent?.replace(/\\s+/g, " ").trim() ?? null;
  const txt = (s) => limpio(document.querySelector(s));
  const fila = (nombre) => {
    const b = [...document.querySelectorAll(".arch-fila")].find((x) => x.querySelector(".arch-nom")?.textContent === nombre);
    return b ? [b.getAttribute("data-agente"), limpio(b.querySelector(".arch-etq")), limpio(b.querySelector(".arch-lineas")), limpio(b.querySelector(".arch-letra"))].map((x) => x ?? "-").join(" ") : "(no está)";
  };
  return {
    que: document.querySelector(".arch-tarjeta")?.getAttribute("data-que") ?? null,
    estado: txt(".arch-tj-estado"), titulo: txt(".arch-tj-tit"), sub: txt(".arch-tj-sub"), rama: txt(".arch-tj-rama"), git: txt(".arch-tj-git"),
    lista: [...document.querySelectorAll(".arch-toc")].map((b) => limpio(b.querySelector(".arch-nom")) + "=" + b.getAttribute("data-agente")).join(" "),
    pie: txt(".arch-pie"),
    cliente: fila("client.js"), test: fila("client.test.js"),
  };
})()`;

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  // El proyecto: un repositorio con su primer commit.
  mkdirSync(join(PROYECTO, "src", "api"), { recursive: true });
  mkdirSync(join(PROYECTO, "tests"), { recursive: true });
  mkdirSync(join(CASA, "AppData", "Local"), { recursive: true });
  mkdirSync(join(TRANSCRIPT, ".."), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  mkdirSync(join(BASE, "bin"), { recursive: true });
  writeFileSync(join(BASE, "bin", "claude.cmd"), "@echo off\r\necho claude de mentira: %*\r\npause >nul\r\n");
  const CLIENTE = join(PROYECTO, "src", "api", "client.js");
  const TEST = join(PROYECTO, "tests", "client.test.js");
  const ESTACIONES = join(PROYECTO, "src", "api", "stations.js");
  writeFileSync(CLIENTE, "export async function get(url) {\n  const r = await fetch(url);\n  return r.json();\n}\n");
  writeFileSync(ESTACIONES, "export const stations = [];\n");
  writeFileSync(TEST, "import { get } from '../src/api/client.js';\n");
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-q", "-m", "first: the client");

  // La sesión, antes de abrir: te pidió algo y leyó el test hace un minuto.
  apuntar("user", "haz que el cliente reintente una vez", 90);
  apuntar("assistant", [uso("t1", "Read", { file_path: TEST })], 60);
  apuntar("user", respuesta("t1"), 59);
  // Sin esto la cola acabaría en la respuesta de una herramienta, que es como
  // se ve una sesión a medias de una ronda: seguiría «trabajando».
  apuntar("assistant", [{ type: "text", text: "Ya sé qué prueba hay." }], 58);

  app = abrirApp();
  if (!MIRAR) dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  // La bienvenida hecha, el panel de Archivos abierto y una terminal de Claude
  // con el id de la sesión (que arrancará el de mentira).
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-lateral", "archivos");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
    localStorage.setItem("adeorq-layout", ${JSON.stringify(
      JSON.stringify({
        panes: [{ name: "weather-app · cliente", cwd: PROYECTO, command: ["cmd.exe", "/k", `claude --session-id ${SESION}`] }],
        cols: [{ w: 1, hs: [1], idx: [0] }],
        ocultos: [],
      }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await hasta(() => v.js(`!!document.querySelector('[data-tab="cabina"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="cabina"]').click()`);
  await dormir(800);
  await v.js(`document.querySelector("[data-pane-id]")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`);
  dice(await hasta(() => v.js(`document.querySelector(".arch-raiz")?.textContent?.trim() === "weather-app"`), 10_000), "el panel de Archivos enseña el proyecto de la terminal");
  // Se despliegan las carpetas para ver las filas.
  const filaDe = (nombre) => `[...document.querySelectorAll(".arch-fila")].find((b) => b.querySelector(".arch-nom")?.textContent === ${JSON.stringify(nombre)})`;
  for (const [carpeta, dentro] of [["src", "api"], ["api", "client.js"], ["tests", "client.test.js"]]) {
    // Cada carpeta se lee del disco al desplegarla: la siguiente no existe hasta que llega.
    await hasta(() => v.js(`!!${filaDe(carpeta)}`), 6000);
    await v.js(`${filaDe(carpeta)}?.click()`);
    await hasta(() => v.js(`!!${filaDe(dentro)}`), 6000);
  }
  dice(await v.js(`!!${filaDe("client.js")} && !!${filaDe("client.test.js")}`), "el árbol lee las carpetas del disco al desplegarlas");
  // Lo que arrancó en la terminal es el `claude` de mentira, no el de nadie.
  const terminal = (await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length === 1 ? l : null;
  }, 20_000))?.[0]?.id;
  const pantalla = await hasta(async () => {
    const t = (await v.inv("pty_historial", { id: terminal, bytes: 6000 })).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    return t.includes("claude de mentira") ? t : null;
  }, 10_000);
  dice(Boolean(pantalla) && pantalla.includes(SESION), "la terminal arrancó el claude de mentira con el id de la sesión, no el CLI de verdad");
  const panel = () => v.js(PANEL);
  const cuando = (cond, ms = 9000) => hasta(async () => {
    const p = await panel();
    return cond(p) ? p : null;
  }, ms);

  // ------------------------------------------------------------ para mirarlo
  if (MIRAR) {
    console.log("Mirando: la ventana «Adeorq · DESARROLLO», panel de Archivos a la derecha. Ciérrala para acabar.");
    const fin = Date.now() + 10 * 60_000;
    // Mientras la ventana siga abierta; cada espera se corta si se cierra.
    const espera = async (ms) => {
      for (const hasta_ = Date.now() + ms; Date.now() < hasta_; ) {
        if (!vivo(app)) throw new Error("ventana cerrada");
        await dormir(250);
      }
    };
    try {
      for (let vuelta = 1; Date.now() < fin; vuelta++) {
        const id = (n) => `v${vuelta}-${n}`;
        apuntar("user", `vuelta ${vuelta}: que el cliente reintente ${vuelta} veces`);
        apuntar("assistant", [uso(id(1), "Read", { file_path: TEST })]);
        await espera(2500);
        apuntar("user", respuesta(id(1)));
        apuntar("assistant", [{ type: "text", text: "Lo cambio." }, uso(id(2), "Edit", { file_path: CLIENTE, old_string: "…", new_string: "…" })]);
        await espera(3000);
        writeFileSync(CLIENTE, `export async function get(url) {\n  let r = await fetch(url);\n${"  if (!r.ok) r = await fetch(url);\n".repeat(vuelta)}  return r.json();\n}\n`);
        apuntar("user", respuesta(id(2)));
        apuntar("assistant", [uso(id(3), "Edit", { file_path: ESTACIONES, old_string: "…", new_string: "…" })]);
        await espera(3000);
        writeFileSync(ESTACIONES, `export const stations = [${Array.from({ length: vuelta }, (_, i) => `"E${i + 1}"`).join(", ")}];\n`);
        apuntar("user", respuesta(id(3)));
        apuntar("assistant", [{ type: "text", text: "Editados los dos." }]);
        // Recién editado sigue diciendo «editando» doce segundos; luego, «editado».
        await espera(17_000);
        apuntar("user", "haz el commit");
        apuntar("assistant", [uso(id(4), "Bash", { command: `git commit -m "fix: the client retries ${vuelta} times"`, description: "Commit" })]);
        await espera(3500);
        git("add", ".");
        git("commit", "-q", "-m", `fix: the client retries ${vuelta} times`);
        apuntar("user", respuesta(id(4)));
        apuntar("assistant", [{ type: "text", text: "Hecho." }]);
        await espera(10_000);
      }
    } catch (e) {
      if (e.message !== "ventana cerrada") throw e;
    }
    v.cerrar();
    throw new Error("__mirado__");
  }

  // ------------------------------------------------------------ por el puente de verdad
  const leido = await v.inv("session_files", { cwd: PROYECTO, sessionId: SESION, rollout: false });
  dice(leido.tocados.length === 1 && leido.tocados[0].ruta === TEST && leido.tocados[0].leido !== "" && leido.lee && leido.turno === 1 && !leido.enMarcha, `Rust lee el transcript de la casa: un archivo leído, turno 1 (${JSON.stringify(leido.tocados.map((t) => t.ruta.slice(PROYECTO.length + 1)))})`);
  const estado = await v.inv("estado_archivos", { raiz: PROYECTO });
  dice(estado.git && estado.rama === "main" && estado.cambios.length === 0 && estado.commits.length === 1 && estado.commits[0].asunto === "first: the client", `y git de verdad: rama «${estado.rama}», limpio, un commit («${estado.commits[0]?.asunto}»)`);
  for (const [malo, porque] of [[{ cwd: PROYECTO, sessionId: "../../otro", rollout: false }, "no válido"], [{ cwd: PROYECTO, sessionId: "99999999-0000-4000-8000-000000000000", rollout: false }, "no está en el disco"], [{ cwd: PROYECTO, sessionId: SESION, rollout: true }, "no está en el disco"]]) {
    const e = await v.js(`window.__TAURI_INTERNALS__.invoke("session_files", ${JSON.stringify(malo)}).then(() => "", (x) => String(x))`);
    dice(e.includes(porque), `un pedido que no toca se niega («${e}»)`);
  }

  // ------------------------------------------------------------ lo que leyó
  let p = await cuando((x) => x.que === "abrio");
  dice(p?.titulo === "Claude abrió 1 archivo" && p.estado === "Hecho" && p.rama === "main" && p.lista === "client.test.js=leido" && p.test.startsWith("leido"), `lo que leyó hace un minuto: «${p?.titulo}», y la fila en el árbol (${p?.test})`);

  // ------------------------------------------------------------ una edición esperando
  apuntar("assistant", [{ type: "text", text: "Lo cambio." }, uso("t2", "Edit", { file_path: CLIENTE, old_string: "const r", new_string: "let r" })]);
  p = await cuando((x) => x.que === "editando");
  dice(p?.titulo === "Claude está editando" && p.estado === "Trabajando" && p.sub === null && p.cliente.startsWith("editando Editando") && p.lista === "client.js=editando client.test.js=leido", `una edición lanzada y sin contestar: «${p?.titulo}», el archivo en la lista y no repetido debajo (${p?.cliente})`);

  // ------------------------------------------------------------ la edición se hace
  writeFileSync(CLIENTE, "export async function get(url) {\n  let r = await fetch(url);\n  if (!r.ok) r = await fetch(url);\n  return r.json();\n}\n");
  apuntar("user", respuesta("t2"));
  // Recién hecha sigue diciendo «editando» unos segundos; después, lo que dice git.
  p = await cuando((x) => x.que === "edito", 20_000);
  dice(p?.titulo === "Claude editó 1 archivo" && /\+2/.test(p.sub) && /−1/.test(p.sub) && p.cliente === "editado - +2−1 M" && /1 cambiado/.test(p.git), `la edición hecha: «${p?.titulo}» ${p?.sub}; en el árbol «${p?.cliente}»; git «${p?.git}»`);

  // ------------------------------------------------------------ lanza el commit
  apuntar("assistant", [uso("t3", "Bash", { command: `git -C "${PROYECTO}" commit -m "fix: the client retries once"`, description: "Commit" })]);
  p = await cuando((x) => x.que === "commitEnCurso");
  dice(p?.titulo === "Claude está haciendo el commit" && p.pie === "haciendo commit…" && p.cliente.startsWith("editado"), `el commit lanzado: «${p?.titulo}», y abajo «${p?.pie}»`);

  // ------------------------------------------------------------ el commit entra
  git("add", ".");
  git("commit", "-q", "-m", "fix: the client retries once");
  const hash = git("rev-parse", "--short", "HEAD");
  apuntar("user", respuesta("t3"));
  apuntar("assistant", [{ type: "text", text: "Hecho." }]);
  p = await cuando((x) => x.que === "commit", 12_000);
  dice(p?.titulo === "Claude hizo commit de 1 archivo" && p.estado === "Hecho" && p.sub === `${hash} · fix: the client retries once` && p.cliente === "commit En el commit - -" && p.pie === `commit ${hash}` && /limpio, nada cambiado/.test(p.git) && p.lista === "client.js=commit client.test.js=leido", `el commit de verdad (${hash}) entra: «${p?.titulo}», la fila «${p?.cliente}», el pie «${p?.pie}»`);
  const foto = await v.enviar("Page.captureScreenshot", { format: "png" });
  mkdirSync("C:/proyectos/Adeorq/.playwright-mcp", { recursive: true });
  writeFileSync(FOTO, Buffer.from(foto.data, "base64"));

  // ------------------------------------------------------------ y vuelve a editar
  apuntar("user", "ahora el test");
  apuntar("assistant", [uso("t4", "Write", { file_path: TEST, content: "…" })]);
  p = await cuando((x) => x.que === "editando");
  dice(p?.sub === null && p.lista === "client.test.js=editando client.js=commit", `otra edición lanzada: se ve, y lo del commit sigue ahí mientras no se haga (${p?.lista})`);
  writeFileSync(TEST, "import { get } from '../src/api/client.js';\n\ntest('reintenta', () => {});\n");
  apuntar("user", respuesta("t4"));
  p = await cuando((x) => x.que === "editando" && !x.lista.includes("commit"));
  dice(p?.lista === "client.test.js=editando" && p.pie === null && p.test.startsWith("editando"), `y en cuanto se hace, lo del commit se retira: ya es otro tramo (${p?.lista})`);
  v.cerrar();
} catch (e) {
  if (e.message !== "__mirado__") dice(false, e.message);
} finally {
  // Con su árbol: la consola del tablero cuelga de la app.
  if (app && vivo(app)) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
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

console.log(MIRAR && !fallos ? "\nVisto." : fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
