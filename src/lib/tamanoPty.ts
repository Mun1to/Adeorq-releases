/* Que el proceso acabe SIEMPRE con el último tamaño que se le pidió.
 *
 * ── EL FALLO (2026-09-10) ────────────────────────────────────────────────────
 *
 * Munir, con una captura: un panel ancho y Claude Code escribiendo a 77
 * columnas, con media pantalla vacía a la derecha. El búfer de ese panel lo
 * contaba solo: el proceso había repintado a 77, luego a 110, y el último
 * repintado volvía a 77, con las filas casi iguales (28 y 27). Un vaivén de
 * anchura: el panel se estrechó y se ensanchó, y el proceso se quedó con el
 * tamaño de en medio.
 *
 * La causa es una CARRERA y no un cálculo. `pty_resize` es un comando `async`,
 * y Tauri lanza cada llamada como una tarea independiente del runtime de Tokio,
 * que es multihilo. Cuando el ancho cambia por una animación (un panel que se
 * desliza), el ResizeObserver dispara en cada frame con un ancho intermedio, y
 * cada frame mandaba su tamaño en cuanto lo tenía: cinco o seis en vuelo a la
 * vez, y el ConPTY se queda con **el último que se ejecuta, no el último que
 * se pidió**. Y como cada respuesta marcaba su tamaño como confirmado, el que
 * contestaba el último ganaba la marca aunque no fuera el que quedó puesto.
 * A partir de ahí `sincronizarPty` veía la marca igual que la rejilla y no
 * volvía a mandar nada, nunca.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────
 *
 * Un solo `pty_resize` en vuelo por terminal. Lo que se pida mientras tanto se
 * guarda, y al volver la respuesta se manda LO ÚLTIMO pedido si difiere de lo
 * que el proceso ya tiene. Así el orden de ejecución en Rust no puede
 * reordenar nada, porque nunca hay dos que reordenar.
 *
 * Es un módulo aparte y sin React para poderlo probar sin navegador:
 * `scripts/tamano-check.ts` reproduce la carrera con un PTY de mentira que
 * contesta en desorden, enseña el número del fallo con la lógica de antes, y
 * comprueba que con esta no pasa. El mismo orden desordenado, pero en un
 * ConPTY de verdad y con el Tokio de verdad, está medido en `src-tauri/src/
 * pty.rs` (`cargo test --lib carrera -- --ignored --nocapture`). */

/** Un tamaño de rejilla, en celdas. */
export interface Tamano {
  cols: number;
  rows: number;
}

export interface ColaDeTamanos {
  /** Que el proceso acabe con ESTE tamaño. Se puede llamar en cada frame. */
  pedir(t: Tamano): void;
  /**
   * El vigilante: si el proceso no tiene lo que la rejilla tiene y no hay
   * nada en vuelo, se vuelve a pedir. Devuelve si hizo falta. Es lo que hace
   * que un desacuerdo no pueda DURAR, venga de donde venga.
   */
  asegurar(t: Tamano): boolean;
  /** Lo último que el proceso ha CONFIRMADO, que no es lo último pedido. */
  confirmado(): Tamano;
  /** Un PTY nuevo no sabe nada: el siguiente `pedir` manda seguro. */
  olvidar(): void;
  /** No mandar nada hasta que esto resuelva (el arranque del PTY). */
  esperar(puerta: Promise<unknown>): void;
  /** Resuelve cuando no queda nada en vuelo ni pendiente. Para los bancos. */
  quieta(): Promise<void>;
  /** Una línea con lo que hay dentro, para el rastro. */
  estado(): string;
}

/**
 * Cuánto se espera la respuesta de un viaje antes de darlo por perdido.
 *
 * Un `pty_resize` tarda unos 140 ms en un ConPTY normal (medido), y el propio
 * `pty.rs` avisa de que el ConPTY de un panel colgado puede no contestar
 * JAMÁS. Con un solo viaje en vuelo por terminal, uno que no vuelve dejaría la
 * cola muda para siempre: el 2026-09-10, un minuto después de reiniciar la
 * 0.9.156, dos paneles tenían el proceso a 80 columnas y la rejilla más
 * estrecha, y nada volvía a mandar nada. Pasado esto, el viaje se da por
 * perdido (sin confirmar) y sale el siguiente.
 */
export const SIN_RESPUESTA_MS = 5_000;

const NADA: Tamano = { cols: 0, rows: 0 };
const igual = (a: Tamano, b: Tamano) => a.cols === b.cols && a.rows === b.rows;

/**
 * `mandar` es lo que habla con Rust (`resizePty`). Puede fallar: un PTY que
 * todavía no existe contesta «no such pty», y un panel colgado puede no
 * contestar. Un fallo no confirma nada, y el siguiente `pedir` lo vuelve a
 * intentar. No se reintenta solo, a propósito: sin PTY sería un bucle. Quien
 * reintenta es `asegurar`, desde un reloj lento y solo si hay desacuerdo.
 */
export function colaDeTamanos(
  mandar: (t: Tamano) => Promise<void>,
  sinRespuestaMs = SIN_RESPUESTA_MS,
): ColaDeTamanos {
  let confirmado: Tamano = NADA;
  let pendiente: Tamano | null = null;
  let enVuelo = false;
  let puerta: Promise<unknown> = Promise.resolve();
  let avisos: Array<() => void> = [];

  const quietaYa = () => !enVuelo && (pendiente === null || igual(pendiente, confirmado));
  const avisar = () => {
    if (!quietaYa()) return;
    const a = avisos;
    avisos = [];
    for (const f of a) f();
  };

  const bombear = () => {
    if (enVuelo) return;
    const t = pendiente;
    pendiente = null;
    if (!t || igual(t, confirmado)) {
      avisar();
      return;
    }
    enVuelo = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const tope = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new Error("sin respuesta")), sinRespuestaMs);
    });
    void Promise.race([puerta.then(() => mandar(t)), tope])
      .then(
        () => {
          confirmado = t;
        },
        () => {
          /* No llegó, o no a tiempo. `confirmado` se queda como estaba, que es
             la verdad: el proceso sigue con lo de antes. Si el viaje tardío
             acaba llegando, el proceso tendrá otro tamaño del que aquí consta,
             y `asegurar` lo vuelve a cuadrar en la siguiente vuelta. */
        },
      )
      .then(() => {
        clearTimeout(reloj);
        enVuelo = false;
        bombear();
      });
  };

  const pedir = (t: Tamano) => {
    // Una rejilla de cero no es un tamaño: es un panel oculto o sin medir.
    if (!(t.cols > 0) || !(t.rows > 0)) return;
    pendiente = { cols: t.cols, rows: t.rows };
    bombear();
  };

  return {
    pedir,
    asegurar(t) {
      if (enVuelo || !(t.cols > 0) || !(t.rows > 0) || igual(t, confirmado)) return false;
      pedir(t);
      return true;
    },
    confirmado: () => confirmado,
    olvidar() {
      confirmado = NADA;
    },
    esperar(p) {
      puerta = p;
    },
    quieta() {
      if (quietaYa()) return Promise.resolve();
      return new Promise((r) => avisos.push(r));
    },
    estado() {
      const p = pendiente ? `${pendiente.cols}x${pendiente.rows}` : "-";
      return `confirmado=${confirmado.cols}x${confirmado.rows} enVuelo=${enVuelo} pendiente=${p}`;
    },
  };
}
