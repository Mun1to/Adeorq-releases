// Cerrar un diálogo al pinchar el velo de detrás, sin llevarse por delante lo
// que estabas escribiendo.
//
// Los velos cerraban con un `onClick` a secas, y eso costaba un mensaje entero:
// seleccionas el texto del cuadro arrastrando, sueltas el ratón un pixel fuera
// del cuadro, y el navegador manda el `click` al ANCESTRO COMÚN de donde bajó y
// donde subió el ratón, que es el velo. El diálogo se cerraba sin que nadie
// hubiera pinchado el velo (Munir, 2026-07-30).
//
// Un `stopPropagation` en el diálogo no lo evita, y por eso el que había en los
// nueve diálogos no bastaba: ese click no sube desde el diálogo, nace ya en el
// velo.
//
// Aquí se cierra solo si el gesto EMPEZÓ y ACABÓ en el velo. Un arrastre que
// nace dentro del diálogo no cierra nada, pase por donde pase.
//
// Va como función y no como componente para que aplicarlo sea una línea en cada
// diálogo, sin reordenar el JSX de nueve sitios. La bandera se guarda en una ref
// que declara el componente: una por componente basta, porque dos diálogos no se
// solapan nunca, y así no hay un hook dentro de un render condicional.

import type { MouseEvent, MutableRefObject } from "react";

export function propsDeVelo(
  bajoAqui: MutableRefObject<boolean>,
  cerrar: () => void,
): {
  onMouseDown: (e: MouseEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
} {
  return {
    onMouseDown: (e) => {
      bajoAqui.current = e.target === e.currentTarget;
    },
    onClick: (e) => {
      // Las dos condiciones: el click tiene que ser DEL velo (no de algo de
      // dentro que burbujea) y el gesto tiene que haber empezado en el velo.
      if (e.target === e.currentTarget && bajoAqui.current) cerrar();
      bajoAqui.current = false;
    },
  };
}
