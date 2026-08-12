/**
 * La identidad de Adeorq, copiada de donde vive de verdad.
 *
 * Los colores salen del bloque `:root` de `src/App.css` (el tema azul, que es
 * el de fábrica) y las dos fuentes son las mismas que ya sirve la web en
 * `web/fonts`. Nada de esto se inventa: un vídeo que se parece a la app "por
 * aproximación" es justo lo que Munir devuelve diciendo que no es fiel, y el
 * motivo está escrito en la memoria del proyecto.
 *
 * Si algún día cambian los tokens de la app, este archivo es el único sitio
 * que hay que tocar aquí dentro.
 */

export const COLOR = {
  /** El fondo sólido de un panel. En la app es cristal sobre la foto del
      escritorio; aquí no hay escritorio detrás, así que se usa el sólido del
      tema y el cristal se finge con capas (ver `Cristal`). */
  panel: "#101624",
  /** Más oscuro que el panel: el suelo de la pieza. */
  fondo: "#070b13",
  cabecera: "rgba(30, 40, 62, 0.7)",
  borde: "rgba(140, 170, 220, 0.16)",
  bordeFuerte: "rgba(150, 185, 240, 0.3)",
  texto: "#e6edfa",
  apagado: "#93a4c2",
  acento: "#4d9fff",
  acentoFlojo: "#2a5f9e",
  /** Naranja, y NO verde: en Adeorq "turno terminado" es ámbar, y el verde
      significa "aquí dentro hay algo vivo", que es otra cosa. */
  hecho: "#ff9a3c",
  espera: "#ff8a92",
  pregunta: "#f3cf8a",
  /** Los dos extremos del degradado del logotipo, tal cual en `adeorq.svg`. */
  marcaClaro: "#48c2ff",
  marcaOscuro: "#2f9df3",
} as const;

export const FUENTE = {
  texto: "Inter, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

/** 30 fps y no 60: son capturas fijas con movimiento lento, así que 60 no
    añade nada que se vea y duplica el tiempo de render y el peso del GIF del
    README, que es donde más importa pesar poco. */
export const FPS = 30;

/** El trazo de los iconos de la casa (`Icons.tsx`): 1.9 sobre rejilla de 24. */
export const TRAZO = 1.9;
