// Stable per-workspace identity color. Hues stay inside the cool blue family
// (cyan to violet) so the whole panel reads as one blue system instead of a
// rainbow, while each project keeps a recognisable shade of its own.
const HUE_MIN = 186;
const HUE_MAX = 268;

export function hueOf(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  const hue = HUE_MIN + (h / 1000) * (HUE_MAX - HUE_MIN);
  return `hsl(${hue.toFixed(0)} 82% 66%)`;
}
