import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { useMemo } from "react";
import { AbsoluteFill, Easing, useVideoConfig } from "remotion";
import { Capitulo } from "./Capitulo";
import { FPS } from "./casa";
import { Cierre } from "./Cierre";
import { EscenaAdeo } from "./EscenaAdeo";
import { Fondo } from "./Fondo";
import { Gancho } from "./Gancho";
import { TEXTOS, type Corte, type Idioma } from "./guion";
import { EnIdioma, useDecir } from "./idioma";
import { Pantalla } from "./Pantalla";
import { Portada } from "./Portada";
import { QueEs } from "./QueEs";
import { Sonido } from "./Sonido";
import { PASO, preguntasDelGancho, totalDe, tramos, type Tramo, type Voces } from "./tiempos";
import { pasoEntre } from "./transiciones";

export type PropsPromo = {
  idioma: Idioma;
  /** Cuál de los tres cortes del guion: la entera, la media (sin las escenas
      opcionales) o la de bolsillo. */
  corte: Corte;
  /** La voz grabada de este idioma, si la hay. No se escribe a mano: la pone
      `calculateMetadata` en `Root.tsx`, leyendo `public/voz/<idioma>/voz.json`. */
  voz?: Voces;
};

const SIN_VOZ: Voces = {};

/** Cuántos frames dura la pieza. Sale de sumar el guion, así que añadir o
    quitar una escena cambia la duración sin tocar nada más. */
export function duracionTotal({ corte, voz }: PropsPromo) {
  return totalDe(tramos(corte, FPS, voz));
}

/** El paso arranca despacio, corre y frena: con velocidad constante las dos
    escenas se cruzan como dos diapositivas. */
const RITMO_DEL_PASO = linearTiming({ durationInFrames: PASO, easing: Easing.inOut(Easing.cubic) });

/** Qué pantallas trae el capítulo que abre el tramo `i`: las que hay hasta el
    siguiente cartel o hasta el cierre, en el corte que se esté pintando. */
function pantallasDe(ts: Tramo[], i: number, decir: ReturnType<typeof useDecir>) {
  const nombres: string[] = [];
  for (const t of ts.slice(i + 1)) {
    const e = t.escena;
    if (e.tipo === "pantalla") nombres.push(decir(e.nombre));
    else if (e.tipo === "adeo") nombres.push(decir(TEXTOS.adeo.nombre));
    else break;
  }
  return nombres;
}

function Escena({ ts, i }: { ts: Tramo[]; i: number }) {
  const decir = useDecir();
  const tramo = ts[i];
  const e = tramo.escena;
  if (e.tipo === "pantalla") return <Pantalla escena={e} numero={tramo.numero} entra={tramo.entra} largo={tramo.largo} />;
  if (e.tipo === "capitulo") {
    const deCuantos = ts.filter((t) => t.escena.tipo === "capitulo").length;
    return <Capitulo escena={e} pantallas={pantallasDe(ts, i, decir)} deCuantos={deCuantos} entra={tramo.entra} />;
  }
  if (e.tipo === "gancho") return <Gancho entra={tramo.entra} preguntas={preguntasDelGancho(tramo)} />;
  if (e.tipo === "portada") return <Portada largo={tramo.largo} />;
  if (e.tipo === "que-es") return <QueEs entra={tramo.entra} />;
  if (e.tipo === "adeo") return <EscenaAdeo entra={tramo.entra} largo={tramo.largo} frases={tramo.frases} />;
  return <Cierre entra={tramo.entra} />;
}

export function Promo({ idioma, corte, voz }: PropsPromo) {
  const { fps } = useVideoConfig();
  const ts = useMemo(() => tramos(corte, fps, voz), [fps, corte, voz]);

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
                  <Escena ts={ts} i={i} />
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
        <Sonido tramos={ts} voz={corte === "corta" ? SIN_VOZ : (voz ?? SIN_VOZ)} />
      </AbsoluteFill>
    </EnIdioma>
  );
}
