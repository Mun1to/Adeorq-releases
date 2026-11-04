// Un Codex dentro de una terminal de Adeorq dice de CUÁL, de verdad, en una
// Adeorq aislada y sin gastar ni un token.
//
// El fallo (t77, medido en S2): Codex no pasa su entorno a los servidores MCP
// que lanza salvo lo que diga `env_vars` en su `config.toml`. Sin eso, el enlace
// `adeorq.exe --mcp` de un Codex no recibe `ADEORQ_PANE_ID` ni la contraseña
// (`ADEORQ_PANE_CLAVE`) y el puerto lo trata como «Fuera de Adeorq»: su permiso
// por escalón nunca sube de «plan». `mcp_estable.rs` ahora deja el `env_vars` en
// `[mcp_servers.adeorq]` al arrancar la app. Esto lo comprueba entero:
//
//   1. con un `config.toml` que la app NO toca, un Codex lanzado desde una
//      terminal suya llega a su servidor sin número ni contraseña (lo de antes);
//   2. con el `CODEX_HOME` que la app SÍ conoce, al arrancar le pone el
//      `env_vars` y no cambia nada más; lo mismo en una cuenta de Codex de
//      `accounts\codex-*` con la entrada (conserva lo que tenía) y sin tocar la
//      que no la tiene;
//   3. un Codex lanzado desde una terminal de la app, con ese `config.toml`,
//      entrega a su servidor el número de ESA terminal y su contraseña (la
//      huella coincide con la que lee el laboratorio de su pantalla);
//   4. el propio Codex acepta el fichero retocado (`codex mcp get adeorq`).
//
// El servidor es un espía (`espia-mcp.mjs`) que apunta lo que le llega. Codex
// sin sesión llega hasta el modelo y recibe un 401: no gasta cuota de ninguna
// cuenta. Una terminal es una consola, no un agente.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/codex-entorno-de-verdad.mjs [exe]
//
// Todo en una casa y unos datos de usar y tirar, con el MCP en el 39495: no toca
// la Adeorq de Munir ni su `~/.codex`. Sale con 1 si algo falla.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESPIA = join(AQUI, "espia-mcp.mjs");
const TRABAJO = join(tmpdir(), `adeorq-codex-entorno-${process.pid}`);
const fallos = [];
const debe = (ok, que) => {
  console.log(`${ok ? "OK  " : "MAL "} ${que}`);
  if (!ok) fallos.push(que);
};
const sha = (s) => createHash("sha256").update(s).digest("hex");
const DEL_PANEL = ['"ADEORQ_PANE_ID"', '"ADEORQ_PANE_CLAVE"'];

/** Un `config.toml` con el servidor `adeorq` apuntando al espía. */
const configDe = ({ log, antes = "", propio = "" }) =>
  [
    `model = 'gpt-5.6-terra'`,
    ``,
    `[mcp_servers.otro]`,
    `command = 'node'`,
    `env_vars = ["UNA_DE_OTRO"]`,
    ``,
    `[mcp_servers.adeorq]`,
    ...(propio ? [`env_vars = ["${propio}"]`] : []),
    `command = 'node'`,
    `args = ['${ESPIA}', '${log}']`,
    antes,
    ``,
    `[projects.'c:\\x']`,
    `trust_level = "trusted"`,
    ``,
  ].join("\r\n");

const HOME = join(TRABAJO, "home-app"); // el CODEX_HOME que la app conoce
const HOME_SIN = join(TRABAJO, "home-sin-tocar"); // uno que no conoce
const LOG_APP = join(TRABAJO, "espia-app.log");
const LOG_SIN = join(TRABAJO, "espia-sin.log");
mkdirSync(HOME, { recursive: true });
mkdirSync(HOME_SIN, { recursive: true });
const cfgApp = configDe({ log: LOG_APP });
const cfgSin = configDe({ log: LOG_SIN });
writeFileSync(join(HOME, "config.toml"), cfgApp);
writeFileSync(join(HOME_SIN, "config.toml"), cfgSin);
// Dos cuentas de Codex de Adeorq: una con su servidor y un `env_vars` propio, y
// otra sin servidor de Adeorq (como la `codex-3ra-codex` de Munir).
const cfgCuenta = configDe({ log: join(TRABAJO, "espia-cuenta.log"), propio: "MI_VARIABLE" });
const cfgCuentaSin = `model = "gpt-6-luna"\r\n\r\n[projects.'c:\\y']\r\ntrust_level = "trusted"\r\n`;

