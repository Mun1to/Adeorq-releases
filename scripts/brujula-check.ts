// La brújula (el panel personal de su dueño, en munito.dev) no existe dentro del
// paquete de la Microsoft Store, y fuera de él no cambia.
//
//   pnpm bancos brujula
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// La Agenda pide un correo y una contraseña de una cuenta de munito.dev que no
// tiene nadie más, y un revisor de la Tienda que la abriera se la encontraría. Dentro
// del paquete las dos puertas por las que entra algo (`signIn` y `restore`, de la
// que cuelgan las lecturas y `addIdea`) se cierran en `lib/brujula.ts`: ni una
// llamada a la red, ni una lectura del almacén de claves de Windows. Lo que se mide
// es eso, con un `fetch` y un almacén de mentira que cuentan lo que les llega.
//
// Fuera del paquete se mide que NADA cambió: el acceso va a Supabase, y recuperar la
// sesión lee el almacén y, solo si hay token, lo cambia por una sesión.
//
// Y, aparte, que `AgendaView.tsx` esconde lo que la enseña (la cifra de las ideas, el
// botón de aceptar una idea) detrás de la misma señal: eso se lee del fuente, y se
// mide de verdad en `scripts/laboratorio/brujula-de-verdad.mjs`.

declare const process: { exit(codigo: number): never };
declare const require: ((id: string) => unknown) & { cache: Record<string, unknown> };

const Module = require("module") as { _load: (id: string, ...r: unknown[]) => unknown };
const cargaOriginal = Module._load;

let tienda = false;
let almacen: string | null = null;
const llamadas = { secretGet: 0, secretPut: 0, secretForget: 0, fetch: [] as string[] };

Module._load = function (id: string, ...resto: unknown[]) {
  if (id === "./empaquetada") return { enLaTienda: async () => tienda, yaEnLaTienda: () => tienda };
  if (id === "./pty") {
    return {
      secretGet: async () => {
        llamadas.secretGet++;
        return almacen;
      },
      secretPut: async () => {
        llamadas.secretPut++;
      },
      secretForget: async () => {
        llamadas.secretForget++;
      },
    };
  }
  return cargaOriginal.call(this, id, ...resto);
};

const g = globalThis as unknown as Record<string, unknown>;
g.fetch = async (url: string) => {
  llamadas.fetch.push(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => (/\/rest\/v1\//.test(String(url)) ? [] : { access_token: "a", refresh_token: "r", expires_in: 3600 }),
  };
};

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

type Brujula = typeof import("../src/lib/brujula");
/** Un módulo recién cargado: guarda la sesión en variables de módulo. */
function cargar(): Brujula {
  for (const k of Object.keys(require.cache)) if (/[\\/]src[\\/]lib[\\/]brujula\.js$/.test(k)) delete require.cache[k];
  return require("../src/lib/brujula") as Brujula;
}
function reiniciar(t: boolean, guardado: string | null = null) {
  tienda = t;
  almacen = guardado;
  llamadas.secretGet = llamadas.secretPut = llamadas.secretForget = 0;
  llamadas.fetch = [];
}
const rechaza = (p: Promise<unknown>) => p.then(() => false, () => true);
const resumen = () => JSON.stringify(llamadas);

(async () => {
  // ── Dentro del paquete ────────────────────────────────────────────────────
  reiniciar(true, "token-de-otra-vida");
  let b = cargar();
  ok("en el paquete, `signIn` se rechaza", await rechaza(b.signIn("a@b.c", "x")));
  ok("en el paquete, `restore` dice que no hay sesión", (await b.restore()) === false);
  ok("en el paquete, ni las ventanas, ni las ideas, ni las condiciones se leen", (await rechaza(b.ventanas())) && (await rechaza(b.ideas())) && (await rechaza(b.condiciones())));
  ok("en el paquete, no se puede guardar una idea", await rechaza(b.addIdea("algo", "demo")));
  ok("y en todo eso NI UNA llamada a la red", llamadas.fetch.length === 0, resumen());
  ok("ni una lectura del almacén de claves, aunque hubiera un token guardado", llamadas.secretGet === 0 && llamadas.secretPut === 0, resumen());
  ok("y nadie queda con la sesión iniciada", b.isSignedIn() === false);

  // ── La instalación de siempre ─────────────────────────────────────────────
  reiniciar(false);
  b = cargar();
  await b.signIn("a@b.c", "x");
  ok("sin paquete, `signIn` va a Supabase y guarda el permiso de vuelta", llamadas.fetch.length === 1 && /supabase\.co\/auth\/v1\/token\?grant_type=password/.test(llamadas.fetch[0]) && llamadas.secretPut === 1, resumen());
  ok("y queda con la sesión iniciada", b.isSignedIn() === true);

  reiniciar(false);
  b = cargar();
  ok("sin paquete y sin token guardado, `restore` mira el almacén y dice que no, sin red", (await b.restore()) === false && llamadas.secretGet === 1 && llamadas.fetch.length === 0, resumen());

  reiniciar(false, "un-token");
  b = cargar();
  ok("sin paquete y con token guardado, `restore` lo cambia por una sesión", (await b.restore()) === true && llamadas.secretGet === 1 && /grant_type=refresh_token/.test(llamadas.fetch[0] ?? "") && llamadas.secretPut === 1, resumen());

  reiniciar(false, "un-token");
  b = cargar();
  const v = await b.ventanas();
  ok("sin paquete, leer las ventanas va a su tabla con la sesión recuperada", Array.isArray(v) && llamadas.fetch.some((u) => /rest\/v1\/external_windows/.test(u)), resumen());

  // ── La Agenda lo esconde con la misma señal ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as { readFileSync(ruta: string, codificacion: string): string };
  const agenda = readFileSync("src/components/AgendaView.tsx", "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  ok("AgendaView sabe si es la Tienda (`yaEnLaTienda` y `enLaTienda`)", /useState\(yaEnLaTienda\)/.test(agenda) && /enLaTienda\(\)\.then\(setEnTienda\)/.test(agenda));
  ok("y la cifra de las ideas solo sale fuera de la Tienda", /\{!enTienda && \(\s*<Cifra\s+n=\{projectIdeas\.length\}/.test(agenda));
  ok("y aceptar una idea (que va a la brújula) no sale en la Tienda, pero un paso sí", /\{!\(enTienda && n\.kind !== "paso"\) && \(\s*<button\s+className="ag-si"/.test(agenda));
  ok("y las pantallas de ideas y de fechas no pintan nada en la Tienda", /if \(enTienda && \(modo === "ideas" \|\| modo === "fechas"\)\) return null;/.test(agenda));

  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
