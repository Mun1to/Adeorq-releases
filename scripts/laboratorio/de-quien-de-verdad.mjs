// «de: …» en la cabecera y el cierre de lo suyo en «plan», con el puente de
// verdad contra una Adeorq aislada.
//
// Munir, 2026-10-17, tres cosas de la cabecera de las terminales:
//   - el logo y el proyecto, sin caja («no estén en cárceles, sino libres»);
//   - «una etiqueta pequeña en la cabecera de la terminal: de: nombre de quien
//     la abrió. Lo mínimo», solo en las que abrió otra sesión con open_pane;
//   - «que cualquiera pueda cerrar las que abrió ÉL, con su rastro, aunque esté
//     en plan». Las de otros, no.
//
// Esto lo recorre entero:
//   1. un agente sin panel abre la «Sesión madre», y la madre (presentándose con
//      su número, como hace su puente) abre una hija en la Cabina y otra en el
//      Lienzo: las dos dicen «de: Sesión madre» y la madre no dice nada;
//   2. el logo y el proyecto no llevan borde ni fondo, en las dos vistas;
//   3. un Codex (en «plan» de fábrica) ve close_pane, se le dice que cierre lo
//      suyo, cierra la que abrió él y no puede con la de la madre ni con la madre;
//      escribir sigue sin poder.
//   4. ninguna cárcel en la cabecera (Munir, 2026-10-17: «Estoy ya hasta los
//      cojones de las cárceles y de los recuadros de los iconos y de los
//      textos»): el detector `carceles.js` acotado a `.pane-head`, en la Cabina y
//      en el Lienzo; al pasar el ratón por un botón y por la ✕ solo cambia el
//      color; y la ✕ solo se tapa con un fundido cuando hay botones debajo.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/de-quien-de-verdad.mjs [carpeta para las fotos]
//
// Todo en una casa, unos datos y un navegador de usar y tirar, con el MCP en el
// 39314: no toca la Adeorq de Munir ni su 3012. Las terminales son consolas, no
// agentes: no gasta cuota. Deja dos fotos de las cabeceras (Cabina y Lienzo) en
// la carpeta que se le pase, o en la temporal. Sale con 1 si algo falla.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXE = "C:\\ct\\debug\\adeorq.exe";
const PUERTO = 39314;
const DEPURAR = 9342;
const BASE = join(tmpdir(), `adeorq-de-quien-${process.pid}`);
const DEMO = join(BASE, "proyectos", "demo");
const FOTOS = process.argv[2] || tmpdir();
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
// Lanzado desde un panel de Adeorq, el entorno trae el número de ESE panel.
delete env.ADEORQ_PANE_ID;

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

/** Un agente: el puente `--mcp` de verdad, presentándose como el panel `yo`
 *  (o sin panel, con `null`), y diciendo que es el cliente `cliente`. */
function puente(yo) {
  const suyo = { ...env };
  if (yo != null) suyo.ADEORQ_PANE_ID = String(yo);
  const p = spawn(EXE, ["--mcp"], { env: suyo });
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

const numero = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
const lineaDe = (texto, id) => (texto || "").split("\n").find((l) => l.startsWith(`ID: ${id},`)) || "";
const RASTRO = "Una consola de prueba del laboratorio de la cabecera; no hizo nada y no queda nada pendiente.";

/** Lo que pinta la cabecera de la terminal que se llama así. */
const cabecera = (nombre) => `(() => {
  const pane = [...document.querySelectorAll(".pane")].find((p) => p.querySelector(".pane-name")?.textContent === ${JSON.stringify(nombre)});
  if (!pane) return null;
  const de = pane.querySelector(".pane-de");
  const caja = (sel) => {
    const e = pane.querySelector(sel);
    if (!e) return "(no está)";
    const cs = getComputedStyle(e);
    return cs.borderTopStyle + " " + cs.borderTopWidth + " " + cs.backgroundColor;
  };
  const r = pane.querySelector(".pane-head").getBoundingClientRect();
  return {
    lienzo: !!pane.closest(".rf-term"),
    de: de ? de.textContent : null,
    tip: de ? de.getAttribute("data-tip") : null,
    logo: caja(".pane-kind"),
    proyecto: caja(".pane-proj"),
    globo: pane.querySelector(".pane-name")?.getAttribute("data-tip") ?? "",
    rect: { x: r.x, y: r.y, width: Math.min(r.width, 900), height: r.height },
  };
})()`;

const SIN_CAJA = /^none 0px rgba\(0, 0, 0, 0\)$/;

/** Las cárceles que ve `carceles.js` (el detector de la casa) dentro de
 *  `ambito` (las cabeceras de las terminales, o la barra de arriba de la app
 *  con ".topbar"), o en la página entera con `null`. */
async function carceles(v, ambito = ".pane-head") {
  let src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "carceles.js"), "utf8");
  if (ambito) {
    const antes = src;
    src = src.replace('document.querySelectorAll("body *")', `document.querySelectorAll("${ambito}, ${ambito} *")`);
    if (src === antes) throw new Error("carceles.js ya no recorre «body *»: hay que volver a acotarlo");
  }
  const guion = (0, eval)(src);
  return (await guion({ evaluate: (fn) => v.js(`(${fn.toString()})()`) })).fallos;
}

