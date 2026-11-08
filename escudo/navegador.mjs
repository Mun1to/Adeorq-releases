// One browser for every terminal (Munir's H2, 2026-11-07).
//
// Every agent session starts this as its `playwright` MCP server over stdio. It makes sure ONE
// Playwright MCP server is running on 127.0.0.1 (started here the first time, with the agents'
// profile and --shared-browser-context) and relays the session to it over the SSE transport.
// Before this, each session launched its own browser on the same profile: the second one got
// «Browser is already in use» and the agent ended up in an empty browser where logins were lost.
//
//   node escudo/navegador.mjs [--puerto 3019] [--perfil <dir>] [--navegador <exe>] [--estado <dir>] [--headless]
//   node escudo/navegador.mjs --instalar [--casa <dir>]   points the `playwright` entry of ~/.claude.json here
//   node escudo/navegador.mjs --quitar [--casa <dir>]     puts back the entry it replaced
//   node escudo/navegador.mjs --simular [--casa <dir>]    shows what --instalar would write, touches nothing
//
// What it takes care of:
//   - Its own tab: before a session's first tool call it opens a new tab, so it never drives the page
//     of another session; after `browser_close` (which a shared context refuses) it closes only that
//     tab, and the next call opens a fresh one.
//   - Lifetime: the SSE stream is the session. When the agent quits, the stream closes, the server
//     drops that session, and the last one to leave closes the browser (the profile keeps the logins).
//   - Nobody's branch: closing an Adeorq pane runs `taskkill /T` on its process tree. The server is
//     started through a middle process that exits at once, so it is no pane's descendant and closing
//     one terminal does not take the browser from the others.
// Contract and how it is tested: docs/contexto/escudo.md, «El navegador compartido».
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valor = (n, d) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const tiene = (n) => args.includes(n);

const CASA = valor("--casa", os.homedir());
const DATOS = process.env.LOCALAPPDATA ?? path.join(CASA, "AppData", "Local");
const HOST = "127.0.0.1";
export const PUERTO_DE_FABRICA = 3019;
const PUERTO = Number(valor("--puerto", PUERTO_DE_FABRICA));
const PERFIL = valor("--perfil", path.join(CASA, ".playwright-brave"));
const NAVEGADOR = valor("--navegador", "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe");
const ESTADO = valor("--estado", path.join(DATOS, "Adeorq", "navegador-agentes"));
const SIN_VENTANA = tiene("--headless");
const AQUI = fileURLToPath(import.meta.url);

// ───────── the shared server ─────────

function escucha(puerto, ms = 800) {
  // A closed port on Windows takes about 2 s to refuse: a short timeout says «nobody» sooner.
  return new Promise((res) => {
    const s = net.connect({ host: HOST, port: puerto });
    const t = setTimeout(() => {
      s.destroy();
      res(false);
    }, ms);
    s.once("connect", () => {
      clearTimeout(t);
      s.end();
      res(true);
    });
    s.once("error", () => {
      clearTimeout(t);
      res(false);
    });
  });
}

export function ordenDelServidor({ puerto, perfil, navegador, sinVentana }) {
  const npx = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  return [
    npx,
    "-y",
    "@playwright/mcp@latest",
    "--port",
    String(puerto),
    "--host",
    HOST,
    "--shared-browser-context",
    "--executable-path",
    navegador,
    "--user-data-dir",
    perfil,
    ...(sinVentana ? ["--headless"] : []),
  ];
}

function encender() {
  fs.mkdirSync(ESTADO, { recursive: true });
  const orden = ordenDelServidor({ puerto: PUERTO, perfil: PERFIL, navegador: NAVEGADOR, sinVentana: SIN_VENTANA });
  const log = path.join(ESTADO, "servidor.log");
  // The middle process: starts the server detached and exits, so the server has no living parent
  // inside any pane's tree.
  const medio = `
    const fs = require("fs"), { spawn } = require("child_process");
    const fd = fs.openSync(${JSON.stringify(log)}, "a");
    const h = spawn(process.execPath, ${JSON.stringify(orden)}, { detached: true, stdio: ["ignore", fd, fd], windowsHide: true, cwd: ${JSON.stringify(ESTADO)} });
    fs.writeFileSync(${JSON.stringify(path.join(ESTADO, "servidor.json"))}, JSON.stringify({ pid: h.pid, puerto: ${PUERTO}, desde: new Date().toISOString() }));
    h.unref();
  `;
  const m = spawn(process.execPath, ["-e", medio], { detached: true, stdio: "ignore", windowsHide: true });
  m.unref();
}

