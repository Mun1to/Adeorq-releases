// Qué enseña la barra de arriba de cada terminal: todo, o solo de quién es.
//
// Un usuario de Linux, 2026-10-31: «¿se puede poner que en la barra de arriba
// aparezca solamente el nombre de mi proyecto? Que ahí ponga "hola" en vez del
// modelo y todo eso». De fábrica la barra lleva el contexto, el modelo con su
// esfuerzo y la memoria, porque es lo que Munir mira con seis agentes abiertos;
// con este ajuste se queda en el proyecto y el nombre de la terminal. No se
// pierde nada: el globo del nombre ya carga con todo eso (`resumen` en
// `TerminalPane.tsx`), para cuando la barra es estrecha y no le cabe.
//
// Cambia en caliente en todas las terminales abiertas, también en las que
// están sacadas a su propia ventana (esas se enteran por el evento `storage`,
// que es el que cruza ventanas).

import { useSyncExternalStore } from "react";

const CLAVE = "adeorq-cabecera-terminal";
const EVENTO = "adeorq-cabecera-terminal";

/** `todo`: contexto, modelo y memoria. `nombre`: solo el proyecto y el nombre. */
export type DatosCabecera = "todo" | "nombre";

export function datosCabecera(): DatosCabecera {
  try {
    return localStorage.getItem(CLAVE) === "nombre" ? "nombre" : "todo";
  } catch {
    return "todo";
  }
}

export function ponerDatosCabecera(v: DatosCabecera): void {
  try {
    if (v === "todo") localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, v);
  } catch {
    // Sin almacén vale para esta sesión: las terminales abiertas ya se enteran
    // por el evento, y al volver a abrir Adeorq la barra sale entera.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void): () => void {
  const deOtraVentana = (e: StorageEvent) => {
    if (e.key === CLAVE || e.key === null) avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", deOtraVentana);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", deOtraVentana);
  };
}

export function useDatosCabecera(): DatosCabecera {
  return useSyncExternalStore(suscribir, datosCabecera, () => "todo");
}
