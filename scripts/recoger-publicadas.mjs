// Recoge las carpetas que deja `publicar-codigo.mjs` en la carpeta temporal.
//
//     node scripts/recoger-publicadas.mjs            (enseña lo que haría)
//     node scripts/recoger-publicadas.mjs --borrar   (lo hace)
//
// Cada publicación deja `adeorq-pub-XXXX` con el clon del repo público y su
// commit SIN empujar, a propósito: se empuja a mano después de mirar el diff.
// Nadie volvía a por la carpeta, y Windows no vacía la temporal al reiniciar
// (el propio script decía que sí): el 2026-10-13 había 96, 856 MB.
//
// No se puede borrar al terminar, porque al terminar todavía falta el push.
// Así que la recoge la publicación SIGUIENTE, y solo si ya no hace falta:
//
//   · con clon y todo empujado (HEAD no va por delante de origin/main): fuera;
//   · con clon y commits sin empujar: SE QUEDA, y se dice cuál es;
//   · sin clon (una publicación que se cortó a medias) o con el clon hueco (lo
//     que deja la limpieza de Windows): fuera si tiene más de una hora, que es
//     más de lo que tarda ninguna en marcha.
//
// La prueba está en `publicar-check.mjs`, con carpetas y repos de verdad.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const UNA_HORA = 60 * 60 * 1000;

/** Cuántos commits lleva ese clon sin empujar; `null` si no se puede saber. */
function sinEmpujar(clon) {
  try {
    const cuenta = execFileSync("git", ["rev-list", "--left-right", "--count", "origin/main...HEAD"], { cwd: clon, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const delante = Number(cuenta.trim().split(/\s+/)[1]);
    return Number.isFinite(delante) ? delante : null;
  } catch {
    return null;
  }
}

/**
 * Qué se hace con cada `adeorq-pub-*` de `dir`. `menos` es la de la publicación
 * en marcha, que no se toca. Con `borrar: false` solo lo cuenta.
 */
export function recoger(dir = tmpdir(), { menos = "", borrar = true, ahora = Date.now() } = {}) {
  const fuera = { borradas: [], pendientes: [], dudosas: [] };
  let nombres = [];
  try {
    nombres = readdirSync(dir).filter((n) => n.startsWith("adeorq-pub-"));
  } catch {
    return fuera;
  }
  for (const n of nombres) {
    const carpeta = join(dir, n);
    if (carpeta === menos) continue;
    const clon = join(carpeta, "publico");
    // Por `HEAD` y no por la carpeta `.git`: la limpieza de Windows borra los
    // archivos viejos y deja las carpetas, así que de las 96 había 83 con un
    // `.git` hueco que git ya no reconoce. De ahí no hay nada que empujar.
    if (existsSync(join(clon, ".git", "HEAD"))) {
      const delante = sinEmpujar(clon);
      if (delante === null) {
        fuera.dudosas.push(carpeta);
        continue;
      }
      if (delante > 0) {
        fuera.pendientes.push(carpeta);
        continue;
      }
    } else {
      let edad = 0;
      try {
        edad = ahora - statSync(carpeta).mtimeMs;
      } catch {
        continue;
      }
      if (edad < UNA_HORA) continue;
    }
    if (borrar) {
      try {
        rmSync(carpeta, { recursive: true, force: true });
      } catch {
        continue;
      }
    }
    fuera.borradas.push(carpeta);
  }
  return fuera;
}

/** Lo mismo, contado en un renglón o dos. */
export function contar(r, borrar = true) {
  const lineas = [];
  if (r.borradas.length) lineas.push(`  ${borrar ? "Recogidas" : "Se recogerían"} ${r.borradas.length} carpetas de publicaciones anteriores.`);
  for (const p of r.pendientes) lineas.push(`  SIN EMPUJAR, se queda: ${join(p, "publico")}`);
  for (const p of r.dudosas) lineas.push(`  No sé si está empujada, se queda: ${p}`);
  return lineas.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const borrar = process.argv.includes("--borrar");
  const r = recoger(tmpdir(), { borrar });
  console.log(contar(r, borrar) || "  Nada que recoger.");
  if (!borrar && r.borradas.length) console.log("\n  Para hacerlo: node scripts/recoger-publicadas.mjs --borrar");
}
