// Las cárceles y las mayúsculas espaciadas de la app, pantalla por pantalla, en
// una Adeorq aislada.
//
// Munir, 2026-10-17: «Estoy ya hasta los cojones de las cárceles y de los
// recuadros de los iconos y de los textos. Te lo digo ya por 500 veces». Los
// detectores (`carceles.js` y `mayusculas.js`) miran lo que hay en pantalla;
// esto los pasa por todo lo que se puede abrir sin ratón: las siete pestañas,
// las tres caras de la barra de la derecha, cada sección del Perfil y de
// Ajustes, la paleta (Ctrl+K) y los menús del clic derecho, con dos terminales
// abiertas para que la Cabina y el Lienzo tengan algo.
//
// Las caras de la barra y `mayusculas.js` entraron el 2026-10-18: el barrido no
// abría la barra, y el panel de Archivos llegó a Munir con sus pastillas
// («Edited») y sus rótulos en mayúsculas («WORKING», «CLAUDE TOUCHED») sin que
// nada lo cazara. Lo que pinta ese panel con un agente trabajando (la tarjeta y
// la lista) no sale aquí, que estas terminales son consolas: eso lo mira
// `archivos-agente.js` con los mismos detectores.
//
//   node scripts/laboratorio/carceles-por-pantallas.mjs [carpeta para las fotos]
//
// Dice cada cosa una vez, con las pantallas donde sale, deja una foto de cada
// parada en la carpeta y sale con 1 si queda alguna. Lo que Munir dijo que se
// queda no cuenta: esa lista (`APROBADAS`) vive en el propio `carceles.js`, que
// se lo salta y lo devuelve aparte, y aquí solo se resume. Una pieza nueva que
// caiga en duda se le pregunta con su foto de hoy y la suelta antes de tocarla.
// Necesita lo mismo que `aislada.mjs` (el binario de desarrollo y `pnpm dev`).
import { tmpdir } from "node:os";
import { abrirAislada, carceles, dormir, hasta, mayusculas } from "./aislada.mjs";

const FOTOS = process.argv[2] || tmpdir();

const vistas = new Map();
const aprobadasVistas = new Map();
const apuntar = (mapa, donde, lista) => {
  for (const c of lista) {
    if (!mapa.has(c)) mapa.set(c, new Set());
    mapa.get(c).add(donde);
  }
};

