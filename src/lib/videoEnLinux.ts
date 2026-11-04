// El `<video>` de Linux.
//
// El de WebKitGTK solo lee http(s) y `blob:`: con un esquema propio, como el `asset:` por
// el que Tauri sirve los archivos del disco, contesta `NotSupportedError` y no pinta nada.
// No es el códec, que el mismo archivo en un `blob:` se ve bien (medido con una ventana
// WebKitGTK 2.52.5 mínima y un esquema propio, 2026-11-03). Así que en Linux un fondo de
// vídeo se quedaba en nada, y en la tarjeta no había vista previa ni recorte, aunque el MP4
// sí salía: ese lo lee `mediabunny` con `fetch`, que con `asset:` funciona.
//
// La salida es bajarlo a un `blob:`. Va a trozos del tamaño que da cada rango de `asset:`,
// porque sin rango Tauri lee el archivo entero a memoria antes de contestar. Cuesta lo que
// pesa el vídeo mientras se use, y por eso hay tope: por encima, nada de vista previa, que
// un fondo de varios GB no tumbe la app. En Windows y macOS todo esto no corre.

import { useEffect, useState } from "react";

/** Lo que `asset:` da en cada rango (`MAX_LEN` en `tauri/src/protocol/asset.rs`). */
const TROZO = 1000 * 1024;
/** Lo más que se baja a memoria. */
export const TOPE_VIDEO = 1024 ** 3;

export const VIDEO_SOLO_POR_BLOB = typeof navigator !== "undefined" && /Linux/.test(navigator.platform);

type Pedir = (url: string, opciones: { headers: Record<string, string> }) => Promise<Pick<Response, "ok" | "status" | "headers" | "blob">>;

/** El archivo entero, como un `Blob`. Falla si no se puede leer o si pasa de `tope`. */
export async function bajarVideo(url: string, pedir: Pedir = fetch, tope = TOPE_VIDEO): Promise<Blob> {
  const partes: Blob[] = [];
  let desde = 0;
  let tipo = "";
  for (;;) {
    const r = await pedir(url, { headers: { Range: `bytes=${desde}-${desde + TROZO - 1}` } });
    if (!r.ok) throw new Error(`no se pudo leer el vídeo (${r.status})`);
    const rango = r.headers.get("content-range");
    tipo ||= r.headers.get("content-type") ?? "";
    // Sin rango: es que ha contestado con el archivo entero, y se acabó.
    if (r.status !== 206 || !rango) {
      const entero = await r.blob();
      if (entero.size > tope) throw new Error("el vídeo pesa demasiado para tenerlo en memoria");
      return entero;
    }
    const total = Number(rango.split("/")[1]);
    if (total > tope) throw new Error("el vídeo pesa demasiado para tenerlo en memoria");
    const trozo = await r.blob();
    if (trozo.size === 0) throw new Error("el vídeo se ha cortado");
    partes.push(trozo);
    desde += trozo.size;
    if (desde >= total) return new Blob(partes, { type: tipo });
  }
}

/** Cada vídeo se baja una vez y se tira cuando ya no lo usa nadie. */
const bajados = new Map<string, { promesa: Promise<string>; usos: number }>();

function tomar(url: string): { promesa: Promise<string>; soltar: () => void } {
  let e = bajados.get(url);
  if (!e) {
    const nuevo = { promesa: bajarVideo(url).then((b) => URL.createObjectURL(b)), usos: 0 };
    nuevo.promesa.catch(() => bajados.delete(url));
    bajados.set(url, nuevo);
    e = nuevo;
  }
  e.usos++;
  const entrada = e;
  return {
    promesa: entrada.promesa,
    soltar: () => {
      if (--entrada.usos > 0) return;
      if (bajados.get(url) === entrada) bajados.delete(url);
      void entrada.promesa.then(URL.revokeObjectURL, () => {});
    },
  };
}

/** Lo que va en el `src` de un `<video>` de React. Fuera de Linux, la misma dirección. */
export function useFuenteDeVideo(url: string): string | undefined {
  const [fuente, setFuente] = useState<string>();
  useEffect(() => {
    if (!VIDEO_SOLO_POR_BLOB || !url) return;
    let vivo = true;
    setFuente(undefined);
    const { promesa, soltar } = tomar(url);
    promesa.then(
      (blob) => {
        if (vivo) setFuente(blob);
      },
      () => {},
    );
    return () => {
      vivo = false;
      soltar();
    };
  }, [url]);
  return VIDEO_SOLO_POR_BLOB ? fuente : url;
}

/** Lo mismo para un `<video>` hecho a mano, de los que se pintan en un lienzo. Devuelve
 *  con qué soltarlo. En WebKitGTK un `<video>` fuera del documento se queda en 0 y
 *  `drawImage` no pinta nada, así que allí va dentro, de un píxel y sin que se vea
 *  (medido con los tres casos, fuera, escondido y visible, 2026-11-03). */
export function ponerFuenteDeVideo(v: HTMLVideoElement, url: string): () => void {
  if (!VIDEO_SOLO_POR_BLOB) {
    v.src = url;
    return () => {};
  }
  v.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
  document.body.append(v);
  const { promesa, soltar } = tomar(url);
  promesa.then(
    (blob) => {
      v.src = blob;
    },
    () => {},
  );
  return () => {
    v.remove();
    soltar();
  };
}
