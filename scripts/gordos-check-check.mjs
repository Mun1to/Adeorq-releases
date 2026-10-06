// Que el tope de los ficheros gordos de verdad salte, y que la hoja se lea entera.
//   `node scripts/gordos-check-check.mjs`   ·   `pnpm gordos`
//
// Un comprobador que siempre pasa tranquiliza sin proteger, así que aquí va
// cada cosa que tiene que cazar, hecha a propósito, y al lado la forma buena,
// que tiene que pasar sin ruido. Al final, el repo de verdad.
//
// De paso prueba `scripts/hoja.cjs`, el lector que le da a los comprobadores y
// a la maqueta de la web la hoja de la app de una pieza.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GORDOS, HOLGURA, TOPE, TOPE_TRAMO, lineas, revisar, revisarIndice, revisarTopes } from "./gordos-check.mjs";
import { hojaDeLaApp, leerHoja } from "./hoja.cjs";

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};

/* ── El tamaño ──────────────────────────────────────────────────────────── */

ok("las líneas se cuentan como wc -l", lineas("a\nb\n") === 2 && lineas("a\nb") === 2 && lineas("") === 0);

const gordos = { "src/App.tsx": 4000 };
const sin = { fallos: 0, notas: 0 };
const cuenta = (medidas, g = gordos, e = {}) => {
  const r = revisarTopes(medidas, g, e);
  return { fallos: r.fallos.length, notas: r.notas.length, texto: [...r.fallos, ...r.notas].join(" | ") };
};
const igual = (r, esperado) => r.fallos === esperado.fallos && r.notas === esperado.notas;

ok("un fichero normal justo en el tope pasa", igual(cuenta({ "src/App.tsx": 4000, "src/a.ts": TOPE }), sin));
{
  const r = cuenta({ "src/App.tsx": 4000, "src/a.ts": TOPE + 1 });
  ok("y con una línea más, no", r.fallos === 1 && r.texto.includes("src/a.ts"), r.texto);
}
{
  const r = cuenta({ "src/App.tsx": 4001 });
  ok("un gordo que pasa su techo falla", r.fallos === 1 && r.texto.includes("4001") && r.texto.includes("4000"), r.texto);
}
ok("un gordo justo en su techo pasa", igual(cuenta({ "src/App.tsx": 4000 }), sin));
{
  const r = cuenta({ "src/App.tsx": 4000 - HOLGURA });
  ok("uno que ha bajado pide que se le baje el techo, sin fallar", r.fallos === 0 && r.notas === 1 && r.texto.includes(String(4000 - HOLGURA)), r.texto);
}
{
  const r = cuenta({ "src/App.tsx": TOPE });
  ok("uno que ya no es gordo pide salir de la tabla", r.fallos === 0 && r.notas === 1 && r.texto.includes("quítalo"), r.texto);
}
{
  const r = cuenta({ "src/a.ts": 10 });
  ok("uno de la tabla que ya no existe falla", r.fallos === 1 && r.texto.includes("ya no existe"), r.texto);
}
ok("un exento no cuenta por largo que sea", igual(cuenta({ "src/App.tsx": 4000, "src/lib/i18n.ts": 9000 }, gordos, { "src/lib/i18n.ts": "diccionario" }), sin));
{
  const r = cuenta({ "src/App.tsx": 4000, "src/estilos/01-base.css": TOPE_TRAMO + 1 });
  ok("un tramo de la hoja tiene su propio tope", r.fallos === 1 && r.texto.includes("tramo"), r.texto);
}
ok("y justo en él, pasa", igual(cuenta({ "src/App.tsx": 4000, "src/estilos/01-base.css": TOPE_TRAMO }), sin));
ok("la tabla de verdad no tiene techos por debajo del tope", Object.values(GORDOS).every((t) => t > TOPE));

/* ── El índice ──────────────────────────────────────────────────────────── */

const bueno = [
  "/* La hoja, por tramos. Aquí solo van los @import: nada más. */",
  "",
  "/* La base. */",
  '@import "./estilos/01-base.css";',
  "",
  "/* Los botones. */",
  '@import "./estilos/02-botones.css";',
  "",
].join("\n");
const tramos = ["01-base.css", "02-botones.css"];

