// La caja del Mac: manda una prueba a un Mac de GitHub (`.github/workflows/caja-mac.yml`),
// espera y trae lo que salió. Es la tercera caja de `docs/contexto/cajas.md`.
//
//   node scripts/caja-mac.mjs [--ref <rama>] [--herramientas nada|node|rust] [--simular] -- <comando>
//
// Sin `--ref`, la rama de ahora. El Mac baja lo que hay en GitHub, no lo de tu disco: si la
// rama no está subida con tu último commit, para y lo dice. `--herramientas` (por defecto
// `node`) es lo que se instala antes del comando; `rust` tarda y cuesta más minutos de Mac.
// `--simular` enseña lo que haría sin lanzar nada. Sale con el código del comando.
//
// Ejemplo: node scripts/caja-mac.mjs --herramientas rust -- "cd src-tauri && cargo test --lib caja::"
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW = "caja-mac.yml";
const ARTEFACTO = "caja-mac-salida";
const HERRAMIENTAS = ["nada", "node", "rust"];

/** Lo que se pidió, o un error que se le dice tal cual a quien lo lanzó. */
export function leerArgs(argv) {
  const corte = argv.indexOf("--");
  if (corte < 0) throw new Error('falta el comando: node scripts/caja-mac.mjs [opciones] -- "<comando>"');
  const opciones = argv.slice(0, corte);
  const comando = argv.slice(corte + 1).join(" ").trim();
  if (!comando) throw new Error("el comando está vacío");
  const pedido = { ref: null, herramientas: "node", simular: false, comando };
  for (let i = 0; i < opciones.length; i++) {
    const o = opciones[i];
    if (o === "--simular") pedido.simular = true;
    else if (o === "--ref") pedido.ref = opciones[++i];
    else if (o === "--herramientas") pedido.herramientas = opciones[++i];
    else throw new Error(`no conozco ${o}`);
  }
  if (pedido.ref === undefined || pedido.ref === "") throw new Error("--ref necesita una rama o un commit");
  if (!HERRAMIENTAS.includes(pedido.herramientas)) throw new Error(`--herramientas es una de: ${HERRAMIENTAS.join(", ")}`);
  return pedido;
}

/** El último «salida: N» del registro del Mac, o `null` si no llegó a escribirlo. */
export function codigoDe(salida) {
  const m = [...salida.matchAll(/^salida: (\d+)$/gm)].pop();
  return m ? Number(m[1]) : null;
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// Sin colores: las terminales de Adeorq llevan `CLICOLOR_FORCE=1`, y con eso `gh` pinta
// su JSON aunque la salida vaya a este programa (2026-11-15, la primera vuelta de verdad
// se cayó leyéndolo).
const SIN_COLOR = { ...process.env, CLICOLOR_FORCE: "0", NO_COLOR: "1", GH_FORCE_TTY: "" };
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", env: SIN_COLOR }).trim();

/** Que el Mac vaya a ver lo mismo que tú: la rama subida con tu último commit. */
function comprobarSubida(ref) {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return null; // un commit: lo comprueba el checkout del Mac
  let local;
  try {
    local = git("rev-parse", `refs/heads/${ref}`);
  } catch {
    return null; // no es una rama de aquí: puede ser una de GitHub, y si no existe lo dirá el Mac
  }
  const remoto = git("ls-remote", "origin", `refs/heads/${ref}`).split(/\s/)[0] || null;
  if (remoto === local) return null;
  return remoto
    ? `la rama ${ref} de GitHub está en ${remoto.slice(0, 8)} y la tuya en ${local.slice(0, 8)}: el Mac probaría lo de GitHub. Súbela antes (git push).`
    : `la rama ${ref} no está en GitHub: el Mac baja lo de GitHub, no lo de tu disco. Súbela antes (git push -u origin ${ref}).`;
}

async function lanzar(pedido) {
  const ref = pedido.ref ?? git("rev-parse", "--abbrev-ref", "HEAD");
  const falta = comprobarSubida(ref);
  if (falta && !pedido.simular) throw new Error(falta);
  const marca = randomBytes(4).toString("hex");
  const porDefecto = pedido.simular ? "<rama por defecto>" : gh("repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name");
  const pedirlo = ["workflow", "run", WORKFLOW, "--ref", porDefecto, "-f", `ref=${ref}`, "-f", `comando=${pedido.comando}`, "-f", `herramientas=${pedido.herramientas}`, "-f", `marca=${marca}`];
  if (pedido.simular) {
    if (falta) console.log(`aviso: ${falta}`);
    console.log(`gh ${pedirlo.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
    console.log(`gh run list --workflow ${WORKFLOW}  (hasta ver «Caja Mac ${marca}»)`);
    console.log("gh run watch <id>");
    console.log(`gh run download <id> -n ${ARTEFACTO}`);
    return 0;
  }

  gh(...pedirlo);
  // La vuelta se llama «Caja Mac <marca>» (`run-name`): así se encuentra la nuestra
  // aunque otra persona lance otra a la vez.
  let vuelta = null;
  for (let i = 0; i < 30 && !vuelta; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const lista = JSON.parse(gh("run", "list", "--workflow", WORKFLOW, "--limit", "20", "--json", "databaseId,displayTitle,url"));
    vuelta = lista.find((v) => v.displayTitle === `Caja Mac ${marca}`) ?? null;
  }
  if (!vuelta) throw new Error(`GitHub no enseña la vuelta «Caja Mac ${marca}» al minuto de pedirla`);
  console.log(`En el Mac: ${vuelta.url}`);
  return seguir(vuelta.databaseId);
}

/** Espera a una vuelta ya lanzada, baja su salida y la escribe; devuelve el código del comando. */
export function seguir(id) {
  spawnSync("gh", ["run", "watch", String(id), "--interval", "15"], { stdio: "inherit", env: SIN_COLOR });

  const conclusion = gh("run", "view", String(id), "--json", "conclusion", "-q", ".conclusion");
  const dir = mkdtempSync(join(tmpdir(), "caja-mac-"));
  try {
    spawnSync("gh", ["run", "download", String(id), "-n", ARTEFACTO, "-D", dir], { stdio: "inherit", env: SIN_COLOR });
    const archivo = join(dir, "salida.txt");
    if (!existsSync(archivo)) {
      console.log(`No volvió la salida (la vuelta acabó en «${conclusion}»): gh run view ${id} --log`);
      return 1;
    }
    const salida = readFileSync(archivo, "utf8");
    process.stdout.write(salida);
    return codigoDe(salida) ?? (conclusion === "success" ? 0 : 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Solo lanzado a mano: importado (para probar `leerArgs` y `codigoDe`), no hace nada.
if (process.argv[1]?.endsWith("caja-mac.mjs")) {
  try {
    process.exit(await lanzar(leerArgs(process.argv.slice(2))));
  } catch (e) {
    console.error(`caja-mac: ${e.message}`);
    process.exit(2);
  }
}
