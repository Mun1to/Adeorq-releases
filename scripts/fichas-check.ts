// Las fichas de pasos: qué archivos de `docs/fichas` se ofrecen y con qué
// texto nace la nota (`lib/fichas.ts`).
//
// Lo que no puede pasar: que una ficha guardada con pasos marcados dé una nota
// con trabajo «ya hecho», que una lista numerada normal no se pueda marcar, o
// que la carpeta se busque con la barra de otro sistema y no aparezca nunca.
//
//   pnpm bancos fichas

import { carpetaDeFichas, fichasDe, notaDesdeFicha, TOPE_FICHAS } from "../src/lib/fichas";
import { leerLineas, tareasPendientes, tituloDe } from "../src/lib/notas";
import type { Entrada } from "../src/lib/archivos";

let fallos = 0;
// El lanzador solo enseña las últimas líneas: los rojos se repiten al final.
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const fila = (nombre: string, carpeta = false): Entrada => ({
  nombre,
  ruta: `C:\\p\\docs\\fichas\\${nombre}`,
  carpeta,
  peso: 1,
  cuando: 0,
});

// 1. Dónde se buscan.
es("en Windows, con su barra", carpetaDeFichas("C:\\proyectos\\Adeorq"), "C:\\proyectos\\Adeorq\\docs\\fichas");
es("en Linux, con la suya", carpetaDeFichas("/home/m/adeorq"), "/home/m/adeorq/docs/fichas");
es("una raíz con la barra puesta no la dobla", carpetaDeFichas("C:\\proyectos\\Adeorq\\"), "C:\\proyectos\\Adeorq\\docs\\fichas");

// 2. Cuáles se ofrecen.
const lista = fichasDe([
  fila("publicar-version.md"),
  fila("alta_de_cliente.MD"),
  fila("borrador.txt"),
  fila("viejas", true),
  fila(".md"),
  fila("README.md"),
]);
es(
  "solo los .md, sin carpetas ni otros archivos, por orden y con nombre legible",
  lista.map((f) => f.nombre),
  ["alta de cliente", "publicar version", "README"],
);
es("y cada una con la ruta de su archivo", lista[1].ruta, "C:\\p\\docs\\fichas\\publicar-version.md");
es(
  "con cuarenta, se ofrecen las del tope y no una lista sin fin",
  fichasDe(Array.from({ length: 40 }, (_, i) => fila(`f${String(i).padStart(2, "0")}.md`))).length,
  TOPE_FICHAS,
);

// 3. Con qué nace la nota.
const ficha = [
  "",
  "# Publicar una versión",
  "",
  "Antes de nada, mira que el árbol esté limpio.",
  "",
  "1. Pasa las pruebas",
  "2) Sube el número",
  "- [x] Compila",
  "- [X] Publica",
  "- una viñeta que es solo texto",
  "   3. un paso con sangría",
  "",
  "",
].join("\r\n");
const nota = notaDesdeFicha(ficha, "publicar version");
es("el título es el de la ficha, en la primera línea", tituloDe(nota), "Publicar una versión");
es(
  "los pasos numerados y las casillas salen como tareas, todas sin marcar",
  tareasPendientes(nota),
  ["Pasa las pruebas", "Sube el número", "Compila", "Publica", "un paso con sangría"],
);
ok("ninguna sale hecha, aunque la ficha se guardara con dos marcadas", !leerLineas(nota).some((l) => l.hecha === true));
ok("el texto suelto y las viñetas pasan tal cual", nota.includes("Antes de nada, mira que el árbol esté limpio.") && nota.includes("\n- una viñeta que es solo texto\n"));
ok("sin saltos de Windows ni blancos colgando", !nota.includes("\r") && !nota.endsWith("\n") && !nota.startsWith("\n"));

// 4. Una ficha sin título lleva el nombre de su archivo.
const sin = notaDesdeFicha("1. uno\n2. dos", "alta de cliente");
es("sin «# », el título es el nombre de la ficha", tituloDe(sin), "alta de cliente");
es("y sus pasos siguen debajo", tareasPendientes(sin), ["uno", "dos"]);

// 5. Lo que NO es un paso no se convierte.
const prosa = notaDesdeFicha("# T\n\nEn 2026. se decidió otra cosa.\nversión 1.0 lista", "t");
es("un número en mitad de la frase no es una lista", tareasPendientes(prosa), []);
// «2026. se decidió» empieza por número y punto: es el caso que se acepta, y
// queda escrito aquí para que nadie lo descubra por sorpresa.
const borde = notaDesdeFicha("2026. fue el año", "t");
es("una línea que EMPIEZA por número y punto sí se toma por paso", tareasPendientes(borde), ["fue el año"]);

if (rojos.length) console.log(`\nEN ROJO:\n${rojos.map((r) => `  · ${r}`).join("\n")}`);
console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
