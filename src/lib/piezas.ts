// Qué piezas puede llevar el lienzo, como datos y no como componentes.
//
// Vive aquí y no junto a los widgets porque quien más lo necesita es el lector
// del archivo del lienzo (`canvasFile.ts`), que tiene que rechazar una pieza
// que no existe sin arrastrar React para averiguarlo. Una sola lista, y las
// dos partes miran a la misma: si se duplicara, un widget nuevo se guardaría
// bien y al abrir el archivo desaparecería sin decir nada.

/** Los cacharros: cosas que corren solas al lado del trabajo. */
export const CACHARROS = ["pomodoro", "crono", "cuenta", "calc", "cal"] as const;

/** Las utilidades: lo que uno abre una web para hacer, hecho en casa. */
export const UTILIDADES = [
  "json",
  "regex",
  "diff",
  "code",
  "hash",
  "pass",
  "id",
  "color",
  "stats",
] as const;

export const WIDGET_KINDS = [...CACHARROS, ...UTILIDADES] as const;

export type CacharroKind = (typeof CACHARROS)[number];
export type ToolKind = (typeof UTILIDADES)[number];
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export function esWidgetKind(v: unknown): v is WidgetKind {
  return typeof v === "string" && (WIDGET_KINDS as readonly string[]).includes(v);
}

/** Las tipografías del texto del lienzo. Los nombres viven aquí por lo mismo
    que los de las piezas: el lector del archivo tiene que poder comprobarlos
    sin cargar el componente que las dibuja. */
export const FONT_IDS = ["app", "mono", "serif", "mano", "titular"] as const;

export type FontId = (typeof FONT_IDS)[number];

export function esFontId(v: unknown): v is FontId {
  return typeof v === "string" && (FONT_IDS as readonly string[]).includes(v);
}
