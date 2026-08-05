// Los atajos del lienzo, y quién decide cuáles son.
//
// Hasta ahora cada atajo estaba escrito a mano dentro del `keydown` que lo
// usaba: Ctrl+A aquí, Supr allá, Escape en otro sitio. Funcionaba, pero no
// había forma de saber qué teclas estaban cogidas sin leerse el componente
// entero, y menos aún de cambiarlas.
//
// Aquí viven las acciones (qué se puede hacer), su tecla de fábrica y la del
// usuario si la ha cambiado. El componente pide "¿qué acción es esta tecla?" y
// ejecuta lo que sea; no sabe qué combinación la dispara, y por eso el editor
// de Ajustes puede cambiarla sin tocar el lienzo.

export const ATAJOS_KEY = "adeorq-atajos";

export type AccionId =
  | "claude"
  | "shell"
  | "agy"
  | "nota"
  | "web"
  | "galeria"
  | "todo"
  | "soltar"
  | "borrar"
  | "encajar"
  | "mano"
  | "marco"
  | "lapiz"
  | "flecha"
  | "linea"
  | "caja"
  | "rombo"
  | "elipse"
  | "texto"
  | "goma"
  | "deshacer"
  | "rehacer"
  | "copiar"
  | "duplicar"
  | "agrupar"
  | "clavar"
  | "alFrente"
  | "alFondo"
  | "estiloCopiar"
  | "estiloPegar"
  | "exportar";

export interface Accion {
  id: AccionId;
  /** Lo que se lee en Ajustes. En español, que es la clave del diccionario. */
  label: string;
  /** El grupo bajo el que se ordena en la tabla. */
  grupo: "abrir" | "piezas" | "seleccion" | "dibujo" | "editar";
  /** La combinación de fábrica, o "" si esa acción nace sin atajo. */
  porDefecto: string;
}

/**
 * Todo lo que el lienzo sabe hacer con una tecla.
 *
 * Las de abrir terminales van con Alt y no con Ctrl a propósito: dentro de una
 * terminal, Ctrl+letra es del programa que corre ahí (Ctrl+C corta a Claude,
 * Ctrl+R busca en el historial de la shell). Alt+letra casi nunca está cogida,
 * así que se pueden usar sin quitarle nada a nadie.
 */
export const ACCIONES: Accion[] = [
  { id: "claude", label: "Abrir un Claude", grupo: "abrir", porDefecto: "Alt+C" },
  { id: "shell", label: "Abrir una terminal", grupo: "abrir", porDefecto: "Alt+T" },
  { id: "agy", label: "Abrir un Antigravity", grupo: "abrir", porDefecto: "Alt+G" },

  { id: "nota", label: "Poner una nota", grupo: "piezas", porDefecto: "Alt+N" },
  { id: "web", label: "Poner una ventana de localhost", grupo: "piezas", porDefecto: "Alt+L" },
  { id: "galeria", label: "Abrir la galería", grupo: "piezas", porDefecto: "Alt+I" },

  { id: "todo", label: "Coger todo el lienzo", grupo: "seleccion", porDefecto: "Ctrl+A" },
  { id: "soltar", label: "Soltar lo cogido", grupo: "seleccion", porDefecto: "Escape" },
  { id: "borrar", label: "Borrar lo cogido", grupo: "seleccion", porDefecto: "Delete" },
  { id: "encajar", label: "Encajar todo en la pantalla", grupo: "seleccion", porDefecto: "Alt+0" },

  // Las letras son las de siempre en un editor de dibujo (V mover, M marco,
  // T texto, R recuadro, O elipse, L línea, E goma): quien venga de Figma o de
  // Photoshop ya se las sabe, y quien no, las aprende una vez para todas.
  { id: "mano", label: "Herramienta: la mano", grupo: "dibujo", porDefecto: "V" },
  { id: "marco", label: "Herramienta: el marco", grupo: "dibujo", porDefecto: "M" },
  { id: "lapiz", label: "Herramienta: el lápiz", grupo: "dibujo", porDefecto: "P" },
  { id: "flecha", label: "Herramienta: la flecha", grupo: "dibujo", porDefecto: "F" },
  { id: "linea", label: "Herramienta: la línea", grupo: "dibujo", porDefecto: "L" },
  { id: "caja", label: "Herramienta: el recuadro", grupo: "dibujo", porDefecto: "R" },
  { id: "rombo", label: "Herramienta: el rombo", grupo: "dibujo", porDefecto: "D" },
  { id: "elipse", label: "Herramienta: la elipse", grupo: "dibujo", porDefecto: "O" },
  { id: "texto", label: "Herramienta: el texto", grupo: "dibujo", porDefecto: "T" },
  { id: "goma", label: "Herramienta: la goma", grupo: "dibujo", porDefecto: "E" },
  { id: "deshacer", label: "Deshacer", grupo: "dibujo", porDefecto: "Ctrl+Z" },
  { id: "rehacer", label: "Rehacer", grupo: "dibujo", porDefecto: "Ctrl+Shift+Z" },

  // Las de editar son las de siempre en un editor de dibujo, y todas llevan
  // Ctrl: caen dentro de una terminal solo si el foco NO está en ella, que es
  // lo que ya comprueba `accionDe`. Pegar no está aquí porque no es un atajo
  // nuestro: es el evento `paste` del navegador, que trae consigo lo copiado.
  { id: "copiar", label: "Copiar lo cogido", grupo: "editar", porDefecto: "Ctrl+C" },
  { id: "duplicar", label: "Duplicar lo cogido", grupo: "editar", porDefecto: "Ctrl+D" },
  { id: "agrupar", label: "Agrupar o desagrupar", grupo: "editar", porDefecto: "Ctrl+G" },
  { id: "clavar", label: "Clavar al tablero", grupo: "editar", porDefecto: "Ctrl+L" },
  { id: "alFrente", label: "Traer al frente", grupo: "editar", porDefecto: "Ctrl+Shift+ArrowUp" },
  { id: "alFondo", label: "Enviar al fondo", grupo: "editar", porDefecto: "Ctrl+Shift+ArrowDown" },
  { id: "estiloCopiar", label: "Copiar el estilo", grupo: "editar", porDefecto: "Ctrl+Alt+C" },
  { id: "estiloPegar", label: "Pegar el estilo", grupo: "editar", porDefecto: "Ctrl+Alt+V" },
  { id: "exportar", label: "Exportar el dibujo", grupo: "editar", porDefecto: "Ctrl+Shift+E" },
];

