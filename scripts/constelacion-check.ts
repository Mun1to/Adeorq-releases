// Comprobación de la Constelación: la física, medida y no mirada.
//
//   npx tsc scripts/constelacion-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/constelacion-check.js
//
// Existe por un fallo concreto: con la repulsión sin acotar, un punto que caía
// casi encima de otro salía disparado a la otra punta del tablero y se quedaba
// allí para siempre. Se veía («hay nodos que se van a tomar por el culo», Munir
// 2026-08-02) pero no se demuestra mirando, porque cada arranque coloca
// distinto y el fallo aparece una vez de cada tantas. Aquí se corre la
// colocación entera con cuatrocientos puntos y se mide dónde acaban.
import {
  anclas,
  colocar,
  cumulos,
  paso,
  PARA_EN,
  VEL_MAX,
  type Hilo,
  type Punto,
} from "../src/lib/constelacion";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

/** Una bóveda de mentira con la misma forma que la de verdad: unos cuantos
    documentos muy enlazados y una cola larga con uno o dos enlaces, que es
    exactamente lo que salió al medir la bóveda real (442 documentos, 175 con
    enlaces, 572 flechas). */
function boveda(n: number, familias: number): { puntos: Punto[]; hilos: Hilo[] } {
  const docs = Array.from({ length: n }, (_, i) => ({
    id: `d${i}`,
    fam: `f${i % familias}`,
  }));
  const sitios = colocar(docs, (d) => d.fam);
  const grado = new Array(n).fill(0);
  const hilos: Hilo[] = [];
  // Determinista a propósito: un fallo que solo sale con ciertos números al
  // azar es un fallo que no se puede volver a mirar.
  for (let i = 1; i < n; i++) {
    // Cada documento enlaza a uno anterior; los primeros reciben muchos, que
    // es lo que crea los nodos gordos del centro.
    const j = Math.floor(i / 3) % i;
    hilos.push([i, j]);
    grado[i]++;
    grado[j]++;
    if (i % 7 === 0) {
      const k = (i * 13) % i;
      hilos.push([i, k]);
      grado[i]++;
      grado[k]++;
    }
  }
  const puntos: Punto[] = docs.map((d, i) => ({
    id: d.id,
    x: sitios[i].x,
    y: sitios[i].y,
    vx: 0,
    vy: 0,
    grado: grado[i],
    color: "",
    title: d.id,
  }));
  return { puntos, hilos };
}

/** Corre la colocación hasta que se enfría, midiendo lo que pasa por el camino. */
function correr(puntos: Punto[], hilos: Hilo[]) {
  let alpha = 1;
  let saltoMax = 0;
  let vueltas = 0;
  while (alpha > PARA_EN && vueltas < 2000) {
    const antes = puntos.map((p) => ({ x: p.x, y: p.y }));
    alpha = paso(puntos, hilos, alpha);
    for (let i = 0; i < puntos.length; i++) {
      const s = Math.hypot(puntos[i].x - antes[i].x, puntos[i].y - antes[i].y);
      if (s > saltoMax) saltoMax = s;
    }
    vueltas++;
  }
  const radios = puntos.map((p) => Math.hypot(p.x, p.y)).sort((a, b) => a - b);
  // Lo cerca que acaba cada punto de su vecino más próximo. Es el número del
  // fallo contrario al de salir disparado: si esto baja de lo que mide un
  // punto en pantalla, el tablero se ve como una mancha de círculos pegados.
  const vecino = puntos.map((p) => {
    let min = Infinity;
    for (const q of puntos) {
      if (q === p) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < min) min = d;
    }
    return min;
  });
  vecino.sort((a, b) => a - b);
  return {
    vueltas,
    saltoMax,
    /** La mitad de los puntos tiene su vecino más cerca que esto. */
    vecinoMedio: vecino[Math.floor(vecino.length / 2)],
    /** El par más pegado de todos. */
    vecinoMin: vecino[0],
    /** El más lejano del centro. Es el número del fallo: un punto disparado
        acaba a miles de píxeles mientras el resto está a cientos. */
    lejos: radios[radios.length - 1],
    /** La mitad de los puntos está más cerca que esto. */
    medio: radios[Math.floor(radios.length / 2)],
    finito: puntos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  };
}

