// Tu uso, en pequeño, en la columna derecha del Panel.
//
// Munir eligió esta lectura de «tus estadísticas» (2026-10-17) y pidió dos
// cosas al verla: «no me gusta que se corte tanto, me gustaría que se
// rellenasen los cuadraditos», o sea que las casillas llenen el ancho de la
// tarjeta en vez de quedarse en nueve semanas con media tarjeta vacía.
//
// Es la misma lectura que el Perfil (`lib/historiaDeUso.ts`) y la misma cuenta
// (`lib/usoDelPerfil.ts`): si el Perfil ya la hizo, sale al instante, y un tono
// de casilla dice lo mismo aquí que allí porque los cortes salen del año entero.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useT } from "../lib/i18n";
import type { Account } from "../lib/pty";
import { cuentasQueLeer, historiaLeida, leerHistoria } from "../lib/historiaDeUso";
import {
  casillasDelAnio,
  cifra,
  conDia,
  entre,
  fechaLarga,
  fechaLocal,
  mesEnCurso,
  porDia,
  record,
  SEMANAS,
  sumar,
  type Historia,
} from "../lib/usoDelPerfil";
import { rachaActual } from "../lib/rachas";
import Espera from "./Espera";
import { ChevronIcon } from "./Icons";

/** Medio año: a lo que mide la columna, cada casilla sale de unos 18 px. */
const SEMANAS_AQUI = 26;

export default function PanelUso({ cuentas, onVer }: { cuentas: Account[]; onVer: () => void }) {
  const { t, lang } = useT();
  const [historia, setHistoria] = useState<Historia | null>(historiaLeida);
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const hoy = fechaLocal(new Date());
  const clave = JSON.stringify(cuentasQueLeer(cuentas));

  useEffect(() => {
    let vivo = true;
    setLeyendo(true);
    setError("");
    leerHistoria(JSON.parse(clave))
      .then((h) => {
        if (vivo) setHistoria(h);
      })
      .catch((e) => vivo && setError(String(e)))
      .finally(() => vivo && setLeyendo(false));
    return () => {
      vivo = false;
    };
  }, [clave]);

  const cubos = useMemo(() => conDia(historia?.cubos ?? []), [historia]);
  const porDias = useMemo(() => porDia(cubos), [cubos]);
  const casillas = useMemo(() => casillasDelAnio(hoy, porDias).slice((SEMANAS - SEMANAS_AQUI) * 7), [hoy, porDias]);
  const [desde, hasta] = mesEnCurso(hoy);
  const delMes = useMemo(() => sumar(entre(cubos, desde, hasta)).todos, [cubos, desde, hasta]);
  const mejor = useMemo(() => record(porDias), [porDias]);
  const racha = useMemo(() => rachaActual([...porDias.keys()], hoy), [porDias, hoy]);

  const locale = lang === "en" ? "en-GB" : "es-ES";
  const diaYMes = (fecha: string) => {
    const [a, m, d] = fecha.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "long" });
  };
  const mes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, 1).toLocaleDateString(locale, { month: "long" });
  const linea = [
    t("{c} hoy", { c: cifra(porDias.get(hoy) ?? 0, lang) }),
    racha === 1 ? t("un día seguido") : racha > 1 ? t("{n} días seguidos", { n: racha }) : "",
    mejor ? t("tu récord, {c} el {f}", { c: cifra(mejor.tokens, lang), f: diaYMes(mejor.fecha) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="panel-card inicio-card inicio-uso" aria-label={t("Tu uso")}>
      <h2 className="inicio-tit">
        {t("Tu uso")}
        <button type="button" className="inicio-enlace" onClick={() => onVer()}>
          {t("Ver tu uso")}
          <ChevronIcon der size={15} />
        </button>
      </h2>
      {!historia ? (
        error ? (
          <p className="inicio-error">{t("No se pudo leer tu uso: {e}", { e: error })}</p>
        ) : (
          <Espera activo={leyendo} como="p">
            {t("Leyendo tus conversaciones… la primera vez tarda un minuto.")}
          </Espera>
        )
      ) : (
        <>
          <p className="inicio-uso-cifra">
            <b>{cifra(delMes, lang)}</b>
            {t("tokens en {mes}", { mes })}
          </p>
          <p className="inicio-uso-linea">{linea}</p>
          {/* Una columna por semana y la última termina hoy, como el año del
              Perfil; las casillas son datos y no marcos (`data-celda`). */}
          <div className="inicio-anio" style={{ "--semanas": SEMANAS_AQUI } as CSSProperties} aria-hidden="true">
            {casillas.map((c) => (
              <span
                key={c.fecha}
                data-celda
                data-n={c.nivel}
                data-hoy={c.fecha === hoy || undefined}
                title={`${fechaLarga(c.fecha, lang)} · ${cifra(c.tokens, lang)}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
