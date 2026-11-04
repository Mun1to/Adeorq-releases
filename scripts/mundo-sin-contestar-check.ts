// Banco: una orden de Rust que no contesta nunca no deja a quien mira el mundo
// esperando sin fin.
//
//   pnpm bancos mundo-sin-contestar
//
// Bandeja de la Agenda, 2026-10-13: una orden de Rust que se cae a medias (un
// pánico) no contesta ni bien ni mal, y un `catch` no la ve. Eso pasó con las
// reglas del router y se arregló ESE sitio (`reglasDeLaMemoria`, con reloj).
// `mirarMundo` lo esperan sin reloj el Capataz (dos veces) y el Reparto, a la
// vez que la llamada al modelo: si una de las consultas de dentro no contestaba,
// se quedaban en «Repartiendo…» sin fin. Ahora `mirarMundo` corta a su espera y
// sigue con lo último que se sabía (`mundoEnCache`).
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// `account_ready` y `detect_clis` contestan; la consulta de la cuota (todo lo
// demás) no contesta jamás, como una orden que entró en pánico.
const g = globalThis as unknown as Record<string, unknown>;
g.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string) => {
      if (cmd === "detect_clis") return [{ id: "claude", exe: "claude", path: "claude" }];
      if (cmd === "account_ready") return true;
      return new Promise(() => {});
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

// Sin esto, una promesa colgada que no deja ningún temporizador vivo hace que
// Node SALGA con 0 en mitad del banco: un verde falso (medido: quitando el reloj
// de `mirarMundo`, el banco acababa en 0,1 s y en verde). Así se cuelga, y se nota.
const vigilante = setTimeout(() => {
  console.log("FALLA  se quedó esperando a una orden que no contesta: el reloj no cortó");
  process.exit(1);
}, 8000);

void (async () => {
  const cuentas = [{ id: "main:claude", label: "Principal", dir: "", provider: "claude" }];

  // 1. El reloj de verdad: contesta con lo que se sabía, y a tiempo.
  const t0 = Date.now();
  const vivas = await mundo.mirarMundo(cuentas, 250);
  const tardo = Date.now() - t0;
  comprueba("con la cuota sin contestar, `mirarMundo` contesta a su espera y no se queda esperando", tardo >= 200 && tardo < 2000, tardo);
  comprueba("y trae la cuenta, con lo último que se sabía de ella", vivas.length === 1 && vivas[0].cuenta.id === "main:claude", vivas);

  // 2. El reloj no se come los fallos: sale ya, sin esperar a los treinta segundos.
  const t1 = Date.now();
  let fallo: unknown = null;
  try {
    await mundo.conReloj(Promise.reject(new Error("se cayó")), 5000);
  } catch (e) {
    fallo = e;
  }
  comprueba("un fallo sale en el acto (no espera a que acabe el reloj) y se puede atrapar", fallo instanceof Error && Date.now() - t1 < 1000, { fallo: String(fallo), ms: Date.now() - t1 });

  // 3. Lo que sí contesta a tiempo no se pierde, y el reloj no queda vivo.
  const bien = await mundo.conReloj(espera(20).then(() => "listo"), 5000);
  comprueba("lo que contesta a tiempo llega tal cual", bien === "listo", bien);
  const nunca = await mundo.conReloj(new Promise<string>(() => {}), 80);
  comprueba("lo que no contesta da null", nunca === null, nunca);

  clearTimeout(vigilante);
  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
