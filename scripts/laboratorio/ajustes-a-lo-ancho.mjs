// Ajustes a lo ancho, en una Adeorq aislada.
//
// Munir, 2026-10-21, con la captura de Ajustes en su monitor de 1.920: «hay un
// pedazo de espacio vacío aquí». El marco llevaba un tope de 1100 y dejaba 724
// px en negro. De tres caminos eligió el de una tarjeta debajo de otra a todo lo
// ancho, con las filas de ajuste de dos en dos dentro (`07-ajustes.css`). Esto
// pasa por cada sección a 1.920 y a 1.280 en el binario de verdad y mira lo que
// ese cambio prometía:
//   - la hoja llega al borde (nada vacío a la derecha);
//   - con la tarjeta repartida, ningún mando a más de 900 px de su nombre (con
//     el tope eran unos 800): estirar sin más lo dejaba a 1.500;
//   - ningún botón estirado a lo ancho (en una rejilla se estiran solos);
//   - la explicación de «Que las terminales aguanten» debajo de SU fila;
//   - por debajo de 1000 px de hoja, la tarjeta en una columna, como antes.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev                                            (el binario de desarrollo carga de ahí)
//   node scripts/laboratorio/ajustes-a-lo-ancho.mjs [carpeta para las fotos]
//
// Deja una foto por sección y ancho, y sale con 1 si algo no se cumple.
import { tmpdir } from "node:os";
import { abrirAislada, dormir } from "./aislada.mjs";

const FOTOS = process.argv[2] || tmpdir();
const ANCHOS = [
  [1920, 1080],
  [1280, 800],
];

// Lo que se mide en la página, con la sección ya abierta y arriba del todo.
const MEDIR = `(() => {
  const panel = document.querySelector(".panel.settings");
  panel.scrollTop = 0;
  const hoja = document.querySelector(".set-hoja");
  const hr = hoja.getBoundingClientRect();
  let lejos = 0;
  let quien = "";
  for (const e of hoja.querySelectorAll("*")) {
    if (!getComputedStyle(e).display.includes("flex") || e.children.length < 2) continue;
    const a = e.firstElementChild.getBoundingClientRect();
    const z = e.lastElementChild.getBoundingClientRect();
    if (!a.width || !z.width || Math.abs(a.top - z.top) > 30) continue;
    const d = Math.round(z.left - a.left);
    if (d > lejos) { lejos = d; quien = (e.className || e.tagName) + " · " + (e.textContent || "").trim().slice(0, 40); }
  }
  const estirados = [...hoja.querySelectorAll("button")]
    .filter((b) => b.getBoundingClientRect().width > 500)
    .map((b) => b.textContent.trim().slice(0, 30) + " (" + Math.round(b.getBoundingClientRect().width) + ")");
  const nota = document.querySelector(".setting-con-nota");
  let notaBien = null;
  if (nota) {
    const fila = nota.querySelector(".setting-row").getBoundingClientRect();
    const p = nota.querySelector(".setting-line").getBoundingClientRect();
    notaBien = p.top >= fila.bottom - 1 && Math.abs(p.left - fila.left) < 2;
  }
  const tarjeta = hoja.querySelector(".panel-card");
  const marco = document.querySelector(".set-marco");
  return {
    hoja: Math.round(hr.width),
    vacio: Math.round(panel.getBoundingClientRect().right - parseFloat(getComputedStyle(panel).paddingRight) - hr.right),
    ancha: marco.hasAttribute("data-ancha"),
    rejilla: tarjeta ? getComputedStyle(tarjeta).display : null,
    bajar: Math.max(0, panel.scrollHeight - panel.clientHeight),
    lejos, quien, estirados, notaBien,
  };
})()`;

const a = await abrirAislada({ nombre: "ajustes-ancho", puertoMcp: 39319, depurar: 9347, fotos: FOTOS });
const { v } = a;
const fallos = [];
try {
  await v.js(`document.querySelector('.topbar .tab[data-tab="ajustes"]')?.click(); "ok"`);
  await dormir(1200);
  const secciones = await v.js(`[...document.querySelectorAll(".set-tab .set-tab-nom")].map((e) => e.textContent.trim())`);
  for (const [ancho, alto] of ANCHOS) {
    await v.enviar("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await dormir(600);
    for (const [i, sec] of secciones.entries()) {
      // Pulsar la que ya está abierta pliega su índice: solo se pulsa si no lo está.
      await v.js(`(() => { const b = document.querySelectorAll(".set-tab")[${i}]; if (!b.hasAttribute("data-on")) b.click(); return true; })()`);
      await dormir(700);
      const m = await v.js(MEDIR);
      const donde = `${sec} a ${ancho}`;
      console.log(
        `${donde.padEnd(22)} hoja ${String(m.hoja).padStart(4)}  vacío ${String(m.vacio).padStart(3)}  ${String(m.rejilla).padEnd(5)}  bajar ${String(m.bajar).padStart(4)}  lejos ${String(m.lejos).padStart(4)}${m.notaBien === null ? "" : `  nota ${m.notaBien ? "bien" : "MAL"}`}`,
      );
      if (m.vacio > 4) fallos.push(`${donde}: ${m.vacio} px vacíos a la derecha`);
      if (m.rejilla === "grid" && m.lejos > 900) fallos.push(`${donde}: un mando a ${m.lejos} px de su nombre (${m.quien})`);
      if (m.estirados.length) fallos.push(`${donde}: botones estirados: ${m.estirados.join(", ")}`);
      if (m.notaBien === false) fallos.push(`${donde}: la explicación no está debajo de su fila`);
      if (!m.ancha && m.hoja >= 1000 && m.rejilla !== "grid") fallos.push(`${donde}: con ${m.hoja} px de hoja la tarjeta no se repartió`);
      if (m.hoja < 1000 && m.rejilla === "grid") fallos.push(`${donde}: repartida con solo ${m.hoja} px de hoja`);
      await a.foto(null, `ajustes-ancho-${ancho}-${i}.png`);
    }
  }
} finally {
  await a.cerrar();
}

console.log(fallos.length ? `\n${fallos.length} cosas que no se cumplen:\n  ${fallos.join("\n  ")}` : "\nTodo se cumple.");
console.log(`Fotos en ${FOTOS}`);
process.exit(fallos.length ? 1 : 0);
