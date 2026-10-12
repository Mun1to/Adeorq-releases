import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { Fondo } from "./Fondo";
import { ESCENAS, type EscenaPantalla } from "./guion";
import { EnIdioma } from "./idioma";
import { Pantalla } from "./Pantalla";
import { Rotulo } from "./Rotulo";
import { PASOS, type NombreDePaso, type Paso } from "./transiciones";

/**
 * El muestrario de pasos: todos los de `transiciones.tsx`, uno detrás de otro,
 * entre dos pantallas de verdad y con su número arriba.
 *
 * Existe porque un paso no se puede juzgar leyendo su nombre. Se renderiza
 * (`pnpm muestra`), se mira, y se dice «el 3 sí, el 7 no».
 */
const NOMBRES = Object.keys(PASOS) as NombreDePaso[];
const QUIETA = 26;
const PASA = 30;
const CADA = QUIETA + PASA;
const DOS = ESCENAS.filter((e): e is EscenaPantalla => e.tipo === "pantalla").slice(0, 2);

export const duracionDeLaMuestra = NOMBRES.length * CADA + QUIETA;

/** Una pantalla ya asentada: se le da un corte muy anterior para que no esté
    entrando mientras se la mira pasar. */
function Quieta({ escena }: { escena: EscenaPantalla }) {
  return (
    <AbsoluteFill>
      <Fondo />
      <Pantalla escena={escena} entra={-200} largo={600} />
      <Rotulo etiqueta={escena.nombre.es} titulo={escena.titulo.es} datos={escena.datos.map((d) => d.es)} entra={-200} largo={600} />
    </AbsoluteFill>
  );
}

export function Muestra() {
  const frame = useCurrentFrame();
  const cual = Math.max(0, Math.min(NOMBRES.length - 1, Math.floor((frame - QUIETA / 2) / CADA)));

  return (
    <EnIdioma value="es">
      <AbsoluteFill>
        <Fondo />
        <TransitionSeries>
          {NOMBRES.flatMap((nombre, i) => [
            <TransitionSeries.Sequence key={`a-${nombre}`} durationInFrames={i === 0 ? QUIETA + PASA : QUIETA + 2 * PASA}>
              <Quieta escena={DOS[i % 2]} />
            </TransitionSeries.Sequence>,
            <TransitionSeries.Transition
              key={`p-${nombre}`}
              presentation={PASOS[nombre] as Paso}
              timing={linearTiming({ durationInFrames: PASA, easing: Easing.inOut(Easing.cubic) })}
            />,
          ])}
          <TransitionSeries.Sequence durationInFrames={QUIETA + PASA}>
            <Quieta escena={DOS[NOMBRES.length % 2]} />
          </TransitionSeries.Sequence>
        </TransitionSeries>
        <div
          style={{
            position: "absolute",
            left: 44,
            top: 36,
            padding: "10px 22px",
            borderRadius: 12,
            backgroundColor: "rgba(7,11,19,0.82)",
            border: `1px solid ${COLOR.bordeFuerte}`,
            fontFamily: FUENTE.mono,
            fontSize: 34,
            fontWeight: 700,
            color: COLOR.texto,
          }}
        >
          <span style={{ color: COLOR.marcaClaro }}>{cual + 1}</span> · {NOMBRES[cual]}
        </div>
      </AbsoluteFill>
    </EnIdioma>
  );
}
