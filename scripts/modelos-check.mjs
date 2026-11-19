// Que el nombre de cada modelo que enseña Adeorq sea el del modelo al que de
// verdad lleva su alias.
//
//     node scripts/modelos-check.mjs
//
// `ULTIMOS` en `src/lib/models.ts` es un nombre escrito a mano («Fable 5.1»),
// y a la terminal se le teclea el alias (`/model fable`), que Claude Code lleva
// a su último modelo. Cuando sale uno nuevo, la terminal cambia sola y el
// nombre no: el 2026-11-19 el móvil seguía ofreciendo «Fable 5.1» con
// `/model fable` llevando ya a `claude-fable-5-2`. Munir, desde el móvil:
// «Porque no se actualizado bien el nuevo modelo de fable eh?».
//
// Le pregunta al Claude Code instalado a qué modelo lleva cada alias sin llegar
// a ningún modelo: casa propia (`CLAUDE_CONFIG_DIR`), clave falsa y la API en
// un puerto cerrado; lee la línea `init` de `claude -p --output-format stream-json
// --verbose` y lo para. Sin `claude` en el PATH (la máquina de Linux de las
// pruebas) no mide nada y lo dice. Mira también que la copia del doble del
// móvil (`scripts/laboratorio/doble-movil.mjs`) diga lo mismo.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Las parejas `alias: "Nombre"` del objeto `nombre` de un fichero. */
export function leerTabla(texto, nombre) {
  const m = new RegExp(`${nombre}[^=]*=\\s*\\{([^}]*)\\}`).exec(texto);
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((x) => [x[1], x[2]]));
}

/** `claude-fable-5-2` es «Fable 5.2», como `nombreDeModelo` en `src/lib/usoDelPerfil.ts`. */
export function nombreDe(id) {
  const m = /^claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/i.exec(id ?? "");
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}${m[3] ? `.${m[3]}` : ""}` : null;
}

/** El entorno sin nada que lleve a una nube o cambie a dónde va un alias: ni
    Bedrock, Vertex o Foundry (con credenciales de verdad, la petición saldría
    en carrera con el `kill`), ni `ANTHROPIC_DEFAULT_*_MODEL`, ni proxies. Pasa
    dónde está Git Bash: sin él, un Windows con Git Bash fuera de su sitio no
    llega al init. Lo que no aparta: un `env` o un `apiKeyHelper` en los ajustes
    gestionados de una empresa, que Claude Code aplica igual con la casa propia. */
export function entornoLimpio(env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => k === "CLAUDE_CODE_GIT_BASH_PATH" || !/^(ANTHROPIC_|CLAUDE_|AWS_|GOOGLE_|GCLOUD_|CLOUD_ML_|VERTEX_|AZURE_)|PROXY$/i.test(k)));
}

function modeloDelAlias(alias, casa) {
  const env = {
    ...entornoLimpio(process.env),
    CLAUDE_CONFIG_DIR: casa,
    ANTHROPIC_API_KEY: "XXXX-de-mentira-solo-para-leer-el-init",
    // La API, a un puerto cerrado, y nada de lo que no le hace falta. Con un proxy
    // muerto en vez de esto tardaba 20 s en decir el init; así, 1,5 s (medido).
    ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_AUTOUPDATER: "1",
  };
  return new Promise((listo) => {
    const p = spawn("claude", ["-p", "hola", "--model", alias, "--output-format", "stream-json", "--verbose"], { env, cwd: casa, stdio: ["ignore", "pipe", "ignore"] });
    let texto = "";
    let dicho = null;
    const reloj = setTimeout(() => p.kill(), 45_000);
    p.stdout.on("data", (d) => {
      texto += d;
      for (const l of texto.split("\n")) {
        try {
          const j = JSON.parse(l);
          if (j.type === "system" && j.subtype === "init" && !dicho) {
            dicho = j.model ?? "";
            p.kill();
          }
        } catch {}
      }
    });
    p.on("error", () => { clearTimeout(reloj); listo(null); });
    // Se espera a que salga: borrar su casa con él vivo da EPERM en Windows.
    p.on("exit", () => { clearTimeout(reloj); listo(dicho); });
  });
}

const textoModelos = fs.readFileSync(path.join(RAIZ, "src", "lib", "models.ts"), "utf8");
const textoDoble = fs.readFileSync(path.join(RAIZ, "scripts", "laboratorio", "doble-movil.mjs"), "utf8");
const ultimos = leerTabla(textoModelos, "ULTIMOS");
const delDoble = leerTabla(textoDoble, "ULTIMOS");
const fallos = [];
if (!ultimos || Object.keys(ultimos).length < 4) fallos.push("no encuentro `ULTIMOS` en src/lib/models.ts");
else if (JSON.stringify(ultimos) !== JSON.stringify(delDoble)) fallos.push(`el doble del móvil dice ${JSON.stringify(delDoble)} y src/lib/models.ts ${JSON.stringify(ultimos)}`);

// Lo que dejó una pasada cortada a medias (Ctrl+C): su casa, de hace más de diez minutos.
for (const n of fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("modelos-check-"))) {
  const p = path.join(os.tmpdir(), n);
  try {
    if (Date.now() - fs.statSync(p).mtimeMs > 10 * 60_000) fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

const version = spawnSync("claude", ["--version"], { encoding: "utf8" });
// Un `claude` de npm en Windows es un `.cmd`, que no se lanza sin shell, y con shell el `kill` dejaría vivo al de dentro.
const soloCmd = version.error && process.platform === "win32" && spawnSync("claude --version", { shell: true }).status === 0;
if (soloCmd) {
  console.log("`claude` es un .cmd (instalado con npm): no se mide a qué modelo lleva cada alias; con el instalador nativo, sí");
} else if (version.error || version.status !== 0) {
  console.log("sin `claude` en el PATH: no se mide a qué modelo lleva cada alias");
} else if (ultimos) {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "modelos-check-"));
  fs.writeFileSync(path.join(casa, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
  try {
    // Los cuatro a la vez: uno tarda lo que tarde Claude Code en arrancar.
    const ids = await Promise.all(Object.keys(ultimos).map((alias) => modeloDelAlias(alias, casa)));
    for (const [i, [alias, nombre]] of Object.entries(ultimos).entries()) {
      const id = ids[i];
      const deVerdad = nombreDe(id);
      if (!id) fallos.push(`\`claude -p --model ${alias}\` no dijo a qué modelo lleva`);
      else if (deVerdad !== nombre) fallos.push(`ULTIMOS.${alias} dice «${nombre}» y \`/model ${alias}\` lleva a ${id} («${deVerdad ?? "?"}»): cámbialo en src/lib/models.ts y en scripts/laboratorio/doble-movil.mjs`);
      else console.log(`${alias}: ${id}, «${nombre}»`);
    }
  } finally {
    fs.rmSync(casa, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log(`medido con ${version.stdout.trim()}`);
}

if (fallos.length) {
  for (const f of fallos) console.log(`FALLA ${f}`);
  process.exit(1);
}
console.log("los nombres de los modelos son los de sus alias");
