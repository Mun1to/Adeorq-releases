// El motor de terminales de Adeorq (`adeorq.exe --terminales`) usado suelto, como
// grabadora: abre un CLI de verdad en un ConPTY del tamaño que se le pida y da
// todo lo que dice. Es el mismo código que pinta un panel de la app.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sin colores ni movimientos de cursor: para buscar texto en lo que llegó. */
export const sinAnsi = (s) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?<>=!]*[ -/]*[@-~]/g, " ")
    .replace(/\x1b[()][0-9A-Za-z]/g, "")
    .replace(/\x1b[=>78MDEHc]/g, "");

// `ADEORQ_EXE`: otro binario de desarrollo que el de `C:\ct\debug` (ver el README).
export async function arrancarMotor({ exe = process.env.ADEORQ_EXE || "C:\\ct\\debug\\adeorq.exe", datos }) {
  const canal = `grabadora${process.pid}`;
  mkdirSync(datos, { recursive: true });
  // Lanzado desde una sesión de Claude Code, el hijo hereda sus `CLAUDE*` y se
  // cree su subagente (no guarda transcript). Fuera todas menos la del Git Bash.
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if ((k.toUpperCase().startsWith("CLAUDE") && k !== "CLAUDE_CODE_GIT_BASH_PATH") || k === "ADEORQ_PANE_ID" || k === "NO_COLOR") delete env[k];
  }
  const localReal = env.LOCALAPPDATA;
  env.LOCALAPPDATA = datos;
  env.ADEORQ_TERMINALES_CANAL = canal;
  const proc = spawn(exe, ["--terminales"], { env, stdio: "ignore", windowsHide: true });
  const señasEn = join(datos, "Adeorq", "terminales", `${canal}.json`);
  let señas = null;
  for (let i = 0; i < 60 && !señas; i++) {
    await dormir(150);
    if (existsSync(señasEn)) {
      try {
        señas = JSON.parse(readFileSync(señasEn, "utf8"));
      } catch {}
    }
  }
  if (!señas) {
    proc.kill();
    throw new Error("el motor no dejó sus señas en " + señasEn);
  }

  const sock = connect(señas.puerto, "127.0.0.1");
  await new Promise((ok, mal) => {
    sock.once("connect", ok);
    sock.once("error", mal);
  });
  sock.setNoDelay(true);
  let n = 0;
  const pendientes = new Map();
  const oyentes = new Map(); // id de terminal -> función(texto)
  const finales = new Map();
  let resto = "";
  sock.setEncoding("utf8");
  sock.on("data", (trozo) => {
    resto += trozo;
    for (;;) {
      const i = resto.indexOf("\n");
      if (i < 0) break;
      const l = resto.slice(0, i);
      resto = resto.slice(i + 1);
      if (!l.trim()) continue;
      let m;
      try {
        m = JSON.parse(l);
      } catch {
        continue;
      }
      if (m.t === "datos") oyentes.get(m.id)?.(m.texto);
      else if (m.t === "fin") finales.get(m.id)?.(m.code);
      else if (m.n && pendientes.has(m.n)) {
        const p = pendientes.get(m.n);
        pendientes.delete(m.n);
        if (m.t === "error") p.mal(new Error(m.error));
        else p.ok(m);
      }
    }
  });
  const mandar = (o) => sock.write(JSON.stringify(o) + "\n");
  const pedir = (o) =>
    new Promise((ok, mal) => {
      const num = ++n;
      pendientes.set(num, { ok, mal });
      mandar({ ...o, n: num });
    });
  mandar({ t: "hola", token: señas.token, version: señas.version, retener: false });

  return {
    pid: señas.pid,
    /** Abre una terminal. `alDecir(texto)` recibe cada trozo tal cual sale. */
    async crear({ id, cwd, cols, rows, command, env: suyo = {} }, alDecir, alAcabar) {
      oyentes.set(id, (texto) => {
        // El ConPTY pregunta por el cursor y no pinta nada hasta que alguien
        // contesta; en la app contesta xterm.
        if (texto.includes("\x1b[6n")) mandar({ t: "escribir", id, texto: "\x1b[1;1R" });
        alDecir(texto);
      });
      if (alAcabar) finales.set(id, alAcabar);
      // El hijo vuelve a la carpeta de datos de verdad (la falsa era solo para
      // las señas del motor) y no se anuncia como panel de ninguna Adeorq.
      await pedir({ t: "crear", alta: { id, cwd, cols, rows, command, env: { LOCALAPPDATA: localReal, ADEORQ_PANE_ID: "", ...suyo } } });
    },
    escribir: (id, texto) => mandar({ t: "escribir", id, texto }),
    matar: (id) => pedir({ t: "matar", id }),
    async cerrar() {
      mandar({ t: "adios" });
      await dormir(800);
      sock.destroy();
      if (proc.exitCode === null) proc.kill();
    },
  };
}
