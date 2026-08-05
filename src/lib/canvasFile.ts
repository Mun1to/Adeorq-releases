import type { Trazo } from "../components/CanvasDraw";
import type { Shape } from "../components/CanvasImage";
import { esFontId, esWidgetKind, type WidgetKind } from "./piezas";

// El lienzo, en un archivo. Un tablero montado (quién trabaja, con qué flechas,
// con qué dibujo encima) es una forma de organizar el trabajo, y hasta ahora se
// perdía entero al cerrar la app.
//
// Lo que NO se guarda: los procesos. Una terminal viva no cabe en un JSON, así
// que de cada una se guarda su RECETA (qué era, en qué carpeta) y al importar
// se vuelve a abrir. Por eso importar pregunta antes: abrir cinco terminales
// arranca cinco procesos de verdad, y aquí nada arranca sin un OK.

export const CANVAS_FILE_KIND = "adeorq-lienzo";
export const CANVAS_FILE_VERSION = 1;

export type SpawnKind = "claude" | "shell" | "agy";

export interface NodoTerm {
  tipo: "term";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SpawnKind;
  proyecto: string;
  ruta: string;
  /** Con qué se arrancó, y solo en el tablero que vuelve solo al abrir.
      Ahí dentro va el identificador de la sesión de Claude, que es lo que
      permite retomar ESA conversación y no empezar una en blanco. Un tablero
      que compartes no lo lleva: esa sesión vive en la máquina donde se creó,
      así que en otra no abriría nada y solo sería un dato de más viajando. */
  cmd?: string[];
}

export interface NodoWidget {
  tipo: "widget";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: WidgetKind;
}

export interface NodoImg {
  tipo: "img";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** La imagen viaja dentro en data: URI, para que el archivo sea autónomo. */
  src: string;
  iw: number;
  ih: number;
  formas: Shape[];
}

/** Una nota. Del archivo del tablero solo sale la REFERENCIA: el texto vive en
    su propio `.md` en %LOCALAPPDATA%\Adeorq\notas, porque tiene que poder
    editarlo un agente. Un tablero de otra máquina traerá notas vacías, y es
    correcto: lo que se comparte es el tablero, no tus apuntes. */
export interface NodoNota {
  tipo: "nota";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nota: string;
  color: string;
}

/** Una ventana de localhost. Solo se guarda su dirección: lo que enseña es lo
    que esté sirviendo tu equipo en ese momento, no algo que viaje en el
    archivo. Un tablero de otra máquina la traerá apuntando a su puerto, y ahí
    o hay algo servido o sale vacía, que es lo honesto. */
export interface NodoWeb {
  tipo: "web";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
}

/** El kanban del trabajo. Tres de sus cuatro columnas se llenan solas con lo
    que hacen los agentes de ahora mismo, así que de esas no hay nada que
    guardar: se guardan solo las tarjetas de «Por hacer», que son tuyas. Un
    tablero de otra máquina las traerá y estarán bien, porque son texto. */
export interface NodoKanban {
  tipo: "kanban";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pendientes: Array<{ id: string; texto: string; ruta?: string }>;
}

/** Un chat por API. Como en las notas, del tablero solo sale la REFERENCIA: la
    conversación vive en su propio archivo, porque una charla larga son cientos
    de miles de caracteres y el tablero se reescribe cada vez que mueves una
    pieza. Un tablero de otra máquina traerá el chat vacío, y es lo correcto:
    lo que se comparte es el tablero, no tus conversaciones. */
export interface NodoChat {
  tipo: "chat";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  chat: string;
  modelo: string;
}

export type NodoGuardado =
  | NodoTerm
  | NodoWidget
  | NodoImg
  | NodoNota
  | NodoWeb
  | NodoKanban
  | NodoChat;

export interface FlechaGuardada {
  id: string;
  de: string;
  a: string;
  encargo: string;
  auto: boolean;
}

export interface CanvasFile {
  kind: typeof CANVAS_FILE_KIND;
  v: number;
  guardado: string;
  proyecto: string;
  nodos: NodoGuardado[];
  flechas: FlechaGuardada[];
  trazos: Trazo[];
}

/** Cuenta lo que trae un archivo, para poder preguntar antes de abrir nada. */
export function resumen(f: CanvasFile): {
  terminales: number;
  widgets: number;
  capturas: number;
  notas: number;
  webs: number;
  tableros: number;
  trazos: number;
} {
  return {
    terminales: f.nodos.filter((n) => n.tipo === "term").length,
    widgets: f.nodos.filter((n) => n.tipo === "widget").length,
    capturas: f.nodos.filter((n) => n.tipo === "img").length,
    notas: f.nodos.filter((n) => n.tipo === "nota").length,
    webs: f.nodos.filter((n) => n.tipo === "web").length,
    tableros: f.nodos.filter((n) => n.tipo === "kanban").length,
    trazos: f.trazos.length,
  };
}

