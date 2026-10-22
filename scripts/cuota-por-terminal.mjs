// En qué se va la cuota de Claude: suma lo que gastó cada conversación, día a día.
//
//   node scripts/cuota-por-terminal.mjs [AAAA-MM-DD] [AAAA-MM-DD] [--top N] [--dia AAAA-MM-DD] [--json ruta]
//
// Desde y hasta (inclusivos, hora de la máquina); sin fechas, los últimos 7 días. `--dia` saca
// las conversaciones de ESE día (sin él, el de más gasto).
// Solo LEE: recorre `~/.claude/projects/*/*.jsonl` y las carpetas `<id>/subagents`, y
// suma el `usage` de cada respuesta del asistente (entrada nueva, caché escrita, caché
// leída y salida) con el modelo de esa respuesta. No escribe nada en `~/.claude`.
//
// Las unidades de la cuota de Claude no se publican. Aquí se pesa cada tipo de token con
// el PRECIO DE API de su modelo, que es una aproximación del peso relativo, no los
// números que mira Anthropic. Lo que vale es el REPARTO (qué conversación, qué modelo,
// releer contexto largo frente a escribir), no el dólar de cada cifra. Medido el
// 2026-10-22 (META 16, D2); el porqué de mirar la caché primero está en la memoria
// «Lo que cuesta de verdad una petición» (el 97 % de lo que entra es caché releída).
//
// Los transcripts llegan a más de 1 GB, así que se leen por trozos y solo se decodifica
// la línea que hace falta: las respuestas del asistente, los títulos y las compactaciones.
// Los lotes de `api-request-*` (los que pesan) ni se miran.
//
// Quién la abrió, por clase:
//   delegada  tiene rastro en `%LOCALAPPDATA%\Adeorq\rastros` con «La abrió…» (la abrió otra
//             sesión por `open_pane`); las que archivó Munir a mano no cuentan como tal
//   programa  `entrypoint` sdk-cli sin ningún mensaje escrito a mano (`claude -p`: el Capataz…)
//   escritorio la app de escritorio de Claude (no es Adeorq, pero gasta la misma cuota)
//   propia    el resto: él, en una terminal
// Una delegada que sigue viva no tiene rastro todavía y sale como propia: la cifra de
// delegadas es un suelo, no un techo.

import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PROYECTOS = path.join(os.homedir(), ".claude", "projects");
const RASTROS = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Adeorq", "rastros");

// USD por millón de tokens: [entrada, salida, caché leída]. La caché escrita vale 1,25× la
// entrada (5 min) o 2× (1 h). Precios de la API a 2026-10-06; los que faltan en la tabla
// de Anthropic (caché leída de Opus 5, Fable 5, Haiku 5.5) son el 10 % de la entrada.
const PRECIOS = {
  "claude-fable-5-1": [10, 50, 0.25],
  "claude-fable-5": [10, 50, 0.25],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};
const POR_FAMILIA = { fable: [10, 50, 0.25], opus: [5, 25, 0.5], sonnet: [3, 15, 0.3], haiku: [1, 5, 0.1], otro: [5, 25, 0.5] };
// Dónde cae el contexto de cada petición (lo que entra entero cada vez).
const TOPES_COMPACTAR = [200_000, 400_000, 500_000, 600_000];
const TRAMOS_CTX = [
  [100_000, "< 100k"],
  [200_000, "100k–200k"],
  [400_000, "200k–400k"],
  [700_000, "400k–700k"],
  [Infinity, "> 700k"],
];

const familiaDe = (modelo = "") => (/fable/.test(modelo) ? "fable" : /opus/.test(modelo) ? "opus" : /sonnet/.test(modelo) ? "sonnet" : /haiku/.test(modelo) ? "haiku" : "otro");
const preciosDe = (modelo) => PRECIOS[modelo] || POR_FAMILIA[familiaDe(modelo)];
const pad = (n) => String(n).padStart(2, "0");
const diaLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const nuevaBolsa = () => ({ msgs: 0, in: 0, cw: 0, cr: 0, out: 0, usd: 0, usdIn: 0, usdCw: 0, usdCr: 0, usdOut: 0 });
function sumarBolsa(b, r) {
  b.msgs += r.msgs ?? 1;
  for (const k of ["in", "cw", "cr", "out", "usd", "usdIn", "usdCw", "usdCr", "usdOut"]) b[k] += r[k];
}
const en = (obj, clave) => (obj[clave] ??= nuevaBolsa());

