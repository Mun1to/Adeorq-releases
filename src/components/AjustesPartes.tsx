// Ajustes › Aspecto › Partes de Adeorq: encender y apagar ENTERAS la Cabina, el
// Lienzo, la Memoria y el Chat (Munir, 2026-10-17, A2 B1 C2). Lo mismo que se
// elige en la bienvenida; las reglas viven en `lib/partes.ts` y esto solo las
// enseña. Va con la misma lista que «La cabecera», que está justo debajo: son
// primas, y la diferencia se dice en la pista de cada una.

import { useState } from "react";
import { useT } from "../lib/i18n";
import { alternarParte, PARTES, seVe, type Parte, type TerminalesPorVista } from "../lib/partes";

interface Props {
  apagadas: Parte[];
  cambiar: (a: Parte[]) => void;
  vivas: TerminalesPorVista;
}

export default function AjustesPartes({ apagadas, cambiar, vivas }: Props) {
  const { t } = useT();
  /** Por qué no se pudo apagar la última, dicho junto a ella. */
  const [porque, setPorque] = useState<{ parte: Parte; texto: string } | null>(null);

  return (
    <section className="panel-card">
      <h2>{t("Partes de Adeorq")}</h2>
      <p className="card-hint">
        {t(
          "Apagar una parte la apaga entera: desaparece su pestaña y no arranca nada suyo por detrás. Se vuelve a encender aquí, sin reinstalar. Panel, Agenda, Decisiones, Cuentas y Comandos van siempre.",
        )}
      </p>
      <ul className="cab-lista">
        {PARTES.map((p) => {
          const apagada = apagadas.includes(p.id);
          // Apagada, pero con terminales abiertas: sigue a la vista hasta cerrarlas.
          const quedan = apagada && seVe(p.id, apagadas, vivas) ? vivas[p.id as keyof TerminalesPorVista] : 0;
          return (
            <li key={p.id} className="cab-fila parte-fila" data-fuera={apagada || undefined}>
              <span className="cab-nombre">
                {t(p.nombre)}
                <small>{t(p.que)}</small>
                {quedan > 0 && (
                  <small className="parte-aviso">
                    {quedan === 1
                      ? t("Apagada: se quita cuando cierres su terminal abierta.")
                      : t("Apagada: se quita cuando cierres sus {n} terminales abiertas.", { n: quedan })}
                  </small>
                )}
                {porque?.parte === p.id && <small className="parte-aviso">{t(porque.texto)}</small>}
              </span>
              <input
                type="checkbox"
                checked={!apagada}
                aria-label={t(p.nombre)}
                onChange={() => {
                  const r = alternarParte(apagadas, p.id);
                  setPorque(r.porque ? { parte: p.id, texto: r.porque } : null);
                  if (!r.porque) cambiar(r.apagadas);
                }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
