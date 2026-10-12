import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

// Los mods: lo que el usuario pone encima de la app, en SU carpeta.
//
// Decisión de Munir del 2026-10-12 (`docs/contexto/mods.md`): quien quiere los
// iconos redondos se lo pide a su agente, el cambio se guarda en `mods\<id>\`
// dentro de la carpeta de datos y una actualización no lo pisa. Rust lee esa
// carpeta y decide qué pasa (`mods.rs`: solo estilo, y una hoja que no hable
// con la red); aquí se REPASA cada mod contra lo que esta versión conoce y se
// pone su hoja detrás de la de la app, que es lo que le da la prioridad.
//
// ── LA PRIORIDAD ES EL ORDEN, NO LA FUERZA ──────────────────────────────────
//
// La hoja de los mods va la última del documento, así que gana a cualquier
// regla de la app que pese lo mismo. Las variables de la escala viven en
// `:root` y un mod que escriba `:root { --r-icono: 999px }` las gana. Las de
// un tema viven en `:root[data-theme="…"]`, que pesa más: para esas el mod
// escribe `:root[data-theme]`, que pesa igual y va detrás. Meter la hoja de la
// app entera en una capa (`@layer`) haría que el mod ganase siempre, pero
// entonces las hojas de xterm y de React Flow, que van sueltas, pasarían a
// ganarle a la app.
//
// ── EL INTERRUPTOR ESTÁ APAGADO DE FÁBRICA ──────────────────────────────────
//
// Quien no lo ha encendido en Ajustes › Mods no puede encontrarse la app
// cambiada por algo que escribió en esa carpeta un agente. Y apagado no se lee
// la carpeta al arrancar.

/** `"1"` enciende los mods. Cualquier otra cosa, o nada, los deja apagados. */
export const MODS_KEY = "adeorq-mods";
/** Los que el usuario ha apagado uno a uno: una lista de ids, en JSON. */
export const MODS_APAGADOS_KEY = "adeorq-mods-apagados";

/**
 * Los nombres por pieza: EL CONTRATO con quien escribe un mod.
 *
 * Las variables de la guía de estilo son una escala (`--r-chico` es a la vez
 * una fila, un botón de icono y una casilla); estas dicen QUÉ pieza es. En la
 * hoja van siempre con su escalón de reserva, `var(--r-icono, var(--r-btn))`,
 * así que sin mods no cambia nada y nadie las declara. Por eso el repaso no
 * las puede preguntar al navegador y las mira aquí.
 *
 * Un nombre de esta lista no se renombra ni se quita a la ligera: es a lo que
 * se agarran los mods de la gente. `scripts/mods-check.ts` comprueba que la
 * lista y la hoja dicen lo mismo.
 */
export const PIEZAS: Record<string, string> = {
  "--r-icono":
    "La esquina de un botón de solo icono: los de la barra de arriba, los de la barra lateral, los de la cabecera de cada panel, los de la franja derecha y las herramientas del lienzo.",
  "--r-avatar":
    "La esquina del avatar de un proyecto: el cuadro con sus iniciales o con su logo, en la barra lateral, en la Agenda y donde se elige proyecto.",
};

/** Un mod tal como lo manda `mods_leer`. */
export interface Mod {
  id: string;
  nombre: string;
  /** La frase con que se pidió: lo que deja rehacerlo tras una actualización. */
  pedido: string;
  hechoPara: string;
  /** A qué se agarra: las variables que cambia. */
  toca: string[];
  hoja: string;
  /** Por qué Rust no lo dejó pasar, o `null`. */
  fallo: string | null;
}

/**
 * `no_engancha`: se aplica, pero algo de lo que dice tocar ya no existe.
 * `apagado`: lo apagó el usuario en Ajustes; sigue en su carpeta.
 */
export type EstadoMod = "aplicado" | "no_engancha" | "rechazado" | "apagado";

export interface ModRepasado extends Mod {
  estado: EstadoMod;
  /** Lo de `toca` que esta versión ya no conoce. */
  sueltas: string[];
}

/**
 * Cada mod contra lo que esta versión conoce.
 *
 * Solo se miran las variables (`--algo`): es lo único de `toca` que se puede
 * comprobar sin tener montada la pantalla donde vive cada pieza. Lo suelto se
 * dice también de un mod apagado, para saberlo antes de volver a encenderlo.
 */
export function repasar(
  mods: Mod[],
  existe: (variable: string) => boolean,
  apagados: ReadonlySet<string> = new Set(),
): ModRepasado[] {
  return mods.map((m) => {
    if (m.fallo) return { ...m, estado: "rechazado", sueltas: [] };
    const sueltas = m.toca.filter((t) => t.startsWith("--") && !existe(t));
    if (apagados.has(m.id)) return { ...m, estado: "apagado", sueltas };
    return { ...m, estado: sueltas.length ? "no_engancha" : "aplicado", sueltas };
  });
}

