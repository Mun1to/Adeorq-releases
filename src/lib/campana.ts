// La campana: lo que te reclama, apuntado en una lista en vez de sonar y
// perderse.
//
// Hasta el 2026-10-10 un agente que terminaba o que te preguntaba algo lo decía
// con un sonido y una notificación del sistema (`lib/notify.ts`), y si en ese
// momento mirabas a otro lado, no quedaba en ningún sitio: había que repasar
// las terminales una a una. Munir pidió la campana ese día.
//
// Un aviso nace en el INSTANTE en que un panel pasa de trabajar a reclamarte
// (la misma regla que el salto a pantalla completa, `acabaDeReclamar`), y deja
// de estar vigente solo, sin que hagas nada aquí, en cuanto le contestas en su
// terminal o la cierras. La lista no es otra bandeja que vaciar: es un espejo
// de lo que hay, con memoria de lo que hubo.
//
// Lo que decide vive suelto (`alCambiar`, `animoDe`) para probarlo sin
// ventana: `pnpm bancos campana`. (El nombre es `campana` y no `avisos` porque
// `scripts/avisos-check.ts` ya es el banco de la espera de `lib/notify.ts`.)

import { create } from "zustand";
import { useCabina } from "./cabina";
import { acabaDeReclamar, reclamaTuAtencion } from "./estados";
import type { PaneStatus, WorkState } from "./pty";

export interface Aviso {
  /** Su número, creciente: el más alto es el más nuevo. */
  n: number;
  paneId: number;
  nombre: string;
  cwd: string;
  /** `espera`: te toca a ti (pregunta, ofrece algo o pide iniciar sesión).
      `hecho`: terminó su turno. */
  tipo: "espera" | "hecho";
  /** Por qué, en una frase: lo mismo que el panel le cuenta al MCP. */
  porque: string;
  cuando: number;
  leido: boolean;
  /** Sigue siendo verdad: el panel está y sigue reclamándote. */
  vigente: boolean;
}

/** Cuántos se guardan. Más atrás de esto ya no es «lo que te reclama». */
export const TOPE = 60;

const tipoDe = (estado: WorkState): Aviso["tipo"] => (estado === "lista" ? "hecho" : "espera");

/**
 * La lista de avisos después de un cambio en el estado de los paneles.
 *
 * `antes` y `ahora` son los estados por panel de un momento y del siguiente.
 * Devuelve la MISMA lista si nada cambia, para no repintar a quien la mira.
 */
export function alCambiar(
  lista: Aviso[],
  antes: Record<number, PaneStatus>,
  ahora: Record<number, PaneStatus>,
  cuando: number,
): Aviso[] {
  let nueva = lista;
  const tocar = () => (nueva === lista ? (nueva = lista.map((a) => ({ ...a }))) : nueva);

  // Lo que ya no es verdad: el panel se cerró, o le contestaste y volvió a trabajar.
  lista.forEach((a, i) => {
    if (!a.vigente) return;
    const st = ahora[a.paneId];
    if (!st || !reclamaTuAtencion(st.state)) tocar()[i].vigente = false;
  });

  // Lo nuevo: el instante en que un panel deja de trabajar y te reclama. O el
  // instante en que te reclama OTRA cosa: uno que había terminado y ahora
  // pregunta, sin que en medio se le viera trabajar. Pasa de verdad, porque el
  // «terminó» sale del transcript, que se relee cada veinte segundos, y un menú
  // de permiso se ve en pantalla al momento.
  let n = lista.reduce((m, a) => Math.max(m, a.n), 0);
  for (const st of Object.values(ahora)) {
    const previo = antes[st.id]?.state;
    const otraCosa =
      previo !== undefined && reclamaTuAtencion(previo) && reclamaTuAtencion(st.state) && tipoDe(previo) !== tipoDe(st.state);
    if (!acabaDeReclamar(previo, st.state) && !otraCosa) continue;
    // Un aviso por panel a la vez: el anterior de ese panel ya no cuenta.
    tocar().forEach((a) => {
      if (a.paneId === st.id) a.vigente = false;
    });
    nueva.push({
      n: ++n,
      paneId: st.id,
      nombre: st.name,
      cwd: st.cwd,
      tipo: tipoDe(st.state),
      porque: st.porque,
      cuando,
      leido: false,
      vigente: true,
    });
  }
  return nueva.length > TOPE ? nueva.slice(nueva.length - TOPE) : nueva;
}

/** Los que cuentan en el número de la campana: vigentes y sin leer. */
export function sinLeer(lista: Aviso[]): number {
  return lista.filter((a) => a.vigente && !a.leido).length;
}

/** Cómo está la mascota, de lo más urgente a lo menos. */
export type Animo = "espera" | "lista" | "trabaja" | "quieta" | "dormida";

/**
 * El ánimo de la mascota: lo MÁS urgente de todas tus terminales.
 *
 * Sale de los avisos vigentes, no de los leídos: que hayas abierto la lista no
 * quita que un agente siga esperándote. Sin nada que te reclame, mira si
 * alguien trabaja; y sin terminales, duerme.
 */
export function animoDe(lista: Aviso[], estados: Record<number, PaneStatus>): Animo {
  const vigentes = lista.filter((a) => a.vigente);
  if (vigentes.some((a) => a.tipo === "espera")) return "espera";
  if (vigentes.some((a) => a.tipo === "hecho" && !a.leido)) return "lista";
  const paneles = Object.values(estados);
  if (paneles.length === 0) return "dormida";
  if (paneles.some((p) => p.agent && (p.state === "a_medias" || p.agentsLive > 0))) return "trabaja";
  return "quieta";
}

interface Almacen {
  lista: Aviso[];
  marcarLeidos: () => void;
  vaciar: () => void;
}

export const useAvisos = create<Almacen>((set) => ({
  lista: [],
  marcarLeidos: () => set((s) => (s.lista.some((a) => !a.leido) ? { lista: s.lista.map((a) => ({ ...a, leido: true })) } : s)),
  // Vaciar quita la historia, no lo que sigue pasando: lo vigente se queda.
  vaciar: () => set((s) => ({ lista: s.lista.filter((a) => a.vigente) })),
}));

/**
 * Engancha la lista al estado de los paneles. Se llama una vez, desde la
 * campana, y devuelve cómo soltarlo.
 */
export function conectarAvisos(): () => void {
  return useCabina.subscribe((s, antes) => {
    if (s.estados === antes.estados) return;
    const lista = useAvisos.getState().lista;
    const nueva = alCambiar(lista, antes.estados, s.estados, Date.now());
    if (nueva !== lista) useAvisos.setState({ lista: nueva });
  });
}
