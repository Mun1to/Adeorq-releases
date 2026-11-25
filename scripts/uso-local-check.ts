// Banco de lo que apunta la ventana al cambiar de pantalla (`src/lib/usoLocal.ts`).
// Lo que se escribe, y que sin `uso-local.on` no se escribe nada, lo prueba Rust
// (`cargo test --lib uso_local`) y la app de verdad
// (`scripts/laboratorio/uso-local-de-verdad.mjs`).
//
//   pnpm bancos uso-local

import { eventoDeVista } from "../src/lib/usoLocal";

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

es("la primera, dónde se abrió", eventoDeVista(null, "panel", 1000), { ev: "abre", a: "panel" });
es("un cambio lleva de dónde, a dónde y el rato", eventoDeVista({ vista: "panel", desde: 1000 }, "cabina", 43_000), { ev: "vista", de: "panel", a: "cabina", ms: 42_000 });
es("la misma otra vez no cuenta", eventoDeVista({ vista: "cabina", desde: 1000 }, "cabina", 5000), null);
es("un reloj que va hacia atrás no da un rato negativo", eventoDeVista({ vista: "panel", desde: 9000 }, "ajustes", 8000), { ev: "vista", de: "panel", a: "ajustes", ms: 0 });

console.log(fallos ? `\n${fallos} en rojo:\n  ${rojos.join("\n  ")}` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
