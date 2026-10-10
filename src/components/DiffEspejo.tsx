// El diff de un archivo en el Modo Espejo, con cada línea en su número de
// verdad y con camino de vuelta: pulsas una línea, escribes una nota y le llega
// al agente que hizo el cambio. Qué es cada renglón y cómo se redacta la nota
// está en `lib/diffEspejo.ts`. Vivía dentro de `TerminalPane.tsx`.

import { useEffect, useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { esComentable, leerDiff, notaParaElAgente } from "../lib/diffEspejo";

const CLASE = {
  cabecera: "diff-line diff-header",
  trozo: "diff-line diff-chunk",
  mas: "diff-line diff-add",
  menos: "diff-line diff-del",
  igual: "diff-line",
} as const;

interface Props {
  texto: string;
  /** El archivo que se está viendo, para nombrarlo en la nota. */
  archivo: string | null;
  /** Mandarle la nota al agente. Sin esto el diff es solo para mirar. */
  onNota?: (mensaje: string) => void;
}

export default function DiffEspejo({ texto, archivo, onNota }: Props) {
  const { t } = useT();
  const renglones = useMemo(() => leerDiff(texto), [texto]);
  /** Sobre qué renglón se está escribiendo, y cuáles ya llevan una nota. */
  const [abierto, setAbierto] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [enviadas, setEnviadas] = useState<ReadonlySet<number>>(new Set());

  // Otro archivo, u otra versión del mismo: los índices ya no valen.
  useEffect(() => {
    setAbierto(null);
    setNota("");
    setEnviadas(new Set());
  }, [texto]);

  if (!texto) return <div className="diff-empty">{t("Sin diferencias en este archivo")}</div>;

  const comentar = !!onNota && !!archivo;
  const abrir = (i: number) => {
    setNota("");
    setAbierto(abierto === i ? null : i);
  };
  const enviar = (i: number) => {
    if (!onNota || !archivo || !nota.trim()) return;
    onNota(notaParaElAgente(archivo, renglones[i], nota, t));
    setEnviadas(new Set(enviadas).add(i));
    setAbierto(null);
    setNota("");
  };

  return (
    <pre className="diff-pre">
      {renglones.map((r, i) => {
        const sePuede = comentar && esComentable(r);
        return (
          <div key={i}>
            <div
              className={CLASE[r.tipo]}
              data-comentable={sePuede || undefined}
              data-tip={sePuede ? t("Clic para dejarle una nota al agente sobre esta línea") : undefined}
              onClick={sePuede ? () => abrir(i) : undefined}
            >
              <span className="diff-ln">{r.linea ?? ""}</span>
              <span className="diff-content">{r.crudo}</span>
              {enviadas.has(i) && <span className="diff-enviada">{t("nota enviada")}</span>}
            </div>
            {abierto === i && (
              <div className="diff-nota">
                <input
                  autoFocus
                  value={nota}
                  placeholder={t("Qué le dices al agente sobre esta línea")}
                  onChange={(e) => setNota(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") enviar(i);
                    else if (e.key === "Escape") setAbierto(null);
                  }}
                />
                <button className="mini" disabled={!nota.trim()} onClick={() => enviar(i)}>
                  {t("Enviar")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </pre>
  );
}
