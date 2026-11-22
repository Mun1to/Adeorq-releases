// El tema de xterm de cada terminal: las letras del esquema elegido, el fondo
// de la casa (que es quien sabe si hay una foto detrás) y la barra de scroll a
// juego. Salió tal cual de `components/TerminalPane.tsx` el 2026-11-21, para
// hacer sitio bajo su techo de líneas (`pnpm gordos`).

import { coloresTerm } from "./temasTerm";

// El fondo de reserva, y solo eso. Los colores de las letras viven ahora en
// `lib/temasTerm.ts`, porque se eligen desde Ajustes y son una decisión aparte
// de la del tema de la casa: el tema de la app es el mueble, el de la terminal
// es la letra que se lee ocho horas.
//
// Translúcido y azul profundo (nunca negro plano) para que el panel se lea como
// cristal tintado aunque el renderer lo pinte sólido.
const FONDO_RESERVA = "rgba(13, 21, 36, 0.45)";

/** El pulgar de la barra de scroll, del color del tema de la casa.
    Desde xterm 6 la barra la pinta el propio xterm (motor de VS Code) y su
    color por defecto es un gris que sobre el cristal oscuro casi no existía:
    parte del «a veces no se ve la barra» (Munir, 2026-08-17). El accent llega
    como `#rrggbb`, así que el alfa se le pega detrás; si algún tema lo
    escribiera de otra forma, antes un azul de reserva que un pulgar invisible. */
function pulgarDeScroll(): { normal: string; hover: string; activo: string } {
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const base = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#5fb0ff";
  return { normal: `${base}66`, hover: `${base}b3`, activo: `${base}e6` };
}

/** El tema completo para xterm: las letras del esquema elegido, el fondo de
    la casa (que es quien sabe si hay una foto detrás) y la barra de scroll a
    juego. */
export function temaDeXterm() {
  const pulgar = pulgarDeScroll();
  return {
    ...coloresTerm(),
    /* Con fondo translúcido, xterm NO pinta fondo: lo pinta `.pane-term` una
       sola vez (App.css). Antes se le daba el mismo rgba y xterm lo ponía en
       línea en `.xterm` y en `.xterm-scrollable-element`, y el renderer lo
       pintaba otra vez en el canvas: el área del texto llevaba cuatro capas del
       tinte y la franja de la derecha (la reserva de 14 px de la barra más el
       resto de celda) y la de abajo solo tres o dos. Con una foto detrás esa
       franja se veía de otro color. Medido en Brave con píxeles (2026-09-12):
       texto (55,51,54) contra franja (54,49,49) y franja de abajo (64,65,72);
       con esto, (76,65,57) en los tres sitios. El alfa de `--xterm-bg` va
       compensado para que una capa oscurezca lo que oscurecían tres. Con fondo
       sólido no hay transparencia y xterm pinta el suyo, como siempre. */
    background: esFondoSolido() ? fondoDeXterm() : "rgba(0, 0, 0, 0)",
    scrollbarSliderBackground: pulgar.normal,
    scrollbarSliderHoverBackground: pulgar.hover,
    scrollbarSliderActiveBackground: pulgar.activo,
  };
}

/**
 * El color de fondo del lienzo de xterm, leído del CSS.
 *
 * No puede ser una constante: el renderer de xterm pinta su fondo él mismo, así
 * que no lo alcanza ninguna regla de CSS, y con una foto de fondo puesta hay que
 * abrirlo o la imagen no se ve. La variable la decide `App.css` (`--xterm-bg`),
 * que es quien sabe si hay fondo y qué tema está activo; aquí solo se lee.
 */
export function fondoDeXterm(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--xterm-bg")
    .trim();
  return v || FONDO_RESERVA;
}

/**
 * Si el fondo que le toca a la terminal es SÓLIDO, o sea que no hay nada que
 * dejar ver a través.
 *
 * Con transparencia, xterm renuncia a su camino rápido: tiene que componer cada
 * celda contra lo que hay debajo en vez de pintar y ya. Es lo correcto cuando
 * la gracia es ver tu foto por detrás, y es tirar rendimiento cuando el fondo
 * es negro sólido (el Apagón) o cuando has pedido el modo rendimiento.
 *
 * Se mira el COLOR que va a usar, no el ajuste: así vale para las tres formas
 * de acabar con un fondo sólido sin tener que acordarse de ninguna.
 */
export function esFondoSolido(): boolean {
  const c = fondoDeXterm();
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const partes = m[1].split(/[,/]/).map((x) => x.trim());
    // Sin cuarto valor es un rgb() de toda la vida: opaco.
    return partes.length < 4 || Number(partes[3]) >= 0.999;
  }
  // `#rrggbbaa` y `#rgba` llevan la transparencia dentro; el resto es opaco.
  if (c.startsWith("#")) return c.length !== 9 && c.length !== 5;
  return !/transparent|color-mix|hsla|\/\s*0?\.\d/.test(c);
}
