/* ============================================================================
   Adeorq · web/scripts/hacer-demo.mjs

   Empaqueta la demostración de la portada (`web/demo/`) a partir del volcado de
   la app de verdad (`scripts/laboratorio/capturas/volcar.mjs`).

   La demostración NO es una maqueta que imita a la app: es su DOM congelado,
   con sus hojas de estilo, en español y en inglés. Hasta el 2026-10-12 era una
   imitación escrita a mano con las clases de la app, y se quedaba atrás cada
   vez que la app cambiaba (llevaba dos meses sin la pestaña de Decisiones, con
   un Lienzo vacío y con botones que el programa ya no tenía). Volcada, es la
   misma, y ponerla al día es volver a lanzar dos comandos.

   Lo que escribe:
     demo/datos-es.html, demo/datos-en.html   la ventana y, en <template>, cada
                                              vista, sección y panel lateral
     demo/app.css                             las hojas de estilo de la app
     demo/fondo.jpg                           el fondo del taller de demostración

   Lo que se escribe a mano y este script no toca: demo/index.html, demo/demo.css
   y demo/vivo.js (lo que hace que se pueda pulsar).

   Se lanza con:  node scripts/hacer-demo.mjs [carpeta del volcado]
   ========================================================================= */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESDE = resolve(process.argv[2] || resolve(AQUI, '../../scripts/laboratorio/capturas/volcado'));
const DEMO = resolve(AQUI, '../demo');
const IDIOMAS = ['es', 'en'];

if (!existsSync(resolve(DESDE, 'hojas.css'))) {
  console.error(`hacer-demo: no hay volcado en ${DESDE}. Primero: node volcar.mjs es && node volcar.mjs en`);
  process.exit(1);
}

/* Lo que no puede salir nunca en un archivo que se publica: rutas de la casa de
   quien hizo el volcado, su usuario o un correo. La casa de pruebas vive en P:,
   así que cualquiera de estos es una fuga. Si aparece, el script se para. */
const PROHIBIDO = [/C:\\+Users/i, /\\AppData\\/i, /\bmuni(r|to)?\b/i, /athayde/i, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /asset\.localhost/i, /ipc\.localhost/i, /localhost:1420/i];

/* Los temas de color de las terminales. Cada terminal trae la suya dentro (65 KB
   de reglas idénticas salvo por el número de su dueña): se queda UNA por tema y
   las terminales se apuntan a ella con una clase. */
const temas = new Map();

function unTema(texto, propia) {
  // Además de la clase de su dueña, cada hoja numera las animaciones del cursor.
  const comun = texto.split(propia).join('xterm-tema-@').replace(/\bblink_(underline|bar|block)_\d+/g, 'blink_$1_@');
  for (const [id, t] of temas) if (t === comun) return id;
  const id = String(temas.size + 1);
  temas.set(id, comun);
  return id;
}

let fondoEscrito = false;

/** Deja un trozo del volcado listo para publicarse. */
function limpiar(raiz) {
  // El fondo viaja incrustado (la casa de pruebas no lo puede servir): a un archivo.
  for (const img of raiz.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:image/jpeg;base64,')) {
      if (!fondoEscrito) {
        writeFileSync(resolve(DEMO, 'fondo.jpg'), Buffer.from(src.slice('data:image/jpeg;base64,'.length), 'base64'));
        fondoEscrito = true;
      }
      img.setAttribute('src', 'fondo.jpg');
    } else if (/asset\.localhost/.test(src)) {
      img.setAttribute('src', 'fondo.jpg');
    }
  }
  // La tarjeta de «hay una versión nueva» es de la máquina que hizo el volcado.
  for (const e of raiz.querySelectorAll('.update-card, script')) e.remove();
  // Las hojas de color de cada terminal, a una compartida.
  for (const hoja of raiz.querySelectorAll('.xterm style')) {
    const texto = hoja.textContent || '';
    if (!/\.xterm-fg-\d/.test(texto)) continue;
    const propia = (texto.match(/xterm-dom-renderer-owner-\d+/) || [])[0];
    if (!propia) continue;
    const id = unTema(texto, propia);
    for (const e of raiz.querySelectorAll('.' + propia)) e.classList.add('xterm-tema-' + id);
    hoja.remove();
  }
  return raiz;
}

const leer = (idioma, nombre) => {
  const ruta = resolve(DESDE, idioma, nombre);
  return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
};

function trozo(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  return dom.window.document.body;
}

let total = 0;

