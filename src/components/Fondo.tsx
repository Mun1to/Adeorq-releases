import { comoFuente, esVideo } from "../lib/fondo";

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
}

export default function Fondo({ path, sello, opacidad, desenfoque }: Props) {
  if (!path) return null;
  const src = comoFuente(path, sello);
  return (
    <div className="fondo" aria-hidden="true">
      {esVideo(path) ? (
        <video
          key={src}
          className="fondo-medio"
          src={src}
          autoPlay
          loop
          muted
          playsInline
          style={{ filter: desenfoque ? `blur(${desenfoque}px)` : undefined }}
        />
      ) : (
        <img
          key={src}
          className="fondo-medio"
          src={src}
          alt=""
          style={{ filter: desenfoque ? `blur(${desenfoque}px)` : undefined }}
        />
      )}
      <div className="fondo-velo" style={{ opacity: 1 - opacidad / 100 }} />
    </div>
  );
}