ok("un índice bueno pasa", revisarIndice(bueno, tramos).length === 0, revisarIndice(bueno, tramos).join(" | "));
{
  const r = revisarIndice(bueno + "\n.suelta { color: red; }\n", tramos);
  ok("una regla suelta en el índice se caza", r.length >= 1 && r[0].includes(".suelta"), r.join(" | "));
}
{
  const r = revisarIndice(bueno, [...tramos, "03-nuevo.css"]);
  ok("un tramo que nadie importa se caza", r.length === 1 && r[0].includes("03-nuevo.css"), r.join(" | "));
}
{
  const r = revisarIndice(bueno + '@import "./estilos/09-fantasma.css";\n', tramos);
  ok("un import de un tramo que no existe se caza", r.some((x) => x.includes("09-fantasma.css") && x.includes("no existe")), r.join(" | "));
}
{
  const alReves = bueno.replace("01-base", "XX").replace("02-botones", "01-base").replace("XX", "02-botones");
  const r = revisarIndice(alReves, tramos);
  ok("dos tramos cambiados de orden se cazan", r.length === 1 && r[0].includes("cascada"), r.join(" | "));
}
{
  const r = revisarIndice(bueno + '@import "./estilos/01-base.css";\n', tramos);
  ok("el mismo tramo dos veces se caza", r.some((x) => x.includes("2 veces")), r.join(" | "));
}
{
  const r = revisarIndice(bueno + '@import "./estilos/suelto.css";\n', [...tramos, "suelto.css"]);
  ok("un tramo sin número se caza", r.some((x) => x.includes("NN-nombre")), r.join(" | "));
}
{
  const r = revisarIndice(bueno.replace("nada más. */", "nada más.\n   .ejemplo { dentro: de un comentario; }\n   @import \"./estilos/99-mentira.css\"; */"), tramos);
  ok("lo que hay dentro de un comentario no cuenta", r.length === 0, r.join(" | "));
}

/* ── El lector de la hoja ───────────────────────────────────────────────── */

const casa = fs.mkdtempSync(path.join(os.tmpdir(), "hoja-"));
fs.mkdirSync(path.join(casa, "src", "estilos", "dentro"), { recursive: true });
fs.writeFileSync(path.join(casa, "src", "App.css"), '/* índice */\n@import "./estilos/01-a.css";\r\n@import \'./estilos/02-b.css\';\n@import "tailwindcss";\n');
fs.writeFileSync(path.join(casa, "src", "estilos", "01-a.css"), ".a { color: red; }\n");
fs.writeFileSync(path.join(casa, "src", "estilos", "02-b.css"), '@import "./dentro/c.css";\n.b { color: blue; }\n');
fs.writeFileSync(path.join(casa, "src", "estilos", "dentro", "c.css"), ".c { color: green; }\n");
{
  const t = hojaDeLaApp(casa);
  ok("la hoja sale entera, en orden y con los tramos de dentro",
    t === '/* índice */\n.a { color: red; }\n.c { color: green; }\n.b { color: blue; }\n@import "tailwindcss";\n', JSON.stringify(t));
  ok("y leerHoja hace lo mismo desde la ruta", leerHoja(path.join(casa, "src", "App.css")) === t);
}
fs.rmSync(casa, { recursive: true, force: true });

/* ── El repo de verdad ──────────────────────────────────────────────────── */

{
  const r = revisar();
  ok("el repo pasa", r.fallos.length === 0, r.fallos.join(" | "));
  const hoja = hojaDeLaApp(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  ok("la hoja de la app trae sus tramos y ningún @import suyo por resolver",
    lineas(hoja) > 20000 && !/^@import\s+["']\.\//m.test(hoja), `${lineas(hoja)} líneas`);
  ok("y va de la escala de esquinas a la ventana del token", hoja.includes("--r-pastilla: 999px;") && hoja.slice(-3000).includes(".secreto"));
}

console.log(fallos ? `\n${fallos} FALLAN.` : "\nTODO BIEN.");
process.exit(fallos ? 1 : 0);
