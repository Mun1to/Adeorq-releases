// Comprueba que las clases que usa la interfaz existen de verdad en App.css.
//
//     pnpm css
//
// Existe por cuatro fallos reales encontrados el mismo día (0.9.51):
//
//  · `.ws-dot` — el punto del color de cada proyecto en el Panel. El span va
//    vacío y solo lleva el color en línea, así que sin CSS ocupaba CERO
//    píxeles: no es que se viera mal, es que no se ha visto nunca.
//  · `.danger` — el botón «A la papelera», que borra una carpeta del disco,
//    salía del mismo azul que «Cancelar». La clase buena era `.modal-danger`.
//  · `.diff-empty` — errata de `.diff-empty-state`.
//  · `.np-primary` — dos botones de Memoria que querían destacarse y no lo
//    hacían.
//
// Ninguno lo ve el compilador (son cadenas válidas), ninguno rompe el build, y
// leyendo el código no se notan: hay que mirar la pantalla sabiendo qué buscar.
//
// La gracia está en no gritar por lo que está bien. Una clase que no existe NO
// es un fallo por sí sola: media interfaz las usa como gancho semántico
// (`<div className="cb-group cb-tools">`, donde el estilo lo pone `cb-group`).
// Así que se separan en dos montones:
//
//  1. SEGURO. O el elemento es una HOJA sin ninguna clase con estilo —un span
//     vacío sin tamaño no ocupa nada, y ahí no hay padre que lo salve—, o
//     existe una clase casi igual, que es la firma de una errata.
//  2. REVISAR. El resto: se listan sin hacer fallar.
//
// Lo de la hoja importa y costó cuatro falsos positivos aprenderlo: un `<div
// className="limit">` sin CSS propio NO está roto si su padre `.account-limits`
// es un flex con `gap`. Los contenedores casi siempre los coloca el de arriba;
// las hojas no tienen a nadie detrás.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RAIZ, "src");

// Las que las pone otro y por eso no están en nuestro CSS. React Flow lee estas
// del DOM para decidir quién se queda el ratón y la rueda.
const DE_FUERA = new Set(["nowheel", "nodrag", "nopan"]);

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const hojas = archivos(SRC).filter((f) => f.endsWith(".css"));
const css = [join(SRC, "App.css"), ...hojas].map((f) => readFileSync(f, "utf8")).join("\n");

// Los selectores declarados: `.loquesea` sin comerse el siguiente guion, para
// que `.diff-empty` no dé por buena a `.diff-empty-state`.
const declaradas = new Set(
  [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
);

// ¿Hay una declarada que sea esta misma más un trozo, pegada por un guion?
// `danger` ↔ `modal-danger` y `diff-empty` ↔ `diff-empty-state` sí; `np-primary`
// y `np-btn` no, que solo comparten el prefijo suelto y son cosas distintas.
//
// Con una salvedad que costó tres falsos positivos: si de la huérfana cuelgan
// VARIOS descendientes (`.limit` sobre `.limit-top`, `.limit-track`,
// `.limit-fill`), eso no es una errata, es el nombre de una familia — la
// convención de esta casa. Una errata deja UN pariente, no cuatro.
function parecida(clase) {
  const hijos = [...declaradas].filter((d) => d.startsWith(`${clase}-`));
  for (const d of declaradas) if (d.endsWith(`-${clase}`)) return d;
  return hijos.length === 1 ? hijos[0] : null;
}

const seguro = [];
const revisar = [];

for (const f of archivos(SRC).filter((f) => /\.tsx?$/.test(f))) {
  const src = readFileSync(f, "utf8");
  const donde = f.slice(SRC.length + 1).replace(/\\/g, "/");
  const lineas = src.split("\n");

  // className="a b" y className={`a b`}. Los que llevan ${} dentro se dejan
  // pasar: esos se arman en marcha y aquí no se puede saber cómo acaban.
  for (const m of src.matchAll(/className=(?:"([^"{}]+)"|\{`([^`$]+)`\})/g)) {
    const clases = (m[1] ?? m[2]).trim().split(/\s+/).filter(Boolean);
    const linea = src.slice(0, m.index).split("\n").length;
    const conEstilo = clases.filter((c) => declaradas.has(c) || DE_FUERA.has(c));

    // ¿Hoja o contenedor? Se cierra en su propia línea (`/>` o `</algo>`) es
    // hoja; si la etiqueta queda abierta, dentro va otra cosa y el que reparte
    // el sitio suele ser el padre.
    const suya = lineas[linea - 1] ?? "";
    const hoja = /\/>\s*$/.test(suya) || /<\/[a-zA-Z]/.test(suya);

    for (const c of clases) {
      if (declaradas.has(c) || DE_FUERA.has(c)) continue;
      const cerca = parecida(c);
      const fila = {
        donde: `${donde}:${linea}`,
        clase: c,
        con: clases.length > 1 ? clases.filter((x) => x !== c).join(" ") : "",
        cerca,
        hoja,
      };
      if (cerca || (hoja && conEstilo.length === 0)) seguro.push(fila);
      else revisar.push(fila);
    }
  }
}

if (seguro.length) {
  console.log(`\nSIN ESTILO (${seguro.length}): se pintan desnudos o son una errata`);
  for (const f of seguro) {
    const pista = f.cerca
      ? `¿querías decir .${f.cerca}?`
      : "no lleva ninguna otra clase con estilo y no hay padre que lo coloque";
    console.log(`  ${f.donde.padEnd(34)} .${f.clase.padEnd(20)} ${pista}`);
  }
}

if (revisar.length) {
  console.log(`\nREVISAR (${revisar.length}): no existen, pero hay quien les pone el sitio`);
  for (const f of revisar) {
    console.log(
      `  ${f.donde.padEnd(34)} .${f.clase.padEnd(20)} ${f.con ? `junto a: ${f.con}` : "contenedor, lo coloca su padre"}`,
    );
  }
}

if (!seguro.length) {
  console.log(
    `CSS: ${declaradas.size} clases declaradas y ninguna que se pinte desnuda` +
      (revisar.length ? ` (${revisar.length} ganchos sin estilo, a propósito o no).` : "."),
  );
}

// Solo el primer montón hace fallar: el segundo es casi todo legítimo y una
// herramienta que grita por lo que está bien se acaba ignorando.
process.exit(seguro.length ? 1 : 0);
