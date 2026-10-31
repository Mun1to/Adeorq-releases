/**
 * Las cuentas de cerrar pestañas del navegador (`Navegador.tsx`), aparte para
 * poder probarlas (`scripts/pestanas-nav-check.ts`).
 *
 * Una pestaña que se cierra se queda 180 ms marcada `muere` mientras se va, y
 * durante ese rato sigue siendo la activa. Dos Ctrl+W seguidos (2026-10-31, la
 * revisión R3) mandaban el segundo a ESA pestaña: no cerraba nada, y su
 * temporizador ya no la encontraba (`-1`) y movía la activa una a la izquierda.
 */

interface Pestana {
  clave: number;
  muere?: boolean;
}

/**
 * A quién va de verdad un «cerrar» pedido sobre `clave`. Si ya se está yendo,
 * a la que quedará delante cuando acabe de irse (la de su derecha, o la de su
 * izquierda si era la última), que es la que el segundo Ctrl+W quería cerrar.
 * `null` si no queda ninguna viva por ese lado.
 */
export function aQuienCerrar(pests: Pestana[], clave: number): number | null {
  const i = pests.findIndex((p) => p.clave === clave);
  if (i < 0) return null;
  if (!pests[i].muere) return clave;
  const derecha = pests.slice(i + 1).find((p) => !p.muere);
  if (derecha) return derecha.clave;
  const izquierda = pests.slice(0, i).reverse().find((p) => !p.muere);
  return izquierda ? izquierda.clave : null;
}

/** El índice activo después de quitar la pestaña que estaba en `i` (o `-1`
 *  si ya no estaba, y entonces no se mueve nada). */
export function activaTrasQuitar(i: number, activa: number, quedan: number): number {
  if (i < 0) return Math.min(activa, quedan - 1);
  return Math.min(i < activa ? activa - 1 : activa, quedan - 1);
}
