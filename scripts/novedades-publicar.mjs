// Ninguna versión sale sin decir qué trae de nuevo para el recorrido de Adeo.
//
// Lo llama `publicar-version.mjs` antes de tocar nada de fuera, y lo prueba
// `publicar-check.mjs`. Munir pidió el 2026-11-20 «en cada actualización nueva
// un tour nuevo de las cosas nuevas»: si publicar no lo exige, el día que hay
// prisa la versión sale sin su recorrido y nadie se entera. Una versión que no
// trae nada que se vea lo dice con una lista vacía, a propósito y por escrito.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** El fichero leído, sin la marca de orden que deja el Set-Content de PowerShell
    5.1: Vite la lee igual, y no puede ser lo que pare una versión. */
const leer = (texto) => JSON.parse(texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);

/** Por qué no puede salir `version` con este `novedades.json`, o null si puede. */
export function faltanNovedades(version, texto) {
  let datos;
  try {
    datos = leer(texto);
  } catch (e) {
    return `src/novedades.json no se puede leer: ${e.message}`;
  }
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return "src/novedades.json tiene que ser un objeto con una entrada por versión.";
  }
  if (!Object.prototype.hasOwnProperty.call(datos, version)) {
    return (
      `src/novedades.json no tiene la ${version}.\n` +
      `  Escribe lo que se ve de nuevo (en español y en inglés, y dónde está en la ventana),\n` +
      `  o "${version}": [] si no trae nada que se vea. Cómo: docs/contexto/publicar.md.`
    );
  }
  if (!Array.isArray(datos[version])) {
    return `En src/novedades.json, la ${version} tiene que ser una lista (vacía si no trae nada que se vea).`;
  }
  return null;
}

/** La huella de lo que trae `version`, o null si no se puede leer o no está. Se
    calcula sobre el contenido, no sobre el texto: ni la marca de orden, ni los
    saltos de línea de Windows, ni las entradas de otras versiones la mueven. */
export function huellaDeEntrada(texto, version) {
  try {
    const datos = leer(texto);
    if (!datos || !Object.prototype.hasOwnProperty.call(datos, version)) return null;
    return createHash("sha256").update(JSON.stringify(datos[version])).digest("hex");
  } catch {
    return null;
  }
}

/** Dónde deja el sello cada compilación: junto al instalador, porque `C:\ct` es
    de todos los worktrees y el instalador que queda ahí es el de la última. */
export const rutaDelSello = (bundle, version) => path.join(bundle, `Adeorq_${version}_novedades.json`);

/**
 * Lo escribe `vite.config.ts` al compilar para `pnpm tauri build`, con el texto que
 * de verdad entró en el bundle. Nunca para una compilación: si no puede, calla, y
 * el candado de publicar dirá que falta el sello.
 */
export function sellar(bundle, version, texto) {
  try {
    mkdirSync(bundle, { recursive: true });
    writeFileSync(rutaDelSello(bundle, version), JSON.stringify({ version, huella: huellaDeEntrada(texto, version) }));
  } catch {
    /* sin sello, publicar no deja salir el instalador: nada se pierde */
  }
}

/** Lo que llama `vite.config.ts` al acabar el bundle. Solo sella el instalador de
    Windows de verdad: `tauri build` sin `--debug` (Tauri le pasa sus variables
    `TAURI_ENV_*` al `pnpm build`) y con `CARGO_TARGET_DIR`, que en el equipo de
    publicar es `C:\ct`. Un `pnpm build` suelto, el de otra sesión o el de Linux y
    Mac en GitHub no tocan nada. */
export function sellarAlCompilar(texto, env, raiz) {
  if (!texto || env.TAURI_ENV_PLATFORM !== "windows" || env.TAURI_ENV_DEBUG === "true" || !env.CARGO_TARGET_DIR) return;
  try {
    const { version } = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    sellar(path.join(env.CARGO_TARGET_DIR, "release", "bundle", "nsis"), version, texto);
  } catch {
    /* lo mismo: sin sello, el candado lo dice */
  }
}

/** El sello que dejó la compilación de `version`, con su hora; nulo si no hay. */
export function leerSello(bundle, version) {
  try {
    const ruta = rutaDelSello(bundle, version);
    return { sello: JSON.parse(readFileSync(ruta, "utf8")), selloMs: statSync(ruta).mtimeMs };
  } catch {
    return { sello: null, selloMs: 0 };
  }
}

const RECOMPILA = "vuelve a compilar (paso 5 de docs/fichas/publicar-version.md)";

/**
 * Lo mismo, y además que el instalador LA LLEVE: `src/novedades.json` va metido en
 * el bundle al compilar, así que una entrada escrita después de `pnpm tauri build`
 * dejaba pasar el candado con un instalador que no la tiene. Se compara el sello
 * que dejó la compilación con la entrada de ahora. Antes se comparaba la hora del
 * fichero, y paraba sin motivo si otra sesión escribía la versión siguiente o un
 * checkout lo reescribía, y aconsejaba recompilar metiendo lo de otro.
 *
 * `texto` es el fichero en disco; `exeMs` la hora del instalador (null si aún no
 * hay); `sello` y `selloMs` lo que dejó la compilación; `enCommit`, si se pasa, el
 * fichero del último commit, que es lo que se publica como código.
 */
export function faltanEnElInstalador(version, texto, { exeMs, sello, selloMs, enCommit }) {
  const falta = faltanNovedades(version, texto);
  if (falta) return `${falta}\n  Va dentro del instalador: después, ${RECOMPILA}.`;
  if (exeMs === null) return null;
  if (!sello || sello.version !== version || !sello.huella) {
    return `El instalador de la ${version} no trae el sello de lo nuevo que deja \`pnpm tauri build\`: ${RECOMPILA}.`;
  }
  if (selloMs > exeMs) {
    return `La última compilación de la ${version} no llegó a hacer el instalador (su sello es más nuevo que él): ${RECOMPILA}.`;
  }
  const ahora = huellaDeEntrada(texto, version);
  if (enCommit === undefined) {
    return sello.huella === ahora ? null : `Tu entrada de la ${version} en src/novedades.json cambió después de compilar el instalador: ${RECOMPILA}.`;
  }
  if (sello.huella === huellaDeEntrada(enCommit, version)) return null;
  if (sello.huella === ahora) {
    return `La entrada de la ${version} que lleva el instalador no está en el último commit: entra en el commit \`release:\` (paso 7).`;
  }
  return `La entrada de la ${version} cambió después de compilar el instalador: ${RECOMPILA}, y que entre en el commit \`release:\` (paso 7).`;
}
