// Una imagen cualquiera, hecha un PNG pequeño y centrado que guardamos nosotros.
// Vivía en `Sidebar.tsx`, que tiene techo de líneas (`scripts/gordos-check.mjs`).

/** Lado, en píxeles, del cuadrado al que se reduce un logo de proyecto. */
const AVATAR_PX = 64;

export function shrinkToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No he podido leer ese archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Ese archivo no es una imagen que pueda mostrar"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_PX;
        canvas.height = AVATAR_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.width || !img.height) {
          reject(new Error("Esa imagen viene vacía"));
          return;
        }
        // Contain, not cover: a wide wordmark must stay readable, not cropped.
        const scale = Math.min(AVATAR_PX / img.width, AVATAR_PX / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
