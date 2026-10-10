// Abrir un archivo escribiendo parte de su nombre (Ctrl+P): qué sale y en qué
// orden (`lib/abrirPorNombre.ts`).
//
// Lo que no puede pasar: que el archivo que se llama como lo escrito quede
// debajo de veinte que solo lo llevan en la carpeta, o que la ruta que se abre
// salga con las barras del revés en Windows.
//
//   pnpm bancos abrir-por-nombre

import { filtrarArchivos, rutaEntera, TOPE_FILAS } from "../src/lib/abrirPorNombre";

let fallos = 0;
const rojos: string[] = [];
function es(nombre: string, obtenido: unknown, esperado: unknown) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!bien) {
    fallos++;
    rojos.push(nombre);
  }
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

const REPO = [
  "README.md",
  "package.json",
  "src/App.tsx",
  "src/lib/pty.ts",
  "src/lib/paleta.ts",
  "src/components/Paleta.tsx",
  "src/components/TerminalPane.tsx",
  "src-tauri/src/pty.rs",
  "docs/contexto/terminales.md",
  "scripts/paleta-check.ts",
  "src/estilos/27-paleta.css",
  "docs/Guía rápida.md",
];
const rutas = (q: string) => filtrarArchivos(REPO, q).map((a) => a.ruta);

// --- qué sale -------------------------------------------------------------------------
es("por el nombre, y primero el que EMPIEZA por lo escrito", rutas("pal"), [
  "src/lib/paleta.ts",
  "scripts/paleta-check.ts",
  "src/components/Paleta.tsx",
  "src/estilos/27-paleta.css",
]);
es("el nombre manda sobre la carpeta: «pty» da los dos pty antes que nada", rutas("pty"), ["src/lib/pty.ts", "src-tauri/src/pty.rs"]);
es("lo que solo casa por la carpeta sale, pero detrás", rutas("term").slice(0, 2), ["docs/contexto/terminales.md", "src/components/TerminalPane.tsx"]);
es("varias palabras, en cualquier orden, sobre la ruta entera", rutas("lib pty"), ["src/lib/pty.ts"]);
es("sin tildes ni mayúsculas", rutas("guia"), ["docs/Guía rápida.md"]);
es("lo que no está, no sale", rutas("zzz"), []);

// --- sin escribir nada ----------------------------------------------------------------
es("sin nada escrito, lo de arriba del proyecto primero y luego por nombre", rutas("").slice(0, 4), [
  "package.json",
  "README.md",
  "docs/Guía rápida.md",
  "scripts/paleta-check.ts",
]);

// --- lo que se enseña -----------------------------------------------------------------
es("cada hallado, con su nombre y su carpeta", filtrarArchivos(REPO, "app")[0], { ruta: "src/App.tsx", nombre: "App.tsx", carpeta: "src" });
es("uno de la raíz no tiene carpeta", filtrarArchivos(REPO, "readme")[0], { ruta: "README.md", nombre: "README.md", carpeta: "" });

// --- el tope --------------------------------------------------------------------------
const muchos = Array.from({ length: 500 }, (_, i) => `src/gen/archivo-${i}.ts`);
es("no se pintan más que el tope", filtrarArchivos(muchos, "archivo").length, TOPE_FILAS);
es("ni sin escribir nada", filtrarArchivos(muchos, "").length, TOPE_FILAS);

// --- la ruta que se abre --------------------------------------------------------------
es("en Windows, con sus barras", rutaEntera("C:\\proyectos\\Adeorq", "src/lib/pty.ts"), "C:\\proyectos\\Adeorq\\src\\lib\\pty.ts");
es("la barra final de la raíz no se duplica", rutaEntera("C:\\proyectos\\Adeorq\\", "README.md"), "C:\\proyectos\\Adeorq\\README.md");
es("en Linux, con las suyas", rutaEntera("/home/muni/adeorq", "src/lib/pty.ts"), "/home/muni/adeorq/src/lib/pty.ts");

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
