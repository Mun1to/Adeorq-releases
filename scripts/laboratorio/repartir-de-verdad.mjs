// El menú «Reparte lo que tienes abierto» (el botón de la cabecera de la
// Cabina) en una Adeorq aislada, con terminales de verdad:
//   · seis consolas abiertas por el MCP (sin cuota: son `shell`);
//   · el botón es un icono dibujado, no el carácter ⊞;
//   · la rejilla marca la que les va a seis y dice «3 columnas y 2 filas»;
//   · la casilla de dos columnas de cuatro reparte las seis en dos de tres;
//   · con dos minimizadas, la 2x2 llena la pantalla sin huecos (antes una
//     minimizada se quedaba con su sitio y salía un agujero);
//   · «una grande» deja la primera sola y ancha;
//   · sin cárceles ni rótulos en mayúsculas en el menú, y la de una grande con
//     el cristal al pasar el ratón. Fotos en `--fotos`.
//
//   cargo build --manifest-path src-tauri/Cargo.toml
//   pnpm dev
//   node scripts/laboratorio/repartir-de-verdad.mjs [--fotos <carpeta>]
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirAislada, carceles, conRatonEncima, dormir, EXE, hasta, mayusculas } from "./aislada.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const iFotos = args.indexOf("--fotos");
const FOTOS = resolve(iFotos >= 0 ? args[iFotos + 1] : join(RAIZ, ".playwright-mcp", "repartir"));
mkdirSync(FOTOS, { recursive: true });

