// Comprueba que el freno del Lienzo sigue puesto.
//
//     pnpm lienzo
//
// El Lienzo se monta SIEMPRE, escondido con `display:none`, porque desmontarlo
// mataría las terminales que tenga dentro. Escondido no se pinta, pero React
// seguía ejecutando sus cuatro mil líneas en cada render de App. Por eso lleva
// `memo` desde la 0.9.151.
//
// Y `memo` compara las props UNA A UNA por identidad. Basta con que alguien
// escriba una función, un objeto o una lista directamente en el JSX —
//
//     onAlgo={() => hazlo()}      estilo={{ alto: 10 }}      cosas={[1, 2]}
//
// — para que esa prop nazca nueva en cada render, la comparación falle siempre
// y el freno deje de existir. No lo dice el compilador, no rompe nada y no se
// ve: la app simplemente vuelve a ir más lenta y nadie sabe desde cuándo.
//
// Esto es esa red. Si hace falta pasar una función, se declara arriba con
// `useCallback`, como ya están `repartirDesdeLienzo` y `volverASuConversacion`.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(RAIZ, "src", "App.tsx");
const LIENZO = join(RAIZ, "src", "components", "CanvasView.tsx");

let fallos = 0;

const canvas = readFileSync(LIENZO, "utf8");
if (!/export default memo\(CanvasView\)/.test(canvas)) {
  console.error("CanvasView ya no se exporta con `memo`: el freno no existe.");
  fallos++;
} else {
  console.log("ok    CanvasView se exporta con memo");
}

const app = readFileSync(APP, "utf8");
const ini = app.indexOf("<CanvasView");
if (ini === -1) {
  console.error("No encuentro <CanvasView en App.tsx.");
  process.exit(2);
}
const bloque = app.slice(ini, app.indexOf("/>", ini));

// Una prop escrita en el sitio: `algo={(`, `algo={{` o `algo={[`.
const sueltas = [...bloque.matchAll(/^\s*(\w+)=\{\s*([([{])/gm)].map((m) => m[1]);

if (sueltas.length) {
  console.error(`\nEstas props del Lienzo nacen nuevas en cada render y anulan el memo:\n`);
  for (const p of sueltas) console.error(`  · ${p}`);
  console.error(
    "\nDeclárala arriba con `useCallback` (o `useMemo` si es un objeto) y pásala\n" +
    "por su nombre. Mira `repartirDesdeLienzo` en App.tsx como ejemplo.\n",
  );
  fallos++;
} else {
  const cuantas = [...bloque.matchAll(/^\s*\w+=\{/gm)].length;
  console.log(`ok    sus ${cuantas} props se pasan por nombre, ninguna escrita en el sitio`);
}

process.exit(fallos ? 1 : 0);