/** Lo que cuesta una respuesta, en USD de API, desglosado por tipo de token. */
function costeDe(modelo, u, rapido = false) {
  const [pIn, pOut, pCr] = preciosDe(modelo);
  const cw1h = u.cw1h ?? 0;
  const cw5m = Math.max(0, u.cw - cw1h);
  const f = rapido ? 2 : 1;
  const usdIn = (u.in * pIn * f) / 1e6;
  const usdCw = ((cw5m * 1.25 + cw1h * 2) * pIn * f) / 1e6;
  const usdCr = (u.cr * pCr * f) / 1e6;
  const usdOut = (u.out * pOut * f) / 1e6;
  return { usdIn, usdCw, usdCr, usdOut, usd: usdIn + usdCw + usdCr + usdOut };
}

// ── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(nombre) {
  const i = args.indexOf(nombre);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, v === undefined ? 1 : 2);
  return v ?? "";
}
const SALIDA_JSON = flag("--json");
const TOP = Number(flag("--top") ?? 10) || 10;
const DIA_PEDIDO = flag("--dia");
const fechas = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const HASTA = fechas[1] ?? fechas[0] ?? diaLocal(new Date());
const DESDE = fechas.length > 1 ? fechas[0] : fechas.length === 1 ? fechas[0] : diaLocal(new Date(Date.now() - 6 * 86_400_000));
const INICIO_MS = new Date(`${DESDE}T00:00:00`).getTime();
const dentro = (dia) => dia >= DESDE && dia <= HASTA;

// ── Rastros: las conversaciones que abrió otra sesión ─────────────────────────
function cargarRastros() {
  const mapa = new Map();
  if (!existsSync(RASTROS)) return mapa;
  for (const f of readdirSync(RASTROS)) {
    if (!f.endsWith(".md")) continue;
    const md = readFileSync(path.join(RASTROS, f), "utf8");
    const id = /^- Conversación: `([0-9a-f-]+)`/m.exec(md)?.[1];
    const abre = /^- La abrió (.+?)(?: y la cerró|$)/m.exec(md)?.[1];
    if (!id || !abre) continue; // «La archivó…» es una limpieza de la barra, no una delegada
    const nombre = /«([^»]+)»/.exec(abre)?.[1];
    mapa.set(id, nombre ? `sesión «${nombre}»` : abre.trim());
  }
  return mapa;
}

// ── Lectura por trozos ───────────────────────────────────────────────────────
async function* lineas(ruta) {
  let resto = [];
  for await (const trozo of createReadStream(ruta, { highWaterMark: 4 << 20 })) {
    let ini = 0;
    for (let nl = trozo.indexOf(10, ini); nl >= 0; nl = trozo.indexOf(10, ini)) {
      const parte = trozo.subarray(ini, nl);
      yield resto.length ? Buffer.concat([...resto, parte]) : parte;
      resto = [];
      ini = nl + 1;
    }
    if (ini < trozo.length) resto.push(trozo.subarray(ini));
  }
  if (resto.length) yield Buffer.concat(resto);
}
const ASISTENTE = Buffer.from('"type":"assistant"');
const COMPACTAR = Buffer.from('"subtype":"compact_boundary"');
const ESCRITO = Buffer.from('"promptSource":"typed"');
const PROGRAMA = Buffer.from('"promptSource":"sdk"');
const TURNO = Buffer.from('"subtype":"turn_duration"');

