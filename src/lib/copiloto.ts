// El copiloto: mira la sesión que tienes delante y te dice si hay un sitio
// mejor donde estar haciendo eso.
//
// ── POR QUÉ ESTO NO PUEDE VIVIR DENTRO DE UN CLI ──────────────────────────
//
// Claude Code no sabe que tienes Codex instalado. No sabe cuánta semana te
// queda en tu segunda cuenta. No sabe que Gemini Flash está hoy al 75 % de
// descuento. Y no puede saberlo: un cliente ve su propia sesión y nada más.
//
// Adeorq sí, porque está por encima de los 21. Esa es la frase entera y es de
// Munir (2026-08-19): «no sé si ya dentro de un cliente que está hablando
// contigo en Claude puede saber si es mejor pararme y abrir otra terminal con
// otro cliente. Porque creo que eso no lo puede hacer». No puede. Un panel sí.
//
// ── QUÉ HACE Y QUÉ NO ─────────────────────────────────────────────────────
//
// Exactamente lo mismo que `vigia.ts`, del que es hermano y con el que comparte
// la memoria y la moderación: mira, y si algo merece tu atención lo PROPONE.
// No cambia de modelo, no abre terminales, no escribe en ningún PTY. La
// decisión sigue siendo de Munir, siempre. La diferencia con el vigía es dónde
// mira: aquél vigila una CUADRILLA leyendo su BUZON.md; este vigila UNA SESIÓN
// leyendo lo que ya se sabe de ella.
//
// ── DE DÓNDE SACA LO QUE SABE, QUE ES LO QUE LO HACE DEFENDIBLE ──────────
//
// De cuatro cosas que Adeorq ya lee, sin gastar un token y sin preguntarle a
// ningún modelo:
//
//   1. Las HERRAMIENTAS que la sesión ha usado (`sessionActivity`). Veinticuatro
//      lecturas y ni una edición es trabajo de leer, y eso no hay que
//      adivinarlo ni preguntarlo: está escrito en el transcript.
//   2. El ÚLTIMO ENCARGO que le diste, que es lo que `exigenciaDeRol` sabe
//      clasificar en recado, oficio o juicio.
//   3. El CONTEXTO de verdad (`sessionContext`), que es lo que permite decir un
//      precio en dólares en vez de un precio por millón.
//   4. Las CUOTAS de tus cuentas, que es lo único que convierte «podrías usar
//      otro» en «te conviene usar otro».
//
// Nada de aquí es una opinión sobre qué modelo es más listo. Esa tabla no
// existe y no se va a inventar (`router.ts` ya lo dice de sí mismo). Lo que se
// dice es lo medible: qué cuesta, cuánto queda y qué está pasando.

import { costeDe, rangoDe, comoRango, type PrecioModelo, type Via } from "./coste";
import { exigenciaDeRol, PESO, type CuentaViva, type Exigencia, type Trabajo } from "./router";
import type { ModelAlias } from "./models";
import { providerOf, sabe } from "./providers";
import type { WorkState } from "./pty";

const MIN = 60_000;

/** Una sesión tal como la ve el copiloto. Todo son datos que Adeorq ya lee. */
export interface SesionVista {
  sessionId: string;
  cwd: string;
  proyecto: string;
  /** Id de proveedor: "claude", "codex"… */
  cli: string;
  /** El cerebro que lleva puesto, si se sabe. */
  modelo?: ModelAlias;
  /** Etiqueta de la cuenta con la que corre. */
  cuenta?: string;
  /** Tokens que ya lleva la conversación, del transcript. */
  contexto: number;
  /** Los que caben. Cero significa que no se ha podido leer. */
  ventana: number;
  estado: WorkState;
  /** Cuándo se abrió, para el periodo de gracia. */
  nacida: number;
  /** El último encargo que le diste. De aquí sale la clase de la tarea. */
  ultimoEncargo?: string;
  /** Las herramientas usadas, por nombre y repetidas tal como salieron. */
  herramientas: string[];
}

