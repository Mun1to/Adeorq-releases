// Un encargo programado con CODEX, de punta a punta, con el programa de verdad.
//
// `cargo test --lib programados` mira el reloj con unas puertas de mentira y
// `programados.js` la pantalla con un doble. Esto junta todo: el reloj del
// binario de desarrollo le toca, pregunta la cuota de Codex, pide el panel por
// `open_pane` con `cli: "codex"`, nace un Codex de verdad con el encargo en la
// línea de arranque, contesta, y la vuelta siguiente lee en su rollout que el
// turno acabó y lo apunta como `hecho` (`docs/contexto/programados.md`).
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/programado-codex-de-verdad.mjs [ruta del .exe]
//
// GASTA UN TURNO DE TU CODEX: «responde solo: hola», con el esfuerzo que tengas
// puesto en `~/.codex/config.toml`. Por eso la casa (`USERPROFILE`) es la de
// verdad, que es donde vive su sesión iniciada, y la carpeta es tu `%TEMP%`, que
// Codex tiene que tener ya por fiable: en una nueva se pararía a preguntarlo.
// Los datos (`LOCALAPPDATA`) y el navegador van a una carpeta temporal, lo que
// no se aísla se tapa en la página (`GUARDA`), y el rollout que deja se borra al
// acabar. Abre una ventana «Adeorq · DESARROLLO» al fondo, sin foco. Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv[2] ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9700 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-codex-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const PROGRAMADOS = join(DATOS, "programados.json");
const CARPETA = tmpdir();
const TOCA_EN_MS = 45_000;
const EMPIEZA = Date.now();

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
    cwd: CARPETA,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
      ADEORQ_PROGRAMADOS: "1",
      // Su propio MCP: el Codex que nace hereda esto y su enlace habla con
      // ESTA app, no con la Adeorq de Munir por el 3012.
      ADEORQ_MCP_PUERTO: "39315",
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
  const inv = (cmd, args = {}) => js(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, inv, cerrar: () => ws.close() };
}

const encargo = () => JSON.parse(readFileSync(PROGRAMADOS, "utf8")).encargos[0];

/** Los rollouts que ha dejado ESTA prueba: posteriores al arranque, con nuestra
    carpeta en su cabecera y nuestro encargo dentro. Los de otra sesión no se
    tocan aunque compartan carpeta. */
function rolloutsDeLaPrueba() {
  const raiz = join(homedir(), ".codex", "sessions");
  const salida = [];
  const andar = (d) => {
    for (const e of existsSync(d) ? readdirSync(d) : []) {
      const p = join(d, e);
      const s = statSync(p);
      if (s.isDirectory()) andar(p);
      else if (e.startsWith("rollout-") && s.mtimeMs >= EMPIEZA) {
        const texto = readFileSync(p, "utf8");
        if (texto.split("\n")[0].includes(JSON.stringify(CARPETA).slice(1, -1)) && texto.includes("responde solo: hola")) salida.push(p);
      }
    }
  };
  andar(raiz);
  return salida;
}

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  mkdirSync(DATOS, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  const creado = Date.now() - 3_600_000 + TOCA_EN_MS;
  writeFileSync(
    PROGRAMADOS,
    JSON.stringify({
      version: 1,
      encargos: [
        { id: "pcodex", nombre: "Hola", encargo: "responde solo: hola", cwd: CARPETA, cli: "codex", cuando: { tipo: "cada", horas: 1 }, activo: true, creado, ultima: 0, ultimoDia: "", corrida: null, ultimas: [], fallosSeguidos: 0, cortado: null },
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

  // ------------------------------------------------------------ le toca, y nace un Codex
  const lanzado = await hasta(() => (encargo().corrida || encargo().ultimas.length ? encargo() : null), TOCA_EN_MS + 45_000, 1000);
  // Con tu Codex sin cuota, el freno lo salta (y eso es lo correcto): la prueba
  // no se puede hacer hasta que se renueve, y se dice en vez de dar un rojo.
  const sinCuota = /la cuenta iba por el (\d+) % de su cuota/.exec(lanzado?.ultimas?.[0]?.detalle ?? "");
  if (!lanzado?.corrida && sinCuota) {
    const l = await v.inv("usage_of", { provider: "codex", configDir: null }).catch(() => null);
    const renueva = Math.min(...(l?.lines ?? []).filter((x) => x.percent >= 85 && x.resetsAt).map((x) => x.resetsAt));
    console.log(`NO SE PUEDE PROBAR AHORA: tu Codex va por el ${sinCuota[1]} % y el freno lo salta, que es lo que debe hacer.`);
    if (Number.isFinite(renueva)) console.log(`Se renueva el ${new Date(renueva).toLocaleString("es-ES")}: lánzalo después.`);
    throw Object.assign(new Error("sin cuota de Codex"), { sinCuota: true });
  }
  dice(Boolean(lanzado?.corrida), `el reloj lo lanza (${JSON.stringify(lanzado?.corrida ?? lanzado?.ultimas?.[0])})`);
  const panel = lanzado?.corrida?.panel;
  const fichas = panel ? await v.inv("pty_vivas") : [];
  const suya = fichas.find((f) => f.id === panel);
  dice(Boolean(suya) && /codex/.test(JSON.stringify(suya)), `su terminal es la de un Codex (${JSON.stringify(suya)?.slice(0, 160)})`);

  // ------------------------------------------------------------ contesta, y la vuelta siguiente lo da por hecho
  const juzgado = await hasta(() => (encargo().ultimas.length ? encargo() : null), 240_000, 2000);
  const u = juzgado?.ultimas?.[0] ?? {};
  dice(u.resultado === "hecho" && juzgado?.fallosSeguidos === 0, `acaba apuntado como hecho (${u.resultado ?? "nada"}${u.detalle ? `: ${u.detalle}` : ""})`);
  if (panel) {
    const t = (await v.inv("pty_historial", { id: panel, bytes: 20000 })).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\s+/g, " ");
    dice(/hola/i.test(t), "y en su pantalla está la respuesta");
  }
  const rastro = existsSync(join(DATOS, "rastro.log")) ? readFileSync(join(DATOS, "rastro.log"), "utf8") : "";
  dice(!/programados: /.test(rastro), "el rastro no tiene ningún error del reloj");
  v.cerrar();
} catch (e) {
  if (e.sinCuota) fallos = -1;
  else dice(false, e.message);
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
  const sobras = rolloutsDeLaPrueba();
  for (const r of sobras) rmSync(r, { force: true });
  console.log(`(rollouts de la prueba borrados: ${sobras.length})`);
}

if (fallos < 0) process.exit(2);
console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
