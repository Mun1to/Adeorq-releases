// Que la versión de xterm que hay puesta no traiga de vuelta el salto del
// scroll.  `pnpm xterm`
//
// EL FALLO, contado una vez para no volver a diagnosticarlo (sexto reporte de
// Munir, 2026-08-18): «escrolleas una vez para arriba en una terminal que ya ha
// terminado de responder y se te va media conversación».  No era nuestro
// código.  Claude Code (y Codex, y copilot-cli) borran el scrollback con
// `ESC[3J` en cada repintado, y hasta la beta.302 ese borrado recortaba
// `ybase`/`ydisp` pero se dejaba puesta la bandera `isUserScrolling`.  Con esa
// bandera puesta, `BufferService.scroll()` se niega a mover la vista, así que
// el viewport se quedaba clavado en la línea 0 mientras el agente seguía
// escribiendo: desde el sillón, un salto de miles de líneas hacia arriba.
// Issue xtermjs/xterm.js#6046, arreglado por el PR #6081 (10 ago 2026), que
// entró en la 6.1.0-beta.302.  La 298 que llevábamos NO lo tenía.
//
// Se comprueba aquí y no en `scroll-check.ts` a propósito: aquello prueba
// NUESTRA lógica (`src/lib/scrollTerm.ts`) y esto prueba la LIBRERÍA, que es de
// donde vino el fallo las últimas cuatro veces.  Un `pnpm update` que baje de
// beta lo saca en un segundo.
//
// No hace falta navegador: el fallo vive en el búfer, no en la pantalla.

import { createRequire } from "node:module";

// xterm da por hecho un navegador; con esto arranca en Node sin uno.
globalThis.self = globalThis;
globalThis.window = globalThis;

const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/xterm/lib/xterm.js");

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok   " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
};

const vaciar = (t) => new Promise((r) => t.write("", r));
const lineas = (n, texto) => {
  let s = "";
  for (let i = 1; i <= n; i++) s += `${texto} ${i}\r\n`;
  return s;
};

// ── El caso de Munir, paso por paso ─────────────────────────────────────────
{
  const t = new Terminal({ cols: 80, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(1200, "turno"));
  await vaciar(t);
  const b = t.buffer.active;
  ok("una conversación larga deja la vista al final", b.viewportY === b.baseY);

  t.scrollLines(-2); // sube dos líneas a leer
  ok("subir dos líneas mueve la vista y solo dos", b.viewportY === b.baseY - 2);

  t.write("\x1b[3J"); // el CLI borra el scrollback en su repintado
  await vaciar(t);
  t.write(lineas(60, "el agente sigue escribiendo"));
  await vaciar(t);
  ok(
    "tras el ESC[3J la vista vuelve a seguir el final",
    b.viewportY === b.baseY,
    `viewportY=${b.viewportY} baseY=${b.baseY}`,
  );

  t.scrollLines(-3);
  ok("y la rueda sigue moviendo lo justo", b.viewportY === b.baseY - 3);
  t.scrollToBottom();
  ok("y se puede volver al final", b.viewportY === b.baseY);
  t.dispose();
}

// ── Lo que el arreglo NO debe romper: el búfer alterno ──────────────────────
// `isUserScrolling` es del búfer normal.  Un ED3 lanzado desde una pantalla
// alterna (vim, htop) no puede tocarlo, o al salir perderías dónde estabas.
{
  const t = new Terminal({ cols: 80, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "linea"));
  await vaciar(t);
  const antes = t.buffer.active.viewportY;
  t.scrollLines(-5);
  const mirando = t.buffer.active.viewportY;
  t.write("\x1b[?1049h"); // entra en la pantalla alterna
  t.write("\x1b[3J");
  await vaciar(t);
  t.write("\x1b[?1049l"); // y vuelve
  await vaciar(t);
  ok(
    "un ED3 en la pantalla alterna no te mueve la vista de la normal",
    t.buffer.active.viewportY === mirando,
    `esperaba ${mirando}, salió ${t.buffer.active.viewportY} (empezó en ${antes})`,
  );
  t.dispose();
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
