import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { Marca } from "./Marca";
import { CIERRE, LEMA, TITULO, WEB } from "./guion";

/**
 * La primera y la última pantalla. Es la misma pieza con dos textos, a
 * propósito: cerrar como se abrió es lo que hace que un vídeo corto se
 * recuerde como una unidad y no como una lista de capturas.
 */
export function Portada({ duraEnFrames, cierre = false }: { duraEnFrames: number; cierre?: boolean }) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const marca = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });
  const letra = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.7 } });
  const linea = spring({ frame: frame - 16, fps, config: { damping: 200, mass: 0.7 } });
  const sale = interpolate(frame, [duraEnFrames - 12, duraEnFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: height * 0.03,
        opacity: sale,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(marca, [0, 1], [0.82, 1])})`,
          opacity: marca,
          // La proa levanta un halo suyo, del color de la marca: es lo que la
          // separa del fondo sin ponerle una caja.
          filter: `drop-shadow(0 0 ${height * 0.05}px rgba(72,194,255,0.45))`,
        }}
      >
        <Marca tam={height * 0.17} />
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: height * 0.095,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: COLOR.texto,
          opacity: letra,
          transform: `translateY(${interpolate(letra, [0, 1], [16, 0])}px)`,
        }}
      >
        {cierre ? CIERRE : TITULO}
      </div>

      <div
        style={{
          fontFamily: cierre ? FUENTE.mono : FUENTE.texto,
          fontSize: height * (cierre ? 0.032 : 0.036),
          fontWeight: 500,
          color: cierre ? COLOR.acento : COLOR.apagado,
          opacity: linea,
          transform: `translateY(${interpolate(linea, [0, 1], [14, 0])}px)`,
        }}
      >
        {cierre ? WEB : LEMA}
      </div>

      {cierre && (
        <div
          style={{
            marginTop: height * 0.012,
            fontFamily: FUENTE.texto,
            fontSize: height * 0.022,
            color: COLOR.apagado,
            opacity: linea * 0.85,
          }}
        >
          {/* Windows y Linux, que es lo que hay hoy. Si algún día sale el de
              Mac, esta línea es la que hay que tocar. */}
          Windows y Linux · funciona con tu propia cuenta
        </div>
      )}
    </AbsoluteFill>
  );
}
