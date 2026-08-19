// ¿Siguen los botones el sistema de la casa?
//
// Nació el 2026-08-11 de un repaso que pidió Munir («haz un repaso del diseño
// frontend de los botones»). Lo que se encontró midiendo los 412 botones de la
// app: ONCE radios distintos para lo mismo, y unos cuantos botones con texto
// que se pintaban sin superficie, o sea que sobre su fondo de escritorio no
// parecían botones.
//
// Las dos cosas que mira:
//   1. Las esquinas salen de la escala (`--r-chico`, `--r-btn`, `--r-caja`,
//      `--r-pastilla`) y no de un número suelto. Esto es objetivo, así que
//      FALLA: un radio nuevo a mano es cómo se llegó a tener once.
//   2. Qué botones con texto no traen superficie propia. Esto solo AVISA, y a
//      propósito: un botón sin fondo dentro de una barra que sí lo tiene es un
//      secundario legítimo (media barra del Lienzo funciona así). Lo que no
//      vale es el que cae sobre el fondo de escritorio, y eso no se puede
//      saber leyendo el CSS. La lista es para mirarla, no para obedecerla.
//
// Se lanza con `pnpm botones`.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync("src/App.css", "utf8");

/** Recetas que ya traen superficie, relieve y esquina. */
const RECETAS = ["mini", "np-btn", "np-btn-mini", "panel-card"];
/** Lo que a propósito NO lleva caja: marca un estado, o es una fila de algo. */
const EXENTAS =
  /^(tab$|set-tab|tema-tab|tema-tarjeta|menu-item|ctx-item|chat-menu-fila|chat-fila|session|ag-ses-row|obj-fila|hot-item|choice|pick-item|project-logo|rail-tab|sess-|sgroup-|fly-|kb-card|crew-card|stat-card|cmd-card|mem-hoja|mem-carpeta|mem-fila|mem-vault|wiz-item|onb-tema|layout-choice|account-group-title|np-title|web-tapa|usage-|fm-guia-fila|set-sub-item|ocultos-cab|mas-viejas|skills-abrir)/;

const arch = [];
(function rec(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) rec(p);
    else if (e.name.endsWith(".tsx")) arch.push(p);
  }
})("src");

/** El cuerpo de la regla `.clase { … }`, si existe. */
function bloque(clase) {
  const re = new RegExp(`(^|[,\\s])\\.${clase}\\s*(,[^{]*)?\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m ? m[3] : null;
}

const desnudos = [];
const vistas = new Set();
let total = 0;

for (const f of arch) {
  const corto = f.split(/[\\/]/).pop();
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/<button([^>]*?)>([\s\S]*?)<\/button>/g)) {
    total++;
    const cn = m[1].match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/);
    const lista = (cn ? (cn[1] ?? cn[2] ?? cn[3]) : "")
      .split(/[\s`{}$()?:'"]+/)
      .filter((c) => /^[a-z][a-z0-9-]+$/.test(c));
    if (lista.some((c) => RECETAS.includes(c) || EXENTAS.test(c))) continue;
    // ¿Lleva texto, o es solo un icono? Un botón de icono suelto se apaña sin
    // caja; uno con una palabra dentro, no.
    if (!/\bt\(\s*["'`]/.test(m[2])) continue;
    const clave = lista.join(".");
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    // Con que UNA de sus clases traiga fondo, vale.
    const conFondo = lista.some((c) => {
      const b = bloque(c);
      if (!b) return false;
      const fondo = b.match(/background(-color)?\s*:\s*([^;]+)/);
      return fondo && !/^(none|transparent|0)$/.test(fondo[2].trim());
    });
    if (!conFondo) {
      const rotulo = (m[2].match(/t\(\s*["'`]([^"'`]{0,34})/) ?? [, "?"])[1];
      desnudos.push(`  ${corto}  .${clave || "(sin clase)"}  «${rotulo.trim()}»`);
    }
  }
}

// Las esquinas de los botones, contra la escala.
// El `0` entra en la escala y no es una excepción por comodidad: cero no es
// una esquina mal elegida, es la AUSENCIA de esquina, que es una forma tan
// deliberada como las otras cuatro. Lo pidió Munir para la tira de apartadas el
// 2026-08-19 («que fuesen como pestañas normales y corrientes rectangulares,
// con los bordes rectos»), y una pestaña con esquinas deja de ser una pestaña.
// Lo que esta lista sigue cazando es lo de siempre: el 6px o el 11px puestos a
// ojo porque quedaban bien en esa pantalla.
const ESCALA = ["var(--r-chico)", "var(--r-btn)", "var(--r-caja)", "var(--r-pastilla)", "50%", "0"];
const fuera = [];
for (const f of arch) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/<button[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/gs)) {
    for (const c of (m[1] ?? m[2]).split(/[\s`{}$()?:'"]+/)) {
      if (!/^[a-z][a-z0-9-]+$/.test(c)) continue;
      const b = bloque(c);
      if (!b) continue;
      const r = b.match(/border-radius\s*:\s*([^;]+)/);
      if (r && !ESCALA.includes(r[1].trim()) && !fuera.some((x) => x.startsWith(`  .${c} `))) {
        fuera.push(`  .${c} → ${r[1].trim()}`);
      }
    }
  }
}

console.log(`Botones: ${total} en ${arch.length} archivos.`);
if (desnudos.length) {
  console.log(`\nSin superficie propia (${desnudos.length}), para mirarlos: valen si su`);
  console.log("barra o su tarjeta la pone, no valen si pueden caer sobre el escritorio.");
  console.log(desnudos.join("\n"));
}
if (fuera.length) {
  console.log(`\nESQUINAS FUERA DE LA ESCALA (${fuera.length}):`);
  console.log(fuera.sort().join("\n"));
  console.log("\nUsa --r-chico, --r-btn, --r-caja o --r-pastilla. Están en App.css, arriba.");
  process.exit(1);
}
console.log("\nTodas las esquinas salen de la escala.");
