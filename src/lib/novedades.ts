// Lo nuevo de cada versión, enseñado sobre la ventana de verdad.
//
// Munir, 2026-11-20: «en cada actualización nueva un tour nuevo de las cosas
// nuevas». Los textos viven en `src/novedades.json`, una entrada por versión
// con lo que se ve de nuevo, en español y en inglés, y dónde está en la ventana.
// `publicar-version` no deja salir una versión sin su entrada, que puede ser una
// lista vacía si no trae nada que se vea (`scripts/novedades-publicar.mjs`).
//
// Las notas de la release no sirven para esto: están escritas para quien
// revisa (cómo se probó, qué se midió), son largas y no dicen en qué sitio de
// la pantalla está cada cosa, que es lo único que un recorrido necesita.
//
// Aquí va solo lo que se decide sin ventana, para probarlo con
// `pnpm bancos novedades`; lo que se pinta está en `Recorridos.tsx`, y los
// datos se cargan en `novedadesDatos.ts` (el banco los lee del disco).

import type { Lang } from "./i18n";

interface Texto {
  titulo: string;
  texto: string;
}

/** Una cosa nueva y dónde está. */
export interface Novedad {
  /** La pestaña de la cabecera donde vive (`View`). */
  vista?: string;
  /** El grupo de Ajustes donde vive (`SECCIONES` de `SettingsView`). */
  ajustes?: string;
  /** Un bloque de Ajustes por su título, para lo que no tiene selector propio. */
  bloque?: string;
  /** Selectores de la ventana; vale el primero que exista. */
  donde?: string[];
  es: Texto;
  en: Texto;
}

export type Novedades = Record<string, Novedad[]>;

/** La última versión cuyas novedades ya se enseñaron (o se rechazaron). */
export const VISTA_KEY = "adeorq-novedades-vista";
/** Desde Ajustes: vuelve a abrir el recorrido de lo nuevo. */
export const VER_NOVEDADES = "adeorq-ver-novedades";
/** Lleva Ajustes a uno de sus grupos (el detalle es su id). */
export const AJUSTES_IR = "adeorq-ajustes-ir";
/** El grupo que Ajustes abre al montarse (lo escribe y lo lee `SettingsView`). */
export const SECCION_AJUSTES = "adeorq-ajustes-seccion";

/** Compara dos versiones por números: «0.9.100» va después de «0.9.99». */
export function comparar(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * La última versión sin recorrido de lo nuevo. Quien ya usaba Adeorq y no tiene
 * nada visto viene de ella o de antes, así que todo lo de después le toca: sin
 * esto, saltar de la 0.9.263 a la 0.9.265 (la Microsoft Store va a su ritmo)
 * perdía para siempre lo de la 0.9.264. Quien estrena Adeorq no pasa por aquí:
 * lo suyo es la bienvenida.
 */
export const ANTES_DEL_RECORRIDO = "0.9.263";

/** Una novedad con la versión que la trajo. */
export interface Pendiente {
  version: string;
  novedad: Novedad;
}

/**
 * Lo que toca enseñar al abrir `actual`, sabiendo que la última vista es `vista`.
 *
 * - Sin `vista`, solo lo de la versión que corre (lo que se vuelve a ver desde
 *   Ajustes). Al arrancar se pasa `leerVista() ?? ANTES_DEL_RECORRIDO`.
 * - Si te saltaste varias, todo lo que trajeron, de la más vieja a la más nueva.
 * - Una versión igual o anterior a la vista (volver atrás) no enseña nada.
 */
export function pendientes(todas: Novedades, actual: string, vista: string | null): Pendiente[] {
  if (!actual) return [];
  const versiones = Object.keys(todas)
    .filter((v) => comparar(v, actual) <= 0 && (vista ? comparar(v, vista) > 0 : comparar(v, actual) === 0))
    .sort(comparar);
  return versiones.flatMap((version) => (todas[version] ?? []).map((novedad) => ({ version, novedad })));
}

/** La última versión, hasta `actual`, que trajo algo que enseñar: la que se
    vuelve a ver desde Ajustes aunque las de después no trajeran nada. */
export function ultimaConNovedades(todas: Novedades, actual: string): string | null {
  const con = Object.keys(todas)
    .filter((v) => comparar(v, actual) <= 0 && (todas[v]?.length ?? 0) > 0)
    .sort(comparar);
  return con[con.length - 1] ?? null;
}

/** El texto en el idioma de la app; el inglés, si falta el otro. */
export const textoDe = (n: Novedad, lang: Lang): Texto => n[lang] ?? n.en ?? n.es;

export function leerVista(): string | null {
  try {
    return localStorage.getItem(VISTA_KEY);
  } catch {
    return null;
  }
}

/** Apunta `version` como vista, salvo que ya hubiera una más nueva. */
export function marcarVista(version: string): void {
  try {
    const antes = localStorage.getItem(VISTA_KEY);
    if (!antes || comparar(version, antes) > 0) localStorage.setItem(VISTA_KEY, version);
  } catch {
    /* sin almacén, el recorrido volvería a salir: mejor eso que no arrancar */
  }
}
