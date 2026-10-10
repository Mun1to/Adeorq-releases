// El diff del Modo Espejo: en qué línea real cae cada renglón, y la nota que
// se le manda al agente sobre una de ellas (`lib/diffEspejo.ts`).
//
//   pnpm bancos diff-espejo

import { archivoDelDiff, esComentable, leerDiff, notaParaElAgente } from "../src/lib/diffEspejo";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const DIFF = [
  "diff --git a/src/uno.ts b/src/uno.ts",
  "index 111..222 100644",
  "--- a/src/uno.ts",
  "+++ b/src/uno.ts",
  "@@ -10,4 +10,5 @@ function uno() {",
  "   const a = 1;",
  "-  const b = 2;",
  "+  const b = 3;",
  "+  const c = 4;",
  "   return a;",
  " }",
  "@@ -40 +41,2 @@",
  "-// viejo",
  "+// nuevo",
  "+// otro",
  "diff --git a/consulta.sql b/consulta.sql",
  "--- a/consulta.sql",
  "+++ b/consulta.sql",
  "@@ -1,3 +1,2 @@",
  " select 1;",
  "--- esto era un comentario de SQL",
  " select 2;",
  "\\ No newline at end of file",
].join("\n");

// --- el trozo de un archivo ------------------------------------------------------
const uno = archivoDelDiff(DIFF, "src/uno.ts");
ok("corta el diff de un archivo y no se lleva el siguiente", uno.includes("const c = 4") && !uno.includes("select 1"));
ok("también por el nombre a secas", archivoDelDiff(DIFF, "consulta.sql").startsWith("diff --git a/consulta.sql"));
es("un archivo que no está, nada", archivoDelDiff(DIFF, "no-esta.ts"), "");

// --- qué es cada renglón y en qué línea cae ----------------------------------------
const r = leerDiff(uno);
es("las cuatro primeras son cabecera", r.slice(0, 4).map((x) => x.tipo), ["cabecera", "cabecera", "cabecera", "cabecera"]);
es("los tipos del primer trozo", r.slice(4, 10).map((x) => x.tipo), ["trozo", "igual", "menos", "mas", "mas", "igual"]);
es(
  "cada línea con su número: las que quedan, en el archivo nuevo; la quitada, en el viejo",
  r.slice(5, 11).map((x) => x.linea),
  [10, 11, 11, 12, 13, 14],
);
es("un trozo sin cuenta (`@@ -40 +41,2 @@`) vale por una línea", r.slice(11).map((x) => [x.tipo, x.linea]), [["trozo", undefined], ["menos", 40], ["mas", 41], ["mas", 42]]);
ok("las cabeceras no llevan número ni se comentan", r.slice(0, 5).every((x) => x.linea === undefined && !esComentable(x)));
ok("las líneas de archivo sí se comentan", r.slice(5, 11).every(esComentable));

// Una línea quitada que empezaba por «-- » llega como «--- »: es una línea, no una cabecera.
const sql = leerDiff(archivoDelDiff(DIFF, "consulta.sql"));
es("«--- comentario» dentro de un trozo es una línea quitada", sql.slice(4).map((x) => [x.tipo, x.linea]), [["igual", 1], ["menos", 2], ["igual", 2], ["cabecera", undefined]]);
es("y la de verdad, fuera del trozo, es cabecera", sql[1].tipo, "cabecera");
es("un diff vacío, ningún renglón", leerDiff(""), []);

// --- la nota al agente --------------------------------------------------------------
const t = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""));
es(
  "sobre una línea añadida",
  notaParaElAgente("src/uno.ts", r[7], "  mejor una constante\ncon nombre ", t),
  "En src/uno.ts, sobre la línea 11 que añadiste («const b = 3;»): mejor una constante con nombre",
);
ok("sobre una quitada, lo dice", notaParaElAgente("src/uno.ts", r[6], "esta hacía falta", t).includes("línea 11 que quitaste («const b = 2;»)"));
ok("sobre una sin cambios, sin atribuírsela", notaParaElAgente("src/uno.ts", r[5], "x", t).includes("sobre la línea 10 («const a = 1;»)"));
ok("una línea larguísima se cita recortada", notaParaElAgente("a.ts", { tipo: "mas", crudo: `+${"x".repeat(500)}`, linea: 1 }, "n", t).length < 260);
ok("va en un solo renglón", !notaParaElAgente("a.ts", r[7], "una\ndos\ntres", t).includes("\n"));

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
