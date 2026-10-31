// La sonda del editor web (`vite-plugin-adeorq/sonda.js`) solo habla con Adeorq.
//
//     node scripts/sonda-check.mjs
//
// La sonda va dentro de la web que estás editando, y lo primero que hace es
// anunciar la ruta absoluta de tu proyecto. Hasta el 2026-10-31 la mandaba con
// `postMessage(…, "*")` y obedecía a cualquier ventana que la tuviera dentro:
// una web de fuera que metiera tu localhost en un iframe se llevaba la ruta y el
// texto de lo que pulsaras (lo vio la revisión de seguridad R2). Esto la carga en
// jsdom con un padre de mentira y comprueba las dos mitades:
//   - lo que manda lleva como destino el origen de Adeorq, nunca "*";
//   - un padre de otro origen no recibe nada y sus órdenes no se obedecen;
//   - los orígenes de Adeorq medidos (Windows, Linux, desarrollo y laboratorios)
//     sí funcionan.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = readFileSync(join(RAIZ, "vite-plugin-adeorq", "sonda.js"), "utf8").replace(
  "__ADEORQ_RAIZ__",
  JSON.stringify("C:/proyectos/demo"),
);

let fallos = 0;
const dice = (bien, que) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

/** Carga la sonda dentro de un iframe cuyo padre tiene el origen `padre`.
 *  `ancestro` es lo que el navegador pone en `location.ancestorOrigins` (en
 *  Chromium y WebKit es el origen del padre; con `no-referrer` puede faltar). */
function cargar(padre, ancestro = padre) {
  const dom = new JSDOM("<!doctype html><html><body><p>hola</p></body></html>", {
    url: "http://localhost:5173/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const enviados = [];
  const ventanaPadre = { postMessage: (m, destino) => enviados.push({ m, destino }) };
  const loc = new Proxy(w.location, {
    get: (t, k) => (k === "ancestorOrigins" ? (ancestro ? [ancestro] : []) : Reflect.get(t, k)),
  });
  const ventana = new Proxy(w, {
    get: (t, k) => {
      if (k === "parent") return ventanaPadre;
      if (k === "location") return loc;
      const v = Reflect.get(t, k);
      return typeof v === "function" && !/^[A-Z]/.test(String(k)) ? v.bind(t) : v;
    },
  });
  w.eval(`(function (window, location) {\n${FUENTE}\n})`)(ventana, loc);
  /** El origen que de verdad recibe un mensaje: el padre, si el destino lo
   *  permite. Es la regla del navegador para `postMessage(m, destino)`. */
  const recibidos = () => enviados.filter((e) => e.destino === "*" || e.destino === padre).map((e) => e.m);
  const orden = (m, origen = padre, source = ventanaPadre) => {
    const ev = new w.Event("message");
    Object.defineProperties(ev, { data: { value: m }, origin: { value: origen }, source: { value: source } });
    w.dispatchEvent(ev);
  };
  return { enviados, recibidos, orden };
}

// 1. Ningún mensaje sale con "*".
{
  const s = cargar("http://tauri.localhost");
  s.orden({ de: "adeorq", tipo: "hola" });
  dice(s.enviados.length > 0, "la sonda contesta al saludo de Adeorq");
  dice(s.enviados.every((e) => e.destino !== "*"), `ningún mensaje lleva "*" de destino (${s.enviados.map((e) => e.destino).join(", ")})`);
}

// 2. Una web de fuera que la mete en un iframe no se lleva la ruta.
{
  const s = cargar("https://malo.example");
  s.orden({ de: "adeorq", tipo: "hola" }, "https://malo.example");
  const ruta = s.recibidos().some((m) => JSON.stringify(m).includes("C:/proyectos/demo"));
  dice(!ruta, "un padre de otro origen no recibe la ruta del proyecto");
  s.orden({ de: "adeorq", tipo: "modo", activo: true }, "https://malo.example");
  dice(s.recibidos().length === 0, "y no recibe nada aunque le mande órdenes");
}

// 3. Los orígenes de Adeorq, medidos: Windows (http y https), Linux, desarrollo
//    (`devUrl`) y los laboratorios, que sirven el front en otros puertos.
for (const origen of [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "http://127.0.0.1:4390",
]) {
  const s = cargar(origen);
  const alCargar = s.recibidos().some((m) => m.tipo === "lista");
  s.orden({ de: "adeorq", tipo: "hola" });
  const alSaludo = s.recibidos().filter((m) => m.tipo === "lista").length;
  dice(alCargar && alSaludo >= 2, `${origen}: recibe la lista al cargar y al saludar`);
}

// 4. Sin `ancestorOrigins` (lo puede ocultar la política de referente), la
//    sonda espera al saludo y contesta solo a ese origen.
{
  const s = cargar("http://tauri.localhost", null);
  dice(s.enviados.length === 0, "sin saber quién es el padre, al cargar no manda nada");
  s.orden({ de: "adeorq", tipo: "hola" });
  dice(s.recibidos().length === 1 && s.enviados.every((e) => e.destino === "http://tauri.localhost"), "tras el saludo contesta solo a ese origen");
}

// 5. El saludo tiene que venir de la ventana que la tiene dentro.
{
  const s = cargar("http://tauri.localhost", null);
  s.orden({ de: "adeorq", tipo: "hola" }, "http://tauri.localhost", { postMessage() {} });
  dice(s.enviados.length === 0, "un saludo de otra ventana, aunque diga ser Adeorq, no se contesta");
}

if (fallos) {
  console.error(`\n${fallos} fallo(s) en la sonda del editor.`);
  process.exit(1);
}
console.log("\nLa sonda solo habla con Adeorq.");
