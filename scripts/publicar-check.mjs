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
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faltanEnElInstalador, faltanNovedades, huellaDeEntrada, leerSello, sellarAlCompilar } from "./novedades-publicar.mjs";
import { contar, recoger } from "./recoger-publicadas.mjs";
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

// La 0.9.262, tal cual: commits sin prefijo, y encima una fusion y un docs.
const comoLa262 = [
  "release: 0.9.133",
  "Merge branch 'movil/decision-imagenes'",
  "docs: the phone chapter tells the accepted history gaps",
  'Revert "The hero headline is centered"',
  "A cut-off decision list keeps the phone's send marks",
  "release: 0.9.132",
];
const t262 = titular(comoLa262, "otro", "gggggggggggg");
ok("sin prefijos, ni la fusion ni el docs ni el revert dan el titulo", t262.endsWith("keeps the phone's send marks"), t262);
// Y si solo hay relleno, sigue diciendo algo antes que quedarse en el numero.
const soloFusion = titular(["Merge branch 'x'"], "otro", "hhhhhhhhhhhh");
ok("un tramo de solo una fusion no se queda mudo", soloFusion.includes("Merge branch"), soloFusion);
// Pero nunca con algo de la version anterior: el respaldo no pasa del release de otra.
const rellenoYAntes = titular(
  ["release: 0.9.133", "Merge branch 'x'", "docs: y", "release: 0.9.132", "A real feature shipped in 0.9.132"],
  "otro",
  "iiiiiiiiiiii",
);
ok("el respaldo no coge un commit de la version anterior", !rellenoYAntes.includes("0.9.132"), rellenoYAntes);
// Un cambio de producto que empieza por «Merge» no es una fusion de git.
const mergeDeProducto = titular(["Merge branch 'x'", "Merge the two decision lists into one"], "otro", "jjjjjjjjjjjj");
ok("«Merge the…» de producto si titula", mergeDeProducto.endsWith("Merge the two decision lists into one"), mergeDeProducto);

// --- las carpetas que deja cada publicación ---------------------------------------
// `recoger-publicadas.mjs`, con carpetas y repos de verdad en una temporal
// propia: lo empujado se va, lo que tiene un commit sin empujar se queda.
{
  const casa = mkdtempSync(join(tmpdir(), "adeorq-recoger-"));
  const g = (args, cwd) => execFileSync("git", args, { cwd, stdio: "ignore" });
  try {
    const origen = join(casa, "origen.git");
    g(["init", "--bare", "-b", "main", origen]);
    /** Un clon con un commit; con `empujar`, subido a su origen. */
    const clon = (nombre, empujar) => {
      const p = join(casa, nombre, "publico");
      mkdirSync(join(casa, nombre), { recursive: true });
      g(["clone", origen, p]);
      writeFileSync(join(p, `${nombre}.txt`), nombre);
      g(["add", "-A"], p);
      g(["-c", "user.name=banco", "-c", "user.email=banco@example.invalid", "commit", "-m", nombre, "--no-verify"], p);
      // El guardián global de `pre-push` pide revisar lo que se sube; aquí es un
      // repo de prueba en una temporal, y sin esto el comprobador entero salía rojo.
      if (empujar) execFileSync("git", ["push", "origin", "HEAD:main"], { cwd: p, stdio: "ignore", env: { ...process.env, PUSH_REVISADO: "1" } });
      return join(casa, nombre);
    };
    const empujada = clon("adeorq-pub-empujada", true);
    // Clonada cuando el origen ya tiene `main`: su commit va uno por delante.
    const pendiente = clon("adeorq-pub-pendiente", false);
    const cortada = join(casa, "adeorq-pub-cortada");
    const reciente = join(casa, "adeorq-pub-reciente");
    const enMarcha = join(casa, "adeorq-pub-enmarcha");
    const ajena = join(casa, "otra-cosa");
    for (const d of [cortada, reciente, enMarcha, ajena]) mkdirSync(join(d, "foto"), { recursive: true });
    // Lo que deja la limpieza de Windows: el `.git` con sus carpetas y sin archivos.
    const hueca = join(casa, "adeorq-pub-hueca");
    mkdirSync(join(hueca, "publico", ".git", "objects"), { recursive: true });
    const ayer = new Date(Date.now() - 26 * 60 * 60 * 1000);
    utimesSync(hueca, ayer, ayer);
    utimesSync(cortada, ayer, ayer);
    utimesSync(enMarcha, ayer, ayer);

    const simulacro = recoger(casa, { menos: enMarcha, borrar: false });
    ok("el simulacro cuenta lo que se iría y no borra nada", simulacro.borradas.length === 3 && existsSync(empujada) && existsSync(cortada), JSON.stringify(simulacro.borradas.map((p) => p.slice(casa.length + 1))));
    const r = recoger(casa, { menos: enMarcha });
    ok("una publicación ya empujada se recoge", !existsSync(empujada));
    ok("una con un commit sin empujar SE QUEDA, y se dice cuál", existsSync(pendiente) && r.pendientes.length === 1 && r.pendientes[0] === pendiente && contar(r).includes("SIN EMPUJAR"));
    ok("una que se cortó a medias hace un día se recoge", !existsSync(cortada));
    ok("y una con el clon hueco, que git ya no reconoce, también", !existsSync(hueca) && r.dudosas.length === 0);
    ok("una sin clon de hace un momento se queda: puede estar en marcha", existsSync(reciente));
    ok("la de la publicación en marcha no se toca aunque sea vieja", existsSync(enMarcha));
    ok("y lo que no es de publicar, tampoco", existsSync(ajena));
  } finally {
    rmSync(casa, { recursive: true, force: true });
  }
}

