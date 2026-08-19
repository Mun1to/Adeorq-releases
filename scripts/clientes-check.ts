// Que añadir un cliente siga siendo barato.
//
// El 2026-08-13 se midió lo que costaba: **19 archivos nombraban un CLI por su
// nombre propio y había 45 bifurcaciones** de tipo `cli === "claude"`. Al leerlas
// resultó que no eran 45 decisiones distintas, sino unas seis capacidades
// preguntadas una y otra vez, y tres de ellas YA estaban en la tabla de
// proveedores sin que nadie las consultara.
//
// Este comprobador sostiene el arreglo con tres cosas que un `tsc` no ve:
//
//   1. Que mover una regla del código a la tabla no cambió NADA. Es lo único
//      que separa una limpieza de una regresión silenciosa: si `lineaDeArranque`
//      devolviera otra cosa para un CLI, ese CLI se abriría mal y compilaría
//      igual de bien.
//   2. Que las listas derivadas siguen derivándose. `CLIS_CONOCIDOS` estuvo
//      escrita a mano con los doce nombres repetidos.
//   3. **Que el recuento de nombres propios sueltos NO SUBE.** Este es el que
//      de verdad hace que el arreglo dure. Empezó en 49 y va por 31; los que
//      quedan se irán migrando, pero mientras tanto nadie puede añadir uno
//      nuevo sin que esto se queje. Es el patrón de `cerebro-check.ts`, que lee
//      el CÓDIGO en vez de un resultado, y nació por el mismo motivo: lo que hay
//      que proteger no es el arreglo de hoy, es que mañana no se deshaga.
//
// Ojo con los cuatro de `lib/arranque.ts`: NO están exentos a propósito, aunque
// sean legítimos. Exentar el archivo bajaría el número sin bajar el problema, y
// este contador solo vale si nadie hace trampa con él.
//
//   npx tsc scripts/clientes-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/clientes-check.js

import { CLAUDE, IDS, lineaDeArranque, PROVIDERS, sabe } from "../src/lib/providers";
import { planDeArranque } from "../src/lib/arranque";
import { ARRANCAN_CON_ENCARGO, CLIS_CONOCIDOS, cliPedido } from "../src/lib/supremo";

// Igual que en `cerebro-check.ts`: esto se compila con `--skipLibCheck` y sin
// `@types/node`, así que un `import` de `node:fs` no tiene tipos. Se declara lo
// justo que se usa en vez de meter una dependencia entera para tres funciones.
declare const require: (m: string) => {
  readdirSync(p: string): string[];
  readFileSync(p: string, e: string): string;
  statSync(p: string): { isDirectory(): boolean };
};
declare const process: { exit(code: number): never };
const { readdirSync, readFileSync, statSync } = require("node:fs");

