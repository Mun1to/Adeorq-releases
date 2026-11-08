// The shared browser (escudo/navegador.mjs), tested for real: Brave without a window, a test
// profile and a test port, never Munir's profile or his ~/.claude.json.
//
//   node escudo/pruebas/navegador.mjs               the relay, the server and the config splice
//   node escudo/pruebas/navegador.mjs --con-claude  and two real Claude Code (Haiku) at once on it
//
// What it fixes in place:
//   0. Before: two sessions on one profile, the second gets «Browser is already in use».
//   1. Two sessions at once each drive their own tab: neither moves the other's page.
//   2. A cookie one session gets, the other sees (the logins are shared).
//   3. `browser_close` closes only that session's tab and does not fail.
//  3b. Two closes at the same instant close those two tabs and no other, and a second close in a row
//      does not close the neighbour tab the server hands that session (another session's).
//   4. Killing the branch of the terminal that started the server (what closing an Adeorq pane
//      does) leaves the browser to the others.
//   5. When the last session leaves, the browser closes; the next one finds the cookie on disk.
//   6. A dead server is started again by the next session.
//   7. The ~/.claude.json splice changes only the user-scope `playwright` entry, byte for byte.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as nav from "../navegador.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RELE = path.resolve(AQUI, "..", "navegador.mjs");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "adeorq-navegador-"));
const PERFIL = path.join(T, "perfil");
const ESTADO = path.join(T, "estado");
const PUERTO = 3929;
const BRAVE = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";

let fallos = 0;
let total = 0;
async function prueba(nombre, fn) {
  total++;
  try {
    await fn();
    console.log(`ok    ${nombre}`);
  } catch (e) {
    fallos++;
    console.log(`FALLO ${nombre}\n      ${e.message}`);
  }
}
const cierto = (c, que) => {
  if (!c) throw new Error(que);
};

// ───────── a tiny web ─────────

const web = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const pagina = (titulo, cabeceras = {}) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cabeceras });
    res.end(`<!doctype html><title>${titulo}</title><p>${titulo}</p>`);
  };
  if (u.pathname === "/pon") return pagina("puesta", { "set-cookie": "sesion=abierta; Max-Age=86400; Path=/" });
  if (u.pathname === "/mira") return pagina(`cookie:${req.headers.cookie ?? "ninguna"}`);
  return pagina(`Pagina ${u.pathname.slice(1).toUpperCase()}`);
});
await new Promise((r) => web.listen(0, "127.0.0.1", r));
const WEB = `http://127.0.0.1:${web.address().port}`;

// ───────── an MCP client over stdio ─────────

function cliente(orden) {
  const h = spawn(process.execPath, orden, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let n = 0;
  const esperan = new Map();
  let buf = "";
  let err = "";
  h.stderr.on("data", (d) => (err += d));
  h.stdout.setEncoding("utf8");
  h.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const linea = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!linea.trim()) continue;
      const m = JSON.parse(linea);
      if (m.method === "roots/list") h.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { roots: [{ uri: `file:///${T.replace(/\\/g, "/")}`, name: "prueba" }] } })}\n`);
      else if (m.id != null && esperan.has(m.id)) {
        esperan.get(m.id)(m);
        esperan.delete(m.id);
      }
    }
  });
  const pedir = (method, params, ms = 90_000) =>
    new Promise((res, rej) => {
      const id = ++n;
      const t = setTimeout(() => rej(new Error(`sin respuesta a ${method} en ${ms / 1000} s; stderr: ${err.slice(-300)}`)), ms);
      esperan.set(id, (m) => {
        clearTimeout(t);
        res(m);
      });
      h.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  const c = {
    h,
    async iniciar() {
      const r = await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: { roots: { listChanged: false } }, clientInfo: { name: "prueba", version: "1" } }, 200_000);
      cierto(r.result?.serverInfo, `initialize falló: ${JSON.stringify(r).slice(0, 300)}`);
      h.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      return c;
    },
    async usar(name, args = {}) {
      const r = await pedir("tools/call", { name, arguments: args });
      const texto = (r.result?.content ?? []).map((x) => x.text ?? "").join("\n");
      return { error: !!r.result?.isError || !!r.error, texto: texto || JSON.stringify(r.error ?? r.result) };
    },
    async titulo() {
      const r = await c.usar("browser_evaluate", { function: "() => document.title" });
      return /"([^"]*)"/.exec(r.texto)?.[1] ?? r.texto;
    },
    cerrar() {
      return new Promise((res) => {
        if (h.exitCode != null) return res();
        h.once("exit", res);
        h.stdin.end();
        setTimeout(() => h.kill(), 10_000);
      });
    },
  };
  return c;
}
const rele = () => cliente([RELE, "--puerto", String(PUERTO), "--perfil", PERFIL, "--estado", ESTADO, "--navegador", BRAVE, "--headless"]);

function bravesCon(texto) {
  // Only brave.exe: the server's own node process carries the same --user-data-dir.
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", `@(Get-CimInstance Win32_Process -Filter "Name='brave.exe'" | Where-Object { $_.CommandLine -like '*${texto.replace(/'/g, "''")}*' }).Count`], { encoding: "utf8" });
  return Number(r.stdout.trim() || 0);
}
/** The process listening on the test port: the real server, whoever started it. */
function pidServidor() {
  const fila = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" })
    .split(/\r?\n/)
    .find((l) => l.includes(`127.0.0.1:${PUERTO} `) && /LISTENING/.test(l));
  return fila ? Number(fila.trim().split(/\s+/).pop()) : null;
}
const matar = (pid) => spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
const registro = () => {
  try {
    return fs.readFileSync(path.join(ESTADO, "servidor.log"), "utf8").slice(-600);
  } catch {
    return "(sin registro)";
  }
};
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms, que) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return;
    await dormir(250);
  }
  throw new Error(que);
}

