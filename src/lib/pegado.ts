// Pegar en una terminal: dos caminos y un solo dueño.
//
// El camino de siempre es leer el portapapeles del navegador
// (`navigator.clipboard`), que es el que sabe de imágenes. El otro es el
// evento `paste` que el navegador dispara por su cuenta con Ctrl+V: se para
// para que xterm no pegue por segunda vez (todo salía doble, 2026-07-30), y
// hasta el 2026-10-13 su texto se tiraba.
//
// En Linux eso dejaba sin pegar (incidencia #3 del repo público, «No se puede
// pegar texto», desde Fedora): si WebKitGTK niega el portapapeles del
// navegador, no quedaba ningún camino. Ahora el texto del evento es el
// REPUESTO: se usa cuando el portapapeles falla, viene vacío o no contesta.
// Lo que sigue siendo verdad es que pega UNO solo de los dos.
//
// Con eso Ctrl+Mayús+V ya pegaba en Fedora (lo confirmó quien abrió la #3, el
// 2026-10-15), pero «Pegar» con el botón derecho no: es un menú propio, el
// navegador no dispara ningún evento detrás, y sin portapapeles no quedaba
// nada. Así que hay un tercer camino, el portapapeles del SISTEMA, que el PC
// lee con GTK (`portapapeles_texto` en manage.rs; en Windows contesta nada,
// que allí el del navegador funciona). Se pide solo si el del navegador falló
// y no ha llegado evento en `ESPERA_AL_PORTAPAPELES_MS`: un Ctrl+V con su
// evento nunca lo usa, y lo que él pega cuenta como pegado para un evento tardío.
//
// El resultado está medido en WebKitGTK 2.52.5 sobre X11 con
// `scripts/laboratorio/linux-de-verdad.mjs` (2026-11-03): cada gesto pega una vez. Qué
// camino de los tres gana allí no se distingue desde fuera, y en Wayland, que es lo que
// tenía quien abrió la #3, NO PROBADO. Lo que fija el banco
// (`scripts/pegado-check.ts`) es la decisión.

import { invoke } from "@tauri-apps/api/core";

/** Lo que se espera al portapapeles antes de dar por bueno el texto del evento. */
export const ESPERA_AL_PORTAPAPELES_MS = 250;
/** Cuánto vale un fallo del portapapeles para el evento que llega detrás. */
const VENTANA_MS = 800;

export interface ManosDePegado {
  /** Escribe en la terminal como un pegado (`term.paste`). */
  pegar: (texto: string) => void;
  /** Guarda una imagen del portapapeles y devuelve su ruta. */
  guardarImagen: (bytes: number[], extension: string) => Promise<string>;
  /** Se ha pegado una imagen como ruta: toca decirlo. */
  alPegarImagen: () => void;
}

interface Portapapeles {
  read(): Promise<ReadonlyArray<{ types: readonly string[]; getType(tipo: string): Promise<Blob> }>>;
  readText(): Promise<string>;
}

