import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES, altoDeAdeo, gesto } from "../Adeo";
import { COLOR, FUENTE } from "../casa";
import { TITULO } from "../guion";
import { useMedidas } from "../idioma";
import { Marca } from "../Marca";
import { despierta } from "../tiempos";

/** Lo que hace Adeo al despertar: saluda dos veces y guiña un ojo. */
const SALUDO = [...REACCIONES.hola, ...REACCIONES.hola, ...gesto("quieta", 6)];

/** Lo que mide cada cosa, en `u`: el logotipo, el aire y la letra del nombre.
    Están fuera porque de ellas sale también dónde cae el ojo de Adeo. */
const CAJA = 190;
const AIRE = 30;
const LETRA = 132;

/** El ojo de Adeo, en píxeles del cuadro: por ahí entra la cámara hacia la
    app (`transiciones.tsx`). Está en el centro de su rejilla, a un tercio de
    su alto (`CUERPO`, en `src/lib/mascota.ts`). */
export function ojoDelNombre(ancho: number, alto: number) {
  const u = Math.min(ancho, alto) / 1080;
  const h = altoDeAdeo(CAJA * u);
  const arriba = alto / 2 - ((CAJA + AIRE + LETRA) * u) / 2 + (CAJA * u - h) / 2;
  return { x: ancho / 2, y: arriba + h * 0.36 };
}

/**
 * El nombre: el logotipo solo, y debajo «Adeorq». Nada más: el lema que
 * llevaba la portada lo acaba de decir la frase anterior («una sola
 * pantalla»).
 *
 * Y a media escena el logotipo cobra vida. Adeo ES la A de Adeorq con ojo,
 * brazos y piernas, así que no se le presenta al lado de la marca: es la marca
 * la que abre el ojo y saluda. Quien no conozca la app entiende de un golpe de
 * dónde sale el muñeco que va a ver después.
 */
export function Nombre({ largo }: { largo: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useMedidas();
  const cambio = despierta(largo);

  const marca = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });
  const letra = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.7 } });
  // Con rebote: es un muñeco que salta, no un logotipo que se funde.
  const vivo = spring({ frame: frame - cambio, fps, config: { damping: 11, mass: 0.5 } });
  const yaEsAdeo = Math.min(1, vivo * 2.5);
  const caja = CAJA * u;
  // La proa levanta un halo suyo, del color de la marca: es lo que la separa
  // del fondo sin ponerle una caja.
  const halo = `drop-shadow(0 0 ${54 * u}px rgba(72,194,255,0.45))`;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: AIRE * u }}>
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
          fontSize: LETRA * u,
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
    </AbsoluteFill>
  );
}
