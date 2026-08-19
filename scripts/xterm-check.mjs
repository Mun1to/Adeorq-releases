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

// ── EL CICLO DE VERDAD DE CLAUDE CODE ──────────────────────────────────────
//
// Lo de arriba prueba el `ESC[3J` suelto, que es el fallo que arregló la
// beta.302. Esto es otra cosa y es la TERCERA causa del mismo síntoma (Munir,
// 2026-08-19, séptimo reporte): Claude Code no escribe al final, en cada turno
// borra la pantalla Y el scrollback y REPINTA la conversación entera. Lo
// confirman los mantenedores de xterm en el issue #5620, y ahí mismo dicen que
// no lo consideran cosa suya («misusage by the app»), así que si no se resuelve
// en Adeorq no se resuelve.
//
// Aquí se comprueba contra el búfer de verdad. La regla se replica en una línea
// en vez de importarla, porque este archivo es `.mjs` y `scrollTerm.ts` es
// TypeScript: quien comprueba la función de verdad es `scripts/scroll-check.ts`,
// y lo que se prueba AQUÍ es que xterm se comporta como esa regla supone.
{
  const volver = (lejos, baseY) => (lejos <= 0 ? null : Math.max(0, baseY - lejos));
  const ciclo = (dentro) => "\x1b[?2026h\x1b[H\x1b[2J\x1b[3J" + dentro + "\x1b[?2026l";

  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "conversacion"));
  await vaciar(t);

  t.scrollLines(-8);
  await vaciar(t);
  const b0 = t.buffer.active;
  const lejos = b0.baseY - b0.viewportY;
  ok("subir deja la vista lejos del final", lejos > 0, `a ${lejos} renglones`);

  t.write(ciclo(lineas(600, "conversacion") + lineas(40, "respuesta nueva")));
  await vaciar(t);

  ok(
    "sin restaurar, el ciclo te pega al final (es el fallo)",
    t.buffer.active.viewportY === t.buffer.active.baseY,
    `viewportY=${t.buffer.active.viewportY} baseY=${t.buffer.active.baseY}`,
  );

  const destino = volver(lejos, t.buffer.active.baseY);
  if (destino !== null) t.scrollToLine(destino);
  await vaciar(t);
  const b1 = t.buffer.active;
  ok(
    "restaurando, vuelves a la misma distancia del final",
    b1.baseY - b1.viewportY === lejos,
    `a ${b1.baseY - b1.viewportY} renglones, esperaba ${lejos}`,
  );
  ok("y no acabas en el principio de todo", b1.viewportY > 100, `viewportY=${b1.viewportY}`);
  t.dispose();
}

// ── Y estando al final, NO se toca nada ────────────────────────────────────
// Quien mira trabajar a un agente quiere el final. Restaurar ahí sería moverle
// sin motivo, que es el fallo contrario y molesta igual.
{
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "conversacion"));
  await vaciar(t);
  ok("estando al final, la distancia es cero",
     t.buffer.active.baseY - t.buffer.active.viewportY === 0);

  t.write("\x1b[?2026h\x1b[H\x1b[2J\x1b[3J" + lineas(640, "todo otra vez") + "\x1b[?2026l");
  await vaciar(t);
  const b1 = t.buffer.active;
  ok("y tras el ciclo sigues al final", b1.viewportY === b1.baseY);
  t.dispose();
}


