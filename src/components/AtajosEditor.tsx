import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import {
  ACCIONES,
  GRUPOS,
  comoAtajo,
  comoTexto,
  resolver,
  type AccionId,
  type Atajos,
} from "../lib/atajos";
import {
  CloseIcon,
} from "./Icons";

// El editor de atajos: la tabla de qué hace cada tecla en el lienzo.
//
// Se graba pulsando, no escribiendo: le das al atajo de una acción, pulsas la
// combinación que quieras y ya está. Escribir "Ctrl+Mayús+K" a mano obliga a
// acertar con el nombre exacto de cada tecla, y ese nombre es cosa del
// navegador, no de nadie más.

interface Props {
  atajos: Atajos;
  onChange: (next: Atajos) => void;
}

export default function AtajosEditor({ atajos, onChange }: Props) {
  const { t } = useT();
  /** Qué acción está esperando una tecla, si alguna. */
  const [grabando, setGrabando] = useState<AccionId | null>(null);
  const mapa = resolver(atajos);
  const fila = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!grabando) return;
    const onKey = (e: KeyboardEvent) => {
      // Todo se lo queda el grabador mientras está puesto: si no, pulsar Ctrl+A
      // para asignarlo seleccionaría además el texto de la página.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setGrabando(null);
        return;
      }
      const nuevo = comoAtajo(e);
      if (!nuevo) return;
      // Si esa combinación ya era de otra acción, la otra se queda SIN atajo en
      // vez de quedar las dos con la misma. Dos acciones con la misma tecla es
      // un empate que luego resuelve el orden del catálogo, o sea, el azar.
      const next: Atajos = { ...atajos };
      for (const a of ACCIONES) {
        if (a.id !== grabando && (atajos[a.id] ?? a.porDefecto) === nuevo) next[a.id] = "";
      }
      next[grabando] = nuevo;
      onChange(next);
      setGrabando(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [grabando, atajos, onChange]);

  const quitar = (id: AccionId) => onChange({ ...atajos, [id]: "" });

  const cambiados = ACCIONES.filter((a) => atajos[a.id] !== undefined).length;

  return (
    <div className="atajos">
      {GRUPOS.map((g) => (
        <div key={g.id} className="atajos-grupo">
          <h4 className="atajos-h">{t(g.label)}</h4>
          {ACCIONES.filter((a) => a.grupo === g.id).map((a) => {
            const val = mapa[a.id];
            return (
              <div key={a.id} className="atajos-fila">
                <span className="atajos-label">{t(a.label)}</span>
                <button
                  ref={grabando === a.id ? fila : undefined}
                  className="atajos-tecla"
                  data-grabando={grabando === a.id}
                  data-vacio={!val}
                  onClick={() => setGrabando(grabando === a.id ? null : a.id)}
                >
                  {grabando === a.id
                    ? t("pulsa la tecla…")
                    : val
                      ? comoTexto(val)
                      : t("sin atajo")}
                </button>
                <button
                  className="atajos-x"
                  data-tip={t("Dejarlo sin atajo")}
                  disabled={!val}
                  onClick={() => quitar(a.id)}
                >
                  <CloseIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <div className="atajos-pie">
        <button className="np-btn ghost" disabled={!cambiados} onClick={() => onChange({})}>
          {t("Volver a los de fábrica")}
        </button>
        {grabando && <span className="atajos-hint">{t("Esc para dejarlo como estaba")}</span>}
      </div>
    </div>
  );
}
