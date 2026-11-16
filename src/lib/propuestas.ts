// Lo que se hace con una propuesta de la bandeja (`bandeja.md`, `inbox.rs`):
// aceptarla, descartarla o hacer lo que propone.
//
// Desde el 2026-11-15 (A1) las propuestas se atienden en la lista de
// Decisiones, en «Ideas de tus agentes». Las tres salidas viven aquí, sueltas,
// para que no haya dos copias que acaben haciendo cosas distintas.

import { addIdea } from "./brujula";
import { olvidarAccion, type AccionConsejo } from "./acciones";
import type { Translate } from "./i18n";
import { addParked, dropInbox, type Note, type Project } from "./pty";

/**
 * Aceptarla es donde deja de ser una sugerencia: un paso va al METAS.md de su
 * proyecto y una idea a la brújula. La línea sale de la bandeja solo DESPUÉS
 * de haberse escrito, así que si falla sigue ahí para volver a intentarlo.
 * Devuelve lo que se dice y, si fue a un METAS.md, su carpeta.
 */
export async function aceptarPropuesta(n: Note, proyectos: Project[], t: Translate): Promise<{ dicho: string; carpeta?: string }> {
  if (n.kind === "paso") {
    const carpeta = proyectos.find((p) => p.name === n.project)?.path;
    if (!carpeta) throw new Error(t("No encuentro la carpeta de {p}, así que no sé dónde apuntarlo.", { p: n.project }));
    await addParked(carpeta, n.text);
    await dropInbox(n);
    return { dicho: t("Apuntado en el METAS.md de {p}.", { p: n.project }), carpeta };
  }
  await addIdea(n.text, n.project);
  await dropInbox(n);
  return { dicho: t("Idea guardada en tu brújula.") };
}

/** Descartarla: se borra de la bandeja y ya está. */
export async function descartarPropuesta(n: Note): Promise<void> {
  await dropInbox(n);
  olvidarAccion(n.text);
}

/**
 * Hacer lo que propone: abrir el otro cliente, cambiar de cerebro, probarlo en
 * el chat. Solo la traen las del copiloto. Se borra DESPUÉS de que haya salido
 * bien: si abrir la terminal falla, la propuesta sigue en la bandeja.
 */
export async function hacerPropuesta(n: Note, a: AccionConsejo, onHacer: (a: AccionConsejo) => Promise<string>): Promise<string> {
  const dicho = await onHacer(a);
  await dropInbox(n);
  olvidarAccion(n.text);
  return dicho;
}
