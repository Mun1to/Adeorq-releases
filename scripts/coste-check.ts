// Que el precio que se enseña sea el de verdad. Casos que se ejecutan.
//
//   npx tsc scripts/coste-check.ts src/lib/coste.ts --module commonjs \
//     --target es2022 --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/coste-check.js
//
// Por qué existe: este número va a salir en pantalla antes de que Munir mande
// nada, y si miente, miente hacia arriba o hacia abajo con la misma facilidad.
// La cuenta ingenua —contexto por precio de entrada— da **37 veces** el precio
// real en un modelo que cachea, porque el 97 % de lo que entra en una petición
// suya es caché releída (medido en 57.168 turnos, 2026-08-19).
//
// Los precios de aquí son los REALES de OpenRouter del 2026-08-19, copiados de
// `/api/v1/models`. Si algún día cambian, estos casos siguen valiendo: lo que
// comprueban es la CUENTA, no la tarifa.

import {
  cachea,
  comoRango,
  costeDe,
  cuantasVecesMasBarato,
  PATRON,
  rangoDe,
  type PrecioModelo,
} from "../src/lib/coste";

let fallos = 0;
const ok = (que: string, bien: boolean, extra = "") => {
  console.log(`${bien ? "  ok  " : "FALLA "} ${que}${extra ? "   " + extra : ""}`);
  if (!bien) fallos++;
};
const cerca = (a: number, b: number, tol = 0.0002) => Math.abs(a - b) < tol;

/* ── Precios reales, $ por millón (OpenRouter, 2026-08-19) ─────────────── */
const OPUS: PrecioModelo = {
  entradaMillon: 5, salidaMillon: 25, cacheLeidaMillon: 0.5, cacheEscritaMillon: 6.25,
};
const SONNET: PrecioModelo = {
  entradaMillon: 2, salidaMillon: 10, cacheLeidaMillon: 0.2, cacheEscritaMillon: 2.5,
};
/** Cachea de verdad, pero publica la ESCRITURA a cero: eso es «no lo digo»,
    no «es gratis», y por eso se le cobra como entrada normal. */
const QWEN: PrecioModelo = {
  entradaMillon: 0.3, salidaMillon: 1, cacheLeidaMillon: 0.1, cacheEscritaMillon: 0,
};
/** Y este cobra la escritura MÁS BARATA que la lectura, que parece un error y
    es el dato real: 0,0208 frente a 0,0375 $/M. */
const GEMINI_FLASH: PrecioModelo = {
  entradaMillon: 0.375, salidaMillon: 1.875, cacheLeidaMillon: 0.0375, cacheEscritaMillon: 0.0208,
};
/** Este NO publica precio de caché: paga la entrada entera en cada turno. */
const DEEPSEEK: PrecioModelo = { entradaMillon: 0.2574, salidaMillon: 1.0287 };

/** Su petición mediana medida. */
const CONTEXTO = 302_039;
const SALIDA = 1_243;

/* ── 1. Los números que salieron al medir ──────────────────────────────── */
console.log("── el coste de UNA peticion tuya de tamano mediano ──");
for (const [nombre, p, esperado] of [
  ["Opus 5", OPUS, 0.2283],
  ["Sonnet 5", SONNET, 0.0913],
  ["Qwen3-Coder", QWEN, 0.0331],
  ["Gemini 3.7 Flash", GEMINI_FLASH, 0.0135],
  ["DeepSeek (sin cache)", DEEPSEEK, 0.0790],
] as Array<[string, PrecioModelo, number]>) {
  const c = costeDe(p, CONTEXTO, SALIDA);
  ok(`${nombre.padEnd(22)} ${c.total.toFixed(4)} $`, cerca(c.total, esperado, 0.002),
     `esperaba ${esperado}`);
}

