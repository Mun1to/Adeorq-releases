import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES } from "../Adeo";
import { COLOR, FUENTE } from "../casa";
import { TEXTOS } from "../guion";
import { useDecir, useMedidas } from "../idioma";
import { Palabras } from "../Palabras";
import { ADEO, parte } from "../tiempos";

/** Lo que hace mientras se le presenta: saluda dos veces. */
const SALUDO = [...REACCIONES.hola, ...REACCIONES.hola];

/**
 * Adeo, en grande y en el centro: saluda, y pasa por tres de sus estados.
 *
 * La escena se parte en trozos iguales, uno por frase («Y este es Adeo», y sus
 * estados). Cada estado empieza su guion desde cero, así que se ve su entrada:
 * el susto cuando alguien le espera, los tres saltitos cuando un agente
 * termina. Debajo de él va UNA frase cada vez, grande y palabra a palabra: el
 * corte anterior las ponía en una franja al pie con una etiqueta en letra de
 * terminal encima, y lo de abajo del todo ya lo había devuelto Munir.
 */
export function EscenaAdeo({ entra, largo, frases }: { entra: number; largo: number; frases?: number[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const decir = useDecir();
  const estados = TEXTOS.adeo.estados;
  // Una parte más que estados: en la primera solo saluda.
  const n = estados.length + 1;
  const f = frame - entra;
  const donde = (i: number) => parte({ largo, frases }, n, i);
  let ahora = 0;
  while (ahora < n - 1 && f >= donde(ahora + 1)) ahora++;
  const cual = ahora - 1;
  const empieza = (i: number) => entra + donde(i + 1);

  const respira = 1 + Math.sin((frame / fps) * Math.PI) * 0.04;
  // La frase de ahora se va justo antes de que llegue la siguiente; la última
  // se queda.
  const fuera = ahora < n - 1 ? interpolate(f, [donde(ahora + 1) - 6, donde(ahora + 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 56 * u }}>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 760 * u,
            height: 760 * u,
            marginLeft: -380 * u,
            marginTop: -380 * u,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(72,194,255,0.22), transparent)",
            transform: `scale(${respira})`,
          }}
        />
        <div style={{ position: "relative", filter: `drop-shadow(0 ${16 * u}px ${30 * u}px rgba(0,0,0,0.5))` }}>
          {cual < 0 && <Adeo animo="quieta" alto={392 * u} antes={SALUDO} desde={entra} />}
          {estados.map((e, i) => i === cual && <Adeo key={e.animo} animo={e.animo} alto={392 * u} desde={empieza(i)} semilla={i + 3} />)}
        </div>
      </div>

      <div style={{ position: "relative", height: 98 * u, opacity: 1 - fuera, transform: `translateY(${-fuera * 18 * u}px)` }}>
        <Palabras
          key={ahora}
          texto={decir(cual < 0 ? TEXTOS.adeo.saludo : estados[cual].frase)}
          entra={entra + donde(ahora) + ADEO.entra}
          cada={ADEO.cada}
          style={{
            fontFamily: FUENTE.texto,
            fontSize: 90 * u,
            lineHeight: 1.1,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: COLOR.texto,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
