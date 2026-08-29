// Que dos publicaciones seguidas no se llamen igual.  `node scripts/publicar-check.mjs`
//
// EL FALLO, contado una vez para no volver a diagnosticarlo: el 2026-08-21 salió
// la 0.9.133 y veinte minutos después se volvió a publicar el código con la
// licencia nueva, sin subir el número. Como el mensaje del commit público se
// medía desde el `release:` ANTERIOR, las dos veces salió el mismo texto, y en
// GitHub quedaron dos commits con el título calcado (Munir, con la captura:
// «hay muchos commits con el nombre repetido»). Dos commits que se leen igual
// son dos commits que nadie sabe cuál mirar.
//
// Aquí se prueba la DECISIÓN, no el script: `publicar-codigo.mjs` toca disco,
// clona el repo público y no exporta nada, así que sus tres piezas nuevas están
// escritas otra vez debajo, tal cual. Si se tocan allí, se tocan aquí.
//   1. contar desde `Adeorq-origen:` en vez de desde el release anterior
//   2. caer al asunto suelto cuando no hay feat/fix/perf en el tramo
//   3. el desempate por sha si aun así saldría repetido
//
// Ojo: la decisión del TÍTULO ya no está copiada aquí, vive en
// `titulo-publico.mjs` y se importa. Cuando estaba copiada se cambió en un
// sitio y no en el otro, y esta prueba dio verde sobre código que ya no era el
// que se ejecutaba. Lo que sigue escrito abajo es solo el envoltorio.
import { queTrae as tituloDe } from "./titulo-publico.mjs";

const version = "0.9.133";

const queTrae = (lineas) => tituloDe(lineas, version);

function titular(lineas, anterior, sha) {
  const trae = queTrae(lineas);
  let m = trae.titulo ? `Adeorq ${version} — ${trae.titulo}` : `Adeorq ${version}`;
  if (anterior === m) m = `${m} (${sha.slice(0, 7)})`;
  return m;
}

let fallos = 0;
const ok = (n, c, d = "") => {
  if (!c) fallos++;
  console.log(`${c ? "ok  " : "FALLA"} ${n}${d ? " — " + d : ""}`);
};

// ── EL CASO DE HOY, tal cual pasó ──────────────────────────────────────────
const primeraVez = [
  "release: 0.9.133",
  "feat(update): the update card gets an accent frame with a glow",
  "docs(licence): the licence covers the source",
  "release: 0.9.132",
];
const t1 = titular(primeraVez, "Adeorq 0.9.132 — otra cosa", "aaaaaaaaaaaa");
ok("la primera publicacion dice lo que trae", t1.includes("accent frame"), t1);

// La SEGUNDA, contando desde `Adeorq-origen` (solo el commit de licencia).
const segundaVez = ["docs(licence): swap the bespoke EULA for PolyForm Shield 1.0.0"];
const t2 = titular(segundaVez, t1, "bbbbbbbbbbbb");
ok("la segunda NO repite el titulo", t2 !== t1, t2);
ok("y dice lo que de verdad cambio", t2.includes("PolyForm Shield"), t2);

// Y si aun así el tramo saliera idéntico, el sha desempata.
const comoEraAntes = titular(primeraVez, t1, "bbbbbbbbbbbb");
ok("si el tramo saliera igual, el sha desempata", comoEraAntes !== t1, comoEraAntes);

// ── El titulo dice la NOVEDAD, no el ultimo retoque ────────────────────────
// Salio mal dos veces seguidas: la 0.9.141 se titulo con el arreglo de dos
// tests y la 0.9.142 con un aviso, cuando lo que traian era el MCP con manos y
// el editor de la web. Un arreglo hecho despues no es mas importante que la
// novedad, solo es mas nuevo.
const conFixEncima = [
  "release: 0.9.133",
  "fix(web): say why nothing happens when the page has no plugin",
  "feat(web): edit your localhost page by clicking",
  "release: 0.9.132",
];
const t3 = titular(conFixEncima, "otro", "dddddddddddd");
ok("el titulo coge el feat, no el fix mas reciente", t3.includes("edit your localhost"), t3);

// Y sin ningun feat, sigue mandando el mas reciente.
const soloFixes = [
  "release: 0.9.133",
  "fix(a): lo ultimo",
  "fix(b): lo anterior",
  "release: 0.9.132",
];
ok(
  "sin feat, manda el mas reciente",
  titular(soloFixes, "otro", "eeeeeeeeeeee").includes("lo ultimo"),
  titular(soloFixes, "otro", "eeeeeeeeeeee"),
);

// ── Los bordes ─────────────────────────────────────────────────────────────
ok("un tramo vacio no revienta", titular([], "otro", "cccccccccccc") === "Adeorq 0.9.133");

const normal = ["release: 0.9.133", "feat(x): algo nuevo", "release: 0.9.132"];
ok(
  "una version normal sigue igual que antes",
  titular(normal, "", "dddddddddddd").endsWith("algo nuevo"),
  titular(normal, "", "dddddddddddd"),
);

// El que destapó el simulacro y no el ojo: sin filtrar los `release:` del
// respaldo, el titulo salia siendo el numero que ya esta delante.
const soloRelease = titular(["release: 0.9.133"], "otro", "eeeeeeeeeeee");
ok("un tramo con solo el release no se titula con el numero", soloRelease === "Adeorq 0.9.133", soloRelease);

// Un tramo de solo documentacion: tiene que decir algo, no quedarse mudo.
const soloDocs = titular(["docs: el mapa del ecosistema al dia"], "otro", "ffffffffffff");
ok("un tramo de solo docs dice de que va", soloDocs.includes("mapa del ecosistema"), soloDocs);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
