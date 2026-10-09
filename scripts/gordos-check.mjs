// Que los ficheros gordos no vuelvan a crecer, y que la hoja siga siendo un índice.
//
//     pnpm gordos
//
// El 2026-10-06 `App.css` medía 21.131 líneas, `App.tsx` 4.798 y
// `CanvasView.tsx` 4.404. Ninguno nació así: crecieron de veinte en veinte
// líneas, y cada veinte eran razonables. Lo que faltaba no era disciplina, era
// un número que dijera «hasta aquí». Esto es ese número.
//
// Mira dos cosas:
//
//  1. EL TAMAÑO. Ningún fichero del front pasa de `TOPE` líneas. Los que ya lo
//     pasaban el día que se escribió esto están en `GORDOS`, cada uno con su
//     techo, y ese techo solo BAJA: cuando sacas algo de uno, bajas su número
//     en el mismo commit. Un tramo de la hoja no pasa de `TOPE_TRAMO`.
//
//  2. LA HOJA. `src/App.css` es un índice: solo comentarios y @import. Una
//     regla suelta ahí queda por delante de todas las demás, o sea perdiendo
//     contra todo, y no avisa. Y los tramos de `src/estilos/` se importan
//     todos, una vez y en el orden de su número, que es el orden de la cascada.
//
// Qué hacer cuando salta:
//   · un fichero pasa su techo: saca una pieza a su propio módulo (un
//     componente que ya está declarado fuera, una función pura, una tabla) y
//     déjalo por debajo. Subir el número no es el arreglo; si de verdad no hay
//     otra, el cambio de la tabla se ve en el diff y se explica en el commit.
//   · un tramo de la hoja pasa el suyo: córtalo en dos por un rótulo de
//     sección y renumera los de detrás, sin cambiar el orden.
//
// El Rust queda fuera a propósito: sus ficheros llevan los tests dentro, y un
// módulo largo con su banco al lado no es el mismo problema.
//
// Su banco es `scripts/gordos-check-check.mjs`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lo que no pasa ningún .ts/.tsx de `src/` que no esté en `GORDOS`. */
export const TOPE = 2000;
/** Lo que no pasa un tramo de `src/estilos/`. */
export const TOPE_TRAMO = 1800;
/** Cuánto tiene que haber bajado uno de su techo para que se pida bajarlo. */
export const HOLGURA = 150;

/** Los que ya eran gordos, con su techo. Solo bajan. */
export const GORDOS = {
  "src/App.tsx": 3920,
  "src/components/CanvasView.tsx": 4150,
  "src/components/Sidebar.tsx": 3710,
  "src/components/TerminalPane.tsx": 3040,
};

/** Los que crecen por lo que son y no por dejadez. */
export const EXENTOS = {
  "src/lib/i18n.ts": "es el diccionario: una frase nueva en la app es una línea nueva aquí",
};

/** Las líneas de un texto, contadas como `wc -l`. */
export function lineas(texto) {
  if (!texto) return 0;
  const n = texto.split("\n").length;
  return texto.endsWith("\n") ? n - 1 : n;
}

/**
 * Los tamaños contra sus techos.
 * `medidas` es `{ "src/…": líneas }`, con las rutas con `/`.
 */
export function revisarTopes(medidas, gordos = GORDOS, exentos = EXENTOS) {
  const fallos = [];
  const notas = [];
  for (const [ruta, n] of Object.entries(medidas)) {
    if (ruta in exentos) continue;
    if (ruta.startsWith("src/estilos/")) {
      if (n > TOPE_TRAMO) fallos.push(`${ruta} mide ${n} líneas y un tramo de la hoja no pasa de ${TOPE_TRAMO}: córtalo en dos por un rótulo`);
      continue;
    }
    if (ruta in gordos) {
      const techo = gordos[ruta];
      if (n > techo) fallos.push(`${ruta} mide ${n} líneas y su techo es ${techo}: saca una pieza a su módulo antes de meter otra`);
      else if (n <= TOPE) notas.push(`${ruta} ya mide ${n}: ha dejado de ser gordo, quítalo de la tabla`);
      else if (techo - n >= HOLGURA) notas.push(`${ruta} mide ${n} y su techo sigue en ${techo}: bájalo a ${Math.ceil(n / 10) * 10}`);
      continue;
    }
    if (n > TOPE) fallos.push(`${ruta} mide ${n} líneas y el tope es ${TOPE}: pártelo`);
  }
  for (const ruta of Object.keys(gordos)) {
    if (!(ruta in medidas)) fallos.push(`${ruta} está en la tabla de gordos y ya no existe: quítalo`);
  }
  return { fallos, notas };
}

