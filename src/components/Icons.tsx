// The app's own icons, drawn rather than typed.
//
// The buttons used to be text glyphs: ▦ ▤ for the two rail modes, ○ ◫ ▬ ⛶ ×
// on every pane header. At 12px those are smudges, ▦ and ▤ are the same smudge,
// and a font substitution can silently change what a button looks like. Munir's
// complaint was exact: "cuesta ver de qué son" and "no se diferencian".
//
// So: one stroke weight, one grid, one viewBox, and each icon says what its
// button does. Line icons scale, take currentColor, and cannot be swapped out
// by a missing font.

interface Props {
  /** Rendered size in px; 17 suits the small buttons of the header. */
  size?: number;
}

function svg(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

/** Rail: photos only. A wall of marks, which is what that mode shows. */
export function GridIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </svg>
  );
}

/** Rail: photo and name. A mark with a line of text beside it, twice. */
export function RowsIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3.5" y="4.5" width="6" height="6" rx="2" />
      <rect x="3.5" y="13.5" width="6" height="6" rx="2" />
      <path d="M12.5 7.5h8M12.5 16.5h8" />
    </svg>
  );
}

/** Rail: la tira estrecha. Tres marcas en una sola columna, pegadas al borde,
    que es exactamente lo que se ve cuando está puesta. */
export function StripIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="4.5" y="3.5" width="6" height="6" rx="2" />
      <rect x="4.5" y="12.5" width="6" height="6" rx="2" />
      <path d="M14.5 4.5v13" />
    </svg>
  );
}

export function PlusIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * La marca de Adeorq: la proa de Munir, el mismo dibujo que el icono de la app
 * y el del README (`web/assets/adeorq.svg`), aquí como componente para poder
 * ponerla dentro de la interfaz sin cargar un archivo.
 *
 * Va RELLENA y no de trazo, que es la excepción a la regla de los iconos de la
 * casa: esto no es un icono de acción, es la cara del programa, y de trazo se
 * confundiría con un botón más de la fila.
 */
export function AdeorqMark({ size = 22 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="adq-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#48c2ff" />
          <stop offset="1" stopColor="#2f9df3" />
        </linearGradient>
      </defs>
      <path
        fill="url(#adq-a)"
        fillRule="evenodd"
        d="M 236 112 L 788 112 L 1016 756 L 944 848 L 80 848 L 8 756 Z M 512 240 L 712 730 Q 512 572 312 730 Z"
      />
    </svg>
  );
}

/**
 * Descargar. Gordo y macizo a propósito (Munir, 2026-08-08: «un icono simple
 * gordo de descarga»): va en la tarjeta de actualizar, que es una sola cosa que
 * pulsar, no una fila de herramientas donde el trazo fino manda.
 */
export function DownloadIcon({ size = 17 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.6 3.4v7.9h3.1c.6 0 .9.7.5 1.1l-4.7 5.1a.7.7 0 0 1-1 0l-4.7-5.1c-.4-.4-.1-1.1.5-1.1h3.1V3.4c0-.5.4-.9.9-.9h1.4c.5 0 .9.4.9.9Z"
      />
      <rect fill="currentColor" x="3.6" y="18.4" width="16.8" height="2.9" rx="1.45" />
    </svg>
  );
}

/* La mitad horizontal del anterior, con la misma medida: los dos van juntos en
   el mismo par de botones y un menos más corto o más largo que el más se ve. */
export function MinusIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function RefreshIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.4" />
    </svg>
  );
}

/** Open every session of this project at once. */
export function StackIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="8" y="3.5" width="12.5" height="12.5" rx="2.5" />
      <path d="M15.5 20.5H6A2.5 2.5 0 0 1 3.5 18V8.5" />
    </svg>
  );
}

export function TerminalIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" />
      <path d="M6.5 10l2.5 2-2.5 2M12 14h5" />
    </svg>
  );
}

