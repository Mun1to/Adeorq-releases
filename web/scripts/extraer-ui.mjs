/* ============================================================================
   Adeorq · web/scripts/extraer-ui.mjs

   Saca de src/App.css las reglas que necesita la maqueta de la web y las
   reescribe acotadas dentro de `.ade`, para que vivan en la landing sin pisarle
   los estilos a nadie.

   Por que se extrae en vez de escribirse: App.css son 19.000 lineas y ahi estan
   las medidas de verdad (la barra mide 42 px, la pestaña 5/11 de relleno, el
   contador 10,5 px...). Escritas a ojo, la maqueta se parece; copiadas, es la
   misma. Y cuando la app cambie, esto se vuelve a lanzar y ya esta.

   Se lanza con:  node scripts/extraer-ui.mjs

   Lo que NO hace: no trae App.css entero. Solo los selectores de la lista de
   abajo, que son los de las dos pantallas que la maqueta enseña.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP_CSS = resolve(AQUI, '../../src/App.css');
const SALIDA = resolve(AQUI, '../demo/ui.css');

/* Los prefijos de clase que la maqueta usa. Se trae una regla si ALGUNO de sus
   selectores empieza por uno de estos. */
const PREFIJOS = [
  // marco y barra de arriba
  'topbar', 'brand', 'tabs', 'tab', 'finder',
  // el Panel
  'panel', 'stats', 'stat-', 'card-hint', 'hot-', 'count', 'ws-dot', 'np-',
  // la Cabina: paneles de terminal
  'pane', 'grid', 'term', 'ctx', 'chip', 'pill', 'badge',
  // el riel de proyectos
  'rail', 'sidebar', 'project', 'projects', 'proj', 'sess', 'ws-',
  'pavatar', 'prov-', 'mini-', 'mini', 'logo-', 'side-', 'mark-', 'live-dot', 'group',
  'ph-', 'franja', 'lateral', 'shadow-', 'minim', 'skill', 'skills-', 'act-',
  // piezas sueltas comunes
  'btn', 'icon-btn', 'sep', 'dot', 'toast', 'set-',
  // lo de la derecha de la barra: el orbe del Asistente, el modo emisión, los
  // objetivos y el repartidor de paneles. Faltaban, y por eso la maqueta ponía
  // ahí tres botones de texto que en el programa ya no existen.
  'orbe', 'stream-', 'objetivos-', 'layout-', 'foreman', 'pulso',
  // las dos pantallas que faltaban en la maqueta: el Chat y la Memoria
  'chat-', 'mem', 'mem-',
];

/* Reglas que NO se traen aunque encajen: cosas de la ventana nativa, del
   arrastre real o de xterm, que en una maqueta no pintan nada y solo pesan. */
const FUERA = [
  'xterm', 'tauri', 'drag', 'resize', 'scrollbar', '::-webkit',
  'ventana-suelta', 'onboarding',
];

const css = readFileSync(APP_CSS, 'utf8');

/* Partir el CSS en reglas de primer nivel. Se hace contando llaves y no con una
   expresion regular porque hay @media y @supports anidados, y una regex se
   traga el cierre que no toca. */
function reglas(texto) {
  const out = [];
  let i = 0;
  while (i < texto.length) {
    // saltar comentarios y espacios
    if (texto.startsWith('/*', i)) { const f = texto.indexOf('*/', i); i = f < 0 ? texto.length : f + 2; continue; }
    if (/\s/.test(texto[i])) { i++; continue; }

    const abre = texto.indexOf('{', i);
    if (abre < 0) break;
    const selector = texto.slice(i, abre).trim();

    let n = 0, j = abre;
    for (; j < texto.length; j++) {
      if (texto[j] === '{') n++;
      else if (texto[j] === '}') { n--; if (n === 0) break; }
    }
    const cuerpo = texto.slice(abre + 1, j);
    out.push({ selector, cuerpo, anidada: selector.startsWith('@') });
    i = j + 1;
  }
  return out;
}

const quiero = sel =>
  sel.split(',').some(s => {
    const t = s.trim();
    if (FUERA.some(f => t.includes(f))) return false;
    const m = t.match(/^\.([a-zA-Z0-9_-]+)/);
    return !!m && PREFIJOS.some(p => m[1] === p || m[1].startsWith(p));
  });

/* Acotar dentro de `.ade`. Se hace por selector y no con un `.ade { ... }`
   envolvente porque el CSS anidado no lo entienden todos los navegadores que
   nos importan, y porque asi se ve en el archivo que sale que nada se escapa. */
const acotar = sel =>
  sel.split(',')
     .map(s => s.trim())
     .filter(Boolean)
     .map(s => (s.startsWith(':root') || s.startsWith('html') || s.startsWith('body'))
       ? s.replace(/^(:root|html|body)/, '.ade')
       : '.ade ' + s)
     .join(',\n');

const todas = reglas(css);
const traidas = [];

/* Las @media de anchura de la app miden LA VENTANA, y ahi eso es correcto
   porque la app ES la ventana. Dentro de una pagina web no: la maqueta puede
   medir 900 px en un monitor de 2560, y con la media query tal cual se pintaria
   como si tuviera 2560 (asi se perdian los nombres de las pestañas, que la app
   suelta por debajo de 1700 px). Se pasan a @container sobre la propia maqueta,
   que es la traduccion exacta de lo que la regla queria decir: "cuando esto sea
   estrecho". Las que no son de anchura (color, hover, movimiento) se quedan. */
const aContenedor = sel => {
  if (!/^@media/.test(sel)) return sel;
  if (!/(min|max)-width/.test(sel)) return sel;
  if (/prefers-|hover|pointer/.test(sel)) return sel;
  return sel.replace(/^@media/, '@container ade');
};

let convertidas = 0;

for (const r of todas) {
  if (r.anidada) {
    // dentro de @media, se filtra igual y se conserva la envoltura
    const dentro = reglas(r.cuerpo).filter(x => !x.anidada && quiero(x.selector));
    if (dentro.length) {
      const env = aContenedor(r.selector);
      if (env !== r.selector) convertidas++;
      traidas.push(`${env} {\n${dentro.map(x => `${acotar(x.selector)} {${x.cuerpo}}`).join('\n')}\n}`);
    }
    continue;
  }
  if (quiero(r.selector)) traidas.push(`${acotar(r.selector)} {${r.cuerpo}}`);
}

if (traidas.length < 20) {
  console.error('extraer-ui: solo ' + traidas.length + ' reglas; los prefijos ya no encajan con App.css');
  process.exit(1);
}

const cabecera = `/* ============================================================================
   Adeorq · demo/ui.css
   GENERADO. No editar a mano: sale de src/App.css con scripts/extraer-ui.mjs.

   Son ${traidas.length} reglas de la app de verdad, acotadas dentro de \`.ade\` para que
   convivan con la landing. Las medidas son las suyas, no una aproximacion.
   ========================================================================= */
`;

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, cabecera + '\n' + traidas.join('\n\n') + '\n', 'utf8');

console.log(`ui.css -> ${traidas.length} reglas de ${todas.length}; ${convertidas} @media pasadas a @container`);
