// «Adeo es una IA» y el enlace de informar de un problema en la página del móvil
// (política 11.16 de la Microsoft Store), con el servidor de mentira de
// `doble-movil.mjs` y un Edge propio (perfil aparte, sin cabeza) a 390 px.
//
//   node scripts/laboratorio/informar-movil.mjs [carpeta para las fotos]
//
// Mira, en español y en inglés:
//  · la portada (la caja para escribirle a Adeo) lleva la línea y el enlace;
//  · una conversación VACÍA también (el agujero por el que rechazaron a VoCript);
//  · con respuestas, cada respuesta de Adeo lleva su enlace y lo tuyo no;
//  · el enlace es una incidencia nueva del repo público, con la versión que le da
//    el PC (`/api/yo`), sin `labels=` y sin nada de la conversación;
//  · el enlace se abre aparte (`target=_blank`, `noopener`) y mide algo tocable;
//  · nada se sale de lado a 390 px.
//
// No abre ninguna incidencia ni ninguna dirección: el enlace solo se lee. Edge se
// cierra por su pid y su perfil se borra al acabar.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const FOTOS = resolve(process.argv[2] || tmpdir());
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
const hasta = async (fn, ms, cada = 250) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await dormir(cada);
  }
  return null;
};

async function pasada(idioma, n) {
  console.log(`\n── ${idioma === "es" ? "Español" : "English"} ──`);
  const puerto = 4391 + n;
  const depurar = 9333 + n;
  const perfil = join(tmpdir(), `adeorq-informar-movil-${process.pid}-${n}`);
  mkdirSync(perfil, { recursive: true });
  const doble = spawn(process.execPath, [join(RAIZ, "scripts", "laboratorio", "doble-movil.mjs"), String(puerto)], { env: { ...process.env, IDIOMA: idioma }, stdio: "ignore" });
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${depurar}`, "--remote-allow-origins=*", `--user-data-dir=${perfil}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  try {
    if (!(await hasta(() => fetch(`http://127.0.0.1:${puerto}/`).then((r) => r.ok), 15_000))) throw new Error("el doble del móvil no contesta");
    const lista = await hasta(async () => (await (await fetch(`http://127.0.0.1:${depurar}/json/list`)).json()).find((t) => t.type === "page"), 20_000);
    if (!lista) throw new Error("Edge no abrió su puerto de depuración");
    const ws = new WebSocket(lista.webSocketDebuggerUrl);
    await new Promise((ok, mal) => ((ws.onopen = ok), (ws.onerror = () => mal(new Error("sin CDP")))));
    let i = 0;
    const pend = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const p = m.id && pend.get(m.id);
      if (!p) return;
      pend.delete(m.id);
      m.error ? p.mal(new Error(m.error.message)) : p.ok(m.result);
    };
    const enviar = (method, params = {}) => new Promise((ok, mal) => ((pend.set(++i, { ok, mal }), ws.send(JSON.stringify({ id: i, method, params })))));
    const js = async (expr) => {
      const r = await enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const foto = async (nombre) => writeFileSync(join(FOTOS, nombre), Buffer.from((await enviar("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await enviar("Page.enable");
    await enviar("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const ir = async (hash) => {
      await enviar("Page.navigate", { url: `http://127.0.0.1:${puerto}/${hash}` });
      await dormir(1200);
    };
    await ir("");
    await js(`localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); "ok"`);

    const MIDE = `(() => {
      const a = document.querySelector(".caja .aviso-ia");
      const l = a?.querySelector("a.informar:not(.por-correo)");
      const k = a?.querySelector("a.por-correo");
      const r = l?.getBoundingClientRect();
      const rk = k?.getBoundingClientRect();
      const c = a?.getBoundingClientRect();
      return { linea: a?.textContent.replace(/\\s+/g, " ").trim() ?? null, href: l?.getAttribute("href") ?? null, target: l?.getAttribute("target"), rel: l?.getAttribute("rel"),
        alto: r ? Math.round(r.height) : 0, dentro: !!c && c.left >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, ancho: document.documentElement.scrollWidth, ventana: innerWidth,
        correo: k ? { href: k.getAttribute("href"), target: k.getAttribute("target"), ayuda: k.getAttribute("title"), aria: k.getAttribute("aria-label"), alto: Math.round(rk.height), ancho: Math.round(rk.width) } : null };
    })()`;
    const esp = idioma === "es"
      ? { linea: "Adeo es una IA y puede equivocarse. Informar de un problema o por correo", version: /Versión de Adeorq/, asunto: /^Informe de un problema con Adeo$/ }
      : { linea: "Adeo is an AI and can make mistakes. Report an issue or by email", version: /Adeorq version/, asunto: /^Report an issue with Adeo$/ };
    const miraCorreo = (m, donde) => {
      const k = m.correo;
      const mm = k?.href ? /^mailto:([^?]+)\?(.*)$/.exec(k.href) : null;
      const p = new URLSearchParams(mm?.[2] ?? "");
      const cuerpo = p.get("body") ?? "";
      dice(!!mm && mm[1] === "munitodev@gmail.com" && [...p.keys()].sort().join(",") === "body,subject", `${donde}: «o por correo» es un mailto: a munitodev@gmail.com, solo con asunto y mensaje`, k?.href?.slice(0, 90));
      dice(esp.asunto.test(p.get("subject") ?? "") && cuerpo.includes("0.9.243") && esp.version.test(cuerpo) && !/pública|public/i.test(cuerpo), `${donde}: el asunto viene escrito, el mensaje lleva la versión del PC y no dice que sea público`, `${p.get("subject")} | ${cuerpo.split("\r\n")[0]}`);
      dice(!!k && k.target === null && (k.alto ?? 0) >= 44, `${donde}: se abre en el programa de correo (sin target) y mide algo tocable`, `${k?.alto} px de alto, ${k?.ancho} de ancho`);
      dice(!!k && (k.ayuda ?? "").includes("munitodev@gmail.com") && !!k.aria, `${donde}: su ayuda dice la dirección y tiene nombre para el lector de pantalla`, `${k?.ayuda} | ${k?.aria}`);
    };
    const miraEnlace = (m, donde) => {
      const u = m.href ? new URL(m.href) : null;
      dice(!!u && u.origin + u.pathname === "https://github.com/Mun1to/Adeorq-releases/issues/new", `${donde}: el enlace es una incidencia nueva del repo público`, m.href?.slice(0, 100));
      dice(!!u && !u.searchParams.has("labels"), `${donde}: sin labels`);
      const cuerpo = u?.searchParams.get("body") ?? "";
      dice(cuerpo.includes("0.9.243") && esp.version.test(cuerpo), `${donde}: lleva la versión del PC (0.9.243) y está en el idioma de la app`, cuerpo.split("\n")[0]);
      dice(m.target === "_blank" && /noopener/.test(m.rel ?? ""), `${donde}: se abre aparte y con noopener`, `${m.target} ${m.rel}`);
    };

    // La portada: la caja para escribirle a Adeo.
    await ir("");
    await hasta(() => js(`!!document.querySelector(".caja .aviso-ia a.informar")`), 8000);
    await dormir(800);
    let m = await js(MIDE);
    dice(m.linea === esp.linea, "la portada lleva la línea de IA y el enlace", m.linea);
    dice(m.dentro && m.ancho <= m.ventana, "y cabe: nada se sale de lado a 390 px", `ancho ${m.ancho} / ventana ${m.ventana}`);
    dice(m.alto >= 44, "el enlace mide algo tocable (44 px de alto o más)", `${m.alto} px`);
    miraEnlace(m, "portada");
    miraCorreo(m, "portada");
    await foto(`informar-movil-${idioma}-portada.png`);

    // Una conversación VACÍA.
    await ir("#conv=nuevaprueba1");
    await hasta(() => js(`!!document.querySelector("#hilo .vacio")`), 8000);
    await dormir(600);
    m = await js(MIDE);
    const turnosVacia = await js(`document.querySelectorAll("#hilo .turno").length`);
    dice(turnosVacia === 0, "la conversación nueva está vacía (ninguna respuesta de Adeo)");
    dice(m.linea === esp.linea && m.dentro, "y aun así lleva la línea de IA y el enlace", m.linea);
    miraEnlace(m, "conversación vacía");
    miraCorreo(m, "conversación vacía");
    await foto(`informar-movil-${idioma}-vacia.png`);

    // Con respuestas de Adeo.
    await ir("#conv=vieja1");
    await hasta(() => js(`document.querySelectorAll("#hilo .turno").length >= 2`), 8000);
    await dormir(900);
    const turnos = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll("#hilo .turno")].map((t) => ({ rol: t.dataset.rol, informe: !!t.querySelector("a.informar"), tocable: Math.round(t.querySelector("a.informar")?.getBoundingClientRect().height ?? 0) })))`));
    dice(turnos.filter((t) => t.rol === "agente" && t.informe).length === 1 && turnos.filter((t) => t.rol === "tu" && t.informe).length === 0, "cada respuesta de Adeo lleva su enlace y lo tuyo no", JSON.stringify(turnos));
    m = await js(MIDE);
    dice(m.linea === esp.linea && m.dentro && m.ancho <= m.ventana, "y la línea de debajo de la caja sigue ahí", `ancho ${m.ancho} / ventana ${m.ventana}`);
    const del = await js(`document.querySelector("#hilo .turno.con-informe a.informar")?.getAttribute("href")`);
    dice(del === m.href, "el enlace de la respuesta da la misma dirección que el de la caja", del && del !== m.href ? del.slice(0, 120) : "");
    dice((await js(`document.querySelectorAll("#hilo .turno a.por-correo").length`)) === 0, "y ninguna respuesta lleva el correo: solo la línea de debajo de la caja");
    miraCorreo(m, "con respuestas");
    await foto(`informar-movil-${idioma}-con-respuesta.png`);
    ws.close();
  } finally {
    spawnSync("taskkill", ["/PID", String(edge.pid), "/T", "/F"], { stdio: "ignore" });
    doble.kill();
    await dormir(1500);
    for (let k = 0; k < 10; k++) {
      try {
        rmSync(perfil, { recursive: true, force: true });
        break;
      } catch {
        await dormir(1000);
      }
    }
  }
}

await pasada("es", 0);
await pasada("en", 1);
console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
