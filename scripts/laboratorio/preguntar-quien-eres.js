// ¿Contesta la terminal de Adeorq cuando un programa le pregunta quién es?
//
// De esa respuesta depende cuánto desplaza Claude Code por cada golpe de rueda:
// medido en ConPTY con un giro de 20 eventos, 6 renglones si reconoce a xterm.js
// y 109 si no (`cargo test --lib rueda_en_fullscreen`). Este guion hace justo lo
// que hace Claude Code al arrancar: pregunta y escucha.
//
//   node scripts/laboratorio/preguntar-quien-eres.js <fichero de salida>
//
// Se lanza DENTRO de un panel de Adeorq: la pregunta sale por su salida, el
// emulador la parsea y su respuesta vuelve por la entrada del propio proceso.

const fs = require("fs");
const destino = process.argv[2];

let recogido = "";
if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
process.stdin.on("data", (d) => {
  recogido += d.toString("latin1");
});

// Las tres que Claude Code usa al arrancar, en el mismo orden.
process.stdout.write("\x1b[>0q"); // quién eres (XTVERSION)
process.stdout.write("\x1b[c"); // identidad (DA1)
process.stdout.write("\x1b[6n"); // dónde está el cursor (DSR)

setTimeout(() => {
  const visible = recogido.replace(/\x1b/g, "<ESC>").replace(/[\x00-\x1f]/g, (c) =>
    "<" + c.charCodeAt(0) + ">",
  );
  const informe = [
    `bytes recibidos: ${recogido.length}`,
    `¿contesta quién es?: ${/\x1bP>\|/.test(recogido) ? "SÍ" : "NO"}`,
    `¿dice xterm.js?: ${/xterm\.js/.test(recogido) ? "SÍ" : "NO"}`,
    `¿contesta la identidad?: ${/\x1b\[\?[\d;]*c/.test(recogido) ? "SÍ" : "NO"}`,
    `¿contesta dónde está el cursor?: ${/\x1b\[\d+;\d+R/.test(recogido) ? "SÍ" : "NO"}`,
    `crudo: ${visible}`,
  ].join("\n");
  fs.writeFileSync(destino, informe, "utf8");
  console.log(informe);
  process.exit(0);
}, 2000);
