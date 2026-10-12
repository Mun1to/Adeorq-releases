// Lo que el agente toca, junto con lo que dice git: qué se pinta de eso en el
// panel de Archivos.
//
// Munir, 2026-10-12, con el vídeo de otro producto delante: quiere VER al
// agente trabajando en los archivos (qué lee, qué edita, cuál está editando
// ahora) y el paso a verde cuando hace el commit. Las dos mitades ya llegan
// hechas y aquí solo se juntan, sin tocar disco, para poder probarlo sin la app
// (`scripts/tocados-check.ts`):
//
//   · lo que la sesión dejó escrito en su transcript (`tocados.rs`): cada
//     archivo con cuándo lo leyó, cuándo lo editó y si esa llamada sigue en el
//     aire;
//   · lo que dice git (`estado_archivos`): qué está distinto del último commit,
//     con sus líneas, y los últimos commits con lo que se llevó cada uno.
//
// La marca de un archivo sale de su ESTADO y no de una ventana de tiempo, para
// que no haya que decidir cuándo «caduca» algo:
//
//   editando  la edición sigue en el aire, o acaba de hacerse;
//   leyendo   lo mismo con una lectura;
//   editado   lo editó y git lo sigue viendo distinto del commit;
//   commit    lo editó y ya entró en un commit hecho después de su última
//             edición de CUALQUIER archivo: el trabajo quedó cerrado. En cuanto
//             vuelve a editar algo empieza otro tramo, y estos se van;
//   leido     lo abrió en el último turno en que tocó archivos.
//
// Lo que editó hace diez commits y lo que leyó hace tres turnos no sale: ya no
// es lo que está haciendo.

import type { ArchivosSesion, Cambio, CommitReciente, EstadoArchivos } from "./archivos";
import { clave } from "./estadoArchivos";

export type MarcaAgente = "editando" | "leyendo" | "editado" | "commit" | "leido";

/** Cuánto sigue diciendo «editando» después de una edición ya hecha. Con los
    permisos aceptados una edición dura un suspiro: sin esto no se vería nunca. */
export const EDITANDO_MS = 12_000;
/** Lo mismo para una lectura, que importa menos y se apaga antes. */
export const LEYENDO_MS = 6_000;
/** Lo que se le perdona al reloj: git apunta los commits en segundos enteros. */
const HOLGURA_MS = 1_000;

const PESO: Record<MarcaAgente, number> = { editando: 5, leyendo: 4, editado: 3, commit: 2, leido: 1 };

/** Una fila de la lista «tocó el agente». */
export interface FilaTocada {
  ruta: string;
  marca: MarcaAgente;
  /** Líneas añadidas y quitadas respecto al último commit; cero si git no las da. */
  mas: number;
  menos: number;
  /** La última vez que lo tocó, en milisegundos. */
  cuando: number;
}

/** Lo que dice la tarjeta de arriba, sin traducir: lo último que importa. */
export type Titular =
  | { que: "commitEnCurso" }
  | { que: "editando" | "leyendo"; ruta: string }
  | { que: "commit"; n: number; hash: string; asunto: string }
  | { que: "edito"; n: number; ruta: string; mas: number; menos: number }
  | { que: "abrio"; n: number; ruta: string }
  | { que: "nada" };

export interface Resumen {
  /** Primero lo que se mueve ahora, luego lo editado, lo que entró en el commit y lo leído. */
  filas: FilaTocada[];
  /** La marca de cada archivo, por su `clave`, para pintar el árbol. */
  marcas: Map<string, MarcaAgente>;
  /** Cuántos tocó fuera de esta carpeta: no caben en este árbol, pero se dicen. */
  fuera: number;
  /** El commit que cerró lo último que editó, si lo hay. */
  cierre: CommitReciente | null;
  haciendoCommit: boolean;
  enMarcha: boolean;
  titular: Titular;
}

