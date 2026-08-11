// El turno de los que terminan, y cuándo se deshace la pantalla completa.
//
//   npx tsc scripts/saltos-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/saltos-check.js

import {
  aQuienLeToca,
  encolar,
  esInputDeVerdad,
  sacarDeCola,
  tocaDesmaximizar,
} from "../src/lib/saltos";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- la cola, que es lo que pidio: «que espere a su turno» -------------------
ok("el primero que termina entra", encolar([], 3).join() === "3");
ok("por orden de llegada", encolar(encolar([], 3), 7).join() === "3,7");
ok(
  "el mismo dos veces no se cuela",
  encolar([3, 7], 3).join() === "3,7",
  "terminar, contestarle y volver a terminar sigue siendo un turno",
);
ok("salir de la cola", sacarDeCola([3, 7, 9], 7).join() === "3,9");
ok("sacar a uno que no estaba no rompe nada", sacarDeCola([3], 9).join() === "3");

ok("con la cola vacia no le toca a nadie", aQuienLeToca([], new Set([1, 2])) === null);
ok("le toca al primero", aQuienLeToca([7, 3], new Set([3, 7])) === 7, "orden de llegada, no de id");
ok(
  "una terminal cerrada pierde su turno",
  aQuienLeToca([7, 3], new Set([3])) === 3,
  "saltar a un panel que ya no existe dejaba la cabina en blanco",
);
ok("si no queda ninguno vivo, nadie", aQuienLeToca([7, 3], new Set([1])) === null);

// --- que cuenta como «darle un input nuevo» ---------------------------------
ok("una letra cuenta", esInputDeVerdad("a"));
ok("una frase cuenta", esInputDeVerdad("arregla el login"));
ok("el enter cuenta", esInputDeVerdad("\r"));
ok("el tabulador cuenta", esInputDeVerdad("\t"), "autocompletar es estar componiendo algo");
ok("borrar cuenta", esInputDeVerdad("\x7f"), "estas editando lo que vas a mandar");
ok("Ctrl+C cuenta", esInputDeVerdad("\x03"), "parar es intervenir de la forma mas clara que hay");
ok("una tilde cuenta", esInputDeVerdad("ñ"));
ok("un emoji cuenta", esInputDeVerdad("🙂"), "van en dos unidades y no se pueden partir a ciegas");
ok(
  "la flecha arriba NO cuenta",
  !esInputDeVerdad("\x1b[A"),
  "mirar el historial es SEGUIR leyendo lo que te acaba de enseñar",
);
ok("la flecha abajo NO cuenta", !esInputDeVerdad("\x1b[B"));
ok("Escape NO cuenta", !esInputDeVerdad("\x1b"));
ok("una tecla de funcion NO cuenta", !esInputDeVerdad("\x1bOP"));
ok("nada no cuenta", !esInputDeVerdad(""));

// --- y cuando se deshace la pantalla completa -------------------------------
ok(
  "escribir en la que puso el salto la devuelve al mosaico",
  tocaDesmaximizar(4, 4, 4, "hola"),
);
ok(
  "si la maximizaste TU, escribir no te la quita",
  !tocaDesmaximizar(4, null, 4, "hola"),
  "la pusiste ahi a proposito",
);
ok(
  "escribir en OTRA no toca la maximizada",
  !tocaDesmaximizar(4, 4, 9, "hola"),
  "es la de al lado, no tiene nada que ver",
);
ok("sin nada maximizado no hay nada que deshacer", !tocaDesmaximizar(null, null, 4, "hola"));
ok(
  "mirar el historial en la maximizada NO la cierra",
  !tocaDesmaximizar(4, 4, 4, "\x1b[A"),
  "es justo cuando mas falta hace la pantalla grande",
);
ok(
  "y el enter si",
  tocaDesmaximizar(4, 4, 4, "\r"),
  "le acabas de mandar algo: ya esta atendida",
);
ok(
  "una marca vieja de otro pane no desmaximiza",
  !tocaDesmaximizar(4, 9, 4, "hola"),
  "el salto fue de otro y luego maximizaste esta a mano",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
