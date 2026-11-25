// Banco de cuántas sesiones abre de golpe un proyecto (`src/lib/topeAbrir.ts`):
// por la memoria las que caben, nunca más del número de Ajustes, y al menos una.
//
//   pnpm bancos tope-abrir
//
// El tope de las que abren los agentes es otra cosa y vive en Rust, con sus
// pruebas en `src-tauri/src/cabida.rs` (`cargo test --lib cabida`).

import { cuantasAbrir, type Cabida } from "../src/lib/topeAbrir";

let fallos = 0;
const rojos: string[] = [];
const es = (nombre: string, obtenido: unknown, esperado: unknown) => {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!bien) {
    fallos++;
    rojos.push(`${nombre} (sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)})`);
  }
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}`);
};

const memoria = (caben: number): Cabida => ({ totalMb: 32_768, libreMb: 9_000, reservaMb: 4_915, porTerminalMb: 500, caben });

es("sin memoria: las pedidas, hasta el número", cuantasAbrir(30, 12, false, memoria(2)), 12);
es("sin memoria: menos pedidas que el número, las pedidas", cuantasAbrir(5, 12, false, memoria(2)), 5);
es("por memoria: solo las que caben", cuantasAbrir(30, 12, true, memoria(3)), 3);
es("por memoria con sitio de sobra: manda el número", cuantasAbrir(30, 12, true, memoria(40)), 12);
es("por memoria con sitio de sobra y pocas pedidas: las pedidas", cuantasAbrir(4, 12, true, memoria(40)), 4);
es("por memoria y no cabe ninguna: una, que la pediste tú", cuantasAbrir(30, 12, true, memoria(0)), 1);
es("por memoria sin dato del sistema: el número", cuantasAbrir(30, 12, true, null), 12);
es("nunca cero aunque no se pida ninguna", cuantasAbrir(0, 12, false, null), 1);

console.log(fallos ? `\n${fallos} en rojo:\n  ${rojos.join("\n  ")}` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
