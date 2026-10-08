// Qué color lleva cada archivo del panel de Archivos, probado sin la app.
//
//   pnpm bancos estado-archivos
//
// Lo que se prueba es `src/lib/estadoArchivos.ts`: el amarillo de lo que se está
// escribiendo ahora (y que se apaga solo), lo que dice git, lo que tienes sin
// guardar, cuál gana cuando un archivo está en varios, y que una carpeta lleve
// lo más importante de lo que tiene dentro.

import { clave, contar, estadoDeCarpeta, estadosDe, TOCANDO_MS } from "../src/lib/estadoArchivos";
import type { Cambio } from "../src/lib/archivos";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const AHORA = 1_000_000_000;
const R = "C:\\proyectos\\Web";
const f = (p: string) => `${R}\\${p}`;
const cambios: Cambio[] = [
  { ruta: f("src\\App.tsx"), estado: "M", cuando: AHORA - 60_000 },
  { ruta: f("src\\nuevo.ts"), estado: "A", cuando: AHORA - 3_000 },
  { ruta: f("README.md"), estado: "U", cuando: AHORA - 1_000 },
  { ruta: f("viejo.md"), estado: "D", cuando: 0 },
];
const entradas = [
  { ruta: f("src"), carpeta: true, cuando: AHORA - 500 },
  { ruta: f("notas.txt"), carpeta: false, cuando: AHORA - 2_000 },
  { ruta: f("quieto.txt"), carpeta: false, cuando: AHORA - TOCANDO_MS - 1 },
];
const e = estadosDe(entradas, cambios, [f("src\\App.tsx")], AHORA);
const de = (p: string) => e.get(clave(f(p))) ?? "nada";

caso("cambiado hace un minuto y sin guardar: gana «sin guardar»", de("src\\App.tsx") === "sinGuardar", de("src\\App.tsx"));
caso("nuevo y escrito hace 3 s: «tocando», en amarillo", de("src\\nuevo.ts") === "tocando", de("src\\nuevo.ts"));
caso("un conflicto gana aunque se esté tocando", de("README.md") === "conflicto", de("README.md"));
caso("un borrado no se pinta como tocando", de("viejo.md") === "borrado", de("viejo.md"));
caso("fuera de git, escrito hace 2 s: «tocando»", de("notas.txt") === "tocando", de("notas.txt"));
caso("pasados TOCANDO_MS se apaga el amarillo", de("quieto.txt") === "nada", de("quieto.txt"));
caso("la hora de una carpeta no la pinta de amarillo", de("src") === "nada", de("src"));
caso("la carpeta lleva lo más importante de dentro", estadoDeCarpeta(f("src"), e) === "tocando", String(estadoDeCarpeta(f("src"), e)));
caso("una carpeta sin nada dentro no lleva color", estadoDeCarpeta(f("docs"), e) === null);
caso("las barras y las mayúsculas no cuentan", clave("C:\\Proyectos\\Web\\") === clave("c:/proyectos/web"));
caso("«src2» no es parte de «src»", estadoDeCarpeta(f("sr"), e) === null);
{
  const n = contar(R, e);
  caso("la cuenta de arriba suma cada estado", n.tocando === 2 && n.conflicto === 1 && n.sinGuardar === 1 && n.borrado === 1, JSON.stringify(n));
}
{
  const luego = estadosDe(entradas, cambios, [], AHORA + TOCANDO_MS + 10_000);
  caso("con el tiempo, lo nuevo vuelve a «nuevo» y lo cambiado a «cambiado»", luego.get(clave(f("src\\nuevo.ts"))) === "nuevo" && luego.get(clave(f("src\\App.tsx"))) === "cambiado");
}

if (fallos) {
  console.error(`\n${fallos} caso(s) MAL`);
  process.exit(1);
}
console.log("\ntodo bien");
