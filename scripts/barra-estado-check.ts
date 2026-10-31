// Que una cuadrilla y la barra no se pisen al guardar `adeorq-state.json`.
//
//   pnpm bancos barra-estado
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// `meterEnGrupoDeCuadrilla` (App.tsx) leía el archivo, le añadía el grupo y lo
// guardaba por su cuenta, mientras la barra guarda su copia ENTERA de memoria
// cada vez que tocas algo. Con las dos copias vivas, un arrastre hecho entre la
// lectura y el guardado de la cuadrilla (o justo después) perdía una de las dos
// cosas: los grupos de la cuadrilla, o lo que hiciste en la barra.
//
// Aquí hay un disco de mentira con la latencia de un comando de Tauri, una
// barra de mentira con su copia en memoria que guarda como la de verdad
// (`mutate`), y el camino VIEJO de la cuadrilla copiado tal cual para verlo
// fallar. El camino nuevo es `cambiarBarra`, de `lib/barraEstado.ts`.

declare const require: (m: string) => unknown;
declare const process: { exit(codigo: number): never };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** El disco: lo que hay en `adeorq-state.json`, con la tardanza de un comando. */
let disco = "{}";
const LATENCIA_MS = 15;
const g = globalThis as unknown as Record<string, unknown>;
g.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { content?: string } = {}) => {
      await espera(LATENCIA_MS);
      if (cmd === "load_ui_state") return disco;
      if (cmd === "save_ui_state") {
        disco = String(args.content);
        return null;
      }
      return null;
    },
    transformCallback: () => 0,
  },
};

const pty = require("../src/lib/pty") as typeof import("../src/lib/pty");
const { cambiarBarra, registrarBarra } = require("../src/lib/barraEstado") as typeof import("../src/lib/barraEstado");
type UiState = import("../src/lib/pty").UiState;

const GRUPO = { id: "cuad-1", project: "Vidorq", name: "Objetivo", color: "#fff" };

/** La barra: arranca leyendo el disco y, desde ahí, SU copia manda. */
async function barraMontada() {
  const barra = { ui: await pty.loadUiState() as UiState };
  const mutate = (fn: (p: UiState) => UiState) => {
    barra.ui = fn(barra.ui);
    void pty.saveUiState(barra.ui);
  };
  const baja = registrarBarra(mutate);
  return { barra, mutate, baja };
}

/** El camino de antes, copiado de App.tsx. */
let cadenaVieja: Promise<unknown> = Promise.resolve();
function cuadrillaVieja(sid: string) {
  cadenaVieja = cadenaVieja
    .then(() => pty.loadUiState())
    .then((ui) => pty.saveUiState({ ...ui, groups: [...ui.groups, GRUPO], sessionGroup: { ...ui.sessionGroup, [sid]: GRUPO.id } }));
  return cadenaVieja;
}
const cuadrillaNueva = (sid: string) =>
  cambiarBarra((ui) => ({
    ...ui,
    groups: ui.groups.some((x) => x.id === GRUPO.id) ? ui.groups : [...ui.groups, GRUPO],
    sessionGroup: { ...ui.sessionGroup, [sid]: GRUPO.id },
  }));

const leerDisco = () => JSON.parse(disco) as UiState;

async function main() {
  // 1. El control: el camino viejo, con la misma jugada, SÍ pierde una de las dos
  //    cosas. Si un día no la pierde, este banco ya no demuestra nada.
  disco = "{}";
  {
    const { mutate, baja } = await barraMontada();
    baja(); // el camino viejo no sabe de la barra
    const c = cuadrillaVieja("s-nueva");
    await espera(LATENCIA_MS + 5); // la cuadrilla ya leyó; aún no guardó
    mutate((p) => ({ ...p, archived: [...p.archived, "s-vieja"] }));
    await c;
    await espera(LATENCIA_MS * 3);
    const d = leerDisco();
    ok(
      "control: el camino de antes pierde el grupo o lo archivado",
      !(d.groups?.some((x) => x.id === GRUPO.id) && d.archived?.includes("s-vieja")),
      `grupos: ${JSON.stringify(d.groups?.map((x) => x.id))}, archivadas: ${JSON.stringify(d.archived)} (el último que guarda pisa al otro)`,
    );
  }

  // 2. El camino nuevo con la barra montada: el cambio pasa por su mutate.
  disco = "{}";
  {
    const { barra, mutate, baja } = await barraMontada();
    const c = cuadrillaNueva("s-nueva");
    mutate((p) => ({ ...p, archived: [...p.archived, "s-vieja"] }));
    await c;
    await espera(LATENCIA_MS * 4);
    const d = leerDisco();
    ok("con la barra montada: el grupo está en el disco", !!d.groups?.some((x) => x.id === GRUPO.id), JSON.stringify(d.groups));
    ok("y lo archivado también", !!d.archived?.includes("s-vieja"), JSON.stringify(d.archived));
    ok("y la sesión está en su grupo", d.sessionGroup?.["s-nueva"] === GRUPO.id);
    ok("y la copia de la barra tiene los dos", barra.ui.groups.length === 1 && barra.ui.archived.length === 1);
    baja();
  }

  // 3. Sin barra montada: dos cambios seguidos se guardan los dos, en fila.
  disco = "{}";
  {
    const a = cambiarBarra((ui) => ({ ...ui, archived: [...ui.archived, "uno"] }));
    const b = cambiarBarra((ui) => ({ ...ui, archived: [...ui.archived, "dos"] }));
    await Promise.all([a, b]);
    const d = leerDisco();
    ok("sin barra: los dos cambios seguidos se guardan", d.archived?.length === 2, JSON.stringify(d.archived));
  }

  // 4. Una barra que se desmonta deja de ser la dueña.
  disco = "{}";
  {
    const { barra, baja } = await barraMontada();
    baja();
    await cambiarBarra((ui) => ({ ...ui, archived: [...ui.archived, "tras-desmontar"] }));
    ok("desmontada, ya no recibe cambios", barra.ui.archived.length === 0);
    ok("y el cambio llega al disco", leerDisco().archived?.includes("tras-desmontar") === true);
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
