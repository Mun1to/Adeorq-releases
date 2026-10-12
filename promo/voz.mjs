/**
 * Corta y limpia la grabación de la voz.
 *
 * Munir graba el guion de un tirón, un archivo por idioma, y lo deja en
 * `promo/voz/` como `es.<lo que sea>` y `en.<lo que sea>`. Esto lo convierte en
 * lo que el montaje sabe usar: un trozo por escena en `public/voz/<idioma>/`
 * y un `voz.json` que dice cuánto dura cada uno y dónde empieza cada frase.
 * Con eso `Root.tsx` alarga o encoge cada escena a lo que dura su frase.
 *
 *   node voz.mjs es                       busca promo/voz/es.*
 *   node voz.mjs en ruta/al/audio.m4a     otro archivo
 *   node voz.mjs es audio.wav --a carpeta deja el resultado en otra carpeta (para probar)
 *
 * Cómo sabe qué trozo es cada frase sin que nadie lo oiga:
 *  1. Limpia la grabación y la parte por sus silencios en tramos hablados.
 *  2. Transcribe cada tramo con whisper.cpp (el que ya instala Adeorq en
 *     `%LOCALAPPDATA%\Adeorq\whisper`).
 *  3. Busca en lo transcrito cada frase del guion. Si una está dicha dos veces
 *     (se trabó y la repitió), se queda con la ÚLTIMA: por eso puede grabar
 *     sin parar.
 *
 * ⚠ Los cortes salen de la onda, NO del reloj de whisper. Se probó primero
 * transcribiendo el archivo entero y cortando por los tiempos de cada palabra:
 * el final de una palabra lo pone donde empieza la siguiente aunque en medio
 * haya dos segundos de silencio, y una frase de un segundo salía de cuatro. Por
 * eso se parte antes por silencios y whisper solo dice qué pone en cada tramo.
 *
 * La limpieza es corta a propósito: quitar el retumbe de abajo, un poco del
 * soplido de fondo, igualar lo que sube y baja al leer y dejarlo todo a
 * -16 LUFS. Nada que cambie cómo suena él.
 *
 * ⚠ Nada de aquí se versiona: ni `voz/` (la grabación) ni `public/voz/` (lo
 * cortado). Es su voz, y `promo/` viaja entero al repositorio público.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const { ESCENAS, IDIOMAS } = await import("./src/guion.ts");

const args = process.argv.slice(2);
const iA = args.indexOf("--a");
const salida = resolve(iA >= 0 ? args.splice(iA, 2)[1] : join(aqui, "public", "voz"));
const [idioma, dado] = args;
if (!IDIOMAS.includes(idioma)) {
  console.error("Uso: node voz.mjs <es|en> [archivo de audio] [--a carpeta de salida]");
  process.exit(1);
}

const grabaciones = join(aqui, "voz");
const entrada = dado
  ? resolve(dado)
  : existsSync(grabaciones)
    ? readdirSync(grabaciones)
        .filter((f) => f.toLowerCase().startsWith(`${idioma}.`))
        .map((f) => join(grabaciones, f))[0]
    : undefined;
if (!entrada || !existsSync(entrada)) {
  console.error(`No encuentro la grabación. Déjala en ${grabaciones} con el nombre «${idioma}» (el formato da igual) o pasa la ruta.`);
  process.exit(1);
}

const WHISPER = join(process.env.LOCALAPPDATA ?? "", "Adeorq", "whisper");
const modelo = existsSync(WHISPER) ? readdirSync(WHISPER).find((f) => /^ggml-.*\.bin$/.test(f)) : undefined;
if (!modelo || !existsSync(join(WHISPER, "whisper-cli.exe"))) {
  console.error(`Falta whisper.cpp en ${WHISPER} (whisper-cli.exe y un ggml-*.bin). Lo instala Adeorq al usar el dictado.`);
  process.exit(1);
}

const tmp = join(aqui, "out", "voz-tmp", idioma);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

function corre(programa, argumentos, donde = aqui) {
  const r = spawnSync(programa, argumentos, { cwd: donde, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error(`${programa} falló:\n${(r.stderr || r.stdout || "").split("\n").slice(-12).join("\n")}`);
    process.exit(1);
  }
  return r;
}

function wav(ruta, muestras, hz) {
  const datos = Buffer.alloc(muestras.length * 2);
  for (let i = 0; i < muestras.length; i++) datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, muestras[i])) * 32767), i * 2);
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + datos.length, 4);
  cab.write("WAVEfmt ", 8);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(hz, 24);
  cab.writeUInt32LE(hz * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(datos.length, 40);
  writeFileSync(ruta, Buffer.concat([cab, datos]));
}

/* ---- 1. Limpiarla ------------------------------------------------------- */

