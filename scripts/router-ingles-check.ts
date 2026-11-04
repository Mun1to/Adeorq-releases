// Banco del inglés del router y de los fallos del conserje.
//
//   pnpm bancos router-ingles
//
// Existe porque con la app en inglés el porqué del router («Es oficio del día a
// día…», «Con "2da MAIN": es la que más cuota perdería…») y los fallos de
// `conserje.rs` («el conserje se quedó pensando demasiado…») salían en español
// en medio de un chat en inglés. Son frases con datos dentro, así que no basta
// con mirar que cada `t("…")` tenga su línea: hay que ejecutarlas todas.
//
// Mira tres cosas:
//  1. Con el traductor inglés, ninguna frase del router (ni su aviso ni su
//     razón de elegir cuenta) lleva una letra que solo tenga el español, ni un
//     hueco `{algo}` sin rellenar. Se recorren las ramas de verdad: cada relevo,
//     cada motivo de cuenta, cada techo de plan.
//  2. Con el español (sin traductor, que es lo que ven los bancos y el MCP),
//     sale exactamente lo mismo que con `makeT("es")`: traducir no cambia el
//     idioma de partida.
//  3. Cada `Err` con texto de `conserje.rs` tiene su regla en `avisosDeRust.ts`:
//     en español la regla devuelve el mensaje igual que salió, y en inglés lo
//     cambia y no deja letras españolas. Un `Err` nuevo sin regla pone esto en
//     rojo, que es lo que impide que se cuele otro mensaje en español.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avisoEnSuIdioma } from "../src/lib/avisosDeRust";
import { makeT } from "../src/lib/i18n";
import { cuantoFalta, elegirCuenta, enCuanto, modeloParaSuPlan, recetar, recetarConMemoria, type CuentaViva, type Exigencia, type Mundo } from "../src/lib/router";
import type { ReglaRouter } from "../src/lib/reglasRouter";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto?: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

const en = makeT("en");
const es = makeT("es");
const ESPANOL = /[áéíóúüñ¿¡«»]/i;
const HUECO = /\{\w+\}/;
const limpia = (s: string) => !ESPANOL.test(s) && !HUECO.test(s);

const AHORA = new Date(2026, 10, 3, 10, 0).getTime();
const DIA = 86_400_000;
const viva = (label: string, o: Partial<CuentaViva> = {}, provider = "claude"): CuentaViva => ({
  cuenta: { id: `${provider}:${label}`, label, dir: label === "Principal" ? "" : `C:\\cuentas\\${label}`, provider },
  instalado: true,
  conectada: true,
  ...o,
});

// ── 1 y 2. El router, rama a rama ───────────────────────────────────────────
const ex = (clase: Exigencia["clase"], o: Partial<Exigencia> = {}): Exigencia => ({ clase, consecuencia: "baja", largo: false, trabajo: "codigo", ...o });

interface Escenario {
  nombre: string;
  ex: Exigencia;
  mundo: Omit<Mundo, "t" | "ahora">;
  pedido?: "haiku" | "sonnet" | "opus";
  preferido?: "haiku" | "sonnet" | "opus";
}

