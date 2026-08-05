// El acta del relevo: seguir en otra cuenta sin empezar de cero.
//
// Cuando una cuenta se queda sin semana, hasta ahora Adeorq sabía avisar y
// sabía abrirte una terminal en otra cuenta, pero esa terminal nacía VACÍA:
// tenías que contarle otra vez a mano lo que llevabas media hora explicando.
//
// Esto NO es «la conversación continúa», y conviene decirlo claro porque suena
// a eso: cada CLI guarda su historial a su manera y una sesión de una cuenta no
// se puede abrir con otra. Lo que se traspasa es un ACTA: para qué se abrió
// aquello, qué fue lo último que dijo el agente, y la orden de seguir desde
// ahí. Es lo mismo que harías tú resumiéndoselo, pero sin escribirlo.
//
// Las tres piezas ya existían sueltas desde julio (`usage.rs` sabe la cuota,
// `last_reply` lee el final del transcript y `read_encargos` guarda para qué se
// abrió cada sesión); lo único que faltaba era juntarlas.

import { lastReply, readEncargos, type Encargo } from "./pty";

/** Cuánto de la última respuesta se lleva el acta.
 *
 *  Suficiente para que se entienda dónde iba, y corto a propósito: esto se pega
 *  en el prompt de una terminal nueva y cada carácter que va ahí es contexto
 *  que el agente nuevo gasta antes de empezar a trabajar. */
const MAX_COLA = 1400;

export interface Origen {
  /** La carpeta donde trabajaba. */
  cwd: string;
  /** Su transcript, si se sabe cuál es. Sin esto no hay nada que leer. */
  sessionId?: string;
  /** Cómo se llamaba el panel, para nombrar a quién se releva. */
  name?: string;
  /** La cuenta que se quedó sin semana. */
  cuenta?: string;
}

/**
 * El texto que se pega en la terminal nueva.
 *
 * Siempre devuelve algo: si no se puede leer el transcript (una sesión recién
 * abierta, un id que no se conoce), el acta sale igual pero diciendo qué NO se
 * pudo recuperar, en vez de fingir que lo sabe. Un relevo que se inventa dónde
 * ibas es peor que uno que admite que no lo sabe.
 */
export async function actaDeRelevo(origen: Origen): Promise<string> {
  const [cola, encargos] = await Promise.all([
    origen.sessionId
      ? lastReply(origen.cwd, origen.sessionId, MAX_COLA).catch(() => null)
      : Promise.resolve(null),
    readEncargos().catch(() => ({}) as Record<string, Encargo>),
  ]);

  const encargo = origen.sessionId ? encargos[origen.sessionId]?.encargo : undefined;
  const quien = origen.name ? `«${origen.name}»` : "otra terminal";
  const porQue = origen.cuenta
    ? `la cuenta «${origen.cuenta}» se quedó sin cuota`
    : "su cuenta se quedó sin cuota";

  const partes = [
    `Vienes a RELEVAR a ${quien}: ${porQue}. No empieces de cero, sigue desde donde lo dejó.`,
    "",
    `CARPETA: ${origen.cwd}`,
  ];

  if (encargo) {
    partes.push("", "PARA LO QUE SE ABRIÓ AQUELLA SESIÓN:", encargo.trim());
  }

  if (cola?.trim()) {
    partes.push("", "LO ÚLTIMO QUE DIJO, tal cual:", cola.trim());
  } else {
    partes.push(
      "",
      "NO he podido leer lo que dijo (esa sesión no dejó transcript legible), " +
        "así que lo de arriba es todo lo que hay.",
    );
  }

  partes.push(
    "",
    "CÓMO SEGUIR: lee lo que haga falta del proyecto para situarte, y dime en dos " +
      "o tres líneas qué has entendido que queda pendiente ANTES de tocar ningún " +
      "archivo. Si lo de arriba no basta para saber por dónde ibas, pregúntame en " +
      "vez de suponer. Sigue el AGENTS.md del proyecto si existe.",
  );

  return partes.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}