// 1. Una bóveda del tamaño de la suya.
let r = correr(...(({ puntos, hilos }) => [puntos, hilos] as const)(boveda(400, 12)));
comprueba("400 puntos: ninguna coordenada se va a infinito", r.finito, r);
comprueba(
  "ningún punto salta más que el tope en un paso",
  r.saltoMax <= VEL_MAX + 0.001,
  r.saltoMax,
);
comprueba("la colocación termina y no se queda dando vueltas", r.vueltas < 400, r.vueltas);
// El de fuera no puede estar a más de seis veces la distancia del de en medio.
// Con la repulsión sin acotar esta proporción se iba por encima de veinte.
comprueba(
  "no hay ningún punto disparado lejos del resto",
  r.lejos < r.medio * 6,
  { lejos: Math.round(r.lejos), medio: Math.round(r.medio) },
);
// El fallo contrario, y el que vino después de arreglar el primero: un punto
// se dibuja con hasta nueve píxeles de radio, así que por debajo de veinte de
// separación el tablero se ve como una mancha de círculos pegados.
comprueba(
  "y tampoco se amontonan unos encima de otros",
  r.vecinoMedio > 26 && r.vecinoMin > 12,
  { vecinoMedio: Math.round(r.vecinoMedio), vecinoMin: Math.round(r.vecinoMin) },
);

// 2. El caso que lo rompía: todos los puntos exactamente en el mismo sitio.
//    Pasa de verdad cuando una bóveda tiene una sola carpeta y pocas notas.
const juntos = boveda(120, 1);
for (const p of juntos.puntos) {
  p.x = 0;
  p.y = 0;
}
r = correr(juntos.puntos, juntos.hilos);
comprueba("120 puntos encima del mismo píxel: siguen siendo números", r.finito, r);
comprueba(
  "y se separan sin que ninguno salga despedido",
  r.lejos < r.medio * 6 && r.saltoMax <= VEL_MAX + 0.001,
  { lejos: Math.round(r.lejos), medio: Math.round(r.medio), salto: r.saltoMax },
);

// 3. Sin un solo hilo: la gravedad tiene que recogerlos igual, porque es lo
//    único que actúa. Si se enfriara con el resto, quedarían desperdigados.
const sueltos = boveda(200, 8);
r = correr(sueltos.puntos, []);
comprueba("sin enlaces, nadie se queda en la otra punta", r.lejos < r.medio * 6, {
  lejos: Math.round(r.lejos),
  medio: Math.round(r.medio),
});

// 4. Un punto agarrado no se mueve, que es lo que permite colocarlo a mano.
const conMano = boveda(60, 4);
conMano.puntos[0].agarrado = true;
conMano.puntos[0].x = 900;
conMano.puntos[0].y = -400;
correr(conMano.puntos, conMano.hilos);
comprueba(
  "el punto que llevas agarrado se queda donde lo pones",
  conMano.puntos[0].x === 900 && conMano.puntos[0].y === -400,
  { x: conMano.puntos[0].x, y: conMano.puntos[0].y },
);

// ============================================================================
// LOS CÚMULOS POR PROYECTO (2026-08-10)
//
// La constelación era una nube donde todo flotaba igual y no se veía dónde
// acaba un proyecto y empieza otro. Ahora cada uno tiene su casa en una rueda y
// tira de los suyos. Esto mide que de verdad se agrupan, que las islas no se
// montan unas encima de otras, y que el imán nuevo no rompe lo de antes: un
// punto disparado sigue siendo el fallo que no puede volver.
// ============================================================================

/** La misma bóveda de mentira, pero diciendo de qué proyecto es cada uno. */
function bovedaConFamilias(n: number, familias: number) {
  const b = boveda(n, familias);
  b.puntos.forEach((p, i) => {
    p.fam = `f${i % familias}`;
  });
  const casas = anclas(
    Array.from({ length: familias }, (_, i) => `f${i}`).sort(),
  );
  return { ...b, casas };
}

