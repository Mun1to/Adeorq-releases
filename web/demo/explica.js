/* ============================================================================
   Adeorq · demo/explica.js
   ADEO TE LO CUENTA.

   Dos piezas que son la misma, el bocadillo de Adeo:

     · `decir`: lo que un botón hace en la app y aquí no puede (abrir una
       terminal de verdad, llamar a un agente), dicho por Adeo al lado de lo
       que has pulsado. Antes era un aviso de 13,5 px abajo en el centro, que
       dentro de la portada, encogida a la mitad, se leía a 7 px y lejos del
       clic: nadie lo veía (Munir, 2026-11-22: «que cuando hagas click en
       algunos botones te lo explique»).
     · `recorrido`: la primera vez que alguien ve la demo, Adeo baja de su
       sitio en la barra y la enseña por partes, con una flecha dibujada a mano
       hasta cada una y lo demás un poco más oscuro. Se puede saltar, sale una
       sola vez por visitante y se puede volver a ver pulsando a Adeo.

   EL TAMAÑO VA EN PÍXELES DE PANTALLA. La ventana mide siempre 1920 x 1080 y
   la portada la encoge (a la mitad en un portátil, a una quinta parte en el
   móvil). Lo de Adeo no puede encogerse con ella o no se lee: la capa lleva
   `--px`, lo que mide un píxel de pantalla dentro de la ventana, y todo su
   CSS se escribe como `calc(15px * var(--px))`. La letra sale a 15 px en
   cualquier pantalla, como los bocadillos de Adeo de la portada (14,5 o más).

   EL MOVIMIENTO VA CON EL DIAL DE LA PORTADA (`--motion-gain`, ver
   `portada/valvula.js`): con «reducir movimiento» los saltos son cortos y con
   la válvula parada no hay ninguno, solo fundidos. Se anima con la API de
   animaciones y no con `@keyframes`, porque demo.css apaga toda animación CSS
   de la ventana (lo que latía solo se lo cobraba al scroll de la portada) y
   esto solo se mueve cuando Adeo habla.
   ========================================================================= */

import { flechaBuena } from './flecha.js';

const NS = 'http://www.w3.org/2000/svg';
const CLAVE = 'adeorq.demo.recorrido';

/** Lo que ya ha visto este visitante. El almacenamiento puede no estar (una
 *  ventana privada, una vista previa): entonces el recorrido sale y ya. */
export function recorridoVisto() {
  try { return localStorage.getItem(CLAVE) === 'visto'; } catch { return false; }
}
function marcarVisto() {
  try { localStorage.setItem(CLAVE, 'visto'); } catch { /* sin almacenamiento */ }
}

/** El dial de movimiento: el de la portada si la demo va dentro de ella, y si
 *  no, la misma regla que usa la portada (la URL, luego el sistema). */
