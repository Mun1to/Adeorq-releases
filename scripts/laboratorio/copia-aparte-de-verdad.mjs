// Los encargos de la noche en una copia aparte (el Modo Espejo), de punta a
// punta: el reloj de verdad, dos Claude Code de verdad (la nocturna y su hija) y
// una API de mentira en este proceso (`ANTHROPIC_BASE_URL`), sin gastar.
//
//   1. El reloj lanza un encargo programado en una carpeta con git: su Claude
//      Code arranca DENTRO de `<proyecto>\.adeorq\espejo\…`, y su encargo le
//      dice que trabaja en una copia y que no cambie de rama ni haga push.
//   2. Lo que escribe queda en la copia; tu carpeta no se toca, y su
//      `git status` no enseña `.adeorq/`.
//   3. La hija que abre pidiendo la carpeta DE VERDAD nace dentro de la copia, y
//      lo que escribe también queda ahí.
//   4. Nadie la cierra por el MCP con cambios sin aceptar (ni por el camino del
//      reloj); a su hija sí.
//   5. El reloj ve que terminó y lo apunta como hecho.
//   6. Otro encargo en una carpeta sin git nace en ella, como siempre.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   node node_modules/vite/bin/vite.js --port 1420 --strictPort   (y apagarlo al acabar)
//   node scripts/laboratorio/copia-aparte-de-verdad.mjs [carpeta para las fotos] [exe]
//
// Sale con 1 si algo falla.
import http from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const PUERTO_MCP = 3198;
const DEPURAR = 9398;
const CLAVE = `sk-ant-api03-${"laboratorio".repeat(4)}-FALSA-${process.pid}`;
const TOCA_EN_MS = 30_000;
mkdirSync(FOTOS, { recursive: true });

const fallos = [];
const debe = (bien, que, detalle = "") => {
  console.log(`${bien ? "bien" : "MAL "}  ${que}${detalle ? `  (${String(detalle).slice(0, 600)})` : ""}`);
  if (!bien) fallos.push(que);
  return bien;
};

