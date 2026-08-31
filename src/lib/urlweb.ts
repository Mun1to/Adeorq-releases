// Lo que Adeorq sabe de direcciones web, en un sitio que no pinta nada.
//
// Estas tres cosas las usan las DOS ventanas de web que hay: la pieza del
// lienzo (`CanvasWeb`) y el panel de la cabina (`WebPane`). Vivían en la del
// lienzo, y por eso el panel la importaba para sacarles `comoUrl`.
//
// Eso costaba caro y no se veía: `CanvasWeb` importa `@xyflow/react`, así que
// una función de cinco líneas arrastraba el motor de nodos ENTERO al archivo
// de arranque, y ahí se quedaba aunque no abrieras el lienzo en todo el día
// (medido el 2026-08-31: 53 apariciones de React Flow en el bundle principal).
// Al mudarlas aquí, quien las quiere se lleva solo texto.

/** Los puertos donde suele estar servido lo que uno acaba de arrancar. */
export const PUERTOS = [1420, 5173, 3000, 4321, 8000, 8080];

/** Completa lo que se escriba a medias: "3000" y "localhost:3000" son intentos
    honrados de decir una dirección, y fallar por no escribir http:// sobra. */
export function comoUrl(txt: string): string {
  const limpio = txt.trim();
  if (!limpio) return "";
  if (/^\d{2,5}$/.test(limpio)) return `http://localhost:${limpio}`;
  const url = /^https?:\/\//i.test(limpio) ? limpio : `http://${limpio}`;
  return comoEmpotrable(url);
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
