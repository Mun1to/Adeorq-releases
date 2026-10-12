// El ancho de la barra izquierda y el tirador que lo cambia.
//
// Salió de `App.tsx` el 2026-10-12, con tres arreglos dentro (Munir, con la
// barra al mínimo: «hay que mejorar lo de la barra y optimizar esa parte»):
//
//   1. El borde sigue al puntero desde donde se agarró. El ancho era «la x del
//      puntero menos 52», de cuando a la izquierda había un carril de iconos:
//      sin carril, el borde iba 52 px por detrás y al agarrar el tirador la
//      barra daba un salto (medido: el puntero en 300 y el borde en 248).
//   2. El mínimo es el ancho en el que la cabecera cabe entera. Con 200 se
//      cortaban tres botones y el título de cada sesión se quedaba en una letra.
//   3. Arrastrarlo recibe el trato de un separador de la rejilla
//      (`lib/redimension.ts`): las terminales se reajustan a su cadencia y una
//      vez al soltar, y el cristal se apaga mientras dura.

import { useCallback, useRef, useState } from "react";
import type React from "react";
import { empezarRedimension, terminarRedimension } from "./redimension";

const CLAVE = "adeorq-sidebar-w";
/** Va a juego con el `min-width` de `.sidebar` en `02-armazon.css`. */
export const BARRA_MIN = 224;
export const BARRA_MAX = 480;
const DE_FABRICA = 300;

/** Un ancho que la barra puede tener: entero y dentro de sus topes. */
export const anchoDeBarra = (px: number) => Math.min(BARRA_MAX, Math.max(BARRA_MIN, Math.round(px)));

/** El ancho con el que nace: el guardado si lo hay, y si no el de fábrica. Uno
    guardado cuando el mínimo era 200 sube al de ahora, no vuelve a 300. */
export function anchoGuardado(guardado: string | null): number {
  const n = Number(guardado);
  return n >= 200 && n <= BARRA_MAX ? anchoDeBarra(n) : DE_FABRICA;
}

/** Dónde empieza la barra y a cuánto de su borde se pulsó el tirador. */
export type Agarre = { izquierda: number; desfase: number };

/** El ancho que pide el puntero en `x`, para un tirador agarrado así. */
export const anchoAlArrastrar = (x: number, a: Agarre) => anchoDeBarra(x - a.desfase - a.izquierda);

/** El ancho de la barra y los cuatro manejadores de su tirador. */
export function useAnchoDeBarra() {
  const [ancho, setAncho] = useState(() => anchoGuardado(localStorage.getItem(CLAVE)));
  const arrastre = useRef<(Agarre & { x: number; cuadro: number }) | null>(null);

  const alPulsar = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const barra = document.querySelector<HTMLElement>("aside.sidebar")?.getBoundingClientRect();
    if (!barra) return;
    arrastre.current = { izquierda: barra.left, desfase: e.clientX - barra.right, x: e.clientX, cuadro: 0 };
    empezarRedimension();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const alMover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    a.x = e.clientX;
    // Un ratón avisa cientos de veces por segundo y cada ancho nuevo repinta
    // la app entera: uno por fotograma basta.
    if (a.cuadro) return;
    a.cuadro = requestAnimationFrame(() => {
      a.cuadro = 0;
      setAncho(anchoAlArrastrar(a.x, a));
    });
  }, []);

  const alSoltar = useCallback(() => {
    const a = arrastre.current;
    if (!a) return;
    arrastre.current = null;
    if (a.cuadro) cancelAnimationFrame(a.cuadro);
    const fin = anchoAlArrastrar(a.x, a);
    localStorage.setItem(CLAVE, String(fin));
    setAncho(fin);
    terminarRedimension();
  }, []);

  return { ancho, tirador: { onPointerDown: alPulsar, onPointerMove: alMover, onPointerUp: alSoltar, onPointerCancel: alSoltar } };
}
