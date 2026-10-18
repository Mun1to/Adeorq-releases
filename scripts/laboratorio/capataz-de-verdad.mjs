// El Capataz (`Foreman.tsx`) en una Adeorq aislada: la ventana flotante que se
// abre con su botón de la barra de arriba (o Ctrl+Mayús+A), que desde el
// 2026-10-18 es la ÚNICA forma que tiene.
// Hasta entonces llevaba además una tarjeta para la vista Panel (`mode="card"`),
// que nadie montaba desde que el inicio pasó a ser «Pídeselo a Adeo».
//
//   node scripts/laboratorio/capataz-de-verdad.mjs [carpeta para las fotos]
//
// Mira que se abre con su botón y con el cuadro con el foco, que lo escrito
// sobrevive a cerrar con Esc y volver a abrir (el borrador), que no queda nada
// de la tarjeta, y que dentro no hay cárceles ni mayúsculas espaciadas.
// Necesita lo mismo que `aislada.mjs` (el binario de desarrollo y `pnpm dev`).
import { tmpdir } from "node:os";
import { abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const FOTOS = process.argv[2] || tmpdir();
let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

const a = await abrirAislada({ nombre: "capataz", puertoMcp: 39317, depurar: 9345, fotos: FOTOS });
const { v } = a;
const atajo = () =>
  v.js(`(() => { const b = document.querySelector(".foreman-call"); if (!b) return false; b.click(); return true; })()`);
const abierto = () => v.js(`!!document.querySelector(".foreman-overlay .foreman-box")`);

try {
  await atajo();
  dice(!!(await hasta(abierto, 8000)), "su botón de arriba abre el Capataz flotante");
  dice(await v.js(`document.activeElement?.classList.contains("foreman-input") === true`), "nace con el foco en su cuadro");
  dice((await v.js(`document.querySelectorAll(".foreman-card").length`)) === 0, "no queda nada de la tarjeta del Panel");
  await dormir(600);
  await a.foto(null, "capataz-abierto.png");
  const c = await carceles(v, ".foreman-box");
  const m = await mayusculas(v, ".foreman-box");
  dice(c.fallos.length === 0 && m.fallos.length === 0, `sin cárceles ni mayúsculas espaciadas dentro (${[...c.fallos, ...m.fallos].join(" · ") || "ninguna"})`);

  // Escribir como lo haría React: el valor por su setter nativo y un «input».
  await v.js(`(() => {
    const t = document.querySelector(".foreman-input");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "abre lo de Orquio");
    t.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await dormir(300);
  await v.js(`(() => { document.querySelector(".foreman-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); return true; })()`);
  dice(!!(await hasta(async () => !(await abierto()), 5000)), "Esc lo cierra");
  await atajo();
  await hasta(abierto, 8000);
  const vuelto = await v.js(`document.querySelector(".foreman-input")?.value ?? ""`);
  dice(vuelto === "abre lo de Orquio", `lo escrito vuelve al abrirlo otra vez («${vuelto}»)`);
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
