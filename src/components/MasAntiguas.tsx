// Las conversaciones de más de un mes que la barra esconde, y cómo pedirlas.
//
// Dos filas. La de cada PROYECTO («3 más antiguas», al final de su lista) abre
// solo las suyas, y existe porque la global de abajo no la veía nadie: Munir
// preguntó dos veces por qué «desaparecían» sesiones (2026-09-09, 2026-10-07:
// «la de Vibeset no está») y las dos veces estaban en el disco, escondidas por
// la edad. La GLOBAL, abajo del todo de la barra, abre todas; en la tira y con
// el raíl en logo se queda en un número, porque ahí no entra la frase.
//
// La regla de qué se esconde vive en `lib/enLaBarra.ts`; aquí solo se pinta.

import type { Translate } from "../lib/i18n";

export function MasAntiguas({
  nombre,
  viejas,
  abiertas,
  t,
  onAbrir,
  onCerrar,
}: {
  nombre: string;
  viejas: number;
  abiertas: boolean;
  t: Translate;
  onAbrir: (proyecto: string) => void;
  onCerrar: (proyecto: string) => void;
}) {
  if (viejas > 0) {
    return (
      <button
        className="mas-viejas en-proyecto"
        data-tip={t(
          "De hace más de un mes: la barra las esconde para no alargarse. Pulsa para verlas solo en este proyecto.",
        )}
        onClick={() => onAbrir(nombre)}
      >
        {viejas === 1 ? t("1 más antigua") : t("{n} más antiguas", { n: viejas })}
      </button>
    );
  }
  if (abiertas) {
    return (
      <button className="mas-viejas en-proyecto" onClick={() => onCerrar(nombre)}>
        {t("Ocultar las antiguas")}
      </button>
    );
  }
  return null;
}

export function MasAntiguasGlobal({
  ocultas,
  mini,
  t,
  onVer,
}: {
  ocultas: number;
  /** La tira o el raíl en logo: solo cabe el número. */
  mini: boolean;
  t: Translate;
  onVer: () => void;
}) {
  if (ocultas <= 0) return null;
  const frase = t("Cargar {n} sesiones más antiguas", { n: ocultas });
  if (mini) {
    return (
      <button className="mas-viejas mas-viejas-mini" data-tip={frase} onClick={() => onVer()}>
        +{ocultas}
      </button>
    );
  }
  return (
    <button className="mas-viejas" onClick={() => onVer()}>
      {frase}
    </button>
  );
}
