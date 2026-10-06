// Que la lista de comprobadores no se pueda quedar corta sin que nadie lo note.
//   `node scripts/comprobar-check.mjs`   ·   va dentro de `pnpm comprobar`
//
// `comprobar.mjs` lanza una lista escrita a mano. Lo que tiene que cazar es el
// comprobador nuevo que alguien deja en `scripts/` y no apunta: se quedaría sin
// lanzar, que es como estuvo el de las traducciones hasta el 2026-10-06.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPROBADORES, NO_SE_LANZAN, sinDueño, sinFichero } from "./comprobar.mjs";

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};

const lista = ["uno-check.mjs", "dos-check.mjs"];
const aparte = { "guardian-check.mjs": "pide argumentos" };

ok("con todo apuntado no sobra nadie",
  sinDueño(["uno-check.mjs", "dos-check.mjs", "guardian-check.mjs", "bancos.mjs", "hoja.cjs"], lista, aparte).length === 0);
{
  const r = sinDueño(["uno-check.mjs", "dos-check.mjs", "nuevo-check.mjs"], lista, aparte);
  ok("un comprobador nuevo sin apuntar se caza", r.length === 1 && r[0] === "nuevo-check.mjs", r.join(", "));
}
ok("un banco en TypeScript no cuenta: esos los lanza bancos.mjs",
  sinDueño(["uno-check.mjs", "dos-check.mjs", "router-check.ts", "resguardo-check.tsx"], lista, aparte).length === 0);
ok("el banco de un comprobador también es un comprobador",
  sinDueño(["uno-check.mjs", "dos-check.mjs", "uno-check-check.mjs"], lista, aparte).join() === "uno-check-check.mjs");
{
  const r = sinFichero(["uno-check.mjs"], lista);
  ok("uno de la lista que ya no existe se caza", r.length === 1 && r[0] === "dos-check.mjs", r.join(", "));
}

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const enDisco = fs.readdirSync(AQUI);
ok("en el repo de verdad no hay ninguno sin dueño", sinDueño(enDisco).length === 0, sinDueño(enDisco).join(", "));
ok("ni la lista nombra a ninguno que falte", sinFichero(enDisco).length === 0, sinFichero(enDisco).join(", "));
ok("nadie está a la vez en la lista y apartado", COMPROBADORES.every((c) => !(c in NO_SE_LANZAN)));
ok("y este banco está en la lista", COMPROBADORES.includes("comprobar-check.mjs"));

console.log(fallos ? `\n${fallos} FALLAN.` : "\nTODO BIEN.");
process.exit(fallos ? 1 : 0);
