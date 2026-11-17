/**
 * El tono del tinte de las terminales como «r, g, b», que es lo que el mando
 * «cuánto se ve a través de las terminales» de Ajustes compone en un rgba
 * entero para xterm (`App.tsx`).
 *
 * `--xterm-rgb` llega de dos formas: escrito a mano como «r, g, b» (Contraste,
 * Negro, Tinta y el azul de fábrica de `02-armazon.css`) o como el fondo del
 * tema, `var(--panel-solid)` en hexadecimal, que es como lo heredan todos los
 * temas oscuros desde el 2026-11-17. Hasta ese día solo lo declaraban tres, y el
 * mando teñía con el azul de la casa en los otros veinte.
 */
export function trioRgb(valor: string, reserva = "13, 21, 36"): string {
  const v = valor.trim();
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v)) return v;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return reserva;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(hex, 16);
  return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
}