const puesto = (m: ModRepasado) => m.estado === "aplicado" || m.estado === "no_engancha";

/** La hoja de todos los que pasan, en su orden, cada una con su nombre delante. */
export function hojaDeLosMods(mods: ModRepasado[]): string {
  return mods
    .filter((m) => puesto(m) && m.hoja.trim())
    .map((m) => `/* mod: ${m.id} */\n${m.hoja.trim()}`)
    .join("\n\n");
}

/** Una línea para el rastro, o `""` si no hay ningún mod. */
export function resumenDeMods(mods: ModRepasado[]): string {
  if (mods.length === 0) return "";
  const de = (estado: EstadoMod) => mods.filter((m) => m.estado === estado);
  const trozos = [`mods: ${mods.filter(puesto).length} puestos`];
  for (const m of de("no_engancha")) trozos.push(`${m.id} ya no engancha (${m.sueltas.join(", ")})`);
  for (const m of de("rechazado")) trozos.push(`${m.id} rechazado (${m.fallo})`);
  if (de("apagado").length) trozos.push(`${de("apagado").length} apagados`);
  return trozos.join(" · ");
}

// ── La guía: lo que un agente necesita para escribir uno ───────────────────

/**
 * La guía para quien escribe un mod, que es un agente.
 *
 * Va en español a propósito, como todo lo que Adeorq le escribe a un agente.
 * Se rehace con cada versión (lleva la lista de piezas de ESTA) y Rust la deja
 * en `mods\LEEME.md`, al lado de los mods, para que la lea un agente de
 * cualquier proveedor sin más herramienta que abrir un archivo.
 */
export function guiaDeMods(version: string, carpeta: string): string {
  const sep = carpeta.includes("\\") ? "\\" : "/";
  const piezas = Object.entries(PIEZAS)
    .map(([nombre, que]) => `- \`${nombre}\`: ${que}`)
    .join("\n");
  return `# Cómo se escribe un mod de Adeorq

Esta guía la escribe Adeorq ${version} y la rehace en cada versión. Es para ti, el agente al que
alguien le ha pedido cambiar cómo se ve su Adeorq.

## Qué es un mod

Una carpeta dentro de esta, con dos archivos. Adeorq los lee, pone tu hoja de estilo detrás de la
suya (por eso gana) y una actualización no la toca, porque vive en la carpeta de datos del usuario.

    ${carpeta}${sep}<id>${sep}mod.json
    ${carpeta}${sep}<id>${sep}estilo.css

El \`<id>\` es el nombre de la carpeta: minúsculas, números y guiones, por ejemplo \`iconos-redondos\`.
Un cambio, un mod: no metas dos pedidos distintos en el mismo.

## mod.json

    {
      "id": "iconos-redondos",
      "pedido": "quiero los iconos redondos en vez de cuadrados",
      "hecho_para": "${version}",
      "tipo": "estilo",
      "toca": ["--r-icono"]
    }

- \`pedido\`: la frase de la persona, tal cual la dijo. Es lo que permite rehacer el mod cuando una
  versión nueva cambie algo. No la resumas ni la traduzcas.
- \`hecho_para\`: la versión de Adeorq para la que lo escribes. Hoy, ${version}.
- \`tipo\`: solo \`"estilo"\`. Cualquier otro no se carga.
- \`toca\`: las variables que cambias. Adeorq las repasa en cada versión y avisa a la persona si
  alguna ya no existe.

## estilo.css

Primero mira si lo que te piden tiene **una pieza con nombre**. Son lo estable: Adeorq se
compromete a mantenerlas.

${piezas}

Se cambian en \`:root\`:

    :root {
      --r-icono: 999px;
    }

Si no hay pieza con nombre, mira la escala y los colores. Las esquinas son \`--r-chico\`, \`--r-btn\`,
\`--r-caja\` y \`--r-pastilla\`, pero cada una la usan muchas piezas a la vez. Los colores del tema son
\`--accent\`, \`--accent-dim\`, \`--border\`, \`--border-strong\`, \`--text\`, \`--muted\`, \`--panel-solid\`
y \`--popover\`, y viven en el tema: para ganarlos, el selector es \`:root, :root[data-theme]\`.

Y si tampoco, escribe reglas con las clases de la app. Están en el código, que es público
(\`src/estilos/\` en github.com/Mun1to/Adeorq-releases). Una clase puede cambiar de nombre en una
versión nueva y tu regla dejaría de aplicarse sin romper nada: por eso se prefiere una variable, y
si lo que te piden merece una pieza con nombre, díselo a la persona.

## Lo que Adeorq no deja pasar

- \`@import\`, \`image-set()\` y cualquier \`url()\` que no sea \`data:\`. Un mod no pide nada a la red.
- La barra invertida. Escribe el carácter tal cual, sin escapes.
- Una hoja de más de 256 KB.
- Código. No hay mods con JavaScript.

Y lo que no debes hacer aunque pase: esconder, tapar o cambiar de sitio lo que pide un permiso,
pide una clave o enseña una cuenta.

## Al terminar

No toques nada fuera de esta carpeta: ni la instalación de Adeorq ni su código. Con los mods
encendidos (Ajustes › Mods), Adeorq aplica el tuyo solo en unos segundos. Dile a la persona que
mire ahí: verá tu mod con su estado y, si Adeorq lo rechaza, el motivo. Para deshacerlo basta con
apagarlo o quitarlo desde ese mismo sitio.
`;
}

