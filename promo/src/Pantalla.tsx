import { AbsoluteFill, Img, getStaticFiles, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Adeo, REACCIONES, altoDeAdeo, anchoDeAdeo, bucle, gesto, type Paso } from "./Adeo";
import { COLOR, FUENTE } from "./casa";
import { TEXTOS, type Animo, type EscenaPantalla, type Idioma } from "./guion";
import { useDecir, useIdioma, useMedidas } from "./idioma";
import { PASO } from "./tiempos";

/** Si hay una captura hecha en el idioma de la pieza (`pantallas/en/...`), esa;
    si no, la de todos. Una Cabina con las pestañas en inglés dentro del vídeo
    en español se nota, pero no tener el vídeo por eso se nota más. */
function captura(imagen: string, idioma: Idioma) {
  const hay = (ruta: string) => getStaticFiles().some((f) => f.name === ruta);
  const propia = `pantallas/${idioma}/${imagen}`;
  const comun = `pantallas/${imagen}`;
  return hay(propia) ? staticFile(propia) : hay(comun) ? staticFile(comun) : null;
}

/** El hueco de una captura que todavía no existe: una ventana vacía con su
    nombre, del tamaño que tendrá. Así una pantalla nueva se puede escribir en
    el guion, y ver el vídeo entero, antes de tener su imagen; y lo que falta
    se ve de lejos en vez de tumbar el render con un 404. */
function Hueco({ escena, ancho }: { escena: EscenaPantalla; ancho: number }) {
  const { u } = useMedidas();
  const decir = useDecir();
  return (
    <div
      style={{
        width: ancho,
        aspectRatio: "1.76",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14 * u,
        lineHeight: 1.2,
        fontFamily: FUENTE.mono,
        color: COLOR.apagado,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 ${22 * u}px, rgba(140,170,220,0.05) ${22 * u}px ${44 * u}px)`,
      }}
    >
      <span style={{ fontSize: 20 * u, letterSpacing: "0.16em", textTransform: "uppercase" }}>{decir(TEXTOS.pendiente)}</span>
      <span style={{ fontFamily: FUENTE.texto, fontSize: 76 * u, fontWeight: 750, color: COLOR.texto }}>{decir(escena.nombre)}</span>
      <span style={{ fontSize: 20 * u }}>{escena.imagen}</span>
    </div>
  );
}

/** Lo que Adeo hace nada más llegar, delante del guion de su ánimo. En la app
    un gesto tarda entre seis y once segundos en salir, y aquí una escena dura
    siete: sin esto se pasaría el vídeo parpadeando. */
const AL_LLEGAR: Partial<Record<Animo, readonly Paso[]>> = {
  // Saluda, se pone en jarra y guiña un ojo.
  quieta: [...REACCIONES.hola, ...gesto("quieta", 4), ...gesto("quieta", 6)],
  // Le da una vuelta, y se le ocurre.
  piensa: [...bucle("piensa"), ...gesto("piensa", 2)],
  // Escucha, y asiente.
  escucha: [...bucle("escucha"), ...gesto("escucha", 0)],
  // Empieza por el salto con los brazos arriba.
  baila: gesto("baila", 0),
};

/**
 * Una captura de la app dentro de su marco, con Adeo al lado.
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
export function Pantalla({ escena, entra, largo }: { escena: EscenaPantalla; entra: number; largo: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, vertical, width, height, franja, pegado } = useMedidas();
  const idioma = useIdioma();
  const src = captura(escena.imagen, idioma);
  const f = frame - entra;
  const avance = interpolate(f, [0, largo], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  /* Un 3,5 % de recorrido en toda la escena: se nota que la imagen está viva
     y no se ve moverse, que es lo que se busca. Más que esto marea. */
  const zoom =
    escena.hacia === "aleja" ? interpolate(avance, [0, 1], [1.035, 1.0]) : interpolate(avance, [0, 1], [1.0, 1.035]);

  // La ventana llega girada y se pone de frente: es lo que hace que entre como
  // un objeto y no como una diapositiva. Ya de frente no se queda inclinada,
  // que una captura torcida se lee peor.
  const llega = spring({ frame: f + PASO / 2, fps, config: { damping: 200, mass: 0.9 } });
  const giro = interpolate(llega, [0, 1], [vertical ? 0 : -11, 0]);
  // Y un brillo la cruza una vez, como a un cristal al que le da la luz.
  const brillo = interpolate(f, [2, 30], [-70, 170], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const aparece = spring({ frame: f - 8, fps, config: { damping: 11, mass: 0.55 } });

  const altoAdeo = (vertical ? 154 : 126) * u;
  const hueco = (vertical ? 22 : 34) * u;

  return (
    <AbsoluteFill
      style={{
        height: `${(1 - franja) * 100}%`,
        boxSizing: "border-box",
        paddingBottom: pegado ? 36 * u : 0,
        alignItems: "center",
        justifyContent: pegado ? "flex-end" : "center",
      }}
    >
      {/* La ventana va centrada, encima de su rótulo, y Adeo fuera de la
          cuenta: si los dos se centraran como pareja, la ventana quedaría
          corrida a un lado respecto del texto de abajo. En vertical no hay
          margen a los lados y se sube encima; ahí sí se le hace sitio. */}
      <div style={{ position: "relative", marginTop: vertical ? altoDeAdeo(altoAdeo) + hueco : 0 }}>
        <div
          style={{
            position: "absolute",
            // Los pies de Adeo, a la altura del borde de abajo de la ventana:
            // está de pie a su lado, no flotando.
            ...(vertical
              ? { bottom: "100%", left: "50%", marginLeft: -anchoDeAdeo(altoAdeo) / 2, marginBottom: hueco }
              : { right: "100%", bottom: 0, marginRight: hueco }),
            transform: `scale(${aparece})`,
            transformOrigin: "50% 100%",
            filter: `drop-shadow(0 ${8 * u}px ${14 * u}px rgba(0,0,0,0.5))`,
          }}
        >
          <Adeo
            animo={escena.adeo}
            alto={altoAdeo}
            antes={AL_LLEGAR[escena.adeo]}
            mirada={vertical ? "bajo" : "der"}
            desde={entra + 8}
            semilla={escena.id.length + largo}
          />
        </div>

        <div style={{ perspective: 1900 * u }}>
          <div
            style={{
              position: "relative",
              // `lineHeight: 0` y `display: block` en la imagen: si no, el marco
              // se queda con los tres píxeles de hueco que el navegador reserva
              // bajo una imagen en línea, y se ve una raya de fondo debajo.
              lineHeight: 0,
              borderRadius: 14 * u,
              overflow: "hidden",
              border: `1px solid ${COLOR.bordeFuerte}`,
              boxShadow: `0 ${40 * u}px ${90 * u}px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)`,
              backgroundColor: COLOR.panel,
              transform: `rotateY(${giro}deg) scale(${zoom})`,
            }}
          >
            {src ? (
              <Img
                src={src}
                style={{
                  display: "block",
                  maxHeight: height * (vertical ? 0.4 : 0.64),
                  maxWidth: width * (vertical ? 0.9 : 0.7),
                  width: "auto",
                  height: "auto",
                }}
              />
            ) : (
              <Hueco escena={escena} ancho={Math.min(width * (vertical ? 0.9 : 0.7), height * (vertical ? 0.4 : 0.64) * 1.76)} />
            )}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(105deg, transparent 40%, rgba(190,220,255,0.16) 50%, transparent 60%)",
                transform: `translateX(${brillo}%)`,
              }}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
