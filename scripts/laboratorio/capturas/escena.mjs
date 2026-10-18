// Lo común de todas las fotos: abrir la conversación con la ventana de pruebas,
// dejarla del tamaño de la foto, sembrar lo que guarda el navegador, recargar y
// esperar a que las terminales pinten.
import { readFileSync } from "node:fs";
import { conectar, dormir } from "./cdp.mjs";

export { dormir };
export const ANCHO = 1920;
export const ALTO = 1080;
export const ESCALA = 2;

// Lo que la casa de pruebas no puede tener, porque no hay sesión iniciada en
// ningún CLI: las cuentas conectadas de Sam, su plan y su cuota. Las llamadas de
// la página a Rust viajan por `fetch` a ipc.localhost, así que se contestan en
// `GUARDA` con estos datos de demostración.
const DEMO = {
  conectadas: [".claude", ".codex", ".gemini"],
  plan: { subscription: "max", tier: "default_claude_max_5x" },
  planTrabajo: { subscription: "team", tier: "default_claude_team" },
  limites: {
    lines: [
      { label: "Current session", percent: 38, resets: "6am (Europe/Madrid)", resetsAt: 0 },
      { label: "Current week (all models)", percent: 22, resets: "Oct 17, 9am (Europe/Madrid)", resetsAt: 0 },
    ],
    note: "",
    plan: "",
  },
  limitesTrabajo: {
    lines: [
      { label: "Current session", percent: 9, resets: "7am (Europe/Madrid)", resetsAt: 0 },
      { label: "Current week (all models)", percent: 61, resets: "Oct 14, 9am (Europe/Madrid)", resetsAt: 0 },
    ],
    note: "",
    plan: "",
  },
  limitesCodex: {
    lines: [
      { label: "Current session", percent: 17, resets: "", resetsAt: 3 },
      { label: "Current week (all models)", percent: 31, resets: "", resetsAt: 100 },
    ],
    note: "",
    plan: "plus",
  },
  // Lo que cuenta de la MÁQUINA de quien hace la foto: su memoria, sus núcleos,
  // los modelos que tiene descargados y la versión de su binario de pruebas.
  // El equipo de Sam es un portátil corriente.
  pulso: { ramMb: 1650, ramPct: 10, sistemaMb: 9400, sistemaPct: 59, totalMb: 16000, procesos: 41, agentes: 7, cpuPct: 9, nucleos: 8 },
  modelosLocales: ["qwen3:4b", "nomic-embed-text:latest"],
  // La lista de bóvedas sale de la de Obsidian, en el %APPDATA% DE VERDAD, que
  // la casa no aísla: el resumen de la Memoria en el Perfil enseñaba el nombre
  // y las notas de la bóveda de quien hace la foto. Aquí, la de Sam (casa.mjs).
  bovedas: [{ path: "P:\\notes", name: "notes", docs: 7, abierta: true }],
  version: JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version,
};

/** El uso de Sam (`uso_historia`), que pintan el inicio y el Perfil: doscientos
 *  días de cubos de una hora, como los devuelve Rust. Con sus pocas sesiones
 *  grabadas el año saldría con una casilla; esto es un taller que lleva medio
 *  año trabajando, menos los fines de semana y con los doce últimos días
 *  seguidos. Lleva semilla: las tandas en inglés y en español pintan lo mismo.
 *  Se escribe como función y viaja a la página con su texto, sin dependencias. */