let fallos = 0;
function ok(que: string, bien: boolean, detalle = "") {
  if (bien) console.log(`ok   ${que}`);
  else {
    fallos++;
    console.log(`MAL  ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
}

/* ── 1. La migración no cambió nada ──────────────────────────────────────── */

// El `switch` tal y como vivía en `App.tsx` hasta el 2026-08-13, copiado literal.
// No se toca nunca: es la foto contra la que se compara la tabla.
function switchDeAntes(provider: string): string {
  switch (provider) {
    case "codex":
      return "codex --sandbox workspace-write";
    case "gemini":
      return "gemini --approval-mode auto_edit";
    case "agy":
      return "agy --mode accept-edits";
    case "kiro":
      return "kiro-cli chat";
    default:
      return (PROVIDERS.find((p) => p.id === provider) ?? CLAUDE).exe;
  }
}

for (const id of IDS) {
  const antes = switchDeAntes(id);
  const ahora = lineaDeArranque(id);
  ok(
    `«${id}» arranca igual que antes de mover la regla a la tabla`,
    antes === ahora,
    `antes «${antes}», ahora «${ahora}»`,
  );
}

ok(
  "un CLI que no existe devuelve su propio nombre y no revienta",
  lineaDeArranque("inventado") === "inventado",
);

/* ── 2. Las listas se derivan de la tabla ────────────────────────────────── */

ok(
  "todos los proveedores de la tabla son CLIs conocidos",
  IDS.every((id) => CLIS_CONOCIDOS.has(id)),
  IDS.filter((id) => !CLIS_CONOCIDOS.has(id)).join(", "),
);
ok("«shell» sigue siendo abrible aunque no sea un proveedor", CLIS_CONOCIDOS.has("shell"));
ok(
  "no sobra ningún nombre en la lista de conocidos",
  [...CLIS_CONOCIDOS].every((id) => id === "shell" || IDS.includes(id)),
);
ok(
  "los que arrancan con encargo salen de la columna, no de una lista aparte",
  PROVIDERS.filter((p) => p.encargoEnLinea).every((p) => ARRANCAN_CON_ENCARGO.has(p.id)) &&
    ARRANCAN_CON_ENCARGO.size === PROVIDERS.filter((p) => p.encargoEnLinea).length,
);
// Los dos que lo tenían antes de derivarlo. Si alguien quita la marca sin
// querer, el encargo dejaría de llegar y nadie se enteraría hasta usarlo.
ok("Claude sigue aceptando el encargo al arrancar", ARRANCAN_CON_ENCARGO.has("claude"));
ok("Antigravity sigue aceptando el encargo al arrancar", ARRANCAN_CON_ENCARGO.has("agy"));

// Y que un cliente NUEVO entra solo con su fila: se simula pidiéndolo por el MCP.
for (const id of IDS) {
  const r = cliPedido(id);
  ok(`el MCP acepta «${id}» sin tocar ninguna lista`, "cli" in r && r.cli === id);
}
ok("y sigue limpiando el sufijo del paquete", (() => {
  const r = cliPedido("claude-code");
  return "cli" in r && r.cli === "claude";
})());

/* ── 2b. Las capacidades responden por lo que saben, no por quién son ────── */

// La trampa que hace falta esta función: `providerOf` devuelve Claude cuando no
// encuentra el id, así que preguntarle capacidades a `shell` diría que sí a
// todo. `shell` y `ollama` pasan por los mismos sitios y no están en la tabla.
for (const forastero of ["shell", "ollama", "", "inventado"]) {
  ok(
    `«${forastero || "(vacío)"}» no hereda las capacidades de Claude`,
    !sabe(forastero, "modelo") &&
      !sabe(forastero, "ajustesEnVivo") &&
      !sabe(forastero, "modoPlan") &&
      !sabe(forastero, "retomable") &&
      !sabe(forastero, "usage"),
  );
}

ok("a Claude se le elige el cerebro", sabe("claude", "modelo"));
// Dentro de una sesión ya abierta, que es OTRA cosa que la línea de arranque.
// Comprobado en su binario (2026-08-19): «Run /effort xhigh in an interactive
// terminal». Es lo que decide si el modo chat enseña esas dos pastillas.
ok("a Claude se le cambia el cerebro en vivo", sabe("claude", "ajustesEnVivo"));
ok("Claude tiene modo plan", sabe("claude", "modoPlan"));
ok("una sesión de Claude se puede retomar (revivir y relevo)", sabe("claude", "retomable"));
ok("Adeorq sabe leer la cuota de Claude", sabe("claude", "usage"));

// Y lo contrario, que es lo que de verdad se rompería sin querer: a un CLI que
// no admite elección de modelo no se le puede ofrecer el selector, ni el relevo
// a uno cuya sesión no vuelve.
for (const p of PROVIDERS.filter((x) => x.id !== "claude")) {
  ok(`«${p.id}» no promete un cerebro elegible que no tiene`, !sabe(p.id, "modelo"));
  // Si esto se rompe, el modo chat le teclea «/model opus» a un CLI que no
  // tiene ese comando, y esa línea sale escrita delante de tu mensaje.
  ok(`«${p.id}» no promete ajustes en vivo que no entiende`, !sabe(p.id, "ajustesEnVivo"));
}
ok(
  "solo prometen cuota los que de verdad la publican",
  PROVIDERS.filter((p) => sabe(p.id, "usage")).map((p) => p.id).join() === "claude",
);
ok(
  "quien acepta encargo al arrancar lo declara en su fila",
  PROVIDERS.filter((p) => p.encargoEnLinea).map((p) => p.id).sort().join() ===
    "agy,claude,opencode",
);
// Claude y Antigravity lo toman como argumento suelto y tienen su rama propia;
// cualquier OTRO que acepte encargo necesita decir CON QUÉ, o el texto se
// perdería por el camino sin que nadie se entere.
for (const p of PROVIDERS.filter((x) => x.encargoEnLinea && x.id !== "claude" && x.id !== "agy")) {
  ok(`«${p.id}» dice con qué bandera recibe el encargo`, !!p.banderaEncargo);
}

// Cómo recibe cada uno una imagen. Decir la equivocada hace que Munir se pelee
// con un agente que nunca la vio, así que se comprueban los dos lados.
ok("Claude lee una imagen de la ruta escrita", sabe("claude", "leeRutaDeImagen"));
ok("Antigravity también", sabe("agy", "leeRutaDeImagen"));
ok("Codex NO: la quiere pegada con Ctrl+V", !sabe("codex", "leeRutaDeImagen"));

// Las skills son de Claude Code. Sugerirle `/frontlaxweb` a otro es mandarle a
// escribir una barra que no hace nada.
ok("solo Claude tiene skills invocables", PROVIDERS.filter((p) => sabe(p.id, "skills")).map((p) => p.id).join() === "claude");

// `variasCuentas` no es un booleano de la tabla sino «tiene variable de carpeta».
for (const p of PROVIDERS) {
  ok(
    `«${p.id}» admite varias cuentas solo si su carpeta se puede mover`,
    sabe(p.id, "variasCuentas") === !!p.envVar,
  );
}
ok("opencode sigue siendo de una sola cuenta", !sabe("opencode", "variasCuentas"));

ok(
  "la chapa de Antigravity nombra su programa, y sale de la tabla",
  (PROVIDERS.find((p) => p.id === "agy")?.rotuloPane ?? "") === "Antigravity (agy)",
);
ok(
  "y ningún otro necesita rótulo aparte",
  PROVIDERS.filter((p) => p.rotuloPane).map((p) => p.id).join() === "agy",
);

/* ── 2d. Lo que se verificó en disco de cada CLI ─────────────────────────── */

// Una credencial sin carpeta donde buscarla no dice «desconectada»: dice
// cualquier cosa. Es el fallo que tuvo Pi (su login vive en `.pi/agent`, no en
// `.pi`) y el que tenía opencode hasta el 2026-08-13.
for (const p of PROVIDERS.filter((x) => x.creds.length)) {
  ok(`«${p.id}» dice dónde buscar su login`, !!p.homeDir.trim());
  ok(
    `  ↳ y son nombres de archivo, no rutas`,
    p.creds.every((c) => !c.includes("/") && !c.includes("\\") && !c.includes("..")),
  );
}

// opencode, comprobado instalándolo de verdad el 2026-08-13. Su login NO está
// en `.config/opencode`, que es lo que puso esta tabla desde julio: lo crea en
// la carpeta de DATOS. Si alguien lo devuelve a `.config`, la cuenta saldría
// como desconectada para siempre y nadie sabría por qué.
{
  const oc = PROVIDERS.find((p) => p.id === "opencode")!;
  ok("opencode busca su login en la carpeta de datos", oc.homeDir === ".local/share/opencode");
  ok("y el archivo es auth.json", oc.creds.join() === "auth.json");
  ok("tiene un comando de instalación que de verdad funciona", !!oc.cmd?.includes("--allow-build"));
  // Su `--auto` se anuncia «(dangerous!)» en su propia ayuda: aprueba todo lo
  // que no esté prohibido. Eso es permiso total, no el acceptEdits de Claude.
  ok("y NO arranca con una bandera de permiso total", !oc.arranque);
}

/* ── 2c. El plan de arranque, que antes estaba copiado seis veces ────────── */

// Cada caso de aquí abajo era una rama de una de las seis copias que vivían en
// `App.tsx`. Si alguna deja de dar lo mismo, una terminal nace mal y compila
// igual de bien: es justo lo que un `tsc` no puede decir.

const pl = (x: Parameters<typeof planDeArranque>[0]) => planDeArranque(x);

ok("«shell» abre una consola pelada, sin comando dentro", pl({ cli: "shell" }).tipo === "consola");

{
  const r = pl({ cli: "ollama", modeloLocal: "llama3" });
  ok(
    "el modelo de casa se abre con su propia línea",
    r.tipo === "linea" && r.inner === "ollama run llama3",
  );
}
{
  const r = pl({ cli: "ollama" });
  ok(
    "y sin modelo elegido no deja un espacio colgando al final",
    r.tipo === "linea" && r.inner === "ollama run",
  );
}

{
  const r = pl({ cli: "claude" });
  ok(
    "un Claude vacío no lleva banderas ni pide el envoltorio pesado",
    r.tipo === "claude" && r.extra === "" && !r.conTexto && !r.modo,
  );
}
{
  const r = pl({ cli: "claude", encargo: "arregla el login" });
  ok(
    "con encargo, Claude lo lleva entrecomillado y pide PowerShell",
    r.tipo === "claude" && r.extra === "'arregla el login'" && r.conTexto,
  );
}
{
  const r = pl({ cli: "claude", modelo: "opus", esfuerzo: "high", encargo: "audita" });
  ok(
    "modelo, esfuerzo y encargo salen en ese orden",
    r.tipo === "claude" && r.extra === "--model opus --effort high 'audita'",
  );
}
{
  const r = pl({ cli: "claude", plan: true });
  ok("el modo plan llega al comando", r.tipo === "claude" && r.modo === "plan");
}
{
  // La razón de ser del entrecomillado: esto lo dicta Munir por voz y en una
  // línea de cmd un «&» ejecutaría lo que viene detrás.
  const r = pl({ cli: "claude", encargo: "pon 'esto' & aquello" });
  ok(
    "una comilla dentro del encargo se dobla y no rompe la línea",
    r.tipo === "claude" && r.extra === "'pon ''esto'' & aquello'",
  );
}

{
  const r = pl({ cli: "agy", encargo: "haz la home", agyExe: "C:/x/agy.exe" });
  ok(
    "Antigravity se llama por la ruta que encontró Rust, con su encargo",
    r.tipo === "agy" && r.exe === "C:/x/agy.exe" && r.encargo === "haz la home",
  );
}
{
  // Su instalador solo añade su carpeta al PATH de las consolas NUEVAS, así que
  // esto pasa de verdad: sin ruta hay que caer en su columna de la tabla.
  const r = pl({ cli: "agy", encargo: "haz la home" });
  ok(
    "sin esa ruta, Antigravity cae en su línea de la tabla y no se pierde",
    r.tipo === "linea" && r.inner === "agy --mode accept-edits",
  );
}

// El primero que entró con encargo SIN una rama escrita para él, que es de lo
// que iba todo esto.
{
  const r = pl({ cli: "opencode", encargo: "arregla el header" });
  ok(
    "opencode nace con el encargo puesto, solo por declarar su bandera",
    r.tipo === "linea" && r.inner === "opencode --prompt 'arregla el header'" && r.conTexto === true,
  );
  ok("y no se le copia al portapapeles, que ya lo tiene", r.tipo === "linea" && !r.alPortapapeles);
}
{
  const r = pl({ cli: "opencode" });
  ok(
    "sin encargo, opencode abre pelado y sin envoltorio pesado",
    r.tipo === "linea" && r.inner === "opencode" && !r.conTexto,
  );
}
{
  const r = pl({ cli: "codex", encargo: "traduce los tooltips" });
  ok(
    "a quien no acepta el encargo al arrancar se le copia, no se le mete en la línea",
    r.tipo === "linea" &&
      r.inner === "codex --sandbox workspace-write" &&
      r.alPortapapeles === "traduce los tooltips",
  );
}
{
  const r = pl({ cli: "codex" });
  ok("y sin encargo no se copia nada", r.tipo === "linea" && !r.alPortapapeles);
}
{
  const r = pl({ cli: "qwen", encargo: "   " });
  ok(
    "un encargo que es solo espacios no cuenta como encargo",
    r.tipo === "linea" && !r.alPortapapeles,
  );
}

// Y lo que da sentido a todo esto: un cliente NUEVO no añade una rama.
for (const id of IDS) {
  const r = pl({ cli: id, agyExe: "C:/x/agy.exe" });
  const esperado = id === "claude" ? "claude" : id === "agy" ? "agy" : "linea";
  ok(`«${id}» se abre sin ninguna rama escrita para él`, r.tipo === esperado);
  if (r.tipo === "linea") {
    ok(`  ↳ y con la línea que dice su fila`, r.inner === lineaDeArranque(id));
  }
}

/* ── 3. El techo de nombres propios sueltos ──────────────────────────────── */

// Lo que se persigue: un `if` que pregunta QUIÉN es el CLI en vez de QUÉ SABE
// HACER. `providers.ts` queda fuera porque es justo donde deben vivir.
const SUELTO =
  /(?:cli|kind|provider)\s*===\s*"(?:claude|agy|codex|gemini|qwen|copilot|crush|opencode|amp|cursor|pi|kiro|shell|ollama)"|\.?id\s*===\s*"(?:claude|agy|codex)"/g;

const EXENTOS = ["src/lib/providers.ts"];

/**
 * El recuento de hoy. **Solo puede bajar.**
 *
 * Si tu cambio lo sube, no toques este número: estás escribiendo un nombre
 * propio donde debería ir una capacidad de la tabla. Si lo baja, bájalo aquí y
 * quédate con el gusto.
 *
 * ⚠ **De 49 se bajó a 20, y de esos 20, DOCE son correctos y no deben bajar.**
 * Está escrito aquí para que nadie los persiga creyendo que son deuda:
 *
 *   · **10 son `shell` y `ollama`**, que NO son clientes de la tabla. Una
 *     consola pelada no tiene login ni cuota, y el modelo de casa no gasta la
 *     suscripción de nadie. Añadir un cliente nuevo no toca ni uno de estos.
 *   · **2 son los casos propios de `arranque.ts`**: Claude nace con un id de
 *     sesión que permite retomarlo, y a Antigravity hay que llamarlo por la
 *     ruta absoluta que encontró Rust. Son diferencias reales, no descuidos.
 *
 * Los 8 restantes sí son deuda, y están medidos: 4 en el lienzo (que solo
 * guarda tres tipos de panel, y eso toca lo que ya hay guardado en disco) y 4
 * de presentación (el orden de la lista del asistente y dos botones de la barra
 * con su propio manejador).
 */
const TECHO = 20;

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) salida.push(...ficheros(p));
    else if (/\.tsx?$/.test(e)) salida.push(p);
  }
  return salida;
}

const porFichero = new Map<string, number>();
let total = 0;
for (const f of ficheros("src")) {
  const rel = f.split(/[\\/]/).join("/");
  if (EXENTOS.includes(rel)) continue;
  const n = (readFileSync(f, "utf8").match(SUELTO) ?? []).length;
  if (n) {
    porFichero.set(rel, n);
    total += n;
  }
}

if (total > TECHO) {
  console.log("\n  dónde están:");
  for (const [f, n] of [...porFichero].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${f}`);
  }
}
ok(
  `los nombres propios de CLI sueltos no suben de ${TECHO} (hay ${total})`,
  total <= TECHO,
  "alguien preguntó QUIÉN es el CLI donde debía preguntar QUÉ SABE HACER",
);
if (total < TECHO) {
  console.log(`     ↳ bajaron a ${total}: baja el TECHO en scripts/clientes-check.ts`);
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
