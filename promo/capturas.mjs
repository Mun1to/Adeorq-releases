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
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, "..", "web", "assets", "screens");
const destino = join(aqui, "public", "pantallas");

const CARPETAS = ["", "es", "en"];

function hay(carpeta) {
  const de = join(origen, carpeta);
  if (!existsSync(de)) return [];
  return readdirSync(de).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
}

// Primero se mira qué hay, y solo si hay algo se vacía lo de aquí: una copia
// que se borra antes de saber que su original está es una copia perdida.
const fotos = CARPETAS.flatMap((carpeta) => hay(carpeta).map((f) => ({ carpeta, f })));
if (fotos.length === 0) {
  console.error(`No hay ninguna captura en ${origen}`);
  process.exit(1);
}

/* `public/pantallas/` es un espejo, no un almacén: lo que ya no está en la web
   tampoco se queda aquí. Sin esto seguían en la carpeta las seis capturas
   viejas, las que enseñaban proyectos de verdad, y el vídeo las cogía en
   cuanto a un idioma le faltaba la suya. */
rmSync(destino, { recursive: true, force: true });
for (const { carpeta, f } of fotos) {
  mkdirSync(join(destino, carpeta), { recursive: true });
  cpSync(join(origen, carpeta, f), join(destino, carpeta, f));
}

console.log(`${fotos.length} capturas traídas de web/assets/screens:`);
for (const { carpeta, f } of fotos) console.log(`  · ${carpeta ? `${carpeta}/` : ""}${f}`);
