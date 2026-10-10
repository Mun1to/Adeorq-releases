// Casos del árbol del panel de Archivos. Se corren de verdad, no se leen:
//
//   npx tsc scripts/arbol-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/arbol-check.js
//
// (Adeorq no tiene runner de tests: la lógica pura se prueba compilando a
// CommonJS y ejecutándola.)

import {
  conBorrados,
  dentroDe,
  filasVisibles,
  nombreDeRuta,
  peso,
  plegar,
  rutaCorta,
  type Leidas,
} from "../src/lib/arbol";
import type { Entrada } from "../src/lib/archivos";

let fallos = 0;
function ok(nombre: string, bien: boolean, porque = "") {
  if (bien) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLA  ${nombre}${porque ? `\n       ${porque}` : ""}`);
  }
}

const R = "C:\\proyectos\\Adeorq";
const carpeta = (nombre: string, padre = R): Entrada => ({
  nombre,
  ruta: `${padre}\\${nombre}`,
  carpeta: true,
  peso: 0,
});
const archivo = (nombre: string, padre = R): Entrada => ({
  nombre,
  ruta: `${padre}\\${nombre}`,
  carpeta: false,
  peso: 120,
});

/* ── Lo que se ve ──────────────────────────────────────────────────────── */

const raizSola: Leidas = new Map([
  [R, [carpeta("src"), carpeta("docs"), archivo("package.json")]],
]);

ok(
  "sin desplegar nada, se ven solo los hijos de la raíz",
  filasVisibles(raizSola, R).map((f) => f.nombre).join(",") === "src,docs,package.json",
);

ok(
  "y todos al mismo nivel",
  filasVisibles(raizSola, R).every((f) => f.hondo === 0),
);

const conSrc: Leidas = new Map(raizSola);
conSrc.set(`${R}\\src`, [carpeta("lib", `${R}\\src`), archivo("App.tsx", `${R}\\src`)]);

ok(
  "lo desplegado sale JUSTO debajo de su carpeta, no al final",
  filasVisibles(conSrc, R).map((f) => f.nombre).join(",")
    === "src,lib,App.tsx,docs,package.json",
  "es lo que separa un árbol de una lista: el orden es el del recorrido",
);

ok(
  "y con un nivel más de sangría",
  filasVisibles(conSrc, R).find((f) => f.nombre === "App.tsx")?.hondo === 1,
);

ok(
  "una carpeta leída se marca como desplegada",
  filasVisibles(conSrc, R).find((f) => f.nombre === "src")?.desplegada === true
    && filasVisibles(conSrc, R).find((f) => f.nombre === "docs")?.desplegada === false,
);

const hondo: Leidas = new Map(conSrc);
hondo.set(`${R}\\src\\lib`, [archivo("arbol.ts", `${R}\\src\\lib`)]);

ok(
  "tres niveles se recorren enteros",
  filasVisibles(hondo, R).map((f) => f.nombre).join(",")
    === "src,lib,arbol.ts,App.tsx,docs,package.json",
);

/* ── Plegar ────────────────────────────────────────────────────────────── */

ok(
  "plegar una carpeta olvida también lo que colgaba de ella",
  !plegar(hondo, `${R}\\src`).has(`${R}\\src\\lib`),
  "si se quedara, reabrir enseñaría el listado viejo: sin lo que el agente creó y con lo que borró",
);

ok(
  "plegar no toca a los hermanos",
  plegar(hondo, `${R}\\src`).has(R),
);

ok(
  "plegar deja de verse en las filas",
  filasVisibles(plegar(hondo, `${R}\\src`), R).map((f) => f.nombre).join(",")
    === "src,docs,package.json",
);

/* ── Dentro de ─────────────────────────────────────────────────────────── */

ok(
  "una carpeta que EMPIEZA igual no está dentro",
  !dentroDe("C:\\proyectos\\Adeorq-releases", "C:\\proyectos\\Adeorq"),
  "es el fallo clásico del prefijo pelado: plegar Adeorq cerraría Adeorq-releases",
);

ok(
  "y la que sí está dentro, sí",
  dentroDe("C:\\proyectos\\Adeorq\\src", "C:\\proyectos\\Adeorq"),
);

ok(
  "también con barras de Linux, que Adeorq corre ahí",
  dentroDe("/home/munir/adeorq/src", "/home/munir/adeorq")
    && !dentroDe("/home/munir/adeorq2", "/home/munir/adeorq"),
);

ok(
  "una carpeta no está dentro de sí misma",
  !dentroDe(R, R),
  "si lo estuviera, plegar entraría en bucle al borrarse a sí misma",
);

/* ── Nombres y rutas ───────────────────────────────────────────────────── */

ok(
  "el nombre sale de la ruta con cualquiera de los dos separadores",
  nombreDeRuta("C:\\p\\Adeorq\\src\\App.tsx") === "App.tsx"
    && nombreDeRuta("/home/m/adeorq/src/App.tsx") === "App.tsx",
);

ok(
  "la ruta corta es la de dentro del proyecto, sin barra al principio",
  rutaCorta(`${R}\\src\\App.tsx`, R) === "src\\App.tsx",
);

ok(
  "un archivo de fuera del proyecto enseña su ruta entera",
  rutaCorta("D:\\otro\\cosa.md", R) === "D:\\otro\\cosa.md",
  "cortarla mentiría sobre dónde está",
);

/* ── Peso ──────────────────────────────────────────────────────────────── */

ok(
  "el peso se lee en la unidad que toca",
  peso(512) === "512 B" && peso(2048) === "2 kB" && peso(3 * 1024 * 1024) === "3.0 MB",
);

/* ── Lo borrado vuelve a su carpeta ─────────────────────────────────────────
   Un archivo borrado sin commit no está en el disco, así que el listado no lo
   trae: solo se veía «1 borrado» arriba, sin saber cuál. */
{
  const base: Leidas = new Map([
    [R, [carpeta("src"), archivo("LICENSE"), archivo("package.json")]],
    [`${R}\\src`, [carpeta("lib", `${R}\\src`), archivo("App.tsx", `${R}\\src`), archivo("main.tsx", `${R}\\src`)]],
  ]);
  const nombres = (l: Leidas) => filasVisibles(l, R).map((f) => f.nombre);
  const con = conBorrados(base, [`${R}\\src\\Index.tsx`, `${R}\\notas.md`, `${R}\\docs\\viejo.md`]);
  ok(
    "cada borrado sale en su carpeta, entre los archivos y por su nombre",
    nombres(con).join() === "src,lib,App.tsx,Index.tsx,main.tsx,LICENSE,notas.md,package.json",
    nombres(con).join(),
  );
  ok("el de una carpeta que no está desplegada no sale", !nombres(con).includes("viejo.md"));
  ok("no toca lo leído: devuelve otro mapa", base.get(R)?.length === 3 && con !== base);
  ok("sin borrados, es el mismo mapa (no se repinta por nada)", conBorrados(base, []) === base);
  ok("uno que el disco sí lista no se repite", nombres(conBorrados(base, [`${R}\\src\\App.tsx`])).filter((n) => n === "App.tsx").length === 1);
  ok(
    "las barras y las mayúsculas de la ruta de git no importan",
    nombres(conBorrados(base, ["c:/proyectos/adeorq/src/Zeta.ts"])).join() === "src,lib,App.tsx,main.tsx,Zeta.ts,LICENSE,package.json",
    nombres(conBorrados(base, ["c:/proyectos/adeorq/src/Zeta.ts"])).join(),
  );
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
