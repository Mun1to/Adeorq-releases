// Los ids de los trazos del lienzo, de una apertura a la siguiente.
//
// Cada vez que el lienzo leía su tablero le ponía un sello DELANTE del id de
// cada trazo (`${sello}-${s.id}`), y como guarda al momento, el id que leía la
// vez siguiente ya traía todos los sellos anteriores: en el `lienzo.json` de
// Munir había ids de 2.376 caracteres (2026-10-21). Ahora el id nuevo es el
// sello y el número de orden.
//
// Una Adeorq aislada (`aislada.mjs`) con una COPIA de tu `lienzo.json` en su
// carpeta de datos (o un tablero de ejemplo si no tienes): se deja que el
// lienzo lo lea y lo vuelva a guardar, se recarga la ventana (que es abrir la
// app otra vez) y se mira que el id más largo no crece y que no se pierde
// ningún trazo.
//
//   cargo build --manifest-path src-tauri/Cargo.toml
//   pnpm dev
//   node scripts/laboratorio/trazos-al-reabrir.mjs
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrirAislada, dormir, hasta } from "./aislada.mjs";

const SUYO = join(process.env.LOCALAPPDATA ?? "", "Adeorq", "lienzo.json");
const EJEMPLO = {
  kind: "adeorq-canvas",
  v: 1,
  nodos: [],
  flechas: [],
  trazos: [
    { id: "mvhtw7d4-mvgfchuc-mvfq54la-d1123", tipo: "texto", puntos: [[0, 0]], color: "#4d9fff", grosor: 2, texto: "hola" },
    { id: "d0456", tipo: "linea", puntos: [[0, 0], [80, 40]], color: "#4d9fff", grosor: 2 },
  ],
};

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

let archivo = "";
let antes = [];
const a = await abrirAislada({
  nombre: "trazos",
  puertoMcp: 39480 + (process.pid % 10),
  depurar: 9480 + (process.pid % 10),
  sembrar: (datos) => {
    archivo = join(datos, "lienzo.json");
    if (existsSync(SUYO)) copyFileSync(SUYO, archivo);
    else writeFileSync(archivo, JSON.stringify(EJEMPLO));
    // Lo sembrado se mide AQUÍ: cuando la ventana está lista, el lienzo ya lo
    // ha leído y reescrito una vez.
    antes = ids();
  },
});
function ids() {
  return (JSON.parse(readFileSync(archivo, "utf8")).trazos ?? []).map((t) => t.id);
}
const largo = (lista) => Math.max(0, ...lista.map((i) => i.length));

try {
  const { v } = a;
  console.log(`      tablero sembrado: ${antes.length} trazos, el id más largo de ${largo(antes)} caracteres`);

  /** Espera a que el lienzo vuelva a escribir el archivo después de `desde`. */
  const reescrito = (desde) => hasta(() => statSync(archivo).mtimeMs > desde, 20_000, 300);

  // El lienzo lee su tablero al montarse; se entra en él por si no lo está.
  await v.js(`document.querySelector('[data-tab="lienzo"]')?.click(); "ok"`);
  const t1 = Date.now() - 60_000;
  dice(!!(await reescrito(t1)), "el lienzo lee el tablero y lo vuelve a guardar");
  await dormir(1500);
  const primera = ids();
  console.log(`      tras abrir una vez: el id más largo, ${largo(primera)} caracteres`);

  for (let vez = 2; vez <= 3; vez++) {
    const marca = statSync(archivo).mtimeMs;
    await v.enviar("Page.reload");
    // Sin el respiro, la pregunta la contesta todavía la página de antes.
    await dormir(1500);
    await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector('[data-tab="lienzo"]')`), 20_000);
    await v.js(`document.querySelector('[data-tab="lienzo"]')?.click(); "ok"`);
    dice(!!(await reescrito(marca)), `apertura ${vez}: vuelve a guardar`);
    await dormir(1500);
  }
  const ultima = ids();
  console.log(`      tras abrir tres veces: el id más largo, ${largo(ultima)} caracteres`);
  dice(ultima.length === antes.length, `no se pierde ningún trazo (${antes.length} → ${ultima.length})`);
  dice(largo(ultima) === largo(primera), `el id no crece de una apertura a otra (${largo(primera)} → ${largo(ultima)})`);
  dice(largo(ultima) <= 24, `y es corto (${largo(ultima)} caracteres)`);
  dice(new Set(ultima).size === ultima.length, "ni se repite ninguno");
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
