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

//
// Y el estado no basta (2026-10-08, pasando de la 0.9.165 a la 0.9.167): cada
// panel relee su transcript cada 20 segundos, así que un agente al que acabas
// de escribirle sigue constando como «lista» hasta la vuelta siguiente. A Munir
// le cortó así el de munito.dev: el mensaje a las 00:47:17 y la app reiniciada
// ocho segundos después. Por eso cuenta también lo que se MUEVE: un agente cuya
// terminal ha sacado algo, o en la que se ha escrito, hace menos de `QUIETO_MS`.
// Claude Code mientras trabaja redibuja su spinner sin parar; quieto, no saca
// nada. Lo apunta `TerminalPane` en cada dato del PTY y en cada tecla.

import type { PaneStatus } from "./pty";

/** Cuánto tiene que llevar callada la terminal de un agente para darlo por quieto. */
export const QUIETO_MS = 8_000;

/** Lo último que se movió en cada panel, por su número: la hora en milisegundos. */
const movimientos = new Map<number, number>();

/** Algo acaba de salir por la terminal de ese panel, o alguien ha escrito en ella. */
export function apuntarMovimiento(id: number, ahora = Date.now()): void {
  movimientos.set(id, ahora);
}

/** Los agentes a los que una actualización cortaría a medio trabajo. */
export function trabajando(
  estados: Record<number, PaneStatus>,
  ultimos: ReadonlyMap<number, number> = movimientos,
  ahora = Date.now(),
): PaneStatus[] {
  return Object.values(estados)
    .filter((s) => {
      if (!s.agent) return false;
      const movido = ultimos.get(s.id);
      return s.state === "a_medias" || s.agentsLive > 0 || (movido != null && ahora - movido < QUIETO_MS);
    })
    .sort((a, b) => a.id - b.id);
}

/** Cómo se cuenta en la tarjeta: hasta tres nombres y «y N más». */
export function quienFrena(lista: PaneStatus[]): string {
  const nombres = lista.map((s) => s.name);
  if (nombres.length <= 3) return nombres.join(", ");
  return `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;
}
