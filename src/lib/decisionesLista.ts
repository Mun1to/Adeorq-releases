// La lista de la pestaña «Decisiones»: todo lo que necesita tu dedo, en un solo sitio.
//
// Munir eligió el 2026-11-15 (A1, `docs/propuestas/diseno-ade.md`, «La bandeja,
// una sola»): hasta entonces lo que te reclamaba vivía en cuatro sitios (la
// campana de Adeo, Decisiones, la bandeja de la Agenda y el «Te espera» del
// lienzo) y Decisiones solo enseñaba las preguntas con opciones. Ahora es UNA
// lista, como un programa de correo, en este orden:
//
//   1. Te toca: una terminal parada en una pregunta o un permiso («Contesta»),
//      una pregunta de `ask_decision` («Decide») y un encargo programado que el
//      freno paró («Parado»). Es lo mismo que pone a Adeo en guardia
//      (`animoDe`, en `lib/campana.ts`) y en ese mismo orden.
//   2. Terminó: los turnos acabados que no has mirado («Mira»).
//   3. Ideas de tus agentes: la bandeja de la regla R (`bandeja.md`, «Idea»).
//   4. Ya pasó: las decisiones que ya no esperan a nadie, apagadas.
//
// Aquí vive lo que se prueba sin ventana: qué entra, en qué parte y en qué
// orden, y a cuál se pasa con J y K (`pnpm bancos decisiones-lista`). La
// pantalla es `components/DecisionesView.tsx`. Todo lo importado es de tipos:
// este archivo no habla con Rust ni con ningún almacén.

import type { Aviso } from "./campana";
import type { Decision } from "./decisiones";
import type { Programado } from "./programados";
import type { Note } from "./pty";

export type Parte = "toca" | "termino" | "ideas" | "pasado";

/** Las partes, en el orden en que se enseñan. */
export const PARTES: Parte[] = ["toca", "termino", "ideas", "pasado"];

/** El título de cada parte. */
export const TITULO_DE: Record<Parte, string> = {
  toca: "Te toca",
  termino: "Terminó",
  ideas: "Ideas de tus agentes",
  pasado: "Ya pasó",
};

export type Cosa =
  | { id: string; parte: "toca" | "pasado"; clase: "decide" | "pasada"; cuando: number; d: Decision }
  | { id: string; parte: "toca" | "termino"; clase: "contesta" | "mira"; cuando: number; a: Aviso }
  | { id: string; parte: "toca"; clase: "parado"; cuando: number; p: Programado }
  | { id: string; parte: "ideas"; clase: "idea"; cuando: number; n: Note };

export type Clase = Cosa["clase"];

/** La primera palabra de la fila, que es su categoría. La de una decisión que
    ya pasó dice cómo acabó. */
export const PALABRA: Record<Exclude<Clase, "pasada">, string> = {
  contesta: "Contesta",
  decide: "Decide",
  parado: "Parado",
  mira: "Mira",
  idea: "Idea",
};

/** Cómo acabó una decisión que ya no espera a nadie, en una palabra. */
export const ACABO: Record<string, string> = {
  huerfana: "Sin nadie detrás",
  hablada: "Hablada",
  contestada: "Contestada",
  descartada: "Descartada",
  resuelta: "Resuelta",
};

/** Lo último que le pasó a una decisión: contestarla, descartarla, hablarla o, si nada, pedirla. */
const ultimoMovimiento = (d: Decision) =>
  Math.max(d.creada, d.respuesta?.cuando ?? 0, d.descartada ?? 0, d.hablada ?? 0, d.resuelta?.cuando ?? 0);

const masNuevaPrimero = (x: Cosa, y: Cosa) => y.cuando - x.cuando;

export interface Fuentes {
  decisiones: Decision[];
  /** Los de la campana (`useAvisos`): «espera» y «hecho». */
  avisos: Aviso[];
  programados: Programado[];
  /** La bandeja de la Agenda (`read_inbox`), en el orden del archivo. */
  notas: Note[];
}

