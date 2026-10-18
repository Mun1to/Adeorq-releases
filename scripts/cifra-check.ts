// Una cifra que cuenta hasta su número (`lib/cifra.ts`): el tramo y sus bordes.
//
// Lo que no puede pasar: que arranque en otro número que el que había, que se
// pase de largo, que llegue a medias, o que enseñe decimales por el camino.
//
//   pnpm bancos cifra

import { CUENTA_MS, duracion, tramo } from "../src/lib/cifra";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = sale === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale «${String(sale)}», se esperaba «${String(esperado)}»`}`);
}

es("al empezar, lo que había", tramo(10, 50, 0), 10);
es("al acabar, el número", tramo(10, 50, 1), 50);
es("a mitad de camino ya pasó de la mitad: sale rápido y frena al llegar", tramo(0, 100, 0.5) > 50 && tramo(0, 100, 0.5) < 100, true);
es("a tres cuartos del camino todavía no enseña el número final", tramo(0, 497, 0.75) < 497, true);
es("pasado el final no se pasa de largo", tramo(0, 100, 1.4), 100);
es("antes del principio no retrocede", tramo(20, 100, -0.3), 20);
es("hacia abajo también cuenta", tramo(533, 0, 1), 0);
es("hacia abajo, a mitad, va por debajo de la mitad", tramo(533, 0, 0.5) < 266, true);
es("siempre entera", Number.isInteger(tramo(3, 7, 0.37)), true);
es("de un número a sí mismo, ese número", tramo(12, 12, 0.5), 12);
es("un suspiro largo de fábrica", CUENTA_MS, 700);
es("con el modo rendimiento o «reducir movimiento», menos de la mitad del tiempo", duracion(700, true), 280);
es("sin ahorrar, lo que se pidió", duracion(700, false), 700);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
