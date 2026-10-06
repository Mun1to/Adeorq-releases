import { createContext } from "react";

/** El color de cada proyecto que hay en el lienzo (`lib/colorLienzo.ts`), para
 *  que sus terminales, su carril y su marca en el minimapa digan lo mismo. */
export const ColoresLienzo = createContext<Record<string, string>>({});

/** El color de un proyecto por su nombre, sin fijarse en mayúsculas: un carril
 *  lo escribe una persona, y «adeorq» es Adeorq. */
export function colorDeProyecto(colores: Record<string, string>, nombre: string): string | undefined {
  if (colores[nombre]) return colores[nombre];
  const n = nombre.trim().toLowerCase();
  const clave = Object.keys(colores).find((k) => k.toLowerCase() === n);
  return clave ? colores[clave] : undefined;
}
