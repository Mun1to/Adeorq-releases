import { invoke } from "@tauri-apps/api/core";

// Grabar lo que dices y dejarlo en el formato que whisper.cpp entiende.
//
// whisper quiere WAV de 16 kHz, mono, 16 bits. El navegador graba en webm/opus
// a 48 kHz. Convertir eso por fuera pide ffmpeg, y meter ffmpeg entero para no
// escribir cuarenta líneas es cambiar un problema pequeño por una dependencia
// grande. Así que se hace aquí, con lo que el propio navegador ya trae:
//
//   MediaRecorder graba → decodeAudioData lo descomprime → un OfflineAudio
//   Context de 16000 Hz lo vuelve a muestrear al pasarlo por él → y la
//   cabecera WAV se escribe a mano, que son 44 bytes bien conocidos.
//
// El remuestreo es el paso que parece magia y no lo es: pedirle a un
// OfflineAudioContext que renderice a 16 kHz ES remuestrear, y lo hace el
// mismo código del navegador que usa para todo lo demás.

/** Un dictado en marcha. `parar()` devuelve el WAV listo para transcribir. */
export interface Dictado {
  parar: () => Promise<Uint8Array>;
  cancelar: () => void;
}

const OBJETIVO_HZ = 16000;

/** Los 44 bytes de cabecera de un WAV PCM, más las muestras. */
function comoWav(muestras: Float32Array, hz: number): Uint8Array {
  const buf = new ArrayBuffer(44 + muestras.length * 2);
  const v = new DataView(buf);
  const txt = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i));
  };
  txt(0, "RIFF");
  v.setUint32(4, 36 + muestras.length * 2, true);
  txt(8, "WAVEfmt ");
  v.setUint32(16, 16, true); // tamaño del bloque fmt
  v.setUint16(20, 1, true); // PCM sin comprimir
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, hz, true);
  v.setUint32(28, hz * 2, true); // bytes por segundo
  v.setUint16(32, 2, true); // bytes por muestra
  v.setUint16(34, 16, true); // bits por muestra
  txt(36, "data");
  v.setUint32(40, muestras.length * 2, true);
  // De -1..1 a entero de 16 bits, con tope: una muestra que se pase de 1 por
  // redondeo daría la vuelta y sonaría como un chasquido.
  for (let i = 0; i < muestras.length; i++) {
    const n = Math.max(-1, Math.min(1, muestras[i]));
    v.setInt16(44 + i * 2, n < 0 ? n * 0x8000 : n * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** El fallo del micrófono, dicho de forma que se pueda arreglar. */
function porQueNoElMicro(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : "";
  switch (nombre) {
    case "NotFoundError":
    case "OverconstrainedError":
      return "no encuentro ningún micrófono conectado";
    case "NotAllowedError":
    case "SecurityError":
      // Con --use-fake-ui-for-media-stream esto no debería pasar nunca, así que
      // si pasa es que Windows tiene el micro cerrado para todas las apps.
      return "Windows tiene el micrófono bloqueado: Configuración › Privacidad › Micrófono";
    case "NotReadableError":
      return "el micrófono lo está usando otro programa";
    default:
      return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Empieza a grabar.
 *
 * El permiso del micrófono NO lo gobierna Tauri, lo gobierna WebView2, y sin
 * ayuda esto falla en silencio: la promesa nunca resuelve y el botón parece
 * roto sin decir por qué. Por eso la ventana arranca con
 * `--use-fake-ui-for-media-stream` (tauri.conf.json): acepta la petición sin
 * sacar un cuadro del navegador dentro de una app de escritorio.
 *
 * Que se acepte sola no es colarse: aquí el micrófono solo se abre cuando
 * mantienes pulsado un botón que pone «habla», y se suelta en cuanto lo
 * sueltas. El permiso es el gesto.
 */
export async function dictar(): Promise<Dictado> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    // El nombre pelado del DOMException («NotFoundError») no le dice a nadie
    // qué hacer a continuación, y este error se lee justo cuando ibas a hablar.
    throw new Error(porQueNoElMicro(e));
  }
  const rec = new MediaRecorder(stream);
  const trozos: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  rec.start();

  const soltarMicro = () => stream.getTracks().forEach((t) => t.stop());

  return {
    cancelar: () => {
      try {
        rec.stop();
      } catch {
        // Ya estaba parado: cancelar dos veces no es un error.
      }
      soltarMicro();
    },
    parar: () =>
      new Promise<Uint8Array>((ok, mal) => {
        rec.onerror = () => {
          soltarMicro();
          mal(new Error("el micrófono falló a mitad"));
        };
        rec.onstop = () => {
          soltarMicro();
          void (async () => {
            try {
              const bytes = await new Blob(trozos).arrayBuffer();
              if (bytes.byteLength === 0) {
                mal(new Error("no se grabó nada"));
                return;
              }
              const ctx = new AudioContext();
              const audio = await ctx.decodeAudioData(bytes);
              await ctx.close();
              // Renderizar a 16 kHz ES remuestrear. Un canal, porque whisper
              // no quiere estéreo y mezclar dos canales aquí sería trabajo
              // que el propio contexto ya hace al pedirle uno solo.
              const largo = Math.max(1, Math.ceil(audio.duration * OBJETIVO_HZ));
              const off = new OfflineAudioContext(1, largo, OBJETIVO_HZ);
              const fuente = off.createBufferSource();
              fuente.buffer = audio;
              fuente.connect(off.destination);
              fuente.start();
              const rendido = await off.startRendering();
              ok(comoWav(rendido.getChannelData(0), OBJETIVO_HZ));
            } catch (e) {
              mal(e instanceof Error ? e : new Error(String(e)));
            }
          })();
        };
        try {
          rec.stop();
        } catch (e) {
          soltarMicro();
          mal(e instanceof Error ? e : new Error(String(e)));
        }
      }),
  };
}

/** Si se puede dictar: devuelve el modelo que usaría, o el motivo de que no. */
export function vozLista(): Promise<string> {
  return invoke("voz_lista");
}

/** El WAV a texto, con whisper.cpp. "es" fija el idioma; "" lo detecta solo. */
export function transcribir(wav: Uint8Array, idioma = "es"): Promise<string> {
  return invoke("transcribir", { wav: Array.from(wav), idioma });
}
