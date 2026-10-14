// La puerta del MCP contra las páginas web (`abre_bien` en `src-tauri/src/mcp.rs`),
// probada contra una Adeorq de verdad.
//
// Un cliente de casa tiene que seguir entrando, y una conexión que empieza como
// la abre un navegador (la línea de la petición HTTP y sus cabeceras, con el JSON
// en el cuerpo) tiene que cerrarse sin que se conteste a ese JSON.
//
// NUNCA contra el 3012 de la Adeorq de Munir: se lanza una aislada con
// `ADEORQ_MCP_PUERTO` (receta en la memoria `binario_aislado_para_probar`) y se
// le pasa ese puerto.
//
// Uso: node scripts/laboratorio/mcp-puerta.mjs <puerto>
import { connect } from "node:net";

const PUERTO = Number(process.argv[2]);
if (!PUERTO || PUERTO === 3012) {
  console.error("Dale el puerto de una Adeorq aislada (no el 3012).");
  process.exit(2);
}

/** Manda `bytes` y recoge lo que vuelva durante `ms`, y si el otro lado cerró. */
function hablar(bytes, ms = 1500) {
  return new Promise((resolver, fallar) => {
    const s = connect(PUERTO, "127.0.0.1");
    let llega = "";
    let cerrada = false;
    s.on("error", fallar);
    s.on("data", (d) => (llega += d));
    s.on("end", () => (cerrada = true));
    s.on("connect", () => s.write(bytes));
    setTimeout(() => {
      s.destroy();
      resolver({ lineas: llega.split("\n").filter(Boolean), cerrada });
    }, ms);
  });
}

const respuesta = (lineas, id) =>
  lineas.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((v) => v && v.id === id);

const casa = await hablar(
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"clientInfo":{"name":"mcp-puerta"}}}\n' +
    '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n',
);
const ini = respuesta(casa.lineas, 0);
const lista = respuesta(casa.lineas, 1);
const casaEntra = ini?.result?.serverInfo?.name === "adeorq-mcp" && (lista?.result?.tools?.length ?? 0) > 0;

const web = await hablar(
  "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain;charset=UTF-8\r\n\r\n" +
    '{"jsonrpc":"2.0","id":7,"method":"tools/list"}\n',
);
const webFuera = web.cerrada && !respuesta(web.lineas, 7);

console.log(JSON.stringify({
  casa: { entra: casaEntra, herramientas: lista?.result?.tools?.length ?? 0 },
  navegador: { cerrada: web.cerrada, contestado: !!respuesta(web.lineas, 7), lineas: web.lineas.length },
}, null, 1));
console.log(casaEntra && webFuera ? "BIEN: casa entra, el navegador se queda fuera" : "MAL");
process.exit(casaEntra && webFuera ? 0 : 1);
