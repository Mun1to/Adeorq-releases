// Cómo conecta un usuario nuevo su Claude Code a las herramientas de Adeorq (el MCP).
//
//   node scripts/laboratorio/conexion-mcp-de-verdad.mjs [exe]
//
// E7 vio que ningún texto de Adeorq lo cuenta, y E11 se preguntó si hace falta
// porque Adeorq se conecte sola. Esto lo mide en una casa de pruebas nueva, con un
// Claude Code de verdad (`claude mcp list` y `claude mcp add` no llaman a ningún
// modelo y no gastan nada):
//
//  1. Con Adeorq abierta y la casa recién estrenada, ¿ve Claude Code el servidor
//     `adeorq`? (`mcp_estable.rs` solo REPUNTA una entrada que ya exista hacia una
//     copia fuera de la instalación; no crea ninguna.)
//  2. Con la orden de la guía (`claude mcp add adeorq … --mcp`), ¿conecta?
//
// El MCP es el de la Adeorq aislada (`ADEORQ_MCP_PUERTO`), nunca el 3012 de Munir.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir } from "./aislada.mjs";

const exe = process.argv[2] || EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};

// Lanzado desde una terminal de Claude Code, el entorno trae SU cuenta.
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k) || /^ADEORQ_PANE/i.test(k)) delete process.env[k];

const nombre = "conexion-mcp";
const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const casa = join(base, "casa");
mkdirSync(join(casa, "AppData", "Local"), { recursive: true });
const PUERTO = 47_000 + (process.pid % 900);

const entorno = { ...process.env, USERPROFILE: casa, HOME: casa, ADEORQ_MCP_PUERTO: String(PUERTO) };
const claude = (...args) => spawnSync("claude", args, { env: entorno, encoding: "utf8", timeout: 90_000, shell: process.platform === "win32" });

const a = await abrirAislada({ nombre, puertoMcp: PUERTO, depurar: 9650 + (process.pid % 100), exe });
try {
  if (a.base !== base) throw new Error(`la casa no es la que sembré: ${a.base}`);
  await dormir(2000);

  // 1. La casa nueva, con Adeorq abierta.
  const antes = claude("mcp", "list");
  const salida = `${antes.stdout ?? ""}${antes.stderr ?? ""}`.trim();
  console.log(`      claude mcp list (casa nueva): ${salida.replace(/\s+/g, " ").slice(0, 160)}`);
  dice(!/adeorq/i.test(salida), "con la casa nueva, Claude Code NO ve el servidor `adeorq`: Adeorq no se conecta sola", salida.slice(0, 200));
  const fichero = join(casa, ".claude.json");
  const servidores = existsSync(fichero) ? Object.keys(JSON.parse(readFileSync(fichero, "utf8")).mcpServers ?? {}) : [];
  dice(!servidores.includes("adeorq"), "y su `.claude.json` no trae ninguna entrada `adeorq`", JSON.stringify(servidores));

  // 2. La orden de la guía.
  const alta = claude("mcp", "add", "adeorq", "--scope", "user", "-e", `ADEORQ_MCP_PUERTO=${PUERTO}`, "--", `"${exe}"`, "--mcp");
  console.log(`      claude mcp add: ${`${alta.stdout ?? ""}${alta.stderr ?? ""}`.replace(/\s+/g, " ").trim().slice(0, 200)}`);
  dice(alta.status === 0, "la orden `claude mcp add adeorq -- <adeorq.exe> --mcp` se acepta", `estado ${alta.status}`);
  const despues = claude("mcp", "list");
  const salida2 = `${despues.stdout ?? ""}${despues.stderr ?? ""}`.trim();
  console.log(`      claude mcp list (tras añadirlo): ${salida2.replace(/\s+/g, " ").slice(0, 240)}`);
  dice(/adeorq/i.test(salida2) && /connected/i.test(salida2) && !/failed/i.test(salida2), "con esa orden, Claude Code conecta con Adeorq", salida2.slice(0, 240));
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
