// Arrastrar un archivo del árbol hasta una terminal, para dejarle su ruta escrita.
//
// Va POR PUNTERO y no con el arrastre nativo del navegador (`draggable`), y no
// es por gusto: en la ventana de verdad el nativo no llega a la página. Tauri
// nace con `dragDropEnabled` y se queda el gesto (ver el comentario de «Soltar
// archivos sobre una terminal» en `App.tsx`), y por eso mover un panel
// (`lib/moverPanel.ts`) y las tarjetas del tablero (`CanvasKanban.tsx`) también
// van así. En un navegador de pruebas el nativo sí funciona, que es justo lo que
// lo hace traicionero: daría verde sin demostrar nada.
//
// La terminal de destino se reconoce por su `data-pane-id`, que llevan todas,
// también las del lienzo. Mientras llevas el archivo se marca con `data-recibe`,
// un atributo que React no pinta y por tanto no pisa.

import { levantar, type Fantasma } from "./fantasma";

/** Por debajo de esto es el temblor de un clic, no un gesto. */
const UMBRAL_PX = 6;
/** Cuánto dura «acabo de arrastrar», para tragarse el clic que llega detrás. */
const ECO_MS = 250;

let ultimoArrastre = 0;

/** Si se acaba de soltar un arrastre: el clic que el navegador manda después
    sobre la misma fila no es un clic, es el final del gesto. */
export const acabaDeArrastrar = (ahora = Date.now()) => ahora - ultimoArrastre < ECO_MS;

/** Lo que se le deja escrito a la terminal: la ruta entre comillas y un espacio
    detrás, para escribir al lado qué quieres que haga con ella. Sin Intro, como
    todo lo que Adeorq deja escrito en una terminal. */
export const lineaDeRuta = (ruta: string) => `"${ruta}" `;

/** La terminal que hay bajo ese punto de la ventana, o nada. */
function terminalBajo(x: number, y: number): HTMLElement | null {
  return (document.elementFromPoint(x, y)?.closest("[data-pane-id]") as HTMLElement | null) ?? null;
}

/**
 * Empieza a vigilar un posible arrastre desde una fila del árbol. Se llama en
 * su `pointerdown`; si el puntero no se mueve, no pasa nada y el clic sigue su
 * curso. `alSoltar` recibe el número de la terminal donde cayó.
 */
export function vigilarArrastre(
  e: { button: number; clientX: number; clientY: number; currentTarget: HTMLElement },
  alSoltar: (panel: number, destino: HTMLElement) => void,
): void {
  if (e.button !== 0) return;
  const fila = e.currentTarget;
  const origen = { x: e.clientX, y: e.clientY };
  let fantasma: Fantasma | null = null;
  let sobre: HTMLElement | null = null;

  const marcar = (terminal: HTMLElement | null) => {
    if (terminal === sobre) return;
    sobre?.removeAttribute("data-recibe");
    terminal?.setAttribute("data-recibe", "true");
    sobre = terminal;
  };
  const mover = (ev: PointerEvent) => {
    if (!fantasma) {
      if (Math.hypot(ev.clientX - origen.x, ev.clientY - origen.y) < UMBRAL_PX) return;
      fantasma = levantar(fila, origen.x, origen.y);
      fila.setAttribute("data-moviendo", "true");
    }
    fantasma.mover(ev.clientX, ev.clientY);
    marcar(terminalBajo(ev.clientX, ev.clientY));
  };
  const acabar = (x: number, y: number, suelta: boolean) => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", alLevantar);
    window.removeEventListener("pointercancel", alCancelar);
    window.removeEventListener("keydown", alTeclear, true);
    if (!fantasma) return;
    fantasma.soltar();
    fila.removeAttribute("data-moviendo");
    ultimoArrastre = Date.now();
    const destino = suelta ? terminalBajo(x, y) : null;
    marcar(null);
    const panel = Number(destino?.getAttribute("data-pane-id"));
    if (destino && Number.isFinite(panel)) alSoltar(panel, destino);
  };
  const alLevantar = (ev: PointerEvent) => acabar(ev.clientX, ev.clientY, true);
  const alCancelar = () => acabar(0, 0, false);
  const alTeclear = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !fantasma) return;
    ev.stopPropagation();
    acabar(0, 0, false);
  };
  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", alLevantar);
  window.addEventListener("pointercancel", alCancelar);
  window.addEventListener("keydown", alTeclear, true);
}
