import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLOR, FUENTE } from "../casa";
import type { EscenaTexto } from "../guion";
import { useDecir, useMedidas } from "../idioma";
import { Palabras } from "../Palabras";
import { TEXTO, parte } from "../tiempos";

/**
 * El problema y el giro: solo texto, en el centro y en primera persona.
 *
 * Ni una captura ni una ventana dibujada. El corte anterior abría con siete
 * terminales de mentira amontonándose, y de su vídeo de referencia Munir se
 * quedó justo con lo contrario: «el arranque solo con texto y en primera
 * persona» (2026-10-13). Cada frase releva a la anterior en el mismo sitio, y
 * la última (el giro) no se va: se la lleva el paso al nombre.
 */
export function Problema({ escena, entra, largo, frases }: { escena: EscenaTexto; entra: number; largo: number; frases?: number[] }) {
  const frame = useCurrentFrame();
  const { u } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;
  const n = escena.lineas.length;
  const donde = (i: number) => parte({ largo, frases }, n, i);

  return (
    <AbsoluteFill>
      {escena.lineas.map((linea, i) => {
        const desde = donde(i);
        const hasta = donde(i + 1);
        const ultima = i === n - 1;
        if (f < desde || (!ultima && f >= hasta)) return null;
        const fuera = ultima ? 0 : interpolate(f, [hasta - TEXTO.sale, hasta], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <AbsoluteFill
            key={i}
            style={{
              alignItems: "center",
              justifyContent: "center",
              padding: "0 9%",
              opacity: 1 - fuera,
              transform: `translateY(${-fuera * 34 * u}px)`,
              filter: fuera > 0.02 ? `blur(${fuera * 8 * u}px)` : undefined,
            }}
          >
            <Palabras
              texto={decir(linea)}
              entra={entra + desde + TEXTO.entra}
              cada={TEXTO.cada}
              style={{
                fontFamily: FUENTE.texto,
                fontSize: 108 * u,
                lineHeight: 1.12,
                fontWeight: 800,
                letterSpacing: "-0.035em",
                color: COLOR.texto,
                textAlign: "center",
                textWrap: "balance",
              }}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
}
