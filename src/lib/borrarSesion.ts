// La papelera de la cabecera de una terminal: qué sesión se lleva y cómo.
// Fuera de `TerminalPane.tsx` porque es lógica de disco y no de pintar, y
// porque ese fichero ya va por su techo (`scripts/gordos-check.mjs`).
import { useEffect, useState } from "react";
import { agySessionSince, deleteSession, killPty } from "./pty";

/** La conversación de un panel de agy, o nada todavía. agy no acepta un id
 *  al nacer, como Codex: se lee de su `history.jsonl` (`agy_session_since`)
 *  en cuanto escribes algo. Sin ella el panel no tenía nada que borrar y la
 *  papelera no salía. Solo sirve para eso: no sube como `sessionId` del panel,
 *  que es lo que usan Reanimar y el tablero guardado, y retomar agy no está
 *  cableado. */
export function useSesionAgy(kind: string, cwd: string, nacido: number): string | undefined {
  const [sid, setSid] = useState<string | undefined>();
  useEffect(() => {
    if (kind !== "agy" || sid) return;
    let timer = 0;
    let stop = false;
    const mira = () => {
      agySessionSince(cwd, nacido)
        .then((s) => {
          if (stop) return;
          if (s) setSid(s);
          else timer = window.setTimeout(mira, 15_000);
        })
        .catch(() => {
          if (!stop) timer = window.setTimeout(mira, 30_000);
        });
    };
    timer = window.setTimeout(mira, 5_000);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [cwd, kind, nacido, sid]);
  return sid;
}

/** Borra la sesión del panel `id`. `kind` dice de qué CLI es: sin él, una de
 *  Codex se buscaba en la carpeta de Claude (que para Codex llega vacía) y no
 *  se borraba nada. agy tiene su base de SQLite abierta mientras vive, y
 *  Windows no deja moverla: se cierra su terminal antes y se reintenta
 *  mientras la suelta. */
export async function borrarSesionDePanel(id: number, kind: string, folder: string, sessionId: string): Promise<void> {
  const borrar = () => deleteSession(folder, sessionId, kind);
  if (kind !== "agy") return borrar();
  await killPty(id);
  for (let i = 0; ; i++) {
    try {
      return await borrar();
    } catch (e) {
      if (i >= 8) throw e;
      await new Promise((r) => window.setTimeout(r, 500));
    }
  }
}
