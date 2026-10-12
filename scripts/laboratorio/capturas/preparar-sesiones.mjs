// Deja en sesiones/<idioma>/ lo que la casa de pruebas enseñará como sesiones:
// los transcripts DE VERDAD de las sesiones grabadas (enteros o cortados en el
// mismo instante que su grabación) y unas cuantas más, de relleno, para que la
// barra y el Panel no salgan vacíos.
// Uso: node preparar-sesiones.mjs <en|es>
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const idioma = process.argv[2] ?? "en";
const REC = join(AQUI, "p", "rec");
const SALIDA = join(AQUI, "sesiones", idioma);
const CASA = homedir();
const RESPALDO = join(AQUI, "respaldo", idioma);

const carpetaDe = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, "-");
const ruta = (proyecto) => `P:\\projects\\${proyecto}`;

/** Las grabadas: nombre de la grabación, hace cuántos minutos, y el corte (ms). */
const GRABADAS = {
  en: [
    { rec: "en-storefront", hace: 7 },
    { rec: "en-mobile", hace: 1 },
    { rec: "en-landing", corte: 31950, hace: 0 },
    { rec: "en-invoice", corte: 34995, hace: 0, codex: true },
  ],
  es: [
    { rec: "es-storefront", hace: 7 },
    { rec: "es-mobile", hace: 1 },
    { rec: "es-landing", corte: 23950, hace: 0 },
    { rec: "es-invoice", corte: 29800, hace: 0, codex: true },
  ],
};

/** Las de relleno. `fin`: "lista" acaba afirmando, "ofrece" acaba preguntando. */
const RELLENO = {
  en: [
    ["storefront-api", "Rate limit on /cart/total", "Add a simple rate limit to /cart/total.", "Added a fixed-window limiter (60 requests a minute per IP) in front of /cart/total, with a test for the 429.", "claude-opus-5-5", 118000, 190],
    ["storefront-api", "Document the discount codes", "Write up how discount codes are applied.", "The doc is in docs/discounts.md. Want me to link it from the README?", "claude-sonnet-5-5", 41000, 1500],
    ["landing-web", "Pricing section copy pass", "Tighten the copy in the plans section.", "Shortened the three plan blurbs and made the call to action consistent.", "claude-sonnet-5-5", 36000, 320],
    ["mobile-app", "Pull to refresh on the order list", "Add pull to refresh to OrderList.", "OrderList now refreshes on pull, with a spinner while the request is out.", "claude-opus-5-5", 164000, 2900],
    ["invoice-cli", "Totals stay in whole cents", "Totals sometimes come out with fractions of a cent.", "Totals are rounded once, at the end, and there is a test for the 0.5 case.", "claude-sonnet-5-5", 52000, 1560],
    ["design-tokens", "Export tokens as CSS variables", "Generate a CSS file from tokens.json.", "build.mjs now writes tokens.css with one custom property per token. Should I add a dark set too?", "claude-opus-5-5", 97000, 410],
    ["design-tokens", "Contrast check on the dark palette", "Check the dark palette for contrast.", "Two pairs were under 4.5:1 and are fixed; the rest pass.", "claude-haiku-5-5", 23000, 4400],
    ["docs-site", "Broken links in the install guide", "Find the broken links in the docs.", "Five links were dead. Four are fixed and one page no longer exists, so I removed the reference.", "claude-sonnet-5-5", 61000, 75],
    ["docs-site", "Search for the docs site", "Add search to the docs.", "Search is on, using the built-in MkDocs plugin. Do you want it to index the changelog as well?", "claude-opus-5-5", 133000, 2050],
  ],
  es: [
    ["storefront-api", "Límite de peticiones en /cart/total", "Pon un límite de peticiones sencillo en /cart/total.", "Hay un limitador de ventana fija (60 peticiones por minuto y por IP) delante de /cart/total, con su prueba del 429.", "claude-opus-5-5", 118000, 190],
    ["storefront-api", "Documentar los códigos de descuento", "Escribe cómo se aplican los códigos de descuento.", "El documento está en docs/discounts.md. ¿Lo enlazo desde el README?", "claude-sonnet-5-5", 41000, 1500],
    ["landing-web", "Repaso del texto de los planes", "Aprieta el texto de la sección de planes.", "He acortado los tres textos de los planes y he igualado la llamada a la acción.", "claude-sonnet-5-5", 36000, 320],
    ["mobile-app", "Tirar para refrescar en los pedidos", "Añade tirar para refrescar en OrderList.", "OrderList ya refresca al tirar, con un indicador mientras llega la respuesta.", "claude-opus-5-5", 164000, 2900],
    ["invoice-cli", "Los totales, en céntimos enteros", "A veces los totales salen con fracciones de céntimo.", "Los totales se redondean una sola vez, al final, y hay una prueba para el caso del 0,5.", "claude-sonnet-5-5", 52000, 1560],
    ["design-tokens", "Exportar los tokens como variables CSS", "Genera un CSS a partir de tokens.json.", "build.mjs ya escribe tokens.css con una propiedad por token. ¿Añado también el juego oscuro?", "claude-opus-5-5", 97000, 410],
    ["design-tokens", "Contraste de la paleta oscura", "Revisa el contraste de la paleta oscura.", "Dos parejas quedaban por debajo de 4,5:1 y están corregidas; el resto pasa.", "claude-haiku-5-5", 23000, 4400],
    ["docs-site", "Enlaces rotos en la guía de instalación", "Busca los enlaces rotos de la documentación.", "Había cinco enlaces muertos. Cuatro están arreglados y una página ya no existe, así que quité la referencia.", "claude-sonnet-5-5", 61000, 75],
    ["docs-site", "Buscador para la documentación", "Añade un buscador a la documentación.", "El buscador está puesto, con el complemento de MkDocs. ¿Quieres que indexe también el registro de cambios?", "claude-opus-5-5", 133000, 2050],
  ],
};

