// La hoja de la app, entera y de una pieza.
//
// `src/App.css` es desde el 2026-10-06 un índice de @import: las reglas viven
// en `src/estilos/`, por tramos y en el orden de la cascada. Quien necesite el
// CSS como UN texto (los comprobadores, los bancos, la maqueta de la web) lo
// pide aquí en vez de leer el fichero a pelo, que ya solo trae la lista.
//
// Es CommonJS a propósito. `package.json` dice "type": "module", y con la
// extensión .cjs lo cargan igual los .mjs
//     import { hojaDeLaApp } from "./hoja.cjs";
// y los bancos en TypeScript, que se compilan a CommonJS en una carpeta
// temporal y por eso lo traen desde la raíz y no desde su sitio:
//     require(process.cwd() + "/scripts/hoja.cjs").hojaDeLaApp()
//
// Su banco es `scripts/gordos-check-check.mjs` (`pnpm gordos`).
const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

/** El texto de una hoja con cada `@import "./…";` relativo cambiado por lo que trae. */
function leerHoja(ruta) {
  const aqui = dirname(ruta);
  return readFileSync(ruta, "utf8").replace(
    /^@import\s+["'](\.{1,2}\/[^"']+)["']\s*;[ \t]*\r?\n?/gm,
    (_, rel) => leerHoja(resolve(aqui, rel)),
  );
}

/** La de la app. Sin argumento, desde donde se lanza (la raíz del repo). */
function hojaDeLaApp(raiz = process.cwd()) {
  return leerHoja(resolve(raiz, "src", "App.css"));
}

module.exports = { leerHoja, hojaDeLaApp };
