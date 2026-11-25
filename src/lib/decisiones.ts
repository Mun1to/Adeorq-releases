// Las decisiones que piden los agentes con `ask_decision` (`decisiones.rs`),
// para la pestaña «Decisiones» de la app. Las mismas que contesta el móvil, con
// las mismas reglas: ninguna opción sale marcada, cada pregunta admite tus
// palabras, y se manda a los cinco segundos con «Deshacer» por medio.

import { useEffect, useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCabina } from "./cabina";
import {
  SIN_REPOSO,
  despertar as despertarFila,
  podar,
  posponer as posponerFila,
  proximoDespertar,
  reposoDe,
  sinVerla as sinVerFila,
  verla as verFila,
  type Cosa,
  type Reposo,
} from "./decisionesLista";

/** Una imagen de la decisión (`image` en ask_decision), ya copiada al almacén:
    se pide por su número, y su tamaño sirve para guardarle el sitio. */
export interface Imagen {
  n: number;
  tipo: string;
  ancho: number;
  alto: number;
}

export interface Opcion {
  texto: string;
  detalle?: string;
  recomendada: boolean;
  imagen?: Imagen;
}

export interface Pregunta {
  /** A, B, C… en el orden en que llegaron. */
  id: string;
  titulo: string;
  contexto?: string;
  opciones: Opcion[];
  imagen?: Imagen;
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

/**
 * En qué punto está (`Vigencia` en `decisiones.rs`): «viva» es que la terminal
 * que preguntó sigue abierta y espera la respuesta; «huerfana», que está sin
 * contestar pero ya no hay nadie detrás (se cerró, o es de otro arranque);
 * «hablada», que le escribiste a esa terminal después de que preguntara;
 * «resuelta», que el agente la dio por resuelta porque la respuesta le llegó
 * por otro lado, o porque la sustituye otra (`close_decision`, `replaces`).
 */
export type Vigencia = "viva" | "huerfana" | "hablada" | "contestada" | "descartada" | "resuelta";

/** Cómo la cerró el agente (`Resuelta` en `decisiones.rs`). */
export interface Resuelta {
  /** Milisegundos. */
  cuando: number;
  como: string;
  /** La decisión que la sustituye, si es eso. */
  sustituta?: string;
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
  /** Cuándo la apartaste sin contestarla, en milisegundos. */
  descartada?: number;
  /** Cuándo le escribiste a la terminal que preguntó, en milisegundos. */
  hablada?: number;
  resuelta?: Resuelta;
  vigencia: Vigencia;
  /** Si contestarla ahora se teclearía en su terminal: es de este arranque y
      esa terminal sigue abierta (`se_teclearia`, en `decisiones.rs`). */
  se_teclea?: boolean;
}

export type Elecciones = Record<string, Eleccion>;

/** Lo que emite Rust cuando una se crea o se contesta (`EVENTO_CAMBIAN`). */
export const EVENTO_CAMBIAN = "decisiones:cambian";

export const listarDecisiones = () => invoke<Decision[]>("decisiones_listar");

export const responderDecision = (id: string, elecciones: Elecciones) =>
  invoke<{ decision: Decision; panel: number | null; texto: string | null }>("decision_responder", { id, elecciones });

export const marcarEntregada = (id: string) => invoke<void>("decision_entregada", { id });

/* Las imágenes de las decisiones, por el id y su número (`decision_imagen`),
   como en el móvil: nunca una ruta. Llegan en binario y se guardan como enlace
   («id:n» → promesa), que la decisión abierta se repinta a cada tecla. Con tope,
   como en el móvil: lleno, se suelta (`revokeObjectURL`) lo usado hace más, nunca
   lo de la decisión de esta imagen, que es la abierta. Antes no se soltaba nada
   (revisión del 2026-11-19). */
const TOPE_FOTOS = 60;
const fotos = new Map<string, Promise<string>>();
export function fotoDecision(id: string, n: number): Promise<string> {
  const k = `${id}:${n}`;
  const ya = fotos.get(k);
  if (ya) {
    fotos.delete(k);
    fotos.set(k, ya);
    return ya;
  }
  const p = invoke<ArrayBuffer>("decision_imagen", { id, n }).then((b) => URL.createObjectURL(new Blob([b])));
  // Lo que falló se vuelve a pedir la próxima vez.
  p.catch(() => fotos.delete(k));
  fotos.set(k, p);
  for (const [viejo, suya] of fotos) {
    if (fotos.size <= TOPE_FOTOS) break;
    if (viejo.startsWith(`${id}:`)) continue;
    fotos.delete(viejo);
    suya.then((u) => URL.revokeObjectURL(u), () => {});
  }
  return p;
}

/** La aparta sin contestarla. Si una terminal la esperaba, vuelve su panel y
    lo que hay que teclearle para que el agente no se quede esperando. */
export const descartarDecision = (id: string) =>
  invoke<{ panel: number | null; texto: string | null }>("decision_descartar", { id });

/**
 * La lista, al día: se lee al abrir Adeorq y cada vez que Rust avisa de un
 * cambio (una nueva del MCP, una contestada desde el móvil o desde aquí). Vive
 * en `App` para que la cuenta de la pestaña esté aunque no la tengas abierta.
 *
 * Y cuando se abre o se cierra una terminal: que una decisión siga viva
 * depende de que la terminal que preguntó esté abierta, y cerrar una no avisa.
 */
export function useDecisiones(): Decision[] {
  const [lista, setLista] = useState<Decision[]>([]);
  const paneles = useCabina((s) => Object.keys(s.estados).join(","));
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      listarDecisiones()
        .then((l) => {
          esperanEn = new Set(l.filter((d) => d.vigencia === "viva" && d.panel != null).map((d) => d.panel!));
          if (vivo) setLista(l);
        })
        .catch(() => {});
    leer();
    const quitar = listen(EVENTO_CAMBIAN, leer);
    return () => {
      vivo = false;
      void quitar.then((f) => f()).catch(() => {});
    };
  }, [paneles]);
  return lista;
}