const ms = (iso: string): number => {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Qué enseñar de una sesión en una carpeta. `sesion` es null cuando no hay
 * transcript que leer (una consola pelada, un CLI que no lo deja escrito): se
 * queda todo vacío y el panel sigue con lo de git.
 */
export function resumenDe(sesion: ArchivosSesion | null, git: EstadoArchivos | null, raiz: string, ahora: number): Resumen {
  const dentro = `${clave(raiz)}/`;
  const todos = sesion?.tocados ?? [];
  const mios = todos.filter((t) => clave(t.ruta).startsWith(dentro));
  const sucios = new Map<string, Cambio>();
  for (const c of git?.cambios ?? []) sucios.set(clave(c.ruta), c);
  const commits = (git?.commits ?? []).map((c) => ({ c, archivos: new Set(c.archivos.map(clave)) }));

  const ultimaEdicion = Math.max(0, ...mios.map((t) => ms(t.editado)));
  const turnoDe = (t: (typeof mios)[number]) => Math.max(t.turnoLeido, t.turnoEditado, t.enCurso ? (sesion?.turno ?? 0) : 0);
  const ultimoTurno = Math.max(0, ...mios.map(turnoDe));

  const filas: FilaTocada[] = [];
  let cierre: CommitReciente | null = null;
  for (const t of mios) {
    const k = clave(t.ruta);
    const editado = ms(t.editado);
    const leido = ms(t.leido);
    const sucio = sucios.get(k);
    // El commit más nuevo que se lo llevó DESPUÉS de editarlo: uno anterior a
    // la edición no la puede llevar dentro.
    const suCommit = editado ? commits.find(({ c, archivos }) => c.cuando + HOLGURA_MS >= editado && archivos.has(k))?.c : undefined;
    let marca: MarcaAgente | null = null;
    if (t.enCurso === "editar" || (editado && !suCommit && ahora - editado < EDITANDO_MS)) marca = "editando";
    else if (t.enCurso === "leer" || (leido > editado && ahora - leido < LEYENDO_MS)) marca = "leyendo";
    else if (editado && !suCommit && (sucio || t.turnoEditado === ultimoTurno)) marca = "editado";
    else if (suCommit && !sucio && suCommit.cuando + HOLGURA_MS >= ultimaEdicion) {
      marca = "commit";
      if (!cierre || suCommit.cuando > cierre.cuando) cierre = suCommit;
    } else if (leido && t.turnoLeido === ultimoTurno) marca = "leido";
    if (!marca) continue;
    filas.push({ ruta: t.ruta, marca, mas: sucio?.mas ?? 0, menos: sucio?.menos ?? 0, cuando: Math.max(editado, leido) });
  }
  filas.sort((a, b) => PESO[b.marca] - PESO[a.marca] || b.cuando - a.cuando);

  const de = (m: MarcaAgente) => filas.filter((f) => f.marca === m);
  const [editando, leyendo, editados, enCommit, leidos] = [de("editando"), de("leyendo"), de("editado"), de("commit"), de("leido")];
  let titular: Titular = { que: "nada" };
  if (sesion?.commitEnCurso) titular = { que: "commitEnCurso" };
  else if (editando.length) titular = { que: "editando", ruta: editando[0].ruta };
  else if (leyendo.length) titular = { que: "leyendo", ruta: leyendo[0].ruta };
  else if (cierre && enCommit.length) titular = { que: "commit", n: enCommit.length, hash: cierre.hash, asunto: cierre.asunto };
  else if (editados.length) {
    titular = {
      que: "edito",
      n: editados.length,
      ruta: editados[0].ruta,
      mas: editados.reduce((n, f) => n + f.mas, 0),
      menos: editados.reduce((n, f) => n + f.menos, 0),
    };
  } else if (leidos.length) titular = { que: "abrio", n: leidos.length, ruta: leidos[0].ruta };

  return {
    filas,
    marcas: new Map(filas.map((f) => [clave(f.ruta), f.marca])),
    fuera: todos.length - mios.length,
    cierre,
    haciendoCommit: !!sesion?.commitEnCurso,
    enMarcha: !!sesion?.enMarcha,
    titular,
  };
}

/** La marca más importante de lo que hay dentro de una carpeta, o nada. */
export function marcaDeCarpeta(carpeta: string, marcas: Map<string, MarcaAgente>): MarcaAgente | null {
  const dentro = `${clave(carpeta)}/`;
  let mejor: MarcaAgente | null = null;
  for (const [k, m] of marcas) {
    if (k.startsWith(dentro) && (!mejor || PESO[m] > PESO[mejor])) mejor = m;
  }
  return mejor;
}

/** Las líneas que cambia cada archivo, por su `clave`. Solo los que tienen alguna. */
export function lineasDe(cambios: Cambio[]): Map<string, { mas: number; menos: number }> {
  const m = new Map<string, { mas: number; menos: number }>();
  for (const c of cambios) {
    if (c.mas || c.menos) m.set(clave(c.ruta), { mas: c.mas ?? 0, menos: c.menos ?? 0 });
  }
  return m;
}

/** Cuántos archivos distintos del commit hay dentro de cada carpeta de la raíz, por su `clave`. */
export function cambiadosPorCarpeta(raiz: string, cambios: Cambio[]): Map<string, number> {
  const tope = clave(raiz);
  const m = new Map<string, number>();
  for (const c of cambios) {
    let k = clave(c.ruta);
    if (!k.startsWith(`${tope}/`)) continue;
    for (let i = k.lastIndexOf("/"); i > tope.length; i = k.lastIndexOf("/")) {
      k = k.slice(0, i);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return m;
}

/** Lo que suma el árbol entero: cuántos cambiados y cuántas líneas. */
export function totalesDe(cambios: Cambio[]): { n: number; mas: number; menos: number } {
  return cambios.reduce((t, c) => ({ n: t.n + 1, mas: t.mas + (c.mas ?? 0), menos: t.menos + (c.menos ?? 0) }), { n: 0, mas: 0, menos: 0 });
}
