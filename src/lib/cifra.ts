// Una cifra que cuenta hasta su número en vez de saltar.
//
// Munir, 2026-10-18, sobre el panel de Archivos: «los +497 −533 cuentan hasta
// su número». Cuando git da líneas nuevas, el número no cambia de golpe: sale
// rápido del que había y frena al llegar, siempre entero, en `CUENTA_MS`. Con
// el modo rendimiento puesto o «reducir movimiento» en el sistema no se apaga:
// llega en menos de la mitad del tiempo (la amplitud baja, no se mata).
//
// La cuenta (`tramo`, `duracion`) no toca el DOM, para probarla sin la app
// (`scripts/cifra-check.ts`); el hook solo lleva el reloj.

import { useEffect, useRef, useState } from "react";
import { modoRendimiento } from "./rendimiento";

/** Lo que tarda una cifra en llegar, de fábrica. */
export const CUENTA_MS = 700;

/**
 * Dónde va la cifra en el instante `k` (de 0 a 1) del camino de `desde` a
 * `hasta`: sale rápido y frena al llegar, y nunca se sale del tramo.
 */
export function tramo(desde: number, hasta: number, k: number): number {
  const t = Math.min(1, Math.max(0, k));
  const suave = 1 - (1 - t) ** 3;
  return Math.round(desde + (hasta - desde) * suave);
}

/** Lo que tarda de verdad: con ahorro, menos de la mitad. */
export function duracion(ms: number, ahorra: boolean): number {
  return ahorra ? Math.round(ms * 0.4) : ms;
}

/** Si toca acortar: el modo rendimiento de la app o «reducir movimiento» del sistema. */
function ahorrando(): boolean {
  return modoRendimiento() || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** El número que se enseña ahora mismo mientras `n` cuenta hasta su valor. */
export function useCifra(n: number, ms = CUENTA_MS): number {
  const [visible, setVisible] = useState(n);
  // Desde dónde arranca la siguiente cuenta: lo último que se enseñó, aunque
  // `n` cambie otra vez a mitad de camino.
  const actual = useRef(n);
  useEffect(() => {
    const desde = actual.current;
    if (desde === n) return;
    const dur = duracion(ms, ahorrando());
    const t0 = performance.now();
    let reloj = 0;
    const paso = (t: number) => {
      const k = (t - t0) / dur;
      const x = tramo(desde, n, k);
      actual.current = x;
      setVisible(x);
      if (k < 1) reloj = requestAnimationFrame(paso);
    };
    reloj = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(reloj);
  }, [n, ms]);
  return visible;
}
