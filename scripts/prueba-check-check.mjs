// Que el guardián de las pruebas de verdad guarde.  `node scripts/prueba-check-check.mjs`
//
// Un comprobador sin comprobar es otra promesa sin probar, que es justo lo que
// vino a arreglar. Los casos salen del fallo real: las notas de la 0.9.152, que
// afirmaban «arreglado» sobre un síntoma que nunca se reprodujo.

import { revisar } from "./prueba-check.mjs";

let fallos = 0;
const ok = (n, c, d = "") => {
  if (!c) fallos++;
  console.log(`${c ? "ok  " : "FALLA"} ${n}${d ? " — " + d : ""}`);
};

// Lo que se publicó de verdad en la 0.9.152, palabra por palabra del principio.
const LAS_DE_LA_152 = `## El panel táctil ya no deja la terminal en «Pausada» con un roce

Subir en una terminal la congela para que puedas leer atrás. Ahora hace falta un
renglón entero. Medido: tres eventos de trackpad son 0,563 renglones.
`;

ok(
  "las notas que provocaron el enfado NO habrian salido",
  !revisar(LAS_DE_LA_152).ok,
  revisar(LAS_DE_LA_152).por?.split("\n")[0],
);

ok(
  "unas notas sin declaracion no salen",
  !revisar("## Algo\n\nTexto normal.").ok,
);

ok(
  "unas notas vacias no salen",
  !revisar("   \n\n  ").ok,
);

ok(
  "PROBADO con su explicacion sale",
  revisar(
    "> PROBADO: reproduje el fallo abriendo el panel y rodando hacia arriba, y tras el cambio ya no pasa.\n\n## Lo que cambia\n\nTexto.",
  ).ok,
);

ok(
  "una etiqueta sin explicar no vale",
  !revisar("> PROBADO: si.\n\n## Algo").ok,
);

ok(
  "MEDIDO sale, porque decir la verdad tiene que ser posible",
  revisar(
    "> MEDIDO: no pude reproducir tu gesto de trackpad en este equipo; lo que sí medí es que la vista pasa por 15 posiciones en vez de 1.\n\n## Lo que cambia\n\nTexto.",
  ).ok,
);

ok(
  "pero un MEDIDO que dice «arreglado» por el cuerpo NO sale",
  !revisar(
    "> MEDIDO: no pude reproducir tu gesto de trackpad; lo que sí medí es que la vista pasa por 15 posiciones.\n\n## Algo\n\nEsto queda arreglado del todo.",
  ).ok,
);

ok(
  "NO PROBADO sale si dice que falta",
  revisar(
    "> NO PROBADO: no puedo simular el panel táctil desde aquí; hace falta que lo pruebes tú y me digas.\n\n## Lo que cambia\n\nTexto.",
  ).ok,
);

ok(
  "y un NO PROBADO que se vende como resuelto NO sale",
  !revisar(
    "> NO PROBADO: no puedo simular el panel táctil desde aquí, hace falta probarlo a mano.\n\n## Algo\n\nCon esto queda resuelto.",
  ).ok,
);

// Citar la palabra no es usarla: unas notas que EXPLIQUEN esta misma regla
// tienen que poder salir. Fue lo primero que pasó al estrenar el guardián.
const EXPLICANDO_LA_REGLA = [
  "> MEDIDO: no pude reproducir tu gesto; lo que sí medí es que la vista pasa por 15 posiciones.",
  "",
  "## La barrera",
  "",
  "Un MEDIDO no puede usar la palabra «arreglado» por el cuerpo.",
].join("\n");

ok(
  "unas notas que EXPLICAN esta regla si salen: citar no es vender",
  revisar(EXPLICANDO_LA_REGLA).ok,
  revisar(EXPLICANDO_LA_REGLA).por,
);

ok(
  "un PROBADO si puede decir «arreglado», que para eso se probo",
  revisar(
    "> PROBADO: reproduje el fallo con el banco y tras el cambio no vuelve a pasar.\n\n## Algo\n\nQueda arreglado.",
  ).ok,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
