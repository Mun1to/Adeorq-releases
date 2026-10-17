import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

// La tarjeta de uso del Perfil, sacada de la app como imagen (PNG) o como
// vídeo (MP4), con una imagen o un vídeo de fondo: para compartir el uso de IA
// como se comparten las tarjetas de PnL de Axiom.
//
// Aquí no se decide cómo se ve la tarjeta. La pinta quien llama, con una
// función `pintar` que recibe el lienzo, el tamaño, el fondo ya decodificado en
// ese instante y el segundo `t`; esto pone el lienzo, el fondo, el reloj y el
// archivo.
//
// El vídeo NO se graba mirando la pantalla (`MediaRecorder` con
// `captureStream`): eso va con el reloj, así que un fotograma que tarda más de
// la cuenta se pierde, y en el navegador sin ventana da 0 bytes (medido el
// 2026-10-17), o sea que ni se puede probar. Va por WebCodecs: cada fotograma
// se pinta y se codifica con la marca de tiempo que le toca (`i / fps`), tarde
// lo que tarde, y sale igual en un equipo lento que en uno rápido. El vídeo de
// fondo se lee del mismo modo, fotograma a fotograma por su marca de tiempo,
// sin reproducirlo nunca.
//
// Quien lee el fondo y empaqueta el MP4 es `mediabunny` (MPL-2.0, copyleft por
// ARCHIVO: solo obliga si se modifican los suyos; ver
// `docs/contexto/stack-y-ecosistema.md`). `mp4-muxer`, que es MIT, está
// retirado a favor de este y solo empaqueta: para leer el vídeo de fondo
// habría hecho falta otra librería más. Se carga al exportar, no al abrir la
// app.

/** Pinta un fotograma de la tarjeta. `fondo` es la imagen o el fotograma del
    vídeo de fondo en el segundo `t`, ya decodificado y derecho (el giro de los
    vídeos de móvil ya aplicado); `null` si no hay fondo. */
export type Pintar = (
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  fondo: CanvasImageSource | null,
  t: number,
) => void | Promise<void>;

/** Lo que puede ir de fondo: algo que ya se puede pintar, un archivo de imagen
    o de vídeo (el `File` de un `<input>` vale), o su dirección (la de
    `convertFileSrc` vale). Un `<video>` en marcha NO: va con el reloj, y lo que
    se quiere es leer el archivo fotograma a fotograma. */
export type Fondo = CanvasImageSource | Blob | string | null;

/** Los dos formatos de la tarjeta, en píxeles. */
export const FORMATOS = {
  "16:9": { ancho: 1920, alto: 1080 },
  "9:16": { ancho: 1080, alto: 1920 },
} as const;
export type Formato = keyof typeof FORMATOS;

export type OpcionesImagen = {
  ancho: number;
  alto: number;
  fondo?: Fondo;
  /** El segundo que se pinta; con un vídeo de fondo, de ese instante sale el fotograma. */
  t?: number;
};

export type OpcionesVideo = {
  ancho: number;
  alto: number;
  fps: number;
  segundos: number;
  fondo?: Fondo;
  /** Lo hecho, de 0 a 1, después de cada fotograma. */
  alProgreso?: (hecho: number) => void;
  /** Para cancelar: la promesa falla con el `AbortError` de la señal. */
  senal?: AbortSignal;
};

/** Los errores que salen de aquí, por si quien llama los quiere traducir. */
export const ERRORES = {
  sinVideo: "Este equipo no puede sacar vídeo.",
  fondoSinVideo: "El archivo de fondo no tiene vídeo.",
  fondoIlegible: "Este equipo no sabe leer ese vídeo de fondo.",
  sinPortapapeles: "Este sistema no deja copiar imágenes.",
} as const;

/** Cuántos fotogramas salen de `segundos` a `fps`. */
export function fotogramas(fps: number, segundos: number): number {
  return Math.max(0, Math.round(fps * segundos));
}