// Se arma aparte y se cambia al final. Borrar `sesiones/<idioma>` antes de saber
// si están las fuentes costó las sesiones en español el 2026-10-12: los
// transcripts ya se habían limpiado del hogar y no quedaba de dónde rehacerlas.
const NUEVO = `${SALIDA}.nuevo`;
rmSync(NUEVO, { recursive: true, force: true });
let faltan = 0;
const plan = [];
const apuntar = (rel, hace) => plan.push({ rel, hace });
/** Guarda el original entero en `respaldo/<idioma>`: el hogar se limpia al
 *  terminar (paso 6 del README) y de ahí sale la vez siguiente. */
function guardar(origen, rel) {
  const copia = join(RESPALDO, rel);
  if (origen === copia) return;
  mkdirSync(dirname(copia), { recursive: true });
  copyFileSync(origen, copia);
}

function cortarLineas(lineas, limite) {
  if (!limite) return lineas;
  const fuera = lineas.findIndex((l) => {
    const m = l.match(/"timestamp":"([^"]+)"/);
    return m && Date.parse(m[1]) > limite;
  });
  return fuera < 0 ? lineas : lineas.slice(0, fuera);
}

for (const g of GRABADAS[idioma]) {
  const metaEn = join(REC, `${g.rec}.meta.json`);
  if (!existsSync(metaEn)) {
    console.log(`- ${g.rec}: sin grabar todavía`);
    continue;
  }
  const meta = JSON.parse(readFileSync(metaEn, "utf8"));
  const limite = g.corte ? meta.inicio + g.corte : 0;
  if (g.codex) {
    // El rollout de Codex de esa carpeta que empezó justo después de la grabación.
    const d = new Date(meta.inicio);
    const partes = [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")];
    const buscar = (carpetaDia, desde) =>
      (existsSync(carpetaDia) ? readdirSync(carpetaDia) : [])
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => {
          const primera = readFileSync(join(carpetaDia, f), "utf8").split("\n", 1)[0];
          let m;
          try {
            m = JSON.parse(primera);
          } catch {
            return null;
          }
          const t = Date.parse(m.timestamp ?? m.payload?.timestamp ?? "");
          return m.type === "session_meta" && m.payload?.cwd === meta.cwd ? { f, t } : null;
        })
        .filter((x) => x && x.t >= desde)
        .sort((a, b) => a.t - b.t);
    let dia = join(CASA, ".codex", "sessions", ...partes);
    let candidatos = buscar(dia, meta.inicio - 2000);
    if (!candidatos.length) {
      // El hogar real ya se limpió: la copia guardada de este idioma.
      dia = join(RESPALDO, "codex", "sessions", ...partes);
      candidatos = buscar(dia, 0);
    }
    if (!candidatos.length) {
      console.log(`- ${g.rec}: no encuentro su rollout de Codex ni en el hogar ni en respaldo/${idioma}`);
      faltan++;
      continue;
    }
    const f = candidatos[0].f;
    const lineas = cortarLineas(readFileSync(join(dia, f), "utf8").trimEnd().split("\n"), limite);
    const rel = join("codex", "sessions", basename(dirname(dirname(dia))), basename(dirname(dia)), basename(dia), f);
    guardar(join(dia, f), rel);
    mkdirSync(dirname(join(NUEVO, rel)), { recursive: true });
    writeFileSync(join(NUEVO, rel), lineas.join("\n") + "\n");
    apuntar(rel, g.hace);
    const ultimo = [...lineas].reverse().map((l) => l.match(/"type":"(task_started|task_complete|turn_aborted)"/)?.[1]).find(Boolean);
    console.log(`+ ${g.rec}: codex ${f} (${lineas.length} líneas, último: ${ultimo})`);
    continue;
  }
  const carpeta = carpetaDe(meta.cwd);
  const origen = [join(CASA, ".claude", "projects", carpeta, `${meta.sesion}.jsonl`), join(RESPALDO, "claude", carpeta, `${meta.sesion}.jsonl`)].find((r) => existsSync(r));
  if (!origen) {
    console.log(`- ${g.rec}: no encuentro su transcript ni en el hogar ni en respaldo/${idioma}`);
    faltan++;
    continue;
  }
  const todas = readFileSync(origen, "utf8").trimEnd().split("\n");
  const lineas = cortarLineas(todas, limite);
  // El título puede haberse escrito después del corte: se conserva.
  const titulo = [...todas].reverse().find((l) => l.includes('"type":"ai-title"'));
  if (titulo && !lineas.some((l) => l.includes('"type":"ai-title"'))) lineas.push(titulo);
  const rel = join("claude", carpeta, `${meta.sesion}.jsonl`);
  guardar(origen, rel);
  mkdirSync(dirname(join(NUEVO, rel)), { recursive: true });
  writeFileSync(join(NUEVO, rel), lineas.join("\n") + "\n");
  apuntar(rel, g.hace);
  const mensajes = lineas.filter((l) => /"type":"(user|assistant)"/.test(l));
  console.log(`+ ${g.rec}: ${JSON.parse(titulo ?? "{}").aiTitle ?? "(sin título)"} (${lineas.length} de ${todas.length} líneas; acaba en ${mensajes.at(-1)?.match(/"type":"(user|assistant)"/)?.[1]})`);
}

