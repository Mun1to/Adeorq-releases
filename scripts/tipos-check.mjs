// Que los tipos de TypeScript compilen, sin construir nada.
//   `node scripts/tipos-check.mjs [tsconfig]`   ·   va dentro de `pnpm comprobar`
//
// `pnpm build` ya corre `tsc`, pero solo al publicar. Antes de esto, una clave
// repetida en `i18n.ts` (TS1117) llegó a estar en verde en todos los
// comprobadores y en todos los bancos (esbuild, que es lo que usa Vite, no mira
// los tipos), y no se vio hasta que alguien construyó. Es la misma orden que
// `tsc` de `pnpm build`, solo que a diario y en dieciséis segundos.
//
// Sin argumentos mira el `tsconfig.json` del repo; con uno, ese (para probar
// que se pone en rojo con un fallo de verdad).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(RAIZ, "node_modules", "typescript", "lib", "tsc.js");
if (!fs.existsSync(tsc)) {
  console.log("FALLA no encuentro TypeScript en node_modules: `pnpm install`");
  process.exit(1);
}
const proyecto = process.argv[2] ?? path.join(RAIZ, "tsconfig.json");
const r = spawnSync(process.execPath, [tsc, "--noEmit", "-p", proyecto], { cwd: RAIZ, encoding: "utf8" });
const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
const errores = (salida.match(/: error TS\d+:/g) ?? []).length;
if (r.status === 0) {
  console.log("ok   los tipos compilan (tsc --noEmit)");
  process.exit(0);
}
if (salida) console.log(salida.split("\n").slice(0, 40).join("\n"));
console.log(`FALLA tsc --noEmit: ${errores || "algún"} error${errores === 1 ? "" : "es"} de tipos`);
process.exit(1);
