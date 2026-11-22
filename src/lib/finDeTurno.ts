// El fin de un turno de Claude Code, visto en su pantalla y no oído en su campana.
//
// Hasta el 2026-11-11 un panel sabía que su agente había acabado porque sonaba
// la campana del terminal (`term.onBell`), y de ella colgaban el brillo de
// «terminó», su aviso, quien escucha el fin de turno fuera del panel y la raya
// roja y la segunda mitad de compactar con traspaso (`lib/contexto.ts`). Pero
// Claude Code 2.1.322 no la toca al acabar: la campana es uno de los canales de
// su aviso «Claude is waiting for your input», que sale a los 60 s de quedarse
// parado (`messageIdleNotifThresholdMs`), y con el canal de fábrica («auto»)
// solo avisa en Terminal de Apple, iTerm, kitty y ghostty. En un panel de
// Adeorq: nunca. Medido con `scripts/laboratorio/campana-de-verdad.mjs`.
//
// Lo que sí se ve es el paso de trabajar a parado: mientras dura el turno su pie
// dice «· esc to interrupt» (`trabajaEnPantalla`), y al acabar se queda en su
// caja vacía sin él (`esperaEnSuCaja`). Igual en el renderizador clásico que en
// el de pantalla completa. Este detector lo convierte en un fin de turno, una
// vez por turno, y se pone de acuerdo con la campana para que, si también suena
// (otro CLI, una versión que sí la toque, o el aviso del minuto con
// `terminal_bell`), el mismo turno no se anuncie dos veces.
//
// Sin React, para que el banco lo pase entero (`scripts/contexto-check.ts`):
// `crearFinDeTurno` no tiene relojes (quien lo usa le dice lo que ve y, si le
// pide volver a mirar, programa él la vuelta), y a `engancharFinDeTurno` se le
// pueden dar de fuera.

import { enPantalla, trabajaEnPantalla } from "./contexto";
import { esperaEnSuCaja } from "./cajaClaude";

/** Lo que tiene que durar parado, tras verlo trabajar, para que sea el fin y no
    un respiro entre dos pasos del mismo turno. */
export const ASIENTO_FIN_MS = 2000;
/** Como mucho una mirada cada tanto mientras el programa escribe: leer la
    pantalla en cada trozo, con el spinner repintando y nueve paneles, se nota. */
export const MIRAR_CADA_MS = 250;
/** Lo que vale un fin anunciado para `finReciente`: más que lo que tarda el
    transcript en decir lo mismo (se relee cada 20 s). */
export const FIN_RECIENTE_MS = 30_000;

/** Lo que se ve ahora en el panel. */
export interface VistaDeTurno {
  /** Su pie dice que el turno sigue (`trabajaEnPantalla`). */
  trabajando: boolean;
  /** Parado en su caja vacía, sin un menú suyo delante (`esperaEnSuCaja`). */
  parada: boolean;
}

/** `fin`: acaba de terminar un turno, y no se ha dicho. `volverEn`: está
    parado pero aún no asentado; que se vuelva a mirar dentro de tantos ms,
    aunque no llegue nada más del programa (parado no escribe). */
export interface Mirada {
  fin: boolean;
  volverEn?: number;
}

export function crearFinDeTurno(ahora: () => number = Date.now) {
  /** Lo ha visto trabajar desde el último fin dicho. */
  let trabajo = false;
  /** Desde cuándo lo ve parado tras trabajar. */
  let paradaDesde: number | null = null;
  /** El último fin ya se dijo (por aquí o por la campana) y desde entonces no
      ha vuelto a trabajar: otra campana es del mismo turno. Al abrir, nada
      dicho, para que la primera campana valga como siempre. */
  let dicho = false;

  const decir = () => {
    trabajo = false;
    paradaDesde = null;
    dicho = true;
  };

  return {
    mirar(v: VistaDeTurno): Mirada {
      if (v.trabajando) {
        trabajo = true;
        paradaDesde = null;
        dicho = false;
        return { fin: false };
      }
      if (!trabajo || !v.parada) {
        paradaDesde = null;
        return { fin: false };
      }
      const t = ahora();
      paradaDesde ??= t;
      const falta = paradaDesde + ASIENTO_FIN_MS - t;
      if (falta > 0) return { fin: false, volverEn: falta };
      decir();
      return { fin: true };
    },
    /** Sonó la campana: `true` si toca anunciarlo, `false` si es del turno que
        ya se dijo. */
    campana(): boolean {
      if (dicho) return false;
      decir();
      return true;
    },
  };
}

/** Lo que tarda en apagarse «trabajando» desde que su pie deja de decirlo: lo
    mismo que el asiento del fin, para que un respiro entre dos pasos no corte
    el tramo azul del borde y para que, al acabar, el azul y el amarillo se
    releven en la misma mirada. */
export const SUELTA_TRABAJO_MS = ASIENTO_FIN_MS;

/**
 * Si el panel está trabajando ahora, para el borde (`lib/aroDeEstado.ts`). Se
 * enciende en cuanto se ve trabajar y se apaga tras `SUELTA_TRABAJO_MS` sin
 * verlo. `ver` dice si cambió y, si está esperando para apagarse, cuándo volver
 * a mirar (parado no escribe nada que lo despierte).
 */