/** Covered for a stream, or visible. Two icons, one meaning each way. */
export function EyeIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function EyeOffIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 5l16 14" />
      <path d="M9.6 6.5A9.9 9.9 0 0 1 12 6c6.2 0 10 6 10 6a18 18 0 0 1-2.7 3.2" />
      <path d="M6.6 8.3A17.6 17.6 0 0 0 2 12s3.8 6 10 6a9.7 9.7 0 0 0 3.4-.6" />
    </svg>
  );
}

/** Split: the pane divides, and the new half is where the fill is. */
export function SplitRightIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M12 4v16" />
      <path d="M15 8.5h3M15 12h3M15 15.5h3" opacity="0.75" />
    </svg>
  );
}

export function SplitDownIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M4 12h16" />
      <path d="M8 15h8M8 18h5" opacity="0.75" />
    </svg>
  );
}

/**
 * Minimizar: de la ventana entera queda solo su barra de abajo.
 *
 * El marco tenue es lo que se va y la barra marcada es lo que queda, que es
 * literalmente lo que hace: la terminal baja a la tira del pie. El primer
 * intento fue una flecha hacia abajo sobre una línea, y eso es el icono de
 * descargar en todas partes (Munir, 2026-08-02: «parece un botón de guardar»).
 */
/**
 * Sacar la terminal fuera de Adeorq.
 *
 * Una ventana que se ha ido de su sitio, con la flecha saliendo por la esquina.
 * No es la flecha de «abrir enlace externo» de siempre porque aquí no se va
 * nada a un navegador: lo que sale es esta misma terminal, y por eso el marco
 * que deja atrás está dibujado con línea partida, como un hueco.
 */
export function SacarIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M13.5 4.5H5.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-8" opacity="0.4" strokeDasharray="3 2.5" />
      <path d="M20 4l-8 8" />
      <path d="M14.5 4H20v5.5" />
    </svg>
  );
}

/** La vuelta del de arriba: la flecha ENTRA en la caja. Es el botón con el que
    una terminal suelta regresa al mosaico de Adeorq. */
export function DevolverIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M13.5 4.5H5.5a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-8" opacity="0.4" strokeDasharray="3 2.5" />
      <path d="M20 4l-8 8" />
      <path d="M12 6.5V12h5.5" />
    </svg>
  );
}

export function MinimizeIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" opacity="0.4" />
      <path d="M7.5 16.5h9" />
    </svg>
  );
}

/**
 * Lo contrario del anterior, dibujado como su reflejo: aquí el marco es lo que
 * está marcado y la barra de abajo lo que se va. La ventana vuelve.
 *
 * No vale `MaximizeIcon` ni `RestoreIcon`: esos dos hablan del tamaño de una
 * ventana, y esto no agranda nada, devuelve al mosaico lo que estaba apartado.
 */
export function UnminimizeIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M7.5 16.5h9" opacity="0.4" />
    </svg>
  );
}

export function MaximizeIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M9 4H6a2 2 0 0 0-2 2v3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M4 15v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function RestoreIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 9h3a2 2 0 0 0 2-2V4M20 9h-3a2 2 0 0 1-2-2V4M20 15h-3a2 2 0 0 0-2 2v3M4 15h3a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

/** Cuánto tapa un panel lo que hay detrás.
    El círculo medio relleno es el signo de contraste de toda la vida y se lee
    entero a quince píxeles. Antes era una gota con medio relleno tenue, que a
    ese tamaño no era una gota: era una mancha (Munir, 2026-08-02). */
export function OpacityIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)} strokeWidth={2.1}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Buscar. La lupa de siempre: aquí no hay nada que reinventar. */
export function SearchIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m15.8 15.8 4.2 4.2" />
    </svg>
  );
}

/** El segundo cerebro: notas enlazadas entre sí, que es lo que se ve en la
    Cerebro. Tres puntos y sus hilos: la vista se llama así por lo que ES una
    bóveda de notas enlazadas, no porque haya que dibujar un cerebro. */
