import { Composition, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import { Promo, duracionTotal, type PropsPromo } from "./Promo";
import { ESCENAS } from "./guion";
import { FPS } from "./casa";

/* Bajo `typeof window`, y no es adorno: Remotion evalúa este mismo módulo en
   NODE para enterarse de qué composiciones hay, y ahí `FontFace` no existe, así
   que sin la guarda el render se cae antes de pintar un solo frame. En el
   navegador sí corre, y `loadFont` retrasa el render hasta que la fuente está
   lista, que es lo que evita que el primer segundo salga en Arial.

   Las dos fuentes son las MISMAS que sirve la web (`web/fonts`), no unas
   parecidas bajadas de Google, y van desde `public/` para que el render no
   dependa de la red: un render sin conexión que se cae a Arial es la clase de
   fallo que solo se ve cuando ya has publicado el vídeo. */
if (typeof window !== "undefined") {
  void loadFont({
    family: "Inter",
    url: staticFile("fuentes/inter-latin-wght-normal.woff2"),
    weight: "100 900",
  });
  void loadFont({
    family: "JetBrains Mono",
    url: staticFile("fuentes/jetbrains-mono-latin-wght-normal.woff2"),
    weight: "100 800",
  });
}

/** La pieza entera: apertura, las cinco vistas y el cierre. */
const COMPLETA: PropsPromo = { escenas: ESCENAS, portada: 3.2, despedida: 3.6 };

/** La de bolsillo, para el GIF del README.
 *
 * Existe por un número: el GIF de la pieza completa pesa 33 MB, y eso en un
 * README es inservible (GitHub ni siquiera acepta subir tanto por su
 * interfaz). Se queda con las tres vistas que más venden y recorta la portada,
 * porque en el README el logo ya está justo encima. */
const CORTA: PropsPromo = {
  escenas: ESCENAS.filter((e) => ["cockpit.png", "canvas.png", "dashboard.png"].includes(e.imagen)),
  portada: 1.6,
  despedida: 2,
};

export function Root() {
  return (
    <>
      {/* La de siempre: X, LinkedIn y el README (subiendo el MP4). 1080p
          porque de aquí sale también el GIF reescalado, y reducir se ve bien
          mientras que ampliar no. */}
      <Composition
        id="Promo"
        component={Promo}
        defaultProps={COMPLETA}
        calculateMetadata={({ props }) => ({ durationInFrames: duracionTotal(props) })}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {/* La vertical, para Instagram y TikTok. Es el MISMO montaje: todo está
          medido en porcentaje de la altura, así que el texto y el marco se
          recolocan solos y no hay un segundo guion que se quede viejo. */}
      <Composition
        id="PromoVertical"
        component={Promo}
        defaultProps={COMPLETA}
        calculateMetadata={({ props }) => ({ durationInFrames: duracionTotal(props) })}
        fps={FPS}
        width={1080}
        height={1920}
      />
      {/* La corta, de la que sale el GIF. */}
      <Composition
        id="PromoCorta"
        component={Promo}
        defaultProps={CORTA}
        calculateMetadata={({ props }) => ({ durationInFrames: duracionTotal(props) })}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
}
