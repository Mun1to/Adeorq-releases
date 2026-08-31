// Comprueba que `lib/latido.ts` hace lo que promete: no trabajar mientras no
// se mira, y ponerse al día en cuanto se vuelve a mirar.
//
//     pnpm latido
//
// Hasta el 2026-08-31 esto lo usaban tres sitios; ahora son doce (el chat, la
// actividad, el buzón de las cuadrillas, el barrido de sesiones, la agenda,
// los objetivos, el uso, los relojes del lienzo). Cuando de una pieza cuelga
// media app, su promesa deja de ser un comentario y pasa a ser algo que hay
// que comprobar.
//
// Los dos fallos que esto pilla, y que un `setInterval` normal no tiene:
//
//  1. Que siga llamando con la ventana tapada. Es el fallo entero: el motivo
//     de existir de esta pieza.
//  2. Que al destapar NO llame. Se ve peor y duele igual: destapas Adeorq y
//     el chat enseña la conversación de hace media hora hasta el siguiente
//     turno. Un ahorro que enseña datos viejos no vale nada.
//
// El reloj se maneja a mano (no se espera de verdad) para que la prueba tarde
// milisegundos y no dependa de lo cargada que esté la máquina.

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
let oculto = false;
Object.defineProperty(dom.window.document, "hidden", { get: () => oculto });

// El reloj falso: nada de esperas reales.
let ahora = 0;
const turnos = [];
dom.window.setInterval = (fn, ms) => { turnos.push({ fn, ms, ultima: ahora }); return turnos.length; };
dom.window.clearInterval = (id) => { turnos[id - 1] = null; };
const avanzar = (ms) => {
  ahora += ms;
  for (const t of turnos) {
    if (!t) continue;
    while (ahora - t.ultima >= t.ms) { t.ultima += t.ms; t.fn(); }
  }
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
const antesDate = Date.now;
Date.now = () => ahora;

const { latido } = await import("../src/lib/latido.ts").catch(async () => {
  // `latido` es TypeScript sin nada de tipos en el cuerpo, así que para
  // ejecutarlo basta quitarle las anotaciones. Se lee el archivo de verdad y
  // no una copia: una prueba contra una copia no prueba nada.
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ruta = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "latido.ts");
  const ts = readFileSync(ruta, "utf8")
    .replace("export function latido(fn: () => void, ms: number, alVolver = true): () => void {",
             "export function latido(fn, ms, alVolver = true) {");
  const url = "data:text/javascript;base64," + Buffer.from(ts).toString("base64");
  return import(url);
});

let fallos = 0;
const debe = (ok, que) => { console.log(`${ok ? "  ok  " : "FALLA "} ${que}`); if (!ok) fallos++; };

// 1. Con la ventana a la vista, es un setInterval normal.
let veces = 0;
const parar = latido(() => veces++, 1000);
avanzar(3000);
debe(veces === 3, "a la vista late tres veces en tres turnos");

// 2. Tapada, no llama ni una.
oculto = true;
const antes = veces;
avanzar(10_000);
debe(veces === antes, "tapada no llama ni una vez en diez turnos");

// 3. Al destapar, se pone al día EN EL ACTO, sin esperar al turno siguiente.
oculto = false;
dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
debe(veces === antes + 1, "al destapar llama en el acto");

// 4. Destapar justo después de un turno no dispara otro de más.
const tras = veces;
avanzar(1000);
const conUno = veces;
dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
debe(veces === conUno && conUno === tras + 1, "destapar recién latido no repite el turno");

// 5. Parar lo para de verdad, y suelta el oyente.
parar();
const final = veces;
avanzar(5000);
oculto = true; oculto = false;
dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
debe(veces === final, "parado no vuelve a llamar nunca");

Date.now = antesDate;
console.log(fallos ? `\n${fallos} fallo(s).` : "\nEl latido cumple lo que promete.");
process.exit(fallos ? 1 : 0);
