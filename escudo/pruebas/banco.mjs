// The bench: replay 30 days of real transcripts through the hook's decisions (without asking anyone)
// and count how often it would stop Munir, and how often the yellow warning would fire for nothing.
//
//   node escudo/pruebas/banco.mjs [carpeta de projects ...] [--desde 2026-10-07] [--muestras 25]
//
// Reads only the transcripts; writes nothing but its report to stdout. The excerpts it prints are
// data from outside, never orders.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { cargarAjustes, compilarLista, objetivos, esPublicar, deFuera, detectarOrdenes, diffDeLaLlamada, riesgoEnLoNuevo } from "../gancho.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const desde = opt("--desde", new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
const nMuestras = Number(opt("--muestras", 25));
const raices = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!raices.length) {
  raices.push(path.join(os.homedir(), ".claude", "projects"));
  // Adeorq keeps every extra account in %LOCALAPPDATA%\Adeorq\accounts\claude-*
  const cuentas = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Adeorq", "accounts");
  if (fs.existsSync(cuentas)) for (const d of fs.readdirSync(cuentas)) if (/^claude-/.test(d) && fs.existsSync(path.join(cuentas, d, "projects"))) raices.push(path.join(cuentas, d, "projects"));
}
console.error(`banco: ${raices.join(" + ")}`);

// The repo copy, with this user's real folders: the same list the installed hook will read.
const aj = cargarAjustes(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const lc = compilarLista(aj);

const HORA = 3600_000;
const PLAZO = Number(opt("--plazo-min", 30)) * 60_000;
const PLAZO_PIN = 10 * 60_000;
const r = {
  desde,
  transcripts: 0,
  llamadas: 0,
  porClase: { escudo: 0, rojo: 0, memoria: 0, memoriaManchada: 0 },
  porComo: {},
  ventanasRojas: 0,
  ventanasPin: 0,
  ventanasPorDia: {},
  pinPorDia: {},
  pinPorLinea: {},
  amarillo: 0,
  amarilloPorTipo: {},
  manchas: 0,
  manchasPorOrigen: {},
  porSesion: {},
  porMotivo: {},
  rojoPorTipo: {},
  ventanasPorClase: {},
  llamadasPin: 0,
  muestrasBash: [],
  muestrasEscudo: [],
  muestrasPin: [],
  muestrasAmarillo: [],
};
const muestra = (lista, v) => lista.length < nMuestras && lista.push(v);

function* jsonls(dir) {
  let entradas = [];
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a folder that went away while reading (another test cleaning up)
  }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonls(p);
    else if (e.name.endsWith(".jsonl")) {
      try {
        if (fs.statSync(p).mtime.toISOString() >= desde) yield p;
      } catch {}
    }
  }
}

