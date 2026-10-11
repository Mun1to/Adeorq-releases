// Qué se ve mientras algo tarda: una sola regla para toda la app.
//
// Hasta el 2026-10-11 cada pantalla hacía lo suyo. Unas escribían «Leyendo…»
// en el instante de pedir algo que tardaba ochenta milisegundos, y el texto
// parpadeaba: salía y se iba antes de poder leerlo. Otras no decían nada nunca,
// y si la lectura tardaba tres segundos parecía que no habías pulsado. Munir lo
// probó con tres botones en la página de la guía de estilo y dijo que sí a esto:
//
//   menos de una décima de segundo   no se enseña nada;
//   hasta un segundo                 lo que había se queda apagado, sin más;
//   a partir de un segundo           sale la rueda, con su texto.
//
// Lo que NO entra en la regla: lo que tarda siempre y lo sabes al pulsar (el
// conserje pensando, con su mascota) y lo que una terminal hace por dentro.
//
// Quien pinta la rueda es `components/Espera.tsx`. Aquí está la cuenta, que se
// prueba sin ventana: `pnpm bancos espera`.

import { useEffect, useState } from "react";

/** Menos que esto es un suspiro: enseñar algo sería un parpadeo. */
export const SUSPIRO_MS = 100;
/** A partir de aquí ya se nota que tarda, y hay que decirlo. */
export const RUEDA_MS = 1000;

/** «» es nada. */
export type FaseDeEspera = "" | "atenuado" | "rueda";

/** En qué fase está algo que lleva `ms` esperando. */
export function faseDe(ms: number): FaseDeEspera {
  return ms < SUSPIRO_MS ? "" : ms < RUEDA_MS ? "atenuado" : "rueda";
}

/**
 * La fase de una espera que está en marcha mientras `activo` sea verdad.
 *
 * Al dejar de estarlo vuelve a «» en ese mismo pintado, sin esperar a ningún
 * reloj: lo que ya llegó no puede seguir un fotograma más con la rueda puesta.
 */
export function useEspera(activo: boolean): FaseDeEspera {
  const [fase, setFase] = useState<FaseDeEspera>("");
  useEffect(() => {
    if (!activo) {
      setFase("");
      return;
    }
    const apagar = window.setTimeout(() => setFase("atenuado"), SUSPIRO_MS);
    const rueda = window.setTimeout(() => setFase("rueda"), RUEDA_MS);
    return () => {
      window.clearTimeout(apagar);
      window.clearTimeout(rueda);
    };
  }, [activo]);
  return activo ? fase : "";
}
