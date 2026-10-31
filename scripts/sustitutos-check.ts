// Un emoji cortado por la mitad no deja la barra sin poder guardar.
//
//   pnpm bancos sustitutos
//
// Medido el 2026-10-31: el nombre de un grupo y el alias de un proyecto se
// cortan a 40 unidades de UTF-16 (`slice(0, 40)` en la barra), y el encargo de
// una sesión a 600. Si el corte cae en medio de un emoji queda medio carácter
// (un sustituto suelto), `JSON.stringify` lo escribe como `\ud83d`, y
// `serde_json` lo rechaza (`UnexpectedEndOfHexEscape`, en su `read.rs`). Como el
// nombre se queda en memoria, TODOS los guardados de la barra fallaban desde ese
// momento, y lo organizado no llegaba al disco hasta cambiar el nombre.
//
// Aquí se captura lo que de verdad sale hacia Rust y se valida como lo haría
// `serde_json`.

declare const process: { exit(codigo: number): never };

const enviados: { cmd: string; args: Record<string, unknown> }[] = [];
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      // Tauri lo serializa así antes de cruzar a Rust.
      enviados.push({ cmd, args: JSON.parse(JSON.stringify(args)) });
      return null;
    },
    transformCallback: () => 0,
  },
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveUiState, saveEncargo, EMPTY_UI_STATE } = require("../src/lib/pty") as typeof import("../src/lib/pty");

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

/** Lo que `serde_json` no acepta: un sustituto alto sin su pareja, o uno bajo
    sin el alto delante, ya sea escrito como `\uXXXX` o como carácter suelto. */
function loRechazariaSerde(json: string): boolean {
  const escapes = /\\u(d[89ab][0-9a-f]{2})(?!\\ud[c-f][0-9a-f]{2})|(?<!\\ud[89ab][0-9a-f]{2})\\u(d[c-f][0-9a-f]{2})/i;
  const crudos = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  return escapes.test(json) || crudos.test(json);
}

async function main() {
  const casi = "a".repeat(39);
  const cortado = `${casi}🚀 cohetes`.slice(0, 40); // lo que hace la barra hoy
  ok("el corte de la barra deja medio emoji (el caso que se mide)", loRechazariaSerde(JSON.stringify(cortado)));

  await saveUiState({
    ...EMPTY_UI_STATE,
    groups: [{ id: "g1", name: cortado, project: "C:\\proyectos\\Adeorq" } as never],
    projectAlias: { "C:\\proyectos\\Adeorq": cortado },
  });
  const contenido = String(enviados.find((e) => e.cmd === "save_ui_state")?.args.content ?? "");
  ok("lo que guarda la barra lo acepta serde_json", !loRechazariaSerde(contenido), contenido.match(/a{39}[^"]*/)?.[0]);
  ok("y el nombre conserva todo lo que sí era entero", contenido.includes(`"${casi}"`));

  const largo = `${"x".repeat(599)}👀 y sigue`;
  ok("el corte del encargo deja medio emoji (el caso que se mide)", loRechazariaSerde(JSON.stringify(largo.slice(0, 600))));
  await saveEncargo("sesion-1", { encargo: largo.slice(0, 600), cuando: "2026-10-31T00:00:00Z" } as never);
  const encargo = JSON.stringify(enviados.find((e) => e.cmd === "save_encargo")?.args ?? {});
  ok("el encargo de 600 que corta un emoji también llega entero", !loRechazariaSerde(encargo));

  const normal = "Grupo 🚀 bien";
  await saveUiState({ ...EMPTY_UI_STATE, groups: [{ id: "g2", name: normal, project: "x" } as never] });
  const otro = String(enviados.filter((e) => e.cmd === "save_ui_state").pop()?.args.content ?? "");
  ok("un emoji entero no se toca", JSON.parse(otro).groups[0].name === normal);

  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
