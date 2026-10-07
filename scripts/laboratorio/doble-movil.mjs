// La página del conserje en el móvil (`src-tauri/src/movil.html`) con un
// servidor de mentira que contesta como `movil.rs` y la ventana. Sirve para
// mirarla en un navegador a tamaño de móvil sin compilar Rust ni abrir la app.
//
//   node scripts/laboratorio/doble-movil.mjs [puerto]      (4390 por defecto)
//
// El código de emparejar es 123456. Lo que se le escribe al conserje decide lo
// que contesta, como en `doble-conserje.js`:
//   · normal                abre dos sesiones (juicio y oficio)
//   · contiene «error»      la primera vez no contesta (sin cuota)
//   · contiene «pregunta»   contesta con una pregunta y no abre nada
// Una sesión pasa de «trabajando» a «te pregunta algo» a los veinte segundos.
// Y tres terminales (decisión E3): lo que se les escribe o la tecla que se les
// manda aparece en su pantalla en la vuelta siguiente, y queda en la consola.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGINA = path.join(RAIZ, "src-tauri", "src", "movil.html");
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

const enCurso = new Map();
const abiertas = new Map(); // clave -> momento en que se abrió
let yaFallo = false;

// Las terminales de la Cabina, como las devuelve `atenderTerminal` de `lib/movil.ts`.
const terminales = [
  { panel: 1, nombre: "claude", carpeta: "C:\\proyectos\\Adeorq", agente: true, modelo: "opus", estado: "a_medias", sesion: "s-1" },
  { panel: 2, nombre: "codex", carpeta: "C:\\proyectos\\crypto\\radar-bot", agente: true, modelo: "gpt-5.6-terra", estado: "pregunta", sesion: "s-2" },
  { panel: 3, nombre: "consola", carpeta: "C:\\proyectos\\Vidorq", agente: false, modelo: null, estado: "", sesion: null },
];
const pantallas = new Map([
  [1, ["❯ Reproduzco el fallo antes de tocar nada.", "", "● Read(src/App.tsx)", "  ⎿  120 líneas", "", "● Buscando el culpable en lib/scrollTerm.ts…", "", "❯ "]],
  [2, ["Do you want to run `cargo check`?", "", "  1. Yes", "  2. No, and tell Codex what to do differently", "", "> "]],
  [3, ["PS C:\\proyectos\\Vidorq> "]],
]);
const terminalDe = (panel) => terminales.find((t) => t.panel === Number(panel));

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
        return res.end(fs.readFileSync(PAGINA, "utf8"));
      }
      if (url.pathname === "/api/emparejar") {
        return v.codigo === "123456" ? json(res, 200, { clave: CLAVE, nombre: v.nombre }) : json(res, 403, { error: "Ese código no es." });
      }
      // El service worker de los avisos, en corto: lo de verdad está en `movil.rs`.
      if (url.pathname === "/sw.js") {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        return res.end(`self.addEventListener("push", (e) => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.titulo || "Conserje", { body: d.cuerpo || "" })); });`);
      }
      if (!url.pathname.startsWith("/api/")) return json(res, 404, { error: "Aquí no hay nada." });
      if (req.headers.authorization !== `Bearer ${CLAVE}`) return json(res, 401, { error: "Este móvil no está emparejado." });
      const id = url.searchParams.get("id") || v.id;
      switch (url.pathname) {
        case "/api/yo":
          return json(res, 200, { nombre: "Android" });
        case "/api/lista":
          return json(res, 200, [...convs.values()].filter((c) => c.turnos.length).map((c) => ({ id: c.id, titulo: c.titulo, cuando: c.turnos.at(-1).cuando, trabajos: c.trabajos.length })));
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
          return json(res, 200, { terminales });
        case "/api/terminal": {
          const t = terminalDe(url.searchParams.get("panel"));
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          return json(res, 200, { ...t, filas: pantallas.get(t.panel) || [] });
        }
        case "/api/terminal/escribir": {
          const t = terminalDe(v.panel);
          if (!t) return json(res, 404, { error: "Esa terminal ya no está." });
          const f = pantallas.get(t.panel);
          f[f.length - 1] += v.texto;
          f.push("", `● (el agente leyó: ${v.texto})`, "", "❯ ");
          console.log(`escrito en ${t.panel}: ${v.texto}`);
          return json(res, 202, { ok: true });
        }
        case "/api/terminal/tecla": {
          if (!["intro", "esc", "ctrl+c"].includes(v.tecla)) return json(res, 400, { error: "Esa tecla no se manda desde el móvil." });
          const f = pantallas.get(Number(v.panel));
          if (!f) return json(res, 404, { error: "Esa terminal ya no está." });
          f.push(`(tecla: ${v.tecla})`, "❯ ");
          console.log(`tecla en ${v.panel}: ${v.tecla}`);
          return json(res, 202, { ok: true });
        }
        case "/api/sesion":
          return json(res, 200, [
            { rol: "tu", texto: "Que el scroll de las terminales no salte al cambiar el ancho", hora: "", herramientas: [] },
            { rol: "agente", texto: "Lo reproduzco antes de tocar nada: con el panel a 180 columnas y bajándolo a 73, la distancia al final pasa de 0 a 332.", hora: "", herramientas: ["Read", "Grep"] },
          ]);
        default:
          return json(res, 404, { error: "Aquí no hay nada." });
      }
    });
  })
  .listen(PUERTO, "127.0.0.1", () => console.log(`doble del móvil en http://127.0.0.1:${PUERTO}/`));
