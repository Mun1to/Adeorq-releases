// La barra de la derecha: una franja de iconos y, al lado, el panel abierto.
//
// Antes aquí solo vivía Skills (con el Uso dentro), y plegarlo dejaba una franja
// con un rótulo de canto. Desde el 2026-08-15 hay más de un inquilino, así que
// la franja pasa a ser el sitio donde se ELIGE cuál: un icono por cara, como
// pidió Munir («iconos a la derecha en la barra que le das y se abre»).
//
// Dos cosas que no son de adorno:
//
//  · La franja está SIEMPRE, abierta o cerrada. Es lo que hace que se pueda
//    volver: un panel que al cerrarse no deja nada en pantalla se pierde.
//  · Pulsar el icono de la cara abierta la cierra. Cerrar y elegir son el mismo
//    gesto, así que no hace falta una ✕ aparte que compita con los iconos.

import { useT } from "../lib/i18n";
import { BrowserIcon, ChevronIcon, FolderIcon, SparkIcon } from "./Icons";

/** Qué panel se está viendo. Vacío es «ninguno, solo la franja». */
export type Cara = "" | "skills" | "archivos";

interface Props {
  cara: Cara;
  onCara: (c: Cara) => void;
  /** El contenido de cada cara. Se pasan montados desde fuera porque cada uno
      necesita cosas distintas (las cuentas, la carpeta del proyecto) y este
      componente no tiene por qué conocerlas. */
  skills: React.ReactNode;
  archivos: React.ReactNode;
  /** Abrir la vista previa de la web. No es una cara de esta barra: es un panel
      del mosaico. Vive aquí porque Munir lo pidió en la franja (2026-08-15) y
      tiene sentido: la franja es «lo que puedes abrir», y da igual dónde acabe
      abriéndose cada cosa. */
  onWeb?: () => void;
}

const CARAS: Array<{ id: Exclude<Cara, "">; titulo: string; icono: React.ReactNode }> = [
  { id: "skills", titulo: "Skills · Uso", icono: <SparkIcon size={16} /> },
  { id: "archivos", titulo: "Archivos", icono: <FolderIcon size={16} /> },
];

export default function PanelDerecho({ cara, onCara, skills, archivos, onWeb }: Props) {
  const { t } = useT();
  const actual = CARAS.find((c) => c.id === cara);

  // Un solo hijo y no dos sueltos. La Cabina es un flex y le daba igual, pero
  // el Chat es un grid de tres columnas: con el panel y la franja como hermanos
  // sueltos, el cuarto hijo se caía a una fila nueva y la franja aparecía abajo
  // del todo, cruzada (Munir, 2026-08-15). Envuelto, esto se coloca igual en
  // cualquier sitio donde se monte.
  return (
    <div className="lateral-zona">
      {actual && (
        <aside className="lateral">
          <div className="lateral-head">
            <span className="lateral-title">
              {actual.icono} {t(actual.titulo)}
            </span>
            {/* Hacia la derecha, que es por donde se va. */}
            <button className="mini" onClick={() => onCara("")} data-tip={t("Ocultar panel")}>
              <ChevronIcon size={12} der />
            </button>
          </div>
          <div className="lateral-cuerpo">
            {cara === "skills" ? skills : archivos}
          </div>
        </aside>
      )}

      <nav className="franja">
        {CARAS.map((c) => (
          <button
            key={c.id}
            className="franja-btn"
            data-on={cara === c.id}
            data-tip={cara === c.id ? t("Ocultar panel") : t(c.titulo)}
            onClick={() => onCara(cara === c.id ? "" : c.id)}
          >
            {c.icono}
          </button>
        ))}

        {/* La web. Separada de las de arriba porque no abre un panel aquí, sino
            uno en el mosaico: la rayita dice que hace otra cosa. */}
        {onWeb && (
          <>
            <span className="franja-raya" />
            <button
              className="franja-btn"
              data-tip={t("Ver la web en un panel (localhost)")}
              onClick={onWeb}
            >
              <BrowserIcon size={16} />
            </button>
          </>
        )}
      </nav>
    </div>
  );
}