/** Lo que hace falta saber del resto del mundo para poder proponer algo. */
export interface MundoCopiloto {
  cuentas: CuentaViva[];
  /** Los modelos de OpenRouter con sus precios, si se han podido bajar. */
  precios?: Record<string, PrecioModelo & { nombre: string }>;
  /** Los que están de oferta hoy, del más rebajado al menos. */
  promos?: Array<{ id: string; nombre: string; descuento: number }>;
  /** Si hay clave de OpenRouter guardada. Sin ella, proponer la vía de API
      sería mandarle a una pantalla que le pide una clave que no tiene. */
  hayClaveApi?: boolean;
}

export type ClaseConsejo = "derroche" | "relevo" | "porApi" | "contexto";

export interface Consejo {
  clase: ClaseConsejo;
  /** La mitad de la llave anti-repetición, junto con la sesión. */
  sujeto: string;
  /** La línea, ya escrita, tal como irá a la bandeja de la Agenda. */
  texto: string;
}

/** Cuánto pesa cada consejo cuando saltan varios a la vez en la misma sesión. */
const PRIORIDAD: Record<ClaseConsejo, number> = {
  contexto: 4,
  relevo: 3,
  derroche: 2,
  porApi: 1,
};

/** Las que se dicen en el modo prudente. Las otras dos son de afinar. */
const GORDOS: ClaseConsejo[] = ["contexto", "relevo"];

/* ── Umbrales ─────────────────────────────────────────────────────────────
   Todos con su porqué. Un número sin motivo es un número que alguien va a
   cambiar a ojo dentro de tres meses. */

/** Nada durante los primeros minutos: al abrir, una sesión no ha hecho nada
    todavía y cualquier lectura de lo que «está pasando» sería un invento. */
export const GRACIA = 6 * MIN;
/** Menos herramientas que esto y no se sabe de qué va: una sesión que lleva
    tres lecturas puede acabar en cualquier cosa. */
export const MINIMO_HERRAMIENTAS = 12;
/** A partir de aquí el contexto va lleno de verdad y conviene partir la tarea.
    No es el 100 % a propósito: avisar cuando ya se ha compactado no sirve. */
export const CONTEXTO_LLENO = 75;
/** Semana gastada a partir de la cual mirar a otro sitio deja de ser un
    capricho. Es el mismo de `router.ts` y por el mismo motivo. */
export const APRETADA = 78;
/** Y a partir de aquí, la vía de API deja de ser una curiosidad. */
export const CASI_AGOTADA = 88;
/** Un derroche solo se dice si de verdad es gordo: un opus donde tocaba sonnet
    no arruina nada, y avisar de eso cada rato acaba en silenciarlo. */
export const SALTO_GORDO = 4;
/** Entre dos consejos de la misma sesión, y de cualquiera. La bandeja es una
    sola y la comparte con el vigía. */
export const ENFRIA_SESION = 20 * MIN;
export const ENFRIA_TODO = 6 * MIN;
/** Tope por sesión en toda su vida. Menos que el vigía porque una sesión dura
    más que una cuadrilla y aquí no hay nada que «termine». */
export const TOPE = 4;

/* ── Qué está pasando de verdad ──────────────────────────────────────────── */

/** Las herramientas agrupadas por qué significan. Los nombres son los que el
    transcript escribe, así que esta tabla se lee del mismo sitio que la de
    `conversacion.ts` y por eso no se pueden separar sin que se note. */
const LEER = ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookRead"];
const ESCRIBIR = ["Edit", "Write", "NotebookEdit", "MultiEdit"];
const EJECUTAR = ["Bash", "PowerShell"];

/**
 * De qué va lo que está haciendo, deducido de lo que YA HA HECHO.
 *
 * Es la pieza que hace que esto no necesite preguntarle nada a ningún modelo.
 * Veinticuatro lecturas y ni una edición no es una interpretación, es una
 * cuenta: eso es trabajo de leer. Y saberlo es lo que permite decir «esto lo
 * aguanta mejor un modelo con mucho contexto» sin opinar sobre nadie.
 *
 * Se mira la PROPORCIÓN y no el total, porque una sesión larga acumula de todo:
 * lo que distingue leer de escribir es cuánto pesa cada cosa, no cuántas veces
 * pasó.
 */
