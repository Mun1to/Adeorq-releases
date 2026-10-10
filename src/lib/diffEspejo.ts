// El diff del Modo Espejo, leído renglón a renglón.
//
// El panel lo pintaba numerando los renglones DEL DIFF (el 1 era la cabecera
// `diff --git`), así que el número de al lado no era la línea de ningún
// archivo. Aquí cada renglón sabe qué es y en qué línea real cae, que es lo
// que hace falta para lo otro que vive en este fichero: escribirle al agente
// una nota sobre UNA línea de su cambio (`notaParaElAgente`). Hasta el
// 2026-10-10 el diff solo dejaba aceptar o descartar todo; no había camino de
// vuelta para decir «esto sí, pero esta línea no».
//
// Sin ventana ni React: su banco es `scripts/diff-espejo-check.ts`.

import type { Translate } from "./i18n";

export type TipoRenglon = "cabecera" | "trozo" | "mas" | "menos" | "igual";

export interface Renglon {
  tipo: TipoRenglon;
  /** Tal cual viene en el diff, con su signo delante. */
  crudo: string;
  /** Su línea en el archivo: en el NUEVO si se añadió o no cambió, en el
      VIEJO si se quitó (en el nuevo ya no existe). Las cabeceras no tienen. */
  linea?: number;
}

/** De un diff de varios archivos, el trozo de uno. */
export function archivoDelDiff(completo: string, archivo: string): string {
  const lines = completo.split("\n");
  const result: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const parts = line.split(" ");
      const bFile = parts[parts.length - 1]; // b/src/App.tsx
      capture = bFile.endsWith("/" + archivo) || bFile === archivo || bFile.slice(2) === archivo;
    }
    if (capture) result.push(line);
  }
  return result.join("\n");
}

/**
 * Qué es cada renglón y en qué línea cae.
 *
 * Se cuenta con la cabecera de cada trozo (`@@ -a,b +c,d @@`) y no mirando solo
 * el primer carácter: dentro de un trozo, una línea quitada que empezaba por
 * `-- ` llega como `--- `, igual que la cabecera del archivo, y solo sabiendo
 * cuántas líneas le quedan al trozo se distingue una de otra.
 */
export function leerDiff(texto: string): Renglon[] {
  if (!texto) return [];
  let viejo = 0;
  let nuevo = 0;
  let quedanViejas = 0;
  let quedanNuevas = 0;
  return texto.split("\n").map((crudo): Renglon => {
    const dentro = quedanViejas > 0 || quedanNuevas > 0;
    if (dentro && crudo.startsWith("+")) {
      quedanNuevas--;
      return { tipo: "mas", crudo, linea: nuevo++ };
    }
    if (dentro && crudo.startsWith("-")) {
      quedanViejas--;
      return { tipo: "menos", crudo, linea: viejo++ };
    }
    // «\ No newline at end of file» va dentro del trozo y no es una línea.
    if (dentro && !crudo.startsWith("\\")) {
      quedanViejas--;
      quedanNuevas--;
      viejo++;
      return { tipo: "igual", crudo, linea: nuevo++ };
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(crudo);
    if (m) {
      viejo = Number(m[1]);
      nuevo = Number(m[3]);
      quedanViejas = m[2] === undefined ? 1 : Number(m[2]);
      quedanNuevas = m[4] === undefined ? 1 : Number(m[4]);
      return { tipo: "trozo", crudo };
    }
    return { tipo: "cabecera", crudo };
  });
}

/** ¿Se puede comentar? Solo las líneas de archivo, no las cabeceras. */
export function esComentable(r: Renglon): boolean {
  return r.tipo === "mas" || r.tipo === "menos" || r.tipo === "igual";
}

/** Hasta dónde se cita la línea en la nota: para reconocerla, no para repetirla. */
const CITA = 160;

/**
 * Lo que se le escribe al agente: en qué archivo y línea, la línea citada para
 * que no dependa de que el número siga valiendo cuando lo lea, y tu nota. En un
 * solo renglón, que así llega igual a cualquier CLI.
 */
export function notaParaElAgente(archivo: string, r: Renglon, nota: string, t: Translate): string {
  const sinSigno = r.crudo.slice(1).trim();
  const cita = sinSigno.length > CITA ? `${sinSigno.slice(0, CITA)}…` : sinSigno;
  const vars = { archivo, n: r.linea ?? 0, cita, nota: nota.trim().replace(/\s+/g, " ") };
  if (r.tipo === "mas") return t("En {archivo}, sobre la línea {n} que añadiste («{cita}»): {nota}", vars);
  if (r.tipo === "menos") return t("En {archivo}, sobre la línea {n} que quitaste («{cita}»): {nota}", vars);
  return t("En {archivo}, sobre la línea {n} («{cita}»): {nota}", vars);
}
