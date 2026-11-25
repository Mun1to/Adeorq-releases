// Qué pantallas de Adeorq usas más y menos, leído de `uso-local-AAAA-MM.jsonl`
// (lo apunta la app solo si existe `uso-local.on` en su carpeta de datos:
// `src-tauri/src/uso_local.rs`). No sale nada del equipo: esto solo lee.
//
//   node scripts/uso-local.mjs            los últimos 30 días
//   node scripts/uso-local.mjs --dias 7   los últimos 7
//   node scripts/uso-local.mjs --todo     todo lo guardado (doce meses como mucho)
//   node scripts/uso-local.mjs --carpeta <ruta>   otra carpeta de datos
//
// Para encenderlo: crea el archivo vacío `uso-local.on` en
// %LOCALAPPDATA%\Adeorq (o %USERPROFILE%\.adeorq en la de la Store) y vuelve a
// abrir Adeorq. Para apagarlo, bórralo.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const candidatas = [valor("--carpeta"), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Adeorq"), join(homedir(), ".adeorq")].filter(Boolean);
const carpeta = candidatas.find((c) => existsSync(c) && readdirSync(c).some((n) => /^uso-local-\d{4}-\d{2}\.jsonl$/.test(n)));

if (!carpeta) {
  const datos = candidatas.find((c) => existsSync(c)) ?? candidatas[0];
  const on = datos && existsSync(join(datos, "uso-local.on"));
  console.log(on ? `Encendido en ${datos}, pero aún no hay nada apuntado: abre Adeorq de nuevo y cambia de pantalla.` : `Apagado: no hay ningún uso-local-*.jsonl. Para encenderlo, crea el archivo vacío ${join(datos ?? "", "uso-local.on")} y vuelve a abrir Adeorq.`);
  process.exit(0);
}

const dias = args.includes("--todo") ? Infinity : Number(valor("--dias") ?? 30);
const desde = dias === Infinity ? "" : new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
const eventos = [];
for (const n of readdirSync(carpeta).filter((n) => /^uso-local-\d{4}-\d{2}\.jsonl$/.test(n)).sort()) {
  for (const l of readFileSync(join(carpeta, n), "utf8").split(/\r?\n/)) {
    if (!l.trim()) continue;
    try {
      const e = JSON.parse(l);
      if (!desde || String(e.t ?? "") >= desde) eventos.push(e);
    } catch {
      // Una línea a medias (la app se cerró escribiendo): se salta.
    }
  }
}

// Las pantallas que existen, de `src/lib/vistas.ts`, para decir cuáles no abres nunca.
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const tipo = /export type View =([^;]+);/.exec(readFileSync(join(raiz, "src", "lib", "vistas.ts"), "utf8"))?.[1] ?? "";
const todas = [...tipo.matchAll(/"(\w+)"/g)].map((m) => m[1]);

const por = new Map();
const de = (v) => por.get(v) ?? por.set(v, { veces: 0, ms: 0 }).get(v);
for (const e of eventos) {
  if (e.ev === "abre" || e.ev === "vista") de(e.a).veces++;
  if (e.ev === "vista" && e.de) de(e.de).ms += Number(e.ms) || 0;
}
const horas = (ms) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);
const filas = [...por.entries()].sort((a, b) => b[1].ms - a[1].ms || b[1].veces - a[1].veces);
const versiones = [...new Set(eventos.map((e) => e.v).filter(Boolean))];

console.log(`Uso de Adeorq en ${carpeta}`);
console.log(`${eventos.length} cambios de pantalla, ${dias === Infinity ? "todo lo guardado" : `últimos ${dias} días`}${versiones.length ? `, versiones ${versiones.join(", ")}` : ""}.\n`);
console.log("Pantalla       veces   tiempo");
for (const [v, d] of filas) console.log(`${v.padEnd(14)} ${String(d.veces).padStart(5)}   ${horas(d.ms)}`);
const nunca = todas.filter((v) => !por.has(v));
if (nunca.length) console.log(`\nNunca abiertas: ${nunca.join(", ")}`);
console.log("\nEl tiempo es el rato que estuvo en pantalla hasta cambiar a otra; el de la última antes de cerrar no se cuenta.");
