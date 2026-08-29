// El plugin que hace editable una web desde Adeorq.
//
// ── QUÉ HACE ────────────────────────────────────────────────────────────────
//
// El panel de web de Adeorq enseña tu localhost. Para poder EDITARLO haciendo
// clic hacen falta dos cosas que la página no tiene por su cuenta:
//
//   1. Que cada elemento sepa de qué trozo de qué fichero salió. Sin eso se
//      puede cambiar el DOM, pero el cambio se pierde en cuanto recargas.
//   2. Código dentro de la página que escuche los clics y hable con Adeorq,
//      porque Adeorq no puede tocar el contenido de un iframe de otro origen.
//
// ── EL CAMINO QUE NO FUNCIONÓ, PARA NO REPETIRLO ────────────────────────────
//
// El primer intento fue no parsear nada: en desarrollo, el código que sirve
// Vite ya llama a `jsxDEV(tipo, props, clave, estáticos, ORIGEN)` con fichero,
// línea y columna dentro de `ORIGEN`, así que bastaba con envolver ese runtime
// y copiar el dato al elemento. Se probó, y el fichero SÍ es correcto pero la
// línea NO: se midió un `<h1>` que está en la línea 16 del fuente y llegaba
// como 35. Ese número cuenta sobre un fichero intermedio, con el preámbulo que
// `@vitejs/plugin-react` añade y que después desaparece, así que no existe en
// ningún sitio y no se puede compensar sin adivinar. Por eso aquí se parsea el
// fuente de verdad.
//
// ── LO QUE SE ESTAMPA ───────────────────────────────────────────────────────
//
// `data-adeorq-loc="src/App.jsx:412:461"`, y esos dos números son el trozo
// EXACTO que ocupa la etiqueta de apertura en el fichero, contando caracteres
// desde el principio. No es línea y columna a propósito: quien escribe después
// no tiene que volver a parsear nada ni contar tabulaciones, abre el fichero,
// corta por ahí y vuelve a pegar.
//
// ── LO QUE NO HACE ──────────────────────────────────────────────────────────
//
//  · Solo en DESARROLLO (`apply: "serve"`). En una web publicada no se cuela
//    nada: ni el atributo, ni la sonda, ni un byte.
//  · Solo etiquetas del navegador (`div`, `button`…). Un componente tuyo no
//    lleva marca propia: la lleva el elemento que acaba pintando.
//  · No añade ni quita saltos de línea, así que los números de línea de los
//    errores y del depurador siguen valiendo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** El id con el que la página pide la sonda. */
const SONDA = "/@adeorq/sonda.js";

/** El atributo que lleva el trozo de fichero de cada elemento. */
const MARCA = "data-adeorq-loc";

const EDITABLES = /\.(jsx|tsx)$/;

export default function adeorq(opciones = {}) {
  const { estampar = true, sonda = true } = opciones;
  let raiz = process.cwd();

  return {
    name: "adeorq",
    // Antes que el plugin de React: lo que hay que parsear es el fichero tal
    // como está en tu disco, no lo que otro plugin haya dejado por el camino.
    enforce: "pre",
    // NUNCA en producción. Esto es una herramienta de taller.
    apply: "serve",

    configResolved(config) {
      raiz = config.root;
    },

    resolveId(id) {
      return sonda && id.split("?")[0] === SONDA ? id : null;
    },

    load(id) {
      if (!sonda || id.split("?")[0] !== SONDA) return null;
      // La raíz viaja dentro de la sonda porque Adeorq no tiene forma de
      // saberla: ve una dirección de localhost, no una carpeta. Es lo que le
      // permite después convertir «src/App.jsx» en un fichero de tu disco.
      return fs
        .readFileSync(path.join(AQUI, "sonda.js"), "utf8")
        .replace("__ADEORQ_RAIZ__", JSON.stringify(raiz.split(path.sep).join("/")));
    },

    transform(codigo, id) {
      if (!estampar) return null;
      const limpio = id.split("?")[0];
      if (!EDITABLES.test(limpio) || limpio.includes("node_modules")) return null;

      let arbol;
      try {
        arbol = parse(codigo, {
          sourceType: "module",
          errorRecovery: true,
          plugins: ["jsx", "typescript", "decorators-legacy", "explicitResourceManagement"],
        });
      } catch {
        // Un fichero a medio escribir no es un error nuestro: se deja pasar sin
        // marca y ya se estampará cuando vuelva a compilar.
        return null;
      }

      const relativa = path.relative(raiz, limpio).split(path.sep).join("/");
      const cortes = [];
      recorrer(arbol.program, (nodo) => {
        if (nodo.type !== "JSXOpeningElement") return;
        const nombre = nodo.name;
        if (nombre.type !== "JSXIdentifier") return;
        // Mayúscula = componente tuyo, y un atributo ahí sería una prop que
        // nadie recoge. Minúscula = etiqueta del navegador, que sí lo lleva.
        if (nombre.name[0] !== nombre.name[0].toLowerCase()) return;
        cortes.push({
          donde: nombre.end,
          texto: ` ${MARCA}="${relativa}:${nodo.start}:${nodo.end}"`,
        });
      });
      if (cortes.length === 0) return null;

      // De atrás hacia adelante: así cada inserción no le mueve el sitio a las
      // que quedan, y los números estampados siguen siendo los del fichero de
      // tu disco, que es el que se va a abrir para escribir.
      cortes.sort((a, b) => b.donde - a.donde);
      let salida = codigo;
      for (const c of cortes) {
        salida = salida.slice(0, c.donde) + c.texto + salida.slice(c.donde);
      }
      return { code: salida, map: null };
    },

    transformIndexHtml() {
      if (!sonda) return [];
      // Con la fecha de la sonda dentro de la dirección. Vite se guarda los
      // módulos que se inventa un plugin y no los vuelve a pedir, así que sin
      // esto una Adeorq recién actualizada seguiría sirviendo la sonda vieja
      // hasta que reiniciaras el servidor, y nadie iba a atar esas dos cosas.
      let sello = 0;
      try {
        sello = Math.round(fs.statSync(path.join(AQUI, "sonda.js")).mtimeMs);
      } catch {
        // Sin fecha se pide sin sello: peor caché, pero funciona igual.
      }
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `${SONDA}?v=${sello}` },
          injectTo: "head",
        },
      ];
    },
  };
}

/** Recorre el árbol sin arrastrar `@babel/traverse` por catorce líneas. */
function recorrer(nodo, visita) {
  if (!nodo || typeof nodo.type !== "string") return;
  visita(nodo);
  for (const clave of Object.keys(nodo)) {
    if (clave === "loc" || clave === "leadingComments" || clave === "trailingComments") continue;
    const hijo = nodo[clave];
    if (Array.isArray(hijo)) {
      for (const h of hijo) if (h && typeof h.type === "string") recorrer(h, visita);
    } else if (hijo && typeof hijo.type === "string") {
      recorrer(hijo, visita);
    }
  }
}
