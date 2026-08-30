// Pone el plugin del editor de Adeorq en el `vite.config` de un proyecto.
//
//     node scripts/poner-editor.mjs C:/proyectos/Vibeset            (simulacro)
//     node scripts/poner-editor.mjs C:/proyectos/Vibeset --aplicar
//     node scripts/poner-editor.mjs --todos                          (los mira todos)
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
//
// El editor por clic existe desde la 0.9.142 y el 2026-08-30 se comprobó que no
// estaba puesto en NINGUNO de los trece proyectos con Vite de la casa, así que
// no había funcionado nunca en ninguna web de verdad. La fricción era esta: hay
// que añadir dos líneas a mano a cada `vite.config`, y a mano no lo hace nadie.
//
// El plugin es de VITE. Con Expo, Metro, Next o Astro no hay nada que añadir, y
// este script lo dice en vez de inventarse un fichero.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(RAIZ, "vite-plugin-adeorq", "index.js").split(path.sep).join("/");
const APLICAR = process.argv.includes("--aplicar");
const TODOS = process.argv.includes("--todos");

const IMPORT = `import adeorq from "${PLUGIN}";`;

/** El `vite.config` de un proyecto, si lo tiene. */
function configDe(proyecto) {
  for (const sub of ["", "web", "landing", "site", "redesign", "app"]) {
    for (const ext of ["ts", "js", "mts", "mjs"]) {
      const p = path.join(proyecto, sub, `vite.config.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Meter el plugin en el fuente.
 *
 * Se hace con dos cortes y no con una plantilla porque cada `vite.config` de la
 * casa es distinto, y reescribirlo entero sería perder lo que ya tiene.
 */
function conElPlugin(texto) {
  if (texto.includes("vite-plugin-adeorq")) return { ya: true };

  // El import va detrás del último que haya, para no partir un bloque de
  // imports por la mitad.
  const imports = [...texto.matchAll(/^import .*$/gm)];
  if (imports.length === 0) return { error: "no encuentro dónde poner el import" };
  const ultimo = imports[imports.length - 1];
  const corte = ultimo.index + ultimo[0].length;

  // Y el plugin, el PRIMERO del array: tiene que estampar antes de que el de
  // React transforme el JSX, o ya no queda fuente que marcar.
  const arr = texto.match(/plugins\s*:\s*\[/);
  if (!arr) return { error: "no encuentro el array de plugins" };
  const dentro = arr.index + arr[0].length;

  const conImport = texto.slice(0, corte) + "\n" + IMPORT + texto.slice(corte);
  const desplazado = dentro + IMPORT.length + 1;
  return {
    texto: conImport.slice(0, desplazado) + "adeorq(), " + conImport.slice(desplazado),
  };
}

function mirar(proyecto) {
  const nombre = path.basename(proyecto);
  const cfg = configDe(proyecto);
  if (!cfg) return console.log(`· ${nombre}: no usa Vite, aquí el editor no puede ir`);

  const texto = fs.readFileSync(cfg, "utf8");
  const r = conElPlugin(texto);
  const corto = cfg.replace(proyecto, "").replace(/^[\\/]/, "");

  if (r.ya) return console.log(`✓ ${nombre}: ya lo tiene (${corto})`);
  if (r.error) return console.log(`! ${nombre}: ${r.error} (${corto}), ponlo a mano`);

  if (!APLICAR) return console.log(`→ ${nombre}: se le puede poner (${corto})`);
  fs.writeFileSync(cfg, r.texto, "utf8");
  console.log(`✓ ${nombre}: puesto en ${corto}`);
}

if (TODOS) {
  const casa = path.dirname(RAIZ);
  for (const n of fs.readdirSync(casa)) {
    const p = path.join(casa, n);
    if (!fs.statSync(p).isDirectory() || n.startsWith(".") || n.startsWith("_")) continue;
    if (configDe(p)) mirar(p);
  }
} else {
  const destino = process.argv[2];
  if (!destino || destino.startsWith("--")) {
    console.log("Dime la carpeta del proyecto, o --todos para verlos todos.");
    process.exit(1);
  }
  mirar(path.resolve(destino));
}

console.log(
  APLICAR
    ? "\nHecho. Reinicia el servidor de desarrollo para que el plugin entre."
    : "\nSimulacro. Lánzalo con --aplicar para escribirlo.",
);