function historiaDeSam(ahora) {
  let semilla = 20261018;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const elegir = (pesos) => {
    let r = azar() * pesos.reduce((a, [, p]) => a + p, 0);
    for (const [x, p] of pesos) if ((r -= p) <= 0) return x;
    return pesos[0][0];
  };
  const PROYECTOS = [["storefront-api", 34], ["landing-web", 20], ["mobile-app", 18], ["invoice-cli", 12], ["docs-site", 9], ["design-tokens", 7]];
  const MODELOS = [[["claude", "claude-opus-5-5"], 46], [["claude", "claude-sonnet-5-5"], 32], [["claude", "claude-haiku-5-5"], 7], [["codex", "gpt-5.6-terra"], 15]];
  const DIAS = 200;
  const dos = (n) => String(n).padStart(2, "0");
  const horaUtc = (d) => `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}T${dos(d.getUTCHours())}`;
  const ya = new Date(ahora);
  const cubos = [];
  for (let atras = DIAS; atras >= 0; atras--) {
    const dia = new Date(ya.getFullYear(), ya.getMonth(), ya.getDate() - atras);
    const finde = dia.getDay() === 0 || dia.getDay() === 6;
    const salto = azar();
    if (atras > 12 && salto < (finde ? 0.6 : 0.12)) continue;
    // Empezó con poco y fue a más; de vez en cuando, un día de los gordos.
    const rampa = 0.3 + 0.7 * (1 - atras / DIAS);
    const total = (finde ? 0.4 : 1) * rampa * (35 + azar() * 140) * 1e6 * (azar() < 0.05 ? 2.4 : 1);
    const empieza = 9 + Math.floor(azar() * 2);
    let horas = Array.from({ length: 5 + Math.floor(azar() * 5) }, (_, i) => empieza + i + (i > 3 ? 1 : 0));
    if (atras === 0) horas = horas.filter((h) => h <= ya.getHours()).concat(ya.getHours() < empieza ? [ya.getHours()] : []);
    const deHoy = [elegir(PROYECTOS), elegir(PROYECTOS)];
    for (const h of horas) {
      const cuantos = azar() < 0.4 ? 2 : 1;
      for (let k = 0; k < cuantos; k++) {
        const [cli, modelo] = elegir(MODELOS);
        const t = (total / horas.length / cuantos) * (0.6 + azar() * 0.8);
        const codex = cli === "codex";
        cubos.push({
          hora: horaUtc(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h)),
          cli,
          modelo,
          carpeta: "P:\\projects\\" + deHoy[k],
          entrada: Math.round(t * (codex ? 0.1 : 0.004)),
          salida: Math.round(t * (codex ? 0.02 : 0.011)),
          cacheLeida: Math.round(t * (codex ? 0.88 : 0.955)),
          cacheEscrita: codex ? 0 : Math.round(t * 0.03),
          respuestas: 1 + Math.round(t / 900000),
        });
      }
    }
  }
  return { cubos, archivos: 412 };
}

/** Lo que la casa falsa no aísla, tapado en la página antes de que cargue nada.
 *  La brújula no sale a la red: tiene que ser un FALLO de red, porque con una
 *  respuesta de error la app borra la credencial guardada. Lo que suena en el
 *  equipo (`media_now`), las claves del Administrador de credenciales
 *  (`secret_*`) y el estado de la barra no se leen nunca del de verdad. */