export const GRUPOS: Array<{ id: Accion["grupo"]; label: string }> = [
  { id: "abrir", label: "Abrir cosas" },
  { id: "piezas", label: "Poner piezas" },
  { id: "seleccion", label: "Coger y soltar" },
  { id: "dibujo", label: "Dibujar" },
  { id: "editar", label: "Editar el dibujo" },
];

export type Atajos = Partial<Record<AccionId, string>>;

/**
 * Cómo se escribe una tecla pulsada.
 *
 * Se guarda `e.key` y no `e.code` a propósito: `code` es la POSICIÓN física de
 * la tecla, así que en un teclado que no sea el suyo "KeyZ" cae en otro sitio y
 * el atajo que él vio al grabarlo deja de ser el que se dispara.
 *
 * Las letras se guardan en mayúscula para que "a" y "A" sean el mismo atajo: si
 * no, activar el Bloq Mayús apagaría medio teclado sin explicación.
 */
export function comoAtajo(e: KeyboardEvent): string {
  const partes: string[] = [];
  if (e.ctrlKey || e.metaKey) partes.push("Ctrl");
  if (e.altKey) partes.push("Alt");
  if (e.shiftKey) partes.push("Shift");
  const k = e.key;
  // Un modificador suelto no es un atajo, es la mitad de uno.
  if (k === "Control" || k === "Alt" || k === "Shift" || k === "Meta") return "";
  partes.push(k.length === 1 ? k.toUpperCase() : k);
  return partes.join("+");
}

/** Lo mismo, para pintarlo: `Delete` es el nombre del navegador, no el de nadie. */
const NOMBRES: Record<string, string> = {
  Escape: "Esc",
  Delete: "Supr",
  Backspace: "Retroceso",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  " ": "Espacio",
  Shift: "Mayús",
};

export function comoTexto(atajo: string): string {
  if (!atajo) return "";
  return atajo
    .split("+")
    .map((p) => NOMBRES[p] ?? p)
    .join("+");
}

/** Los atajos de verdad: los de fábrica con encima los que él haya cambiado. */
export function resolver(guardados: Atajos): Record<AccionId, string> {
  const out = {} as Record<AccionId, string>;
  for (const a of ACCIONES) out[a.id] = guardados[a.id] ?? a.porDefecto;
  return out;
}

export function leerAtajos(): Atajos {
  try {
    const raw = localStorage.getItem(ATAJOS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    // Campo a campo: un archivo de una versión futura puede traer acciones que
    // esta no conoce, y no tienen por qué entrar en el mapa de las de ahora.
    const out: Atajos = {};
    for (const a of ACCIONES) {
      const v = (o as Record<string, unknown>)[a.id];
      if (typeof v === "string") out[a.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function guardarAtajos(a: Atajos): void {
  localStorage.setItem(ATAJOS_KEY, JSON.stringify(a));
}

/**
 * ¿El foco está donde se escribe?
 *
 * Vive aquí y no dentro de `accionDe` porque el lienzo tiene otro atajo que
 * hace la misma pregunta —Suprimir, que borra el trazo elegido— y lo preguntaba
 * a su manera, sin mirar `isContentEditable`. Dos criterios para lo mismo en la
 * misma pantalla acaban divergiendo: pulsar Supr dentro de una nota del lienzo
 * borraba el trazo en vez de una letra.
 */
export function escribiendoTexto(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/**
 * Con qué acción se corresponde una tecla, si es que con alguna.
 *
 * Devuelve null cuando el foco está donde se escribe: dentro de una terminal,
 * de una nota o de un cuadro de texto, las teclas son de quien escribe. Sin
 * esto, poner "V" como herramienta convertiría la letra v en inescribible.
 */
export function accionDe(e: KeyboardEvent, mapa: Record<AccionId, string>): AccionId | null {
  if (escribiendoTexto()) return null;
  const pulsado = comoAtajo(e);
  if (!pulsado) return null;
  for (const a of ACCIONES) {
    if (mapa[a.id] === pulsado) return a.id;
  }
  // Y si no era ninguna, se prueba con su gemela. Retroceso y Suprimir borran
  // en todos los editores que existen, y quien tiene diez trazos cogidos pulsa
  // la que le pilla más cerca sin pensarlo: mapear solo una es una pelea
  // perdida contra la costumbre de todo el mundo.
  const gemela = GEMELAS[pulsado];
  if (gemela) {
    for (const a of ACCIONES) {
      if (mapa[a.id] === gemela) return a.id;
    }
  }
  return null;
}

/** Teclas que significan lo mismo que otra. Se resuelven DESPUÉS del mapa, así
    que si alguien le pone a algo el Retroceso a propósito, gana lo suyo. */
const GEMELAS: Record<string, string> = { Backspace: "Delete" };
