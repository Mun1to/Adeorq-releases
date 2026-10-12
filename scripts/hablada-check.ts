// Cuándo le has dicho algo a una terminal (`lib/hablada.ts`): es lo que da por
// hablada la decisión que te preguntó, y la quita de la pestaña sola.
//
// Lo que no puede pasar: que contestar un menú del CLI, mover el cursor o pulsar
// Intro a secas cierre una decisión; ni que una frase de verdad no la cierre.
//
//   pnpm bancos hablada

import { mandoUnaFrase, tecleo } from "../src/lib/hablada";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = JSON.stringify(sale) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${JSON.stringify(sale)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

/** Un tecleo detrás de otro, como llegan del `onData`. */
function teclea(...golpes: string[]): boolean {
  let linea = false;
  let alguna = false;
  for (const g of golpes) {
    const r = tecleo(linea, g);
    linea = r.conTexto;
    alguna ||= r.enviada;
  }
  return alguna;
}

es("«la 2» letra a letra y luego Intro: frase", teclea("l", "a", " ", "2", "\r"), true);
es("un número solo y su Intro también vale («2»)", teclea("2", "\r"), true);
es("Intro a secas: nada", teclea("\r"), false);
es("flechas e Intro, que es elegir en un menú: nada", teclea("\x1b[B", "\x1b[B", "\r"), false);
es("Esc solo: nada", teclea("\x1b", "\r"), false);
es("escribir y borrarlo con Ctrl+C antes del Intro: nada", teclea("h", "o", "l", "a", "\x03", "\r"), false);
es("pegado entre corchetes y su Intro: frase", teclea("\x1b[200~A2, B1 y lo demás como dijiste\x1b[201~", "\r"), true);
es("dictado de golpe, con el Intro en el mismo trozo: frase", teclea("vale, la 3\r"), true);
es("un Intro primero y el texto después, sin otro Intro: aún no", teclea("\rhola"), false);
es("la línea a medias se queda para el siguiente Intro", tecleo(false, "\rhola"), { conTexto: true, enviada: false });
es("Mayús+Tab (cambiar de modo) e Intro: nada", teclea("\x1b[Z", "\r"), false);
es("Supr y Retroceso no escriben", teclea("\x7f", "\x1b[3~", "\r"), false);

// Por terminal, y lo que se teclea para un menú del CLI no cuenta.
es("dos terminales no se mezclan la línea", [mandoUnaFrase(1, "si", false), mandoUnaFrase(2, "\r", false), mandoUnaFrase(1, "\r", false)], [false, false, true]);
es("con un menú en pantalla, la frase es para el menú", [mandoUnaFrase(3, "otra cosa", true), mandoUnaFrase(3, "\r", true)], [false, false]);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