const GUARDA = `(() => {
  const real = window.fetch.bind(window);
  const DEMO = ${JSON.stringify(DEMO)};
  const responde = (valor) => Promise.resolve(new Response(JSON.stringify(valor), { status: 200, headers: { "content-type": "application/json", "Tauri-Response": "ok" } }));
  const enHoras = (l) => ({ ...l, lines: l.lines.map((x) => (x.resetsAt ? { ...x, resetsAt: Date.now() + x.resetsAt * 3600000 } : x)) });
  const historiaDeSam = ${historiaDeSam.toString()};
  window.fetch = (a, b) => {
    const url = typeof a === "string" ? a : (a && a.url) || "";
    if (/supabase\\.co|openrouter\\.ai/.test(url)) return Promise.reject(new TypeError("Failed to fetch"));
    // Los comandos de los complementos viajan como «plugin:app|version».
    const plugin = decodeURIComponent(url).match(/^https?:\\/\\/ipc\\.localhost\\/plugin:([a-z-]+)\\|([a-z_]+)$/);
    if (plugin && plugin[1] === "app" && plugin[2] === "version") return responde(DEMO.version);
    // Sin versión nueva a la vista: la tarjeta de actualizar es de quien hace la foto.
    if (plugin && plugin[1] === "updater" && plugin[2] === "check") return responde(null);
    const m = url.match(/^https?:\\/\\/ipc\\.localhost\\/([a-z_]+)$/);
    if (m) {
      let args = {};
      try { args = JSON.parse(typeof (b && b.body) === "string" ? b.body : "{}"); } catch {}
      const cmd = m[1];
      const dir = args.configDir || "";
      if (cmd === "media_now" || cmd === "secret_get" || cmd === "secret_put" || cmd === "secret_forget" || cmd === "openrouter_info") return responde(null);
      // El estado de la barra (proyectos escondidos, orden, fijados) vive en la
      // carpeta de la app DE VERDAD, que la casa de pruebas no aísla: ni se lee
      // el de quien hace la foto ni se le escribe encima.
      if (cmd === "load_ui_state") return responde("{}");
      if (cmd === "save_ui_state") return responde(null);
      // Discord tampoco lo aísla la casa de pruebas: con el de quien hace la
      // foto abierto, la app publicaría su actividad en ese perfil.
      if (cmd === "discord_set" || cmd === "discord_clear") return responde(null);
      if (cmd === "pulso") return responde(DEMO.pulso);
      if (cmd === "ollama_models") return responde(DEMO.modelosLocales);
      // El arranque con Windows gobierna la app INSTALADA: el binario de pruebas
      // contesta con un aviso de que no lo está, que en la foto no pinta nada.
      if (cmd === "autostart_get") return responde(false);
      if (cmd === "account_ready") return responde(dir ? dir.includes("claude-work") : DEMO.conectadas.includes(args.homeDir || ""));
      if (cmd === "plan_info") return responde(dir.includes("claude-work") ? DEMO.planTrabajo : DEMO.plan);
      if (cmd === "usage_limits") return responde(dir.includes("claude-work") ? DEMO.limitesTrabajo : DEMO.limites);
      if (cmd === "usage_of") return args.provider === "codex" ? responde(enHoras(DEMO.limitesCodex)) : real(a, b);
      if (cmd === "uso_historia") return responde(historiaDeSam(Date.now()));
      if (cmd === "memoria_vaults") return responde(DEMO.bovedas);
    }
    return real(a, b);
  };
})();`;

export async function abrir() {
  const p = await conectar();
  await p.enviar("Network.enable", {});
  await p.enviar("Network.setBlockedURLs", { urls: ["*supabase.co*", "*openrouter.ai*"] });
  await p.enviar("Page.enable", {});
  await p.enviar("Page.addScriptToEvaluateOnNewDocument", { source: GUARDA });
  await p.tamano(ANCHO, ALTO, ESCALA);
  p.inv = (cmd, args) => p.llamar((c, a) => window.__TAURI_INTERNALS__.invoke(c, a), cmd, args ?? {});
  return p;
}

