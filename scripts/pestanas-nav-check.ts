// Dos Ctrl+W seguidos en el navegador cierran dos pestañas y dejan delante la buena.
//
//     pnpm bancos pestanas-nav
//
// Simula lo que hace `cerrar` en `Navegador.tsx`: marcar `muere`, y 180 ms
// después quitarla y recolocar la activa. Hasta el 2026-10-31 el segundo
// Ctrl+W, dentro de esos 180 ms, iba a la pestaña que ya se iba (seguía siendo
// la activa): no cerraba nada y su temporizador, sin encontrarla, movía la
// activa una a la izquierda.
import { activaTrasQuitar, aQuienCerrar } from "../src/lib/pestanasNav";

let fallos = 0;
const dice = (bien: boolean, que: string) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

interface P {
  clave: number;
  muere?: boolean;
}

/** `teclas` Ctrl+W seguidos, todos antes de que venza el primer temporizador. */
function simular(claves: number[], activa: number, teclas: number) {
  let pests: P[] = claves.map((clave) => ({ clave }));
  let act = activa;
  const temporizadores: number[] = [];
  for (let n = 0; n < teclas; n++) {
    const delante = pests[act] ?? pests[0];
    const clave = aQuienCerrar(pests, delante.clave);
    if (clave == null) continue;
    pests = pests.map((p) => (p.clave === clave ? { ...p, muere: true } : p));
    temporizadores.push(clave);
  }
  for (const clave of temporizadores) {
    const i = pests.findIndex((p) => p.clave === clave);
    pests = pests.filter((p) => p.clave !== clave);
    act = activaTrasQuitar(i, act, pests.length);
  }
  return { quedan: pests.map((p) => p.clave), delante: pests[act]?.clave };
}

{
  const r = simular([1, 2, 3, 4], 1, 2);
  dice(r.quedan.join() === "1,4", `con la 2 delante, dos Ctrl+W cierran la 2 y la 3 (quedan ${r.quedan})`);
  dice(r.delante === 4, `y deja delante la 4, la de la derecha (delante: ${r.delante})`);
}
{
  const r = simular([1, 2, 3], 2, 2);
  dice(r.quedan.join() === "1", `con la última delante, cierran la 3 y la 2 (quedan ${r.quedan})`);
  dice(r.delante === 1, `y deja delante la 1 (delante: ${r.delante})`);
}
{
  const r = simular([1, 2, 3, 4], 1, 1);
  dice(r.quedan.join() === "1,3,4" && r.delante === 3, `un solo Ctrl+W sigue como siempre (quedan ${r.quedan}, delante ${r.delante})`);
}
dice(activaTrasQuitar(-1, 2, 3) === 2, "un temporizador que ya no encuentra su pestaña no mueve la activa");

if (fallos) {
  console.error(`\n${fallos} fallo(s) al cerrar pestañas.`);
  process.exit(1);
}
console.log("\nCerrar pestañas deja delante la buena.");