export function MemoryIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="6.5" cy="8" r="2.4" />
      <circle cx="17" cy="6.5" r="2.2" />
      <circle cx="13" cy="17.5" r="2.6" />
      <path d="M8.7 9.3 11.4 15M8.6 7.2l6-0.6M16 8.6l-1.9 6.6" opacity="0.55" />
    </svg>
  );
}

/** Plegar y desplegar un panel. La punta mira adonde va a ir el contenido. */
export function ChevronIcon({
  size = 17,
  up = false,
  der = false,
  izq = false,
}: Props & { up?: boolean; der?: boolean; izq?: boolean }) {
  // `der` para lo que se cierra hacia un LADO. Un panel anclado al borde
  // derecho se plegaba con un chevron hacia abajo, que apuntaba a un sitio al
  // que ese panel no se va (Munir, 2026-08-06).
  // `izq` es el de VOLVER, y existe para que los botones de atrás dejen de
  // llevar un «←» de teclado: en esta app los iconos se dibujan.
  const d = izq
    ? "M14.5 6 8.5 12l6 6"
    : der
      ? "M9.5 6 15.5 12l-6 6"
      : up
        ? "M6 14.5 12 8.5l6 6"
        : "M6 9.5 12 15.5l6-6";
  return (
    <svg {...svg(size)} strokeWidth={2.3}>
      <path d={d} />
    </svg>
  );
}

/** Devolver un panel suelto a su esquina: la esquina y la flecha que entra en
    ella. Solo esas dos formas, con la punta dibujada: el trazo tenue que había
    de tercero no se leía y solo emborronaba el dibujo. */
export function CornerIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)} strokeWidth={2.1}>
      <path d="M20 13.5V20h-6.5" />
      <path d="M10.5 10.5 19.4 19.4" />
      <path d="M10.5 15v-4.5H15" />
    </svg>
  );
}

export function CloseIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)} strokeWidth={2.2}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

/** Archived sessions, hidden from the list but not deleted. */
export function ArchiveIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="4" width="18" height="4.5" rx="1.5" />
      <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
      <path d="M10 13h4" />
    </svg>
  );
}

/** La galería: un marco con una montaña y su sol, que es como se dibuja "foto"
    en todas partes, y una segunda hoja detrás porque son varias. */
export function GalleryIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="2.5" y="6" width="15" height="12" rx="2.5" />
      <path d="M2.5 14.5l4-3.5 3.5 3 2.5-2 5 4.5" />
      <circle cx="12.8" cy="9.8" r="1.3" />
      <path d="M6.5 3.5h12A3 3 0 0 1 21.5 6.5v9" />
    </svg>
  );
}

/** Una nota del lienzo: una hoja con dos renglones y una casilla marcada, que
    es lo que la nota puede llevar dentro. Sin la casilla se confundía con
    "documento" a 17 px. */
export function NoteIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M5 4.5h14v11.5l-4 4H5z" />
      <path d="M19 16h-4v4" />
      <path d="M8 8.5h8M8 12h4" />
    </svg>
  );
}

/** Thrown away for real, unlike the archive box right above it: a bin with a
    lid, the shape everyone already reads as "delete". */
export function TrashIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5l.9 12.2A1.8 1.8 0 0 0 9.2 20.5h5.6a1.8 1.8 0 0 0 1.8-1.8l.9-12.2" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Las ocho pestañas del header.
   Estaban puestas como glifos sueltos (◱ ▦ 🗓 ⬡ ◍ ? ⌘ ⚙): un emoji al lado de
   unas figuras geométricas al lado de un signo de interrogación, cada uno con
   su grosor y su tamaño real distintos, y uno de ellos a merced de la fuente
   de emoji del sistema. Es el mismo problema que este archivo se escribió para
   resolver en los botones de los paneles, y se había quedado sin resolver
   justo en la barra que se ve siempre.
   -------------------------------------------------------------------------- */

