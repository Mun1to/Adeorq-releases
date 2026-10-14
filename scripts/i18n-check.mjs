// Comprueba que la interfaz habla inglés cuando se le pide inglés.
//
//     pnpm i18n
//
// Existe por un fallo real: Munir tenía Adeorq en inglés y le salían en
// español el menú entero del lienzo, los ajustes de Discord y el panel de la
// derecha. No lo detecta el compilador (son cadenas válidas), no lo detecta
// ningún test (no fallan), y leyendo el código no se ve. Solo se ve mirando la
// pantalla con el idioma cambiado, y eso no se hace en cada cambio.
//
// Mira dos cosas distintas, porque los dos fallos que hubo eran distintos:
//
//  1. FALTA: alguien escribió t("algo") y ese "algo" no está en el diccionario.
//     Se queda en español para siempre y nadie se entera.
//  2. EN DURO: alguien escribió el texto directamente en el JSX, sin t(). No
//     hay nada que traducir, así que el punto 1 ni se entera. Es lo que le
//     pasaba al panel de skills.
//
// Lo segundo es una heurística: se buscan literales con letras que solo
// existen en español (tildes, ñ, ¿, ¡, «»). Un texto inglés sin tildes se
// escapa, y aun así caza la inmensa mayoría.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ESPANOL = /[áéíóúüñ¿¡«»]/i;

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const corto = (s) => (s.length > 64 ? `${s.slice(0, 64)}…` : s);

// Las claves del diccionario inglés: `Algo: "..."` o `"Algo": "..."`.
const dicc = readFileSync(join(SRC, "lib", "i18n.ts"), "utf8");
const claves = new Set(
  [...dicc.matchAll(/^ {2}(?:"((?:[^"\\]|\\.)+)"|([A-Za-zÁÉÍÓÚÑáéíóúñ][\wÁÉÍÓÚÑáéíóúñ]*)) *:/gm)].map(
    (m) => (m[1] ?? m[2]).replace(/\\"/g, '"').replace(/\\n/g, "\n"),
  ),
);

const faltan = new Map();
const enDuro = new Map();

for (const f of archivos(SRC)) {
  if (f.endsWith("i18n.ts")) continue;
  const src = readFileSync(f, "utf8");
  const donde = f.slice(SRC.length + 1).replace(/\\/g, "/");

  // 1. Lo que pide traducción y no la tiene.
  const traducidas = new Set();
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)+)"/g)) {
    const clave = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
    traducidas.add(m[1]);
    if (!claves.has(clave) && !faltan.has(clave)) faltan.set(clave, donde);
  }

  // 2. Lo que se quedó en duro, mirando SOLO lo que se pinta en pantalla.
  //
  //    Buscar cualquier literal en español daba 85 avisos y casi todos eran
  //    correctos: los encargos que Adeorq le escribe a un agente van en
  //    español A PROPÓSITO, y una herramienta que grita en lo que está bien
  //    se acaba ignorando. Así que solo se miran dos sitios: los atributos
  //    que el usuario lee y el texto suelto entre etiquetas.
  const sinComentarios = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const apuntar = (txt) => {
    const clave = `${donde}|${txt}`;
    if (!enDuro.has(clave)) enDuro.set(clave, [donde, txt]);
  };

  // placeholder="…", data-tip="…", title="…". Los ya envueltos van como
  // `={t("…")}` y no casan, que es justo lo que se quiere. Que el texto esté en
  // el diccionario no lo salva: escrito así no pasa por el traductor
  // (`data-tip="sesión abierta ahora"` salía en español con la app en inglés).
  for (const m of sinComentarios.matchAll(/(?:placeholder|data-tip|title|aria-label|alt)=\{?\s*"([^"\n]{4,})"\s*\}?[\s/>]/g)) {
    if (ESPANOL.test(m[1])) apuntar(m[1].trim());
  }
  // Texto suelto entre etiquetas: <p>Arrastra uno sobre…</p>
  for (const m of sinComentarios.matchAll(/>\s*([^<>{}\n]{6,}?)\s*</g)) {
    const txt = m[1].trim();
    if (!ESPANOL.test(txt)) continue;
    if (traducidas.has(txt) || claves.has(txt)) continue;
    apuntar(txt);
  }

  // 3. Lo que el punto 2 no ve, y por donde se coló media barra lateral hasta
  //    el 2026-10-13: el texto que va DENTRO de una expresión. Una pista
  //    montada con una plantilla (`data-tip={`Modelo: ${m}\nSe cambia…`}`), un
  //    `{abierto ? "plegar" : "ver"}`, y la prosa de varios renglones entre
  //    etiquetas. Se quitan las llamadas a t() y se mira lo que queda.
  for (const m of sinComentarios.matchAll(/(?:placeholder|data-tip|title|aria-label|alt)=\{/g)) {
    const expr = sinT(hastaSuLlave(sinComentarios, m.index + m[0].length));
    for (const txt of literalesDe(expr)) if (suenaEspanol(txt)) apuntar(txt.replace(/\s+/g, " ").trim());
  }
  const sinPlantillas = sinComentarios.replace(/`(?:[^`\\]|\\.)*`/g, (p) => p.replace(/[^\n]/g, " "));
  for (const m of sinPlantillas.matchAll(/^[ \t]+([A-Za-zÁÉÍÓÚÑáéíóúñ«¿¡⚠✓…][^={}<>;`"()\n]{12,})$/gm)) {
    const txt = m[1].trim();
    if (ESPANOL.test(txt) && txt.split(/\s+/).length >= 3 && !/^(?:import|export|return|const|let|case|type|interface)\b/.test(txt)) apuntar(txt);
  }
}

