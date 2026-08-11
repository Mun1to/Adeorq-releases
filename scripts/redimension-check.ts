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
  CADENCIA_ARRASTRE_MS,
  EVENTO_REFIT,
  empezarRedimension,
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

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
