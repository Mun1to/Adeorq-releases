// Lo nuevo de cada versión (`src/novedades.json`), ya con su forma. Va aparte de
// `novedades.ts` para que aquella se pueda probar sin cargar un JSON: el banco
// (`scripts/novedades-check.ts`) lee el fichero del disco y lo revisa entero.

import datos from "../novedades.json";
import type { Novedades } from "./novedades";

export const NOVEDADES = datos as Novedades;
