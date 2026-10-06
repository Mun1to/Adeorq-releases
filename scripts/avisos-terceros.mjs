// Regenera THIRD-PARTY-NOTICES.md con lo que de verdad lleva el binario.  `pnpm terceros`
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Adeorq se distribuye como binario y se puede vender. MIT, Apache-2.0, ISC y
// BSD piden que el aviso de copyright de cada componente viaje con el
// programa, así que `THIRD-PARTY-NOTICES.md` es parte del producto. Hasta
// ahora se regeneraba con un script que vivía en el scratchpad de una sesión
// (regla W: a la tercera vez a mano, se automatiza y se deja en `scripts/`).
//
// ── QUÉ HACE ────────────────────────────────────────────────────────────────
//
//   1. Lee las dependencias de PRODUCCIÓN de npm con
//      `pnpm licenses list --prod --json` (una fila por nombre y versión).
//   2. Lee las crates con `cargo metadata` y se queda con las que llegan al
//      binario: recorre `resolve.nodes` desde el paquete raíz `adeorq`
//      siguiendo solo las aristas normales. Las de `build` (tauri-build, cc,
//      cmake…) y las de `dev` se quedan fuera porque no se distribuyen.
//      Sí entran las de TODAS las plataformas (Adeorq sale para Windows y
//      Linux) y los proc-macros (son dependencias normales para cargo).
//   3. Para cada componente busca su fichero de licencia (LICENSE*, LICENCE*,
//      COPYING*) en su carpeta y saca la PRIMERA línea que empieza por
//      «Copyright», saltándose las plantillas («[yyyy] [name of copyright
//      owner]», «<year> <copyright holders>») y el apéndice de Apache-2.0,
//      que es la única parte de su articulado que empieza así.
//   4. Escribe el markdown con el mismo formato que había: cabecera con los
//      números al día, tabla de la interfaz y tabla del núcleo.
//   5. Si alguna licencia es copyleft fuerte (GPL, AGPL, LGPL, SSPL, EUPL,
//      CC-BY-NC) sin alternativa permisiva en su expresión SPDX, lo dice en
//      ROJO y sale con código 1. MPL-2.0 solo se avisa en amarillo.
//
// ── CÓMO SE LANZA ───────────────────────────────────────────────────────────
//
//   pnpm terceros             escribe THIRD-PARTY-NOTICES.md
//   pnpm terceros --simular   enseña el resumen y las diferencias, no escribe
//
// Lo mismo a mano: `node scripts/avisos-terceros.mjs [--simular]`, desde
// cualquier carpeta (las rutas se resuelven desde el propio script).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "THIRD-PARTY-NOTICES.md");
const MANIFIESTO = path.join(RAIZ, "src-tauri", "Cargo.toml");
const PAQUETE_RAIZ = "adeorq";
const SIMULAR = process.argv.includes("--simular");

const ROJO = "\x1b[31m";
const AMARILLO = "\x1b[33m";
const VERDE = "\x1b[32m";
const FIN = "\x1b[0m";

// Copyleft que arrastraría el código de Adeorq entero si entrara en el binario.
const PROHIBIDAS = /^(AGPL|GPL|LGPL|SSPL|EUPL|CC-BY-NC)\b/i;
const AVISADAS = /^MPL-2\.0\b/i;

// ── Fuentes ─────────────────────────────────────────────────────────────────

