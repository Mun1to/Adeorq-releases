// Ninguna capacidad de Tauri le abre el puente a una página de fuera.
//
//     node scripts/capacidades-check.mjs      (va en `pnpm comprobar`)
//
// Nació el 2026-10-15, al medir con el programa de verdad que una página
// metida en el panel web (`WebPane.tsx`, un iframe sin `sandbox`) no llega a
// las órdenes de la app (`scripts/laboratorio/marco-sin-tauri.mjs`). En Windows
// el puente de Tauri SÍ está dentro de ese marco y su `invoke` llega a Rust; lo
// único que lo frena es que las capacidades valen solo para la dirección de la
// propia app («URL: local»). Una capacidad con `remote` (una lista de
// direcciones de fuera) le daría a esas páginas las mismas manos que a la
// interfaz: abrir terminales, escribir en ellas, leer las claves. Por eso no
// entra sin que alguien lo decida en voz alta y quite esta guarda.
//
// Mira los ficheros de `src-tauri/capabilities/` y las capacidades escritas
// dentro de `tauri.conf.json`, y antes de nada se prueba a sí mismo con una
// capacidad de mentira que sí lleva `remote`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(RAIZ, "src-tauri", "capabilities");
const CONF = path.join(RAIZ, "src-tauri", "tauri.conf.json");

/** Las capacidades que abren el puente a direcciones de fuera, por su nombre. */
function abiertasAFuera(capacidades) {
  return capacidades.filter((c) => c && typeof c === "object" && c.remote !== undefined).map((c) => c.identifier ?? "(sin nombre)");
}

// El propio vigilante, contra una que sí lleva `remote` y una que no.
const control = abiertasAFuera([
  { identifier: "de-fuera", windows: ["main"], remote: { urls: ["https://*.ejemplo.com"] }, permissions: ["core:default"] },
  { identifier: "de-casa", windows: ["main"], permissions: ["core:default"] },
]);
if (control.join() !== "de-fuera") {
  console.error(`capacidades-check: el vigilante no caza su propio control (${control.join() || "nada"})`);
  process.exit(1);
}

const capacidades = [];
const malas = [];
for (const nombre of fs.existsSync(CARPETA) ? fs.readdirSync(CARPETA) : []) {
  const texto = fs.readFileSync(path.join(CARPETA, nombre), "utf8");
  if (nombre.endsWith(".json")) capacidades.push(JSON.parse(texto));
  // Tauri también lee capacidades en TOML. Sin un lector de TOML aquí, basta
  // con ver la clave: en una capacidad, `remote` solo puede ser eso.
  else if (nombre.endsWith(".toml") && /^\s*(\[remote\]|remote\s*=)/m.test(texto)) malas.push(nombre);
}
// La configuración de siempre y las de cada plataforma (`tauri.linux.conf.json`…),
// que se mezclan encima y pueden traer capacidades propias.
const confs = [CONF, ...fs.readdirSync(path.dirname(CONF)).filter((n) => /^tauri\.[a-z]+\.conf\.json$/.test(n)).map((n) => path.join(path.dirname(CONF), n))];
for (const f of confs) {
  const conf = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const c of conf?.app?.security?.capabilities ?? []) if (typeof c === "object") capacidades.push(c);
}

malas.push(...abiertasAFuera(capacidades));
if (malas.length) {
  console.error(
    `capacidades-check: ${malas.join(", ")} lleva «remote»: una página de esas direcciones podría llamar a las órdenes de la app desde el panel web. ` +
      "Si es a propósito, decídelo con Munir y quita esta guarda en el mismo commit.",
  );
  process.exit(1);
}
console.log(`capacidades-check: ${capacidades.length} capacidad(es), ninguna abre el puente a direcciones de fuera`);
