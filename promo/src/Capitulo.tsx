import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import type { EscenaCapitulo } from "./guion";
import { useDecir, useMedidas } from "./idioma";
import { Dato } from "./Rotulo";
import { CAPITULO } from "./tiempos";

/**
 * El cartel que abre un capítulo: su número, su nombre y las pantallas que
 * trae. Dura un compás.
 *
 * Es lo que le da estructura a la pieza: sin él son diez pantallas seguidas y
 * a la quinta ya no se sabe por qué se está viendo esa. Con él, cada pantalla
 * contesta a la pregunta de su capítulo.
 */
export function Capitulo({
  escena,
  pantallas,
  deCuantos,
  entra,
}: {
  escena: EscenaCapitulo;
  /** Los nombres de las pantallas de este capítulo, en el corte que se esté
      pintando: en la media no salen las opcionales. */
  pantallas: string[];
  deCuantos: number;
  entra: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;
  const s = spring({ frame: f - CAPITULO.titulo, fps, config: { damping: 15, mass: 0.6 } });
  const raya = spring({ frame: f - CAPITULO.titulo - 3, fps, config: { damping: 200, mass: 0.7 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26 * u, padding: "0 6%", textAlign: "center" }}>
      {/* El número, enorme y casi transparente, detrás de todo. */}
      <div
        style={{
          position: "absolute",
          fontFamily: FUENTE.texto,
          fontSize: (vertical ? 900 : 760) * u,
          fontWeight: 800,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `${4 * u}px rgba(72,194,255,0.24)`,
          transform: `scale(${interpolate(s, [0, 1], [1.25, 1])})`,
          opacity: Math.min(1, s * 1.4),
        }}
      >
        {escena.numero}
      </div>

      {/* Por cuál va de los tres. */}
      <div style={{ position: "relative", display: "flex", gap: 10 * u, alignItems: "center" }}>
        {Array.from({ length: deCuantos }, (_, i) => (
          <span
            key={i}
            style={{
              width: (i === escena.numero - 1 ? 64 * raya + 14 : 14) * u,
              height: 12 * u,
              borderRadius: 3 * u,
              backgroundColor: i < escena.numero ? COLOR.acento : COLOR.bordeFuerte,
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "relative",
          fontFamily: FUENTE.texto,
          fontSize: (vertical ? 132 : 168) * u,
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: COLOR.texto,
          opacity: Math.min(1, s * 1.5),
          transform: `translateY(${interpolate(s, [0, 1], [40, 0]) * u}px)`,
        }}
      >
        <span style={{ color: COLOR.marcaClaro }}>{escena.numero}</span>
        <span style={{ color: COLOR.apagado, fontWeight: 500, margin: `0 ${22 * u}px` }}>·</span>
        {decir(escena.titulo)}
      </div>

      <div style={{ position: "relative", display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: 40 * u, rowGap: 14 * u }}>
        {pantallas.map((p, i) => (
          <Dato key={p} texto={p} entra={entra + CAPITULO.pantallas + i * CAPITULO.entrePantallas} />
        ))}
      </div>
    </AbsoluteFill>
  );
}
