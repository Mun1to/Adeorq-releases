// El vigía de la cuadrilla: mira, y si algo merece tu atención lo PROPONE.
//
// Es el coordinador del swarm que faltaba, con una decisión tomada antes de
// escribir una línea (Munir, 2026-08-01): vigila y avisa, NUNCA decide ni actúa
// solo. No escribe en ninguna terminal, no abre ni cierra agentes, no manda
// órdenes. Su única escritura en todo el sistema es una línea en la bandeja de
// la Agenda (regla R), que es una propuesta que Munir acepta o descarta.
//
// Eso no es una limitación técnica, es el diseño: un coordinador que actúa solo
// necesita acertar siempre, y aquí acertar depende de leer bien un archivo de
// texto que escriben cinco agentes a la vez. Un coordinador que propone puede
// equivocarse y lo peor que pasa es una línea de más en la bandeja.
//
// Como `router.ts` y `reparto.ts`, esto es PURO: entra una foto de las
// cuadrillas y sale una lista de propuestas. Quien lee el disco y quien escribe
// la bandeja es `components/Vigia.tsx`, y por eso esto se puede comprobar
// entero sin abrir la app (`scripts/vigia-check.ts`).

import { columnaDe, PINTA } from "./estados";
import type { CrewNote, WorkState } from "./pty";

/** Un puesto tal como lo ve el vigía. */
export interface PuestoVisto {
  paneId: number;
  rol: string;
  /** Los archivos que son suyos, si el reparto los calculó. */
  frontera?: string;
  estado: WorkState;
  /** Desde cuándo está en ese estado, en ms. */
  desde: number;
}

/** Una cuadrilla entera, con lo que sus puestos han dejado dicho. */
export interface CuadrillaVista {
  teamId: string;
  objetivo: string;
  /** La carpeta del proyecto: es lo que va en la línea de la bandeja. */
  cwd: string;
  proyecto: string;
  /** Cuándo se abrió. Sin esto no hay periodo de gracia posible. */
  nacida: number;
  puestos: PuestoVisto[];
  notas: CrewNote[];
  /** Cuándo cambió por última vez el BUZON.md. Lo aprende quien sondea
      comparando, porque el archivo no lleva marca dentro. */
  buzonCambio: number;
}

export type ClaseSeñal =
  | "terminada"
  | "frontera"
  | "bloqueo"
  | "entrega"
  | "espera"
  | "quietas";

export interface Señal {
  clase: ClaseSeñal;
  /** De quién o de qué va. Es la mitad de la llave anti-repetición: dos
      bloqueos del mismo puesto son el mismo aviso; el de otro puesto no. */
  sujeto: string;
  /** La línea, ya escrita, tal como irá a la bandeja. */
  texto: string;
}

/** Cuánto pesa cada señal cuando saltan varias del mismo grupo a la vez. */
const PRIORIDAD: Record<ClaseSeñal, number> = {
  terminada: 6,
  frontera: 5,
  bloqueo: 4,
  entrega: 3,
  espera: 2,
  quietas: 1,
};

/** Las gordas: las únicas que se dicen en el modo prudente. */
const GORDAS: ClaseSeñal[] = ["terminada", "frontera", "bloqueo"];

const MIN = 60_000;
/** Nada durante los primeros minutos: una cuadrilla recién abierta siempre
    parece parada, porque los CLIs tardan en arrancar. */
export const GRACIA = 5 * MIN;
/** Un puesto que pide algo y el buzón que no se mueve: está atascado. */
export const BLOQUEO = 10 * MIN;
/** Esperándote. El tablero ya lo enseña; el aviso es para cuando NO lo miras. */
export const ESPERA = 15 * MIN;
/** Todos quietos y el buzón también: o terminaron sin decirlo, o se colgaron. */
export const QUIETAS = 25 * MIN;
/** Entre dos avisos de la misma cuadrilla. */
export const ENFRIA_CUADRILLA = 10 * MIN;
/** Entre dos avisos de cualquier cuadrilla: la bandeja es una sola. */
export const ENFRIA_TODO = 4 * MIN;
/** Tope por cuadrilla en toda su vida. Seis avisos ya son una conversación, y
    una bandeja de treinta líneas deja de mirarse, que es el fallo a evitar. */
export const TOPE = 6;

/** Lo que hace que una nota sea una petición y no un parte de trabajo. */
const PIDE = [
  "necesito",
  "no puedo",
  "me falta",
  "bloquead",
  "bloqueo",
  "esperando",
  "quién",
  "quien puede",
  "duda",
];

function pideAlgo(texto: string): boolean {
  const t = texto.toLowerCase();
  return t.trimEnd().endsWith("?") || PIDE.some((p) => t.includes(p));
}

