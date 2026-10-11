// La campana: lo que te reclama, apuntado en una lista en vez de sonar y
// perderse.
//
// Hasta el 2026-10-10 un agente que terminaba o que te preguntaba algo lo decía
// con un sonido y una notificación del sistema (`lib/notify.ts`), y si en ese
// momento mirabas a otro lado, no quedaba en ningún sitio: había que repasar
// las terminales una a una. Munir pidió la campana ese día.
//
// Un aviso nace en el INSTANTE en que un panel pasa de trabajar a reclamarte
// (la misma regla que el salto a pantalla completa, `acabaDeReclamar`), y se va
// solo, sin que hagas nada aquí: uno de «te espera», en cuanto le contestas en
// su terminal o la cierras; uno de «terminó», además, en cuanto lo has visto
// (cierras la lista con él dentro, o entras en su terminal). La lista no es
// otra bandeja que vaciar: es un espejo de lo que hay AHORA. Hasta el
// 2026-10-11 guardaba también lo que ya había pasado, apagado, y Munir se la
// encontró llena de cosas atendidas: «¿cómo hacemos para que se limpien?».
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
}

/** Cuántos caben. Como mucho hay uno por panel, así que es un seguro. */
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
  // Lo que ya no es verdad se va: el panel se cerró, o le contestaste y volvió
  // a trabajar.
  const quedan = lista.filter((a) => {
    const st = ahora[a.paneId];
    return !!st && reclamaTuAtencion(st.state);
  });
  let nueva = quedan.length === lista.length ? lista : quedan;

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
    // Un aviso por panel a la vez: el anterior de ese panel se quita.
    nueva = [
      ...nueva.filter((a) => a.paneId !== st.id),
      { n: ++n, paneId: st.id, nombre: st.name, cwd: st.cwd, tipo: tipoDe(st.state), porque: st.porque, cuando, leido: false },
    ];
  }
  return nueva.length > TOPE ? nueva.slice(nueva.length - TOPE) : nueva;
}

/** Los que cuentan en el número de la campana: los que no has visto. */
export function sinLeer(lista: Aviso[]): number {
  return lista.filter((a) => !a.leido).length;
}

/**
 * La lista después de mirarla: lo que terminó ya lo has visto y se va; lo que
 * te espera se queda, leído, hasta que le contestes.
 */
export function trasVerla(lista: Aviso[]): Aviso[] {
  if (!lista.some((a) => a.tipo === "hecho" || !a.leido)) return lista;
  return lista.filter((a) => a.tipo === "espera").map((a) => (a.leido ? a : { ...a, leido: true }));
}

/** Menos que esto entre el aviso y la entrada no es que hayas ido tú: es el
    ajuste «saltar a la sesión que termina», que te la pone delante él solo. */
export const SALTO_MS = 1500;

/**
 * Entras en una terminal: su «terminó» ya está visto. Si te espera, se queda.
 *
 * Uno recién nacido no cuenta: con el salto automático puesto, el panel que
 * termina coge el foco en ese mismo instante, y si no estás delante el aviso es
 * lo único que te lo va a contar al volver.
 */
export function trasEntrar(lista: Aviso[], paneId: number, ahora: number): Aviso[] {
  const queda = lista.filter((a) => !(a.paneId === paneId && a.tipo === "hecho" && ahora - a.cuando >= SALTO_MS));
  return queda.length === lista.length ? lista : queda;
}

/** Cómo está la mascota (Adeo). `piensa` y `escucha` no salen de aquí: son los
    del chat, mientras el conserje contesta y mientras le escribes
    (`animoDelChat`, en `lib/conserje.ts`). */
export type Animo = "espera" | "duda" | "lista" | "apurada" | "piensa" | "escucha" | "trabaja" | "baila" | "quieta" | "dormida";

/** Lo que Adeo sabe además de tus terminales. */
export interface Senales {
  /** Decisiones que una terminal sigue esperando (las vivas). */
  decisiones?: number;
  /** Encargos programados que el freno ha parado. */
  cortados?: number;
  /** Suena música en el PC. */
  suena?: boolean;
}

/**
 * El ánimo de la mascota: lo MÁS urgente de todas tus terminales.
 *
 * Que hayas abierto la lista no quita que un agente siga esperándote. El
 * orden es una decisión: primero quien te espera (una terminal, y luego una
 * decisión); después la noticia de que alguien terminó; después lo que se ha
 * roto y sigue roto (un encargo programado que el freno paró); y solo entonces
 * lo que no te pide nada: que trabajan, que suena música, o que no hay nadie.
 */
export function animoDe(lista: Aviso[], estados: Record<number, PaneStatus>, s: Senales = {}): Animo {
  if (lista.some((a) => a.tipo === "espera")) return "espera";
  if ((s.decisiones ?? 0) > 0) return "duda";
  if (lista.some((a) => a.tipo === "hecho" && !a.leido)) return "lista";
  if ((s.cortados ?? 0) > 0) return "apurada";
  const paneles = Object.values(estados);
  if (paneles.some((p) => p.agent && (p.state === "a_medias" || p.agentsLive > 0))) return "trabaja";
  if (s.suena) return "baila";
  return paneles.length === 0 ? "dormida" : "quieta";
}

interface Almacen {
  lista: Aviso[];
  /** Has cerrado la lista: `trasVerla`. */
  vista: () => void;
  /** Has entrado en esa terminal: `trasEntrar`. */
  entrar: (paneId: number) => void;
}

const cambia = (s: Almacen, lista: Aviso[]) => (lista === s.lista ? s : { lista });

export const useAvisos = create<Almacen>((set) => ({
  lista: [],
  vista: () => set((s) => cambia(s, trasVerla(s.lista))),
  entrar: (paneId) => set((s) => cambia(s, trasEntrar(s.lista, paneId, Date.now()))),
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
