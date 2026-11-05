// La lista de CLI dentro de la Microsoft Store (políticas 10.2.2 y 10.2.3):
// ningún programa de la lista se instala con una orden desde dentro del paquete,
// así que cada uno que SÍ tiene orden necesita su página oficial para enseñarla
// en su lugar (`enlaceOficial`, `src/lib/providers.ts`).
//
//   pnpm bancos tienda-clis
//
// Si un programa nuevo entra con `cmd` y sin `oficial` ni `web`, su tarjeta en la
// Tienda se quedaría sin orden y sin botón: ni instala ni dice a dónde ir. Aquí se
// pone en rojo antes. Lo que se ve en pantalla lo mide
// `scripts/laboratorio/informar-de-verdad.mjs`.

import { enlaceOficial, PROVIDERS } from "../src/lib/providers";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? `: ${detalle}` : ""}`);
}

for (const p of PROVIDERS.filter((x) => x.cmd)) {
  const u = enlaceOficial(p);
  // https, y no el propio script del instalador: abrir un `.ps1` o un `.exe` en el navegador lo BAJA.
  ok(`${p.id}: tiene enlace oficial para la Tienda`, !!u && /^https:\/\/[^\s]+$/.test(u) && !/\.(ps1|sh|exe|msi)(\?|$)/i.test(u), u ?? "falta");
}
ok("`oficial` solo está donde hay una orden que sustituir", PROVIDERS.filter((p) => p.oficial).every((p) => p.cmd));
ok(
  "los que no se instalan con orden también llevan su web (Amp, Cursor)",
  PROVIDERS.filter((p) => !p.cmd && p.install).every((p) => !!enlaceOficial(p)),
  PROVIDERS.filter((p) => !p.cmd && p.install && !enlaceOficial(p)).map((p) => p.id).join(", "),
);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
if (fallos) process.exit(1);