/**
 * En qué instante del vídeo de fondo cae cada fotograma de la tarjeta.
 *
 * Si el fondo dura menos que la tarjeta vuelve a empezar, y si dura más se
 * corta. La décima de milisegundo de más es porque el fondo se pide como «el
 * último fotograma que empieza antes de este instante»: sin ella, un instante
 * que cae justo en el borde de un fotograma podía dar el anterior por el
 * redondeo de la escala de tiempo del archivo.
 */
export function marcasDelFondo(fps: number, segundos: number, inicio: number, duracion: number): number[] {
  const n = fotogramas(fps, segundos);
  const marcas: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    marcas.push(inicio + (duracion > 0 ? t % duracion : 0) + 1e-4);
  }
  return marcas;
}

/**
 * El ancho al que se decodifica el vídeo de fondo, o `undefined` para dejarlo
 * como viene.
 *
 * Un vídeo de móvil en 4K para una tarjeta de 1080 es el cuádruple de píxeles
 * por fotograma para nada. Se reduce hasta que todavía CUBRE la tarjeta (la
 * dimensión que se queda más corta la llena justa) y nunca se agranda: eso ya
 * lo hace el que pinta, y sin perder nada.
 */
export function anchoDelFondo(anchoVideo: number, altoVideo: number, ancho: number, alto: number): number | undefined {
  if (anchoVideo <= 0 || altoVideo <= 0) return undefined;
  const escala = Math.max(ancho / anchoVideo, alto / altoVideo);
  return escala >= 1 ? undefined : Math.ceil(anchoVideo * escala);
}

/** El nombre con el que se propone guardar: `adeorq-uso-2026-10-17.png`. */
export function nombreSugerido(extension: "png" | "mp4", fecha = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `adeorq-uso-${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}.${extension}`;
}

/** Si un fondo que llega como archivo o dirección es un vídeo. Un archivo sin
    tipo cuenta como imagen, y si no lo es se prueba como vídeo al abrirlo. */
export function esVideo(fondo: Blob | string): boolean {
  if (typeof fondo === "string") return /\.(mp4|m4v|mov|webm|mkv)(?:[?#]|$)/i.test(fondo);
  return fondo.type.startsWith("video/");
}

function comprobarTamano(ancho: number, alto: number, video: boolean) {
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0) {
    throw new Error(`Tamaño imposible: ${ancho}×${alto}.`);
  }
  // H.264 trabaja con la imagen partida en mitades: un lado impar no lo acepta.
  if (video && (ancho % 2 || alto % 2)) throw new Error(`El vídeo pide lados pares: ${ancho}×${alto}.`);
}

/**
 * La calidad del vídeo: «alta» son unos 6 Mbps a 1080p, así que una tarjeta de
 * diez segundos con un vídeo de fondo ronda los 7,6 MB y cabe en los 10 MB que
 * deja subir Discord sin pagar. La «muy alta» (11,6 Mbps) ya no cabe. Es un
 * techo, no un gasto fijo: lo que no se mueve apenas ocupa (diez segundos con
 * fondo liso, 0,8 MB). Lo que cuesta quedarse corto, medido en el WebView2 el
 * 2026-10-17: con un fondo que no se puede comprimir (ruido puro) el
 * codificador se queda sin bits y repite el fotograma anterior.
 */
const CALIDAD = "high";

let cargada: Promise<typeof import("mediabunny")> | null = null;
const libreria = () => (cargada ??= import("mediabunny"));

/**
 * Si este equipo puede sacar el vídeo: hay WebCodecs y sabe codificar H.264 a
 * ese tamaño. Para apagar el botón antes de que alguien espere en balde (en
 * Linux depende de lo que traiga WebKitGTK). La imagen no depende de esto.
 */
export async function videoDisponible(ancho = 1920, alto = 1080, fps = 30): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return false;
  try {
    const m = await libreria();
    return await m.canEncodeVideo("avc", { width: ancho, height: alto, frameRate: fps, quality: new m.Quality(CALIDAD) });
  } catch {
    return false;
  }
}

function crearLienzo(ancho: number, alto: number): HTMLCanvasElement {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  return lienzo;
}

