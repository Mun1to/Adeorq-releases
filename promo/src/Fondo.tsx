import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLOR, FPS } from "./casa";

/**
 * El suelo de la pieza.
 *
 * Adeorq es cristal sobre la foto del escritorio, y eso no se puede copiar en
 * un vídeo (cada uno tiene su fondo). Lo que sí se copia es lo que ESE cristal
 * produce: un azul profundo con luz que entra por arriba, no un gris plano.
 * Se hace con dos halos muy abiertos y una viñeta, y se mueven despacio para
 * que el fondo no se vea congelado detrás de un texto quieto.
 */
export function Fondo() {
  const frame = useCurrentFrame();
  /** Una vuelta cada 40 segundos: se nota que está vivo y no se ve moverse. */
  const t = (frame / (FPS * 40)) * Math.PI * 2;
  const x1 = 30 + Math.cos(t) * 6;
  const y1 = 12 + Math.sin(t) * 5;
  const x2 = 78 + Math.cos(t + 2.2) * 5;
  const y2 = 82 + Math.sin(t + 2.2) * 4;

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.fondo }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${x1}% ${y1}%, rgba(77,159,255,0.20), transparent 70%),
                       radial-gradient(55% 50% at ${x2}% ${y2}%, rgba(47,157,243,0.13), transparent 72%)`,
        }}
      />
      {/* La viñeta cierra el encuadre y de paso hace que el texto blanco de las
          esquinas no compita con el halo. */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(75% 75% at 50% 50%, transparent 45%, rgba(3,5,10,0.72) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}
