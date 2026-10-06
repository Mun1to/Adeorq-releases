// Pinta un volcado de bytes de una terminal en una xterm sin ventana y enseña
// la PANTALLA final, fila a fila: lo mismo que ve `read_pane_screen` del MCP y
// lo que mira `se_quedo_en_la_caja` (mcp.rs) tras un `send_command`.
//
//   node scripts/laboratorio/pantalla-de-bytes.mjs <volcado.bin> [cols] [rows]
//
// Los volcados los deja el banco `cargo test --lib intro_en_claude -- --ignored
// --nocapture` en la carpeta temporal (adeorq-intro-atascado.bin y
// adeorq-intro-enviado.bin), a 120x36.

import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/xterm/lib/xterm.js");

const [ruta, cols = "120", rows = "36"] = process.argv.slice(2);
if (!ruta) {
  console.error("Dime el volcado: node scripts/laboratorio/pantalla-de-bytes.mjs <volcado.bin> [cols] [rows]");
  process.exit(1);
}
const term = new Terminal({ cols: Number(cols), rows: Number(rows), allowProposedApi: true, scrollback: 2000 });
term.write(fs.readFileSync(ruta), () => {
  const buf = term.buffer.active;
  const filas = [];
  for (let y = 0; y < term.rows; y++) {
    const linea = buf.getLine(buf.baseY + y);
    filas.push(linea ? linea.translateToString(true).trimEnd() : "");
  }
  while (filas.length && !filas[filas.length - 1]) filas.pop();
  console.log(`pantalla ${buf.type} (${term.cols}x${term.rows}), ${filas.length} filas con algo:`);
  filas.forEach((f, i) => console.log(String(i + 1).padStart(3), "|", f));
});
