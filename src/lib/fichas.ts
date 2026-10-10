import type { Entrada } from "./archivos";
import { conTitulo, tituloDe } from "./notas";

// Las fichas: las recetas de pasos que repites (publicar una versión, dar de
// alta un cliente), guardadas como `.md` dentro del proyecto.
//
// Una ficha NO es una pieza nueva del lienzo: es el texto con el que nace una
// nota. Así no hay un segundo formato que aprender ni un segundo botón que
// buscar: la nota ya sabe lanzarse a una terminal, a una sesión nueva o al
// Reparto, y ya sabe enseñar cuántas casillas van hechas. Lo único que faltaba
// era no tener que escribir los mismos doce pasos cada vez.
//
// Viven en el proyecto, y no en la carpeta de Adeorq, por lo mismo que una
// nota es un `.md`: es el terreno común. Las lee quien abra el repositorio, con
// la herramienta que sea, y se versionan con él.

/** Dónde se buscan, relativo a la raíz del proyecto. */
export const CARPETA_FICHAS = "docs/fichas";

/** Cuántas se ofrecen como mucho: una nota es pequeña, y con más de estas ya
    no es una lista, es un buscador. */
export const TOPE_FICHAS = 12;

export interface Ficha {
  /** Lo que se enseña: el nombre del archivo, sin extensión y sin guiones. */
  nombre: string;
  ruta: string;
}

/** La carpeta de fichas de un proyecto, con la barra que use su ruta. */
export function carpetaDeFichas(raiz: string): string {
  const barra = raiz.includes("\\") ? "\\" : "/";
  const limpia = raiz.replace(/[\\/]+$/, "");
  return `${limpia}${barra}${CARPETA_FICHAS.split("/").join(barra)}`;
}

/** Las fichas que hay entre las filas de esa carpeta: sus `.md`, por nombre. */
export function fichasDe(filas: Entrada[]): Ficha[] {
  return filas
    .filter((f) => !f.carpeta && /\.md$/i.test(f.nombre))
    .map((f) => ({
      nombre: f.nombre.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim(),
      ruta: f.ruta,
    }))
    .filter((f) => f.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .slice(0, TOPE_FICHAS);
}

const MARCADA = /^(\s*-\s\[)[xX](\])/;
const NUMERADA = /^(\s*)\d+[.)]\s+(\S.*)$/;

/**
 * El texto con el que nace una nota a partir de una ficha.
 *
 * Tres cosas, y ninguna más, porque el archivo es de quien lo escribió:
 *
 *  · Todas las casillas salen SIN marcar. Una ficha es una receta, y si alguien
 *    la guardó con dos pasos hechos, la nota nueva no los tiene hechos.
 *  · Un paso numerado («1. Sube el número») se vuelve casilla. Es como se
 *    escribe una lista de pasos en markdown, y pedirle a nadie que aprenda
 *    «- [ ]» para que su receta se pueda marcar sería ponerle deberes.
 *  · Si no trae título, lleva el nombre de la ficha.
 *
 * Lo demás (texto suelto, viñetas, avisos) pasa tal cual: en una nota es texto.
 */
export function notaDesdeFicha(texto: string, nombre: string): string {
  const lineas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(MARCADA, "$1 $2").replace(NUMERADA, "$1- [ ] $2"));
  // Sin los blancos de arriba, que dejarían el título en la tercera línea y la
  // nota no lo reconocería; ni los de abajo, que son alto perdido.
  while (lineas.length && !lineas[0].trim()) lineas.shift();
  while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
  const cuerpo = lineas.join("\n");
  return tituloDe(cuerpo) ? cuerpo : conTitulo(cuerpo, nombre);
}