/** Panel: el vistazo de pájaro, cuadros de distinto peso. */
export function PanelIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <path d="M13.5 17.25 h7.5" />
    </svg>
  );
}

/** Cabina: el mosaico de terminales. */
export function CockpitIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="2.5" y="4" width="19" height="16" rx="2.2" />
      <path d="M12 4 v16 M2.5 12 h9.5" />
    </svg>
  );
}

/** Agenda: lo que viene, con su fecha. */
export function AgendaIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="5" width="18" height="16" rx="2.2" />
      <path d="M3 10 h18 M8 3 v4 M16 3 v4" />
      <path d="M8 15 h5" />
    </svg>
  );
}

/** Lienzo: piezas unidas por una flecha, que es de lo que va. */
export function CanvasIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="2.5" y="3.5" width="7" height="6" rx="1.5" />
      <rect x="14.5" y="14.5" width="7" height="6" rx="1.5" />
      <path d="M9.5 6.5 h4.5 a3 3 0 0 1 3 3 v4" />
    </svg>
  );
}

/** Cuentas: una persona, que es lo que hay detrás de cada una. */
export function AccountIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5 a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

/** Guía: un libro abierto. */
export function GuideIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 6.5 C10 4.8 7.4 4.3 3.5 4.5 v13 c3.9 -0.2 6.5 0.3 8.5 2 2 -1.7 4.6 -2.2 8.5 -2 v-13 c-3.9 -0.2 -6.5 0.3 -8.5 2 z" />
      <path d="M12 6.5 v14" />
    </svg>
  );
}

/** Comandos: la tecla de comando, que es lo que la pestaña lista. */
export function CommandIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M9 9 h6 v6 h-6 z" />
      <path d="M9 9 V6.5 a2.5 2.5 0 1 0 -2.5 2.5 z M15 9 V6.5 a2.5 2.5 0 1 1 2.5 2.5 z M9 15 v2.5 a2.5 2.5 0 1 1 -2.5 -2.5 z M15 15 v2.5 a2.5 2.5 0 1 0 2.5 -2.5 z" />
    </svg>
  );
}

/** Ajustes: la rueda, sin los doce dientes que a 17px son una mancha. */
export function SettingsIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5 v2.6 M12 18.9 v2.6 M21.5 12 h-2.6 M5.1 12 H2.5 M18.7 5.3 l-1.8 1.8 M7.1 16.9 l-1.8 1.8 M18.7 18.7 l-1.8 -1.8 M7.1 7.1 L5.3 5.3" />
    </svg>
  );
}

/** El Capataz: una estrella de cuatro puntas, la marca que ya lleva. */
export function ForemanIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 2.8 C12.9 8.2 15.8 11.1 21.2 12 C15.8 12.9 12.9 15.8 12 21.2 C11.1 15.8 8.2 12.9 2.8 12 C8.2 11.1 11.1 8.2 12 2.8 z" />
    </svg>
  );
}

/** Emisión: el punto de grabar. Relleno cuando está puesta, hueco cuando no,
    que es la misma convención de cualquier cámara. */
/**
 * Emisión: un punto con dos ondas saliendo a cada lado.
 *
 * Antes era un círculo con otro dentro, que es el dibujo universal de «grabar»
 * y no decía nada de emitir (Munir, 2026-08-08, con la referencia delante). Las
 * ondas son lo que se reconoce sin leer: es el mismo símbolo del wifi, de la
 * radio y del directo. El punto del centro se rellena solo cuando está
 * encendido, que es la única diferencia que hace falta ver de un vistazo.
 */
export function StreamIcon({ size = 17, on = false }: Props & { on?: boolean }) {
  return (
    <svg {...svg(size)}>
      {/* Las de fuera, más abiertas; las de dentro, más cerradas. Los arcos van
          por la izquierda y por la derecha, no arriba: una emisión sale hacia
          los lados, y así el icono ocupa su caja a lo ancho como sus vecinos. */}
      <path d="M5.6 4.6a10 10 0 0 0 0 14.8" />
      <path d="M18.4 4.6a10 10 0 0 1 0 14.8" />
      <path d="M8.9 8.3a5.2 5.2 0 0 0 0 7.4" />
      <path d="M15.1 8.3a5.2 5.2 0 0 1 0 7.4" />
      <circle cx="12" cy="12" r="2.3" fill={on ? "currentColor" : "none"} />
    </svg>
  );
}

