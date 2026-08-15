// El árbol del panel de Archivos, sin tocar disco ni React.
//
// Aquí vive lo único que puede equivocarse de verdad: qué filas se ven, en qué
// orden y con cuánta sangría, y qué pasa al plegar una carpeta que tenía otras
// abiertas dentro. Separado a propósito, porque un explorador se rompe siempre
// por lo mismo (una carpeta que se reabre con lo de hace media hora) y eso se
// prueba en un `scripts/arbol-check.ts` en vez de a ojo.

import type { Entrada } from "./archivos";

/** Lo que se ha leído del disco, por ruta de carpeta. Una carpeta que está en
    este mapa está DESPLEGADA: no hace falta un segundo conjunto para saberlo, y
    con dos habría dos verdades que se pueden contradecir. */
export type Leidas = Map<string, Entrada[]>;

export interface Fila extends Entrada {
  /** Cuántos niveles por debajo de la raíz, para la sangría. */
  hondo: number;
  /** Solo tiene sentido en carpetas. */
  desplegada: boolean;
}

/**
 * Las filas que se ven, en orden de pantalla.
 *
 * Recursivo a propósito y no un bucle sobre el mapa: el orden de un árbol es el
 * de recorrerlo, y ordenar un mapa plano por ruta pondría `src/App.tsx` antes
 * que `src/lib/` en unos sistemas y después en otros.
 */
export function filasVisibles(leidas: Leidas, raiz: string, hondo = 0): Fila[] {
  const filas: Fila[] = [];
  for (const e of leidas.get(raiz) ?? []) {
    const desplegada = e.carpeta && leidas.has(e.ruta);
    filas.push({ ...e, hondo, desplegada });
    if (desplegada) filas.push(...filasVisibles(leidas, e.ruta, hondo + 1));
  }
  return filas;
}

/**
 * Plegar una carpeta olvida TAMBIÉN lo que colgaba de ella.
 *
 * Sin esto, volver a abrirla enseña el listado de hace media hora: los archivos
 * que el agente creó mientras tanto no salen y los que borró siguen ahí. Es
 * exactamente el fallo que Orca tapa con una caché de directorios caducados; la
 * versión barata es no guardar nada que no se esté mirando.
 */
export function plegar(leidas: Leidas, ruta: string): Leidas {
  const fuera = new Map(leidas);
  for (const clave of leidas.keys()) {
    if (clave === ruta || dentroDe(clave, ruta)) fuera.delete(clave);
  }
  return fuera;
}

/** Si `hijo` cuelga de `padre`. Compara por separador y no por prefijo pelado:
    `C:\p\Adeorq-releases` empieza por `C:\p\Adeorq` y no está dentro. */
export function dentroDe(hijo: string, padre: string): boolean {
  const sep = padre.includes("\\") ? "\\" : "/";
  return hijo.startsWith(padre.endsWith(sep) ? padre : padre + sep);
}

/** El nombre de un archivo a partir de su ruta, para las pestañas. */
export function nombreDeRuta(ruta: string): string {
  const trozos = ruta.split(/[\\/]/);
  return trozos[trozos.length - 1] || ruta;
}

/** Lo que se enseña bajo el nombre en la cabecera del editor: la ruta desde la
    raíz del proyecto, que es la que dice algo. La absoluta entera no cabe y
    empieza por lo mismo en todos los archivos. */
export function rutaCorta(ruta: string, raiz: string): string {
  if (!dentroDe(ruta, raiz)) return ruta;
  return ruta.slice(raiz.length).replace(/^[\\/]/, "");
}

/** Bytes en algo legible. */
export function peso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
