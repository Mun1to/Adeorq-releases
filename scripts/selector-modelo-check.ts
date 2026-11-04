// Banco: cambiar de modelo solo en esa sesión, por el selector de `/model`.
//
//   pnpm bancos selector-modelo
//
// `/model sonnet` tecleado cambia la sesión Y guarda «sonnet» como el modelo de
// todas las nuevas (bandeja de la Agenda; medido con la 2.1.302 y leído con la
// 2.1.317: «Set model to … and saved as your default for new sessions»). Un
// toque en «Sonnet» en el móvil le cambiaba a Munir el modelo de fábrica. Por el
// selector (`/model`, cursor a la fila, `s`) vale solo para esa sesión.
//
// Esto prueba dos cosas. Una, que se entiende la pantalla de verdad del
// selector (copiada de un Claude Code 2.1.317 el 2026-11-03). Otra, que el
// conductor llega a la fila y pulsa `s` y NUNCA el Intro (que guardaría el
// modelo como el de siempre), ni un Esc con el selector cerrado (que en un Claude
// trabajando interrumpe el turno). El selector es un doble que cuenta las
// teclas. Con Claude Code de verdad: `scripts/laboratorio/modelo-de-sesion-de-verdad.mjs`.
import { aliasDeLaLinea, enFila, esfuerzoDelSelector, esfuerzoSoloEnLaSesion, filaDe, leerSelector, modeloSoloEnLaSesion, nivelDeLaLinea, PreguntaTrasElegir, type EntradaSelector, type Tiempos } from "../src/lib/selectorDeModelo";

declare const require: (m: string) => { readFileSync(p: string, e: string): string };
const { readFileSync } = require("node:fs");

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto?: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}${visto === undefined ? "" : `\n       visto: ${JSON.stringify(visto)}`}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

// ── 1. La pantalla de verdad ────────────────────────────────────────────────
const DEVERDAD = [
  "   Select model",
  "   Switch between Claude models. Your pick becomes the default for new sessions. For other/previous model names, specify with --model.",
  "     1.  Default (recommended)  Sonnet 5.5 · Efficient for routine tasks",
  "     2.  Opus 5.5               For complex work and everyday tasks",
  "   ❯ 3.  Sonnet 5.5 ✔           Most efficient for simpler tasks",
  "     4.  Fable 5.1              For your toughest challenges",
  "     5.  Haiku 5.5              Fastest for quick answers",
  "     6.  Haiku 4.5              Fastest for quick answers",
  "     7.  Sonnet 5               Efficient for routine tasks",
  "     8.  Opus 5                 Best for everyday, complex tasks",
  "     9.  Fable 5                Most capable for your hardest and longest-running tasks",
  "   ↓ 10. Opus 4.8               Best for everyday, complex tasks",
  "      … +3 models",
  "   ◐ Medium effort (default) ←/→ to adjust",
  "   Use /fast to turn on Fast mode (Opus 5.5).",
  "   Enter to set as default · s to use this session only · Esc to cancel",
];
const filas = leerSelector(DEVERDAD);
comprueba("la pantalla de verdad se reconoce y trae diez filas", filas?.length === 10, filas?.length);
comprueba("el cursor está en la 3 y es también la de ahora (✔)", filas?.find((f) => f.cursor)?.n === 3 && filas?.find((f) => f.actual)?.n === 3, filas);
comprueba("el nombre no se lleva el ✔ ni la descripción", filas?.[2].nombre === "Sonnet 5.5" && filas?.[0].nombre === "Default (recommended)", filas?.map((f) => f.nombre));
comprueba("la fila con flecha de «hay más» (10) cuenta y no es el cursor", filas?.[9].n === 10 && filas?.[9].nombre === "Opus 4.8" && !filas?.[9].cursor, filas?.[9]);
comprueba("un Claude Code sin selector no se reconoce", leerSelector(["❯ /model", "  ⏵⏵ auto mode on"]) === null);
comprueba("ni si no puede leerse la pantalla", leerSelector(null) === null);
comprueba("ni otra versión sin el pie de «s» (no sabría seguir)", leerSelector(DEVERDAD.filter((l) => !/this session only/.test(l))) === null);
// Una conversación que cita esas palabras (la de quien trabaja en este archivo). Creérselo
// acababa en un Esc con el selector cerrado, que le corta el turno.
const CAJA = ["────────", "❯ ", "────────", "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt"];
comprueba("una conversación que cite las dos frases no es el selector", leerSelector(["● Busca «Select model» y el pie «Enter to set as default · s to use this session only».", "  1. opus", ...CAJA]) === null);
comprueba("ni aunque las cite en filas enteras, con la caja debajo", leerSelector(["   Select model", "     1.  Opus 5.5", "   Enter to set as default · s to use this session only · Esc to cancel", ...CAJA]) === null);
comprueba("una lista numerada encima del selector no son filas suyas", leerSelector(["● Pasos:", "  1. opus primero", "  2. luego sonnet", ...DEVERDAD])?.[0].nombre === "Default (recommended)", leerSelector(["  1. opus primero", ...DEVERDAD])?.[0]);
// Copiada de una terminal baja de verdad (cuatro en la cuadrícula, 2.1.317): se ven dos filas.
const BAJA = [
  "   Select model",
  "   ↑ 3. Fable                  Fable 5.1 · Most capable for your hardest and",
  "                               longest-running tasks · $10/$50 per Mtok",
  "   ❯ 4. Sonnet ✔               Sonnet 5.5 · Efficient for routine tasks · $2/$10",
  "                               per Mtok",
  "      … +1 model",
  "   ◐ Medium effort (default) ←/→ to adjust",
  "   Enter to set as default · s to use this session only · Esc to cancel",
];
comprueba("en una terminal baja se leen las filas que se ven", leerSelector(BAJA)?.map((f) => `${f.n} ${f.nombre}`).join() === "3 Fable,4 Sonnet", leerSelector(BAJA));
comprueba("y aunque el título se haya ido por arriba", leerSelector(BAJA.slice(1))?.length === 2);
comprueba("el esfuerzo se lee de su línea", esfuerzoDelSelector(BAJA) === "medium" && esfuerzoDelSelector(["   ◉ xHigh effort ←/→ to adjust"]) === "xhigh" && esfuerzoDelSelector(["sin esa línea"]) === null);
comprueba("`/effort high` es un nivel; `/effort` solo y `/model opus` no", nivelDeLaLinea("/effort high") === "high" && nivelDeLaLinea("/effort") === null && nivelDeLaLinea("/model opus") === null);

