// La tarjeta de uso para compartir, pintada en un lienzo. La misma función
// pinta la vista previa del editor (`PerfilTarjeta.tsx`, a su tamaño en
// pantalla) y lo que sale (`lib/exportarTarjeta.ts`, a 1920×1080 o
// 1080×1920): lo que se guarda es lo que se ve.
//
// Es copia del prototipo que Munir aprobó el 2026-10-17 («ahora sí lo has
// hecho bien y como Axiom»), https://claude.ai/artifact/UvMFzPKUZoFegjcpgpUYCw.
// Allí era HTML con las medidas en `cqw` (centésimas del ancho de la tarjeta);
// aquí cada medida es la misma en las mismas centésimas (`u`), las líneas se
// colocan como las coloca el navegador (la base de cada línea sale de las
// métricas de la letra) y las sombras de texto crecen con el lado corto, que
// es como se veían en el prototipo a 900 px.
//
// Los colores de aquí son de la TARJETA, no de la interfaz: una imagen que
// sale de la app no cambia con el tema de quien la mira.

/** La letra de la app (`01-base.css`). */
const LETRA = '"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

/** La proa de Adeorq (`src/assets/adeorq.svg`), en su caja de 1024. */
const PROA = "M 236 112 L 788 112 L 1016 756 L 944 848 L 80 848 L 8 756 Z M 512 240 L 712 730 Q 512 572 312 730 Z";

export type ColorTarjeta = "azul" | "blanco" | "naranja" | "verde" | "morado";

/** Los cinco colores del editor: el degradado de la cifra (arriba, al 45 % y
    abajo), el del proyecto en la frase y la caja de «Resaltar la cifra». */
export const COLORES: Record<ColorTarjeta, { nombre: string; cifra: [string, string, string]; frase: string; resalte: string }> = {
  azul: { nombre: "Azul Adeorq", cifra: ["#d6f3ff", "#6fd0ff", "#2f8df3"], frase: "#9fdcff", resalte: "#eaf3ff" },
  blanco: { nombre: "Blanco", cifra: ["#ffffff", "#ffffff", "#ffffff"], frase: "#ffffff", resalte: "#eaedfe" },
  naranja: { nombre: "Naranja", cifra: ["#ffe0cf", "#ffab8a", "#f06a3c"], frase: "#ffc4ab", resalte: "#ffe6da" },
  verde: { nombre: "Verde", cifra: ["#dcfff0", "#7ee0b0", "#2fae74"], frase: "#a8f0cc", resalte: "#dcfbec" },
  morado: { nombre: "Morado", cifra: ["#f0e2ff", "#c69bff", "#8a4dff"], frase: "#d9bfff", resalte: "#efe4ff" },
};

/** La muestra redonda de cada color en el editor: su mismo degradado. */
export function muestraDe(c: ColorTarjeta): string {
  const [a, b, d] = COLORES[c].cifra;
  return `linear-gradient(180deg, ${a}, ${b} 45%, ${d})`;
}

export interface FilaTarjeta {
  etiqueta: string;
  valor: string;
  /** La fila de un CLI va con su color («Claude Code 100 %»). */
  color?: string;
}

export interface DatosTarjeta {
  titulo: string;
  /** «10B», ya dicha con `cifra()`. */
  total: string;
  /** «Tokens». */
  unidad: string;
  /** «6,3B en Adeorq · 63 %»: solo si eliges un proyecto. El proyecto va
      aparte porque lleva su color. */
  frase: { antes: string; proyecto: string; despues: string } | null;
  filas: FilaTarjeta[];
  /** «@munito», o tu nombre si no tienes @. */
  quien: string;
  foto: CanvasImageSource | null;
  pie: string[];
  resaltar: boolean;
  color: ColorTarjeta;
}

/** Las medidas del prototipo, en centésimas del ancho de la tarjeta. */
interface Medidas {
  pad: number;
  logo: number;
  marca: number;
  /** El ancho de la columna del texto. */
  col: number;
  gap: number;
  titulo: number;
  cifra: number;
  unidad: number;
  cifraGap: number;
  /** El relleno de la caja de «Resaltar la cifra»: arriba y a los lados. */
  resalte: [number, number];
  frase: number;
  fila: number;
  filaGap: number;
  filaCol: number;
  quien: number;
  foto: number;
  fotoGap: number;
  pie: number;
  /** En horizontal la columna va en medio; en vertical, abajo con su margen. */
  margenCol: number | null;
}

