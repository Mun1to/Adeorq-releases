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

/* 1-bis. Y que el CÓDIGO del repo público ya sea el de esta versión.
 *
 * ── EL FALLO QUE ESTO CORTA, MEDIDO DOS VECES SEGUIDAS ─────────────────────
 *
 * `Adeorq-releases` tiene su propio `.github/workflows/linux.yml`, que se
 * dispara con `release: published`, compila el AppImage y sube su `latest.json`
 * con `tauri-action`. Ese workflow compila **el código que haya en el público en
 * ese momento**, y hasta hoy el orden era publicar la release primero y el
 * código después. O sea que el workflow compilaba la versión ANTERIOR y su
 * `latest.json` pisaba el bueno con un número viejo.
 *
 * Consecuencia: la release está publicada, el instalador está bien, y el
 * updater compara contra la versión de antes, así que **a nadie le sale la
 * actualización**. Y no salta ninguna alarma, porque todo lo demás está bien.
 *
 * Medido el 2026-09-09 y otra vez el 2026-09-10, con trece minutos exactos de
 * retraso las dos veces (lo que tarda el AppImage en compilar):
 *
 *   0.9.154 publicada 20:53:38 · workflow 20:53:39 · asset pisado a las 21:06
 *   0.9.155 publicada 09:05:00 · workflow 09:05:22 · asset pisado a las 09:18
 *
 * El orden correcto, entonces: **primero el código, después la release.**
 * `node scripts/publicar-codigo.mjs`, empujar, y solo entonces publicar. Así el
 * workflow compila lo mismo que hay dentro del instalador y su `latest.json`
 * dice el mismo número.
 */
try {
  const publico = execFileSync(
    "gh",
    ["api", "repos/Mun1to/Adeorq-releases/contents/package.json", "--jq", ".content"],
    { encoding: "utf8" },
  );
  const suVersion = JSON.parse(Buffer.from(publico, "base64").toString("utf8")).version;
  if (suVersion !== version) {
    console.error(
      `\nESTA VERSIÓN NO SALE.\n\n` +
        `  El código del repo público va por la ${suVersion} y esto es la ${version}.\n` +
        `  Si se publica ahora, el workflow de Linux del público compilará la\n` +
        `  ${suVersion} y su latest.json pisará al tuyo: nadie recibirá la\n` +
        `  actualización. Pasó con la 0.9.154 y con la 0.9.155.\n\n` +
        `  Publica el código PRIMERO y vuelve:\n` +
        `      node scripts/publicar-codigo.mjs\n` +
        `      cd <la carpeta que te diga> && git push origin main\n`,
    );
    process.exit(1);
  }
} catch (e) {
  // Sin red o sin `gh` no se bloquea la publicación, pero se avisa: es una
  // comprobación, no un permiso.
  console.error(`  (no se pudo comprobar el código del público: ${e.message.trim()})`);
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