// ── Conversaciones ───────────────────────────────────────────────────────────
const convs = new Map();
function conv(id, carpeta) {
  let c = convs.get(id);
  if (!c) {
    c = {
      id, carpeta, titulo: "", tituloIA: "", cwd: "", entrypoint: "", escrita: false, programa: false, primerPrompt: "",
      compactaciones: [], total: nuevaBolsa(), subagentes: nuevaBolsa(), nSubagentes: 0,
      dias: {}, trabajo: {}, origenes: {}, exceso: {}, frios: nuevaBolsa(), familias: {}, esfuerzos: {}, contextos: {}, tramos: {}, diaFamilia: {}, diaContexto: {},
      pico: 0, primero: "", ultimo: "",
    };
    convs.set(id, c);
  }
  return c;
}

const vistos = new Set();
let repetidosEntreArchivos = 0;
let sinPrecio = 0;

async function leer(ruta, id, carpeta, esSubagente) {
  const c = conv(id, carpeta);
  if (esSubagente) c.nSubagentes++;
  let pend = null; // los bloques de una misma respuesta repiten el mismo `usage`
  let compactadas = 0;

  const volcar = () => {
    if (!pend) return;
    const p = pend;
    pend = null;
    if (vistos.has(p.id)) return void repetidosEntreArchivos++;
    vistos.add(p.id);
    const dia = diaLocal(new Date(p.ts));
    if (!dentro(dia)) return;
    if (!PRECIOS[p.modelo]) sinPrecio++;
    const r = { ...costeDe(p.modelo, p, p.rapido), in: p.in, cw: p.cw, cr: p.cr, out: p.out };
    const ctx = p.in + p.cw + p.cr;
    const fam = familiaDe(p.modelo);
    const tramoCtx = TRAMOS_CTX.find(([tope]) => ctx < tope)[1];
    sumarBolsa(c.total, r);
    if (esSubagente || p.lateral) sumarBolsa(c.subagentes, r);
    sumarBolsa(en(c.dias, dia), r);
    sumarBolsa(en(c.familias, fam), r);
    sumarBolsa(en(c.esfuerzos, p.esfuerzo), r);
    sumarBolsa(en(c.contextos, tramoCtx), r);
    sumarBolsa(en(c.tramos, String(Math.min(compactadas, 3))), r);
    sumarBolsa(en(c.diaFamilia, `${dia}|${fam}`), r);
    sumarBolsa(en(c.diaContexto, `${dia}|${tramoCtx}`), r);
    sumarBolsa(en(c.origenes, p.origen), r);
    // Lo que habría costado de menos si la conversación se hubiera compactado al llegar a T:
    // la caché que se relee por encima de T (como mínimo; la compactada además empieza de nuevo).
    for (const t of TOPES_COMPACTAR) if (ctx > t) c.exceso[t] = (c.exceso[t] ?? 0) + ((ctx - t) * preciosDe(p.modelo)[2] * (p.rapido ? 2 : 1)) / 1e6;
    // Un arranque en frío: la caché caducó (una hora sin hablarle) y se reescribió casi todo el contexto.
    if (ctx > 100_000 && p.cw > ctx * 0.5) sumarBolsa(c.frios, r);
    c.pico = Math.max(c.pico, ctx);
    if (!c.primero || p.ts < c.primero) c.primero = p.ts;
    if (p.ts > c.ultimo) c.ultimo = p.ts;
  };

  for await (const b of lineas(ruta)) {
    if (b.length < 3) continue;
    const cab = b.toString("latin1", 0, 26);
    if (cab.startsWith('{"type":"api-request')) continue;
    if (cab.startsWith('{"type":"custom-title"') || cab.startsWith('{"type":"ai-title"')) {
      const o = JSON.parse(b.toString("utf8"));
      if (o.customTitle) c.titulo = o.customTitle;
      if (o.aiTitle) c.tituloIA = o.aiTitle;
    } else if (b.includes(ASISTENTE)) {
      let o;
      try { o = JSON.parse(b.toString("utf8")); } catch { continue; }
      const m = o.message;
      if (o.type !== "assistant" || !m?.usage || !m.id || m.model === "<synthetic>") continue;
      if (!esSubagente && o.cwd) c.cwd = o.cwd; // el proyecto es el de la sesión, no el de sus subagentes
      if (!esSubagente && o.entrypoint && !c.entrypoint) c.entrypoint = o.entrypoint;
      const u = m.usage;
      const nuevo = {
        id: m.id, ts: o.timestamp, modelo: m.model, in: u.input_tokens || 0, cw: u.cache_creation_input_tokens || 0,
        cw1h: u.cache_creation?.ephemeral_1h_input_tokens || 0, cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0,
        rapido: u.speed === "fast", origen: o.entrypoint || "sin dato", esfuerzo: o.effort || "sin dato", lateral: !!o.isSidechain,
      };
      if (pend && pend.id === m.id) {
        for (const k of ["in", "cw", "cw1h", "cr", "out"]) pend[k] = Math.max(pend[k], nuevo[k]);
      } else {
        volcar();
        pend = nuevo;
      }
    } else if (b.includes(COMPACTAR)) {
      try {
        const o = JSON.parse(b.toString("utf8"));
        const k = o.compactMetadata || {};
        c.compactaciones.push({ ts: o.timestamp, dia: diaLocal(new Date(o.timestamp)), modo: k.trigger, antes: k.preTokens, despues: k.postTokens, ms: k.durationMs });
        volcar();
        compactadas++;
      } catch { /* una línea rota no tumba la medición */ }
    } else if (b.includes(TURNO)) {
      try {
        const o = JSON.parse(b.toString("utf8"));
        const dia = diaLocal(new Date(o.timestamp));
        if (dentro(dia)) c.trabajo[dia] = (c.trabajo[dia] ?? 0) + (o.durationMs || 0);
      } catch { /* idem */ }
    } else if (!esSubagente && b.includes(ESCRITO)) {
      c.escrita = true;
      if (!c.primerPrompt) {
        try {
          const cont = JSON.parse(b.toString("utf8")).message?.content;
          c.primerPrompt = (typeof cont === "string" ? cont : (cont || []).map((x) => x.text || "").join(" ")).replace(/\s+/g, " ").slice(0, 200);
        } catch { /* sin título de reserva */ }
      }
    } else if (!esSubagente && b.includes(PROGRAMA)) {
      c.programa = true;
    }
  }
  volcar();
}

