// El interruptor que apaga los reajustes mientras se arrastra un separador.
//
// Lo que se prueba aquí no es el ahorro (eso se ve en pantalla), es el riesgo:
// si la bandera se queda puesta, las terminales dejan de ajustarse PARA
// SIEMPRE y la app parece rota de una forma peor que el lag que venía a
// arreglar. Por eso hay tres seguros (pointerup, pointercancel y blur de la
// ventana) y por eso se comprueban uno a uno.
//
//   npx tsc scripts/redimension-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/redimension-check.js

/* Un navegador de mentira, lo justo para este módulo: el `document` solo
   necesita el `dataset` del body, y la `window` guardar oyentes y repartir
   eventos. `requestAnimationFrame` corre en el acto para no tener que esperar
   a un frame que aquí no existe. */
const oyentes: Record<string, Array<() => void>> = {};
const disparados: string[] = [];
const cuadros: Array<() => void> = [];

(globalThis as any).document = { body: { dataset: {} as Record<string, string> } };
(globalThis as any).window = {
  addEventListener(tipo: string, fn: () => void) {
    (oyentes[tipo] ||= []).push(fn);
  },
  removeEventListener(tipo: string, fn: () => void) {
    oyentes[tipo] = (oyentes[tipo] || []).filter((f) => f !== fn);
  },
  dispatchEvent(e: { type: string }) {
    disparados.push(e.type);
    (oyentes[e.type] || []).slice().forEach((f) => f());
  },
};
(globalThis as any).Event = class {
  type: string;
  constructor(t: string) {
    this.type = t;
  }
};
(globalThis as any).requestAnimationFrame = (fn: () => void) => {
  cuadros.push(fn);
  return cuadros.length;
};

/** Corre los frames pendientes, que es lo que hace el navegador al pintar. */
function pintar() {
  const cola = cuadros.splice(0);
  cola.forEach((f) => f());
}

import {
  ANCLA_MS,
  CADENCIA_ARRASTRE_MS,
  EVENTO_REFIT,
  anclando,
  anclarColumnas,
  empezarRedimension,
  fuenteAnclada,
  redimensionando,
  terminarRedimension,
  tocaAjustar,
} from "../src/lib/redimension";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const body = () => (globalThis as any).document.body.dataset as Record<string, string>;

// --- lo normal: bajar el dedo y soltarlo ------------------------------------
ok("de entrada no se esta redimensionando", !redimensionando());

empezarRedimension();
ok("al bajar el dedo, se suspende el ajuste", redimensionando());
ok("y el CSS se entera", body().redim === "1", "es lo que apaga el cristal");
ok("no se ha pedido ningun refit todavia", disparados.length === 0);

terminarRedimension();
ok("al soltar, vuelve a ajustarse", !redimensionando());
ok("y la marca del CSS se va", body().redim === undefined);
ok(
  "el refit NO sale en el acto",
  disparados.length === 0,
  "el layout de la ultima posicion aun no esta aplicado",
);
pintar();
ok("el refit sale en el frame siguiente", disparados.includes(EVENTO_REFIT));

// --- los seguros, que son el motivo de este comprobador ----------------------
disparados.length = 0;
empezarRedimension();
ok("el seguro del pointerup queda armado", (oyentes["pointerup"] || []).length === 1);
(globalThis as any).window.dispatchEvent({ type: "pointerup" });
pintar();
ok(
  "un pointerup perdido tambien suelta",
  !redimensionando(),
  "si no, las terminales no volverian a ajustarse nunca",
);
ok("y pide su refit", disparados.includes(EVENTO_REFIT));

disparados.length = 0;
empezarRedimension();
(globalThis as any).window.dispatchEvent({ type: "blur" });
pintar();
ok("perder el foco de la ventana tambien suelta", !redimensionando());

disparados.length = 0;
empezarRedimension();
(globalThis as any).window.dispatchEvent({ type: "pointercancel" });
pintar();
ok("y que el navegador cancele el gesto, tambien", !redimensionando());

// --- que no se puedan encadenar ni duplicar ---------------------------------
disparados.length = 0;
empezarRedimension();
empezarRedimension();
ok(
  "bajar el dedo dos veces no arma dos seguros",
  (oyentes["pointerup"] || []).length === 1,
  "duplicarlos dejaria oyentes sueltos en cada arrastre",
);
terminarRedimension();
pintar();
ok("un solo refit por arrastre", disparados.filter((d) => d === EVENTO_REFIT).length === 1);

disparados.length = 0;
terminarRedimension();
pintar();
ok(
  "soltar sin haber arrastrado no hace nada",
  disparados.length === 0,
  "un refit de nueve terminales por un pointerup cualquiera seria el lag otra vez",
);