async function asegurarServidor() {
  if (await escucha(PUERTO)) return;
  // Two sessions starting at once: one starts the server, the other waits for it.
  fs.mkdirSync(ESTADO, { recursive: true });
  const cerrojo = path.join(ESTADO, "encendiendo");
  let mio = false;
  try {
    fs.mkdirSync(cerrojo);
    mio = true;
  } catch {
    const viejo = Date.now() - fs.statSync(cerrojo).mtimeMs > 120_000;
    if (viejo) {
      fs.rmSync(cerrojo, { recursive: true, force: true });
      fs.mkdirSync(cerrojo, { recursive: true });
      mio = true;
    }
  }
  try {
    if (mio && !(await escucha(PUERTO))) encender();
    const limite = Date.now() + 180_000; // the first npx download can be slow
    while (Date.now() < limite) {
      if (await escucha(PUERTO)) return;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`el navegador compartido no arrancó en el puerto ${PUERTO}: mira ${path.join(ESTADO, "servidor.log")}`);
  } finally {
    if (mio) fs.rmSync(cerrojo, { recursive: true, force: true });
  }
}

// ───────── the relay ─────────

const PROPIO = "adeorq-navegador-";

/** What the relay does with one message from the agent: the messages to send, in order. */
export function traducir(msg, estado) {
  if (msg?.method !== "tools/call") return [msg];
  const nombre = msg.params?.name;
  const accion = msg.params?.arguments?.action;
  const antes = [];
  const sinNumero = msg.params?.arguments?.index === undefined;
  if (nombre === "browser_close" || (nombre === "browser_tabs" && accion === "close" && sinNumero)) {
    // A shared context cannot be closed: close this session's tab instead, under the agent's id.
    // Once it is closed, the server makes a neighbour tab (another session's) the current one, so
    // a close with no tab of our own only lists the tabs.
    const tenia = estado.conPestana;
    estado.conPestana = false;
    return [{ ...msg, params: { ...msg.params, name: "browser_tabs", arguments: { action: tenia ? "close" : "list" } } }];
  }
  if (nombre === "browser_tabs" && accion === "close") {
    estado.conPestana = false;
    return [msg];
  }
  if (!estado.conPestana && !(nombre === "browser_tabs" && (accion === "new" || accion === "select"))) {
    antes.push({ jsonrpc: "2.0", id: `${PROPIO}${++estado.n}`, method: "tools/call", params: { name: "browser_tabs", arguments: { action: "new" } } });
  }
  estado.conPestana = true;
  return [...antes, msg];
}

function relevar() {
  const estado = { conPestana: false, n: 0 };
  let destino = null;
  const pendientes = [];
  let cadena = Promise.resolve();
  let cerrado = false;

  const salir = (codigo) => {
    if (cerrado) return;
    cerrado = true;
    process.exit(codigo);
  };
  const escribir = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
  // The server answers on the stream and runs calls side by side: the tab we open has to exist
  // before the agent's call that comes behind it, so the relay waits for that answer.
  const esperando = new Map();
  const enviar = (m) => {
    const propio = typeof m.id === "string" && m.id.startsWith(PROPIO);
    cadena = cadena.then(
      () =>
        new Promise((res) => {
          const respondido = propio ? new Promise((r) => esperando.set(m.id, r)) : null;
          const cuerpo = Buffer.from(JSON.stringify(m));
          const r = http.request(
            { host: HOST, port: PUERTO, path: destino, method: "POST", headers: { "content-type": "application/json", "content-length": cuerpo.length } },
            (resp) => {
              resp.resume();
              resp.on("end", () => (respondido ? respondido.then(res) : res()));
            },
          );
          r.on("error", () => {
            process.stderr.write("navegador compartido: se perdió la conexión con el servidor\n");
            salir(1);
          });
          r.end(cuerpo);
        }),
    );
  };

  const sse = http.get({ host: HOST, port: PUERTO, path: "/sse", headers: { accept: "text/event-stream" } }, (resp) => {
    if (resp.statusCode !== 200) {
      process.stderr.write(`navegador compartido: el puerto ${PUERTO} contestó ${resp.statusCode}, no es el servidor de Playwright\n`);
      salir(1);
      return;
    }
    resp.setEncoding("utf8");
    let buf = "";
    resp.on("data", (trozo) => {
      buf += trozo.replace(/\r\n/g, "\n");
      let corte;
      while ((corte = buf.indexOf("\n\n")) !== -1) {
        const bloque = buf.slice(0, corte);
        buf = buf.slice(corte + 2);
        let evento = "message";
        const datos = [];
        for (const linea of bloque.split("\n")) {
          if (linea.startsWith("event:")) evento = linea.slice(6).trim();
          else if (linea.startsWith("data:")) datos.push(linea.slice(5).replace(/^ /, ""));
        }
        const texto = datos.join("\n");
        if (evento === "endpoint") {
          destino = texto;
          for (const m of pendientes.splice(0)) enviar(m);
        } else if (evento === "message" && texto) {
          let m;
          try {
            m = JSON.parse(texto);
          } catch {
            continue;
          }
          if (typeof m.id === "string" && m.id.startsWith(PROPIO) && !m.method) {
            esperando.get(m.id)?.();
            esperando.delete(m.id);
            continue; // our own tab: the agent never asked for it
          }
          escribir(m);
        }
      }
    });
    resp.on("end", () => salir(1)); // the server went away under a live session
    resp.on("error", () => salir(1));
  });
  sse.on("error", (e) => {
    process.stderr.write(`navegador compartido: ${e.message}\n`);
    salir(1);
  });

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (linea) => {
    if (!linea.trim()) return;
    let msg;
    try {
      msg = JSON.parse(linea);
    } catch {
      return;
    }
    for (const m of traducir(msg, estado)) {
      if (destino) enviar(m);
      else pendientes.push(m);
    }
  });
  rl.on("close", () => {
    // The agent quit: let the last POST land, then close the stream so the server drops the session.
    cadena.then(() => {
      sse.destroy();
      salir(0);
    });
  });
}