/** Los trozos con pinta de archivo o carpeta dentro de una frontera. */
function piezasDe(frontera: string): string[] {
  return frontera
    .split(/[,;\s]+/)
    .map((x) => x.trim().replace(/[*]+$/, "").replace(/\/+$/, ""))
    .filter((x) => x.length > 3 && /[\\/.]/.test(x));
}

/**
 * Qué está pasando en esta cuadrilla, ahora mismo.
 *
 * Solo mira: el estado que cada terminal ya reporta y el texto del BUZON.md que
 * los propios puestos escriben. Ni una llamada a ningún modelo, así que no
 * gasta cuota y no se inventa nada.
 */
export function señalesDe(c: CuadrillaVista, ahora: number): Señal[] {
  const fuera: Señal[] = [];
  if (c.puestos.length === 0) return fuera;

  const columnas = c.puestos.map((p) => columnaDe(p.estado));
  const hechos = columnas.filter((x) => x === "hecho").length;

  // 1. Terminada: todos en «hecho». Es la única que de verdad cierra algo.
  if (hechos === c.puestos.length) {
    fuera.push({
      clase: "terminada",
      sujeto: "todos",
      texto: `la cuadrilla de "${recorta(c.objetivo, 60)}" ha terminado sus ${c.puestos.length} puestos en ${c.proyecto}`,
    });
    return ordenar(fuera);
  }

  // 2. Frontera pisada: alguien nombra un archivo que es de otro. Es el fallo
  //    que el reparto existe para evitar, así que si aparece hay que decirlo.
  for (const n of c.notas) {
    const quien = dueño(n, c);
    if (!quien) continue;
    for (const otro of c.puestos) {
      if (otro.rol === quien.rol || !otro.frontera) continue;
      const pisa = piezasDe(otro.frontera).find((x) => n.text.toLowerCase().includes(x.toLowerCase()));
      if (pisa) {
        fuera.push({
          clase: "frontera",
          sujeto: `${quien.rol}>${otro.rol}`,
          texto: `en ${c.proyecto}, ${quien.rol} nombra ${pisa}, que es de ${otro.rol}: mira si se están pisando`,
        });
        break;
      }
    }
  }

  // 3. Bloqueo: alguien pidió algo y desde entonces nadie ha escrito nada.
  if (ahora - c.buzonCambio > BLOQUEO) {
    for (const n of c.notas) {
      if (!pideAlgo(n.text)) continue;
      const quien = dueño(n, c);
      if (!quien) continue;
      fuera.push({
        clase: "bloqueo",
        sujeto: quien.rol,
        texto: `en ${c.proyecto}, ${quien.rol} pidió algo por el BUZON.md y lleva ${minutos(ahora - c.buzonCambio)} sin respuesta`,
      });
    }
  }

  // 4. Entrega: uno acabó y los demás siguen. Es cuando se puede repartir lo
  //    que le sobra, y es justo cuando no se está mirando el tablero.
  if (hechos > 0 && hechos < c.puestos.length) {
    const libres = c.puestos.filter((p) => columnaDe(p.estado) === "hecho");
    fuera.push({
      clase: "entrega",
      sujeto: libres.map((p) => p.rol).join("+"),
      texto: `en ${c.proyecto}, ${libres.map((p) => p.rol).join(" y ")} ya ha terminado y ${c.puestos.length - hechos} sigue trabajando`,
    });
  }

  // 5. Espera: te espera desde hace rato. Un agente parado no avisa solo.
  for (const p of c.puestos) {
    if (!PINTA[p.estado]?.urge) continue;
    if (ahora - p.desde <= ESPERA) continue;
    fuera.push({
      clase: "espera",
      sujeto: p.rol,
      texto: `en ${c.proyecto}, ${p.rol} lleva ${minutos(ahora - p.desde)} esperando que le contestes`,
    });
  }

  // 6. Quietas: nadie se mueve y el buzón tampoco. O terminaron sin decirlo, o
  //    se quedaron colgados, y las dos cosas piden que vayas a mirar.
  const parados = c.puestos.filter((p) => ahora - p.desde > QUIETAS).length;
  if (parados >= 2 && ahora - c.buzonCambio > QUIETAS) {
    fuera.push({
      clase: "quietas",
      sujeto: "todos",
      texto: `en ${c.proyecto}, ${parados} puestos llevan más de ${minutos(QUIETAS)} sin cambiar de estado`,
    });
  }

  return ordenar(fuera);
}

/**
 * De quién es una nota.
 *
 * Si no se puede atribuir por su `who`, devuelve nada y quien la mira se calla.
 * Adivinar de quién es una línea sería exactamente la clase de mentira que este
 * tablero no comete: con dos cuadrillas en la misma carpeta comparten BUZON.md,
 * y un aviso que culpa al puesto equivocado es peor que ningún aviso.
 */
