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
  /** El sonido, ya hecho y del largo del vídeo, que va como pista AAC. Sin él,
      el MP4 sale sin pista de audio. */
  sonido?: AudioBuffer | null;
  /** La ganancia del sonido dentro del MP4, de 0 a 1 («Volumen del vídeo»).
      Se aplica a trozos al codificar, sin copiar el sonido entero. */
  volumen?: number;
  /** El tramo del vídeo de fondo que se usa, en segundos desde su principio. */
  tramo?: Tramo | null;
  /** Con él, el MP4 sale a disco a trozos (`fastStart: "reserve"`) y la promesa
      devuelve `null`; sin él, se monta en memoria y devuelve el `Blob`. */
  escritor?: Escritor | null;
  /** Lo hecho, de 0 a 1, después de cada fotograma. */
  alProgreso?: (hecho: number) => void;
  /** Para cancelar: la promesa falla con el `AbortError` de la señal. */
  senal?: AbortSignal;
};

/** Un tramo de un vídeo, en segundos desde su principio. */
export type Tramo = { desde: number; hasta: number };

/** Quien recibe el MP4 a trozos: cada uno en su posición del archivo (el
    `moov` se escribe al final en el hueco reservado al principio). */
export type Escritor = { escribir: (posicion: number, datos: Uint8Array) => Promise<void> };

/** Lo más corto que dura la tarjeta en vídeo, y lo que se propone de fábrica
    como mucho: un minuto, lo recomendable para una red. */
export const MINIMO = 3;
export const RECOMENDADO = 60;

/**
 * El tramo que se usa de un vídeo de `duracion` segundos: el guardado, metido
 * dentro del clip y de al menos `MINIMO`; de fábrica, el clip entero hasta
 * `RECOMENDADO`. Un clip más corto que `MINIMO` se usa entero (y da la vuelta).
 */
export function tramoDe(duracion: number, guardado?: Tramo | null): Tramo {
  if (!(duracion > 0)) return { desde: 0, hasta: 0 };
  if (duracion <= MINIMO) return { desde: 0, hasta: duracion };
  if (!guardado) return { desde: 0, hasta: Math.min(duracion, RECOMENDADO) };
  const desde = Math.min(Math.max(0, guardado.desde), duracion - MINIMO);
  const hasta = Math.min(duracion, Math.max(desde + MINIMO, guardado.hasta));
  return { desde, hasta };
}

/** Cuánto dura la tarjeta con ese tramo: lo que dure, y nunca menos de `MINIMO`. */
export function segundosDelTramo(t: Tramo): number {
  return Math.max(MINIMO, Math.round((t.hasta - t.desde) * 10) / 10);
}

/** Los paquetes de una pista, con margen: `fastStart: "reserve"` guarda sitio
    para el `moov` con este número y falla si se pasa. */
export function paquetesMaximos(cuantos: number): number {
  return Math.ceil(cuantos * 1.1) + 64;
}

