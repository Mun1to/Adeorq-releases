// Los mods con el PROGRAMA de verdad leyendo una carpeta de verdad.
//
// `cargo test --lib mods::` mira el lector, `pnpm bancos mods` la lógica y
// `mods.js` la interfaz con un doble. Esto junta las mitades: el binario de
// desarrollo entero, con su ventana, leyendo `mods\` de una casa de pruebas
// por el puente de Tauri de verdad (META 14, `docs/contexto/mods.md`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/mods-de-verdad.mjs [ruta del .exe]
//
// Abre una ventana «Adeorq · DESARROLLO» unos cuarenta segundos y la maneja por
// dentro (el puerto de depuración del WebView): ni ratón ni teclado. Nada más
// nacer la manda al fondo sin darle el foco, para no ponérsela delante a quien
// esté trabajando. Solo en Windows.
//
// No toca la Adeorq instalada ni sus datos: la casa (`USERPROFILE`), los datos
// (`LOCALAPPDATA`) y el perfil del navegador (`WEBVIEW2_USER_DATA_FOLDER`) van a
// una carpeta temporal. Lo que esas variables NO aíslan se tapa en la página
// antes de recargarla (`GUARDA`, la misma idea que la de `capturas/escena.mjs`):
// el estado de la barra vive en la carpeta de la app por su identificador, y
// la ventana de pruebas ni lo lee ni puede escribirle encima.
//
// Lo que NO hace a propósito: quitar un mod de verdad. Va a la papelera del
// sistema, y dejarle cosas en la papelera a quien lanza la prueba no es probar.
// Ese recorrido está en `cargo test` con un «tirar» de mentira, y la papelera
// tiene su propia prueba (`a_file_really_goes_to_the_bin`).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9500 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-mods-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const MODS = join(DATOS, "mods");
const PROYECTO = join(BASE, "proyectos", "demo");
const FOTO = "C:/proyectos/Adeorq/.playwright-mcp/mods-de-verdad.png";

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

/** Un mod en la carpeta, como lo dejaría un agente. */
function escribirMod(id, manifiesto, hoja) {
  mkdirSync(join(MODS, id), { recursive: true });
  writeFileSync(join(MODS, id, "mod.json"), JSON.stringify({ id, hecho_para: "0.9.192", tipo: "estilo", ...manifiesto }, null, 2));
  writeFileSync(join(MODS, id, "estilo.css"), hoja);
}

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

