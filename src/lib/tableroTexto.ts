// El tablero del lienzo, contado en texto para un agente. Vivía en CanvasView.tsx.

import type { Edge, Node } from "@xyflow/react";
import type { TermData } from "../components/CanvasTerm";

// El tablero, contado en texto para que un agente pueda razonar sobre él.
//
// Es la diferencia entre un lienzo donde dibujas y un lienzo que la IA
// entiende: el agente deja de ver solo su terminal y pasa a saber quién más
// está trabajando, en qué proyecto, y qué flechas salen de dónde. Se arma
// aquí y no en el agente porque esto es un hecho comprobable, no algo que
// deba adivinar.
export function textoDelTablero(nodes: Node[], edges: Edge[], paraId: number): string {
  const term = nodes.filter((n) => n.type === "term") as Node<TermData>[];
  const otros = nodes.filter((n) => n.type !== "term");
  const nombre = (id: string) =>
    term.find((n) => n.id === id)?.data.pane.name ?? `nodo ${id}`;

  const lineas: string[] = ["## El tablero del lienzo de Adeorq", ""];
  lineas.push(`Terminales abiertas (${term.length}):`);
  for (const n of term) {
    const yo = n.data.pane.id === paraId ? "  ← ESTA ERES TÚ" : "";
    lineas.push(`- ${n.data.pane.name} · ${n.data.pane.cwd}${yo}`);
  }
  if (otros.length) {
    const cuenta = new Map<string, number>();
    for (const n of otros) {
      const k =
        n.type === "img"
          ? "captura"
          : n.type === "note"
            ? "nota"
            : String((n.data as { kind?: string }).kind ?? n.type);
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }
    lineas.push(
      "",
      `Otras piezas: ${[...cuenta].map(([k, v]) => `${v} ${k}`).join(", ")}.`,
    );
  }
  if (edges.length) {
    lineas.push("", "Flechas (la salida de la primera alimenta a la segunda):");
    for (const e of edges) {
      const brief = String(e.data?.brief ?? "").trim();
      lineas.push(
        `- ${nombre(e.source)} → ${nombre(e.target)}${brief ? `: ${brief}` : ""}${
          e.data?.auto ? " (automática)" : ""
        }`,
      );
    }
  } else {
    lineas.push("", "No hay flechas: nadie alimenta a nadie todavía.");
  }
  lineas.push(
    "",
    "Es una foto de ahora mismo, no una orden. Úsala para no pisar el trabajo",
    "de otro y para saber a quién le toca lo que tú no vas a hacer.",
  );
  return lineas.join("\n");
}
