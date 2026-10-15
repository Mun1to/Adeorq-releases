// Copia de `scripts/laboratorio/doble-movil.mjs` para las fotos del móvil de la
// web y del vídeo: los mismos datos de ejemplo pero del taller inventado de Sam
// (storefront-api, landing-web, invoice-cli, mobile-app, docs-site,
// design-tokens; rutas P:\projects\…), porque el doble de los bancos nombra
// proyectos reales de Munir y eso no puede salir en nada público. `IDIOMA=en`
// cambia los textos de ejemplo al inglés y sirve la página con
// `<html lang="en">`, como `movil.rs` con la app en inglés.
//
//   IDIOMA=es node doble-sam.mjs 4392      (sin PAGINA sirve src-tauri/src/movil.html)
//
// Lo lanza solo `fotos-movil.mjs`, que es lo que se usa.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PAGINA = process.env.PAGINA || path.join(RAIZ, "src-tauri", "src", "movil.html");
const EN = process.env.IDIOMA === "en";
const t = (es, en) => (EN ? en : es);
const PUERTO = Number(process.argv[2]) || 4392;
const CLAVE = "clave-de-mentira";
const ARRANQUE = 111;
const P = "P:\\projects\\";

const ahora = () => Math.floor(Date.now() / 1000);
const convs = new Map();
const nueva = (id) => {
  if (!convs.has(id)) convs.set(id, { id, titulo: "", turnos: [], trabajos: [], router: true, creada: ahora() });
  return convs.get(id);
};
const vieja = nueva("vieja1");
vieja.titulo = t("Contraste de la landing", "Landing page contrast");
vieja.turnos = [
  { n: 1, rol: "tu", texto: t("Revisa el contraste de la landing", "Check the landing page contrast"), resumen: "", cuando: ahora() - 7200 },
  { n: 2, rol: "conserje", texto: t("Hecho: abrí una sesión en **landing-web** para eso.", "Done: I opened a session in **landing-web** for it."), resumen: "", cuando: ahora() - 7190 },
];
vieja.trabajos = [{ panel: 4, cli: "claude", modelo: "sonnet", carpeta: `${P}landing-web`, encargo: t("Revisar el contraste de la portada", "Check the contrast of the hero"), eligio: "router", porque: t("Es oficio del día a día.", "Everyday work."), turno: 2, sesion: "s-vieja", arranque: 0, abierto: 0 }];

const escrito = new Map();
const enCurso = new Map();
const abiertas = new Map();

const terminales = [
  { panel: 1, nombre: "claude", carpeta: `${P}storefront-api`, agente: true, modelo: "opus", estado: "a_medias", sesion: "s-1" },
  { panel: 2, nombre: "codex", carpeta: `${P}invoice-cli`, agente: true, modelo: "gpt-5.6-terra", estado: "pregunta", sesion: "s-2" },
  { panel: 3, nombre: t("consola", "console"), carpeta: `${P}docs-site`, agente: false, modelo: null, estado: "", sesion: null },
  { panel: 4, nombre: "claude", carpeta: `${P}landing-web`, agente: true, modelo: "sonnet", estado: "pregunta", sesion: "s-4" },
  { panel: 5, nombre: "claude", carpeta: `${P}mobile-app`, agente: true, modelo: "sonnet", estado: "lista", sesion: "s-5" },
];
const RAYA = "─".repeat(78);
const pantallas = new Map([
  [1, [
    t("❯ Reproduzco el fallo antes de tocar nada.", "❯ Reproducing the failure before touching anything."), "", "● Read(src/cart.js)", t("  ⎿  42 líneas", "  ⎿  42 lines"), "",
    "● Bash(npm test)", "  ⎿  pass 3 · fail 1", "",
    "· Baking… (26s · ↓ 1.7k tokens)", "",
    `${"─".repeat(62)} storefront-api ─`, "❯ ", RAYA,
  ]],
  [4, [
    "● Bash(npm run build)", "", RAYA, " Bash command", "",
    "   npm run build", "   Build the landing page", "",
    " Do you want to proceed?", " ❯ 1. Yes", `   2. Yes, and don't ask again for npm run build commands in ${P}landing-web`,
    "   3. No, and tell Claude what to do differently (esc)", "",
  ]],
  [2, ["Do you want to run `pytest -q`?", "", "  1. Yes", "  2. No, and tell Codex what to do differently", "", "> "]],
  [5, [t("● La lista de pedidos ya refresca al tirar.", "● The order list now refreshes on pull."), "", RAYA, "❯ ", RAYA]],
  [3, [...Array.from({ length: 40 }, (_, i) => `   ${t("página", "page")} ${i + 1}/40  docs/guide-${i + 1}.md`), `PS ${P}docs-site> `]],
]);
const terminalDe = (panel) => terminales.find((x) => x.panel === Number(panel));
const MODOS = ["", "⏵⏵ accept edits on (shift+tab to cycle)", "⏸ plan mode on (shift+tab to cycle)", "⏵⏵ auto mode on (shift+tab to cycle)"];
const modo = new Map([[1, 1]]);

