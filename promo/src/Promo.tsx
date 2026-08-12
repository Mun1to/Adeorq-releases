import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { Fondo } from "./Fondo";
import { Pantalla } from "./Pantalla";
import { Portada } from "./Portada";
import { Rotulo } from "./Rotulo";
import type { Escena } from "./guion";
import { FPS } from "./casa";

/** Las escenas se solapan medio segundo: mientras una se va, la siguiente ya
    está entrando. Sin esto hay un parpadeo negro entre captura y captura. */
const SOLAPE = 0.4;

export type PropsPromo = {
  escenas: Escena[];
  /** Segundos de la apertura y del cierre. La versión corta los recorta: en
      un GIF de README cada segundo pesa megas, y el logo ya está en la web. */
  portada: number;
  despedida: number;
};

/** Cuántos frames dura la pieza. Sale de sumar el guion, así que añadir o
    quitar una escena cambia la duración sin tocar nada más. */
export function duracionTotal({ escenas, portada, despedida }: PropsPromo) {
  const cuerpo = escenas.reduce((s, e) => s + e.dura, 0) - SOLAPE * escenas.length;
  return Math.round((portada + cuerpo + despedida) * FPS);
}

export function Promo({ escenas, portada, despedida }: PropsPromo) {
  const { fps } = useVideoConfig();
  const PORTADA = portada;
  const DESPEDIDA = despedida;
  let cursor = Math.round(PORTADA * fps);

  return (
    <AbsoluteFill>
      <Fondo />

      <Sequence durationInFrames={Math.round((PORTADA + 0.4) * fps)}>
        <Portada duraEnFrames={Math.round((PORTADA + 0.4) * fps)} />
      </Sequence>

      {escenas.map((escena, i) => {
        const dura = Math.round(escena.dura * fps);
        const desde = cursor;
        cursor += dura - Math.round(SOLAPE * fps);
        return (
          <Sequence key={escena.imagen + i} from={desde} durationInFrames={dura}>
            <Pantalla escena={escena} duraEnFrames={dura} />
            <Rotulo titulo={escena.titulo} pie={escena.pie} duraEnFrames={dura} />
          </Sequence>
        );
      })}

      <Sequence from={cursor} durationInFrames={Math.round(DESPEDIDA * fps)}>
        <Portada duraEnFrames={Math.round(DESPEDIDA * fps)} cierre />
      </Sequence>
    </AbsoluteFill>
  );
}
