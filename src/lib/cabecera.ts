// Qué pestañas salen en la cabecera y en qué orden.
//
// Nueve pestañas fijas, iguales para todo el mundo y en el orden en que se
// escribieron: eso funciona el primer día y deja de funcionar al mes, cuando ya
// sabes que hay tres a las que no vas a entrar nunca y una a la que entras
// veinte veces al día y está la séptima (Munir, 2026-08-08).
//
// Las dos reglas que sostienen esto, decididas por él:
//
//  1. Lo que apagas DESAPARECE, no se esconde en un «⋯». Un menú que guarda lo
//     que no usas es sitio ocupado por lo que no usas, más un clic.
//  2. El teclado sigue llegando aunque la pestaña no esté. Apagar es
//     «quítamelo de la vista», no «bórrame la función»: una pestaña fuera de
//     la cabecera se sigue abriendo desde la paleta (Ctrl+K, `lib/paleta.ts`,
//     que las lista todas), y también la abren los botones de otras pantallas
//     que llevan a ella. Hasta el 2026-10-10 aquí ponía «con su Alt+letra», un
//     atajo que nunca llegó a existir.
//
// De ahí sale la única regla dura: `ajustes` no se puede apagar. Es donde se
// vuelven a encender las demás, y dejar apagar la puerta de vuelta es dejar que
// alguien se encierre fuera.

export type ClaveTab = string;

export const TAB_FIJA: ClaveTab = "ajustes";
export const CABECERA_KEY = "adeorq-cabecera";

export interface Cabecera {
  /** El orden que él ha puesto. Vacío mientras no toque nada. */
  orden: ClaveTab[];
  /** Las apagadas. `ajustes` nunca entra aquí, ni aunque venga en el archivo. */
  ocultas: ClaveTab[];
}

export const CABECERA_DEFECTO: Cabecera = { orden: [], ocultas: [] };

function lista(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
}

export function limpiar(c: Partial<Cabecera> | null | undefined): Cabecera {
  if (!c) return { ...CABECERA_DEFECTO };
  return {
    // Sin repetidos: un mismo nombre dos veces en el orden dejaría una pestaña
    // duplicada en la fila y a React quejándose de dos hijos con la misma key.
    orden: [...new Set(lista(c.orden))],
    ocultas: [...new Set(lista(c.ocultas))].filter((k) => k !== TAB_FIJA),
  };
}

/** Las cuatro pestañas que se tragó el Perfil el 2026-10-17 (`lib/vistas.ts`). */
export const DENTRO_DEL_PERFIL: ClaveTab[] = ["agenda", "memoria", "cuentas", "comandos"];

/**
 * Lo guardado antes del Perfil, puesto al día sin perderle nada.
 *
 * El Perfil ocupa en tu orden el sitio de la primera de las cuatro que se
 * tragó, así que si habías subido Cuentas al segundo puesto, ahí sale el
 * Perfil. Y sale apagado solo si las cuatro estaban apagadas: era tu forma de
 * decir que nada de eso te hacía falta en la fila. Lo demás, igual.
 */
export function alPerfil(c: Cabecera): Cabecera {
  const dentro = new Set(DENTRO_DEL_PERFIL);
  if (!c.orden.some((k) => dentro.has(k)) && !c.ocultas.some((k) => dentro.has(k))) return c;
  const orden: ClaveTab[] = [];
  for (const k of c.orden) {
    if (!dentro.has(k)) orden.push(k);
    else if (!orden.includes("perfil")) orden.push("perfil");
  }
  const ocultas = c.ocultas.filter((k) => !dentro.has(k));
  if (DENTRO_DEL_PERFIL.every((k) => c.ocultas.includes(k))) ocultas.push("perfil");
  return limpiar({ orden, ocultas });
}

export function leerCabecera(): Cabecera {
  try {
    const crudo = localStorage.getItem(CABECERA_KEY);
    if (!crudo) return { ...CABECERA_DEFECTO };
    return alPerfil(limpiar(JSON.parse(crudo) as Partial<Cabecera>));
  } catch {
    // Un JSON roto no puede dejar a Adeorq sin cabecera.
    return { ...CABECERA_DEFECTO };
  }
}

export function guardarCabecera(c: Cabecera): void {
  localStorage.setItem(CABECERA_KEY, JSON.stringify(limpiar(c)));
}

/**
 * La cabecera de verdad: las pestañas que se van a pintar, ya ordenadas.
 *
 * Lo que él colocó va primero y en su orden; lo que no, detrás y en el orden de
 * fábrica. Eso es lo que hace que una pestaña NUEVA de una versión futura
 * aparezca sola en vez de quedarse fuera para siempre por no estar en una lista
 * guardada hace meses.
 */
export function visibles<T extends { key: ClaveTab }>(todas: T[], c: Cabecera): T[] {
  const { orden, ocultas } = limpiar(c);
  const puesto = new Map(orden.map((k, i) => [k, i]));
  const fuera = new Set(ocultas);
  return todas
    .filter((t) => !fuera.has(t.key))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const ia = puesto.get(a.t.key);
      const ib = puesto.get(b.t.key);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      // Ninguna colocada a mano: manda el orden de fábrica, y `i` lo conserva
      // porque `sort` en JS no promete ser estable con comparadores raros.
      return a.i - b.i;
    })
    .map((x) => x.t);
}

/** Todas en el orden en que se ven en la lista de Ajustes: primero las que
    salen en la cabecera, luego las apagadas, para poder recuperarlas. */
export function paraAjustes<T extends { key: ClaveTab }>(todas: T[], c: Cabecera): T[] {
  const dentro = visibles(todas, c);
  const yaEstan = new Set(dentro.map((t) => t.key));
  return [...dentro, ...todas.filter((t) => !yaEstan.has(t.key))];
}

export function estaOculta(c: Cabecera, k: ClaveTab): boolean {
  return k !== TAB_FIJA && limpiar(c).ocultas.includes(k);
}

/** Encender o apagar una. `ajustes` no se deja apagar nunca. */
export function alternar(c: Cabecera, k: ClaveTab): Cabecera {
  const limpia = limpiar(c);
  if (k === TAB_FIJA) return limpia;
  return limpia.ocultas.includes(k)
    ? { ...limpia, ocultas: limpia.ocultas.filter((x) => x !== k) }
    : { ...limpia, ocultas: [...limpia.ocultas, k] };
}

/**
 * Subir o bajar una pestaña un puesto (`paso` es -1 o +1).
 *
 * Se mueve dentro de las VISIBLES y se guarda la lista entera de visibles, no
 * solo la que has movido: así el primer empujón congela el orden que ya tenías
 * delante y a partir de ahí nada se recoloca solo. Es la misma regla que la
 * barra de la izquierda (ver `lib/ordenBarra.ts`), y a propósito: dos sitios
 * donde se ordena a mano no pueden comportarse distinto.
 */
export function mover<T extends { key: ClaveTab }>(
  todas: T[],
  c: Cabecera,
  k: ClaveTab,
  paso: number,
): Cabecera {
  const limpia = limpiar(c);
  const claves = visibles(todas, limpia).map((t) => t.key);
  const i = claves.indexOf(k);
  const j = i + paso;
  if (i < 0 || j < 0 || j >= claves.length) return limpia;
  const orden = [...claves];
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return { ...limpia, orden };
}

/** Volver a como venía de fábrica. */
export function reiniciar(): Cabecera {
  return { ...CABECERA_DEFECTO };
}

export function esDefecto(c: Cabecera): boolean {
  const limpia = limpiar(c);
  return limpia.orden.length === 0 && limpia.ocultas.length === 0;
}