// ───────── the tests ─────────

try {
  await prueba("0. antes: dos sesiones con un mismo perfil, la segunda no puede", async () => {
    const npx = nav.ordenDelServidor({ puerto: 0, perfil: "", navegador: BRAVE, sinVentana: true }).slice(0, 3);
    const viejo = path.join(T, "perfil-viejo");
    const orden = [...npx, "--headless", "--executable-path", BRAVE, "--user-data-dir", viejo];
    const a = await cliente(orden).iniciar();
    const b = await cliente(orden).iniciar();
    try {
      const ra = await a.usar("browser_navigate", { url: `${WEB}/a` });
      cierto(!ra.error, `la primera tampoco: ${ra.texto.slice(0, 200)}`);
      const rb = await b.usar("browser_navigate", { url: `${WEB}/b` });
      cierto(rb.error && /already in use/i.test(rb.texto), `la segunda abrió: ${rb.texto.slice(0, 200)}`);
    } finally {
      await a.cerrar();
      await b.cerrar();
    }
  });

  let a;
  let b;
  await prueba("1. dos sesiones a la vez, cada una en su pestaña", async () => {
    a = await rele().iniciar();
    b = await rele().iniciar();
    await a.usar("browser_navigate", { url: `${WEB}/a` });
    await b.usar("browser_navigate", { url: `${WEB}/b` });
    const ta = await a.titulo();
    const tb = await b.titulo();
    cierto(ta === "Pagina A", `la sesión A está en «${ta}»`);
    cierto(tb === "Pagina B", `la sesión B está en «${tb}»`);
    cierto(bravesCon(PERFIL) > 0, "no hay un Brave con el perfil de prueba");
  });

  await prueba("2. la cookie que coge una la ve la otra", async () => {
    await a.usar("browser_navigate", { url: `${WEB}/pon` });
    await b.usar("browser_navigate", { url: `${WEB}/mira` });
    const tb = await b.titulo();
    cierto(tb === "cookie:sesion=abierta", `la B ve «${tb}»`);
  });

  await prueba("3. browser_close cierra solo su pestaña y no da error", async () => {
    const r = await b.usar("browser_close");
    cierto(!r.error, `dio error: ${r.texto.slice(0, 200)}`);
    const ta = await a.titulo();
    cierto(ta === "puesta", `la A perdió su página: «${ta}»`);
    await b.usar("browser_navigate", { url: `${WEB}/b` });
    const ta2 = await a.titulo();
    cierto(ta2 === "puesta", `tras cerrar, la B se metió en la pestaña de la A: «${ta2}»`);
    cierto((await b.titulo()) === "Pagina B", "la B no abrió pestaña nueva");
  });

  await prueba("3b. dos browser_close en el mismo instante cierran sus dos pestañas y ninguna más, y repetirlo no cierra la de otra", async () => {
    // Measured on Munir's real profile (2026-11-08): the second of two simultaneous closes answers
    // «Target page, context or browser has been closed», and the tab count seen from two sessions
    // fell from 18 to 8. Here a third session keeps three tabs of its own and counts.
    const t = await rele().iniciar();
    try {
      await t.usar("browser_navigate", { url: `${WEB}/x1` });
      for (const x of ["x2", "x3"]) {
        await t.usar("browser_tabs", { action: "new" });
        await t.usar("browser_navigate", { url: `${WEB}/${x}` });
      }
      const pestanas = async () => (await t.usar("browser_tabs", { action: "list" })).texto.split("\n").filter((l) => /^- \d+:/.test(l.trim()));
      const antes = await pestanas();
      const [ra, rb] = await Promise.all([a.usar("browser_close"), b.usar("browser_close")]);
      await dormir(1000);
      const despues = await pestanas();
      console.log(`      ${antes.length} pestañas antes, ${despues.length} después; A ${ra.error ? `error: ${ra.texto.match(/Error: (.*)/)?.[1] ?? ra.texto.slice(0, 120)}` : "bien"}; B ${rb.error ? `error: ${rb.texto.match(/Error: (.*)/)?.[1] ?? rb.texto.slice(0, 120)}` : "bien"}`);
      cierto(despues.length === antes.length - 2, `se fueron ${antes.length - despues.length} pestañas, no 2:\n        antes: ${antes.join(" | ")}\n        después: ${despues.join(" | ")}`);
      for (const x of ["X1", "X2", "X3"]) cierto(despues.some((l) => l.includes(`Pagina ${x}`)), `se cerró la pestaña ${x} de la tercera sesión`);
      // After its close, the server makes a neighbour tab (another session's) this session's current
      // one: a second close in a row, as an agent retrying after that error would send, must not close it.
      const antes2 = await pestanas();
      await a.usar("browser_close");
      const despues2 = await pestanas();
      cierto(despues2.length === antes2.length, `un segundo browser_close seguido cerró otra pestaña:\n        antes: ${antes2.join(" | ")}\n        después: ${despues2.join(" | ")}`);
      await a.usar("browser_navigate", { url: `${WEB}/pon` });
      await b.usar("browser_navigate", { url: `${WEB}/b` });
      cierto((await a.titulo()) === "puesta" && (await b.titulo()) === "Pagina B", "después no siguieron cada una en lo suyo");
    } finally {
      await t.usar("browser_close");
      await t.cerrar();
    }
  });

  await prueba("4. matar la rama de la terminal que lo encendió no se lleva el navegador", async () => {
    const servidor = pidServidor();
    cierto(servidor, "no hay servidor escuchando");
    matar(a.h.pid);
    await dormir(1500);
    cierto(vivo(servidor) && pidServidor() === servidor, "el servidor murió con la terminal que lo encendió");
    await b.usar("browser_navigate", { url: `${WEB}/c` });
    const tb = await b.titulo();
    cierto(tb === "Pagina C", `la B dejó de funcionar: «${tb}»`);
  });

  await prueba("5. al irse la última se cierra el navegador, y la cookie sigue en el disco", async () => {
    await b.cerrar();
    await hasta(() => bravesCon(PERFIL) === 0, 20_000, "el Brave de prueba sigue abierto sin nadie");
    const c = await rele().iniciar();
    try {
      await c.usar("browser_navigate", { url: `${WEB}/mira` });
      const tc = await c.titulo();
      cierto(tc === "cookie:sesion=abierta", `la siguiente ve «${tc}»`);
    } finally {
      await c.cerrar();
    }
  });

  await prueba("6. con el servidor muerto, la siguiente sesión lo enciende otra vez", async () => {
    const viejo = pidServidor();
    cierto(viejo, `no hay servidor escuchando; registro: ${registro()}`);
    matar(viejo);
    await hasta(() => !vivo(viejo) && pidServidor() == null, 10_000, "no pude matar el servidor");
    const d = await rele().iniciar();
    try {
      await d.usar("browser_navigate", { url: `${WEB}/d` });
      cierto((await d.titulo()) === "Pagina D", `no navegó; registro: ${registro()}`);
      const nuevo = pidServidor();
      cierto(nuevo && nuevo !== viejo, "no hay servidor nuevo");
    } finally {
      await d.cerrar();
    }
  });

  await prueba("7. el empalme del .claude.json cambia solo la entrada de usuario", async () => {
    const original = `{\n  "numStartups": 482,\n  "big": 12345678901234567890,\n  "exp": 1.5e300,\n  "mcpServers": {\n    "adeorq": {\n      "type": "stdio",\n      "command": "C:\\\\x\\\\adeorq.exe",\n      "args": ["--mcp"]\n    },\n    "playwright": {\n      "args": [\n        "@playwright/mcp@latest",\n        "--user-data-dir",\n        "C:\\\\Users\\\\Muni\\\\.playwright-brave"\n      ],\n      "command": "npx",\n      "env": {},\n      "type": "stdio"\n    }\n  },\n  "projects": {\n    "C:/proyectos/VoCript": {\n      "mcpServers": {\n        "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }\n      }\n    }\n  },\n  "userID": "abc"\n}\n`;
    const nueva = nav.entradaNueva({ node: "C:\\node.exe", script: "C:\\x\\navegador.mjs", puerto: nav.PUERTO_DE_FABRICA, perfil: "C:\\p", navegador: "C:\\b.exe" });
    const { texto, vieja } = nav.empalmar(original, nueva);
    cierto(texto.includes('"big": 12345678901234567890') && texto.includes('"exp": 1.5e300'), "los números grandes cambiaron");
    cierto(texto.includes('"playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }'), "tocó la entrada del proyecto");
    cierto(JSON.parse(vieja).command === "npx", "la entrada de antes no es la de usuario");
    const vuelta = nav.empalmar(texto, JSON.parse(vieja)).texto;
    cierto(vuelta === original, "al quitarlo, el archivo no queda igual byte a byte");
    let rota = false;
    try {
      nav.empalmar("\uFEFF" + original, nueva);
    } catch {
      rota = true;
    }
    cierto(rota, "aceptó un archivo con BOM");
  });

  await prueba("8. --instalar y --quitar sobre una casa de prueba", async () => {
    const casa = path.join(T, "casa");
    fs.mkdirSync(casa, { recursive: true });
    const original = `{\n  "mcpServers": {\n    "playwright": {\n      "args": [\n        "@playwright/mcp@latest"\n      ],\n      "command": "npx",\n      "env": {},\n      "type": "stdio"\n    }\n  }\n}\n`;
    fs.writeFileSync(path.join(casa, ".claude.json"), original);
    const lanzar = (m) => spawnSync(process.execPath, [RELE, m, "--casa", casa, "--estado", ESTADO], { encoding: "utf8" });
    const r1 = lanzar("--instalar");
    const puesta = JSON.parse(fs.readFileSync(path.join(casa, ".claude.json"), "utf8")).mcpServers.playwright;
    cierto(/navegador\.mjs$/.test(puesta.args[0]) && puesta.command === process.execPath, `no quedó puesta: ${r1.stdout}`);
    cierto(!fs.existsSync(path.join(casa, ".claude.json.lock")), "dejó el candado puesto");
    cierto(/Ya estaba/.test(lanzar("--instalar").stdout), "la segunda vez la volvió a escribir");
    lanzar("--quitar");
    cierto(fs.readFileSync(path.join(casa, ".claude.json"), "utf8") === original, "al quitarlo no volvió la de antes");
  });

  if (process.argv.includes("--con-claude")) {
    await prueba("9. dos Claude Code de verdad a la vez, cada uno con su página", async () => {
      const config = path.join(T, "mcp.json");
      fs.writeFileSync(config, JSON.stringify({ mcpServers: { playwright: { type: "stdio", command: process.execPath, args: [RELE, "--puerto", String(PUERTO), "--perfil", PERFIL, "--estado", ESTADO, "--navegador", BRAVE, "--headless"] } } }));
      const demo = path.join(T, "demo");
      fs.mkdirSync(demo, { recursive: true });
      const exe = execFileSync("where.exe", ["claude"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
      const uno = (letra) =>
        new Promise((res) => {
          const prompt = `Use the playwright browser tools: navigate to ${WEB}/${letra}, then read the page title with browser_evaluate. Reply with only the exact title, nothing else.`;
          const h = spawn(exe, ["-p", prompt, "--model", "haiku", "--mcp-config", config, "--strict-mcp-config", "--setting-sources", "project", "--allowedTools", "mcp__playwright__browser_navigate,mcp__playwright__browser_evaluate,mcp__playwright__browser_snapshot", "--output-format", "json"], { cwd: demo, stdio: ["ignore", "pipe", "pipe"] });
          let out = "";
          h.stdout.on("data", (d) => (out += d));
          h.on("exit", () => {
            try {
              res(JSON.parse(out).result ?? out);
            } catch {
              res(out);
            }
          });
        });
      const [r1, r2] = await Promise.all([uno("uno"), uno("dos")]);
      console.log(`      Claude 1: ${String(r1).slice(0, 80)}\n      Claude 2: ${String(r2).slice(0, 80)}`);
      cierto(/Pagina UNO/.test(r1), "el primero no leyó su página");
      cierto(/Pagina DOS/.test(r2), "el segundo no leyó su página");
      // Claude Code keeps a transcript per folder: these are ours and go with the copy.
      const slug = demo.replace(/[^A-Za-z0-9]/g, "-");
      const carpeta = path.join(os.homedir(), ".claude", "projects", slug);
      if (slug.includes("adeorq-navegador-") && fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
    });
  }
} finally {
  try {
    const pid = pidServidor();
    if (pid) matar(pid);
  } catch {}
  web.close();
  await dormir(1000);
  fs.rmSync(T, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

console.log(`\n${total - fallos} de ${total} pruebas bien.`);
process.exit(fallos ? 1 : 0);