for (const idioma of IDIOMAS) {
  const cabina = leer(idioma, 'app-cabina.html');
  const lienzo = leer(idioma, 'app-lienzo.html');
  if (!cabina || !lienzo) {
    console.error(`hacer-demo: falta la ventana de «${idioma}» en el volcado`);
    process.exit(1);
  }

  // La ventana: la de la Cabina (la rejilla tal como se ve), con el Lienzo
  // injertado desde su propio volcado, que es donde está montado y a la vista.
  const base = trozo(cabina);
  const app = base.querySelector('.app');
  const otro = trozo(lienzo);
  const suLienzo = otro.querySelector('.view-lienzo');
  const miLienzo = app.querySelector('.view-lienzo');
  if (suLienzo) {
    const traido = base.ownerDocument.importNode(suLienzo, true);
    traido.setAttribute('style', 'display: none;');
    if (miLienzo) miLienzo.replaceWith(traido);
    else app.querySelector('.view-cabina').appendChild(traido);
  }
  limpiar(app);

  // La barra se volcó con todos los proyectos desplegados, para que la lista de
  // sesiones de cada uno exista y se pueda abrir. De entrada solo queda abierto
  // el primero, que es como se ve la app.
  [...app.querySelectorAll('.projects > .group')].forEach((grupo, i) => {
    const proyecto = grupo.querySelector('.project');
    const lista = [...grupo.children].find((e) => e.matches('ul.sessions'));
    if (!proyecto || !lista || i === 0) return;
    proyecto.setAttribute('data-open', 'false');
    lista.setAttribute('hidden', '');
    const flecha = proyecto.querySelector('.project-caret');
    if (flecha) flecha.textContent = flecha.textContent.replace('▾', '▸');
    const principal = proyecto.querySelector('.project-main');
    const globo = principal?.getAttribute('data-tip');
    if (globo) principal.setAttribute('data-tip', globo.replace(': plegar sus', ': ver sus'));
  });

  const piezas = [];
  const plantilla = (id, html) => piezas.push(`<template id="t-${id}">${html}</template>`);

  // La derecha de la barra cambia con la vista: en la Cabina lleva tres botones más.
  const accionesOtras = otro.querySelector('.topbar-acciones');
  if (accionesOtras) plantilla('acciones-otras', limpiar(accionesOtras).innerHTML);
  plantilla('acciones-cabina', app.querySelector('.topbar-acciones').innerHTML);

  for (const archivo of readdirSync(resolve(DESDE, idioma)).sort()) {
    const m = archivo.match(/^([vx]-[a-z0-9-]+)\.html$/);
    if (!m) continue;
    const cuerpo = limpiar(trozo(leer(idioma, archivo)));
    plantilla(m[1], cuerpo.innerHTML);
  }

  const raiz = JSON.parse(leer(idioma, 'raiz.json') || '{"html":{}}');
  // El saludo del Panel sale de la hora a la que se volcó la app: de madrugada
  // dice «Aún en pie, Sam.», y eso en una portada se lee raro a cualquier hora.
  // En la demostración es siempre el de media tarde.
  const salida = (
    `<!-- GENERADO por scripts/hacer-demo.mjs desde el volcado de la app. No editar a mano. -->\n` +
    `<meta name="adeorq-raiz" content='${JSON.stringify(raiz.html).replace(/'/g, '&#39;')}'>\n` +
    app.outerHTML + '\n' + piezas.join('\n') + '\n'
  )
    .replaceAll('Aún en pie, ', 'Buenas tardes, ')
    .replaceAll('Buenos días, ', 'Buenas tardes, ')
    .replaceAll('Buenas noches, ', 'Buenas tardes, ')
    .replaceAll('Still up, ', 'Good afternoon, ')
    .replaceAll('Good morning, ', 'Good afternoon, ')
    .replaceAll('Good evening, ', 'Good afternoon, ');

  for (const patron of PROHIBIDO) {
    const hallado = salida.match(patron);
    if (hallado) {
      const donde = salida.indexOf(hallado[0]);
      console.error(`hacer-demo: «${hallado[0]}» no puede publicarse (${idioma}): …${salida.slice(Math.max(0, donde - 80), donde + 80).replace(/\s+/g, ' ')}…`);
      process.exit(1);
    }
  }

  writeFileSync(resolve(DEMO, `datos-${idioma}.html`), salida, 'utf8');
  total += salida.length;
  console.log(`datos-${idioma}.html -> ${(salida.length / 1024).toFixed(0)} KB, ${piezas.length} piezas`);
}

/* Las hojas de estilo. Las tres reglas de anchura de la app miden LA VENTANA, y
   ahí eso es correcto porque la app ES la ventana; la demostración se dibuja
   siempre a 1920 x 1080 y luego se encoge, así que dentro de una página esas
   reglas medirían el navegador de quien mira y la pintarían como en un móvil.
   Se quitan. Las de movimiento reducido se quedan. */
function sinAnchura(css) {
  let salida = '';
  let i = 0;
  while (i < css.length) {
    const m = /@media\s*\((?:max|min)-width[^{]*\{/g;
    m.lastIndex = i;
    const hallado = m.exec(css);
    if (!hallado) { salida += css.slice(i); break; }
    salida += css.slice(i, hallado.index);
    let n = 1, j = m.lastIndex;
    for (; j < css.length && n > 0; j++) {
      if (css[j] === '{') n++;
      else if (css[j] === '}') n--;
    }
    i = j;
  }
  return salida;
}

const hojas = sinAnchura(readFileSync(resolve(DESDE, 'hojas.css'), 'utf8'));
const coloresTerminal = [...temas].map(([id, t]) => `/* ==== el color de las terminales, tema ${id} ==== */\n${t.split('xterm-tema-@').join('xterm-tema-' + id).replace(/\bblink_(underline|bar|block)_@/g, 'blink_$1_' + id)}`).join('\n\n');
const css =
  `/* GENERADO por scripts/hacer-demo.mjs: las hojas de estilo que la app tiene\n   cargadas (la suya, la de xterm y la del lienzo). No editar a mano. */\n\n` +
  hojas + '\n\n' + coloresTerminal + '\n';
writeFileSync(resolve(DEMO, 'app.css'), css, 'utf8');
console.log(`app.css -> ${(css.length / 1024).toFixed(0)} KB (${temas.size} tema${temas.size === 1 ? '' : 's'} de terminal)`);
console.log(`total: ${((total + css.length) / 1024).toFixed(0)} KB sin comprimir`);
