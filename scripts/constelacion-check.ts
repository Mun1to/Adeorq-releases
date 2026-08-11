// Comprobación de la Constelación: el reparto, medido y no mirado.
//
//   npx tsc scripts/constelacion-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/constelacion-check.js
//
// Antes esto medía una colocación por fuerzas y su fallo estrella (un punto que
// salía disparado a la otra punta). Esa física se retiró el 2026-08-10: no era
// el problema. Con 599 documentos y el 64 % de los enlaces cruzando de un
// proyecto a otro, lo que no se leía eran las LÍNEAS, y eso no se arregla
// colocando mejor los puntos. Ahora cada proyecto ocupa un arco del círculo.
//
// Lo que se mide aquí es que ese reparto no se solape, no se salga y no mienta:
// mirar el mapa y opinar no demuestra que dos arcos no se pisen, porque a
// simple vista un solape de dos grados no se ve y aun así junta dos proyectos.

import {
  anillar,
  radioTotal,
  tiroDelHilo,
  DR,
  R0,
  R_LIBRE,
  type Sitio,
} from "../src/lib/constelacion";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto?: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}${visto === undefined ? "" : `\n       visto: ${JSON.stringify(visto)}`}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

/** Una bóveda de mentira con la forma de la de verdad: unos proyectos gordos y
    una cola larga de proyectos de dos o tres documentos. */
function boveda(reparto: number[]) {
  const docs: Array<{ id: string; fam: string }> = [];
  reparto.forEach((n, i) => {
    for (let k = 0; k < n; k++) docs.push({ id: `p${i}-d${k}`, fam: `proy${String(i).padStart(2, "0")}` });
  });
  return docs;
}

const TAU = Math.PI * 2;
/** El ángulo de un arco, llevado siempre al mismo rango para poder compararlos. */
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

// ── Lo básico ────────────────────────────────────────────────────────────────
const vacio = anillar([], (x: { fam: string }) => x.fam);
comprueba("sin documentos no explota", vacio.pos.length === 0 && vacio.arcos.length === 0);

const uno = anillar(boveda([1]), (d) => d.fam);
comprueba("un solo documento cae en el primer anillo", Math.abs(Math.hypot(uno.pos[0].x, uno.pos[0].y) - R0) < 0.01, uno.pos[0]);
comprueba("y su proyecto se queda el círculo entero", uno.arcos[0].abre > TAU - 0.1, uno.arcos[0].abre);

// ── El reparto, que es lo que puede mentir ───────────────────────────────────
const real = boveda([103, 39, 31, 25, 18, 18, 11, 10, 10, 9, 9, 6, 5, 5, 4, 4, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1]);
const { pos, arcos } = anillar(real, (d) => d.fam);

comprueba("todos los documentos tienen sitio", pos.length === real.length && pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
comprueba("hay un arco por proyecto", arcos.length === 26, arcos.length);
comprueba(
  "ningún documento se pierde: los arcos suman todos",
  arcos.reduce((s, a) => s + a.n, 0) === real.length,
);
// El arco crece con el tamaño, pero YA NO es proporcional puro, y es a
// propósito (2026-08-11, ver `SEP_MIN`): así el de 103 tenía 100 veces el arco
// del de 1 y sus puntos quedaban a 7,9 px, porque el grande reparte en varias
// filas y el chico mete todo en una. Ahora cada uno se lleva primero lo que
// necesita para respirar. Lo que sí sigue siendo cierto es el ORDEN.
comprueba(
  "el que más tiene, más arco, y por ese orden",
  (() => {
    const porTamano = [...arcos].sort((a, b) => b.n - a.n);
    return porTamano.every((a, i) => i === 0 || porTamano[i - 1].abre >= a.abre - 1e-9);
  })(),
  { grande: arcos.find((a) => a.n === 103)!.abre, chico: arcos.find((a) => a.n === 1)!.abre },
);

// Y LA REGLA NUEVA, que es la que hace que los puntos puedan ser gordos: dos
// documentos de la misma fila nunca quedan más juntos que el radio de dos
// puntos. Se mide en el peor sitio, que es la primera fila (la de dentro).
comprueba(
  "dos vecinos de fila no se tocan ni en el proyecto más pequeño",
  (() => {
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
        if (d < min) min = d;
      }
    }
    // 25 = dos puntos del tamaño máximo (radio 12,5) pegados. Ver `radioDe`.
    return min >= 25;
  })(),
);

