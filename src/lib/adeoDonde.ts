// Dónde se abre Adeo, y si está abierto (la «ventana del plan», `Foreman.tsx`).
//
// Munir eligió el 2026-11-15 (B1): «Adeo se abre en la barra de la derecha, como Uso,
// Skills y Archivos, con el mismo atajo, y las terminales siguen a la vista». Antes era
// una ventana que lo oscurecía todo. En la Cabina va a la barra; en las demás vistas,
// que no tienen terminales que tapar ni esa barra, sigue flotando. Lo prueba
// `scripts/laboratorio/adeo-en-la-barra.js`.

import { useCallback, useRef, useState, type MutableRefObject, type SetStateAction } from "react";
import { anclarColumnas } from "./redimension";
import type { Cara } from "../components/PanelDerecho";

export function useAdeoDonde(viewRef: MutableRefObject<string>) {
  const [showForeman, setShowForeman] = useState(false);
  /** En la barra si se le llamó desde la Cabina. Se decide al abrirlo y no cambia
      hasta cerrarlo: si abrir terminales te lleva a la Cabina, la ventana no se
      desmonta a mitad de plan. */
  const [adeoLateral, setAdeoLateral] = useState(false);
  const adeoLateralRef = useRef(false);
  const showForemanRef = useRef(false);
  showForemanRef.current = showForeman;
  /** Cierto cuando quien lo abre es el atajo del dictado: nace grabando. Se apaga
      al cerrarlo, para que la siguiente vez que lo abras a mano no se ponga a
      grabar por su cuenta. */
  const [dictarAlAbrir, setDictarAlAbrir] = useState(false);

  /** Abrir, cerrar o alternar, con la misma forma que un `setState`. */
  const ponerAdeo = useCallback((v: SetStateAction<boolean>) => {
    const antes = showForemanRef.current;
    const despues = typeof v === "function" ? v(antes) : v;
    // Abierto en la barra de la Cabina y llamado desde otra vista, donde esa barra
    // no se ve: pasa a flotar en vez de cerrarse sin que lo vieras.
    if (antes && !despues && adeoLateralRef.current && viewRef.current !== "cabina") {
      adeoLateralRef.current = false;
      setAdeoLateral(false);
      return;
    }
    if (despues === antes) return;
    if (despues) {
      adeoLateralRef.current = viewRef.current === "cabina";
      setAdeoLateral(adeoLateralRef.current);
    }
    // Abrir o cerrar la barra mueve el ancho de las terminales: que conserven sus
    // columnas (lo mismo que `cambiarCara` en `App`, `lib/redimension.ts`).
    if (adeoLateralRef.current) anclarColumnas();
    showForemanRef.current = despues;
    setShowForeman(despues);
  }, [viewRef]);

  const cerrarAdeo = useCallback(() => {
    ponerAdeo(false);
    setDictarAlAbrir(false);
  }, [ponerAdeo]);

  const enBarra = showForeman && adeoLateral;
  /** La cara que enseña la barra: Adeo abierto en ella tapa la que hubiera, y al
      cerrarlo vuelve esa. */
  const caraVista = (cara: Cara): Cara => (enBarra ? "adeo" : cara);
  /** Un icono de la franja: el de Adeo lo abre; otro, con Adeo en la barra, lo
      cierra primero (y el suyo mismo, solo lo cierra). */
  const elegirCara = (c: Cara, cambiarCara: (c: Cara) => void) => {
    if (c === "adeo") return ponerAdeo(true);
    if (enBarra) {
      cerrarAdeo();
      if (c === "") return;
    }
    cambiarCara(c);
  };

  return { showForeman, adeoLateral, enBarra, ponerAdeo, cerrarAdeo, dictarAlAbrir, setDictarAlAbrir, caraVista, elegirCara };
}
