// El conserje: el chat principal que lo conecta todo.
//
// Munir, 2026-09-30: «Es todo en un chat y dentro de ese chat se ven diferentes
// pestañas o cosas trabajando; si haces clic vas a esa sesión. El chat principal
// es un conserje que conecta todo.» Le hablas; él parte lo que pides en
// trabajos y dice cómo es cada uno; y ESTA pieza los ejecuta: cada trabajo pasa
// por el router (si está encendido) y se abre sin sacarte del chat.
//
// El reparto de papeles es el de la casa: el modelo interpreta, el código
// ejecuta. Lo que el conserje devuelve ya pasó por la reja de Rust
// (`conserje.rs`: carpetas reales, solo sus paneles, tope de cuatro); aquí se
// decide el modelo con `recetar`, que tiene sus 33 casos probados, y no con lo
// que el modelo diga que eligió.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Animo } from "./campana";
import type { Exigencia, Receta } from "./router";
import type { Account, PaneStatus, WorkState } from "./pty";
import type { ModelAlias } from "./models";
import { quienSoy } from "./perfil";
import { CLAUDE, PROVIDERS, providerOf, sabe } from "./providers";

export interface Turno {
  n: number;
  /** `sesion` solo en un enjambre: lo que contestó una de las del grupo. */
  rol: "tu" | "conserje" | "sesion";
  texto: string;
  resumen: string;
  cuando: number;
  /** En un turno de sesión: su nombre. */
  de?: string;
}

/** Una sesión de trabajo abierta por el conserje: una pestaña del chat. */
export interface Trabajo {
  panel: number;
  cli: string;
  modelo: string;
  cuenta: string;
  carpeta: string;
  encargo: string;
  abierto: number;
  /** `router` o `tu`, apuntado al abrir: no cambia si luego apagas el router. */
  eligio: string;
  porque: string;
  /** En qué turno lo abrió el conserje: su tarjeta va justo después. */
  turno?: number;
  /** Su sesión, en cuanto se sabe: lo que deja volver a ella con el panel ya
   *  cerrado, porque la conversación sigue en el disco. */
  sesion?: string;
  /** El arranque de Adeorq en que se abrió; lo pone Rust. Los paneles vuelven
   *  a contar desde 1 cada vez que se abre la app, así que un panel solo es
   *  SUYO si el arranque es el de ahora (ver `paneDe`). */
  arranque?: number;
  /** Quitaste su pestaña; la tarjeta sigue en el hilo. */
  soltado?: boolean;
  /** En un enjambre: cómo se llama la sesión. */
  nombre?: string;
}

/** Quién es una pestaña: el panel solo se repite entre arranques. */
export const claveDe = (w: Trabajo) => `${w.arranque ?? 0}:${w.panel}`;

/** El panel de un trabajo, si sigue siendo el suyo. Uno de otro arranque no
 *  tiene panel: el que lleva su número hoy es otra terminal. */
export function paneDe(w: Trabajo, panes: PaneStatus[], arranque: number | null): PaneStatus | undefined {
  if (arranque === null || w.arranque !== arranque) return undefined;
  return panes.find((p) => p.id === w.panel);
}

export interface Conversacion {
  id: string;
  titulo: string;
  turnos: Turno[];
  trabajos: Trabajo[];
  router: boolean;
  creada: number;
  /** Con qué modelo piensa el propio conserje; vacío es Sonnet. El router
   *  elige el de las sesiones que abre, no este. */
  cerebro?: string;
  /** El modelo de las sesiones con el router apagado, el mismo en el PC y en
   *  el móvil; vacío es el de por defecto de Ajustes, o Sonnet. */
  fijo?: string;
  /** Con qué PROGRAMA piensa el conserje; vacío es Claude. `cerebro` es el
   *  escalón, que Rust traduce al nombre de modelo de ese programa. */
  pensador?: string;
  /** Con qué programa se abren las sesiones si lo forzaste; vacío, el router. */
  programa?: string;
  /** Es un enjambre del lienzo (`lib/enjambre.ts`): sus trabajos son sesiones
   *  que ya estaban abiertas, y quien contesta es Adeo, con Haiku. */
  enjambre?: boolean;
}