// ── Y EL CASO QUE SE ESCAPÓ: el repintado llega A TROZOS ───────────────────
//
// Un PTY no entrega 600 líneas de una vez. La primera versión del arreglo
// colocaba la vista en el callback del `write`, que corre en CADA pedazo, así
// que restauraba contra un `baseY` todavía a medio crecer: medido, tras el
// primer trozo `baseY` valía 110 y la vista quedaba en 102, y cuando terminaba
// de llegar todo `baseY` era 617 — o sea a 515 renglones del final en vez de a
// los 8 en los que estabas. Munir lo reportó otra vez el mismo día, y tenía
// razón: era un fallo del arreglo.
//
// La regla nueva es esperar a que DEJE de llegar. Aquí se comprueba contra el
// búfer de verdad, con el repintado partido en cinco como lo parte un PTY.
{
  const volver = (lejos, baseY) => (lejos <= 0 ? null : Math.max(0, baseY - lejos));
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "conversacion"));
  await vaciar(t);
  t.scrollLines(-8);
  await vaciar(t);
  const lejos = t.buffer.active.baseY - t.buffer.active.viewportY;

  const repintado = lineas(600, "conversacion") + lineas(40, "respuesta nueva");
  const tam = Math.ceil(repintado.length / 5);
  const trozos = [];
  for (let i = 0; i < repintado.length; i += tam) trozos.push(repintado.slice(i, i + tam));

  // Lo que hacía la primera versión: colocar en el primer trozo.
  t.write("\x1b[?2026h\x1b[H\x1b[2J\x1b[3J" + trozos[0]);
  await vaciar(t);
  const enSeco = volver(lejos, t.buffer.active.baseY);
  ok(
    "(control) colocar en el primer trozo se queda corto",
    enSeco !== null && enSeco < 200,
    `habria colocado en ${enSeco}, con baseY=${t.buffer.active.baseY} a medio crecer`,
  );

  for (let i = 1; i < trozos.length; i++) { t.write(trozos[i]); await vaciar(t); }
  t.write("\x1b[?2026l");
  await vaciar(t);

  // Y lo que hace ahora: colocar cuando el búfer ya está quieto.
  const destino = volver(lejos, t.buffer.active.baseY);
  if (destino !== null) t.scrollToLine(destino);
  await vaciar(t);
  const b = t.buffer.active;
  ok(
    "esperando a que deje de llegar, vuelves a los mismos renglones",
    b.baseY - b.viewportY === lejos,
    `a ${b.baseY - b.viewportY}, esperaba ${lejos}`,
  );
  ok("y no acabas quinientas lineas mas arriba", b.viewportY > 500, `viewportY=${b.viewportY}`);
  t.dispose();
}


const volver = (lejos, baseY) => (lejos <= 0 ? null : Math.max(0, baseY - lejos));

// -- LA RUEDA EN MITAD DEL REPINTADO, que es el noveno reporte --------------
//
// Munir, 2026-08-19, con la 0.9.123 puesta y el arreglo anterior dentro: «sigue
// el salto cuando haces solo un pequeno scroll para arriba». Y era verdad.
//
// Aqui nadie se equivoca: xterm respeta que hayas scrolleado y no te arrastra.
// Lo que pasa es que tu sitio se guarda como NUMERO DE LINEA, y ese numero se
// referia a un bufer de 87 renglones que medio segundo despues tiene 617. Se
// mide abajo: subes tres y acabas a 533 del final.
//
// El arreglo anterior no lo tapaba porque apunta la distancia en el momento del
// borrado, y en ese momento estabas al final: distancia cero, nada que
// restaurar. Tu gesto llega despues, cuando ya no lo mira nadie.
{
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "conversacion"));
  await vaciar(t);
  ok("empiezas al final, mirando trabajar al agente",
     t.buffer.active.viewportY === t.buffer.active.baseY);

  const repintado = lineas(600, "conversacion") + lineas(40, "respuesta nueva");
  const tam = Math.ceil(repintado.length / 6);
  const trozos = [];
  for (let i = 0; i < repintado.length; i += tam) trozos.push(repintado.slice(i, i + tam));

  // La regla de la casa, replicada: se apunta SIEMPRE (el cero incluido) y la
  // rueda suma su gesto a esa distancia mientras el repintado esta en vuelo.
  let pendiente = null;
  t.write("[?2026h[H[2J[3J");
  pendiente = Math.max(0, t.buffer.active.baseY - t.buffer.active.viewportY);
  await vaciar(t);
  t.write(trozos[0]);
  await vaciar(t);

  const antesDeRodar = t.buffer.active.viewportY;
  t.scrollLines(-3); // el pequeno scroll de Munir, con el repintado a medias
  await vaciar(t);
  const movido = antesDeRodar - t.buffer.active.viewportY;
  ok("subir tres con el repintado a medias mueve tres", movido === 3, `movio ${movido}`);
  pendiente = Math.max(0, pendiente + movido);

  for (let i = 1; i < trozos.length; i++) { t.write(trozos[i]); await vaciar(t); }
  t.write("[?2026l");
  await vaciar(t);

  const solo = t.buffer.active;
  ok(
    "(control) sin hacer nada te quedas medio historial arriba",
    solo.baseY - solo.viewportY > 400,
    `a ${solo.baseY - solo.viewportY} renglones del final, con baseY=${solo.baseY}`,
  );

  const destino = volver(pendiente, t.buffer.active.baseY);
  if (destino !== null) t.scrollToLine(destino);
  await vaciar(t);
  const b = t.buffer.active;
  ok(
    "sumando el gesto a la distancia, acabas donde pediste",
    b.baseY - b.viewportY === 3,
    `a ${b.baseY - b.viewportY} renglones del final, esperaba 3`,
  );
  t.dispose();
}

