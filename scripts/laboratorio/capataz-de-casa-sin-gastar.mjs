// Que el Capataz y el conserje de Claude siguen entrando como de casa, sin gastar: un Claude
// Code de verdad con una carpeta propia, una clave falsa y un proxy muerto, que arranca sus
// servidores MCP y nunca llega a ningún modelo. Se mira que su puente `--de-casa` corre y que
// NO queda apuntado como cliente: lo de fuera puede estar en lo que sea, a ellos no les toca.
// Y con el mismo Claude Code abierto fuera de Adeorq, qué herramientas ve en cada paso de Ajustes.
//
// Lo que esto no ve son sus llamadas, porque sin modelo no hace ninguna. Eso lo mide
// `LAB_CLAUDE_CUENTA` en `seguridad-local-de-verdad.mjs`, que gasta unos céntimos.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (Vite en el 1420)
//   node scripts/laboratorio/capataz-de-casa-sin-gastar.mjs [exe]
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const nombre = "capataz-de-casa";
const PUERTO = 41_000 + (process.pid % 900);
const DEPURAR = 9_600 + (process.pid % 90);
let fallos = 0;
const ok = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) {
  if (/^CLAUDE/i.test(k) || /^(GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)$/i.test(k)) delete process.env[k];
}

const base = join(tmpdir(), `adeorq-${nombre}-${process.pid}`);
const binDir = join(base, "lab-bin");
mkdirSync(binDir, { recursive: true });
const exe = join(binDir, "adeorq.exe");
copyFileSync(process.argv[2] ?? EXE, exe);

const CLAVE = "clave-falsa-de-laboratorio-sin-valor-0123456789";
const cuenta = join(base, "casa", ".claude");
mkdirSync(cuenta, { recursive: true });
writeFileSync(join(cuenta, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] }, projects: {} }));
writeFileSync(join(cuenta, "settings.json"), "{}");