/** Un vídeo de fondo abierto, listo para pedirle fotogramas. */
type VideoDeFondo = {
  entrada: import("mediabunny").Input;
  lector: import("mediabunny").CanvasSink;
  inicio: number;
  duracion: number;
};

async function abrirVideo(fuente: Blob | string, ancho: number, alto: number): Promise<VideoDeFondo> {
  const m = await libreria();
  const entrada = new m.Input({
    formats: m.ALL_FORMATS,
    source: typeof fuente === "string" ? new m.UrlSource(fuente) : new m.BlobSource(fuente),
  });
  try {
    const pista = await entrada.getPrimaryVideoTrack();
    if (!pista) throw new Error(ERRORES.fondoSinVideo);
    if (!(await pista.canDecode())) throw new Error(ERRORES.fondoIlegible);
    const width = anchoDelFondo(await pista.getDisplayWidth(), await pista.getDisplayHeight(), ancho, alto);
    // Dos en el anillo: el que se está pintando y el siguiente, sin crear un
    // lienzo nuevo por fotograma.
    const lector = new m.CanvasSink(pista, { width, poolSize: 2 });
    const inicio = await pista.getFirstTimestamp();
    const duracion = (await pista.computeDuration()) - inicio;
    return { entrada, lector, inicio, duracion };
  } catch (e) {
    entrada.dispose();
    throw e;
  }
}

async function abrirImagen(fuente: Blob | string): Promise<ImageBitmap> {
  const archivo = typeof fuente === "string" ? await (await fetch(fuente)).blob() : fuente;
  return createImageBitmap(archivo);
}

/** El fondo de un solo instante, para la imagen. */
async function fondoQuieto(
  fondo: Fondo,
  t: number,
  ancho: number,
  alto: number,
): Promise<{ fuente: CanvasImageSource | null; soltar: () => void }> {
  if (fondo === null) return { fuente: null, soltar: () => {} };
  if (!(fondo instanceof Blob) && typeof fondo !== "string") return { fuente: fondo, soltar: () => {} };
  if (!esVideo(fondo)) {
    try {
      const img = await abrirImagen(fondo);
      return { fuente: img, soltar: () => img.close() };
    } catch (e) {
      // Un archivo sin tipo que tampoco es imagen se prueba como vídeo.
      if (typeof fondo === "string" || fondo.type) throw e;
    }
  }
  const video = await abrirVideo(fondo, ancho, alto);
  try {
    // El mismo instante que tendría ese segundo en el vídeo (`marcasDelFondo`).
    const marca = video.inicio + (video.duracion > 0 ? t % video.duracion : 0) + 1e-4;
    const hecho = await video.lector.getCanvas(marca);
    return { fuente: hecho?.canvas ?? null, soltar: () => video.entrada.dispose() };
  } catch (e) {
    video.entrada.dispose();
    throw e;
  }
}

function aPng(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo sacar el PNG."))), "image/png"),
  );
}

/** La tarjeta como PNG, del tamaño pedido. */
export async function exportarImagen(pintar: Pintar, { ancho, alto, fondo = null, t = 0 }: OpcionesImagen): Promise<Blob> {
  comprobarTamano(ancho, alto, false);
  const lienzo = crearLienzo(ancho, alto);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No hay lienzo 2D.");
  const quieto = await fondoQuieto(fondo, t, ancho, alto);
  try {
    await pintar(ctx, ancho, alto, quieto.fuente, t);
  } finally {
    quieto.soltar();
  }
  return aPng(lienzo);
}

/**
 * La tarjeta como MP4 (H.264), fotograma a fotograma y sin mirar el reloj.
 *
 * Con un vídeo de fondo, cada fotograma lleva el suyo en el mismo instante
 * (`marcasDelFondo`); con una imagen, la misma en todos. El `moov` va delante
 * del vídeo (`fastStart`), que es lo que piden las redes para empezar a
 * reproducir antes de bajarlo entero.
 */
