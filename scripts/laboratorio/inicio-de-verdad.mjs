// La pestaña de inicio (`PanelView.tsx`) dentro de la app de verdad: el WebView2
// de Tauri, su CSS entero y Rust contestando los proyectos y sus logos.
//
// Lo que mira:
//   · Adeo, el saludo y la frase de lo que hay en marcha; con una sesión que
//     te pregunta algo, esa frase cambia por su aviso con «Contestar».
//   · Tus proyectos: primero el que te espera, luego los que tienen a alguien
//     dentro y luego por lo último; «Ver los N» y «Nuevo proyecto».
//   · Tu uso: la cifra del mes, la línea de hoy, racha y récord, y las casillas
//     llenando el ancho de su tarjeta (Munir: «que se rellenasen los
//     cuadraditos»). Las dos tarjetas con su sombra de globo.
//   · La caja: lo que escribes llega al Chat, a una conversación nueva del
//     conserje que lo manda sola (`dejarPedido` → `tomarPedido`).
//   · Sin cárceles ni mayúsculas espaciadas (los mismos guiones del banco), y en
//     inglés sin restos en español.
//
// Las sesiones y el uso los contesta la guarda (la casa de pruebas no tiene
// conversaciones): inventados por defecto, o los de un fichero con
// `--datos <json>` ({ sesiones: SessionInfo[], cubos: Cubo[], espera: id }).
// Los proyectos salen de una carpeta de pruebas, o de `--raiz <carpeta>`, que
// Rust solo LEE (nombres y logos).
//
//   1. Un binario de desarrollo que cargue de :1490 (el :1420 suele ser de otra
//      sesión):
//        TAURI_CONFIG='{"build":{"devUrl":"http://127.0.0.1:1490"}}' cargo build --manifest-path src-tauri/Cargo.toml
//      copiado fuera de C:\ct, y después `cargo build` otra vez SIN la variable,
//      para que el de C:\ct vuelva a cargar del :1420 que esperan las demás.
//   2. node scripts/laboratorio/inicio-de-verdad.mjs <adeorq.exe> [--fotos <carpeta>] [--raiz <carpeta>] [--datos <json>]
//
// Levanta él mismo el Vite del :1490, abre una ventana «Adeorq · DESARROLLO»
// un minuto, la manda al fondo sin foco nada más nacer y la maneja por el puerto
// de depuración: ni ratón ni teclado. La casa, los datos, el navegador y el MCP
// son de pruebas (como `tarjeta-de-verdad.mjs`). Solo en Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXE = process.argv[2] && resolve(process.argv[2]);
const opcion = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? resolve(process.argv[i + 1]) : null;
};
const FOTOS = opcion("--fotos");
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const PUERTO = 9700 + (process.pid % 100);
const BASE = join(tmpdir(), "adeorq-inicio", String(process.pid));
const DATOS = join(BASE, "datos", "Adeorq");
const PROYECTOS = opcion("--raiz") ?? join(BASE, "proyectos");

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
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

/* ── Los datos que contesta la guarda ─────────────────────────────────────── */

/** Una semana inventada: cuatro proyectos, dos sesiones vivas y medio año de uso. */
function inventados() {
  const ahora = Math.floor(Date.now() / 1000);
  const nombres = ["Faro", "Mareas", "Brújula", "Ancla"];
  for (const n of [...nombres, "Quilla", "Velamen"]) mkdirSync(join(PROYECTOS, n), { recursive: true });
  const sesion = (id, title, project, haceMin, live) => ({
    id, title, state: live ? "a_medias" : "", fresh: "activa", hours: haceMin / 60, mtime: ahora - haceMin * 60, ago: "",
    cwd: join(PROYECTOS, project), resumeCwd: join(PROYECTOS, project), project, folder: "", live, sizeKb: 300,
    agentsLive: 0, agentsTotal: 0, fuente: "claude", cuenta: "",
  });
  const sesiones = [
    sesion("s1", "El faro de la portada", "Faro", 1, true),
    sesion("s2", "Mareas: la tabla de horarios", "Mareas", 2, true),
    sesion("s3", "Brújula: el norte del mapa", "Brújula", 300, false),
    sesion("s4", "Ancla: copias de seguridad", "Ancla", 60 * 30, false),
  ];
  const cubos = [];
  for (let d = 0; d < 200; d++) {
    if (d % 7 === 5) continue;
    const dia = new Date(Date.now() - d * 86_400_000);
    const hora = `${dia.toISOString().slice(0, 10)}T12`;
    const n = 20_000_000 + ((d * 7_919) % 13) * 60_000_000;
    cubos.push({ hora, cli: "claude", modelo: "claude-opus-5", carpeta: join(PROYECTOS, nombres[d % 4]), entrada: 1000, salida: 50_000, cacheLeida: n, cacheEscrita: 200_000, respuestas: 40 });
  }
  return { sesiones, cubos, espera: "s2" };
}

