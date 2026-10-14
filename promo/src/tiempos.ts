/**
 * Cuándo pasa cada cosa.
 *
 * Los números de este archivo los leen DOS: quien pinta (las escenas) y quien
 * hace sonar (`Sonido.tsx`). Por eso viven aquí y no dentro de cada componente:
 * un rótulo que entra en el fotograma 8 con su clic puesto a mano en el 12 es
 * la clase de desajuste que se nota sin saber decir qué falla.
 */
import { ESCENAS, type Escena } from "./guion";

/** Lo que dura el paso de una escena a la siguiente, en fotogramas. Par,
    porque el corte es justo su mitad. */
export const PASO = 24;

/**
 * El texto solo: cada frase empieza `entra` fotogramas después de su sitio,
 * sus palabras llegan una cada `cada`, y se va en los últimos `sale` antes de
 * la frase siguiente.
 */
export const TEXTO = { entra: 5, cada: 4, sale: 8 } as const;

/**
 * Una pantalla, contando desde su corte: el título sale en el centro
 * (`titulo`), palabra a palabra (`cada`), y en `sale` se va mientras la
 * cámara arranca hacia la primera función. Cada viaje de la cámara dura
 * `viaje`; el puntero, si esa función lo lleva, hace clic `clic` fotogramas
 * después de llegar. Y una función pide `porFoco` fotogramas como poco: con
 * menos, la frase que la acompaña no da tiempo a leerla.
 */
export const PANTALLA = { titulo: 2, cada: 3, sale: 48, viaje: 16, clic: 22, porFoco: 60 } as const;

/** Cuándo deja el título el centro. En una escena corta, antes. */
export const saleLaCamara = (largo: number) => Math.round(Math.min(PANTALLA.sale, largo * 0.36));

/** Cuántas de las `n` funciones de una pantalla da tiempo a enseñar en una
    escena de `largo` fotogramas. Las que no caben son las últimas. */
export const focosQueCaben = (largo: number, n: number) =>
  Math.max(1, Math.min(n, Math.floor((largo - saleLaCamara(largo)) / PANTALLA.porFoco)));

/** Cuándo sale la cámara hacia la función `i` de las `n` que se enseñan: el
    tiempo que queda detrás del título se reparte a partes iguales. */
export function haciaElFoco(largo: number, n: number, i: number) {
  const sale = saleLaCamara(largo);
  return Math.round(sale + (i * (largo - sale)) / n);
}

/** Cuándo llega la frase de la función `i`: un pelo antes de que la cámara
    frene, para que el «pop» caiga con ella. */
export const llegaDato = (largo: number, n: number, i: number) => haciaElFoco(largo, n, i) + PANTALLA.viaje - 3;

/** Cuándo hace clic el puntero en la función `i`. */
export const clicEn = (largo: number, n: number, i: number) => haciaElFoco(largo, n, i) + PANTALLA.viaje + PANTALLA.clic;

/** Adeo: cuánto tarda su frase en empezar dentro de cada parte, y cada
    cuánto llega una palabra. */
export const ADEO = { entra: 4, cada: 3 } as const;

/** El cierre: cuándo llega cada una de sus tres líneas. */
export const CIERRE = { titulo: 8, cada: 4, web: 22, linea: 38 } as const;

/** Cuánto espera la voz después del corte (lo que tarda en asentarse la escena
    que llega), cuánto aire se le deja detrás, en segundos, y cuánto se adelanta
    lo que se pinta a la palabra que lo nombra: un rótulo que llega a la vez
    que la palabra se lee tarde. */
export const VOZ = { entra: 8, respiro: 0.3, adelanto: 4 } as const;

/** Un compás de la música y uno de sus cuatro pulsos, en segundos (96 por
    minuto). Sin voz las escenas duran compases enteros, que es lo que pone el
    guion. Con voz se ajustan al pulso: redondeando cada escena al compás se
    iban veinte segundos de pieza en esperar callados al siguiente. */
