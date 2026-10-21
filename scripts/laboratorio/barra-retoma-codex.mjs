// Una sesión de Codex pulsada en la barra se retoma con Codex, y su panel lleva
// la papelera.
//
// Munir, 2026-10-21: «¿por qué sigo sin tener el botón de borrar sesión en
// Codex?». La barra la abría con `claude --resume <id de Codex>` (`comoRetomar`
// en `App.tsx` armaba siempre la línea de Claude): Claude no la encontraba, él
// arrancaba Codex a mano en la consola que quedaba, y el panel seguía creyéndose
// Claude, buscaba la conversación en la carpeta de Claude y no ponía la
// papelera. Ahora la línea sale de `lineaParaRetomar` (`lib/lanzar.ts`).
//
// Siembra un rollout de Codex en la casa de una Adeorq aislada y un `codex.cmd`
// de mentira delante en el `Path` (apunta con qué lo llamaron y espera), pulsa
// la sesión en la barra y mira el comando del panel por el MCP y su cabecera.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/barra-retoma-codex.mjs [exe]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
const ID = "019a0b0c-1d2e-7f30-8a41-b52c63d74e85";
const NOMBRE = "barra-codex";
const BASE = join(tmpdir(), `adeorq-${NOMBRE}-${process.pid}`);
const BIN = join(BASE, "bin");
const LLAMADA = join(BASE, "codex-llamado.txt");

function sembrar(datos) {
  const base = dirname(dirname(datos));
  const demo = join(base, "proyectos", "demo");
  const dia = join(base, "casa", ".codex", "sessions", "2026", "10", "21");
  mkdirSync(dia, { recursive: true });
  const ahora = new Date().toISOString();
  writeFileSync(join(dia, `rollout-2026-10-21T10-00-00-${ID}.jsonl`), [
    JSON.stringify({ timestamp: ahora, type: "session_meta", payload: { id: ID, cwd: demo, timestamp: ahora, originator: "codex_cli_rs", cli_version: "0.50.0" } }),
    JSON.stringify({ timestamp: ahora, type: "event_msg", payload: { type: "user_message", message: "como lo pruebo?" } }),
    JSON.stringify({ timestamp: ahora, type: "event_msg", payload: { type: "agent_message", message: "Listo." } }),
  ].join("\n") + "\n");
  mkdirSync(BIN, { recursive: true });
  writeFileSync(join(BIN, "codex.cmd"), `@echo off\r\necho codex %*> "${LLAMADA}"\r\necho [codex de mentira] %*\r\npause >nul\r\n`);
}

let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

// En Windows la variable se llama `Path` o `PATH` según quién la puso: se pisa la que haya.
const clave = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path";
const path = `${BIN};${process.env[clave] ?? ""}`;
const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: NOMBRE, puertoMcp, depurar: 9800 + (process.pid % 100), exe, sembrar, entorno: { [clave]: path } });
try {
  // `abrirAislada` nace sin leer las conversaciones de la casa (`leerSesiones`).
  await a.v.js(`(() => { const p = JSON.parse(localStorage.getItem("adeorq-perfil")); p.leerSesiones = true; localStorage.setItem("adeorq-perfil", JSON.stringify(p)); return "ok"; })()`);
  await a.v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => a.v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  await dormir(800);
  await hasta(() => a.v.js(`(() => { const b = [...document.querySelectorAll(".project-main")].find((x) => /demo/.test(x.textContent ?? "")); if (!b) return false; if (/▸/.test(b.textContent ?? "")) b.click(); return true; })()`), 15_000);
  const fila = await hasta(() => a.v.js(`!!document.querySelector('[data-sesion="${ID}"]')`), 20_000);
  dice(!!fila, "la sesión de Codex sale en la barra");
  // El clic lo coge `.session`, dentro de la fila, no la fila.
  await a.v.js(`document.querySelector('[data-sesion="${ID}"] .session')?.click(); "ok"`);

  const mcp = a.puente(null);
  await mcp.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "lab", version: "1" } });
  const lista = await hasta(async () => {
    const r = await mcp.llamar("get_active_panes", {});
    return r.texto && r.texto.includes(ID) ? r.texto : null;
  }, 20_000, 700);
  const comando = (lista ?? "").split("\n").find((l) => l.includes(ID)) ?? "";
  dice(/codex resume/.test(comando), "el panel se abre con `codex resume <id>`", comando.slice(-160));
  dice(!/claude --/.test(comando), "y no con la línea de Claude");
  const llamado = await hasta(() => (existsSync(LLAMADA) ? readFileSync(LLAMADA, "utf8").trim() : null), 20_000, 500);
  dice(llamado === `codex resume ${ID}`, "el programa que arranca es Codex, retomando esa sesión", String(llamado));
  const papelera = await hasta(() => a.v.js(`!!document.querySelector(".pane-bin")`), 30_000, 700);
  dice(!!papelera, "la cabecera del panel lleva la papelera");
  const foto = await a.foto(null, "barra-retoma-codex.png");
  console.log(`      foto: ${foto}`);
  mcp.cerrar();
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
