// Un plan de Adeo que espera tu sí aunque cierres su ventana.
//
// Munir eligió el 2026-11-15 (A1, `docs/propuestas/diseno-ade.md`) que «Te toca»
// tuviera también «un plan de Adeo que espera tu OK si cerraste su ventana sin
// contestar». Hasta entonces el plan vivía solo dentro de `Foreman.tsx`, y
// cerrarla lo tiraba: había que volver a pedírselo y esperar otra vez al modelo.
//
// Al cerrarse con un plan delante, Adeo lo deja aquí; Decisiones lo pone en «Te
// toca» y, al abrirlo, Adeo lo recoge y lo enseña como estaba. Vive en memoria:
// un plan es una foto de tus terminales y cuentas de ahora, y mañana sería otro.

import { create } from "zustand";
import type { ForemanPlan } from "./pty";

export interface PlanPendiente {
  plan: ForemanPlan;
  /** Lo que le pediste. */
  pedido: string;
  /** Las acciones que iban en el Modo Espejo. */
  espejo: Record<number, boolean>;
  cuando: number;
}

interface Almacen {
  pendiente: PlanPendiente | null;
}

export const usePlanPendiente = create<Almacen>(() => ({ pendiente: null }));

/** Adeo se cierra con un plan sin contestar. */
export function dejarPlan(p: PlanPendiente): void {
  usePlanPendiente.setState({ pendiente: p });
}

/** Adeo lo recoge al abrirse: desde entonces vuelve a ser suyo. */
export function recogerPlan(): PlanPendiente | null {
  const p = usePlanPendiente.getState().pendiente;
  if (p) usePlanPendiente.setState({ pendiente: null });
  return p;
}

/** Tirarlo sin abrirlo, desde Decisiones. */
export function olvidarPlan(): void {
  usePlanPendiente.setState({ pendiente: null });
}

/** Lo que pide abrir Adeo desde fuera de `App` (lo escucha `useAdeoDonde`). */
export const ABRIR_ADEO = "adeorq:abrir-adeo";

export function abrirAdeo(): void {
  window.dispatchEvent(new CustomEvent(ABRIR_ADEO));
}
