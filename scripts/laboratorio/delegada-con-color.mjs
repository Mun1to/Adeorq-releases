// Una terminal que abre otra sesión lleva el color de su proyecto.
//
// Munir, 2026-10-21: «que las sesiones que crean otras sesiones para crear
// flujos de trabajo les cambie de color el header de la sesión al proyecto el
// cual se está trabajando, para identificarlas más fácilmente». El color sale de
// `coloresDeProyectos` con `proyectoDeCarpeta` (en `App.tsx`) y lo pinta
// `.pane[data-delegada]` (`14-lienzo-piezas.css`).
//
// En una Adeorq aislada: una consola «Madre» abierta por un agente sin panel, y
// desde ella, por `open_pane`, una «Hija» en el proyecto demo. Se mira que la
// hija lleve `data-delegada`, su `--proy` y una cabecera teñida, y la madre no.
//
//   cargo build --manifest-path src-tauri/Cargo.toml   (deja C:\ct\debug\adeorq.exe)
//   pnpm dev
//   node scripts/laboratorio/delegada-con-color.mjs [exe]
import { join } from "node:path";
import { EXE, abrirAislada, dormir, hasta } from "./aislada.mjs";

const exe = process.argv[2] ?? EXE;
let fallos = 0;
const dice = (bien, texto, detalle = "") => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}${!bien && detalle ? `  (${detalle})` : ""}`);
};

const puertoMcp = 47_000 + (process.pid % 900);
const a = await abrirAislada({ nombre: "delegada-color", puertoMcp, depurar: 9850 + (process.pid % 100), exe });
try {
  await hasta(() => a.v.js(`(() => { const t = [...document.querySelectorAll(".tab")].find((x) => /Cabina/.test(x.textContent ?? "")); t?.click(); return !!t; })()`), 15_000);
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const idDe = (r) => Number(/(?:Terminal|terminal|panel)\s+(\d+)/.exec(r.texto || "")?.[1]);
  const madre = idDe(await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Madre", brief: "" }));
  dice(Number.isFinite(madre), "se abre la terminal madre");
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${madre}"]')`), 15_000, 400);
  const desdeMadre = a.puente(madre);
  await desdeMadre.pedir("initialize", { clientInfo: { name: "claude-code" } });
  const hija = idDe(await desdeMadre.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Hija", brief: "" }));
  dice(Number.isFinite(hija), "la madre abre una hija con open_pane");
  await hasta(() => a.v.js(`!!document.querySelector('[data-pane-id="${hija}"]')`), 15_000, 400);
  await dormir(800);

  const mira = (id) =>
    a.v.js(`(() => {
      const p = document.querySelector('[data-pane-id="${id}"]');
      if (!p) return "null";
      const h = p.querySelector(".pane-head");
      return JSON.stringify({ delegada: p.getAttribute("data-delegada"), proy: p.style.getPropertyValue("--proy"), cabecera: h ? getComputedStyle(h).backgroundImage : "", de: p.querySelector(".pane-de")?.textContent ?? null });
    })()`).then((x) => JSON.parse(x ?? "null"));
  const m = await mira(madre);
  const h = await mira(hija);
  dice(h?.delegada === "true", "la hija lleva la marca de delegada", JSON.stringify(h));
  dice(/^hsl\(/.test(h?.proy ?? ""), "con el color de su proyecto", h?.proy);
  dice(/gradient/.test(h?.cabecera ?? ""), "y la cabecera teñida");
  dice(/Madre/.test(h?.de ?? ""), "dice de quién es", h?.de);
  dice(!m?.delegada && !m?.proy, "la madre, que no la abrió otra sesión, va sin color", JSON.stringify(m));
  // La foto con el foco en la madre: la hija se ve como se ve de reojo.
  await a.v.js(`document.querySelector('[data-pane-id="${madre}"] .pane-head')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); "ok"`);
  await dormir(500);
  const r = await a.v.js(`JSON.stringify(document.querySelector('[data-pane-id="${hija}"]').getBoundingClientRect())`).then((x) => JSON.parse(x));
  const foto = await a.foto({ x: Math.max(0, r.x - 260), y: Math.max(0, r.y - 10), width: Math.min(1400, r.width + 520), height: Math.min(500, r.height + 20) }, "delegada-con-color.png");
  console.log(`      foto: ${foto}`);
  agente.cerrar();
  desdeMadre.cerrar();
} finally {
  await a.cerrar();
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exitCode = fallos ? 1 : 0;
