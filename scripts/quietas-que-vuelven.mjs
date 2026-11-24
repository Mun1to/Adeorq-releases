// ¿Cuántas terminales quietas 55 minutos vuelven a hablar? Por tramo de contexto.
//
//   node scripts/quietas-que-vuelven.mjs [días=14]
//
// Es el dato con que se fijó la raya de compactar una quieta (`QUIETA_TOKENS` en
// src/lib/contexto.ts, 2026-11-23): compactar una que no vuelve es gasto puro, así que
// solo compensa donde vuelve a hablarle bastante gente. Con 100k compensa desde un ~45 %
// que vuelva; con 300k, desde un ~15 %. Si se mueve esa raya, se mide otra vez.
//
// Solo LEE `~/.claude/projects/*/*.jsonl` (el hilo principal; los subagentes van en sus
// carpetas). Cada llamada al modelo se junta por su `requestId`; un hueco de 55 minutos
// o más tras una llamada de 100k o más es una quieta: «vuelve» si después hay otra llamada
// (un arranque en frío), «no vuelve» si es la última. Un hueco con una compactación
// dentro no cuenta. Las que se cerraron a mano salen como «no vuelve»: es un suelo de las
// que vuelven, no un techo.

import { createReadStream, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const DIAS = Number(process.argv[2] || 14);
const QUIETA = 55 * 60_000;
const desde = Date.now() - DIAS * 86_400_000;
const raiz = path.join(os.homedir(), ".claude", "projects");
const tramos = [[100e3, "<100k"], [200e3, "100-200k"], [300e3, "200-300k"], [450e3, "300-450k"], [Infinity, ">450k"]];
const tramo = (n) => tramos.find(([t]) => n < t)[1];
const vuelve = {};
const muere = {};
const horas = {};
const sumar = (o, k, v = 1) => (o[k] = (o[k] || 0) + v);

async function leer(f) {
  const llamadas = new Map();
  const compacta = [];
  const rl = readline.createInterface({ input: createReadStream(f) });
  for await (const l of rl) {
    if (l.includes('"compact_boundary"')) {
      try {
        compacta.push(Date.parse(JSON.parse(l).timestamp));
      } catch {}
      continue;
    }
    if (!l.includes('"usage"') || l.includes('"isSidechain":true')) continue;
    let v;
    try {
      v = JSON.parse(l);
    } catch {
      continue;
    }
    const u = v.message?.usage;
    if (!u || v.type !== "assistant") continue;
    const t = Date.parse(v.timestamp);
    if (!t) continue;
    const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const id = v.requestId || v.uuid;
    const ya = llamadas.get(id);
    if (!ya) llamadas.set(id, { t0: t, t, ctx });
    else {
      ya.t = Math.max(ya.t, t);
      ya.ctx = Math.max(ya.ctx, ctx);
    }
  }
  return { llamadas: [...llamadas.values()].sort((a, b) => a.t0 - b.t0), compacta };
}

for (const d of readdirSync(raiz)) {
  let ficheros;
  try {
    ficheros = readdirSync(path.join(raiz, d));
  } catch {
    continue;
  }
  for (const n of ficheros) {
    if (!n.endsWith(".jsonl")) continue;
    const f = path.join(raiz, d, n);
    if (statSync(f).mtimeMs < desde) continue;
    const { llamadas, compacta } = await leer(f);
    for (let i = 0; i < llamadas.length; i++) {
      const a = llamadas[i];
      const b = llamadas[i + 1];
      if (a.t < desde || a.ctx < 100e3) continue;
      const fin = b ? b.t0 : Date.now();
      if (fin - a.t < QUIETA || compacta.some((c) => c > a.t && c < fin)) continue;
      if (b) {
        sumar(vuelve, tramo(a.ctx));
        sumar(horas, tramo(a.ctx), (fin - a.t) / 3.6e6);
      } else sumar(muere, tramo(a.ctx));
    }
  }
}
console.log(`Últimos ${DIAS} días, hilo principal, quieta 55 minutos o más con 100k o más:`);
for (const [, k] of tramos.slice(1)) {
  const v = vuelve[k] || 0;
  const m = muere[k] || 0;
  const pct = ((100 * v) / Math.max(1, v + m)).toFixed(0);
  console.log(`${k.padEnd(9)} vuelve ${String(v).padStart(4)} · no vuelve ${String(m).padStart(4)} · ${pct} % vuelve · hueco medio ${(horas[k] / Math.max(1, v) || 0).toFixed(1)} h`);
}
