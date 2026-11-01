// La Adeorq empaquetada de macOS, abierta de verdad y usada por su MCP.
//
//   node scripts/macos/probar-app.mjs <Adeorq.app> <carpeta de salida>
//
// Lo corre el workflow `macos.yml` en el Mac del propio GitHub. Hace lo que se
// puede hacer sin una persona delante:
//
//   1. abre la `.app` con el entorno pelado de un arranque desde el Finder
//      (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, que es lo que da `launchd`) y con
//      una casa falsa cuyo `.zshrc` añade una carpeta con un programa de prueba;
//   2. espera a que su MCP conteste en el puerto 3012;
//   3. le habla por el puente de verdad (`adeorq --mcp`): abre una consola
//      (`open_pane`), le manda un `echo` con una cuenta (`send_command`) y lee la
//      pantalla (`read_pane_screen`) hasta ver el resultado, que no puede salir
//      si la consola no ejecutó la orden (el comando escrito dice `6*7`, el
//      resultado `42`);
//   4. comprueba que el PATH del usuario llegó a la consola (el programa de
//      prueba se encuentra) y que la shell es zsh;
//   5. saca una `screencapture` y deja todo en la carpeta de salida.
//
// Sale con 1 si algo falla, pero la captura se saca antes de salir.
//
// NO es una prueba en un Mac de verdad con una persona delante: no ve si la
// ventana tiene buen aspecto, ni si el micrófono pregunta, ni si el vidrio se
// ve. Solo demuestra que arranca, que el MCP vive y que una terminal ejecuta.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [app, salida] = process.argv.slice(2);
if (!app || !salida) {
  console.error("uso: node scripts/macos/probar-app.mjs <Adeorq.app> <carpeta de salida>");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });

