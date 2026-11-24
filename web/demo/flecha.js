/* ============================================================================
   Adeorq · demo/flecha.js
   LA FLECHA DIBUJADA A MANO, Y LO QUE LA HACE BUENA.

   Munir lo ha dicho dos veces, en dos webs: la de los disquetes de winshotx
   (14-nov, «esto sigue roto, esta flecha bro omg») y la del recorrido de esta
   demo (22-nov, «que las flechas del tour de la web arreglarlas y que no vuelva
   a pasar nunca lo de las flechas mal hechas ya me paso una vez»). Las del
   recorrido medían 45-62 px en pantalla, con una S tan corta que se leía como
   un gancho, y la punta pisaba el aro de lo que señalaban.

   Por eso la flecha no se dibuja en cada sitio: se traza AQUÍ, y `revisarFlecha`
   mide cada regla con números. Lo usa `scripts/flechas-check.mjs` (dentro de
   `node scripts/comprobar.mjs`) sobre miles de colocaciones, y la demo no pinta
   una flecha que no pase: sin flecha, el aro ya dice dónde, y eso es mejor que
   una mal hecha.

   `revisarFlecha` mide lo que se PINTA: lee los caminos `tallo` y `punta` que
   van al `d` del SVG, no los puntos que los acompañan. Una revisión que mirara
   los puntos daba por buena una flecha que se pintaba recta, con los controles
   cambiados de orden o con una tercera pata (revisión del 22-nov).

   Las reglas, en píxeles de PANTALLA (`px` es lo que mide uno de ellos en las
   medidas del dibujo; la demo es una ventana de 1920 x 1080 encogida):
     1. Gorda, de rotulador, pero no una salchicha: trazo de 5 a 7 px, y un halo
        del color del fondo debajo, de 4 a 8 px más ancho que el trazo, para que
        lo que pase por detrás se corte antes de tocarla sin borrar media
        pantalla alrededor.
     2. Una sola comba, como de un tirón: los dos puntos de control al mismo
        lado de la recta. Nada de S, que en corto es un gancho. Y suave: la
        curva no se aparta de la recta entre sus dos puntas más de un cuarto de
        lo que mide esa recta (las que traza esto llegan a 0,2), o es un arco.
     3. Larga: 80 px de trazo como poco, y cuatro veces lo que mide una pata.
     4. La punta sale del final EXACTO del trazo, con las dos patas iguales y
        abiertas lo mismo a cada lado de la dirección en la que llega.
     5. Llega a un dedo de lo que señala: entre 14 y 30 px de su caja, sin
        tocar el aro (que va a 7 px), y apuntando hacia ella.
     6. Sale del bocadillo, a unos px de su borde, y no cruza por encima ni
        del bocadillo, ni de Adeo, ni de lo que señala.
   ========================================================================= */

/** Lo que mide cada cosa, en píxeles de pantalla. */
export const MEDIDAS = {
  ancho: 5,            // el trazo
  anchoMax: 7,         // más gordo ya no es un rotulador
  halo: 11,            // el borde del color del fondo, debajo
  largoMin: 80,        // del trazo entero
  pata: 16,            // cada lado de la punta
  abre: 0.5,           // radianes a cada lado de la dirección de llegada (29°)
  hueco: 20,           // de la punta a la caja de lo señalado
  huecoMin: 14,
  huecoMax: 30,
  sale: 10,            // del borde del bocadillo al principio del trazo
  comba: 0.16,         // cuánto se curva, en partes del largo
  combaMax: 0.25,      // lo más que se aparta la curva de su recta, en partes de la recta
  haloMas: 4,          // lo que el halo pasa al trazo
  haloMasMax: 8,       // y lo más: un halo enorme borra lo de alrededor
};

/* Un número de un camino SVG: el que escribe `trazarFlecha` y cualquier otro. */
const NUM = String.raw`(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)`;
const SEP = String.raw`[\s,]*`;
const PUNTO = NUM + SEP + NUM;
/* Un tallo es UNA curva cúbica, y nada más. */
const TALLO = new RegExp(`^\\s*M${SEP}${PUNTO}${SEP}C${SEP}${PUNTO}${SEP}${PUNTO}${SEP}${PUNTO}\\s*$`);
/* Una punta son DOS patas que se tocan en la punta: M pata L punta L pata. */
const PUNTA = new RegExp(`^\\s*M${SEP}${PUNTO}${SEP}L${SEP}${PUNTO}${SEP}L${SEP}${PUNTO}\\s*$`);

/**
 * Lo que de verdad se pinta de una flecha, leído de sus caminos (`tallo` y
 * `punta`, lo que va al `d` del SVG): `{ ini, c1, c2, fin, vertice, patas }`, o
 * `{ mal }` si un camino no tiene la forma de una flecha de esta pieza (una
 * recta, dos curvas, una tercera pata, un arco…).
 */