/**
 * El Asistente: un orbe.
 *
 * La estrella de cuatro puntas que tenía es la marca genérica de «IA» que usa
 * media industria, y encima iba con la palabra al lado, así que ocupaba como
 * un botón y decía menos que un icono solo. Un orbe es otra cosa: una esfera
 * suspendida, con un anillo que la rodea en escorzo y un punto de luz. Se
 * reconoce a 16px, no se parece a ninguna otra cosa de la barra, y no es la
 * chispa de nadie más.
 *
 * El anillo lleva su propio grosor, más fino que el trazo de la casa: es lo
 * que hace que se lea como algo que ORBITA y no como un segundo círculo.
 */
export function OrbIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="11.5" r="5.4" />
      <ellipse
        cx="12"
        cy="11.5"
        rx="10"
        ry="4.1"
        strokeWidth={1.2}
        opacity={0.75}
        transform="rotate(-22 12 11.5)"
      />
      <circle cx="10.1" cy="9.6" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * En qué anda un agente, dibujado.
 *
 * Eran cuatro glifos de texto (● ▲ ✓ ·) puestos donde tocara. Un `✓` de la
 * fuente es un tick de lista de la compra, cambia de forma según qué tipografía
 * cargue el sistema, y al lado de los iconos de la casa se ve como una pegatina
 * de otro sitio (Munir, 2026-08-07: «el tick no me gusta ese icono»).
 *
 * Ahora son cuatro dibujos de la misma familia que el resto: mismo grosor de
 * trazo, misma rejilla, y cada uno dice lo suyo sin leer nada. El color lo pone
 * quien los usa, que es quien sabe si ese estado urge.
 */
export function EstadoIcon({ estado, size = 13 }: Props & { estado: string }) {
  // Terminó: el círculo cerrado y el visto DENTRO. Cerrado porque terminar es
  // cerrar algo, y dentro para que no se lea como una casilla de tarea.
  if (estado === "lista") {
    return (
      <svg {...svg(size)}>
        <circle cx="12" cy="12" r="9" />
        <polyline points="8.2 12.2 11 15 16 9.4" />
      </svg>
    );
  }
  // Te espera: el aviso de siempre, un triángulo con su marca. Es el único de
  // los cuatro que tiene que llamarte desde el rabillo del ojo.
  if (estado === "pregunta" || estado === "ofrece" || estado === "tuya") {
    return (
      <svg {...svg(size)}>
        <path d="M12 4.5 21 19.5H3z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // Trabajando: medio círculo relleno, el mismo dibujo que usa el panel de
  // objetivos para «a medias». Se ve de un vistazo que hay algo en marcha.
  if (estado === "a_medias") {
    return (
      <svg {...svg(size)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // Y lo que no se sabe: un círculo y nada más. No inventarse un estado es
  // parte del trato de este tablero.
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function GitBranchIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function DiffIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16" y1="8" x2="18" y2="8" />
      <line x1="6" y1="8" x2="8" y2="8" />
      <line x1="16" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="8" y2="12" />
    </svg>
  );
}


/**
 * El Reparto: una lista que se abre en varias manos.
 *
 * Un tronco a la izquierda y tres ramas que salen hacia la derecha, cada una
 * terminada en su punto. Se lee como «esto se divide» a 17px, que es lo único
 * que tiene que decir al lado del orbe del Asistente.
 */
export function RepartoIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 12 h4 M8 12 V5 h5 M8 12 h5 M8 12 v7 h5" />
      <circle cx="15.6" cy="5" r="2.2" />
      <circle cx="15.6" cy="12" r="2.2" />
      <circle cx="15.6" cy="19" r="2.2" />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   Los que faltaban, y por qué son tantos de golpe.

   La app llevaba 260 glifos de fuente haciendo de icono: la papelera, el
   calendario, la bombilla y la diana en las cabeceras; el lápiz, la recarga,
   la equis, la bandera, el aviso y el rayo en los botones; y los triangulitos,
   los rombos y los destellos repartidos por todas partes. Es el mismo problema
   que este archivo abrió resolviendo en los botones de los paneles y siguió
   resolviendo en el header, solo que en el resto de la casa nadie lo había
   terminado: cada glifo con su grosor, su rejilla y su tamaño real distintos,
   y los emoji además cambiando de dibujo entre versiones de Windows.

   La forma la marca Bootstrap Icons (MIT), que es donde Munir señaló: se ha
   mirado cómo resuelven cada figura y se ha vuelto a dibujar en la rejilla de
   esta casa. No se instala su paquete, y el motivo es medible: los suyos son
   MACIZOS sobre 16 y estos son de LÍNEA sobre 24 con trazo 1,9, así que
   mezclarlos habría dejado dos estilos en la misma barra en vez de arreglar el
   que ya había.
   -------------------------------------------------------------------------- */

/** Renombrar: el lápiz de siempre, con su punta y su trazo. */
export function PencilIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}

/** Calendario: la hoja con sus dos anillas. */
export function CalendarIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    </svg>
  );
}

/** Ideas: la bombilla. La rosca la hacen dos rayas y no un rectángulo, que a
    17px se convierte en una mancha. */
export function BulbIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M9 17.5a6 6 0 1 1 6 0v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19z" />
      <path d="M9.5 17.5h5" />
    </svg>
  );
}