// Lo mismo que hace `mods.js` con el doble: pulsar por el rótulo y leer las filas.
const PULSAR = `(rotulo, mod) => {
  const seccion = [...document.querySelectorAll(".set-hoja .panel-card")].find((c) => c.querySelector("h2")?.textContent.trim() === "Mods");
  const donde = mod ? [...(seccion?.querySelectorAll(".mcp-cliente") ?? [])].find((f) => f.querySelector("b")?.textContent.trim() === mod) : seccion;
  const boton = donde && [...donde.querySelectorAll("button.choice")].find((b) => b.textContent.trim() === rotulo);
  boton?.click();
  return Boolean(boton);
}`;
const FILAS = `Object.fromEntries([...document.querySelectorAll(".set-hoja .mcp-cliente")].map((f) => [f.querySelector("b")?.textContent.trim(), f.querySelector(".mod-estado")?.textContent.trim()]))`;
const RADIO = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e).borderTopLeftRadius : "(no está)"; })()`;
const ESTADOS = `(window.__mods ?? []).map((m) => m.id + ":" + m.estado).join(" ")`;

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  mkdirSync(PROYECTO, { recursive: true });
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  // Tres mods, como los dejaría un agente: uno bueno, uno que habla con la red
  // y uno que se agarra a algo que esta versión no conoce.
  escribirMod("iconos-redondos", { pedido: "quiero los iconos redondos", toca: ["--r-icono"] }, ":root {\n  --r-icono: 999px;\n}\n");
  escribirMod("con-red", { pedido: "un fondo de internet", toca: [] }, ".pane { background: url(https://ejemplo.com/x.png); }\n");
  escribirMod("esquinas-viejas", { pedido: "quiero las esquinas de antes", toca: ["--r-que-ya-no-existe"] }, ":root { --r-que-ya-no-existe: 2px; }\n");

  app = abrirApp();
  // Antes que nada, en cuanto tiene ventana: que no se quede delante.
  dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  // El primer arranque sale con la bienvenida: se deja hecha, con una consola
  // en el tablero para tener una terminal a la que escribirle.
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
    localStorage.setItem("adeorq-layout", ${JSON.stringify(
      JSON.stringify({ panes: [{ name: "demo · consola", cwd: PROYECTO }], cols: [{ w: 1, hs: [1], idx: [0] }], ocultos: [] }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await hasta(() => v.js(`!!document.querySelector('[data-tab="cabina"]')`), 20_000);

  // ------------------------------------------------------------ el lector, por el puente de verdad
  const leidos = await v.inv("mods_leer");
  const de = (id) => leidos.find((m) => m.id === id) ?? {};
  dice(leidos.map((m) => m.id).join() === "con-red,esquinas-viejas,iconos-redondos", `Rust lee los tres mods de la carpeta, por orden (${leidos.map((m) => m.id).join(", ")})`);
  dice(de("iconos-redondos").fallo === null && de("iconos-redondos").hoja.includes("--r-icono: 999px") && de("iconos-redondos").hechoPara === "0.9.192" && de("iconos-redondos").pedido === "quiero los iconos redondos", "el bueno llega entero, con los nombres de campo que la ventana lee");
  dice(/url\(\)/.test(de("con-red").fallo ?? "") && de("con-red").hoja === "", `el que habla con la red llega rechazado y sin su hoja («${de("con-red").fallo}»)`);

  // ------------------------------------------------------------ apagado de fábrica
  await dormir(2500);
  const fabrica = { tab: await v.js(RADIO(".tab")), hoja: await v.js(`document.getElementById("adeorq-mods") !== null`), ls: await v.js(`localStorage.getItem("adeorq-mods")`) };
  dice(fabrica.tab === "6px" && !fabrica.hoja && fabrica.ls === null, `de fábrica van apagados: hay tres mods en la carpeta y no se aplica ninguno (pestaña ${fabrica.tab})`);

  // ------------------------------------------------------------ encender, desde Ajustes
  await v.js(`document.querySelector('[data-tab="ajustes"]').click()`);
  await dormir(600);
  await v.js(`[...document.querySelectorAll(".set-tab")].find((b) => b.textContent.trim().startsWith("Mods")).click()`);
  const filasApagado = await hasta(async () => {
    const f = await v.js(FILAS);
    return Object.keys(f).length === 3 ? f : null;
  }, 8000);
  dice(filasApagado?.["iconos-redondos"] === "Listo para cuando los enciendas", "Ajustes > Mods enseña lo que hay en la carpeta antes de encender nada");
  dice(await v.js(`(${PULSAR})("Encendidos")`), "se pulsa «Encendidos»");
  const encendido = await hasta(async () => ((await v.js(RADIO(".tab"))) === "999px" ? true : null), 6000);
  dice(encendido, "al encenderlos, las pestañas de la barra salen redondas");
  dice((await v.js(ESTADOS)) === "con-red:rechazado esquinas-viejas:no_engancha iconos-redondos:aplicado", `cada mod, en su estado (${await v.js(ESTADOS)})`);
  const filas = await v.js(FILAS);
  dice(filas["iconos-redondos"] === "Puesto" && /^No se carga: /.test(filas["con-red"]) && filas["esquinas-viejas"] === "Ya no engancha: --r-que-ya-no-existe no existe en esta versión", "y la lista lo dice con sus palabras");
  const foto = await v.enviar("Page.captureScreenshot", { format: "png" });
  mkdirSync("C:/proyectos/Adeorq/.playwright-mcp", { recursive: true });
  writeFileSync(FOTO, Buffer.from(foto.data, "base64"));

  // ------------------------------------------------------------ la guía, en el disco
  const guia = await hasta(() => existsSync(join(MODS, "LEEME.md")) && readFileSync(join(MODS, "LEEME.md"), "utf8"), 6000);
  const version = await v.inv("plugin:app|version");
  dice(Boolean(guia) && guia.includes(`Adeorq ${version}`) && guia.includes("`--r-icono`") && guia.includes("`--r-avatar`") && guia.includes(`${MODS}\\<id>\\mod.json`), `la guía está al lado de los mods, con la versión del programa (${version}) y su carpeta de verdad`);
  dice((await v.inv("mods_leer")).length === 3, "la guía no cuenta como un mod");

  // ------------------------------------------------------------ un agente escribe uno nuevo
  escribirMod("avatares-redondos", { pedido: "y los proyectos también", toca: ["--r-avatar"] }, ":root { --r-avatar: 999px; }\n");
  const llego = await hasta(async () => ((await v.js(ESTADOS)).includes("avatares-redondos:aplicado") ? true : null), 9000);
  dice(llego, "un mod escrito con el programa abierto se aplica solo en unos segundos, sin tocar nada");
  const hoja = await v.js(`document.getElementById("adeorq-mods")?.textContent ?? ""`);
  dice(hoja.includes("/* mod: avatares-redondos */") && hoja.includes("--r-avatar: 999px"), "y su hoja está puesta");
  dice((await v.js(`document.head.lastElementChild?.id`)) === "adeorq-mods", "la hoja de los mods es la última del documento");

  // ------------------------------------------------------------ apagar uno
  dice(await v.js(`(${PULSAR})("Apagar", "iconos-redondos")`), "se pulsa «Apagar» en iconos-redondos");
  dice(await hasta(async () => ((await v.js(RADIO(".tab"))) === "6px" ? true : null), 5000), "apagar uno lo quita: las pestañas vuelven a su esquina");
  await v.js(`(${PULSAR})("Encender", "iconos-redondos")`);
  dice(await hasta(async () => ((await v.js(RADIO(".tab"))) === "999px" ? true : null), 5000), "y encenderlo lo vuelve a poner");

  // ------------------------------------------------------------ quitar no sale de la carpeta
  for (const [malo, porque] of [["..", "nombre de un mod"], ["../demo", "nombre de un mod"], ["LEEME.md", "nombre de un mod"], ["no-existe", "Ya no está"]]) {
    // El rechazo de Rust es un texto, no un Error: se recoge dentro de la página.
    const e = await v.js(`window.__TAURI_INTERNALS__.invoke("mods_quitar", ${JSON.stringify({ id: malo })}).then(() => "", (x) => String(x))`);
    dice(e.includes(porque), `quitar «${malo}» se niega («${e}»)`);
  }
  dice(existsSync(join(MODS, "LEEME.md")) && existsSync(join(MODS, "iconos-redondos", "mod.json")), "y no ha tocado nada");

  // ------------------------------------------------------------ pasárselo al agente
  const id = (await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length === 1 ? l : null;
  }, 20_000))?.[0]?.id;
  dice(id != null, "hay una terminal abierta a la que escribirle");
  await dormir(2500);
  dice(await v.js(`(${PULSAR})("Pasárselo a tu agente", "esquinas-viejas")`), "se pulsa «Pasárselo a tu agente» en el que ya no engancha");
  const escrito = await hasta(async () => {
    const t = (await v.inv("pty_historial", { id, bytes: 6000 })).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\s+/g, " ");
    return t.includes("rehaz mi mod de Adeorq «esquinas-viejas»") ? t : null;
  }, 8000);
  dice(Boolean(escrito) && escrito.includes("LEEME.md") && escrito.includes("--r-que-ya-no-existe ya no existe"), "el encargo llega escrito a la terminal, con la ruta de la guía, cuál es y qué se soltó");
  dice((await v.js(`document.querySelector('.tabs .tab[data-active="true"]')?.getAttribute("data-tab")`)) === "cabina", "y te lleva a la Cabina, donde se ve");

  // ------------------------------------------------------------ la tecla de emergencia
  await v.enviar("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 1 | 2 | 8, key: "0", code: "Digit0", windowsVirtualKeyCode: 48 });
  await v.enviar("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 1 | 2 | 8, key: "0", code: "Digit0", windowsVirtualKeyCode: 48 });
  dice(await hasta(async () => ((await v.js(RADIO(".tab"))) === "6px" && (await v.js(`localStorage.getItem("adeorq-mods")`)) === null ? true : null), 5000), "Ctrl+Alt+Mayús+0 los apaga todos");

  // ------------------------------------------------------------ el rastro
  const rastro = existsSync(join(DATOS, "rastro.log")) ? readFileSync(join(DATOS, "rastro.log"), "utf8") : "";
  dice(/mods: \d+ puestos/.test(rastro) && rastro.includes("esquinas-viejas ya no engancha") && rastro.includes("con-red rechazado"), "y en el rastro queda qué mods había y cuál fallaba");
  v.cerrar();
} catch (e) {
  dice(false, e.message);
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

console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