function ejecutar(programa, args, descripcion) {
  // pnpm es `pnpm.cmd` en Windows y Node se niega a lanzar un .cmd sin shell;
  // en vez de `shell: true` (que concatena sin citar y Node lo desaconseja)
  // se le pide a cmd.exe que lo abra. Los argumentos son fijos y sin espacios.
  if (programa === "pnpm" && process.platform === "win32") {
    args = ["/c", "pnpm", ...args];
    programa = "cmd.exe";
  }
  try {
    return execFileSync(programa, args, {
      cwd: RAIZ,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (e) {
    console.error(`${ROJO}No pude ${descripcion}: ${programa} ${args.join(" ")}${FIN}`);
    console.error(String(e.message || e));
    process.exit(1);
  }
}

/** Dependencias de producción de npm: una fila por nombre y versión. */
function leerNpm() {
  const crudo = ejecutar("pnpm", ["licenses", "list", "--prod", "--json"], "listar las licencias de npm");
  let porLicencia;
  try {
    porLicencia = JSON.parse(crudo);
  } catch (e) {
    console.error(`${ROJO}pnpm licenses no devolvió JSON: ${e.message}${FIN}`);
    console.error(crudo.slice(0, 500));
    process.exit(1);
  }
  const filas = [];
  for (const lista of Object.values(porLicencia)) {
    for (const p of lista) {
      p.versions.forEach((version, i) => {
        filas.push({
          nombre: p.name,
          version,
          licencia: p.license || "—",
          copyright: copyrightDe(p.paths[i] ?? p.paths[0]),
        });
      });
    }
  }
  return filas;
}

/** Crates que llegan al binario: el cierre de las aristas normales desde la raíz. */
function leerCrates() {
  const crudo = ejecutar(
    "cargo",
    ["metadata", "--format-version", "1", "--manifest-path", MANIFIESTO],
    "leer cargo metadata",
  );
  const meta = JSON.parse(crudo);
  const paquetes = new Map(meta.packages.map((p) => [p.id, p]));
  const nodos = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const raiz =
    meta.resolve.root ??
    meta.workspace_members.find((id) => paquetes.get(id)?.name === PAQUETE_RAIZ);
  if (!raiz || !nodos.has(raiz)) {
    console.error(`${ROJO}No encuentro el paquete raíz «${PAQUETE_RAIZ}» en cargo metadata${FIN}`);
    process.exit(1);
  }

  const vistos = new Set([raiz]);
  const cola = [raiz];
  while (cola.length) {
    const nodo = nodos.get(cola.shift());
    for (const dep of nodo.deps) {
      // `kind: null` es la dependencia normal; "build" y "dev" no se distribuyen.
      if (!dep.dep_kinds.some((k) => k.kind === null)) continue;
      if (vistos.has(dep.pkg)) continue;
      vistos.add(dep.pkg);
      cola.push(dep.pkg);
    }
  }
  vistos.delete(raiz);

  return [...vistos].map((id) => {
    const p = paquetes.get(id);
    const carpeta = path.dirname(p.manifest_path);
    const licencia = p.license ?? (p.license_file ? `ver ${path.basename(p.license_file)}` : "—");
    return { nombre: p.name, version: p.version, licencia, copyright: copyrightDe(carpeta) };
  });
}

// ── El titular de copyright, sacado del fichero de licencia ─────────────────

const NOMBRE_LICENCIA = /^(licen[cs]e|copying)/i;
const PLANTILLA = /\[yyyy\]|\[name of copyright owner\]|<year>|<copyright holders?>|<owner>|<name of author>/i;

/** La primera línea que empieza por «Copyright» en el primer fichero de licencia que tenga una. */
function copyrightDe(carpeta) {
  let nombres;
  try {
    nombres = fs.readdirSync(carpeta).filter((n) => NOMBRE_LICENCIA.test(n)).sort();
  } catch {
    return "—";
  }
  for (const nombre of nombres) {
    let texto;
    try {
      texto = fs.readFileSync(path.join(carpeta, nombre), "utf8");
    } catch {
      continue;
    }
    const lineas = lineasDeCopyright(texto);
    if (lineas.length) return lineas.join("; ");
  }
  return "—";
}

/**
 * Las líneas de titular de un fichero de licencia, ya limpias. Se devuelven
 * TODAS las distintas, no solo la primera: medido el 2026-10-06, 88 ficheros
 * de licencia de esta máquina nombran a más de un titular (uqr es Nayuki y
 * Anthony Fu; aws-lc-sys llega a doce), y un aviso que se come a un titular
 * no cumple lo que la licencia pide.
 */
function lineasDeCopyright(texto) {
  const lineas = [];
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    // Lo que sigue al apéndice de Apache es la plantilla para quien use la licencia.
    if (/^APPENDIX\b/i.test(linea)) break;
    // Con mayúscula y sin `i`: el articulado de Apache tiene renglones que
    // empiezan por «copyright license to reproduce…» y eso no es un titular.
    if (!/^Copyright\b/.test(linea)) continue;
    if (PLANTILLA.test(linea)) continue;
    // «Copyright and related rights…» (CC0) o «Copyright law…» hablan de la ley, no de un titular.
    if (/^Copyright (and|law|notice|holder|owner|in)\b/i.test(linea)) continue;
    const limpia = linea
      .replace(/\((c|C)\)|©/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*[.;,]+$/, "")
      .replace(/\|/g, "\\|")
      .trim();
    if (!lineas.includes(limpia)) lineas.push(limpia);
  }
  return lineas;
}

// ── Licencias: qué se puede elegir dentro de una expresión SPDX ─────────────

/**
 * ¿Hay alguna forma de cumplir la expresión sin tocar ninguna licencia que
 * case con `mala`? Un «MIT OR LGPL» sí (eliges MIT); un «MIT AND LGPL» no.
 * Gramática: OR < AND < WITH, con paréntesis. También admite el «/» viejo de
 * crates.io («MIT/Apache-2.0»), que significa OR.
 */
function elegible(expresion, mala) {
  const fichas = expresion.match(/\(|\)|[^\s()/]+|\//g) ?? [];
  let i = 0;
  const ver = () => fichas[i];
  const tomar = () => fichas[i++];
  const esOr = (f) => f === "/" || /^OR$/i.test(f);

  function primaria() {
    if (ver() === "(") {
      tomar();
      const v = o();
      if (ver() === ")") tomar();
      return v;
    }
    const nombre = tomar() ?? "";
    if (/^WITH$/i.test(ver() ?? "")) {
      tomar();
      tomar();
    }
    return !mala.test(nombre);
  }
  function y() {
    let v = primaria();
    while (/^AND$/i.test(ver() ?? "")) {
      tomar();
      v = primaria() && v;
    }
    return v;
  }
  function o() {
    let v = y();
    while (esOr(ver() ?? "")) {
      tomar();
      v = y() || v;
    }
    return v;
  }
  return o();
}

// ── El fichero: el mismo formato de siempre, solo cambian los números ───────

function tabla(filas) {
  const orden = (a, b) =>
    a.nombre.localeCompare(b.nombre, "en") ||
    a.version.localeCompare(b.version, "en", { numeric: true });
  return [
    "| Componente | Versión | Licencia | Copyright |",
    "| --- | --- | --- | --- |",
    ...filas.sort(orden).map((f) => `| ${f.nombre} | ${f.version} | ${f.licencia} | ${f.copyright} |`),
  ].join("\n");
}

/** Un párrafo a 80 columnas, como el resto de la prosa del fichero. */
function envolver(texto, ancho = 80) {
  const lineas = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/)) {
    if (linea && linea.length + 1 + palabra.length > ancho) {
      lineas.push(linea);
      linea = palabra;
    } else {
      linea = linea ? `${linea} ${palabra}` : palabra;
    }
  }
  if (linea) lineas.push(linea);
  return lineas.join("\n");
}

function fraseMpl(conMpl) {
  if (!conMpl.length) return "No hay ninguna con MPL-2.0.";
  const n = conMpl.length === 1 ? "una" : String(conMpl.length);
  const nombres = [...new Set(conMpl.map((f) => f.nombre))].sort().join(", ");
  return (
    `Hay ${n} con MPL-2.0 (${nombres}): la MPL solo obliga a publicar los cambios ` +
    "de SUS propios archivos, y Adeorq no modifica ninguno."
  );
}

function markdown(npm, crates, conMpl) {
  const total = npm.length + crates.length;
  const conTitular = [...npm, ...crates].filter((f) => f.copyright !== "—").length;
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return `# Avisos de terceros

Adeorq se apoya en software libre de otras personas. Este documento existe
porque licencias como MIT, Apache-2.0, ISC y BSD piden que su aviso de copyright
viaje con el programa cuando se distribuye, y Adeorq se distribuye como binario.

Cada componente sigue siendo de quien lo escribió y se usa bajo su propia
licencia, que es la que manda sobre ese componente. Nada de lo que hay aquí es
de Adeorq ni cambia por estar en esta lista.

${envolver(
  `Resumen: **${npm.length}** componentes de la interfaz y **${crates.length}** del núcleo en Rust. ` +
    `No hay ninguna dependencia con licencia GPL o AGPL. ${fraseMpl(conMpl)}`,
)}

${envolver(
  "El texto íntegro de cada licencia viaja dentro del paquete de la dependencia " +
    `correspondiente y puede consultarse en su repositorio de origen. De ${total} ` +
    `componentes, ${conTitular} declaran un titular de copyright explícito, recogido abajo.`,
)}

## Interfaz (npm, dependencias de producción)

${tabla(npm)}

## Núcleo (Rust, crates)

${tabla(crates)}

---

Generado el ${fecha} con \`pnpm terceros\` a partir de \`pnpm licenses list --prod\`
y \`cargo metadata\`. Si eres autor de alguno de estos componentes y ves algo mal
atribuido, escribe y se corrige.
`;
}

// ── Diferencias con el fichero que ya hay ───────────────────────────────────

/** Lee las tablas del fichero actual: por sección, nombre → {versiones, licencias}. */
function leerActual() {
  if (!fs.existsSync(SALIDA)) return null;
  const secciones = { npm: new Map(), crates: new Map() };
  let actual = null;
  for (const linea of fs.readFileSync(SALIDA, "utf8").split(/\r?\n/)) {
    if (linea.startsWith("## Interfaz")) actual = secciones.npm;
    else if (linea.startsWith("## Núcleo")) actual = secciones.crates;
    else if (actual && linea.startsWith("| ") && !linea.startsWith("| Componente") && !linea.startsWith("| ---")) {
      const [nombre, version, licencia] = linea.slice(2, -2).split(" | ");
      const fila = actual.get(nombre) ?? { versiones: new Set(), licencias: new Set() };
      fila.versiones.add(version);
      fila.licencias.add(licencia);
      actual.set(nombre, fila);
    }
  }
  return secciones;
}

function diferencias(etiqueta, nuevas, viejas) {
  const porNombre = new Map();
  for (const f of nuevas) {
    const fila = porNombre.get(f.nombre) ?? { versiones: new Set(), licencias: new Set() };
    fila.versiones.add(f.version);
    fila.licencias.add(f.licencia);
    porNombre.set(f.nombre, fila);
  }
  const igual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const nuevos = [...porNombre.keys()].filter((n) => !viejas.has(n)).sort();
  const quitados = [...viejas.keys()].filter((n) => !porNombre.has(n)).sort();
  const cambiadas = [...porNombre]
    .filter(([n, f]) => viejas.has(n) && !igual(f.licencias, viejas.get(n).licencias))
    .map(([n, f]) => `${n}: ${[...viejas.get(n).licencias].join(" / ")} → ${[...f.licencias].join(" / ")}`);
  const versiones = [...porNombre].filter(
    ([n, f]) => viejas.has(n) && !igual(f.versiones, viejas.get(n).versiones),
  ).length;

  console.log(`\n${etiqueta}: ${nuevos.length} nuevos, ${quitados.length} quitados, ${cambiadas.length} con otra licencia, ${versiones} solo cambian de versión`);
  for (const n of nuevos) console.log(`  + ${n}`);
  for (const n of quitados) console.log(`  - ${n}`);
  for (const c of cambiadas) console.log(`  ~ ${c}`);
}

// ── Vamos ───────────────────────────────────────────────────────────────────

const npm = leerNpm();
const crates = leerCrates();
const todas = [
  ...npm.map((f) => ({ ...f, donde: "npm" })),
  ...crates.map((f) => ({ ...f, donde: "crate" })),
];

const prohibidas = todas.filter((f) => !elegible(f.licencia, PROHIBIDAS));
const conMpl = todas.filter((f) => /\bMPL-2\.0\b/i.test(f.licencia));
const mplSinSalida = conMpl.filter((f) => !elegible(f.licencia, AVISADAS));
const mplConSalida = conMpl.filter((f) => elegible(f.licencia, AVISADAS));

const conTitular = todas.filter((f) => f.copyright !== "—").length;
console.log(`Interfaz (npm, producción): ${npm.length} componentes`);
console.log(`Núcleo (Rust, crates que llegan al binario): ${crates.length} componentes`);
console.log(`Con titular de copyright: ${conTitular} de ${todas.length}`);

if (mplSinSalida.length) {
  console.log(`${AMARILLO}MPL-2.0 sin otra opción (${mplSinSalida.length}): ${mplSinSalida.map((f) => `${f.nombre} ${f.version}`).join(", ")}${FIN}`);
  console.log(`${AMARILLO}  Solo obliga a publicar cambios en SUS ficheros; Adeorq no los modifica.${FIN}`);
}
if (mplConSalida.length) {
  console.log(`${AMARILLO}MPL-2.0 con alternativa permisiva (${mplConSalida.length}): ${mplConSalida.map((f) => `${f.nombre} (${f.licencia})`).join(", ")}${FIN}`);
}

const actual = leerActual();
if (actual) {
  diferencias("Interfaz", npm, actual.npm);
  diferencias("Núcleo", crates, actual.crates);
} else {
  console.log(`\nNo hay ${path.basename(SALIDA)} con el que comparar.`);
}

if (prohibidas.length) {
  console.log(`\n${ROJO}LICENCIA PROHIBIDA en ${prohibidas.length} componente(s): esto NO puede ir en un binario que se vende.${FIN}`);
  for (const f of prohibidas) console.log(`${ROJO}  ${f.donde}  ${f.nombre} ${f.version}  ${f.licencia}${FIN}`);
  console.log(`${ROJO}No se escribe ${path.basename(SALIDA)}. Sustituye la dependencia o pregunta a Munir.${FIN}`);
  process.exit(1);
}

if (SIMULAR) {
  console.log(`\nSimulación: no se escribe ${path.basename(SALIDA)}.`);
} else {
  fs.writeFileSync(SALIDA, markdown(npm, crates, mplSinSalida), "utf8");
  console.log(`\n${VERDE}Escrito ${SALIDA}${FIN}`);
}
