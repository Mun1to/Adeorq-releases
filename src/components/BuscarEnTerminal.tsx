/**
 * Buscar dentro de una terminal (Ctrl+F).
 *
 * Hasta hoy, encontrar algo que pasó hace un rato era buscarlo con los ojos por
 * un scrollback de miles de líneas. Con agentes que repintan la conversación
 * entera en cada turno, eso es la operación más repetida que no tenía botón.
 *
 * Vive en su propio archivo y NO dentro de `TerminalPane` a propósito: aquel ya
 * pasa de dos mil líneas, y un componente declarado dentro de otro se remonta
 * en cada render del padre, que aquí significaría perder lo escrito en la caja
 * cada vez que llega texto nuevo por el PTY. Que es siempre.
 *
 * El trabajo de verdad lo hace `@xterm/addon-search`, que sabe recorrer el
 * búfer y pintar las marcas. Aquí solo está la cara y las teclas.
 */
import { useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { ChevronIcon, CloseIcon } from "./Icons";
import { useT } from "../lib/i18n";

interface Props {
  addon: SearchAddon;
  term: Terminal;
  /** Cerrar y devolver el teclado a la terminal, que es donde estaba. */
  onCerrar: () => void;
}

/* Las marcas las pinta el addon, no el CSS, así que los colores van aquí y no
   en `App.css`. El de la coincidencia activa es el acento de la casa; los demás
   van en un tono apagado del mismo azul, para que se lea cuántas hay sin que
   la pantalla parezca un semáforo. */
const MARCAS = {
  decorations: {
    matchBackground: "#2a5f9e",
    matchBorder: "#4d9fff",
    matchOverviewRuler: "#4d9fff",
    activeMatchBackground: "#4d9fff",
    activeMatchBorder: "#cfe4ff",
    activeMatchColorOverviewRuler: "#cfe4ff",
  },
} as const;

export default function BuscarEnTerminal({ addon, term, onCerrar }: Props) {
  const { t } = useT();
  const [aguja, setAguja] = useState("");
  const [cuenta, setCuenta] = useState<{ i: number; n: number } | null>(null);
  const cajaRef = useRef<HTMLInputElement | null>(null);

  // El foco al abrir, o esto sería un cuadro que hay que ir a buscar con el
  // ratón después de haber pedido buscar con el teclado.
  useEffect(() => {
    cajaRef.current?.focus();
    cajaRef.current?.select();
  }, []);

  useEffect(() => {
    const d = addon.onDidChangeResults((r) => {
      // `resultIndex` es -1 mientras no hay ninguna activa; en pantalla se
      // cuenta desde 1, que es como lo dice todo el mundo.
      setCuenta(r.resultCount === 0 ? { i: 0, n: 0 } : { i: r.resultIndex + 1, n: r.resultCount });
    });
    return () => d.dispose();
  }, [addon]);

  /* Buscar en cada tecla, no al pulsar Enter: con el resultado apareciendo
     mientras escribes, casi nunca hace falta el Enter. Con la caja vacía se
     limpian las marcas, o se quedarían pintadas las de la búsqueda anterior. */
  useEffect(() => {
    if (!aguja) {
      addon.clearDecorations();
      setCuenta(null);
      return;
    }
    addon.findNext(aguja, { ...MARCAS, incremental: true });
  }, [aguja, addon]);

  // Al cerrar, las marcas se van con el buscador: dejarlas pintadas sobre una
  // conversación que sigue creciendo es ruido que ya no significa nada.
  useEffect(() => () => addon.clearDecorations(), [addon]);

  const ir = (atras: boolean) => {
    if (!aguja) return;
    if (atras) addon.findPrevious(aguja, MARCAS);
    else addon.findNext(aguja, MARCAS);
  };

  const cerrar = () => {
    onCerrar();
    term.focus();
  };

  const sinNada = cuenta != null && cuenta.n === 0;

  return (
    <div className="buscar-term" role="search">
      <input
        ref={cajaRef}
        className={`buscar-term-caja${sinNada ? " buscar-term-nada" : ""}`}
        type="text"
        value={aguja}
        placeholder={t("Buscar en esta terminal")}
        aria-label={t("Buscar en esta terminal")}
        spellCheck={false}
        onChange={(e) => setAguja(e.currentTarget.value)}
        onKeyDown={(e) => {
          // Se para aquí todo: si no, la tecla sigue su camino hasta el textarea
          // de xterm y acaba escrita dentro del agente.
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            cerrar();
          } else if (e.key === "Enter") {
            e.preventDefault();
            ir(e.shiftKey);
          }
        }}
      />
      <span className="buscar-term-cuenta" aria-live="polite">
        {cuenta ? `${cuenta.i}/${cuenta.n}` : ""}
      </span>
      <button
        type="button"
        className="buscar-term-btn"
        data-tip={t("Anterior (Mayús+Intro)")}
        aria-label={t("Anterior (Mayús+Intro)")}
        onClick={() => ir(true)}
      >
        <span className="buscar-term-arriba">
          <ChevronIcon size={12} />
        </span>
      </button>
      <button
        type="button"
        className="buscar-term-btn"
        data-tip={t("Siguiente (Intro)")}
        aria-label={t("Siguiente (Intro)")}
        onClick={() => ir(false)}
      >
        <ChevronIcon size={12} />
      </button>
      <button
        type="button"
        className="buscar-term-btn"
        data-tip={t("Cerrar (Esc)")}
        aria-label={t("Cerrar (Esc)")}
        onClick={cerrar}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
