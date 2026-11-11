// Comprueba el clon público que deja `publicar-codigo.mjs` ANTES de empujarlo
// (paso 9 de `docs/fichas/publicar-version.md`): que no lleve nada de la lista
// FUERA de ese script, que lleve README.md (el control positivo: si no está, la
// lista de ficheros salió vacía y el «0 publicados» no prueba nada) y que no
// haya ninguna clave de Anthropic.
//
// Uso: node scripts/revisar-clon-publico.mjs <carpeta del clon> [repo privado]
// Sale con 1 si algo no cuadra. Lo leído del clon es solo para contar: no se
// ejecuta nada de él.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [clon, repo = process.cwd()] = process.argv.slice(2);
if (!clon) {
  console.error("Uso: node scripts/revisar-clon-publico.mjs <carpeta del clon> [repo privado]");
  process.exit(2);
}

const fuente = readFileSync(join(resolve(repo), "scripts", "publicar-codigo.mjs"), "utf8");
const desde = fuente.indexOf("const FUERA = [");
const bloque = fuente.slice(desde, fuente.indexOf("];", desde));
const fuera = [...bloque.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
if (fuera.length === 0) {
  console.error("No encontré la lista FUERA en publicar-codigo.mjs: no puedo comprobar nada.");
  process.exit(1);
}

const ficheros = execFileSync("git", ["-C", clon, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
let mal = 0;
for (const f of fuera) {
  const sale = ficheros.filter((x) => x === f || x.startsWith(`${f}/`));
  if (sale.length) {
    mal++;
    console.log(`SALE ${f} (${sale.length})`);
  }
}
const conReadme = ficheros.includes("README.md");
console.log(`FUERA: ${fuera.length} entradas, ${mal} publicadas`);
console.log(`control README.md: ${conReadme ? "está" : "NO ESTÁ"}`);

let claves = 0;
for (const f of ficheros) {
  let texto;
  try {
    texto = readFileSync(join(clon, f), "utf8");
  } catch {
    continue;
  }
  if (/sk-ant-[A-Za-z0-9_-]{10,}/.test(texto)) {
    claves++;
    console.log(`CLAVE en ${f}`);
  }
}
console.log(`claves sk-ant: ${claves}`);
process.exit(mal || claves || !conReadme ? 1 : 0);
