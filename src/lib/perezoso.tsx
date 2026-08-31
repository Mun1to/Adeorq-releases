// Una vista que no se carga hasta que se mira.
//
// Adeorq salía en UN solo archivo de 2,58 MB de JavaScript (medido el
// 2026-08-31 con `pnpm build`), y el navegador tiene que leerlo y compilarlo
// ENTERO antes de pintar la primera ventana. Dentro iban cosas que la mayoría
// de los arranques no abre nunca: el editor de código con sus seis lenguajes
// (CodeMirror), el lienzo con su motor de nodos y sus dos librerías de dibujo
// (React Flow, roughjs, perfect-freehand), la Memoria, la Agenda, los Ajustes.
// Todo eso se pagaba en cada arranque para dejarlo sin usar.
//
// `React.lazy` parte esos trozos a archivos aparte que se piden cuando de
// verdad se van a pintar. Lo que cambia no es solo el peso: la ventana pinta y
// responde mientras el trozo llega, en vez de esperarlo.
//
// El envoltorio va AQUÍ y no en cada sitio donde se pinta la vista, y es a
// propósito: cada vista necesita su propia frontera de espera. Con una sola
// compartida, el lienzo —que está montado siempre aunque escondido, para no
// matarle las terminales— haría desaparecer la vista que sí estás mirando
// mientras carga la suya.

import { lazy, Suspense, type ComponentType } from "react";

/**
 * Envuelve un `import()` en un componente normal que se puede pintar como
 * cualquier otro: misma firma, mismas props, y su espera resuelta por dentro.
 *
 * El hueco mientras llega es `null` y no un cartel de «cargando»: son
 * milisegundos leyendo un archivo del propio disco, y un parpadeo de texto
 * ahí se ve peor que no ver nada.
 */
export function perezoso<P extends object>(
  carga: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> {
  const Vista = lazy(carga);
  return function Perezosa(props: P) {
    return (
      <Suspense fallback={null}>
        <Vista {...props} />
      </Suspense>
    );
  };
}
