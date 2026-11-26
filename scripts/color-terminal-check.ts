// El color de cada terminal de la Cabina (`src/lib/colorDeTerminal.ts`).
//
//   pnpm bancos color-terminal
//
// Existe porque Munir se confundía de terminal (2026-11-26): con nueve abiertas
// y cinco del mismo proyecto, el color tiene que ser de la terminal. Comprueba
// que nueve terminales salen con nueve colores, que ninguno cae cerca de los
// tres del aro (rojo, amarillo y azul), que una terminal no cambia de color al
// cerrarse otra ni al nacer otra, y que la hoja tiñe la cabecera y no el borde.

import { readFileSync } from "node:fs";
import { conColorDeTerminal, conTonos, tonoGuardado, TONOS_TERMINAL } from "../src/lib/colorDeTerminal";

declare const process: { exit(code?: number): never };

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const lejos = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

type P = { id: number; tono?: number; web?: string; archivos?: string[] };
const nuevas = (n: number, desde = 1): P[] => Array.from({ length: n }, (_, i) => ({ id: desde + i }));

// Los tonos: nueve, distintos y lejos de los tres estados del aro.
const ARO = { rojo: 0, amarillo: 47, azul: 211 };
caso("hay nueve tonos distintos", new Set(TONOS_TERMINAL).size === 9);
for (const [nombre, h] of Object.entries(ARO)) {
  const min = Math.min(...TONOS_TERMINAL.map((t) => lejos(t, h)));
  caso(`ningún tono a menos de 25° del ${nombre} del aro`, min >= 25, `el más cerca, a ${min}°`);
}
let entre = 360;
for (const a of TONOS_TERMINAL) for (const b of TONOS_TERMINAL) if (a !== b) entre = Math.min(entre, lejos(a, b));
caso("entre dos tonos hay al menos 25°", entre >= 25, `${entre}°`);

// Sus nueve terminales de hoy: nueve colores, y las dos primeras lejos entre sí.
const nueve = conTonos(nuevas(9));
caso("nueve terminales, nueve colores", new Set(nueve.map((p) => p.tono)).size === 9);
caso("la segunda cae lejos de la primera", lejos(nueve[0].tono!, nueve[1].tono!) >= 90, `${lejos(nueve[0].tono!, nueve[1].tono!)}°`);

// Nada que repartir: el mismo array, para que el efecto no vuelva a pintar.
caso("si todas tienen color, devuelve el mismo array", conTonos(nueve) === nueve);

// Cerrar una no cambia a las demás, y la que nace se queda el color que quedó libre.
const sinLaTercera = nueve.filter((p) => p.id !== 3);
const conOtra = conTonos([...sinLaTercera, { id: 10 }]);
caso("cerrar una no cambia el color de las otras", sinLaTercera.every((p) => conOtra.find((q) => q.id === p.id)!.tono === p.tono));
caso("la que nace toma el color que quedó libre", conOtra.find((p) => p.id === 10)!.tono === nueve[2].tono);

// Con más de nueve, se repite el que menos terminales tenga.
const doce = conTonos(nuevas(12));
const usos = new Map<number, number>();
for (const p of doce) usos.set(p.tono!, (usos.get(p.tono!) ?? 0) + 1);
caso("con doce, ningún color pasa de dos", Math.max(...usos.values()) <= 2);
caso("con doce, los nueve colores están puestos", usos.size === 9);

// Los archivos abiertos y las vistas web no son terminales: sin color.
const mezcla = conTonos([{ id: 1 }, { id: 2, archivos: ["a.ts"] }, { id: 3, web: "http://x" }]);
caso("un panel de archivos no lleva color", mezcla[1].tono == null);
caso("una vista web no lleva color", mezcla[2].tono == null);
caso("con solo archivos y web por pintar, el mismo array", conTonos(mezcla) === mezcla);

// Lo que viene del disco.
caso("un tono guardado de los nuestros vale", tonoGuardado(238) === 238);
caso("un número que no es de los nuestros no vale", tonoGuardado(214) === undefined);
caso("un texto no vale", tonoGuardado("238") === undefined);

// El estilo del panel lleva la variable, y sin tono queda tal cual.
const base = { left: "0%" };
caso("sin tono, el mismo estilo", conColorDeTerminal(base, undefined) === base);
caso(
  "con tono, la variable que lee la hoja",
  (conColorDeTerminal(base, 80) as Record<string, string>)["--color-term"] === "hsl(80 78% 64%)",
);

// La hoja: tiñe la cabecera, y el borde de la terminal no usa su color.
const hoja = readFileSync("src/estilos/42-aspectos.css", "utf8");
const reglas = [...hoja.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), cuerpo: m[2] }));
const conColor = reglas.filter((r) => r.cuerpo.includes("--color-term"));
caso("hay reglas que tiñen la cabecera", conColor.some((r) => /\.pane-head$/.test(r.sel) && /background:/.test(r.cuerpo)));
caso(
  "ninguna pinta con su color algo que no sea la cabecera",
  conColor.every((r) => /\.pane-head(\s+\.pane-proj)?$/.test(r.sel)),
  conColor.filter((r) => !/\.pane-head(\s+\.pane-proj)?$/.test(r.sel)).map((r) => r.sel).join(" | "),
);
caso("la elegida lleva más color que las demás", /\[data-focused="true"\] > \.pane-head\s*\{\s*background: color-mix\(in srgb, var\(--color-term\) 46%/.test(hoja));

console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo bien");
process.exit(fallos ? 1 : 0);
