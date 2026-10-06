// Lanza los bancos en TypeScript de scripts/ (los `*-check.ts` y `*-check.tsx`).
//
//     pnpm bancos                 todos
//     pnpm bancos clientes foto   solo los que lleven esas palabras en el nombre
//
// Hay casi cuarenta, y cada uno se lanzaba copiando de su cabecera una receta
// de `tsc` de dos líneas con una carpeta temporal a mano. O sea que casi nunca:
// `clientes-check.ts` estuvo semanas en rojo (27 nombres propios de CLI sobre
// un tope de 20) sin que nadie se enterase, hasta el 2026-10-06. Un comprobador
// que no se lanza no protege, y uno en rojo permanente ya está muerto.
//
// Hace lo mismo que la receta, de una vez para todos: compila a CommonJS en una
// carpeta temporal, corre cada uno con `node` desde la raíz del repo (los que
// leen `src/App.css` lo buscan ahí) y con `NODE_PATH` apuntando a
// `node_modules` (los que montan React en jsdom lo necesitan), y al final dice
// cuáles pasan. Los avisos de tipos de `tsc` se callan a propósito: sin
// `@types/node` en el repo salen docenas que no dicen nada, y lo que decide es
// si el banco corre y acaba bien.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const filtros = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const todos = readdirSync(join(RAIZ, "scripts"))
  .filter((f) => /-check\.tsx?$/.test(f))
  .sort();
const elegidos = filtros.length ? todos.filter((f) => filtros.some((x) => f.includes(x))) : todos;
if (!elegidos.length) {
  console.error(`Ningún banco se llama así. Los que hay:\n  ${todos.map((f) => f.replace(/-check\.tsx?$/, "")).join(", ")}`);
  process.exit(1);
}

/* Lo que un banco carga con un `require("../src/…")` de EJECUCIÓN no lo ve
   venir `tsc`, y sin nombrarlo en la orden el banco muere con «Cannot find
   module» (`comandos-check` lo hace para fingir el sistema operativo antes de
   cada carga, y su cabecera lo avisa). Se buscan aquí y se compilan también:
   así un banco suelto sale además en `<tmp>/scripts/`, que es de donde cuelga
   ese `../src`. */
const deEjecucion = new Set();
for (const f of elegidos) {
  const fuente = readFileSync(join(RAIZ, "scripts", f), "utf8");
  for (const m of fuente.matchAll(/require(?:\.resolve)?\(\s*["']\.\.\/(src\/[^"']+)["']\s*\)/g)) {
    const sinExt = join(RAIZ, m[1]);
    const real = [`${sinExt}.ts`, `${sinExt}.tsx`].find(existsSync);
    if (real) deEjecucion.add(real);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "adeorq-bancos-"));
let fallos = 0;
try {
  const tsc = join(RAIZ, "node_modules", "typescript", "bin", "tsc");
  const compilado = spawnSync(
    process.execPath,
    [
      tsc,
      ...elegidos.map((f) => join("scripts", f)),
      ...deEjecucion,
      "--module", "commonjs",
      "--target", "es2022",
      "--lib", "es2022,dom",
      "--esModuleInterop",
      "--skipLibCheck",
      "--jsx", "react-jsx",
      "--outDir", tmp,
    ],
    { cwd: RAIZ, encoding: "utf8" },
  );

  for (const f of elegidos) {
    const nombre = f.replace(/\.tsx?$/, "");
    // Con algún import de `../src` la raíz común es el repo y sale en
    // `<tmp>/scripts/`; un banco suelto que no importa nada sale en `<tmp>/`.
    const js = [join(tmp, "scripts", `${nombre}.js`), join(tmp, `${nombre}.js`)].find(existsSync);
    if (!js) {
      fallos++;
      console.log(`FALLA ${nombre}  (no compiló)`);
      console.log(
        (compilado.stdout || "")
          .split("\n")
          .filter((l) => l.includes(f))
          .slice(0, 8)
          .map((l) => `      ${l}`)
          .join("\n"),
      );
      continue;
    }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [js], {
      cwd: RAIZ,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, NODE_PATH: join(RAIZ, "node_modules") },
    });
    const seg = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.status === 0) {
      console.log(`OK    ${nombre}  (${seg} s)`);
    } else {
      fallos++;
      console.log(`FALLA ${nombre}  (${r.error ? r.error.message : `salió con ${r.status}`}, ${seg} s)`);
      const cola = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-12);
      console.log(cola.map((l) => `      ${l}`).join("\n"));
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(fallos ? `\n${fallos} de ${elegidos.length} en rojo.` : `\nLos ${elegidos.length} en verde.`);
process.exit(fallos ? 1 : 0);