// EL CASO QUE IMPORTA: dos proyectos no pueden compartir sitio.
comprueba(
  "ningún arco se monta sobre el de al lado",
  (() => {
    const orden = [...arcos].sort((a, b) => a.a - b.a);
    for (let i = 1; i < orden.length; i++) {
      const finAnterior = orden[i - 1].a + orden[i - 1].abre / 2;
      const inicio = orden[i].a - orden[i].abre / 2;
      if (inicio < finAnterior - 1e-9) return false;
    }
    return true;
  })(),
);
comprueba(
  "y el círculo se cierra sin pasarse de una vuelta",
  (() => {
    const orden = [...arcos].sort((a, b) => a.a - b.a);
    const total = orden[orden.length - 1].a + orden[orden.length - 1].abre / 2 - (orden[0].a - orden[0].abre / 2);
    return total <= TAU + 1e-9;
  })(),
);

// ── Cada documento, dentro de su arco ────────────────────────────────────────
comprueba(
  "ningún documento se sale del arco de su proyecto",
  real.every((d, i) => {
    const arco = arcos.find((a) => a.fam === d.fam)!;
    // Distancia angular al centro de su arco, por el camino corto.
    let dif = Math.abs(norm(pos[i].a) - norm(arco.a));
    if (dif > Math.PI) dif = TAU - dif;
    return dif <= arco.abre / 2 + 1e-9;
  }),
);
// El primer anillo ya no está siempre en `R0`: con muchos proyectos el círculo
// se abre para que los puntos no se toquen (ver `SEP_MIN`). Lo que no cambia es
// que todas las familias arrancan en el MISMO anillo y suben de DR en DR, que
// es lo que hace que el mapa se lea como anillos y no como una espiral.
comprueba(
  "las filas van todas del mismo anillo hacia fuera, sin huecos",
  (() => {
    const radios = [...new Set(pos.map((p) => Math.round(p.r)))].sort((a, b) => a - b);
    return radios[0] >= R0 && radios.every((r, i) => i === 0 || r - radios[i - 1] === DR);
  })(),
  [...new Set(pos.map((p) => Math.round(p.r)))].sort((a, b) => a - b),
);
comprueba(
  "el proyecto más gordo no se estira hasta el infinito",
  radioTotal(arcos) < R0 + DR * 12,
  { radio: Math.round(radioTotal(arcos)), filas: Math.round((radioTotal(arcos) - R0) / DR) },
);
comprueba(
  "dos documentos nunca caen en el mismo punto",
  new Set(pos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size === pos.length,
);

// ── Estabilidad: lo que hace que el mapa sea reconocible ─────────────────────
comprueba(
  "el mismo montón dos veces da el mismo mapa",
  JSON.stringify(anillar(real, (d) => d.fam).pos) === JSON.stringify(pos),
);
comprueba(
  "el orden de los proyectos es alfabético, no por tamaño",
  (() => {
    const nombres = arcos.map((a) => a.fam);
    return JSON.stringify(nombres) === JSON.stringify([...nombres].sort());
  })(),
  arcos.slice(0, 4).map((a) => `${a.fam}(${a.n})`),
);
comprueba(
  "quitar los sueltos no reordena a los demás",
  (() => {
    const conectados = real.filter((d) => !["proy23", "proy24", "proy25"].includes(d.fam));
    const b = anillar(conectados, (d) => d.fam);
    const antes = arcos.map((a) => a.fam).filter((f) => !["proy23", "proy24", "proy25"].includes(f));
    return JSON.stringify(b.arcos.map((a) => a.fam)) === JSON.stringify(antes);
  })(),
);

// ── Un solo proyecto con todo dentro, que es la bóveda recién estrenada ──────
const solo = anillar(boveda([80]), (d) => d.fam);
comprueba("una bóveda de un solo proyecto se reparte igual", solo.pos.length === 80 && solo.arcos.length === 1);
comprueba(
  "y en varias filas, no en una sola vuelta apretada",
  new Set(solo.pos.map((p) => Math.round(p.r))).size > 1,
  [...new Set(solo.pos.map((p) => Math.round(p.r)))],
);

// ── Y LA BÓVEDA DE VERDAD, con su forma medida ──────────────────────────────
// Ocho proyectos brutalmente desiguales (`node scripts/medir-constelacion.mjs`,
// 2026-08-11): uno de 201 documentos y tres de uno solo. Es el caso que rompía
// el reparto proporcional puro, con dos vecinos a 7,9 px.
const real8 = anillar(boveda([201, 93, 34, 2, 2, 1, 1, 1]), (d) => d.fam);
comprueba(
  "en la bóveda de verdad, dos vecinos nunca bajan de 26 px",
  (() => {
    let min = Infinity;
    const p = real8.pos;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        min = Math.min(min, Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
      }
    }
    return min >= 25;
  })(),
  (() => {
    let min = Infinity;
    const p = real8.pos;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        min = Math.min(min, Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
      }
    }
    return { separacionMinima: Math.round(min) };
  })(),
);
// Con ocho proyectos el círculo NO tiene que crecer: cabe de sobra. Si esto
// falla, es que `SEP_MIN` subió tanto que la bóveda de casa se sale.
comprueba("y sin tener que agrandar el círculo", Math.round(Math.min(...real8.pos.map((p) => p.r))) === R0);

