// Un servidor MCP de mentira para ver QUÉ entorno le llega a un servidor que
// lanza un cliente (Codex, Gemini...): apunta en un fichero qué variables de
// Adeorq trae y contesta lo mínimo para que el cliente no se queje.
//
//   [mcp_servers.adeorq]
//   command = 'node'
//   args = ['scripts/laboratorio/espia-mcp.mjs', 'C:\ruta\espia.log']
//
// Una línea JSON por arranque. La contraseña de la terminal NO se escribe: va
// su huella (sha256), que basta para compararla con la que se conoce.
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const salida = process.argv[2];
const clave = process.env.ADEORQ_PANE_CLAVE;
appendFileSync(
  salida,
  JSON.stringify({
    arranque: new Date().toISOString(),
    id: process.env.ADEORQ_PANE_ID ?? null,
    clave: clave ? createHash("sha256").update(clave).digest("hex") : null,
  }) + "\n",
);

let buf = "";
const responde = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const linea = buf.slice(0, i);
    buf = buf.slice(i + 1);
    try {
      const m = JSON.parse(linea);
      if (m.id === undefined) continue;
      if (m.method === "initialize") responde(m.id, { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "espia", version: "1" } });
      else if (m.method === "tools/list") responde(m.id, { tools: [] });
      else responde(m.id, {});
    } catch {}
  }
});