/** Cómo queda la primera pieza que case con `selector` con el ratón encima,
 *  forzado por el navegador (sin mover el ratón de nadie). */
async function conRatonEncima(v, selector) {
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
const SUELTO_ENCIMA = (r) =>
  !!r && /^rgba\(0, 0, 0, 0\) none$/.test(r.encima.fondo) && /^none/.test(r.encima.borde) && r.encima.sombra === "none" && r.encima.mueve === "none" && r.encima.color !== r.antes.color;

const hijo = spawn(EXE, [], { cwd: DEMO, detached: true, stdio: "ignore", env });
hijo.unref();
const app = hijo.pid;
let v;
try {
  debe(Boolean(await hasta(() => alFondo(app), 12_000, 200)), "la ventana de pruebas va al fondo, sin foco");
  v = await ventana();
  await v.enviar("Page.enable");
  await v.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
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

  const foto = async (nombre, rect, archivo) => {
    const r = await v.enviar("Page.captureScreenshot", { format: "png", clip: { ...rect, scale: 2 } });
    const ruta = join(FOTOS, archivo);
    writeFileSync(ruta, Buffer.from(r.data, "base64"));
    console.log(`      foto de «${nombre}»: ${ruta}`);
  };

  // 1. La madre la abre un agente sin panel, y ella abre a sus hijas.
  const sinPanel = puente(null);
  await sinPanel.pedir("initialize", { clientInfo: { name: "claude-code" } });
  // La ventana puede no atender todavía al MCP aunque el puerto ya escuche
  // (medido el 2026-10-17: la primera apertura volvió sin número): se espera a
  // que conteste a `get_active_panes`, que no abre nada.
  await hasta(async () => /Arranque de Adeorq/.test((await sinPanel.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(1500);
  const primera = await sinPanel.llamar("open_pane", { cli: "shell", cwd: DEMO, name: "Sesión madre", brief: "" });
  const M = numero(primera);
  debe(M > 0, `un agente sin panel abre la «Sesión madre» (${M > 0 ? M : (primera.error || primera.texto || "").slice(0, 120)})`);
  // Su nombre lleva delante el proyecto («demo · Sesión madre»), y su cabecera
  // lo quita porque el proyecto ya va al lado: el «de:» dice lo que se VE.
  const nombreMadre = await hasta(async () => /Nombre: «([^»]+)»/.exec(lineaDe((await sinPanel.llamar("get_active_panes", {})).texto, M))?.[1], 15_000, 500);
  debe(nombreMadre === "demo · Sesión madre", `get_active_panes la llama «${nombreMadre}»`);
  const sinMadre = await hasta(() => v.js(cabecera("Sesión madre")), 10_000);
  debe(sinMadre && sinMadre.de === null, "la madre, que abrió un agente sin panel, no lleva «de:»");

  const madre = puente(M);
  await madre.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const H1 = numero(await madre.llamar("open_pane", { cli: "shell", cwd: DEMO, name: "Hija en la cabina", brief: "" }));
  debe(H1 > 0, `la madre abre una hija (${H1})`);
  const enCabina = await hasta(async () => {
    const c = await v.js(cabecera("Hija en la cabina"));
    return c?.de ? c : null;
  }, 10_000);
  debe(enCabina?.de === "de: Sesión madre" && !enCabina.lienzo, `en la Cabina dice «${enCabina?.de}»`);
  debe(enCabina?.tip === "La abrió la sesión «Sesión madre» con open_pane", `su globo: «${enCabina?.tip}»`);
  debe(/de: Sesión madre/.test(enCabina?.globo ?? ""), "y el globo del título lo repite, para cuando se estrecha");
  debe(SIN_CAJA.test(enCabina?.logo ?? "") && SIN_CAJA.test(enCabina?.proyecto ?? ""), `el logo y el proyecto, sin caja (${enCabina?.logo} · ${enCabina?.proyecto})`);
  if (enCabina) await foto("Hija en la cabina", enCabina.rect, "cabecera-cabina.png");

  // 4. Ninguna cárcel en la cabecera de la Cabina, ni con el ratón encima.
  await v.enviar("DOM.enable");
  await v.enviar("CSS.enable");
  const enLaCabina = await carceles(v);
  debe(enLaCabina.length === 0, `el detector no ve cárceles en las cabeceras de la Cabina${enLaCabina.length ? `: ${enLaCabina.join(" | ")}` : ""}`);
  const boton = await conRatonEncima(v, ".pane-head .ph-acts .pane-btn");
  debe(SUELTO_ENCIMA(boton), `con el ratón encima, un botón solo cambia de color (${JSON.stringify(boton?.encima)})`);
  const equis = await conRatonEncima(v, ".pane-head .pane-close");
  debe(SUELTO_ENCIMA(equis), `y la ✕ igual (${JSON.stringify(equis?.encima)})`);
  // La ✕ tapa los botones que pasan por debajo solo cuando la cabecera no cabe.
  const tapa = await v.js(`(async () => {
    const pane = [...document.querySelectorAll(".pane")].find((p) => p.querySelector(".pane-name")?.textContent === "Hija en la cabina");
    const head = pane.querySelector(".pane-head");
    const x = head.querySelector(".pane-close");
    const fotograma = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const fondo = () => getComputedStyle(x).backgroundImage;
    const suelta = fondo();
    head.style.maxWidth = "150px";
    head.scrollLeft = 0;
    await fotograma(); await fotograma(); await new Promise((r) => setTimeout(r, 300));
    const desborda = head.scrollWidth > head.clientWidth;
    const tapando = fondo();
    head.scrollLeft = head.scrollWidth;
    await fotograma(); await fotograma(); await new Promise((r) => setTimeout(r, 300));
    const alFinal = fondo();
    head.style.maxWidth = "";
    head.scrollLeft = 0;
    return { tipo: getComputedStyle(head).containerType, suelta, desborda, tapando, alFinal };
  })()`);
  debe(
    tapa.suelta === "none" && tapa.desborda && /linear-gradient/.test(tapa.tapando) && tapa.alFinal === "none",
    `la ✕ solo se tapa con botones debajo (${tapa.tipo}; cabe: ${tapa.suelta}; desborda: ${tapa.desborda}; no cabe: ${tapa.tapando.slice(0, 30)}; al final: ${tapa.alFinal})`,
  );

  // 5. La barra de arriba de la app: ninguna cárcel (la pestaña activa, «beta»,
  // las cuentas), y la activa se sigue viendo por su color y su raya.
  async function pestanas(vista, clave, archivo) {
    const fuera = await carceles(v, ".topbar");
    debe(fuera.length === 0, `en ${vista}, el detector no ve cárceles en la barra de arriba${fuera.length ? `: ${fuera.join(" | ")}` : ""}`);
    const activa = await v.js(`(() => {
      const t = document.querySelector('.topbar .tab[data-tab="${clave}"]');
      const otra = document.querySelector('.topbar .tab[data-active="false"]');
      if (!t || !otra) return null;
      const raya = getComputedStyle(t, "::after");
      const r = document.querySelector(".topbar").getBoundingClientRect();
      return {
        marcada: t.getAttribute("data-active") === "true",
        color: getComputedStyle(t).color,
        otra: getComputedStyle(otra).color,
        raya: raya.content !== "none" && raya.backgroundColor !== "rgba(0, 0, 0, 0)" ? raya.width + " " + raya.backgroundColor : "",
        rect: { x: r.x, y: r.y, width: Math.min(r.width, 1100), height: r.height },
      };
    })()`);
    debe(!!activa?.marcada && !!activa.raya && activa.color !== activa.otra, `la pestaña ${vista} se ve activa sin caja (texto ${activa?.color} contra ${activa?.otra}, raya ${activa?.raya})`);
    const encima = await conRatonEncima(v, '.topbar .tab[data-active="false"]');
    debe(SUELTO_ENCIMA(encima), `con el ratón encima, una pestaña solo cambia de color (${JSON.stringify(encima?.encima)})`);
    if (activa) await foto(`la barra en ${vista}`, activa.rect, archivo);
  }
  await pestanas("Cabina", "cabina", "barra-cabina.png");

  // En el Lienzo, la siguiente nace allí.
  await v.js(`document.querySelector('[data-tab="lienzo"]')?.click(); "ok"`);
  await dormir(1200);
  const H2 = numero(await madre.llamar("open_pane", { cli: "shell", cwd: DEMO, name: "Hija en el lienzo", brief: "" }));
  const enLienzo = await hasta(async () => {
    const c = await v.js(cabecera("Hija en el lienzo"));
    return c?.de ? c : null;
  }, 10_000);
  debe(H2 > 0 && enLienzo?.lienzo && enLienzo.de === "de: Sesión madre", `en el Lienzo dice «${enLienzo?.de}»`);
  debe(SIN_CAJA.test(enLienzo?.logo ?? "") && SIN_CAJA.test(enLienzo?.proyecto ?? ""), `y allí tampoco hay caja (${enLienzo?.logo} · ${enLienzo?.proyecto})`);
  if (enLienzo) await foto("Hija en el lienzo", enLienzo.rect, "cabecera-lienzo.png");
  const enElLienzo = await carceles(v);
  debe(enElLienzo.length === 0, `el detector no ve cárceles en las cabeceras del Lienzo${enElLienzo.length ? `: ${enElLienzo.join(" | ")}` : ""}`);
  const botonLienzo = await conRatonEncima(v, ".rf-term .pane-head .ph-acts .pane-btn");
  debe(SUELTO_ENCIMA(botonLienzo), `en el Lienzo, con el ratón encima, un botón solo cambia de color (${JSON.stringify(botonLienzo?.encima)})`);
  await pestanas("Lienzo", "lienzo", "barra-lienzo.png");
  // Fuera de las dos cabeceras no es este encargo: se cuenta, no se juzga.
  const resto = await carceles(v, null);
  if (resto.length) console.log(`      fuera de las cabeceras, en esta pantalla: ${resto.join(" | ")}`);

  // 3. Un Codex, en «plan» de fábrica.
  const codex = puente(60);
  const ini = await codex.pedir("initialize", { clientInfo: { name: "codex-cli" } });
  const instrucciones = ini.result?.instructions ?? "";
  debe(/close the ones it opened/.test(instrucciones) && !/cannot type into or close/.test(instrucciones), "al conectarse se le dice que cierre las que abrió");
  const lista = ((await codex.pedir("tools/list", {})).result?.tools ?? []).map((h) => h.name);
  debe(lista.includes("close_pane") && !lista.includes("send_command"), `ve close_pane y no send_command (${lista.length} herramientas)`);
  const C = numero(await codex.llamar("open_pane", { cli: "shell", cwd: DEMO, name: "Hija del Codex", brief: "" }));
  debe(C > 0, `el Codex abre la suya (${C})`);
  await hasta(async () => lineaDe((await codex.llamar("get_active_panes", {})).texto, C), 10_000, 500);
  const deLaMadre = await codex.llamar("close_pane", { paneId: H1, rastro: RASTRO });
  debe(/«plan»/.test(deLaMadre.error || "") && new RegExp(`la abrió el panel ${M}`).test(deLaMadre.error || ""), `no cierra la de la madre («${(deLaMadre.error || deLaMadre.texto || "").slice(0, 160)}»)`);
  const laMadre = await codex.llamar("close_pane", { paneId: M, rastro: RASTRO });
  debe(/la abrió otro agente/.test(laMadre.error || ""), `ni a la madre («${(laMadre.error || laMadre.texto || "").slice(0, 80)}»)`);
  const escribir = await codex.llamar("send_command", { paneId: C, command: "echo hola" });
  debe(/no está al alcance/.test(escribir.error || ""), "escribir, ni en la suya");
  const sinRastro = await codex.llamar("close_pane", { paneId: C });
  debe(/Falta `rastro`/.test(sinRastro.error || ""), "la suya, sin rastro, tampoco");
  const suya = await codex.llamar("close_pane", { paneId: C, rastro: RASTRO });
  debe(/cerrada y su agente parado/.test(suya.texto || ""), `la suya, con su rastro, sí («${(suya.error || suya.texto || "").slice(0, 80)}»)`);
  await dormir(800);
  const quedan = (await madre.llamar("get_active_panes", {})).texto;
  debe(!lineaDe(quedan, C) && lineaDe(quedan, H1) && lineaDe(quedan, M), "se fue la del Codex y siguen la madre y su hija");

  // Y la madre, en «auto», recoge lo suyo como siempre.
  for (const id of [H1, H2]) {
    const r = await madre.llamar("close_pane", { paneId: id, rastro: RASTRO });
    debe(/cerrada/.test(r.texto || ""), `la madre cierra su hija ${id}`);
  }
  for (const p of [sinPanel, madre, codex]) p.cerrar();
} catch (e) {
  fallos.push(String(e));
  console.log("REVENTÓ", e);
} finally {
  v?.cerrar();
  spawnSync("taskkill", ["/PID", String(app), "/T", "/F"], { stdio: "ignore" });
  // Su navegador no cuelga del árbol de la app: queda uno vivo con la carpeta
  // cogida (medido el 2026-10-17). Es nuestro por la ruta, que es de esta pasada.
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${BASE.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ], { stdio: "ignore" });
  // Y aun muerto, su carpeta tarda unos segundos en soltarse.
  const borrada = await hasta(() => {
    rmSync(BASE, { recursive: true, force: true });
    return true;
  }, 45_000, 1000);
  if (!borrada) console.log(`      no pude borrar ${BASE}: bórrala a mano`);
}
console.log(fallos.length ? `\n${fallos.length} MAL` : "\nTodo BIEN");
process.exit(fallos.length ? 1 : 0);
