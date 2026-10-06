// El tema a juego con la foto, probado contra los acentos reales de App.css.
//
//   npx tsc scripts/foto-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/foto-check.js
//
// Lo que se prueba es la parte pura de `src/lib/temaDeLaFoto.ts`: de los
// píxeles sale un tono, y del tono sale el tema de la casa cuyo acento está más
// cerca. Los acentos NO van escritos aquí: se sacan de `src/App.css` con la
// misma regla que pinta las miniaturas (`[data-tema-prev="x"]`), así que si
// alguien cambia un acento el banco sigue midiendo contra el de verdad.

// Sin @types/node en el repo: lo poco de Node que hace falta, declarado a mano.
declare const process: { cwd(): string; exit(code?: number): never };
declare function require(modulo: string): { join(...partes: string[]): string };
const { join } = require("node:path");
import {
  CANDIDATOS,
  distanciaTono,
  hexAHsl,
  temaAJuego,
  TEMA_GRIS,
  tonoDominante,
} from "../src/lib/temaDeLaFoto";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

/* Los acentos de verdad, de la hoja de la app (entera: `App.css` ya solo es el
   índice de sus tramos). Se lanza desde la raíz del repo. */
const css = (require(join(process.cwd(), "scripts", "hoja.cjs")) as unknown as { hojaDeLaApp(): string }).hojaDeLaApp();
const acentos: Record<string, string> = {};
for (const m of css.matchAll(/\[data-tema-prev="([a-z]+)"\]\s*\{[^}]*?--accent:\s*(#[0-9a-fA-F]{6})/g)) {
  acentos[m[1]] ??= m[2];
}
caso("App.css trae el acento de cada candidato", CANDIDATOS.every((id) => acentos[id]), CANDIDATOS.filter((id) => !acentos[id]).join(","));

/* Una «foto» de un solo color con algo de ruido, como píxeles RGBA. */
function foto(r: number, g: number, b: number, n = 400, ruido = 18): Uint8ClampedArray {
  const px = new Uint8ClampedArray(n * 4);
  let semilla = 7;
  const az = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < n; i++) {
    px[i * 4] = r + az() * ruido;
    px[i * 4 + 1] = g + az() * ruido;
    px[i * 4 + 2] = b + az() * ruido;
    px[i * 4 + 3] = 255;
  }
  return px;
}

caso("hexAHsl: el azul de la casa es azul", Math.abs(hexAHsl("#4d9fff").h - 212) < 3, String(Math.round(hexAHsl("#4d9fff").h)));
caso("distanciaTono da la vuelta al círculo", distanciaTono(350, 10) === 20);
caso("sin píxeles no hay tono", tonoDominante(new Uint8ClampedArray(0)) === null);
caso("una foto gris no tiene tono", tonoDominante(foto(120, 122, 125)) === null);
caso("una foto casi negra no tiene tono", tonoDominante(foto(10, 8, 14)) === null);

const naranja = tonoDominante(foto(240, 140, 40));
caso("una foto naranja da un tono naranja", !!naranja && distanciaTono(naranja.h, 30) < 12, naranja ? String(Math.round(naranja.h)) : "null");

/* Un atardecer: el cielo lavado ocupa más, pero el naranja tiene más color. */
const cielo = foto(150, 170, 200, 600, 6);
const sol = foto(250, 120, 30, 300, 10);
const atardecer = new Uint8ClampedArray(cielo.length + sol.length);
atardecer.set(cielo);
atardecer.set(sol, cielo.length);
const t = tonoDominante(atardecer);
caso("el color manda sobre lo lavado", !!t && distanciaTono(t.h, 25) < 15, t ? String(Math.round(t.h)) : "null");

/* De tono a tema: el elegido es el de acento más cercano, medido de verdad. */
for (const [nombre, h] of [["naranja", 28], ["azul", 215], ["verde", 150], ["violeta", 270], ["rojo", 350]] as const) {
  const id = temaAJuego({ h, s: 0.7, l: 0.5 }, acentos);
  const d = distanciaTono(h, hexAHsl(acentos[id]).h);
  const mejor = Math.min(...CANDIDATOS.map((c) => distanciaTono(h, hexAHsl(acentos[c]).h)));
  caso(`a ${nombre} (${h}°) le toca ${id}`, d === mejor && d < 40, `a ${Math.round(d)}°`);
}
caso("sin tono, el gris", temaAJuego(null, acentos) === TEMA_GRIS);
caso("sin acentos no revienta", temaAJuego({ h: 10, s: 1, l: 0.5 }, {}) === TEMA_GRIS);

if (fallos) {
  console.log(`\n${fallos} fallos`);
  process.exit(1);
}
console.log("\ntodo en orden");