/** Los modelos con los que puede pensar el conserje: los mismos que acepta
 *  `conserje_cerebro` en Rust. */
export const CEREBROS_CONSERJE = ["haiku", "sonnet", "opus"] as const;
export const cerebroDe = (c: Conversacion | null) =>
  (CEREBROS_CONSERJE as readonly string[]).includes(c?.cerebro ?? "") ? (c?.cerebro as string) : "sonnet";
/** El modelo fijo de la conversación, si se eligió uno de la lista. */
export const fijoDe = (c: Conversacion | null): ModelAlias | undefined =>
  (CEREBROS_CONSERJE as readonly string[]).includes(c?.fijo ?? "") ? (c?.fijo as ModelAlias) : undefined;
/** Con qué programa piensa: el elegido, o Claude. */
export const pensadorDe = (c: Conversacion | null) => c?.pensador || "claude";
/** El programa forzado para las sesiones; vacío es «el que diga el router». */
export const programaDe = (c: Conversacion | null) => c?.programa || "";

/** Un programa que sabe pensar como conserje, tal como lo describe Rust
 *  (`conserje_pensadores`): sus tres escalones con el nombre que él entiende.
 *  Todos piensan con las mismas siete manos de mirar de Adeorq. */
export interface Pensador {
  id: string;
  modelos: Record<"haiku" | "sonnet" | "opus", string>;
  instalado: boolean;
}
export const conserjePensadores = () => invoke<Pensador[]>("conserje_pensadores");

/* Si Adeo está pensando en alguna conversación, para quien no la tiene abierta
   (la caja del Panel enciende su filo de luz con esto). Lo apunta el envío, que
   es el mismo camino desde el PC y desde el móvil. */
const pensandoEn = new Set<string>();
const PENSANDO = "adeorq:conserje-pensando";
export function marcarPensando(id: string, si: boolean): void {
  if (si) pensandoEn.add(id);
  else pensandoEn.delete(id);
  window.dispatchEvent(new CustomEvent(PENSANDO));
}
export const algunoPensando = () => pensandoEn.size > 0;
export function onPensando(cb: () => void): () => void {
  window.addEventListener(PENSANDO, cb);
  return () => window.removeEventListener(PENSANDO, cb);
}

export interface Ficha {
  id: string;
  titulo: string;
  cuando: number;
  trabajos: number;
}

export type Accion =
  | {
      tipo: "abrir";
      encargo: string;
      carpeta: string;
      clase: string;
      consecuencia: string;
      largo: boolean;
      trabajo: string;
    }
  | { tipo: "escribir"; panel: number; texto: string };

export interface Respuesta {
  texto: string;
  acciones: Accion[];
  descartes: string[];
}

export const conserjeLista = () => invoke<Ficha[]>("conserje_lista");
export const conserjeLeer = (id: string) => invoke<Conversacion>("conserje_leer", { id });
export const conserjeRouter = (id: string, encendido: boolean) =>
  invoke<void>("conserje_router", { id, encendido });
export const conserjeCerebro = (id: string, cerebro: string) =>
  invoke<void>("conserje_cerebro", { id, cerebro });
export const conserjeFijo = (id: string, modelo: string) => invoke<void>("conserje_fijo", { id, modelo });
export const conserjePensador = (id: string, pensador: string) => invoke<void>("conserje_pensador", { id, pensador });
export const conserjePrograma = (id: string, programa: string) => invoke<void>("conserje_programa", { id, programa });
/** Apunta una sesión que se ACABA de abrir; Rust le pone el arranque. */
export const conserjeTrabajo = (id: string, trabajo: Trabajo) =>
  invoke<void>("conserje_trabajo", { id, trabajo });
export const conserjeSoltar = (id: string, w: Trabajo) =>
  invoke<void>("conserje_soltar", { id, panel: w.panel, arranque: w.arranque ?? 0 });
export const conserjeArranque = () => invoke<number>("conserje_arranque");

/** El aviso, dentro de la ventana, de que una conversación cambió por otro
 *  camino (el móvil): quien la esté pintando, que la relea. */