/* ── 2. EL CASO QUE JUSTIFICA TODO ESTO ────────────────────────────────── */
console.log("\n── lo que se rompe si se ignora la cache ──");
{
  // La cuenta ingenua: todo el contexto a precio de entrada.
  const ingenuo = (CONTEXTO * OPUS.entradaMillon) / 1e6 + (SALIDA * OPUS.salidaMillon) / 1e6;
  const real = costeDe(OPUS, CONTEXTO, SALIDA).total;
  ok("la cuenta ingenua se pasa por mucho", ingenuo / real > 5,
     `${ingenuo.toFixed(3)} $ frente a ${real.toFixed(3)} $ = ${(ingenuo / real).toFixed(1)} veces`);
}
{
  // Y el revés: DeepSeek parece de la familia de Qwen por tarifa y cuesta el
  // doble, porque no cachea. Un recomendador que ordene por $/M lo pondria
  // delante y se equivocaria.
  const q = costeDe(QWEN, CONTEXTO, SALIDA).total;
  const d = costeDe(DEEPSEEK, CONTEXTO, SALIDA).total;
  ok("DeepSeek tiene tarifa MAS barata que Qwen", DEEPSEEK.entradaMillon < QWEN.entradaMillon,
     `${DEEPSEEK.entradaMillon} < ${QWEN.entradaMillon} $/M`);
  ok("y aun asi la peticion sale mas cara, por no cachear", d > q,
     `${d.toFixed(4)} $ frente a ${q.toFixed(4)} $`);
}

/* ── 3. Cachear no es declarar un campo ────────────────────────────────── */
console.log("\n── quien cachea de verdad ──");
ok("Opus cachea", cachea(OPUS));
ok("DeepSeek no", !cachea(DEEPSEEK));
ok("un cache_leida de cero es NO cachea, no gratis",
   !cachea({ entradaMillon: 1, salidaMillon: 2, cacheLeidaMillon: 0 }));
ok("y un cache igual de caro que la entrada tampoco cuenta",
   !cachea({ entradaMillon: 1, salidaMillon: 2, cacheLeidaMillon: 1 }));
{
  // Sin caché, el precio no depende de proporciones inventadas: es lineal.
  const uno = costeDe(DEEPSEEK, 100_000, 0).total;
  const dos = costeDe(DEEPSEEK, 200_000, 0).total;
  ok("sin cache, el doble de contexto cuesta el doble", cerca(dos, uno * 2, 1e-9));
}

/* ── 4. El rango, que es lo que se enseña ──────────────────────────────── */
console.log("\n── el rango honesto ──");
{
  const r = rangoDe(OPUS, CONTEXTO);
  ok("el minimo es menor que el maximo", r.min < r.max, comoRango(r));
  ok("los extremos son percentiles reales, no numeros redondos",
     r.salidaMin === PATRON.salida.p25 && r.salidaMax === PATRON.salida.p90,
     `${r.salidaMin} y ${r.salidaMax} tokens`);
  ok("y el coste medido cae dentro del rango",
     costeDe(OPUS, CONTEXTO, SALIDA).total >= r.min &&
       costeDe(OPUS, CONTEXTO, SALIDA).total <= r.max);
}
{
  const corto = rangoDe(OPUS, CONTEXTO, false);
  const largo = rangoDe(OPUS, CONTEXTO, true);
  ok("una tarea larga sube el techo", largo.max > corto.max);
  // Y NO el suelo: una tarea larga tambien puede resolverse en un parrafo, y
  // prometer un minimo alto seria inventar hacia el otro lado.
  ok("pero no sube el suelo", cerca(largo.min, corto.min, 1e-9));
}
{
  // Cuando de verdad no cuesta nada se dice «gratis», que es una palabra, y no
  // «0,0000 $», que parece un precio muy pequeño.
  const r = rangoDe({ entradaMillon: 0, salidaMillon: 0 }, CONTEXTO);
  ok("un modelo gratis se llama gratis", comoRango(r) === "gratis", comoRango(r));
}
{
  // Y con un contexto minusculo los dos extremos se redondean igual, asi que un
  // rango sobra: «entre 0,0001 $ y 0,0001 $» es una forma rara de decir un numero.
  const r = rangoDe({ entradaMillon: 0.001, salidaMillon: 0.001 }, 100);
  ok("si los extremos se redondean igual, no dice «entre»",
     !comoRango(r).startsWith("entre"), comoRango(r));
  ok("y no dice «0,0000 $», que se lee como gratis", !comoRango(r).includes("0,0000"), comoRango(r));
}
ok("nunca sale «0,00 $» para algo que cuesta",
   !comoRango(rangoDe(QWEN, 1000)).includes("0,00 $"), comoRango(rangoDe(QWEN, 1000)));

