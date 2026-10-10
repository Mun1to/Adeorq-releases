// La barra de arriba se aprieta por escalones SOLO cuando no cabe.
//
// Hasta el 2026-10-10 lo decidían dos cortes fijos (`@media (max-width: …)`):
// a 1700 se iban los nombres de las pestañas y a 1150 el título de la canción.
// Un número así vale para la barra del día en que se midió y para nada más. Con
// la pestaña Decisiones el de los nombres se quedó corto y se subió a 1800, y
// esa misma noche a Munir, con su barra de verdad (el pulso de CPU, RAM y
// agentes, música sonando y la Cabina con sus tres botones), la fila no le cabía
// a 1920: el reproductor salía aplastado y «Cerrar todas», cortado. El banco que
// dio por bueno el 1800 no tenía el pulso dentro.
//
// Así que la barra se mide a sí misma: cada vez que cambia su ancho o lo que
// lleva dentro, prueba con todo puesto y va quitando, en el orden de `RETIRADAS`,
// hasta que cabe. Todo pasa antes de pintar (un ResizeObserver y un
// MutationObserver avisan antes del siguiente fotograma), así que no se ve
// parpadear. Su banco es `scripts/laboratorio/barra-cabe.js`.

import { useLayoutEffect, type RefObject } from "react";

/**
 * Lo que se quita cuando no cabe, lo menos necesario primero. Cada palabra
 * entra en `data-sin` de `.topbar` y su CSS está en `15-agenda-sesiones.css`.
 *
 * Los nombres de las pestañas ya no están en la lista: desde el 2026-10-10 van
 * solo con su icono en cualquier ancho, porque Munir lo pidió así. Con ese
 * sitio ganado, lo primero que se va sigue siendo el nombre de los tres
 * botones de la Cabina (lo dicen al pasar el ratón) y luego el título de la
 * canción.
 */
export const RETIRADAS = ["acciones", "titulo", "musica", "marca"] as const;

/**
 * Cuánto se sale lo de dentro, en píxeles. No basta con mirar la barra: el
 * reproductor y las pestañas se ENCOGEN antes que desbordarla (el reproductor
 * tiene `flex-shrink`), y lo aplastado se nota en que su contenido ya no cabe
 * en su caja.
 */
export function cuantoSeSale(barra: HTMLElement): number {
  const cajas = [barra, ...barra.querySelectorAll<HTMLElement>(".tabs, .topbar-acciones, .np")];
  return Math.max(0, ...cajas.map((c) => c.scrollWidth - c.clientWidth));
}

export function useBarraQueCabe(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const barra = ref.current;
    if (!barra) return;
    const ajustar = () => {
      for (let n = 0; n <= RETIRADAS.length; n++) {
        barra.dataset.sin = RETIRADAS.slice(0, n).join(" ");
        if (cuantoSeSale(barra) <= 1) return;
      }
    };
    ajustar();
    // El ancho cambia con la ventana; lo de dentro, con la música, el pulso,
    // las cuentas de las pestañas o los botones que salen en la Cabina. Tocar
    // `data-sin` no es ninguno de los dos, así que esto no se realimenta.
    const tamano = new ResizeObserver(ajustar);
    tamano.observe(barra);
    const contenido = new MutationObserver(ajustar);
    contenido.observe(barra, { childList: true, subtree: true, characterData: true });
    return () => {
      tamano.disconnect();
      contenido.disconnect();
    };
  }, [ref]);
}
