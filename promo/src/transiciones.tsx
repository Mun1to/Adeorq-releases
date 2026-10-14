import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { crosswarp } from "@remotion/transitions/crosswarp";
import { dissolve } from "@remotion/transitions/dissolve";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { ripple } from "@remotion/transitions/ripple";
import { swap } from "@remotion/transitions/swap";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { AbsoluteFill, Easing, interpolate, useVideoConfig } from "remotion";
import { COLOR } from "./casa";
import { ojoDelNombre } from "./escenas/2-Nombre";
import { ESCENAS, type Escena } from "./guion";

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

/**
 * Los pasos de MÁSCARA: en la escena que se va se abre un hueco, la cámara se
 * mete por él y al otro lado está la siguiente. Los pidió Munir al ver la
 * segunda versión («de tipo máscara, que se hace zoom a un hueco y aparece la
 * otra escena»).
 *
 * Las dos escenas se mueven con UNA sola cámara, y por eso se lee como entrar
 * y no como un fundido: la que llega está entera dentro del hueco, en
 * pequeño, y crece al mismo paso al que la que se va se nos viene encima. La
 * cuenta: el hueco mide `tam` del cuadro y está en `en`; la escena que llega
 * mide `k` (de `tam` a 1, en escala logarítmica, que es como se nota constante
 * un zoom) y la que se va, `k / tam`, las dos alrededor del mismo punto fijo.
 *
 * Son de CSS (`clip-path`), no de sombreador: no piden la escena de una sola
 * raíz, pero sí opaca, que lo que asoma por el hueco tape lo de debajo.
 */
type Forma = "caja" | "circulo" | "proa";
type Punto = { x: number; y: number };
type PropsPortal = {
  forma: Forma;
  /** El centro del hueco, en píxeles del cuadro. Es una función porque
      depende del formato: Adeo no está en el mismo sitio en la vertical. */
  en: (ancho: number, alto: number) => Punto;
  /** Lo que mide el hueco al abrirse, respecto del cuadro. */
  tam: number;
};

/** La silueta de la proa: el contorno de fuera del logotipo (`Marca.tsx`), sin
    su hueco interior, en una caja de 1024 y medido desde su centro. */
const PROA = [
  [236, 112],
  [788, 112],
  [1016, 756],
  [944, 848],
  [80, 848],
  [8, 756],
].map(([x, y]) => [x - 512, y - 480] as const);

