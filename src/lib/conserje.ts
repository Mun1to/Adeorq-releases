// El conserje: el chat principal que lo conecta todo.
//
// Munir, 2026-09-30: «Es todo en un chat y dentro de ese chat se ven diferentes
// pestañas o cosas trabajando; si haces clic vas a esa sesión. El chat principal
// es un conserje que conecta todo.» Le hablas; él parte lo que pides en
// trabajos y dice cómo es cada uno; y ESTA pieza los ejecuta: cada trabajo pasa
// por el router (si está encendido) y se abre sin sacarte del chat.
//
// El reparto de papeles es el de la casa: el modelo interpreta, el código
// ejecuta. Lo que el conserje devuelve ya pasó por la reja de Rust
// (`conserje.rs`: carpetas reales, solo sus paneles, tope de cuatro); aquí se
// decide el modelo con `recetar`, que tiene sus 33 casos probados, y no con lo
// que el modelo diga que eligió.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Exigencia, Receta } from "./router";
import type { PaneStatus, WorkState } from "./pty";

export interface Turno {
  n: number;
  rol: "tu" | "conserje";
  texto: string;
  resumen: string;
  cuando: number;
}

/** Una sesión de trabajo abierta por el conserje: una pestaña del chat. */
export interface Trabajo {
  panel: number;
  cli: string;
  modelo: string;
  cuenta: string;
  carpeta: string;
  encargo: string;
  abierto: number;
  /** `router` o `tu`, apuntado al abrir: no cambia si luego apagas el router. */
  eligio: string;
  porque: string;
  /** En qué turno lo abrió el conserje: su tarjeta va justo después. */
  turno?: number;
  /** Su sesión, en cuanto se sabe: lo que deja volver a ella con el panel ya
   *  cerrado, porque la conversación sigue en el disco. */
  sesion?: string;
  /** El arranque de Adeorq en que se abrió; lo pone Rust. Los paneles vuelven
   *  a contar desde 1 cada vez que se abre la app, así que un panel solo es
   *  SUYO si el arranque es el de ahora (ver `paneDe`). */
  arranque?: number;
  /** Quitaste su pestaña; la tarjeta sigue en el hilo. */
  soltado?: boolean;
}

/** Quién es una pestaña: el panel solo se repite entre arranques. */
export const claveDe = (w: Trabajo) => `${w.arranque ?? 0}:${w.panel}`;

/** El panel de un trabajo, si sigue siendo el suyo. Uno de otro arranque no
 *  tiene panel: el que lleva su número hoy es otra terminal. */
export function paneDe(w: Trabajo, panes: PaneStatus[], arranque: number | null): PaneStatus | undefined {
  if (arranque === null || w.arranque !== arranque) return undefined;
  return panes.find((p) => p.id === w.panel);
}

export interface Conversacion {
  id: string;
  titulo: string;
  turnos: Turno[];
  trabajos: Trabajo[];
  router: boolean;
  creada: number;
}

export interface Ficha {
  id: string;
  titulo: string;
  cuando: number;
  trabajos: number;
}

export type Accion =
  | {
      tipo: "abrir";
      encargo: string;
      carpeta: string;
      clase: string;
      consecuencia: string;
      largo: boolean;
      trabajo: string;
    }
  | { tipo: "escribir"; panel: number; texto: string };

export interface Respuesta {
  texto: string;
  acciones: Accion[];
  descartes: string[];
}

export const conserjeLista = () => invoke<Ficha[]>("conserje_lista");
export const conserjeLeer = (id: string) => invoke<Conversacion>("conserje_leer", { id });
export const conserjeRouter = (id: string, encendido: boolean) =>
  invoke<void>("conserje_router", { id, encendido });
/** Apunta una sesión que se ACABA de abrir; Rust le pone el arranque. */
export const conserjeTrabajo = (id: string, trabajo: Trabajo) =>
  invoke<void>("conserje_trabajo", { id, trabajo });
export const conserjeSoltar = (id: string, w: Trabajo) =>
  invoke<void>("conserje_soltar", { id, panel: w.panel, arranque: w.arranque ?? 0 });
export const conserjeArranque = () => invoke<number>("conserje_arranque");
/** Apunta la sesión de una pestaña que ya estaba. `conserjeTrabajo` es solo
 *  para las que se acaban de abrir. */
export const conserjeSesion = (id: string, w: Trabajo, sesion: string) =>
  invoke<void>("conserje_sesion", { id, panel: w.panel, arranque: w.arranque ?? 0, sesion });
export const conserjeOlvidar = (id: string) => invoke<void>("conserje_olvidar", { id });
export const conserjeEnviar = (id: string, texto: string, estados: Record<string, string>) =>
  invoke<Respuesta>("conserje_enviar", { id, texto, estados });
export const conserjeParar = () => invoke<void>("conserje_parar");
export const conserjeMejorar = (texto: string) => invoke<string>("conserje_mejorar", { texto });

/** Lo que va haciendo mientras piensa: «Mirando tus proyectos»… */
export function onPaso(cb: (p: { id: string; paso: string }) => void): Promise<UnlistenFn> {
  return listen<{ id: string; paso: string }>("conserje-paso", (e) => cb(e.payload));
}

/** Un id para una conversación nueva. Solo letras y números: va a un nombre de
 *  archivo, y Rust rechaza cualquier otra cosa. */
export function nuevoId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Lo que se decide sin gastar un token ────────────────────────────────────

/** Cómo está una pestaña, en tres colores y una palabra. */
export type Estado = "trabajando" | "pregunta" | "termino" | "cerrada";

