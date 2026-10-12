import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES } from "./Adeo";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS } from "./guion";
import { useDecir, useMedidas } from "./idioma";
import { Etiqueta } from "./Rotulo";
import { LLEGA, parte } from "./tiempos";

/** Lo que hace mientras se le presenta: saluda dos veces. */
const SALUDO = [...REACCIONES.hola, ...REACCIONES.hola];

/**
 * Adeo, en grande: saluda, y pasa por sus cuatro estados de siempre.
 *
 * La escena se parte en cinco trozos iguales, uno por frase de la voz («Y este
 * es Adeo», y sus cuatro estados). Cada estado empieza su guion desde cero,
 * así que se ve su entrada: el susto cuando alguien le espera, los tres
 * saltitos cuando un agente termina.
 */
export function EscenaAdeo({ entra, largo, frases }: { entra: number; largo: number; frases?: number[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, franja, pegado } = useMedidas();
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

  const titulo = spring({ frame: f - LLEGA.titulo, fps, config: { damping: 200, mass: 0.6 } });
  const frase = spring({ frame: f - donde(ahora), fps, config: { damping: 200, mass: 0.45 } });
  const respira = 1 + Math.sin((frame / fps) * Math.PI) * 0.04;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          height: `${(1 - franja) * 100}%`,
          boxSizing: "border-box",
          paddingBottom: pegado ? 36 * u : 0,
          alignItems: "center",
          justifyContent: pegado ? "flex-end" : "center",
          gap: 36 * u,
        }}
      >
        <div style={{ position: "relative" }}>
          {/* El halo cuelga de Adeo y no de la escena: así le sigue en la
              vertical, donde no está en el centro de su mitad. */}
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
            {estados.map(
              (e, i) => i === cual && <Adeo key={e.animo} animo={e.animo} alto={392 * u} desde={empieza(i)} semilla={i + 3} />,
            )}
          </div>
        </div>
        {/* Por dónde va: cuatro cuadraditos, y el de ahora estirado. */}
        <div style={{ position: "relative", display: "flex", gap: 10 * u }}>
          {estados.map((e, i) => (
            <span
              key={e.animo}
              style={{
                width: (i === cual ? 40 : 12) * u,
                height: 12 * u,
                borderRadius: 3 * u,
                backgroundColor: i === cual ? COLOR.acento : COLOR.bordeFuerte,
              }}
            />
          ))}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            width: "100%",
            height: `${franja * 100}%`,
            boxSizing: "border-box",
            padding: `${pegado ? 36 * u : 0}px 5% 0`,
            display: "flex",
            flexDirection: "column",
            justifyContent: pegado ? "flex-start" : "center",
            alignItems: "center",
            gap: 14 * u,
            textAlign: "center",
          }}
        >
          <Etiqueta texto={decir(TEXTOS.adeo.nombre)} entra={entra + LLEGA.titulo - 5} />
          <div
            style={{
              fontFamily: FUENTE.texto,
              fontSize: 52 * u,
              lineHeight: 1.12,
              fontWeight: 750,
              letterSpacing: "-0.02em",
              color: COLOR.texto,
              opacity: titulo,
              transform: `translateY(${interpolate(titulo, [0, 1], [22, 0]) * u}px)`,
            }}
          >
            {decir(TEXTOS.adeo.titulo)}
          </div>
          <div
            style={{
              marginTop: 4 * u,
              fontFamily: FUENTE.texto,
              fontSize: 32 * u,
              fontWeight: 500,
              color: COLOR.marcaClaro,
              opacity: frase,
              transform: `translateY(${interpolate(frase, [0, 1], [16, 0]) * u}px)`,
            }}
          >
            {decir(cual < 0 ? TEXTOS.adeo.saludo : estados[cual].frase)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
