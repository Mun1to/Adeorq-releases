import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { useMemo } from "react";
import { AbsoluteFill, Easing, useVideoConfig } from "remotion";
import { FPS } from "./casa";
import { Problema } from "./escenas/1-Problema";
import { Nombre } from "./escenas/2-Nombre";
import { Producto } from "./escenas/3-Producto";
import { EscenaAdeo } from "./escenas/4-Adeo";
import { Cierre } from "./escenas/5-Cierre";
import { Fondo } from "./Fondo";
import type { Idioma } from "./guion";
import { EnIdioma } from "./idioma";
import { Sonido } from "./Sonido";
import { PASO, totalDe, tramos, type Tramo, type Voces } from "./tiempos";
import { pasoEntre } from "./transiciones";

export type PropsPromo = {
  idioma: Idioma;
  /** La voz grabada de este idioma, si la hay. No se escribe a mano: la pone
      `calculateMetadata` en `Root.tsx`, leyendo `public/voz/<idioma>/voz.json`. */
  voz?: Voces;
};

const SIN_VOZ: Voces = {};

/** Cuántos frames dura la pieza. Sale de sumar el guion, así que añadir o
    quitar un tramo cambia la duración sin tocar nada más. */
export function duracionTotal({ voz }: PropsPromo) {
  return totalDe(tramos(FPS, voz));
}

/** El paso arranca despacio, corre y frena: con velocidad constante las dos
    escenas se cruzan como dos diapositivas. */
const RITMO_DEL_PASO = linearTiming({ durationInFrames: PASO, easing: Easing.inOut(Easing.cubic) });

/** Cada tramo del guion, con la escena que lo pinta. Van en `escenas/`, con
    el número de su sitio en la pieza. */
function Escena({ tramo }: { tramo: Tramo }) {
  const e = tramo.escena;
  if (e.tipo === "texto") return <Problema escena={e} entra={tramo.entra} largo={tramo.largo} frases={tramo.frases} />;
  if (e.tipo === "nombre") return <Nombre largo={tramo.largo} />;
  if (e.tipo === "pantalla") return <Producto escena={e} entra={tramo.entra} largo={tramo.largo} />;
  if (e.tipo === "adeo") return <EscenaAdeo entra={tramo.entra} largo={tramo.largo} frases={tramo.frases} />;
  return <Cierre entra={tramo.entra} />;
}

export function Promo({ idioma, voz }: PropsPromo) {
  const { fps } = useVideoConfig();
  const ts = useMemo(() => tramos(fps, voz), [fps, voz]);

  return (
    <EnIdioma value={idioma}>
      <AbsoluteFill>
        <Fondo />
        <TransitionSeries>
          {ts.flatMap((t, i) => {
            const escena = (
              <TransitionSeries.Sequence key={t.escena.id} durationInFrames={t.dura}>
                {/* Una sola raíz por escena, y con su propio fondo. Las dos cosas las
                    piden los pasos con sombreador: dibujan en su lienzo SOLO el primer
                    hijo, y dan por hecho que la escena es opaca: por donde sea
                    transparente se ve, debajo, la escena sin tocar, y los textos salen
                    dobles. Los de máscara también la quieren opaca: lo que asoma por
                    su hueco tiene que tapar lo que había. */}
                <AbsoluteFill>
                  <Fondo desfase={t.desde} />
                  <Escena tramo={t} />
                </AbsoluteFill>
              </TransitionSeries.Sequence>
            );
            if (i === 0) return [escena];
            return [
              <TransitionSeries.Transition
                key={`paso-${t.escena.id}`}
                presentation={pasoEntre(ts[i - 1].escena, t.escena)}
                timing={RITMO_DEL_PASO}
              />,
              escena,
            ];
          })}
        </TransitionSeries>
        <Sonido tramos={ts} voz={voz ?? SIN_VOZ} />
      </AbsoluteFill>
    </EnIdioma>
  );
}
