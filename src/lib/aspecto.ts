// El aspecto de Adeorq: el cristal sobre tu foto, o uno liso que se lea como una
// terminal de las de siempre.
//
// Nació el 2026-11-21. Alguien que vive en la terminal (dejó Warp por una suya,
// ligera y sin telemetría) vio la portada y dijo «Solo con ver la UI ya sé que
// no es para mí». Se le enseñaron a Munir tres direcciones en el probador y no
// eligió una: quiso VARIAS, «la mejor posible que puedan elegir con estilos
// familiares los que vengan de otros sitios». El cristal sigue de fábrica.
//
// Un aspecto es FORMA, no color: sus colores salen del tema que tengas puesto
// («un tema cambia el color, no la forma»), así que cualquiera de los temas se
// ve en cualquiera de los aspectos. Las reglas están en
// `estilos/42-aspectos.css`, y lo que se le enseñó a Munir, en
// `docs/propuestas/aspectos/`.
//
// Los nombres son genéricos a propósito: ninguno es el de un producto.

const CLAVE = "adeorq-aspecto";

/** El mismo aviso que manda `App.tsx` al cambiar la foto o el tema
    (`FONDO_EVENTO` de `TerminalPane.tsx`): con un aspecto liso el fondo de la
    terminal pasa a ser opaco, y las ya abiertas tienen que releerlo para
    volver al camino rápido de xterm. Va escrito aquí para que `lib/` no tire
    de un componente. Lo oye también `Fondo.tsx`, que pausa el vídeo en un
    estilo liso. */
export const FONDO_EVENTO = "adeorq:fondo";

/** Si el estilo puesto es uno de los lisos, que esconden la foto de fondo. */
export function estiloLiso(): boolean {
  return document.documentElement.hasAttribute("data-aspecto");
}

export type Aspecto = "cristal" | "terminal" | "consola" | "liso";

export const ASPECTOS: readonly Aspecto[] = ["cristal", "terminal", "consola", "liso"];

function esAspecto(v: string | null): v is Aspecto {
  return v !== null && (ASPECTOS as readonly string[]).includes(v);
}

/** Lo elegido, o el cristal de fábrica. */
export function prefAspecto(): Aspecto {
  const v = localStorage.getItem(CLAVE);
  return esAspecto(v) ? v : "cristal";
}

/**
 * Se marca en `<html>`, como la forma de los paneles y el modo rendimiento: el
 * CSS lo ve entero de una vez y ningún componente tiene que repintarse. Con el
 * cristal no hay atributo, así que lo de fábrica queda exactamente como estaba.
 */
export function aplicarAspecto(a: Aspecto): void {
  if (a === "cristal") delete document.documentElement.dataset.aspecto;
  else document.documentElement.dataset.aspecto = a;
}

export function guardarAspecto(a: Aspecto): void {
  localStorage.setItem(CLAVE, a);
  aplicarAspecto(a);
  window.dispatchEvent(new Event(FONDO_EVENTO));
}
