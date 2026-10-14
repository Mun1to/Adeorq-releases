// El enjambre, con el PROGRAMA de verdad: su ventana, su Rust, su disco y dos
// terminales con un proceso dentro.
//
// `cargo test --lib conserje::` mira la reja y el contexto, `pnpm bancos
// enjambre` la cuenta y `enjambre.js` la cara con un doble. Esto junta las
// mitades por el puente real de Tauri (`docs/contexto/enjambres.md`):
//
//   1. cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   2. pnpm dev                                            (el binario de desarrollo carga de :1420)
//   3. node scripts/laboratorio/enjambre-de-verdad.mjs [ruta del .exe]
//
// Un tablero guardado trae dos terminales de Claude y un enjambre con las dos.
// Se comprueba que vuelve con sus filas, que Rust apunta el grupo en el disco,
// que lo escrito en la caja llega a Adeo con el estado de cada sesión, que lo
// que Adeo manda entra por el teclado de SU terminal y de ninguna otra, que la
// respuesta de esa sesión vuelve al hilo, que minimizar no mata ningún proceso
// y que deshacerlo borra el chat y deja las terminales. Y al final, con el
// tablero ya sin enjambre, lo que NO se junta: una consola soltada encima de
// una sesión y dos sesiones soltadas antes de tiempo dicen por qué.
//
// LO ÚNICO DE MENTIRA ES EL MODELO. El `claude` de esa casa es un programa de
// veinte líneas que se compila aquí: llamado con `-p` (Adeo) contesta en el
// formato de `SISTEMA_ENJAMBRE` mandándoselo a la primera sesión, y abierto en
// una terminal apunta en un fichero cada línea que le llega. Que el modelo de
// verdad reparta bien es otra prueba, la que sí gasta:
// `cargo test --lib el_enjambre_de_verdad -- --ignored --nocapture`.
//
// Abre una ventana «Adeorq · DESARROLLO» algo menos de un minuto y la maneja
// por dentro (el puerto de depuración del WebView): ni ratón ni teclado. Nada
// más nacer la manda al fondo sin darle el foco. Solo en Windows.
//
// No toca la Adeorq instalada, ni sus datos, ni ninguna sesión de nadie: la
// casa, los datos, el perfil del navegador y la carpeta temporal (donde Rust
// deja la configuración del MCP para `claude -p`) van a una carpeta propia.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
const PUERTO = 9700 + (process.pid % 100);
const BASE = join(tmpdir(), `adeorq-enjambre-${process.pid}`);
const DATOS = join(BASE, "datos", "Adeorq");
const CASA = join(BASE, "casa");
const PROYECTO = join(BASE, "proyectos", "tienda");
const CONV = "bancoenjambre1";
const SESIONES = { login: "aaaaaaaa-1111-4111-8111-111111111111", portada: "bbbbbbbb-2222-4222-8222-222222222222", pruebas: "cccccccc-3333-4333-8333-333333333333" };
const FOTO = "C:/proyectos/Adeorq/.playwright-mcp/enjambre-de-verdad.png";
// Como `encode_claude`: todo lo que no es letra ni número, un guion.
const transcript = (sid) => join(CASA, ".claude", "projects", PROYECTO.replace(/[^A-Za-z0-9]/g, "-"), `${sid}.jsonl`);

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
const leer = (ruta) => (existsSync(ruta) ? readFileSync(ruta, "utf8") : "");

// Si quien lanza esto corta la salida (`| head -8`), escribir en ella revienta
// y el proceso moría SIN pasar por el `finally`: la ventana de pruebas se
// quedaba abierta con sus dos terminales (pasó el 2026-10-13). Con esto la
// salida cortada se ignora y la limpieza se hace igual.
process.stdout.on("error", () => {});

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

/** Una línea del transcript de una sesión, como las escribe Claude Code. Lo
 *  que dice el agente lleva su modelo y su gasto: sin un `usage` en la cola,
 *  Adeorq no da ni el contexto ni el estado de esa sesión (`context_de`). */