/** Próximos pasos: la diana. Tres aros, no cuatro: el cuarto ya no se ve. */
export function TargetIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.1" />
    </svg>
  );
}

/** De tus agentes: la bandeja de entrada, con lo que cae dentro. */
export function InboxIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M3.5 13.5 6 5.2A1.8 1.8 0 0 1 7.7 4h8.6a1.8 1.8 0 0 1 1.7 1.2l2.5 8.3" />
      <path d="M3.5 13.5h4.2l1.2 2.6h6.2l1.2-2.6h4.2v4.7a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
    </svg>
  );
}

/** Una carpeta. */
export function FolderIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M3.5 7.2a1.8 1.8 0 0 1 1.8-1.8h3.6l2 2.4h7.8a1.8 1.8 0 0 1 1.8 1.8v8.6a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z" />
    </svg>
  );
}

/** Varias carpetas: todas tus sesiones. La de atrás asomando por arriba. */
export function FoldersIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M6.5 6.6V5.4a1.7 1.7 0 0 1 1.7-1.7h2.8l1.7 2h5a1.7 1.7 0 0 1 1.7 1.7v.8" />
      <path d="M2.8 10.4a1.7 1.7 0 0 1 1.7-1.7h3.4l1.7 2h9.9a1.7 1.7 0 0 1 1.7 1.7v6.2a1.7 1.7 0 0 1-1.7 1.7H4.5a1.7 1.7 0 0 1-1.7-1.7z" />
    </svg>
  );
}

/** Desbloqueado: el candado con el arco abierto hacia un lado. */
export function UnlockIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.4A4 4 0 0 1 15.8 6" />
    </svg>
  );
}

/** Una imagen: el marco con su sol y su monte.

    Sirve también para «ponerle un logo a un proyecto», que es elegir una
    imagen: se probó una chapa con su marca dentro y no se leía como lo que
    hace el botón (Munir, 2026-08-05). El paisaje de toda la vida sí. */
export function ImageIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" />
      <circle cx="8.8" cy="9.8" r="1.7" />
      <path d="M3.5 16.5 9 11.6l4.4 4 2.6-2.3 4.5 4" />
    </svg>
  );
}