// 16:9: el texto en una columna que no pasa de la mitad (el 52 % de lo que
// queda dentro del relleno), y la imagen manda a la derecha.
const HORIZONTAL: Medidas = {
  pad: 4,
  logo: 5,
  marca: 3.4,
  col: 0.52 * 92,
  gap: 1.5,
  titulo: 3.4,
  cifra: 7,
  unidad: 3.2,
  cifraGap: 1.2,
  resalte: [1.4, 2],
  frase: 2.6,
  fila: 2.3,
  filaGap: 0.9,
  filaCol: 17,
  quien: 3.6,
  foto: 5.6,
  fotoGap: 1.6,
  pie: 1.6,
  margenCol: null,
};

// 9:16: lo mismo apilado, con la imagen arriba y el texto abajo.
const VERTICAL: Medidas = {
  pad: 7,
  logo: 9,
  marca: 6,
  col: 86,
  gap: 3,
  titulo: 6,
  cifra: 14,
  unidad: 6,
  cifraGap: 1.2,
  resalte: [2.5, 3.5],
  frase: 5,
  fila: 4.4,
  filaGap: 1.8,
  filaCol: 34,
  quien: 6.4,
  foto: 10,
  fotoGap: 3,
  pie: 3,
  margenCol: 5,
};

/** El velo negro que deja leer el texto: hacia la derecha en horizontal y
    hacia abajo en vertical, como en el prototipo. */
const VELO_H: [number, number][] = [
  [0, 0.62],
  [0.5, 0.25],
  [0.7, 0],
];
const VELO_V: [number, number][] = [
  [0, 0.25],
  [0.3, 0.05],
  [0.62, 0.65],
  [1, 0.75],
];

/** Lo que mide de ancho y alto algo que se puede pintar. */
function lados(f: CanvasImageSource): [number, number] {
  if (typeof HTMLVideoElement !== "undefined" && f instanceof HTMLVideoElement) return [f.videoWidth, f.videoHeight];
  if (typeof HTMLImageElement !== "undefined" && f instanceof HTMLImageElement) return [f.naturalWidth, f.naturalHeight];
  if (typeof VideoFrame !== "undefined" && f instanceof VideoFrame) return [f.displayWidth, f.displayHeight];
  const x = f as unknown as { width: unknown; height: unknown };
  return [Number(x.width) || 0, Number(x.height) || 0];
}

/** Pinta `f` cubriendo todo el rectángulo, recortando lo que sobre por el centro. */
export function cubrir(ctx: CanvasRenderingContext2D, f: CanvasImageSource, ancho: number, alto: number) {
  const [fw, fh] = lados(f);
  if (!fw || !fh) return;
  const e = Math.max(ancho / fw, alto / fh);
  ctx.drawImage(f, (ancho - fw * e) / 2, (alto - fh * e) / 2, fw * e, fh * e);
}

function redondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** El espaciado entre letras, donde el lienzo lo sabe poner (Chromium sí; un
    WebKit viejo no, y entonces sale sin él). */
