// Qué conversaciones se VEN en la barra de la izquierda.
//
// Vive aparte porque la respuesta la necesitan DOS sitios y hasta hoy cada uno
// tenía la suya:
//
//   · la barra (`Sidebar.tsx`), para decidir qué filas pinta;
//   · el asistente del ＋ (`NewSession.tsx`), para decidir cuáles te ofrece
//     traer, o sea cuáles NO tienes todavía.
//
// La barra usaba las cuatro condiciones de abajo y el asistente solo una (¿está
// abierta en un panel?), así que le ofrecía traer cientos de sesiones que ya
// estaban en la barra, y seguía ofreciéndotelas DESPUÉS de traerlas: marcabas
// las sesenta que te faltaban, las ponías, volvías a entrar y ahí seguían
// (Munir, 2026-08-12: «siguen apareciendo las sesiones que me faltan por poner
// en Adeorq»). No era que el escaneo leyera mal: es que las dos pantallas no
// estaban de acuerdo en qué significa «ya la tengo».
//
// Con la regla en un solo sitio, las dos contestan igual por construcción.
// Casos en `scripts/barra-check.ts`.

/** Lo mínimo que hace falta saber de una sesión para decidir si se ve. */
export interface Mirable {
  id: string;
  /** Cómo de reciente es. `muerta` es de hace más de una semana. */
  fresh: "activa" | "dormida" | "muerta";
}

/** El estado de la barra que influye en lo que se ve. */
export interface Estanteria {
  /** Ids con un panel abierto ahora mismo en Adeorq. */
  enPantalla: ReadonlySet<string>;
  /** Ids que trajiste a mano desde el ＋, aunque sean viejas (`ui.traidas`). */
  traidas: ReadonlySet<string>;
  /** El interruptor de «ver también las viejas» de la barra. Con él puesto se
      ven todas, así que no hay nada que traer. */
  verViejas?: boolean;
}

/**
 * ¿Esta conversación se ve ya en la barra?
 *
 * Cuatro motivos, y basta con uno: la has pedido tú (`verViejas`), es reciente,
 * la tienes abierta en un panel, o la trajiste a mano. Los dos últimos ganan a
 * la edad a propósito: ir a buscar una de hace un mes, elegirla, y que la regla
 * de la semana la escondiera justo después, es el fallo que `traidas` vino a
 * resolver.
 */
export function saleEnLaBarra(s: Mirable, e: Estanteria): boolean {
  return (
    Boolean(e.verViejas) ||
    s.fresh !== "muerta" ||
    e.enPantalla.has(s.id) ||
    e.traidas.has(s.id)
  );
}

/**
 * Por qué se ve, para poder decirlo con palabras distintas.
 *
 * El asistente enseñaba «ya la tienes» para todo, y no es lo mismo tenerla
 * abierta en un panel (donde volver a abrirla bloquea las dos) que tenerla
 * simplemente listada. `null` es lo único que de verdad falta por traer.
 */
export function porQueSale(
  s: Mirable,
  e: Estanteria,
): "abierta" | "traida" | "reciente" | null {
  if (e.enPantalla.has(s.id)) return "abierta";
  if (e.traidas.has(s.id)) return "traida";
  if (Boolean(e.verViejas) || s.fresh !== "muerta") return "reciente";
  return null;
}