export function leerFlecha({ tallo, punta } = {}) {
  const t = typeof tallo === 'string' && tallo.match(TALLO);
  const p = typeof punta === 'string' && punta.match(PUNTA);
  const mal = [];
  if (!t) mal.push(`el trazo que se pinta no es una sola curva cúbica («${String(tallo).slice(0, 60)}»): una recta, dos tramos o un arco no son esta flecha`);
  if (!p) mal.push(`la punta que se pinta no son dos patas que se tocan («${String(punta).slice(0, 60)}»): ni una tercera pata, ni un tramo suelto`);
  if (mal.length) return { mal };
  const n = (m) => m.slice(1).map(Number);
  const a = n(t), b = n(p);
  if (a.concat(b).some((v) => !Number.isFinite(v))) return { mal: ['un camino de la flecha lleva un número que no es un número'] };
  const P = (v, i) => ({ x: v[i], y: v[i + 1] });
  return { ini: P(a, 0), c1: P(a, 2), c2: P(a, 4), fin: P(a, 6), patas: [P(b, 0), P(b, 4)], vertice: P(b, 2) };
}

const resta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const largo = (v) => Math.hypot(v.x, v.y);
const centro = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const inflar = (r, d) => ({ left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d });

/** Dónde corta el borde de `r` la línea que sale de su centro hacia `p`. */
function borde(r, p) {
  const c = centro(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? (r.right - r.left) / 2 / Math.abs(dx) : Infinity, dy ? (r.bottom - r.top) / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Lo que dista `p` de la caja `r` (0 si está dentro). */
export function distanciaACaja(p, r) {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  return Math.hypot(dx, dy);
}

const dentroDe = (p, r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;

/** Un punto de la curva de Bézier cúbica en `t`. */
export function enCurva(g, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * g.ini.x + b * g.c1.x + c * g.c2.x + d * g.fin.x,
    y: a * g.ini.y + b * g.c1.y + c * g.c2.y + d * g.fin.y,
  };
}

function largoDeCurva(g) {
  let l = 0;
  let antes = g.ini;
  for (let i = 1; i <= 48; i++) {
    const p = enCurva(g, i / 48);
    l += largo(resta(p, antes));
    antes = p;
  }
  return l;
}

/**
 * La flecha que va de `desde` (la caja del bocadillo) a `hasta` (la caja de lo
 * que señala). `comba` es el lado hacia el que se curva (1 o -1). Devuelve sus
 * puntos y los caminos del SVG, o `null` si entre los dos no cabe una buena.
 * Las cajas, en las medidas del dibujo: `{ left, top, right, bottom }`.
 */
export function trazarFlecha({ desde, hasta, px = 1, comba = 1 }) {
  const M = MEDIDAS;
  const objetivo = inflar(hasta, M.hueco * px);
  const salida = inflar(desde, M.sale * px);
  // Montados, no hay flecha que valga.
  if (salida.left < objetivo.right && objetivo.left < salida.right && salida.top < objetivo.bottom && objetivo.top < salida.bottom) return null;
  // La punta llega al lado de lo señalado que mira al bocadillo (el de más
  // hueco entre los dos), frente al bocadillo y lejos de las esquinas: así llega
  // de cara y apunta a algo, no a una esquina de refilón.
  const c = centro(desde);
  const lados = [
    ['der', desde.left - objetivo.right],
    ['izq', objetivo.left - desde.right],
    ['aba', desde.top - objetivo.bottom],
    ['arr', objetivo.top - desde.bottom],
  ].sort((a, b) => b[1] - a[1]);
  const margen = (a, b) => Math.min((b - a) / 2, 28 * px);
  const ceñir = (v, a, b) => Math.max(a + margen(a, b), Math.min(b - margen(a, b), v));
  const lado = lados[0][0];
  const fin = {
    der: { x: objetivo.right, y: ceñir(c.y, hasta.top, hasta.bottom) },
    izq: { x: objetivo.left, y: ceñir(c.y, hasta.top, hasta.bottom) },
    aba: { x: ceñir(c.x, hasta.left, hasta.right), y: objetivo.bottom },
    arr: { x: ceñir(c.x, hasta.left, hasta.right), y: objetivo.top },
  }[lado];
  // Hacia dentro de lo señalado, de cara a ese lado.
  const adentro = { der: { x: -1, y: 0 }, izq: { x: 1, y: 0 }, aba: { x: 0, y: -1 }, arr: { x: 0, y: 1 } }[lado];
  const ini = borde(salida, fin);
  const d = resta(fin, ini);
  const L = largo(d);
  if (L < M.largoMin * px) return null;
  const n = { x: -d.y / L, y: d.x / L };
  const aLado = (p) => (p.x - ini.x) * n.x + (p.y - ini.y) * n.y;
  // Llega casi de frente (unos 14° de lado, como a mano): el último control,
  // por fuera del lado y algo corrido. Si con eso cae sobre la recta, se le da
  // la comba pedida para que la curva no se quede en S.
  let c2 = { x: fin.x - adentro.x * 0.32 * L, y: fin.y - adentro.y * 0.32 * L };
  const ladeo = { x: -adentro.y, y: adentro.x };
  const s0 = Math.sign(aLado(c2)) || comba;
  c2 = { x: c2.x + ladeo.x * 0.08 * L * s0 * Math.sign(ladeo.x * n.x + ladeo.y * n.y || 1), y: c2.y + ladeo.y * 0.08 * L * s0 * Math.sign(ladeo.x * n.x + ladeo.y * n.y || 1) };
  if (Math.abs(aLado(c2)) < 0.06 * L) c2 = { x: c2.x + n.x * 0.06 * L * comba, y: c2.y + n.y * 0.06 * L * comba };
  // Y sale combada hacia el mismo lado, un poco más que al llegar, como cuando
  // se hace de un tirón (la forma de las notas de winshotx.com, que Munir dio
  // por buenas).
  const k = M.comba * (Math.sign(aLado(c2)) || comba);
  const c1 = { x: ini.x + d.x * 0.28 + n.x * k * 1.15 * L, y: ini.y + d.y * 0.28 + n.y * k * 1.15 * L };
  // La dirección en la que llega es la de la curva en su final (de c2 a fin), y
  // hacia atrás desde ahí salen las dos patas, iguales.
  const atras = Math.atan2(c2.y - fin.y, c2.x - fin.x);
  const pata = (giro) => ({ x: fin.x + Math.cos(atras + giro) * M.pata * px, y: fin.y + Math.sin(atras + giro) * M.pata * px });
  const patas = [pata(M.abre), pata(-M.abre)];
  const f = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return {
    ini, c1, c2, fin, patas,
    ancho: M.ancho * px,
    halo: M.halo * px,
    tallo: `M${f(ini)} C${f(c1)} ${f(c2)} ${f(fin)}`,
    punta: `M${f(patas[0])} L${f(fin)} L${f(patas[1])}`,
  };
}

/**
 * Lo que tiene mal una flecha, regla por regla (vacío si está bien). Mide lo
 * que se pinta: los caminos `tallo` y `punta` y los anchos `ancho` y `halo` (lo
 * que va al `stroke-width`), y nada más del objeto. `evitar`: cajas que el
 * trazo no puede cruzar además del bocadillo y lo señalado (Adeo).
 */
export function revisarFlecha(flecha, { desde, hasta, px = 1, evitar = [] }) {
  const M = MEDIDAS;
  const g = leerFlecha(flecha ?? {});
  if (g.mal) return g.mal;
  const mal = [];
  const tol = 0.75 * px;
  const ancho = Number(flecha.ancho), halo = Number(flecha.halo);
  if (!(ancho >= M.ancho * px - 0.01)) mal.push(`trazo de ${(ancho / px).toFixed(1)} px: tiene que ser de ${M.ancho} o más`);
  if (ancho > M.anchoMax * px + 0.01) mal.push(`trazo de ${(ancho / px).toFixed(1)} px: una flecha de rotulador no pasa de ${M.anchoMax}`);
  if (!(halo >= ancho + M.haloMas * px - 0.01)) mal.push(`halo de ${((halo || 0) / px).toFixed(1)} px: tiene que pasar al trazo en ${M.haloMas} px o más, o lo de detrás la toca`);
  if (halo > ancho + M.haloMasMax * px + 0.01) mal.push(`halo de ${(halo / px).toFixed(1)} px: pasa al trazo en más de ${M.haloMasMax} px y borra lo de alrededor`);
  // 2. una sola comba, y suave
  const d = resta(g.fin, g.ini);
  const lado = (p) => Math.sign(d.x * (p.y - g.ini.y) - d.y * (p.x - g.ini.x));
  if (lado(g.c1) !== lado(g.c2) || lado(g.c1) === 0) mal.push('tiene forma de S (o va recta): la comba va a un solo lado');
  const recta = largo(d);
  if (recta > 1e-6) {
    let aparta = 0;
    for (let i = 1; i < 64; i++) {
      const p = enCurva(g, i / 64);
      aparta = Math.max(aparta, Math.abs(d.x * (p.y - g.ini.y) - d.y * (p.x - g.ini.x)) / recta);
    }
    if (aparta > M.combaMax * recta) mal.push(`se aparta de su recta ${(aparta / recta).toFixed(2)} de lo que mide: es un arco (${M.combaMax} como mucho)`);
  }
  // 3. larga
  const L = largoDeCurva(g);
  if (L < M.largoMin * px) mal.push(`mide ${(L / px).toFixed(0)} px de trazo: menos de ${M.largoMin}`);
  for (const p of g.patas) {
    if (L < 4 * largo(resta(p, g.fin))) mal.push('el trazo no llega a cuatro veces una pata: se lee como un gancho');
  }
  // 4. la punta, del final exacto y simétrica respecto a la llegada
  const llega = resta(g.fin, g.c2);
  const ll = largo(llega);
  if (ll < 1e-6) mal.push('no se sabe por dónde llega: el último control está encima de la punta');
  else {
    const angulos = g.patas.map((p) => {
      const v = resta(g.fin, p);
      const lv = largo(v) || 1;
      return Math.acos(Math.max(-1, Math.min(1, (v.x * llega.x + v.y * llega.y) / (lv * ll))));
    });
    const largos = g.patas.map((p) => largo(resta(p, g.fin)));
    if (Math.abs(angulos[0] - angulos[1]) > 0.035) mal.push(`las patas se abren distinto: ${(angulos[0] * 57.3).toFixed(0)}° y ${(angulos[1] * 57.3).toFixed(0)}°`);
    if (angulos.some((a) => a < 0.35 || a > 0.75)) mal.push('la punta se abre de menos o de más (entre 20° y 43° a cada lado)');
    if (Math.abs(largos[0] - largos[1]) > tol) mal.push('las dos patas no miden lo mismo');
    if (largos.some((l) => l < 12 * px)) mal.push('una pata mide menos de 12 px: punta que no se ve');
    const lados = g.patas.map((p) => Math.sign(llega.x * (p.y - g.fin.y) - llega.y * (p.x - g.fin.x)));
    if (lados[0] === lados[1]) mal.push('las dos patas caen al mismo lado del trazo');
  }
  if (largo(resta(g.vertice, g.fin)) > 0.2 * px) mal.push(`la punta no sale del final exacto del trazo: queda a ${(largo(resta(g.vertice, g.fin)) / px).toFixed(1)} px`);
  // 5. a un dedo, y apuntando
  const h = distanciaACaja(g.fin, hasta) / px;
  if (h < M.huecoMin - 0.5) mal.push(`la punta queda a ${h.toFixed(0)} px de lo que señala: pisa el aro (${M.huecoMin} como poco)`);
  if (h > M.huecoMax + 0.5) mal.push(`la punta queda a ${h.toFixed(0)} px de lo que señala: lejos (${M.huecoMax} como mucho)`);
  if (ll > 1e-6) {
    const u = { x: llega.x / ll, y: llega.y / ll };
    let toca = false;
    for (let s = 0; s <= 6 * M.huecoMax * px; s += px) {
      if (distanciaACaja({ x: g.fin.x + u.x * s, y: g.fin.y + u.y * s }, hasta) < 0.5) { toca = true; break; }
    }
    if (!toca) mal.push('la punta no apunta a lo que señala');
  }
  // 6. sale del bocadillo y no cruza nada
  const s = distanciaACaja(g.ini, desde) / px;
  if (s < M.sale - 4 || s > M.sale + 6) mal.push(`empieza a ${s.toFixed(0)} px del bocadillo: tiene que salir de él (${M.sale})`);
  const cajas = [
    ['el bocadillo', desde, 2],
    ['lo que señala', hasta, (M.huecoMin - 4)],
    ...evitar.map((r, i) => [`lo que hay que esquivar (${i + 1})`, r, 2]),
  ];
  for (let i = 1; i < 40; i++) {
    const p = enCurva(g, i / 40);
    for (const [nombre, r, margen] of cajas) {
      if (dentroDe(p, inflar(r, margen * px))) { mal.push(`el trazo pasa por encima de ${nombre}`); cajas.splice(cajas.findIndex((c) => c[1] === r), 1); break; }
    }
  }
  return mal;
}

/**
 * La mejor flecha que pase la revisión, probando a combarla hacia los dos lados
 * (primero `comba`), o `null`. Es lo que pinta la demo.
 */
export function flechaBuena({ desde, hasta, px = 1, comba = 1, evitar = [] }) {
  for (const c of [comba, -comba]) {
    const g = trazarFlecha({ desde, hasta, px, comba: c });
    if (g && revisarFlecha(g, { desde, hasta, px, evitar }).length === 0) return g;
  }
  return null;
}
