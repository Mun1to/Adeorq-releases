// La guía cuenta lo mismo en sus dos lenguas y sus enlaces llevan a algún sitio.
//
//     node scripts/guia-check.mjs        (va dentro de `pnpm comprobar`)
//
// Nació de un fallo que se pagó dos veces: la guía de la app (`docs/GUIA.md`) tenía
// enlaces como «ver el punto 10» que apuntaban a una sección que, tras renumerar,
// era la 13; y la inglesa iba tres meses por detrás de la española sin que nada lo
// dijera («siete vistas», una pestaña que ya no existía). Aquí se mira:
//
//   1. Los apartados de las dos guías de la app están numerados sin huecos.
//   2. Todo enlace interno (`](#ancla)`) lleva a un título que existe.
//   3. La española y la inglesa tienen los mismos apartados, los mismos subapartados
//      de cada uno y los mismos enlaces internos.
//   4. La guía de la web (`web/guia.html`): cada `href="#x"` lleva a un `id="x"`, y
//      cada texto marcado para traducir tiene su inglés en `web/js/guia-i18n.js`
//      (y no sobra ninguno de ese diccionario).
//
// No juzga si algo está bien contado: eso es leerlo. Solo corta que se desalineen.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
let fallos = 0;
const dice = (bien, que) => {
  console.log(`${bien ? "ok  " : "MAL "} ${que}`);
  if (!bien) fallos++;
};

