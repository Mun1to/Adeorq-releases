// El Ctrl+C de después de arrastrar para copiar en un programa que lleva el ratón
// (Claude Code a pantalla completa): no le llega al programa durante unos 3 s, y
// solo si el arrastre copió de verdad. Con un reloj de mentira.
//
//   pnpm bancos ctrl-c-arrastre
//
// Lo que NO prueba: que xterm trague la tecla ni que el programa no la vea. Eso,
// `node scripts/laboratorio/ctrl-c-arrastre-de-verdad.mjs`.

import { crearCtrlCTrasArrastrar, TRAS_ARRASTRAR_MS } from "../src/lib/ctrlCTrasArrastrar";

let fallos = 0;
function ok(nombre: string, cond: boolean) {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}`);
}

function montar() {
  const reloj = { t: 1000 };
  const a = crearCtrlCTrasArrastrar(() => reloj.t);
  const arrastrar = () => {
    a.alBajar(10, 10);
    reloj.t += 200;
    a.alSoltar(200, 12);
  };
  return { reloj, a, arrastrar };
}

{
  const { a } = montar();
  ok("sin arrastrar, el Ctrl+C llega", !a.seTraga());
}
{
  const { reloj, a, arrastrar } = montar();
  arrastrar();
  reloj.t += 30;
  a.alCopiar();
  reloj.t += 300;
  ok("arrastró y copió: se lo traga", a.seTraga());
  ok("se lo sigue tragando si insiste", a.seTraga());
  reloj.t += TRAS_ARRASTRAR_MS - 400;
  ok("justo antes de los 3 s, también", a.seTraga());
  reloj.t += 200;
  ok("pasados los 3 s, llega", !a.seTraga());
}
{
  const { reloj, a, arrastrar } = montar();
  arrastrar();
  reloj.t += 300;
  ok("arrastró y el programa no copió: llega", !a.seTraga());
}
{
  const { reloj, a } = montar();
  a.alCopiar();
  reloj.t += 100;
  a.alBajar(10, 10);
  a.alSoltar(200, 12);
  reloj.t += 100;
  ok("una copia de antes de bajar no cuenta como la del arrastre", !a.seTraga());
}
{
  const { reloj, a } = montar();
  a.alBajar(10, 10);
  a.alSoltar(11, 11);
  a.alCopiar();
  reloj.t += 100;
  ok("un clic con el pulso temblón no es un arrastre", !a.seTraga());
}
{
  const { reloj, a, arrastrar } = montar();
  arrastrar();
  a.alCopiar();
  reloj.t += 100;
  a.alBajar(50, 50);
  a.alSoltar(50, 50);
  reloj.t += 100;
  ok("un clic después del arrastre lo deshace", !a.seTraga());
}
{
  const { reloj, a } = montar();
  a.alBajar(10, 10);
  reloj.t += 100;
  a.alCopiar();
  reloj.t += 100;
  ok("con el botón aún abajo no hay arrastre terminado", !a.seTraga());
}
{
  const { reloj, a } = montar();
  a.alSoltar(200, 200);
  a.alCopiar();
  reloj.t += 100;
  ok("soltar sin haber bajado aquí no es un arrastre de esta terminal", !a.seTraga());
}

if (fallos) {
  console.log(`\n${fallos} fallos`);
  process.exit(1);
}
console.log("\nTodo bien.");
