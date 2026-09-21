// ¿Cómo nacería este panel si ahora mismo tuviera que rehacerse?
//
// Una terminal renace cuando sale a su propia ventana, cuando vuelve de ella y
// cuando el resguardo rescata un panel caído. En los tres casos se rehace con el
// HISTORIAL que Rust guarda de ese panel, así que lo que ese historial deje en
// una xterm recién nacida es exactamente lo que verá Munir. Este guion hace eso
// mismo sin tocar nada: pide el historial al Adeorq en marcha (su MCP, puerto
// 3012), lo escribe en una xterm de verdad sin ventana y cuenta en qué estado
// queda, al lado de lo que el programa del panel está usando de verdad.
//
//   node scripts/laboratorio/renacer-panel.mjs            (todos los paneles)
//   node scripts/laboratorio/renacer-panel.mjs 5          (uno)
//   node scripts/laboratorio/renacer-panel.mjs 5 --guardar <fichero>
//        (y además guarda su historial, para el banco `renacer_con_fotogramas_reales`
//        de `pty.rs`; es texto de una conversación suya: al scratchpad, nunca al repo)
//   node scripts/laboratorio/renacer-panel.mjs --fichero <historial> <cols> <filas>
//        (juzga un historial guardado en vez de pedirlo a la app)
//
// El fallo que destapó (2026-09-21, «no se puede hacer scroll bien», con la
// píldora de «En pausa» encima de un Claude Code en pantalla completa): Claude
// Code dice `ESC[?1049h` una sola vez, al arrancar, y el historial son los
// últimos cien mil caracteres. A los pocos minutos esa orden ya se ha caído por
// delante, y el panel renacía en la pantalla normal con el programa dibujando la
// otra. Si este guion dice «normal» en un panel cuyo `Pantalla:` es
// «alternativa», ese panel renacería roto.

import net from "node:net";
import { createRequire } from "node:module";

// xterm da por hecho un navegador; con esto arranca en Node sin uno.
globalThis.self = globalThis;
globalThis.window = globalThis;
const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/xterm/lib/xterm.js");

/** Una pregunta al MCP de la app en marcha, y su texto de vuelta. */
function preguntar(nombre, argumentos) {
  return new Promise((resolver, fallar) => {
    const s = net.connect(3012, "127.0.0.1");
    let buf = "";
    s.on("error", fallar);
    s.on("data", (d) => {
      buf += d.toString("utf8");
      const fin = buf.indexOf("\n");
      if (fin < 0) return;
      s.end();
      const r = JSON.parse(buf.slice(0, fin));
      resolver(r.result?.content?.[0]?.text ?? "");
    });
    s.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: nombre, arguments: argumentos },
      }) + "\n",
    );
  });
}

/** Escribe el historial en una xterm recién nacida, como hace un panel al renacer. */
async function renacer(historial, cols, rows) {
  const t = new Terminal({ cols, rows, scrollback: 8000, allowProposedApi: true });
  await new Promise((r) => t.write(historial, r));
  const estado = {
    pantalla: t.buffer.active.type === "alternate" ? "alternativa" : "normal",
    detalle:
      `ratón ${t.modes.mouseTrackingMode} · pegado entre corchetes ${t.modes.bracketedPasteMode ? "sí" : "no"}` +
      ` · foco ${t.modes.sendFocusMode ? "sí" : "no"} · ${historial.length} caracteres`,
  };
  t.dispose();
  return estado;
}

const args = process.argv.slice(2);
if (args[0] === "--fichero") {
  const [, fichero, cols, rows] = args;
  const { readFileSync } = await import("node:fs");
  const e = await renacer(readFileSync(fichero, "utf8"), Number(cols ?? 80), Number(rows ?? 24));
  console.log(`${fichero}: renacería en ${e.pantalla} · ${e.detalle}`);
  process.exit(0);
}

const paneles = await preguntar("get_active_panes", {});
const pedidos = args[0] && !args[0].startsWith("--") ? [Number(args[0])] : null;
const guardar = args.includes("--guardar") ? args[args.indexOf("--guardar") + 1] : null;

for (const linea of paneles.split("\n")) {
  const m = /^ID: (\d+), .*?Size: (\d+)x(\d+), Pantalla: (\w+)/.exec(linea);
  if (!m) continue;
  const [, id, cols, rows, pantalla] = m;
  if (pedidos && !pedidos.includes(Number(id))) continue;
  // El historial entero: con un tope más corto que él, el MCP da la cola y se
  // perdería justo el principio, que es donde se decide todo.
  const historial = await preguntar("read_pane_transcript", { paneId: Number(id), limit: 1_000_000 });
  if (guardar) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(guardar, historial, "utf8");
  }
  const e = await renacer(historial, Number(cols), Number(rows));
  const roto = e.pantalla !== pantalla;
  console.log(
    `${roto ? "ROTO " : "bien "} panel ${id}: el programa va en ${pantalla}, renacería en ${e.pantalla} · ${e.detalle}`,
  );
}
