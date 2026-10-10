// Qué se hace cuando se le da a la X de la ventana. La otra mitad es
// `src-tauri/src/cierre.rs`, que para el cierre y pregunta aquí.
//
// Munir, 2026-10-10: como los programas que al cerrar preguntan si guardas,
// que Adeorq pregunte si los agentes siguen trabajando en segundo plano o se
// cierra todo, y que la respuesta se pueda dejar fijada.
//
// Lo que decide vive aquí suelto (`queHacer`, `recuento`) para poder probarlo
// sin ventana: `pnpm bancos al-cerrar`.

import { invoke } from "@tauri-apps/api/core";
import type { Translate } from "./i18n";
import type { PaneStatus } from "./pty";

/** El evento con el que Rust avisa de que se ha pedido cerrar. */
export const PEDIDO = "cierre:pedido";

export const AL_CERRAR_KEY = "adeorq-al-cerrar";
/** `preguntar` es lo de fábrica; las otras dos son una respuesta ya fijada. */
export const AL_CERRAR = ["preguntar", "fondo", "cerrar"] as const;
export type AlCerrar = (typeof AL_CERRAR)[number];

export function leerAlCerrar(): AlCerrar {
  try {
    const v = localStorage.getItem(AL_CERRAR_KEY);
    return AL_CERRAR.find((m) => m === v) ?? "preguntar";
  } catch {
    return "preguntar";
  }
}

export function guardarAlCerrar(modo: AlCerrar): void {
  try {
    localStorage.setItem(AL_CERRAR_KEY, modo);
  } catch {
    /* sin almacén: se preguntará la próxima vez, que es lo seguro */
  }
}

/** Lo que hay abierto, contado para el aviso. */
export interface Abierto {
  abiertas: number;
  trabajando: number;
}

/**
 * Cuántas terminales hay y cuántos agentes están trabajando ahora.
 *
 * Trabajar es estar a medias de un turno o tener subagentes fuera. Una terminal
 * recién abierta («no se sabe») o una que te espera no cuentan: cerrarlas no
 * corta nada a medias.
 */
export function recuento(estados: Record<number, PaneStatus>): Abierto {
  const todas = Object.values(estados);
  return {
    abiertas: todas.length,
    trabajando: todas.filter((p) => p.agent && (p.state === "a_medias" || p.agentsLive > 0)).length,
  };
}

export type Paso = "preguntar" | "fondo" | "cerrar";

/**
 * Qué se hace con la X.
 *
 * Sin terminales no hay nada que dejar trabajando ni nada que perder, así que
 * se cierra sin preguntar, esté como esté el ajuste. Y una respuesta fijada a
 * «segundo plano» en un sistema que no lo tiene vuelve a preguntar: cerrar por
 * su cuenta sería justo lo contrario de lo que se eligió.
 */
export function queHacer(modo: AlCerrar, abierto: Abierto, puedeFondo: boolean): Paso {
  if (abierto.abiertas === 0) return "cerrar";
  if (modo === "cerrar") return "cerrar";
  if (modo === "fondo" && puedeFondo) return "fondo";
  return "preguntar";
}

/** La frase del aviso: qué se queda a medias si cierras. */
export function fraseDeLoAbierto(t: Translate, { abiertas, trabajando }: Abierto): string {
  if (trabajando === 1) return t("Hay 1 agente trabajando.");
  if (trabajando > 1) return t("Hay {n} agentes trabajando.", { n: trabajando });
  if (abiertas === 1) return t("Tienes 1 terminal abierta y ningún agente trabajando.");
  return t("Tienes {n} terminales abiertas y ningún agente trabajando.", { n: abiertas });
}

/** «Te oigo»: retira el seguro que cerraría si la ventana no contestara. */
export const cierreAcuse = () => invoke<void>("cierre_acuse");
export const cierrePuedeFondo = () => invoke<boolean>("cierre_puede_fondo");
export const cierreSalir = () => invoke<void>("cierre_salir");
/** Esconde la ventana y deja el icono junto al reloj, con estos textos. */
export const cierreAFondo = (textos: { abrir: string; salir: string; pista: string }) =>
  invoke<void>("cierre_a_fondo", textos);