function dueño(n: CrewNote, c: CuadrillaVista): PuestoVisto | undefined {
  const who = n.who?.trim().toLowerCase();
  if (!who) return undefined;
  return c.puestos.find((p) => {
    const rol = p.rol.toLowerCase();
    return who === rol || who.includes(rol) || rol.includes(who);
  });
}

function ordenar(s: Señal[]): Señal[] {
  return [...s].sort((a, b) => PRIORIDAD[b.clase] - PRIORIDAD[a.clase]);
}

function recorta(s: string, n: number): string {
  const limpio = s.replace(/\s+/g, " ").trim();
  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio;
}

function minutos(ms: number): string {
  const m = Math.round(ms / MIN);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`;
}

/** Lo que el vigía recuerda entre vueltas: qué dijo ya y cuándo. */
export interface Memoria {
  /** Llaves `teamId|clase|sujeto` que ya se dijeron, con cuándo. */
  dichas: Record<string, number>;
  /** Última vez que habló de cada cuadrilla. */
  ultimaDe: Record<string, number>;
  /** Cuántas veces ha hablado de cada cuadrilla en toda su vida. */
  vecesDe: Record<string, number>;
  /** Última vez que habló, de lo que fuera. */
  ultima: number;
}

export function memoriaVacia(): Memoria {
  return { dichas: {}, ultimaDe: {}, vecesDe: {}, ultima: 0 };
}

export type ModoVigia = "gordas" | "siempre" | "nunca";

const VIGIA_KEY = "adeorq-vigia-modo";

/** Igual que el aviso del router: por defecto solo lo gordo. Un vigía que habla
    cada cinco minutos acaba silenciado, y entonces no vigila nadie. */
export function modoVigia(): ModoVigia {
  const v = localStorage.getItem(VIGIA_KEY);
  return v === "siempre" || v === "nunca" ? v : "gordas";
}

export function guardarModoVigia(m: ModoVigia): void {
  localStorage.setItem(VIGIA_KEY, m);
}

export function llaveDe(teamId: string, s: Señal): string {
  return `${teamId}|${s.clase}|${s.sujeto}`;
}

/**
 * De todo lo que está pasando, qué merece de verdad interrumpir.
 *
 * Aquí vive la moderación entera, y es más larga que la detección a propósito:
 * la regla R dice «con moderación, si dudas no la escribas», y la diferencia
 * entre un vigía útil y una bandeja que nadie mira son estos cinco filtros.
 * Devuelve como mucho UNA señal por cuadrilla y por vuelta.
 */
export function aProponer(
  cuadrillas: CuadrillaVista[],
  memoria: Memoria,
  ahora: number,
  modo: ModoVigia = "gordas",
): Array<{ cuadrilla: CuadrillaVista; señal: Señal }> {
  if (modo === "nunca") return [];
  const fuera: Array<{ cuadrilla: CuadrillaVista; señal: Señal }> = [];
  // La bandeja es una sola: aunque haya tres cuadrillas dando guerra, no se
  // escriben tres líneas seguidas.
  let ultimaGlobal = memoria.ultima;

  for (const c of cuadrillas) {
    if (ahora - c.nacida < GRACIA) continue;
    if ((memoria.vecesDe[c.teamId] ?? 0) >= TOPE) continue;
    if (ahora - (memoria.ultimaDe[c.teamId] ?? 0) < ENFRIA_CUADRILLA) continue;
    if (ahora - ultimaGlobal < ENFRIA_TODO) continue;

    const candidatas = señalesDe(c, ahora)
      .filter((s) => modo === "siempre" || GORDAS.includes(s.clase))
      .filter((s) => !memoria.dichas[llaveDe(c.teamId, s)]);
    const elegida = candidatas[0];
    if (!elegida) continue;

    fuera.push({ cuadrilla: c, señal: elegida });
    ultimaGlobal = ahora;
  }
  return fuera;
}

/** Apunta lo dicho. Se llama DESPUÉS de escribir de verdad: si la escritura
    falla, la señal sigue pendiente y se vuelve a intentar. */
export function anotar(memoria: Memoria, teamId: string, s: Señal, ahora: number): Memoria {
  return {
    dichas: { ...memoria.dichas, [llaveDe(teamId, s)]: ahora },
    ultimaDe: { ...memoria.ultimaDe, [teamId]: ahora },
    vecesDe: { ...memoria.vecesDe, [teamId]: (memoria.vecesDe[teamId] ?? 0) + 1 },
    ultima: ahora,
  };
}

/** Se olvida de lo de ayer. Sin esto, la memoria crece para siempre en el
    localStorage y una cuadrilla de la semana pasada silencia a la de hoy. */
export function podar(memoria: Memoria, ahora: number, vida = 24 * 60 * MIN): Memoria {
  const dichas: Record<string, number> = {};
  for (const [k, v] of Object.entries(memoria.dichas)) {
    if (ahora - v < vida) dichas[k] = v;
  }
  return { ...memoria, dichas };
}
