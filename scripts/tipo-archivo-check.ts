// De qué familia es cada archivo del árbol, que es lo que decide su icono
// (`lib/tipoArchivo.ts`).
//
// Lo que no puede pasar: que un archivo corriente salga como «otro» (el árbol
// lleno de papeles en blanco no dice nada), o que un nombre que empieza por
// punto se tome por una extensión.
//
//   pnpm bancos tipo-archivo

import { extensionDeNombre, tipoDeArchivo } from "../src/lib/tipoArchivo";

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

// --- la extensión ---------------------------------------------------------------------
es("la extensión, sin punto y en minúsculas", extensionDeNombre("App.TSX"), "tsx");
es("con varios puntos, la última", extensionDeNombre("vite.config.ts"), "ts");
es("un nombre que empieza por punto no tiene extensión", extensionDeNombre(".gitignore"), "");
es("sin punto, ninguna", extensionDeNombre("LICENSE"), "");

// --- la familia -----------------------------------------------------------------------
const casos: Array<[string, string]> = [
  ["App.tsx", "web"],
  ["index.html", "web"],
  ["scripts.mjs", "web"],
  ["pty.rs", "codigo"],
  ["bot.py", "codigo"],
  ["consulta.sql", "codigo"],
  ["App.css", "estilo"],
  ["package.json", "datos"],
  ["Cargo.toml", "datos"],
  ["pnpm-lock.yaml", "datos"],
  ["Cargo.lock", "datos"],
  [".gitignore", "datos"],
  [".env.local", "datos"],
  ["README.md", "texto"],
  ["LICENSE", "texto"],
  ["NOTICE.md", "texto"],
  ["notas.txt", "texto"],
  ["logo.png", "imagen"],
  ["icono.svg", "imagen"],
  ["demo.mp4", "imagen"],
  ["probar.sh", "consola"],
  ["limpiar.ps1", "consola"],
  ["Dockerfile", "consola"],
  ["Dockerfile.dev", "consola"],
  ["Makefile", "consola"],
  ["datos.bin", "otro"],
  ["sin-extension", "otro"],
];
for (const [nombre, tipo] of casos) es(`${nombre} es «${tipo}»`, tipoDeArchivo(nombre), tipo);
es("las mayúsculas no cambian la familia", tipoDeArchivo("FOTO.JPG"), "imagen");
es("la extensión manda sobre el nombre: un README.json son datos", tipoDeArchivo("README.json"), "datos");

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
