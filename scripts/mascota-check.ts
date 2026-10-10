// Los movimientos de la mascota (`lib/mascota.ts`).
//
// Lo que no puede pasar: un cuadro pintado fuera de su rejilla (se vería
// cortado en la barra), una postura sin ojo, un guion que no dura nada (el
// reloj giraría en vacío) o un ánimo que se quede en un solo fotograma.
//
//   pnpm bancos mascota

import {
  ALTO,
  ANCHO,
  GUIONES,
  REACCIONES,
  arrancar,
  avanzar,
  cuadrosDe,
  reaccionar,
  reposoDe,
  type Marcha,
  type Paso,
  type Pose,
} from "../src/lib/mascota";

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

const ANIMOS = Object.keys(GUIONES) as Array<keyof typeof GUIONES>;
const PUPILA = "#0e2c47";
const huella = (pose: Pose) => JSON.stringify(pose);

/** Todos los pasos que existen, con de dónde salen. */
const todos: Array<[string, Paso]> = [];
for (const a of ANIMOS) {
  const g = GUIONES[a];
  g.bucle.forEach((x, i) => todos.push([`${a}.bucle[${i}]`, x]));
  g.entrada?.forEach((x, i) => todos.push([`${a}.entrada[${i}]`, x]));
  g.gestos?.forEach((gesto, j) => gesto.forEach((x, i) => todos.push([`${a}.gestos[${j}][${i}]`, x])));
}
for (const [nombre, pasos] of Object.entries(REACCIONES)) pasos.forEach((x, i) => todos.push([`reacción ${nombre}[${i}]`, x]));

// --- cada postura cabe y tiene ojo --------------------------------------------------
const fuera = todos.filter(([, [pose]]) => cuadrosDe(pose).some((q) => q.x < 0 || q.x >= ANCHO || q.y < 0 || q.y >= ALTO));
ok(`ninguna de las ${todos.length} posturas pinta fuera de la rejilla de ${ANCHO} × ${ALTO}`, fuera.length === 0, fuera.map(([n]) => n).join(", "));
const sinOjo = todos.filter(([, [pose]]) => !cuadrosDe(pose).some((q) => q.c === PUPILA));
ok("todas tienen ojo (pupila o párpado)", sinOjo.length === 0, sinOjo.map(([n]) => n).join(", "));
const pisados = todos.filter(([, [pose]]) => {
  const vistos = new Set<string>();
  return cuadrosDe(pose).some((q) => (vistos.has(`${q.x},${q.y}`) ? true : (vistos.add(`${q.x},${q.y}`), false)));
});
ok("ningún cuadro se pinta encima de otro (un brazo sobre el cuerpo, una chispa sobre un brazo)", pisados.length === 0, pisados.map(([n]) => n).join(", "));
const cortos = todos.filter(([, [, ms]]) => !(ms >= 100));
ok("ningún paso dura menos de una décima: el reloj no gira en vacío", cortos.length === 0, cortos.map(([n]) => n).join(", "));

// --- cada ánimo se mueve y no se parece a otro ------------------------------------------
for (const a of ANIMOS) {
  const distintas = new Set(GUIONES[a].bucle.map(([pose]) => huella(pose))).size;
  ok(`«${a}» tiene más de un fotograma en su bucle`, distintas > 1, `tiene ${distintas}`);
}
ok("cada ánimo tiene su propia postura de reposo", new Set(ANIMOS.map((a) => huella(reposoDe(a)))).size === ANIMOS.length);
ok(
  "los cuatro ánimos despiertos tienen gestos para no repetirse",
  (["quieta", "trabaja", "espera", "lista"] as const).every((a) => (GUIONES[a].gestos?.length ?? 0) >= 1 && GUIONES[a].cada),
);

