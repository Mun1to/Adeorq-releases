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
  /** El proyecto donde la barra la lista, ya con el traslado a mano de Munir
      aplicado (`ui.sessionProject`). Solo hace falta para `viejasDe`. */
  project?: string;
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
  /** Los proyectos donde pediste ver las antiguas, de uno en uno (`ui.viejasDe`).
      Munir, 2026-10-07, segunda vez con la misma pregunta («desaparecen
      sesiones de los proyectos… la de Vibeset no está»): el botón global del
      final de la barra no lo ve nadie, así que cada proyecto dice cuántas
      esconde y las abre solo él. */
  viejasDe?: ReadonlySet<string>;
}

/** ¿Pediste ver las antiguas de este proyecto en concreto? */
function abiertaPorProyecto(s: Mirable, e: Estanteria): boolean {
  return s.project !== undefined && Boolean(e.viejasDe?.has(s.project));
}

/**
 * Cuántas esconde cada proyecto por viejas: ni abiertas, ni traídas, ni
 * pedidas. Las archivadas quedan fuera, que ya tienen su propio sitio. Es lo
 * que pinta la fila «N más antiguas» de cada proyecto.
 */
export function viejasPorProyecto<S extends Mirable>(
  sesiones: readonly S[],
  archivadas: ReadonlySet<string>,
  e: Estanteria,
  dondeDe: (s: S) => string,
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const s of sesiones) {
    if (archivadas.has(s.id)) continue;
    const donde = dondeDe(s);
    if (saleEnLaBarra({ ...s, project: donde }, e)) continue;
    cuenta.set(donde, (cuenta.get(donde) ?? 0) + 1);
  }
  return cuenta;
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
    abiertaPorProyecto(s, e) ||
    esReciente(s) ||
    e.enPantalla.has(s.id) ||
    e.traidas.has(s.id)
  );
}

/**
 * Cuánto puede escribirse una conversación DESPUÉS de su rastro sin contar
 * como retomada. `hours` llega redondeado a la décima (seis minutos), y el CLI
 * puede soltar su última línea justo al morir.
 */
export const MARGEN_DEL_CIERRE_MS = 10 * 60 * 1000;

/**
 * Las que se archivan solas: las que un agente abrió, terminó y cerró con su
 * rastro (`close_pane`), y que nadie ha vuelto a tocar.
 *
 * Munir, 2026-10-21, con 36 conversaciones en el proyecto Adeorq: «hay
 * demasiadas sesiones… que esto no vuelva a pasar». De las 35 de los últimos
 * treinta días, 22 eran eso: `close_pane` se lleva el panel y apunta el rastro,
 * pero la conversación es de Claude Code y se quedaba en la barra un mes. Se
 * archivan sin escribir nada en el estado de la barra, así que dejan de
 * archivarse solas en cuanto alguien las retoma (se escribe en ellas después
 * del rastro), las tienes abiertas en un panel o las desarchivas tú (van a
 * `traidas`, que es «esta la quiero a la vista»). Siguen en «Archivadas»,
 * y el rastro guarda cómo retomarlas.
 *
 * Y las traídas a mano, cuando llevan un mes sin tocarse: ni escritas ni
 * traídas otra vez (`traidasEn`). Munir, 2026-10-22 (D5, «que se archiven
 * solas»): diecisiete de hace dos meses seguían en la barra porque un día las
 * trajo con el ＋, y ser traída las libraba de todo para siempre. Las de antes
 * de ese día no tienen fecha y cuentan desde su última escritura. Lo fijado no
 * se archiva nunca.
 */
export function archivadasSolas(
  sesiones: readonly Mirable[],
  cerradas: ReadonlyMap<string, number>,
  e: Pick<Estanteria, "enPantalla" | "traidas"> & {
    traidasEn?: Readonly<Record<string, number>>;
    fijadas?: readonly string[];
  },
  ahoraMs: number,
): Set<string> {
  const solas = new Set<string>();
  const fijadas = new Set(e.fijadas ?? []);
  for (const s of sesiones) {
    if (e.enPantalla.has(s.id)) continue;
    const ultimaVez = ahoraMs - s.hours * 3_600_000;
    if (e.traidas.has(s.id)) {
      const desde = Math.max(ultimaVez, e.traidasEn?.[s.id] ?? 0);
      if (!fijadas.has(s.id) && ahoraMs - desde > HORAS_EN_LA_BARRA * 3_600_000) solas.add(s.id);
      continue;
    }
    const cerrada = cerradas.get(s.id);
    if (cerrada !== undefined && ultimaVez <= cerrada + MARGEN_DEL_CIERRE_MS) solas.add(s.id);
  }
  return solas;
}

/** `traidasEn` con estas conversaciones traídas (o desarchivadas) ahora. */
export function conFecha(
  traidasEn: Readonly<Record<string, number>> | undefined,
  ids: readonly string[],
  ahoraMs = Date.now(),
): Record<string, number> {
  const out = { ...traidasEn };
  for (const id of ids) out[id] = ahoraMs;
  return out;
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
  if (Boolean(e.verViejas) || abiertaPorProyecto(s, e) || esReciente(s)) return "reciente";
  return null;
}
