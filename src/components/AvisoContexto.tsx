// El aviso de contexto de un panel: la franja de arriba con el porcentaje, Compactar y
// «Ahora no». Vivía dentro de TerminalPane.tsx; el porqué de cada raya y lo que hace cada
// botón están en lib/contexto.ts.

import { COMPACTADA_DE_MAS, enMiles, leerModoSolo, type useTraspaso } from "../lib/contexto";
import { useT } from "../lib/i18n";

type Props = {
  /** Los tokens de contexto: el aviso los dice así desde la D7. */
  usados: number;
  /** El nivel que se enseña (0 si ya se despachó) y el que hay de verdad. */
  avisoCtx: number;
  ctxNivel: number;
  traspaso: ReturnType<typeof useTraspaso>;
  conNueva: boolean;
  setCtxVisto: (n: number) => void;
  /** Cerrar ESTA terminal, cuando ya sigue en la nueva. */
  onCerrar: () => void;
};

export default function AvisoContexto({ usados, avisoCtx, ctxNivel, traspaso, conNueva, setCtxVisto, onCerrar }: Props) {
  const { t } = useT();
  const modoSolo = avisoCtx >= 2 ? leerModoSolo() : "no";
  /* Ya compactada dos veces, desde la raya roja: compactar otra vez sale peor que seguir en
     una nueva, así que se ofrece eso y no se compacta sola (Munir, D4: «que me la ofrezca»). */
  const deMas = ctxNivel >= 2 && traspaso.veces >= COMPACTADA_DE_MAS;
  const sola = modoSolo !== "no" && !deMas;
  if (traspaso.relevada && traspaso.fase === "nada") {
    return (
      <div className="pane-ctx-warn" data-fase="relevada">
        <span>{t("Sigue en la terminal nueva. Esta deja su rastro y se archiva al cerrarla.")}</span>
        <button className="mini pane-ctx-compactar" onClick={() => onCerrar()}>
          {t("Cerrar esta")}
        </button>
        <button className="pane-close" data-tip={t("Ocultar aviso")} onClick={() => traspaso.descartarRelevo()}>
          ×
        </button>
      </div>
    );
  }
  return (
    <div className="pane-ctx-warn" data-grave={Math.max(avisoCtx, ctxNivel) >= 2} data-nivel={avisoCtx} data-fase={traspaso.fase} data-de-mas={deMas}>
      {/* Una frase, no dos renglones: «son muy largos y estorban» (Munir,
          2026-10-07). Los tokens y el porqué siguen en el globo de la
          píldora del contexto. Desde la raya roja no lleva ×: «Ahora no» es
          lo único que lo quita, y dice lo que hace. */}
      <span>
        {traspaso.fase === "esperando"
          ? t("Compacto en cuanto acabe este turno.")
          : traspaso.fase === "cerrando"
            ? t("Escribiendo el traspaso (/fin); en cuanto acabe, sigo yo.")
            : avisoCtx === 0
              ? t("Acabó una tarea grande y vas por {k} tokens: buen punto para compactar.", { k: enMiles(traspaso.sugerencia ?? 0) })
              : deMas
                ? t("{k} tokens y ya compactada {n} veces: mejor seguir en una terminal nueva que compactar otra vez.", { k: enMiles(usados), n: traspaso.veces })
                : avisoCtx === 3
                  ? sola
                    ? t("{k} tokens de contexto: al acabar este turno lo compacto yo (mejor aún, una terminal nueva).", { k: enMiles(usados) })
                    : t("{k} tokens de contexto: mejor una terminal nueva que compactar.", { k: enMiles(usados) })
                  : avisoCtx === 2
                    ? sola
                      ? t("{k} tokens de contexto: al acabar este turno lo compacto yo.", { k: enMiles(usados) })
                      : t("{k} tokens de contexto: compacta ya, cada mensaje lo vuelve a pagar entero.", { k: enMiles(usados) })
                    : t("{k} tokens de contexto: buen momento para compactar, cada mensaje lo vuelve a pagar entero.", { k: enMiles(usados) })}
      </span>
      {traspaso.fase === "nada" && (avisoCtx === 3 || (deMas && avisoCtx > 0)) && conNueva && (
        <button
          className="mini pane-ctx-compactar"
          data-tip={t("Primero el /fin; al acabar, una terminal nueva aquí mismo que empieza con su bloque «Retomar», y esta se archiva al cerrarla")}
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
          {avisoCtx >= 2 && sola ? t("Compactar ya") : t("Compactar")}
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
