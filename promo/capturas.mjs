/**
 * Trae las capturas de la web al vídeo.
 *
 * Las pantallas de Adeorq viven en `web/assets/screens/` porque son las de la
 * página de descarga. El vídeo usa ESAS MISMAS y no una copia suya: dos copias
 * de la misma imagen es una que se queda vieja, y aquí lo que se queda viejo se
 * publica. Por eso `public/pantallas/` está en el `.gitignore` y se rellena
 * corriendo esto.
 *
 * Si allí hay una carpeta `es/` o `en/`, se trae también: el vídeo de cada
 * idioma usa la captura de su carpeta cuando existe, y la suelta cuando no.
 *
 *   node capturas.mjs      (o `pnpm capturas`)
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, "..", "web", "assets", "screens");
const destino = join(aqui, "public", "pantallas");

function trae(carpeta) {
  const de = join(origen, carpeta);
  if (!existsSync(de)) return [];
  const fotos = readdirSync(de).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (fotos.length) mkdirSync(join(destino, carpeta), { recursive: true });
  for (const f of fotos) cpSync(join(de, f), join(destino, carpeta, f));
  return fotos.map((f) => (carpeta ? `${carpeta}/${f}` : f));
}

const fotos = [...trae(""), ...trae("es"), ...trae("en")];
if (fotos.length === 0) {
  console.error(`No hay ninguna captura en ${origen}`);
  process.exit(1);
}

console.log(`${fotos.length} capturas traídas de web/assets/screens:`);
for (const f of fotos) console.log(`  · ${f}`);
