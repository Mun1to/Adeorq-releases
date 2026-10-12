import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES, gesto } from "./Adeo";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS, TITULO } from "./guion";
import { useDecir, useMedidas } from "./idioma";
import { Marca } from "./Marca";
import { DESPIERTA } from "./tiempos";

/** Lo que hace Adeo al despertar: saluda dos veces y guiña un ojo. */
const SALUDO = [...REACCIONES.hola, ...REACCIONES.hola, ...gesto("quieta", 6)];

/** Cuándo el logotipo se convierte en Adeo. `Sonido.tsx` pone ahí su «pop». */
export const despierta = (largo: number) => Math.min(DESPIERTA, Math.round(largo * 0.5));

/**
 * La primera pantalla: el logotipo, el nombre y el lema.
 *
 * Y a media escena el logotipo cobra vida. Adeo ES la A de Adeorq con ojo,
 * brazos y piernas, así que no se le presenta al lado de la marca: es la marca
 * la que abre el ojo y saluda. Quien no conozca la app entiende de un golpe de
 * dónde sale el muñeco que va a ver en todas las escenas.
 */
export function Portada({ largo }: { largo: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const decir = useDecir();
  const cambio = despierta(largo);

  const marca = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });
  const letra = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.7 } });
  const linea = spring({ frame: frame - 16, fps, config: { damping: 200, mass: 0.7 } });
  // Con rebote: es un muñeco que salta, no un logotipo que se funde.
  const vivo = spring({ frame: frame - cambio, fps, config: { damping: 11, mass: 0.5 } });
  const yaEsAdeo = Math.min(1, vivo * 2.5);
  const caja = 190 * u;
  // La proa levanta un halo suyo, del color de la marca: es lo que la separa
  // del fondo sin ponerle una caja.
  const halo = `drop-shadow(0 0 ${54 * u}px rgba(72,194,255,0.45))`;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 * u }}>
      <div style={{ position: "relative", width: caja * 1.6, height: caja }}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            opacity: marca * (1 - yaEsAdeo),
            transform: `scale(${interpolate(marca, [0, 1], [0.82, 1]) * (1 - 0.2 * yaEsAdeo)})`,
            filter: halo,
          }}
        >
          <Marca tam={caja} />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            opacity: yaEsAdeo,
            transform: `scale(${interpolate(vivo, [0, 1], [0.6, 1])})`,
            filter: halo,
          }}
        >
          <Adeo animo="quieta" alto={caja} antes={SALUDO} desde={cambio + 6} />
        </AbsoluteFill>
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 104 * u,
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: COLOR.texto,
          opacity: letra,
          transform: `translateY(${interpolate(letra, [0, 1], [16, 0]) * u}px)`,
        }}
      >
        {TITULO}
      </div>

      <div
        style={{
          fontFamily: FUENTE.texto,
          fontSize: 38 * u,
          fontWeight: 500,
          color: COLOR.apagado,
          textAlign: "center",
          textWrap: "balance",
          padding: "0 6%",
          opacity: linea,
          transform: `translateY(${interpolate(linea, [0, 1], [14, 0]) * u}px)`,
        }}
      >
        {decir(TEXTOS.lema)}
      </div>
    </AbsoluteFill>
  );
}