const a = await abrirAislada({
  nombre: "codex-entorno",
  puertoMcp: 39495,
  depurar: 9495,
  exe: process.argv[2] || undefined,
  entorno: { CODEX_HOME: HOME },
  sembrar: (datos) => {
    for (const [nombre, texto] of [["codex-con", cfgCuenta], ["codex-sin", cfgCuentaSin]]) {
      mkdirSync(join(datos, "accounts", nombre), { recursive: true });
      writeFileSync(join(datos, "accounts", nombre, "config.toml"), texto);
    }
  },
});
let panel = 0;
try {
  const agente = a.puente(null);
  await agente.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "laboratorio", version: "1" } });

  // 2. Lo que hizo la app al arrancar.
  const retocado = await hasta(() => {
    const t = readFileSync(join(HOME, "config.toml"), "utf8");
    return DEL_PANEL.every((n) => t.includes(n)) ? t : null;
  }, 20_000, 300);
  debe(!!retocado, "al arrancar, la app puso env_vars con el número y la contraseña en el config.toml de CODEX_HOME");
  if (retocado) {
    const sinLaLinea = retocado.replace(`env_vars = [${DEL_PANEL.join(", ")}]\r\n`, "");
    debe(sinLaLinea === cfgApp, "y no cambió nada más del fichero (ni sus saltos de línea ni el env_vars de otro servidor)");
    debe(/\[mcp_servers\.adeorq\]\r\nenv_vars = \[/.test(retocado), "la línea cuelga justo de la cabecera de su servidor, no de otro");
  }
  const cuenta = readFileSync(join(a.base, "datos", "Adeorq", "accounts", "codex-con", "config.toml"), "utf8");
  debe(cuenta.includes(`"MI_VARIABLE", ${DEL_PANEL.join(", ")}]`) && cuenta.includes(`env_vars = ["UNA_DE_OTRO"]`), "en una cuenta de Codex con servidor, se añade a lo que ya tenía y lo del otro servidor sigue igual");
  const sin = readFileSync(join(a.base, "datos", "Adeorq", "accounts", "codex-sin", "config.toml"), "utf8");
  debe(sin === cfgCuentaSin, "una cuenta sin servidor de Adeorq queda byte a byte como estaba (no se le pone uno)");

  // 3. Una terminal suya y un Codex de verdad dentro.
  const abierta = await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Codex del laboratorio", brief: "" });
  panel = Number(/\b(\d+)\b/.exec(abierta.texto ?? "")?.[1]);
  debe(panel > 0, `una terminal de Adeorq abierta (${panel})`);
  const clave = await a.claveDe(panel);
  debe(/^[0-9a-f]{64}$/.test(clave ?? ""), "la contraseña de la terminal se lee de su pantalla");

  const lanzar = (home) => agente.llamar("send_command", { paneId: panel, command: `cmd /c "set CODEX_HOME=${home}&& codex exec --skip-git-repo-check hola < nul"` });
  const leer = (log) => {
    if (!existsSync(log)) return null;
    const l = readFileSync(log, "utf8").trim().split("\n").at(-1);
    return l ? JSON.parse(l) : null;
  };

  // 1. Lo de antes: un config.toml que la app no toca.
  await lanzar(HOME_SIN);
  const antes = await hasta(() => leer(LOG_SIN), 60_000, 500);
  debe(!!antes, "Codex lanzó el servidor del config.toml sin retocar");
  debe(antes && antes.id === null && antes.clave === null, `sin env_vars, el servidor NO recibe número ni contraseña (id=${antes?.id}, clave=${antes?.clave})`);
  // Que termine antes del siguiente: Ctrl+C a su terminal.
  await agente.llamar("send_keys", { paneId: panel, keys: ["ctrl+c"] });
  await dormir(1500);

  // 3. Lo de ahora.
  await lanzar(HOME);
  const ahora = await hasta(() => leer(LOG_APP), 60_000, 500);
  debe(!!ahora, "Codex lanzó el servidor del config.toml que retocó la app");
  debe(ahora && ahora.id === String(panel), `el servidor recibe el número de la terminal que lo lanzó (esperado ${panel}, llegó ${ahora?.id})`);
  debe(ahora && ahora.clave === sha(clave), "y su contraseña (la huella es la de la que lee el laboratorio de la pantalla)");
  await agente.llamar("send_keys", { paneId: panel, keys: ["ctrl+c"] });

  // 4. El propio Codex acepta el fichero.
  const get = spawnSync("codex", ["mcp", "get", "adeorq", "--json"], { env: { ...process.env, CODEX_HOME: HOME }, encoding: "utf8", shell: true });
  let json = null;
  try {
    json = JSON.parse(get.stdout);
  } catch {}
  const lista = JSON.stringify(json?.transport?.env_vars ?? json ?? "");
  debe(get.status === 0 && DEL_PANEL.every((n) => lista.includes(n.replace(/"/g, ""))), "`codex mcp get adeorq --json` lo lee y trae las dos variables en su transporte");
} catch (e) {
  debe(false, `se cayó: ${e.message}`);
} finally {
  await a.cerrar();
  rmSync(TRABAJO, { recursive: true, force: true });
}
console.log(fallos.length ? `\n${fallos.length} fallos` : "\nTodo bien.");
process.exit(fallos.length ? 1 : 0);