function Portal({ children, presentationDirection, presentationProgress: p, passedProps }: TransitionPresentationComponentProps<PropsPortal>) {
  const { width: W, height: H } = useVideoConfig();
  const { forma, en, tam } = passedProps;
  const u = Math.min(W, H) / 1080;
  const hueco = en(W, H);
  const k = Math.pow(tam, 1 - p);
  const z = k / tam;
  // El punto que no se mueve: el que lleva el centro del hueco al centro del
  // cuadro cuando el zoom termina.
  const fijo = { x: (W / 2 - hueco.x / tam) / (1 - 1 / tam), y: (H / 2 - hueco.y / tam) / (1 - 1 / tam) };

  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill
        style={{
          transformOrigin: `${fijo.x}px ${fijo.y}px`,
          transform: `scale(${z})`,
          // Según se nos viene encima se desenfoca y se apaga: lo que hay que
          // mirar ya es lo del hueco.
          filter: p > 0.02 ? `blur(${p * 7 * u}px) brightness(${1 - 0.5 * p})` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }

  // El hueco no está abierto desde el primer fotograma: se abre.
  const abre = interpolate(p, [0, 0.32], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  let recorte: string;
  if (forma === "circulo") {
    // Cabe entero en la escena que llega casi todo el viaje: si creciera antes,
    // el borde de la escena lo recortaría y dejaría de ser un círculo. Solo al
    // final se abre hasta tapar el cuadro, esquinas incluidas.
    const radio =
      abre *
      interpolate(p, [0.64, 1], [0.48 * Math.min(W, H), 0.52 * Math.hypot(W, H)], {
        extrapolateLeft: "clamp",
        easing: Easing.in(Easing.quad),
      });
    recorte = `circle(${radio}px at 50% 50%)`;
  } else if (forma === "proa") {
    // De caber en el hueco a que el cuadro quepa dentro de ella: su lado más
    // estrecho es el de arriba, de 552 de ancho a 368 del centro.
    const cabe = (0.9 * H) / 736;
    const tapa = 1.06 * Math.max(H / 2 / 368, W / 2 / 276);
    const g = abre * cabe * Math.pow(tapa / cabe, p);
    recorte = `polygon(${PROA.map(([x, y]) => `${W / 2 + x * g}px ${H / 2 + y * g}px`).join(", ")})`;
  } else {
    recorte = `inset(${(1 - abre) * 50}% round ${((30 * u) / k) * (1 - p)}px)`;
  }

  return (
    <AbsoluteFill
      style={{
        transformOrigin: "0 0",
        transform: `translate(${fijo.x * (1 - z) + z * hueco.x - (k * W) / 2}px, ${fijo.y * (1 - z) + z * hueco.y - (k * H) / 2}px) scale(${k})`,
        // El borde del hueco, encendido con el azul de la marca: el filtro va en
        // el padre de lo recortado, así que sigue la forma que tenga.
        filter: p < 0.97 ? `drop-shadow(0 0 ${(22 * u * (1 - p)) / k}px rgba(72,194,255,${0.9 * (1 - p)}))` : undefined,
      }}
    >
      <AbsoluteFill style={{ clipPath: recorte }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

const portal = (props: PropsPortal): TransitionPresentation<PropsPortal> => ({ component: Portal, props });
const centro = (ancho: number, alto: number): Punto => ({ x: ancho / 2, y: alto / 2 });

/** Del nombre a la app se entra por el ojo del Adeo que acaba de despertar.
    No va en el muestrario: allí no hay un Adeo por el que entrar. */
const POR_EL_OJO = portal({ forma: "circulo", en: ojoDelNombre, tam: 0.1 });

/** Todos, con nombre: la composición `Transiciones` los enseña uno detrás de
    otro con su número, para elegir mirando. Los nuevos van al final para que
    los números de los que ya se vieron no cambien. */
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
  /** De máscara: la cámara entra por un hueco con forma de ventana, en el
      centro, que es donde está lo último que se enseñó. */
  hueco: portal({ forma: "caja", en: centro, tam: 0.3 }),
  /** De máscara: un hueco redondo en el centro. En la pieza el mismo paso
      se abre en el ojo de Adeo (`POR_EL_OJO`). */
  ojo: portal({ forma: "circulo", en: centro, tam: 0.1 }),
  /** De máscara: el hueco tiene la forma del logotipo. */
  proa: portal({ forma: "proa", en: centro, tam: 0.34 }),
} satisfies Record<string, Paso>;

export type NombreDePaso = keyof typeof PASOS;

/**
 * Qué paso toca entre dos tramos. Se alternan los de siempre y los de
 * máscara: ocho huecos seguidos cansan igual que ocho fundidos.
 *
 * - Del texto al nombre, la proa: la frase la perfora la forma del logotipo,
 *   y dentro está el logotipo.
 * - Del nombre a la app, por el ojo de Adeo: el logotipo acaba de abrirlo, y
 *   lo que hay dentro es lo que él vigila.
 * - De pantalla a pantalla, una vez el hueco (la cámara ya está metida en una
 *   función, y sigue hasta salir por la siguiente pantalla) y otra el cambio
 *   de tarjetas, que es pasar de pestaña.
 * - A Adeo, el zoom con giro: es el corte más fuerte de la pieza y se reserva
 *   para decir «ahora otra cosa».
 * - Al cierre se atraviesa: se entra en lo que había hasta que es lo
 *   siguiente.
 *
 * Los otros (`cortina`, `ascua`, `onda`, `barrido`) están en el muestrario y
 * no en la pieza: a mitad de camino la cortina retuerce el texto en espiral y
 * el ascua tiñe la pantalla entera de azul. Y se probaron y se quitaron
 * `dreamyZoom` (la pantalla se queda en blanco, y sobre un fondo oscuro es un
 * fogonazo) y `zoomInOut` (se queda en un gris plano).
 */
export function pasoEntre(de: Escena, a: Escena): Paso {
  if (a.tipo === "nombre") return PASOS.proa;
  if (de.tipo === "nombre") return POR_EL_OJO;
  if (a.tipo === "adeo") return PASOS.zoom;
  // Por su sitio en el guion y no por turno: el mismo salto se da siempre
  // igual.
  if (de.tipo === "pantalla" && a.tipo === "pantalla") return ESCENAS.indexOf(a) % 2 ? PASOS.hueco : PASOS.cambio;
  return PASOS.atraviesa;
}
