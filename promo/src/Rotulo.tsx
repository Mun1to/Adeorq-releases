import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, FUENTE } from "./casa";
import { useMedidas } from "./idioma";
import { LLEGA, llegaDato } from "./tiempos";

/** La línea de arriba de un rótulo: «02 · CABINA». Dice en qué pestaña de la
    app estamos, con la letra de las terminales. */
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

/** Un dato: una pastilla con el cuadradito de sesión de la app delante. Entra
    con un rebote corto, que es lo que acompaña el «pop» de `Sonido.tsx`. */
export function Dato({ texto, entra, letra = FUENTE.texto }: { texto: string; entra: number; letra?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const s = spring({ frame: frame - entra, fps, config: { damping: 13, mass: 0.5 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10 * u,
        padding: `${9 * u}px ${16 * u}px`,
        borderRadius: 8 * u,
        border: `1px solid ${COLOR.borde}`,
        backgroundColor: COLOR.cabecera,
        fontFamily: letra,
        fontSize: 24 * u,
        fontWeight: 500,
        color: COLOR.texto,
        whiteSpace: "nowrap",
        opacity: Math.min(1, s * 2),
        transform: `translateY(${interpolate(s, [0, 1], [16, 0]) * u}px) scale(${interpolate(s, [0, 1], [0.88, 1])})`,
      }}
    >
      <span style={{ width: 9 * u, height: 9 * u, borderRadius: 3 * u, backgroundColor: COLOR.acento, flexShrink: 0 }} />
      {texto}
    </div>
  );
}

/**
 * Lo que se lee de cada pantalla: en qué pestaña estamos, la frase y sus datos.
 *
 * Abajo y no encima de la captura: tapando la pantalla se pierde justo lo que
 * el vídeo está enseñando. Los datos llegan de uno en uno, que es lo que da
 * tiempo a leerlos: tres pastillas que aparecen a la vez son un bloque que se
 * salta.
 */
export function Rotulo({
  etiqueta,
  titulo,
  datos,
  entra,
  largo,
}: {
  etiqueta: string;
  titulo: string;
  datos: string[];
  entra: number;
  /** Lo que dura la escena: los datos se reparten por ella. */
  largo: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, franja, pegado } = useMedidas();
  // Muelle y no una rampa: el texto es lo único de la pieza que tiene que
  // llamar la atención, y un arranque con inercia se mira.
  const frase = spring({ frame: frame - entra - LLEGA.titulo, fps, config: { damping: 200, mass: 0.6 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          width: "100%",
          // La franja de abajo, la que la ventana deja libre.
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
        <Etiqueta texto={etiqueta} entra={entra + LLEGA.titulo - 5} />
        <div
          style={{
            fontFamily: FUENTE.texto,
            fontSize: 52 * u,
            lineHeight: 1.12,
            fontWeight: 750,
            letterSpacing: "-0.02em",
            color: COLOR.texto,
            textWrap: "balance",
            opacity: frase,
            transform: `translateY(${interpolate(frase, [0, 1], [22, 0]) * u}px)`,
          }}
        >
          {titulo}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 * u, marginTop: 4 * u }}>
          {datos.map((d, i) => (
            <Dato key={d} texto={d} entra={entra + llegaDato(largo, datos.length, i)} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