const dos = [viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA, plan: "max" }), viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro", abiertas: 2 })];
const escenarios: Escenario[] = [
  { nombre: "recado con dos cuentas (cuál gana y frente a quién)", ex: ex("recado"), mundo: { cuentas: dos } },
  { nombre: "una de ellas con una terminal abierta desde la lectura", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 20, abiertas: 1 }), viva("Otra", { gastado: 20 })] } },
  { nombre: "sin dato de gasto ni fecha", ex: ex("oficio"), mundo: { cuentas: [viva("Principal"), viva("Otra")] } },
  { nombre: "una lectura de antes de renovarse", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 90, renueva: AHORA - DIA }), viva("Otra", { gastado: 10, renueva: AHORA + DIA })] } },
  { nombre: "se renueva en menos de una hora, en horas y en un día", ex: ex("oficio"), mundo: { cuentas: [viva("A", { gastado: 10, renueva: AHORA + 30 * 60_000 }), viva("B", { gastado: 10, renueva: AHORA + 5 * 3_600_000 }), viva("C", { gastado: 10, renueva: AHORA + DIA })] } },
  { nombre: "una pasa del 92 % y otra está parada por su tope de 5 horas", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 95 }), viva("Otra", { gastado: 30, sesion: 100, sesionRenueva: AHORA + 3_600_000 * 2 }), viva("Buena", { gastado: 30 })] } },
  { nombre: "única cuenta, y va por el 95 %", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 95 })] } },
  { nombre: "única cuenta parada por su tope de 5 horas", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 30, sesion: 100, sesionRenueva: AHORA + 3_600_000 * 2 })] } },
  { nombre: "única cuenta parada, sin fecha de su tope", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 30, sesion: 100 })] } },
  { nombre: "todas sin sitio", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 96 }), viva("Otra", { gastado: 97 })] } },
  { nombre: "todas sin sitio, con el periodo en mes", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 96, periodo: "mes" }), viva("Otra", { gastado: 97, periodo: "mes" })] } },
  { nombre: "la semana apretada baja de opus", ex: ex("oficio"), pedido: "opus", mundo: { cuentas: [viva("Principal", { gastado: 80, plan: "max" })] } },
  { nombre: "la semana apretada no baja lo de juicio", ex: ex("juicio", { consecuencia: "alta" }), mundo: { cuentas: [viva("Principal", { gastado: 80, plan: "max" })] } },
  { nombre: "sin semana y sin otro CLI baja de modelo", ex: ex("oficio"), pedido: "opus", mundo: { cuentas: [viva("Principal", { gastado: 95, plan: "max" })] } },
  { nombre: "sin semana y sin otro CLI, lo de juicio no baja", ex: ex("juicio", { consecuencia: "alta" }), mundo: { cuentas: [viva("Principal", { gastado: 95, plan: "max" })] } },
  { nombre: "solo parada: se dice y ya", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 30, sesion: 100, sesionRenueva: AHORA + 3_600_000 })] } },
  { nombre: "todas las de Claude paradas y Codex libre", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 30, sesion: 100, sesionRenueva: AHORA + 3_600_000 }), viva("Codex", {}, "codex")] } },
  { nombre: "sin semana en Claude y Codex libre", ex: ex("oficio"), mundo: { cuentas: [viva("Principal", { gastado: 97 }), viva("Codex", {}, "codex")] } },
  { nombre: "sin Claude conectado, Codex", ex: ex("oficio"), mundo: { cuentas: [viva("Codex", {}, "codex")] } },
  { nombre: "sin Claude conectado, Antigravity para leer", ex: ex("oficio", { trabajo: "lectura" }), mundo: { cuentas: [viva("Agy", {}, "agy")] } },
  { nombre: "sin Claude conectado, Gemini para texto", ex: ex("oficio", { trabajo: "texto" }), mundo: { cuentas: [viva("Gem", {}, "gemini")] } },
  { nombre: "sin Claude conectado, opencode", ex: ex("oficio"), mundo: { cuentas: [viva("Oc", {}, "opencode")] } },
  { nombre: "sin Claude conectado, Qwen", ex: ex("oficio"), mundo: { cuentas: [viva("Qw", {}, "qwen")] } },
  { nombre: "sin ninguna cuenta", ex: ex("oficio"), mundo: { cuentas: [] } },
  { nombre: "sin suscripción baja el modelo", ex: ex("oficio"), pedido: "opus", mundo: { cuentas: [viva("Principal", { gastado: 10, plan: "free" })] } },
  { nombre: "sin suscripción y de juicio se queda", ex: ex("juicio"), mundo: { cuentas: [viva("Principal", { gastado: 10, plan: "free" })] } },
  { nombre: "plan Pro con opus", ex: ex("juicio"), mundo: { cuentas: [viva("Principal", { gastado: 10, plan: "pro" })] } },
  { nombre: "larga y con consecuencia alta sube un escalón", ex: ex("oficio", { consecuencia: "alta", largo: true }), mundo: { cuentas: [viva("Principal", { gastado: 10 })] } },
  { nombre: "tu cerebro por defecto manda", ex: ex("oficio"), preferido: "haiku", mundo: { cuentas: [viva("Principal", { gastado: 10 })] } },
  { nombre: "tu cerebro por defecto no abarata lo de juicio", ex: ex("juicio"), preferido: "haiku", mundo: { cuentas: [viva("Principal", { gastado: 10 })] } },
  { nombre: "aviso: el panel lleva opus para un recado", ex: ex("recado"), mundo: { cuentas: [viva("Principal", { gastado: 10 })], panel: { model: "claude-opus-5-5" }, avisos: "gordas" } },
  { nombre: "aviso: el panel lleva haiku para lo de juicio", ex: ex("juicio", { consecuencia: "alta" }), mundo: { cuentas: [viva("Principal", { gastado: 10 })], panel: { model: "haiku" }, avisos: "gordas" } },
  { nombre: "aviso siempre: lleva más", ex: ex("recado"), mundo: { cuentas: [viva("Principal", { gastado: 10 })], panel: { model: "sonnet" }, avisos: "siempre" } },
  { nombre: "aviso siempre: lleva menos", ex: ex("juicio"), mundo: { cuentas: [viva("Principal", { gastado: 10 })], panel: { model: "haiku" }, avisos: "siempre" } },
];

