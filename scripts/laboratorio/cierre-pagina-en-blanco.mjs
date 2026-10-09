// La página vacía que sirve `cierre-de-tao.ps1` en el devUrl (localhost:1420),
// para que el Adeorq de desarrollo que se prueba arranque SIN la interfaz: no
// restaura paneles, no lanza agentes y no toca el localStorage. Lo que se prueba
// es la parte de Rust (tao) al cerrar, y para eso basta una ventana con algo.
import { createServer } from "node:http";

const html =
  "<!doctype html><meta charset=utf-8><title>prueba de cierre</title>" +
  "<body style='background:#15171c;color:#ebe7df;font:20px system-ui;padding:40px'>" +
  "Adeorq de prueba (cierre). Se cierra solo.</body>";
createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(1420, () => console.log("en blanco en :1420"));
