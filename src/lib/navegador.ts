// El puente con `src-tauri/src/navegador.rs`: el navegador de verdad.
//
// Cada pestaña es un Chromium (WebView2) metido en la ventana como un panel
// nativo, y no un iframe: por eso entran las webs que se niegan a uno y por eso
// se inicia sesión. Lo que hay que saber desde aquí es que ese panel NO es
// DOM. Se coloca dándole un rectángulo (`navColocar`) y queda POR ENCIMA de
// todo lo que pinta la interfaz; de ahí la foto (`navFoto`) que lo sustituye
// mientras un menú o un diálogo pisa su hueco. Y que solo existe en Windows:
// `navDisponible()` dice si hay, y si no, el panel usa el iframe de siempre.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Canal } from "./editorWeb";

/** Dónde va la página, en píxeles de CSS relativos a la ventana. */
export interface Hueco {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Lo que Rust cuenta de una pestaña. Solo viene lo que cambió. */
export interface EstadoNav {
  id: number;
  url?: string;
  titulo?: string;
  cargando?: boolean;
  atras?: boolean;
  adelante?: boolean;
  icono?: string;
  /** Por qué no cargó. Una navegación cancelada no llega aquí. */
  error?: "sin-respuesta" | "certificado" | "fallo";
}

export type Accion = "atras" | "adelante" | "recargar" | "parar";

/** Las teclas que la página le devuelve a Adeorq (ver `tecla_de_adeorq`). */
export type TeclaNav =
  | "nueva-pestana"
  | "cerrar-pestana"
  | "direccion"
  | "pestana-siguiente"
  | "pestana-anterior"
  | `ctrl-mayus-${string}`;

let disponible: Promise<boolean> | null = null;

/** ¿Hay navegador de verdad en este sistema? Se pregunta una vez. */
export function navDisponible(): Promise<boolean> {
  disponible ??= invoke<boolean>("nav_disponible").catch(() => false);
  return disponible;
}

export const navAbrir = (id: number, url: string, hueco: Hueco) =>
  invoke<void>("nav_abrir", { id, url, hueco });
export const navColocar = (id: number, hueco: Hueco, visible: boolean) =>
  invoke<void>("nav_colocar", { id, hueco, visible });
export const navIr = (id: number, url: string) => invoke<void>("nav_ir", { id, url });
export const navAccion = (id: number, accion: Accion) =>
  invoke<void>("nav_accion", { id, accion });
export const navFoco = (id: number) => invoke<void>("nav_foco", { id });
/** Devolver el foco a la interfaz (la página lo tenía). */
export const navFocoInterfaz = () => invoke<void>("nav_foco_interfaz");
/** Un `data:` JPEG de lo que se ve. Tiene que pedirse con la pestaña a la
    vista: WebView2 no fotografía lo que está escondido. */
export const navFoto = (id: number) => invoke<string>("nav_foto", { id });
export const navCerrar = (id: number) => invoke<void>("nav_cerrar", { id });

/** Los tres avisos de Rust, con una sola función para darse de baja. */
export async function oirNavegador(m: {
  estado: (e: EstadoNav) => void;
  nueva: (id: number, url: string) => void;
  tecla: (id: number, tecla: TeclaNav) => void;
}): Promise<UnlistenFn> {
  const bajas = await Promise.all([
    listen<EstadoNav>("nav-estado", (e) => m.estado(e.payload)),
    listen<{ id: number; url: string }>("nav-nueva", (e) => m.nueva(e.payload.id, e.payload.url)),
    listen<{ id: number; tecla: TeclaNav }>("nav-tecla", (e) => m.tecla(e.payload.id, e.payload.tecla)),
  ]);
  return () => bajas.forEach((b) => b());
}

/**
 * ¿Hay algo de la interfaz encima del hueco?
 *
 * Se le pregunta a la propia página qué hay arriba del todo en una rejilla de
 * puntos del hueco: si en alguno no es el hueco (ni algo suyo), un menú, un
 * diálogo o la paleta lo está pisando, y la página nativa lo taparía. Así no
 * hace falta una lista de qué es un menú, que se quedaría vieja con la primera
 * pieza nueva. Lo que no recibe el ratón (`pointer-events: none`, como las
 * pistas al pasar) no cuenta: tampoco se puede usar.
 */
export function pisado(hueco: HTMLElement, pasos = 5): boolean {
  const r = hueco.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  for (let i = 0; i < pasos; i++) {
    for (let j = 0; j < pasos; j++) {
      const x = r.left + ((i + 0.5) * r.width) / pasos;
      const y = r.top + ((j + 0.5) * r.height) / pasos;
      const arriba = document.elementFromPoint(x, y);
      if (arriba && arriba !== hueco && !hueco.contains(arriba)) return true;
    }
  }
  return false;
}

/** ¿Es una web de esta máquina? Lo mismo que `es_local` en Rust: solo ahí
    habla el editor por clic con la página nativa. */
export function esLocal(url: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * El editor por clic hablando con una pestaña nativa.
 *
 * Los recados van por Rust (`nav_a_la_pagina`), que los entrega dentro de la
 * página como el `message` que la sonda espera; lo que la sonda contesta vuelve
 * como el evento `nav-sonda`, solo desde webs de esta máquina y solo con su
 * marca. Ninguno de los dos caminos le da a la página un permiso de Adeorq.
 */
export function canalNativo(id: number): Canal {
  return {
    enviar: (mensaje) => void invoke("nav_a_la_pagina", { id, mensaje }).catch(() => {}),
    oir: (cb) => {
      let baja: UnlistenFn | null = null;
      let viva = true;
      void listen<{ id: number; mensaje: unknown }>("nav-sonda", (e) => {
        if (e.payload.id === id) cb(e.payload.mensaje);
      }).then((b) => (viva ? (baja = b) : b()));
      return () => {
        viva = false;
        baja?.();
      };
    },
  };
}

/**
 * ¿Hay alguien escuchando en ese puerto de esta máquina?
 *
 * La usa la apertura automática de la web: encontrar `http://localhost:3000` en
 * la salida de una terminal no significa que ahí haya un servidor, y sin esta
 * pregunta la app abriría una pestaña cada vez que un agente escribe esa
 * dirección en una frase. Rust prueba IPv4 e IPv6, con un plazo de 250 ms.
 */
export function puertoEscucha(puerto: number): Promise<boolean> {
  return invoke("puerto_escucha", { puerto });
}

/** El rectángulo de un elemento, en lo que entiende `navColocar`. */
export function huecoDe(el: HTMLElement): Hueco {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, ancho: r.width, alto: r.height };
}
