// Mandarle algo al conserje y hacer lo que pida.
//
// Es el MISMO camino desde el hilo del PC (`HiloConserje`) y desde el móvil
// (`lib/movilPuente.ts`): Rust le pregunta al modelo y pasa la reja, y aquí
// cada trabajo va por el router (o por el modelo que tengas puesto) y se abre
// sin sacarte de donde estés. Dos caminos habrían acabado haciendo cosas
// distintas con el mismo mensaje.

import {
  conserjeEnviar,
  conserjeLeer,
  conserjeTrabajo,
  ejecutar,
  estadosParaElConserje,
  type ConserjeExec,
  type Conversacion,
} from "./conserje";
import { recetar } from "./router";
import { fotoRapida } from "./mundo";
import { cerebroPorDefecto, type ModelAlias } from "./models";

export interface Envio {
  /** Lo que la reja tiró o no se pudo abrir, en una frase. */
  aviso: string | null;
  /** Por qué no contestó. `null` también si lo paraste tú: eso no es un error. */
  error: string | null;
}

export async function enviarAlConserje(
  id: string,
  texto: string,
  opciones: {
    exec: ConserjeExec;
    /** La conversación tal como está: de ella salen el router y las pestañas. */
    conv: Conversacion | null;
    /** El modelo cuando el router está apagado. */
    fijo: ModelAlias;
    /** Algo cambió en el disco: quien pinta, que relea. */
    alCambio: () => void;
  },
): Promise<Envio> {
  const { exec, conv, fijo, alCambio } = opciones;
  try {
    const r = await conserjeEnviar(id, texto, estadosParaElConserje(conv?.trabajos ?? [], exec.panes()));
    alCambio();
    if (!r.acciones.length) {
      return { aviso: r.descartes.length ? r.descartes.join(" · ") : null, error: null };
    }
    const vivas = await fotoRapida(exec.cuentas());
    const hecho = await ejecutar(r.acciones, {
      router: conv?.router ?? true,
      recetar: (ex) => recetar(ex, { cuentas: vivas, avisos: "nunca" }, undefined, cerebroPorDefecto()),
      fijo: { cli: "claude", modelo: fijo },
      abrir: exec.abrir,
      escribir: exec.escribir,
    });
    // En qué turno lo pidió: el último de la conversación ya guardada, que es su
    // respuesta. Contarlo a mano (el último que había, más dos) fallaba con un
    // reintento, que no apunta tu mensaje otra vez.
    const guardada = await conserjeLeer(id).catch(() => null);
    const turno = guardada?.turnos[guardada.turnos.length - 1]?.n ?? 0;
    for (const w of hecho.abiertos) await conserjeTrabajo(id, { ...w, turno });
    alCambio();
    const fuera = [...r.descartes, ...hecho.fallos];
    return { aviso: fuera.length ? fuera.join(" · ") : null, error: null };
  } catch (e) {
    const s = String(e);
    // Tu mensaje ya está guardado (Rust lo apunta antes de llamar al modelo),
    // así que se ofrece reintentarlo en vez de devolverlo a la caja.
    alCambio();
    return { aviso: null, error: s === "parado" ? null : s };
  }
}
