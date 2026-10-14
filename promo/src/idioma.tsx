import { createContext, useContext } from "react";
import { useVideoConfig } from "remotion";
import type { Frase, Idioma } from "./guion";

const Lengua = createContext<Idioma>("es");

/** Envuelve la pieza entera: todo lo de dentro habla ese idioma. */
export const EnIdioma = Lengua.Provider;

/** Da la función que elige la frase del idioma de esta pieza. */
export function useDecir() {
  const idioma = useContext(Lengua);
  return (f: Frase) => f[idioma];
}

export const useIdioma = () => useContext(Lengua);

/**
 * La vara de medir. Todo tamaño de la pieza es un múltiplo de `u`, que vale 1
 * en 1080p y en la vertical de 1080 de ancho. Antes se medía en porcentaje de
 * la altura, y en vertical (1.920 de alto) un titular salía casi el doble de
 * grande y no cabía en 1.080 de ancho.
 */
export function useMedidas() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return {
    u: Math.min(width, height) / 1080,
    vertical,
    width,
    height,
  };
}