/** Todas las frases que sale de una receta, para mirarlas juntas. */
const frasesDe = (r: ReturnType<typeof recetar>) => [...r.porque, r.aviso ?? "", r.alternativa?.porque ?? ""].filter(Boolean);

let vistas = 0;
for (const e of escenarios) {
  const mundo: Mundo = { ...e.mundo, ahora: AHORA };
  const sin = recetar(e.ex, mundo, e.pedido, e.preferido);
  const conEs = recetar(e.ex, { ...mundo, t: es }, e.pedido, e.preferido);
  const conEn = recetar(e.ex, { ...mundo, t: en }, e.pedido, e.preferido);
  comprueba(`español: «${e.nombre}» sale igual con y sin traductor`, JSON.stringify(sin) === JSON.stringify(conEs), { sin: frasesDe(sin), conEs: frasesDe(conEs) });
  const malas = frasesDe(conEn).filter((f) => !limpia(f));
  vistas += frasesDe(conEn).length;
  // `VER_FRASES=1` las enseña, para leerlas con los ojos: que no salga español
  // no dice que el inglés suene bien.
  if (process.env.VER_FRASES) console.log(`\n# ${e.nombre}\n${frasesDe(conEn).map((f) => `  · ${f}`).join("\n")}`);
  comprueba(`inglés: «${e.nombre}» no deja español ni huecos`, malas.length === 0 && frasesDe(conEn).length > 0, malas);
  comprueba(`inglés: «${e.nombre}» elige lo mismo que en español`, conEn.cli === sin.cli && conEn.modelo === sin.modelo && conEn.cuenta?.id === sin.cuenta?.id, { en: [conEn.cli, conEn.modelo], es: [sin.cli, sin.modelo] });
}
comprueba(`se miraron frases de verdad (${vistas})`, vistas > 60, vistas);

// Las razones que hablan del modelo, aparte y en cualquier idioma.
const base = { cuentas: [viva("Principal", { gastado: 10 })], ahora: AHORA };
const rEn = recetar(ex("oficio", { largo: true }), { ...base, t: en });
comprueba("`delModelo` trae las del modelo y no las de la cuenta, en inglés", !!rEn.delModelo && rEn.delModelo.length >= 2 && rEn.delModelo.every((f) => rEn.porque.includes(f)), rEn.delModelo);

// elegirCuenta y los textos sueltos.
const e1 = elegirCuenta(dos, AHORA, undefined, en);
comprueba("elegirCuenta en inglés dice cuál, cuánto y frente a quién", !!e1 && limpia(e1.porque) && /2da MAIN/.test(e1.porque) && /Principal/.test(e1.porque) && /in 2 days/.test(e1.porque), e1?.porque);
comprueba("enCuanto y cuantoFalta, las cuatro ramas, en inglés", [30 * 60_000, 5 * 3_600_000, DIA, 3 * DIA].every((ms) => limpia(enCuanto(AHORA + ms, AHORA, en)) && limpia(cuantoFalta(AHORA + ms, AHORA, en))), [30 * 60_000, 5 * 3_600_000, DIA, 3 * DIA].map((ms) => enCuanto(AHORA + ms, AHORA, en)));
comprueba("enCuanto en español no cambió", enCuanto(AHORA + 2 * DIA, AHORA) === "en 2 días" && enCuanto(AHORA + 5 * 3_600_000, AHORA) === "en 5 h" && enCuanto(AHORA + 30 * 60_000, AHORA) === "en menos de una hora" && enCuanto(AHORA + DIA, AHORA) === "en 1 día", enCuanto(AHORA + DIA, AHORA));
const plan = modeloParaSuPlan("opus", "free", en);
comprueba("modeloParaSuPlan en inglés", plan.modelo === "sonnet" && !!plan.porque && limpia(plan.porque), plan);
comprueba("modeloParaSuPlan en español no cambió", modeloParaSuPlan("opus", "free").porque === "Nace con sonnet y no con opus: su plan («free») no lo cubre, y cada turno se facturaría aparte.", modeloParaSuPlan("opus", "free").porque);

