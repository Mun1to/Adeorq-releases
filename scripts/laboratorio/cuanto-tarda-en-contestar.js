// CUÁNTO tarda la terminal de Adeorq en contestar «quién eres».
//
// Que conteste ya está comprobado; lo que decide el scroll es si contesta a
// tiempo. Claude Code arma su manejador de rueda al arrancar: si para entonces
// no sabe que habla con xterm.js, usa la curva de aceleración de Windows y un
// giro de rueda se lleva 109 renglones en vez de 6 (medido en ConPTY).
//
// El camino de la respuesta en Adeorq es largo: PTY → Rust → evento de Tauri →
// React → xterm (que parsea en un `setTimeout`) → `onData` → `invoke` → Rust →
// PTY. Aquí se cronometra ese viaje, varias veces, como lo vería el programa.
//
//   node scripts/laboratorio/cuanto-tarda-en-contestar.js <fichero de salida> [rondas]

const fs = require("fs");
const destino = process.argv[2];
const rondas = Number(process.argv[3] || 5);

if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);

let recogido = "";
let esperando = null;
const tiempos = [];

process.stdin.on("data", (d) => {
  recogido += d.toString("latin1");
  if (esperando && /\x1bP>\|[^\x1b]*\x1b\\/.test(recogido)) {
    tiempos.push(Number(process.hrtime.bigint() - esperando) / 1e6);
    esperando = null;
  }
});

function preguntar(n) {
  if (n >= rondas) return terminar();
  recogido = "";
  esperando = process.hrtime.bigint();
  process.stdout.write("\x1b[>0q");
  setTimeout(() => {
    if (esperando) {
      tiempos.push(-1); // no contestó en el plazo
      esperando = null;
    }
    preguntar(n + 1);
  }, 1200);
}

function terminar() {
  const buenos = tiempos.filter((t) => t >= 0);
  const informe = [
    `rondas: ${tiempos.length}, contestadas: ${buenos.length}`,
    `tiempos (ms): ${tiempos.map((t) => (t < 0 ? "sin respuesta" : t.toFixed(1))).join(", ")}`,
    buenos.length
      ? `peor: ${Math.max(...buenos).toFixed(1)} ms · mejor: ${Math.min(...buenos).toFixed(1)} ms`
      : "ninguna respuesta",
  ].join("\n");
  fs.writeFileSync(destino, informe, "utf8");
  console.log(informe);
  process.exit(0);
}

preguntar(0);
