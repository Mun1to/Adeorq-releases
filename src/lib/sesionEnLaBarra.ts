// Lo que la barra lateral lee del estado de una sesión: cuánto te reclama, su
// punto de color y si espera algo de ti. Sacado de `Sidebar.tsx` tal cual el
// 2026-11-20 para que la barra no pasara de su techo de líneas (`gordos-check`).

import type { SessionInfo } from "./pty";

/** Cuánto te reclama una sesión, de más a menos: para ordenar por eso. */
export function reclama(s: SessionInfo): number {
  if (s.state === "pregunta") return 0;
  if (s.state === "ofrece") return 1;
  if (s.state === "lista") return 2;
  if (s.live) return 3;
  return 4;
}

/** Los estados en los que tiene sentido saber si ya miraste lo último. */
export function esperaTuMirada(s: SessionInfo): boolean {
  return !s.live && (s.state === "pregunta" || s.state === "ofrece" || s.state === "lista");
}

export function stateDotClass(s: SessionInfo): string {
  if (s.live) return "dot-live";
  if (s.state === "pregunta" || s.state === "ofrece") return "dot-ask";
  if (s.state === "a_medias") return "dot-half";
  return "dot-idle";
}

/** Sessions holding a question get the amber/red treatment of the desktop app. */
export function waitKind(s: SessionInfo): "ask" | "offer" | null {
  if (s.state === "pregunta") return "ask";
  if (s.state === "ofrece") return "offer";
  return null;
}