let n = 0;
for (const [proyecto, titulo, pide, contesta, modelo, usado, hace] of RELLENO[idioma]) {
  const cwd = ruta(proyecto);
  const id = `5e5100${String(++n).padStart(2, "0")}-0000-4000-8000-${idioma === "en" ? "e" : "5"}00000000000`;
  const lineas = [
    { type: "user", entrypoint: "cli", promptSource: "typed", cwd, message: { role: "user", content: pide } },
    {
      type: "assistant",
      cwd,
      message: {
        role: "assistant",
        model: modelo,
        content: [{ type: "text", text: contesta }],
        usage: { input_tokens: 900, cache_read_input_tokens: usado - 5000, cache_creation_input_tokens: 4100, output_tokens: 380 },
      },
    },
    { type: "ai-title", aiTitle: titulo },
  ];
  const rel = join("claude", carpetaDe(cwd), `${id}.jsonl`);
  mkdirSync(dirname(join(NUEVO, rel)), { recursive: true });
  writeFileSync(join(NUEVO, rel), lineas.map((l) => JSON.stringify(l)).join("\n") + "\n");
  apuntar(rel, hace);
}
if (faltan) {
  rmSync(NUEVO, { recursive: true, force: true });
  console.log(`Faltan ${faltan} de las grabadas: sesiones/${idioma} se queda como estaba.`);
  process.exit(1);
}
writeFileSync(join(NUEVO, "plan.json"), JSON.stringify(plan, null, 1));
rmSync(SALIDA, { recursive: true, force: true });
renameSync(NUEVO, SALIDA);
console.log(`plan: ${plan.length} sesiones en ${SALIDA}`);