/* ── 4b. LA VIA, que es el fallo mas gordo que encontro la revision ────── */
console.log("\n── por CLI o por clave de API, que no cuesta lo mismo ──");
{
  // Un CLI manda `cache_control` en cada turno. `chat.rs` no, asi que por la
  // via de API la entrada se paga ENTERA. La primera version del copiloto
  // calculaba la via de API con el patron del agente y decia un precio 8,5
  // veces mas barato del que se acaba pagando.
  const agente = costeDe(GEMINI_FLASH, CONTEXTO, SALIDA, "agente").total;
  const api = costeDe(GEMINI_FLASH, CONTEXTO, SALIDA, "api").total;
  ok("por API cuesta bastante mas que por CLI", api > agente * 5,
     `${agente.toFixed(4)} $ frente a ${api.toFixed(4)} $ = ${(api / agente).toFixed(1)} veces`);
  ok("y ese es el numero que se medio: 8,5 veces", Math.abs(api / agente - 8.5) < 0.3,
     `${(api / agente).toFixed(1)}x`);
  ok("por API, el rango tampoco cuenta la cache",
     rangoDe(GEMINI_FLASH, CONTEXTO, false, "api").cachea === false);
  ok("y por CLI si", rangoDe(GEMINI_FLASH, CONTEXTO, false, "agente").cachea === true);
}
{
  // Y en un modelo que NO cachea da igual la via: ya pagaba la entrada entera.
  const a = costeDe(DEEPSEEK, CONTEXTO, SALIDA, "agente").total;
  const b = costeDe(DEEPSEEK, CONTEXTO, SALIDA, "api").total;
  ok("en uno que no cachea, la via no cambia nada", cerca(a, b, 1e-9));
}
{
  // El orden puede cambiar con la via, y por eso `masBaratoPara` ordena por la
  // que se va a proponer: sin cache manda el precio de ENTRADA.
  const porAgente = [QWEN, GEMINI_FLASH].map((p) => costeDe(p, CONTEXTO, SALIDA, "agente").total);
  const porApi = [QWEN, GEMINI_FLASH].map((p) => costeDe(p, CONTEXTO, SALIDA, "api").total);
  ok("por CLI gana Gemini", porAgente[1] < porAgente[0],
     `${porAgente[1].toFixed(4)} < ${porAgente[0].toFixed(4)}`);
  ok("por API gana Qwen, que tiene la entrada mas barata", porApi[0] < porApi[1],
     `${porApi[0].toFixed(4)} < ${porApi[1].toFixed(4)}`);
}

/* ── 5. La comparacion, que es la cifra que decide ─────────────────────── */
console.log("\n── cuantas veces mas barato ──");
{
  const o = costeDe(OPUS, CONTEXTO, SALIDA);
  const q = costeDe(QWEN, CONTEXTO, SALIDA);
  const veces = cuantasVecesMasBarato(o, q);
  ok("Opus frente a Qwen: entre 6 y 8 veces", veces > 6 && veces < 8, `${veces.toFixed(1)}x`);
  // La cifra que llevabamos repitiendo (577x) salia de comparar tarifas por
  // millon. Con peticiones de verdad la diferencia es de un orden, no de tres.
  ok("y desde luego NO 577 veces", veces < 50, `${veces.toFixed(1)}x`);
}
ok("gratis devuelve 0, no infinito",
   cuantasVecesMasBarato(costeDe(OPUS, CONTEXTO, SALIDA), costeDe(
     { entradaMillon: 0, salidaMillon: 0 }, CONTEXTO, SALIDA)) === 0);

/* ── 6. Bordes ─────────────────────────────────────────────────────────── */
console.log("\n── bordes ──");
ok("contexto cero no revienta", costeDe(OPUS, 0, 0).total === 0);
ok("un modelo gratis cuesta cero",
   costeDe({ entradaMillon: 0, salidaMillon: 0 }, CONTEXTO, SALIDA).total === 0);
ok("las proporciones del patron suman uno",
   cerca(PATRON.cacheLeida + PATRON.cacheEscrita + PATRON.nueva, 1, 0.001),
   `${(PATRON.cacheLeida + PATRON.cacheEscrita + PATRON.nueva).toFixed(4)}`);
ok("los percentiles van en orden",
   PATRON.salida.p25 < PATRON.salida.mediana &&
     PATRON.salida.mediana < PATRON.salida.p75 &&
     PATRON.salida.p75 < PATRON.salida.p90);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} cosa(s) mal.`);
process.exit(fallos === 0 ? 0 : 1);
