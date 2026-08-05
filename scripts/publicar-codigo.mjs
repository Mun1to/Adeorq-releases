// Publica el CÓDIGO en el repo público, que no es un `git push`.
//
// `Mun1to/Adeorq-releases` lleva el código con licencia propietaria, pero no
// comparte historial con el privado: se publica como una FOTO de la versión,
// un commit por versión. Empujar el privado ahí subiría los siete documentos
// internos de la casa, y uno de ellos (las reglas de agentes que llevaba dentro
// `workspace.rs`) es el motivo de que no haya historial en el público.
//
// Se hizo a mano la primera vez y la memoria de aquella sesión ya decía que si
// se repetía merecía un script. Esta es la segunda. Lo que aporta un script
// aquí no es teclear menos: es que el BARRIDO de secretos se haga siempre, y
// no solo cuando quien publica se acuerda.
//
// NO empuja. Prepara el commit y para, para que se pueda mirar el diff antes
// de que salga a un repo público. Lo irreversible lo pulsa una persona.
//
//   node scripts/publicar-codigo.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, readFileSync, cpSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

const REPO_PUBLICO = "https://github.com/Mun1to/Adeorq-releases.git";

/** Los que no salen JAMÁS. Si alguien añade otro documento interno, va aquí. */
const FUERA = [
  "AGENTS.md",
  "CLAUDE.md",
  "FEEDBACK.md",
  "BUZON.md",
  "docs/METAS.md",
  "docs/MEJORAS.md",
  "docs/EMISION.md",
  "web/DISENO.md",
];

/**
 * Lo que no puede aparecer en el árbol publicado.
 *
 * Las tres primeras son claves de verdad; las tres últimas son las huellas de
 * que algo de la casa se ha colado, que es exactamente como se descubrió que
 * `workspace.rs` llevaba las reglas de Munir dentro. Se busca por CONTENIDO y
 * no por nombre de archivo: un fichero que se publica sí o sí puede llevar
 * dentro algo que no.
 */
const PROHIBIDO = [
  /sk-ant-[A-Za-z0-9_-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /AIza[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Reglas_de_los_proyectos/,
  /ecosistema de Munir/,
];

/** Lo que no tiene sentido barrer: binarios y lo que no viaja. */
const NO_MIRAR = /\.(png|jpg|jpeg|gif|webp|ico|icns|woff2?|ttf|exe|sig|lock)$/i;

/**
 * Y este archivo, que se encuentra a sí mismo.
 *
 * Las reglas de arriba están escritas AQUÍ, así que al barrer el árbol este
 * fichero contiene literalmente lo que se busca. Es el mismo falso positivo
 * que dio `redact.ts` la primera vez que se barrió el historial: el que sabe
 * qué buscar siempre da positivo. Se salta por nombre, y solo él.
 */
const YO = "publicar-codigo.mjs";

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

const raiz = git(["rev-parse", "--show-toplevel"]).replace(/\//g, "\\");

if (git(["status", "--porcelain"], raiz)) {
  console.error("El árbol tiene cambios sin commitear. Se publica lo que está en HEAD.");
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version;
console.log(`Publicando el código de la ${version}\n`);

const tmp = mkdtempSync(join(tmpdir(), "adeorq-pub-"));
const foto = join(tmp, "foto");
const publico = join(tmp, "publico");

try {
  // 1. La foto de HEAD, que es lo que git considera versionado y nada más:
  //    lo ignorado (node_modules, .env, dist) no entra ni por accidente.
  //
  //    Con `checkout-index`, que escribe los archivos rastreados tal cual y lo
  //    hace TODO git. Se probaron antes `git archive | tar -x` y luego un .tar
  //    intermedio, y las dos veces se cayó en el `tar` de esta máquina: es de
  //    los sitios donde depender de una herramienta de fuera no compensa,
  //    porque lo que se estaba pidiendo git ya sabía hacerlo solo.
  mkdirSync(foto, { recursive: true });
  git(["checkout-index", "-a", "-f", `--prefix=${foto.replace(/\\/g, "/")}/`], raiz);

  // 2. Fuera los internos.
  let quitados = 0;
  for (const f of FUERA) {
    const p = join(foto, f);
    try {
      rmSync(p);
      quitados++;
      console.log(`  fuera  ${f}`);
    } catch {
      /* No estaba: puede que ese documento ya no exista. */
    }
  }
  console.log(`  ${quitados} de ${FUERA.length} documentos internos quitados\n`);

  // 3. El barrido, que es el motivo de que esto sea un script.
  const sospechas = [];
  const barrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        barrer(p);
        continue;
      }
      if (e.name === YO || NO_MIRAR.test(e.name)) continue;
      if (statSync(p).size > 4 * 1024 * 1024) continue;
      const txt = readFileSync(p, "utf8");
      for (const re of PROHIBIDO) {
        const m = txt.match(re);
        if (m) sospechas.push(`${relative(foto, p)} → ${m[0].slice(0, 60)}`);
      }
    }
  };
  barrer(foto);

  if (sospechas.length) {
    console.error("NO SE PUBLICA. El árbol lleva dentro cosas de la casa:\n");
    for (const s of sospechas) console.error(`  ${s}`);
    process.exit(1);
  }
  console.log("  Barrido limpio: ni claves ni rastros de la casa.\n");

  // 4. El repo público, y encima la foto.
  git(["clone", "--depth", "1", REPO_PUBLICO, publico]);
  for (const e of readdirSync(publico)) {
    if (e === ".git") continue;
    rmSync(join(publico, e), { recursive: true, force: true });
  }
  cpSync(foto, publico, { recursive: true });

  git(["add", "-A"], publico);
  const hay = git(["status", "--porcelain"], publico);
  if (!hay) {
    console.log("El público ya está igual que esta versión: no hay nada que publicar.");
    process.exit(0);
  }
  git(["commit", "-m", `Adeorq ${version}`], publico);

  console.log(git(["show", "--stat", "--oneline", "HEAD"], publico));
  console.log(`
Listo y SIN empujar, que eso lo pulsas tú después de mirar el diff:

  cd ${publico}
  git log -1 --stat
  git push origin main

La carpeta se borra sola al reiniciar el equipo; si quieres tirarla ya:
  rm -rf ${tmp}
`);
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  throw e;
}
