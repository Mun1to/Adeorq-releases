// El freno por cuota de los encargos programados, con el PROGRAMA de verdad y
// la cuota de verdad.
//
// `cargo test --lib programados` mira la decisión con unas puertas de mentira y
// `pnpm bancos programados` qué cuenta mide la ventana. Esto junta las mitades:
// el reloj de Rust del binario de desarrollo pregunta por el evento, la ventana
// lee la cuota de la cuenta predeterminada (un `claude -p /usage`, que no gasta
// nada) y contesta, y el reloj decide (`docs/contexto/programados.md`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/freno-cuota-de-verdad.mjs [ruta del .exe]
//
// Para ver el freno saltar sin esperar a una semana apretada, el tope se baja a
// 0 con `ADEORQ_TOPE_CUOTA` (solo lo lee una compilación de desarrollo): con
// cualquier número delante, esa vez se salta. Así no nace ninguna sesión, y lo
// que se comprueba es que el número que apunta el reloj es el de tu cuenta.
//
// Los datos (`LOCALAPPDATA`) y el navegador (`WEBVIEW2_USER_DATA_FOLDER`) van a
// una carpeta temporal. La casa (`USERPROFILE`) es la de verdad A PROPÓSITO: es
// la única forma de que `/usage` conteste la cuota de verdad. Lo que no se aísla
// se tapa en la página (`GUARDA`, como en `mods-de-verdad.mjs`). Si el freno
// fallara y el encargo naciera, es «responde solo: hola» en una carpeta vacía,
// y su rastro en `~/.claude/projects` se borra al acabar. Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9600 + (process.pid % 100);
const NOMBRE = `adeorq-freno-${process.pid}`;
const BASE = join(tmpdir(), NOMBRE);
const DATOS = join(BASE, "datos", "Adeorq");
const PROYECTO = join(BASE, "proyectos", "demo");
const PROGRAMADOS = join(DATOS, "programados.json");
/** Cuándo le toca: el reloj de desarrollo da su primera vuelta a los 10 s, y la
    ventana tiene que estar cargada y escuchando antes de que pregunte. */
const TOCA_EN_MS = 45_000;

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
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      ADEORQ_PROGRAMADOS: "1",
      ADEORQ_TOPE_CUOTA: "0",
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

const encargo = () => JSON.parse(readFileSync(PROGRAMADOS, "utf8")).encargos[0];

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  mkdirSync(PROYECTO, { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  // «Cada hora», creado hace una hora menos TOCA_EN_MS: le toca dentro de
  // TOCA_EN_MS, con la ventana ya cargada.
  const creado = Date.now() - 3_600_000 + TOCA_EN_MS;
  writeFileSync(
    PROGRAMADOS,
    JSON.stringify({
      version: 1,
      encargos: [
        { id: "pfreno", nombre: "Freno", encargo: "responde solo: hola", cwd: PROYECTO, cuando: { tipo: "cada", horas: 1 }, activo: true, creado, ultima: 0, ultimoDia: "", corrida: null, ultimas: [], fallosSeguidos: 0, cortado: null },
      ],
    }),
  );

  app = abrirApp();
  dice(await hasta(() => alFondo(app), 12_000, 200), "la ventana de pruebas va al fondo, sin foco");
  let v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", "es");
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: join(BASE, "proyectos"), sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();
  await hasta(() => v.js(`!!document.querySelector('[data-tab="cabina"]')`), 20_000);
  dice(Date.now() < creado + 3_600_000 - 5_000, "la ventana está cargada y escuchando antes de que le toque");

  // ------------------------------------------------------------ le toca, y el freno salta
  const apuntado = await hasta(() => encargo().ultimas.length > 0 && encargo(), TOCA_EN_MS + 45_000, 1000);
  dice(Boolean(apuntado), "el reloj apunta cómo fue la vez que le tocaba");
  const u = apuntado?.ultimas?.[0] ?? {};
  const visto = /la cuenta iba por el (\d+) % de su cuota, y el freno salta al 0 %/.exec(u.detalle ?? "");
  dice(u.resultado === "saltado" && Boolean(visto), `se salta, y dice por cuánto iba la cuenta («${u.detalle}»)`);
  dice(apuntado?.fallosSeguidos === 0 && apuntado?.corrida === null && apuntado?.ultima > 0, "no cuenta como fallo, no abre nada y el turno queda gastado");
  dice((await v.inv("pty_vivas")).length === 0, "no ha nacido ninguna terminal");

  // ------------------------------------------------------------ el número es el de tu cuenta
  const limites = await v.inv("usage_limits", { configDir: null });
  const real = Math.max(0, ...limites.lines.map((l) => l.percent));
  const apuntadoN = visto ? Number(visto[1]) : NaN;
  dice(Math.abs(apuntadoN - real) <= 2, `es lo que lleva gastado la cuenta predeterminada: el reloj apuntó ${apuntadoN} % y \`/usage\` dice ${real} % (${limites.lines.map((l) => `${l.label} ${l.percent} %`).join(", ")})`);

  const rastro = existsSync(join(DATOS, "rastro.log")) ? readFileSync(join(DATOS, "rastro.log"), "utf8") : "";
  dice(!/programados: /.test(rastro), "el rastro no tiene ningún error del reloj");
  v.cerrar();
} catch (e) {
  dice(false, e.message);
} finally {
  if (app && vivo(app)) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  await dormir(1500);
  for (let i = 0; i < 5 && existsSync(BASE); i++) {
    try {
      rmSync(BASE, { recursive: true, force: true });
    } catch {
      await dormir(1000);
    }
  }
  // Si algo naciera, su conversación no se queda en tu lista de sesiones.
  const proyectos = join(homedir(), ".claude", "projects");
  for (const d of existsSync(proyectos) ? readdirSync(proyectos) : []) {
    if (d.includes(NOMBRE)) rmSync(join(proyectos, d), { recursive: true, force: true });
  }
}

console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