const decisiones = [
  {
    id: "d19a2b3c4d5", titulo: t("Código de descuento caducado", "Expired discount code"), proyecto: "storefront-api", panel: 1, arranque: ARRANQUE, creada: Date.now() - 6 * 60000,
    preguntas: [{ id: "A", titulo: t("¿Qué hace el carrito?", "What does the cart do?"), opciones: [
      { texto: t("Rechazar el código y decir por qué", "Reject the code and say why"), recomendada: true },
      { texto: t("Aplicarlo igual hasta medianoche", "Apply it anyway until midnight") },
    ] }],
  },
  {
    id: "d19a2b3c4d0", titulo: t("Nombre de la rama", "Branch name"), proyecto: "design-tokens", panel: 3, arranque: 1, creada: Date.now() - 3 * 3600000,
    preguntas: [{ id: "A", titulo: t("¿Cómo la llamo?", "What do I call it?"), opciones: [{ texto: "feat/tokens" }, { texto: "tokens-v2", recomendada: true }] }],
    respuesta: { cuando: Date.now() - 2 * 3600000, desde: "Android · Chrome", entregada: true, elecciones: { A: { opcion: 2 } } },
  },
];
const cerrada = (d) => Number(Boolean(d.respuesta || d.descartada));
const vigenciaDe = (d) =>
  d.respuesta ? "contestada" : d.descartada ? "descartada"
    : d.arranque === ARRANQUE && terminales.some((x) => x.panel === d.panel) ? "viva" : "huerfana";

// La sesión del panel 1: el arreglo del descuento de storefront-api, corta.
const pasos = (...p) => p.map(([nombre, detalle]) => ({ clase: "herramienta", nombre, detalle }));
const sesion = [
  { rol: "tu", texto: t("Arregla la prueba del descuento", "Fix the discount test"), hora: "", herramientas: [] },
  {
    rol: "agente",
    texto: t(
      "El fallo estaba en `applyDiscount` (src/cart.js): calculaba `cents - cents * rate` sin redondear, y con 4499 y WELCOME10 daba 4049.1 en vez de 4049.",
      "The bug was in `applyDiscount` (src/cart.js): it computed `cents - cents * rate` without rounding, so 4499 with WELCOME10 gave 4049.1 instead of 4049.",
    ),
    hora: "2026-10-14T10:02:00Z", herramientas: ["Read", "Bash"], pasos: pasos(["Read", "cart.js"], ["Bash", "npm test"]),
  },
  {
    rol: "agente",
    texto: t(
      "Lo arreglé redondeando el descuento a céntimos enteros: `Math.round(cents * rate)`. Ahora pasan las 4 pruebas. No hice commit.",
      "I fixed it by rounding the discount to whole cents: `Math.round(cents * rate)`. All 4 tests pass now. I haven't committed.",
    ),
    hora: "2026-10-14T10:04:00Z", herramientas: ["Edit", "Bash"], pasos: pasos(["Edit", "cart.js"], ["Bash", "npm test"]),
  },
  { rol: "tu", texto: t("Haz commit del arreglo", "Commit the fix"), hora: "", herramientas: [] },
];

function estadosDe(conv) {
  const estados = {};
  for (const w of conv.trabajos) {
    const clave = `${w.arranque}:${w.panel}`;
    const desde = abiertas.get(clave);
    estados[clave] = w.arranque !== ARRANQUE || !desde ? "cerrada" : Date.now() - desde > 20000 ? "pregunta" : "trabajando";
  }
  return estados;
}

