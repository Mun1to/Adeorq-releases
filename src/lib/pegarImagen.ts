// Pegar una imagen en la caja de Adeo con Ctrl+V, como en una terminal.
//
// Munir, 2026-11-17, escribiendo a una terminal con capturas pegadas: «haz que como te
// estoy escribiendo ahora mismo aquí te pueda pegar en Adeo una imagen fácilmente con
// Ctrl+V». Una caja de texto no sabe qué hacer con una imagen y el Ctrl+V no hacía nada.
// Ahora la imagen va a disco (`save_pasted_image`, la carpeta `pastes`, igual que en las
// terminales) y su ruta entra entre comillas donde está el cursor. Es lo que ya hacen las
// terminales (`lib/pegado.ts`) y el móvil con un adjunto para Adeo: los agentes leen la
// ruta, y Adeo la pasa tal cual en el encargo de la terminal que abre.
//
// Solo actúa con una imagen: un pegado de texto sigue su camino de siempre.
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { savePastedImage } from "./pty";

/** La primera imagen de lo pegado, o `null` si solo hay texto. */
export function imagenDelPegado(datos: Pick<DataTransfer, "items"> | null | undefined): File | null {
  for (const item of Array.from(datos?.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

/** La extensión del archivo para un tipo de imagen («image/png» → «png»). */
export function extensionDe(tipo: string): string {
  const ext = (tipo.split("/")[1] ?? "").split(/[+;]/)[0].toLowerCase();
  if (ext === "jpeg") return "jpg";
  return /^[a-z0-9]+$/.test(ext) ? ext : "png";
}

/** El texto con `trozo` puesto entre `desde` y `hasta`, y dónde queda el cursor. */
export function ponerEnElCursor(texto: string, desde: number, hasta: number, trozo: string) {
  const antes = texto.slice(0, desde);
  // Un espacio delante si la ruta caería pegada a una palabra.
  const hueco = antes && !/\s$/.test(antes) ? " " : "";
  const puesto = `${hueco}${trozo}`;
  return { texto: `${antes}${puesto}${texto.slice(hasta)}`, cursor: desde + puesto.length };
}

/**
 * El `onPaste` de una caja de texto de Adeo. Con una imagen en lo pegado, para el pegado
 * del navegador, la guarda y escribe su ruta donde estaba el cursor; sin imagen, no hace
 * nada. `poner` recibe el texto nuevo (el `setTexto` de la caja). Lo que falle al guardar
 * va a `alFallar`, si lo hay.
 */
export function alPegarEnCaja(
  e: ReactClipboardEvent<HTMLTextAreaElement>,
  poner: (texto: string) => void,
  alFallar?: (error: string) => void,
  guardar: (bytes: number[], ext: string) => Promise<string> = savePastedImage,
): void {
  const archivo = imagenDelPegado(e.clipboardData);
  if (!archivo) return;
  e.preventDefault();
  const caja = e.currentTarget;
  const desde = caja.selectionStart ?? caja.value.length;
  const hasta = caja.selectionEnd ?? desde;
  void archivo
    .arrayBuffer()
    .then((buf) => guardar(Array.from(new Uint8Array(buf)), extensionDe(archivo.type)))
    .then((ruta) => {
      // El valor de AHORA, no el de antes de guardar: si escribiste mientras tanto, se
      // queda. La posición es la del pegado.
      const { texto, cursor } = ponerEnElCursor(caja.value, Math.min(desde, caja.value.length), Math.min(hasta, caja.value.length), `"${ruta}" `);
      poner(texto);
      requestAnimationFrame(() => {
        caja.focus();
        caja.setSelectionRange(cursor, cursor);
      });
    })
    .catch((err) => alFallar?.(String(err)));
}
