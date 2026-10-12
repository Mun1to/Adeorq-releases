// Qué panel guardado es qué terminal viva, al volver a abrir Adeorq tras una
// caída con las terminales en su propio proceso (`terminales.rs`).
//
// Munir, 2026-10-11, a si los agentes deben morir cuando Adeorq se cae sola:
// «aguantan». El proceso las guarda, y la ventana que vuelve tiene que
// reconocerlas: el tablero restaurado abriría si no un panel nuevo por cada una
// con su `--resume`, y la de verdad seguiría corriendo sin nadie que la viera.
//
// Una terminal viva es de un panel guardado si tiene SU número (el tablero lo
// guarda desde entonces) y además su carpeta o su comando: el número solo no
// basta, que un tablero guardado en otro arranque puede traer el mismo 3 para
// otra cosa. Y lo vivo que no case con nada se enseña como recuperado: nunca se
// mata en silencio.

export interface PanelGuardado {
  /** El número de terminal que tenía al guardarse. */
  pty?: number;
  cwd: string;
  command?: string[];
}

export interface Viva {
  id: number;
  cwd: string;
  command: string[] | null;
}

/** La misma carpeta, como la ve Windows: sin mayúsculas ni barra final. */
export function mismaCarpeta(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  return n(a) === n(b);
}

const mismoComando = (a: string[] | null | undefined, b: string[] | null | undefined) =>
  Boolean(a?.length && b?.length && a.length === b.length && a.every((x, i) => x === b[i]));

/**
 * Empareja los paneles guardados con las terminales vivas. `adoptadas` va por
 * el índice del panel en la lista guardada; `sueltas`, lo vivo que no es de
 * ninguno. Cada terminal viva se adopta una vez como mucho.
 */
export function emparejar(guardados: PanelGuardado[], vivas: Viva[]): { adoptadas: Map<number, Viva>; sueltas: Viva[] } {
  const libres = new Map(vivas.map((v) => [v.id, v]));
  const adoptadas = new Map<number, Viva>();
  guardados.forEach((g, i) => {
    if (g.pty == null) return;
    const v = libres.get(g.pty);
    if (!v) return;
    if (mismaCarpeta(v.cwd, g.cwd) || mismoComando(v.command, g.command)) {
      adoptadas.set(i, v);
      libres.delete(v.id);
    }
  });
  return { adoptadas, sueltas: [...libres.values()].sort((a, b) => a.id - b.id) };
}

/** El primer número libre para un panel nuevo: por encima de todo lo vivo. */
export const siguienteLibre = (actual: number, vivas: Viva[]) => Math.max(actual, ...vivas.map((v) => v.id + 1));
