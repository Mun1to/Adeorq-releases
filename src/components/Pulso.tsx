// Lo que Adeorq le está costando a tu equipo, en una píldora de la barra.
//
// Una ventana con seis terminales dentro no es una aplicación ligera por mucho
// que el instalador ocupe cuatro megas: cada agente es un Node entero. Saber si
// el equipo va lento por Adeorq o por otra cosa obligaba a abrir el
// Administrador de tareas y sumar a mano procesos con el mismo nombre.
//
// Va en la barra y en pequeño a propósito: es un dato de fondo, no el trabajo.
// Se mira de reojo y solo se abre cuando algo va raro (Munir, 2026-07-31: «en
// algún lado que no estorbe»).

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../lib/i18n";
import { bonito } from "../lib/ram";

interface Datos {
  ramMb: number;
  ramPct: number;
  sistemaMb: number;
  sistemaPct: number;
  totalMb: number;
  procesos: number;
  agentes: number;
}

/** Cada cinco segundos. Recorrer la tabla de procesos cuesta poco, pero no es
    gratis, y estos números no cambian de un parpadeo al otro. */
const CADA_MS = 5000;

export default function Pulso() {
  const { t, lang } = useT();
  const [d, setD] = useState<Datos | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const leer = () => void invoke<Datos>("pulso").then(setD).catch(() => {});
    leer();
    const id = setInterval(leer, CADA_MS);
    return () => clearInterval(id);
  }, []);

  if (!d) return null;

  // Rojo cuando el equipo entero va apretado, ámbar cuando el que aprieta es
  // Adeorq. Distinguirlo es la mitad de la gracia: si el sistema está al 90 %
  // pero Adeorq lleva el 6 %, el problema no es este programa.
  const nivel = d.sistemaPct >= 90 ? "alto" : d.ramPct >= 25 ? "medio" : "";

  return (
    <div className="pulso-caja">
      <button
        className="tab pulso"
        data-nivel={nivel || undefined}
        data-on={abierto || undefined}
        data-tip={t("Lo que Adeorq está gastando en tu equipo")}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="pulso-dato">
          <b>{bonito(d.ramMb, lang)}</b>
          <span>RAM</span>
        </span>
        <span className="pulso-sep" />
        <span className="pulso-dato">
          <b>{d.agentes}</b>
          <span>{lang === "en" ? "AG" : "AG"}</span>
        </span>
      </button>

      {abierto && (
        <div className="pulso-detalle">
          <h4>{t("Lo que gasta Adeorq")}</h4>
          <Fila
            etiqueta={t("Memoria de Adeorq y sus agentes")}
            valor={`${bonito(d.ramMb, lang)} · ${d.ramPct}%`}
            pct={d.ramPct}
          />
          <Fila
            etiqueta={t("Memoria de todo el equipo")}
            valor={`${bonito(d.sistemaMb, lang)} de ${bonito(d.totalMb, lang)}`}
            pct={d.sistemaPct}
            alto={d.sistemaPct >= 90}
          />
          <p className="pulso-linea">
            {t("{n} procesos en marcha", { n: d.procesos })}
            {", "}
            {d.agentes === 1
              ? t("uno es un agente")
              : t("{n} son agentes", { n: d.agentes })}
            {"."}
          </p>
          <p className="card-hint">
            {t(
              "Cada agente es un programa aparte, así que la cuenta incluye lo que gastan tus terminales y no solo la ventana.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  pct,
  alto = false,
}: {
  etiqueta: string;
  valor: string;
  pct: number;
  alto?: boolean;
}) {
  return (
    <div className="pulso-fila">
      <div className="pulso-fila-top">
        <span>{etiqueta}</span>
        <strong>{valor}</strong>
      </div>
      <span className="pulso-barra">
        <span style={{ width: `${Math.min(100, pct)}%` }} data-alto={alto} />
      </span>
    </div>
  );
}
