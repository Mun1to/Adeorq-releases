// Todos los comprobadores de la casa, de una vez.
//
//     pnpm comprobar            todo: unos cuatro minutos, casi todos del banco de tamaños
//     pnpm comprobar --rapido   sin los bancos en TypeScript: medio minuto
//
// Cada comprobador nació de un fallo que ya se pagó una vez, y cada uno tenía
// su `pnpm <nombre>`. Eran diecisiete órdenes de las que había que acordarse,
// y un comprobador que hay que acordarse de lanzar no se lanza: el 2026-10-06
// aparecieron dos bancos que llevaban semanas en rojo (`clientes-check` y
// `manos-check`) y uno, el de las traducciones, cuya orden `pnpm i18n` ni
// siquiera existía. Esto es UNA orden, y va dentro de `publicar-version`: una
// versión no sale con uno en rojo.
//
// La lista está escrita a mano y a propósito, pero no se puede quedar corta:
// si en `scripts/` aparece un `*-check.mjs` que no está en `COMPROBADORES` ni
// en `NO_SE_LANZAN`, esto falla y lo dice. Un comprobador nuevo que nadie
// lanza es exactamente el fallo que esto viene a cortar.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** En el orden en que conviene leerlos si fallan: primero lo que rompe la app. */
export const COMPROBADORES = [
  "hilo-check.mjs",
  "anidado-check.mjs",
  "anidado-check-check.mjs",
  "handler-check.mjs",
  "handler-check-check.mjs",
  "gordos-check.mjs",
  "gordos-check-check.mjs",
  "css-check.mjs",
  "botones-check.mjs",
  "textarea-check.mjs",
  "svg-check.mjs",
  "i18n-check.mjs",
  "markdown-check.mjs",
  "arranque-check.mjs",
  "latido-check.mjs",
  "lienzo-check.mjs",
  "xterm-check.mjs",
  "prueba-check-check.mjs",
  "publicar-check.mjs",
  "comprobar-check.mjs",
];

/** Los que acaban en `-check.mjs` y no son un comprobador que se lance suelto. */
export const NO_SE_LANZAN = {
  "prueba-check.mjs": "es el guardián de unas notas de versión: pide su ruta, y lo prueba prueba-check-check",
};

/** Los `*-check.mjs` de `scripts/` que nadie lanza ni ha apartado. */
export function sinDueño(enDisco, lanzados = COMPROBADORES, apartados = NO_SE_LANZAN) {
  return enDisco.filter((n) => /-check\.mjs$/.test(n) && !lanzados.includes(n) && !(n in apartados)).sort();
}

/** Los de la lista que ya no existen. */
export function sinFichero(enDisco, lanzados = COMPROBADORES) {
  return lanzados.filter((n) => !enDisco.includes(n));
}

function lanzar(nombre, args = []) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join("scripts", nombre), ...args], { cwd: RAIZ, encoding: "utf8" });
  const bien = r.status === 0;
  console.log(`${bien ? "OK   " : "FALLA"} ${nombre.replace(/\.mjs$/, "")}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!bien) {
    const cola = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd().split("\n").slice(-25);
    console.log(cola.map((l) => "      " + l).join("\n"));
  }
  return bien;
}

/** Los lanza todos y dice si salieron bien. Es lo que llama `publicar-version`. */
export function todoEnVerde({ rapido = false } = {}) {
  const enDisco = fs.readdirSync(path.join(RAIZ, "scripts"));
  const rotos = [];

  const huerfanos = sinDueño(enDisco);
  const fantasmas = sinFichero(enDisco);
  if (huerfanos.length) {
    console.log(`FALLA hay comprobadores que nadie lanza: ${huerfanos.join(", ")}`);
    console.log("      Añádelos a COMPROBADORES en scripts/comprobar.mjs, o a NO_SE_LANZAN con su motivo.");
    rotos.push("la lista");
  }
  if (fantasmas.length) {
    console.log(`FALLA la lista nombra comprobadores que ya no existen: ${fantasmas.join(", ")}`);
    rotos.push("la lista");
  }

  for (const c of COMPROBADORES) {
    if (fantasmas.includes(c)) continue;
    if (!lanzar(c)) rotos.push(c);
  }
  if (rapido) console.log("     (sin los bancos en TypeScript: `pnpm comprobar` los lanza)");
  else if (!lanzar("bancos.mjs")) rotos.push("bancos.mjs");

  if (rotos.length) {
    console.log(`\nEN ROJO: ${[...new Set(rotos)].join(", ")}`);
    return false;
  }
  console.log(`\nTodo en verde: ${COMPROBADORES.length} comprobadores${rapido ? "" : " y los bancos"}.`);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(todoEnVerde({ rapido: process.argv.includes("--rapido") }) ? 0 : 1);
}
