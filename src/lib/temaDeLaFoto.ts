// Un tema a juego con la foto de fondo (MEJORAS, «Tema sacado de tu foto de
// fondo»): se mira de qué color tira la imagen y se propone el tema de la casa
// cuyo acento esté más cerca. No se inventa una paleta nueva: los 32 temas ya
// están afinados a mano para leerse sobre cristal, y una paleta sacada de una
// foto no lo estaría. Lo que la foto decide es CUÁL de ellos.
//
// La parte pura (de píxeles a tono, de tono a tema) no toca el DOM y la prueba
// `scripts/foto-check.ts` contra los acentos reales de App.css. Lo que sí lo
// toca (pintar la imagen en un canvas, leer los acentos de cada tema) va al
// final, guardado detrás de `typeof document`.

import { THEMES, type ThemeId } from "./i18n";

/** Tono, saturación y luz, en [0, 360) y [0, 1]. */
export interface Tono {
  h: number;
  s: number;
  l: number;
}

export function rgbAHsl(r: number, g: number, b: number): Tono {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hexAHsl(hex: string): Tono {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
  const n = parseInt(m[1], 16);
  return rgbAHsl(n >> 16, (n >> 8) & 255, n & 255);
}

/** La distancia entre dos tonos dando la vuelta al círculo: 350 y 10 están a 20. */
export function distanciaTono(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Un píxel cuenta como «de color» si no es gris ni está casi negro o quemado. */
const SATURACION_MINIMA = 0.22;
const LUZ_MINIMA = 0.1;
const LUZ_MAXIMA = 0.92;
/** Por debajo de esta parte de píxeles con color, la foto es gris. */
const PARTE_CON_COLOR = 0.06;
const CUBOS = 24;

/**
 * De qué color tira una imagen, a partir de sus píxeles RGBA (los de
 * `getImageData`). Se cuentan solo los píxeles con color, repartidos en
 * veinticuatro cubos de 15°, y gana el cubo más pesado con sus dos vecinos: así
 * una foto de un atardecer dice «naranja» aunque el cielo azul ocupe más, porque
 * el azul del cielo suele estar lavado. `null` si la foto es gris o no hay nada.
 */
export function tonoDominante(px: ArrayLike<number>): Tono | null {
  const total = Math.floor(px.length / 4);
  if (total === 0) return null;
  const peso = new Float64Array(CUBOS);
  const sx = new Float64Array(CUBOS);
  const sy = new Float64Array(CUBOS);
  const ss = new Float64Array(CUBOS);
  const sl = new Float64Array(CUBOS);
  let conColor = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (px[o + 3] < 128) continue;
    const t = rgbAHsl(px[o], px[o + 1], px[o + 2]);
    if (t.s < SATURACION_MINIMA || t.l < LUZ_MINIMA || t.l > LUZ_MAXIMA) continue;
    conColor++;
    const c = Math.floor(t.h / (360 / CUBOS)) % CUBOS;
    const rad = (t.h * Math.PI) / 180;
    peso[c] += t.s;
    sx[c] += Math.cos(rad) * t.s;
    sy[c] += Math.sin(rad) * t.s;
    ss[c] += t.s * t.s;
    sl[c] += t.l * t.s;
  }
  if (conColor / total < PARTE_CON_COLOR) return null;
  let mejor = 0;
  let mejorPeso = -1;
  for (let c = 0; c < CUBOS; c++) {
    const p = peso[(c + CUBOS - 1) % CUBOS] + peso[c] + peso[(c + 1) % CUBOS];
    if (p > mejorPeso) {
      mejorPeso = p;
      mejor = c;
    }
  }
  let x = 0;
  let y = 0;
  let p = 0;
  let s = 0;
  let l = 0;
  for (const c of [(mejor + CUBOS - 1) % CUBOS, mejor, (mejor + 1) % CUBOS]) {
    x += sx[c];
    y += sy[c];
    p += peso[c];
    s += ss[c];
    l += sl[c];
  }
  if (p === 0) return null;
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, s: s / p, l: l / p };
}

/** Los temas entre los que se elige: los de la casa, que van de frío a cálido. */
export const CANDIDATOS: readonly ThemeId[] = THEMES.filter((t) => t.familia === "casa" && t.id !== "grafito").map(
  (t) => t.id,
);

/** El tema de una foto sin color: el gris de la casa. */
export const TEMA_GRIS: ThemeId = "grafito";

/**
 * El tema cuyo acento está más cerca del tono de la foto. `acentos` trae el
 * `--accent` de cada candidato (en la app se lee del CSS, en el banco de
 * App.css). Sin tono, el gris.
 */
export function temaAJuego(tono: Tono | null, acentos: Record<string, string>, candidatos = CANDIDATOS): ThemeId {
  if (!tono) return TEMA_GRIS;
  let mejor: ThemeId = TEMA_GRIS;
  let mejorDist = Infinity;
  for (const id of candidatos) {
    const acento = acentos[id];
    if (!acento) continue;
    const d = distanciaTono(tono.h, hexAHsl(acento).h);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = id;
    }
  }
  return mejor;
}

/* ── Lo que toca el DOM ─────────────────────────────────────────────────── */

/** Cuántos píxeles de lado se miran: de sobra para un color, y cabe en un parpadeo. */
const LADO = 48;

/**
 * El tono de una imagen servida por Tauri. `crossOrigin` es obligatorio: el
 * protocolo de assets contesta con `Access-Control-Allow-Origin` para la
 * ventana (`tauri/src/protocol/asset.rs`), y sin pedirlo el canvas quedaría
 * manchado y `getImageData` lanzaría.
 */
export function tonoDeLaImagen(url: string): Promise<Tono | null> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = LADO;
      c.height = LADO;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("sin canvas"));
      ctx.drawImage(img, 0, 0, LADO, LADO);
      try {
        resolve(tonoDominante(ctx.getImageData(0, 0, LADO, LADO).data));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("no se pudo cargar la foto"));
    img.src = url;
  });
}

/**
 * El acento de cada tema, leído del CSS de verdad: un `<span data-tema-prev>`
 * por tema (la misma regla que pinta las miniaturas de Ajustes) y su
 * `--accent` calculado. Así los colores viven en un solo sitio.
 */
export function acentosDeLosTemas(ids: readonly ThemeId[] = CANDIDATOS): Record<string, string> {
  const sonda = document.createElement("span");
  sonda.style.display = "none";
  document.body.appendChild(sonda);
  const acentos: Record<string, string> = {};
  try {
    for (const id of ids) {
      sonda.setAttribute("data-tema-prev", id);
      acentos[id] = getComputedStyle(sonda).getPropertyValue("--accent").trim();
    }
  } finally {
    sonda.remove();
  }
  return acentos;
}

/** El tema que pide la foto que hay en esa URL. */
export async function temaDeLaFoto(url: string): Promise<ThemeId> {
  const tono = await tonoDeLaImagen(url);
  return temaAJuego(tono, acentosDeLosTemas());
}
