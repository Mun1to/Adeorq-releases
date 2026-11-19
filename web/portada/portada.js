/* ============================================================================
   Adeorq · web/portada/portada.js
   LO QUE MUEVE LA PORTADA.

   Cuatro cosas y ni una mas:
     1. La escala de la ventana viva, que se distribuye a 1920x1080 fijos.
     2. La entrada del titular y de la ventana, con su cinturon de seguridad.
     3. El parallax de las nubes, atado al scroll.
     4. La barra, que se pone fondo al despegarse de arriba.

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
  const ancho = caja.getBoundingClientRect().width;
  if (!ancho) return;
  caja.style.setProperty('--esc', ancho / 1920);
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
