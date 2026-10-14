import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo } from "../Adeo";
import { COLOR, FUENTE } from "../casa";
import { TEXTOS, WEB } from "../guion";
import { useDecir, useMedidas } from "../idioma";
import { Palabras } from "../Palabras";
import { CIERRE } from "../tiempos";

/**
 * La última pantalla: una sola cosa que hacer, y dónde.
 *
 * De arriba abajo: Adeo celebrando, «Descárgalo gratis», `adeorq.com`, que es
 * lo único en color y lo que tiene que quedar en la retina, y una línea con
 * para qué sistemas. Una versión anterior apilaba seis cosas (el logotipo Y
 * Adeo, la dirección dentro de una caja con Adeo subido encima, y dos líneas
 * pequeñas) y Munir la encontró confusa «sin saber por qué» (2026-10-12): el
 * ojo no sabía a cuál ir. Adeo ya ES el logotipo con ojo, así que arriba va él
 * solo.
 *
 * No se funde a negro al acabar: el último fotograma es el que se queda de
 * miniatura cuando el vídeo se para, y tiene que seguir diciendo `adeorq.com`.
 */
export function Cierre({ entra }: { entra: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const decir = useDecir();
  const f = frame - entra;

  const salta = spring({ frame: f - 2, fps, config: { damping: 11, mass: 0.55 } });
  const web = spring({ frame: f - CIERRE.web, fps, config: { damping: 14, mass: 0.6 } });
  const linea = spring({ frame: f - CIERRE.linea, fps, config: { damping: 200, mass: 0.7 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 * u, padding: "0 6%" }}>
      <div
        style={{
          transform: `scale(${salta})`,
          transformOrigin: "50% 100%",
          filter: `drop-shadow(0 0 ${46 * u}px rgba(72,194,255,0.4))`,
        }}
      >
        <Adeo animo="lista" alto={196 * u} desde={entra + 6} semilla={9} />
      </div>

      <Palabras
        texto={decir(TEXTOS.cierre.titulo)}
        entra={entra + CIERRE.titulo}
        cada={CIERRE.cada}
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 100 * u,
          lineHeight: 1.04,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: COLOR.texto,
          textAlign: "center",
        }}
      />

      <div
        style={{
          // Con la letra de los títulos: en la de terminal el punto ocupa una
          // casilla entera y se leía «adeorq . com».
          fontFamily: FUENTE.texto,
          fontSize: 132 * u,
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: COLOR.marcaClaro,
          textShadow: `0 0 ${50 * u}px rgba(72,194,255,0.45)`,
          opacity: Math.min(1, web * 1.6),
          transform: `scale(${interpolate(web, [0, 1], [0.86, 1])})`,
        }}
      >
        {WEB}
      </div>

      <div
        style={{
          marginTop: 8 * u,
          fontFamily: FUENTE.texto,
          fontSize: 38 * u,
          fontWeight: 600,
          color: COLOR.texto,
          textAlign: "center",
          opacity: linea * 0.92,
          transform: `translateY(${interpolate(linea, [0, 1], [12, 0]) * u}px)`,
        }}
      >
        {decir(TEXTOS.cierre.linea)}
      </div>
    </AbsoluteFill>
  );
}
