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
// NO PROBADO en Linux: la causa está leída en el código, no medida en un
// WebKitGTK. Lo que fija el banco (`scripts/pegado-check.ts`) es la decisión.

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

export function crearPegado(m: ManosDePegado, portapapeles: Portapapeles = navigator.clipboard, reloj: Reloj = RELOJ) {
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
  /** El portapapeles no ha dado nada: el texto del evento, si lo hay. */
  const noLeyo = (suTurno: number) => {
    if (suTurno <= pegadoPorEvento) return;
    if (!espera) {
      fallo = reloj.ahora();
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
