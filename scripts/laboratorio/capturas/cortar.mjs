// Corta una grabación en un instante: deja <salida>.bin con lo dicho hasta ahí.
// Sin instante, enseña la línea del tiempo (qué se iba viendo y cuándo) para elegirlo.
// Uso: node cortar.mjs <nombre>            -> línea del tiempo
//      node cortar.mjs <nombre> <ms> <salida> [<desde>-<hasta>]
// El cuarto argumento quita además los trozos de ese tramo (en ms): el aviso de
// confianza de Codex enseña la ruta REAL de la carpeta y no puede salir en una foto.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sinAnsi } from "./motor.mjs";

const REC = join(dirname(fileURLToPath(import.meta.url)), "p", "rec");
const [nombre, ms, salida, sin] = process.argv.slice(2);
const [fueraDesde, fueraHasta] = (sin ?? "").split("-").map(Number);
const trozos = readFileSync(join(REC, `${nombre}.jsonl`), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

if (!ms) {
  let ultima = "";
  for (const x of trozos) {
    const texto = sinAnsi(x.d)
      .replace(/\x1b\[[0-9;?<>=!]*[A-Za-z]/g, " ")
      .replace(/[\r\n]+/g, " ⏎ ")
      .replace(/\s+/g, " ")
      .trim();
    // Solo lo que trae palabras: el reloj y la bolita que gira no cuentan nada.
    const palabras = (texto.match(/[A-Za-z]{4,}/g) ?? []).length;
    if (palabras < 3 || texto === ultima) continue;
    ultima = texto;
    console.log(`${String(x.t).padStart(7)}  ${texto.slice(0, 150)}`);
  }
  console.log(`total: ${trozos.length} trozos, ${trozos.at(-1).t} ms`);
} else {
  const hasta = trozos.filter((x) => x.t <= Number(ms) && !(sin && x.t >= fueraDesde && x.t <= fueraHasta));
  writeFileSync(join(REC, `${salida}.bin`), hasta.map((x) => x.d).join(""));
  console.log(`${salida}.bin: ${hasta.length} de ${trozos.length} trozos, hasta ${hasta.at(-1)?.t} ms`);
}