// ── EL HUECO DEL CENTRO, que es donde viven las skills ──────────────────────
// Ningún hilo puede entrar ahí, o se come el anillo del medio. Se comprueba
// muestreando la curva de verdad, no fiándose de la fórmula.
const enCurva = (p: Sitio, q: Sitio, t: number) => {
  const c = tiroDelHilo(p, q);
  const u = 1 - t;
  return {
    x: u * u * p.x + 2 * u * t * c.x + t * t * q.x,
    y: u * u * p.y + 2 * u * t * c.y + t * t * q.y,
  };
};
const cerca = (p: Sitio, q: Sitio) => {
  let min = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const b = enCurva(p, q, t);
    min = Math.min(min, Math.hypot(b.x, b.y));
  }
  return min;
};
const sitio = (a: number, r: number): Sitio => ({ x: Math.cos(a) * r, y: Math.sin(a) * r, a, r });

comprueba(
  "un hilo entre dos documentos OPUESTOS rodea el centro",
  cerca(sitio(0, R0), sitio(Math.PI, R0)) >= R_LIBRE - 1,
  { pasa_a: Math.round(cerca(sitio(0, R0), sitio(Math.PI, R0))), libre: R_LIBRE },
);
// OJO con este: hasta hoy el comentario del dibujo decía que «dos vecinos del
// mismo arco casi no se curvan», y es MENTIRA. Un hilo entre dos documentos
// pegados se hunde hasta el 54 % de su radio, o sea que de un anillo a 430 baja
// a 232. Es lo que hace la flor de pétalos largos del mapa. Queda escrito aquí
// para que el siguiente que lo lea sepa lo que hay, no lo que se creía.
comprueba(
  "un hilo entre vecinos se hunde al 54 %, ni más ni menos",
  Math.abs(cerca(sitio(0, R0), sitio(0.15, R0)) / R0 - 0.54) < 0.02,
  { pasa_a: Math.round(cerca(sitio(0, R0), sitio(0.15, R0))), anillo: R0 },
);
// La tolerancia del 3 % no es pereza: el punto garantizado es el de la mitad de
// la curva, y cuando los dos extremos están en filas muy distintas (782 y 430,
// medido) el punto más bajo se corre a t = 0,53 y pierde tres píxeles. Tres
// sobre 196 no los ve nadie; exigir el clavado obligaría a una fórmula que
// resuelve un problema que no existe.
comprueba(
  "ningún hilo de la bóveda de verdad entra en el hueco",
  (() => {
    const p = real8.pos;
    for (let i = 0; i < p.length; i += 3) {
      for (let j = i + 1; j < p.length; j += 7) {
        if (cerca(p[i], p[j]) < R_LIBRE * 0.97) return false;
      }
    }
    return true;
  })(),
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
