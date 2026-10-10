// Qué lenguaje se le da al editor según el archivo (`lib/lenguajes.ts`).
//
// La tabla se equivoca en silencio: un archivo sin lenguaje se abre en gris y
// nadie se queja. Aquí está la lista de lo que hay en este repo y en los de al
// lado, y cada uno tiene que salir con el suyo.
//
//   pnpm bancos lenguajes

import { extensionDe, lenguajeDe } from "../src/lib/lenguajes";

let fallos = 0;
// El lanzador solo enseña las últimas líneas: los rojos se repiten al final.
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? nombre + " (" + detalle + ")" : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
/** El nombre del lenguaje que sale, o «(texto)». */
const de = (archivo: string) => lenguajeDe(archivo)?.language.name ?? "(texto)";

const ESPERADO: Record<string, string> = {
  "App.tsx": "typescript",
  "vite.config.ts": "typescript",
  "comprobar.mjs": "javascript",
  "lib.rs": "rust",
  "App.css": "css",
  "package.json": "json",
  "AGENTS.md": "markdown",
  "index.html": "html",
  "adeorq.svg": "html",
  "mark.py": "python",
  "web.yml": "yaml",
  "pnpm-workspace.yaml": "yaml",
  "Cargo.toml": "toml",
  "Cargo.lock": "toml",
  "probar-linux-wsl.sh": "shell",
  "al-cerrar-de-verdad.ps1": "powershell",
  // El modo de Dockerfile es el único que no trae nombre: sale «» y no
  // «(texto)», que es lo que saldría si no se reconociera.
  Dockerfile: "",
  "Dockerfile.dev": "",
  ".gitignore": "properties",
  ".env.local": "properties",
  "main.go": "go",
  "motor.cpp": "cpp",
  "Programa.cs": "csharp",
  "consulta.sql": "sql",
  "arreglo.patch": "diff",
};
for (const [archivo, lenguaje] of Object.entries(ESPERADO)) {
  ok(`${archivo} → ${lenguaje}`, de(archivo) === lenguaje, `sale ${de(archivo)}`);
}

ok("lo que no se conoce se queda en texto, sin inventar", de("foto.png") === "(texto)" && de("LICENSE") === "(texto)" && de("notas.txt") === "(texto)");
ok("las mayúsculas de la extensión no despistan", de("LEEME.MD") === "markdown" && de("Config.YML") === "yaml");
ok("un archivo que empieza por punto no tiene extensión", extensionDe(".gitignore") === "" && extensionDe("a.b.ts") === "ts");
ok("un .tsx entiende JSX y un .ts no", lenguajeDe("a.tsx") !== null && lenguajeDe("a.ts") !== null);

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
