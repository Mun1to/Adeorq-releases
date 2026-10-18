// El puente entre la barra de herramientas de Adeorq y la sonda que corre
// dentro de tu página.
//
// Son dos mundos separados a propósito. La sonda vive en la página, sabe qué
// has señalado y pinta el marco; la barra vive aquí, es cristal de Adeorq y no
// se contagia del CSS de tu web. Entre los dos solo pasan recados (`Canal`):
// `postMessage` con la página en un iframe, o Rust con la página en el
// navegador de verdad.
//
// Escribir en el fichero no pasa por aquí más que de paso: esto recoge lo que
// dice la sonda y se lo pasa a `editor.rs`, que es el único que toca el disco.

import { invoke } from "@tauri-apps/api/core";
import { esLocal } from "./navegador";

/** Las herramientas de la columna, en el orden en que se enseñan. */
export type Herramienta =
  | "select"
  | "mover"
  | "caja"
  | "esquinas"
  | "espaciado"
  | "recorte"
  | "color"
  | "texto"
  | "girar"
  | "duplicar";

/** El retrato de un elemento tal y como lo manda la sonda. */
export interface Elegido {
  loc: string | null;
  etiqueta: string;
  clases: string;
  texto: string | null;
  caja: { x: number; y: number; ancho: number; alto: number };
  estilo: Record<string, string>;
  puesto: Record<string, string>;
}

export type DeLaSonda =
  | { tipo: "lista"; url: string; raiz: string; marcados: number }
  | { tipo: "seleccion"; elemento: Elegido | null }
  | { tipo: "escribir"; loc: string; estilos: Record<string, string> }
  | { tipo: "escribirTexto"; loc: string; valor: string; antes: string }
  | { tipo: "caja"; elementos: Elegido[] }
  | { tipo: "alagente"; elemento: Elegido }
  | { tipo: "duplicar" | "borrar"; loc: string }
  | { tipo: "sinorigen"; elemento: Elegido };

/**
 * Por dónde se habla con la sonda.
 *
 * Hay dos caminos y la barra no tiene por qué saber cuál es: con la página en un
 * iframe, `postMessage` (`canalDeMarco`); con la página en el navegador de
 * verdad, un Chromium nativo que no es DOM, por Rust (`canalNativo`, en
 * `lib/navegador.ts`).
 */
export interface Canal {
  enviar: (mensaje: Record<string, unknown>) => void;
  /** Escuchar lo que llegue; devuelve cómo dejar de escuchar. */
  oir: (cb: (datos: unknown) => void) => () => void;
}

/**
 * El de siempre: la página en un iframe. Sin iframe cargado no hay nadie al otro lado.
 *
 * Solo se escucha a ESE iframe y solo si es una web de esta máquina. Antes valía
 * cualquier `postMessage` con la marca, y la revisión de seguridad del
 * 2026-10-18 lo cazó: con el editor encendido sobre una web de fuera (que va en
 * iframe), esa web podía anunciar una carpeta y pedir escrituras. La marca la
 * puede poner cualquiera; quién manda el mensaje, no.
 */
export function canalDeMarco(marco: HTMLIFrameElement | null): Canal {
  return {
    enviar: (mensaje) => marco?.contentWindow?.postMessage({ de: "adeorq", ...mensaje }, "*"),
    oir: (cb) => {
      const f = (e: MessageEvent) => {
        if (!marco || e.source !== marco.contentWindow || !esLocal(e.origin)) return;
        cb(e.data);
      };
      window.addEventListener("message", f);
      return () => window.removeEventListener("message", f);
    },
  };
}

/**
 * ¿Esto viene de nuestra sonda?
 *
 * Cualquier página metida en un iframe puede mandarle mensajes al padre, así
 * que la marca no es un detalle: sin ella, una web abierta en el panel podría
 * pedirle a Adeorq que escribiera en un fichero. La otra mitad de la cerradura
 * está en Rust, que solo escribe dentro de la carpeta anunciada y solo en
 * ficheros de interfaz.
 */
export function deLaSonda(datos: unknown): DeLaSonda | null {
  const m = datos as { de?: unknown; tipo?: unknown } | null;
  if (!m || typeof m !== "object" || m.de !== "adeorq-sonda") return null;
  if (typeof m.tipo !== "string") return null;
  return m as DeLaSonda;
}

export function escribirEstilo(
  raiz: string,
  loc: string,
  estilos: Record<string, string>,
): Promise<string> {
  return invoke<string>("editor_escribir_estilo", { raiz, loc, estilos });
}

export function escribirTexto(
  raiz: string,
  loc: string,
  valor: string,
  antes: string,
): Promise<string> {
  return invoke<string>("editor_escribir_texto", { raiz, loc, valor, antes });
}

/**
 * El encargo que se le manda al agente cuando pulsas «Mandar al agente».
 *
 * Se escribe en prosa y con la ruta del fichero delante porque lo va a leer un
 * agente en una terminal, no un programa: darle el trozo de fichero y lo que
 * se ve en pantalla le ahorra la parte que peor hace, que es adivinar de qué
 * elemento le estás hablando.
 */
export function parteParaElAgente(elegidos: Elegido[], url: string): string {
  const trozos = elegidos.map((el) => {
    const donde = el.loc ? el.loc.split(":")[0] : "sin localizar";
    const clases = el.clases ? `.${el.clases.split(/\s+/).filter(Boolean).join(".")}` : "";
    const texto = el.texto ? ` con el texto «${el.texto.slice(0, 80)}»` : "";
    const medidas = `${Math.round(el.caja.ancho)}x${Math.round(el.caja.alto)}`;
    return `- <${el.etiqueta}${clases}> en ${donde}, mide ${medidas}${texto}`;
  });
  const cabeza =
    elegidos.length === 1
      ? "Te señalo este elemento de la página que tengo abierta"
      : `Te señalo ${elegidos.length} elementos de la página que tengo abierta`;
  return `${cabeza} (${url}):\n${trozos.join("\n")}\n\n`;
}
