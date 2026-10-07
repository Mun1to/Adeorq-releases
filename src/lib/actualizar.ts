// Una actualización no corta a un agente a medio trabajo (decisión C3 de
// Munir, 2026-10-07).
//
// Hasta ahora «Actualizar ahora» descargaba e instalaba, y «Reinicia para
// estrenar» relanzaba la app: en los dos casos el proceso muere y con él los
// agentes de todos los paneles, a media frase. Al abrir, cada uno retoma su
// conversación, pero lo que estaba haciendo en ese momento se cortó.
//
// Munir eligió la salida corta: cerrar la ventana sigue parando a los agentes
// (la ✕ significa lo mismo), pero una ACTUALIZACIÓN espera a que terminen. Lo
// que decide si hay que esperar está aquí, puro, para probarlo sin la app; la
// tarjeta (`components/UpdateBar.tsx`) solo lo pregunta y, cuando la lista se
// vacía, hace lo que tenía pendiente.
//
// Qué cuenta como «a medio trabajo»: un agente (no una consola) cuyo estado es
// `a_medias`, o que todavía tiene subagentes fuera. Uno que te pregunta, que
// te espera o que terminó no se corta nada por reiniciarlo: al volver, su
// pregunta sigue en el transcript.

import type { PaneStatus } from "./pty";

/** Los agentes a los que una actualización cortaría a medio trabajo. */
export function trabajando(estados: Record<number, PaneStatus>): PaneStatus[] {
  return Object.values(estados)
    .filter((s) => s.agent && (s.state === "a_medias" || s.agentsLive > 0))
    .sort((a, b) => a.id - b.id);
}

/** Cómo se cuenta en la tarjeta: hasta tres nombres y «y N más». */
export function quienFrena(lista: PaneStatus[]): string {
  const nombres = lista.map((s) => s.name);
  if (nombres.length <= 3) return nombres.join(", ");
  return `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
}