export function trabajoDe(herramientas: string[]): Trabajo {
  if (herramientas.length === 0) return "codigo";
  const cuenta = (lista: string[]) => herramientas.filter((h) => lista.includes(h)).length;
  const leer = cuenta(LEER);
  const escribir = cuenta(ESCRIBIR);
  const ejecutar = cuenta(EJECUTAR);
  const total = herramientas.length;

  // Casi todo lecturas, y lo demás anecdótico: está estudiando algo, no
  // tocándolo. Una edición o un comando sueltos entre treinta lecturas son
  // ruido —un `git log`, un `ls`, arreglar una coma— y no cambian de qué va la
  // sesión. Por eso el umbral es «uno», y no «ninguno»: con cero, cualquier
  // comprobación suelta convertiría una lectura entera en trabajo de código.
  if (leer / total > 0.8 && escribir + ejecutar <= 1) return "lectura";
  // Y si escribe o ejecuta de verdad, es código por muchas lecturas que lleve
  // detrás: para escribir hay que leer antes, así que las lecturas de una
  // sesión de código son mayoría igualmente.
  if (escribir + ejecutar > 0) return "codigo";
  return "lectura";
}

/**
 * Qué exige lo que está pasando en esta sesión.
 *
 * El encargo manda cuando lo hay, porque «audita el login» dice más que
 * cualquier recuento de herramientas. Cuando no lo hay, se cae a lo que se ha
 * hecho, que es peor pero no es inventado.
 *
 * ⚠ LÍMITE CONOCIDO, medido el 2026-08-19. `exigenciaDeRol` se apoya en
 * `modelForRole`, que busca palabras sueltas dentro del texto, y esa tabla nació
 * para ROLES («Seguridad», «Bugs»), no para una frase entera. Con texto libre da
 * falsos positivos: «añade un botón de descarga a la web de seguridad social»
 * sale clasificado como juicio por la palabra «seguridad».
 *
 * No se arregla aquí y hay dos motivos. El primero es que el error cae del lado
 * bueno: pasarse a juicio hace que el copiloto SE CALLE (el veto de `porApi` y
 * el de `derroche` no dejan hablar de algo que cree importante), y un consejo
 * que falta molesta menos que uno equivocado. El segundo es que esa tabla la
 * comparten el router y el Capataz: tocarla desde aquí cambiaría decisiones en
 * sitios que hoy funcionan, y eso no es lo que este archivo vino a hacer.
 */
export function exigenciaDe(s: SesionVista): Exigencia {
  const trabajo = trabajoDe(s.herramientas);
  if (!s.ultimoEncargo?.trim()) {
    // Sin encargo no se puede saber la consecuencia, y suponer «alta» haría
    // saltar avisos de juicio en cualquier sesión callada. Se supone lo llano.
    return { clase: "oficio", consecuencia: "baja", largo: false, trabajo };
  }
  const ex = exigenciaDeRol(s.ultimoEncargo, trabajo);
  return { ...ex, largo: s.contexto > 200_000 };
}

/* ── Los consejos ────────────────────────────────────────────────────────── */

/** El cerebro que pide cada clase, igual que en el router. */
const POR_CLASE: Record<Exigencia["clase"], ModelAlias> = {
  recado: "haiku",
  oficio: "sonnet",
  juicio: "opus",
};

/** La más fresca de las cuentas vivas de un CLI, o nada. */
function masFresca(mundo: MundoCopiloto, cli: string): CuentaViva | undefined {
  const suyas = mundo.cuentas.filter(
    (c) => c.cuenta.provider === cli && c.instalado && c.conectada,
  );
  if (!suyas.length) return undefined;
  return [...suyas].sort((a, b) => (a.gastado ?? 50) - (b.gastado ?? 50))[0];
}