// --- el ojo sigue al ratón solo cuando mira de frente -----------------------------------
const pupilas = (pose: Pose, mirada: "" | "izq" | "der" | "bajo") => cuadrosDe(pose, mirada).filter((q) => q.c === PUPILA).map((q) => q.x).sort((x, y) => x - y).join();
const frente = reposoDe("quieta");
ok("de frente, la pupila se va a donde está el ratón", pupilas(frente, "izq") !== pupilas(frente, "") && pupilas(frente, "der") !== pupilas(frente, "izq"));
const filaPupila = (mirada: "" | "bajo") => cuadrosDe(frente, mirada).filter((q) => q.c === PUPILA).map((q) => q.y).join();
ok("y baja si el ratón está debajo", filaPupila("bajo") !== filaPupila(""));
const tecleando = GUIONES.trabaja.bucle[0][0];
ok("tecleando no gira el ojo por el ratón", pupilas(tecleando, "izq") === pupilas(tecleando, ""));
const dormida = reposoDe("dormida");
ok("dormida tampoco", pupilas(dormida, "der") === pupilas(dormida, ""));

// --- quién decide el fotograma ----------------------------------------------------------
/** Corre `n` pasos y devuelve las posturas y cuánto tiempo pasó. */
function correr(m: Marcha, n: number, azar: () => number, desde = 0): { poses: string[]; marcha: Marcha; ahora: number } {
  const poses: string[] = [];
  let ahora = desde;
  for (let i = 0; i < n; i++) {
    const r = avanzar(m, ahora, azar);
    m = r.marcha;
    poses.push(huella(m.pose));
    ahora += r.espera;
  }
  return { poses, marcha: m, ahora };
}
const nunca = () => 0.999;
const entrada = GUIONES.espera.entrada!.map(([pose]) => huella(pose));
const bucle = GUIONES.espera.bucle.map(([pose]) => huella(pose));
const alEmpezar = correr(arrancar("espera", 0, nunca), entrada.length + bucle.length, nunca);
ok("al llegar a un ánimo se ve su entrada y luego su bucle", JSON.stringify(alEmpezar.poses) === JSON.stringify([...entrada, ...bucle]));
const otraVuelta = correr(alEmpezar.marcha, bucle.length, nunca, alEmpezar.ahora);
ok("y la entrada no se repite en la segunda vuelta", JSON.stringify(otraVuelta.poses) === JSON.stringify(bucle));

// Los gestos: salen entre vuelta y vuelta, pasado su rato, y no antes.
const q = GUIONES.quieta;
const vuelta = q.bucle.length;
const sinGesto = correr(arrancar("quieta", 0, nunca), vuelta * 2, nunca);
ok("antes de su rato no sale ningún gesto", sinGesto.poses.every((h) => q.bucle.some(([pose]) => huella(pose) === h)), `pasaron ${sinGesto.ahora} ms`);
const conGesto = correr(arrancar("quieta", 0, () => 0), vuelta * 4 + q.gestos![0].length, () => 0);
const primero = q.gestos![0].map(([pose]) => huella(pose));
ok(
  "pasado su rato sale un gesto, entero y entre dos vueltas del bucle",
  conGesto.poses.join("|").includes(primero.join("|")),
  `en ${conGesto.ahora} ms`,
);
const indices = new Set<number>();
for (let i = 0; i < 40; i++) {
  const azar = () => (i % 10) / 10;
  const m: Marcha = { animo: "quieta", cola: [], pose: reposoDe("quieta"), proximoGesto: 0 };
  const h = huella(avanzar(m, 1, azar).marcha.pose);
  indices.add(q.gestos!.findIndex((g) => huella(g[0][0]) === h));
}
ok("con azar distinto salen gestos distintos, y nunca uno que no existe", indices.size === q.gestos!.length && !indices.has(-1), `salieron ${[...indices].join()}`);

// Las reacciones: lo siguiente que se ve, y luego sigue por donde iba.
const iba = correr(arrancar("trabaja", 0, nunca), 1, nunca).marcha;
const trasToque = correr(reaccionar(iba, "toque"), REACCIONES.toque.length + 1, nunca);
ok(
  "pulsarla mete el brinco delante y luego sigue con lo suyo",
  JSON.stringify(trasToque.poses.slice(0, REACCIONES.toque.length)) === JSON.stringify(REACCIONES.toque.map(([pose]) => huella(pose))) &&
    trasToque.poses[REACCIONES.toque.length] === huella(GUIONES.trabaja.bucle[1][0]),
);
ok("un ánimo sin gestos (dormida) gira en su bucle sin romperse", correr(arrancar("dormida", 0, () => 0), 12, () => 0).poses.length === 12);

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
