// ¿Siguen las esquinas y las sombras la guía de estilo?
//
//   node scripts/estilo-check.mjs              mira `src/estilos` y falla si algo se sale
//   node scripts/estilo-check.mjs --arreglar   pasa a la escala lo que se sale, y lo dice
//   pnpm estilo                                lo mismo que la primera, más su banco
//
// El 2026-10-10 había en la hoja 119 sombras distintas y 48 esquinas distintas
// para lo mismo, casi todas parecidas: la misma idea escrita de cien formas, y
// cada pieza nueva desentonando un poco porque copiaba la de al lado a ojo.
// Munir eligió al día siguiente, viéndola puesta sobre la app
// (`scripts/laboratorio/estilo-muestra.js`), la escala «plano con filo» con el
// brillo de cristal de siempre:
//
//   esquinas   --r-chico 4 px · --r-btn 6 px · --r-caja 8 px · --r-pastilla
//              (más `50%` para los círculos y hasta 4 px a mano para los
//              detalles: una raya, una casilla)
//   sombras    nada en lo que está apoyado · --sombra-2 en lo que flota cerca
//              (menús, tarjetas levantadas) · --sombra-3 en lo que flota encima
//              de todo (diálogos). Las dos son cortas y llevan un filo de una
//              línea. El brillo del borde de arriba (`--glass-edge`) se queda.
//
// Esto es lo que impide que vuelvan a ser cien: una esquina o una sombra
// escrita a mano FALLA, con su fichero y su línea, y `--arreglar` la pasa a la
// escala con la misma cuenta con la que se pasó la hoja entera.
//
// Lo que NO mira, a propósito: un resplandor de color (dice algo: el punto que
// late, el foco), una línea dibujada con sombra (sin difuminar), las sombras
// hacia dentro, `text-shadow` y `filter`. Ni la página del móvil, que es otra
// casa.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Hasta cuántos píxeles se deja una esquina escrita a mano: es un detalle. */
export const A_MANO = 4;
export const ESQUINAS = { chico: "var(--r-chico)", btn: "var(--r-btn)", caja: "var(--r-caja)", pastilla: "var(--r-pastilla)" };
export const SOMBRAS = { cerca: "var(--sombra-2)", encima: "var(--sombra-3)" };
/** A partir de cuánto difuminado una sombra era «de las que flotan». */
const DIFUSA_CERCA = 12;
const DIFUSA_ENCIMA = 32;

/** El mismo texto con los comentarios en blanco, para buscar sin tropezar con ellos. */
export function sinComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
}

const PROPIEDAD = /(?<![-\w])(border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|box-shadow)\s*:\s*([^;{}]+?)\s*(?=;|\})/g;

/**
 * Las declaraciones de esquina y de sombra de una hoja, con dónde está su valor
 * (para poder cambiarlo sin tocar nada más) y el cuerpo de su regla.
 */
export function declaraciones(css) {
  const limpio = sinComentarios(css);
  const out = [];
  for (const m of limpio.matchAll(PROPIEDAD)) {
    // El valor empieza justo detrás de «propiedad: ».
    const desde = m.index + /^[^:]*:\s*/.exec(m[0])[0].length;
    const abre = limpio.lastIndexOf("{", m.index);
    const cierra = limpio.indexOf("}", m.index);
    out.push({
      propiedad: m[1],
      valor: m[2],
      desde,
      hasta: desde + m[2].length,
      linea: limpio.slice(0, m.index).split("\n").length,
      cuerpo: limpio.slice(abre + 1, cierra < 0 ? limpio.length : cierra),
    });
  }
  return out;
}

const quitaImportante = (v) => {
  const m = /\s*!important\s*$/.exec(v);
  return m ? [v.slice(0, m.index), " !important"] : [v, ""];
};
const px = (trozo) => {
  const m = /^(-?\d*\.?\d+)px$/.exec(trozo);
  return m ? parseFloat(m[1]) : null;
};
const medida = (cuerpo, cual) => {
  const m = new RegExp(`(?<![-\\w])${cual}\\s*:\\s*(\\d*\\.?\\d+)px\\s*(?:;|$)`).exec(cuerpo);
  return m ? parseFloat(m[1]) : null;
};

/** ¿Esa esquina, en esa caja, la deja redonda del todo? Entonces es una pastilla. */
function esPastilla(numeros, cuerpo) {
  const alto = medida(cuerpo, "height");
  if (alto === null || numeros.length === 0) return false;
  const corto = Math.min(alto, medida(cuerpo, "width") ?? alto);
  return numeros.every((n) => n * 2 >= corto);
}

