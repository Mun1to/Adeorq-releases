// La paleta de comandos: qué ofrece y qué queda al escribir.
//
// `lib/paleta.ts`. Lo que importa de verdad: que estén TODAS las pestañas
// (también las quitadas de la cabecera, que es la promesa de `lib/cabecera.ts`),
// que cada atajo que ofrece exista en `lib/atajosGlobales.ts` (la paleta lo
// pulsa por ti: uno inventado no haría nada, y sin avisar), y que al escribir
// salga delante lo que empieza por ahí.
//
//   pnpm bancos paleta

import { readFileSync } from "node:fs";
import { ATAJOS, entradasDeLaPaleta, filtrarPaleta } from "../src/lib/paleta";
import { PESTANAS } from "../src/lib/vistas";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const t = (s: string) => s;
const hay = {
  pestanas: PESTANAS,
  proyectos: [
    { name: "Adeorq", path: "C:\\proyectos\\Adeorq" },
    { name: "VoCript", path: "C:\\proyectos\\VoCript" },
  ],
  panes: [{ id: 1, name: "Adeorq · Arreglar la barra" }],
  delLienzo: [{ id: 7, name: "VoCript · cámara lenta" }],
};
const todas = entradasDeLaPaleta(hay, t);
const textos = (q: string) => filtrarPaleta(todas, q).map((e) => e.texto);

// --- qué ofrece -----------------------------------------------------------------
ok(
  "están todas las pestañas, una por una",
  PESTANAS.every((p) => todas.some((e) => e.accion.tipo === "vista" && e.accion.view === p.key)),
);
ok("los ids no se repiten", new Set(todas.map((e) => e.id)).size === todas.length);
ok(
  "una terminal del lienzo sabe que lo es",
  todas.some((e) => e.accion.tipo === "terminal" && e.accion.id === 7 && e.accion.enLienzo),
);
ok("sin escribir nada, salen todas", filtrarPaleta(todas, "").length === todas.length && filtrarPaleta(todas, "   ").length === todas.length);

// Cada atajo de la paleta tiene que existir en el manejador de los atajos de
// la app: se dispara esa misma tecla, y una que no esté allí no hace nada.
{
  const app = readFileSync("src/lib/atajosGlobales.ts", "utf8");
  const desde = app.indexOf("if (!e.ctrlKey || !e.shiftKey) return;");
  const manejador = desde < 0 ? "" : app.slice(desde, app.indexOf("window.addEventListener(\"keydown\", onKey, true)", desde));
  ok("se encuentra el manejador de atajos de la app", manejador.length > 200);
  for (const a of ATAJOS) {
    const esta = a.key.length === 1
      ? manejador.includes(`k === "${a.key.toLowerCase()}"`)
      : manejador.includes(`e.key === "${a.key}"`);
    ok(`«${a.atajo}» existe en la app`, esta, a.texto);
  }
}

// --- qué queda al escribir ---------------------------------------------------------
ok("sin tildes ni mayúsculas", textos("camara").includes("VoCript · cámara lenta") && textos("MEMORIA").includes("Memoria"));
ok("varias palabras, en cualquier orden", textos("barra adeorq")[0] === "Adeorq · Arreglar la barra");
ok("se busca también por lo que es", textos("pestaña mem").join() === "Memoria", textos("pestaña mem").join(" | "));
ok(
  "lo que empieza por lo escrito va delante",
  textos("ca")[0] === "Cabina",
  `sale primero «${textos("ca")[0]}»`,
);
ok("un proyecto se encuentra por su nombre", textos("vocr").includes("VoCript"));
ok("lo que no existe, nada", textos("zzzz").length === 0);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