export interface Reloj {
  ahora: () => number;
  programar: (f: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
}

const RELOJ: Reloj = {
  ahora: () => Date.now(),
  programar: (f, ms) => setTimeout(f, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** El portapapeles del sistema, leído por el PC: `null` si no sabe o no hay texto. */
const delSistemaDeVerdad = () => invoke<string | null>("portapapeles_texto");
/** Lo seleccionado en Linux (la selección PRIMARY de X): `null` en los demás sistemas. */
const deLaSeleccionDeVerdad = () => invoke<string | null>("portapapeles_texto", { seleccion: true });

export function crearPegado(
  m: ManosDePegado,
  portapapeles: Portapapeles = navigator.clipboard,
  reloj: Reloj = RELOJ,
  delSistema: () => Promise<string | null> = delSistemaDeVerdad,
  deLaSeleccion: () => Promise<string | null> = deLaSeleccionDeVerdad,
) {
  /** El texto de un evento que espera a ver qué hace el portapapeles. */
  let espera: { texto: string; id: unknown } | null = null;
  let fallo = -Infinity;
  let bien = -Infinity;
  /** Cada lectura del portapapeles lleva su número; hasta cuál ya pegó el evento. */
  let turno = 0;
  let pegadoPorEvento = 0;

  const porElEvento = (texto: string) => {
    pegadoPorEvento = turno;
    m.pegar(texto);
  };
  /** El portapapeles ha leído algo: ¿le toca pegarlo a él? */
  const leyo = (suTurno: number): boolean => {
    if (suTurno <= pegadoPorEvento) return false;
    if (espera) {
      reloj.cancelar(espera.id);
      espera = null;
    }
    bien = reloj.ahora();
    return true;
  };
  /** El portapapeles no ha dado nada: el texto del evento, si lo hay. Si no
      lo hay, se le da su espera, y si tampoco llega, el del sistema. */
  const noLeyo = (suTurno: number) => {
    if (suTurno <= pegadoPorEvento) return;
    if (!espera) {
      fallo = reloj.ahora();
      reloj.programar(() => {
        if (suTurno <= pegadoPorEvento || suTurno !== turno) return;
        void delSistema().then((texto) => {
          if (!texto || suTurno <= pegadoPorEvento || suTurno !== turno) return;
          // Cuenta como pegado: un evento que llegue ahora no lo repite.
          pegadoPorEvento = suTurno;
          fallo = -Infinity;
          bien = reloj.ahora();
          m.pegar(texto);
        }, () => {});
      }, ESPERA_AL_PORTAPAPELES_MS);
      return;
    }
    reloj.cancelar(espera.id);
    const texto = espera.texto;
    espera = null;
    porElEvento(texto);
  };

  return {
    /** Ctrl+V, el botón derecho o «Pegar» del menú. */
    desdeElPortapapeles() {
      const mio = ++turno;
      const soloTexto = () =>
        portapapeles
          .readText()
          .then((texto) => {
            if (!texto) noLeyo(mio);
            else if (leyo(mio)) m.pegar(texto);
          })
          .catch(() => noLeyo(mio));
      void portapapeles
        .read()
        .then(async (items) => {
          for (const item of items) {
            const tipo = item.types.find((x) => x.startsWith("image/"));
            if (!tipo) continue;
            const blob = await item.getType(tipo);
            const ruta = await m.guardarImagen(Array.from(new Uint8Array(await blob.arrayBuffer())), tipo.split("/")[1] ?? "png");
            if (!leyo(mio)) return;
            m.pegar(`"${ruta}" `);
            m.alPegarImagen();
            return;
          }
          await soloTexto();
        })
        // Una API antigua o el permiso negado para `read`: se prueba solo el texto.
        .catch(() => soloTexto());
    },

    /** El botón central en Linux: lo seleccionado, que no es el portapapeles. */
    desdeLaSeleccion() {
      const mio = ++turno;
      void deLaSeleccion().then(
        (texto) => {
          if (texto && leyo(mio)) m.pegar(texto);
        },
        () => {},
      );
    },

    /** El evento `paste` del navegador, ya parado: su texto es el repuesto. */
    desdeElEvento(texto: string) {
      if (!texto) return;
      const ahora = reloj.ahora();
      if (ahora - fallo < VENTANA_MS) {
        fallo = -Infinity;
        porElEvento(texto);
        return;
      }
      if (ahora - bien < VENTANA_MS) return;
      if (espera) reloj.cancelar(espera.id);
      const id = reloj.programar(() => {
        if (espera?.id !== id) return;
        espera = null;
        porElEvento(texto);
      }, ESPERA_AL_PORTAPAPELES_MS);
      espera = { texto, id };
    },
  };
}

/**
 * El pegado de una terminal viva, enganchado a su caja. Devuelve `pegar` (Ctrl+V y
 * «Pegar» del menú) y `soltar`. Pega texto e imágenes: una imagen va a disco y el panel
 * recibe su ruta, que es lo que Claude Code y agy leen para verla.
 */
export function engancharPegado(
  caja: HTMLElement,
  term: { paste(texto: string): void; focus(): void; modes: { mouseTrackingMode: string } },
  guardarImagen: ManosDePegado["guardarImagen"],
  alPegarImagen: ManosDePegado["alPegarImagen"],
) {
  const pegado = crearPegado({ pegar: (texto) => term.paste(texto), guardarImagen, alPegarImagen });

  // El pegado nativo del WebView, CALLADO. Cuando se escribió esto, el WebView no
  // entregaba ese evento al cuadro de texto de xterm; el WebView2 se actualiza solo y
  // dejó de ser verdad. Resultado: pegaban DOS caminos, este evento y nuestro Ctrl+V, y
  // todo salía doble, concatenado sin espacio. Munir pegó `claude --strict-mcp-config`
  // y la terminal recibió `claude --strict-mcp-configclaude --strict-mcp-config`
  // (2026-07-30). En captura y con stopPropagation: el evento muere antes de llegar a
  // xterm y pegar queda en un único dueño. Su TEXTO es el repuesto de arriba.
  const alPegarNativo = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    pegado.desdeElEvento((e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "");
  };

  // El botón central pega lo seleccionado, como cualquier terminal de Linux. xterm se
  // lo deja al navegador (mueve su cuadro de texto bajo el ratón en `auxclick`), y en
  // WebKitGTK no pega nada: el clic central ya le quitó el foco y llega tarde, medido
  // en `scripts/laboratorio/linux-de-verdad.mjs`. Si el programa ha pedido el ratón, el
  // clic es suyo. En Windows y macOS el PC contesta nada y no pega.
  const alBotonCentral = (e: MouseEvent) => {
    if (e.button !== 1 || term.modes.mouseTrackingMode !== "none") return;
    pegado.desdeLaSeleccion();
    term.focus();
  };

  caja.addEventListener("paste", alPegarNativo, true);
  caja.addEventListener("auxclick", alBotonCentral);
  return {
    pegar: () => pegado.desdeElPortapapeles(),
    soltar: () => {
      caja.removeEventListener("paste", alPegarNativo, true);
      caja.removeEventListener("auxclick", alBotonCentral);
    },
  };
}

// Copiar desde el programa: OSC 52.
//
// Claude Code en pantalla completa tiene el ratón, así que el arrastre es suyo:
// él pinta la selección y manda lo seleccionado a la terminal como
// `ESC ] 52 ; c ; <base64> BEL`, que es como copian los programas de terminal.
// xterm no lo atiende si nadie se lo pide, y hasta el 2026-11-01 Adeorq no se lo
// pedía: arrastrar no copiaba nada, y el Ctrl+C de después, sin selección de
// xterm, le llegaba al programa como interrupción. Medido con un Claude Code de
// verdad en `scripts/laboratorio/copiar-pegar-claude.mjs`.
//
// Solo ESCRIBIR. La pregunta `?` (el programa quiere leer tu portapapeles) se
// ignora siempre, como hace Windows Terminal: cualquier cosa que corra en un
// panel podría llevarse lo último que copiaste.

/** Lo más largo que se acepta, en caracteres de base64 (unos 750 KB de texto). */
export const TOPE_OSC52 = 1_000_000;

/** El texto que un OSC 52 pide copiar, o `null` si no hay que tocar nada. */
export function textoDeOsc52(datos: string): string | null {
  const sep = datos.indexOf(";");
  if (sep < 0) return null;
  const b64 = datos.slice(sep + 1);
  if (!b64 || b64 === "?" || b64.length > TOPE_OSC52 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const texto = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return texto || null;
  } catch {
    return null;
  }
}

/** Atiende el OSC 52 en esa terminal; se suelta solo con ella.
 *
 *  Y solo si es la terminal en la que estás: la ventana con el foco y el foco
 *  dentro de ESA terminal. Si no, cualquier programa de cualquier panel (un
 *  agente en segundo plano, un `cat` de un archivo con la secuencia dentro)
 *  podría pisarte el portapapeles mientras trabajas en otro sitio. El arrastre
 *  en Claude Code no sufre: el clic ya ha puesto el foco en su terminal cuando
 *  llega el OSC, al soltar el ratón (`copiar-pegar-claude.mjs`). */
export function copiarPorOsc52(
  term: { element?: HTMLElement; parser: { registerOscHandler(id: number, f: (datos: string) => boolean): unknown } },
  escribir: (texto: string) => void = (t) => void navigator.clipboard.writeText(t).catch(() => {}),
  conFoco: () => boolean = () => document.hasFocus() && !!term.element?.contains(document.activeElement),
) {
  term.parser.registerOscHandler(52, (datos) => {
    const texto = textoDeOsc52(datos);
    if (texto && conFoco()) escribir(texto);
    return true;
  });
}
