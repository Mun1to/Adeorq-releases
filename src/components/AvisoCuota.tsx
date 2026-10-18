import { useEffect, useRef } from "react";
import { type Account } from "../lib/pty";
import { limitesDe, loQueTePara } from "../lib/cuota";
import { anotarCuota } from "../lib/mundo";

// El sondeo de cuota: cada tanto pregunta los límites de cada cuenta de Claude y
// se los deja al router (`anotarCuota`), que necesita ese número para recomendar
// cerebro. No pinta nada.
//
// Hasta el 2026-10-19 era además un aviso: una tarjeta abajo a la izquierda al
// pasar del 85 % de una cuenta, con la salida a otra, y una notificación de
// Windows. Munir: «quita los avisos de uso de abajo a la izquierda, molesta,
// para eso ya tienes la pestaña de uso». Se fueron los dos; pasar a otra cuenta
// sigue en cada terminal (`onRelevar`, que llama a `relevar` en `App.tsx`).
//
// Preguntar NO gasta cuota: `/usage` es un comando local del CLI (ver el
// comentario de usage_limits en Rust). Lo que sí cuesta es un proceso por
// cuenta, y por eso no se pregunta si no hay ninguna terminal de agente
// abierta: sin nadie trabajando no hay nada que decidir.

const MIRAR_CADA_MS = 20 * 60 * 1000;
/** La primera mirada no es en el arranque: ahí la app está montando terminales
    y lo último que hace falta es competir con ellas por el disco. */
const PRIMERA_MIRADA_MS = 45 * 1000;

interface Props {
  /** Las cuentas de Claude, la principal incluida. */
  cuentas: Account[];
  /** Si hay alguna terminal de Claude viva. Sin ninguna no se pregunta nada. */
  hayAgentes: boolean;
}

export default function AvisoCuota({ cuentas, hayAgentes }: Props) {
  // Las cuentas cambian poco y el sondeo dura minutos: por una ref, para que
  // añadir una cuenta no reinicie el reloj a medias.
  const cuentasRef = useRef(cuentas);
  cuentasRef.current = cuentas;

  useEffect(() => {
    if (!hayAgentes) return;
    let stop = false;
    let timer = 0;

    const mirar = async () => {
      for (const acc of cuentasRef.current) {
        if (stop) return;
        try {
          // Por el portero de `lib/cuota.ts`, no directo: preguntarlo lanza un
          // proceso `claude` de cinco segundos, y la lectura se comparte con el
          // panel de uso y con el router.
          const peor = loQueTePara(await limitesDe(acc));
          if (stop) return;
          anotarCuota(acc.id, peor.percent);
        } catch {
          // Sin CLI, sin sesión iniciada o tardando demasiado: esto es un
          // extra, y un extra que falla se calla. La pestaña Cuentas ya enseña
          // el error de verdad cuando él va a mirar.
        }
      }
      if (!stop) timer = window.setTimeout(() => void mirar(), MIRAR_CADA_MS);
    };

    timer = window.setTimeout(() => void mirar(), PRIMERA_MIRADA_MS);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [hayAgentes]);

  return null;
}
