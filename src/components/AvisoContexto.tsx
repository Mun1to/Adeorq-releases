// El aviso de contexto de un panel: la franja de arriba con el porcentaje, Compactar y
// «Ahora no». Vivía dentro de TerminalPane.tsx; el porqué de cada raya y lo que hace cada
// botón están en lib/contexto.ts.

import { leerModoSolo, type useTraspaso } from "../lib/contexto";
import { useT } from "../lib/i18n";

type Props = {
  percent: number;
  /** El nivel que se enseña (0 si ya se despachó) y el que hay de verdad. */
  avisoCtx: number;
  ctxNivel: number;
  traspaso: ReturnType<typeof useTraspaso>;
  conNueva: boolean;
  setCtxVisto: (n: number) => void;
};

export default function AvisoContexto({ percent, avisoCtx, ctxNivel, traspaso, conNueva, setCtxVisto }: Props) {
  const { t } = useT();
  const modoSolo = avisoCtx >= 2 ? leerModoSolo() : "no";
  return (
    <div className="pane-ctx-warn" data-grave={Math.max(avisoCtx, ctxNivel) >= 2} data-nivel={avisoCtx} data-fase={traspaso.fase}>
      {/* Una frase, no dos renglones: «son muy largos y estorban» (Munir,
          2026-10-07). Los tokens y el porqué siguen en el globo de la
          píldora del contexto. Desde el 60 % no lleva ×: «Ahora no» es
          lo único que lo quita, y dice lo que hace. */}
      <span>
        {traspaso.fase === "esperando"
          ? t("Compacto en cuanto acabe este turno.")
          : traspaso.fase === "cerrando"
            ? t("Escribiendo el traspaso (/fin); en cuanto acabe, sigo yo.")
            : avisoCtx === 0
              ? t("Acabó una tarea grande y vas por el {pct} %: buen punto para compactar.", { pct: traspaso.sugerencia ?? 0 })
              : avisoCtx === 3
                ? modoSolo !== "no"
                  ? t("{pct} % de contexto: al acabar este turno lo compacto yo (mejor aún, una terminal nueva).", { pct: percent })
                  : t("{pct} % de contexto: mejor una terminal nueva que compactar.", { pct: percent })
                : avisoCtx === 2
                  ? modoSolo !== "no"
                    ? t("{pct} % de contexto: al acabar este turno lo compacto yo.", { pct: percent })
                    : t("{pct} % de contexto: compacta ya, cada mensaje lo vuelve a pagar entero.", { pct: percent })
                  : t("{pct} % de contexto: buen momento para compactar, cada mensaje lo vuelve a pagar entero.", { pct: percent })}
      </span>
      {traspaso.fase === "nada" && avisoCtx === 3 && conNueva && (
        <button
          className="mini pane-ctx-compactar"
          data-tip={t("Primero el traspaso (BUZON.md y docs vivos), después una terminal nueva aquí mismo que sigue desde ahí")}
          onClick={() => traspaso.nueva()}
        >
          {t("Nueva con traspaso")}
        </button>
      )}
      {traspaso.fase === "nada" && (
        <button
          className="mini pane-ctx-compactar"
          data-tip={t("Primero el traspaso (BUZON.md y docs vivos), después /compact. Con el agente trabajando, espera a que acabe su turno.")}
          onClick={() => traspaso.compactar()}
        >
          {avisoCtx >= 2 && modoSolo !== "no" ? t("Compactar ya") : t("Compactar")}
        </button>
      )}
      {traspaso.fase !== "nada" || avisoCtx >= 2 ? (
        <button className="mini pane-ctx-compactar" data-tip={t("Nada solo hasta el aviso siguiente")} onClick={() => traspaso.ahoraNo()}>
          {t("Ahora no")}
        </button>
      ) : (
        <button
          className="pane-close"
          data-tip={t("Ocultar aviso (vuelve si la sesión sigue creciendo)")}
          onClick={() => (avisoCtx > 0 ? setCtxVisto(avisoCtx) : traspaso.descartarSugerencia())}
        >
          ×
        </button>
      )}
    </div>
  );
}
