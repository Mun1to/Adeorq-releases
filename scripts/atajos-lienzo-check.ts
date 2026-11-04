// Banco de a quién le toca una tecla que piden el lienzo y un atajo global.
//
//   pnpm bancos atajos-lienzo
//
// Ctrl+Mayús+E (exportar el dibujo / modo emisión) y Ctrl+Mayús+↓ (enviar al
// fondo / partir el panel) las quieren los dos, y con el lienzo a la vista hacían
// las dos cosas a la vez. La regla (`lib/atajos.ts`): el lienzo se queda con la
// tecla solo si tiene algo sobre lo que actuar (algo cogido, o algo dibujado) y la
// pulsación es de verdad; si no, es del global. La prueba con la app entera, y con
// las teclas de verdad, es `scripts/laboratorio/atajos-lienzo-de-verdad.mjs`.
import { ACCIONES, laTomaElLienzo, loTomaElLienzo, puedeActuar, registrarLienzo, resolver } from "../src/lib/atajos";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto?: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

const tecla = (isTrusted: boolean) => ({ isTrusted }) as KeyboardEvent;
const verdadera = tecla(true);
const reenviada = tecla(false);

// Las tres que comparten tecla con un global, y lo que cada una necesita.
comprueba("exportar sin nada dibujado no es del lienzo", !puedeActuar("exportar", verdadera, 0, 0));
comprueba("exportar con algo dibujado sí, aunque no haya nada cogido", puedeActuar("exportar", verdadera, 0, 3));
comprueba("al fondo sin nada cogido no es del lienzo, aunque haya dibujo", !puedeActuar("alFondo", verdadera, 0, 3));
comprueba("al fondo con algo cogido sí", puedeActuar("alFondo", verdadera, 1, 3));
comprueba("al frente sin nada cogido no es del lienzo", !puedeActuar("alFrente", verdadera, 0, 3));
comprueba("al frente con algo cogido sí", puedeActuar("alFrente", verdadera, 2, 3));
comprueba("una tecla reenviada (la paleta, el navegador de un panel) nunca es del lienzo", !puedeActuar("exportar", reenviada, 1, 3) && !puedeActuar("alFondo", reenviada, 1, 3) && !puedeActuar("alFrente", reenviada, 1, 3));
comprueba("lo que no comparte tecla con ningún global no se condiciona", puedeActuar("claude", reenviada, 0, 0) && puedeActuar("goma", verdadera, 0, 0) && puedeActuar("borrar", reenviada, 0, 0));

// `laTomaElLienzo` es lo mismo, pero solo para esas tres: es lo que le dice al global que suelte.
comprueba("laTomaElLienzo: exportar con dibujo", laTomaElLienzo("exportar", verdadera, 0, 3));
comprueba("laTomaElLienzo: exportar sin dibujo, no", !laTomaElLienzo("exportar", verdadera, 0, 0));
comprueba("laTomaElLienzo: sin acción, no", !laTomaElLienzo(null, verdadera, 5, 5));
comprueba("laTomaElLienzo: una acción que no es de las disputadas no corta a ningún global", !laTomaElLienzo("claude", verdadera, 5, 5) && !laTomaElLienzo("rehacer", verdadera, 5, 5));

// El registro: sin lienzo montado, el global nunca suelta nada.
registrarLienzo(null);
comprueba("sin lienzo registrado, el global se queda con todo", !loTomaElLienzo(verdadera));
registrarLienzo(() => true);
comprueba("con el lienzo diciendo que sí, el global suelta", loTomaElLienzo(verdadera));
registrarLienzo(null);
comprueba("y al irse el lienzo, vuelve a ser del global", !loTomaElLienzo(verdadera));

// Que la regla mire lo que de verdad choca: las tres siguen con su tecla de fábrica.
const mapa = resolver({});
comprueba("exportar sigue siendo Ctrl+Shift+E y al fondo Ctrl+Shift+ArrowDown (las que chocan)", mapa.exportar === "Ctrl+Shift+E" && mapa.alFondo === "Ctrl+Shift+ArrowDown" && mapa.alFrente === "Ctrl+Shift+ArrowUp", [mapa.exportar, mapa.alFondo, mapa.alFrente]);
comprueba("y el catálogo no perdió ninguna acción", ACCIONES.length >= 31, ACCIONES.length);

if (fallos) {
  console.log(`\n${fallos} fallo(s)`);
  process.exitCode = 1;
} else {
  console.log("\nTodo en verde.");
}