/** El anclaje que GitHub le da a un título (el mismo que `scripts/guia-numerar.mjs`). */
function anclaje(texto) {
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Los títulos de nivel 2 y 3 de un Markdown, y sus enlaces internos de dentro. */
function leerGuia(ruta) {
  const lineas = leer(ruta).split(/\r?\n/);
  const h2 = [];
  const h3PorH2 = [];
  const anclas = new Set();
  const enlaces = [];
  let dentroDeCodigo = false;
  let enIndice = false;
  for (const l of lineas) {
    if (l.startsWith("```")) {
      dentroDeCodigo = !dentroDeCodigo;
      continue;
    }
    if (dentroDeCodigo) continue;
    const m2 = l.match(/^## (.+)$/);
    const m3 = l.match(/^### (.+)$/);
    if (m2) {
      const titulo = m2[1].trim();
      enIndice = /^(Índice|Contents)$/.test(titulo);
      anclas.add(anclaje(titulo));
      if (!enIndice) {
        h2.push(titulo);
        h3PorH2.push(0);
      }
      continue;
    }
    if (m3) {
      anclas.add(anclaje(m3[1]));
      if (h3PorH2.length) h3PorH2[h3PorH2.length - 1]++;
      continue;
    }
    if (enIndice) continue;
    for (const e of l.matchAll(/\]\(#([^)\s]+)\)/g)) enlaces.push(decodeURIComponent(e[1]));
  }
  return { h2, h3PorH2, anclas, enlaces };
}

const guias = { es: leerGuia("docs/GUIA.md"), en: leerGuia("docs/GUIDE.en.md") };

for (const [lang, g] of Object.entries(guias)) {
  const fichero = lang === "es" ? "GUIA.md" : "GUIDE.en.md";
  const numeros = g.h2.map((t) => Number(t.match(/^(\d+)\./)?.[1] ?? NaN));
  dice(
    numeros.length > 0 && numeros.every((n, i) => n === i),
    `${fichero}: los apartados van numerados de 0 a ${numeros.length - 1} sin huecos`,
  );
  const rotos = g.enlaces.filter((a) => !g.anclas.has(a));
  dice(rotos.length === 0, `${fichero}: ${g.enlaces.length} enlaces internos y todos llevan a un título${rotos.length ? ` (rotos: ${[...new Set(rotos)].join(", ")})` : ""}`);
}

dice(
  guias.es.h2.length === guias.en.h2.length,
  `las dos guías tienen los mismos apartados (${guias.es.h2.length} en español, ${guias.en.h2.length} en inglés)`,
);
const mismosH3 = guias.es.h3PorH2.join(",") === guias.en.h3PorH2.join(",");
dice(
  mismosH3,
  "y los mismos subapartados dentro de cada uno" +
    (mismosH3
      ? ""
      : ` (español: ${guias.es.h3PorH2.join(",")} / inglés: ${guias.en.h3PorH2.join(",")})`),
);
/** Los números a los que apuntan los enlaces del cuerpo, que son los que se descolocan al renumerar. */
const destinos = (g) => g.enlaces.map((a) => a.match(/^(\d+)-/)?.[1] ?? a).sort((x, y) => String(x).localeCompare(String(y), "en", { numeric: true }));
dice(
  destinos(guias.es).join(",") === destinos(guias.en).join(","),
  "los enlaces del cuerpo apuntan a los mismos apartados en las dos",
);

/* ── Lo que no se cuenta en público ────────────────────────────
   Hay terminales que siguen con las reglas de antes hasta que se cierren, y eso no se
   anuncia: se dice qué hace falta (salir del todo tras actualizar), no el hueco que
   queda mientras tanto. Ya se quitó una frase así antes de la 0.9.239, y volvió con la
   guía reescrita (revisión E9, 2026-11-03). Mientras haya gente con esas terminales. */
const NO_SE_CUENTA = [
  /proceso de antes no la tiene/i,
  /sus permisos se deciden por\s+(?:el\s+)?nombre/i,
  /earlier\s+process\s+does not have it/i,
  /permissions are decided by\s+the\s+name/i,
];
const PUBLICOS = ["docs/GUIA.md", "docs/GUIDE.en.md", "web/guia.html", "web/js/guia-i18n.js", "docs/SUPREMA.md", "README.md", "README.es.md"];
const cuentan = PUBLICOS.filter((p) => NO_SE_CUENTA.some((re) => re.test(leer(p).replace(/\s+/g, " "))));
dice(cuentan.length === 0, `lo público no cuenta el hueco de las terminales de antes${cuentan.length ? ` (lo cuenta: ${cuentan.join(", ")})` : ""}`);
// Y lo que lo mide con un impostor no sale en la foto pública.
const fuera = leer("scripts/publicar-codigo.mjs");
for (const lab of ["scripts/laboratorio/seguridad-local-de-verdad.mjs", "scripts/laboratorio/motor-viejo-de-verdad.mjs"]) {
  dice(fuera.includes(`"${lab}"`), `${lab} está en FUERA de publicar-codigo.mjs`);
}

/* ── La guía de la web ──────────────────────────────────────────────────── */
const html = leer("web/guia.html");
const dic = leer("web/js/guia-i18n.js");
const boot = leer("web/js/boot.js");

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const sinId = hrefs.filter((h) => !ids.has(h));
dice(sinId.length === 0, `web/guia.html: ${hrefs.length} enlaces internos y todos llevan a un id${sinId.length ? ` (sin id: ${[...new Set(sinId)].join(", ")})` : ""}`);

const usadas = new Set([...html.matchAll(/data-i18n(?:-html|-aria|-title|-alt)?="([^"]+)"/g)].map((m) => m[1]));
// El diccionario inglés es la parte `en: {...}`; el español nace en el HTML.
const dentroDeEn = dic.slice(dic.indexOf("en: {"));
const definidas = new Set([...dentroDeEn.matchAll(/^\s*'([\w.\-]+)'\s*:/gm)].map((m) => m[1]));
const sinIngles = [...usadas].filter((k) => !definidas.has(k) && !boot.includes(`'${k}'`));
dice(sinIngles.length === 0, `web/guia.html: cada texto marcado tiene su inglés${sinIngles.length ? ` (sin inglés: ${sinIngles.join(", ")})` : ` (${usadas.size} claves)`}`);
const sobran = [...definidas].filter((k) => !usadas.has(k));
dice(sobran.length === 0, `web/js/guia-i18n.js: no sobra ninguna clave${sobran.length ? ` (sin uso en la página: ${sobran.join(", ")})` : ""}`);

console.log(fallos === 0 ? "\nLa guía está alineada." : `\n${fallos} cosas desalineadas.`);
process.exit(fallos === 0 ? 0 : 1);
