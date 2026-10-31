// Seguir una sesión del PC desde el móvil, tocada dos veces seguidas: tiene que
// abrir UNA terminal. Se corre con `pnpm bancos movil-seguir`.
//
// El móvil deja la fila tocable mientras dice «Abriendo…», así que un doble
// toque manda dos `POST /api/seguir` con el mismo id. Cada uno llega a la
// ventana con el `exec` de ese momento, y su `panes()` es la lista de antes de
// abrir nada: React no ha vuelto a pintar entre uno y otro. Los dos veían que
// no estaba abierta y los dos la abrían, y dos `claude --resume` sobre la
// misma conversación la cuelgan, que es justo lo que el propio código dice
// evitar.
//
// Se carga `lib/movil.ts` de verdad, con un Tauri falso por debajo: el
// `scan_sessions` tarda un poco, como en el PC, y el `exec` es una foto de los
// paneles como la que le llega a cada pedido.

let fallos = 0;
function ok(nombre: string, real: boolean, porque?: string) {
  if (!real) fallos++;
  console.log(`${real ? "ok  " : "FALLA"} ${nombre}${!real && porque ? ` — ${porque}` : ""}`);
}

const ID = "5e55a1d2-6c0a-4b1e-9a77-0c0ffee00031";
const sesion = { id: ID, title: "Adeorq · algo", cwd: "C:\\proyectos\\Adeorq", fuente: "claude", live: false, mtime: 1 };

const g = globalThis as unknown as Record<string, unknown>;
const guardado = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
};
g.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string) => {
      if (cmd === "scan_sessions") {
        await new Promise((r) => setTimeout(r, 30));
        return [sesion];
      }
      return null;
    },
    transformCallback: () => 0,
  },
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const movil = require("../src/lib/movil") as typeof import("../src/lib/movil");

async function main() {
  const abiertas: string[][] = [];
  // Lo que ve cada pedido: la lista de paneles del último pintado, sin la nueva.
  const foto = () => ({
    abrir: () => undefined,
    escribir: async () => true,
    panes: () => [],
    cuentas: () => [],
    abrirComando: (_label: string, _cwd: string, command: string[]) => {
      abiertas.push(command);
      return 40 + abiertas.length;
    },
  });
  const pedir = (peticion: number) => movil.atenderPedido({ peticion, clase: "seguir", id: ID }, foto());
  const [uno, dos] = await Promise.all([pedir(1), pedir(2)]);
  ok("un doble toque abre una sola terminal", abiertas.length === 1, `abrió ${abiertas.length}: ${JSON.stringify(abiertas)}`);
  ok("y los dos toques llevan al mismo panel", uno.panel !== undefined && uno.panel === dos.panel, `${JSON.stringify(uno)} y ${JSON.stringify(dos)}`);

  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
  // `exit` y no `exitCode`: lo recién abierto se recuerda unos segundos con un
  // temporizador, y esperarlo aquí no prueba nada.
  (globalThis as unknown as { process: { exit: (n: number) => never } }).process.exit(fallos ? 1 : 0);
}

void main();
