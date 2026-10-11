// Qué se ve mientras algo tarda (`lib/espera.ts`): los tres tramos y sus bordes.
//
// Lo que no puede pasar: que algo que acaba en un suspiro enseñe un aviso (un
// parpadeo), o que algo que tarda de verdad no diga nada.
//
//   pnpm bancos espera

import { faseDe, RUEDA_MS, SUSPIRO_MS } from "../src/lib/espera";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = sale === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale «${String(sale)}», se esperaba «${String(esperado)}»`}`);
}

es("recién pedido: nada", faseDe(0), "");
es("ochenta milisegundos, lo que tarda leer una carpeta: nada", faseDe(80), "");
es("justo antes de la décima: nada", faseDe(SUSPIRO_MS - 1), "");
es("en la décima: lo que había se apaga", faseDe(SUSPIRO_MS), "atenuado");
es("medio segundo: sigue apagado, sin rueda", faseDe(450), "atenuado");
es("justo antes del segundo: todavía sin rueda", faseDe(RUEDA_MS - 1), "atenuado");
es("en el segundo: la rueda", faseDe(RUEDA_MS), "rueda");
es("dos segundos y pico: la rueda", faseDe(2400), "rueda");
es("los tiempos son los que eligió Munir en la página de ejemplos", `${SUSPIRO_MS}/${RUEDA_MS}`, "100/1000");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
