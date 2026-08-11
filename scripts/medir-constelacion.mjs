// Cuánto trabajo tiene la Constelación por fotograma, con la bóveda REAL.
// Lo que importa: cuántos hilos llevan `shadowBlur`, que es lo caro de canvas.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const reg = JSON.parse(readFileSync(join(process.env.APPDATA, "obsidian", "obsidian.json"), "utf8"));
const vaults = Object.values(reg.vaults).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
const raiz = vaults[0].path;
console.log("Bóveda:", raiz);

const archivos = [];
(function recoger(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) recoger(p);
    else if (e.name.endsWith(".md")) archivos.push(p);
  }
})(raiz);

const docs = archivos.map((p) => {
  const id = relative(raiz, p).split(sep).join("/");
  const txt = readFileSync(p, "utf8");
  const crudos = [];
  for (const m of txt.matchAll(/\[\[([^\]|#]+)/g)) crudos.push(m[1].trim());
  for (const m of txt.matchAll(/\]\(([^)]+)\)/g)) crudos.push(m[1].trim());
  return { id, folder: id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "", crudos };
});

// Resolución aproximada: por nombre de archivo sin extensión, o por ruta.
const porNombre = new Map();
const porId = new Set();
for (const d of docs) {
  porId.add(d.id);
  const base = d.id.slice(d.id.lastIndexOf("/") + 1).replace(/\.md$/, "");
  if (!porNombre.has(base)) porNombre.set(base, d.id);
}
const resolver = (crudo) => {
  if (crudo.startsWith("http")) return null;
  const limpio = decodeURIComponent(crudo.replace(/^\.\//, ""));
  if (porId.has(limpio)) return limpio;
  if (porId.has(limpio + ".md")) return limpio + ".md";
  const base = limpio.slice(limpio.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return porNombre.get(base) ?? null;
};

const grado = new Map();
const pares = [];
for (const d of docs) {
  for (const c of d.crudos) {
    const dest = resolver(c);
    if (!dest || dest === d.id) continue;
    pares.push([d.id, dest]);
    grado.set(d.id, (grado.get(d.id) ?? 0) + 1);
    grado.set(dest, (grado.get(dest) ?? 0) + 1);
  }
}

const familia = (d) => (d.folder ? d.folder.split("/")[0] : "·");
const fams = new Set(docs.map(familia));
const g = (id) => grado.get(id) ?? 0;
// `peso` y `brilla` son literalmente los de MemoriaGrafo.tsx.
const pesos = pares.map(([a, b]) => Math.min(1, Math.max(g(a), g(b)) / 14));
const brillan = pesos.filter((p) => p > 0.55).length;
const famDe = new Map(docs.map((d) => [d.id, familia(d)]));
const puentes = pares.filter(([a, b]) => famDe.get(a) !== famDe.get(b)).length;
const conectados = docs.filter((d) => g(d.id) > 0).length;

console.log("documentos:", docs.length, "| conectados:", conectados, "| proyectos:", fams.size);
console.log("hilos:", pares.length, "| cruzan de proyecto:", puentes);
console.log("CON HALO (shadowBlur):", brillan, `(${((brillan / pares.length) * 100).toFixed(0)}%)`);
console.log("strokes por segundo a 30 fps:", pares.length * 30, "| de ellos con blur:", brillan * 30);
const gordos = [...grado.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log("los más enlazados:", gordos.map(([k, v]) => `${k.split("/").pop()} (${v})`).join(", "));

// Y lo mismo con el agrupado nuevo: cuántas llamadas de dibujo quedan.
const claves = new Set();
for (const [a, b] of pares) {
  const puente = famDe.get(a) !== famDe.get(b);
  const peso = Math.min(1, Math.max(g(a), g(b)) / 14);
  const nivel = peso > 0.66 ? 2 : peso > 0.33 ? 1 : 0;
  claves.add(`${famDe.get(a)}|${puente ? 1 : 0}|${nivel}`);
}
console.log("\nDESPUES: madejas:", claves.size, "+ rellenos de puntos:", fams.size,
  "=", claves.size + fams.size, "llamadas de dibujo por fotograma");
console.log("ANTES:", pares.length + docs.length, "llamadas, de ellas", brillan, "con desenfoque");

// Cuántos documentos tiene cada proyecto: es lo que decide el arco de cada uno
// y, con él, cuánto sitio le queda a un punto antes de tocar a su vecino. Se
// mide de verdad en `scripts/constelacion-check.ts`, que sí puede importar el
// reparto; aquí sale la forma de la bóveda para poder alimentarlo.
const porFam = new Map();
for (const d of docs) {
  if (g(d.id) === 0) continue;
  const f = familia(d);
  porFam.set(f, (porFam.get(f) ?? 0) + 1);
}
console.log("\nForma de la boveda (solo los conectados, que es lo que se pinta):");
console.log([...porFam.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  .map(([f, n]) => `${f}=${n}`).join(" "));