/** El trozo de `src` que va desde `i` hasta la llave que cierra la que se abrió
 *  justo antes, sin contar las de dentro de cadenas y plantillas. */
function hastaSuLlave(src, i) {
  let hondo = 1;
  let comilla = null;
  let j = i;
  for (; j < src.length && hondo > 0; j++) {
    const c = src[j];
    if (comilla === '"' || comilla === "'") {
      if (c === "\\") j++;
      else if (c === comilla || c === "\n") comilla = null;
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === "{") hondo++;
    else if (c === "}") hondo--;
  }
  return src.slice(i, j - 1);
}

/** Lo mismo sin las llamadas a t(…), que ya pasan por el traductor. */
function sinT(expr) {
  let fuera = "";
  let i = 0;
  const re = /\bt\(/g;
  let m;
  while ((m = re.exec(expr))) {
    fuera += expr.slice(i, m.index);
    let hondo = 1;
    let comilla = null;
    let j = m.index + m[0].length;
    for (; j < expr.length && hondo > 0; j++) {
      const c = expr[j];
      if (comilla) {
        if (c === "\\") j++;
        else if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'" || c === "`") comilla = c;
      else if (c === "(") hondo++;
      else if (c === ")") hondo--;
    }
    i = j;
    re.lastIndex = j;
  }
  return fuera + expr.slice(i);
}

/** Los textos escritos en una expresión: lo de entre comillas y lo fijo de
 *  cada plantilla (lo de dentro de `${…}` es código, no texto). */
function literalesDe(expr) {
  const fuera = [...expr.matchAll(/"((?:[^"\\\n]|\\.){3,})"|'((?:[^'\\\n]|\\.){3,})'/g)].map((m) => m[1] ?? m[2]);
  const fijo = expr.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, " ").replace(/\$\{[^{}]*\}/g, " ");
  for (const m of fijo.matchAll(/`([^`]{3,})`/g)) fuera.push(m[1].replace(/\\n/g, " "));
  return fuera;
}

/** Con tilde, o con dos palabras de las que solo se escriben en español. */
function suenaEspanol(txt) {
  if (ESPANOL.test(txt)) return true;
  const comunes = txt.match(/(?:^|[\s(])(?:del?|las?|el|los|una?|que|con|sin|para|por|sus?|hace|est[ae]|se|ya|sesiones|ahora|dentro|abre|ver|cada|esfuerzo|puesto|modelo|trabajando)(?=[\s.,:;)]|$)/gi);
  return (comunes?.length ?? 0) >= 2;
}

let mal = 0;

if (faltan.size) {
  mal += faltan.size;
  console.log(`\nSIN TRADUCIR (${faltan.size}): pasan por t() y no están en el diccionario`);
  for (const [k, donde] of [...faltan].sort()) {
    console.log(`  ${donde.padEnd(28)} ${corto(k)}`);
  }
}

if (enDuro.size) {
  mal += enDuro.size;
  console.log(`\nEN DURO (${enDuro.size}): texto en español que nunca pasa por el traductor`);
  for (const [donde, txt] of [...enDuro.values()].sort()) {
    console.log(`  ${donde.padEnd(28)} ${corto(txt)}`);
  }
}

if (!mal) {
  console.log(`Idioma: ${claves.size} textos traducidos y ninguno suelto.`);
}
process.exit(mal ? 1 : 0);
