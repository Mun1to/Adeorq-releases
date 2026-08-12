/**
 * Trae las capturas de la web al vídeo.
 *
 * Las pantallas de Adeorq viven en `web/assets/screens/` porque son las de la
 * página de descarga. El vídeo usa ESAS MISMAS y no una copia suya: dos copias
 * de la misma imagen es una que se queda vieja, y aquí lo que se queda viejo se
 * publica. Por eso `public/pantallas/` está en el `.gitignore` y se rellena
 * corriendo esto.
 *
 *   node capturas.mjs      (o `pnpm capturas`)
 */
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const origen = join(aqui, "..", "web", "assets", "screens");
const destino = join(aqui, "public", "pantallas");

mkdirSync(destino, { recursive: true });

const fotos = readdirSync(origen).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (fotos.length === 0) {
  console.error(`No hay ninguna captura en ${origen}`);
  process.exit(1);
}

for (const f of fotos) cpSync(join(origen, f), join(destino, f));
console.log(`${fotos.length} capturas traídas de web/assets/screens:`);
for (const f of fotos) console.log(`  · ${f}`);
