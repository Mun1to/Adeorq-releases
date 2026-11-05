// Que las páginas públicas de privacidad (adeorq.com/privacidad y adeorq.com/en/privacy)
// salgan completas, iguales en los dos idiomas y sin una sola marca interna.
//   `node scripts/privacidad-web-check.mjs`   ·   va dentro de `pnpm comprobar`
//
// El texto sale de web/legal/ (dos fragmentos con la misma estructura) y lo juntan
// web/scripts/hacer-privacidad.mjs y web/legal/datos.mjs. Esto se pone rojo si:
//   · queda en lo publicado un `[[FALTA`, un `[S7]`, una nota de abogado, una ruta del
//     repositorio, el nombre del panel personal o una raya larga;
//   · un idioma tiene un apartado, una lista o un enlace que el otro no tiene;
//   · el correo sale sin la marca que impide a Cloudflare convertirlo en
//     «[email protected]», o la fecha no es una fecha;
//   · el enlace «Privacidad» falta del pie de la portada, de la inglesa o de la guía,
//     o las páginas no están en el sitemap, en los metadatos o en la lista de entradas;
//   · un build de verdad no las trae, las trae con comentarios de taller, o publica
//     los fragmentos de `web/legal/`.
// Un texto de privacidad con una marca de borrador es peor que no tener ninguno.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(RAIZ, "web");

