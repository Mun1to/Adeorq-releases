import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR } from "./casa";
import type { Escena } from "./guion";

/**
 * Una captura de la app dentro de su marco, acercándose despacio.
 *
 * ⚠ LA CAPTURA SE VE ENTERA, y esto no es negociable: el primer montaje
 * recortaba con `object-fit: cover` para llenar un marco de 16:9, y las
 * capturas de Adeorq NO son 16:9 (van de 1.69 a 1.85 según la vista, porque
 * unas llevan la barra de título de Windows y otras no). El resultado era una
 * ventana cortada por los lados: en el Panel se perdía la B de "Buenas
 * tardes". Una app que sale cortada en su propio vídeo parece un error de
 * montaje, no un encuadre.
 *
 * Por eso el marco NO tiene proporción propia: envuelve a la imagen y toma la
 * suya, sea cual sea. Y el movimiento se aplica al marco ENTERO, así que la
 * ventana se acerca como un objeto y nunca hay nada que recortar. Cambiar las
 * capturas por otras de cualquier tamaño no rompe nada.
 */
export function Pantalla({ escena, duraEnFrames }: { escena: Escena; duraEnFrames: number }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const avance = interpolate(frame, [0, duraEnFrames], [0, 1], { extrapolateRight: "clamp" });

  /* Un 4 % de recorrido en toda la escena: se nota que la imagen está viva y
     no se ve moverse, que es lo que se busca. Más que esto marea, y en un
     vídeo que se va a ver en bucle en un README marea el doble. */
  const zoom =
    escena.hacia === "aleja"
      ? interpolate(avance, [0, 1], [1.04, 1.0])
      : interpolate(avance, [0, 1], [1.0, 1.04]);

  /* Y una deriva lateral mínima, para que dos escenas seguidas no se muevan
     igual. En porcentaje del ancho, que la vertical usa la misma pieza. */
  const deriva = width * 0.006;
  const dx = escena.hacia === "aleja" ? interpolate(avance, [0, 1], [deriva, -deriva]) : 0;

  // Entrar y salir, medio segundo. La pieza dura treinta y pico segundos: una
  // transición larga se come el tiempo de leer la frase.
  const entra = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const sale = interpolate(frame, [duraEnFrames - 12, duraEnFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        // El 74 % de arriba es de la ventana; el resto es del rótulo, y no se
        // pisan. Un texto encima de la captura tapa justo lo que el vídeo está
        // enseñando.
        height: "74%",
        alignItems: "center",
        justifyContent: "center",
        opacity: Math.min(entra, sale),
        transform: `translateY(${interpolate(entra, [0, 1], [26, 0])}px)`,
      }}
    >
      <div
        style={{
          // `lineHeight: 0` y `display: block` en la imagen: si no, el marco se
          // queda con los tres píxeles de hueco que el navegador reserva bajo
          // una imagen en línea, y se ve una raya de fondo debajo.
          lineHeight: 0,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${COLOR.bordeFuerte}`,
          boxShadow: "0 40px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)",
          backgroundColor: COLOR.panel,
          transform: `scale(${zoom}) translateX(${dx}px)`,
        }}
      >
        <Img
          src={staticFile(`pantallas/${escena.imagen}`)}
          style={{
            display: "block",
            maxHeight: height * 0.66,
            maxWidth: width * 0.82,
            width: "auto",
            height: "auto",
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