const f = (a: string) => (filas ? filaDe(filas, a)?.n : undefined);
comprueba("opus es la fila 2 («Opus 5.5», no «Opus 5» ni «Opus 4.8»)", f("opus") === 2, f("opus"));
comprueba("sonnet es la 3, haiku la 5 (la nueva), fable la 4 y default la 1", f("sonnet") === 3 && f("haiku") === 5 && f("fable") === 4 && f("default") === 1, [f("sonnet"), f("haiku"), f("fable"), f("default")]);
comprueba("lo que no está, no sale (ni uno vacío)", f("gpt") === undefined && f("") === undefined);

comprueba("`/model opus` es de Claude; `/model set flash` (Gemini), `/effort high` y `/model` solos no",
  aliasDeLaLinea("/model opus") === "opus" && aliasDeLaLinea("/model set flash") === null && aliasDeLaLinea("/effort high") === null && aliasDeLaLinea("/model") === null,
  [aliasDeLaLinea("/model opus"), aliasDeLaLinea("/model set flash"), aliasDeLaLinea("/effort high"), aliasDeLaLinea("/model")]);

// ── 2. El conductor, contra un selector que cuenta las teclas ───────────────
const MODELOS: { n: number; nombre: string; alias: string }[] = [
  { n: 1, nombre: "Default (recommended)", alias: "default" },
  { n: 2, nombre: "Opus 5.5", alias: "opus" },
  { n: 3, nombre: "Sonnet 5.5", alias: "sonnet" },
  { n: 4, nombre: "Fable 5.1", alias: "fable" },
  { n: 5, nombre: "Haiku 5.5", alias: "haiku" },
];

class ClaudeDeMentira implements EntradaSelector {
  caja = "";
  abierto = false;
  cursor = 2;
  /** El modelo de esta sesión y el que se guarda para las nuevas. */
  sesion = "sonnet";
  porDefecto = "sonnet";
  teclas: string[] = [];
  escapes = 0;
  intros = 0;
  /** El primer Intro solo acepta la sugerencia (visto una vez en una de dos pasadas). */
  ignoraElPrimerIntro = false;
  /** Ocupado trabajando: `/model` no abre nada. */
  sinAbrir = false;
  /** Tras elegir no vuelve a la caja: pide confirmar («Switch to Fable 5.1?»). */
  preguntaTrasElegir = false;
  /** Lo que se ve en vez de la caja: una pregunta de permisos, por ejemplo. */
  otraPantalla: string[] | null = null;
  /** Filas que caben: en una terminal baja el selector enseña solo unas. */
  ventana = MODELOS.length;
  /** El esfuerzo en el selector, el de esta sesión y el guardado. `null`: el modelo no tiene. */
  niveles: string[] | null = ["low", "medium", "high", "xhigh"];
  nivel = 1;
  esfuerzoSesion = "medium";
  esfuerzoPorDefecto = "medium";
  private ignorado = false;
  private preguntando = false;
  private desde = 0;