const PUERTO = 3012;
const BINARIO = join(app, "Contents", "MacOS", "adeorq");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "BIEN" : "MAL "}  ${que}`);
  if (!ok) fallos.push(que);
};
async function hasta(fn, ms, cada = 500) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await dormir(cada);
  }
  return null;
}

// Una casa que no es la del runner: sus datos, su `.zshrc`, su programa de prueba.
const BASE = mkdtempSync(join(tmpdir(), "adeorq-mac-"));
const CASA = join(BASE, "casa");
const SONDA = join(CASA, "sonda-bin");
mkdirSync(SONDA, { recursive: true });
writeFileSync(join(SONDA, "adeorq-sonda"), "#!/bin/sh\necho sonda-$((6*7))\n");
chmodSync(join(SONDA, "adeorq-sonda"), 0o755);
writeFileSync(join(CASA, ".zshrc"), 'export PATH="$HOME/sonda-bin:$PATH"\n');
writeFileSync(join(CASA, ".zprofile"), "");

// El entorno de un arranque desde el Finder: casi vacío.
const env = {
  HOME: CASA,
  USER: process.env.USER ?? "runner",
  LOGNAME: process.env.USER ?? "runner",
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  SHELL: "/bin/zsh",
  TMPDIR: process.env.TMPDIR ?? "/tmp/",
  LANG: "en_US.UTF-8",
};

const registro = join(salida, "adeorq-salida.log");
const log = spawn("/bin/sh", ["-c", `exec "$0" >"$1" 2>&1`, BINARIO, registro], { env, detached: true, stdio: "ignore" });
log.unref();
const pidApp = log.pid;

/** Un agente: el puente `--mcp` de verdad. */
function puente() {
  const p = spawn(BINARIO, ["--mcp"], { env });
  let buf = "";
  const pend = new Map();
  p.stdout.on("data", (d) => {
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
  const pedir = (method, params, ms = 20000) =>
    new Promise((ok) => {
      const id = ++n;
      pend.set(id, ok);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => ok({ timeout: true }), ms);
    });
  const llamar = async (name, args, ms) => {
    const r = await pedir("tools/call", { name, arguments: args }, ms);
    if (r.timeout) return { error: "sin respuesta" };
    if (r.error) return { error: r.error.message };
    return { texto: r.result?.content?.[0]?.text ?? JSON.stringify(r), esError: Boolean(r.result?.isError) };
  };
  return { pedir, llamar, cerrar: () => p.kill() };
}

function vive() {
  try {
    process.kill(pidApp, 0);
    return true;
  } catch {
    return false;
  }
}

function captura(nombre) {
  const r = spawnSync("screencapture", ["-x", join(salida, nombre)], { encoding: "utf8" });
  console.log(`screencapture ${nombre}: ${r.status === 0 ? "ok" : `estado ${r.status} ${r.stderr?.trim() ?? ""}`}`);
}

let agente;
try {
  const oye = await hasta(
    () =>
      new Promise((ok) => {
        const c = createConnection(PUERTO, "127.0.0.1");
        c.on("connect", () => {
          c.destroy();
          ok(true);
        });
        c.on("error", () => ok(false));
      }),
    90_000,
  );
  debe(Boolean(oye), `el MCP contesta en el ${PUERTO}`);
  debe(vive(), "la app sigue viva");
  if (!oye) throw new Error("sin MCP no hay nada más que probar");

  agente = puente();
  // El escalón de un cliente MCP sale de su nombre (`mcp_clientes::nivel_de_fabrica`):
  // uno que se llame «claude…» puede hacerlo todo, y uno sin nombre solo mirar y
  // abrir, que es lo que pasó en la primera pasada con `send_command`.
  const ini = await agente.pedir("initialize", { clientInfo: { name: "claude-sonda-mac", version: "1" } });
  debe(Boolean(ini.result), "el puente `adeorq --mcp` se presenta (initialize)");

  const paneles = await agente.llamar("get_active_panes", {});
  debe(Boolean(paneles.texto) && !paneles.error, `get_active_panes contesta (${(paneles.texto ?? paneles.error).slice(0, 80).replace(/\s+/g, " ")})`);

  const abre = await agente.llamar("open_pane", { cli: "shell", cwd: CASA, name: "sonda-mac" }, 40_000);
  console.log("open_pane:", (abre.texto ?? abre.error ?? "").slice(0, 300).replace(/\s+/g, " "));
  debe(Boolean(abre.texto) && !abre.error && !abre.esError, "open_pane abre una consola");
  const id = Number((abre.texto ?? "").match(/(?:panel|pane|terminal)\D{0,40}(\d+)/i)?.[1] ?? NaN);
  debe(Number.isFinite(id), `se sabe el número del panel (${id})`);
  if (Number.isFinite(id)) {
    // La consola tarda en arrancar su zsh de login con su .zshrc.
    await dormir(4000);
    const manda = await agente.llamar("send_command", { paneId: id, command: "echo adeorq-mac-$((6*7)); echo zsh=$ZSH_VERSION; adeorq-sonda" });
    debe(Boolean(manda.texto) && !manda.error && !manda.esError, `send_command acepta la orden (${(manda.texto ?? manda.error ?? "").slice(0, 300).replace(/\s+/g, " ")})`);
    let pantalla = "";
    const vio = await hasta(async () => {
      const r = await agente.llamar("read_pane_screen", { paneId: id });
      pantalla = r.texto ?? "";
      return pantalla.includes("adeorq-mac-42") && pantalla.includes("sonda-42");
    }, 30_000, 1000);
    writeFileSync(join(salida, "pantalla-consola.txt"), pantalla);
    debe(pantalla.includes("adeorq-mac-42"), "la consola EJECUTÓ el echo (salió 42, no el 6*7 escrito)");
    debe(/zsh=\d/.test(pantalla), "la shell de la consola es zsh");
    debe(pantalla.includes("sonda-42"), "el PATH del .zshrc del usuario llegó a la consola (adeorq-sonda se encuentra)");
    if (!vio) console.log("pantalla leída:\n" + pantalla.slice(-600));
    await agente.llamar("close_pane", { paneId: id, rastro: "Consola de la sonda de macOS: abierta para probar que el MCP, el PATH y zsh funcionan en el Mac del runner; ya no hace falta y se cierra." });
  }
  // El rastro de la propia app dice, sin depender de la consola (cuyo zsh lee su
  // .zshrc por su cuenta), que ella heredó el PATH de la shell de login, y DÓNDE
  // escribió: la carpeta de datos de un Mac es `Library/Application Support/Adeorq`.
  const rastro = join(CASA, "Library", "Application Support", "Adeorq", "rastro.log");
  const texto = existsSync(rastro) ? readFileSync(rastro, "utf8") : "";
  if (texto) writeFileSync(join(salida, "rastro.log"), texto);
  debe(existsSync(rastro), "la app escribió su rastro en ~/Library/Application Support/Adeorq (la carpeta de datos del Mac)");
  debe(/macOS: PATH heredado de la shell de login/.test(texto), "la app heredó el PATH de la shell de login del usuario (y no el pelado de launchd)");
} catch (e) {
  debe(false, `la prueba se cayó: ${e.message}`);
} finally {
  captura("ventana.png");
  agente?.cerrar();
  if (vive()) {
    // Es el mío: lo lancé yo por su ruta exacta, no por el nombre.
    try {
      process.kill(pidApp, "SIGTERM");
    } catch {}
  }
  await dormir(1500);
  rmSync(BASE, { recursive: true, force: true });
}

console.log(fallos.length ? `\n${fallos.length} fallo(s):\n- ${fallos.join("\n- ")}` : "\nTodo bien.");
process.exit(fallos.length ? 1 : 0);
