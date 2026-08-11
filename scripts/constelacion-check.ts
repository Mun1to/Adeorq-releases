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

import { anillar, radioTotal, R0, DR } from "../src/lib/constelacion";

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
comprueba(
  "el arco de cada uno es proporcional a lo que tiene",
  (() => {
    const grande = arcos.find((a) => a.n === 103)!;
    const chico = arcos.find((a) => a.n === 1)!;
    const razon = grande.abre / chico.abre;
    return razon > 60 && razon < 130;
  })(),
  { grande: arcos.find((a) => a.n === 103)!.abre, chico: arcos.find((a) => a.n === 1)!.abre },
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
comprueba(
  "las filas van del primer anillo hacia fuera, sin huecos",
  (() => {
    const radios = [...new Set(pos.map((p) => Math.round(p.r)))].sort((a, b) => a - b);
    return radios[0] === R0 && radios.every((r, i) => i === 0 || r - radios[i - 1] === DR);
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

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
