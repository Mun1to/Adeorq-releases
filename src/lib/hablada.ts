// ¿Le acabas de decir algo a esa terminal? Es lo que cierra sola una decisión
// que te preguntó (`Vigencia::Hablada`, en decisiones.rs).
//
// Munir, 2026-10-11, con nueve decisiones «pendientes» en la pestaña que ya
// había contestado de palabra en el chat: «haz algo para que se limpie sola».
// Contestar en la terminal es lo que hace casi siempre, así que esa es la señal.
//
// Lo que cuenta es una FRASE: algo escrito y luego Intro. No cuenta un Intro a
// secas, ni una flecha, ni lo que se pulsa para contestar un menú del propio
// CLI («¿Permites este comando?»): eso no es hablar del asunto, y un agente
// puede pedir un permiso justo después de preguntarte algo.

/** Las teclas que no escriben nada: las secuencias de escape (flechas, Inicio,
    los corchetes del pegado, que envuelven texto que sí cuenta) y los demás
    caracteres de control. */
const ESCAPE = /\x1b(?:\[[0-9;?<>=]*[ -/]*[@-~]|O.|[^[O])/g;

function escribe(trozo: string): boolean {
  for (const c of trozo.replace(ESCAPE, "")) if (c >= " " && c !== "\x7f") return true;
  return false;
}

/**
 * Lo que dejó un tecleo: si la línea a medias ya lleva texto, y si con él se
 * mandó una frase. `antes` es cómo estaba la línea antes de este tecleo.
 * Ctrl+C la borra; un Intro sin nada escrito no manda nada.
 */
export function tecleo(antes: boolean, datos: string): { conTexto: boolean; enviada: boolean } {
  let conTexto = antes;
  let enviada = false;
  // Por trozos entre Intros, en orden: «hola\r» es una frase; «\rhola», no aún.
  const trozos = datos.split("\r");
  trozos.forEach((trozo, i) => {
    const ultimo = trozo.lastIndexOf("\x03");
    const tras = ultimo >= 0 ? trozo.slice(ultimo + 1) : trozo;
    if (ultimo >= 0) conTexto = false;
    if (escribe(tras)) conTexto = true;
    if (i < trozos.length - 1) {
      if (conTexto) enviada = true;
      conTexto = false;
    }
  });
  return { conTexto, enviada };
}

/** Cómo va la línea de cada terminal. */
const lineas = new Map<number, boolean>();

/**
 * Llámalo con cada tecla que Munir pulsa en una terminal (el `onData` de
 * xterm, ya sin clics ni respuestas del propio terminal). Devuelve true si con
 * ella mandó una frase. `enMenu`: el CLI tiene un menú en pantalla, y lo que
 * se teclea es para él.
 */
export function mandoUnaFrase(panel: number, datos: string, enMenu: boolean): boolean {
  const r = tecleo(lineas.get(panel) ?? false, datos);
  lineas.set(panel, r.conTexto);
  return r.enviada && !enMenu;
}
