// Una terminal en MODO ESPEJO que aguanta una caída de Adeorq, con el programa
// de verdad y un repositorio de git de verdad.
//
// `caida-de-verdad.mjs` prueba que las terminales sobreviven en su proceso
// aparte y que cada panel recoge la suya. Esto prueba lo que faltaba: que un
// panel en Modo Espejo vuelva siendo de espejo y con SU espejo, el árbol donde
// el agente sigue escribiendo, y no con uno nuevo y vacío al lado
// (`docs/contexto/terminales-fuera.md`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/espejo-tras-caida.mjs [ruta del .exe]
//
// El panel lo abre el Capataz con «Espejo» marcado, como lo haría una persona;
// su plan se contesta desde la propia página (no se gasta nada). Abre una
// ventana «Adeorq · DESARROLLO» dos veces, al fondo y sin foco. La casa, los
// datos, el navegador y el canal de terminales van a una carpeta temporal.
// Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9300 + (process.pid % 100);
const CANAL = `espejo${process.pid}`;
const BASE = join(tmpdir(), `adeorq-espejo-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const PROYECTO = join(BASE, "proyectos", "demo");
const ESPEJOS = join(PROYECTO, ".adeorq", "espejo");
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

function git(...args) {
  const r = spawnSync("git", ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.invalid", ...args], { cwd: PROYECTO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
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
      ADEORQ_TERMINALES_CANAL: CANAL,
    },
  });
  hijo.unref();
  return hijo.pid;
}

function alFondo(pid) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `;
  return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", guion], { stdio: "ignore" }).status === 0;
}

/** El plan del Capataz se contesta aquí: un Claude con «Espejo» para marcar. */
const PLAN = JSON.stringify({ resumen: "Un Claude aislado.", acciones: [{ tipo: "claude_nuevo", proyecto: "demo", rol: "Espejo", prompt: "di hola" }] });
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
    if (m && m[1] === "foreman_plan") return responde(${JSON.stringify(PLAN)});
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
  const inv = (cmd, args = {}) => js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, inv, cerrar: () => ws.close() };
}

/** Con la guarda puesta antes de que cargue nada. */
async function ventanaGuardada() {
  const v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  return v;
}

const señas = () => JSON.parse(readFileSync(SEÑAS, "utf8"));
const espejos = () => (existsSync(ESPEJOS) ? readdirSync(ESPEJOS) : []);
/** La rama que enseña el panel en su botón del espejo, si es de espejo. */
const RAMA = `(() => { const b = [...document.querySelectorAll("[data-tip]")].find((e) => /Modo Espejo \\(SVFS\\) activo/.test(e.getAttribute("data-tip"))); return b ? (b.getAttribute("data-tip").match(/Rama: (\\S+)/) || [])[1] ?? "" : ""; })()`;

let app = 0;
let motor = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  mkdirSync(join(DATOS, "terminales"), { recursive: true });
  mkdirSync(PROYECTO, { recursive: true });
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  writeFileSync(join(DATOS, "terminales", "encendido"), "1");
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  // Un repositorio de verdad, en una rama y con un commit: sin eso no hay espejo.
  writeFileSync(join(PROYECTO, "LEEME.md"), "demo\n");
  git("init", "-q", "-b", "main");
  git("add", "LEEME.md");
  git("commit", "-q", "-m", "demo");

  // ------------------------------------------------------------ primera vida
  app = abrirApp();
  dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventanaGuardada();
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
    localStorage.setItem("adeorq-layout", ${JSON.stringify(JSON.stringify({ panes: [], cols: [], ocultos: [] }))});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventanaGuardada();
  await hasta(() => v.js(`!!document.querySelector('[data-tab="cabina"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="cabina"]').click()`);
  await dormir(600);

  // El Capataz: pedir el plan, marcar «Espejo» y ejecutar.
  await v.js(`document.querySelector(".foreman-call").click()`);
  await dormir(500);
  await v.js(`(() => {
    const caja = document.querySelector(".foreman-input");
    const poner = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(caja), "value").set;
    poner.call(caja, "abre un Claude aislado");
    caja.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await dormir(200);
  await v.js(`[...document.querySelectorAll(".foreman-row button")].find((b) => b.textContent.trim() === "Planear").click()`);
  dice(await hasta(() => v.js(`!!document.querySelector(".plan-shadow-chk input")`), 15_000), "el Capataz enseña el plan con la casilla «Espejo»");
  await v.js(`document.querySelector(".plan-shadow-chk input").click()`);
  await dormir(300);
  await v.js(`[...document.querySelectorAll("button")].find((b) => /^Ejecutar \\d+ acci/.test(b.textContent.trim())).click()`);

  const antes = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length === 1 ? l[0] : null;
  }, 30_000);
  if (!antes) throw new Error("no nació la terminal del plan");
  const nombre = espejos()[0];
  // Rust la escribe con la barra mezclada (`.adeorq/espejo`): se comparan iguales.
  const igual = (a, b) => a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();
  dice(Boolean(nombre) && igual(antes.cwd, join(ESPEJOS, nombre)), `la terminal nace DENTRO de su espejo (${antes.cwd})`);
  const ramaAntes = await hasta(() => v.js(RAMA), 10_000);
  dice(ramaAntes === `adeorq/shadow/${nombre}`, `y su panel lo dice: rama ${ramaAntes}`);
  motor = (await hasta(() => existsSync(SEÑAS) && señas().pid, 5000)) || 0;
  dice(motor > 0 && vivo(motor), `el proceso de terminales corre aparte (pid ${motor})`);
  // Que el tablero, con el número de la terminal, llegue al disco del navegador.
  await dormir(6000);
  v.cerrar();

  // ------------------------------------------------------------ la caída
  process.kill(app);
  await dormir(4000);
  dice(!vivo(app) && vivo(motor), "la app ha muerto y el proceso de terminales sigue vivo");

  // ------------------------------------------------------------ la vuelta
  app = abrirApp();
  alFondo(app);
  v = await ventanaGuardada();
  const despues = await hasta(async () => {
    const l = await v.inv("pty_vivas");
    return l.length >= 1 && (await v.js("document.querySelectorAll('.xterm').length")) >= 1 ? l : null;
  }, 30_000);
  dice(despues?.length === 1 && despues[0].id === antes.id && despues[0].cwd === antes.cwd, `vuelve la misma terminal, dentro del mismo espejo (${despues?.map((t) => `${t.id} ${t.cwd}`).join("; ")})`);
  const tablero = JSON.parse((await v.js("localStorage.getItem('adeorq-layout')")) ?? "{}");
  const paneles = tablero.panes ?? [];
  dice(paneles.length === 1 && paneles[0].pty === antes.id && !/recuperada/.test(paneles[0].name), `el panel recoge la suya y no sale como «recuperada» (${paneles.map((p) => `${p.name} = ${p.pty}`).join("; ")})`);
  const ramaDespues = await hasta(() => v.js(RAMA), 10_000);
  dice(ramaDespues === ramaAntes, `vuelve en Modo Espejo y con SU espejo: rama ${ramaDespues || "(ninguna: ya no es de espejo)"}`);
  dice(espejos().length === 1, `no se ha montado un espejo nuevo al lado (${espejos().join(", ")})`);
  v.cerrar();
} catch (e) {
  dice(false, e.message);
} finally {
  for (const pid of [app, motor]) if (pid && vivo(pid)) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
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