function apuntar(sid, tipo, contenido, hace = 0) {
  const suyo = tipo === "assistant" ? { model: "claude-sonnet-4-5", usage: { input_tokens: 1200, cache_read_input_tokens: 38800, cache_creation_input_tokens: 0, output_tokens: 60 } } : {};
  const linea = { type: tipo, timestamp: new Date(Date.now() - hace * 1000).toISOString(), cwd: PROYECTO, sessionId: sid, isSidechain: false, message: { role: tipo, content: contenido, ...suyo } };
  appendFileSync(transcript(sid), `${JSON.stringify(linea)}\n`);
}
const dicho = (texto) => [{ type: "text", text: texto }];

/** El `claude` de esa casa. Con `-p` es Adeo: deja escrito lo que le llegó y
 *  contesta mandándoselo a la primera sesión del grupo. Sin él es una sesión:
 *  apunta su proceso y cada línea que entra por su teclado. */
const CLAUDE_DE_MENTIRA = `
use std::io::{BufRead, Write};
fn esc(s: &str) -> String { s.replace('\\\\', "\\\\\\\\").replace('"', "\\\\\\"").replace('\\n', "\\\\n") }
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let base = std::env::var("ADEORQ_BANCO").unwrap_or_default();
    if let Some(i) = args.iter().position(|a| a == "-p") {
        let prompt = args.get(i + 1).cloned().unwrap_or_default();
        // La app llama a \`claude -p\` para más cosas (la sonda de cuota, al
        // abrir): solo es Adeo quien llega con su papel escrito.
        if !prompt.contains("Eres ADEO") {
            println!("{{\\"type\\":\\"result\\",\\"is_error\\":true,\\"result\\":\\"claude de mentira\\"}}");
            return;
        }
        let _ = std::fs::write(format!("{base}/prompt-de-adeo.txt"), format!("{}\\n---\\n{}", args[1..].iter().filter(|a| *a != &prompt).cloned().collect::<Vec<_>>().join(" "), prompt));
        let panel = prompt.lines().skip_while(|l| !l.contains("SESIONES DEL ENJAMBRE"))
            .find_map(|l| l.strip_prefix("- panel ").and_then(|r| r.split(' ').next()).and_then(|n| n.parse::<u32>().ok())).unwrap_or(0);
        let pide = prompt.rsplit("## Lo que te dice Munir ahora\\n").next().unwrap_or("").trim().replace('"', "'").replace('\\n', " ");
        let acciones = format!("[{{\\"tipo\\":\\"escribir\\",\\"panel\\":{panel},\\"texto\\":\\"REESCRITO: {pide}\\"}}]");
        let texto = format!("Se lo mando a la primera.\\n<acciones>\\n{acciones}\\n</acciones>\\nRESUMEN: mandado al panel {panel}");
        println!("{{\\"type\\":\\"result\\",\\"is_error\\":false,\\"result\\":\\"{}\\"}}", esc(&texto));
        return;
    }
    let sid = args.iter().position(|a| a == "--session-id" || a == "--resume").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "sin-id".into());
    println!("claude de mentira: {}", args[1..].join(" "));
    let _ = std::fs::write(format!("{base}/pid-{sid}.txt"), std::process::id().to_string());
    for linea in std::io::stdin().lock().lines() {
        let Ok(l) = linea else { break };
        println!("recibido: {l}");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(format!("{base}/recibido-{sid}.txt")) { let _ = writeln!(f, "{l}"); }
    }
}
`;