const aislada = await abrirAislada({
  nombre,
  fueraConTodo: false,
  puertoMcp: PUERTO,
  depurar: DEPURAR,
  exe,
  entorno: {
    CLAUDE_CONFIG_DIR: cuenta,
    HOME: join(base, "casa"),
    ANTHROPIC_API_KEY: CLAVE,
    // Nada de lo que lance esta app llega a la red: si algo intenta llamar a un modelo, se queda aquí.
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
  },
});
try {
  const { v } = aislada;
  const clientes = async () => Object.fromEntries((await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_leer")`)).map((c) => [c.nombre, c.veces]));
  const carpeta = binDir.replace(/\\/g, "/").toLowerCase();
  const puentes = () => {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--de-casa' } | ForEach-Object { $_.CommandLine }`], { encoding: "utf8" });
    return (r.stdout ?? "").split(/\r?\n/).filter((l) => l.replace(/\\/g, "/").toLowerCase().includes(carpeta)).length;
  };

  /** Lanza el trabajo sin esperarlo: sin modelo acaba tarde, y lo que se mira pasa al arrancar. */
  const mirarPuente = async (titulo, lanzar) => {
    const antes = await clientes();
    v.js(lanzar).catch(() => {});
    const visto = await hasta(() => (puentes() > 0 ? true : null), 60_000, 500);
    // El tiempo de que se presente: `initialize` y `tools/list`.
    await dormir(4000);
    const despues = await clientes();
    const nuevos = Object.keys(despues).filter((n) => (despues[n] ?? 0) !== (antes[n] ?? 0));
    ok(!!visto, `${titulo}: su puente de casa corre`);
    ok(nuevos.length === 0, `${titulo}: no queda apuntado como cliente`, nuevos.length ? `apuntados: ${nuevos.join(", ")}` : "");
  };

  console.log("\n── Lo de fuera de fábrica, y Claude Code en «solo mirar»");
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "claude", nivel: "mirar" }).then(() => "ok")`);
  const fila = (await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_leer")`)).find((c) => c.nombre === "fuera");
  ok(fila?.nivel === "lista" && fila?.fabrica === true, "la fila de fuera está en «lista», de fábrica", JSON.stringify(fila));

  await mirarPuente(
    "el Capataz",
    `window.__TAURI_INTERNALS__.invoke("foreman_agente", { request: "hola", context: "", manos: ["mcp__adeorq__send_command"], modelo: "haiku", quien: null }).then((r) => "contestó: " + r, (e) => "falló: " + e)`,
  );
  // Sin el Capataz por medio: que sus restos no cuenten como el puente del conserje.
  await hasta(() => (puentes() === 0 ? true : null), 5_000, 500);
  const id = `lab-casa-${process.pid}`;
  await v.js(`window.__TAURI_INTERNALS__.invoke("conserje_cerebro", { id: ${JSON.stringify(id)}, cerebro: "haiku" }).then(() => "ok")`);
  await mirarPuente(
    "el conserje",
    `window.__TAURI_INTERNALS__.invoke("conserje_enviar", { id: ${JSON.stringify(id)}, texto: "hola", estados: {} }).then((r) => "contestó: " + r.texto, (e) => "falló: " + e)`,
  );

  // La prueba de que esto distingue: el mismo puente sin la contraseña de casa sí se apunta.
  console.log("\n── Y sin la contraseña de casa, el mismo puente es de fuera");
  const antes = await clientes();
  const sinCasa = aislada.puente(null);
  const r = await sinCasa.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  await dormir(500);
  sinCasa.cerrar();
  const despues = await clientes();
  ok(!!r.result && (despues.fuera ?? 0) === (antes.fuera ?? 0) + 1, "un puente sin ella queda apuntado en la fila de fuera", JSON.stringify({ antes: antes.fuera, despues: despues.fuera }));

  // Lo que dijo Munir, con un Claude Code de verdad: abierto fuera de Adeorq no puede leer
  // hasta que se suba. La primera línea de `claude -p` en stream-json dice qué herramientas
  // ve, y se mata ahí: nunca llega a pedirle nada a un modelo.
  console.log("\n── Un Claude Code de verdad abierto fuera de Adeorq");
  const configMcp = join(base, "mcp-de-fuera.json");
  writeFileSync(configMcp, JSON.stringify({ mcpServers: { adeorq: { command: exe, args: ["--mcp"] } } }));
  const veClaude = () =>
    new Promise((listo) => {
      const p = spawn("claude.exe", ["-p", "hola", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--mcp-config", configMcp], { env: aislada.env, cwd: aislada.demo });
      let buf = "";
      const cierra = (o) => {
        clearTimeout(reloj);
        spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
        listo(o);
      };
      const reloj = setTimeout(() => cierra({ error: "sin su primera línea en 60 s" }), 60_000);
      p.on("error", (e) => cierra({ error: String(e) }));
      p.stdin.end();
      p.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const l = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            const m = JSON.parse(l);
            if (m.type === "system" && m.subtype === "init") return cierra({ herramientas: (m.tools ?? []).filter((t) => t.startsWith("mcp__adeorq__")).map((t) => t.replace("mcp__adeorq__", "")).sort(), servidores: m.mcp_servers ?? [] });
          } catch {}
        }
      });
    });
  const justas = ["close_pane", "get_active_panes", "get_projects", "get_usage", "open_pane", "read_pane_screen", "read_pane_transcript"];
  const deFabrica = await veClaude();
  ok(JSON.stringify(deFabrica.herramientas) === JSON.stringify(justas), `de fábrica ve ${deFabrica.herramientas?.length} herramientas: la lista, el uso, los proyectos, abrir, y leer y cerrar lo suyo`, JSON.stringify(deFabrica).slice(0, 400));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: "plan" }).then(() => "ok")`);
  const conLeer = await veClaude();
  ok(["get_agenda", "buscar_memoria", "leer_memoria"].every((h) => conLeer.herramientas?.includes(h)) && !conLeer.herramientas?.includes("send_command"), `con «Leer y abrir» ve ${conLeer.herramientas?.length}: además la memoria y la agenda, y sin escribir`, JSON.stringify(conLeer).slice(0, 400));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: "auto" }).then(() => "ok")`);
  const conTodo = await veClaude();
  ok(conTodo.herramientas?.includes("send_command"), `con «Todo» ve ${conTodo.herramientas?.length}: también escribir`, JSON.stringify(conTodo).slice(0, 400));
  await v.js(`window.__TAURI_INTERNALS__.invoke("mcp_clientes_poner", { nombre: "fuera", nivel: null }).then(() => "ok")`);
} catch (e) {
  fallos++;
  console.log(`FALLO el laboratorio se cayó: ${e.stack || e}`);
} finally {
  await aislada.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