/** Escribe claves del navegador. Un valor `null` la borra; un objeto va como JSON. */
export function sembrar(p, claves) {
  return p.llamar((c) => {
    for (const [k, v] of Object.entries(c)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, claves);
}

export async function recargar(p, espera = 6000) {
  await p.enviar("Page.reload", {});
  await dormir(1500);
  await p.esperar(`!!document.querySelector('header.topbar')`, 20000);
  await dormir(espera);
}

/** Recarga con unas claves del navegador ya puestas ANTES de que la app lea
 *  nada. Escribirlas y recargar después no vale: la app guarda su tablero cada
 *  vez que cambia (también cuando se le cierran las terminales), y según quién
 *  llegue antes pisa lo sembrado y vuelve el tablero de antes. */
export async function recargarCon(p, claves, espera) {
  const fuente = `(() => { const c = ${JSON.stringify(claves)}; for (const [k, v] of Object.entries(c)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } })();`;
  const { identifier } = await p.enviar("Page.addScriptToEvaluateOnNewDocument", { source: fuente });
  await recargar(p, espera);
  await p.enviar("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

/** El fondo. La app lo sirve por su protocolo de archivos, que solo deja pasar
 *  la carpeta de datos DE VERDAD, no la de pruebas: la imagen existe (y por eso
 *  la app se pinta como cristal), pero no carga. Se le da aquí, tal cual. */
export async function ponerFondo(p) {
  const b64 = readFileSync("P:\\data\\Adeorq\\fondo.jpg").toString("base64");
  return p.llamar((datos) => {
    const img = document.querySelector("img.fondo-medio");
    if (!img) return "sin fondo en la página";
    img.src = "data:image/jpeg;base64," + datos;
    return new Promise((ok) => {
      img.onload = () => ok(`fondo ${img.naturalWidth}x${img.naturalHeight}`);
      img.onerror = () => ok("el fondo no cargó");
      setTimeout(() => ok("el fondo tarda"), 4000);
    });
  }, b64);
}

/** Clic de verdad en el elemento más pequeño cuyo texto es EXACTAMENTE ese. */
export async function clicExacto(p, texto, dentro = "body") {
  const pos = await p.llamar(
    (txt, raiz) => {
      const base = document.querySelector(raiz) ?? document.body;
      const els = [...base.querySelectorAll("*")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (e.textContent ?? "").trim() === txt;
      });
      els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
      const e = els[0];
      if (!e) return null;
      e.scrollIntoView({ block: "nearest" });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    texto,
    dentro,
  );
  if (!pos) {
    console.log(`  (no encuentro «${texto}»)`);
    return false;
  }
  await p.raton(pos.x, pos.y);
  return true;
}

/** El ratón, a un sitio donde no levante ningún rótulo. */
export const apartarRaton = (p) => p.raton(960, 1076, "mover");

/** Con la escala de la foto, el lienzo WebGL de xterm se queda al tamaño de la
 *  pantalla de verdad. Soltándolo, la terminal cae a su pintado de reserva, que
 *  es texto y sale nítido a cualquier escala. */
export async function sinWebgl(p) {
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const quedan = await p.js(`(() => { let n = 0; for (const c of document.querySelectorAll('.xterm canvas:not(.xterm-link-layer)')) { const g = c.getContext('webgl2'); const e = g && g.getExtension('WEBGL_lose_context'); if (e && !g.isContextLost()) e.loseContext(); n++; } return n; })()`);
    if (!quedan) return;
    await dormir(1500);
  }
}

/** Las pantallas que viven dentro del Perfil (`DEL_PERFIL` de `lib/vistas.ts`)
 *  ya no tienen pestaña: se llega a ellas tocando su resumen en el Perfil. */
const DEL_PERFIL = ["cuentas", "agenda", "memoria", "comandos"];

export async function vista(p, clave, espera = 1500) {
  if (DEL_PERFIL.includes(clave)) {
    await p.clic(`header.topbar nav.tabs button.tab[data-tab="perfil"]`);
    await dormir(1500);
    await p.clic(`.perfil-secciones button.perfil-seccion[data-seccion="${clave}"]`);
  } else {
    await p.clic(`header.topbar nav.tabs button.tab[data-tab="${clave}"]`);
  }
  await dormir(espera);
}

/** El panel de la Cabina que reproduce una sesión grabada. La última palabra de
 *  la línea dice de qué CLI era; va SIN el id de la sesión, porque con él la app
 *  cambiaría la línea por la de retomar esa conversación de verdad. El panel
 *  lee el transcript más reciente de su carpeta, que es el de la grabación. */
export function panelGrabado({ nombre, proyecto, grabacion, cli = "claude" }) {
  return {
    name: nombre,
    cwd: `P:\\projects\\${proyecto}`,
    command: ["cmd.exe", "/k", `chcp 65001 >nul && node P:\\bin\\repetir.mjs P:\\rec\\${grabacion} ${cli}`],
  };
}

/** Recargar la página no cierra las terminales de antes: se cierran aquí. */
export async function cerrarTerminales(p) {
  const vivas = await p.inv("pty_vivas").catch(() => []);
  for (const v of vivas) await p.inv("pty_kill", { id: v.id }).catch(() => {});
  return vivas.length;
}