export function ganancia() {
  try {
    if (window.parent !== window) {
      const de = window.parent.document.documentElement;
      if (de.hasAttribute('data-quieto')) return 0;
      const g = parseFloat(getComputedStyle(de).getPropertyValue('--motion-gain'));
      if (Number.isFinite(g)) return Math.max(0, Math.min(1, g));
    }
  } catch { /* dentro de una página de otro origen */ }
  const q = new URLSearchParams(location.search).get('motion');
  if (q === 'off') return 0;
  if (q === 'full') return 1;
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.app       la ventana de la app (`.app`)
 * @param {boolean} o.EN
 * @param {(r: DOMRect) => {left:number,top:number,width:number,height:number,right:number,bottom:number}} o.dentro
 *        un rectángulo de pantalla, en las medidas de la ventana
 * @param {() => number} o.escala   cuántos píxeles de pantalla mide uno de la ventana
 * @param {() => Element|null} o.casa  el Adeo de la barra, del que sale y al que vuelve
 * @param {() => Element[]} [o.pegado] lo que lleva pegado en su sitio (el «1» rojo de
 *        las terminales que te esperan): se va con él y vuelve con él
 */
export function prepararAdeo({ app, EN, dentro, escala, casa, pegado }) {
  const T = EN
    ? { anterior: 'Back', siguiente: 'Next', fin: 'Try it', saltar: 'Skip the tour', de: (i, n) => `${i} of ${n}`, rotulo: 'Tour of the demo' }
    : { anterior: 'Anterior', siguiente: 'Siguiente', fin: 'A tocar', saltar: 'Saltar el recorrido', de: (i, n) => `${i} de ${n}`, rotulo: 'Recorrido por la demo' };

  const capa = document.createElement('div');
  capa.className = 'adeo-capa';
  const foco = document.createElement('div');
  foco.className = 'adeo-foco';
  foco.hidden = true;
  const lienzo = document.createElementNS(NS, 'svg');
  lienzo.setAttribute('class', 'adeo-flecha');
  lienzo.setAttribute('viewBox', '0 0 1920 1080');
  lienzo.setAttribute('aria-hidden', 'true');
  capa.append(foco, lienzo);
  app.appendChild(capa);

  let globo = null;
  let relojCallar = 0;
  let tiempoGlobo = 0;    // lo que le tocaba durar al bocadillo de ahora
  let relojParpadeo = 0;
  let paseo = null;   // el recorrido en marcha: { pasos, i, alAcabar }
  let ultimas = null; // lo que enseña la parada de ahora (aro, bocadillo y flecha), de su último pintado
  let estabaEnCasa = false;   // la parada de antes era la de su sitio en la barra

  /* ── medidas ─────────────────────────────────────────────────────────── */

  let px = 1;
  let compacto = false;
  function medir() {
    const k = escala();
    px = k > 0 ? 1 / k : 1;
    capa.style.setProperty('--px', String(px));
    /* En el móvil la demo mide unos 360 x 200 px: el bocadillo va sin la cara
       de Adeo (que en la portada está justo encima saludando, y en la barra de
       la app) y más justo, o taparía la demo entera. */
    compacto = 1920 * k < 560;
    capa.toggleAttribute('data-compacto', compacto);
  }

  const caja = (el) => {
    const r = el.getBoundingClientRect();
    return r.width || r.height ? dentro(r) : null;
  };
  const inflar = (r, d) => ({ left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d, width: r.width + 2 * d, height: r.height + 2 * d });
  const centro = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  /* ── Adeo ────────────────────────────────────────────────────────────── */

  /** Un Adeo para el bocadillo: el mismo dibujo de la barra, copiado. */
  function cara() {
    const suyo = casa();
    const span = document.createElement('span');
    span.className = 'adeo-cara';
    if (suyo) {
      const copia = suyo.cloneNode(true);
      copia.removeAttribute('width');
      copia.removeAttribute('height');
      copia.removeAttribute('data-animo');
      copia.removeAttribute('style');   // fuera de casa, la de la barra va escondida
      copia.setAttribute('class', 'adeo-svg');
      span.appendChild(copia);
    }
    return span;
  }

  /** Adeo en su sitio de la barra, y con él lo que lleva pegado: si solo se
   *  fuera él, el «1» rojo se quedaría flotando en el hueco. */
  function enSuSitio(esta) {
    for (const el of [casa(), ...(pegado?.() ?? [])]) if (el) el.style.visibility = esta ? '' : 'hidden';
  }

  /** Sale de su sitio en la barra: mientras explica, ahí no está. */
  function salirDeCasa(sitio) {
    const suyo = casa();
    const svg = sitio.querySelector('.adeo-svg');
    if (!svg) return volverACasa();   // bocadillo sin cara: Adeo se queda en su sitio
    enSuSitio(false);
    const g = ganancia();
    if (!suyo || g === 0) return;
    const a = caja(suyo), b = caja(svg);
    if (!a || !b) return;
    const dx = (centro(a).x - centro(b).x) * g;
    const dy = (centro(a).y - centro(b).y) * g;
    svg.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: 0.4 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 46 * px * g}px) scale(.85)`, opacity: 1, offset: 0.55 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
  }

  function volverACasa() {
    enSuSitio(true);
  }

  /** Un saltito al decir algo nuevo, y el parpadeo de vez en cuando. */
  function brincar(sitio) {
    const g = ganancia();
    const svg = sitio.querySelector('.adeo-svg');
    if (!svg || g === 0) return;
    svg.animate(
      [{ transform: 'none' }, { transform: `translateY(${-9 * px * g}px)` }, { transform: 'none' }],
      { duration: 380, easing: 'ease-out' },
    );
  }

  /* El ojo de Adeo (el triángulo blanco y su pupila) se cierra un momento:
     sus cuadritos pasan al azul del cuerpo y vuelven. Va con el dial: con la
     válvula parada, no parpadea. */
  function parpadear(sitio) {
    clearTimeout(relojParpadeo);
    const svg = sitio.querySelector('.adeo-svg');
    if (!svg) return;
    const ojo = [...svg.querySelectorAll('rect')].filter((r) => /^#(f1faff|0e2c47)$/i.test(r.getAttribute('fill') ?? ''));
    const cuerpo = svg.querySelector('rect')?.getAttribute('fill') ?? '#39a9f6';
    const vuelta = () => {
      relojParpadeo = setTimeout(() => {
        if (!svg.isConnected) return;
        if (ganancia() > 0) {
          const antes = ojo.map((r) => r.getAttribute('fill'));
          for (const r of ojo) r.setAttribute('fill', cuerpo);
          setTimeout(() => ojo.forEach((r, i) => r.setAttribute('fill', antes[i])), 130);
        }
        vuelta();
      }, 2600 + Math.random() * 2400);
    };
    vuelta();
  }

  /* ── el bocadillo ────────────────────────────────────────────────────── */

  function boton(texto, clase, hacer) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'adeo-btn ' + clase;
    b.textContent = texto;
    b.addEventListener('click', (e) => {
      // Es de Adeo, no de la app: que no le conteste ninguna regla de vivo.js.
      e.stopPropagation();
      hacer();
    });
    return b;
  }

  function pintar({ titulo, texto, botones = [], saltar, contador, rol = 'status', sinCara = false }) {
    const g = document.createElement('div');
    g.className = 'adeo-dice';
    g.setAttribute('role', rol);
    if (rol === 'dialog') g.setAttribute('aria-label', T.rotulo);
    const bocadillo = document.createElement('div');
    bocadillo.className = 'adeo-bocadillo';
    if (titulo || saltar) {
      const cab = document.createElement('div');
      cab.className = 'adeo-cab';
      if (titulo) {
        const b = document.createElement('b');
        b.className = 'adeo-titulo';
        b.textContent = titulo;
        cab.appendChild(b);
      }
      if (saltar) {
        const x = boton('', 'adeo-x', saltar);
        x.setAttribute('aria-label', T.saltar);
        x.title = T.saltar;
        x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
        cab.appendChild(x);
      }
      bocadillo.appendChild(cab);
    }
    const p = document.createElement('p');
    p.className = 'adeo-texto';
    p.textContent = texto;
    bocadillo.appendChild(p);
    if (botones.length || contador) {
      const pie = document.createElement('div');
      pie.className = 'adeo-pie';
      if (contador) {
        const n = document.createElement('span');
        n.className = 'adeo-cuenta';
        n.textContent = contador;
        pie.appendChild(n);
      }
      for (const b of botones) pie.appendChild(b);
      bocadillo.appendChild(pie);
    }
    if (sinCara) g.dataset.enCasa = 'true';
    else if (!compacto) g.appendChild(cara());
    g.appendChild(bocadillo);
    /* Con el puntero encima no se va; al salir vuelve a contar su tiempo
       entero. Un tiempo corto al salir lo cerraba solo: WebKit da por salido
       el ratón quieto cuando el bocadillo se desliza al aparecer, y un dedo
       siempre «sale» al levantarse. */
    g.addEventListener('pointerenter', () => clearTimeout(relojCallar));
    g.addEventListener('pointerleave', () => { if (!paseo && globo === g) programarCallar(tiempoGlobo); });
    // Que el clic dentro del bocadillo no lo cierre ni lo lea la app.
    g.addEventListener('pointerdown', (e) => e.stopPropagation());
    g.addEventListener('click', (e) => e.stopPropagation());
    return g;
  }

  /** Dónde va el bocadillo para no tapar lo que señala. Con `cerca` primero
   *  debajo y encima (lo de pulsar), y en el recorrido por donde haya más sitio. */
  function colocar(g, r, hueco, porSitio, prefiere) {
    const W = 1920, H = 1080, m = 10 * px;
    const t = caja(g);
    const w = t.width, h = t.height;
    const enX = (x) => Math.max(m, Math.min(W - w - m, x));
    const enY = (y) => Math.max(m, Math.min(H - h - m, y));
    if (!r) return { x: enX(W / 2 - w / 2), y: H - h - 28 * px, lado: 'abajo' };
    const c = centro(r);
    // Adeo va a la izquierda del bocadillo: que caiga bajo lo que se señala.
    const x = enX(c.x - 30 * px);
    // Al lado de algo muy alto (la barra de proyectos entera), arriba de su
    // altura y no en el medio: ahí empieza lo que se lee.
    const yLado = r.height > 3 * h ? enY(r.top + Math.min(r.height * 0.2, 160 * px)) : enY(c.y - h / 2);
    const cand = [
      { x, y: r.bottom + hueco, lado: 'abajo', sitio: H - r.bottom },
      { x, y: r.top - hueco - h, lado: 'arriba', sitio: r.top },
      { x: r.right + hueco, y: yLado, lado: 'derecha', sitio: W - r.right },
      { x: r.left - hueco - w, y: yLado, lado: 'izquierda', sitio: r.left },
    ];
    if (porSitio) cand.sort((a, b) => b.sitio - a.sitio);
    if (prefiere) cand.sort((a, b) => (b.lado === prefiere) - (a.lado === prefiere));
    const cabe =(k) => k.x >= m - 0.5 && k.y >= m - 0.5 && k.x + w <= W - m + 0.5 && k.y + h <= H - m + 0.5;
    const bueno = cand.find(cabe);
    if (bueno) return bueno;
    /* No cabe al lado (en el móvil, o lo señalado ocupa media ventana): en la
       esquina contraria, para tapar lo menos posible de lo que se señala. Si
       aun así se montan, sin flecha: el aro ya dice dónde. */
    const k = {
      x: c.x < W / 2 ? W - w - m : m,
      y: c.y < H / 2 ? H - h - m : m,
    };
    const montan = k.x < r.right && r.left < k.x + w && k.y < r.bottom && r.top < k.y + h;
    return { ...k, lado: montan ? 'dentro' : 'enfrente' };
  }

  function poner(g, sitio) {
    g.style.left = sitio.x + 'px';
    g.style.top = sitio.y + 'px';
  }

  function aparecer(g, lado) {
    const d = 12 * px * ganancia();
    const desde = lado === 'arriba' ? `translateY(${d}px)` : lado === 'izquierda' ? `translateX(${d}px)` : lado === 'derecha' ? `translateX(${-d}px)` : `translateY(${-d}px)`;
    g.animate([{ opacity: 0, transform: desde }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  function programarCallar(ms) {
    clearTimeout(relojCallar);
    tiempoGlobo = ms;
    relojCallar = setTimeout(callar, ms);
  }

  function quitarGlobo() {
    clearTimeout(relojCallar);
    clearTimeout(relojParpadeo);
    globo?.remove();
    globo = null;
  }

  /** Adeo se calla y vuelve a su sitio en la barra. */
  function callar() {
    if (paseo) return;
    quitarGlobo();
    volverACasa();
  }

  /**
   * Adeo cuenta algo al lado de `cerca` (lo que se acaba de pulsar). Durante
   * el recorrido no interrumpe: el recorrido ya está hablando.
   */
  function decir(texto, cerca, { titulo, botones } = {}) {
    if (paseo || !texto) return;
    medir();
    const habia = !!globo;
    quitarGlobo();
    globo = pintar({ titulo, texto, botones: (botones ?? []).map((b) => boton(b.texto, 'adeo-btn--prim', () => { callar(); b.hacer(); })) });
    globo.style.visibility = 'hidden';
    capa.appendChild(globo);
    const r = cerca?.isConnected ? caja(cerca) : null;
    const sitio = colocar(globo, r, 12 * px, false);
    poner(globo, sitio);
    globo.style.visibility = '';
    aparecer(globo, sitio.lado);
    if (!habia) salirDeCasa(globo);
    else brincar(globo);
    parpadear(globo);
    // Lo que se lee tarda: unos 15 caracteres por segundo, con un suelo y un techo.
    if (!botones?.length) programarCallar(Math.min(9500, 2800 + texto.length * 55));
    else programarCallar(12000);
  }

  // Un clic fuera del bocadillo lo cierra; si ese clic dice otra cosa, sale de nuevo.
  app.addEventListener('pointerdown', (e) => {
    if (!paseo && globo && !globo.contains(e.target)) callar();
  }, true);

  /* ── la flecha ───────────────────────────────────────────────────────── */

  /** La flecha de `flecha.js`, del bocadillo a lo que señala, solo si pasa su
   *  revisión: si entre los dos no cabe una buena, no hay flecha y el aro ya
   *  dice dónde. */
  function flecha(quien, hasta, comba) {
    lienzo.replaceChildren();
    const bocadillo = quien?.querySelector('.adeo-bocadillo');
    const desde = bocadillo && caja(bocadillo);
    if (!desde || !hasta) return;
    const suCara = quien.querySelector('.adeo-cara');
    const cara = suCara && caja(suCara);
    // Del bocadillo, sin pasar por encima de Adeo; y si Adeo queda en medio (el
    // bocadillo a la derecha de lo señalado), de los dos juntos.
    const f = flechaBuena({ desde, hasta, px, comba, evitar: cara ? [cara] : [] })
      ?? (cara ? flechaBuena({ desde: juntar([desde, cara]), hasta, px, comba }) : null);
    if (!f) return;
    const { tallo, punta } = f;

    const trazo = (d, clase, ancho) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', clase);
      p.setAttribute('stroke-width', String(ancho));
      lienzo.appendChild(p);
      return p;
    };
    // Debajo, un borde del color del fondo de la app: la flecha cruza texto de
    // las terminales y así se lee por encima, sin chocar con lo de debajo.
    trazo(tallo, 'adeo-flecha-halo', f.halo);
    trazo(punta, 'adeo-flecha-halo', f.halo);
    const t = trazo(tallo, 'adeo-flecha-trazo', f.ancho);
    const pu = trazo(punta, 'adeo-flecha-trazo', f.ancho);

    const g = ganancia();
    if (g > 0) {
      const largoTallo = t.getTotalLength();
      t.style.strokeDasharray = String(largoTallo);
      t.animate([{ strokeDashoffset: largoTallo }, { strokeDashoffset: 0 }], { duration: 300 + 260 * g, easing: 'cubic-bezier(.35,.6,.3,1)' });
      pu.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 300 + 300 * g });
    }
  }

  /* ── el recorrido ────────────────────────────────────────────────────── */

  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && !!caja(el);

  /** Pinta el aro alrededor de `caja` y devuelve lo que ocupa tal como queda
   *  pintado, ceñido a la ventana. */
  function pintarFoco(caja) {
    if (!caja) { foco.hidden = true; return null; }
    const d = 7 * px;
    // Dentro de la ventana: lo que va pegado a un borde no saca el aro fuera.
    const l = Math.max(d + 2, caja.left), t = Math.max(d + 2, caja.top);
    const r = { left: l, top: t, width: Math.min(1920 - d - 2, caja.right) - l, height: Math.min(1080 - d - 2, caja.bottom) - t };
    const animar = !foco.hidden && ganancia() >= 0.5;
    foco.style.transition = animar ? '' : 'none';
    foco.hidden = false;
    foco.style.left = r.left - d + 'px';
    foco.style.top = r.top - d + 'px';
    foco.style.width = r.width + 2 * d + 'px';
    foco.style.height = r.height + 2 * d + 'px';
    if (!animar) requestAnimationFrame(() => { foco.style.transition = ''; });
    return { left: r.left - d, top: r.top - d, right: r.left + r.width + d, bottom: r.top + r.height + d };
  }

  function paso(i, sentido = 1) {
    if (!paseo) return;
    const { pasos } = paseo;
    let el = null;
    // Un paso cuyo sitio ya no está (contestaste el permiso, cerraste esa
    // terminal) se salta: el recorrido no señala al vacío.
    for (; i >= 0 && i < pasos.length; i += sentido) {
      pasos[i].antes?.();
      el = pasos[i].el();
      if (visible(el)) break;
    }
    if (i < 0) return paso(0, 1);
    if (i >= pasos.length) return acabar();
    paseo.i = i;
    pintarPaso(true);
  }

  /** La parada de ahora. `mover` solo cuando se llega a ella: al volver a
   *  pintarla (cambió el tamaño de la ventana, algo se movió dentro) la portada
   *  no se toca. En un teléfono la barra del navegador sale y se esconde al
   *  bajar, y cada vez es un cambio de tamaño: si eso moviera la página, se
   *  movería sola mientras alguien la baja. */
  function pintarPaso(mover = false) {
    const { pasos, i } = paseo;
    const p = pasos[i];
    const el = p.el();
    if (!visible(el)) return paso(i + 1);
    medir();
    const ultimo = i === pasos.length - 1;
    const botones = [];
    if (i > 0) botones.push(boton(T.anterior, 'adeo-btn--sec', () => paso(paseo.i - 1, -1)));
    botones.push(boton(ultimo ? T.fin : T.siguiente, 'adeo-btn--prim', () => (ultimo ? acabar() : paso(paseo.i + 1, 1))));
    const habia = !!globo;
    quitarGlobo();
    // Cuando lo señalado es su propio sitio en la barra, Adeo vuelve a él y
    // habla desde ahí: no hay dos Adeos a la vez.
    const enCasa = !!p.enCasa;
    globo = pintar({ titulo: p.titulo, texto: p.texto, botones, saltar: acabar, contador: T.de(i + 1, pasos.length), rol: 'dialog', sinCara: enCasa });
    globo.style.visibility = 'hidden';
    capa.appendChild(globo);
    // Lo señalado puede ser varias piezas (las fichas de la tira): su contorno.
    const r = p.partes ? juntar(p.partes().map(caja).filter(Boolean)) ?? caja(el) : caja(el);
    const aro = pintarFoco(r);
    // Lejos lo bastante para que quepa una flecha de verdad (80 px de trazo
    // entre el bocadillo y lo señalado, ver `flecha.js`): a 74 px salían
    // ganchos de 45-62 px.
    const sitio = colocar(globo, inflar(r, 7 * px), 116 * px, true, p.lado);
    poner(globo, sitio);
    globo.style.visibility = '';
    // La flecha, antes de que el bocadillo entre deslizándose: medida con su
    // animación ya puesta (`aparecer` lo corre 12 px), salía a 22 px de él.
    // Sale del bocadillo con Adeo incluido: si saliera del bocadillo solo,
    // cruzaría por encima de él cuando está del lado de lo señalado.
    if (sitio.lado === 'dentro') lienzo.replaceChildren();
    else flecha(globo, r, i % 2 ? -1 : 1);
    aparecer(globo, sitio.lado);
    if (enCasa) {
      volverACasa();
      const suyo = casa();
      if (suyo && ganancia() > 0) {
        suyo.animate([{ transform: 'none' }, { transform: `translateY(${-5 * ganancia()}px)` }, { transform: 'none' }], { duration: 380, easing: 'ease-out' });
      }
    } else if (!habia || estabaEnCasa) salirDeCasa(globo);
    else brincar(globo);
    estabaEnCasa = enCasa;
    parpadear(globo);
    // Visto cuando de verdad se ha enseñado algo: si al empezar no había ninguna
    // parada a la vista, no cuenta y vuelve a salir la próxima vez.
    if (!paseo.enseñado) {
      paseo.enseñado = true;
      marcarVisto();
    }
    // El bocadillo donde queda, sin el desliz con que entra.
    const t = caja(globo);
    ultimas = [aro, t && { left: sitio.x, top: sitio.y, right: sitio.x + t.width, bottom: sitio.y + t.height }, cajaDeLaFlecha()];
    if (mover) aLaVista(ultimas);
  }

  function cajaDeLaFlecha() {
    if (!lienzo.firstChild) return null;
    const b = lienzo.getBBox();
    return b.width || b.height ? { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height } : null;
  }

  /* LA BARRA DE LA PORTADA. La portada lleva una barra fija arriba, y con la
     demo centrada en un portátil tapaba entero el aro de «Ordenar» y el de
     Adeo, con su flecha. Al llegar a cada parada, si lo que se enseña (el aro
     tal como se pinta, el bocadillo y la flecha) cae debajo de esa barra, bajo
     lo fijo de abajo (el aviso de idioma tapaba entero el aro de la parada 3)
     o se sale por abajo, la portada se mueve lo justo para dejarlo a la vista
     con aire; si ya se ve, no se mueve. Con la válvula parada, sin animar. */
  const AIRE = 14;   // px de pantalla entre lo que se enseña y lo fijo, o el borde de abajo

  /* LO FIJO DE LA PORTADA, por sus hojas de estilo. Los candidatos son lo que
     casa con una regla que pone `position: fixed` o `sticky` (en cualquier
     `@media`, se cumpla ahora o no) y lo que lleva `position` en su `style`; de
     ellos vale lo que de verdad es fijo ahora. Las reglas se leen una vez y se
     releen si cambia el número de hojas. Medido con la CPU a 4x en un móvil:
     muestrear la pantalla con `elementFromPoint` eran de 243 a 288 llamadas
     por parada (de 113 a 334 ms), y pedir el estilo a los 2.018 elementos de
     la portada, de 40 a 64 ms; buscar lo que casa con esas reglas, de 2 a 3.
     Una hoja de otro origen no se deja leer y no cuenta. */
  let reglasFijas = null, hojasLeidas = -1;
  function selectorDeLoFijo(doc) {
    if (reglasFijas !== null && hojasLeidas === doc.styleSheets.length) return reglasFijas;
    const sel = new Set(['[style*="position"]']);
    const mirar = (reglas) => {
      for (const r of reglas) {
        if (/fixed|sticky|var\(/.test(r.style?.position ?? '') && r.selectorText) sel.add(r.selectorText);
        if (r.cssRules) mirar(r.cssRules);                       // @media, @supports, @layer, anidadas
        if (r.styleSheet) try { mirar(r.styleSheet.cssRules); } catch { /* @import ajeno */ }
      }
    };
    for (const hoja of doc.styleSheets) try { mirar(hoja.cssRules); } catch { /* de otro origen */ }
    // Un selector anidado o raro que `querySelectorAll` no entiende rompería la lista entera.
    const validos = [...sel].filter((s) => { try { doc.querySelector(s); return true; } catch { return false; } });
    hojasLeidas = doc.styleSheets.length;
    return (reglasFijas = validos.join(','));
  }
  // Se leen en un rato muerto de la portada y no al pintar la primera parada:
  // la primera lectura de sus reglas son de 20 a 34 ms con la CPU a 4x.
  try {
    const fuera = window.frameElement && window.parent;
    if (fuera && fuera !== window) {
      const leer = () => { try { selectorDeLoFijo(fuera.document); } catch { /* */ } };
      if (fuera.requestIdleCallback) fuera.requestIdleCallback(leer, { timeout: 3000 });
      else fuera.setTimeout(leer, 500);
    }
  } catch { /* la portada es de otro origen */ }

  /** Lo fijo de la portada que tapa ahora la columna de la demo (entre `l` y
   *  `r`, en px de su ventana): lo que se ve, no mide media ventana o más (eso
   *  es una capa, no una barra) y, si es `sticky`, está pegado a su sitio. */
  function tapanAhora(fuera, marco, l, r) {
    const H = fuera.innerHeight;
    const lista = [];
    for (const el of fuera.document.querySelectorAll(selectorDeLoFijo(fuera.document))) {
      if (el.contains(marco)) continue;
      const c = el.getBoundingClientRect();
      if (!c.width || !c.height || c.height >= H / 2) continue;
      if (c.right <= l || c.left >= r || c.bottom <= 0 || c.top >= H) continue;
      const cs = fuera.getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      if (cs.position === 'sticky') {
        const pegadoArriba = Math.abs(c.top - parseFloat(cs.top)) < 1;
        const pegadoAbajo = Math.abs(H - c.bottom - parseFloat(cs.bottom)) < 1;
        if (!pegadoArriba && !pegadoAbajo) continue;
      }
      lista.push(c);
    }
    return lista;
  }

  /** Hasta dónde tapa lo fijo de arriba de la portada, en px desde arriba de su
   *  ventana: el borde de abajo de lo fijo que cae en su mitad de arriba, esté
   *  pegado arriba o flote a unos píxeles (la píldora del móvil va a 10 px, la
   *  barra del escritorio a 14 sin pegar), y lo que cuelgue debajo (el aviso de
   *  idioma, en el móvil). Sin atarse a cómo se llama la barra; si la portada
   *  declara `scroll-padding-top`, también vale. */
  function techo(fuera, marco, m) {
    const H = fuera.innerHeight;
    let tope = parseFloat(fuera.getComputedStyle(fuera.document.documentElement).scrollPaddingTop) || 0;
    for (const c of tapanAhora(fuera, marco, m.left, m.right)) if (c.top + c.bottom < H) tope = Math.max(tope, c.bottom);
    return tope;
  }

  /** Desde dónde tapa lo fijo de abajo (el aviso de idioma, la válvula del
   *  movimiento, «subir»), en px desde arriba de su ventana: el borde de arriba
   *  de lo fijo de su mitad de abajo que cae encima de lo que se enseña (entre
   *  `l` y `r`), no de toda la demo: el aviso va a la izquierda, y una parada de
   *  la derecha no tiene por qué subir por él. Sin nada, el borde de la ventana
   *  (o su `scroll-padding-bottom`). */
  function suelo(fuera, marco, l, r) {
    const H = fuera.innerHeight;
    let pie = H - (parseFloat(fuera.getComputedStyle(fuera.document.documentElement).scrollPaddingBottom) || 0);
    for (const c of tapanAhora(fuera, marco, l, r)) if (c.top + c.bottom >= H) pie = Math.min(pie, c.top);
    return pie;
  }

  /* SI EL VISITANTE MUEVE LA PÁGINA, GANA ÉL. El desliz del recorrido se para
     en cuanto gira la rueda, toca la pantalla, pulsa una tecla o la página se
     mueve por otro lado, y una parada que llega mientras la está moviendo (hace
     menos de 800 ms) no la mueve. Va a mano, fotograma a fotograma, y no con
     `scrollBy({ behavior: 'smooth' })`: ese no se deja parar, y una rueda a
     media animación podía perderse. El scroll que llega justo después de que
     la portada cambie de tamaño (girar el móvil) lo recoloca el navegador, no
     el visitante: tomado por suyo, la parada que sube con la ventana se
     quedaba sin colocar y acababa con el bocadillo un 35 % bajo la barra. */
  let deslizando = null;        // el desliz en marcha: { parar }
  let yPuesta = null;           // el último scrollY que puso el recorrido
  let movidaAjena = -Infinity;  // cuándo movió la página otro, en el reloj de la portada
  let cambioDeTamano = -Infinity;   // cuándo cambió de tamaño la portada, en el mismo reloj
  try {
    const fuera = window.frameElement && window.parent;
    if (fuera && fuera !== window) {
      const opc = { capture: true, passive: true };
      const suelta = () => deslizando?.parar();
      for (const w of [fuera, window]) {
        for (const e of ['wheel', 'touchstart', 'keydown']) w.addEventListener(e, suelta, opc);
        w.addEventListener('wheel', () => { movidaAjena = fuera.performance.now(); }, opc);
      }
      fuera.addEventListener('resize', () => { cambioDeTamano = fuera.performance.now(); }, { passive: true });
      fuera.addEventListener('scroll', () => {
        if (yPuesta !== null && Math.abs(fuera.scrollY - yPuesta) <= 1.5) return;   // la puso el recorrido
        yPuesta = null;
        deslizando?.parar();
        if (fuera.performance.now() - cambioDeTamano < 150) return;   // la recolocó el navegador
        movidaAjena = fuera.performance.now();
      }, { passive: true });
    }
  } catch { /* la portada es de otro origen */ }

  function deslizar(fuera, dy) {
    deslizando?.parar();
    const de = fuera.document.documentElement;
    const ponerEn = (y) => {
      const antes = de.style.scrollBehavior;
      de.style.scrollBehavior = 'auto';
      fuera.scrollBy(0, y - fuera.scrollY);
      de.style.scrollBehavior = antes;
      yPuesta = fuera.scrollY;
    };
    const desde = fuera.scrollY;
    const hasta = Math.max(0, Math.min(desde + dy, de.scrollHeight - de.clientHeight));
    if (ganancia() <= 0) { ponerEn(hasta); return; }   // con la válvula parada, de golpe
    const dura = Math.min(600, 260 + Math.abs(hasta - desde) * 0.8);
    const t0 = fuera.performance.now();
    let id = 0;
    const este = { parar: () => { fuera.cancelAnimationFrame(id); if (deslizando === este) deslizando = null; } };
    const fotograma = () => {
      if (deslizando !== este) return;
      if (Math.abs(fuera.scrollY - yPuesta) > 1.5) { este.parar(); return; }   // otro la movió entre medias
      const u = Math.min(1, (fuera.performance.now() - t0) / dura);
      ponerEn(desde + (hasta - desde) * (1 - (1 - u) ** 3));
      if (u < 1) id = fuera.requestAnimationFrame(fotograma);
      else este.parar();
    };
    yPuesta = desde;
    deslizando = este;
    id = fuera.requestAnimationFrame(fotograma);
  }

  /** Lo que aún mueve la demo dentro de la portada: sus animaciones en marcha y
   *  con fin sobre algo que contiene el marco (la ventana entra subiendo 46 px).
   *  Una a la que le quedan más de 10 s no se espera. */
  function llegando(fuera, marco) {
    const lista = [];
    for (const a of fuera.document.getAnimations()) {
      const t = a.effect?.target;
      if (a.playState !== 'running' || !t?.contains(marco)) continue;
      const queda = (a.effect.getComputedTiming().endTime - (a.currentTime ?? 0)) / (a.playbackRate || 1);
      if (Number.isFinite(queda) && queda > 0 && queda < 10000) lista.push(a);
    }
    return lista;
  }

  function aLaVista(cajas, esperar = true) {
    try {
      const marco = window.frameElement;
      const fuera = window.parent;
      const zona = juntar(cajas.filter(Boolean));
      if (!marco || fuera === window || !zona) return;
      // A pantalla completa (portada/completa.js) la demo se ve entera y la
      // portada de debajo no se mueve.
      if (fuera.document.documentElement.hasAttribute('data-demo-completa')) return;
      deslizando?.parar();   // el de la parada de antes ya no vale
      if (fuera.performance.now() - movidaAjena < 800) return;
      // La ventana de la portada aún llega: medida ahora, al acabar de subir la
      // parada quedaba debajo de la barra (a 390 px, el bocadillo un 14-20 %).
      // Se mira cuando llegue, una vez, si sigue la misma parada y nadie ha
      // movido la página entretanto, con lo que enseña entonces: un cambio de
      // alto (la barra del móvil) la vuelve a pintar mientras sube, y con lo de
      // antes el bocadillo acababa un 23 % bajo la barra.
      const llega = esperar ? llegando(fuera, marco) : [];
      if (llega.length) {
        const ficha = paseo, en = paseo?.i, quieta = movidaAjena;
        const mirar = () => { if (paseo && paseo === ficha && paseo.i === en && movidaAjena === quieta) aLaVista(ultimas, false); };
        Promise.all(llega.map((a) => a.finished.catch(() => {}))).then(mirar);
        return;
      }
      const k = escala();
      const m = marco.getBoundingClientRect();
      const arriba = m.top + zona.top * k, abajo = m.top + zona.bottom * k;
      const tapa = techo(fuera, marco, m) + AIRE;
      const fondo = suelo(fuera, marco, m.left + zona.left * k, m.left + zona.right * k) - AIRE;
      let dy = 0;
      if (arriba < tapa) dy = arriba - tapa;
      else if (abajo > fondo) dy = Math.min(abajo - fondo, arriba - tapa);
      if (Math.abs(dy) < 2) return;
      deslizar(fuera, dy);
    } catch { /* la portada es de otro origen: se queda como está */ }
  }

  function juntar(cajas) {
    if (!cajas.length) return null;
    const left = Math.min(...cajas.map((c) => c.left)), top = Math.min(...cajas.map((c) => c.top));
    const right = Math.max(...cajas.map((c) => c.right)), bottom = Math.max(...cajas.map((c) => c.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function acabar() {
    if (!paseo) return;
    const { alAcabar } = paseo;
    paseo = null;
    deslizando?.parar();
    oirPortada(false);
    estabaEnCasa = false;
    foco.hidden = true;
    lienzo.replaceChildren();
    quitarGlobo();
    volverACasa();
    alAcabar?.();
  }

  /**
   * El recorrido. Cada paso: `el()` lo que señala, `titulo` y `texto`, y si
   * quiere `antes()` (llevar la ventana a donde está), `espera` (el nombre de
   * un gesto que, hecho, pasa al siguiente: «pruébalo» de verdad), `partes()`
   * (señalar el contorno de varias piezas), `lado` (dónde prefiere el
   * bocadillo) y `enCasa` (lo señalado es el sitio de Adeo en la barra).
   */
  function recorrido(pasos, { alAcabar } = {}) {
    if (!pasos.length) return;
    callar();
    paseo = { pasos, i: 0, alAcabar, enseñado: false };
    oirPortada(true);
    paso(0, 1);
  }

  /** Avisa de que alguien hizo algo: si el paso de ahora lo esperaba, sigue. */
  function hecho(nombre) {
    if (!paseo) return;
    const p = paseo.pasos[paseo.i];
    if (p?.espera === nombre) setTimeout(() => paseo && paseo.pasos[paseo.i] === p && paso(paseo.i + 1, 1), 450);
    else if (paseo) setTimeout(() => paseo && pintarPaso(), 220);   // lo señalado puede haberse movido
  }

  /* LAS TECLAS. Escape lo salta y las flechas pasan de parada, menos mientras
     alguien escribe: en «Filtrar proyectos y sesiones» la flecha mueve el
     cursor del campo, no el recorrido. */
  const escribiendo = (el) => !!el && (el.isContentEditable || !!el.closest?.('input, textarea, select'));
  document.addEventListener('keydown', (e) => {
    if (!paseo) return;
    if (e.key === 'Escape') acabar();
    else if (escribiendo(e.target)) return;
    else if (e.key === 'ArrowRight') paso(paseo.i + 1, 1);
    else if (e.key === 'ArrowLeft' && paseo.i > 0) paso(paseo.i - 1, -1);
  });

  /* Y ESCAPE DESDE LA PORTADA. El recorrido sale solo mientras se baja la
     página, sin haber pulsado dentro: el foco sigue en la portada y el teclado
     es suyo, no de este documento. Mientras dura, Escape se oye también allí
     (solo Escape: las flechas y lo demás siguen moviendo la portada). Son del
     mismo origen; si un día no lo fueran, leer `parent.document` lanza y Escape
     se queda en el foco dentro de la demo. */
  let portada = null;
  const escapeDeFuera = (e) => {
    try {
      if (e.key === 'Escape' && !e.defaultPrevented && paseo) acabar();
    } catch { /* la demo ya no está */ }
  };
  function oirPortada(si) {
    try {
      if (si && !portada && window.parent !== window) {
        portada = window.parent.document;
        portada.addEventListener('keydown', escapeDeFuera);
      } else if (!si && portada) {
        portada.removeEventListener('keydown', escapeDeFuera);
        portada = null;
      }
    } catch { portada = null; }
  }
  addEventListener('pagehide', () => oirPortada(false));

  /* Si cambia la escala (la portada cambia de ancho), lo que habla se vuelve a
     colocar con su tamaño de pantalla. */
  let relojMedida = 0;
  const remedir = () => {
    clearTimeout(relojMedida);
    relojMedida = setTimeout(() => {
      if (paseo) pintarPaso();
      else if (globo) callar();
    }, 120);
  };
  addEventListener('resize', remedir, { passive: true });
  try { if (window.parent !== window) window.parent.addEventListener('resize', remedir, { passive: true }); } catch { /* otro origen */ }

  return { decir, callar, recorrido, hecho, parar: acabar, enRecorrido: () => !!paseo };
}
