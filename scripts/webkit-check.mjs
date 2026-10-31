// Lo que WebKitGTK tira entero: un valor de CSS que Linux no entiende.
//
//     node scripts/webkit-check.mjs
//
// En Linux, Adeorq pinta con WebKitGTK, no con Chromium. Cuando un valor lleva
// una palabra que el motor no conoce, el navegador no se queda con la parte
// que sí entiende: tira la declaración ENTERA. Así pasó el 2026-10-31 con
// `container-type: inline-size scroll-state` en la cabecera de cada terminal.
// WebKit no sabe qué es `scroll-state`, se quedó sin `inline-size`, ningún
// `@container` saltó, y un usuario de Linux veía el modelo y la memoria pero
// no el nombre de su proyecto. En Windows todo iba bien, y por eso nadie lo vio.
//
// La salida es de toda la vida: antes, la misma propiedad sin la palabra nueva.
//     container-type: inline-size;
//     container-type: inline-size scroll-state;
// Chromium se queda con la segunda, y WebKit tira la segunda y se queda con la
// primera. Esto falla si una de esas palabras va sin su línea de respaldo.
//
// La lista se amplía a mano, con el porqué de cada una. Que esto pase no dice
// que todo el CSS funcione en Linux: dice que esto en concreto no ha vuelto.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hojaDeLaApp } from "./hoja.cjs";

/** Palabra que WebKitGTK no conoce → para qué la usamos y qué se pierde sin respaldo. */
export const SIN_WEBKIT = {
  "scroll-state":
    "consultas de scroll (`@container scroll-state(...)`); sin respaldo se pierde también el `inline-size` de la misma línea",
};

/** Las declaraciones de cada bloque `{ ... }`, sin comentarios, en orden. */
function bloques(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...limpio.matchAll(/\{([^{}]*)\}/g)].map((m) =>
    m[1]
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.includes(":"))
      .map((d) => {
        const i = d.indexOf(":");
        return { prop: d.slice(0, i).trim().toLowerCase(), valor: d.slice(i + 1).trim() };
      }),
  );
}

/** Cada declaración con una palabra de la lista que no lleva antes su respaldo. */
export function sinRespaldo(css, lista = SIN_WEBKIT) {
  const fallos = [];
  for (const decls of bloques(css)) {
    decls.forEach((d, i) => {
      for (const palabra of Object.keys(lista)) {
        if (!new RegExp(`(^|[\\s,(])${palabra}($|[\\s,)])`).test(d.valor)) continue;
        const respaldo = decls
          .slice(0, i)
          .some((a) => a.prop === d.prop && !a.valor.includes(palabra));
        if (!respaldo) fallos.push({ prop: d.prop, valor: d.valor, palabra });
      }
    });
  }
  return fallos;
}

// Primero se prueba a sí mismo: un comprobador que no ve el fallo que vino a
// cazar es peor que no tenerlo, porque da un verde que miente.
const malo = ".a { display: flex; container-type: inline-size scroll-state; }";
const bueno = ".a { container-type: inline-size; container-type: inline-size scroll-state; }";
const consulta = "@container scroll-state(scrollable: right) { .b { color: red; } }";
if (sinRespaldo(malo).length !== 1) throw new Error("webkit-check no ve el caso de la cabecera de 2026-10-31");
if (sinRespaldo(bueno).length !== 0) throw new Error("webkit-check da por malo un respaldo bien puesto");
if (sinRespaldo(consulta).length !== 0) throw new Error("webkit-check confunde la consulta con una declaración");

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const fallos = sinRespaldo(hojaDeLaApp(raiz));
if (fallos.length) {
  console.log("Declaraciones que WebKitGTK (Adeorq en Linux) tira enteras, sin línea de respaldo antes:\n");
  for (const f of fallos) {
    console.log(`  ${f.prop}: ${f.valor}`);
    console.log(`    «${f.palabra}»: ${SIN_WEBKIT[f.palabra]}`);
  }
  console.log("\nPon antes, en la misma regla, la propiedad sin esa palabra.");
  process.exit(1);
}
console.log(`webkit-check: ninguna declaración sin respaldo (${Object.keys(SIN_WEBKIT).join(", ")})`);
