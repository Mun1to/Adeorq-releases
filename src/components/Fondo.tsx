import { useEffect, useRef } from "react";
import { comoFuente, esVideo } from "../lib/fondo";
import { estiloDe, type Encuadre } from "../lib/encuadre";
import { modoRendimiento } from "../lib/rendimiento";
import { TEMA_TERM_EVENTO } from "../lib/temasTerm";

// La capa del fondo. Va debajo de todo y no recibe un solo clic.
//
// Dos cosas que no son decorativas y por eso están aquí y no en el CSS:
//
//   - `pointer-events: none` en la capa entera: un vídeo de fondo que se pueda
//     pausar sin querer, o una imagen que se pueda arrastrar, sería un fondo
//     que participa en el trabajo. Este solo mira.
//   - El velo va ENCIMA del vídeo, no como opacidad del vídeo. Bajarle la
//     opacidad a un vídeo lo deja translúcido sobre el color de la app y las
//     zonas oscuras se vuelven grises; un velo del color del fondo lo apaga sin
//     desteñirlo, que es lo que hace legible el texto de las terminales.

interface Props {
  /** Ruta del archivo en la carpeta de Adeorq, o "" si no hay fondo. */
  path: string;
  /** Cambia al poner otro: obliga al navegador a no reutilizar el cacheado. */
  sello: number;
  /** 0-100. Cuánto se ve el fondo; el resto es velo. */
  opacidad: number;
  /** 0-30 px. Desenfoque, para que un fondo con detalle no compita con el texto. */
  desenfoque: number;
  /** Qué trozo de la foto se ve y a qué tamaño. Lo elige él en Ajustes. */
  encuadre: Encuadre;
}

export default function Fondo({ path, sello, opacidad, desenfoque, encuadre }: Props) {
  const video = useRef<HTMLVideoElement | null>(null);

  /* Lo más caro de toda la app es este vídeo, y por mucho.
   *
   * Medido el 2026-08-18 en esta máquina, con doce paneles de cristal
   * (`backdrop-filter: blur(22px)`) delante: sobre un color plano cuestan
   * 3,6% de un núcleo, y sobre un vídeo 41,3%. No es reproducirlo, es que cada
   * fotograma suyo invalida el desenfoque de TODO lo que tiene encima, y
   * Adeorq apila treinta superficies de esas. Once veces más caro. El
   * desenfoque del propio vídeo casi no añade (41,7%), o sea que el culpable
   * es el movimiento, no la nitidez.
   *
   * PAUSARLO lo devuelve a 1,8%, y un vídeo pausado se ve exactamente igual
   * que la foto que sería. Así que se pausa en los dos casos donde nadie está
   * disfrutándolo:
   *
   *   · con la ventana escondida o minimizada, donde no lo mira nadie;
   *   · en modo rendimiento, que es el interruptor que ya apaga «lo que
   *     respira» y que en automático se enciende solo a partir de la cuarta
   *     terminal, o sea justo cuando esos 33 puntos hacen falta para otra cosa.
   *
   * Con la ventana delante y sin ahorro, se mueve: eso es una decisión suya. */
  useEffect(() => {
    const decidir = () => {
      const v = video.current;
      if (!v) return;
      const sobra = document.visibilityState === "hidden" || modoRendimiento();
      if (sobra) v.pause();
      else void v.play().catch(() => {});
    };
    decidir();
    document.addEventListener("visibilitychange", decidir);
    window.addEventListener(TEMA_TERM_EVENTO, decidir);
    return () => {
      document.removeEventListener("visibilitychange", decidir);
      window.removeEventListener(TEMA_TERM_EVENTO, decidir);
    };
  }, [path, sello]);

  if (!path) return null;
  const src = comoFuente(path, sello);
  // El encaje, la posición y la escala salen de la MISMA función que usa la
  // miniatura del editor. Es lo único que garantiza que la vista previa no
  // mienta: si se escribieran dos veces, se separarían a la primera.
  const style = {
    ...estiloDe(encuadre, desenfoque),
    filter: desenfoque ? `blur(${desenfoque}px)` : undefined,
  };
  return (
    <div className="fondo" aria-hidden="true">
      {esVideo(path) ? (
        <video ref={video} key={src} className="fondo-medio" src={src} autoPlay loop muted playsInline style={style} />
      ) : (
        <img key={src} className="fondo-medio" src={src} alt="" style={style} />
      )}
      <div className="fondo-velo" style={{ opacity: 1 - opacidad / 100 }} />
    </div>
  );
}