/** Los `.jsonl` de una carpeta de subagentes, también los de `workflows/<wf>/`. */
function* subagentes(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) yield* subagentes(ruta);
    else if (e.name.endsWith(".jsonl")) yield ruta;
  }
}

function archivos() {
  const lista = [];
  for (const carpeta of readdirSync(PROYECTOS)) {
    const dir = path.join(PROYECTOS, carpeta);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      const ruta = path.join(dir, f);
      if (f.endsWith(".jsonl")) lista.push({ ruta, id: f.slice(0, -6), carpeta, sub: false });
      else if (existsSync(path.join(ruta, "subagents"))) {
        for (const s of subagentes(path.join(ruta, "subagents"))) lista.push({ ruta: s, id: f, carpeta, sub: true });
      }
    }
  }
  return lista.map((a) => ({ ...a, mtime: statSync(a.ruta).mtimeMs })).filter((a) => a.mtime >= INICIO_MS).sort((a, b) => a.mtime - b.mtime);
}

// ── Informe ──────────────────────────────────────────────────────────────────
const usd = (n) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const pct = (n, t) => (t ? `${((100 * n) / t).toFixed(1)} %` : "—");
const mtok = (n) => `${(n / 1e6).toFixed(1)}M`;

function juntar(...bolsas) {
  const t = nuevaBolsa();
  for (const b of bolsas) if (b) sumarBolsa(t, b);
  return t;
}

