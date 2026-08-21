/* ============================================================================
   Adeorq · web/scripts/extraer-marcas.mjs

   Saca las marcas de los CLIs (src/components/ProviderMark.tsx) y las escribe
   como sprite SVG para la maqueta.

   Son el asterisco de Claude, la nube de Codex, la chispa de Gemini y las
   demas, dibujadas a mano en la app. Sin ellas, todas las terminales de la
   maqueta se ven con el mismo icono generico de consola, y en la app se
   distingue de un vistazo quien esta trabajando en cada panel.

   Se lanza con:  node scripts/extraer-marcas.mjs

   Lo que hace por dentro: el fichero de la app es JSX, no SVG, asi que hay que
   traducirlo. Los atributos van en camelCase (`strokeWidth`), las props comunes
   llegan por `{...T}` y las que llevan mascara reciben un id unico por
   instancia. Aqui se pasan a kebab-case, se les pega T, y el id se fija por
   marca, que dentro de un sprite ya es unico.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = resolve(AQUI, '../../src/components/ProviderMark.tsx');
const SALIDA = resolve(AQUI, '../demo/marcas.svg');

const src = readFileSync(FUENTE, 'utf8');

/** Las props comunes de la app: `const T = { fill, stroke, linecap, linejoin }`. */
const T = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/** El trazo del asterisco de Claude vive en su propia constante.
 *
 *  ⚠ Va partida en CUATRO cadenas unidas con `+`, una por linea. Esto leia solo
 *  la primera y el asterisco de Claude salia con 4 rayos de los 11 que tiene:
 *  un abanico torcido en vez de su marca (Munir lo cazo en la maqueta a 15 px).
 *  Se toma todo hasta el `;` y se pegan las cadenas. */
function constanteDeTexto(nombre) {
  const i = src.indexOf(`export const ${nombre}`);
  if (i < 0) return null;
  const fin = src.indexOf(';', i);
  const trozo = src.slice(i, fin < 0 ? src.length : fin);
  const partes = trozo.match(/"([^"]*)"/g);
  return partes ? partes.map(p => p.slice(1, -1)).join('') : null;
}
const CLAUDE_BURST = constanteDeTexto('CLAUDE_BURST');

/* El bloque `const MARCAS = { ... }` entero. */
const iniM = src.indexOf('const MARCAS');
const abre = src.indexOf('{', src.indexOf('=', iniM));
let n = 0, fin = abre;
for (let i = abre; i < src.length; i++) {
  if (src[i] === '{') n++;
  else if (src[i] === '}') { n--; if (n === 0) { fin = i; break; } }
}
const cuerpo = src.slice(abre + 1, fin);

/* Partir por entradas de primer nivel: `nombre: (args) => (...)`. */
function entradas(txt) {
  const out = [];
  const re = /^\s{2}([a-z][a-z0-9]*):\s*\(([^)]*)\)\s*=>\s*/gm;
  let m;
  const marcas = [];
  while ((m = re.exec(txt))) {
    marcas.push({ id: m[1], arg: m[2].trim(), abre: m.index, desde: m.index + m[0].length });
  }
  for (let i = 0; i < marcas.length; i++) {
    // ⚠ Hasta donde EMPIEZA la siguiente, no hasta donde acaba su firma. Con
    // `desde` se colaban dentro de cada marca la coma de cierre, el comentario
    // de la siguiente y su propia cabecera (`gemini: () =>`), asi que cada
    // <symbol> del sprite llevaba dentro trozos del codigo del vecino.
    const hasta = i + 1 < marcas.length ? marcas[i + 1].abre : txt.length;
    let trozo = txt.slice(marcas[i].desde, hasta);
    // quitar la coma de cierre y los comentarios que van antes de la siguiente
    trozo = trozo.replace(/,\s*(\/\/[^\n]*\n|\s)*$/, '').trim();
    out.push({ id: marcas[i].id, arg: marcas[i].arg, jsx: trozo });
  }
  return out;
}

