// La carrera que tumbó la prueba del Mac de la 0.9.256: el MCP contesta a los dos
// segundos de arrancar y la ventana escucha a los seis, y un open_pane pedido en
// ese hueco se perdía (25 s y «la ventana de Adeorq no contestó a tiempo»). Desde
// `mcp_oyente_listo` (`mcp.rs`), Rust espera a que la ventana escuche.
// Arranca una Adeorq aislada (casa nueva, con la bienvenida) y, en cuanto el
// puerto del MCP escucha, abre una consola desde fuera. Rojo sin el arreglo.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   node node_modules/vite/bin/vite.js --port 1420 --strictPort --host 127.0.0.1   (y apagarlo al acabar)
//   node scripts/laboratorio/carrera-arranque-de-verdad.mjs directo [exe]
//
// Sin `directo`, lista las terminales antes, como hace `scripts/macos/probar-app.mjs`.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = process.argv.slice(2).find((a) => a.endsWith(".exe")) ?? "C:\\ct\\debug\\adeorq.exe";
const PUERTO = 42_000 + (process.pid % 900);
const base = join(tmpdir(), `adeorq-carrera-${process.pid}`);
const demo = join(base, "proyectos", "demo");
mkdirSync(join(base, "datos", "Adeorq"), { recursive: true });
mkdirSync(join(base, "casa", "AppData", "Local"), { recursive: true });
mkdirSync(demo, { recursive: true });
writeFileSync(join(base, "datos", "Adeorq", "raiz.txt"), join(base, "proyectos"));
writeFileSync(join(base, "datos", "Adeorq", "mcp_clientes.json"), JSON.stringify({ niveles: { fuera: "auto" } }));
const env = {
  ...process.env,
  LOCALAPPDATA: join(base, "datos"),
  USERPROFILE: join(base, "casa"),
  WEBVIEW2_USER_DATA_FOLDER: join(base, "navegador"),
  ADEORQ_MCP_PUERTO: String(PUERTO),
  ADEORQ_TERMINALES_CANAL: `lab-carrera-${process.pid}`,
};
delete env.ADEORQ_PANE_ID;
delete env.ADEORQ_PANE_CLAVE;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const escucha = () =>
  new Promise((ok) => {
    const s = createConnection({ port: PUERTO, host: "127.0.0.1" }, () => {
      s.destroy();
      ok(true);
    });
    s.on("error", () => ok(false));
  });

const t0 = Date.now();
const seg = () => ((Date.now() - t0) / 1000).toFixed(1) + " s";
const app = spawn(EXE, [], { cwd: demo, detached: true, stdio: "ignore", env });
app.unref();
let fallo = false;
let mcp;
try {
  while (!(await escucha())) {
    if (Date.now() - t0 > 60_000) throw new Error("el MCP no abrió su puerto");
    await dormir(100);
  }
  console.log(`MCP escucha a los ${seg()}`);
  mcp = spawn(EXE, ["--mcp"], { env });
  let buf = "";
  const pend = new Map();
  mcp.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(l);
        pend.get(m.id)?.(m);
      } catch {}
    }
  });
  let n = 0;
  const pedir = (method, params, ms = 45_000) =>
    new Promise((ok) => {
      const id = ++n;
      pend.set(id, ok);
      mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => ok({ timeout: true }), ms);
    });
  const llamar = async (name, args) => {
    const r = await pedir("tools/call", { name, arguments: args });
    if (r.timeout) return { error: "sin respuesta del puente" };
    return r.error ? { error: r.error.message } : { texto: r.result?.content?.[0]?.text ?? "", esError: r.result?.isError };
  };
  await pedir("initialize", { clientInfo: { name: "sonda-carrera", version: "1" } });
  let t = Date.now();
  // Con «directo», la consola se pide nada más contestar el MCP: el peor hueco.
  if (!process.argv.includes("directo")) {
    const lista = await llamar("get_active_panes", {});
    console.log(`get_active_panes (${Date.now() - t} ms, a los ${seg()}): ${(lista.texto ?? lista.error).slice(0, 60)}`);
  }
  t = Date.now();
  const abre = await llamar("open_pane", { cli: "shell", cwd: demo, name: "sonda-carrera" });
  const texto = (abre.texto ?? abre.error ?? "").replace(/\s+/g, " ").slice(0, 120);
  console.log(`open_pane (${Date.now() - t} ms, a los ${seg()}): ${texto}`);
  fallo = !abre.texto || !!abre.error || !!abre.esError || !/Terminal \d+ abierta/.test(abre.texto);
  console.log(fallo ? "ROJO: la consola no se abrió" : "VERDE: la consola se abrió");
} catch (e) {
  fallo = true;
  console.log("ROJO:", e.message);
} finally {
  mcp?.kill();
  spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await dormir(3000);
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(base, { recursive: true, force: true });
      break;
    } catch {
      await dormir(1000);
    }
  }
}
process.exit(fallo ? 1 : 0);