const COMPAS = 2.5;
const PULSO = COMPAS / 4;

/**
 * La voz grabada, por el `id` de cada escena: cuánto dura su trozo y en qué
 * segundo de ese trozo empieza cada frase del guion. Lo escribe `voz.mjs` en
 * `public/voz/<idioma>/voz.json` al cortar la grabación. Vacío si no la hay:
 * entonces la pieza va con música y rótulos, y dura lo que diga el guion.
 */
export type Voces = Record<string, { dura: number; frases: number[] }>;

/** Dónde empieza la parte `i` de `n` de una escena que va frase a frase (el
    texto solo, Adeo): con voz, donde empieza su frase; sin ella, a partes
    iguales. */
export function parte(t: { largo: number; frases?: number[] }, n: number, i: number) {
  if (i <= 0) return 0;
  if (i >= n) return t.largo;
  return t.frases?.length === n ? Math.max(0, t.frases[i] - VOZ.adelanto) : trozo(t.largo, n, i);
}

/** Cuántas palabras tiene una frase del guion: las que entran una a una, y
    las que suenan. */
export const cuantasPalabras = (texto: string) => texto.split(/\s+/).filter(Boolean).length;

/** Lo que dura el logotipo antes de convertirse en Adeo, como mucho. */
export const DESPIERTA = 66;

/** Cuándo el logotipo se convierte en Adeo. `Sonido.tsx` pone ahí su «pop». */
export const despierta = (largo: number) => Math.min(DESPIERTA, Math.round(largo * 0.4));

export type Tramo = {
  escena: Escena;
  /** Si hay voz: en qué fotograma, contando desde el corte, empieza cada
      frase del guion de esta escena. */
  frases?: number[];
  /** El fotograma en el que esta escena ya es la que manda: la mitad de su
      transición de entrada. La suma de las duraciones anteriores. */
  corte: number;
  /** Fotogramas de un corte al siguiente. */
  largo: number;
  /** Dónde empieza y cuánto dura su `Sequence`, contando la media transición
      de cada lado. */
  desde: number;
  dura: number;
  /** El corte visto desde dentro de la escena: 0 en la primera, media
      transición en las demás. */
  entra: number;
};

export function tramos(fps: number, voz: Voces = {}): Tramo[] {
  let corte = 0;
  let reloj = 0;
  return ESCENAS.map((escena, i) => {
    const dicho = voz[escena.id];
    // Con voz manda ella: la escena dura lo que su frase, hasta el pulso
    // siguiente. El nombre aguanta con un compás; lo demás, con dos.
    const segundos = dicho
      ? Math.max(escena.tipo === "nombre" ? COMPAS : 2 * COMPAS, Math.ceil((VOZ.entra / fps + dicho.dura + VOZ.respiro) / PULSO) * PULSO)
      : escena.dura;
    // Los cortes se sacan del reloj acumulado, no sumando largos redondeados:
    // un pulso son 18,75 fotogramas, y de redondeo en redondeo el corte se iría
    // saliendo de la música.
    const largo = Math.round((reloj + segundos) * fps) - corte;
    reloj += segundos;
    const antes = i > 0 ? PASO / 2 : 0;
    const despues = i < ESCENAS.length - 1 ? PASO / 2 : 0;
    const t: Tramo = {
      escena,
      frases: dicho?.frases.map((s) => VOZ.entra + Math.round(s * fps)),
      corte,
      largo,
      desde: corte - antes,
      dura: largo + antes + despues,
      entra: antes,
    };
    corte += largo;
    return t;
  });
}

export const totalDe = (ts: Tramo[]) => ts.reduce((s, t) => s + t.largo, 0);

/** Parte un tramo en `n` trozos iguales: dónde empieza el trozo `i`. */
export const trozo = (largo: number, n: number, i: number) => Math.round((largo * i) / n);