// -- Y bajar tambien cuenta: la rueda al reves acerca al final ---------------
//
// El primer intento de este caso subia ANTES del borrado y bajaba despues, y
// salia rojo por culpa de la prueba y no del codigo: tras el borrado el bufer
// mide cero, xterm te lleva al final con el primer trozo y desde el final ya no
// se puede bajar, asi que el gesto movia cero renglones. Los dos gestos tienen
// que darse con el repintado en vuelo, que es de lo que va la regla.
{
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  t.write(lineas(600, "conversacion"));
  await vaciar(t);

  let pendiente = null;
  t.write("[?2026h[H[2J[3J");
  pendiente = Math.max(0, t.buffer.active.baseY - t.buffer.active.viewportY);
  await vaciar(t);
  t.write(lineas(300, "conversacion"));
  await vaciar(t);

  let antes = t.buffer.active.viewportY;
  t.scrollLines(-20);
  await vaciar(t);
  pendiente = Math.max(0, pendiente + (antes - t.buffer.active.viewportY));
  ok("sube veinte con el repintado a medias", pendiente === 20, `apunto ${pendiente}`);

  antes = t.buffer.active.viewportY;
  t.scrollLines(12); // se le fue la mano y baja doce
  await vaciar(t);
  pendiente = Math.max(0, pendiente + (antes - t.buffer.active.viewportY));

  t.write(lineas(340, "conversacion") + "[?2026l");
  await vaciar(t);
  const destino = volver(pendiente, t.buffer.active.baseY);
  if (destino !== null) t.scrollToLine(destino);
  await vaciar(t);
  const b = t.buffer.active;
  ok(
    "veinte arriba menos doce abajo son ocho",
    b.baseY - b.viewportY === 8,
    `a ${b.baseY - b.viewportY}, esperaba 8`,
  );
  t.dispose();
}

// -- EL CIERRE DEL REPINTADO LO DICE EL PROPIO CLI --------------------------
//
// Claude Code envuelve cada repintado en el modo de salida sincronizada: abre
// con ESC[?2026h y cierra con ESC[?2026l. Comprobado en su binario el
// 2026-08-19 (las dos secuencias estan dentro, literales, en el offset
// 7.105.841 y el 7.108.380 de claude.exe).
//
// Vale mas que el reloj de 120 ms: es una senal del programa y no una
// suposicion nuestra, y sobre todo cubre el caso que el reloj no cubria.
// Mientras el agente trabaja, los repintados se encadenan sin dejar 120 ms de
// silencio, asi que la vista no se colocaba NUNCA hasta que el agente callaba.
//
// Lo que se comprueba aqui es lo unico que hace falta para poder fiarse: que
// cuando el cierre llega, el bufer ya esta ENTERO.
{
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  let alCerrar = null;
  let vistos = 0;
  t.parser.registerCsiHandler({ prefix: "?", final: "l" }, (p) => {
    if (p.includes(2026)) { vistos++; alCerrar = t.buffer.active.baseY; }
    return false;
  });

  t.write(lineas(600, "conversacion"));
  await vaciar(t);
  t.scrollLines(-8);
  await vaciar(t);

  const repintado = "[?2026h[H[2J[3J" + lineas(600, "conversacion") +
    lineas(40, "respuesta nueva") + "[?2026l";
  const tam = Math.ceil(repintado.length / 7);
  for (let i = 0; i < repintado.length; i += tam) {
    t.write(repintado.slice(i, i + tam));
    await vaciar(t);
  }

  ok("el cierre del bloque sincronizado llega", vistos === 1, `llego ${vistos} vez/veces`);
  ok(
    "y cuando llega, el bufer ya esta entero",
    alCerrar === t.buffer.active.baseY,
    `al cerrar baseY=${alCerrar}, al final baseY=${t.buffer.active.baseY}`,
  );
  t.dispose();
}

// -- Y dos repintados seguidos, sin silencio entre ellos --------------------
// El caso que el reloj no veia: el agente sigue trabajando y encadena ciclos.
{
  const t = new Terminal({ cols: 100, rows: 24, scrollback: 8000, allowProposedApi: true });
  let cierres = 0;
  t.parser.registerCsiHandler({ prefix: "?", final: "l" }, (p) => {
    if (p.includes(2026)) cierres++;
    return false;
  });
  t.write(lineas(400, "conversacion"));
  await vaciar(t);
  const ciclo = (n) => "[?2026h[H[2J[3J" + lineas(n, "conversacion") + "[?2026l";
  t.write(ciclo(420) + ciclo(440) + ciclo(460));
  await vaciar(t);
  ok("tres ciclos encadenados dan tres cierres", cierres === 3, `dieron ${cierres}`);
  t.dispose();
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
