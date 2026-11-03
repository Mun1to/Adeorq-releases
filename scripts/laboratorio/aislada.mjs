// Una Adeorq aislada para los laboratorios de verdad: el binario de desarrollo
// con su casa, sus datos y su navegador de usar y tirar, manejada por el
// protocolo de depuración de su WebView, sin ratón ni teclado.
//
// Salió de copiar lo mismo en tres laboratorios (`rastro-de-verdad.mjs`,
// `de-quien-de-verdad.mjs` y `carceles-por-pantallas.mjs`). Lo que no aísla y
// cómo se tapa está en la memoria «binario aislado para probar»; aquí va hecho:
//   - la ventana al fondo y sin foco al nacer (mirando antes que es la MÍA);
//   - `GUARDA`: el estado de la barra (que vive en la carpeta de la app y es el
//     de Munir), sus claves, lo que suena en su equipo y el actualizador se
//     contestan desde la página;
//   - el MCP en su propio puerto, no en el 3012;
//   - al cerrar, el navegador que no cuelga del árbol de la app se mata por su
//     ruta, y la carpeta se borra cuando se suelta.
//
// Con `LAB_TERMINALES_APARTE=1` (o `aparte: true`) las terminales corren en su
// proceso aparte (`terminales.rs`, `adeorq.exe --terminales`), como en la
// Adeorq publicada de Windows; en desarrollo van dentro de la app.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const EXE = "C:\\ct\\debug\\adeorq.exe";
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function hasta(fn, ms, cada = 300) {
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

/** La ventana de pruebas al fondo y sin foco, mirando antes que es la MÍA. */
function alFondo(pid, exe) {
  const guion = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${exe.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
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
async function ventana(depurar) {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${depurar}/json/list`)).json();
    // La de desarrollo carga de :1420; la empaquetada (`csp-ventana.mjs`), de tauri.localhost.
    return lista.find((t) => t.type === "page" && /localhost:1420|\/\/tauri\.localhost\//.test(t.url));
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

/**
 * Abre una Adeorq aislada y la deja montada, sin bienvenida, con el MCP
 * atendiendo. Devuelve la ventana (`v`), su carpeta de proyecto de ejemplo
 * (`demo`), cómo presentarse como un agente (`puente`), cómo fotografiar un
 * trozo (`foto`) y `cerrar`, que hay que llamar siempre (en un `finally`).
 *
 * Opcionales: `exe`, otro binario (una copia fuera de C:\ct, para que otra
 * sesión pueda recompilar mientras tanto); `raiz`, la carpeta de proyectos
 * que lista (solo la lista); `sembrar(datos)`, lo que haya que dejar en su
 * carpeta de datos antes de que arranque; `guarda`, más código que se
 * ejecuta en la página detrás de `GUARDA` (puede envolver otra vez `fetch`); y
 * `entorno`, variables de más para la app (`ADEORQ_NAVEGADOR_LABORATORIO`).
 *
 * Con `aparte`, las terminales van en su proceso aparte: el fichero
 * `terminales\encendido` se escribe antes de arrancar (se lee en `setup`), con
 * un canal propio, y la app corre desde una copia del ejecutable en su carpeta,
 * porque el proceso de terminales se lanza desde el ejecutable de la app: así
 * no coge `C:\ct\debug` (nadie podría recompilar) y `cerrar` lo encuentra por
 * su ruta. Si la app no se engancha al proceso, `abrirAislada` falla: de lo
 * contrario seguiría con las terminales dentro y daría un verde que no es.
 * `motor()` dice el pid del proceso y las terminales que cuelgan de él.
 */
export async function abrirAislada({ nombre, puertoMcp, depurar, fotos = tmpdir(), exe = EXE, raiz, sembrar, guarda = "", entorno = {}, aparte = process.env.LAB_TERMINALES_APARTE === "1", fueraConTodo = true }) {
  const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
  const demo = join(base, "proyectos", "demo");
  const proyectos = raiz ?? join(base, "proyectos");
  const canal = `lab-${nombre}-${process.pid}`;
  mkdirSync(join(base, "datos", "Adeorq"), { recursive: true });
  mkdirSync(join(base, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(demo, { recursive: true });
  writeFileSync(join(base, "datos", "Adeorq", "raiz.txt"), proyectos);
  // Un laboratorio habla por el puerto desde fuera de una terminal de Adeorq, y
  // lo de fuera solo mira y abre (`mcp_clientes::FUERA`): nace subido, salvo que
  // lo que se mida sea justo esa puerta (`fueraConTodo: false`).
  if (fueraConTodo) writeFileSync(join(base, "datos", "Adeorq", "mcp_clientes.json"), JSON.stringify({ niveles: { fuera: "auto" } }));
  if (aparte) {
    mkdirSync(join(base, "datos", "Adeorq", "terminales"), { recursive: true });
    writeFileSync(join(base, "datos", "Adeorq", "terminales", "encendido"), "1");
    mkdirSync(join(base, "bin"), { recursive: true });
    copyFileSync(exe, join(base, "bin", "adeorq.exe"));
    exe = join(base, "bin", "adeorq.exe");
  }
  sembrar?.(join(base, "datos", "Adeorq"));
  const env = {
    ...process.env,
    LOCALAPPDATA: join(base, "datos"),
    USERPROFILE: join(base, "casa"),
    WEBVIEW2_USER_DATA_FOLDER: join(base, "navegador"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${depurar} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
    ADEORQ_MCP_PUERTO: String(puertoMcp),
    ADEORQ_TERMINALES_CANAL: canal,
    ...entorno,
  };
  // Lanzado desde un panel de Adeorq, el entorno trae el número de ESE panel.
  delete env.ADEORQ_PANE_ID;

  const lanzar = () => {
    const hijo = spawn(exe, [], { cwd: demo, detached: true, stdio: "ignore", env });
    hijo.unref();
    return hijo.pid;
  };
  let app = lanzar();
  let v;
  const puentes = [];

  /** El proceso de terminales de esta pasada: su pid (0 si no hay uno vivo
   *  que corra MI copia), cuántas consolas cuelgan de él (`terminales`) y
   *  cuántas de la app (`enLaApp`), que con el proceso aparte son cero. */
  const motor = () => {
    let pid = 0;
    try {
      pid = JSON.parse(readFileSync(join(base, "datos", "Adeorq", "terminales", `${canal}.json`), "utf8")).pid ?? 0;
    } catch {}
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
      $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      $ruta = if ($p) { $p.Path } else { '' }
      $consola = '^(cmd|powershell|pwsh)\\.exe$'
      $suyas = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Where-Object { $_.Name -match $consola }).Count
      $dentro = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${app}" | Where-Object { $_.Name -match $consola }).Count
      "$ruta|$suyas|$dentro"
    `], { encoding: "utf8" });
    const [ruta, suyas, dentro] = (r.stdout ?? "").trim().split("|");
    const mio = pid > 0 && ruta?.toLowerCase() === exe.toLowerCase();
    return { pid: mio ? pid : 0, terminales: mio ? Number(suyas) : 0, enLaApp: Number(dentro) || 0 };
  };
  const enganchada = async () => {
    if (!aparte) return;
    const m = await hasta(() => (motor().pid ? true : null), 15_000, 500);
    if (!m) throw new Error("la app no lanzó su proceso de terminales: con las terminales dentro, el laboratorio no prueba lo que dice");
  };

  /** Un agente: el puente `--mcp` de verdad, presentándose como el panel `yo`
   *  (o sin panel, con `null`). */
  const puente = (yo) => {
    const suyo = { ...env };
    if (yo != null) suyo.ADEORQ_PANE_ID = String(yo);
    const p = spawn(exe, ["--mcp"], { env: suyo });
    puentes.push(p);
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
  };

  const cerrar = async () => {
    for (const p of puentes) p.kill();
    v?.cerrar();
    spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
    // Su navegador no cuelga del árbol de la app: queda uno vivo con la carpeta
    // cogida (medido el 2026-10-17). Es nuestro por la ruta, que es de esta pasada.
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${base.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: "ignore" });
    // Y aun muerto, su carpeta tarda a veces más de veinte segundos en soltarse.
    const borrada = await hasta(() => {
      rmSync(base, { recursive: true, force: true });
      return true;
    }, 45_000, 1000);
    if (!borrada) console.log(`      no pude borrar ${base}: bórrala a mano`);
  };

  try {
    if (!(await hasta(() => alFondo(app, exe), 12_000, 200))) throw new Error("la ventana de pruebas no salió (o no es la mía)");
    v = await ventana(depurar);
    await v.enviar("Page.enable");
    await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: guarda ? `${GUARDA};\n${guarda}` : GUARDA });
    // Sin la bienvenida: la app entera montada, que es donde vive el oyente del MCP.
    await v.js(`localStorage.setItem("adeorq-lang", "es"); localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: proyectos, sinRaiz: false, extras: [], leerSesiones: false, clis: [], hecho: true, tour: true }),
    )}); "ok"`);
    await v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await hasta(() => {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", `if (Get-NetTCPConnection -LocalPort ${puertoMcp} -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]);
      return r.status === 0;
    }, 30_000, 500);
    await dormir(2000);
    await v.enviar("DOM.enable");
    await v.enviar("CSS.enable");
    await enganchada();
  } catch (e) {
    await cerrar();
    throw e;
  }

  const foto = async (rect, archivo) => {
    const r = await v.enviar("Page.captureScreenshot", { format: "png", ...(rect ? { clip: { ...rect, scale: rect.width > 1200 ? 1 : 2 } } : {}) });
    const ruta = join(fotos, archivo);
    writeFileSync(ruta, Buffer.from(r.data, "base64"));
    return ruta;
  };

  /** Cerrar la app como su «Salir» (`cierre_salir`: sus terminales mueren con
   *  ella) y volver a abrirla con la MISMA casa, datos y navegador, que es lo
   *  que hace Munir al reiniciar. Los puentes viejos se cierran; la ventana
   *  nueva queda en `aislada.v`. Con `actualizando`, como la tarjeta de
   *  actualizar (`terminales_por_actualizar` antes de irse): con el proceso
   *  aparte las terminales no mueren y la app que vuelve las recoge. */
  const reiniciar = async ({ actualizando = false } = {}) => {
    for (const p of puentes.splice(0)) p.kill();
    if (actualizando) await v.js(`window.__TAURI_INTERNALS__.invoke("terminales_por_actualizar")`);
    // La respuesta no llega nunca: la ventana se va con la app.
    await Promise.race([v.js(`window.__TAURI_INTERNALS__.invoke("cierre_salir").then(() => "ok", () => "ok")`).catch(() => {}), dormir(3000)]);
    v.cerrar();
    const vivo = () => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `if (Get-Process -Id ${app} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]).status === 0;
    // Sin `/T` al actualizar: el proceso de terminales cuelga de la app y se iría con ella.
    if (!(await hasta(() => !vivo(), 20_000, 300))) spawnSync("taskkill", ["/PID", String(app), ...(actualizando ? [] : ["/T"]), "/F"], { stdio: "ignore" });
    // Su navegador suelta la carpeta un rato después de que la app se vaya.
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${join(base, "navegador").replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: "ignore" });
    await dormir(1500);
    app = lanzar();
    if (!(await hasta(() => alFondo(app, exe), 12_000, 200))) throw new Error("la ventana de pruebas no volvió (o no es la mía)");
    v = await ventana(depurar);
    aislada.v = v;
    await v.enviar("Page.enable");
    await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: guarda ? `${GUARDA};\n${guarda}` : GUARDA });
    // El guion de guarda entra en la siguiente carga, no en la que ya corre.
    await v.enviar("Page.reload");
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
    await hasta(() => {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", `if (Get-NetTCPConnection -LocalPort ${puertoMcp} -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]);
      return r.status === 0;
    }, 30_000, 500);
    await dormir(2000);
    await enganchada();
    return v;
  };

  const aislada = { v, base, demo, env, puente, foto, cerrar, reiniciar, aparte, motor };
  return aislada;
}

