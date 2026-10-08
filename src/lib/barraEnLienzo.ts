// La barra de sesiones, también en el lienzo.
//
// Munir, 2026-10-08: «me gustaría que en el lienzo también tengas un panel a la
// izquierda de las sesiones, como en la Cabina». Es la MISMA barra, no una
// gemela: guarda su estado (grupos plegados, «N más antiguas», el orden) y dos
// copias se pisarían lo guardado. Por eso App la monta una sola vez y el lienzo
// vive a su derecha, dentro de `view-cabina` (con `data-vista="lienzo"` el
// mosaico y el panel derecho se apartan sin desmontarse).
//
// Lo que cambia según dónde estés es adónde va lo que la barra ABRE. En la
// Cabina nace en el mosaico, como siempre. En el lienzo nace en el lienzo, donde
// miras, por el mismo camino que su botón «Terminal» (`abrirPedido` en
// `CanvasView`). Lo que ya está abierto te lleva a donde esté: si la
// conversación vive en el lienzo, la cámara va a por ella; si vive en la Cabina
// o fuera de Adeorq, lo resuelve la Cabina, que es quien sabe de eso.

import { useMemo, useState } from "react";
import type { AbrirEnLienzo } from "../components/CanvasView";
import { sessionIdOf } from "./comandos";
import { piezaDelLienzo, providerOf } from "./providers";
import type { Account, Project, SessionInfo } from "./pty";

/** Lo que la barra sabe abrir: las mismas props que `Sidebar`. */
export interface ManosDeLaBarra {
  onResume: (s: SessionInfo) => void;
  onOpenTerminal: (name: string, cwd: string) => void;
  onOpenClaude: (name: string, cwd: string) => void;
  onOpenAgy: (name: string, cwd: string, prompt?: string) => void;
  onOpenProvider: (provider: string, name: string, cwd: string) => void;
  onOpenAccount: (account: Account, name: string, cwd: string) => void;
}

interface Manos {
  enLienzo: boolean;
  /** Lo que hace la barra en la Cabina, sin tocar. */
  cabina: ManosDeLaBarra;
  /** Las terminales del lienzo, para no abrir dos veces la misma conversación. */
  delLienzo: Array<{ id: number; command?: string[] }>;
  irAlLienzo: (id: number) => void;
  /** Con qué se retoma una conversación y en qué cuenta: lo mismo que la Cabina. */
  retomar: (s: SessionInfo) => { cwd: string; command: string[]; cuenta?: Account };
  /** El comando con que arranca un proveedor (`providerCommand`). */
  arranque: (provider: string) => string[];
}

const proyecto = (name: string, path: string): Project => ({ name, path, hasGit: false });

export function useBarraEnLienzo(m: Manos): { manos: ManosDeLaBarra; pedido: AbrirEnLienzo | null } {
  const [pedido, setPedido] = useState<AbrirEnLienzo | null>(null);
  const manos = useMemo<ManosDeLaBarra>(() => {
    if (!m.enLienzo) return m.cabina;
    const pedir = (p: Omit<AbrirEnLienzo, "sello">) => setPedido({ ...p, sello: Date.now() });
    return {
      onOpenTerminal: (name, cwd) => pedir({ kind: "shell", project: proyecto(name, cwd) }),
      onOpenClaude: (name, cwd) => pedir({ kind: "claude", project: proyecto(name, cwd) }),
      // Con un encargo dentro, a la Cabina: el lienzo abre Antigravity sin él.
      onOpenAgy: (name, cwd, prompt) =>
        prompt ? m.cabina.onOpenAgy(name, cwd, prompt) : pedir({ kind: "agy", project: proyecto(name, cwd) }),
      onOpenProvider: (provider, name, cwd) =>
        pedir({
          kind: piezaDelLienzo(provider),
          project: proyecto(name, cwd),
          propio: { name: `${name} · ${providerOf(provider).label}`, command: m.arranque(provider) },
        }),
      onOpenAccount: (account, name, cwd) =>
        pedir({
          kind: piezaDelLienzo(account.provider),
          project: proyecto(name, cwd),
          propio: { name: `${name} · ${account.provider}`, command: m.arranque(account.provider) },
          cuenta: account,
        }),
      onResume: (s) => {
        const aqui = m.delLienzo.find((p) => sessionIdOf(p.command) === s.id);
        if (aqui) return m.irAlLienzo(aqui.id);
        // Viva fuera de Adeorq, o ya abierta en la Cabina: lo sabe la Cabina.
        if (s.live) return m.cabina.onResume(s);
        const { cwd, command, cuenta } = m.retomar(s);
        const nombre = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
        pedir({ kind: "claude", project: proyecto(nombre, cwd), propio: { name: s.title, command }, cuenta });
      },
    };
  }, [m.enLienzo, m.cabina, m.delLienzo, m.irAlLienzo, m.retomar, m.arranque]);
  return { manos, pedido };
}
