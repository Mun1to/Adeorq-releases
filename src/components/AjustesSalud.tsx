// Ajustes › Salud: a qué hora te cierra Adeorq por la noche.
//
// Munir, 2026-11-24: «una función de salud en Adeorq, en ajustes, de horario de
// ponerte topes [...] que puedas editar y posponer cuanto quieras». Decidió que
// a la hora se tapa la ventana con un aviso que se pospone con un clic, que
// avisa quince minutos antes, a todas las terminales, y que el horario es fijo
// con la opción de uno distinto por noche (decisión d1a20f78a7b9).
//
// Aquí solo se edita el horario. Lo que calcula horas es `lib/salud.ts`, y lo
// leen la tapa de la ventana y el aviso a las terminales, que no guardan nada.

import { useState } from "react";
import { useT } from "../lib/i18n";
import { guardarSalud, leerSalud, type Salud } from "../lib/salud";

/** La semana como la dice una persona: del lunes al domingo (`getDay`: 0 es domingo). */
const SEMANA: Array<[number, string]> = [
  [1, "La noche del lunes"],
  [2, "La noche del martes"],
  [3, "La noche del miércoles"],
  [4, "La noche del jueves"],
  [5, "La noche del viernes"],
  [6, "La noche del sábado"],
  [0, "La noche del domingo"],
];

const AVISOS = [5, 10, 15, 30, 60];

export default function AjustesSalud() {
  const { t } = useT();
  const [s, setS] = useState<Salud>(leerSalud);
  const cambiar = (nuevo: Salud) => {
    setS(nuevo);
    guardarSalud(nuevo);
  };
  // Una hora borrada a medias (el campo vacío) no se guarda: se queda la de antes.
  const hora = (v: string, si: (h: string) => void) => {
    if (/^\d\d:\d\d$/.test(v)) si(v);
  };
  const noche = (dia: number, valor: string | null) => {
    const dias = [...s.dias];
    dias[dia] = valor;
    cambiar({ ...s, dias });
  };

  return (
    <section className="panel-card">
      <h2>{t("Salud")}</h2>
      <p className="card-hint">
        {t(
          "A la hora, Adeorq tapa la ventana y les pide a tus agentes que guarden lo suyo y cierren. Avisa antes, y se pospone con un clic tantas veces como quieras.",
        )}
      </p>
      <label className="setting-row setting-switch">
        <span>{t("Cerrar Adeorq por la noche")}</span>
        <input type="checkbox" checked={s.activo} onChange={(e) => cambiar({ ...s, activo: e.currentTarget.checked })} />
      </label>
      {!s.porDia && (
        <label className="setting-row setting-salud">
          <span>{t("Hora de cierre")}</span>
          <input className="finder salud-hora" type="time" value={s.cierre} onChange={(e) => hora(e.currentTarget.value, (h) => cambiar({ ...s, cierre: h }))} />
        </label>
      )}
      <label className="setting-row setting-salud">
        <span>{t("Avisar antes")}</span>
        <select value={s.avisoMin} onChange={(e) => cambiar({ ...s, avisoMin: Number(e.currentTarget.value) })}>
          {AVISOS.map((m) => (
            <option key={m} value={m}>
              {t("{n} minutos", { n: m })}
            </option>
          ))}
        </select>
      </label>
      <label className="setting-row setting-salud">
        <span>{t("Deja de tapar a las")}</span>
        <input className="finder salud-hora" type="time" value={s.despierta} onChange={(e) => hora(e.currentTarget.value, (h) => cambiar({ ...s, despierta: h }))} />
      </label>
      {/* Las noches al final: con dos columnas, lo que vale para todas queda arriba junto. */}
      <label className="setting-row setting-switch">
        <span>{t("Cada noche a su hora")}</span>
        <input type="checkbox" checked={s.porDia} onChange={(e) => cambiar({ ...s, porDia: e.currentTarget.checked })} />
      </label>
      {s.porDia &&
        SEMANA.map(([dia, nombre]) => {
          const suya = s.dias[dia] ?? null;
          return (
            <div key={dia} className="setting-row setting-salud salud-noche" data-sin={suya === null || undefined}>
              <span>{t(nombre)}</span>
              <label className="salud-sin setting-switch">
                <input type="checkbox" checked={suya === null} onChange={(e) => noche(dia, e.currentTarget.checked ? null : s.cierre)} />
                {t("sin tope")}
              </label>
              <input
                className="finder salud-hora"
                type="time"
                aria-label={t(nombre)}
                value={suya ?? s.cierre}
                disabled={suya === null}
                onChange={(e) => hora(e.currentTarget.value, (h) => noche(dia, h))}
              />
            </div>
          );
        })}
    </section>
  );
}
