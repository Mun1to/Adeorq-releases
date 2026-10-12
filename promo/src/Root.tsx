import { Composition, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import { Muestra, duracionDeLaMuestra } from "./Muestra";
import { Promo, duracionTotal } from "./Promo";
import { IDIOMAS, type Idioma } from "./guion";
import { FPS } from "./casa";
import type { Voces } from "./tiempos";

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

/** La voz grabada de un idioma: lo que `voz.mjs` dejó en `public/voz/`. Si no
    hay grabación no hay archivo, y la pieza sale con música y rótulos. Se lee
    aquí, antes de pintar, porque la duración del vídeo depende de ella. */
async function vozDe(idioma: Idioma): Promise<Voces> {
  try {
    const r = await fetch(staticFile(`voz/${idioma}/voz.json`));
    return r.ok ? ((await r.json()) as Voces) : {};
  } catch {
    return {};
  }
}

/**
 * Cuatro piezas, y cada una en cada idioma: `Promo-es`, `Promo-en`,
 * `Media-es`... Son el MISMO montaje con el mismo guion: lo único que cambia
 * entre dos composiciones es el idioma, el tamaño y qué corte del guion es.
 */
const PIEZAS = [
  // La entera: X, LinkedIn, YouTube y el README (subiendo el MP4).
  { id: "Promo", ancho: 1920, alto: 1080, corte: "entera" },
  // La misma sin las escenas marcadas `opcional` en el guion.
  { id: "Media", ancho: 1920, alto: 1080, corte: "media" },
  // La vertical, para Instagram y TikTok. Todo se mide con la misma vara
  // (`useMedidas`), así que el texto y el marco se recolocan solos.
  { id: "Vertical", ancho: 1080, alto: 1920, corte: "media" },
  // La de bolsillo, solo con las escenas marcadas `corta` en el guion. De
  // ella sale también el GIF, que con la pieza entera pesaría decenas de megas.
  { id: "Corta", ancho: 1920, alto: 1080, corte: "corta" },
] as const;

export function Root() {
  return (
    <>
      {PIEZAS.flatMap((p) =>
        IDIOMAS.map((idioma) => (
          <Composition
            key={`${p.id}-${idioma}`}
            id={`${p.id}-${idioma}`}
            component={Promo}
            defaultProps={{ idioma, corte: p.corte }}
            calculateMetadata={async ({ props }) => {
              const conVoz = { ...props, voz: await vozDe(props.idioma) };
              return { durationInFrames: duracionTotal(conVoz), props: conVoz };
            }}
            fps={FPS}
            width={p.ancho}
            height={p.alto}
          />
        )),
      )}
      {/* No es una pieza: es el muestrario de pasos, para elegirlos mirando. */}
      <Composition id="Transiciones" component={Muestra} durationInFrames={duracionDeLaMuestra} fps={FPS} width={1920} height={1080} />
    </>
  );
}