let fallos = 0;
const dice = (bien, texto) => {
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${texto}`);
};

// Una copia del binario: así otra sesión puede recompilar C:\ct mientras tanto.
const exe = join(tmpdir(), `adeorq-repartir-${process.pid}.exe`);
copyFileSync(EXE, exe);
const a = await abrirAislada({ nombre: "repartir", puertoMcp: 3931, depurar: 9431, fotos: FOTOS, exe });
const v = () => a.v;

/** Los paneles que se ven, con su sitio en % del mosaico, en orden de lectura. */
const visibles = () =>
  v().js(`[...document.querySelectorAll("section.pane")]
    .filter((e) => e.style.visibility !== "hidden" && parseFloat(e.style.width) > 0)
    .map((e) => { const d = (s) => Math.round(parseFloat(s) * 100) / 100; return { x: d(e.style.left), y: d(e.style.top), w: d(e.style.width), h: d(e.style.height) }; })
    .sort((p, q) => p.x - q.x || p.y - q.y)`);
/** Cuántas terminales hay en cada columna, de izquierda a derecha. */
const columnas = (ps) => {
  const xs = [...new Set(ps.map((p) => p.x))].sort((p, q) => p - q);
  return xs.map((x) => ps.filter((p) => p.x === x).length);
};
/** Que entre todas tapen el mosaico entero sin pisarse: el área suma 100 × 100. */
const sinHuecos = (ps) => Math.abs(ps.reduce((s, p) => s + p.w * p.h, 0) - 10000) <= ps.length;
const clic = (sel) => v().js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const abrirMenu = async () => {
  if (!(await v().js(`!!document.querySelector(".layout-pop")`))) await clic(".layout-btn");
  return hasta(() => v().js(`!!document.querySelector(".layout-pop")`), 5000, 100);
};
const cuenta = () => v().js(`document.querySelector(".layout-cuenta")?.textContent ?? ""`);
const fotoMenu = async (archivo) => {
  const r = await v().js(`(() => { const b = document.querySelector(".layout-pop").getBoundingClientRect(); return { x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 }; })()`);
  return a.foto(r, archivo);
};

try {
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await hasta(async () => /Arranque de Adeorq/.test((await agente.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(1500);
  await clic('.topbar .tab[data-tab="cabina"]');
  for (let i = 1; i <= 6; i++) {
    await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: `Consola ${i}`, brief: "" });
    await dormir(500);
  }
  const seis = await hasta(async () => ((await visibles()).length === 6 ? true : null), 20_000, 500);
  dice(!!seis, `seis terminales en el mosaico (${(await visibles()).length})`);

  // --- el botón ---------------------------------------------------------------
  const boton = await v().js(`(() => { const b = document.querySelector(".layout-btn"); return b ? { svg: !!b.querySelector("svg"), texto: b.textContent.trim() } : null; })()`);
  dice(!!boton?.svg && !boton.texto.includes("⊞"), `el botón es un icono dibujado (${JSON.stringify(boton)})`);

  // --- el menú con seis -------------------------------------------------------
  dice(!!(await abrirMenu()), "el menú se abre");
  const celdas = await v().js(`[document.querySelectorAll(".layout-celda").length, document.querySelectorAll('.layout-celda[data-on="true"]').length]`);
  dice(celdas[0] === 16 && celdas[1] === 6, `16 casillas y 6 marcadas para seis terminales (${celdas.join(" y ")})`);
  dice((await cuenta()) === "3 columnas y 2 filas: caben 6", `dice «${await cuenta()}»`);
  console.log(`      foto: ${await fotoMenu("repartir-menu-seis.png")}`);
  const c = await carceles(v(), ".layout-pop");
  dice(c.fallos.length === 0, `sin cárceles en el menú${c.fallos.length ? `: ${JSON.stringify(c.fallos).slice(0, 300)}` : ""}`);
  const m = await mayusculas(v(), ".layout-pop");
  dice(m.fallos.length === 0, `sin rótulos en mayúsculas en el menú${m.fallos.length ? `: ${JSON.stringify(m.fallos).slice(0, 300)}` : ""}`);
  const encima = await conRatonEncima(v(), ".layout-grande");
  dice(
    !!encima && /none/.test(encima.antes.fondo) && /gradient/.test(encima.encima.fondo),
    `«una grande» suelta en reposo y de cristal con el ratón encima (${encima?.antes.fondo} → ${encima?.encima.fondo.slice(0, 40)}…)`,
  );

  // --- dos columnas de cuatro con seis terminales ------------------------------
  await clic('.layout-celda[aria-label="2 por 4"]');
  await dormir(600);
  let ps = await visibles();
  dice(columnas(ps).join() === "3,3" && sinHuecos(ps), `la casilla 2 × 4 con seis: dos columnas de tres, sin huecos (${columnas(ps).join(",")})`);
  dice(!(await v().js(`!!document.querySelector(".layout-pop")`)), "al elegir, el menú se cierra");

  // --- con dos minimizadas -----------------------------------------------------
  for (let i = 0; i < 2; i++) {
    await v().js(`(() => { const b = [...document.querySelectorAll("section.pane")].filter((e) => e.style.visibility !== "hidden")[0]?.querySelector('.pane-btn[data-tip^="Minimizar"]'); b?.click(); return !!b; })()`);
    await dormir(500);
  }
  ps = await visibles();
  dice(ps.length === 4, `dos minimizadas: se ven cuatro (${ps.length})`);
  await abrirMenu();
  dice((await cuenta()) === "2 columnas y 2 filas: caben 4", `el menú cuenta solo las que se ven: «${await cuenta()}»`);
  await clic('.layout-celda[aria-label="2 por 2"]');
  await dormir(600);
  ps = await visibles();
  dice(
    columnas(ps).join() === "2,2" && ps.every((p) => p.w === 50 && p.h === 50),
    `la 2x2 con dos minimizadas: cuatro cuartos, sin hueco (${JSON.stringify(ps)})`,
  );
  console.log(`      foto: ${await a.foto(null, "repartir-2x2-con-minimizadas.png")}`);

  // --- una grande y el resto al lado ------------------------------------------
  await abrirMenu();
  await clic(".layout-grande");
  await dormir(600);
  ps = await visibles();
  dice(
    columnas(ps).join() === "1,3" && ps[0].h === 100 && ps[0].w > ps[1].w,
    `una grande con cuatro: la primera sola y más ancha, tres al lado (${columnas(ps).join(",")}, ${Math.round(ps[0].w)} % frente a ${Math.round(ps[1]?.w)} %)`,
  );
  console.log(`      foto: ${await a.foto(null, "repartir-una-grande.png")}`);

  // --- y las minimizadas vuelven sin perderse ---------------------------------
  const todas = await agente.llamar("get_active_panes", {});
  dice(((todas.texto || "").match(/Consola \d/g) ?? []).length >= 6, "las seis siguen abiertas (las dos minimizadas también)");
} finally {
  await a.cerrar();
  rmSync(exe, { force: true });
}

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