export function crearTrabajando(ahora: () => number = Date.now) {
  let si = false;
  let sinVerDesde: number | null = null;
  return {
    get si() {
      return si;
    },
    ver(trabajando: boolean): { cambio: boolean; volverEn?: number } {
      if (trabajando) {
        sinVerDesde = null;
        if (si) return { cambio: false };
        si = true;
        return { cambio: true };
      }
      if (!si) return { cambio: false };
      const t = ahora();
      sinVerDesde ??= t;
      const falta = sinVerDesde + SUELTA_TRABAJO_MS - t;
      if (falta > 0) return { cambio: false, volverEn: falta };
      si = false;
      sinVerDesde = null;
      return { cambio: true };
    },
    /** Apagado ya (un fin de turno dicho, o una terminal que ya no se sabe
        leer). `true` si estaba encendido. */
    soltar(): boolean {
      sinVerDesde = null;
      if (!si) return false;
      si = false;
      return true;
    },
  };
}

/** Cómo se lee en una pantalla que el programa está trabajando
    (`trabajaEnPantalla`, o el `trabaja` de `lectorDeCaja`). */
export type LeerTrabajo = (linea: (i: number) => string, filas: number) => boolean;

/** Lo que hace falta de un terminal de xterm. */
export interface TerminalDeTurno {
  rows: number;
  buffer: { active: { baseY: number; getLine(y: number): { translateToString(trim?: boolean): string } | undefined } };
  onBell(cb: () => void): { dispose(): void };
  onWriteParsed(cb: () => void): { dispose(): void };
}

/**
 * La campana y el detector colgados de un terminal: `alAcabar` corre una vez
 * por turno, lo diga quien lo diga. El detector solo mira donde corre Claude
 * Code (`esClaude`, que se pregunta cada vez: el panel sabe lo que corre
 * después de montar el terminal); en los demás la campana dispara siempre, como
 * antes. Se mira tras lo que escribe el programa, como mucho cada
 * `MIRAR_CADA_MS`, y otra vez al asentarse (parado no escribe nada).
 *
 * Con `alTrabajar`, de paso dice cuándo empieza y cuándo deja de trabajar
 * (`crearTrabajando`), leído con `trabajaCon`: el lector de SU CLI, o `null`
 * si su pantalla no se sabe leer. Sin él, solo donde corre Claude Code.
 * Devuelve con qué soltarlo.
 */
export function engancharFinDeTurno(
  term: TerminalDeTurno,
  o: {
    esClaude: () => boolean;
    alAcabar: () => void;
    alTrabajar?: (si: boolean) => void;
    trabajaCon?: () => LeerTrabajo | null;
    ahora?: () => number;
    programar?: (f: () => void, ms: number) => () => void;
  },
): () => void {
  const ahora = o.ahora ?? Date.now;
  const programar =
    o.programar ??
    ((f: () => void, ms: number) => {
      const t = setTimeout(f, ms);
      return () => clearTimeout(t);
    });
  const fin = crearFinDeTurno(ahora);
  const trabajo = crearTrabajando(ahora);
  const trabajaCon = o.trabajaCon ?? (() => (o.esClaude() ? trabajaEnPantalla : null));
  let ultima = -Infinity;
  /** La próxima mirada ya programada, y cuándo cae. */
  let luego: { cancelar: () => void; en: number } | null = null;
  const soltarTrabajo = () => {
    if (trabajo.soltar()) o.alTrabajar?.(false);
  };
  const mirar = () => {
    luego?.cancelar();
    luego = null;
    const claude = o.esClaude();
    const lee = o.alTrabajar ? trabajaCon() : null;
    if (!lee) soltarTrabajo();
    if (!claude && !lee) return;
    ultima = ahora();
    let pie: boolean | undefined;
    const trabajando = () => (pie ??= enPantalla(term, trabajaEnPantalla));
    if (lee) {
      const t = trabajo.ver(lee === trabajaEnPantalla ? trabajando() : enPantalla(term, lee));
      if (t.cambio) o.alTrabajar?.(trabajo.si);
      if (t.volverEn != null) dentroDe(t.volverEn);
    }
    if (!claude) return;
    const r = fin.mirar({ trabajando: trabajando(), parada: enPantalla(term, esperaEnSuCaja) });
    if (r.fin) {
      soltarTrabajo();
      o.alAcabar();
    } else if (r.volverEn != null) dentroDe(r.volverEn);
  };
  const dentroDe = (ms: number) => {
    const en = ahora() + ms;
    if (luego && luego.en <= en) return;
    luego?.cancelar();
    luego = { cancelar: programar(mirar, ms), en };
  };
  const escrito = term.onWriteParsed(() => {
    const falta = ultima + MIRAR_CADA_MS - ahora();
    if (falta <= 0) mirar();
    else dentroDe(falta);
  });
  const campana = term.onBell(() => {
    if (o.esClaude() && !fin.campana()) return;
    o.alAcabar();
  });
  return () => {
    escrito.dispose();
    campana.dispose();
    luego?.cancelar();
  };
}

/** Cuándo anunció cada panel su último fin de turno (`apuntarFin`). Es para
    App: el salto a la sesión que termina cuelga también del transcript
    (`acabaDeReclamar`), que dice lo mismo hasta 20 s más tarde, y sin esto el
    mismo turno saltaba dos veces. */
const FINES = new Map<number, number>();
export function apuntarFin(id: number, ahora = Date.now()): void {
  FINES.set(id, ahora);
}
export function finReciente(id: number, ahora = Date.now()): boolean {
  const t = FINES.get(id);
  return t != null && ahora - t < FIN_RECIENTE_MS;
}