/** La chincheta: mantener la herramienta puesta. */
export function PinIcon({ size = 17, off = false }: Props & { off?: boolean }) {
  return (
    <svg {...svg(size)}>
      <path d="M9 3.5h6l-.9 6 3.4 3.2H6.5L9.9 9.5z" />
      <path d="M12 12.7V20.5" />
      {/* Quitar de arriba: el mismo pin con la raya encima, que es como se
          niega un icono en todas partes. Antes poner y quitar compartían
          dibujo, así que el icono no ayudaba a elegir. Misma idea que
          `UndoIcon` con `redo`: una figura, dos sentidos. */}
      {off && <path d="M4 4 20 20" />}
    </svg>
  );
}

/** Deshacer y rehacer: la flecha que da la vuelta. Es la MISMA figura
    espejada, que es lo que hace que se lean como pareja. */
export function UndoIcon({ size = 17, redo = false }: Props & { redo?: boolean }) {
  return (
    <svg {...svg(size)} style={redo ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M4 8.5h9.5a5.5 5.5 0 1 1 0 11H8" />
      <path d="M7.4 4.6 3.5 8.5l3.9 3.9" />
    </svg>
  );
}

/** Volver a empezar: el círculo que se muerde la cola. Distinto de recargar a
    propósito: aquel trae datos de fuera, este pone algo a cero. */
export function ResetIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 3.5v5h-5" />
    </svg>
  );
}

/** Una bandera: el encargo que lleva puesto una sesión. */
export function FlagIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M5.5 20.5V4" />
      <path d="M5.5 5h11.8l-2.2 4 2.2 4H5.5" />
    </svg>
  );
}

/** Aviso: el triángulo. La admiración va en dos trazos porque un punto suelto
    a este tamaño se pierde. */
export function WarnIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M10.3 4.1 2.8 17.2A2 2 0 0 0 4.5 20.2h15a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.2M12 16.9v.1" />
    </svg>
  );
}

/** El rayo: reanimar una terminal colgada. */
export function BoltIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M13.5 2.5 4.5 13.5h6l-1 8 9-11h-6z" />
    </svg>
  );
}

/** El destello: «esto lo hace una IA». Cuatro puntas y no seis: a este tamaño
    las de seis se convierten en una estrella de sheriff. */
export function SparkIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 2.8c0 4.6 2.6 7.2 7.2 7.2-4.6 0-7.2 2.6-7.2 7.2 0-4.6-2.6-7.2-7.2-7.2 4.6 0 7.2-2.6 7.2-7.2z" />
      <path d="M18.4 15.4c0 2 1.1 3.1 3.1 3.1-2 0-3.1 1.1-3.1 3.1 0-2-1.1-3.1-3.1-3.1 2 0 3.1-1.1 3.1-3.1z" />
    </svg>
  );
}

/** El rombo de Antigravity. */
export function DiamondIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 2.8 21.2 12 12 21.2 2.8 12z" />
    </svg>
  );
}

/** Un grupo: la caja con algo dentro. Sirve para «mover a grupo» y para el
    contador de agentes que cuelgan de una sesión. */
export function GroupIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3" />
      <rect x="8" y="8" width="8" height="8" rx="1.6" />
    </svg>
  );
}

/** Suelta, sin proyecto: el eslabón partido.
 *
 * Los dos ganchos y el hueco entre ellos, y nada más. Tenía cuatro destellos
 * de dos píxeles en las esquinas y a los 15 px de un menú no se leían como
 * destellos: se leían como suciedad alrededor de una figura que ya de por sí
 * es fina. Mismo criterio que la rosca de la bombilla aquí arriba: lo que a
 * tamaño pequeño se convierte en mancha, no se dibuja. */
export function UnlinkIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M9.5 14.5 7.2 16.8a3.7 3.7 0 0 1-5.2-5.2l2.3-2.3" />
      <path d="M14.5 9.5l2.3-2.3a3.7 3.7 0 0 1 5.2 5.2l-2.3 2.3" />
    </svg>
  );
}