function espaciado(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function letra(ctx: CanvasRenderingContext2D, px: number, peso: number) {
  ctx.font = `${peso} ${px}px ${LETRA}`;
}

/**
 * Pinta la tarjeta entera. `fondo` es la imagen o el fotograma del vídeo de
 * fondo, o `null` para el azul noche de detrás.
 */
export function pintarTarjeta(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  fondo: CanvasImageSource | null,
  d: DatosTarjeta,
): void {
  const vertical = alto > ancho;
  const m = vertical ? VERTICAL : HORIZONTAL;
  const u = ancho / 100;
  const s = Math.min(ancho, alto) / 506;
  const color = COLORES[d.color];

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Dónde cae la base de una línea: el navegador reparte lo que sobra de la
  // altura de línea por igual arriba y abajo de la letra, y la letra mide lo
  // que dicen sus métricas. Sin esto el texto bailaba unos píxeles respecto
  // al prototipo.
  letra(ctx, 100, 600);
  const mt = ctx.measureText("Hg");
  const A = (mt.fontBoundingBoxAscent || 92) / 100;
  const D = (mt.fontBoundingBoxDescent || 23) / 100;
  const base = (fs: number, L = fs) => L / 2 + ((A - D) * fs) / 2;
  const sombra = (dy: number, blur: number, alfa: number) => {
    ctx.shadowColor = `rgba(0, 0, 0, ${alfa})`;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = dy * s;
    ctx.shadowBlur = blur * s;
  };
  const sinSombra = () => {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };
  /** El tamaño de letra que hace caber `textos` (cada uno con su peso) en `max`. */
  const encajar = (fs: number, max: number, textos: [string, number][], hueco = 0) => {
    let w = hueco;
    for (const [t, peso] of textos) {
      letra(ctx, fs, peso);
      w += ctx.measureText(t).width;
    }
    return w > max ? Math.max(fs * 0.55, (fs * max) / w) : fs;
  };

  // 1. El fondo, cubriendo, y el velo.
  ctx.fillStyle = "#0b0f1a";
  ctx.fillRect(0, 0, ancho, alto);
  if (fondo) cubrir(ctx, fondo, ancho, alto);
  const velo = vertical ? ctx.createLinearGradient(0, 0, 0, alto) : ctx.createLinearGradient(0, 0, ancho, 0);
  for (const [p, a] of vertical ? VELO_V : VELO_H) velo.addColorStop(p, `rgba(0, 0, 0, ${a})`);
  ctx.fillStyle = velo;
  ctx.fillRect(0, 0, ancho, alto);

  const pad = m.pad * u;
  const x0 = pad;
  const col = m.col * u;

  // 2. Arriba: la proa a la izquierda y ADEORQ a la derecha.
  const logo = m.logo * u;
  ctx.save();
  ctx.translate(x0, pad);
  ctx.scale(logo / 1024, logo / 1024);
  ctx.fillStyle = "#ffffff";
  ctx.fill(new Path2D(PROA), "evenodd");
  ctx.restore();
  const fsMarca = m.marca * u;
  letra(ctx, fsMarca, 500);
  espaciado(ctx, 0.04 * fsMarca);
  sombra(1, 6, 0.5);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText("ADEORQ", ancho - pad, pad + base(fsMarca));
  ctx.textAlign = "left";
  espaciado(ctx, 0);
  const arribaFin = pad + Math.max(logo, fsMarca);

  // 3. Abajo: tu foto con tu @, y el pie.
  const foto = d.foto ? m.foto * u : 0;
  const fotoGap = d.foto && d.quien ? m.fotoGap * u : 0;
  const fsQuien = d.quien ? encajar(m.quien * u, col - foto - fotoGap, [[d.quien, 600]]) : 0;
  const quienAlto = Math.max(foto, d.quien ? m.quien * u : 0);
  const fsPie = m.pie * u;
  const Lpie = fsPie * 1.5;
  const abajoAlto = (quienAlto ? quienAlto + u : 0) + Lpie;
  const abajoY = alto - pad - abajoAlto;
  if (d.foto) {
    sinSombra();
    const fy = abajoY + (quienAlto - foto) / 2;
    ctx.save();
    redondo(ctx, x0, fy, foto, foto, 0.6 * u);
    ctx.clip();
    ctx.translate(x0, fy);
    cubrir(ctx, d.foto, foto, foto);
    ctx.restore();
  }
  if (d.quien) {
    letra(ctx, fsQuien, 600);
    sombra(1, 6, 0.6);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(d.quien, x0 + foto + fotoGap, abajoY + (quienAlto - m.quien * u) / 2 + base(m.quien * u));
  }
  letra(ctx, fsPie, 400);
  sombra(1, 4, 0.7);
  ctx.globalAlpha = 0.92;
  let xPie = x0;
  for (const p of d.pie) {
    ctx.fillText(p, xPie, abajoY + (quienAlto ? quienAlto + u : 0) + base(fsPie, Lpie));
    xPie += ctx.measureText(p).width + 2.2 * u;
  }
  ctx.globalAlpha = 1;

  // 4. La columna: título, cifra, frase del proyecto y filas.
  const fsTit = encajar(m.titulo * u, col, [[d.titulo, 500]]);
  const Ltit = fsTit * 1.1;
  const [pT, pL] = d.resaltar ? [m.resalte[0] * u, m.resalte[1] * u] : [0, 0];
  const cifraGap = m.cifraGap * u;
  // La cifra y «Tokens» encogen juntas si no caben (un «999B» en vertical).
  letra(ctx, m.cifra * u, 700);
  const anchoTotal = ctx.measureText(d.total).width;
  letra(ctx, m.unidad * u, 600);
  const anchoCifra = anchoTotal + cifraGap + ctx.measureText(d.unidad).width;
  const escalaCifra = Math.min(1, (col - 2 * pL) / anchoCifra);
  const fsB = m.cifra * u * escalaCifra;
  const fsU = m.unidad * u * escalaCifra;
  const sobreB = base(fsB);
  const sobreU = base(fsU);
  const cifraLinea = Math.max(sobreB, sobreU) + Math.max(fsB - sobreB, fsU - sobreU);
  const cifraAlto = cifraLinea + 2 * pT;

  const fsF = d.frase
    ? encajar(m.frase * u, col, [
        [d.frase.antes, 600],
        [d.frase.proyecto, 750],
        [d.frase.despues, 600],
      ])
    : 0;
  const LF = m.frase * u * 1.5;

  const fsR = m.fila * u;
  const LR = fsR * 1.15;
  const filasAlto = d.filas.length ? 0.6 * u + d.filas.length * LR + (d.filas.length - 1) * m.filaGap * u : 0;

  const bloques = [Ltit, cifraAlto, d.frase ? LF : 0, filasAlto].filter((h) => h > 0);
  const colAlto = bloques.reduce((a, b) => a + b, 0) + (bloques.length - 1) * m.gap * u;
  const medioAlto = abajoY - arribaFin;
  let y = m.margenCol === null ? arribaFin + (medioAlto - colAlto) / 2 : abajoY - m.margenCol * u - colAlto;
  y = Math.max(y, arribaFin);

  // El título.
  letra(ctx, fsTit, 500);
  sombra(1, 8, 0.6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(d.titulo, x0, y + base(fsTit, Ltit));
  y += Ltit + m.gap * u;

  // La cifra: en el degradado de su color, o en la caja clara si se resalta.
  const linea = y + pT + Math.max(sobreB, sobreU);
  if (d.resaltar) {
    sinSombra();
    ctx.fillStyle = color.resalte;
    redondo(ctx, x0, y, col, cifraAlto, 0.4 * u);
    ctx.fill();
  }
  const pieza = (texto: string, x: number, fs: number, peso: number, sobre: number) => {
    letra(ctx, fs, peso);
    if (d.resaltar) {
      ctx.fillStyle = "#0a0f1c";
    } else {
      const g = ctx.createLinearGradient(0, linea - sobre, 0, linea - sobre + fs);
      g.addColorStop(0, color.cifra[0]);
      g.addColorStop(0.45, color.cifra[1]);
      g.addColorStop(1, color.cifra[2]);
      ctx.fillStyle = g;
      sombra(2, 8, 0.5);
    }
    ctx.fillText(texto, x, linea);
    return ctx.measureText(texto).width;
  };
  espaciado(ctx, -0.01 * fsB);
  const wTotal = pieza(d.total, x0 + pL, fsB, 700, sobreB);
  espaciado(ctx, 0);
  pieza(d.unidad, x0 + pL + wTotal + cifraGap * escalaCifra, fsU, 600, sobreU);
  y += cifraAlto + m.gap * u;

  // La frase del proyecto, con su nombre en color.
  if (d.frase) {
    sombra(1, 8, 0.7);
    let x = x0;
    const lineaF = y + base(fsF, LF);
    for (const [texto, peso, tinta] of [
      [d.frase.antes, 600, "#ffffff"],
      [d.frase.proyecto, 750, color.frase],
      [d.frase.despues, 600, "#ffffff"],
    ] as [string, number, string][]) {
      letra(ctx, fsF, peso);
      ctx.fillStyle = tinta;
      ctx.fillText(texto, x, lineaF);
      x += ctx.measureText(texto).width;
    }
    y += LF + m.gap * u;
  }

  // Las filas: la etiqueta y su valor en dos columnas.
  if (d.filas.length) {
    sombra(1, 6, 0.8);
    y += 0.6 * u;
    const xEt = x0 + 1.2 * u;
    letra(ctx, fsR, 400);
    const anchoEt = Math.max(...d.filas.map((f) => ctx.measureText(f.etiqueta).width));
    const xVal = xEt + Math.max(m.filaCol * u, anchoEt + 1.5 * u);
    for (const f of d.filas) {
      const lineaR = y + base(fsR, LR);
      ctx.fillStyle = f.color ?? "#ffffff";
      letra(ctx, fsR, 400);
      ctx.fillText(f.etiqueta, xEt, lineaR);
      letra(ctx, fsR, 600);
      ctx.fillText(f.valor, xVal, lineaR);
      y += LR + m.filaGap * u;
    }
  }

  ctx.restore();
}

/* --------------------------------------------------------- los fondos de serie */

// Tres fondos hechos aquí, en SVG: pesan nada y se pintan nítidos a cualquier
// tamaño, porque se dibujan ya al tamaño de la tarjeta (`preserveAspectRatio`
// recorta como `cover`). Son los del prototipo aprobado.
const CUERPOS = {
  cristal:
    '<defs><radialGradient id="a" cx="78%" cy="30%" r="70%"><stop offset="0" stop-color="#3a8dff"/><stop offset=".45" stop-color="#14306e"/><stop offset="1" stop-color="#050912"/></radialGradient><radialGradient id="b" cx="95%" cy="95%" r="50%"><stop offset="0" stop-color="#48c2ff" stop-opacity=".55"/><stop offset="1" stop-color="#48c2ff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#a)"/><rect width="1200" height="800" fill="url(#b)"/><path d="M700 80 L1100 80 L1190 330 L1160 370 L640 370 L610 330 Z" fill="#9fdcff" opacity=".10"/><path d="M760 470 L1060 470 L1130 650 L1110 680 L710 680 L690 650 Z" fill="#6fd0ff" opacity=".08"/>',
  aurora:
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="#0b1020"/></linearGradient><radialGradient id="v" cx="80%" cy="20%" r="55%"><stop offset="0" stop-color="#2fe3ac" stop-opacity=".75"/><stop offset="1" stop-color="#2fe3ac" stop-opacity="0"/></radialGradient><radialGradient id="m" cx="65%" cy="85%" r="55%"><stop offset="0" stop-color="#8a4dff" stop-opacity=".8"/><stop offset="1" stop-color="#8a4dff" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect width="1200" height="800" fill="url(#v)"/><rect width="1200" height="800" fill="url(#m)"/>',
  noche:
    '<defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0f1f"/><stop offset="1" stop-color="#1b0f2e"/></linearGradient><pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#6fd0ff" stroke-opacity=".12" stroke-width="1.5"/></pattern><radialGradient id="s" cx="82%" cy="40%" r="35%"><stop offset="0" stop-color="#ffab8a" stop-opacity=".55"/><stop offset="1" stop-color="#ffab8a" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#n)"/><rect width="1200" height="800" fill="url(#p)"/><rect width="1200" height="800" fill="url(#s)"/><circle cx="985" cy="320" r="120" fill="#ffd2bf" opacity=".85"/>',
} as const;

export type FondoDeSerie = keyof typeof CUERPOS;

export const FONDOS_DE_SERIE: { id: FondoDeSerie; nombre: string }[] = [
  { id: "cristal", nombre: "Cristal azul" },
  { id: "aurora", nombre: "Aurora" },
  { id: "noche", nombre: "Noche" },
];

function svgDe(id: FondoDeSerie, ancho?: number, alto?: number): string {
  const lado = ancho && alto ? ` width="${ancho}" height="${alto}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"${lado}>${CUERPOS[id]}</svg>`;
}

/** La dirección del fondo para pintarlo en una miniatura con CSS. */
export function miniDeSerie(id: FondoDeSerie): string {
  return `data:image/svg+xml,${encodeURIComponent(svgDe(id))}`;
}

const hechas = new Map<string, Promise<HTMLImageElement>>();

/** El fondo de serie dibujado ya al tamaño de la tarjeta, listo para el lienzo. */
export function imagenDeSerie(id: FondoDeSerie, ancho: number, alto: number): Promise<HTMLImageElement> {
  const clave = `${id}|${ancho}x${alto}`;
  let hecha = hechas.get(clave);
  if (!hecha) {
    hecha = new Promise<HTMLImageElement>((ok, mal) => {
      const img = new Image(ancho, alto);
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error(`no se pudo dibujar el fondo ${id}`));
      img.src = `data:image/svg+xml,${encodeURIComponent(svgDe(id, ancho, alto))}`;
    });
    hechas.set(clave, hecha);
    // Que no crezca sin techo al cambiar el tamaño de la ventana.
    if (hechas.size > 24) hechas.delete(hechas.keys().next().value as string);
  }
  return hecha;
}