const datosDe = opcion("--datos");
const DOBLE = datosDe ? JSON.parse(readFileSync(datosDe, "utf8")) : null;

const ps = (guion) =>
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", guion], { encoding: "utf8" });

function abrirApp() {
  const hijo = spawn(EXE, [], {
    cwd: BASE,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LOCALAPPDATA: join(BASE, "datos"),
      USERPROFILE: join(BASE, "casa"),
      ADEORQ_MCP_PUERTO: String(PUERTO + 1000),
      WEBVIEW2_USER_DATA_FOLDER: join(BASE, "navegador"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PUERTO} --remote-allow-origins=* --disable-features=CalculateNativeWinOcclusion`,
    },
  });
  hijo.unref();
  return hijo.pid;
}

/** La ventana de MI proceso, al fondo y sin foco. Comprueba antes que es la mía. */
function alFondo(pid) {
  return (
    ps(`
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if (-not $p -or $p.Path -ne '${EXE.replace(/'/g, "''")}' -or $p.MainWindowHandle -eq 0) { exit 1 }
    Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);'
    [void][W.U]::SetWindowPos($p.MainWindowHandle, [IntPtr]1, 0, 0, 0, 0, 0x0013)
  `).status === 0
  );
}

/** Lo que la casa de pruebas no aísla, tapado; y las sesiones, el uso y el
    conserje, contestados con los datos de la prueba (`window.__dobleInicio`). */
const GUARDA = `(() => {
  const real = window.fetch.bind(window);
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  window.__pedidos = [];
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/supabase\\.co|openrouter\\.ai/.test(url)) return Promise.reject(new TypeError("Failed to fetch"));
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "updater" && plugin[2] === "check") return responde(null);
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    const d = window.__dobleInicio;
    if (d && m && m[1] === "scan_sessions") {
      const esperando = localStorage.getItem("prueba-espera") === "1";
      return responde(d.sesiones.map((s) => (esperando && s.id === d.espera ? { ...s, state: "pregunta" } : s)));
    }
    if (d && m && m[1] === "uso_historia") return responde({ cubos: d.cubos, archivos: 1 });
    if (m && m[1] === "conserje_enviar") {
      try { window.__pedidos.push(JSON.parse(b && b.body)); } catch { window.__pedidos.push(String(b && b.body)); }
      return responde({ texto: "Hecho.", acciones: [], descartes: [] });
    }
    if (m && ["media_now", "secret_get", "secret_put", "secret_forget", "openrouter_info", "save_ui_state", "discord_set", "discord_clear"].includes(m[1])) return responde(null);
    if (m && m[1] === "load_ui_state") return responde("{}");
    return real(a, b);
  };
})()`;

async function ventana() {
  const destino = await hasta(async () => {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    return lista.find((t) => t.type === "page" && t.url.includes("127.0.0.1:1490"));
  }, 30_000);
  if (!destino) throw new Error("la ventana no abrió su puerto de depuración (¿el .exe carga de :1490?)");
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
  const js = async (expr, ms = 60_000) => {
    let reloj;
    const tope = new Promise((_, mal) => (reloj = setTimeout(() => mal(new Error(`la página no contesta en ${ms / 1000} s`)), ms)));
    const r = await Promise.race([enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }), tope]).finally(() => clearTimeout(reloj));
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await hasta(() => js("!!window.__TAURI_INTERNALS__"), 20_000);
  return { enviar, js, cerrar: () => ws.close() };
}

/** Los guiones del banco (`async (page) => …`) sobre esta ventana: solo usan `evaluate`. */
async function guion(v, ruta) {
  const fn = (0, eval)(`(${readFileSync(ruta, "utf8")})`);
  const page = { evaluate: (f, arg) => v.js(`(${f.toString()})(${arg === undefined ? "" : JSON.stringify(arg)})`) };
  return fn(page);
}

async function foto(v, nombre) {
  if (!FOTOS) return;
  const { data } = await v.enviar("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(FOTOS, nombre), Buffer.from(data, "base64"));
}

async function recargar(v, lang, espera) {
  await v.js(`(() => {
    localStorage.setItem("adeorq-lang", ${JSON.stringify(lang)});
    localStorage.setItem("prueba-espera", ${JSON.stringify(espera ? "1" : "0")});
  })()`);
  await v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => v.js("!!document.querySelector('.panel.inicio .inicio-anio span')"), 30_000);
  await dormir(600);
}

let app = 0;
let vite = null;
try {
  if (!EXE || !existsSync(EXE)) throw new Error("uso: node scripts/laboratorio/inicio-de-verdad.mjs <adeorq.exe que carga de :1490> (ver la cabecera)");
  mkdirSync(join(BASE, "casa", "AppData", "Local"), { recursive: true });
  mkdirSync(DATOS, { recursive: true });
  const datos = DOBLE ?? inventados();
  writeFileSync(join(DATOS, "raiz.txt"), PROYECTOS);

  vite = await createServer({
    root: RAIZ,
    configFile: join(RAIZ, "vite.config.ts"),
    cacheDir: join(BASE, "vite"),
    logLevel: "error",
    clearScreen: false,
    server: { host: "127.0.0.1", port: 1490, strictPort: true, hmr: false },
  });
  await vite.listen();

  app = abrirApp();
  if (!(await hasta(() => alFondo(app), 15_000, 200))) throw new Error("la ventana de pruebas no se dejó mandar al fondo: se para antes de estorbar");
  dice(true, "la ventana de pruebas va al fondo, sin foco");
  const v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: `window.__dobleInicio = ${JSON.stringify(datos)};` });
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  // El tamaño de una pantalla de 1920×1080 con la barra de Windows.
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1032, deviceScaleFactor: 1, mobile: false });
  await v.js(`(() => {
    localStorage.setItem("adeorq-perfil", ${JSON.stringify(
      JSON.stringify({ nombre: "Prueba", raiz: PROYECTOS, sinRaiz: false, extras: [], leerSesiones: true, clis: [], hecho: true, tour: true }),
    )});
  })()`);
  await recargar(v, "es", false);

  // ── Lo de ahora mismo ──
  const a = await v.js(`(() => {
    const q = (s) => document.querySelector(s);
    const filas = [...document.querySelectorAll(".inicio-proy")];
    const anio = q(".inicio-anio");
    const casillas = [...anio.querySelectorAll("span")];
    const caja = anio.getBoundingClientRect();
    const ultima = casillas.reduce((m, c) => Math.max(m, c.getBoundingClientRect().right), 0);
    const tarjetas = [...document.querySelectorAll(".inicio-card")].map((t) => getComputedStyle(t).boxShadow);
    return {
      adeo: !!q(".inicio-adeo svg.mascota"),
      saludo: q(".inicio-centro h1")?.textContent ?? "",
      frase: q(".inicio-estado")?.textContent ?? "",
      aviso: !!q(".inicio-aviso"),
      caja: !!q("#inicio-pedir"),
      dictar: !!q('.inicio-botones [aria-label="Dictar"]'),
      filas: filas.map((f) => [f.querySelector(".inicio-proy-n")?.textContent, f.querySelector(".inicio-proy-e")?.textContent ?? ""]),
      logos: document.querySelectorAll(".inicio-proy .pavatar img").length,
      cifra: q(".inicio-uso-cifra")?.textContent ?? "",
      linea: q(".inicio-uso-linea")?.textContent ?? "",
      casillas: casillas.length,
      sobra: Math.round(caja.right - ultima),
      cuadradas: casillas.every((c) => { const r = c.getBoundingClientRect(); return Math.abs(r.width - r.height) < 0.6; }),
      lado: Math.round(casillas[0].getBoundingClientRect().width * 10) / 10,
      tarjetas,
      cabeAlto: document.querySelector(".panel.inicio").scrollHeight <= document.querySelector(".panel.inicio").clientHeight + 1,
    };
  })()`);
  dice(a.adeo, "Adeo está, y se puede tocar");
  dice(/^Buen|^Aún en pie/.test(a.saludo) && a.saludo.includes("Prueba"), `el saludo con el nombre del perfil: «${a.saludo}»`);
  dice(/en marcha|tranquilo/.test(a.frase) && !a.aviso, `sin nadie esperando, la frase de lo que hay: «${a.frase}»`);
  dice(a.caja && a.dictar, "la caja para pedirle a Adeo, con su botón de dictar");
  const vivas = new Set(datos.sesiones.filter((s) => s.live).map((s) => s.project));
  const primeroVivas = a.filas.slice(0, vivas.size).every(([n]) => vivas.has(n));
  dice(a.filas.length > 0 && primeroVivas, `tus proyectos, primero los que tienen a alguien dentro: ${a.filas.map(([n, e]) => `${n} (${e})`).join(", ")}`);
  dice(a.filas.some(([, e]) => /trabajando/.test(e)), "los que tienen sesiones vivas dicen cuántas trabajan");
  console.log(`      logos de Rust en las filas: ${a.logos}`);
  // La cifra con su letra pegada («11B», nunca «11 B») y el mes detrás.
  dice(/^\d[\d,.]*[KMB]?tokens en \S/.test(a.cifra), `tu uso: «${a.cifra}»`);
  dice(/hoy/.test(a.linea), `y su línea: «${a.linea}»`);
  dice(a.casillas >= 25 * 7 + 1 && a.casillas <= 26 * 7, `medio año de casillas (${a.casillas})`);
  dice(a.sobra <= 1 && a.cuadradas, `las casillas llenan el ancho de su tarjeta (sobran ${a.sobra} px) y son cuadradas (${a.lado} px)`);
  dice(a.tarjetas.length === 2 && a.tarjetas.every((s) => (s.match(/rgba?\(/g) ?? []).length >= 3), "las dos tarjetas con su sombra de globo (cristal, la de la escala y el resplandor)");
  dice(a.cabeAlto, "todo cabe en una pantalla de 1920×1080 sin bajar");
  await foto(v, "inicio.png");

  const carceles = await guion(v, join(RAIZ, "scripts", "laboratorio", "carceles.js"));
  dice(!carceles.fallos.length, `sin cárceles${carceles.fallos.length ? `: ${carceles.fallos.join(" · ")}` : ""}`);
  const mayusculas = await guion(v, join(RAIZ, "scripts", "laboratorio", "mayusculas.js"));
  dice(!mayusculas.fallos.length, `sin mayúsculas espaciadas${mayusculas.fallos.length ? `: ${mayusculas.fallos.join(" · ")}` : ""}`);

  // ── Ver todos y Nuevo proyecto ──
  const b = await v.js(`(async () => {
    const antes = document.querySelectorAll(".inicio-proy").length;
    const ver = [...document.querySelectorAll(".inicio-pie .inicio-enlace")].find((x) => /Ver los/.test(x.textContent));
    if (!ver) return { antes, despues: antes, ver: false };
    ver.click();
    await new Promise((r) => setTimeout(r, 200));
    const despues = document.querySelectorAll(".inicio-proy").length;
    [...document.querySelectorAll(".inicio-pie .inicio-enlace")].find((x) => /Ver menos/.test(x.textContent))?.click();
    [...document.querySelectorAll(".inicio-pie .inicio-enlace")].find((x) => /Nuevo proyecto/.test(x.textContent))?.click();
    await new Promise((r) => setTimeout(r, 200));
    return { antes, despues, ver: true, crear: !!document.querySelector("#inicio-nuevo-proyecto"), vuelve: document.querySelectorAll(".inicio-proy").length };
  })()`);
  dice(b.ver && b.despues > b.antes && b.vuelve === b.antes, `«Ver los N» enseña todos (${b.antes} → ${b.despues}) y «Ver menos» vuelve`);
  dice(b.crear, "«Nuevo proyecto» abre su campo dentro de la tarjeta");

  // ── Con una sesión que te pregunta algo ──
  await recargar(v, "es", true);
  const c = await v.js(`(() => ({
    aviso: document.querySelector(".inicio-aviso-txt")?.textContent ?? "",
    contestar: !!document.querySelector(".inicio-aviso .np-btn"),
    frase: !!document.querySelector(".inicio-estado"),
    primera: [document.querySelector(".inicio-proy .inicio-proy-n")?.textContent, document.querySelector(".inicio-proy .inicio-proy-e")?.textContent],
  }))()`);
  const quien = datos.sesiones.find((s) => s.id === datos.espera);
  dice(c.aviso.includes(quien.title) && c.contestar && !c.frase, `te espera: «${c.aviso}», con «Contestar», en el sitio de la frase`);
  dice(c.primera[0] === quien.project && /pregunta/.test(c.primera[1] ?? ""), `y su proyecto sube el primero: ${c.primera.join(" · ")}`);
  await foto(v, "inicio-te-espera.png");
  const carceles2 = await guion(v, join(RAIZ, "scripts", "laboratorio", "carceles.js"));
  dice(!carceles2.fallos.length, `sin cárceles con el aviso${carceles2.fallos.length ? `: ${carceles2.fallos.join(" · ")}` : ""}`);

  // ── Lo que pides llega al conserje ──
  const pedido = "Repasa lo de hoy en Faro y súbelo";
  const d = await v.js(`(async () => {
    const caja = document.querySelector("#inicio-pedir");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(caja, ${JSON.stringify(pedido)});
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    document.querySelector(".inicio-enviar").click();
    for (let i = 0; i < 50 && !window.__pedidos.length; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    return {
      chat: !!document.querySelector(".chat-view"),
      pedidos: window.__pedidos,
      enHilo: [...document.querySelectorAll(".chat-turno")].some((t) => t.textContent.includes(${JSON.stringify(pedido)})),
    };
  })()`);
  dice(d.chat, "al enviar, se abre el Chat");
  dice(d.pedidos.length === 1 && JSON.stringify(d.pedidos[0]).includes(pedido), `y el conserje recibe lo pedido, una sola vez (${d.pedidos.length})`);
  dice(d.enHilo, "con lo que pediste ya pintado en su conversación");
  await foto(v, "inicio-al-chat.png");

  // ── En inglés (la app arranca siempre en el inicio) ──
  await recargar(v, "en", false);
  const e = await v.js(`(() => {
    const t = document.querySelector(".panel.inicio").innerText;
    const espanol = ["Tus proyectos", "Tu uso", "trabajando", "tokens en", "hoy", "Ver los", "Nuevo proyecto", "Enviar", "Dile a Adeo"].filter((p) => t.includes(p));
    return { espanol, caja: document.querySelector("#inicio-pedir").placeholder };
  })()`);
  dice(!e.espanol.length && /Tell Adeo/.test(e.caja), `en inglés, sin restos en español${e.espanol.length ? `: ${e.espanol.join(", ")}` : ""}`);
  await foto(v, "inicio-en.png");
  v.cerrar();
} catch (e) {
  fallos++;
  console.log(`FALLO ${e.message}`);
} finally {
  if (app) spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  await vite?.close();
  // El navegador tarda en soltar su carpeta después de morir.
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(BASE, { recursive: true, force: true });
      break;
    } catch {
      await dormir(1000);
    }
  }
}
console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
