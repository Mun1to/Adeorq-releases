// El color del borde de una terminal: tres estados, y nada más.
//
// Munir, 2026-11-21: «que no hayan tantos colorines de neón alrededor de las
// terminales que molesta a la vista, solo hayan tres claros, rojo porque te
// necesita sí o sí, amarillo porque ha terminado y verde de que está
// trabajando». De cuatro variantes con la app de verdad eligió la 3: el
// trabajando en azul, con un tramo que recorre el borde (decisión d1a20012ed36).
// El foco, la cuadrilla y el proyecto dejan de pintar el marco.
//
// El orden es una decisión, y es este:
//   1. Una terminal cuyo proceso murió no tiene estado.
//   2. Te necesita: un menú suyo en pantalla o que pide iniciar sesión. Va antes
//      que todo porque está en la pantalla AHORA y no se mueve sin ti.
//   3. Trabaja: su pie lo dice (`crearTrabajando` en `lib/finDeTurno.ts`).
//      Antes que la pregunta del transcript, que va con retraso: si ya ha vuelto
//      a trabajar, la pregunta de hace un momento está contestada.
//   4. Te necesita también si el transcript dice `pregunta` (un AskUserQuestion),
//      por si su menú no lo reconoce ninguna regla de la pantalla.
//   5. Donde la pantalla no se sabe leer (un CLI sin `cajaEnPantalla`), trabaja
//      lo que el transcript diga que va a medias o tenga subagentes vivos.
//   6. Terminó: el `done` de siempre, mientras no la hayas mirado.
// El amarillo es el más bajo a propósito: un turno acabado que vuelve a
// trabajar, o que se para en un permiso, ya no está «terminado».
//
// Sin React, para que lo pase `pnpm bancos aro`.

import type { WorkState } from "./pty";

export type EstadoDelAro = "necesita" | "trabaja" | "termino" | "";

export function estadoDelAro(m: {
  exited: boolean;
  /** Un menú en pantalla (`parseAsk`). */
  ask: boolean;
  needsLogin: boolean;
  /** Su pie dice que trabaja, con su margen para apagarse. */
  trabaja: boolean;
  /** Su pantalla se sabe leer (`lectorDeCaja`). Si no, se mira el transcript. */
  seLee: boolean;
  transcript: WorkState | undefined;
  agentesVivos: number;
  /** Acabó su turno y no la has mirado: `done && !focused && !alone`. */
  termino: boolean;
}): EstadoDelAro {
  if (m.exited) return "";
  if (m.ask || m.needsLogin) return "necesita";
  if (m.trabaja) return "trabaja";
  if (m.transcript === "pregunta") return "necesita";
  if (!m.seLee && (m.transcript === "a_medias" || m.agentesVivos > 0)) return "trabaja";
  if (m.termino) return "termino";
  return "";
}