/** JSX -> SVG. */
function aSvg(jsx, id, arg) {
  let s = jsx;

  // envoltura de parentesis y fragmentos
  s = s.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
  s = s.replace(/<>\s*/g, '').replace(/\s*<\/>/g, '');

  // comentarios de JSX
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  // El id unico por instancia pasa a ser fijo: dentro de un sprite ya lo es.
  // Con comillas, porque en JSX `id={uid}` no las lleva y en SVG hacen falta.
  if (arg) {
    // El ${uid} de dentro de una plantilla va PRIMERO: si no, la sustitucion de
    // {uid} deja el dolar suelto y sale `url(#$pm-codex)`, que no apunta a nada.
    s = s.replaceAll('${' + arg + '}', 'pm-' + id);
    s = s.replaceAll('={' + arg + '}', '="pm-' + id + '"');
    s = s.replaceAll('{' + arg + '}', 'pm-' + id);
  }

  // las props comunes
  s = s.replace(/\{\.\.\.T\}/g, T);

  // camelCase -> kebab, solo en atributos conocidos de SVG
  /* ⚠ `maskUnits` NO va aqui, y ese detalle costo tres marcas.
     Casi todos los atributos de SVG son kebab (`stroke-width`), pero un puñado
     son camelCase DE VERDAD, y `maskUnits` es uno: escrito `mask-units` el
     navegador no lo reconoce, la mascara cae a su valor por defecto
     (`objectBoundingBox`), un x/y/ancho/alto de 0..24 pasa a significar 24
     VECES la caja, y la mascara deja de recortar nada. Resultado: Codex y
     Copilot salian como un cuadrado azul relleno y Qwen sin su trenzado. */
  const ATTRS = ['strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray',
                 'clipPath', 'fillRule', 'clipRule', 'fillOpacity',
                 'strokeOpacity', 'strokeMiterlimit'];
  for (const a of ATTRS) {
    const kebab = a.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    s = s.replaceAll(a + '=', kebab + '=');
  }

  // los interpolados que queden (`mask={`url(#${uid})`}`)
  s = s.replace(/=\{`([^`]*)`\}/g, (_, v) => '="' + v.replace(/\$\{([^}]*)\}/g, (_, e) =>
    e.trim() === arg ? 'pm-' + id : '') + '"');
  s = s.replace(/=\{"([^"]*)"\}/g, '="$1"');

  return s.trim();
}

const marcas = [];
if (CLAUDE_BURST) {
  marcas.push({ id: 'claude', svg: `<path d="${CLAUDE_BURST}" stroke-width="2.5" ${T} />` });
}
for (const e of entradas(cuerpo)) {
  if (e.id === 'claude') continue;          // ya puesta, desde su constante
  const svg = aSvg(e.jsx, e.id, e.arg);
  if (!svg || svg.includes('{') || svg.includes('}')) {
    console.log('sin traer (lleva codigo que no se puede traducir): ' + e.id);
    continue;
  }
  marcas.push({ id: e.id, svg });
}

if (marcas.length < 3) {
  console.error('extraer-marcas: solo ' + marcas.length + '; ha cambiado ProviderMark.tsx');
  process.exit(1);
}

/* Que el dibujo tenga los MISMOS trazos que la app. Un `d` recortado no da
   error en ninguna parte: da un icono torcido que solo se ve mirando, y asi
   estuvo el asterisco de Claude con 4 rayos de 11. */
for (const m of marcas) {
  const enApp = (src.match(/d="([^"]*)"/g) || []).length;
  // Sin `\b`: en `…10.8V2.8M12.65…` la M va pegada a un digito y no hay
  // frontera de palabra que valga.
  const trazos = (m.svg.match(/M[\d.]/g) || []).length;
  if (m.id === 'claude' && trazos !== 11) {
    console.error(`extraer-marcas: el asterisco de Claude sale con ${trazos} rayos y son 11`);
    process.exit(1);
  }
  // Y que no se cuele JavaScript dentro del dibujo, que es como se colaba antes
  // la marca de al lado.
  if (/=>|\/\/|^\s*\),/m.test(m.svg)) {
    console.error(`extraer-marcas: la marca «${m.id}» lleva codigo dentro, el corte esta mal`);
    process.exit(1);
  }
  if (enApp === 0) break;
}

const salida = `<!-- ============================================================================
     Adeorq · demo/marcas.svg
     GENERADO. No editar a mano: sale de src/components/ProviderMark.tsx con
     scripts/extraer-marcas.mjs.

     La marca de cada CLI, tal como la dibuja la app. Se usan asi:
       <svg class="prov-mark"><use href="#m-claude"/></svg>

     ⚠ Este sprite hay que PEGARLO en la pagina (lo hace demo/sprites.js), no
     referenciarlo como fichero externo. Tres de las diez marcas (Codex, Copilot
     y Qwen) se dibujan con una mascara, y un mask="url(#pm-codex)" se resuelve
     SIEMPRE contra el documento que lo pinta: desde otro fichero no encuentra
     nada y la mascara no recorta, asi que Codex salia como un cuadrado relleno.
     Por lo mismo el svg de aqui no lleva display:none, que tambien anula las
     mascaras de dentro: se esconde con tamaño cero.
     ============================================================================ -->
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true"
     style="position:absolute;width:0;height:0;overflow:hidden">
${marcas.map(m => `  <symbol id="m-${m.id}" viewBox="0 0 24 24">
    ${m.svg}
  </symbol>`).join('\n')}
</svg>
`;

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, salida, 'utf8');
console.log(`marcas.svg -> ${marcas.length} marcas: ${marcas.map(m => m.id).join(', ')}`);
