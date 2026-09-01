// Publicar una versión, pasando por el guardián de las pruebas.
//
//   node scripts/publicar-version.mjs <ruta de las notas>
//
// Existe para que la vía CORRECTA sea la CÓMODA. El guardián
// (`prueba-check.mjs`) ya sabe rechazar unas notas que no dicen cómo se probó,
// pero un script que hay que acordarse de lanzar es un script que se salta el
// día que tienes prisa, y el día que tienes prisa es justo cuando publicas algo
// sin probar. Así que va DENTRO del comando que sube la versión: no se puede
// publicar sin pasar por él.
//
// Hace lo mismo que se hacía a mano, en el mismo orden:
//   1. el guardián sobre las notas,
//   2. la copia de nombre fijo (`Adeorq-setup.exe`), de la que cuelgan los
//      botones del README y de la web,
//   3. `gh release create` con el exe, su firma, la copia y el `latest.json`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { revisar } from "./prueba-check.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = "C:/ct/release/bundle/nsis";
const REPO = "Mun1to/Adeorq-releases";

const notas = process.argv[2];
if (!notas) {
  console.error("Dime la ruta de las notas de la versión.");
  process.exit(1);
}
if (!fs.existsSync(notas)) {
  console.error(`No encuentro las notas: ${notas}`);
  process.exit(1);
}

// 1. El guardián. Antes que nada, para no dejar a medias una publicación.
const r = revisar(fs.readFileSync(notas, "utf8"));
if (!r.ok) {
  console.error(`\nESTA VERSIÓN NO SALE.\n\n  ${r.por}\n`);
  process.exit(1);
}
console.log(`Prueba declarada — ${r.escalon}: ${r.detalle}\n`);

const version = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")).version;
const exe = `${BUNDLE}/Adeorq_${version}_x64-setup.exe`;
const sig = `${exe}.sig`;
const fijo = `${BUNDLE}/Adeorq-setup.exe`;
const latest = path.join(RAIZ, "latest.json").split(path.sep).join("/");

for (const f of [exe, sig, latest]) {
  if (!fs.existsSync(f)) {
    console.error(`Falta ${f}. ¿Se ha compilado la ${version}?`);
    process.exit(1);
  }
}
const dentro = JSON.parse(fs.readFileSync(latest, "utf8")).version;
if (dentro !== version) {
  console.error(`El latest.json dice ${dentro} y el paquete es ${version}.`);
  process.exit(1);
}

// 2. La copia de nombre fijo: sin ella, los tres botones de descarga dan 404.
fs.copyFileSync(exe, fijo);

// 3. Y la release.
console.log(`Publicando la ${version}…`);
const salida = execFileSync(
  "gh",
  [
    "release", "create", `v${version}`,
    exe, sig, fijo, latest,
    "--repo", REPO,
    "--title", `Adeorq ${version}`,
    "--notes-file", notas,
  ],
  { encoding: "utf8" },
);
console.log(salida.trim());
