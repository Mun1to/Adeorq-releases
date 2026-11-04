// El Ctrl+C de después de arrastrar para copiar.
//
// Un programa que lleva el ratón (Claude Code a pantalla completa) hace suyo el
// arrastre: pinta la selección y copia al soltar, por OSC 52 (`lib/pegado.ts`).
// xterm no tiene selección, así que el Ctrl+C que se pulsa después por costumbre
// le llegaba al programa como interrupción, y cortaba al agente.
//
// Durante unos 3 s tras un arrastre que copió de verdad, ese Ctrl+C no se manda.
// Si el arrastre no copió (otro programa, o Claude Code con el copiar al soltar
// apagado), llega como siempre: ahí el Ctrl+C es lo único que queda para copiar.
//
// Con la selección puesta, Claude Code se come el primero (copia y la borra), así
// que lo que de verdad cortaba era el segundo, o el primero si la selección ya no
// estaba (medido con su 2.1.317 en `scripts/laboratorio/ctrl-c-arrastre-de-verdad.mjs`).
//
// Banco: `pnpm bancos ctrl-c-arrastre`.

import { textoDeOsc52 } from "./pegado";

/** Cuánto dura. */
export const TRAS_ARRASTRAR_MS = 3000;

/** Lo que se mueve un clic con el pulso temblón sin ser un arrastre. */
const MINIMO_PX = 4;

export function crearCtrlCTrasArrastrar(ahora: () => number = () => performance.now()) {
  let bajo: { x: number; y: number; t: number } | null = null;
  let arrastre: { desde: number; hasta: number } | null = null;
  let copia = Number.NEGATIVE_INFINITY;
  return {
    alBajar(x: number, y: number) {
      bajo = { x, y, t: ahora() };
      arrastre = null;
    },
    alSoltar(x: number, y: number) {
      if (bajo && Math.hypot(x - bajo.x, y - bajo.y) >= MINIMO_PX) arrastre = { desde: bajo.t, hasta: ahora() };
      bajo = null;
    },
    /** El programa acaba de copiar por OSC 52. */
    alCopiar() {
      copia = ahora();
    },
    /** Si este Ctrl+C, sin selección de xterm, no se le manda al programa. */
    seTraga(): boolean {
      return !!arrastre && copia >= arrastre.desde && ahora() - arrastre.hasta < TRAS_ARRASTRAR_MS;
    },
  };
}

/** Lo mismo, escuchando el ratón de esa terminal y su OSC 52. `soltar` se llama al
 *  cerrarla. El soltar se mira en la ventana: el arrastre puede acabar fuera del
 *  panel. El OSC contesta `false` para que lo atienda también `copiarPorOsc52`, que
 *  es quien copia: xterm llama primero al último que se engancha. */
export function engancharCtrlCTrasArrastrar(
  el: HTMLElement,
  term: { parser: { registerOscHandler(id: number, f: (datos: string) => boolean): { dispose(): void } } },
) {
  const a = crearCtrlCTrasArrastrar();
  const baja = (e: MouseEvent) => {
    if (e.button === 0) a.alBajar(e.clientX, e.clientY);
  };
  const suelta = (e: MouseEvent) => {
    if (e.button === 0) a.alSoltar(e.clientX, e.clientY);
  };
  el.addEventListener("mousedown", baja, true);
  window.addEventListener("mouseup", suelta, true);
  const osc = term.parser.registerOscHandler(52, (datos) => {
    if (textoDeOsc52(datos)) a.alCopiar();
    return false;
  });
  return {
    seTraga: a.seTraga,
    soltar() {
      el.removeEventListener("mousedown", baja, true);
      window.removeEventListener("mouseup", suelta, true);
      osc.dispose();
    },
  };
}
