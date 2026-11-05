// La caja de escribir del enjambre nace con su alto de dos líneas, no de 21 px.
//
//   node scripts/laboratorio/enjambre-caja-de-verdad.mjs [carpeta para las fotos] [exe]
//
// `CanvasEnjambre.tsx` ajusta el alto de la caja al texto con un `useLayoutEffect`
// que mide `scrollHeight`. Al montarse, con la pieza aún sin pintar, esa medida es
// 0 y la caja se quedaba en `height: 0px` (21 px con el relleno y el borde) hasta que
// alguien escribía algo: el texto de ayuda salía cortado y no había dónde escribir.
//
//  · recién pintado el enjambre, la caja mide lo de dos líneas (`rows={2}`), y el
//    texto de ayuda se lee entero;
//  · si se escribe mucho, crece hasta su tope de 140 px;
//  · si se borra, vuelve a dos líneas, no a nada.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const FOTOS = resolve(process.argv[2] || tmpdir());
const exe = resolve(process.argv[3] || EXE);
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${detalle ? `\n      ${detalle}` : ""}`);
};
for (const k of Object.keys(process.env)) if (/^CLAUDE/i.test(k)) delete process.env[k];

const ahora = Math.floor(Date.now() / 1000);
function sembrar(datos) {
  const dir = join(datos, "conserje");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "enj1.json"),
    JSON.stringify({ id: "enj1", titulo: "", turnos: [], trabajos: [], router: true, creada: ahora - 800, enjambre: true }),
  );
  writeFileSync(
    join(datos, "lienzo.json"),
    JSON.stringify({
      kind: "adeorq-lienzo",
      v: 1,
      guardado: new Date().toISOString(),
      proyecto: "demo",
      nodos: [{ tipo: "enjambre", id: "j1", x: 0, y: 0, w: 460, h: 600, conv: "enj1", nombre: "Los de la prueba", color: "verde", miembros: [], plegadas: false }],
      flechas: [],
      trazos: [],
    }),
  );
}

const medir = (v) =>
  v.js(`(() => {
    const e = document.querySelector(".enj-in");
    if (!e) return null;
    // offsetHeight y no el rectángulo: el lienzo va ampliado y el rectángulo lo sufre.
    return { alto: e.offsetHeight, inline: e.style.height, scroll: e.scrollHeight, cliente: e.clientHeight, ayuda: e.placeholder };
  })()`);

const a = await abrirAislada({
  nombre: "enjambre-caja",
  puertoMcp: 47_700 + (process.pid % 90),
  depurar: 9600 + (process.pid % 60),
  exe,
  fotos: FOTOS,
  sembrar,
  guarda: `localStorage.setItem("adeorq-lang", "es")`,
});
try {
  const { v } = a;
  await v.enviar("Page.reload");
  await dormir(1500);
  await hasta(() => v.js(`document.readyState === "complete" && !!document.querySelector(".app, #root > *")`), 20_000);
  await v.js(`(document.querySelector('[data-tab="lienzo"]')?.click(), "ok")`);
  const hay = await hasta(() => v.js(`!!document.querySelector(".enj-in")`), 20_000);
  dice(!!hay, "el enjambre del lienzo se pinta con su caja");
  await dormir(1200);

  // 1. Recién pintado.
  const m0 = await medir(v);
  dice(!!m0 && m0.alto >= 40, "recién pintado, la caja mide lo de dos líneas (40 px o más)", JSON.stringify(m0));
  dice(!!m0 && m0.cliente >= m0.scroll - 1, "y el texto de ayuda cabe sin cortarse", JSON.stringify(m0));
  await a.foto(null, "enjambre-caja-recien-pintada.png");

  // 2. Escribir mucho: crece hasta su tope.
  await v.js(`(() => {
    const e = document.querySelector(".enj-in");
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(e, Array.from({ length: 12 }, (_, i) => "línea " + i).join("\\n"));
    e.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await dormir(500);
  const m1 = await medir(v);
  dice(!!m1 && m1.alto > (m0?.alto ?? 0) && m1.alto <= 140, "con doce líneas la caja crece y se queda en su tope (140 px)", JSON.stringify(m1));
  await a.foto(null, "enjambre-caja-con-texto.png");

  // 3. Borrar: vuelve a dos líneas.
  await v.js(`(() => {
    const e = document.querySelector(".enj-in");
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(e, "");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await dormir(500);
  const m2 = await medir(v);
  dice(!!m2 && m2.alto >= 40, "y al borrarlo vuelve a las dos líneas, no a nada", JSON.stringify(m2));
} finally {
  await a.cerrar();
}

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
