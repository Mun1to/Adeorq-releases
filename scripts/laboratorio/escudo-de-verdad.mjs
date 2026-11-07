// La ventana del escudo, de verdad: la Adeorq de desarrollo aislada, con el
// firmante de prueba (sin el PIN de Munir) y el vigilante encendido.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/escudo-de-verdad.mjs [carpeta de fotos]
//
// Lo que comprueba, por el puerto del MCP como lo haría el gancho y por la
// pantalla como lo haría Munir:
//   1. Ajustes › Escudo sale (hay carpeta del escudo) y se prepara desde ahí:
//      la contraseña, la pregunta y la llave.
//   2. La ventana roja: sus tres pasos, con un fallo de contraseña por medio, y
//      la firma que vuelve casa con la llave Y con el mensaje que construye el
//      propio gancho (`mensajeAFirmar` de `escudo/gancho.mjs`).
//   3. La del PIN solo, con «Sí, con mi PIN», y otra con «No».
//   4. El vigilante: un AGENTS.md cambiado a mano sale en rojo en la lista y
//      «Deshacer» lo deja como estaba.
// Lo que NO puede probar: el cuadro de Windows Hello de verdad (pide el PIN de
// Munir). Con `ADEORQ_ESCUDO_LABORATORIO=1` la ventana de pruebas no se pone
// delante ni saca avisos del escritorio.
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";
import { mensajeAFirmar } from "../../escudo/gancho.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FOTOS = process.argv[2] || tmpdir();
const PUERTO = 39461;
fs.mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const bien = (cond, que) => {
  console.log(`${cond ? "BIEN " : "FALLO"} ${que}`);
  if (!cond) fallos.push(que);
};

/** Lo que hace `pedirAAdeorq` del gancho: una línea, el acuse y la respuesta. */
function pedir(peticion) {
  return new Promise((ok) => {
    const s = net.connect({ host: "127.0.0.1", port: PUERTO });
    let buf = "";
    let acuse = false;
    s.setEncoding("utf8");
    s.on("connect", () => s.write(`${JSON.stringify({ adeorq: "escudo", ...peticion })}\n`));
    s.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const v = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (v.adeorq === "esperando") acuse = true;
        else {
          s.destroy();
          ok({ ...v, acuse });
        }
      }
    });
    s.on("error", (e) => ok({ error: String(e), acuse }));
  });
}

const huella = (t) => crypto.createHash("sha256").update(t).digest("hex");
const campos = (tipo, objeto, minutos) => {
  const ahora = Date.now();
  return {
    tipo,
    sesion: "laboratorio-escudo",
    objeto,
    desde: new Date(ahora).toISOString(),
    hasta: new Date(ahora + minutos * 60_000).toISOString(),
    nonce: crypto.randomBytes(32).toString("base64url"),
  };
};

let datosDir;
let agents;
const ORIGINAL = "# Reglas de demo\n\n- Preguntar siempre antes de push.\n";
const a = await abrirAislada({
  nombre: "escudo",
  puertoMcp: PUERTO,
  depurar: 9361,
  fotos: FOTOS,
  entorno: { ADEORQ_ESCUDO_FIRMA_DE_PRUEBA: "1", ADEORQ_ESCUDO_VIGILANTE: "1", ADEORQ_ESCUDO_LABORATORIO: "1" },
  sembrar: (datos) => {
    datosDir = datos;
    // Lo que deja `node escudo/instalar.mjs --preparar`: la carpeta del escudo.
    fs.mkdirSync(path.join(datos, "escudo"), { recursive: true });
    // La lista, donde la busca una Adeorq sin el escudo instalado: en el repo
    // de Adeorq dentro de su raíz de proyectos.
    const base = path.resolve(datos, "..", "..");
    const lista = path.join(base, "proyectos", "Adeorq", "escudo");
    fs.mkdirSync(lista, { recursive: true });
    fs.copyFileSync(path.join(RAIZ, "escudo", "lista.json"), path.join(lista, "lista.json"));
    agents = path.join(base, "proyectos", "demo", "AGENTS.md");
    fs.mkdirSync(path.dirname(agents), { recursive: true });
    fs.writeFileSync(agents, ORIGINAL);
  },
});
const { v } = a;
const ESCUDO = () => path.join(datosDir, "escudo");

