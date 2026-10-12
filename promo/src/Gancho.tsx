import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS } from "./guion";
import { useDecir, useMedidas } from "./idioma";
import { GANCHO } from "./tiempos";

/** Las ventanas sueltas: dónde cae el centro de cada una (en % de la escena),
    cuánto se tuerce y en qué está su agente. Puestas a mano para que se pisen
    unas a otras sin tapar del todo a ninguna: el lío tiene que leerse. */
const VENTANAS = [
  { x: 23, y: 31, giro: -6, estado: "trabaja" },
  { x: 72, y: 26, giro: 5, estado: "espera" },
  { x: 47, y: 54, giro: -2, estado: "hecho" },
  { x: 21, y: 73, giro: 4, estado: "trabaja" },
  { x: 77, y: 71, giro: -5, estado: "pregunta" },
  { x: 53, y: 21, giro: 3, estado: "trabaja" },
  { x: 41, y: 81, giro: -3, estado: "hecho" },
] as const;

/** Los colores de estado son los de la app: ámbar es «terminó», rosa es «te
    espera» y amarillo es «te pregunta». */
const TINTE = { trabaja: COLOR.acento, espera: COLOR.espera, hecho: COLOR.hecho, pregunta: COLOR.pregunta } as const;

/** Lo ancho de cada renglón de mentira, en % de la ventana. */
const RENGLONES = [62, 84, 47, 71, 38];

/**
 * El problema, antes de enseñar nada de Adeorq: varias terminales abiertas a
 * la vez, cada una en su ventana, y nadie sabe en qué está cada una.
 *
 * No lleva ni una captura, a propósito: son ventanas dibujadas, sin nombre de
 * ningún programa. Lo que se cuenta es el lío, no de quién es cada terminal.
 */
export function Gancho({ entra, preguntas }: { entra: number; preguntas: readonly number[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;

  // Cuando llega la primera pregunta, las ventanas se apartan al fondo.
  const alFondo = interpolate(f, [preguntas[0] - 6, preguntas[0] + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ancho = (vertical ? 400 : 470) * u;
  const alto = ancho * 0.62;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - alFondo * 0.62, filter: alFondo > 0.05 ? `blur(${alFondo * 5 * u}px)` : undefined }}>
        {VENTANAS.map((v, i) => {
          const nace = GANCHO.primera + i * GANCHO.entreVentanas;
          const s = spring({ frame: f - nace, fps, config: { damping: 12, mass: 0.6 } });
          // Cada una flota a su aire: el mismo vaivén en todas se lee como un bloque.
          const sube = Math.sin((f + i * 23) / 19) * 7 * u;
          const tinte = TINTE[v.estado];
          const late = v.estado === "trabaja" ? 1 : 0.55 + 0.45 * Math.abs(Math.sin((f + i * 11) / 7));
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${vertical ? 50 + (v.x - 50) * 0.66 : v.x}%`,
                top: `${v.y}%`,
                width: ancho,
                height: alto,
                marginLeft: -ancho / 2,
                marginTop: -alto / 2,
                borderRadius: 12 * u,
                overflow: "hidden",
                border: `1px solid ${COLOR.bordeFuerte}`,
                backgroundColor: COLOR.panel,
                boxShadow: `0 ${26 * u}px ${60 * u}px rgba(0,0,0,0.6)`,
                opacity: Math.min(1, s * 1.6),
                transform: `translateY(${sube}px) rotate(${v.giro}deg) scale(${interpolate(s, [0, 1], [0.72, 1])})`,
              }}
            >
              <div
                style={{
                  height: 38 * u,
                  display: "flex",
                  alignItems: "center",
                  gap: 10 * u,
                  padding: `0 ${14 * u}px`,
                  backgroundColor: COLOR.cabecera,
                  borderBottom: `1px solid ${COLOR.borde}`,
                  fontFamily: FUENTE.mono,
                  fontSize: 16 * u,
                  color: COLOR.apagado,
                }}
              >
                <span style={{ width: 11 * u, height: 11 * u, borderRadius: 3 * u, backgroundColor: tinte, opacity: late }} />
                {decir(TEXTOS.gancho.ventana)} {i + 1}
              </div>
              <div style={{ padding: `${16 * u}px ${16 * u}px`, display: "flex", flexDirection: "column", gap: 13 * u }}>
                {RENGLONES.map((r, k) => {
                  // Las que trabajan van escribiendo; las otras se quedaron a medias.
                  const escrito = v.estado === "trabaja" ? interpolate(f - nace, [10 + k * 16, 26 + k * 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : k < 3 ? 1 : 0;
                  return (
                    <span
                      key={k}
                      style={{
                        height: 9 * u,
                        width: `${((r + i * 9) % 60) + 30}%`,
                        borderRadius: 3 * u,
                        backgroundColor: k === 0 ? tinte : COLOR.apagado,
                        opacity: (k === 0 ? 0.75 : 0.3) * escrito,
                        transform: `scaleX(${escrito})`,
                        transformOrigin: "0 50%",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 22 * u, padding: "0 6%", textAlign: "center" }}>
        {TEXTOS.gancho.preguntas.map((p, k) => {
          const s = spring({ frame: f - preguntas[k], fps, config: { damping: 14, mass: 0.6 } });
          return (
            <div
              key={k}
              style={{
                fontFamily: FUENTE.texto,
                fontSize: (vertical ? 78 : 96) * u,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: k === 0 ? COLOR.texto : COLOR.marcaClaro,
                textWrap: "balance",
                textShadow: `0 ${6 * u}px ${40 * u}px rgba(0,0,0,0.7)`,
                opacity: Math.min(1, s * 1.5),
                transform: `translateY(${interpolate(s, [0, 1], [34, 0]) * u}px) scale(${interpolate(s, [0, 1], [0.94, 1])})`,
              }}
            >
              {decir(p)}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
