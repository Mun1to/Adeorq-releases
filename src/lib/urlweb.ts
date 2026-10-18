// Lo que Adeorq sabe de direcciones web, en un sitio que no pinta nada.
//
// Estas tres cosas las usan las DOS ventanas de web que hay: la pieza del
// lienzo (`CanvasWeb`) y el navegador de la cabina (`Navegador`). Vivían en la del
// lienzo, y por eso el panel la importaba para sacarles `comoUrl`.
//
// Eso costaba caro y no se veía: `CanvasWeb` importa `@xyflow/react`, así que
// una función de cinco líneas arrastraba el motor de nodos ENTERO al archivo
// de arranque, y ahí se quedaba aunque no abrieras el lienzo en todo el día
// (medido el 2026-08-31: 53 apariciones de React Flow en el bundle principal).
// Al mudarlas aquí, quien las quiere se lleva solo texto.

/** Los puertos donde suele estar servido lo que uno acaba de arrancar. */
export const PUERTOS = [1420, 5173, 3000, 4321, 8000, 8080];

/** Donde va lo que no parece una dirección. Google de fábrica, porque Munir pidió
    el navegador como «Google normal y corriente»; se elige en Ajustes (2026-10-18). */
export const BUSCADORES = {
  google: { nombre: "Google", url: "https://www.google.com/search?q=" },
  brave: { nombre: "Brave Search", url: "https://search.brave.com/search?q=" },
  duckduckgo: { nombre: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
} as const;
export type Buscador = keyof typeof BUSCADORES;
export const BUSCADOR_KEY = "adeorq-buscador";

/** El que está elegido en Ajustes, o Google. Sin `localStorage` (un banco, una
    página sin permiso) también Google. */
export function buscadorElegido(): Buscador {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(BUSCADOR_KEY);
    return v && v in BUSCADORES ? (v as Buscador) : "google";
  } catch {
    return "google";
  }
}

/** El servidor de lo escrito, si tiene forma de serlo: `localhost`, una IP, un
    dominio con punto o un nombre con puerto (`mi-servidor:8080`). */
const SERVIDOR = /^(localhost|\[[0-9a-f:.]+\]|[^\s/?#.:]+(\.[^\s/?#.:]+)+|[a-z0-9-]+(?=:\d))(:\d{1,5})?$/i;
/** Los de esta máquina o de tu red, que se sirven sin cifrar. */
const DE_CASA = /^(localhost|\[[0-9a-f:.]+\]|\d{1,3}(\.\d{1,3}){3}|[a-z0-9-]+(?=:\d))(:\d{1,5})?$/i;

/** Lo escrito en la barra, como lo entendería un navegador: "3000" y
    "localhost:3000" son intentos honrados de decir una dirección, un dominio se
    pide cifrado, y lo demás («casa», una frase) se busca. Hasta el 2026-10-18 todo
    era una dirección, y «casa» acababa en `http://casa`. */
export function comoUrl(txt: string, buscador: Buscador = buscadorElegido()): string {
  const limpio = txt.trim();
  if (!limpio) return "";
  if (/^\d{2,5}$/.test(limpio)) return `http://localhost:${limpio}`;
  if (/^https?:\/\//i.test(limpio)) return limpio;
  const servidor = limpio.split(/[/?#]/)[0];
  if (/\s/.test(limpio) || !SERVIDOR.test(servidor)) return BUSCADORES[buscador].url + encodeURIComponent(limpio);
  return `${DE_CASA.test(servidor) ? "http" : "https"}://${limpio}`;
}

/**
 * Algunas páginas tienen una dirección que SÍ se deja abrir aquí dentro, y no
 * es la que copias de la barra del navegador.
 *
 * YouTube es el caso: `/watch?v=…` manda `X-Frame-Options: SAMEORIGIN` y por
 * eso saldría un cuadro blanco, pero `/embed/…` no manda nada y entra sin
 * problema (comprobado el 2026-07-29). Pegar el enlace normal y que funcione
 * es lo que uno espera, así que la traducción se hace aquí y en silencio.
 *
 * Lo que esto NO hace, y conviene no confundirlo: no quita los anuncios. Eso
 * lo hacen las extensiones del navegador, y aquí dentro no hay extensiones.
 */
export function comoEmpotrable(url: string): string {
  const yt = url.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(.*)$/i);
  if (yt) {
    const v = new URLSearchParams(yt[1]).get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
  }
  const corto = url.match(/^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (corto) return `https://www.youtube.com/embed/${corto[1]}`;
  return url;
}
