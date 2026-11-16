// La copia de una terminal que se cerró mientras la montaba (`copiaSinEstrenar`, `lib/pty.ts`).
//
//   pnpm bancos copia-sin-estrenar
//
// Recién creada desde HEAD no lleva trabajo y se tira. Pero la cuarta revisión aparte
// (2026-11-16) vio que se tiraba también cuando otra terminal ya montaba esa MISMA copia
// (Ctrl+Z nada más cerrarla, que la reabre con el mismo espejo): se borraba el árbol
// debajo del agente nuevo, y su Aceptar decía después «ya no es una copia».

const llamadas: { cmd: string; args: Record<string, unknown> }[] = [];
const montadas = new Set<string>();
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
      llamadas.push({ cmd, args });
      if (cmd === "shadow_init") {
        const nombre = String(args.paneId);
        const nueva = !montadas.has(nombre);
        montadas.add(nombre);
        const worktreePath = `C:\\proyectos\\Demo\\.adeorq\\espejo\\${nombre}`;
        return nueva
          ? { nueva: "true", reutilizado: "false", baseBranch: "main", shadowBranch: `adeorq/shadow/${nombre}`, worktreePath }
          : { reutilizado: "true", baseBranch: "main", shadowBranch: `adeorq/shadow/${nombre}`, worktreePath };
      }
      return null;
    },
  },
};
import { copiaSinEstrenar, shadowInit } from "../src/lib/pty";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`MAL  ${titulo}\n     visto: ${JSON.stringify(visto)}`);
  } else console.log(`bien ${titulo}`);
}

const PROY = "C:\\proyectos\\Demo";
const tiradas = () => llamadas.filter((l) => l.cmd === "shadow_discard").map((l) => l.args.paneId);
const pausa = () => new Promise((r) => setTimeout(r, 0));

async function main() {
  // Sola: se cerró mientras montaba una copia nueva, que se tira.
  const sola = await shadowInit(PROY, "7-sola");
  copiaSinEstrenar(PROY, sola, "7-sola");
  await pausa();
  comprueba("la copia nueva de una terminal cerrada a medio montar se tira", tiradas().includes("7-sola"), tiradas());

  // Ctrl+Z enseguida: la reabierta pide la misma copia antes de que la vieja acabe.
  const vieja = shadowInit(PROY, "8-par");
  const nueva = shadowInit(PROY, "8-par");
  copiaSinEstrenar(PROY, await vieja, "8-par");
  await nueva;
  await pausa();
  comprueba("no se tira la copia que otra terminal ya está montando", !tiradas().includes("8-par"), tiradas());

  // Una reenganchada (no nueva) nunca se tira.
  const otra = await shadowInit(PROY, "8-par");
  copiaSinEstrenar(PROY, otra, "8-par");
  await pausa();
  comprueba("una copia reenganchada no se tira", !tiradas().includes("8-par"), tiradas());
}

void main()
  .catch((e) => comprueba("no revienta", false, String(e)))
  .then(() => {
    console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
    process.exit(fallos ? 1 : 0);
  });
