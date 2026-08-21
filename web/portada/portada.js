/* ============================================================================
   Adeorq · web/portada/portada.js
   LO QUE MUEVE LA PORTADA.

   Cuatro cosas y ni una mas:
     1. La escala de la ventana viva, que se distribuye a 1920x1080 fijos.
     2. La entrada del titular y de la ventana, con su cinturon de seguridad.
     3. El parallax de las nubes y el latido del haz, atados al scroll.
     4. La barra, que se pone fondo al despegarse de arriba.

   Todo el recorrido pasa por `--motion-gain`: con la valvula en 0 esto sigue
   funcionando, solo que quieto. La opacidad NUNCA se multiplica por el dial,
   que es lo que hace que el efecto degrade en vez de romperse.
   ========================================================================= */

const $ = (s, d = document) => d.querySelector(s);

const GAIN = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--motion-gain')
) || 0;

/* --------------------------------------------------------------------------
   1. LA VENTANA VIVA
   La maqueta mide 1920x1080 por dentro pase lo que pase (ver demo/piezas.css:
   los umbrales de la app estan medidos sobre una ventana de verdad). Aqui solo
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
/* DONDE CAE EL HAZ.
   Su eje tiene que estar en la vertical del boton «Descargar» de la barra. Va
   medido y no escrito a mano: el boton se mueve con el ancho de la ventana, y
   un `left: 76%` fijo dejaba la columna a un palmo del boton en cuanto la
   pantalla cambiaba de tamaño. La imagen vive dentro de la ventana, asi que se
   pasa la distancia en pixeles desde SU borde izquierdo. */
const luz = $('.ventana__luz');
const botonDescarga = $('.nav__acciones .btn--claro');

function situarHaz() {
  if (!luz || !botonDescarga || !caja) return;
  const b = botonDescarga.getBoundingClientRect();
  const v = caja.getBoundingClientRect();
  if (!v.width) return;
  luz.style.setProperty('--haz-x', ((b.left + b.width / 2) - v.left).toFixed(1) + 'px');
}

escalar();
situarHaz();
addEventListener('resize', () => { escalar(); situarHaz(); }, { passive: true });
// El iframe puede tardar: se vuelve a medir cuando termina de cargar.
marco?.addEventListener('load', () => { escalar(); situarHaz(); });

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
   Las nubes se quedan atras y el haz se estira un poco al bajar: profundidad
   con dos propiedades baratas (transform y una variable), sin tocar layout.

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
   4. LAS MOTAS
   Puntos de luz subiendo despacio dentro del resplandor. Van en un lienzo y no
   en cuarenta divs: cuarenta elementos con cuarenta animaciones de CSS son
   cuarenta capas que el navegador compone en cada fotograma.

   Con tres frenos, porque es adorno y no puede costarle la bateria a nadie:
     · fuera de pantalla no se pinta ni un fotograma
     · con la pestaña de fondo, tampoco
     · con el dial a cero se pintan quietas UNA vez y se suelta el bucle
   -------------------------------------------------------------------------- */

(function motas() {
  const lienzo = $('#haz-motas');
  if (!lienzo) return;
  const g = lienzo.getContext('2d', { alpha: true });
  if (!g) return;

  // Media resolucion: son puntos difusos, nadie les va a contar los pixeles, y
  // asi el area que hay que pintar es la cuarta parte.
  const DPR = Math.min(devicePixelRatio || 1, 1.5) * 0.7;
  let W = 0, H = 0, ejeX = 0.5;
  const N = 26;
  const puntos = [];

  // Sin `Math.random()` no, aqui si vale: es adorno y no hay nada que reanudar.
  for (let i = 0; i < N; i++) {
    puntos.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.0,
      v: 0.012 + Math.random() * 0.030,   // por segundo, en alturas de pantalla
      deriva: (Math.random() - 0.5) * 0.012,
      fase: Math.random() * Math.PI * 2,
      brillo: 0.5 + Math.random() * 0.5,
    });
  }

  function medir() {
    const r = lienzo.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width * DPR));
    H = Math.max(2, Math.round(r.height * DPR));
    if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; }
    // Las motas viven alrededor del haz, y el haz cae bajo el boton.
    const b = botonDescarga?.getBoundingClientRect();
    ejeX = b && r.width ? ((b.left + b.width / 2) - r.left) / r.width : 0.5;
  }

  let vivo = false, enPantalla = false, t0 = 0;

  function paso(ts) {
    if (!vivo) return;
    const dt = t0 ? Math.min((ts - t0) / 1000, 0.1) : 0;
    t0 = ts;

    g.clearRect(0, 0, W, H);
    for (const p of puntos) {
      if (GAIN) {
        p.y -= p.v * dt * GAIN;
        p.x += p.deriva * dt * GAIN;
        if (p.y < -0.04) { p.y = 1.04; p.x = ejeX + (Math.random() - 0.5) * 0.5; }
      }
      // Se apagan al alejarse del haz: son motas DENTRO de la luz, no estrellas.
      const cerca = Math.exp(-Math.abs(p.x - ejeX) / 0.16);
      const respira = 0.65 + 0.35 * Math.sin(ts / 900 + p.fase);
      const a = p.brillo * cerca * respira * (0.35 + p.y * 0.65);
      if (a < 0.05) continue;
      g.beginPath();
      g.arc(p.x * W, p.y * H, p.r * DPR * 1.6, 0, Math.PI * 2);
      g.fillStyle = `rgba(214, 234, 255, ${a.toFixed(3)})`;
      g.fill();
    }

    if (!GAIN) { vivo = false; return; }   // valvula cerrada: quietas y fuera
    requestAnimationFrame(paso);
  }

  function despertar() {
    if (vivo || !enPantalla || document.hidden) return;
    vivo = true; t0 = 0;
    requestAnimationFrame(paso);
  }

  medir();
  addEventListener('resize', () => { medir(); despertar(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) vivo = false; else despertar();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(e => {
      enPantalla = e[0].isIntersecting;
      if (enPantalla) { medir(); despertar(); } else vivo = false;
    }, { threshold: 0.01 }).observe(lienzo);
  } else {
    enPantalla = true;
    despertar();
  }
})();
