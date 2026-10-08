// Escribe el `latest.json` de la raíz para la versión que diga `package.json`,
// con la firma del `.sig` recién compilado y unas notas de una línea.
//
//   pnpm latest "<notas de una línea, sin comillas dobles>"
//
// Es el paso entre `pnpm tauri build` y el commit `release: X` (ver
// `docs/contexto/publicar.md`). Vivió en el scratchpad de una sesión y se usó
// seis veces seguidas antes de entrar aquí (regla W). Las notas van dentro de un
// JSON que lee el actualizador, así que nada de comillas dobles ni saltos; las
// de verdad, con su markdown, van aparte a `pnpm publicar-version`.
//
// Al acabar imprime el primer byte (tiene que ser 123, «{»: un 239 es un BOM, y
// rompe el build, ver la memoria del BOM de PowerShell) y la fecha del
// instalador, para notar si es de un build anterior.

import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = "C:/ct/release/bundle/nsis";
const version = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")).version;
const exe = `${BUNDLE}/Adeorq_${version}_x64-setup.exe`;
const notas = process.argv[2];
if (!notas || notas.includes('"') || notas.includes("\n")) {
  console.error("Las notas van en una línea y sin comillas dobles.");
  process.exit(1);
}
const sig = readFileSync(`${exe}.sig`, "utf8").trim();
const latest = {
  version,
  notes: notas,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms: {
    "windows-x86_64": {
      signature: sig,
      url: `https://github.com/Mun1to/Adeorq-releases/releases/download/v${version}/Adeorq_${version}_x64-setup.exe`,
    },
  },
};
const destino = path.join(RAIZ, "latest.json");
writeFileSync(destino, JSON.stringify(latest, null, 2) + "\n");
const bytes = readFileSync(destino);
console.log(
  `latest.json: ${version}, primer byte ${bytes[0]}, exe de ${statSync(exe).size} bytes, fecha del exe ${statSync(exe).mtime.toISOString()}`,
);
