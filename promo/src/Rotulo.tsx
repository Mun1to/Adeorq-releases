import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { useMedidas } from "./idioma";

/* Las dos piezas de texto que comparten las escenas que no son una captura (el
   cartel de un capítulo, «qué es» y la de Adeo). El título y las frases de una
   pantalla van en `Pantalla.tsx`, pegados a lo que señalan. */

/** La línea de arriba de un rótulo: «ADEO». Con la letra de las terminales. */
export function Etiqueta({ texto, entra }: { texto: string; entra: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const s = spring({ frame: frame - entra, fps, config: { damping: 200, mass: 0.5 } });
  return (
    <div
      style={{
        fontFamily: FUENTE.mono,
        fontSize: 19 * u,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: COLOR.acento,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [10, 0]) * u}px)`,
      }}
    >
      {texto}
    </div>
  );
}

/**
 * Un dato: el cuadradito de sesión de la app y, a su lado, el texto. Entra con
 * un rebote corto, que es lo que acompaña el «pop» de `Sonido.tsx`.
 *
 * SIN caja y con la letra de los títulos, en negrita. Era una pastilla con
 * borde y letra de terminal a 24, y Munir pidió quitar esas «cárceles» y que
 * el texto pequeño se notara más (2026-10-12).
 */
export function Dato({ texto, entra }: { texto: string; entra: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const s = spring({ frame: frame - entra, fps, config: { damping: 13, mass: 0.5 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12 * u,
        fontFamily: FUENTE.texto,
        fontSize: 34 * u,
        lineHeight: 1.1,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        color: COLOR.texto,
        whiteSpace: "nowrap",
        opacity: Math.min(1, s * 2),
        transform: `translateY(${interpolate(s, [0, 1], [16, 0]) * u}px) scale(${interpolate(s, [0, 1], [0.88, 1])})`,
      }}
    >
      <span style={{ width: 12 * u, height: 12 * u, borderRadius: 3 * u, backgroundColor: COLOR.marcaClaro, flexShrink: 0 }} />
      {texto}
    </div>
  );
}