/**
 * En qué es razonable relevar, y por qué.
 *
 * Es la MISMA tabla de `router.ts` y con la misma advertencia: es la opinión de
 * la casa, no una medida, así que solo entra en juego cuando ya hay un motivo
 * objetivo para no seguir donde estás (no queda semana). Nunca para adelantar a
 * nadie.
 */
const RELEVOS: Array<{ cli: string; fuerte: Trabajo[]; porque: string }> = [
  { cli: "codex", fuerte: ["codigo", "texto"], porque: "es el relevo más parecido para código" },
  { cli: "agy", fuerte: ["lectura", "diseno"], porque: "aguanta bien leer mucho de golpe" },
  { cli: "gemini", fuerte: ["lectura", "texto"], porque: "va sobrado de contexto para leer" },
  { cli: "opencode", fuerte: ["codigo"], porque: "está conectado y sirve para esto" },
  { cli: "qwen", fuerte: ["codigo"], porque: "está conectado y sirve para esto" },
];

/**
 * Qué le diría el copiloto a esta sesión, ahora mismo.
 *
 * Puro: entra una foto y salen frases. Ni una llamada a nadie.
 */
export function consejosDe(s: SesionVista, mundo: MundoCopiloto): Consejo[] {
  const fuera: Consejo[] = [];
  const ex = exigenciaDe(s);
  const mia = mundo.cuentas.find(
    (c) => c.cuenta.provider === s.cli && c.cuenta.label === s.cuenta,
  );
  const gastado = mia?.gastado;

  // 1. El contexto, que es el único que avisa de algo que va a pasar y no de
  //    algo que ya pasa. Cuando se llena, el CLI compacta y se pierde detalle.
  if (s.ventana > 0) {
    const pct = Math.round((s.contexto / s.ventana) * 100);
    if (pct >= CONTEXTO_LLENO) {
      fuera.push({
        clase: "contexto",
        sujeto: `${Math.floor(pct / 10)}0`,
        texto: `en ${s.proyecto} la conversación va por el ${pct} % de su contexto: si te queda trabajo, mejor partirlo en dos encargos antes de que compacte`,
      });
    }
  }

  // 2. El relevo, que es LA pregunta de Munir. Solo con un motivo objetivo
  //    delante: que no quede semana. Sin eso, mandar a otro CLI sería opinar.
  if (gastado != null && gastado >= APRETADA) {
    const suyos = RELEVOS.filter((r) => r.fuerte.includes(ex.trabajo));
    for (const r of [...suyos, ...RELEVOS.filter((x) => !suyos.includes(x))]) {
      if (r.cli === s.cli) continue;
      const otra = masFresca(mundo, r.cli);
      if (!otra) continue;
      // Y solo si al otro le queda MÁS que a ti: cambiar de un 80 % a un 85 %
      // es moverse para nada.
      const suya = otra.gastado;
      if (suya != null && suya >= gastado - 10) continue;
      const queda = suya != null ? ` (${suya} % gastado)` : "";
      fuera.push({
        clase: "relevo",
        sujeto: r.cli,
        texto: `en ${s.proyecto} llevas el ${gastado} % de semana gastado y esto es trabajo de ${ex.trabajo}: ${nombreCli(r.cli)}${queda} ${r.porque}, ¿sigues ahí?`,
      });
      break;
    }
  }

  // 3. El derroche: un cerebro caro para algo que no lo pide. Solo si el salto
  //    es gordo de verdad, que es la misma regla que el aviso del router.
  if (s.modelo) {
    const toca = POR_CLASE[ex.clase];
    const salto = PESO[s.modelo] - PESO[toca];
    if (salto >= SALTO_GORDO && ex.clase === "recado" && ex.consecuencia === "baja") {
      fuera.push({
        clase: "derroche",
        sujeto: `${s.modelo}>${toca}`,
        texto: `en ${s.proyecto} llevas ${s.modelo} y lo que estás haciendo es un recado: con ${toca} sale unas ${Math.round(PESO[s.modelo] / PESO[toca])} veces más barato por el mismo resultado`,
      });
    }
  }

  // 4. La vía de API, que es el puente que hoy no existe entre las dos
  //    economías de Adeorq: la suscripción se paga en cuota, la clave en
  //    dólares. Solo cuando la cuota está para acabarse, porque si te sobra
  //    semana, gastar dinero de verdad es peor negocio.
  if (
    mundo.hayClaveApi &&
    gastado != null &&
    gastado >= CASI_AGOTADA &&
    s.contexto > 0 &&
    mundo.precios
  ) {
    // Por la vía de API, que NO cachea: es la que Adeorq ofrece de verdad, y
    // calcularla con el patrón del agente daba un precio 8,5 veces más barato
    // del que se acaba pagando.
    const barato = masBaratoPara(ex, mundo, s.contexto || undefined);
    if (barato) {
      const r = rangoDe(barato.precio, s.contexto, ex.largo, "api");
      const oferta = mundo.promos?.find((p) => p.id === barato.id);
      const rebaja = oferta ? `, hoy al ${Math.round(oferta.descuento * 100)} %` : "";
      fuera.push({
        clase: "porApi",
        sujeto: barato.id,
        texto: `en ${s.proyecto} te queda un ${100 - gastado} % de semana: esto mismo por API con ${barato.nombre}${rebaja} costaría ${comoRango(r)} y no tocaría tu cuota`,
      });
    }
  }

  return fuera.sort((a, b) => PRIORIDAD[b.clase] - PRIORIDAD[a.clase]);
}

