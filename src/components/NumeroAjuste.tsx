// El número de un deslizador de Ajustes, que también se escribe a mano: doble
// clic sobre la cifra (o Intro con el foco en ella) y se teclea el valor
// exacto, en vez de arrastrar hasta acertar. Munir, 2026-11-24: «que los
// apartados numericos puedas hacer doble click y editarlo con el teclado para
// mas rapidez y ser mas concreto».
//
// Intro o salir del campo lo guarda, Escape lo deja como estaba. Lo que se
// escribe se redondea y se encaja entre `min` y `max`, así que no hay valor
// imposible que guardar; lo que no es un número se descarta sin más.

import { useState } from "react";
import { useT } from "../lib/i18n";

interface Props {
  /** El valor de verdad: es lo que aparece al abrir el campo. */
  valor: number;
  min: number;
  max: number;
  onCambiar: (n: number) => void;
  /** Lo que va pegado detrás de la cifra: "px", "%", " %". */
  sufijo?: string;
  /** Si lo que se enseña no es la cifra (el «auto» de la terminal), esto. */
  texto?: string;
}

export default function NumeroAjuste({ valor, min, max, onCambiar, sufijo = "", texto }: Props) {
  const { t } = useT();
  const [borrador, setBorrador] = useState<string | null>(null);

  const cerrar = (guardar: boolean) => {
    if (guardar && borrador != null && borrador.trim() !== "") {
      const n = Number(borrador.replace(",", "."));
      if (Number.isFinite(n)) onCambiar(Math.min(max, Math.max(min, Math.round(n))));
    }
    setBorrador(null);
  };

  if (borrador != null) {
    return (
      <input
        className="setting-value setting-value-campo"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={borrador}
        autoFocus
        aria-label={t("Escribe el número")}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setBorrador(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            cerrar(true);
          } else if (e.key === "Escape") {
            // Escape aquí deshace el número; no tiene que cerrar Ajustes.
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            cerrar(false);
          }
        }}
        onBlur={() => cerrar(true)}
      />
    );
  }

  return (
    <span
      className="setting-value setting-value-editable"
      role="button"
      tabIndex={0}
      title={t("Doble clic para escribir el número")}
      onDoubleClick={(e) => {
        e.preventDefault();
        setBorrador(String(valor));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          setBorrador(String(valor));
        }
      }}
    >
      {texto ?? `${valor}${sufijo}`}
    </span>
  );
}
