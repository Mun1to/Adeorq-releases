// La página del conserje en el móvil (`src-tauri/src/movil.html`) con un
// servidor de mentira que contesta como `movil.rs` y la ventana. Sirve para
// mirarla en un navegador a tamaño de móvil sin compilar Rust ni abrir la app.
//
//   node scripts/laboratorio/doble-movil.mjs [puerto]      (4390 por defecto)
//   IDIOMA=en node scripts/laboratorio/doble-movil.mjs 4392   (la app en inglés)
//
// El código de emparejar es 123456. Lo que se le escribe al conserje decide lo
// que contesta, como en `doble-conserje.js`:
//   · normal                abre dos sesiones (juicio y oficio)
//   · contiene «error»      la primera vez no contesta (sin cuota)
//   · contiene «pregunta»   contesta con una pregunta y no abre nada
// Una sesión pasa de «trabajando» a «te pregunta algo» a los veinte segundos.
// Y cinco terminales (decisión E3): lo que se les escribe o la tecla que se les
// manda aparece en su pantalla en la vuelta siguiente, y queda en la consola.
//
// Los bancos de esta carpeta se lanzan contra él sin volcar su código:
//   browser_run_code_unsafe(code = "async (page) => eval('(' + await (await
//     fetch('http://127.0.0.1:4390/laboratorio/movil-chat.js')).text() + ')')(page)")

import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// `PAGINA=<ruta>` sirve otra versión de la página, para mirar el antes y el después.
const PAGINA = process.env.PAGINA || path.join(RAIZ, "src-tauri", "src", "movil.html");
// `IDIOMA=en` la sirve como `movil.rs` con la app en inglés (`<html lang="en">`).
// Los datos de ejemplo siguen en español: son de los agentes, no de la página.
const INGLES = process.env.IDIOMA === "en";
const PUERTO = Number(process.argv[2]) || 4390;
const CLAVE = "clave-de-mentira";
const ARRANQUE = 111;

const ahora = () => Math.floor(Date.now() / 1000);
const convs = new Map();
const nueva = (id) => {
  if (!convs.has(id)) convs.set(id, { id, titulo: "", turnos: [], trabajos: [], router: true, creada: ahora() });
  return convs.get(id);
};
const vieja = nueva("vieja1");
vieja.titulo = "Revisar el contraste de la web";
vieja.turnos = [
  { n: 1, rol: "tu", texto: "Revisa el contraste de la web", resumen: "", cuando: ahora() - 7200 },
  { n: 2, rol: "conserje", texto: "Hecho: abrí una sesión en **Webs** para eso.", resumen: "", cuando: ahora() - 7190 },
];
vieja.trabajos = [{ panel: 4, cli: "claude", modelo: "sonnet", carpeta: "C:\\proyectos\\Webs", encargo: "Revisar el contraste de la portada", eligio: "router", porque: "Es oficio del día a día.", turno: 2, sesion: "s-vieja", arranque: 0, abierto: 0 }];

const subidas = new Map();
const adjuntos = [];
// Lo último que se le escribió a cada terminal, para que el banco lo lea.
const escrito = new Map();
const enCurso = new Map();
// Lo que pidió el chat a `/api/sesion` con `si`: «entera» o «igual», para el banco.
const pedidasSesion = [];
const abiertas = new Map(); // clave -> momento en que se abrió
let yaFallo = false;

// Los Ajustes del móvil. Qué avisos quiere este móvil (`PrefsAvisos` en
// movil.rs), si se olvidó a sí mismo, y cómo se ve el PC. De entrada el PC va
// sin foto y con el azul de fábrica, para no cambiarles la cara a los demás
// bancos ni a las fotos de la web; `/api/sembrar-aspecto` le pone una foto y
// otro acento. Con `FONDO=<ruta de una foto>` la foto es esa.
let avisosPrefs = { preguntas: true, terminadas: true, programados: true, silencio: false };
let olvidado = false;
const traspasos = [];
let aspecto = { acento: "#4d9fff", opacidad: 60, desenfoque: 0, foto: null };
if (process.env.FONDO) aspecto.foto = { tipo: /\.jpe?g$/i.test(process.env.FONDO) ? "image/jpeg" : "image/png", bytes: fs.readFileSync(process.env.FONDO), version: "fondo-de-fuera" };