export const CONSERJE_CAMBIO = "adeorq:conserje-cambio";
export const avisarCambio = (id: string) =>
  window.dispatchEvent(new CustomEvent(CONSERJE_CAMBIO, { detail: { id } }));

/** El arranque de esta app, pedido una vez: no cambia hasta cerrarla. */
let arranquePedido: Promise<number> | null = null;
export const arranqueDeAhora = () => (arranquePedido ??= conserjeArranque());

/** Lo que el conserje necesita del resto de la app. Llega desde App, que es
 *  quien sabe abrir paneles y escribir en ellos. */
export interface ConserjeExec {
  /** Abre la sesión sin sacarte del chat; devuelve su panel. */
  abrir: (r: Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo">, cwd: string, label: string, encargo: string) => number | undefined;
  escribir: (panel: number, texto: string) => Promise<boolean>;
  /** El estado de todos los paneles, de las dos vistas. */
  panes: () => PaneStatus[];
  /** Todas las cuentas: el router necesita las de los OTROS CLIs para proponerlos. */
  cuentas: () => Account[];
  /** Qué programa corre en ese panel («claude», «codex»…; «shell» si ninguno). */
  cliDe?: (panel: number) => string;
}
/** Apunta la sesión de una pestaña que ya estaba. `conserjeTrabajo` es solo
 *  para las que se acaban de abrir. */
export const conserjeSesion = (id: string, w: Trabajo, sesion: string) =>
  invoke<void>("conserje_sesion", { id, panel: w.panel, arranque: w.arranque ?? 0, sesion });
/** Con quién habla y en qué idioma está la app: sin esto el conserje contesta
 *  en español y llama Munir a cualquiera (`Quien` en `conserje.rs`). */
export const conserjeEnviar = (id: string, texto: string, estados: Record<string, string>) =>
  invoke<Respuesta>("conserje_enviar", { id, texto, estados, quien: quienSoy() });
/** Solo esa conversación: la de al lado (o la del móvil) sigue pensando. */
export const conserjeParar = (id: string) => invoke<void>("conserje_parar", { id });
export const conserjeMejorar = (texto: string) => invoke<string>("conserje_mejorar", { texto });
/** Borra una conversación del disco. Lo pide el enjambre que se deshace. */
export const conserjeOlvidar = (id: string) => invoke<void>("conserje_olvidar", { id });
/** Hace de una conversación un enjambre, o le cambia el nombre. */
export const conserjeEnjambre = (id: string, nombre: string) => invoke<void>("conserje_enjambre", { id, nombre });
/** Las sesiones de un enjambre tal como quedan: Rust sustituye las que había. */
export const conserjeMiembros = (id: string, miembros: Trabajo[]) =>
  invoke<void>("conserje_miembros", { id, miembros });
/** Lo que acaba de contestar una sesión del enjambre; dice si era nuevo. */
export const conserjeDijo = (id: string, panel: number, texto: string) =>
  invoke<boolean>("conserje_dijo", { id, panel, texto });

/** Lo que va haciendo mientras piensa: «Mirando tus proyectos»… */
export function onPaso(cb: (p: { id: string; paso: string }) => void): Promise<UnlistenFn> {
  return listen<{ id: string; paso: string }>("conserje-paso", (e) => cb(e.payload));
}

/** Un id para una conversación nueva. Solo letras y números: va a un nombre de
 *  archivo, y Rust rechaza cualquier otra cosa. */
export function nuevoId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* Lo que se le pide desde la caja del Panel. El Panel lo deja aquí y abre el
   Chat; el Chat nace con esa conversación abierta y su hilo lo manda al
   montarse, por el mismo camino que lo que escribes allí. Vive en el módulo y
   no en el estado de App porque el Chat solo se monta al abrirlo. Se toma UNA
   vez: un segundo montaje (el modo estricto de React) ya no lo encuentra. */
let pedido: { id: string; texto: string } | null = null;

export function dejarPedido(texto: string): void {
  pedido = { id: nuevoId(), texto };
}

export const pedidoPendiente = () => pedido;

export function tomarPedido(id: string): string | null {
  if (pedido?.id !== id) return null;
  const { texto } = pedido;
  pedido = null;
  return texto;
}

// ─── Lo que se decide sin gastar un token ────────────────────────────────────

/** Cómo está una pestaña, en tres colores y una palabra. */
export type Estado = "trabajando" | "pregunta" | "termino" | "cerrada";

export function estadoDe(s: PaneStatus | undefined): Estado {
  if (!s) return "cerrada";
  const w: WorkState = s.state;
  if (w === "pregunta" || w === "ofrece") return "pregunta";
  if (w === "lista") return "termino";
  // «a_medias» es trabajando; «» (no se sabe todavía, está arrancando) también:
  // una sesión recién abierta no ha terminado nada. Y «tuya» igual: lo último
  // es el encargo que se le acaba de escribir, todavía sin contestar. Contaba
  // como «ha terminado», y eso era decirle al conserje que su sesión había
  // acabado en el momento de mandarle el trabajo.
  return "trabajando";
}

export const PALABRA: Record<Estado, string> = {
  trabajando: "trabajando",
  pregunta: "te pregunta algo",
  termino: "ha terminado",
  cerrada: "cerrada",
};

/**
 * Cómo está la mascota del chat (Adeo). Lo primero, quien te pregunta; luego,
 * que el conserje no haya podido contestar; luego, que esté contestando; luego,
 * que le estés escribiendo tú; y al final, que sus sesiones trabajen. Una que
 * ha terminado no la pone a celebrar: eso lo hace la de la barra de arriba, una
 * vez, y aquí celebraría mientras la pestaña siguiera abierta.
 */
export function animoDelChat(
  pensando: boolean,
  estados: Estado[],
  mas: { fallo?: boolean; escribiendo?: boolean } = {},
): Animo {
  if (estados.includes("pregunta")) return "espera";
  if (mas.fallo) return "apurada";
  if (pensando) return "piensa";
  if (mas.escribiendo) return "escucha";
  if (estados.includes("trabajando")) return "trabaja";
  return "quieta";
}

/** «2 sesiones en marcha»: las cerradas no cuentan, que la cabecera decía
 *  «1 sesiones abiertas» de una que ya no existía. */
export function enMarcha(estados: Estado[]): { clave: string; n: number } {
  const n = estados.filter((e) => e !== "cerrada").length;
  return { clave: n === 0 ? "nada en marcha" : n === 1 ? "1 sesión en marcha" : "{n} sesiones en marcha", n };
}

/** Lo que el conserje necesita saber de sus pestañas, por panel. */
export function estadosParaElConserje(trabajos: Trabajo[], status: PaneStatus[]): Record<string, string> {
  const fuera: Record<string, string> = {};
  for (const t of trabajos) {
    fuera[String(t.panel)] = PALABRA[estadoDe(status.find((s) => s.id === t.panel))];
  }
  return fuera;
}

/** De lo que dijo el conserje a lo que necesita el router. La reja de Rust ya
 *  normalizó los valores; esto solo cambia de forma. */
export function exigenciaDe(a: Extract<Accion, { tipo: "abrir" }>): Exigencia {
  return {
    clase: a.clase as Exigencia["clase"],
    consecuencia: a.consecuencia === "baja" ? "baja" : "alta",
    largo: !!a.largo,
    trabajo: a.trabajo as Exigencia["trabajo"],
  };
}

/** El nombre de la carpeta, que es como se llama un proyecto en todas partes. */
export function hoja(carpeta: string): string {
  return carpeta.split(/[\\/]/).filter(Boolean).pop() ?? carpeta;
}

// ─── Ejecutar lo que pidió el conserje ───────────────────────────────────────

/** Lo que el ejecutor necesita del resto de la app. Llega desde fuera para que
 *  se pueda probar sin la app (`scripts/conserje-check.ts`). */
export interface Manos {
  router: boolean;
  /** El router ya con su foto de cuentas dentro. `de` es para las reglas de
      la memoria, que encajan por proyecto o por encargo. */
  recetar: (ex: Exigencia, de: { proyecto: string; encargo: string }) => Receta;
  /** Lo que se usa con el router apagado: lo que Munir tenga puesto. */
  fijo: { cli: string; modelo?: string };
  /** El programa con el que se abren las sesiones si lo forzaste («codex»);
      vacío, el que diga el router. Con el router encendido, el router sigue
      eligiendo el escalón y el esfuerzo; apagado, va con el modelo fijo. */
  programa?: string;
  /** Con qué cuenta se abre ese programa: la más fresca de las conectadas. */
  cuentaDe?: (cli: string) => Account | undefined;
  /** Abre la sesión sin moverte del chat y devuelve su panel. */
  abrir: (r: Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo">, cwd: string, label: string, encargo: string) => number | undefined;
  escribir: (panel: number, texto: string) => Promise<boolean>;
  ahora?: () => number;
}

export interface Hecho {
  abiertos: Trabajo[];
  escritos: number[];
  fallos: string[];
}

/** Las razones del router que hablan del MODELO (la clase del trabajo, lo que
 *  sube un escalón, tu cerebro por defecto, lo largo). Las de la cuenta y la
 *  semana son de Claude, y con otro programa forzado no dicen nada verdad. */
const DEL_MODELO = /^(Es |Sube a |Tu cerebro por defecto|Tienes )/;

type Elegida = Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo" | "porque">;

/** Con qué se abre un trabajo: el router, el programa que forzaste, o lo fijo. */
function recetaDe(a: Extract<Accion, { tipo: "abrir" }>, m: Manos): Elegida {
  const programa = m.programa || "";
  if (!m.router) {
    return {
      cli: programa || m.fijo.cli,
      cuenta: programa ? m.cuentaDe?.(programa) : undefined,
      modelo: m.fijo.modelo as Receta["modelo"],
      porque: [],
    };
  }
  const r = m.recetar(exigenciaDe(a), { proyecto: hoja(a.carpeta), encargo: a.encargo });
  if (!programa || programa === r.cli) return r;
  // Forzado a otro programa: del router se queda el escalón y el esfuerzo, que
  // la tabla de proveedores traduce a lo que entienda ese CLI (`planDeArranque`).
  return {
    cli: programa,
    cuenta: m.cuentaDe?.(programa),
    modelo: sabe(programa, "modelo") ? r.modelo : undefined,
    esfuerzo: r.esfuerzo,
    porque: [`Con ${providerOf(programa).marca ?? providerOf(programa).label}, porque lo elegiste tú.`, ...r.porque.filter((p) => DEL_MODELO.test(p))],
  };
}

/** Los programas con los que se pueden abrir las sesiones de Adeo: el de
 *  fábrica y los que tienen una cuenta en Adeorq, si aceptan el encargo en su
 *  línea de arranque (sin eso la sesión nacería vacía). En el orden de la tabla. */
export function programasDeSesion(cuentas: Pick<Account, "provider">[]): string[] {
  const con = new Set(cuentas.map((c) => c.provider));
  return PROVIDERS.filter((p) => (p === CLAUDE || con.has(p.id)) && sabe(p.id, "encargoEnLinea")).map((p) => p.id);
}

export async function ejecutar(acciones: Accion[], m: Manos): Promise<Hecho> {
  const hecho: Hecho = { abiertos: [], escritos: [], fallos: [] };
  const ahora = m.ahora ?? (() => Math.floor(Date.now() / 1000));
  for (const a of acciones) {
    if (a.tipo === "abrir") {
      const receta = recetaDe(a, m);
      const label = `${hoja(a.carpeta)} · ${receta.cli}`;
      const panel = m.abrir(receta, a.carpeta, label, a.encargo);
      if (panel === undefined) {
        hecho.fallos.push(`no se pudo abrir la sesión para «${a.encargo.slice(0, 60)}»`);
        continue;
      }
      hecho.abiertos.push({
        panel,
        cli: receta.cli,
        modelo: receta.modelo ?? "",
        cuenta: receta.cuenta?.label ?? "",
        carpeta: a.carpeta,
        encargo: a.encargo,
        abierto: ahora(),
        eligio: m.router ? "router" : "tu",
        porque: m.router ? receta.porque.join(" ") : "",
      });
    } else {
      const ok = await m.escribir(a.panel, a.texto);
      if (ok) hecho.escritos.push(a.panel);
      else hecho.fallos.push(`no le llegó el mensaje al panel ${a.panel}`);
    }
  }
  return hecho;
}
