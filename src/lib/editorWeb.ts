// El puente entre la barra de herramientas de Adeorq y la sonda que corre
// dentro de tu página.
//
// Son dos mundos separados a propósito. La sonda vive en el iframe, sabe qué
// has señalado y pinta el marco; la barra vive aquí, es cristal de Adeorq y no
// se contagia del CSS de tu web. Entre los dos solo pasa `postMessage`, que es
// el único hueco que el navegador deja abierto entre orígenes distintos.
//
// Escribir en el fichero no pasa por aquí más que de paso: esto recoge lo que
// dice la sonda y se lo pasa a `editor.rs`, que es el único que toca el disco.

import { invoke } from "@tauri-apps/api/core";

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

/** Le habla a la sonda. Sin iframe cargado no hay nadie al otro lado. */
export function aLaSonda(marco: HTMLIFrameElement | null, mensaje: Record<string, unknown>) {
  marco?.contentWindow?.postMessage({ de: "adeorq", ...mensaje }, "*");
}

/**
 * ¿Este mensaje viene de nuestra sonda?
 *
 * Cualquier página metida en un iframe puede mandarle mensajes al padre, así
 * que la marca no es un detalle: sin ella, una web abierta en el panel podría
 * pedirle a Adeorq que escribiera en un fichero. La otra mitad de la cerradura
 * está en Rust, que solo escribe dentro de la carpeta anunciada y solo en
 * ficheros de interfaz.
 */
export function deLaSonda(e: MessageEvent): DeLaSonda | null {
  const m = e.data;
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