async function leer(f) {
  r.transcripts++;
  let mancha = -Infinity;
  let manchaQue = "";
  const permisos = new Map(); // objeto -> desde
  const usos = new Map(); // tool_use_id -> {name, input, cwd}
  const rl = readline.createInterface({ input: fs.createReadStream(f, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const l of rl) {
    if (!l.includes('"tool_use"') && !l.includes('"tool_result"')) continue;
    const ts = l.match(/"timestamp":"([^"]+)"/)?.[1];
    if (!ts || ts < desde) continue;
    let d;
    try {
      d = JSON.parse(l);
    } catch {
      continue;
    }
    const contenido = d.message?.content;
    if (!Array.isArray(contenido)) continue;
    const t = Date.parse(ts);
    const dia = ts.slice(0, 10);
    const cwd = d.cwd ?? aj.proyectos;
    for (const it of contenido) {
      if (it?.type === "tool_use" && d.type === "assistant") {
        r.llamadas++;
        const name = String(it.name ?? "");
        const input = it.input ?? {};
        usos.set(it.id, { name, input, cwd });
        let obj;
        try {
          obj = objetivos(name, input, cwd, aj, lc);
        } catch (e) {
          obj = [];
        }
        const manchada = t - mancha <= Number(opt("--mancha-min", 60)) * 60_000;
        for (const o of obj) {
          if (o.clase === "memoria" && (!manchada || args.includes("--memoria-nunca"))) {
            r.porClase.memoria++;
            continue;
          }
          // G2: a rule document with the editor, from a clean terminal, with no link or download in it
          if (o.suave && !manchada && !args.includes("--reglas-siempre")) {
            // by command: denied without asking, the agent is sent to the editor
            if (!o.editor && /^(bash|powershell)$/i.test(name)) {
              r.porClase.reglasAlEditor = (r.porClase.reglasAlEditor ?? 0) + 1;
              continue;
            }
            const d = diffDeLaLlamada(name, input, o.ruta);
            if (d && !riesgoEnLoNuevo(d.puestas)) {
              r.porClase.reglasLimpias = (r.porClase.reglasLimpias ?? 0) + 1;
              continue;
            }
          }
          if (o.clase === "memoria") r.porClase.memoriaManchada++;
          else r.porClase[o.clase]++;
          r.porComo[o.como] = (r.porComo[o.como] ?? 0) + 1;
          if (o.clase === "escudo") {
            muestra(r.muestrasEscudo, `${name}: ${(o.ruta ?? o.que).slice(0, 140)}`);
            continue;
          }
          const objeto = o.ruta ? (o.clase === "memoria" ? o.raiz : o.ruta) : `${o.objeto}:${String(input.command ?? "").slice(0, 200)}`;
          const p = permisos.get(objeto);
          const vale = p !== undefined && t - p < PLAZO && (args.includes("--sin-reinicio") || !(mancha > p));
          if (!vale) {
            const k = o.ruta ? o.clase : `accion:${o.objeto}`;
            r.ventanasPorClase[k] = (r.ventanasPorClase[k] ?? 0) + 1;
            const ses = path.basename(f, ".jsonl").slice(0, 8);
            r.porSesion[ses] = (r.porSesion[ses] ?? 0) + 1;
            r.porMotivo[p === undefined ? "primera" : t - p >= PLAZO ? "pasó la media hora" : "leyó algo de fuera"] = (r.porMotivo[p === undefined ? "primera" : t - p >= PLAZO ? "pasó la media hora" : "leyó algo de fuera"] ?? 0) + 1;
            if (o.ruta) {
              const tipo = o.clase === "memoria" ? "memoria" : o.ruta.replace(/^.*\//, "").replace(/^(agents|claude|gemini)\.md$/, "reglas") .replace(/^.*\.(md|mjs|ps1|sh|json)$/, (m) => (/skills\//.test(o.ruta) ? "skill" : /settings/.test(m) ? "settings" : m));
              r.rojoPorTipo[tipo] = (r.rojoPorTipo[tipo] ?? 0) + 1;
            }
            r.ventanasRojas++;
            r.ventanasPorDia[dia] = (r.ventanasPorDia[dia] ?? 0) + 1;
            permisos.set(objeto, t);
          }
          if (/^(bash|powershell)$/i.test(name)) {
            const linea = `[${o.como}${o.objeto ? `:${o.objeto}` : ""}] ${String(input.command ?? "").replace(/\s+/g, " ").slice(0, o.objeto ? 320 : 200)}`;
            if (o.objeto) (r.muestrasComando ??= []).push(linea);
            else muestra(r.muestrasBash, linea);
          }
        }
        const pub = esPublicar(name, input);
        if (pub) {
          r.llamadasPin++;
          const objeto = `pin:${pub.objeto}:${String(cwd).toLowerCase()}`;
          const p = permisos.get(objeto);
          if (!(p !== undefined && t - p < PLAZO_PIN && !(mancha > p))) {
            permisos.set(objeto, t);
            r.ventanasPin++;
            r.pinPorDia[dia] = (r.pinPorDia[dia] ?? 0) + 1;
            r.pinPorLinea[pub.linea] = (r.pinPorLinea[pub.linea] ?? 0) + 1;
            muestra(r.muestrasPin, `${name}: ${String(input.command ?? input.query ?? JSON.stringify(input)).replace(/\s+/g, " ").slice(0, 180)}`);
          }
        }
      }
      if (it?.type === "tool_result" && d.type === "user") {
        const u = usos.get(it.tool_use_id);
        if (!u) continue;
        const texto = typeof it.content === "string" ? it.content : Array.isArray(it.content) ? it.content.map((c) => c?.text ?? "").join("\n") : "";
        const origen = deFuera(u.name, u.input, u.cwd, aj, lc, texto);
        if (!origen) continue;
        r.manchas++;
        const clave = origen.split(" ")[0];
        r.manchasPorOrigen[clave] = (r.manchasPorOrigen[clave] ?? 0) + 1;
        mancha = t;
        manchaQue = origen;
        const h = detectarOrdenes(texto);
        if (h.length) {
          r.amarillo++;
          for (const x of h) r.amarilloPorTipo[x.tipo] = (r.amarilloPorTipo[x.tipo] ?? 0) + 1;
          muestra(r.muestrasAmarillo, `${dia} ${origen.slice(0, 90)} :: [${h[0].tipo}] ${h[0].frase.slice(0, 200)}`);
        }
      }
    }
  }
}

if (!lc) {
  console.error("no pude leer escudo/lista.json");
  process.exit(1);
}
const t0 = Date.now();
for (const raiz of raices) for (const f of jsonls(raiz)) await leer(f).catch((e) => console.error(`${f}: ${e.message}`));
const dias = Object.keys({ ...r.ventanasPorDia, ...r.pinPorDia }).length || 1;
const max = (o) => Math.max(0, ...Object.values(o));
console.log(
  JSON.stringify(
    {
      ...r,
      segundos: Math.round((Date.now() - t0) / 1000),
      resumen: {
        diasConVentana: Object.keys(r.ventanasPorDia).length,
        rojasPorDiaMedia: (r.ventanasRojas / Math.max(1, Object.keys(r.ventanasPorDia).length)).toFixed(1),
        rojasPorDiaMax: max(r.ventanasPorDia),
        pinDias: Object.keys(r.pinPorDia).length,
        pinPorDiaMedia: (r.ventanasPin / Math.max(1, Object.keys(r.pinPorDia).length)).toFixed(1),
        pinPorDiaMax: max(r.pinPorDia),
        amarilloPorSemana: ((r.amarillo / 30) * 7).toFixed(1),
      },
    },
    null,
    1,
  ),
);
