// ¿Alguna grabación enseña un aviso de la cuenta de quien graba? Claude Code
// pinta «You've used 98% of your session limit» encima del prompt cuando la
// cuenta va justa, y eso sale luego en la web dentro de la terminal. Se mira el
// texto sin colores ni movimientos de cursor, que es lo que se ve: un `grep`
// sobre el `.bin` no lo encuentra, porque los códigos de escape lo parten.
// Uso: node avisos.mjs   (sale con 1 si alguna lleva aviso, y dice en qué ms)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sinAnsi } from "./motor.mjs";

const REC = join(dirname(fileURLToPath(import.meta.url)), "p", "rec");
const AVISO = /session\s*limit|usage\s*limit|%\s*of\s*your|\/upgrade|weekly\s*limit/i;
let malas = 0;
for (const f of readdirSync(REC).filter((x) => x.endsWith(".jsonl"))) {
  const trozos = readFileSync(join(REC, f), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const con = trozos.filter((x) => AVISO.test(sinAnsi(x.d).replace(/\s+/g, " ")));
  console.log(`${f}: ${con.length ? `AVISO en ${con.map((x) => x.t).slice(0, 4).join(", ")} ms` : "limpia"}`);
  if (con.length) malas++;
}
process.exit(malas ? 1 : 0);
