/* ============================================================================
   Adeorq · web/portada/portada.js
   LO QUE MUEVE LA PORTADA.

   Cinco cosas y ni una mas:
     1. La escala de la ventana viva, que se distribuye a 1920x1080 fijos.
     2. La entrada del titular y de la ventana, con su cinturon de seguridad.
     3. El parallax de las nubes, atado al scroll.
     4. La barra, que se pone fondo al despegarse de arriba.
     5. Los bucles infinitos (la cinta, el latido del chat), quietos fuera de
        la pantalla.

   Todo el recorrido pasa por `--motion-gain`: con la valvula en 0 esto sigue
   funcionando, solo que quieto. La opacidad NUNCA se multiplica por el dial,
   que es lo que hace que el efecto degrade en vez de romperse.
   ========================================================================= */

import { ponerModoLigero } from './ligero.js';

const $ = (s, d = document) => d.querySelector(s);

// Sin tarjeta gráfica, la portada va ligera (ligero.js): se mira una vez, con
// la carga terminada y el navegador sin nada que hacer.
ponerModoLigero();

const GAIN = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--motion-gain')
) || 0;

/* --------------------------------------------------------------------------
   1. LA VENTANA VIVA
   La demostracion mide 1920x1080 por dentro pase lo que pase (ver demo/demo.css:
   es la app volcada, y sus paneles llevan las medidas de ese dia). Aqui solo
   se encoge el DIBUJO, con transform, para que enseñe lo mismo que veria
   cualquiera con la app abierta a pantalla completa.
   -------------------------------------------------------------------------- */

const caja = $('.ventana__caja');
const marco = $('#ventana-demo');

function escalar() {
  if (!caja || !marco) return;
  if (document.documentElement.hasAttribute('data-demo-completa')) {
    // A pantalla completa (completa.js) la caja ya no es 16:9: la demo cabe
    // entera y se centra. Se mide sin girar (`clientWidth`), porque en un
    // móvil en vertical la capa va tumbada y su rectángulo de pantalla no vale.
    const w = caja.clientWidth;
    const h = caja.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / 1920, h / 1080);
    caja.style.setProperty('--esc', k);
    caja.style.setProperty('--dx', `${(w - 1920 * k) / 2}px`);
    caja.style.setProperty('--dy', `${(h - 1080 * k) / 2}px`);
    return;
  }
  const ancho = caja.getBoundingClientRect().width;
  if (!ancho) return;
  caja.style.setProperty('--esc', ancho / 1920);
  caja.style.removeProperty('--dx');
  caja.style.removeProperty('--dy');
}

escalar();
addEventListener('resize', escalar, { passive: true });
// El iframe puede tardar: se vuelve a medir cuando termina de cargar.
marco?.addEventListener('load', escalar);

/* --------------------------------------------------------------------------
   2. LA ENTRADA
   Se enciende con una clase en la seccion y el CSS hace el resto. El
   `requestAnimationFrame` es para que el navegador vea el estado de partida
   antes de cambiarlo; sin el, no hay transicion, hay salto.

   Y lleva cinturon: en una pestaña en segundo plano `rAF` NO dispara, asi que
   sin el `setTimeout` de rescate la portada se quedaria invisible para quien
   abre el enlace en una pestaña de fondo y vuelve un minuto despues.
   -------------------------------------------------------------------------- */

const seccion = $('#haz');
const entrar = () => seccion?.setAttribute('data-entrada', '');
requestAnimationFrame(() => requestAnimationFrame(entrar));
setTimeout(entrar, 900);

/* --------------------------------------------------------------------------
   3. EL SCROLL
   Las nubes se quedan atras al bajar: profundidad con `transform`, que es
   barato, sin tocar layout.

   Un solo listener pasivo y un solo `rAF` en vuelo: leer `scrollY` en cada
   evento y escribir sin agrupar es la receta del tiron.
   -------------------------------------------------------------------------- */

const nubes = [...document.querySelectorAll('[data-parallax]')];
const nav = $('#nav');
let pedido = false;

function pintar() {
  pedido = false;
  const y = scrollY;

  if (nav) nav.toggleAttribute('data-pegada', y > 24);

  if (!GAIN) return;                 // valvula cerrada: la barra sigue, el resto no

  for (const n of nubes) {
    const v = parseFloat(n.dataset.parallax) || 0;
    n.style.transform = `translate3d(0, ${(y * v * GAIN).toFixed(1)}px, 0)`;
  }
}

addEventListener('scroll', () => {
  if (pedido) return;
  pedido = true;
  requestAnimationFrame(pintar);
}, { passive: true });

pintar();

/* --------------------------------------------------------------------------
   5. LO QUE LATE SIN PARAR, QUIETO FUERA DE LA PANTALLA
   La cinta de logos y el punto verde de «trabajando» del chat son bucles
   infinitos. Mientras corren, cada fotograma recalcula su estilo aunque estén
   diez pantallas más arriba. Medido el 2026-11-22 en la revisión aparte, a
   1920: con la página quieta arriba, de 252 a 12 recálculos de estilo por
   segundo y el hilo principal de 272 a 102 ms/s; bajando, de 359 a 310 ms/s.
   Fuera de la vista se paran (portada.css,
   `[data-fuera]`) y siguen donde estaban al volver: nadie los ve pararse.
   -------------------------------------------------------------------------- */

if ('IntersectionObserver' in window) {
  const vigia = new IntersectionObserver((entradas) => {
    for (const e of entradas) e.target.toggleAttribute('data-fuera', !e.isIntersecting);
  });
  for (const el of document.querySelectorAll('.cinta__ventana, .rchat')) vigia.observe(el);
}
