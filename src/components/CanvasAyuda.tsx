import { propsDeVelo } from "../lib/velo";
import { useT } from "../lib/i18n";

// La ayuda del lienzo, abierta con el «?» de su barra. Era solo un globo al
// pasar el ratón, y al pulsarlo no pasaba nada (Munir, 2026-10-07).
export default function CanvasAyuda({
  velo,
  onCerrar,
}: {
  velo: Parameters<typeof propsDeVelo>[0];
  onCerrar: () => void;
}) {
  const { t } = useT();
  const lineas = [
    t("Arrastra de un borde a otro para encadenar: cuando el primero termina, su resultado pasa al siguiente."),
    t("Cada terminal se estira por sus bordes y esquinas, y el botón de ampliar de su cabecera la pone a lo grande y la devuelve."),
    t("Ctrl+V pega una captura. Ctrl+A coge todo el lienzo y Supr se lo lleva. Esc suelta."),
    t("Un carril (Añadir > Carril) separa un espacio de trabajo; con el nombre de un proyecto, sus terminales nacen dentro."),
    t("El tablero se guarda solo; «Lienzo» lo exporta a un archivo o abre otro."),
  ];
  return (
    <div className="modal-overlay" {...propsDeVelo(velo, onCerrar)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t("Cómo va el lienzo")}</h3>
        <ul className="modal-lista">
          {lineas.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="np-btn" onClick={onCerrar}>
            {t("Entendido")}
          </button>
        </div>
      </div>
    </div>
  );
}