/**
 * Que `App.css` sea un índice y traiga todos sus tramos, en orden.
 * `tramos` son los nombres de fichero que hay en `src/estilos/`.
 */
export function revisarIndice(textoApp, tramos) {
  const fallos = [];
  const sinComentarios = textoApp.replace(/\/\*[\s\S]*?\*\//g, "");
  const importados = [];
  for (const cruda of sinComentarios.split("\n")) {
    const l = cruda.trim();
    if (!l) continue;
    const m = l.match(/^@import\s+["']\.\/estilos\/([^"'/]+\.css)["']\s*;$/);
    if (m) importados.push(m[1]);
    else fallos.push(`App.css solo lleva @import de sus tramos, y trae esto: ${l.slice(0, 70)}`);
  }
  const enDisco = [...tramos].sort();
  for (const t of enDisco) {
    const veces = importados.filter((i) => i === t).length;
    if (veces === 0) fallos.push(`src/estilos/${t} existe y App.css no lo importa: sus reglas no llegan a la app`);
    if (veces > 1) fallos.push(`App.css importa ${veces} veces src/estilos/${t}`);
  }
  for (const i of importados) {
    if (!enDisco.includes(i)) fallos.push(`App.css importa src/estilos/${i}, que no existe`);
  }
  const ordenados = [...importados].sort();
  const primero = importados.findIndex((i, k) => i !== ordenados[k]);
  if (primero >= 0) fallos.push(`los tramos van en el orden de su número y ${importados[primero]} está fuera de sitio: ese orden es la cascada`);
  for (const t of enDisco) {
    if (!/^\d{2}-[a-z0-9-]+\.css$/.test(t)) fallos.push(`src/estilos/${t} no se llama «NN-nombre.css»`);
  }
  return fallos;
}

/** Todos los .ts/.tsx y los tramos de la hoja bajo `raiz/src`, con sus líneas. */
export function medir(raiz = RAIZ) {
  const medidas = {};
  (function rec(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.(tsx?|css)$/.test(e.name)) {
        const ruta = path.relative(raiz, p).split(path.sep).join("/");
        if (ruta.endsWith(".css") && !ruta.startsWith("src/estilos/")) continue;
        medidas[ruta] = lineas(fs.readFileSync(p, "utf8"));
      }
    }
  })(path.join(raiz, "src"));
  return medidas;
}

export function revisar(raiz = RAIZ) {
  const medidas = medir(raiz);
  const { fallos, notas } = revisarTopes(medidas);
  const estilos = path.join(raiz, "src", "estilos");
  const tramos = fs.existsSync(estilos) ? fs.readdirSync(estilos).filter((n) => n.endsWith(".css")) : [];
  fallos.push(...revisarIndice(fs.readFileSync(path.join(raiz, "src", "App.css"), "utf8"), tramos));
  return { medidas, fallos, notas, tramos };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { medidas, fallos, notas, tramos } = revisar();
  const front = Object.entries(medidas).filter(([r]) => !r.startsWith("src/estilos/"));
  const mayor = (lista) => lista.sort((a, b) => b[1] - a[1])[0];
  const [rutaTramo, nTramo] = mayor(Object.entries(medidas).filter(([r]) => r.startsWith("src/estilos/")));
  console.log(`Gordos: ${front.length} ficheros de código y ${tramos.length} tramos de la hoja.`);
  for (const [ruta, techo] of Object.entries(GORDOS)) {
    console.log(`  ${String(medidas[ruta] ?? "?").padStart(5)} de ${techo}  ${ruta}`);
  }
  console.log(`  ${String(nTramo).padStart(5)} de ${TOPE_TRAMO}  ${rutaTramo} (el tramo más largo)`);
  if (notas.length) console.log("\nSe puede apretar:\n  " + notas.join("\n  "));
  if (fallos.length) {
    console.log(`\nFALLA (${fallos.length}):\n  ` + fallos.join("\n  "));
    process.exit(1);
  }
  console.log("\nTODO BIEN.");
}