/** Un PNG de un degradado, hecho aquí: una foto de prueba sin depender de ningún archivo. */
function pngDegradado(ancho, alto) {
  const tabla = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = tabla[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(ancho, 0);
  cab.writeUInt32BE(alto, 4);
  cab[8] = 8; // 8 bits por canal
  cab[9] = 2; // RGB
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const fila = y * (ancho * 3 + 1);
    for (let x = 0; x < ancho; x++) {
      const t = y / alto;
      const o = fila + 1 + x * 3;
      filas[o] = Math.round(40 + 200 * t);
      filas[o + 1] = Math.round(60 + 60 * (x / ancho));
      filas[o + 2] = Math.round(200 - 140 * t);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cab),
    trozo("IDAT", zlib.deflateSync(filas)),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// Las terminales de la Cabina, como las devuelve `atenderTerminal` de `lib/movil.ts`.
const terminales = [
  { panel: 1, nombre: "claude", carpeta: "C:\\proyectos\\Adeorq", agente: true, modelo: "opus", estado: "a_medias", sesion: "s-1", contexto: 64 },
  { panel: 2, nombre: "codex", carpeta: "C:\\proyectos\\crypto\\radar-bot", agente: true, modelo: "gpt-5.6-terra", estado: "pregunta", sesion: "s-2" },
  { panel: 3, nombre: "consola", carpeta: "C:\\proyectos\\Vidorq", agente: false, modelo: null, estado: "", sesion: null },
  { panel: 4, nombre: "claude", carpeta: "C:\\proyectos\\Webs", agente: true, modelo: "sonnet", estado: "pregunta", sesion: "s-4", contexto: 83 },
  // Una que ya terminó: en el chat, la mascota lo celebra.
  { panel: 5, nombre: "claude", carpeta: "C:\\proyectos\\VoCript", agente: true, modelo: "sonnet", estado: "lista", sesion: "s-5", contexto: 30 },
];
// La raya de lado a lado de Claude Code mide lo que el panel del PC: 78 columnas.
const RAYA = "─".repeat(78);
const pantallas = new Map([
  // Como la pinta Claude Code trabajando (copiada de la de Munir del 2026-10-09):
  // el paso en marcha, su comando, el giro con el tiempo, y la barra de abajo.
  [1, [
    "❯ Reproduzco el fallo antes de tocar nada.", "", "● Read(src/App.tsx)", "  ⎿  120 líneas", "",
    "● Listing 1 directory, calling adeorq 2 times, running 1 shell command…",
    "  ⎿  $ curl -s -m 5 http://127.0.0.1:3013/ | grep -c -E \"pintarDecisiones|Decisiones\"",
    "", "· Gallivanting… (26s · ↓ 1.7k tokens)", "  ⎿  Tip: You have 2 plugins you haven't used lately.", "",
    `${"─".repeat(46)} Adeorq: sesiones y terminales ─`, "❯ ", RAYA,
  ]],
  // Un permiso de Claude Code esperando respuesta.
  [4, [
    "● Bash(pnpm publicar-version notas.md)", "", RAYA, " Bash command", "",
    "   pnpm publicar-version notas.md", "   Publish the release", "",
    " Do you want to proceed?", " ❯ 1. Yes", "   2. Yes, and don't ask again for pnpm publicar-version commands in C:\\proyectos\\Webs",
    "   3. No, and tell Claude what to do differently (esc)", "",
  ]],
  [2, ["Do you want to run `cargo check`?", "", "  1. Yes", "  2. No, and tell Codex what to do differently", "", "> "]],
  [5, ["● El dictado ya no se corta al cambiar de ventana.", "", RAYA, "❯ ", RAYA]],
  // Una consola con historial: 150 líneas de un `cargo build`, más anchas que el móvil.
  [3, [...Array.from({ length: 150 }, (_, i) => `   Compiling crate-numero-${i} v0.${i}.0 (C:\\Users\\Muni\\.cargo\\registry\\src\\index.crates.io-1949cf8c6b5b557f\\crate-${i})`), "PS C:\\proyectos\\Vidorq> "]],
]);
const terminalDe = (panel) => terminales.find((t) => t.panel === Number(panel));
// El programa de cada una, como lo saca la ventana de su orden de arranque.
const cliDe = (t) => (t.nombre === "consola" ? "shell" : t.nombre);
// Como `mismo_arranque` (movil.rs): sin arranque es una página de antes de
// actualizar, y con el de otro día, otra terminal con el mismo número.
const deOtroArranque = (a) => a == null || a === ""
  ? [409, "Esta página es de antes de actualizar Adeorq: recárgala."]
  : Number(a) !== ARRANQUE ? [410, "Esa terminal era de antes de reiniciar Adeorq: ese número ya es de otra o de ninguna."] : null;
// El modo de Claude Code del panel 1: Shift+Tab pasa al siguiente, y la línea
// de abajo lo dice como lo pinta Claude Code (nada en el normal).
const MODOS = ["", "⏵⏵ accept edits on (shift+tab to cycle)", "⏸ plan mode on (shift+tab to cycle)", "⏵⏵ auto mode on (shift+tab to cycle)"];
const modo = new Map([[1, 3]]);

// Las decisiones que pide un agente con `ask_decision` (decisiones.rs): una
// que sigue viva (la pidió el panel 1 de este arranque, que sigue abierto),
// con dos preguntas y su recomendada; dos que ya no espera nadie (su terminal
// se cerró, o son de otro arranque de Adeorq) y otra ya contestada.
const decisiones = [
  {
    id: "d19a2b3c4c1", titulo: "Nombre del módulo", proyecto: "Vidorq", panel: 7, arranque: ARRANQUE, creada: Date.now() - 26 * 3600000,
    preguntas: [{ id: "A", titulo: "¿Cómo lo llamo?", opciones: [{ texto: "timeline" }, { texto: "linea-de-tiempo", recomendada: true }] }],
  },
  {
    id: "d19a2b3c4c0", titulo: "Color del botón de pagar", proyecto: "Webs", panel: 1, arranque: 1, creada: Date.now() - 5 * 24 * 3600000,
    preguntas: [{ id: "A", titulo: "¿Cuál?", opciones: [{ texto: "El azul de la casa", recomendada: true }, { texto: "Verde" }] }],
  },
  {
    id: "d19a2b3c4d5", titulo: "Diseño de la web", contexto: "Dos cosas que se ven en adeorq.com y en la guía.",
    proyecto: "Adeorq", panel: 1, arranque: ARRANQUE, creada: Date.now() - 6 * 60000,
    preguntas: [
      { id: "A", titulo: "La barra de la guía", contexto: "Hoy la guía tiene su propia barra, con otros enlaces.", opciones: [
        { texto: "Como está", recomendada: false },
        { texto: "La barra de la portada", detalle: "Una sola barra que mantener; la guía sigue el tema del sistema", recomendada: true },
        { texto: "Barra de la portada y guía siempre oscura", recomendada: false },
      ] },
      { id: "B", titulo: "El menú en el móvil", opciones: [
        { texto: "Como está", recomendada: false },
        { texto: "Un botón de menú", detalle: "Cerrado no ocupa nada", recomendada: true },
        { texto: "Una fila que se desliza", recomendada: false },
      ] },
    ],
  },
  {
    id: "d19a2b3c4d0", titulo: "Nombre de la rama", proyecto: "Vidorq", panel: 3, arranque: 1, creada: Date.now() - 3 * 3600000,
    preguntas: [{ id: "A", titulo: "¿Cómo la llamo?", opciones: [{ texto: "feat/timeline" }, { texto: "timeline-v2", recomendada: true }] }],
    respuesta: { cuando: Date.now() - 2 * 3600000, desde: "Android · Chrome", entregada: true, elecciones: { A: { opcion: 2 } } },
  },
];
// Como `vigencia` (decisiones.rs): viva si la terminal que preguntó sigue
// abierta en este arranque; si no, ya no la espera nadie.
const cerrada = (d) => Number(Boolean(d.respuesta || d.descartada));
const vigenciaDe = (d) =>
  d.respuesta ? "contestada" : d.descartada ? "descartada" : d.hablada ? "hablada"
    : d.arranque === ARRANQUE && terminales.some((t) => t.panel === d.panel) ? "viva" : "huerfana";
// La del panel 1 tiene historia larga y acaba en un cierre con su bloque de
// compactación, que es lo que Munir no podía leer entero desde el móvil.
const sesionLarga = [];
for (let i = 1; i <= 30; i++) {
  sesionLarga.push({ rol: "tu", texto: `Paso ${i}: sigue con el scroll`, hora: "", herramientas: [] });
  sesionLarga.push({
    rol: "agente", texto: `Paso ${i} hecho. Medí la distancia al final con el panel a 180 columnas y bajándolo a 73: pasa de 0 a ${300 + i}.`,
    hora: `2026-10-09T10:${String(i).padStart(2, "0")}:00Z`, herramientas: ["Read", "Edit"],
    pasos: [{ clase: "herramienta", nombre: "Read", detalle: "scrollTerm.ts" }, { clase: "herramienta", nombre: "Edit", detalle: "scrollTerm.ts" }],
  });
}
// Lo que traen las respuestas de un Claude Code de verdad: títulos, tablas,
// citas y cientos de herramientas en un turno.
sesionLarga.push({ rol: "tu", texto: "¿Cómo quedó?", hora: "", herramientas: [] });
sesionLarga.push({
  rol: "agente",
  texto: [
    "## Resumen de la sesión",
    "Quedó así:",
    "",
    "| Pieza | Antes | Ahora | Por qué |",
    "|---|---:|---:|---|",
    "| `scrollTerm.ts` | 0 | 301 | la distancia se guarda antes de cambiar el ancho |",
    "| `TerminalPane.tsx` | 12 | 0 | ya no repinta dos veces |",
    "",
    "> Medido con el panel a 180 columnas y a 73.",
    "",
    "### Lo que falta",
    "- Probarlo en el móvil",
  ].join("\n"),
  hora: "",
  herramientas: [...Array(90).fill("Read"), ...Array(40).fill("Bash"), ...Array(20).fill("mcp__playwright__browser_click"), "Edit"],
  pasos: [
    ...Array.from({ length: 29 }, (_, i) => ({ clase: "herramienta", nombre: "Bash", detalle: `Medir el scroll con el panel a ${180 - i * 3} columnas` })),
    { clase: "herramienta", nombre: "Edit", detalle: "scrollTerm.ts" },
  ],
});
sesionLarga.push({ rol: "tu", texto: "/fin", hora: "", herramientas: [] });
sesionLarga.push({
  rol: "agente",
  texto: [
    "**El scroll ya no salta al cambiar el ancho.**",
    "",
    "## Mensaje de compactación",
    "```",
    "# COMPACTACIÓN, Sesión Adeorq (2026-10-08)",
    "",
    "## Qué se hizo (en orden)",
    ...Array.from({ length: 24 }, (_, i) => `${i + 1}. src/lib/scrollTerm.ts: la distancia al final se guarda antes de cambiar el ancho y se repone después, paso ${i + 1} de una línea bastante larga para un móvil`),
    "",
    "## Pendiente",
    "- FIN-DEL-BLOQUE",
    "```",
  ].join("\n"),
  hora: "",
  herramientas: [],
});

// `SESION=<ruta .jsonl>` cambia esa historia por la de un transcript de verdad,
// leído con las mismas reglas que `turnos_de` (sessions.rs): una sesión real
// trae títulos, tablas y cientos de herramientas por turno, que el ejemplo no.
if (process.env.SESION) {
  const datos = fs.readFileSync(process.env.SESION);
  const lineas = datos.subarray(Math.max(0, datos.length - 1_500_000)).toString("utf8").split("\n");
  const fontaneria = /^\s*(<command-name>|<local-command-|<system-reminder>|<command-message>|Caveat: The messages below were generated)/;
  const turnos = [];
  for (const l of lineas) {
    let v;
    try { v = JSON.parse(l); } catch { continue; }
    if ((v.type !== "user" && v.type !== "assistant") || v.isSidechain || v.isCompactSummary || v.isMeta) continue;
    const c = v.message?.content;
    const texto = (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "").trim();
    const usos = Array.isArray(c) ? c.filter((b) => b.type === "tool_use") : [];
    const herramientas = usos.map((b) => b.name);
    // Como `clasificar_uso` (sessions.rs), lo justo para ver los pasos.
    const pasos = usos.map((b) => {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(b.name);
      if (mcp) return { clase: "mcp", nombre: mcp[1], detalle: mcp[2] };
      const i = b.input || {};
      const detalle = i.description || (i.file_path ? String(i.file_path).split(/[\\/]/).pop() : "") || i.pattern || i.command || "";
      return { clase: "herramienta", nombre: b.name, detalle: String(detalle).replace(/\s+/g, " ").slice(0, 48) };
    });
    if ((!texto && !herramientas.length) || (texto && fontaneria.test(texto))) continue;
    const rol = v.type === "assistant" ? "agente" : "tu";
    const ult = turnos.at(-1);
    if (ult?.rol === rol) {
      if (texto) ult.texto += (ult.texto ? "\n\n" : "") + texto;
      ult.herramientas.push(...herramientas);
      ult.pasos = [...ult.pasos, ...pasos].slice(-30);
    } else turnos.push({ rol, texto, hora: v.timestamp || "", herramientas, pasos: pasos.slice(-30) });
  }
  sesionLarga.splice(0, sesionLarga.length, ...turnos.slice(-80));
  console.log(`sesión de verdad: ${sesionLarga.length} turnos de ${process.env.SESION}`);
}

function estadosDe(conv) {
  const estados = {};
  const sesiones = {};
  for (const w of conv.trabajos) {
    const clave = `${w.arranque}:${w.panel}`;
    const desde = abiertas.get(clave);
    estados[clave] = w.arranque !== ARRANQUE || !desde ? "cerrada" : Date.now() - desde > 20000 ? "pregunta" : "trabajando";
    if (w.sesion) sesiones[clave] = w.sesion;
  }
  return estados;
}

function contestar(conv, texto) {
  const t = texto.toLowerCase();
  enCurso.set(conv.id, { pensando: true, paso: "Mirando tus proyectos", texto, aviso: null, error: null });
  setTimeout(() => {
    if (t.includes("error") && !yaFallo) {
      yaFallo = true;
      enCurso.set(conv.id, { pensando: false, paso: "", texto, aviso: null, error: "claude devolvió error: te has quedado sin cuota de esta semana" });
      return;
    }
    const n = conv.turnos.length + 1;
    if (t.includes("pregunta")) {
      conv.turnos.push({ n, rol: "conserje", texto: "¿Cuál de los dos radares? Tienes **radar-bot** y **launlab**. Dime cuál y lo abro.", resumen: "", cuando: ahora() });
    } else {
      conv.turnos.push({ n, rol: "conserje", texto: "Son dos trabajos distintos, así que abro dos sesiones:\n\n- una en **Adeorq** para el scroll\n- otra en **radar-bot** para las caídas\n\nTe aviso cuando alguna te pregunte algo.", resumen: "", cuando: ahora() });
      for (const [panel, carpeta, modelo, encargo, porque] of [
        [1, "C:\\proyectos\\Adeorq", "opus", "Que el scroll de las terminales no salte al cambiar el ancho", "Es de los de juicio: si sale mal y no se nota, sale caro."],
        [2, "C:\\proyectos\\crypto\\radar-bot", "sonnet", "Encontrar por qué el radar se cae cada dos horas, sin tocar el bot en marcha", "Es oficio del día a día."],
      ]) {
        conv.trabajos.push({ panel, cli: "claude", modelo, carpeta, encargo, eligio: conv.router ? "router" : "tu", porque, turno: n, sesion: `s-${panel}`, arranque: ARRANQUE, abierto: ahora() });
        abiertas.set(`${ARRANQUE}:${panel}`, Date.now());
      }
    }
    enCurso.set(conv.id, { pensando: false, paso: "", texto, aviso: null, error: null });
  }, 3000);
}

function json(res, estado, v) {
  res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(v));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      const v = cuerpo ? JSON.parse(cuerpo) : {};
      if (url.pathname === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        const pagina = fs.readFileSync(PAGINA, "utf8");
        return res.end(INGLES ? pagina.replace('<html lang="es">', '<html lang="en">') : pagina);
      }
      if (url.pathname === "/api/emparejar") {
        return v.codigo === "123456" ? json(res, 200, { clave: CLAVE, nombre: v.nombre }) : json(res, 403, { error: "Ese código no es." });
      }
      // El service worker de los avisos, en corto: lo de verdad está en `movil.rs`.
      if (url.pathname === "/sw.js") {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        return res.end(`self.addEventListener("push", (e) => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.titulo || "Conserje", { body: d.cuerpo || "" })); });`);
      }
      // Los bancos de esta carpeta, para lanzarlos sin volcarlos enteros en la
      // conversación de quien prueba: se piden aquí y se evalúan, en vez de
      // pasarlos por `filename`. Solo los `.js` de al lado, por su nombre.
      const banco = /^\/laboratorio\/([a-z-]+\.js)$/.exec(url.pathname);
      if (banco && req.method === "GET") {
        const ruta = path.join(RAIZ, "scripts", "laboratorio", banco[1]);
        if (!fs.existsSync(ruta)) return json(res, 404, { error: "Ese banco no existe." });
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(fs.readFileSync(ruta, "utf8"));
      }
      if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "Aquí no hay nada." });
      if (olvidado || req.headers.authorization !== `Bearer ${CLAVE}`) return json(res, 401, { error: "Este móvil no está emparejado." });
      const id = url.searchParams.get("id") || v.id;
      switch (url.pathname) {
        case "/api/yo":
          return json(res, 200, { nombre: "Android", avisos: avisosPrefs });
        case "/api/avisos": {
          const claves = ["preguntas", "terminadas", "programados", "silencio"];
          if (claves.some((k) => k in v && typeof v[k] !== "boolean")) return json(res, 400, { error: "Eso no son avisos." });
          avisosPrefs = { ...avisosPrefs, ...Object.fromEntries(claves.filter((k) => k in v).map((k) => [k, v[k]])) };
          console.log(`avisos: ${JSON.stringify(avisosPrefs)}`);
          return json(res, 200, { ok: true, avisos: avisosPrefs });
        }
        case "/api/olvidarme":
          olvidado = true;
          console.log("el móvil se olvidó a sí mismo");
          return json(res, 200, { ok: true });
        case "/api/apariencia":
          return json(res, 200, {
            acento: aspecto.acento, opacidad: aspecto.opacidad, desenfoque: aspecto.desenfoque,
            fondo: aspecto.foto ? { video: false, version: aspecto.foto.version } : null,
          });
        case "/api/fondo":
          if (!aspecto.foto) return json(res, 404, { error: "Tu PC no tiene foto de fondo." });
          res.writeHead(200, { "Content-Type": aspecto.foto.tipo, "Cache-Control": "no-store" });
          return res.end(aspecto.foto.bytes);
        // Solo del banco: el PC con foto y otro acento, o como venía (`{}`).
        case "/api/sembrar-aspecto":
          aspecto = {
            acento: v.acento ?? "#4d9fff", opacidad: v.opacidad ?? 60, desenfoque: v.desenfoque ?? 0,
            foto: v.foto ? { tipo: "image/png", bytes: pngDegradado(120, 180), version: String(v.foto) } : null,
          };
          return json(res, 200, { ok: true });
        // Solo del banco: lo que el PC sabe de los avisos de este móvil.
        case "/api/avisos-guardados":
          return json(res, 200, { avisos: avisosPrefs, olvidado });
        case "/api/lista":
          return json(res, 200, [...convs.values()].filter((c) => c.turnos.length).map((c) => ({ id: c.id, titulo: c.titulo, cuando: c.turnos.at(-1).cuando, trabajos: c.trabajos.length, ...(c.trabajos.length ? { carpeta: c.trabajos.at(-1).carpeta } : {}) })));
        case "/api/conversacion": {
          const c = nueva(id);
          return json(res, 200, { conversacion: c, vivo: { estados: estadosDe(c), sesiones: {}, en_curso: enCurso.get(id) ?? null } });
        }
        case "/api/enviar": {
          const c = nueva(id);
          if (!(c.turnos.at(-1)?.rol === "tu" && c.turnos.at(-1)?.texto === v.texto)) {
            c.turnos.push({ n: c.turnos.length + 1, rol: "tu", texto: v.texto, resumen: "", cuando: ahora() });
          }
          if (!c.titulo) c.titulo = v.texto.slice(0, 60);
          contestar(c, v.texto);
          return json(res, 202, { ok: true });
        }
        case "/api/mejorar":
          return setTimeout(() => json(res, 200, { texto: "Dos encargos, por orden:\n1. El radar se cae cada dos horas: busca la causa.\n2. El scroll de las terminales: mira qué pasa." }), 600);
        case "/api/router":
          nueva(id).router = v.encendido;
          return json(res, 200, { ok: true });
        // Como `conserje_olvidar`: el fichero de la conversación se borra.
        case "/api/olvidar":
          convs.delete(v.id);
          return json(res, 200, { ok: true });
        // Como `programados_listar`: uno que se lanza ahora, uno que salió bien,
        // uno apagado y uno que paró el freno.
        case "/api/programados":
          return json(res, 200, {
            puede: true,
            reloj: true,
            encargos: [
              { id: "p1", nombre: "Repaso de la mañana", cwd: "C:\\proyectos\\Adeorq", cli: "claude", cuando: { tipo: "semanal", dias: [1, 2, 3, 4, 5], hora: "09:00" }, activo: true, ultima: Date.now() - 3600000, ultimas: [{ cuando: Date.now() - 3600000, resultado: "hecho", detalle: "" }], corrida: null, cortado: null },
              { id: "p2", nombre: "Mirar la cuota", cwd: "C:\\proyectos", cli: "codex", cuando: { tipo: "cada", horas: 6 }, activo: true, ultima: Date.now() - 60000, ultimas: [], corrida: { inicio: Date.now() - 60000, panel: 1 }, cortado: null },
              { id: "p3", nombre: "Limpiar el scratchpad", cwd: "C:\\proyectos", cli: "claude", cuando: { tipo: "semanal", dias: [7], hora: "20:00" }, activo: false, ultima: 0, ultimas: [], corrida: null, cortado: null },
              { id: "p4", nombre: "Subir las fotos", cwd: "C:\\proyectos\\Webs", cli: "claude", cuando: { tipo: "semanal", dias: [1, 3, 5], hora: "18:30" }, activo: true, ultima: Date.now() - 86400000, ultimas: [{ cuando: Date.now() - 86400000, resultado: "fallo", detalle: "no contestó" }], corrida: null, cortado: { cuando: Date.now() - 86400000, motivo: "tres fallos seguidos" } },
            ],
          });
        // Como la ventana (`atenderPedido`, clase «uso»): una que dice su
        // gasto, una casi llena, una que no lo dice y una sin sesión.
        // Con las ventanas de cada cuenta, como `ventanasDe` (lib/movil.ts): la
        // de Principal se renueva en dos horas y su semana el próximo lunes.
        case "/api/uso": {
          const hora = 3_600_000;
          const lunes = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(9, 0, 0, 0); return d.getTime(); })();
          return json(res, 200, {
            cuentas: [
              { nombre: "Principal", programa: "Claude Code", agente: true, instalada: true, conectada: true, gastado: 52, plan: "max",
                ventanas: [{ clave: "sesión", modelo: null, gastado: 37, renueva: Date.now() + 2 * hora + 60_000 }, { clave: "semana", modelo: null, gastado: 52, renueva: lunes }] },
              { nombre: "CCC", programa: "Claude Code", agente: true, instalada: true, conectada: true, gastado: 91, plan: "pro",
                ventanas: [{ clave: "sesión", modelo: null, gastado: 91, renueva: Date.now() + 40 * 60_000 }, { clave: "semana", modelo: "Fable", gastado: 64, renueva: lunes }] },
              { nombre: "Codex", programa: "Codex", agente: true, instalada: true, conectada: true, gastado: null, plan: null },
              { nombre: "Gemini", programa: "Gemini CLI", agente: true, instalada: true, conectada: false, gastado: null, plan: null },
            ],
          });
        }
        case "/api/cerebro":
          if (!["haiku", "sonnet", "opus"].includes(v.cerebro)) return json(res, 400, { error: "No es de la lista." });
          nueva(id).cerebro = v.cerebro;
          return json(res, 200, { ok: true });
        // Los avisos: la clave pública del ejemplo de la RFC 8291 (un punto
        // P-256 válido, que el navegador comprueba) y la suscripción guardada.
        case "/api/push/clave":
          return json(res, 200, { clave: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8" });
        case "/api/push/suscribir":
          if (!String(v.endpoint || "").startsWith("https://") || !v.p256dh || !v.auth) return json(res, 400, { error: "La suscripción no está completa." });
          console.log(`suscrito a avisos: ${v.endpoint.slice(0, 60)}…`);
          return json(res, 200, { ok: true });
        case "/api/push/olvidar":
          console.log("avisos quitados");
          return json(res, 200, { ok: true });
        case "/api/fijo":
          if (v.modelo && !["haiku", "sonnet", "opus"].includes(v.modelo)) return json(res, 400, { error: "No es de la lista." });
          nueva(id).fijo = v.modelo;
          return json(res, 200, { ok: true });
        case "/api/parar":
          return json(res, 200, { ok: true });
        case "/api/terminales":
          return json(res, 200, { terminales, arranque: ARRANQUE });
        case "/api/terminal": {
          const t = terminalDe(url.searchParams.get("panel"));
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          const otro = deOtroArranque(url.searchParams.get("arranque"));
          if (otro) return json(res, otro[0], { error: otro[1] });
          const linea = MODOS[modo.get(t.panel) ?? 0];
          // Como la ventana (`lib/movil.ts`): qué programa es, a qué modelos se
          // cambia en marcha y si tiene modos. Codex no cambia de modelo en vivo.
          const cli = cliDe(t);
          const modelos = cli === "claude" ? ["haiku", "sonnet", "opus", "fable"].map((a) => ({ alias: a, nombre: a[0].toUpperCase() + a.slice(1) })) : [];
          const filas = [...(pantallas.get(t.panel) || []), ...(linea ? [linea] : [])];
          // Las de agente, con color como las manda la ventana (`historiaConColor`):
          // el «●» de cada paso en verde y su nombre en negrita, lo de debajo tenue,
          // el giro en ámbar y el «❯» en azul. Y en pantalla alternativa.
          const trozos = cli === "claude" ? filas.map((f) => {
            if (/^● /.test(f)) return [["●", "#4eba65", 0], [f.slice(1), "", 1]];
            if (/^\s+⎿/.test(f)) return [[f, "#999999", 2]];
            if (/^· /.test(f)) return [[f, "#ffc107", 0]];
            if (/^❯/.test(f)) return [["❯", "#b1b9f9", 0], [f.slice(1), "", 0]];
            return [[f, "", 0]];
          }) : undefined;
          return json(res, 200, { ...t, cli, modelos, modos: cli === "claude", alterna: t.agente, filas, ...(trozos ? { trozos } : {}) });
        }
        // Como la ventana: lo hace el panel del PC; aquí se apunta para el banco.
        case "/api/terminal/traspaso": {
          if (!["compactar", "nueva"].includes(v.que)) return json(res, 400, { error: "Eso no se le pide a una terminal." });
          const otro = deOtroArranque(v.arranque);
          if (otro) return json(res, otro[0], { error: otro[1] });
          const t = terminalDe(v.panel);
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          traspasos.push(`${t.panel}:${v.que}`);
          return json(res, 202, { ok: true });
        }
        // Solo del banco: lo que se pidió compactar o rehacer.
        case "/api/traspasos":
          return json(res, 200, traspasos);
        case "/api/terminal/modelo": {
          if (!["haiku", "sonnet", "opus", "fable"].includes(v.modelo)) return json(res, 400, { error: "Ese modelo no se pide desde el móvil." });
          const otro = deOtroArranque(v.arranque);
          if (otro) return json(res, otro[0], { error: otro[1] });
          const t = terminalDe(v.panel);
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          if (cliDe(t) !== "claude") return json(res, 409, { error: "Esta terminal no cambia de modelo en marcha." });
          t.modelo = v.modelo;
          pantallas.get(t.panel)?.push(`❯ /model ${v.modelo}`, `  ⎿  Set model to ${v.modelo}`);
          console.log(`modelo en ${t.panel}: ${v.modelo}`);
          return json(res, 202, { ok: true });
        }
        case "/api/terminal/escribir": {
          const t = terminalDe(v.panel);
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          const otro = deOtroArranque(v.arranque);
          if (otro) return json(res, otro[0], { error: otro[1] });
          const f = pantallas.get(t.panel);
          f[f.length - 1] += v.texto;
          f.push("", `● (el agente leyó: ${v.texto})`, "", "❯ ");
          escrito.set(t.panel, v.texto);
          console.log(`escrito en ${t.panel}: ${v.texto}`);
          // Como `marcar_habladas` (decisiones.rs): escribirle a una terminal
          // cierra lo que te hubiera preguntado.
          for (const d of decisiones) {
            if (d.panel === t.panel && d.arranque === ARRANQUE && !d.respuesta && !d.descartada && !d.hablada) d.hablada = Date.now();
          }
          return json(res, 202, { ok: true });
        }
        case "/api/escrito":
          return json(res, 200, { texto: escrito.get(Number(url.searchParams.get("panel"))) ?? null });
        case "/api/terminal/tecla": {
          if (!["esc", "shift+tab"].includes(v.tecla)) return json(res, 400, { error: "Esa tecla no se manda desde el móvil." });
          const otro = deOtroArranque(v.arranque);
          if (otro) return json(res, otro[0], { error: otro[1] });
          const f = pantallas.get(Number(v.panel));
          if (!f) return json(res, 404, { error: "Esa terminal ya no está." });
          if (v.tecla === "shift+tab") {
            modo.set(Number(v.panel), ((modo.get(Number(v.panel)) ?? 0) + 1) % MODOS.length);
            return json(res, 202, { ok: true });
          }
          f.push(`(tecla: ${v.tecla})`, "❯ ");
          console.log(`tecla en ${v.panel}: ${v.tecla}`);
          return json(res, 202, { ok: true });
        }
        // Los adjuntos, a trozos como en `guardar_trozo`: se cuentan los bytes y
        // con el último se contesta la ruta donde quedaría en el PC.
        case "/api/adjuntar": {
          const s = subidas.get(v.id) || { siguiente: 0, bytes: 0 };
          if (v.parte === 0) Object.assign(s, { siguiente: 0, bytes: 0 });
          if (v.parte !== s.siguiente || !v.datos) return json(res, 400, { error: "Ese trozo no toca ahora: vuelve a adjuntarlo." });
          s.siguiente++;
          s.bytes += Buffer.from(v.datos, "base64").length;
          subidas.set(v.id, s);
          if (s.siguiente < v.total) return json(res, 200, { ok: true });
          subidas.delete(v.id);
          const ruta = `C:\\Users\\Muni\\AppData\\Local\\Adeorq\\pastes\\movil-${Date.now()}-${String(v.nombre).replace(/[^A-Za-z0-9._-]/g, "_")}`;
          adjuntos.push({ ruta, bytes: s.bytes });
          console.log(`adjunto: ${ruta} (${s.bytes} bytes)`);
          return json(res, 200, { ruta });
        }
        case "/api/adjuntos":
          return json(res, 200, adjuntos);
        case "/api/decisiones":
          return json(res, 200, { decisiones: decisiones
            .slice()
            .sort((a, b) => cerrada(a) - cerrada(b) || b.creada - a.creada)
            .map((d) => ({
              id: d.id, titulo: d.titulo, proyecto: d.proyecto, panel: d.panel, creada: d.creada, preguntas: d.preguntas.length,
              contestada: Boolean(d.respuesta), vigencia: vigenciaDe(d), cerrada: d.respuesta?.cuando ?? d.descartada ?? d.hablada ?? null,
            })) });
        case "/api/decision": {
          const d = decisiones.find((x) => x.id === url.searchParams.get("id"));
          return d ? json(res, 200, { ...d, vigencia: vigenciaDe(d) }) : json(res, 404, { error: "Esa decisión ya no está." });
        }
        // Solo del banco: una decisión recién pedida por una terminal abierta.
        case "/api/sembrar-decision":
          decisiones.push({
            id: v.id, titulo: v.titulo, proyecto: v.proyecto, panel: v.panel, arranque: ARRANQUE, creada: Date.now(),
            contexto: v.contexto,
            preguntas: v.preguntas ?? [{ id: "A", titulo: "¿Sí o no?", opciones: [{ texto: "Sí" }, { texto: "No" }] }],
          });
          return json(res, 200, { ok: true });
        // Como `descartar` y `aviso_de_descarte` (decisiones.rs): a la terminal
        // que seguía esperándola se le escribe que no espere; a las demás, nada.
        case "/api/decision/descartar": {
          const d = decisiones.find((x) => x.id === v.id);
          if (!d) return json(res, 404, { error: "Esa decisión ya no está." });
          if (d.respuesta) return json(res, 409, { error: "Esa decisión ya está contestada." });
          const avisada = vigenciaDe(d) === "viva";
          d.descartada ??= Date.now();
          if (avisada) escrito.set(d.panel, `Munir ha descartado la decisión «${d.titulo}» (${d.id}) sin contestarla: no esperes respuesta.`);
          console.log(`decisión ${d.id} descartada${avisada ? `, y se le dice al panel ${d.panel}` : ""}`);
          return json(res, 200, { ok: true, avisada, panel: d.panel });
        }
        case "/api/decision/responder": {
          const d = decisiones.find((x) => x.id === v.id);
          if (!d) return json(res, 400, { error: "Esa decisión ya no está." });
          if (d.respuesta) return json(res, 409, { error: "Esa decisión ya está contestada." });
          if (d.descartada) return json(res, 400, { error: "Esa decisión está descartada." });
          for (const q of d.preguntas) {
            const e = v.elecciones?.[q.id] || {};
            if (e.opcion && (e.opcion < 1 || e.opcion > q.opciones.length)) return json(res, 400, { error: `La pregunta ${q.id} no tiene opción ${e.opcion}.` });
            if (!e.opcion && !e.texto) return json(res, 400, { error: `Falta contestar la pregunta ${q.id}.` });
          }
          d.respuesta = { cuando: Date.now(), desde: "el banco", entregada: true, elecciones: v.elecciones };
          const texto = `Munir ha contestado a «${d.titulo}» (decisión ${d.id}): ${JSON.stringify(v.elecciones)}`;
          escrito.set(d.panel, texto);
          console.log(`decisión ${d.id} contestada: ${JSON.stringify(v.elecciones)}`);
          return json(res, 200, { ok: true, entregada: true, panel: d.panel });
        }
        case "/api/sesion":
          // Codex no escribe en `~/.claude`: su sesión no está en el disco.
          if (url.searchParams.get("id") === "s-2") return json(res, 404, { error: "esa conversación no está en el disco" });
          // Con `si`, como `/api/sesion` en movil.rs: «igual» si la firma es la de ahora.
          if (url.searchParams.has("si")) {
            const firma = crypto.createHash("sha1").update(JSON.stringify(sesionLarga)).digest("hex").slice(0, 16);
            pedidasSesion.push(url.searchParams.get("si") === firma ? "igual" : "entera");
            return json(res, 200, url.searchParams.get("si") === firma ? { firma, igual: true } : { firma, turnos: sesionLarga });
          }
          return json(res, 200, sesionLarga);
        case "/api/pedidas-sesion":
          return json(res, 200, pedidasSesion);
        default:
          return json(res, 404, { error: "Aquí no hay nada." });
      }
    });
  })
  .listen(PUERTO, "127.0.0.1", () => console.log(`doble del móvil en http://127.0.0.1:${PUERTO}/`));