export async function exportarVideo(pintar: Pintar, opciones: OpcionesVideo): Promise<Blob> {
  const { ancho, alto, fps, segundos, fondo = null, alProgreso, senal } = opciones;
  comprobarTamano(ancho, alto, true);
  const total = fotogramas(fps, segundos);
  if (total < 1) throw new Error(`Un vídeo de ${segundos} s a ${fps} fps no tiene fotogramas.`);
  senal?.throwIfAborted();
  if (!(await videoDisponible(ancho, alto, fps))) throw new Error(ERRORES.sinVideo);
  const m = await libreria();

  const lienzo = crearLienzo(ancho, alto);
  // Sin transparencia: el vídeo no la tiene, y así lo que no pinte la tarjeta
  // sale negro en vez de quedar a merced del codificador.
  const ctx = lienzo.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No hay lienzo 2D.");
  const salida = new m.Output({
    format: new m.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new m.BufferTarget(),
  });
  const fuente = new m.CanvasSource(lienzo, { codec: "avc", quality: new m.Quality(CALIDAD) });
  salida.addVideoTrack(fuente, { frameRate: fps });

  let video: VideoDeFondo | null = null;
  let fotos: AsyncGenerator<import("mediabunny").WrappedCanvas | null> | null = null;
  let quieto: { fuente: CanvasImageSource | null; soltar: () => void } | null = null;
  try {
    const deArchivo = fondo instanceof Blob || typeof fondo === "string";
    if (deArchivo && esVideo(fondo)) {
      video = await abrirVideo(fondo, ancho, alto);
      fotos = video.lector.canvasesAtTimestamps(marcasDelFondo(fps, segundos, video.inicio, video.duracion));
    } else {
      quieto = await fondoQuieto(fondo, 0, ancho, alto);
    }
    await salida.start();
    let ultimo: CanvasImageSource | null = quieto?.fuente ?? null;
    for (let i = 0; i < total; i++) {
      senal?.throwIfAborted();
      const t = i / fps;
      if (fotos) {
        const sig = await fotos.next();
        // Si el archivo se queda corto en algún instante, sigue el último que hubo.
        if (!sig.done && sig.value) ultimo = sig.value.canvas;
      }
      ctx.clearRect(0, 0, ancho, alto);
      ctx.save();
      try {
        await pintar(ctx, ancho, alto, ultimo, t);
      } finally {
        ctx.restore();
      }
      await fuente.add(t, 1 / fps);
      alProgreso?.((i + 1) / total);
    }
    await salida.finalize();
    const buffer = salida.target.buffer;
    if (!buffer) throw new Error("El MP4 salió vacío.");
    return new Blob([buffer], { type: "video/mp4" });
  } catch (e) {
    if (salida.state !== "finalized" && salida.state !== "canceled") await salida.cancel().catch(() => {});
    throw e;
  } finally {
    await fotos?.return(undefined).catch(() => {});
    video?.entrada.dispose();
    quieto?.soltar();
  }
}

/**
 * Guarda la tarjeta donde diga el usuario, con el diálogo de guardar. Devuelve
 * la ruta, o `null` si lo cerró sin elegir.
 *
 * Los bytes viajan crudos en el cuerpo de la petición (`guardar_tarjeta`) y no
 * como argumento: un MP4 de diez segundos pesa unos diez megas, y como lista de
 * números en el JSON serían cuarenta. La ruta va en una cabecera, escapada
 * porque una cabecera solo admite Latin-1 y una carpeta puede llamarse de
 * cualquier manera.
 */
export async function guardarTarjeta(archivo: Blob, nombre?: string): Promise<string | null> {
  const mp4 = archivo.type === "video/mp4";
  const extension = mp4 ? "mp4" : "png";
  const ruta = await save({
    defaultPath: nombre ?? nombreSugerido(extension),
    filters: [mp4 ? { name: "Vídeo MP4", extensions: ["mp4"] } : { name: "Imagen PNG", extensions: ["png"] }],
  });
  if (!ruta) return null;
  await invoke("guardar_tarjeta", new Uint8Array(await archivo.arrayBuffer()), {
    headers: { ruta: encodeURIComponent(ruta) },
  });
  return ruta;
}

/** El PNG al portapapeles, para pegarlo en un chat o en una red. */
export async function copiarImagen(png: Blob): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error(ERRORES.sinPortapapeles);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
