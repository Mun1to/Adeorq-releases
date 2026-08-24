import { useEffect } from "react";
import { WEB_EVENTO, type WebAvisada } from "./TerminalPane";
import { puertoEscucha } from "../lib/navegador";

// Cuando una terminal levanta un servidor, la web se abre sola.
//
// Munir, 2026-08-24: «que cuando una terminal nombre algo de un localhost o
// puerto, automáticamente se abra la pestaña de navegador del panel de la
// derecha». Arrancar un servidor de desarrollo y copiar la dirección al panel
// de al lado es el paso que sobra: la terminal ya la ha escrito.
//
// ── POR QUÉ ES UN COMPONENTE Y NO UN `useEffect` DENTRO DE `App` ──────────
//
// Porque ahí no se podía probar. `App.tsx` pasa de las 2.000 líneas y necesita
// media app montada para arrancar, así que un efecto dentro suyo solo se
// comprueba abriendo Adeorq y haciendo clics, que es justo lo que un agente no
// puede hacer en este escritorio. Aquí fuera se monta en un banco de pruebas
// con dos líneas, se le dispara el evento y se mira si llama a `onAbrir`.
//
// Es el mismo patrón de `AvisoCuota` y `Vigia`: montado siempre, no pinta nada,
// escucha y avisa.
//
// ── LA MITAD QUE EVITA QUE ESTO SEA UN CASTIGO ────────────────────────────
//
// Encontrar `http://localhost:3000` en una terminal NO significa que ahí haya
// un servidor: un agente escribe esa dirección en sus respuestas todo el rato.
// Por eso entre el aviso y la apertura hay una pregunta, y la contesta el
// sistema operativo: ¿contesta ese puerto? Si no contesta, no se abre nada, y
// la prosa se cae sola sin tener que adivinar cuál era prosa.

interface Props {
  /** Si está apagado, no se escucha nada: ni el evento, ni el puerto. */
  activo: boolean;
  /**
   * Abrir esa dirección. Quien lo reciba NO debe cambiar de vista: esto pasa
   * sin que lo hayas pedido, y sacarte del lienzo porque un servidor acaba de
   * arrancar es peor que el paso que ahorra.
   */
  onAbrir: (url: string) => void;
  /**
   * Cómo se pregunta si un puerto está vivo. Solo se pasa en las pruebas; en la
   * app va por Rust, que prueba IPv4 e IPv6 con un plazo de 250 ms.
   */
  comprobar?: (puerto: number) => Promise<boolean>;
}

export default function WebAuto({ activo, onAbrir, comprobar }: Props) {
  useEffect(() => {
    if (!activo) return;
    const preguntar = comprobar ?? puertoEscucha;
    let vivo = true;
    const alAnunciar = (e: Event) => {
      const d = (e as CustomEvent<WebAvisada>).detail;
      if (!d?.puerto || !d.url) return;
      void preguntar(d.puerto)
        .then((responde) => {
          // `vivo` y no una comprobación suelta: la pregunta tarda hasta un
          // cuarto de segundo, y en ese hueco puedes haber apagado el ajuste o
          // cerrado la vista. Abrir después de eso sería desobedecer con
          // retraso.
          if (vivo && responde) onAbrir(d.url);
        })
        .catch(() => {});
    };
    window.addEventListener(WEB_EVENTO, alAnunciar);
    return () => {
      vivo = false;
      window.removeEventListener(WEB_EVENTO, alAnunciar);
    };
  }, [activo, onAbrir, comprobar]);

  return null;
}
