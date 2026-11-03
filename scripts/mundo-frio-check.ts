// Banco: con la caché fría, la foto no da por conectada una cuenta sin sesión.
//
//   pnpm bancos mundo-frio
//
// Revisión de la 0.9.239 (2026-11-03): `mirarMundo` iba cuenta a cuenta, y el
// `/usage` de la principal tarda unos cinco segundos. `open_pane` corta a los
// cuatro con lo que se sepa, y de una cuenta aún sin mirar `mundoEnCache` dice
// «conectada». Resultado medido: una cuenta añadida en Cuentas y sin iniciar
// sesión ganaba por «sin dato de gasto», y la delegada nacía en la pantalla de
// inicio de sesión con el encargo escrito encima.
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LECTURA_MS = 600;
const g = globalThis as unknown as Record<string, unknown>;
g.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: { configDir?: string | null } = {}) => {
      if (cmd === "detect_clis") {
        await espera(5);
        return [{ id: "claude", exe: "claude", path: "claude" }];
      }
      if (cmd === "account_ready") {
        await espera(5);
        return !args.configDir;
      }
      // Lo demás es la consulta lenta, la de la cuota.
      await espera(LECTURA_MS);
      return { note: "", plan: "", lines: [] };
    },
    transformCallback: () => 0,
  },
};

const mundo = require("../src/lib/mundo") as typeof import("../src/lib/mundo");

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

void (async () => {
  const cuentas = [
    { id: "main:claude", label: "Principal", dir: "", provider: "claude" },
    { id: "trabajo", label: "Trabajo", dir: "C:\\cuentas\\trabajo", provider: "claude" },
  ];
  const vivas = await mundo.fotoRapida(cuentas, 150);
  const de = (id: string) => vivas.find((v) => v.cuenta.id === id);
  comprueba("antes de que conteste la cuota ya se sabe que «Trabajo» no tiene sesión", de("trabajo")?.conectada === false, vivas);
  comprueba("y que la principal sí", de("main:claude")?.conectada === true, vivas);
  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