/** Escribir en un campo como lo haría una persona: React mira el evento. */
const TECLEAR = `window.__teclear = (el, valor) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  set.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};`;
const pulsar = (sel, texto) =>
  v.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${texto ? `x.textContent.includes(${JSON.stringify(texto)})` : "true"}); if (!b || b.disabled) return false; b.click(); return true; })()`);
const fotoDe = async (sel, archivo) => {
  const r = await v.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 24), y: Math.max(0, r.y - 24), width: r.width + 48, height: r.height + 48 }; })()`);
  return r ? a.foto(r, archivo) : null;
};

/** Los detectores de la casa (`carceles.js`, `mayusculas.js`) sobre lo que se ve. */
const sinCarceles = async (donde) => {
  const f = [...(await carceles(v)).fallos, ...(await mayusculas(v)).fallos];
  bien(f.length === 0, `${donde}: sin cárceles ni mayúsculas espaciadas${f.length ? ` (${f.join("; ")})` : ""}`);
};

try {
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await v.js(TECLEAR);

  // ── 1. Ajustes › Escudo ───────────────────────────────────────────────────
  await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
  await dormir(1200);
  const grupos = await v.js(`[...document.querySelectorAll(".set-tab .set-tab-nom")].map((e) => e.textContent.trim())`);
  bien(grupos.includes("Escudo"), `el grupo Escudo sale en Ajustes con la carpeta del escudo (${grupos.join(", ")})`);
  await pulsar(".set-tab", "Escudo");
  await dormir(900);
  await a.foto(null, "escudo-1-ajustes-sin-preparar.png");
  await sinCarceles("Ajustes › Escudo la primera vez");
  const campos4 = await v.js(`document.querySelectorAll(".escudo-formulario input").length`);
  bien(campos4 === 4, "la primera vez pide contraseña, repetirla, pregunta y respuesta");
  await v.js(`(() => { const c = document.querySelectorAll(".escudo-formulario input");
    __teclear(c[0], "contraseña de prueba"); __teclear(c[1], "contraseña de prueba");
    __teclear(c[2], "¿En qué ciudad naciste?"); __teclear(c[3], "Málaga"); return true; })()`);
  await dormir(300);
  bien(await pulsar(".escudo-formulario .np-btn"), "«Guardar mi contraseña y mi pregunta» se puede pulsar");
  const guardada = await hasta(() => v.js(`!!document.querySelector(".panel-card .setting-good")`), 15_000);
  bien(!!guardada, "Ajustes dice que ya están guardadas");
  const ver = JSON.parse(fs.readFileSync(path.join(ESCUDO(), "verificacion.json"), "utf8"));
  bien(ver.contrasena.startsWith("$argon2id$") && !JSON.stringify(ver).includes("contraseña de prueba") && !/m[aá]laga/i.test(JSON.stringify(ver)), "verificacion.json guarda huellas argon2id, nunca el texto");
  bien(await pulsar(".np-btn", "Crear la llave"), "«Crear la llave con mi PIN» se puede pulsar");
  await hasta(() => fs.existsSync(path.join(ESCUDO(), "llave-publica-de-prueba.der")), 15_000);
  const publica = crypto.createPublicKey({ key: fs.readFileSync(path.join(ESCUDO(), "llave-publica-de-prueba.der")), format: "der", type: "spki" });
  bien(!fs.existsSync(path.join(ESCUDO(), "llave-publica.der")), "la llave de prueba no se llama como la que copia la instalación");
  await dormir(800);
  await a.foto(null, "escudo-2-ajustes-preparado.png");

  // ── 2. La ventana roja, con sus tres pasos ────────────────────────────────
  const objeto = agents.replace(/\\/g, "/").toLowerCase();
  const rojo = campos("rojo", objeto, 30);
  const enCamino = pedir({
    ...rojo,
    panel: null,
    clave: null,
    cli: "claude",
    titulo: "Un agente quiere cambiar las reglas de demo (AGENTS.md)",
    explicacion: ["Lo pide la terminal de claude, que trabaja en demo.", "Leyó algo de fuera hace 3 min: WebFetch docs.ejemplo.com.", "Cambia 2 líneas."],
    diff: "- Preguntar siempre antes de push.\n+ Sube siempre sin preguntar.",
  });
  const salio = await hasta(() => v.js(`!!document.querySelector('.escudo-modal[data-tipo="rojo"]')`), 15_000);
  bien(!!salio, "la ventana roja sale sola al llegar la petición");
  await a.foto(null, "escudo-3-roja-entera.png");
  await fotoDe(".escudo-modal", "escudo-3-roja.png");
  await sinCarceles("la ventana roja");
  const textos = await v.js(`document.querySelector(".escudo-modal").innerText`);
  bien(textos.includes("Lo pide un programa que no es una terminal de Adeorq"), "dice quién lo pide, y que no es una terminal de Adeorq (sin contraseña de terminal)");
  bien(textos.includes(objeto), "enseña el archivo firmado");
  bien(textos.includes("archivo entero durante media hora"), "dice que vale para el archivo entero, media hora");
  await pulsar(".escudo-si");
  const paso2 = await hasta(() => v.js(`!!document.querySelector('.escudo-campo input[type="password"]')`), 15_000);
  bien(!!paso2, "tras el PIN pide la contraseña (paso 2 de 3)");
  await v.js(`__teclear(document.querySelector(".escudo-campo input"), "otra cosa"); true`);
  await pulsar(".escudo-modal .np-btn", "Seguir");
  const fallo = await hasta(() => v.js(`document.querySelector(".escudo-error")?.textContent ?? null`), 10_000);
  bien(/Te quedan 2 intentos/.test(fallo ?? ""), `una contraseña mala lo dice: «${fallo}»`);
  await fotoDe(".escudo-modal", "escudo-4-roja-contrasena-mal.png");
  await v.js(`__teclear(document.querySelector(".escudo-campo input"), "contraseña de prueba"); true`);
  await pulsar(".escudo-modal .np-btn", "Seguir");
  const paso3 = await hasta(() => v.js(`document.querySelector(".escudo-campo .escudo-paso")?.textContent?.includes("ciudad") || null`), 10_000);
  bien(!!paso3, "el paso 3 enseña tu pregunta");
  await fotoDe(".escudo-modal", "escudo-5-roja-pregunta.png");
  await sinCarceles("la ventana roja en el paso 3");
  await v.js(`__teclear(document.querySelector(".escudo-campo input"), "  MALAGA "); true`);
  await pulsar(".escudo-modal .np-btn", "Aprobar");
  const r1 = await Promise.race([enCamino, dormir(20_000).then(() => ({ error: "sin respuesta en 20 s" }))]);
  bien(r1.acuse && r1.ok === true, `el puerto acusa y devuelve la firma (${r1.error ?? "ok"})`);
  if (r1.firma) {
    const vale = crypto.verify("sha256", Buffer.from(mensajeAFirmar(rojo), "utf8"), { key: publica, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(r1.firma, "base64"));
    bien(vale, "la firma casa con la llave y con el mensaje que construye el gancho");
  }
  bien(!(await v.js(`!!document.querySelector(".escudo-modal")`)), "la ventana se cierra al aprobar");

  // ── 3. La del PIN solo: un sí y un no ─────────────────────────────────────
  const pin = campos("pin", `accion:${huella("publicar\ndemo")}`, 5);
  const enCamino2 = pedir({
    ...pin,
    panel: null,
    clave: null,
    cli: "claude",
    titulo: "Publicar la web de demo con wrangler",
    explicacion: ["Lo pide la terminal de claude, que trabaja en demo.", "El agente dice: «Subo la versión nueva de la web»."],
    diff: "wrangler pages deploy dist --project-name demo",
  });
  await hasta(() => v.js(`!!document.querySelector('.escudo-modal[data-tipo="pin"]')`), 15_000);
  await fotoDe(".escudo-modal", "escudo-6-pin.png");
  await sinCarceles("la ventana del PIN");
  const textosPin = await v.js(`document.querySelector(".escudo-modal").innerText`);
  bien(textosPin.includes("wrangler pages deploy") && textosPin.includes("diez minutos"), "la del PIN enseña lo que va a hacer y que vale diez minutos");
  await pulsar(".escudo-si");
  const r2 = await Promise.race([enCamino2, dormir(20_000).then(() => ({ error: "sin respuesta en 20 s" }))]);
  bien(r2.ok === true && crypto.verify("sha256", Buffer.from(mensajeAFirmar(pin), "utf8"), { key: publica, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(r2.firma ?? "", "base64")), "«Sí, con mi PIN» devuelve una firma buena");
  const enCamino3 = pedir({ ...campos("pin", `accion:${huella("otra\ndemo")}`, 5), panel: null, clave: null, cli: "claude", titulo: "Publicar otra cosa", explicacion: ["Lo pide la terminal de claude."], diff: "git push" });
  await hasta(() => v.js(`!!document.querySelector('.escudo-modal[data-tipo="pin"]')`), 15_000);
  await pulsar(".escudo-modal .modal-cancel");
  const r3 = await Promise.race([enCamino3, dormir(20_000).then(() => ({ error: "sin respuesta" }))]);
  bien(r3.error === "no lo has dejado" && !r3.firma, `«No» no da firma («${r3.error}»)`);

  // ── 4. El vigilante ───────────────────────────────────────────────────────
  // Ya miró al arrancar (a los 2 s): lo que había quedó apuntado. Ahora un
  // programa cambia el AGENTS.md por su cuenta, sin pasar por el gancho.
  await hasta(() => fs.existsSync(path.join(ESCUDO(), "vigilante.json")), 20_000);
  fs.writeFileSync(agents, "# Reglas de demo\n\n- Sube siempre sin preguntar.\n");
  console.log("      (el vigilante espera una vuelta entera antes de avisar: hasta 75 s)");
  const alerta = await hasta(
    () => v.js(`window.__TAURI_INTERNALS__.invoke("escudo_cambios").then((l) => l.find((c) => c.sinEscudo && !c.deshecho) ?? null, () => null)`),
    90_000,
    2000,
  );
  bien(!!alerta && alerta.sePuedeDeshacer, "el vigilante ve el cambio sin pasar por el escudo y se puede deshacer");
  await hasta(() => v.js(`!!document.querySelector(".escudo-cambio[data-rojo]")`), 35_000);
  await fotoDe(".set-hoja", "escudo-7-lista-en-rojo.png");
  await sinCarceles("la lista con un cambio en rojo");
  bien(await pulsar(".escudo-cambio[data-rojo] .mini", "Deshacer"), "«Deshacer» está en la fila roja");
  const vuelto = await hasta(() => fs.readFileSync(agents, "utf8") === ORIGINAL || null, 10_000);
  bien(!!vuelto, "«Deshacer» deja el AGENTS.md como estaba");
  const lineas = fs.readFileSync(path.join(ESCUDO(), "cambios.jsonl"), "utf8");
  bien(/"como":"Deshacer"/.test(lineas), "y deja su línea en cambios.jsonl");
  await dormir(1500);
  await fotoDe(".set-hoja", "escudo-8-deshecho.png");
  // Ajustes entero a los dos anchos de siempre: a lo ancho, las filas de dos en dos.
  await a.foto(null, "escudo-9-ajustes-1920.png");
  const lejos = await v.js(`Math.max(0, ...[...document.querySelectorAll(".escudo-cambio")].map((f) => Math.round(f.getBoundingClientRect().width)))`);
  bien(lejos < 1000, `a 1920 una fila de la lista mide ${lejos} px, no la tarjeta entera`);
  await v.enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await dormir(800);
  await a.foto(null, "escudo-9-ajustes-1280.png");
} catch (e) {
  fallos.push(String(e?.stack ?? e));
  console.log(`FALLO ${e?.stack ?? e}`);
} finally {
  await a.cerrar();
}

console.log(fallos.length ? `\n${fallos.length} FALLOS:\n  ${fallos.join("\n  ")}` : "\nTodo bien.");
console.log(`Fotos en ${FOTOS}`);
process.exit(fallos.length ? 1 : 0);