function resumen(lista) {
  const horasPorDia = {};
  const porClase = {}, porDia = {}, porFamilia = {}, porContexto = {}, porTramo = {}, porEsfuerzoClase = {}, porDiaFamilia = {}, porDiaContexto = {}, porDiaClase = {};
  const total = nuevaBolsa();
  for (const c of lista) {
    sumarBolsa(total, c.total);
    sumarBolsa(en(porClase, c.clase), c.total);
    for (const [k, ms] of Object.entries(c.trabajo)) horasPorDia[k] = (horasPorDia[k] ?? 0) + ms / 3.6e6;
    for (const [k, b] of Object.entries(c.dias)) { sumarBolsa(en(porDia, k), b); sumarBolsa(en(porDiaClase, `${k}|${c.clase}`), b); }
    for (const [k, b] of Object.entries(c.familias)) sumarBolsa(en(porFamilia, k), b);
    for (const [k, b] of Object.entries(c.contextos)) sumarBolsa(en(porContexto, k), b);
    for (const [k, b] of Object.entries(c.tramos)) sumarBolsa(en(porTramo, k), b);
    for (const [k, b] of Object.entries(c.esfuerzos)) sumarBolsa(en(porEsfuerzoClase, `${c.clase}|${k}`), b);
    for (const [k, b] of Object.entries(c.diaFamilia)) sumarBolsa(en(porDiaFamilia, k), b);
    for (const [k, b] of Object.entries(c.diaContexto)) sumarBolsa(en(porDiaContexto, k), b);
  }
  return { total, horasPorDia, porClase, porDia, porFamilia, porContexto, porTramo, porEsfuerzoClase, porDiaFamilia, porDiaContexto, porDiaClase };
}

function imprimir(lista, r, rastros) {
  const t = r.total;
  const sal = [];
  const p = (...x) => sal.push(x.join(""));
  p(`Cuota por terminal · ${DESDE} a ${HASTA} · ${lista.length} conversaciones con gasto · pesos = precio de API (aproximación)`);
  p(`Total ${usd(t.usd)}: leer caché ${pct(t.usdCr, t.usd)} · escribir caché ${pct(t.usdCw, t.usd)} · salida ${pct(t.usdOut, t.usd)} · entrada nueva ${pct(t.usdIn, t.usd)}`);
  p("");
  p("Por día:");
  p("  (entre paréntesis, sin contar la caché leída: por si la cuota la pesa mucho menos que la API;");
  p("   al final, horas con el agente en un turno, sumadas entre terminales: la cuota de Claude cuenta horas de modelo)");
  for (const d of Object.keys(r.porDia).sort()) {
    const b = r.porDia[d];
    p(`  ${d}  ${usd(b.usd).padStart(6)}  ${pct(b.usd, t.usd).padStart(7)}  (${usd(b.usd - b.usdCr).padStart(5)} ${pct(b.usd - b.usdCr, t.usd - t.usdCr).padStart(7)})  ${String(b.msgs).padStart(6)} respuestas  ${(r.horasPorDia[d] ?? 0).toFixed(1).padStart(5)} h`);
  }
  p("");
  const dia = DIA_PEDIDO || Object.keys(r.porDia).sort((a, b) => r.porDia[b].usd - r.porDia[a].usd)[0];
  if (dia && r.porDia[dia]) {
    p(`El ${dia}, por conversación:`);
    const delDia = lista.filter((c) => c.dias[dia]).sort((a, b) => b.dias[dia].usd - a.dias[dia].usd);
    for (const c of delDia.slice(0, 6)) p(`  ${usd(c.dias[dia].usd).padStart(6)} ${pct(c.dias[dia].usd, r.porDia[dia].usd).padStart(7)}  ${c.clase.padEnd(10)} ${(c.titulo || c.tituloIA || c.id).slice(0, 52)}  [${c.proyecto}]`);
    p("");
  }
  p("Por clase:");
  for (const [k, b] of Object.entries(r.porClase).sort((a, b) => b[1].usd - a[1].usd)) p(`  ${k.padEnd(11)} ${usd(b.usd).padStart(6)}  ${pct(b.usd, t.usd).padStart(7)}`);
  p("");
  p("Por modelo:");
  for (const [k, b] of Object.entries(r.porFamilia).sort((a, b) => b[1].usd - a[1].usd)) p(`  ${k.padEnd(11)} ${usd(b.usd).padStart(6)}  ${pct(b.usd, t.usd).padStart(7)}`);
  p("");
  p("Por contexto de la petición (lo que se relee entero cada vez):");
  for (const [, nombre] of TRAMOS_CTX) { const b = r.porContexto[nombre]; if (b) p(`  ${nombre.padEnd(11)} ${usd(b.usd).padStart(6)}  ${pct(b.usd, t.usd).padStart(7)}  ${b.msgs} respuestas`); }
  p("");
  const frios = lista.reduce((a, c) => juntar(a, c.frios), nuevaBolsa());
  p(`Arranques en frío (la caché caducó y se reescribió el contexto de 100k o más): ${frios.msgs} respuestas, ${usd(frios.usd)}, ${pct(frios.usd, t.usd)} del total`);
  p("");
  p("Lo que se habría ahorrado compactando al llegar a T (mínimo: solo la caché que sobra por encima de T):");
  for (const tope of TOPES_COMPACTAR) {
    const ahorro = lista.reduce((a, c) => a + (c.exceso[tope] ?? 0), 0);
    p(`  T = ${String(tope / 1000).padStart(3)}k   ${usd(ahorro).padStart(6)}  ${pct(ahorro, t.usd).padStart(7)} del total`);
  }
  p("");
  p(`Las ${TOP} conversaciones que más gastaron:`);
  for (const c of [...lista].sort((a, b) => b.total.usd - a.total.usd).slice(0, TOP)) {
    const fam = Object.entries(c.familias).sort((a, b) => b[1].usd - a[1].usd)[0]?.[0] ?? "";
    p(`  ${usd(c.total.usd).padStart(6)} ${pct(c.total.usd, t.usd).padStart(7)}  ${c.clase.padEnd(10)} ${fam.padEnd(6)} ${String(c.compactaciones.filter((k) => dentro(k.dia)).length).padStart(2)} comp.  ${(c.titulo || c.tituloIA || c.primerPrompt || c.id).slice(0, 52)}  [${c.proyecto}]`);
  }
  p("");
  p(`Notas: ${repetidosEntreArchivos} respuestas repetidas entre archivos descartadas; ${sinPrecio} con un modelo sin precio propio (se usó el de su familia).`);
  console.log(sal.join("\n"));
}

