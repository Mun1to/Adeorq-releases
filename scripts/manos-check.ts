// Casos de los permisos del Capataz. Se corren de verdad, no se leen:
//
//   npx tsc scripts/manos-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/manos-check.js
//
// (Adeorq no tiene runner de tests: la lógica pura se prueba compilando a
// CommonJS, igual que `cerebro-check.ts` y `clientes-check.ts`.)
//
// Lo que se comprueba aquí no se puede mirar en pantalla y opinar:
//
//   1. Que cada escalón del conmutador contiene al anterior y ni uno solo se
//      salta la frontera. Un `mirar` con `send_command` dentro se ve
//      exactamente igual en la interfaz, hasta el día que teclea en tu
//      terminal.
//   2. Que los nombres EXISTEN en el servidor MCP de verdad. Este es el fallo
//      caro: si alguien renombra una herramienta en `mcp.rs`, la lista de
//      permisos sigue compilando, el CLI acepta el nombre inventado sin
//      quejarse, y el Capataz se queda manco sin que nada falle en ningún
//      sitio. Por eso este comprobador LEE EL RUST.

import {
  MANOS,
  MODOS,
  MODO_FABRICA,
  ROTULO,
  aviso,
  guardarModo,
  leerModo,
  manosDe,
  puedeTocar,
  type ModoCapataz,
} from "../src/lib/manos";

/* Sin `import` de node y sin sus tipos: esto se compila suelto, con
   `--skipLibCheck` y sin `@types/node`, así que un `import` de `node:fs` no
   compilaría. Se declara aquí lo justo que se usa. */
declare const require: (m: string) => { readFileSync(p: string, e: string): string };
declare const process: { cwd(): string; exit(n: number): void };

let fallos = 0;
function ok(nombre: string, cond: boolean, extra = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok   " : "FALLO"} ${nombre}${extra ? "  " + extra : ""}`);
}

/* ── 1. La frontera, que es de lo que va todo esto ──────────────────────── */

ok("mirar no puede teclear", !manosDe("mirar").includes(MANOS.teclear));
ok("mirar no puede abrir", !manosDe("mirar").includes(MANOS.abrir));
ok("mirar no puede enlazar", !manosDe("mirar").includes(MANOS.enlazar));
ok("plan NO puede teclear", !manosDe("plan").includes(MANOS.teclear),
  "es la única que pisa trabajo ajeno");
ok("plan sí puede abrir", manosDe("plan").includes(MANOS.abrir));
ok("auto sí puede teclear", manosDe("auto").includes(MANOS.teclear));

/* ── 2. Los escalones suben, nunca se cruzan ────────────────────────────── */

for (let i = 1; i < MODOS.length; i++) {
  const antes = manosDe(MODOS[i - 1]);
  const ahora = manosDe(MODOS[i]);
  ok(`${MODOS[i]} contiene todo lo de ${MODOS[i - 1]}`,
    antes.every((m) => ahora.includes(m)));
  ok(`${MODOS[i]} da más que ${MODOS[i - 1]}`, ahora.length > antes.length);
}

/* ── 3. Nada suelto ─────────────────────────────────────────────────────── */

const todas = Object.values(MANOS) as string[];
const enAuto = manosDe("auto");
ok("auto reparte TODAS las manos que hay", todas.every((m) => enAuto.includes(m)),
  `${enAuto.length} de ${todas.length}`);
ok("y ninguna de más", enAuto.every((m) => todas.includes(m)));
ok("sin repetidas en ningún modo",
  MODOS.every((m) => new Set(manosDe(m)).size === manosDe(m).length));
ok("cada modo tiene rótulo", MODOS.every((m) => !!ROTULO[m]?.nombre && !!ROTULO[m]?.que));
ok("cada modo tiene su aviso", MODOS.every((m) => aviso(m).length > 40));
ok("el de fábrica es uno de los tres", MODOS.includes(MODO_FABRICA));
ok("puedeTocar solo miente en mirar",
  !puedeTocar("mirar") && puedeTocar("plan") && puedeTocar("auto"));

/* ── 4. Los nombres, contra el Rust de verdad ───────────────────────────── */

const rust = require("fs").readFileSync(
  process.cwd() + "/src-tauri/src/mcp.rs",
  "utf8",
) as string;

/* Las que el servidor DECLARA en su lista de herramientas (el `tools/list` que
   lee el cliente). Se sacan del bloque de declaración y no de los `match`,
   porque una herramienta que se atiende pero no se anuncia es invisible para
   quien tiene que pedirla. */
const declaradas = new Set<string>();
for (const m of rust.matchAll(/"name":\s*"([a-z_]+)"/g)) declaradas.add(m[1]);
// `adeorq-mcp` es el nombre del servidor, no una herramienta.
declaradas.delete("adeorq-mcp");

for (const [alias, completo] of Object.entries(MANOS)) {
  const corto = completo.replace("mcp__adeorq__", "");
  ok(`la mano "${alias}" existe en mcp.rs`, declaradas.has(corto), corto);
  ok(`la mano "${alias}" lleva el prefijo del servidor`,
    completo.startsWith("mcp__adeorq__"),
    "sin él, el CLI no permite NINGUNA y el Capataz se queda ciego");
}

ok("no hay herramientas del MCP sin repartir",
  [...declaradas].every((d) => todas.includes(`mcp__adeorq__${d}`)),
  [...declaradas].filter((d) => !todas.includes(`mcp__adeorq__${d}`)).join(", ") || "ninguna");

/* ── 5. Y que el Rust las pida como las pedimos ─────────────────────────── */

const rs = require("fs").readFileSync(
  process.cwd() + "/src-tauri/src/foreman.rs",
  "utf8",
) as string;
ok("el Capataz llama al servidor «adeorq»", /"adeorq":\s*\{/.test(rs),
  "si se renombra ahí, todos los prefijos de aquí dejan de valer");
ok("y cierra la puerta de atrás", /--disallowedTools/.test(rs) && /"Bash"/.test(rs),
  "sin esto podría leerse el disco entero por otro camino");
ok("sin manos no arranca", /manos\.is_empty\(\)/.test(rs));

/* ── 6. El ajuste guardado aguanta basura ───────────────────────────────── */

const almacen: Record<string, string> = {};
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (k in almacen ? almacen[k] : null),
  setItem: (k: string, v: string) => { almacen[k] = v; },
};

ok("sin nada guardado, el de fábrica", leerModo() === MODO_FABRICA);
guardarModo("auto");
ok("lo guardado vuelve", leerModo() === "auto");
almacen["adeorq-capataz-modo"] = "todopoderoso";
ok("una basura NO se cuela como modo", leerModo() === MODO_FABRICA,
  "un valor inventado no puede acabar dando manos que no existen");
almacen["adeorq-capataz-modo"] = "";
ok("y una cadena vacía tampoco", leerModo() === MODO_FABRICA);

/* Y el caso de verdad de esto: que una basura guardada NO reparta manos. */
const basura = leerModo() as ModoCapataz;
ok("con el ajuste corrupto no aparece teclear", !manosDe(basura).includes(MANOS.teclear));

console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo en orden.");
if (fallos) process.exit(1);
