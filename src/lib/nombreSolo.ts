// El panel se pone nombre solo.
//
// Una terminal nueva nace llamándose «Adeorq · claude», que no dice nada de lo
// que se hace dentro, y así se quedaba hasta que alguien la renombraba a mano:
// con seis abiertas, seis cabeceras iguales. La sesión sí tiene nombre (Claude
// le pone uno al poco de empezar, y es el que enseña la barra lateral), así que
// en cuanto llega el panel lo coge: «Adeorq · Arreglar la barra de arriba».
//
// Solo se toca un nombre DE FÁBRICA, el que puso Adeorq al abrir el panel. Uno
// que escribió Munir, el de una sesión retomada, el puesto de una cuadrilla o
// el que eligió un agente al abrirla por el MCP dicen algo, y se quedan. Por
// eso no hace falta apuntar en ningún sitio quién puso el nombre: se le ve.
// Y es solo el nombre del panel: al transcript no se le escribe nada (eso lo
// hace renombrar a mano, que deja un `custom-title`), para que Claude siga
// siendo quien titula su sesión. Su banco es `scripts/nombre-solo-check.ts`.

import { useEffect } from "react";
import { PROVIDERS } from "./providers";

/** Las coletillas con las que nace un panel: el id o el nombre de cada CLI. */
const DE_FABRICA = new Set(PROVIDERS.flatMap((p) => [p.id, p.label]).map((s) => s.toLowerCase()));

/** Dónde empieza la coletilla de un nombre («Adeorq · claude» → tras « · »). */
function corte(name: string): number {
  const i = name.lastIndexOf(" · ");
  return i < 0 ? 0 : i + 3;
}

/** ¿Lo puso Adeorq al abrir el panel? «Adeorq · claude», «Adeorq · Codex 2». */
export function esNombreDeFabrica(name: string): boolean {
  const coletilla = name.slice(corte(name)).trim().replace(/ \d+$/, "").toLowerCase();
  return DE_FABRICA.has(coletilla);
}

/** El nombre que le toca al panel ahora que su sesión tiene título, o `null`
 *  si se queda como está. Conserva lo de delante, que es el proyecto. */
export function nombreConTitulo(name: string, titulo: string | undefined): string | null {
  const limpio = (titulo ?? "").trim();
  if (!limpio || !esNombreDeFabrica(name)) return null;
  return name.slice(0, corte(name)) + limpio;
}

/** Le pide al dueño del panel el nombre nuevo cuando la sesión ya tiene uno.
 *  `fijo` es un panel con un puesto en una cuadrilla, que no se rebautiza. */
export function useNombreSolo(
  id: number,
  name: string,
  titulo: string | undefined,
  fijo: boolean,
  poner: ((id: number, nombre: string, soloPanel: boolean) => void) | undefined,
): void {
  useEffect(() => {
    const nuevo = fijo ? null : nombreConTitulo(name, titulo);
    if (nuevo) poner?.(id, nuevo, true);
    // `poner` cambia de identidad en cada render de quien lo pasa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name, titulo, fijo]);
}
