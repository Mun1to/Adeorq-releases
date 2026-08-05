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
import { colocar, paso, PARA_EN, VEL_MAX, type Hilo, type Punto } from "../src/lib/constelacion";

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

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