// ── Lo nuevo de la versión: sin su entrada no sale (`novedades-publicar.mjs`) ──
{
  const con = JSON.stringify({ "0.9.264": [{ es: {}, en: {} }], "0.9.265": [] });
  ok("con su entrada, sale", faltanNovedades("0.9.264", con) === null);
  ok("con la lista vacía a propósito, también", faltanNovedades("0.9.265", con) === null);
  const sin = faltanNovedades("0.9.266", con);
  ok("sin su entrada, no sale, y dice cuál y cómo", Boolean(sin) && sin.includes("0.9.266") && sin.includes('"0.9.266": []'), String(sin));
  ok("una entrada que no es lista, no sale", Boolean(faltanNovedades("0.9.264", JSON.stringify({ "0.9.264": {} }))));
  ok("un fichero roto, no sale", Boolean(faltanNovedades("0.9.264", "{ no es json")));
  ok("y el de verdad se lee", !String(faltanNovedades("0.0.0", readFileSync("src/novedades.json", "utf8"))).includes("no se puede leer"));
  ok("con la marca de orden de PowerShell delante, también se lee", faltanNovedades("0.9.264", String.fromCharCode(0xfeff) + con) === null);
  // Y que el instalador la lleve: va dentro del bundle, y la compilación deja un
  // sello con su huella junto al instalador.
  const sello = { version: "0.9.264", huella: huellaDeEntrada(con, "0.9.264") };
  const listo = { exeMs: 2000, sello, selloMs: 1000 };
  ok("la huella no depende de la marca de orden ni de los saltos de Windows",
    huellaDeEntrada(String.fromCharCode(0xfeff) + JSON.stringify(JSON.parse(con), null, 2).replace(/\n/g, "\r\n"), "0.9.264") === sello.huella);
  ok("ni de lo que traigan las otras versiones",
    huellaDeEntrada(JSON.stringify({ ...JSON.parse(con), "0.9.265": [{ es: { titulo: "otra" } }] }), "0.9.264") === sello.huella);
  ok("compilado con su entrada, sale", faltanEnElInstalador("0.9.264", con, listo) === null);
  const otraSesion = JSON.stringify({ ...JSON.parse(con), "0.9.265": [{ es: { titulo: "de otra sesión" } }] });
  ok("otra sesión escribe la versión siguiente después de compilar: sale igual", faltanEnElInstalador("0.9.264", otraSesion, listo) === null);
  const cambiada = JSON.stringify({ "0.9.264": [{ es: { titulo: "otra cosa" }, en: {} }] });
  const tarde = faltanEnElInstalador("0.9.264", cambiada, listo);
  ok("tu entrada cambió después de compilar: no sale, y dice que recompiles", Boolean(tarde) && tarde.includes("vuelve a compilar"), String(tarde));
  ok("sin instalador todavía, solo cuenta la entrada", faltanEnElInstalador("0.9.264", con, { exeMs: null, sello: null, selloMs: 0 }) === null);
  const sinNada = faltanEnElInstalador("0.9.266", con, listo);
  ok("sin entrada, tampoco, y avisa de recompilar tras escribirla", Boolean(sinNada) && sinNada.includes("vuelve a compilar"));
  const sinSello = faltanEnElInstalador("0.9.264", con, { exeMs: 2000, sello: null, selloMs: 0 });
  ok("un instalador sin sello no sale", Boolean(sinSello) && sinSello.includes("sello"), String(sinSello));
  ok("ni con el sello de otra versión", Boolean(faltanEnElInstalador("0.9.264", con, { ...listo, sello: { ...sello, version: "0.9.263" } })));
  const aMedias = faltanEnElInstalador("0.9.264", con, { ...listo, selloMs: 3000 });
  ok("una compilación que no llegó a hacer el instalador no sale", Boolean(aMedias) && aMedias.includes("no llegó"), String(aMedias));
  // Al publicar se compara con el último commit, que es lo que sale como código.
  ok("con la entrada del commit, sale", faltanEnElInstalador("0.9.264", con, { ...listo, enCommit: con }) === null);
  ok("aunque en el disco alguien la esté cambiando: el instalador lleva la del commit",
    faltanEnElInstalador("0.9.264", cambiada, { ...listo, enCommit: con }) === null);
  const sinCommit = faltanEnElInstalador("0.9.264", con, { ...listo, enCommit: JSON.stringify({}) });
  ok("compilada sin commitear: no sale, y dice que entre en el commit", Boolean(sinCommit) && sinCommit.includes("commit") && !sinCommit.includes("vuelve a compilar"), String(sinCommit));
  const niUnaNiOtra = faltanEnElInstalador("0.9.264", cambiada, { ...listo, enCommit: JSON.stringify({}) });
  ok("y si ni el disco ni el commit son lo compilado, recompilar y commitear", Boolean(niUnaNiOtra) && niUnaNiOtra.includes("vuelve a compilar") && niUnaNiOtra.includes("commit"));
  // El sello lo escribe `vite.config.ts` solo al compilar el instalador de Windows.
  const casaSello = mkdtempSync(join(tmpdir(), "adeorq-sello-"));
  try {
    writeFileSync(join(casaSello, "package.json"), JSON.stringify({ version: "0.9.264" }));
    const env = { TAURI_ENV_PLATFORM: "windows", TAURI_ENV_DEBUG: "false", CARGO_TARGET_DIR: join(casaSello, "ct") };
    const bundle = join(casaSello, "ct", "release", "bundle", "nsis");
    sellarAlCompilar(con, { ...env, TAURI_ENV_DEBUG: "true" }, casaSello);
    sellarAlCompilar(con, { CARGO_TARGET_DIR: env.CARGO_TARGET_DIR }, casaSello);
    ok("un build de depuración o un `pnpm build` suelto no sellan", leerSello(bundle, "0.9.264").sello === null);
    sellarAlCompilar(con, env, casaSello);
    const leido = leerSello(bundle, "0.9.264");
    ok("el de `pnpm tauri build` sí, con la huella de lo que entró", leido.sello?.huella === sello.huella && leido.selloMs > 0, JSON.stringify(leido));
  } finally {
    rmSync(casaSello, { recursive: true, force: true });
  }
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
// Sin esto salía con 0 aunque contara fallos, y `comprobar` lo daba por bueno.
process.exit(fallos ? 1 : 0);