const a = await abrirAislada({ nombre: "carceles", puertoMcp: 39315, depurar: 9343, fotos: FOTOS });
const { v } = a;
let paradas = 0;
const parada = async (donde, archivo) => {
  await dormir(900);
  const { fallos, aprobadas } = await carceles(v);
  const espaciadas = (await mayusculas(v)).fallos;
  apuntar(vistas, donde, [...fallos, ...espaciadas]);
  apuntar(aprobadasVistas, donde, aprobadas);
  if (archivo) await a.foto(null, archivo);
  paradas++;
  console.log(`${String(fallos.length + espaciadas.length).padStart(3)}  ${donde}`);
};
const clic = (sel, i = 0) =>
  v.js(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return false; e.click(); return true; })()`);
const cuantos = (sel) => v.js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
// Una sola vez y desde el foco: la ventana la oye igual al subir, y Ctrl+K abre
// y cierra la paleta con la misma tecla (mandada dos veces, no se veía nunca).
const tecla = (key, extra = {}) =>
  v.js(`(() => { const o = { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true, ...${JSON.stringify(extra)} }; (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", o)); return true; })()`);
const clicDerecho = (sel) =>
  v.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.x + 20, clientY: r.y + 10, button: 2 })); return true; })()`);

try {
  // Dos terminales (consolas: sin cuota), para que haya cabeceras y nodos.
  const agente = a.puente(null);
  await agente.pedir("initialize", { clientInfo: { name: "claude-code" } });
  await hasta(async () => /Arranque de Adeorq/.test((await agente.llamar("get_active_panes", {})).texto || ""), 20_000, 500);
  await dormir(1500);
  await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Una", brief: "" });
  await v.js(`document.querySelector('[data-tab="lienzo"]')?.click(); "ok"`);
  await dormir(1200);
  await agente.llamar("open_pane", { cli: "shell", cwd: a.demo, name: "Otra", brief: "" });
  await dormir(1500);

  for (const tab of ["panel", "cabina", "chat", "decisiones", "lienzo", "perfil", "ajustes"]) {
    if (!(await clic(`.topbar .tab[data-tab="${tab}"]`))) {
      console.log(`  -  ${tab}: no hay pestaña (¿apagada?)`);
      continue;
    }
    await parada(tab, `carceles-${tab}.png`);

    if (tab === "cabina") {
      if (await clicDerecho(".pane-head")) await parada("cabina · clic derecho en la cabecera", "carceles-cabina-menu.png");
      await tecla("Escape");
      if (await clicDerecho(".project, .sess-row, .session-row")) await parada("barra lateral · clic derecho en un proyecto", "carceles-barra-menu.png");
      await tecla("Escape");
      await tecla("k", { ctrlKey: true, code: "KeyK" });
      await parada("paleta (Ctrl+K)", "carceles-paleta.png");
      await tecla("Escape");
      // Las caras de la barra de la derecha, una a una. El botón que va detrás
      // de la raya abre la web en el mosaico, no una cara: ese no.
      const caras = await cuantos(".franja .franja-btn:not(.franja-raya ~ .franja-btn)");
      for (let i = 0; i < caras; i++) {
        if (!(await clic(".franja .franja-btn", i))) continue;
        await dormir(500);
        const cual = (await v.js(`document.querySelector(".lateral-title")?.textContent?.trim() ?? ""`)) || String(i);
        await parada(`cabina · barra derecha · ${cual}`, `carceles-cabina-barra-${i}.png`);
        // La misma pulsación la cierra.
        await clic(".franja .franja-btn", i);
        await dormir(300);
      }
    }
    if (tab === "lienzo") {
      if (await clicDerecho(".react-flow__pane")) await parada("lienzo · clic derecho en el fondo", "carceles-lienzo-menu.png");
      await tecla("Escape");
    }
    if (tab === "perfil") {
      const n = await cuantos(".perfil-seccion");
      for (let i = 0; i < n; i++) {
        await clic(`.topbar .tab[data-tab="perfil"]`);
        await dormir(500);
        const cual = await v.js(`document.querySelectorAll(".perfil-seccion")[${i}]?.getAttribute("data-seccion") ?? ""`);
        if (!(await clic(".perfil-seccion", i))) continue;
        await parada(`perfil · ${cual}`, `carceles-perfil-${cual}.png`);
      }
    }
    if (tab === "ajustes") {
      const n = await cuantos(".set-tab");
      for (let i = 0; i < n; i++) {
        const cual = await v.js(`document.querySelectorAll(".set-tab")[${i}]?.querySelector(".set-tab-nom")?.textContent ?? "${i}"`);
        if (!(await clic(".set-tab", i))) continue;
        await parada(`ajustes · ${cual}`, `carceles-ajustes-${i}.png`);
      }
    }
  }
} finally {
  await a.cerrar();
}

const filas = [...vistas.entries()].sort((x, y) => y[1].size - x[1].size);
console.log(`\n${paradas} paradas, ${filas.length} cosas por soltar (cárceles y mayúsculas espaciadas):`);
for (const [c, donde] of filas) console.log(`     ${c}\n        en: ${[...donde].join(", ")}`);
// Las aprobadas, agrupadas por su porqué (lo que va detrás de «aprobada el …»).
const porque = new Map();
for (const [c, donde] of aprobadasVistas) {
  const clave = c.slice(c.indexOf(" · aprobada el ") + 3);
  if (!porque.has(clave)) porque.set(clave, { n: 0, ejemplo: c.slice(0, c.indexOf(" · aprobada el ")), donde });
  porque.get(clave).n++;
}
if (porque.size) {
  console.log("\nSe quedan, aprobadas por Munir (la lista está en carceles.js):");
  for (const [clave, x] of porque) console.log(`  (${x.n}) ${clave}\n        p. ej. ${x.ejemplo} · en: ${[...x.donde].join(", ")}`);
}
console.log(filas.length ? `\n${filas.length} por soltar` : "\nNinguna por soltar");
process.exit(filas.length ? 1 : 0);