  async escribir(t: string) {
    this.teclas.push(t);
    if (this.abierto) {
      // Como el de verdad: de la última a la primera y al revés.
      if (t === "\x1b[B") this.cursor = (this.cursor + 1) % MODELOS.length;
      else if (t === "\x1b[A") this.cursor = (this.cursor + MODELOS.length - 1) % MODELOS.length;
      else if (this.niveles && t === "\x1b[C") this.nivel = Math.min(this.niveles.length - 1, this.nivel + 1);
      else if (this.niveles && t === "\x1b[D") this.nivel = Math.max(0, this.nivel - 1);
      else if (t === "s") {
        this.sesion = MODELOS[this.cursor].alias;
        if (this.niveles) this.esfuerzoSesion = this.niveles[this.nivel];
        this.abierto = false;
        this.preguntando = this.preguntaTrasElegir;
      } else if (t === "\r") {
        this.intros++;
        this.sesion = this.porDefecto = MODELOS[this.cursor].alias;
        if (this.niveles) this.esfuerzoSesion = this.esfuerzoPorDefecto = this.niveles[this.nivel];
        this.abierto = false;
      } else if (t === "\x1b") {
        this.escapes++;
        this.abierto = false;
      }
      return;
    }
    if (t === "\x1b") {
      this.escapes++;
      return;
    }
    if (t === "\x15") {
      this.caja = "";
      return;
    }
    if (t === "\r") {
      if (this.caja !== "/model" || this.sinAbrir) return;
      if (this.ignoraElPrimerIntro && !this.ignorado) {
        this.ignorado = true;
        return;
      }
      this.abierto = true;
      this.caja = "";
      this.cursor = Math.max(0, MODELOS.findIndex((m) => m.alias === this.sesion));
      this.desde = Math.max(0, Math.min(this.cursor, MODELOS.length - this.ventana));
      return;
    }
    this.caja += t;
  }
  pantalla(): string[] {
    if (this.otraPantalla) return this.otraPantalla;
    if (this.preguntando) return [" Switch to Fable 5.1?", " ❯ 1. Yes", "   2. No"];
    if (!this.abierto) return [" ▐▛███▛█   Claude Code v2.1.317", "────────", `❯ ${this.caja}`, "────────", "  ⏵⏵ auto mode on (shift+tab to cycle)"];
    // La ventana sigue al cursor, y la primera y la última que se ven llevan flecha si
    // hay más por ese lado (o el cursor, que tapa la flecha).
    if (this.cursor < this.desde) this.desde = this.cursor;
    if (this.cursor >= this.desde + this.ventana) this.desde = this.cursor - this.ventana + 1;
    const hasta = this.desde + this.ventana;
    const marca = (i: number) => {
      if (i === this.cursor) return "   ❯ ";
      if (i === this.desde && i > 0) return "   ↑ ";
      if (i === hasta - 1 && hasta < MODELOS.length) return "   ↓ ";
      return "     ";
    };
    return [
      "   Select model",
      "   Switch between Claude models. Your pick becomes the default for new sessions.",
      ...MODELOS.slice(this.desde, hasta).map((m, i) => `${marca(i + this.desde)}${m.n}.  ${m.nombre}${m.alias === this.sesion ? " ✔" : ""}           una descripción`),
      ...(hasta < MODELOS.length ? [`      … +${MODELOS.length - hasta} models`] : []),
      ...(this.niveles ? [`   ◐ ${this.niveles[this.nivel]} effort ←/→ to adjust`] : []),
      "   Enter to set as default · s to use this session only · Esc to cancel",
    ];
  }
  async esperar() {}
}
const RAPIDO: Tiempos = { antesDelIntro: 0, abrir: 1000, entreFlechas: 0, cursor: 1000, cerrar: 1000, cada: 100 };
const intenta = async (c: ClaudeDeMentira, alias: string) => {
  try {
    await modeloSoloEnLaSesion(c, alias, RAPIDO);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

void (async () => {
  {
    const c = new ClaudeDeMentira();
    const err = await intenta(c, "opus");
    comprueba("a opus: sube una fila y pulsa s, y la sesión pasa a opus", err === null && c.sesion === "opus", { err, sesion: c.sesion });
    comprueba("el modelo guardado para las sesiones nuevas NO cambia (ningún Intro con el selector abierto)", c.porDefecto === "sonnet" && c.intros === 0, { porDefecto: c.porDefecto, intros: c.intros });
    comprueba("ni se pulsó Esc de más", c.escapes === 0, c.escapes);
    comprueba("las teclas son justo las que tocan", JSON.stringify(c.teclas) === JSON.stringify(["/model", "\r", "\x1b[A", "s"]), c.teclas);
  }
  {
    const c = new ClaudeDeMentira();
    const err = await intenta(c, "haiku");
    comprueba("a haiku: baja dos filas", err === null && c.sesion === "haiku" && c.teclas.filter((t) => t === "\x1b[B").length === 2 && c.porDefecto === "sonnet", { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    const err = await intenta(c, "sonnet");
    comprueba("a sonnet, que ya está: ni una flecha", err === null && c.teclas.every((t) => !t.startsWith("\x1b")) && c.sesion === "sonnet", { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.ignoraElPrimerIntro = true;
    const err = await intenta(c, "opus");
    comprueba("si el primer Intro solo aceptó la sugerencia, manda otro y llega igual", err === null && c.sesion === "opus" && c.intros === 0, { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    const err = await intenta(c, "gpt");
    comprueba("un modelo que el selector no ofrece: error claro, selector cerrado con Esc y nada guardado", !!err && /gpt/.test(err) && c.escapes === 1 && !c.abierto && c.porDefecto === "sonnet" && c.sesion === "sonnet", { err, escapes: c.escapes });
  }
  {
    const c = new ClaudeDeMentira();
    c.sinAbrir = true;
    const err = await intenta(c, "opus");
    comprueba("si el selector no se abre (Claude ocupado): error, y NINGÚN Esc (interrumpiría su turno)", !!err && c.escapes === 0 && c.sesion === "sonnet", { err, escapes: c.escapes });
    comprueba("y la orden que quedó escrita en la caja se borra", c.caja === "", c.caja);
  }
  {
    const c = new ClaudeDeMentira();
    c.caja = "mi borrador a medias";
    const err = await intenta(c, "opus");
    comprueba("con un borrador en la caja: error y NI UNA tecla (el Intro se lo mandaba al modelo)", !!err && c.teclas.length === 0 && c.caja === "mi borrador a medias", { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.otraPantalla = [" Do you want to proceed?", " ❯ 1. Yes", "   2. No"];
    const err = await intenta(c, "opus");
    comprueba("con una pregunta en pantalla: error y ni una tecla (se la contestaría)", !!err && c.teclas.length === 0, { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.otraPantalla = ["PS C:\\proyectos> "];
    const err = await intenta(c, "opus");
    comprueba("con el CLI cerrado y la consola delante: ni una tecla", !!err && c.teclas.length === 0, { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.preguntaTrasElegir = true;
    let lanzado: unknown = null;
    await modeloSoloEnLaSesion(c, "fable", RAPIDO).catch((e) => (lanzado = e));
    comprueba("si tras elegir pide confirmar: lo dice, sin contestar ni Esc", lanzado instanceof PreguntaTrasElegir && c.escapes === 0 && c.teclas.at(-1) === "s", { lanzado, teclas: c.teclas });
  }

  // Una terminal baja: las filas que hacen falta no se ven al abrir (era «no ofrece opus»).
  for (const [alias, esperado] of [["opus", "opus"], ["default", "default"], ["fable", "fable"], ["haiku", "haiku"], ["sonnet", "sonnet"]] as const) {
    const c = new ClaudeDeMentira();
    c.ventana = 2;
    const err = await intenta(c, alias);
    comprueba(`en una terminal de dos filas, a ${alias}`, err === null && c.sesion === esperado && c.porDefecto === "sonnet" && c.intros === 0 && c.escapes === 0, { err, sesion: c.sesion, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.ventana = 2;
    c.sesion = "haiku";
    const err = await intenta(c, "gpt");
    comprueba("en una terminal baja, lo que no está se dice tras mirarlas todas, sin dar vueltas", !!err && /gpt/.test(err) && /Default/.test(err) && /Haiku/.test(err) && c.escapes === 1 && !c.abierto && c.sesion === "haiku", { err, teclas: c.teclas.length });
  }

  // El esfuerzo: `/effort high` escrito guarda el de fábrica, por el selector no.
  {
    const c = new ClaudeDeMentira();
    await esfuerzoSoloEnLaSesion(c, "xhigh", RAPIDO);
    comprueba("a xhigh: dos a la derecha, s y el modelo no se mueve", JSON.stringify(c.teclas) === JSON.stringify(["/model", "\r", "\x1b[C", "\x1b[C", "s"]) && c.esfuerzoSesion === "xhigh" && c.sesion === "sonnet", c.teclas);
    comprueba("el esfuerzo de fábrica sigue como estaba", c.esfuerzoPorDefecto === "medium" && c.intros === 0);
  }
  {
    const c = new ClaudeDeMentira();
    await esfuerzoSoloEnLaSesion(c, "low", RAPIDO);
    comprueba("a low: uno a la izquierda", c.esfuerzoSesion === "low" && c.teclas.filter((t) => t === "\x1b[D").length === 1, c.teclas);
  }
  {
    const c = new ClaudeDeMentira();
    let err = "";
    await esfuerzoSoloEnLaSesion(c, "max", RAPIDO).catch((e) => (err = String(e)));
    comprueba("un nivel que este modelo no da: error, cerrado y nada cambiado", /max/.test(err) && !c.abierto && c.esfuerzoSesion === "medium" && c.esfuerzoPorDefecto === "medium", { err, teclas: c.teclas });
  }
  {
    const c = new ClaudeDeMentira();
    c.niveles = null;
    let err = "";
    await esfuerzoSoloEnLaSesion(c, "high", RAPIDO).catch((e) => (err = String(e)));
    comprueba("un modelo sin esfuerzo: lo dice y cierra", /no deja elegir/.test(err) && c.escapes === 1 && !c.abierto, { err });
  }

  // ── 3. Varias órdenes seguidas ─────────────────────────────────────────────
  {
    const pasos: string[] = [];
    const teclear = async (l: string) => {
      pasos.push(`empieza ${l}`);
      await new Promise((r) => setTimeout(r, 30));
      if (l === "/rota") throw new Error("no pudo");
      pasos.push(`acaba ${l}`);
    };
    const nada = async () => {};
    const sigue = await enFila(["/model opus", "/rota", "/effort high"], teclear, nada);
    comprueba(
      "cada orden empieza cuando ha acabado la anterior, y una que falla no para las demás",
      sigue && pasos.join(",") === "empieza /model opus,acaba /model opus,empieza /rota,empieza /effort high,acaba /effort high",
      pasos,
    );
    let tecleadas = 0;
    const seQueda = await enFila(
      ["/model fable", "/effort high"],
      async () => {
        tecleadas++;
        throw new PreguntaTrasElegir("pregunta");
      },
      nada,
    );
    comprueba("si Claude Code se queda preguntando no se teclea nada más", !seQueda && tecleadas === 1, { seQueda, tecleadas });
    // `/model opus` + `/effort high` + mensaje, de verdad contra el doble: la orden
    // que va detrás no le da su Intro al selector abierto.
    const c = new ClaudeDeMentira();
    const ok = await enFila(
      ["/model opus", "/effort high"],
      async (l) => {
        if (l.startsWith("/model")) await modeloSoloEnLaSesion(c, "opus", RAPIDO);
        else await esfuerzoSoloEnLaSesion(c, "high", RAPIDO);
      },
      nada,
    );
    comprueba("/model y /effort seguidos: la sesión cambia y lo de fábrica no", ok && c.sesion === "opus" && c.esfuerzoSesion === "high" && c.porDefecto === "sonnet" && c.esfuerzoPorDefecto === "medium" && c.intros === 0, { sesion: c.sesion, esfuerzo: c.esfuerzoSesion, porDefecto: c.porDefecto, intros: c.intros });
  }

  // ── 4. Quien llama no puede volver a los tiempos fijos ──────────────────────
  // Con un `setTimeout` por orden, el Intro de `/effort` caía en el selector abierto y
  // guardaba el modelo como el de siempre (medido con Claude Code 2.1.317, 2026-11-03).
  {
    const app = readFileSync("src/App.tsx", "utf8");
    comprueba("App.tsx no programa órdenes con un reloj", !/setTimeout\([^)]*teclearOrden/.test(app) && !/teclearOrden\(/.test(app));
    const pty = readFileSync("src/lib/pty.ts", "utf8");
    comprueba("teclearOrden lleva el /model y el /effort de Claude por el selector", /modeloSoloEnLaSesion\(io, alias\)/.test(pty) && /esfuerzoSoloEnLaSesion\(io, /.test(pty));
  }
  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
