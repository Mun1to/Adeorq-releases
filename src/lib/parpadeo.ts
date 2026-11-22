// Si el rojo y el amarillo del borde de una terminal parpadean (Ajustes ›
// Terminales). Apagado de fábrica.
//
// Munir, 2026-11-21, al pedir los tres estados del borde: «que puedas activar
// que el amarillo parpadee o el rojo parpadee». Lo que parpadea es el aro de
// `05-cabina.css`, a pasos (dos cambios por vuelta); aquí solo se guarda y se
// marca en el `<html>` (`data-parpadeo`), como la forma de los paneles, para
// que lo vea el CSS entero sin que ninguna terminal se repinte. Llega también a
// las terminales sacadas a su ventana, que se enteran por el evento `storage`.

import { useSyncExternalStore } from "react";

const CLAVE = "adeorq-parpadeo";
const EVENTO = "adeorq-parpadeo";

export function prefParpadeo(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

function aplicar(si: boolean): void {
  if (si) document.documentElement.dataset.parpadeo = "";
  else delete document.documentElement.dataset.parpadeo;
}

export function ponerParpadeo(si: boolean): void {
  try {
    if (si) localStorage.setItem(CLAVE, "1");
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacén vale para esta sesión: al volver a abrir, apagado.
  }
  aplicar(si);
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

/** Al arrancar cada ventana: lo guardado, y lo que cambie en otra. */
export function vigilarParpadeo(): void {
  aplicar(prefParpadeo());
  suscribir(() => aplicar(prefParpadeo()));
}

export function useParpadeo(): boolean {
  return useSyncExternalStore(suscribir, prefParpadeo, () => false);
}