/**
 * El modelo de API más barato que sirve para esto.
 *
 * «Sirve» es un veto y no una puntuación, y esa distinción es la que mantiene
 * esto honesto: no existe ningún dato público de lo listo que es un modelo, así
 * que aquí NO se ordena por calidad. Lo que se hace es descartar lo que no
 * puede con el encargo (nada barato para algo de juicio) y de lo que queda,
 * coger lo que menos cuesta para ESTA petición.
 *
 * Por defecto se ordena por la vía de API, que es la que se va a proponer. No
 * es lo mismo que ordenar por la del agente: sin caché manda el precio de
 * ENTRADA, y ahí un modelo con entrada barata y caché cara puede adelantar a
 * otro que por la vía del agente iba primero.
 */
export function masBaratoPara(
  ex: Exigencia,
  mundo: MundoCopiloto,
  contexto = 300_000,
  via: Via = "api",
): { id: string; nombre: string; precio: PrecioModelo } | undefined {
  if (!mundo.precios) return undefined;
  // En lo de juicio no se abarata, igual que en el router: una revisión barata
  // que no encuentra el fallo cuesta el trabajo entero otra vez.
  if (ex.clase === "juicio" || ex.consecuencia === "alta") return undefined;

  let mejor: { id: string; nombre: string; precio: PrecioModelo; coste: number } | undefined;
  for (const [id, p] of Object.entries(mundo.precios)) {
    // Un modelo gratis del todo casi siempre es una versión con límites que se
    // cae a la mitad. No se propone: quedar mal recomendando algo que no
    // responde cuesta más que los céntimos que ahorra.
    if (p.entradaMillon <= 0 && p.salidaMillon <= 0) continue;
    const c = costeDe(p, contexto, 1_243, via).total;
    if (!mejor || c < mejor.coste) mejor = { id, nombre: p.nombre, precio: p, coste: c };
  }
  return mejor && { id: mejor.id, nombre: mejor.nombre, precio: mejor.precio };
}

function nombreCli(id: string): string {
  // El nombre bonito sale de la tabla, no de una regla escrita aquí. La primera
  // versión ponía a mano el caso de Antigravity («agy» → «Antigravity»), y
  // `clientes-check.ts` lo cazó: era un nombre propio suelto, que es justo lo
  // que esa prueba existe para impedir. Y encima estaba peor, porque la tabla
  // ya sabe que Claude se llama «Claude Code» y no «Claude».
  return providerOf(id).label;
}

/** Si a esta sesión se le puede siquiera cambiar el cerebro sin reabrirla. */
export function admiteCambioEnVivo(s: SesionVista): boolean {
  return sabe(s.cli, "ajustesEnVivo");
}