function abrirApp() {
  // El `claude` de mentira, delante de todo lo demás. En Windows la variable se
  // llama `Path` o `PATH` según quién la puso: se quita la que haya y se pone una.
  const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !["path", "temp", "tmp"].includes(k.toLowerCase()) && !k.startsWith("CLAUDE")));
  const hijo = spawn(EXE, [], {
    cwd: PROYECTO,
    detached: true,
    stdio: "ignore",
    env: {
      ...entorno,
      Path: `${join(BASE, "bin")};${process.env.PATH ?? ""}`,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: CASA,
      // Rust deja en la carpeta temporal la configuración del MCP para cada
      // `claude -p`: con la de verdad, pisaría la de la Adeorq que esté abierta.
      TEMP: join(BASE, "tmp"),
      TMP: join(BASE, "tmp"),
      ADEORQ_BANCO: BASE.replace(/\\/g, "/"),
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

/** Lo que pinta la pieza, leído de la página. */
const PIEZA = `(() => {
  const e = document.querySelector(".rf-enjambre");
  if (!e) return null;
  const limpio = (x) => x?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
  return {
    nombre: limpio(e.querySelector(".enj-nombre")),
    color: e.getAttribute("data-color"),
    adeo: e.querySelector(".enj-head .mascota rect")?.getAttribute("fill"),
    recuento: limpio(e.querySelector(".enj-recuento")),
    filas: [...e.querySelectorAll(".enj-fila")].map((f) => ({
      panel: Number(f.getAttribute("data-panel")),
      estado: f.getAttribute("data-estado"),
      nombre: limpio(f.querySelector(".enj-fila-id strong")),
      detalle: limpio(f.querySelector(".enj-fila-id em")),
      adeo: !!f.querySelector(".mascota"),
      marca: !!f.querySelector(".enj-marca svg"),
    })),
    hilo: [...e.querySelectorAll(".enj-turno")].map((t) => t.getAttribute("data-rol") + (t.querySelector(".enj-turno-quien") ? " (" + limpio(t.querySelector(".enj-turno-quien")) + ")" : "") + ": " + limpio(t.querySelector(".enj-burbuja"))),
    aviso: limpio(e.querySelector(".enj-aviso")),
    ocultas: [...document.querySelectorAll(".react-flow__node-term")].filter((n) => getComputedStyle(n).visibility === "hidden").length,
    terminales: document.querySelectorAll(".react-flow__node-term").length,
  };
})()`;

let app = 0;
try {
  if (!existsSync(EXE)) throw new Error(`no está ${EXE}: compila antes con cargo build`);
  if (!(await fetch("http://localhost:1420").catch(() => null))) throw new Error("nadie sirve en :1420: lanza antes `pnpm dev`");

  for (const d of [PROYECTO, join(CASA, "AppData", "Local"), join(CASA, ".local", "bin"), join(transcript("x"), ".."), DATOS, join(BASE, "bin"), join(BASE, "tmp")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(DATOS, "raiz.txt"), join(BASE, "proyectos"));
  writeFileSync(join(PROYECTO, "LEEME.md"), "# tienda\n");
  // El claude de mentira, compilado aquí: uno donde lo busca Rust para `-p`
  // y otro delante en el PATH, que es el que arranca cada terminal.
  writeFileSync(join(BASE, "claude.rs"), CLAUDE_DE_MENTIRA);
  const compilado = spawnSync("rustc", ["-O", join(BASE, "claude.rs"), "-o", join(BASE, "bin", "claude.exe")], { encoding: "utf8", cwd: BASE });
  if (compilado.status !== 0) throw new Error(`no compila el claude de mentira: ${compilado.stderr.slice(0, 600)}`);
  copyFileSync(join(BASE, "bin", "claude.exe"), join(CASA, ".local", "bin", "claude.exe"));
  // Las dos sesiones, ya con algo dicho: han terminado su turno.
  for (const [nombre, sid] of Object.entries(SESIONES)) {
    apuntar(sid, "user", `mira lo de ${nombre}`, 120);
    apuntar(sid, "assistant", dicho(`Mirado lo de ${nombre}.`), 100);
  }

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
  // El tablero guardado: dos terminales de Claude y un enjambre con las dos.
  // Se escribe AHORA, con la app ya abierta y antes de recargar, para que las
  // terminales nazcan una sola vez.
  const term = (id, x, sid) => ({ tipo: "term", id, x, y: 0, w: 640, h: 420, kind: "claude", proyecto: "tienda", ruta: PROYECTO, cmd: ["cmd.exe", "/k", `claude --session-id ${sid}`] });
  writeFileSync(
    join(DATOS, "lienzo.json"),
    JSON.stringify({
      kind: "adeorq-lienzo",
      v: 1,
      guardado: new Date().toISOString(),
      proyecto: "tienda",
      nodos: [
        term("7", 0, SESIONES.login),
        term("9", 700, SESIONES.portada),
        // La tercera está en el tablero pero fuera del grupo: es la que se arrastra.
        term("11", 1400, SESIONES.pruebas),
        // Y una consola, debajo de la tercera: la que no entra en ningún enjambre.
        { tipo: "term", id: "13", x: 1400, y: 480, w: 640, h: 420, kind: "shell", proyecto: "tienda", ruta: PROYECTO, cmd: ["cmd.exe", "/k", "echo consola"] },
        { tipo: "enjambre", id: "j1", x: -480, y: 0, w: 440, h: 520, conv: CONV, nombre: "Los de la tienda", color: "verde", miembros: [{ nodo: "7" }, { nodo: "9" }], plegadas: false },
      ],
      flechas: [],
      trazos: [],
    }),
  );
  await v.enviar("Page.reload");
  await dormir(1500);
  v.cerrar();
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await hasta(() => v.js(`!!document.querySelector('[data-tab="lienzo"]')`), 20_000);
  await v.js(`document.querySelector('[data-tab="lienzo"]').click()`);
  const pieza = () => v.js(PIEZA);
  const cuando = (cond, ms = 12_000) => hasta(async () => {
    const p = await pieza();
    return p && cond(p) ? p : null;
  }, ms);

  // ------------------------------------------------------------ vuelve el tablero
  let p = await cuando((x) => x.filas.length === 2 && x.filas.every((f) => f.estado === "termino"), 30_000);
  dice(
    p?.nombre === "Los de la tienda" && p.filas.length === 2 && p.filas.every((f) => f.marca && f.detalle.startsWith("tienda")),
    `el tablero vuelve con su enjambre: «${p?.nombre}», ${p?.filas.length} filas (${p?.filas.map((f) => `panel ${f.panel} «${f.nombre}» ${f.detalle} · ${f.estado}`).join(" | ")})`,
  );
  // El color es del ENJAMBRE: se guardó verde y vuelve verde (no el azul del
  // primero que nace), con su Adeo en la cabecera y ninguno en las filas.
  dice(p?.color === "verde" && p.adeo === "#4fd08a" && p.filas.every((f) => !f.adeo), `vuelve con su color: el enjambre ${p?.color}, su Adeo ${p?.adeo} en la cabecera y las filas sin Adeo`);
  dice(!!p && p.filas.every((f) => f.panel !== 7 && f.panel !== 9) && p.recuento === "2 han terminado", `sus sesiones renacen con otro número de panel y se reconocen igual; arriba dice «${p?.recuento}»`);
  const pids = await hasta(() => {
    const l = Object.values(SESIONES).map((sid) => Number(leer(join(BASE, `pid-${sid}.txt`))));
    return l.every((x) => x > 0) ? l : null;
  }, 15_000);
  dice(!!pids && pids.every(vivo), `en cada terminal corre el claude de mentira con el id de su sesión (procesos ${pids?.join(" y ")})`);

  // ------------------------------------------------------------ lo que apunta Rust
  const disco = () => {
    try {
      return JSON.parse(leer(join(DATOS, "conserje", `${CONV}.json`)));
    } catch {
      return null;
    }
  };
  let c = await hasta(() => {
    const x = disco();
    return x?.enjambre && x.trabajos?.length === 2 && x.trabajos.every((w) => w.sesion) ? x : null;
  }, 15_000);
  dice(
    c?.enjambre === true && c.titulo === "Los de la tienda" && c.trabajos.every((w) => w.nombre && w.cli === "claude" && w.arranque > 0 && !("color" in w)) && c.trabajos.map((w) => w.sesion).join() === [SESIONES.login, SESIONES.portada].join(),
    `Rust apunta el grupo en el disco: enjambre «${c?.titulo}», ${c?.trabajos?.map((w) => `panel ${w.panel} «${w.nombre}»`).join(" y ")}`,
  );

  // ------------------------------------------------------------ escribir en la caja
  const ENCARGO = "que arregle el login con dos usuarios a la vez";
  await v.js(`(() => {
    const caja = document.querySelector(".rf-enjambre .enj-in");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(caja, ${JSON.stringify(ENCARGO)});
    caja.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await dormir(300);
  await v.js(`document.querySelector(".rf-enjambre .enj-enviar").click()`);
  const prompt = await hasta(() => leer(join(BASE, "prompt-de-adeo.txt")) || null, 20_000);
  const paneles = c?.trabajos.map((w) => w.panel) ?? [];
  dice(
    !!prompt && prompt.includes("Eres ADEO") && prompt.includes("== SESIONES DEL ENJAMBRE ==") && (prompt.match(/^- panel \d+ · «/gm) ?? []).length === 2 && /ha terminado, contexto al \d+ %/.test(prompt) && prompt.trim().endsWith(ENCARGO),
    `lo de la caja llega a Adeo con el papel de enjambre, las dos sesiones por su nombre, y cómo va cada una (${prompt?.match(/- panel .*/g)?.map((l) => l.replace(PROYECTO, "…")).join(" | ")})`,
  );
  dice(!!prompt && /--model haiku\b/.test(prompt.split("\n---\n")[0]), `Adeo piensa con Haiku si no se elige otro (${prompt?.split("\n---\n")[0].match(/--model \S+/)?.[0]})`);
  const recibido = (sid) => leer(join(BASE, `recibido-${sid}.txt`));
  const llego = await hasta(() => recibido(SESIONES.login).includes(`REESCRITO: ${ENCARGO}`), 15_000);
  dice(llego === true && recibido(SESIONES.portada) === "", `lo que Adeo manda entra por el teclado de SU terminal, entero y con su Intro, y la otra no recibe nada («${recibido(SESIONES.login).trim()}»)`);
  p = await cuando((x) => x.hilo.length >= 2);
  dice(p?.hilo[0] === `tu: ${ENCARGO}` && p.hilo[1] === "conserje (Adeo): Se lo mando a la primera." && !p.aviso, `el hilo del grupo: ${p?.hilo.join(" | ")}`);
  const lista = await v.inv("conserje_lista");
  dice(Array.isArray(lista) && !lista.some((f) => f.id === CONV), "el enjambre no sale en la lista de conversaciones del Chat (ni en el móvil, que lee la misma)");

  // ------------------------------------------------------------ la sesión contesta
  apuntar(SESIONES.login, "user", `REESCRITO: ${ENCARGO}`);
  apuntar(SESIONES.login, "assistant", dicho("Arreglado: el segundo usuario ya entra. Era el cerrojo de la sesión."));
  p = await cuando((x) => x.hilo.some((t) => t.startsWith("sesion")), 20_000);
  const suyo = p?.hilo.find((t) => t.startsWith("sesion"));
  c = disco();
  const turno = c?.turnos?.find((t) => t.rol === "sesion");
  dice(
    !!suyo && suyo.includes("Arreglado: el segundo usuario ya entra") && turno?.de === c.trabajos[0].nombre && paneles.length === 2,
    `lo que contesta esa sesión vuelve al hilo con su nombre (${suyo}; en el disco, de «${turno?.de}»)`,
  );
  await dormir(6000);
  dice((await pieza())?.hilo.filter((t) => t.startsWith("sesion")).length === 1, "y no se repite aunque se la siga mirando");

  // ------------------------------------------------------------ minimizar
  await v.js(`document.querySelector(".rf-enjambre .enj-head .enj-mini").click()`);
  p = await cuando((x) => x.ocultas === 2);
  dice(p?.ocultas === 2 && !!pids && pids.every(vivo), `minimizar esconde las dos terminales y sus procesos siguen vivos (${p?.ocultas} de ${p?.terminales} ocultas)`);
  const guardado = await hasta(() => {
    try {
      const e = JSON.parse(leer(join(DATOS, "lienzo.json"))).nodos.find((n) => n.tipo === "enjambre");
      return e?.plegadas ? e : null;
    } catch {
      return null;
    }
  }, 10_000);
  dice(guardado?.plegadas === true && guardado.miembros.length === 2 && guardado.conv === CONV && guardado.color === "verde", `el tablero se guarda con el enjambre minimizado, su color y sus dos sesiones (${guardado?.color}: ${guardado?.miembros.map((m) => m.nodo).join(" y ")})`);
  await v.js(`document.querySelector(".rf-enjambre .enj-head .enj-mini").click()`);
  p = await cuando((x) => x.ocultas === 0);
  const foto = await v.enviar("Page.captureScreenshot", { format: "png" });
  mkdirSync("C:/proyectos/Adeorq/.playwright-mcp", { recursive: true });
  writeFileSync(FOTO, Buffer.from(foto.data, "base64"));
  dice(p?.ocultas === 0, "y enseñarlas las devuelve a la vista");

  // ------------------------------------------------------------ arrastrar una terminal
  // El ratón es el del protocolo de depuración: entra en la página, no mueve
  // el puntero de nadie. La tercera terminal se coge por su cabecera, se lleva
  // encima del enjambre y se aguanta hasta que se enciende.
  await v.js(`document.querySelector(".react-flow__controls-fitview")?.click()`);
  await dormir(1200);
  const caja = (sel) => v.js(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
  const raton = (type, x, y) => v.enviar("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  // Fuera del grupo hay dos: la tercera sesión y, debajo de ella, la consola.
  const [tercera, consola] = await v.js(`[...document.querySelectorAll(".react-flow__node-term")]
    .filter((n) => !document.querySelector('.enj-fila[data-panel="' + n.getAttribute("data-id") + '"]'))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map((n) => n.getAttribute("data-id"))`);
  const asa = await caja(`.react-flow__node-term[data-id="${tercera}"] .pane-head`);
  const tarjeta = await caja(".rf-enjambre");
  const antesDeArrastrar = await caja(`.react-flow__node-term[data-id="${tercera}"]`);
  let encendida = false;
  if (asa && tarjeta) {
    const desde = { x: asa.x + 70, y: asa.y + asa.h / 2 };
    const destino = { x: tarjeta.x + 75, y: tarjeta.y + asa.h / 2 + 6 };
    await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: desde.x, y: desde.y });
    await raton("mousePressed", desde.x, desde.y);
    // Un primer paso corto: el arrastre de una pieza empieza a contar en el
    // primer movimiento, y si ese es un salto de ochenta píxeles la terminal
    // se queda ochenta píxeles por detrás del puntero.
    await raton("mouseMoved", desde.x - 3, desde.y + 3);
    await dormir(40);
    for (let i = 1; i <= 14; i++) {
      await raton("mouseMoved", desde.x + ((destino.x - desde.x) * i) / 14, desde.y + ((destino.y - desde.y) * i) / 14);
      await dormir(25);
    }
    encendida = !!(await hasta(() => v.js(`!!document.querySelector(".react-flow__node.enj-diana")`), 3000, 100));
    await raton("mouseReleased", destino.x, destino.y);
  }
  p = await cuando((x) => x.filas.length === 3, 8000);
  c = await hasta(() => (disco()?.trabajos?.length === 3 ? disco() : null), 8000);
  const despuesDeArrastrar = await caja(`.react-flow__node-term[data-id="${tercera}"]`);
  const enSuSitio = !!antesDeArrastrar && !!despuesDeArrastrar && Math.abs(antesDeArrastrar.x - despuesDeArrastrar.x) < 3 && Math.abs(antesDeArrastrar.y - despuesDeArrastrar.y) < 3;
  dice(
    encendida && p?.filas.length === 3 && c?.trabajos?.some((w) => w.sesion === SESIONES.pruebas) && enSuSitio,
    `aguantar la tercera terminal encima del enjambre lo enciende, y soltarla la mete: ${p?.filas.length} filas, Rust la apunta y ella vuelve a su sitio (encendida: ${encendida}, en su sitio: ${enSuSitio})`,
  );

  // ------------------------------------------------------------ deshacer
  await v.js(`document.querySelector(".rf-enjambre .enj-x").click()`);
  await dormir(400);
  const armada = await v.js(`!!document.querySelector(".rf-enjambre .enj-x[data-armada]")`);
  await v.js(`document.querySelector(".rf-enjambre .enj-x[data-armada]")?.click()`);
  const ido = await hasta(async () => (await pieza()) === null && !existsSync(join(DATOS, "conserje", `${CONV}.json`)), 10_000);
  const quedan = await v.js(`[...document.querySelectorAll(".react-flow__node-term")].filter((n) => getComputedStyle(n).visibility !== "hidden").length`);
  dice(armada && ido === true && quedan === 4 && !!pids && pids.every(vivo), `deshacerlo pide dos toques, borra el chat del grupo del disco y deja las ${quedan} terminales vivas y a la vista`);

  // ------------------------------------------------------------ lo que no se junta lo dice
  // Munir, 2026-10-13: «arrastro las sesiones que tengo en el lienzo una encima
  // de otra y no pasa absolutamente nada». Su tablero tenía dos consolas y una
  // sola sesión de agente, y ningún enjambre: como queda este ahora.
  await v.js(`document.querySelector(".react-flow__controls-fitview")?.click()`);
  await dormir(1200);
  const nota = () => v.js(`document.querySelector(".relay-note")?.textContent ?? ""`);
  const enjambres = () => v.js(`document.querySelectorAll(".react-flow__node-enjambre").length`);
  /** Coge una terminal por su cabecera, la deja encima de otra, aguanta y
   *  suelta. Devuelve si la de debajo llegó a encenderse. */
  const llevar = async (de, a, pasos, aguanta) => {
    const asaDe = await caja(`.react-flow__node-term[data-id="${de}"] .pane-head`);
    const suya = await caja(`.react-flow__node-term[data-id="${de}"]`);
    const otra = await caja(`.react-flow__node-term[data-id="${a}"]`);
    if (!asaDe || !suya || !otra) return null;
    const desde = { x: asaDe.x + 70, y: asaDe.y + asaDe.h / 2 };
    const fin = { x: desde.x + otra.x - suya.x + 8, y: desde.y + otra.y - suya.y + 8 };
    await v.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x: desde.x, y: desde.y });
    await raton("mousePressed", desde.x, desde.y);
    await raton("mouseMoved", desde.x - 3, desde.y + 3);
    await dormir(40);
    for (let i = 1; i <= pasos; i++) await raton("mouseMoved", desde.x + ((fin.x - desde.x) * i) / pasos, desde.y + ((fin.y - desde.y) * i) / pasos);
    await dormir(aguanta);
    const seEnciende = await v.js(`!!document.querySelector(".react-flow__node.enj-diana")`);
    await raton("mouseReleased", fin.x, fin.y);
    return { seEnciende };
  };
  // La consola, aguantada un segundo encima de la tercera sesión: el doble de
  // lo que tarda en encenderse una sesión.
  const conConsola = await llevar(consola, tercera, 10, 1000);
  const dichoConsola = await hasta(async () => ((await nota()).includes("Una consola no entra en un enjambre") ? nota() : null), 4000);
  dice(
    conConsola?.seEnciende === false && !!dichoConsola && (await enjambres()) === 0,
    `una consola aguantada encima de una sesión no enciende nada, y al soltarla no se juntan y se dice por qué («${dichoConsola ?? (await nota())}»)`,
  );
  // Dos sesiones, soltadas nada más llegar: sí pueden juntarse, pero falta aguantar.
  const [una, otra] = paneles.map(String);
  const conPrisa = await llevar(una, otra, 4, 0);
  const dichoPrisa = await hasta(async () => ((await nota()).includes("aguanta la terminal encima") ? nota() : null), 4000);
  dice(
    conPrisa?.seEnciende === false && !!dichoPrisa && (await enjambres()) === 0,
    `dos sesiones soltadas antes de tiempo tampoco se juntan, y se dice cómo («${dichoPrisa ?? (await nota())}»)`,
  );
  const fotoAviso = await v.enviar("Page.captureScreenshot", { format: "png" });
  writeFileSync(FOTO.replace(".png", "-aviso.png"), Buffer.from(fotoAviso.data, "base64"));
  v.cerrar();
} catch (e) {
  dice(false, e.message);
} finally {
  // Con su árbol: las consolas del tablero cuelgan de la app.
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
