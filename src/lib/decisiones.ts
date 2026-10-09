// Las decisiones que piden los agentes con `ask_decision` (`decisiones.rs`),
// para la pestaña «Decisiones» de la app. Las mismas que contesta el móvil, con
// las mismas reglas: ninguna opción sale marcada, cada pregunta admite tus
// palabras, y se manda a los cinco segundos con «Deshacer» por medio.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Opcion {
  texto: string;
  detalle?: string;
  recomendada: boolean;
}

export interface Pregunta {
  /** A, B, C… en el orden en que llegaron. */
  id: string;
  titulo: string;
  contexto?: string;
  opciones: Opcion[];
}

export interface Eleccion {
  /** El número de la opción, desde 1. */
  opcion?: number;
  /** «Otra cosa, con tus palabras». */
  texto?: string;
}

export interface Respuesta {
  cuando: number;
  desde: string;
  elecciones: Record<string, Eleccion>;
  entregada: boolean;
}

export interface Decision {
  id: string;
  titulo: string;
  contexto?: string;
  proyecto?: string;
  panel?: number;
  arranque?: number;
  /** Milisegundos. */
  creada: number;
  preguntas: Pregunta[];
  respuesta?: Respuesta;
}

export type Elecciones = Record<string, Eleccion>;

/** Lo que emite Rust cuando una se crea o se contesta (`EVENTO_CAMBIAN`). */
export const EVENTO_CAMBIAN = "decisiones:cambian";

export const listarDecisiones = () => invoke<Decision[]>("decisiones_listar");

export const responderDecision = (id: string, elecciones: Elecciones) =>
  invoke<{ decision: Decision; panel: number | null; texto: string | null }>("decision_responder", { id, elecciones });

export const marcarEntregada = (id: string) => invoke<void>("decision_entregada", { id });

/**
 * La lista, al día: se lee al abrir Adeorq y cada vez que Rust avisa de un
 * cambio (una nueva del MCP, una contestada desde el móvil o desde aquí). Vive
 * en `App` para que la cuenta de la pestaña esté aunque no la tengas abierta.
 */
export function useDecisiones(): Decision[] {
  const [lista, setLista] = useState<Decision[]>([]);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      listarDecisiones()
        .then((l) => vivo && setLista(l))
        .catch(() => {});
    leer();
    const quitar = listen(EVENTO_CAMBIAN, leer);
    return () => {
      vivo = false;
      void quitar.then((f) => f()).catch(() => {});
    };
  }, []);
  return lista;
}

export const pendientes = (lista: Decision[]) => lista.filter((d) => !d.respuesta).length;

/** Lo que falta por contestar: una pregunta necesita una opción o tus palabras. */
export function faltan(d: Decision, el: Elecciones): string[] {
  return d.preguntas.filter((q) => !el[q.id]?.opcion && !el[q.id]?.texto?.trim()).map((q) => q.id);
}

/** Lo que se manda: sin las cajas vacías, que para Rust son «no contestó». */
export function limpias(d: Decision, el: Elecciones): Elecciones {
  const out: Elecciones = {};
  for (const q of d.preguntas) {
    const e = el[q.id] ?? {};
    const texto = e.texto?.trim();
    out[q.id] = { ...(e.opcion ? { opcion: e.opcion } : {}), ...(texto ? { texto } : {}) };
  }
  return out;
}

/* Lo marcado y lo escrito se guarda solo mientras no se manda: cambiar de
   pestaña o cerrar Adeorq a medias no lo pierde. */
const borradorDe = (id: string) => `adeorq-decision-${id}`;

export function leerBorrador(id: string): Elecciones {
  try {
    const v = JSON.parse(localStorage.getItem(borradorDe(id)) || "{}");
    return v && typeof v === "object" ? (v as Elecciones) : {};
  } catch {
    return {};
  }
}

export function guardarBorrador(id: string, el: Elecciones): void {
  try {
    localStorage.setItem(borradorDe(id), JSON.stringify(el));
  } catch {
    // Sin sitio no se guarda el borrador, y se sigue pudiendo contestar.
  }
}

export function olvidarBorrador(id: string): void {
  try {
    localStorage.removeItem(borradorDe(id));
  } catch {
    // Nada que hacer.
  }
}