/** Un tamaño suelto, a su escalón. */
export function escalon(n) {
  if (n <= A_MANO) return `${n}px`.replace(/^0px$/, "0");
  if (n >= 99) return ESQUINAS.pastilla;
  return n <= 8 ? ESQUINAS.chico : n <= 13 ? ESQUINAS.btn : ESQUINAS.caja;
}

/** El valor de una esquina pasado a la escala. Lo que ya está bien no cambia. */
export function esquinaNueva(valor, cuerpo = "") {
  const [v, importante] = quitaImportante(valor);
  const trozos = v.trim().split(/\s+/);
  const numeros = trozos.map(px).filter((n) => n !== null && n > A_MANO);
  if (numeros.length === 0) return valor;
  if (numeros.length === trozos.length && esPastilla(numeros, cuerpo)) return ESQUINAS.pastilla + importante;
  return trozos.map((t) => (px(t) === null ? t : escalon(px(t)))).join(" ") + importante;
}

/** Lo que no vale de una esquina, o `null`. */
export function juzgarEsquina(valor) {
  const [v] = quitaImportante(valor);
  const mal = v.trim().split(/\s+/).filter((t) => {
    const n = px(t);
    return n !== null && n > A_MANO;
  });
  return mal.length ? `esquina a mano (${mal.join(" ")}): usa --r-chico, --r-btn, --r-caja o --r-pastilla` : null;
}

/** Las capas de una sombra: se parten por las comas de fuera de los paréntesis. */
export function capas(valor) {
  const out = [];
  let hondo = 0;
  let a = "";
  for (const ch of valor) {
    if (ch === "(") hondo++;
    if (ch === ")") hondo--;
    if (ch === "," && hondo === 0) {
      out.push(a.trim());
      a = "";
    } else a += ch;
  }
  if (a.trim()) out.push(a.trim());
  return out;
}

