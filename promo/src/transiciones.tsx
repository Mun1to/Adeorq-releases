import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { dissolve } from "@remotion/transitions/dissolve";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { ripple } from "@remotion/transitions/ripple";
import { swap } from "@remotion/transitions/swap";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { AbsoluteFill } from "remotion";
import { COLOR } from "./casa";
import type { Escena } from "./guion";

/**
 * Los pasos de una escena a otra.
 *
 * Van sobre `TransitionSeries` de `@remotion/transitions`, que es quien solapa
 * las dos escenas y les da el avance. La primera versión llevaba dos pasos
 * hechos a mano con CSS (un empujón y un fundido con zoom) y Munir dijo que no
 * lucían. Estos son los del propio paquete que pintan con un sombreador: las
 * dos escenas se dibujan en un lienzo y se mezclan píxel a píxel, que es lo
 * que permite un desenfoque de verdad, una onda o un giro con reflejo.
 *
 * ⚠ Piden Chrome 148 o más con `CanvasDrawElement` encendido. El render lo
 * trae así de fábrica (el `chrome-headless-shell` 149 que baja Remotion); en
 * el Studio, si el navegador es más viejo, el paso se cae con un mensaje que
 * lo dice. Los dos de CSS siguen aquí abajo por si hay que volver.
 *
 * Cada paso tiene un porqué, y no cambia de una vez a otra: el mismo salto se
 * da siempre igual. Seis pasos distintos repartidos al azar son seis cosas que
 * mirar que no son la app.
 *
 * ⚠ Dos cosas que piden a la escena, y las dos se pagaron mirando fotogramas
 * (`Promo.tsx` las cumple): una sola raíz, porque solo dibujan el primer hijo,
 * y que sea opaca, con su fondo dentro, porque por donde es transparente se
 * ve debajo la escena sin tocar. Y una al render: la gráfica por ANGLE
 * (`remotion.config.ts`), o a la quinta transición el navegador se cae.
 */
type Nada = Record<string, never>;
type Props = TransitionPresentationComponentProps<Nada>;
// Cada presentación del paquete lleva sus propias opciones en el tipo, y aquí
// se guardan juntas: lo único que se hace con ellas es dárselas a la serie.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Paso = TransitionPresentation<any>;

/** De CSS: la que se va se aleja hacia la izquierda y la nueva llega desde la
    derecha, las dos desenfocadas mientras se mueven. */
function Empuje({ children, presentationDirection, presentationProgress: p }: Props) {
  const llega = presentationDirection === "entering";
  const x = llega ? (1 - p) * 64 : -p * 64;
  const escala = llega ? 0.9 + 0.1 * p : 1 - 0.1 * p;
  const borroso = Math.sin(Math.PI * p) * 9;
  return (
    <AbsoluteFill
      style={{
        transform: `translateX(${x}%) scale(${escala})`,
        opacity: llega ? Math.min(1, p * 1.7) : Math.max(0, 1 - p * 1.7),
        filter: borroso > 0.3 ? `blur(${borroso}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** De CSS: la que se va se acerca hasta deshacerse y la nueva llega del fondo. */
function Atraviesa({ children, presentationDirection, presentationProgress: p }: Props) {
  const llega = presentationDirection === "entering";
  const borroso = (llega ? 1 - p : p) * 12;
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${llega ? 0.86 + 0.14 * p : 1 + 0.22 * p})`,
        opacity: llega ? p : 1 - p,
        filter: borroso > 0.3 ? `blur(${borroso}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** Todos, con nombre: la composición `Transiciones` los enseña uno detrás de
    otro con su número, para elegir mirando. */
export const PASOS = {
  /** Dos tarjetas que se cambian el sitio, con su reflejo: pasar de pestaña. */
  cambio: swap({}),
  /** Un zoom desenfocado con un punto de giro. */
  zoom: zoomBlur({ rotation: 0.35 }),
  /** Se entra en la imagen hasta que es la otra. */
  atraviesa: crossZoom({}),
  /** Una cortina que deforma lo que barre. */
  cortina: crosswarp({}),
  /** Un barrido desenfocado, de lado. */
  barrido: linearBlur({}),
  /** Una onda, como una piedra en el agua. */
  onda: ripple({}),
  /** Se quema por el borde, con el azul de la marca en la llama. */
  ascua: dissolve({ spreadColor: COLOR.marcaOscuro, hotColor: COLOR.marcaClaro }),
  /** Los dos de CSS de la primera versión. */
  empuje: { component: Empuje, props: {} } as TransitionPresentation<Nada>,
  fundido: { component: Atraviesa, props: {} } as TransitionPresentation<Nada>,
} satisfies Record<string, Paso>;

export type NombreDePaso = keyof typeof PASOS;

/**
 * Qué paso toca entre dos escenas.
 *
 * - Al abrir un capítulo, el zoom con giro: es el corte más fuerte de la
 *   pieza y se reserva para decir «ahora otra cosa».
 * - Del cartel a su primera pantalla, y del problema a la portada, se
 *   atraviesa: se entra en lo que había hasta que es lo siguiente.
 *   Al cierre también: se entra en la última pantalla y al otro lado está la
 *   descarga.
 * - De pantalla a pantalla, el cambio de tarjetas: es pasar de pestaña.
 * - A Adeo y desde Adeo, la onda.
 * - Lo demás (de la portada al «qué es»), el barrido, que es el más callado.
 *
 * Los otros dos (`cortina`, `ascua`) están en el muestrario y no en la pieza:
 * a mitad de camino la cortina retuerce el texto en espiral y el ascua tiñe
 * la pantalla entera de azul. Y se probaron y se quitaron `dreamyZoom` (la
 * pantalla se queda en blanco, y sobre un fondo oscuro es un fogonazo) y
 * `zoomInOut` (se queda en un gris plano).
 */
export function nombreDelPaso(de: Escena, a: Escena): NombreDePaso {
  if (a.tipo === "capitulo") return "zoom";
  if (de.tipo === "capitulo" || de.tipo === "gancho" || a.tipo === "cierre") return "atraviesa";
  if (a.tipo === "adeo" || de.tipo === "adeo") return "onda";
  if (de.tipo === "pantalla" && a.tipo === "pantalla") return "cambio";
  return "barrido";
}

export const pasoEntre = (de: Escena, a: Escena): Paso => PASOS[nombreDelPaso(de, a)];