// ───────── ~/.claude.json ─────────

/** Where the value of a top-level member path starts and ends, reading the text itself. */
export function rangoDe(texto, ruta) {
  let i = 0;
  const blanco = () => {
    while (i < texto.length && /\s/.test(texto[i])) i++;
  };
  const cadena = () => {
    const ini = i;
    i++;
    while (i < texto.length && texto[i] !== '"') i += texto[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(texto.slice(ini, i));
  };
  const saltar = () => {
    blanco();
    const c = texto[i];
    if (c === '"') return cadena();
    if (c === "{" || c === "[") {
      const cierra = c === "{" ? "}" : "]";
      i++;
      blanco();
      if (texto[i] === cierra) return i++;
      for (;;) {
        if (c === "{") {
          blanco();
          cadena();
          blanco();
          i++; // :
        }
        saltar();
        blanco();
        if (texto[i] === ",") {
          i++;
          continue;
        }
        i++; // closing bracket
        return;
      }
    }
    while (i < texto.length && !/[\s,}\]]/.test(texto[i])) i++;
  };
  const buscar = (nivel) => {
    blanco();
    if (texto[i] !== "{") return null;
    i++;
    let encontrado = null;
    for (;;) {
      blanco();
      if (texto[i] === "}") {
        i++;
        return encontrado;
      }
      const clave = cadena();
      blanco();
      i++; // :
      blanco();
      if (clave === ruta[nivel] && encontrado === null) {
        if (nivel === ruta.length - 1) {
          const ini = i;
          saltar();
          encontrado = { ini, fin: i };
        } else {
          const ini = i;
          encontrado = buscar(nivel + 1);
          i = ini;
          saltar();
        }
      } else saltar();
      blanco();
      if (texto[i] === ",") i++;
    }
  };
  return buscar(0);
}

export function entradaNueva({ node, script, puerto, perfil, navegador }) {
  const a = [script];
  if (puerto !== PUERTO_DE_FABRICA) a.push("--puerto", String(puerto));
  a.push("--perfil", perfil, "--navegador", navegador);
  return { type: "stdio", command: node, args: a, env: {} };
}

const esNuestra = (e) => Array.isArray(e?.args) && e.args.some((x) => /navegador\.mjs$/i.test(String(x)));

