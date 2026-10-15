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
 * El espejo en el que corre una terminal viva, si corre dentro de uno: el
 * Modo Espejo la hace nacer en `<proyecto>\.adeorq\espejo\<nombre>`
 * (`git_shadow.rs`, con la barra mezclada), no en la carpeta del panel. Con el
 * nombre, el panel que la recoge vuelve a ser de espejo y con SU espejo, el
 * árbol donde el agente sigue escribiendo, en vez de montar uno nuevo y vacío.
 */
export function espejoDe(cwd: string): { proyecto: string; nombre: string } | null {
  const m = /^(.+?)[\\/]\.adeorq[\\/]espejo[\\/]([^\\/]+)[\\/]?$/.exec(cwd);
  return m ? { proyecto: m[1], nombre: m[2] } : null;
}

/** La carpeta del panel es el proyecto de ese espejo, o una de dentro. */
function esDeSuEspejo(viva: string, panel: string): boolean {
  const e = espejoDe(viva);
  if (!e) return false;
  const n = (s: string) => s.replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  return n(panel) === n(e.proyecto) || n(panel).startsWith(`${n(e.proyecto)}\\`);
}

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
    if (mismaCarpeta(v.cwd, g.cwd) || mismoComando(v.command, g.command) || esDeSuEspejo(v.cwd, g.cwd)) {
      adoptadas.set(i, v);
      libres.delete(v.id);
    }
  });
  return { adoptadas, sueltas: [...libres.values()].sort((a, b) => a.id - b.id) };
}

/** El primer número libre para un panel nuevo: por encima de todo lo vivo. */
export const siguienteLibre = (actual: number, vivas: Viva[]) => Math.max(actual, ...vivas.map((v) => v.id + 1));

// ── EL LIENZO ────────────────────────────────────────────────────────────────
//
// El lienzo guarda sus terminales en su propio tablero (`lienzo.json`, el
// `NodoTerm` de `lib/canvasFile.ts`), y lo vivo se reparte UNA vez entre las
// dos vistas: emparejando cada una por su cuenta, una terminal del lienzo
// salía en la Cabina como suelta («· recuperada») y el lienzo abría otra con
// su `--resume` encima, o sea dos agentes sobre la misma sesión.

/** Lo que un nodo de terminal del lienzo trae de su tablero guardado. */
export interface NodoDelLienzo {
  tipo: string;
  id: string;
  ruta?: string;
  cmd?: string[];
  pty?: number;
}

/**
 * Las terminales de un tablero del lienzo como paneles guardados, con el id de
 * su nodo. Un tablero guardado antes de que el nodo llevara su número (`pty`)
 * lo tiene en el id: el nodo de una terminal se llama como su panel (`place`,
 * en `CanvasView`). Solo vale un entero positivo; el id de otra pieza no.
 */
export function panelesDelLienzo(nodos: readonly NodoDelLienzo[]): Array<PanelGuardado & { nodo: string }> {
  return nodos
    .filter((n) => n.tipo === "term")
    .map((n) => ({
      nodo: n.id,
      pty: n.pty ?? (/^[1-9]\d*$/.test(n.id) ? Number(n.id) : undefined),
      cwd: n.ruta ?? "",
      command: n.cmd,
    }));
}

/**
 * Reparte lo vivo entre la Cabina y el lienzo con un solo `emparejar`, la
 * Cabina primero: cada terminal viva es de una vista como mucho, y `sueltas`
 * es lo que no es de ninguna. Los dos mapas van por el índice en SU lista.
 */
export function repartir(
  cabina: PanelGuardado[],
  lienzo: PanelGuardado[],
  vivas: Viva[],
): { cabina: Map<number, Viva>; lienzo: Map<number, Viva>; sueltas: Viva[] } {
  const { adoptadas, sueltas } = emparejar([...cabina, ...lienzo], vivas);
  const deLaCabina = new Map<number, Viva>();
  const delLienzo = new Map<number, Viva>();
  for (const [i, v] of adoptadas) {
    if (i < cabina.length) deLaCabina.set(i, v);
    else delLienzo.set(i - cabina.length, v);
  }
  return { cabina: deLaCabina, lienzo: delLienzo, sueltas };
}

/** Con qué recoge un nodo del lienzo su terminal viva. */
export interface Recogida {
  id: number;
  command?: string[];
  /** El espejo en el que corre, si corre en uno (`espejoDe`). */
  espejo?: string;
}

// Lo que le toca al lienzo pasa de `lib/tablero.ts`, que reparte, al tablero
// que vuelve solo en `CanvasView`: dos sitios sin nada en común por donde pasar
// una prop, como `dejarVolcado`. Es una promesa porque el lienzo tiene que
// ESPERAR al reparto: sin él abriría sus terminales con su `--resume` y con
// números que pueden ser de una viva. Se resuelve una sola vez, y el tablero la
// resuelve en todas sus salidas (vacía si no hay nada que recoger): si no, el
// lienzo se quedaría esperando y no volvería a guardarse.
let entregar: (m: Map<string, Recogida>) => void = () => {};
const porRecoger = new Promise<Map<string, Recogida>>((r) => {
  entregar = r;
});

/** Le da al lienzo, por el id de cada nodo, la terminal viva que recoge. */
export const entregarAlLienzo = (recogidas: Map<string, Recogida>) => entregar(recogidas);

/** Lo que le tocó al lienzo, cuando el tablero lo haya repartido. */
export const lasDelLienzo = () => porRecoger;
