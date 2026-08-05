// El marco de las pantallas grandes: los grupos a la izquierda, uno solo
// abierto a la derecha.
//
// Nació en Ajustes, donde diez tarjetas en una rejilla dejaban huecos porque
// una tenía dos botones y otra veinticuatro temas (Munir, 2026-07-30). El
// Panel, Cuentas y la Agenda tenían el mismo problema y cada una lo resolvía a
// su manera: scroll infinito de secciones sueltas, sin saber cuánto queda ni
// dónde estás. Ahora las cuatro se manejan igual, que es lo que hace que una
// app parezca una app y no cuatro pantallas del mismo color.
//
// Recuerda por su cuenta la última sección que miraste, porque estas pantallas
// se abren muchas veces seguidas para lo mismo y volver siempre a la primera
// obliga a rebuscar cada vez.

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";

export interface Seccion {
  id: string;
  label: string;
  icon: ReactNode;
  /** Un número o un texto corto a la derecha del nombre: cuántas cosas hay
      dentro, para no tener que entrar a mirar si está vacío. */
  badge?: string | number;
}

interface Props {
  /** Con qué nombre se recuerda la última sección abierta. */
  memoria: string;
  secciones: Seccion[];
  /** El contenido de la sección abierta. */
  children: (activa: string) => ReactNode;
}

export default function Secciones({ memoria, secciones, children }: Props) {
  const { t } = useT();
  const [activa, setActiva] = useState(() => {
    const guardada = localStorage.getItem(memoria) ?? "";
    return secciones.some((s) => s.id === guardada) ? guardada : secciones[0]?.id ?? "";
  });

  // Si la sección abierta deja de existir (cambia la lista entre versiones), se
  // cae a la primera en vez de dejar la hoja en blanco sin explicación.
  useEffect(() => {
    if (!secciones.some((s) => s.id === activa) && secciones.length > 0) {
      setActiva(secciones[0].id);
    }
  }, [secciones, activa]);

  const irA = (id: string) => {
    setActiva(id);
    localStorage.setItem(memoria, id);
  };

  return (
    <div className="set-marco">
      <nav className="set-nav">
        {secciones.map((s) => (
          <button
            key={s.id}
            className="set-tab"
            data-on={activa === s.id || undefined}
            onClick={() => irA(s.id)}
          >
            {s.icon}
            <span className="set-tab-nom">{t(s.label)}</span>
            {s.badge != null && s.badge !== "" && s.badge !== 0 && (
              <span className="set-tab-badge">{s.badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="set-hoja">{children(activa)}</div>
    </div>
  );
}