ok(
  "al acabar no queda ningun oyente colgado",
  (oyentes["pointerup"] || []).length === 0 &&
    (oyentes["pointercancel"] || []).length === 0 &&
    (oyentes["blur"] || []).length === 0,
);

// --- la cadencia, que es lo que hace que se vea moverse ----------------------
ok(
  "fuera de un arrastre se ajusta siempre",
  tocaAjustar(1000, 999, false),
  "abrir una terminal o desplegar Skills no puede esperar a nada",
);
ok(
  "recien ajustado, dentro de un arrastre, se espera",
  !tocaAjustar(1000, 1000, true),
  "es el reflow que costaba el lag",
);
ok("justo en la cadencia ya toca", tocaAjustar(1000 + CADENCIA_ARRASTRE_MS, 1000, true));
ok("un milisegundo antes todavia no", !tocaAjustar(1000 + CADENCIA_ARRASTRE_MS - 1, 1000, true));
ok("pasado de largo, toca", tocaAjustar(5000, 1000, true));
ok(
  "la cadencia deja ver el texto moverse",
  CADENCIA_ARRASTRE_MS > 0 && 1000 / CADENCIA_ARRASTRE_MS >= 10,
  "por debajo de diez veces por segundo se ve a saltos, que es el fallo contrario",
);
ok(
  "y aun asi ahorra la mayor parte",
  1000 / CADENCIA_ARRASTRE_MS <= 20,
  "a sesenta por segundo estariamos donde empezamos",
);

// --- anclar las columnas cuando el ancho lo cambia un panel -----------------
//
// Lo que se prueba es la aritmetica de la letra. El fallo que viene a evitar
// esta medido con xterm de verdad: al pasar de 134 a 107 columnas, el texto que
// el CLI ya habia envuelto sale con palabras partidas por la mitad ("los mante
// / nedores"), y volver a 134 las recompone solas. Conservar las columnas es lo
// unico que lo evita, porque el parrafo original ya no existe en ningun sitio.

ok(
  "la letra baja lo justo para conservar las columnas",
  fuenteAnclada(113, 142, 12, 9, 12) === 9.5,
  "12 x 113 / 142 = 9.5",
);
ok(
  "al cerrar el panel vuelve EXACTO al tamano elegido",
  fuenteAnclada(142, 113, 9.5, 9, 12) === 12,
  "la cuenta da 11.9 por los dos redondeos hacia abajo, y a una decima del techo se pega a el",
);
ok(
  "pero el pegado no se lleva por delante una diferencia de verdad",
  fuenteAnclada(120, 113, 9.5, 9, 12) === 10,
  "10.08 esta lejos del techo: se queda donde le toca",
);
ok(
  "el techo manda aunque la cuenta pida mas",
  fuenteAnclada(300, 100, 12, 9, 14) === 14,
  "una terminal ancha no puede agrandar la letra por su cuenta",
);
ok(
  "y el suelo tambien: ilegible es peor que descolocado",
  fuenteAnclada(40, 200, 12, 9, 12) === 9,
  "por debajo del minimo se deja reflowar",
);
ok(
  "sin medida se deja la letra como esta",
  fuenteAnclada(0, 142, 9.5, 9, 12) === 9.5,
  "volver al techo por no haber podido medir devolveria las columnas y partiria el texto",
);
ok("sin objetivo, igual", fuenteAnclada(113, 0, 9.5, 9, 12) === 9.5);
ok("y sin nada de nada, el techo", fuenteAnclada(0, 0, 0, 9, 12) === 12);
ok(
  "misma anchura, misma letra",
  fuenteAnclada(142, 142, 12, 9, 12) === 12,
  "abrir algo que no cambia el ancho no puede mover la letra",
);

ok("de entrada no se esta anclando", !anclando(0));

// Los dos gestos no se pisan: arrastrar es pedir columnas con la mano, y gana.
anclarColumnas(1000);
empezarRedimension();
ok(
  "bajar el dedo en un separador cancela el anclaje",
  !anclando(1000),
  "si no, arrastrar justo despues de abrir un panel encogeria la letra en vez de dar columnas",
);
terminarRedimension();
pintar();

anclarColumnas(1000);
ok("tras avisar, la marca esta puesta", anclando(1000));
ok(
  "y sigue puesta unos frames despues",
  anclando(1000 + ANCLA_MS - 1),
  "un panel tarda dos o tres frames en asentar su layout",
);
ok("pero caduca sola", !anclando(1000 + ANCLA_MS));
ok(
  "la marca dura lo bastante para varios frames",
  ANCLA_MS >= 200,
  "por debajo, el ajuste bueno llega cuando ya ha caducado",
);
pintar();
ok(
  "y avisa a las terminales de que se reajusten",
  disparados.includes(EVENTO_REFIT),
  "sin esto habria que esperar a que algo mas moviera un pixel",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