/** Los paneles que tienen una decisión esperando, de la última lectura: así
    una tecla no tiene que preguntarle nada a Rust si no hay nada que cerrar. */
let esperanEn = new Set<number>();

/**
 * Munir le escribió una frase a esa terminal (`mandoUnaFrase`, en
 * `lib/hablada.ts`): lo que le hubiera preguntado deja de esperarle, como un
 * aviso de la campana deja de reclamarte al contestarle. Rust avisa del cambio
 * y la lista se relee sola.
 */
export function hablarCon(panel: number): void {
  if (!esperanEn.has(panel)) return;
  esperanEn.delete(panel);
  void invoke<number>("decisiones_habladas", { panel }).catch(() => {});
}

/** Las que te esperan DE VERDAD: las vivas. Una huérfana no cuenta en el
    número de la pestaña, que es lo que hacía que nunca bajase a cero. */
export const pendientes = (lista: Decision[]) => lista.filter((d) => d.vigencia === "viva").length;

/** Lo último que le pasó: contestarla, descartarla, hablarla o, si nada, pedirla. */
export const ultimoMovimiento = (d: Decision) =>
  Math.max(d.creada, d.respuesta?.cuando ?? 0, d.descartada ?? 0, d.hablada ?? 0, d.resuelta?.cuando ?? 0);

/**
 * Los dos montones de la lista: las que te esperan y las anteriores, con la
 * última que se movió arriba. Hasta el 2026-10-11 las que no esperaba nadie
 * tenían montón propio y un botón para vaciarlo, y se llenaba igual: ahora se
 * limpian solas (a la semana las borra Rust, `podar`).
 */
export function porVigencia(lista: Decision[]) {
  return {
    vivas: lista.filter((d) => d.vigencia === "viva"),
    anteriores: lista.filter((d) => d.vigencia !== "viva").sort((a, b) => ultimoMovimiento(b) - ultimoMovimiento(a)),
  };
}

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

/* Lo que haces con cada fila de la lista: posponerla (H) y marcarla como vista o
   no vista (U). La cuenta de lo pospuesto (`lib/decisionesLista.ts`) la leen la
   pestaña de Decisiones y el número de la cabecera (`lib/teToca.ts`), que está
   siempre puesto, así que esto vive en un almacén y no en la vista. */

const CLAVE_REPOSO = "adeorq-decisiones-reposo";

function leerReposo(): Reposo {
  try {
    return reposoDe(JSON.parse(localStorage.getItem(CLAVE_REPOSO) || "null"));
  } catch {
    return SIN_REPOSO;
  }
}

interface EstadoReposo {
  reposo: Reposo;
  /** La hora que la lista da por buena: se pone al día cuando vuelve algo pospuesto
      y al volver a la ventana, no en cada segundo. */
  ahora: number;
  verla: (c: Pick<Cosa, "id" | "cuando"> & { clase?: Cosa["clase"] }) => void;
  sinVerla: (id: string) => void;
  posponer: (c: Pick<Cosa, "id" | "cuando">, hasta: number) => void;
  despertar: (id: string) => void;
}

export const useReposo = create<EstadoReposo>((set, get) => {
  /** Guarda lo nuevo, olvida lo viejo y reprograma el reloj. */
  const cambiar = (r: Reposo) => {
    if (r === get().reposo) return;
    const ahora = Date.now();
    const limpio = podar(r, ahora);
    try {
      localStorage.setItem(CLAVE_REPOSO, JSON.stringify(limpio));
    } catch {
      // Sin sitio no se guarda: sigue valiendo mientras no cierres Adeorq.
    }
    set({ reposo: limpio, ahora });
    despertarA();
  };
  return {
    reposo: leerReposo(),
    ahora: Date.now(),
    verla: (c) => cambiar(verFila(get().reposo, c, Date.now())),
    sinVerla: (id) => cambiar(sinVerFila(get().reposo, id)),
    posponer: (c, hasta) => cambiar(posponerFila(get().reposo, c, hasta)),
    despertar: (id) => cambiar(despertarFila(get().reposo, id)),
  };
});

let reloj: number | undefined;

/** Un solo aviso a la hora en que vuelve la primera pospuesta: cuando suena, la
    lista se vuelve a calcular con la hora de verdad y se programa la siguiente. */
function despertarA(): void {
  if (typeof window === "undefined") return;
  window.clearTimeout(reloj);
  const ahora = Date.now();
  const cuando = proximoDespertar(useReposo.getState().reposo, ahora);
  if (cuando === undefined) return;
  // Un `setTimeout` no pasa de unos 24 días, y se le da un respiro para no
  // despertar medio segundo antes de la hora.
  reloj = window.setTimeout(() => {
    useReposo.setState({ ahora: Date.now() });
    despertarA();
  }, Math.min(cuando - ahora + 50, 2 ** 31 - 1));
}

if (typeof document !== "undefined") {
  despertarA();
  // Tras dormir el equipo un `setTimeout` suena tarde: al volver se mira otra vez.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    useReposo.setState({ ahora: Date.now() });
    despertarA();
  });
}