export function estadoDe(s: PaneStatus | undefined): Estado {
  if (!s) return "cerrada";
  const w: WorkState = s.state;
  if (w === "pregunta" || w === "ofrece") return "pregunta";
  if (w === "lista" || w === "tuya") return "termino";
  // «a_medias» es trabajando; «» (no se sabe todavía, está arrancando) también:
  // una sesión recién abierta no ha terminado nada.
  return "trabajando";
}

export const PALABRA: Record<Estado, string> = {
  trabajando: "trabajando",
  pregunta: "te pregunta algo",
  termino: "ha terminado",
  cerrada: "cerrada",
};

/** Lo que dice la pestaña del conserje de las suyas, lo más urgente primero:
 *  quien te pregunta, quien ha terminado, quien trabaja. Antes decía «todo en
 *  marcha» con solo tener pestañas, aunque estuvieran todas cerradas. */
export function resumenDePestanas(estados: Estado[]): { clave: string; n: number } {
  const cuantos = (e: Estado) => estados.filter((x) => x === e).length;
  const pregunta = cuantos("pregunta");
  if (pregunta) return { clave: pregunta === 1 ? "{n} te espera" : "{n} te esperan", n: pregunta };
  const termino = cuantos("termino");
  if (termino) return { clave: termino === 1 ? "{n} ha terminado" : "{n} han terminado", n: termino };
  const trabajando = cuantos("trabajando");
  if (trabajando) return { clave: "{n} trabajando", n: trabajando };
  return { clave: "dime qué hacemos", n: 0 };
}

/** «2 sesiones en marcha»: las cerradas no cuentan, que la cabecera decía
 *  «1 sesiones abiertas» de una que ya no existía. */
export function enMarcha(estados: Estado[]): { clave: string; n: number } {
  const n = estados.filter((e) => e !== "cerrada").length;
  return { clave: n === 0 ? "nada en marcha" : n === 1 ? "1 sesión en marcha" : "{n} sesiones en marcha", n };
}

/** Lo que el conserje necesita saber de sus pestañas, por panel. */
export function estadosParaElConserje(trabajos: Trabajo[], status: PaneStatus[]): Record<string, string> {
  const fuera: Record<string, string> = {};
  for (const t of trabajos) {
    fuera[String(t.panel)] = PALABRA[estadoDe(status.find((s) => s.id === t.panel))];
  }
  return fuera;
}

/** De lo que dijo el conserje a lo que necesita el router. La reja de Rust ya
 *  normalizó los valores; esto solo cambia de forma. */
export function exigenciaDe(a: Extract<Accion, { tipo: "abrir" }>): Exigencia {
  return {
    clase: a.clase as Exigencia["clase"],
    consecuencia: a.consecuencia === "baja" ? "baja" : "alta",
    largo: !!a.largo,
    trabajo: a.trabajo as Exigencia["trabajo"],
  };
}

/** El nombre de la carpeta, que es como se llama un proyecto en todas partes. */
export function hoja(carpeta: string): string {
  return carpeta.split(/[\\/]/).filter(Boolean).pop() ?? carpeta;
}

// ─── Ejecutar lo que pidió el conserje ───────────────────────────────────────

/** Lo que el ejecutor necesita del resto de la app. Llega desde fuera para que
 *  se pueda probar sin la app (`scripts/conserje-check.ts`). */
export interface Manos {
  router: boolean;
  /** El router ya con su foto de cuentas dentro. */
  recetar: (ex: Exigencia) => Receta;
  /** Lo que se usa con el router apagado: lo que Munir tenga puesto. */
  fijo: { cli: string; modelo?: string };
  /** Abre la sesión sin moverte del chat y devuelve su panel. */
  abrir: (r: Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo">, cwd: string, label: string, encargo: string) => number | undefined;
  escribir: (panel: number, texto: string) => Promise<boolean>;
  ahora?: () => number;
}

export interface Hecho {
  abiertos: Trabajo[];
  escritos: number[];
  fallos: string[];
}

export async function ejecutar(acciones: Accion[], m: Manos): Promise<Hecho> {
  const hecho: Hecho = { abiertos: [], escritos: [], fallos: [] };
  const ahora = m.ahora ?? (() => Math.floor(Date.now() / 1000));
  for (const a of acciones) {
    if (a.tipo === "abrir") {
      const receta: Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo" | "porque"> = m.router
        ? m.recetar(exigenciaDe(a))
        : { cli: m.fijo.cli, modelo: m.fijo.modelo as Receta["modelo"], porque: [] };
      const label = `${hoja(a.carpeta)} · ${receta.cli}`;
      const panel = m.abrir(receta, a.carpeta, label, a.encargo);
      if (panel === undefined) {
        hecho.fallos.push(`no se pudo abrir la sesión para «${a.encargo.slice(0, 60)}»`);
        continue;
      }
      hecho.abiertos.push({
        panel,
        cli: receta.cli,
        modelo: receta.modelo ?? "",
        cuenta: receta.cuenta?.label ?? "",
        carpeta: a.carpeta,
        encargo: a.encargo,
        abierto: ahora(),
        eligio: m.router ? "router" : "tu",
        porque: m.router ? receta.porque.join(" ") : "",
      });
    } else {
      const ok = await m.escribir(a.panel, a.texto);
      if (ok) hecho.escritos.push(a.panel);
      else hecho.fallos.push(`no le llegó el mensaje al panel ${a.panel}`);
    }
  }
  return hecho;
}