const { ACTUALIZADA, CORREO, IDIOMAS, largaEn, largaEs } = await import(pathToFileURL(path.join(WEB, "legal", "datos.mjs")).href);
const { cuerpoDe, escribirTodas, POLITICA_DE_CONTENIDO, renderizar } = await import(pathToFileURL(path.join(WEB, "scripts", "hacer-privacidad.mjs")).href);

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ": " + detalle : ""}`);
};
const leer = (...trozos) => fs.readFileSync(path.join(...trozos), "utf8");
const cuenta = (texto, re) => (texto.match(re) || []).length;

// ── Lo que no puede quedar en nada de lo publicado ───────────────────────────
// Se mira el texto y los atributos por igual: una ruta en un `title` sale igual de mal.
export const PROHIBIDO = [
  [/\[\[FALTA/i, "un [[FALTA"],
  [/\[S\d+(?:\s*,\s*S\d+)*\]/, "una marca de la tabla interna [S…]"],
  [/ABOGADO|LAWYER/, "una nota para el abogado"],
  [/BUZON|AGENTS\.md|CLAUDE\.md|docs\/contexto|src-tauri|\bsrc\/|\bsrc\\/, "una ruta o un documento del repositorio"],
  [/\bscripts\/|\.mjs\b|\.tsx?\b|\.rs\b/, "el nombre de un archivo de código"],
  [/privacidad-borrador|lista-de-envio|notas-del-probador|cuentas-legal/, "el nombre de un documento interno"],
  [/munito\.dev|ijraewpmsgwmxmfgwwae|supabase/i, "el nombre del panel personal o de su servicio"],
  [/[A-Z]:\\(?:proyectos|Users|ct)\b|\/Users\//, "una ruta de esta máquina"],
  [/\bE\d{2}\b/, "el número de un encargo"],
  [/[—–]/, "una raya larga o corta"],
  [/\{\{|\}\}/, "un hueco sin rellenar"],
];

/** El HTML sin las imágenes incrustadas (su base64 casa con casi cualquier patrón). */
const sinImagenes = (html) => html.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, "data:");

function marcasInternas(html) {
  const limpio = sinImagenes(html);
  return PROHIBIDO.filter(([re]) => re.test(limpio)).map(([, que]) => que);
}

// ── Los dos textos, en crudo ─────────────────────────────────────────────────
const cuerpo = { es: cuerpoDe("es"), en: cuerpoDe("en") };
const pagina = { es: renderizar("es"), en: renderizar("en") };

for (const lang of ["es", "en"]) {
  const fragmento = leer(WEB, "legal", IDIOMAS[lang].fragmento);
  const sin = marcasInternas(fragmento.replaceAll("{{fecha}}", "").replaceAll("{{correo}}", ""));
  ok(`${IDIOMAS[lang].fragmento}: sin marcas internas`, sin.length === 0, sin.join(", "));
  const sinRendido = marcasInternas(cuerpo[lang]);
  ok(`${lang}: el texto rendido, sin marcas internas`, sinRendido.length === 0, sinRendido.join(", "));
}

// ── La fecha ─────────────────────────────────────────────────────────────────
{
  const hoy = new Date().toISOString().slice(0, 10);
  ok("la fecha es una fecha ISO", /^\d{4}-\d{2}-\d{2}$/.test(ACTUALIZADA), ACTUALIZADA);
  ok("la fecha no es del futuro", ACTUALIZADA <= hoy, `${ACTUALIZADA} <= ${hoy}`);
  ok("la fecha no es anterior a la que consultó Get-Date el día que se montó (2026-11-05)", ACTUALIZADA >= "2026-11-05");
  ok("la fecha larga, en español", largaEs("2026-11-05") === "5 de noviembre de 2026" && largaEs("2027-01-31") === "31 de enero de 2027");
  ok("la fecha larga, en inglés", largaEn("2026-11-05") === "5 November 2026" && largaEn("2027-01-31") === "31 January 2027");
  ok("la página en español dice su fecha", cuerpo.es.includes(`Última actualización: ${largaEs(ACTUALIZADA)}.`));
  ok("la página en inglés dice su fecha", cuerpo.en.includes(`Last updated: ${largaEn(ACTUALIZADA)}.`));
  let revienta = false;
  try {
    largaEs("5/11/2026");
  } catch {
    revienta = true;
  }
  ok("una fecha mal escrita no se imprime", revienta);
}

// ── El correo: entero, y con la marca para Cloudflare ───────────────────────
for (const lang of ["es", "en"]) {
  const html = pagina[lang];
  const enlaces = cuenta(html, new RegExp(`<!--email_off--><a href="mailto:${CORREO.replace(".", "\\.")}">${CORREO.replace(".", "\\.")}</a><!--/email_off-->`, "g"));
  const sueltos = cuenta(html, new RegExp(CORREO.replace(".", "\\."), "g"));
  ok(`${lang}: el correo sale al menos en tres sitios (responsable, derechos, contacto)`, enlaces >= 3, String(enlaces));
  ok(`${lang}: ni una dirección fuera de su marca email_off`, sueltos === enlaces * 2, `${sueltos} apariciones, ${enlaces} enlaces`);
}

// ── Lo que el encargo mandó resolver, dicho en los dos idiomas ──────────────
const DEBE = {
  es: [
    ["la edad", /no está dirigida a menores de 14 años/],
    ["los seis derechos", /acceso, rectificación, supresión, oposición, limitación y portabilidad/],
    ["la reclamación ante la AEPD", /Agencia Española de Protección de Datos<\/a> \(aepd\.es\)/],
    ["que casi todo se ejerce en el ordenador", /Adeorq no guarda datos tuyos en ningún servidor propio, así que casi todo se ejerce en tu ordenador/],
    ["el panel del desarrollador, dicho sin su nombre", /acceso opcional a un panel personal del desarrollador[\s\S]*nadie más tiene cuenta[\s\S]*En la versión de la Store no existe/],
    ["Discord apagado en la Store", /En la versión de la Store viene apagado/],
    ["que Adeo es una IA y puede equivocarse", /Es una IA generativa en directo[\s\S]*puede equivocarse/],
    ["lo que no hace nunca", /Lo que Adeorq no hace nunca:<\/strong> telemetría, analíticas, publicidad, venta de datos/],
    ["que no se manda nada propio", /no tiene servidores propios, no te pide una cuenta de Adeorq, no lleva telemetría ni analíticas/i],
    ["cómo se avisa de un cambio", /Si algo de esto cambia, cambia esta página y la fecha de arriba/],
    ["que informar también se puede por correo, y que ninguno lleva la conversación", /«o por correo»<\/strong>[\s\S]*para quien no tiene cuenta de GitHub[\s\S]*Ninguno de los dos lleva tu conversación/],
  ],
  en: [
    ["la edad", /not aimed at children under 14/],
    ["los seis derechos", /access, rectification, erasure, objection, restriction and portability/],
    ["la reclamación ante la AEPD", /Spanish Data Protection Agency<\/a> \(aepd\.es\)/],
    ["que casi todo se ejerce en el ordenador", /Adeorq stores no data of yours on any server of its own, so almost all of it is exercised on your computer/],
    ["el panel del desarrollador, dicho sin su nombre", /optional login to the developer’s personal panel[\s\S]*nobody else has an account[\s\S]*In the Store version it does not exist/],
    ["Discord apagado en la Store", /In the Store version it ships off/],
    ["que Adeo es una IA y puede equivocarse", /live generative AI[\s\S]*it can be wrong/],
    ["lo que no hace nunca", /What Adeorq never does:<\/strong> telemetry, analytics, advertising, selling data/],
    ["que no se manda nada propio", /has no servers of its own, it does not ask you for an Adeorq account, it has no telemetry or analytics/i],
    ["cómo se avisa de un cambio", /If any of this changes, this page and the date above change/],
    ["que informar también se puede por correo, y que ninguno lleva la conversación", /“or by email”<\/strong>[\s\S]*for people without a GitHub account[\s\S]*Neither carries your conversation/],
  ],
};
for (const lang of ["es", "en"]) for (const [que, re] of DEBE[lang]) ok(`${lang}: dice ${que}`, re.test(cuerpo[lang]));

// ── Los dos idiomas, con la misma estructura ────────────────────────────────
{
  const trozos = (html) => html.split(/(?=<h2 )/).slice(1);
  const huella = (html) => ({
    h1: cuenta(html, /<h1>/g),
    h2: cuenta(html, /<h2 /g),
    h3: cuenta(html, /<h3>/g),
    p: cuenta(html, /<p[ >]/g),
    ul: cuenta(html, /<ul>/g),
    ol: cuenta(html, /<ol[ >]/g),
    li: cuenta(html, /<li>/g),
    a: cuenta(html, /<a /g),
    strong: cuenta(html, /<strong>/g),
    code: cuenta(html, /<code>/g),
  });
  const es = trozos(cuerpo.es);
  const en = trozos(cuerpo.en);
  ok("los dos idiomas tienen los mismos apartados", es.length === en.length && es.length >= 11, `${es.length} y ${en.length}`);
  for (const k of Object.keys(huella(""))) {
    const a = huella(cuerpo.es)[k];
    const b = huella(cuerpo.en)[k];
    ok(`los dos idiomas tienen los mismos «${k}»`, a === b, `${a} y ${b}`);
  }
  for (let i = 0; i < Math.min(es.length, en.length); i++) {
    const a = huella(es[i]);
    const b = huella(en[i]);
    const dif = Object.keys(a).filter((k) => a[k] !== b[k]);
    const titulo = (es[i].match(/<h2 id="[^"]*">([^<]*)</) || [])[1];
    ok(`apartado ${i + 1} («${titulo}»): misma estructura`, dif.length === 0, dif.map((k) => `${k} ${a[k]}/${b[k]}`).join(", "));
  }
  const empiezan = (html) => [...html.matchAll(/<ol start="(\d+)">/g)].map((m) => m[1]).join(",");
  ok("las listas numeradas empiezan en el mismo número", empiezan(cuerpo.es) === empiezan(cuerpo.en), `${empiezan(cuerpo.es)} y ${empiezan(cuerpo.en)}`);
  const externos = (html) => [...html.matchAll(/href="((?:https?:)?\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("#"));
  ok("los dos idiomas enlazan a las mismas direcciones", externos(cuerpo.es).join("\n") === externos(cuerpo.en).join("\n"));
  const ids = (html) => [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
  const anclas = (html) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const idsEs = ids(cuerpo.es);
  const idsEn = ids(cuerpo.en);
  const muertas = (html, lista) => anclas(html).filter((a) => !lista.includes(a));
  ok("ninguna ancla del español queda sin apartado", muertas(cuerpo.es, idsEs).length === 0, muertas(cuerpo.es, idsEs).join(","));
  ok("ninguna ancla del inglés queda sin apartado", muertas(cuerpo.en, idsEn).length === 0, muertas(cuerpo.en, idsEn).join(","));
  const posicion = (html, lista) => anclas(html).map((a) => lista.indexOf(a)).join(",");
  ok("cada ancla lleva al mismo apartado en los dos idiomas", posicion(cuerpo.es, idsEs) === posicion(cuerpo.en, idsEn));
  ok("ningún id de apartado se repite", new Set(idsEs).size === idsEs.length && new Set(idsEn).size === idsEn.length);
}

// ── La cabecera de cada página ───────────────────────────────────────────────
for (const lang of ["es", "en"]) {
  const c = IDIOMAS[lang];
  const html = pagina[lang];
  ok(`${lang}: <html lang>`, new RegExp(`<html lang="${lang}">`).test(html));
  ok(`${lang}: título y descripción propios`, html.includes(`<title>${c.titulo}</title>`) && /<meta name="description" content="[^"]{60,}">/.test(html));
  ok(`${lang}: política de contenido sin scripts ni nada de fuera`, html.includes(`content="${POLITICA_DE_CONTENIDO}"`) && !/<script/i.test(html));
  ok(`${lang}: el cambio de idioma lleva a la otra página`, html.includes(`<a class="nav__idioma" href="${c.otra.url}" hreflang="${c.otra.lang}" lang="${c.otra.lang}">${c.otra.texto}</a>`));
  ok(`${lang}: el pie dice que no usa cookies`, html.includes(c.pie.copyright));
  ok(`${lang}: el pie marca la página en la que está`, html.includes(`<a href="${c.url}" aria-current="page">${c.pie.actual}</a>`));
}

// ── El cableado: entradas, sitemap, metadatos, pie ───────────────────────────
{
  const vite = leer(WEB, "vite.config.js");
  ok("vite.config.js: las dos páginas son entradas", /privacidad: resolve\(ROOT, 'privacidad\.html'\)/.test(vite) && /privacy: resolve\(ROOT, 'en\/privacy\.html'\)/.test(vite));
  const nunca = vite.slice(vite.indexOf("const NEVER_COPY"), vite.indexOf("])", vite.indexOf("const NEVER_COPY")));
  ok("vite.config.js: ni los fragmentos ni el HTML en crudo se copian a mano", /'legal'/.test(nunca) && /'privacidad\.html'/.test(nunca));
  ok("vite.config.js: les quita los comentarios de taller", /legalSinComentarios\(\)/.test(vite) && /email_off/.test(vite));

  const meta = leer(WEB, "scripts", "poner-metadatos.mjs");
  ok("poner-metadatos: las dos páginas, con su hreflang", /archivo: 'privacidad\.html'/.test(meta) && /archivo: 'en\/privacy\.html'/.test(meta) && /const PRIVACIDAD = \[/.test(meta));
  const mapa = leer(WEB, "sitemap.xml");
  ok("sitemap.xml: las dos páginas", mapa.includes("<loc>https://adeorq.com/privacidad</loc>") && mapa.includes("<loc>https://adeorq.com/en/privacy</loc>"));
  ok("llms.txt: las dos páginas", /adeorq\.com\/privacidad/.test(leer(WEB, "llms.txt")) && /adeorq\.com\/en\/privacy/.test(leer(WEB, "llms.txt")));

  const paquete = JSON.parse(leer(WEB, "package.json")).scripts;
  const antes = (s) => s.indexOf("hacer-privacidad.mjs") > -1 && s.indexOf("hacer-privacidad.mjs") < (s.indexOf("poner-metadatos.mjs") > -1 ? s.indexOf("poner-metadatos.mjs") : Infinity);
  ok("package.json: build y metadatos generan la privacidad antes de poner los metadatos", antes(paquete.build) && antes(paquete.metadatos));
  ok("package.json: dev también la genera", /hacer-privacidad\.mjs/.test(paquete.dev));

  const ignorado = leer(WEB, ".gitignore");
  ok(".gitignore: lo generado no se versiona", /^\/privacidad\.html$/m.test(ignorado) && /^\/en\/$/m.test(ignorado));
  const versionado = spawnSync("git", ["ls-files", "web/privacidad.html", "web/en/privacy.html", "web/en/index.html"], { cwd: RAIZ, encoding: "utf8" });
  ok("y no hay ninguna de ellas en git", versionado.status === 0 && versionado.stdout.trim() === "", versionado.stdout.trim());

  const portada = leer(WEB, "index.html");
  const en = leer(WEB, "portada", "en.mjs");
  ok("la portada tiene el enlace «Privacidad» en el pie, con su dirección inglesa", /<a href="\/privacidad" data-en="pie\.privacidad" data-en-attr="href:pie\.privacidad\.href">Privacidad<\/a>/.test(portada)
    && /'pie\.privacidad': 'Privacy'/.test(en) && /'pie\.privacidad\.href': '\/en\/privacy'/.test(en));
  const guia = leer(WEB, "guia.html");
  ok("la guía tiene el enlace «Privacidad» en el pie, con su dirección inglesa", /<a href="\/privacidad" data-href-es="\/privacidad" data-href-en="\/en\/privacy" data-i18n="guia\.pie\.politica">Privacidad<\/a>/.test(guia)
    && /'guia\.pie\.politica': 'Privacy'/.test(leer(WEB, "js", "guia-i18n.js")) && /data-href-en/.test(leer(WEB, "js", "boot.js")));
  const parcial = leer(WEB, "sections", "footer.html");
  ok("el parcial viejo del pie ya no dice que no hay página de privacidad", !/no habia paginas detras/.test(parcial));
}

// ── Un build de verdad ───────────────────────────────────────────────────────
{
  const viteBin = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) {
    console.log("     sin web/node_modules: NO PROBADO el build de verdad en esta copia");
  } else {
    // Lo que genera `pnpm build` antes de Vite, todo ignorado por git.
    if (!fs.existsSync(path.join(WEB, "en", "index.html"))) {
      const r = spawnSync(process.execPath, [path.join(WEB, "scripts", "hacer-ingles.mjs")], { cwd: WEB, encoding: "utf8" });
      ok("la portada inglesa se genera", r.status === 0, String(r.stderr || r.stdout).slice(-300));
    }
    escribirTodas();
    const salida = fs.mkdtempSync(path.join(os.tmpdir(), "adeorq-privacidad-build-"));
    const env = { ...process.env };
    for (const v of ["ADEORQ_CUENTAS", "ADEORQ_CUENTAS_BORRADOR", "ADEORQ_SUPABASE_URL", "ADEORQ_SUPABASE_CLAVE"]) delete env[v];
    const r = spawnSync(process.execPath, [viteBin, "build", "--outDir", salida, "--emptyOutDir", "--logLevel", "error"], { cwd: WEB, env, encoding: "utf8" });
    ok("el build termina bien", r.status === 0, r.status === 0 ? "" : String(r.stderr).slice(-400));
    if (r.status === 0) {
      const construida = { es: path.join(salida, "privacidad.html"), en: path.join(salida, "en", "privacy.html") };
      for (const lang of ["es", "en"]) {
        ok(`${lang}: la página está en lo construido`, fs.existsSync(construida[lang]));
        if (!fs.existsSync(construida[lang])) continue;
        const html = fs.readFileSync(construida[lang], "utf8");
        const sin = marcasInternas(html);
        ok(`${lang}: lo construido, sin marcas internas`, sin.length === 0, sin.join(", "));
        const comentarios = [...html.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]).filter((c) => !/^\/?email_off$/.test(c));
        ok(`${lang}: ni un comentario de taller en lo construido`, comentarios.length === 0, comentarios.join(" | ").slice(0, 200));
        ok(`${lang}: el correo sigue envuelto en email_off en lo construido`, cuenta(html, /<!--email_off--><a href="mailto:/g) >= 3 && cuenta(html, /<!--email_off-->/g) === cuenta(html, /<!--\/email_off-->/g));
        const hojas = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
        const faltan = hojas.filter((h) => !fs.existsSync(path.resolve(path.dirname(construida[lang]), h)));
        ok(`${lang}: las hojas de estilo que pide existen`, hojas.length === 3 && faltan.length === 0, faltan.join(", "));
        ok(`${lang}: sin scripts`, !/<script/i.test(html));
        ok(`${lang}: es la página de su idioma`, html.includes(`<html lang="${lang}">`) && html.includes(IDIOMAS[lang].titulo));
      }
      ok("los fragmentos de texto no se publican", !fs.existsSync(path.join(salida, "legal")));
      const portadaEs = fs.readFileSync(path.join(salida, "index.html"), "utf8");
      const portadaEn = fs.readFileSync(path.join(salida, "en", "index.html"), "utf8");
      const guiaCons = fs.readFileSync(path.join(salida, "guia.html"), "utf8");
      ok("lo construido: la portada enlaza a /privacidad", /<a href="\/privacidad"[^>]*>Privacidad<\/a>/.test(portadaEs));
      ok("lo construido: la portada inglesa enlaza a /en/privacy", /<a href="\/en\/privacy"[^>]*>Privacy<\/a>/.test(portadaEn) && !/href="\/privacidad"/.test(portadaEn));
      ok("lo construido: la guía enlaza, y sabe la dirección inglesa", /<a href="\/privacidad" data-href-es="\/privacidad" data-href-en="\/en\/privacy"/.test(guiaCons));
    }
    fs.rmSync(salida, { recursive: true, force: true });
  }
}

if (fallos) {
  console.error(`\n${fallos} fallos.`);
  process.exit(1);
}
console.log("\nLa privacidad pública sale completa, igual en los dos idiomas y sin marcas internas.");
