/**
 * Saca una pieza en los dos idiomas, con su sonido recién hecho.
 *
 *   node render.mjs Promo            -> out/adeorq-es.mp4 y out/adeorq-en.mp4 (la entera)
 *   node render.mjs Media            -> out/adeorq-media-es.mp4 y -en (sin las escenas opcionales)
 *   node render.mjs Vertical         -> out/adeorq-vertical-es.mp4 y -en
 *   node render.mjs Corta            -> out/adeorq-corta-es.mp4 y -en
 *   node render.mjs Corta gif        -> out/adeorq-es.gif y -en (sin sonido)
 *   node render.mjs Promo mp4 en     -> solo el inglés
 *   node render.mjs Transiciones     -> out/transiciones.mp4 (el muestrario de pasos, con su número)
 *
 * Existe para que el idioma no se pueda olvidar: con un script de `render` por
 * idioma, el día que se toca el guion se renderiza uno y se publica el otro
 * viejo. Aquí o salen los dos o se pide uno a propósito.
 *
 * ⚠ El CRF va AQUÍ, en la orden del MP4, y no en `remotion.config.ts`: puesto
 * allí se le aplica también al GIF, que no lo admite, y el render se cae con
 * un error que no menciona a ese archivo.
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const [pieza = "Promo", formato = "mp4", solo] = process.argv.slice(2);
const IDIOMAS = ["es", "en"];
const NOMBRE = { Promo: "adeorq", Media: "adeorq-media", Vertical: "adeorq-vertical", Corta: "adeorq-corta" };

if (pieza !== "Transiciones" && (!NOMBRE[pieza] || !["mp4", "gif"].includes(formato) || (solo && !IDIOMAS.includes(solo)))) {
  console.error("Uso: node render.mjs <Promo|Media|Vertical|Corta|Transiciones> [mp4|gif] [es|en]");
  process.exit(1);
}

/* Una sola línea y por el shell: en Windows `pnpm` es un `.cmd`, que Node no
   lanza sin él. Lo único que entra de fuera (la pieza, el formato, el idioma)
   ya se ha cotejado arriba contra su lista, así que no hay nada que escapar. */
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
  const id = `${pieza}-${idioma}`;
  if (formato === "gif") {
    lanza(`pnpm exec remotion render src/index.ts ${id} out/adeorq-${idioma}.gif --codec=gif --every-nth-frame=3 --scale=0.375`);
  } else {
    lanza(`pnpm exec remotion render src/index.ts ${id} out/${NOMBRE[pieza]}-${idioma}.mp4 --crf=18`);
  }
}
