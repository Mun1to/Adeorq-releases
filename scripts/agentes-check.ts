// La lista de agentes de una terminal: lo que dice de cada uno (`lib/agentes.ts`).
//
// Lo que no puede pasar: decir que un agente «terminó» cuando solo consta el
// acuse de que salió en segundo plano; inventarle una duración a uno que no
// trae sus horas; o pintar la lista fuera de la ventana.
//
//   pnpm bancos agentes

import { estadoDeAgente, rato, recuento, sitioDeLaLista, tiempoDe } from "../src/lib/agentes";
import type { AgenteDeSesion } from "../src/lib/pty";

let fallos = 0;
// El lanzador solo enseña las últimas líneas: los rojos se repiten al final.
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const agente = (mas: Partial<AgenteDeSesion> = {}): AgenteDeSesion => ({
  tipo: "Explore",
  que: "Mapa del editor",
  desde: "2026-10-10T18:00:00Z",
  hasta: null,
  vivo: false,
  fallo: false,
  fondo: false,
  ...mas,
});
const AHORA = Date.parse("2026-10-10T18:03:20Z");

// --- en qué anda cada uno --------------------------------------------------------------
es("el que sigue fuera, fuera", estadoDeAgente(agente({ vivo: true })), "fuera");
es("el que volvió, volvió", estadoDeAgente(agente({ hasta: "2026-10-10T18:02:00Z" })), "volvio");
es("el que volvió con error, falló", estadoDeAgente(agente({ hasta: "2026-10-10T18:02:00Z", fallo: true })), "fallo");
es(
  "el de segundo plano NO «terminó»: solo consta que salió",
  estadoDeAgente(agente({ fondo: true, hasta: "2026-10-10T18:00:01Z" })),
  "fondo",
);
es("y si el de segundo plano sigue contado como vivo, está fuera", estadoDeAgente(agente({ fondo: true, vivo: true })), "fuera");

// --- cuánto lleva o cuánto tardó -------------------------------------------------------
es("segundos", rato(45_000), "45 s");
es("minutos", rato(200_000), "3 min");
es("horas, con los minutos a dos cifras", rato(3_900_000), "1 h 05 min");
es("nunca negativo", rato(-5000), "0 s");
es("el que sigue fuera: cuánto lleva", tiempoDe(agente({ vivo: true }), AHORA), "3 min");
es("el que volvió: cuánto tardó", tiempoDe(agente({ hasta: "2026-10-10T18:00:50Z" }), AHORA), "50 s");
es("al de segundo plano no se le inventa duración", tiempoDe(agente({ fondo: true, hasta: "2026-10-10T18:00:01Z" }), AHORA), "");
es("sin hora de salida, nada", tiempoDe(agente({ desde: "", vivo: true }), AHORA), "");
es("sin hora de vuelta, nada", tiempoDe(agente({ hasta: null }), AHORA), "");

// --- el recuento de la cabecera --------------------------------------------------------
es(
  "cada uno cuenta en su montón",
  recuento([
    agente({ vivo: true }),
    agente({ vivo: true }),
    agente({ fondo: true, hasta: "x" }),
    agente({ hasta: "x" }),
    agente({ hasta: "x", fallo: true }),
  ]),
  { fuera: 2, fondo: 1, fallo: 1, volvio: 1 },
);
es("sin agentes, todo a cero", recuento([]), { fuera: 0, fondo: 0, fallo: 0, volvio: 0 });

// --- dónde se pinta --------------------------------------------------------------------
const VENTANA = { ancho: 1440, alto: 900 };
const LISTA = { ancho: 360, alto: 200 };
es("debajo del robot, un poco a su izquierda", sitioDeLaLista({ left: 600, top: 80, bottom: 100 }, LISTA, VENTANA), { x: 590, y: 106 });
es("pegado al borde derecho, no se sale", sitioDeLaLista({ left: 1400, top: 80, bottom: 100 }, LISTA, VENTANA).x, 1440 - 360 - 8);
es("pegado al izquierdo, tampoco", sitioDeLaLista({ left: 2, top: 80, bottom: 100 }, LISTA, VENTANA).x, 8);
es("si no cabe debajo, va encima", sitioDeLaLista({ left: 600, top: 800, bottom: 820 }, LISTA, VENTANA), { x: 590, y: 594 });
es("y si tampoco cabe encima, arriba del todo", sitioDeLaLista({ left: 600, top: 100, bottom: 120 }, { ancho: 360, alto: 880 }, VENTANA).y, 8);

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
