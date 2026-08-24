// Cazar el localhost que anuncia una terminal.
//
// Munir, 2026-08-24: «cuando una terminal nombre algo de un localhost o puerto,
// que se abra automáticamente la pestaña del navegador del panel de la
// derecha». Levantar un servidor de desarrollo y tener que copiar la dirección
// a mano al panel de al lado es el paso que sobra: la terminal ya la ha escrito.
//
// ── LA TRAMPA, Y NO ES PEQUEÑA ────────────────────────────────────────────
//
// La dirección NO llega entera. Vite la pinta con colores, y el color va en
// medio del texto:
//
//     ➜  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m
//
// El puerto está en negrita, así que entre `localhost:` y `5173` hay una
// secuencia de escape. Un buscador de direcciones que no limpie el ANSI primero
// encuentra `http://localhost:` y se queda sin puerto, que es exactamente el
// dato que hacía falta. Por eso aquí se limpia SIEMPRE antes de buscar, y por
// eso hay un caso en `scripts/puertos-check.ts` con esa línea copiada tal cual.
//
// ── Y LA OTRA MITAD DEL PROBLEMA: NO MOLESTAR ─────────────────────────────
//
// Un agente escribe «mira en http://localhost:3000» todo el rato sin que haya
// ningún servidor ahí. Encontrar la dirección no basta para abrir nada, y por
// eso esto solo EXTRAE: quien llama comprueba después que el puerto conteste
// (`puertoEscucha`, que va por Rust). Si nadie escucha, no se abre nada.

/**
 * El texto sin los códigos de color de la terminal.
 *
 * Cubre los tres que aparecen en una salida real: las secuencias CSI (colores,
 * cursor), los enlaces OSC 8 (que envuelven la dirección en un hipervínculo, y
 * cuyo texto visible SÍ interesa) y los OSC sueltos con título de ventana.
 */
export function sinAnsi(texto: string): string {
  return (
    texto
      // OSC 8: \x1b]8;;URL\x07 texto \x1b]8;;\x07 — se van las marcas, queda el texto.
      .replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      // Cualquier otro OSC (título de ventana, colores de paleta).
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      // CSI: colores, negrita, movimientos de cursor.
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      // Los sueltos de un carácter (\x1b(B y compañía).
      .replace(/\x1b[@-Z\\-_]/g, "")
  );
}

/** Los nombres que significan «esta máquina». */
const CASA = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"];

/** Una dirección local encontrada en la salida de una terminal. */
export interface Local {
  /** La dirección lista para abrir, ya normalizada a `localhost`. */
  url: string;
  puerto: number;
}

/**
 * Las direcciones locales que anuncia un trozo de salida.
 *
 * Se piden con esquema (`http://…`) y no a secas, y es a propósito: `:3000` o
 * «el puerto 3000» sueltos aparecen en cualquier conversación sobre código, y
 * abrir una pestaña por cada uno convertiría la función en un castigo. Con
 * esquema, lo que se encuentra es casi siempre un servidor anunciándose.
 *
 * `0.0.0.0` y `::1` se traducen a `localhost`: son la misma máquina dicha de
 * otra forma, y `0.0.0.0` en la barra de un navegador no siempre resuelve.
 */
export function localesEn(texto: string): Local[] {
  const limpio = sinAnsi(texto);
  const out: Local[] = [];
  const vistos = new Set<number>();
  const re = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(?::(\d{1,5}))?(\/\S*)?/gi;
  for (const m of limpio.matchAll(re)) {
    if (!CASA.includes(m[1].toLowerCase())) continue;
    // Sin puerto es el 80, y un servidor de desarrollo nunca vive ahí: una
    // dirección así en medio de un texto es prosa, no un anuncio.
    const puerto = Number(m[2]);
    if (!puerto || puerto < 1 || puerto > 65535) continue;
    if (vistos.has(puerto)) continue;
    vistos.add(puerto);
    // La ruta se queda, que un servidor puede anunciarse en `/admin`. Lo que
    // se cae es la puntuación con la que acaba la frase: «abre
    // http://localhost:5173/.» no lleva ese punto dentro de la dirección.
    const ruta = (m[3] ?? "").replace(/[.,;:)\]}'"]+$/, "");
    out.push({ url: `http://localhost:${puerto}${ruta}`, puerto });
  }
  return out;
}

/**
 * Cuánto texto se guarda entre trozo y trozo del PTY.
 *
 * El PTY entrega lo que le llega, no líneas: una dirección puede partirse entre
 * dos entregas y entonces no la ve nadie. Guardando la cola del trozo anterior
 * y buscando sobre las dos juntas, eso deja de pasar. 400 caracteres son de
 * sobra para la línea más larga de un anuncio de servidor y no son nada de
 * memoria.
 */
export const COLA_MAX = 400;

/** La cola que hay que guardar de un trozo para el siguiente. */
export function cola(texto: string): string {
  return texto.length > COLA_MAX ? texto.slice(-COLA_MAX) : texto;
}