/**
 * El encargo de un mod nuevo. Es UNA línea, y termina abierta: se ESCRIBE en
 * la terminal del agente y la persona acaba la frase con lo que quiere.
 */
export function encargoDeMod(rutaGuia: string): string {
  return `Lee ${rutaGuia} y hazme un mod de Adeorq: quiero `;
}

/** El encargo de rehacer uno que ya no engancha o que Adeorq no carga. */
export function encargoDeRehacer(m: ModRepasado, rutaGuia: string): string {
  const pedido = m.pedido.trim().replace(/\s+/g, " ");
  const queLePasa =
    m.estado === "rechazado"
      ? `Adeorq no lo carga: ${m.fallo}`
      : `ya no engancha en esta versión: ${m.sueltas.join(", ")} ya no existe`;
  const loQuePedi = pedido ? ` Lo que pedí con él fue: «${pedido}».` : "";
  return `Lee ${rutaGuia} y rehaz mi mod de Adeorq «${m.id}», que ${queLePasa}.${loQuePedi}`;
}

// ── La parte que toca la ventana ───────────────────────────────────────────

export function modsEncendidos(): boolean {
  try {
    return localStorage.getItem(MODS_KEY) === "1";
  } catch {
    return false;
  }
}

export function modsApagados(): Set<string> {
  try {
    const lista: unknown = JSON.parse(localStorage.getItem(MODS_APAGADOS_KEY) ?? "[]");
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const ID_HOJA = "adeorq-mods";
const AVISO = "adeorq-mods";

/** Pone la hoja la ÚLTIMA del documento, o la quita si viene vacía. */
function ponerHoja(css: string): void {
  const vieja = document.getElementById(ID_HOJA);
  if (!css) {
    vieja?.remove();
    return;
  }
  if (vieja?.textContent === css) return;
  const hoja = vieja ?? document.createElement("style");
  hoja.id = ID_HOJA;
  hoja.textContent = css;
  // `appendChild` de un nodo que ya está lo mueve al final: si la app metió
  // otra hoja después, la de los mods vuelve a ser la última.
  document.head.appendChild(hoja);
}

/**
 * Lo que hay en la carpeta, repasado, SIN aplicarlo. Es lo que enseña Ajustes,
 * también con los mods apagados: se ve lo que hay antes de encender nada.
 */
export async function estadoDeMods(): Promise<ModRepasado[]> {
  const leidos = await invoke<Mod[]>("mods_leer");
  aprender(leidos.flatMap((m) => m.toca).filter((v) => v.startsWith("--")));
  return repasar(leidos, (v) => v in PIEZAS || deLaApp.get(v) === true, modsApagados());
}

/** Si la app declara cada variable por la que ya se ha preguntado. */
const deLaApp = new Map<string, boolean>();

/**
 * Pregunta al navegador por las variables que aún no se conocen, con la hoja
 * de los mods APARTADA: si no, una que solo declara el propio mod contaría
 * como de la app. Se pregunta una vez por nombre y se recuerda, porque esto
 * corre cada pocos segundos y apartar la hoja obliga a recalcular la página
 * entera. Lo que la app declara no cambia mientras está abierta.
 */
function aprender(variables: string[]): void {
  const nuevas = variables.filter((v) => !(v in PIEZAS) && !deLaApp.has(v));
  if (nuevas.length === 0) return;
  const hoja = document.getElementById(ID_HOJA) as HTMLStyleElement | null;
  if (hoja) hoja.disabled = true;
  const raiz = getComputedStyle(document.documentElement);
  for (const v of nuevas) deLaApp.set(v, raiz.getPropertyValue(v).trim() !== "");
  if (hoja) hoja.disabled = false;
}

let ultimoResumen = "";
let ultimaFirma = "";

/**
 * Lee la carpeta, repasa y aplica. No lanza: un mod no puede tirar el arranque.
 *
 * Lo repasado queda en `window.__mods` y se avisa a quien escuche
 * (`alCambiarMods`), pero solo cuando algo cambia: esto corre cada pocos
 * segundos y no tiene que mover nada si la carpeta sigue igual.
 */
export async function cargarMods(): Promise<ModRepasado[]> {
  let repasados: ModRepasado[] = [];
  try {
    if (modsEncendidos()) repasados = await estadoDeMods();
    ponerHoja(hojaDeLosMods(repasados));
  } catch {
    ponerHoja("");
    repasados = [];
  }
  const firma = JSON.stringify(repasados);
  if (firma !== ultimaFirma) {
    ultimaFirma = firma;
    (window as unknown as { __mods?: ModRepasado[] }).__mods = repasados;
    window.dispatchEvent(new Event(AVISO));
  }
  const resumen = resumenDeMods(repasados);
  if (resumen !== ultimoResumen) {
    ultimoResumen = resumen;
    if (resumen) void invoke("anotar_rastro", { mensaje: resumen }).catch(() => {});
  }
  return repasados;
}

/** Avisa cada vez que cambia lo que hay puesto. Devuelve cómo dejar de escuchar. */
export function alCambiarMods(fn: () => void): () => void {
  window.addEventListener(AVISO, fn);
  return () => window.removeEventListener(AVISO, fn);
}

/** Enciende o apaga TODOS, y se nota en el acto. */
export function encenderMods(si: boolean): Promise<ModRepasado[]> {
  try {
    if (si) localStorage.setItem(MODS_KEY, "1");
    else localStorage.removeItem(MODS_KEY);
  } catch {
    // Sin almacenamiento se quedan como estaban.
  }
  if (si) void escribirGuia().catch(() => {});
  return cargarMods();
}

/** Apaga o enciende UNO. Sigue en su carpeta. */
export function apagarMod(id: string, apagado: boolean): Promise<ModRepasado[]> {
  const ids = modsApagados();
  if (apagado) ids.add(id);
  else ids.delete(id);
  try {
    localStorage.setItem(MODS_APAGADOS_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Sin almacenamiento se queda como estaba.
  }
  return cargarMods();
}

/** A la papelera, y deja de contar como apagado: si vuelve, vuelve encendido. */
export async function quitarMod(id: string): Promise<void> {
  await invoke("mods_quitar", { id });
  await apagarMod(id, false);
}

export function carpetaDeMods(): Promise<string> {
  return invoke<string>("mods_carpeta");
}

/** Deja la guía de ESTA versión al lado de los mods y devuelve su ruta. */
export async function escribirGuia(): Promise<string> {
  const [version, carpeta] = await Promise.all([getVersion(), carpetaDeMods()]);
  return invoke<string>("mods_escribir_guia", { texto: guiaDeMods(version, carpeta) });
}

/** Cada cuánto se mira la carpeta con los mods encendidos. */
const CADA_MS = 4000;

/**
 * Los mods al arrancar, y después cada pocos segundos mientras estén
 * encendidos y la ventana se vea: quien le pide un mod a su agente lo tiene
 * puesto sin tocar nada. También al volver el foco, que es antes.
 *
 * La hoja se mantiene la última. La app sigue metiendo hojas en la cabecera
 * después de arrancar (las de cada pieza que se carga al abrirla: xterm, el
 * lienzo), y una que llegue detrás le ganaría al mod a igual peso. Medido en el
 * banco: a los dos segundos de arrancar, la de los mods ya no era la última.
 *
 * Y la salida de emergencia: Ctrl+Alt+Mayús+0 los apaga todos. Un mod puede
 * dejar la pantalla inservible, Ajustes incluido, y entonces el interruptor no
 * se puede ni encontrar; una tecla no depende de lo que se vea.
 */
export function vigilarMods(): void {
  void cargarMods().then(() => {
    // La guía se rehace al arrancar: tras una actualización tiene que decir
    // las piezas de la versión nueva antes de que nadie se la dé a un agente.
    if (modsEncendidos()) void escribirGuia().catch(() => {});
  });
  window.addEventListener("focus", () => void cargarMods());
  window.setInterval(() => {
    if (modsEncendidos() && document.visibilityState === "visible") void cargarMods();
  }, CADA_MS);
  new MutationObserver(() => {
    const hoja = document.getElementById(ID_HOJA);
    if (hoja && document.head.lastElementChild !== hoja) document.head.appendChild(hoja);
  }).observe(document.head, { childList: true });
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.ctrlKey && e.altKey && e.shiftKey && e.code === "Digit0")) return;
      e.preventDefault();
      void encenderMods(false);
    },
    true,
  );
}
