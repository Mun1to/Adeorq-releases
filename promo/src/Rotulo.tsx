import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";

/**
 * La frase de cada escena.
 *
 * Abajo y no encima de la captura: tapando la pantalla se pierde justo lo que
 * el vídeo está enseñando. Va sobre una banda que se funde hacia abajo, que es
 * lo que hace que un texto blanco se lea igual encima de una zona clara que de
 * una oscura sin ponerle una caja alrededor.
 */
export function Rotulo({ titulo, pie, duraEnFrames }: { titulo: string; pie?: string; duraEnFrames: number }) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  // Muelle y no una rampa: el texto es lo único de la pieza que tiene que
  // llamar la atención, y un arranque con inercia se mira.
  const entra = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 0.6 } });
  const sale = interpolate(frame, [duraEnFrames - 10, duraEnFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          width: "100%",
          // La franja de abajo, la que la ventana deja libre. Sin degradado
          // encima de la captura: el texto ya no se solapa con ella, así que
          // esa banda oscura solo servía para ensuciar el borde de la imagen.
          height: "26%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          textAlign: "center",
          opacity: Math.min(entra, sale),
          transform: `translateY(${interpolate(entra, [0, 1], [22, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FUENTE.texto,
            fontSize: height * 0.052,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: COLOR.texto,
            textWrap: "balance",
            padding: "0 8%",
          }}
        >
          {titulo}
        </div>
        {pie && (
          <div
            style={{
              marginTop: height * 0.016,
              fontFamily: FUENTE.texto,
              fontSize: height * 0.026,
              fontWeight: 450,
              color: COLOR.apagado,
              padding: "0 12%",
            }}
          >
            {pie}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}