/** Lo que ve `carceles.js` (el detector de la casa) dentro de `ambito`
 *  (".pane-head", ".topbar"…), o en la página entera con `null`: `fallos`, las
 *  cárceles, y `aprobadas`, las que Munir dijo que se quedan (su lista vive en
 *  el propio detector). */
export async function carceles(v, ambito = null) {
  const r = await detector("carceles.js", v, ambito);
  return { fallos: r.fallos, aprobadas: r.aprobadas ?? [] };
}

/** Lo que ve `mayusculas.js` (los rótulos en MAYÚSCULAS ESPACIADAS) dentro de
 *  `ambito`, o en la página entera con `null`: `fallos`. */
export async function mayusculas(v, ambito = null) {
  const r = await detector("mayusculas.js", v, ambito);
  return { fallos: r.fallos };
}

/** Un detector de la casa (un `async (page) =>` de esta carpeta que mira la
 *  pantalla), acotado a `ambito` cambiándole el `body *` por el que toque. */
async function detector(nombre, v, ambito) {
  let src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), nombre), "utf8");
  if (ambito) {
    const antes = src;
    src = src.replace('document.querySelectorAll("body *")', `document.querySelectorAll("${ambito}, ${ambito} *")`);
    if (src === antes) throw new Error(`${nombre} ya no recorre «body *»: hay que volver a acotarlo`);
  }
  const guion = (0, eval)(src);
  return guion({ evaluate: (fn) => v.js(`(${fn.toString()})()`) });
}

