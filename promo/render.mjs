/**
 * Saca la pieza en los dos idiomas, con su sonido recién hecho.
 *
 *   node render.mjs                  -> out/adeorq-es.mp4 y out/adeorq-en.mp4
 *   node render.mjs Promo es         -> solo el español
 *   node render.mjs Transiciones     -> out/transiciones.mp4 (el muestrario de pasos, con su número)
 *
 * Existe para que el idioma no se pueda olvidar: con un script de `render` por
 * idioma, el día que se toca el guion se renderiza uno y se publica el otro
 * viejo. Aquí o salen los dos o se pide uno a propósito.
 *
 * ⚠ El CRF va AQUÍ, en la orden del MP4, y no en `remotion.config.ts`: puesto
 * allí se le aplica a cualquier otro códec que se pida, y el que no lo admite
 * tira el render con un error que no menciona a ese archivo.
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const [pieza = "Promo", solo] = process.argv.slice(2);
const IDIOMAS = ["es", "en"];

if (!["Promo", "Transiciones"].includes(pieza) || (solo && !IDIOMAS.includes(solo))) {
  console.error("Uso: node render.mjs [Promo|Transiciones] [es|en]");
  process.exit(1);
}

/* Una sola línea y por el shell: en Windows `pnpm` es un `.cmd`, que Node no
   lanza sin él. Lo único que entra de fuera (la pieza y el idioma) ya se ha
   cotejado arriba contra su lista, así que no hay nada que escapar. */
function lanza(linea) {
  const r = spawnSync(linea, { cwd: aqui, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// El sonido primero: `public/sonido/hecho/` no se versiona, y sin él el render
// se cae a medias buscando un archivo que no existe.
lanza("node sonido.mjs");

// El muestrario no tiene idioma ni voz: es para mirar los pasos y elegir.
if (pieza === "Transiciones") {
  lanza("pnpm exec remotion render src/index.ts Transiciones out/transiciones.mp4 --crf=20");
  process.exit(0);
}

for (const idioma of solo ? [solo] : IDIOMAS) {
  lanza(`pnpm exec remotion render src/index.ts Promo-${idioma} out/adeorq-${idioma}.mp4 --crf=18`);
}