const COLOR = /(rgba?\([^)]*\)|hsla?\([^)]*\)|color-mix\(.*\)|var\([^)]*\)|#[0-9a-f]{3,8}|\bblack\b)/i;
const NEGRO = /^(rgba?\(\s*0[\s,]+0[\s,]+0\b|#0{3,4}\b|#0{6}(?:[0-9a-f]{2})?\b|black$)/i;

/**
 * Qué es una capa: `flota` es una sombra de verdad (negra y difuminada, hacia
 * fuera), que es lo único que sale de la escala. Lo demás se deja como está.
 */
export function clase(capa) {
  if (/^var\(/.test(capa)) return { tipo: "variable" };
  if (/\binset\b/.test(capa)) return { tipo: "dentro" };
  const color = (capa.match(COLOR) || [""])[0];
  const n = capa.replace(color, "").trim().split(/\s+/).map((x) => parseFloat(x));
  const difusa = n[2] || 0;
  if (difusa === 0) return { tipo: "linea" };
  if (!NEGRO.test(color)) return { tipo: "resplandor" };
  return { tipo: "flota", difusa };
}

/** El valor de una sombra pasado a la escala. Lo que ya está bien no cambia. */
export function sombraNueva(valor) {
  const [v, importante] = quitaImportante(valor);
  if (v.trim() === "none") return valor;
  let mayor = -1;
  const quedan = [];
  for (const c of capas(v)) {
    const k = clase(c);
    if (k.tipo === "flota") mayor = Math.max(mayor, k.difusa);
    else quedan.push(c);
  }
  if (mayor < 0) return valor;
  if (mayor > DIFUSA_ENCIMA) quedan.push(SOMBRAS.encima);
  else if (mayor > DIFUSA_CERCA) quedan.push(SOMBRAS.cerca);
  return (quedan.length ? quedan.join(", ") : "none") + importante;
}

/** Lo que no vale de una sombra, o `null`. */
export function juzgarSombra(valor) {
  const [v] = quitaImportante(valor);
  const mal = capas(v).filter((c) => clase(c).tipo === "flota");
  return mal.length ? `sombra a mano (${mal.join(" · ")}): usa --sombra-2 o --sombra-3, o ninguna` : null;
}

const esEsquina = (d) => d.propiedad !== "box-shadow";

/** Lo que se sale de la escala en una hoja: `{ linea, propiedad, valor, por }`. */
export function revisar(css) {
  const fallos = [];
  for (const d of declaraciones(css)) {
    const por = esEsquina(d) ? juzgarEsquina(d.valor) : juzgarSombra(d.valor);
    if (por) fallos.push({ linea: d.linea, propiedad: d.propiedad, valor: d.valor.replace(/\s+/g, " "), por });
  }
  return fallos;
}

/** La misma hoja con todo pasado a la escala, y cuántas declaraciones cambió. */
export function arreglar(css) {
  let out = css;
  let cambiadas = 0;
  // De atrás adelante, para que cambiar una no mueva el sitio de las anteriores.
  for (const d of declaraciones(css).reverse()) {
    const nueva = esEsquina(d) ? esquinaNueva(d.valor, d.cuerpo) : sombraNueva(d.valor);
    if (nueva === d.valor) continue;
    out = out.slice(0, d.desde) + nueva + out.slice(d.hasta);
    cambiadas++;
  }
  return { css: out, cambiadas };
}

/* ── Lo escrito dentro del código ────────────────────────────────────────────
   Un `style={{ borderRadius: "8px" }}` o el tema de un editor montado en
   TypeScript se saltan la hoja, y con ella la guía. Se miran con la misma vara. */
const EN_LINEA = /(borderRadius|boxShadow)\s*:\s*(["'`])((?:(?!\2).)*)\2/g;
/** Donde eso no es la cara de Adeorq. */
export const EN_LINEA_EXENTOS = {
  "src/components/EditorWeb.tsx": "pone estilos en la página del usuario, no en la app",
};

export function revisarCodigo(texto) {
  const fallos = [];
  for (const m of texto.matchAll(EN_LINEA)) {
    const por = m[1] === "borderRadius" ? juzgarEsquina(m[3]) : juzgarSombra(m[3]);
    if (por) fallos.push({ linea: texto.slice(0, m.index).split("\n").length, propiedad: m[1], valor: m[3], por });
  }
  return fallos;
}

/** Los `.ts` y `.tsx` de `src/`, con su ruta corta. */
export function codigo(raiz = RAIZ) {
  const out = [];
  (function rec(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const entera = path.join(dir, e.name);
      if (e.isDirectory()) rec(entera);
      else if (/\.tsx?$/.test(e.name)) out.push({ ruta: path.relative(raiz, entera).split(path.sep).join("/"), entera });
    }
  })(path.join(raiz, "src"));
  return out.filter((f) => !(f.ruta in EN_LINEA_EXENTOS)).sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Los tramos de la hoja, con su ruta corta. */
export function tramos(raiz = RAIZ) {
  const dir = path.join(raiz, "src", "estilos");
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".css"))
    .sort()
    .map((n) => ({ ruta: `src/estilos/${n}`, entera: path.join(dir, n) }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const todos = tramos();
  if (process.argv.includes("--arreglar")) {
    let total = 0;
    for (const t of todos) {
      const antes = fs.readFileSync(t.entera, "utf8");
      const { css, cambiadas } = arreglar(antes);
      if (cambiadas) {
        fs.writeFileSync(t.entera, css);
        console.log(`  ${String(cambiadas).padStart(4)}  ${t.ruta}`);
        total += cambiadas;
      }
    }
    console.log(total ? `\n${total} declaraciones pasadas a la escala. Mira el diff antes de guardarlo.` : "Nada que arreglar.");
  }
  const fallos = [];
  let miradas = 0;
  for (const t of todos) {
    const css = fs.readFileSync(t.entera, "utf8");
    miradas += declaraciones(css).length;
    for (const f of revisar(css)) fallos.push(`${t.ruta}:${f.linea}  ${f.propiedad}: ${f.valor}\n      ${f.por}`);
  }
  for (const c of codigo()) {
    for (const f of revisarCodigo(fs.readFileSync(c.entera, "utf8"))) fallos.push(`${c.ruta}:${f.linea}  ${f.propiedad}: ${f.valor}\n      ${f.por}`);
  }
  console.log(`Estilo: ${miradas} esquinas y sombras en ${todos.length} tramos, y lo escrito dentro del código.`);
  if (fallos.length) {
    console.log(`\nFALLA (${fallos.length}):\n  ` + fallos.join("\n  "));
    console.log("\n  `node scripts/estilo-check.mjs --arreglar` pasa a la escala las de la hoja; las del código, a mano.");
    process.exit(1);
  }
  console.log("\nTODO BIEN.");
}