/** Cómo queda la primera pieza que case con `selector` con el ratón encima,
 *  forzado por el navegador (sin mover el ratón de nadie). */
export async function conRatonEncima(v, selector) {
  const mira = `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const cs = getComputedStyle(e); return { fondo: cs.backgroundColor + " " + cs.backgroundImage, borde: cs.borderTopStyle === "none" || parseFloat(cs.borderTopWidth) === 0 || cs.borderTopColor.endsWith(", 0)") ? "none" : cs.borderTopStyle + " " + cs.borderTopColor, sombra: cs.boxShadow, mueve: cs.transform, color: cs.color }; })()`;
  const antes = await v.js(mira);
  const { root } = await v.enviar("DOM.getDocument", { depth: 0 });
  const { nodeId } = await v.enviar("DOM.querySelector", { nodeId: root.nodeId, selector });
  if (!nodeId || !antes) return null;
  await v.enviar("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] });
  await dormir(400);
  const encima = await v.js(mira);
  await v.enviar("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
  // Que vuelva de su transición antes de la foto que venga detrás.
  await dormir(400);
  return { antes, encima };
}

/** Si con el ratón encima solo cambió el color: sin fondo, borde, sombra ni salto. */
export const sueltoEncima = (r) =>
  !!r && /^rgba\(0, 0, 0, 0\) none$/.test(r.encima.fondo) && r.encima.borde === "none" && r.encima.sombra === "none" && r.encima.mueve === "none" && r.encima.color !== r.antes.color;