/** The text of ~/.claude.json with the user-scope `playwright` entry swapped, checked by reading it back. */
export function empalmar(texto, nueva) {
  if (!texto.trim() || texto.charCodeAt(0) === 0xfeff) throw new Error("el archivo está vacío o empieza con un BOM: no lo toco");
  const antes = JSON.parse(texto);
  if (!antes.mcpServers || typeof antes.mcpServers !== "object") throw new Error("no hay mcpServers de usuario: no lo toco");
  const r = rangoDe(texto, ["mcpServers", "playwright"]);
  if (!r) throw new Error("no hay una entrada playwright de usuario que cambiar");
  const sangria = /\n([ \t]*)"playwright"/.exec(texto.slice(0, r.ini))?.[1] ?? "    ";
  const valorNuevo = JSON.stringify(nueva, null, 2).replace(/\n/g, `\n${sangria}`);
  const resultado = texto.slice(0, r.ini) + valorNuevo + texto.slice(r.fin);
  const despues = JSON.parse(resultado);
  const sinEntrada = (o) => {
    const c = structuredClone(o);
    delete c.mcpServers.playwright;
    return JSON.stringify(c);
  };
  if (sinEntrada(antes) !== sinEntrada(despues)) throw new Error("al leerlo cambiaba algo más que la entrada: no lo escribo");
  if (JSON.stringify(despues.mcpServers.playwright) !== JSON.stringify(nueva)) throw new Error("la entrada no quedó como debía");
  return { texto: resultado, vieja: texto.slice(r.ini, r.fin) };
}

async function conCandado(archivo, fn) {
  // Claude Code saves its file holding a `.lock` folder (proper-lockfile): take it the same way.
  const candado = `${archivo}.lock`;
  const limite = Date.now() + 3000;
  for (;;) {
    try {
      fs.mkdirSync(candado);
      break;
    } catch {
      let edad = 0;
      try {
        edad = Date.now() - fs.statSync(candado).mtimeMs;
      } catch {
        continue;
      }
      if (edad > 10_000) {
        fs.rmSync(candado, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > limite) throw new Error("Claude Code está guardando su archivo justo ahora: vuelve a lanzarlo");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(candado, { recursive: true, force: true });
  }
}

async function cambiarConfig(modo) {
  const archivo = path.join(CASA, ".claude.json");
  const guardada = path.join(ESTADO, "playwright-antes.json");
  const nueva = entradaNueva({ node: process.execPath, script: AQUI, puerto: PUERTO, perfil: PERFIL, navegador: NAVEGADOR });
  const res = await conCandado(archivo, async () => {
    const texto = fs.readFileSync(archivo, "utf8");
    const actual = JSON.parse(texto).mcpServers?.playwright;
    let objetivo;
    if (modo === "quitar") {
      if (!esNuestra(actual)) return { dice: "La entrada playwright no es la del navegador compartido: no la toco." };
      if (!fs.existsSync(guardada)) throw new Error(`no encuentro la entrada de antes en ${guardada}`);
      objetivo = JSON.parse(fs.readFileSync(guardada, "utf8"));
    } else {
      if (esNuestra(actual) && JSON.stringify(actual) === JSON.stringify(nueva)) return { dice: "Ya estaba puesto." };
      objetivo = nueva;
    }
    const { texto: nuevoTexto } = empalmar(texto, objetivo);
    if (modo === "simular") return { dice: `Pondría esto como playwright en ${archivo}:\n${JSON.stringify(objetivo, null, 2)}\n\nY guardaría la de ahora en ${guardada}:\n${JSON.stringify(actual, null, 2)}` };
    if (modo === "instalar" && !esNuestra(actual)) {
      fs.mkdirSync(ESTADO, { recursive: true });
      fs.writeFileSync(guardada, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const tmp = `${archivo}.navegador-${process.pid}`;
    fs.writeFileSync(tmp, nuevoTexto);
    fs.renameSync(tmp, archivo);
    return { dice: null, objetivo };
  });
  if (res.dice) return console.log(res.dice);
  await new Promise((r) => setTimeout(r, 300));
  const leida = JSON.parse(fs.readFileSync(archivo, "utf8")).mcpServers?.playwright;
  if (JSON.stringify(leida) !== JSON.stringify(res.objetivo)) {
    console.log("Claude Code reescribió su archivo justo a la vez y el cambio no está: vuelve a lanzarlo.");
    process.exitCode = 1;
    return;
  }
  console.log(modo === "quitar" ? "Quitado: cada terminal vuelve a abrir su propio navegador." : "Puesto. Las terminales que abras desde ahora comparten un solo navegador; las ya abiertas siguen con el suyo hasta que las cierres.");
}

// ───────── main ─────────

if (process.argv[1] && path.resolve(process.argv[1]) === AQUI) {
  if (tiene("--instalar") || tiene("--quitar") || tiene("--simular")) {
    cambiarConfig(tiene("--quitar") ? "quitar" : tiene("--simular") ? "simular" : "instalar").catch((e) => {
      console.log(`No lo cambié: ${e.message}`);
      process.exitCode = 1;
    });
  } else {
    asegurarServidor().then(relevar, (e) => {
      process.stderr.write(`navegador compartido: ${e.message}\n`);
      process.exit(1);
    });
  }
}