const num = (v: unknown, pordefecto = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : pordefecto;
const txt = (v: unknown, pordefecto = ""): string => (typeof v === "string" ? v : pordefecto);

/** Lee un archivo de lienzo comprobándolo campo a campo.
 *
 *  Es más largo que un `JSON.parse` a pelo y esa es la idea: el archivo puede
 *  venir editado a mano o de una versión futura, y un nodo con la posición en
 *  `null` no debe dejar el lienzo en blanco, solo perderse ese nodo. Devuelve
 *  null si ni siquiera es un lienzo. */
export function parsear(raw: string): CanvasFile | null {
  let dato: unknown;
  try {
    dato = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!dato || typeof dato !== "object") return null;
  const o = dato as Record<string, unknown>;
  if (o.kind !== CANVAS_FILE_KIND) return null;

  const nodos: NodoGuardado[] = [];
  for (const n of Array.isArray(o.nodos) ? o.nodos : []) {
    if (!n || typeof n !== "object") continue;
    const r = n as Record<string, unknown>;
    const base = {
      id: txt(r.id),
      x: num(r.x),
      y: num(r.y),
      w: num(r.w, 460),
      h: num(r.h, 300),
    };
    if (!base.id) continue;
    if (r.tipo === "term") {
      const kind = txt(r.kind, "shell");
      // El comando, solo si es una lista de textos de verdad. Un archivo
      // editado a mano podría traer aquí cualquier cosa, y esto acaba siendo
      // los argumentos de un proceso: se comprueba pieza a pieza como todo lo
      // demás, y si no cuadra la terminal nace como una normal.
      const cmd =
        Array.isArray(r.cmd) && r.cmd.length && r.cmd.every((x) => typeof x === "string")
          ? (r.cmd as string[])
          : undefined;
      nodos.push({
        ...base,
        tipo: "term",
        kind: kind === "claude" || kind === "agy" ? kind : "shell",
        proyecto: txt(r.proyecto),
        ruta: txt(r.ruta),
        cmd,
      });
    } else if (r.tipo === "widget") {
      // Contra la lista de verdad: un widget que este Adeorq no conoce (de una
      // versión más nueva) se descarta, en vez de entrar y reventar al pintar.
      if (esWidgetKind(r.kind)) {
        nodos.push({ ...base, tipo: "widget", kind: r.kind });
      }
    } else if (r.tipo === "nota") {
      // El id se RECHAZA si no vale, no se limpia. Limpiarlo convertía
      // `..\..\bandeja` en una nota llamada `bandeja`: no se escapaba de la
      // carpeta (eso lo corta Rust otra vez), pero abría un archivo que no era
      // el que decía el tablero, y podía pisar una nota de verdad.
      const nota = txt(r.nota);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(nota)) continue;
      nodos.push({ ...base, tipo: "nota", nota, color: txt(r.color, "#f2c14e") });
    } else if (r.tipo === "img") {
      const src = txt(r.src);
      // Solo data: URI. Un archivo que trajera una URL remota haría que abrir
      // un lienzo de otro llamase a un servidor ajeno sin avisar.
      if (!src.startsWith("data:image/")) continue;
      nodos.push({
        ...base,
        tipo: "img",
        src,
        iw: num(r.iw, 800),
        ih: num(r.ih, 600),
        formas: Array.isArray(r.formas) ? (r.formas as Shape[]) : [],
      });
    } else if (r.tipo === "chat") {
      // El id se RECHAZA si no vale, no se limpia: va a un nombre de archivo,
      // igual que el de una nota, y limpiarlo abriría un archivo que no es el
      // que dice el tablero.
      const chat = txt(r.chat);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(chat)) continue;
      nodos.push({ ...base, tipo: "chat", chat, modelo: txt(r.modelo) });
    } else if (r.tipo === "kanban") {
      // Cada tarjeta pieza a pieza: su texto acaba en el prompt de una terminal
      // cuando la arrastras, así que de aquí no sale nada que no sea un texto.
      const pendientes: NodoKanban["pendientes"] = [];
      for (const p of Array.isArray(r.pendientes) ? r.pendientes : []) {
        if (!p || typeof p !== "object") continue;
        const q = p as Record<string, unknown>;
        const texto = txt(q.texto).slice(0, 600);
        if (!texto.trim()) continue;
        const ruta = txt(q.ruta);
        pendientes.push({
          id: txt(q.id, `p${pendientes.length}`),
          texto,
          ruta: ruta || undefined,
        });
      }
      nodos.push({ ...base, tipo: "kanban", pendientes });
    } else if (r.tipo === "web") {
      const url = txt(r.url);
      // Solo http(s), y ni `file:` ni `javascript:`: abrir el lienzo de otro no
      // puede servir para que su archivo elija qué carga la app en su marco.
      if (!/^https?:\/\//i.test(url)) continue;
      nodos.push({ ...base, tipo: "web", url });
    }
  }

  const flechas: FlechaGuardada[] = [];
  for (const e of Array.isArray(o.flechas) ? o.flechas : []) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const de = txt(r.de);
    const a = txt(r.a);
    if (!de || !a) continue;
    flechas.push({ id: txt(r.id, `e-${de}-${a}`), de, a, encargo: txt(r.encargo), auto: !!r.auto });
  }

  const trazos: Trazo[] = [];
  for (const s of Array.isArray(o.trazos) ? o.trazos : []) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const t = txt(r.t);
    const p = Array.isArray(r.p) ? r.p.filter((v) => typeof v === "number") : [];
    if (!["lapiz", "flecha", "linea", "caja", "elipse", "texto"].includes(t)) continue;
    if (p.length < 2) continue;
    trazos.push({
      id: txt(r.id, `d${trazos.length}`),
      t: t as Trazo["t"],
      color: txt(r.color, "#e6edf7"),
      w: num(r.w, 3),
      p: p as number[],
      txt: typeof r.txt === "string" ? r.txt : undefined,
      glow: r.glow === true,
      font: esFontId(r.font) ? r.font : undefined,
    });
  }

  return {
    kind: CANVAS_FILE_KIND,
    v: num(o.v, 1),
    guardado: txt(o.guardado),
    proyecto: txt(o.proyecto),
    nodos,
    flechas,
    trazos,
  };
}

/** Nombre por defecto del archivo: el proyecto y el día, que es como uno busca
    un tablero viejo. */
export function nombreSugerido(proyecto: string): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  const base = (proyecto || "lienzo").replace(/[^\w.-]+/g, "-").toLowerCase();
  return `${base}-${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}.json`;
}