const HZ = 48000;
const cadena = "highpass=f=75,afftdn=nr=8:nf=-30,acompressor=threshold=-21dB:ratio=3:attack=8:release=140:makeup=2";
// La sonoridad, en dos pasadas: se mide y luego se sube todo lo mismo. En una
// sola pasada `loudnorm` va subiendo y bajando sobre la marcha, y se oye.
const medida = corre("ffmpeg", ["-hide_banner", "-i", entrada, "-af", `${cadena},loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json`, "-f", "null", "-"]).stderr;
const m = JSON.parse(medida.slice(medida.lastIndexOf("{"), medida.lastIndexOf("}") + 1));
const norma = `loudnorm=I=-16:TP=-1.5:LRA=9:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
const cruda = join(tmp, "limpia.raw");
corre("ffmpeg", ["-y", "-loglevel", "error", "-i", entrada, "-af", `${cadena},${norma}`, "-ac", "1", "-ar", String(HZ), "-f", "s16le", cruda]);
const bytes = readFileSync(cruda);
const pcm = Float32Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1), (v) => v / 32768);

/* ---- 2. Dónde se habla y dónde se calla --------------------------------- */

const TROZO = HZ / 100; // 10 ms
const fuerza = new Float32Array(Math.floor(pcm.length / TROZO));
for (let i = 0; i < fuerza.length; i++) {
  let s = 0;
  for (let j = i * TROZO; j < (i + 1) * TROZO; j++) s += pcm[j] * pcm[j];
  fuerza[i] = Math.sqrt(s / TROZO);
}
// Lo que suena cuando calla: el décimo más bajo. Se habla por encima de eso.
const suelo = [...fuerza].sort((a, b) => a - b)[Math.floor(fuerza.length * 0.1)];
const UMBRAL = Math.max(suelo * 3, 0.004);
const calla = (i) => i < 0 || i >= fuerza.length || fuerza[i] < UMBRAL;

/** Los tramos hablados, en segundos: lo que suena por encima del suelo,
    juntando lo que separa menos de 0,45 s (dentro de una frase también se
    calla) y tirando los chasquidos sueltos. */
const PAUSA = 45;
const hablado = [];
for (let i = 0, de = -1, ultimo = -1; i <= fuerza.length; i++) {
  if (!calla(i)) {
    if (de < 0) de = i;
    ultimo = i;
  } else if (de >= 0 && (i - ultimo > PAUSA || i === fuerza.length)) {
    if (ultimo - de >= 6) hablado.push({ de: de / 100, a: (ultimo + 1) / 100 });
    de = -1;
  }
}
if (hablado.length === 0) {
  console.error("En la grabación no se oye a nadie.");
  process.exit(1);
}

/* ---- 3. Qué se dice en cada tramo: whisper ------------------------------ */

// Cada tramo, a 16 kHz (lo que pide whisper) y con un poco de silencio a los
// lados. De 48 a 16 es justo un tercio: se promedia de tres en tres.
const COLCHON = 0.3;
const nombres = hablado.map((h, n) => {
  const ini = Math.round(h.de * HZ);
  const fin = Math.min(pcm.length, Math.round(h.a * HZ));
  const borde = Math.round(COLCHON * 16000);
  const t = new Float32Array(Math.floor((fin - ini) / 3) + 2 * borde);
  for (let i = 0; i < t.length - 2 * borde; i++) t[borde + i] = (pcm[ini + 3 * i] + pcm[ini + 3 * i + 1] + pcm[ini + 3 * i + 2]) / 3;
  const nombre = `t${String(n).padStart(3, "0")}.wav`;
  wav(join(tmp, nombre), t, 16000);
  return nombre;
});
// Todos de una vez, para cargar el modelo una sola vez. Deja `tNNN.wav.json`.
corre(join(WHISPER, "whisper-cli.exe"), ["-m", join(WHISPER, modelo), "-l", idioma, "-ml", "1", "-sow", "-oj", "-np", ...nombres], tmp);

const DIEZ = { es: "diez", en: "ten" };
/** Una palabra, como se compara: sin mayúsculas, sin tildes y sin signos. */
const llana = (t) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");
/** Todo lo oído, palabra a palabra: en qué tramo está y a qué altura de él. */
const oido = nombres.flatMap((nombre, tramo) =>
  JSON.parse(readFileSync(join(tmp, `${nombre}.json`), "utf8"))
    .transcription.map((p) => ({
      texto: p.text.trim(),
      w: llana(p.text) === "10" ? DIEZ[idioma] : llana(p.text),
      tramo,
      // Dentro de un tramo no hay silencios largos, y ahí el reloj de whisper
      // sí vale para saber por dónde va, sin salirse nunca del tramo.
      de: Math.min(hablado[tramo].a, Math.max(hablado[tramo].de, hablado[tramo].de + p.offsets.from / 1000 - COLCHON)),
    }))
    // Fuera lo que whisper pone cuando no oye a nadie: «[MÚSICA]», «(risas)».
    .filter((p) => p.w && !/^[[(]/.test(p.texto)),
);

/* ---- 4. Encontrar cada frase del guion ---------------------------------- */

/** Cuántas letras hay que cambiar para ir de una palabra a otra. */
function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let antes = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const ahora = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, antes + (a[i - 1] === b[j - 1] ? 0 : 1));
      antes = ahora;
    }
  }
  return fila[b.length];
}
/** Whisper oye «adeor» donde pone «adeorq»: una letra de más o de menos vale. */
const igual = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && distancia(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1));

/** Cuánto se parecen una frase del guion y un trozo de lo oído, de 0 a 1. Se
    mira de dos maneras y vale la mejor: palabra a palabra (la subsecuencia
    común más larga, contra el largo de las dos) y letra a letra con todo
    pegado, que es la que aguanta que whisper parta una palabra en dos («te
    clea», «Adior Q») o junte dos («una gente» por «un agente»). */
function parecido(guion, dicho) {
  const t = Array.from({ length: guion.length + 1 }, () => new Array(dicho.length + 1).fill(0));
  for (let i = 1; i <= guion.length; i++)
    for (let j = 1; j <= dicho.length; j++) t[i][j] = igual(guion[i - 1], dicho[j - 1]) ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  const palabras = (2 * t[guion.length][dicho.length]) / (guion.length + dicho.length);
  const a = guion.join("");
  const b = dicho.join("");
  const largo = Math.max(a.length, b.length);
  // Si ya de largo no se parecen, no hace falta contar letras.
  const letras = Math.abs(a.length - b.length) > largo * 0.4 ? 0 : 1 - distancia(a, b) / largo;
  return Math.max(palabras, letras);
}

const frases = ESCENAS.flatMap((e) => e.voz.map((f) => ({ id: e.id, texto: f[idioma], w: f[idioma].split(/\s+/).map(llana).filter(Boolean) })));

/** Todos los sitios de la grabación donde puede estar una frase. */
function candidatos(f) {
  const n = f.w.length;
  const minimo = n <= 4 ? 0.74 : 0.6;
  const todos = [];
  for (let s = 0; s < oido.length; s++) {
    for (let largo = Math.max(1, Math.ceil(n * 0.6)); largo <= Math.min(oido.length - s, Math.ceil(n * 1.5) + 1); largo++) {
      const nota = parecido(f.w, oido.slice(s, s + largo).map((p) => p.w));
      if (nota >= minimo) todos.push({ s, fin: s + largo, nota });
    }
  }
  // De las que se pisan, la mejor.
  const buenos = [];
  for (const c of todos.sort((x, y) => y.nota - x.nota)) if (!buenos.some((b) => c.s < b.fin && b.s < c.fin)) buenos.push(c);
  return buenos;
}

// De atrás adelante: de cada frase, la última vez que se dijo antes de que
// empiece la siguiente. Así una frase repetida se queda con su última toma.
let limite = oido.length;
for (let i = frases.length - 1; i >= 0; i--) {
  const sitio = candidatos(frases[i]).filter((c) => c.fin <= limite).sort((x, y) => y.s - x.s)[0];
  if (sitio) {
    frases[i].sitio = sitio;
    limite = sitio.s;
  }
}

// Lo que no se encontró por parecido se busca por sitio: si la frase de antes
// y la de después sí están, y entre las dos quedan palabras sueltas, más o
// menos tantas como tiene la frase, son ella mal oída. Pasa con los nombres
// inventados: «Adeorq es gratis» llega como «Adiós, cués gratis». Sale con
// «?», para leerla.
frases.forEach((f, i) => {
  if (f.sitio) return;
  const antes = i === 0 ? { fin: 0 } : frases[i - 1].sitio;
  const despues = i === frases.length - 1 ? { s: oido.length } : frases[i + 1].sitio;
  if (!antes || !despues) return;
  const sueltas = despues.s - antes.fin;
  if (sueltas >= Math.ceil(f.w.length / 2) && sueltas <= f.w.length * 2 + 1) f.sitio = { s: antes.fin, fin: despues.s, nota: 0 };
});

/* ---- 5. Por dónde se corta ---------------------------------------------- */

/** Lleva un instante al silencio que tenga justo antes (70 ms callados,
    buscando hasta 0,4 s atrás). Si no lo hay, se queda donde estaba. */
function alSilencio(t) {
  const desde = Math.round(t * 100) + 5;
  for (let i = desde; i > desde - 45; i--) {
    let quieto = true;
    for (let k = 0; k < 7; k++) if (!calla(i - k)) quieto = false;
    if (quieto) return Math.max(0, (i - 3) / 100);
  }
  return t;
}

/** Las palabras que son de alguna frase elegida. Las demás son sueltas: lo
    que whisper oyó mal, o una toma tirada. */
const cogidas = new Set(frases.flatMap((f) => (f.sitio ? Array.from({ length: f.sitio.fin - f.sitio.s }, (_, i) => f.sitio.s + i) : [])));
/** Hasta cuántas palabras sueltas pegadas a una frase se dan por suyas. */
const SUELTAS = 3;

/** Dónde empieza de verdad lo que empieza en la palabra `s`: si es lo primero
    de su tramo hablado (o le preceden un par de palabras mal oídas), donde
    empieza el tramo; si no, en el silencio de justo antes. */
function principio(s) {
  let i = s;
  while (i > 0 && oido[i - 1].tramo === oido[s].tramo && !cogidas.has(i - 1)) i--;
  const abre = i === 0 || oido[i - 1].tramo !== oido[s].tramo;
  return abre && s - i <= SUELTAS ? { t: hablado[oido[s].tramo].de, palabra: i } : { t: alSilencio(oido[s].de), palabra: s };
}
/** Y dónde acaba lo que acaba en la palabra `e`: lo mismo, hacia delante. */
function final(e) {
  let i = e;
  while (i < oido.length - 1 && oido[i + 1].tramo === oido[e].tramo && !cogidas.has(i + 1)) i++;
  const cierra = i === oido.length - 1 || oido[i + 1].tramo !== oido[e].tramo;
  return cierra && i - e <= SUELTAS ? { t: hablado[oido[e].tramo].a, palabra: i } : { t: alSilencio(oido[e + 1].de), palabra: e };
}

const AIRE = { antes: 0.04, despues: 0.1, entreTomas: 0.32, fundido: 0.012 };

/** Un trozo de la grabación, con las puntas fundidas para que no chasquee. */
function trozo(de, a) {
  const t = pcm.slice(Math.max(0, Math.round(de * HZ)), Math.min(pcm.length, Math.round(a * HZ)));
  const f = Math.min(Math.round(AIRE.fundido * HZ), t.length >> 1);
  for (let i = 0; i < f; i++) {
    t[i] *= i / f;
    t[t.length - 1 - i] *= i / f;
  }
  return t;
}

/* ---- 6. Un archivo por escena ------------------------------------------- */

const destino = join(salida, idioma);
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

const indice = {};
const faltan = [];
console.log(`\n${entrada}\n${oido.length} palabras oídas (${modelo}) en ${hablado.length} tramos; ${m.input_i} LUFS al llegar, -16 al salir.\n`);

for (const e of ESCENAS) {
  const suyas = frases.filter((f) => f.id === e.id);
  if (suyas.length === 0) continue;
  if (suyas.some((f) => !f.sitio)) {
    faltan.push(e.id);
    console.log(`  ✗ ${e.id.padEnd(13)} NO ENCONTRADA: ${suyas.filter((f) => !f.sitio).map((f) => `«${f.texto}»`).join(" ")}`);
    continue;
  }
  // Las frases que están seguidas en la grabación se cortan juntas, con su
  // pausa de verdad. Si entre dos hay una toma tirada (más de tres palabras
  // sueltas, o unas pocas dichas aparte, en su propio tramo), se salta.
  const tandas = [];
  for (const f of suyas) {
    const anterior = tandas.at(-1)?.at(-1);
    const entre = anterior ? oido.slice(anterior.sitio.fin, f.sitio.s) : [];
    const aparte = entre.length > 0 && entre.every((p) => p.tramo !== oido[anterior.sitio.fin - 1].tramo && p.tramo !== oido[f.sitio.s].tramo);
    if (anterior && entre.length <= SUELTAS && !aparte) tandas.at(-1).push(f);
    else tandas.push([f]);
  }
  const partes = [];
  const empiezan = [];
  const dicho = [];
  let largo = 0;
  tandas.forEach((tanda, n) => {
    const ini = principio(tanda[0].sitio.s);
    const fin = final(tanda.at(-1).sitio.fin - 1);
    const de = Math.max(0, ini.t - AIRE.antes);
    if (n > 0) {
      partes.push(new Float32Array(Math.round(AIRE.entreTomas * HZ)));
      largo += AIRE.entreTomas;
    }
    for (const f of tanda) empiezan.push(f === tanda[0] ? largo : largo + Math.max(0, oido[f.sitio.s].de - de));
    partes.push(trozo(de, fin.t + AIRE.despues));
    largo += partes.at(-1).length / HZ;
    dicho.push(oido.slice(ini.palabra, fin.palabra + 1).map((p) => p.texto).join(" "));
  });
  const todo = new Float32Array(partes.reduce((s, p) => s + p.length, 0));
  let en = 0;
  for (const p of partes) {
    todo.set(p, en);
    en += p.length;
  }
  wav(join(destino, `${e.id}.wav`), todo, HZ);
  indice[e.id] = { dura: Math.round((todo.length / HZ) * 1000) / 1000, frases: empiezan.map((s) => Math.round(s * 1000) / 1000) };
  const nota = Math.min(...suyas.map((f) => f.sitio.nota));
  console.log(`  ${nota < 0.8 ? "?" : "✓"} ${e.id.padEnd(13)} ${indice[e.id].dura.toFixed(1).padStart(5)} s${tandas.length > 1 ? `  (${tandas.length} tomas)` : ""}  ${dicho.join("  //  ")}`);
}

writeFileSync(join(destino, "voz.json"), `${JSON.stringify(indice, null, 2)}\n`, "utf8");

const total = Object.values(indice).reduce((s, v) => s + v.dura, 0);
console.log(`\n${Object.keys(indice).length} escenas con voz, ${total.toFixed(1)} s en total -> ${destino}`);
console.log("Cada línea es lo que se OYE en ese trozo. Las de «?» se parecen poco a su frase y «//» es un corte entre dos tomas: léelas antes de darlas por buenas.");
if (faltan.length) {
  console.log(`FALTAN ${faltan.length}: ${faltan.join(", ")}. Esas escenas salen sin voz, con lo que duren en el guion.`);
  process.exitCode = 2;
}
