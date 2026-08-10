// Cuándo se apaga el cristal. Casos que se ejecutan de verdad.
//
//   npx tsc scripts/rendimiento-check.ts src/lib/rendimiento.ts --module commonjs \
//     --target es2022 --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/rendimiento-check.js
//
// Por qué existe: esta decisión se toma sola y cambia cómo se ve la app entera.
// Si se equivoca hacia un lado, Munir trabaja con la app a tirones sin saber por
// qué; si se equivoca hacia el otro, le apaga el cristal cuando no hacía falta y
// parece que Adeorq se ha estropeado. Y sobre todo: la MIGRACIÓN del ajuste
// viejo (que era un sí/no) no puede perder lo que él ya tenía puesto.
import { UMBRAL_AHORRO, debeAhorrar, type ModoRend } from "../src/lib/rendimiento";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- los dos modos que no piensan ---------------------------------------------
ok("«siempre» ahorra sin ninguna terminal", debeAhorrar("siempre", 0));
ok("«siempre» ahorra con muchas", debeAhorrar("siempre", 20));
ok("«nunca» no ahorra ni con veinte", !debeAhorrar("nunca", 20));
ok("«nunca» tampoco con cero", !debeAhorrar("nunca", 0));

// --- el automático, que es el de fábrica --------------------------------------
ok("en auto, sin terminales se queda el cristal", !debeAhorrar("auto", 0));
ok("una terminal no apaga nada", !debeAhorrar("auto", 1));
ok("tres tampoco: es el día normal de Munir", !debeAhorrar("auto", 3));
ok("la cuarta SÍ apaga el cristal", debeAhorrar("auto", 4));
ok("y de ahí para arriba, igual", debeAhorrar("auto", 9));

// El umbral tiene que ser exactamente el que dice la constante, no uno más ni
// uno menos: es lo que separa «va fino» de «se nota al escribir».
ok(
  "justo por debajo del umbral no ahorra",
  !debeAhorrar("auto", UMBRAL_AHORRO - 1),
  `${UMBRAL_AHORRO - 1} terminales`,
);
ok(
  "justo en el umbral sí",
  debeAhorrar("auto", UMBRAL_AHORRO),
  `${UMBRAL_AHORRO} terminales`,
);

// --- lo que no puede pasar nunca ----------------------------------------------
// Un contador negativo no existe, pero si algún día llega uno por un error de
// cuenta, lo que NO puede hacer es apagar el cristal por sorpresa.
ok("un número raro no enciende el ahorro solo", !debeAhorrar("auto", -3));

// La decisión es estable: preguntarla dos veces con lo mismo da lo mismo. Suena
// obvio y es lo que impide que el cristal parpadee al repintar.
const modos: ModoRend[] = ["nunca", "auto", "siempre"];
ok(
  "la misma pregunta da siempre la misma respuesta",
  modos.every((m) => [0, 3, 4, 8].every((n) => debeAhorrar(m, n) === debeAhorrar(m, n))),
);

// Y en auto la respuesta solo puede ir a MÁS ahorro según suben las terminales,
// nunca al revés: si abrir una terminal devolviera el cristal, la app parecería
// poseída.
let previo = false;
let monotono = true;
for (let n = 0; n <= 12; n++) {
  const hoy = debeAhorrar("auto", n);
  if (previo && !hoy) monotono = false;
  previo = hoy;
}
ok("abrir terminales nunca devuelve el cristal", monotono);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
