import { useT } from "../lib/i18n";
import { AvisoIcon } from "./Icons";

/**
 * El aviso de «Borrar la sesión» cuando esa sesión está abierta: el mismo en la
 * barra (`Sidebar.tsx`, solo si está viva) y en el encabezado de la terminal
 * (`TerminalPane.tsx`, siempre). Cambia solo la nota de debajo, que dice qué
 * pasa con la terminal en cada sitio.
 */
export default function AvisoSesionAbierta({ nota }: { nota: string }) {
  const { t } = useT();
  return (
    <div className="modal-warn">
      <p className="modal-warn-title">
        <AvisoIcon />
        {t("Esta sesión está abierta ahora mismo.")}
      </p>
      <p className="modal-warn-note">{nota}</p>
    </div>
  );
}