function correrConCasas(
  puntos: Punto[],
  hilos: Hilo[],
  casas: Map<string, { x: number; y: number }>,
) {
  let alpha = 1;
  let vueltas = 0;
  while (alpha > PARA_EN && vueltas < 2000) {
    alpha = paso(puntos, hilos, alpha, casas);
    vueltas++;
  }
}

// --- la rueda ---------------------------------------------------------------
comprueba("sin proyectos, la rueda no explota", anclas([]).size === 0, anclas([]).size);
const unaSola = anclas(["solo"]).get("solo")!;
comprueba(
  "un proyecto solo va al centro, no descentrado sin motivo",
  unaSola.x === 0 && unaSola.y === 0,
  unaSola,
);
const rueda = anclas(["a", "b", "c", "d"]);
const radios4 = [...rueda.values()].map((c) => Math.hypot(c.x, c.y));
comprueba(
  "los cuatro caen en el mismo circulo",
  Math.max(...radios4) - Math.min(...radios4) < 1,
  radios4,
);
const r6 = Math.hypot(...Object.values(anclas(["a","b","c","d","e","f"]).get("a")!));
const r20 = Math.hypot(
  ...Object.values(anclas(Array.from({ length: 20 }, (_, i) => `p${i}`)).get("p0")!),
);
comprueba("con mas proyectos, la rueda se abre", r20 > r6, { r6, r20 });

// --- que de verdad se agrupan ------------------------------------------------
const c = bovedaConFamilias(120, 4);
correrConCasas(c.puntos, c.hilos, c.casas);

function centroDe(fam: string) {
  const l = c.puntos.filter((p) => p.fam === fam);
  return {
    x: l.reduce((s, p) => s + p.x, 0) / l.length,
    y: l.reduce((s, p) => s + p.y, 0) / l.length,
    l,
  };
}
const centros = ["f0", "f1", "f2", "f3"].map(centroDe);
const dentro =
  centros.reduce(
    (s, ce) => s + ce.l.reduce((t, p) => t + Math.hypot(p.x - ce.x, p.y - ce.y), 0) / ce.l.length,
    0,
  ) / centros.length;
let entre = 0;
let pares = 0;
for (let i = 0; i < centros.length; i++)
  for (let j = i + 1; j < centros.length; j++) {
    entre += Math.hypot(centros[i].x - centros[j].x, centros[i].y - centros[j].y);
    pares++;
  }
entre /= pares;
comprueba(
  "los de un mismo proyecto acaban mucho mas juntos entre si que de los otros",
  entre > dentro * 1.8,
  { dentro: Math.round(dentro), entre: Math.round(entre) },
);

// --- y sin romper lo de antes ------------------------------------------------
comprueba(
  "con el iman puesto, ninguna coordenada se va a infinito",
  c.puntos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  c.puntos.filter((p) => !Number.isFinite(p.x)).length,
);
const radiosC = c.puntos.map((p) => Math.hypot(p.x, p.y)).sort((a, b) => a - b);
comprueba(
  "ningun punto disparado lejos del resto",
  radiosC[radiosC.length - 1] < radiosC[Math.floor(radiosC.length * 0.9)] * 2.2,
  { p90: Math.round(radiosC[Math.floor(radiosC.length * 0.9)]), max: Math.round(radiosC.at(-1)!) },
);

// --- las islas que se dibujan ------------------------------------------------
const islas = cumulos(c.puntos);
comprueba("hay una isla por proyecto", islas.length === 4, islas.length);
comprueba(
  "vienen de mayor a menor, para que la grande no tape a la pequeña",
  islas.every((x, i) => i === 0 || islas[i - 1].r >= x.r),
  islas.map((x) => Math.round(x.r)),
);
comprueba(
  "cada isla cubre a los suyos",
  islas.every((x) =>
    c.puntos
      .filter((p) => p.fam === x.fam)
      .every((p) => Math.hypot(p.x - x.x, p.y - x.y) <= x.r + 0.01),
  ),
  islas.map((x) => x.fam),
);
const sinFam = cumulos([
  { id: "x", x: 0, y: 0, vx: 0, vy: 0, grado: 0, color: "", title: "x" },
]);
comprueba("un punto sin proyecto no inventa una isla", sinFam.length === 0, sinFam.length);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