/** Los errores que salen de aquí, por si quien llama los quiere traducir. */
export const ERRORES = {
  sinVideo: "Este equipo no puede sacar vídeo.",
  sinAudio: "Este equipo no puede meter sonido en el vídeo.",
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

/**
 * Si este equipo puede meter el sonido en el MP4: AAC, que es lo que aceptan X,
 * Instagram, WhatsApp y Discord dentro de un MP4 (Opus en MP4 no lo leen todos).
 * Medido el 2026-10-18: Brave y Edge 155 en Windows lo codifican por WebCodecs
 * (Media Foundation), y el WebView2 es ese mismo motor. Donde no se pueda, el
 * vídeo sale igual, sin sonido, y el interruptor se apaga diciéndolo.
 */
export async function audioDisponible(canales = 2, frecuencia = 48000): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const m = await libreria();
    return await m.canEncodeAudio("aac", { numberOfChannels: canales, sampleRate: frecuencia, quality: new m.Quality(CALIDAD) });
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
  const entrada = abrirArchivo(m, fuente);
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

function abrirArchivo(m: typeof import("mediabunny"), fuente: Blob | string) {
  return new m.Input({
    formats: m.ALL_FORMATS,
    source: typeof fuente === "string" ? new m.UrlSource(fuente) : new m.BlobSource(fuente),
  });
}

/** Si el vídeo de fondo trae sonido que este equipo sabe leer. */
export async function fondoConSonido(fondo: Blob | string): Promise<boolean> {
  const m = await libreria();
  const entrada = abrirArchivo(m, fondo);
  try {
    const pista = await entrada.getPrimaryAudioTrack();
    return Boolean(pista && (await pista.canDecode()));
  } catch {
    return false;
  } finally {
    entrada.dispose();
  }
}

/**
 * El sonido del propio vídeo de fondo, al largo de la tarjeta y en estéreo a
 * 48 kHz, o `null` si no trae. Como sus imágenes (`marcasDelFondo`), si dura
 * menos vuelve a empezar y si dura más se corta, apagándose en el último
 * tercio de segundo para que no chasque.
 */
export async function sonidoDelFondo(fondo: Blob | string, segundos: number, frecuencia = 48000, tramo?: Tramo | null): Promise<AudioBuffer | null> {
  const m = await libreria();
  const entrada = abrirArchivo(m, fondo);
  try {
    const pista = await entrada.getPrimaryAudioTrack();
    if (!pista || !(await pista.canDecode())) return null;
    // Desde el principio del tramo y como mucho lo que dura: lo que pase de
    // ahí vuelve a empezar desde su principio, como sus imágenes.
    const inicio = (await pista.getFirstTimestamp()) + (tramo?.desde ?? 0);
    const fin = inicio + Math.min(segundos, tramo ? tramo.hasta - tramo.desde : segundos);
    const trozos: import("mediabunny").WrappedAudioBuffer[] = [];
    for await (const b of new m.AudioBufferSink(pista).buffers(inicio, fin)) trozos.push(b);
    if (!trozos.length) return null;
    const dura = Math.min(fin, Math.max(...trozos.map((b) => b.timestamp + b.duration))) - inicio;
    const ctx = new OfflineAudioContext(2, Math.ceil(segundos * frecuencia), frecuencia);
    const general = ctx.createGain();
    general.gain.setValueAtTime(1, Math.max(0, segundos - 0.35));
    general.gain.linearRampToValueAtTime(0, segundos);
    general.connect(ctx.destination);
    for (let vuelta = 0; dura > 0 && vuelta * dura < segundos; vuelta++) {
      for (const b of trozos) {
        const t = vuelta * dura + b.timestamp - inicio;
        if (t >= segundos || b.timestamp - inicio >= dura) break;
        const s = ctx.createBufferSource();
        s.buffer = b.buffer;
        s.connect(general);
        s.start(Math.max(0, t));
      }
    }
    return await ctx.startRendering();
  } finally {
    entrada.dispose();
  }
}

/**
 * El sonido en trozos de un segundo con la ganancia ya puesta: el volumen no
 * obliga a copiar el sonido entero (diez minutos en estéreo son 230 MB), y el
 * codificador lo recibe poco a poco, al paso de las imágenes.
 */
export function* aTrozos(b: AudioBuffer, ganancia = 1, segundo = b.sampleRate): Generator<AudioBuffer> {
  const k = Math.max(0, ganancia);
  for (let i = 0; i < b.length; i += segundo) {
    const n = Math.min(segundo, b.length - i);
    const t = new AudioBuffer({ length: n, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c).subarray(i, i + n);
      if (k === 1) t.copyToChannel(d, c);
      else {
        const o = t.getChannelData(c);
        for (let j = 0; j < n; j++) o[j] = d[j] * k;
      }
    }
    yield t;
  }
}

/** `n` fotogramas repartidos por todo el vídeo, de `ancho` píxeles y listos
    para un `<img>`: la tira de la línea de tiempo del recorte. */
export async function fotogramasDelVideo(fuente: Blob | string, n: number, ancho = 96): Promise<string[]> {
  const m = await libreria();
  const entrada = abrirArchivo(m, fuente);
  try {
    const pista = await entrada.getPrimaryVideoTrack();
    if (!pista || !(await pista.canDecode())) return [];
    const inicio = await pista.getFirstTimestamp();
    const dura = (await pista.computeDuration()) - inicio;
    const lector = new m.CanvasSink(pista, { width: ancho, poolSize: 1 });
    const marcas = Array.from({ length: n }, (_, i) => inicio + ((i + 0.5) / n) * dura);
    const urls: string[] = [];
    for await (const c of lector.canvasesAtTimestamps(marcas)) {
      const lienzo = c?.canvas;
      if (lienzo instanceof HTMLCanvasElement) urls.push(lienzo.toDataURL("image/jpeg", 0.7));
      else if (lienzo) urls.push(URL.createObjectURL(await lienzo.convertToBlob({ type: "image/jpeg", quality: 0.7 })));
      else urls.push("");
    }
    return urls;
  } finally {
    entrada.dispose();
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
 * (`marcasDelFondo`); con una imagen, la misma en todos. Con `sonido`, una
 * pista AAC al lado; sin él, ninguna. El `moov` va delante
 * del vídeo (`fastStart`), que es lo que piden las redes para empezar a
 * reproducir antes de bajarlo entero.
 */
export async function exportarVideo(pintar: Pintar, opciones: OpcionesVideo & { escritor: Escritor }): Promise<null>;
export async function exportarVideo(pintar: Pintar, opciones: OpcionesVideo): Promise<Blob>;
export async function exportarVideo(pintar: Pintar, opciones: OpcionesVideo): Promise<Blob | null> {
  const { ancho, alto, fps, segundos, fondo = null, sonido = null, volumen = 1, tramo = null, escritor = null, alProgreso, senal } = opciones;
  comprobarTamano(ancho, alto, true);
  const total = fotogramas(fps, segundos);
  if (total < 1) throw new Error(`Un vídeo de ${segundos} s a ${fps} fps no tiene fotogramas.`);
  senal?.throwIfAborted();
  if (!(await videoDisponible(ancho, alto, fps))) throw new Error(ERRORES.sinVideo);
  if (sonido && !(await audioDisponible(sonido.numberOfChannels, sonido.sampleRate))) throw new Error(ERRORES.sinAudio);
  const m = await libreria();

  const lienzo = crearLienzo(ancho, alto);
  // Sin transparencia: el vídeo no la tiene, y así lo que no pinte la tarjeta
  // sale negro en vez de quedar a merced del codificador.
  const ctx = lienzo.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No hay lienzo 2D.");
  // A disco, el `moov` va en un hueco reservado delante, medido con los
  // paquetes que llevará cada pista: así no hace falta tener el archivo entero
  // en memoria para ponerlo delante al final, que es lo que hace "in-memory".
  const target = escritor
    ? new m.StreamTarget(
        new WritableStream<import("mediabunny").StreamTargetChunk>({ write: (c) => escritor.escribir(c.position, c.data) }),
        { chunked: true, chunkSize: 8 * 1024 * 1024 },
      )
    : new m.BufferTarget();
  const salida = new m.Output({
    format: new m.Mp4OutputFormat({ fastStart: escritor ? "reserve" : "in-memory" }),
    target,
  });
  const fuente = new m.CanvasSource(lienzo, { codec: "avc", quality: new m.Quality(CALIDAD) });
  salida.addVideoTrack(fuente, { frameRate: fps, maximumPacketCount: paquetesMaximos(total) });
  const pistaSonido = sonido ? new m.AudioBufferSource({ codec: "aac", quality: new m.Quality(CALIDAD) }) : null;
  // AAC lleva 1.024 muestras por paquete.
  if (pistaSonido && sonido) salida.addAudioTrack(pistaSonido, { maximumPacketCount: paquetesMaximos(Math.ceil(sonido.length / 1024)) });

  let video: VideoDeFondo | null = null;
  let fotos: AsyncGenerator<import("mediabunny").WrappedCanvas | null> | null = null;
  let quieto: { fuente: CanvasImageSource | null; soltar: () => void } | null = null;
  try {
    const deArchivo = fondo instanceof Blob || typeof fondo === "string";
    if (deArchivo && esVideo(fondo)) {
      video = await abrirVideo(fondo, ancho, alto);
      const desde = tramo ? Math.min(tramo.desde, video.duracion) : 0;
      const dura = tramo ? Math.min(tramo.hasta, video.duracion) - desde : video.duracion;
      fotos = video.lector.canvasesAtTimestamps(marcasDelFondo(fps, segundos, video.inicio + desde, dura));
    } else {
      quieto = await fondoQuieto(fondo, 0, ancho, alto);
    }
    await salida.start();
    let ultimo: CanvasImageSource | null = quieto?.fuente ?? null;
    const imagenes = async () => {
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
    };
    // El sonido entra a la vez que las imágenes y no antes ni después: el MP4
    // intercala las dos pistas, y esperar a una sin alimentar la otra puede
    // dejar las dos esperándose.
    const sonidos = async () => {
      if (!pistaSonido || !sonido) return;
      for (const trozo of aTrozos(sonido, volumen)) {
        senal?.throwIfAborted();
        await pistaSonido.add(trozo);
      }
    };
    await Promise.all([imagenes(), sonidos()]);
    await salida.finalize();
    if (escritor) return null;
    const buffer = (target as import("mediabunny").BufferTarget).buffer;
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

/** El «Guardar como» del vídeo, ANTES de sacarlo: uno largo no se puede tener
    hecho en memoria a la espera de que se elija dónde. */
export function pedirRutaVideo(nombre?: string): Promise<string | null> {
  return save({ defaultPath: nombre ?? nombreSugerido("mp4"), filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }] });
}

/**
 * El MP4 a disco por trozos, en `<ruta>.part` (`fondos_tarjeta.rs`): cada trozo
 * viaja crudo por el puente con su posición y al acabar se renombra; si falla
 * o se cancela, el `.part` se borra.
 */
export async function aDisco<T>(ruta: string, hacer: (escritor: Escritor) => Promise<T>): Promise<T> {
  await invoke("tarjeta_video_empezar", { ruta });
  const escritor: Escritor = {
    escribir: (posicion, datos) =>
      invoke("tarjeta_video_escribir", datos, { headers: { ruta: encodeURIComponent(ruta), posicion: String(posicion) } }),
  };
  try {
    const r = await hacer(escritor);
    await invoke("tarjeta_video_acabar", { ruta });
    return r;
  } catch (e) {
    await invoke("tarjeta_video_cancelar", { ruta }).catch(() => {});
    throw e;
  }
}

/** Dónde deja «Copiar» el MP4: tiene que seguir en disco hasta que se pegue. */
export function rutaParaCopiar(): Promise<string> {
  return invoke("tarjeta_copia_ruta", { nombre: nombreSugerido("mp4") });
}

/** El MP4 al portapapeles como archivo: en un chat o en una carpeta se pega el
    vídeo, y donde solo cabe texto, su dirección. Eso no lo sabe hacer el
    portapapeles del navegador, que solo escribe texto e imágenes. */
export function copiarArchivo(ruta: string): Promise<void> {
  return invoke("tarjeta_copiar_archivo", { ruta });
}

/** El PNG al portapapeles, para pegarlo en un chat o en una red. */
export async function copiarImagen(png: Blob): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error(ERRORES.sinPortapapeles);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