function contestar(conv, texto) {
  enCurso.set(conv.id, { pensando: true, paso: t("Mirando tus proyectos", "Looking at your projects"), texto, aviso: null, error: null });
  setTimeout(() => {
    const n = conv.turnos.length + 1;
    conv.turnos.push({
      n, rol: "conserje",
      texto: t(
        "Son dos trabajos distintos, así que abro dos sesiones:\n\n- una en **storefront-api** para el descuento\n- otra en **landing-web** para el modo oscuro\n\nTe aviso cuando alguna te pregunte algo.",
        "Those are two separate jobs, so I'm opening two sessions:\n\n- one in **storefront-api** for the discount\n- another in **landing-web** for dark mode\n\nI'll let you know when either asks you something.",
      ),
      resumen: "", cuando: ahora(),
    });
    for (const [panel, carpeta, modelo, encargo, porque] of [
      [1, `${P}storefront-api`, "opus", t("Que el descuento redondee a céntimos enteros", "Make the discount round to whole cents"), t("Es de los de juicio: si sale mal y no se nota, sale caro.", "It needs judgement: if it goes wrong unnoticed, it costs.")],
      [4, `${P}landing-web`, "sonnet", t("Modo oscuro en la portada", "Dark mode on the landing page"), t("Es oficio del día a día.", "Everyday work.")],
    ]) {
      conv.trabajos.push({ panel, cli: "claude", modelo, carpeta, encargo, eligio: conv.router ? "router" : "tu", porque, turno: n, sesion: `s-${panel}`, arranque: ARRANQUE, abierto: ahora() });
      abiertas.set(`${ARRANQUE}:${panel}`, Date.now());
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
        return res.end(EN ? pagina.replace('<html lang="es">', '<html lang="en">') : pagina);
      }
      if (url.pathname === "/api/emparejar") {
        return v.codigo === "123456" ? json(res, 200, { clave: CLAVE, nombre: v.nombre }) : json(res, 403, { error: "Ese código no es." });
      }
      if (url.pathname === "/sw.js") {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        return res.end(`self.addEventListener("push", () => {});`);
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
          return json(res, 200, { texto: v.texto ?? "" });
        case "/api/router":
          nueva(id).router = v.encendido;
          return json(res, 200, { ok: true });
        case "/api/cerebro":
          nueva(id).cerebro = v.cerebro;
          return json(res, 200, { ok: true });
        case "/api/push/clave":
          return json(res, 200, { clave: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8" });
        case "/api/push/suscribir":
        case "/api/push/olvidar":
        case "/api/parar":
          return json(res, 200, { ok: true });
        case "/api/fijo":
          nueva(id).fijo = v.modelo;
          return json(res, 200, { ok: true });
        case "/api/terminales":
          return json(res, 200, { terminales, arranque: ARRANQUE });
        case "/api/terminal": {
          const x = terminalDe(url.searchParams.get("panel"));
          if (!x) return json(res, 404, { error: "Esa terminal ya no está." });
          const linea = MODOS[modo.get(x.panel) ?? 0];
          return json(res, 200, { ...x, filas: [...(pantallas.get(x.panel) || []), ...(linea ? [linea] : [])] });
        }
        case "/api/terminal/escribir":
        case "/api/terminal/tecla":
          return json(res, 202, { ok: true });
        case "/api/escrito":
          return json(res, 200, { texto: escrito.get(Number(url.searchParams.get("panel"))) ?? null });
        case "/api/adjuntos":
          return json(res, 200, []);
        case "/api/decisiones":
          return json(res, 200, { decisiones: decisiones
            .slice()
            .sort((a, b) => cerrada(a) - cerrada(b) || b.creada - a.creada)
            .map((d) => ({
              id: d.id, titulo: d.titulo, proyecto: d.proyecto, panel: d.panel, creada: d.creada, preguntas: d.preguntas.length,
              contestada: Boolean(d.respuesta), vigencia: vigenciaDe(d), cerrada: d.respuesta?.cuando ?? d.descartada ?? null,
            })) });
        case "/api/decision": {
          const d = decisiones.find((x) => x.id === url.searchParams.get("id"));
          return d ? json(res, 200, { ...d, vigencia: vigenciaDe(d) }) : json(res, 404, { error: "Esa decisión ya no está." });
        }
        case "/api/sesion":
          if (url.searchParams.get("id") === "s-2") return json(res, 404, { error: "esa conversación no está en el disco" });
          if (url.searchParams.has("si")) return json(res, 200, { firma: "sam", turnos: sesion });
          return json(res, 200, sesion);
        default:
          return json(res, 404, { error: "Aquí no hay nada." });
      }
    });
  })
  .listen(PUERTO, "127.0.0.1", () => console.log(`doble de Sam (${EN ? "en" : "es"}) en http://127.0.0.1:${PUERTO}/`));