// La nota de la memoria, con y sin nombre. Su línea es de Munir y sale como la escribió.
for (const nota of [undefined, "las traducciones"]) {
  const reglas: ReglaRouter[] = [{ cuando: ["adeorq"], modelo: "haiku", texto: "router: adeorq -> haiku", nota }];
  const r = recetarConMemoria(ex("oficio"), { ...base, t: en, reglas }, undefined, undefined, { proyecto: "Adeorq", encargo: "x" });
  const ultima = r.porque[r.porque.length - 1];
  comprueba(`la nota de la memoria${nota ? " con nombre" : ""}, en inglés`, /^Your note/.test(ultima) && limpia(ultima.replace("router: adeorq -> haiku", "")), ultima);
  const sin = recetarConMemoria(ex("oficio"), { ...base, reglas }, undefined, undefined, { proyecto: "Adeorq", encargo: "x" });
  comprueba(`la nota de la memoria${nota ? " con nombre" : ""}, en español no cambió`, sin.porque[sin.porque.length - 1] === `Tu nota${nota ? ` «${nota}»` : ""} manda: router: adeorq -> haiku`, sin.porque[sin.porque.length - 1]);
}

// ── 3. Los `Err` de conserje.rs ─────────────────────────────────────────────
// Los bancos corren desde la raíz del repo (`scripts/bancos.mjs`).
const rust = readFileSync(join(process.cwd(), "src-tauri", "src", "conserje.rs"), "utf8").split(/^#\[cfg\(test\)\]/m)[0];
const desescapar = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
const LITERAL = String.raw`"((?:[^"\\]|\\.)*)"`;
const plantillas = new Set<string>();
for (const re of [
  new RegExp(String.raw`Err\(\s*(?:format!\(\s*)?` + LITERAL, "g"),
  new RegExp(String.raw`\.ok_or\(\s*` + LITERAL, "g"),
  new RegExp(String.raw`ok_or_else\(\|\|\s*(?:format!\(\s*)?` + LITERAL, "g"),
  new RegExp(String.raw`map_err\(\|\w+\|\s*format!\(\s*` + LITERAL, "g"),
  new RegExp(String.raw`(?:Some\(\w+\)|None)\s*=>\s*format!\(\s*` + LITERAL, "g"),
]) {
  for (const m of rust.matchAll(re)) plantillas.add(desescapar(m[1]));
}
// No salen nunca en pantalla: «parado» lo recoge quien llama (es parar, no un
// fallo), y la otra es una guarda de programación que `correr` ya hace imposible.
const NO_SE_VEN = new Set(["parado", "Claude va por `correr`"]);
const aprobar = [...plantillas].filter((p) => !NO_SE_VEN.has(p) && /[a-záéíóúñ]{4}/i.test(p));
comprueba(`se sacaron los Err con texto de conserje.rs (${aprobar.length})`, aprobar.length >= 20, aprobar);
for (const plantilla of aprobar) {
  // `{e}`, `{quien}` y `{}` del format! de Rust, rellenos con un dato cualquiera.
  const real = plantilla.replace(/\{\w*\}/g, "claude");
  const enEs = avisoEnSuIdioma(es, real);
  const enEn = avisoEnSuIdioma(en, real);
  comprueba(`Err «${plantilla.slice(0, 70)}»: en español sale igual`, enEs === real, enEs);
  const sinDato = enEn.replace(/claude/g, "");
  comprueba(`Err «${plantilla.slice(0, 70)}»: en inglés cambia y no deja español`, enEn !== real && !ESPANOL.test(sinDato) && !HUECO.test(sinDato), enEn);
}
// Lo que viene con la cola de la salida de errores pegada, y lo que no se conoce.
const cola = avisoEnSuIdioma(en, "claude no devolvió texto · error: out of memory");
comprueba("con la cola de la salida de errores: se traduce la cabeza y se deja la cola", cola === "claude returned no text · error: out of memory", cola);
comprueba("un mensaje del sistema operativo sale como llegó", avisoEnSuIdioma(en, "No se puede encontrar el archivo especificado. (os error 2)") === "No se puede encontrar el archivo especificado. (os error 2)");
comprueba("claude sin texto en su error, en inglés", avisoEnSuIdioma(en, "claude devolvió error: desconocido") === "claude returned an error: unknown", avisoEnSuIdioma(en, "claude devolvió error: desconocido"));

if (fallos) {
  console.log(`\n${fallos} fallo(s)`);
  process.exitCode = 1;
} else {
  console.log("\nTodo en verde.");
}