/**
 * La lista entera, ya ordenada: primero lo que te toca, luego lo que terminó,
 * luego las ideas y al final lo que ya pasó. Dentro de cada parte, lo más
 * nuevo arriba, como un correo.
 *
 * Un «terminó» de una terminal que te ha dejado una decisión viva no sale: la
 * decisión ya dice lo que hay que hacer, y dos filas para lo mismo es justo el
 * ruido que esta lista viene a quitar. Un «te espera» sí sale, porque una
 * terminal parada en un permiso necesita su tecla aunque haya preguntado algo
 * más.
 */
export function juntar(f: Fuentes): Cosa[] {
  const vivas = f.decisiones.filter((d) => d.vigencia === "viva");
  const conDecision = new Set(vivas.flatMap((d) => (d.panel != null ? [d.panel] : [])));
  const contesta: Cosa[] = f.avisos
    .filter((a) => a.tipo === "espera")
    .map((a) => ({ id: `aviso:${a.paneId}`, parte: "toca", clase: "contesta", cuando: a.cuando, a }));
  const decide: Cosa[] = vivas.map((d) => ({ id: `dec:${d.id}`, parte: "toca", clase: "decide", cuando: d.creada, d }));
  const parado: Cosa[] = f.programados.flatMap((p) =>
    p.cortado ? [{ id: `prog:${p.id}`, parte: "toca" as const, clase: "parado" as const, cuando: p.cortado.cuando, p }] : [],
  );
  const mira: Cosa[] = f.avisos
    .filter((a) => a.tipo === "hecho" && !conDecision.has(a.paneId))
    .map((a) => ({ id: `aviso:${a.paneId}`, parte: "termino", clase: "mira", cuando: a.cuando, a }));
  // La bandeja no lleva hora: las nuevas se añaden al final del archivo, así
  // que la línea hace de reloj.
  const ideas: Cosa[] = f.notas
    .slice()
    .sort((x, y) => y.line - x.line)
    .map((n) => ({ id: `nota:${n.line}`, parte: "ideas", clase: "idea", cuando: 0, n }));
  const pasadas: Cosa[] = f.decisiones
    .filter((d) => d.vigencia !== "viva")
    .map((d) => ({ id: `dec:${d.id}`, parte: "pasado", clase: "pasada", cuando: ultimoMovimiento(d), d }));
  return [
    ...contesta.sort(masNuevaPrimero),
    ...decide.sort(masNuevaPrimero),
    ...parado.sort(masNuevaPrimero),
    ...mira.sort(masNuevaPrimero),
    ...ideas,
    ...pasadas.sort(masNuevaPrimero),
  ];
}

/** Lo que cuenta la pestaña: lo que te toca a ti. Lo que terminó ya lo cuenta
    la campana, y las ideas no te esperan. */
export const cuantasTeTocan = (lista: Cosa[]) => lista.filter((c) => c.parte === "toca").length;

/**
 * La que se abre al entrar o cuando la abierta se va de la lista (le
 * contestaste, la aceptaste, se cerró su terminal).
 *
 * Al entrar, solo una que te toca: con nada pendiente la pestaña lo dice y no
 * te planta delante una de ayer. Si se va la que tenías delante, la que ocupa
 * ahora su sitio, para seguir con J sin volver arriba.
 */
export function laAbierta(lista: Cosa[], id: string | null, dondeEstaba: number): Cosa | undefined {
  if (id != null) {
    const sigue = lista.find((c) => c.id === id);
    if (sigue) return sigue;
    if (dondeEstaba >= 0 && lista.length) return lista[Math.min(dondeEstaba, lista.length - 1)];
  }
  return lista.find((c) => c.parte === "toca");
}

/** La vecina para J y K (o ↓ y ↑): sin dar la vuelta, que en una lista de
    correo pasar del último al primero te pierde. Sin ninguna abierta, J abre
    la primera y K la última. */
export function vecina(lista: Cosa[], id: string | null, paso: 1 | -1): Cosa | undefined {
  if (!lista.length) return undefined;
  const i = id == null ? -1 : lista.findIndex((c) => c.id === id);
  if (i < 0) return paso > 0 ? lista[0] : lista[lista.length - 1];
  return lista[Math.max(0, Math.min(lista.length - 1, i + paso))];
}

/** «Adeorq», de `C:\proyectos\Adeorq`. */
export const carpeta = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