export function llaveDe(sessionId: string, c: Consejo): string {
  return `${sessionId}|${c.clase}|${c.sujeto}`;
}

/**
 * De todo lo que se podría decir, qué merece de verdad interrumpir.
 *
 * Misma forma y misma memoria que `vigia.aProponer`, a propósito: los dos
 * escriben en la MISMA bandeja, así que si cada uno llevara su propio
 * enfriamiento, entre los dos podrían soltar diez líneas seguidas y la bandeja
 * dejaría de mirarse. Devuelve como mucho UN consejo por sesión y por vuelta.
 */
export function aProponer(
  sesiones: SesionVista[],
  mundo: MundoCopiloto,
  memoria: MemoriaCopiloto,
  ahora: number,
  modo: ModoCopiloto = "gordas",
): Array<{ sesion: SesionVista; consejo: Consejo }> {
  if (modo === "nunca") return [];
  const fuera: Array<{ sesion: SesionVista; consejo: Consejo }> = [];
  let ultimaGlobal = memoria.ultima;

  for (const s of sesiones) {
    if (ahora - s.nacida < GRACIA) continue;
    // Sin haber hecho nada todavía no se sabe de qué va, y el consejo saldría
    // de un encargo leído a medias.
    if (s.herramientas.length < MINIMO_HERRAMIENTAS && !s.ultimoEncargo?.trim()) continue;
    if ((memoria.vecesDe[s.sessionId] ?? 0) >= TOPE) continue;
    if (ahora - (memoria.ultimaDe[s.sessionId] ?? 0) < ENFRIA_SESION) continue;
    if (ahora - ultimaGlobal < ENFRIA_TODO) continue;

    const elegido = consejosDe(s, mundo)
      .filter((c) => modo === "siempre" || GORDOS.includes(c.clase))
      .find((c) => !memoria.dichos[llaveDe(s.sessionId, c)]);
    if (!elegido) continue;

    fuera.push({ sesion: s, consejo: elegido });
    ultimaGlobal = ahora;
  }
  return fuera;
}

/** Lo que el copiloto recuerda entre vueltas. Mismo trato que el del vigía. */
export interface MemoriaCopiloto {
  dichos: Record<string, number>;
  ultimaDe: Record<string, number>;
  vecesDe: Record<string, number>;
  ultima: number;
}

export function memoriaVacia(): MemoriaCopiloto {
  return { dichos: {}, ultimaDe: {}, vecesDe: {}, ultima: 0 };
}

/** Apunta lo dicho. Se llama DESPUÉS de escribir de verdad: si la escritura
    falla, el consejo no se da por dado y volverá a salir. */
export function anotar(
  m: MemoriaCopiloto,
  sessionId: string,
  c: Consejo,
  ahora: number,
): MemoriaCopiloto {
  return {
    dichos: { ...m.dichos, [llaveDe(sessionId, c)]: ahora },
    ultimaDe: { ...m.ultimaDe, [sessionId]: ahora },
    vecesDe: { ...m.vecesDe, [sessionId]: (m.vecesDe[sessionId] ?? 0) + 1 },
    ultima: ahora,
  };
}

/** Se olvida lo de ayer. Sin esto, la memoria crece para siempre y una sesión
    que vuelve al día siguiente no recibiría nunca más un consejo. */
export function podar(
  m: MemoriaCopiloto,
  ahora: number,
  vida = 24 * 60 * MIN,
): MemoriaCopiloto {
  const vivos: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.dichos)) if (ahora - v < vida) vivos[k] = v;
  return { ...m, dichos: vivos };
}

export type ModoCopiloto = "gordas" | "siempre" | "nunca";

const COPILOTO_KEY = "adeorq-copiloto-modo";

/** Igual que el vigía y el router: por defecto solo lo gordo. */
export function modoCopiloto(): ModoCopiloto {
  const v = localStorage.getItem(COPILOTO_KEY);
  return v === "siempre" || v === "nunca" ? v : "gordas";
}

export function guardarModoCopiloto(m: ModoCopiloto): void {
  localStorage.setItem(COPILOTO_KEY, m);
}