// ── Principal ────────────────────────────────────────────────────────────────
const rastros = cargarRastros();
const t0 = Date.now();
const lista0 = archivos();
for (const a of lista0) await leer(a.ruta, a.id, a.carpeta, a.sub);

const lista = [...convs.values()].filter((c) => c.total.msgs > 0);
for (const c of lista) {
  const trozos = c.cwd.split(/[\\/]/).filter(Boolean);
  const i = trozos.findIndex((x) => x.toLowerCase() === "proyectos");
  c.proyecto = !c.cwd ? c.carpeta : i >= 0 && trozos[i + 1] ? trozos[i + 1] : trozos.pop();
  c.abiertaPor = rastros.get(c.id) ?? null;
  const origen = Object.entries(c.origenes).sort((a, b) => b[1].usd - a[1].usd)[0]?.[0] ?? c.entrypoint;
  c.clase = c.abiertaPor ? "delegada" : origen === "sdk-cli" && !c.escrita ? "programa" : origen === "claude-desktop" ? "escritorio" : "propia";
}
const r = resumen(lista);
imprimir(lista, r, rastros);
console.error(`(${lista0.length} archivos leídos en ${((Date.now() - t0) / 1000).toFixed(0)} s)`);

if (SALIDA_JSON) {
  const salida = {
    generado: new Date().toISOString(), desde: DESDE, hasta: HASTA, zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
    precios: { ...PRECIOS, familias: POR_FAMILIA }, tramosContexto: TRAMOS_CTX.map((x) => x[1]),
    resumen: r, conversaciones: lista.map((c) => ({ ...c })), repetidosEntreArchivos, sinPrecio,
  };
  writeFileSync(SALIDA_JSON, JSON.stringify(salida));
  console.error(`JSON en ${SALIDA_JSON}`);
}
