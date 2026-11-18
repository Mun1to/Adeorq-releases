// Un Claude Code tecleado en una consola con `send_command` (`mcp/tecleado.rs`).
//
// El panel sabe qué corre en él por el comando con el que nació, y el de una
// consola es PowerShell: un `claude` tecleado dentro no se compactaba solo, la
// cabecera no leía su contexto y `compactarme` contestaba «sin-conversacion»
// (Munir, 2026-11-17, con la terminal de Moods pidiéndole el /compact a él).
// Rust apunta aquí la línea que se tecleó, con su `--session-id`, y el panel la
// usa en vez de la suya para saber qué CLI es y cuál es su conversación.
//
// Vive fuera del componente a propósito: un panel que se vuelve a montar (de la
// Cabina al lienzo) no puede olvidar lo que se le tecleó.

import { useSyncExternalStore } from "react";
import { kindDeComando } from "../components/KindIcon";

const tecleados = new Map<number, string[]>();
const oyentes = new Set<() => void>();

/** Lo apunta el puente (`clase: "claude_tecleado"`). Un comando que no es una
 *  lista de textos no se apunta: viene de Rust, pero se mira igual. */
export function apuntarTecleado(panel: unknown, comando: unknown): boolean {
  if (typeof panel !== "number" || !Array.isArray(comando) || !comando.length || !comando.every((c) => typeof c === "string")) {
    return false;
  }
  tecleados.set(panel, comando as string[]);
  for (const f of oyentes) f();
  return true;
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** Lo tecleado en ese panel, y se repinta cuando cambia. */
export function useClaudeTecleado(panel: number): string[] | undefined {
  return useSyncExternalStore(suscribir, () => tecleados.get(panel));
}

/** La línea que dice qué corre en el panel: la suya si ya es un agente, o la que
 *  se le tecleó si nació consola (según la tabla de proveedores). */
export function lineaQueCuenta(propia: string, tecleado: string[] | undefined): string {
  return tecleado && kindDeComando(propia) === "shell" ? tecleado.join(" ") : propia;
}
