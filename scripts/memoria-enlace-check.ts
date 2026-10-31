// A qué nota lleva un enlace de una nota de la Memoria.
//
//   pnpm bancos memoria-enlace
//
// Un enlace con un `%` suelto (`[100%](100%.md)`, o un «50% de descuento.md»)
// hacía que `decodeURI` lanzara `URIError` dentro del manejador del clic, justo
// después de `preventDefault`: el enlace no navegaba y la nota tampoco se
// abría, sin ningún aviso. Aquí se resuelve sin lanzar nunca.

declare const process: { exit(codigo: number): never };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

// `memoria.ts` importa Tauri, que mira `window` al invocar (no al cargar).
(globalThis as unknown as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { idDeEnlace } = require("../src/lib/memoria") as typeof import("../src/lib/memoria");
declare const require: (m: string) => unknown;

const docs = [
  { id: "proyectos/Adeorq/README.md" },
  { id: "proyectos/Adeorq/100%.md" },
  { id: "proyectos/VoCript/notas de voz.md" },
  { id: "diario/2026-10-31.md" },
];
const ids = new Set(docs.map((d) => d.id));

// El premisa: este `decodeURI` sí lanza con un `%` suelto.
let lanza = false;
try {
  decodeURI("100%.md");
} catch {
  lanza = true;
}
ok("premisa: decodeURI lanza con un % suelto", lanza);

ok("un enlace relativo normal", idDeEnlace("proyectos/Adeorq/README.md", "../VoCript/notas%20de%20voz.md", ids, docs) === "proyectos/VoCript/notas de voz.md");
ok("por nombre suelto, como en Obsidian", idDeEnlace("diario/2026-10-31.md", "README.md", ids, docs) === "proyectos/Adeorq/README.md");
ok("el enlace con % suelto no lanza y abre la nota", idDeEnlace("proyectos/Adeorq/README.md", "100%.md", ids, docs) === "proyectos/Adeorq/100%.md");
ok("uno que no existe devuelve null", idDeEnlace("diario/2026-10-31.md", "no-existe.md", ids, docs) === null);

console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
