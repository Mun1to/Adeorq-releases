// Reproduce en esta terminal lo que dijo un CLI en una sesión grabada, y se
// queda quieto. Lo que venga detrás de la ruta en la línea de comando no se usa:
// es la etiqueta de qué CLI era.
// Uso: node repetir.mjs <grabación.bin | carpeta con COLSxROWS.bin>
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const origen = process.argv[2];
const apunte = join(statSync(origen).isDirectory() ? origen : dirname(origen), "repetir.log");

function grabacion() {
  if (!statSync(origen).isDirectory()) return readFileSync(origen, "utf8");
  const exacta = join(origen, `${process.stdout.columns}x${process.stdout.rows}.bin`);
  return existsSync(exacta) ? readFileSync(exacta, "utf8") : null;
}

function pintar() {
  const datos = grabacion();
  try {
    appendFileSync(apunte, `${new Date().toISOString()} ${origen} ${process.stdout.columns}x${process.stdout.rows}\n`);
  } catch {}
  process.stdout.write("\x1b[?1049l\x1b[0m\x1b[2J\x1b[3J\x1b[H");
  if (datos === null) {
    process.stdout.write(`sin grabación para ${process.stdout.columns}x${process.stdout.rows}\r\n`);
    return;
  }
  // Fuera lo que el ConPTY de la grabación le pedía a SU terminal, y las
  // preguntas (dónde está el cursor, quién eres): aquí no hay quien las lea y
  // la respuesta saldría escrita en pantalla.
  process.stdout.write(datos.replace(/\x1b\[\?(?:9001|1004)[hl]/g, "").replace(/\x1b\[(?:6n|[>=]?0?c|>0?q)/g, ""));
}

// Lo que llegue por el teclado (o lo que conteste la terminal) no se repite en pantalla.
try {
  process.stdin.setRawMode(true);
} catch {}
process.stdin.resume();

let espera = setTimeout(pintar, 900);
process.stdout.on("resize", () => {
  clearTimeout(espera);
  espera = setTimeout(pintar, 600);
});

// Un panel con «esc to interrupt» en pantalla que no dice nada en tres minutos
// se da por colgado. Aquí no hay nadie colgado: un carácter en blanco que cambia
// en la última celda basta para que el panel vea vida.
let par = false;
setInterval(() => {
  par = !par;
  process.stdout.write(`\x1b7\x1b[${process.stdout.rows};${process.stdout.columns}H${par ? " " : " "}\x1b8`);
}, 45000);
