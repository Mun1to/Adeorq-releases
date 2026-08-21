/* ============================================================================
   Adeorq · web/scripts/extraer-temas.mjs

   Saca los temas de la app DE VERDAD (src/App.css) y escribe la hoja que usa la
   maqueta de la web. No se copian a mano: a mano se copian mal, y ademas se
   quedan viejos en cuanto alguien añade un tema o retoca un tono.

   Se lanza con:  node scripts/extraer-temas.mjs
   (o `pnpm temas` desde web/)

   Lo que hace, en concreto: busca en App.css los bloques `:root[data-theme=..]`
   y el `:root` de arriba, que es el azul por defecto, y los reescribe colgando
   de `.ade[data-tema=...]` para que dentro de la maqueta convivan con el resto
   de la pagina sin pisarle las variables a nadie.
   ========================================================================= */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP_CSS = resolve(AQUI, '../../src/App.css');
const SALIDA = resolve(AQUI, '../demo/temas.css');

const css = readFileSync(APP_CSS, 'utf8');

/** Un bloque `selector { ... }` completo desde la posicion del selector. */
function cuerpoDesde(texto, desde) {
  const abre = texto.indexOf('{', desde);
  if (abre < 0) return null;
  let n = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === '{') n++;
    else if (texto[i] === '}') {
      n--;
      if (n === 0) return texto.slice(abre + 1, i);
    }
  }
  return null;
}

/** Solo las variables: fuera font-family, color-scheme y lo que no sea --x.
    Los comentarios se quitan ANTES de partir por `;`: si no, la variable que va
    justo detras de un comentario se queda pegada a el, deja de empezar por `--`
    y se pierde sin avisar. Asi se perdian --bg y --wait del tema azul. */
function soloVariables(cuerpo) {
  return cuerpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map(l => l.trim())
    .filter(l => l.startsWith('--'))
    .map(l => '  ' + l + ';')
    .join('\n');
}

const temas = [];

// El azul no lleva atributo: es el `:root` de la cabecera de App.css.
const raiz = css.match(/:root,\s*\n\[data-tema-prev="azul"\]\s*\{/);
if (raiz) {
  const cuerpo = cuerpoDesde(css, raiz.index);
  if (cuerpo) temas.push({ id: 'azul', vars: soloVariables(cuerpo) });
}

// Y los demas, por su atributo.
const re = /:root\[data-theme="([a-z0-9-]+)"\]/g;
let m;
const vistos = new Set(['azul']);
while ((m = re.exec(css))) {
  const id = m[1];
  if (vistos.has(id)) continue;
  vistos.add(id);
  const cuerpo = cuerpoDesde(css, m.index);
  if (cuerpo) temas.push({ id, vars: soloVariables(cuerpo) });
}

// Ningun tema puede salir con menos variables que el azul, que es el completo:
// si pasa, es que el extractor se ha dejado algo por el camino y hay que verlo
// antes de que la maqueta se pinte a medias.
const base = temas.find(t => t.id === 'azul');
if (base) {
  const cuantas = t => t.vars.split(String.fromCharCode(10)).filter(Boolean).length;
  const nBase = cuantas(base);
  const cojos = temas.filter(t => t.id !== 'azul' && cuantas(t) < 10);
  if (cojos.length) {
    console.error('extraer-temas: temas con muy pocas variables: ' + cojos.map(t => t.id).join(', '));
    process.exit(1);
  }
  console.log('el tema base trae ' + nBase + ' variables');
}

if (temas.length < 5) {
  console.error('extraer-temas: solo ' + temas.length + ' temas, algo ha cambiado en App.css');
  process.exit(1);
}

const cabecera = `/* ============================================================================
   Adeorq · demo/temas.css
   GENERADO. No editar a mano: sale de src/App.css con scripts/extraer-temas.mjs.

   Son los ${temas.length} temas de la app de verdad, con sus valores exactos. Cada uno
   redefine el mismo juego de variables y nada mas: el cristal, el desenfoque y
   la forma no cambian con el tema, igual que en la app.
   ========================================================================= */
`;

const cuerpo = temas.map(t => {
  const sel = t.id === 'azul'
    ? '.ade, .ade[data-tema="azul"], [data-tema-prev="azul"]'
    : `.ade[data-tema="${t.id}"], [data-tema-prev="${t.id}"]`;
  return `${sel} {\n${t.vars}\n}`;
}).join('\n\n');

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, cabecera + '\n' + cuerpo + '\n', 'utf8');

console.log(`temas.css -> ${temas.length} temas: ${temas.map(t => t.id).join(', ')}`);
