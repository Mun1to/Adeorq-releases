// La lista de proyectos de la barra de la izquierda: lo que no es pintarla.

import { useEffect, useRef } from "react";
import type { Project } from "./pty";

/** La última carpeta de una ruta, que es como se reconoce de un vistazo. */
export const carpetaDe = (ruta: string) => ruta.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || ruta;

/**
 * Los proyectos que han aparecido entre una lectura y la siguiente.
 *
 * La primera lectura no trae nada nuevo: es la lista de siempre, y con un orden hecho a mano
 * los que nunca colocaste salen al final, como hasta ahora. Una lista que no comparte ni un
 * proyecto con la anterior tampoco: es otra carpeta madre, no un proyecto recién creado, y
 * subirla entera fijaría un orden que nadie ha elegido.
 */
export function recienLlegados(vistos: ReadonlySet<string> | null, ahora: Project[]): string[] {
  if (!vistos?.size) return [];
  if (!ahora.some((p) => vistos.has(p.name))) return [];
  // Contra todo lo visto con la app abierta, no solo la lectura anterior: un proyecto de fuera
  // en un disco de red que falta una lectura y vuelve no es nuevo, y se clavaría arriba.
  const nuevos = ahora.filter((p) => !vistos.has(p.name)).map((p) => p.name);
  // Más de tres de golpe no es alguien creando proyectos: es otra carpeta madre (con un proyecto
  // de fuera en común, o una lectura vieja que llega tarde), o «Sin carpeta» y vuelta.
  return nuevos.length > DE_GOLPE ? [] : nuevos;
}
const DE_GOLPE = 3;

/**
 * El orden a mano con los nuevos delante: así lo primero que ves es lo que acaba de nacer.
 *
 * Lo que ya colocaste no se mueve NUNCA, aunque falte una lectura y vuelva (un disco de red
 * que despierta, una carpeta devuelta de la papelera): solo sube lo que no estaba en tu
 * orden. Y sin orden a mano no se fija nada: la lista ya se ordena sola por actividad, y
 * clavar cada proyecto nuevo arriba la iría convirtiendo en una pila por fecha.
 */
export function arribaDelTodo(orden: string[], nuevos: string[]): string[] {
  const sueltos = nuevos.filter((n) => !orden.includes(n));
  return orden.length && sueltos.length ? [...sueltos, ...orden] : orden;
}

/**
 * Avisa con los nombres de cada proyecto que aparece con la app abierta.
 *
 * Moods (2026-11-17) llevaba horas en la barra y Munir no lo encontraba: con su orden hecho a
 * mano, un proyecto que nunca ha colocado cae debajo de los veintitrés que sí, y para verlo había
 * que bajar hasta el final. Quería verlo a la izquierda en cuanto se crea.
 */
export function useNuevosArriba(projects: Project[], alLlegar: (nombres: string[]) => void): void {
  const vistos = useRef<Set<string> | null>(null);
  const aviso = useRef(alLlegar);
  aviso.current = alLlegar;
  useEffect(() => {
    const nuevos = recienLlegados(vistos.current, projects);
    if (projects.length) vistos.current = new Set([...(vistos.current ?? []), ...projects.map((p) => p.name)]);
    if (nuevos.length) aviso.current(nuevos);
  }, [projects]);
}