/** La tecla de intro: devolver algo a su sitio. */
export function EnterIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M20 5v7.5a3 3 0 0 1-3 3H4.5" />
      <path d="M8.4 11.6 4 15.5l4.4 3.9" />
    </svg>
  );
}

/** Reproducir, pausar y saltar: el mando del reproductor. */
export function PlayIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M7.5 4.6 19 12 7.5 19.4z" />
    </svg>
  );
}

export function PauseIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M9 4.5v15M15 4.5v15" />
    </svg>
  );
}

export function SkipIcon({ size = 17, back = false }: Props & { back?: boolean }) {
  return (
    <svg {...svg(size)} style={back ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 5 16 12 6 19z" />
      <path d="M18.5 5v14" />
    </svg>
  );
}

/** Enviar: la flecha que sube. */
export function SendIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 20V4.6" />
      <path d="M5.6 11 12 4.6 18.4 11" />
    </svg>
  );
}

/**
 * Los agentes que cuelgan de una sesión: un robot.
 *
 * Iba con un ▣, que no dice nada, y este contador sale en la cabecera de cada
 * terminal y en cada fila de la barra lateral: es de los que más se miran.
 *
 * Minimalista de verdad, no «sencillo»: a 13px caben la antena, la cabeza y
 * dos ojos, y ni una línea más. Con boca, orejas o cuerpo se convierte en una
 * mancha con una antena. Los ojos van con `stroke-linecap: round` sobre un
 * trazo de longitud cero, que es como se dibuja un punto redondo aquí sin
 * meter dos círculos que a este tamaño se rellenan solos.
 */
export function RobotIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M12 3v3" />
      <rect x="3.8" y="6" width="16.4" height="12.6" rx="3.4" />
      <path d="M9 11.4v.1M15 11.4v.1" />
    </svg>
  );
}

/** El tablero del trabajo: columnas de distinta altura, que es lo que se ve al
    abrirlo y lo que lo distingue de una lista. */
export function KanbanIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="3.5" width="18" height="17" rx="2.6" />
      <path d="M8.4 7.6v9.3M15.6 7.6v5.4" />
    </svg>
  );
}

/** Chat con un modelo: el bocadillo. La colita va abajo a la izquierda porque
    es de donde salen en toda la app. */
export function ChatIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M20.5 14.6a2.4 2.4 0 0 1-2.4 2.4H8.4L4 20.5V6.4A2.4 2.4 0 0 1 6.4 4h11.7a2.4 2.4 0 0 1 2.4 2.4z" />
    </svg>
  );
}

/** Una ventana de localhost: el marco del navegador con su barra. */
export function BrowserIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
      <path d="M3 9.2h18" />
      <path d="M6.4 6.9v.1M9.2 6.9v.1" />
    </svg>
  );
}

/** Abrir fuera: la flecha que se sale de su caja. */
export function ExternalIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M13.5 4.5h6v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.5v4a1.9 1.9 0 0 1-1.9 1.9H5.4A1.9 1.9 0 0 1 3.5 18.6V7.9A1.9 1.9 0 0 1 5.4 6h4.1" />
    </svg>
  );
}

/** Información: el porqué de una decisión del Capataz. */
export function InfoIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 11v5.2M12 7.9v.1" />
    </svg>
  );
}

/** A todas: una orden que se reparte a varias terminales a la vez. */
export function BroadcastIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M3.5 7h11M3.5 12h11M3.5 17h11" />
      <path d="M17 4.5 20.5 7 17 9.5M17 14.5 20.5 17 17 19.5" />
    </svg>
  );
}

/** La voz: un altavoz con sus ondas. Es el conmutador del Asistente hablado. */
export function VozIcon({ size = 17 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
      <path d="M15.5 9.5a3.6 3.6 0 0 1 0 5" />
      <path d="M18 7a7 7 0 0 1 0 10" />
    </svg>
  );
}
