// Con qué vuelve la dueña Gemini de una copia aparte ya cerrada (`lib/lanzar.ts`).
//
//   pnpm bancos retomar-copia-cerrada
//
// `gemini --resume <id>` solo encuentra una sesión desde la carpeta en que nació, y la
// dueña de una copia aceptada o tirada renace en tu carpeta: arranca uno nuevo. La cuarta
// revisión aparte (2026-11-16) vio dos huecos: ese nuevo nacía sin `--session-id` ni su
// `-m` (así que nunca más se podía retomar), y Reanimar no pasaba por ahí y seguía
// pidiendo `--resume` en tu carpeta. Codex encuentra la suya por el id desde cualquier
// sitio, así que sigue retomando.

const armario = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => armario.get(k) ?? null,
  setItem: (k: string, v: string) => void armario.set(k, v),
  removeItem: (k: string) => void armario.delete(k),
  clear: () => armario.clear(),
  key: () => null,
  length: 0,
} as Storage;
import { comandoAlReanimar, resumeCommandFor } from "../src/lib/lanzar";
import { copiaCerrada } from "../src/lib/copiaAparte";
import { sessionIdOf, shellCommand } from "../src/lib/comandos";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`MAL  ${titulo}\n     visto: ${JSON.stringify(visto)}`);
  } else console.log(`bien ${titulo}`);
}

const ID = "1b4e28ba-2fa1-4d2a-883f-0016d3cca427";
const PROY = "C:\\proyectos\\Demo";
const CERRADA = "7-1700000700";
const ABIERTA = "8-1700000800";
copiaCerrada(`${PROY}\\.adeorq\\espejo\\${CERRADA}`);
const gemini = shellCommand(`gemini --approval-mode auto_edit -m pro --session-id ${ID}`);

function nuevoBien(titulo: string, cmd: string[] | undefined) {
  const linea = cmd?.join(" ") ?? "";
  const id = sessionIdOf(linea);
  comprueba(`${titulo}: no pide --resume`, !/--resume/.test(linea), linea);
  comprueba(`${titulo}: lleva su modelo`, /\s-m pro\b/.test(linea), linea);
  comprueba(`${titulo}: lleva un id nuevo para poder retomarlo luego`, !!id && id !== ID && /--session-id/.test(linea), linea);
}

async function main() {
  nuevoBien("al retomar el tablero", await resumeCommandFor({ command: gemini, cwd: PROY, espejo: CERRADA }));
  nuevoBien("al Reanimar", comandoAlReanimar("gemini", ID, { espejo: CERRADA, command: gemini }));
  const abierta = comandoAlReanimar("gemini", ID, { espejo: ABIERTA, command: gemini }).join(" ");
  comprueba("con la copia abierta, Reanimar retoma la misma", abierta.includes(`gemini --resume ${ID}`), abierta);
  const sinCopia = comandoAlReanimar("gemini", ID).join(" ");
  comprueba("sin copia, Reanimar retoma la misma", sinCopia.includes(`gemini --resume ${ID}`), sinCopia);
  const codex = comandoAlReanimar("codex", ID, { espejo: CERRADA, command: shellCommand(`codex resume ${ID}`) }).join(" ");
  comprueba("un Codex de copia cerrada retoma por su id", codex.includes(`codex resume ${ID}`), codex);
}

void main()
  .catch((e) => comprueba("no revienta", false, String(e)))
  .then(() => {
    console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
    process.exit(fallos ? 1 : 0);
  });