// ─── La API de mentira ──────────────────────────────────────────────────────
const api = { noche: null, escribio: null, abrio: null, hija: null, hijaEscribio: null, sinGit: null, rechazos: [] };
let DEMO = "";
const servidor = http.createServer((pet, res) => {
  let cuerpo = "";
  pet.on("data", (d) => (cuerpo += d));
  pet.on("end", () => {
    const error = () => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "laboratorio" } }));
    };
    let j = null;
    try {
      j = JSON.parse(cuerpo);
    } catch {}
    if (!pet.url.includes("/v1/messages") || !j) return error();
    const sse = (bloques, parada) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type, datos) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...datos })}\n\n`);
      ev("message_start", { message: { id: `msg_lab_${Date.now()}`, type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } });
      bloques.forEach((b, index) => {
        if (b.type === "text") {
          ev("content_block_start", { index, content_block: { type: "text", text: "" } });
          ev("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
        } else {
          ev("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
          ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
        }
        ev("content_block_stop", { index });
      });
      ev("message_delta", { delta: { stop_reason: parada, stop_sequence: null }, usage: { output_tokens: 5 } });
      ev("message_stop", {});
      res.end();
    };
    const texto = (s) => sse([{ type: "text", text: s }], "end_turn");
    const herramienta = (id, name, input) => sse([{ type: "tool_use", id, name, input }], "tool_use");
    const textoDe = (m) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c) => c.text ?? (typeof c.content === "string" ? c.content : "")).join(" "));
    const usuarios = (j.messages ?? []).filter((m) => m.role === "user");
    const primero = textoDe(usuarios[0]);
    const u = usuarios.at(-1);
    const ultimo = textoDe(u);
    // Las peticiones de al lado (el título, la sugerencia gris) van sin
    // herramientas o con su marca; la conversación lleva las suyas aunque el
    // MCP aún no haya conectado (el encargo va en la línea de arranque).
    if (!(j.tools ?? []).length || /^\s*\[SUGGESTION MODE/.test(ultimo)) {
      api.rechazos.push(primero.slice(0, 60));
      return error();
    }
    const sistema = typeof j.system === "string" ? j.system : (j.system ?? []).map((b) => b.text ?? "").join("\n");
    // «Primary working directory: …» en el bloque de entorno de Claude Code.
    const cwd = /[Ww]orking directory: ([^\n]+)/.exec(sistema)?.[1]?.trim() ?? "";
    const resultado = (Array.isArray(u?.content) ? u.content : []).find((c) => c.type === "tool_result");
    const dicho = resultado ? { texto: textoDe({ content: resultado.content }), error: !!resultado.is_error } : null;

    if (primero.includes("lab-hija-noche")) {
      if (!api.hija) {
        api.hija = { encargo: ultimo, cwd };
        return herramienta("toolu_lab_hija", "Write", { file_path: win32.join(cwd, "hija.txt"), content: "de la hija\n" });
      }
      if (dicho && !api.hijaEscribio) {
        api.hijaEscribio = dicho;
        return texto("Hecho; paro aquí.");
      }
      return texto("Recibido.");
    }
    if (primero.includes("lab-sin-git")) {
      if (!api.sinGit) api.sinGit = { encargo: ultimo, cwd };
      return texto("Hecho.");
    }
    if (primero.includes("lab-noche")) {
      if (!api.noche) {
        api.noche = { encargo: ultimo, cwd };
        return herramienta("toolu_lab_noche", "Write", { file_path: win32.join(cwd, "noche.txt"), content: "de la noche\n" });
      }
      if (dicho && !api.escribio) {
        api.escribio = dicho;
        if (!(j.tools ?? []).some((t) => t.name === "mcp__adeorq__open_pane")) api.rechazos.push("la nocturna sin open_pane");
        return herramienta("toolu_lab_abrir", "mcp__adeorq__open_pane", { cli: "claude", cwd: DEMO, name: "Hija noche", brief: "lab-hija-noche: escribe hija.txt y para." });
      }
      if (dicho && !api.abrio) {
        api.abrio = dicho;
        return texto("Abierta; paro aquí.");
      }
      return texto("Recibido.");
    }
    return texto("Recibido.");
  });
});
await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
const PUERTO_API = servidor.address().port;

// ─── La Adeorq aislada ──────────────────────────────────────────────────────
for (const k of Object.keys(process.env)) {
  if ((/^CLAUDE/i.test(k) && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_CLAVE" || k === "ADEORQ_PANE_ID" || k === "ADEORQ_TERMINALES_CANAL") delete process.env[k];
}
const exe = process.argv[3] ? resolve(process.argv[3]) : EXE;
const git = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "user.name=lab", "-c", "user.email=lab@lab", ...args], { encoding: "utf8" });
let SIN_GIT = "";
const sembrar = (datos) => {
  const casa = resolve(datos, "..", "..", "casa");
  const demo = resolve(datos, "..", "..", "proyectos", "demo");
  SIN_GIT = resolve(datos, "..", "..", "proyectos", "sin-git");
  mkdirSync(SIN_GIT, { recursive: true });
  // El proyecto, con git y un commit: el espejo nace de su rama.
  git(demo, "init", "-q", "-b", "main");
  writeFileSync(join(demo, "README.md"), "demo\n");
  git(demo, "add", "README.md");
  git(demo, "commit", "-q", "-m", "base");
  // De confianza solo las dos carpetas de verdad: la copia la hereda o no.
  const confiada = { hasTrustDialogAccepted: true, allowedTools: [] };
  const proyectos = {};
  for (const d of [demo, SIN_GIT]) {
    proyectos[d] = confiada;
    proyectos[d.replace(/\\/g, "/")] = confiada;
  }
  mkdirSync(join(casa, ".claude"), { recursive: true });
  writeFileSync(join(casa, ".claude.json"), JSON.stringify({
    hasCompletedOnboarding: true, theme: "dark", customApiKeyResponses: { approved: [CLAVE.slice(-20)], rejected: [] },
    projects: proyectos,
    mcpServers: { adeorq: { type: "stdio", command: exe, args: ["--mcp"], env: { ADEORQ_MCP_PUERTO: String(PUERTO_MCP) } } },
  }));
  writeFileSync(join(casa, ".claude", "settings.json"), JSON.stringify({ tui: "fullscreen", permissions: { allow: ["Write", "mcp__adeorq__open_pane", "mcp__adeorq__entregar"] } }));
  // Los dos encargos, a punto de tocarles: el reloj abre uno por vuelta.
  const creado = Date.now() - 3_600_000 + TOCA_EN_MS;
  const encargo = (id, nombre, texto, cwd) => ({ id, nombre, encargo: texto, cwd, cli: "claude", cuando: { tipo: "cada", horas: 1 }, activo: true, creado, ultima: 0, ultimoDia: "", corrida: null, ultimas: [], fallosSeguidos: 0, cortado: null });
  writeFileSync(join(datos, "programados.json"), JSON.stringify({
    version: 1,
    encargos: [encargo("pnoche", "Noche lab", "lab-noche: escribe noche.txt y abre una hija.", demo), encargo("psingit", "Sin git lab", "lab-sin-git: responde y para.", SIN_GIT)],
  }));
};

const a = await abrirAislada({
  nombre: "copia",
  puertoMcp: PUERTO_MCP,
  depurar: DEPURAR,
  fotos: FOTOS,
  exe,
  sembrar,
  entorno: {
    ANTHROPIC_API_KEY: CLAVE, ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_API}`, SSH_CONNECTION: "laboratorio", DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_NO_FLICKER: "1",
    ENABLE_TOOL_SEARCH: "false",
    ADEORQ_PROGRAMADOS: "1",
  },
});
const programados = () => JSON.parse(readFileSync(join(a.base ?? resolve(SIN_GIT, "..", ".."), "datos", "Adeorq", "programados.json"), "utf8")).encargos;
try {
  const { v, demo } = a;
  DEMO = demo;
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const pantalla = async (id) => (await agente.llamar("read_pane_screen", { paneId: id })).texto ?? "";
  const lista = async () => (await agente.llamar("get_active_panes", {})).texto ?? "";
  const idDe = async (nombre) => Number(new RegExp(`ID: (\\d+)[^\\n]*${nombre}`).exec(await lista())?.[1] ?? 0);
  // Donde arrancó de verdad: la carpeta del PTY, la que recibe su CLI.
  const cwdDe = async (nombre) => new RegExp(`Nombre: «[^»]*${nombre}»[^\\n]*?, CWD: ([^\\n]+?), Size:`).exec(await lista())?.[1]?.replace(/\//g, "\\") ?? "";
  const igual = (x, y) => x.replace(/\//g, "\\").toLowerCase() === y.replace(/\//g, "\\").toLowerCase();

  // 1. La nocturna nace en la copia.
  if (!(await hasta(() => api.noche, TOCA_EN_MS + 120_000, 500))) {
    const id = await idDe("Noche lab");
    throw new Error(`la nocturna no llegó a pedir (panel ${id}):\n${id ? await pantalla(id) : await lista()}`);
  }
  const copia = await cwdDe("Noche lab");
  debe(/[\\/]\.adeorq[\\/]espejo[\\/][^\\/]+$/.test(copia) && copia.toLowerCase().startsWith(demo.toLowerCase()), "el encargo programado arranca dentro de la copia del proyecto", copia);
  debe(api.noche.encargo.includes(`[adeorq] Trabajas en una copia aparte de ${demo}`) && /No cambies de rama ni hagas push/.test(api.noche.encargo), "su encargo le dice que trabaja en una copia, sin cambiar de rama ni hacer push", api.noche.encargo);

  // 2 y 3. Escribe, abre su hija pidiendo la carpeta de verdad, y la hija escribe.
  if (!(await hasta(() => api.abrio, 60_000, 300))) throw new Error(`la nocturna no abrió la hija:\n${await pantalla(await idDe("Noche lab"))}`);
  debe(!api.escribio?.error, "la nocturna escribe su archivo", api.escribio?.texto);
  debe(!api.abrio.error && /dentro de la copia aparte/.test(api.abrio.texto), "la respuesta de open_pane dice que la hija trabaja dentro de su copia", api.abrio.texto);
  if (!(await hasta(() => api.hijaEscribio, 120_000, 500))) throw new Error(`la hija no escribió:\n${await lista()}`);
  const enHija = await cwdDe("Hija noche");
  debe(!!copia && igual(enHija, copia), "la hija que pidió la carpeta de verdad arranca en la copia de su madre", `${enHija} frente a ${copia}`);
  debe(api.hija.encargo.includes("[adeorq] Trabajas en una copia aparte"), "y su encargo también se lo dice", api.hija.encargo);
  debe(!api.hijaEscribio.error, "la hija escribe su archivo", api.hijaEscribio.texto);
  await dormir(1000);
  debe(existsSync(join(copia, "noche.txt")) && existsSync(join(copia, "hija.txt")), "lo de las dos está en la copia");
  debe(!existsSync(join(demo, "noche.txt")) && !existsSync(join(demo, "hija.txt")), "y tu carpeta no se ha tocado");
  const tuyo = git(demo, "status", "--porcelain").stdout.trim();
  debe(tuyo === "", "tu git status no enseña la copia", tuyo);

  // 4. Cerrar.
  const noche = await idDe("Noche lab");
  const hija = Number(/Terminal\s+(\d+)/.exec(api.abrio.texto)?.[1] ?? 0);
  const cierre = await agente.llamar("close_pane", { paneId: noche, rastro: "Laboratorio de la copia aparte: intento cerrar la nocturna con cambios." });
  debe(/copia aparte/.test(cierre.error ?? "") && /No la cierro/.test(cierre.error ?? "") && /2 archivos sin guardar/.test(cierre.error ?? ""), "por el MCP no se cierra la nocturna con cambios sin aceptar, y dice cuántos", cierre.error ?? cierre.texto);
  // El camino del reloj: el mismo pedido que manda `programados.rs` al cerrar la de la vez anterior.
  await v.js(`window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "mcp:pedido", payload: { peticion: 999999, clase: "close_pane", paneId: ${noche} } }).then(() => "ok", (e) => String(e))`);
  await dormir(4000);
  debe(new RegExp(`ID: ${noche}\\b`).test(await lista()), "ni por el camino del reloj: sigue abierta", await lista());
  const cierraHija = await agente.llamar("close_pane", { paneId: hija, rastro: "Laboratorio de la copia aparte: la hija trabajó dentro de la copia de su madre." });
  debe(/cerrada/.test(cierraHija.texto ?? ""), "a la hija, que trabaja dentro, sí se la cierra", cierraHija.texto ?? cierraHija.error);

  // 5. El reloj la juzga.
  const juzgada = await hasta(() => {
    const e = programados().find((x) => x.id === "pnoche");
    return e?.ultimas?.[0] ? e.ultimas[0] : null;
  }, 120_000, 1000);
  debe(juzgada?.resultado === "hecho", "el reloj ve que la nocturna terminó y la apunta como hecha", JSON.stringify(juzgada));

  // 6. La de la carpeta sin git, como siempre.
  if (!(await hasta(() => api.sinGit, 120_000, 500))) throw new Error(`el encargo sin git no llegó a pedir:\n${await lista()}`);
  const enSinGit = await cwdDe("Sin git lab");
  debe(igual(enSinGit, SIN_GIT), "el encargo en una carpeta sin git arranca en ella", `${enSinGit} frente a ${SIN_GIT}`);
  debe(!api.sinGit.encargo.includes("copia aparte"), "y sin la nota de la copia", api.sinGit.encargo);
  writeFileSync(join(FOTOS, "copia-1-nocturna.txt"), await pantalla(noche));
  await a.foto(null, "copia-2-ventana.png");

  // 7. Cerrar y abrir Adeorq (un reinicio de madrugada): vuelve en su copia y con su conversación.
  await a.reiniciar();
  const otro = a.puente(null);
  await otro.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });
  const vuelta = await hasta(async () => {
    const l = (await otro.llamar("get_active_panes", {})).texto ?? "";
    return /Noche lab/.test(l) ? l : null;
  }, 60_000, 1000);
  const linea = (vuelta ?? "").split("\n").find((l) => /Noche lab/.test(l)) ?? "";
  const dondeVuelve = /, CWD: ([^\n]+?), Size:/.exec(linea)?.[1] ?? "";
  debe(!!copia && igual(dondeVuelve, copia), "tras reiniciar, la de la noche vuelve en su copia", `${dondeVuelve} frente a ${copia}`);
  debe(/--resume /.test(linea), "y con su conversación, no con una nueva", linea.slice(-300));
  debe(existsSync(join(copia, "noche.txt")), "y la copia sigue con su trabajo");
} catch (e) {
  fallos.push(String(e?.message ?? e));
  console.log(`MAL   ${e?.stack ?? e}`);
} finally {
  await a.cerrar();
  servidor.close();
}
if (api.rechazos.length) console.log(`rechazadas por la API de mentira: ${api.rechazos.join(" | ")}`);
console.log(fallos.length ? `\n${fallos.length} MAL:\n  ${fallos.join("\n  ")}` : "\nTodo bien.");
process.exitCode = fallos.length ? 1 : 0;
