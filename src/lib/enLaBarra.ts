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

/**
 * Hasta dónde mira la barra hacia atrás.
 *
 * Munir, 2026-09-09: «¿por qué hay muchas sesiones que han desaparecido de mi
 * Adeorq?». No había desaparecido ninguna: las 452 seguían en el disco y la
 * barra enseñaba 13, porque cortaba por el estado `muerta` del backend, que son
 * SIETE días. Con su ritmo, una semana es media docena de conversaciones.
 *
 * El corte se sube a treinta días y, sobre todo, **deja de ser el mismo número
 * que el estado de la sesión**, que es lo que estaba mal. `DEAD_H`
 * (`sessions.rs`) responde «¿esta conversación sigue viva?», y siete días es
 * una respuesta correcta a eso: lo usan el capataz y la Agenda para contar las
 * que te esperan, y subirlo allí te diría que tienes cuarenta esperándote desde
 * hace tres semanas. Esta constante responde otra pregunta distinta, «¿cuánto
 * historial enseño?», y por eso vive aquí y no allí.
 *
 * Medido el día del cambio: a siete días se veían 13 de 452; a treinta, 191.
 */
export const HORAS_EN_LA_BARRA = 24 * 30;

/** Lo mínimo que hace falta saber de una sesión para decidir si se ve. */
export interface Mirable {
  id: string;
  /** Horas desde la última vez que se escribió en ella. */
  hours: number;
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

/** ¿Es de las que la barra enseña sin que se lo pidas? */
export function esReciente(s: Mirable): boolean {
  return s.hours < HORAS_EN_LA_BARRA;
}

/**
 * ¿Esta conversación se ve ya en la barra?
 *
 * Cuatro motivos, y basta con uno: la has pedido tú (`verViejas`), es reciente,
 * la tienes abierta en un panel, o la trajiste a mano. Los dos últimos ganan a
 * la edad a propósito: ir a buscar una de hace un mes, elegirla, y que la regla
 * de la edad la escondiera justo después, es el fallo que `traidas` vino a
 * resolver.
 */
export function saleEnLaBarra(s: Mirable, e: Estanteria): boolean {
  return (
    Boolean(e.verViejas) ||
    esReciente(s) ||
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
  if (Boolean(e.verViejas) || esReciente(s)) return "reciente";
  return null;
}
