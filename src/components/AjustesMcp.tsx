// Ajustes > Terminales > Qué puede hacer cada cliente por el MCP (decisión D1
// de Munir, 2026-10-07, y B1 del 2026-11-03): una fila por programa que se ha
// abierto en una terminal de Adeorq, más «Fuera de Adeorq» siempre, con lo que
// puede hacer (los tres pasos del Capataz, con nombres para Munir). La puerta
// está en Rust (`mcp_clientes.rs`); esto solo la enseña y la cambia.

import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import { MODOS, type ModoCapataz } from "../lib/manos";
import { proveedorDe } from "../lib/providers";
import { FUERA, mcpClientesLeer, mcpClientesPoner, type ClienteMcp } from "../lib/mcpClientes";

/** Lo que dice cada paso a quien elige, sin las palabras del Capataz. */
const PASO: Record<ModoCapataz, { nombre: string; que: string }> = {
  mirar: { nombre: "Solo mirar", que: "Lee terminales y proyectos, y no cambia nada" },
  plan: { nombre: "Abrir y mirar", que: "Además abre terminales y cierra las que abrió, pero no escribe en las de otros" },
  auto: { nombre: "Todo", que: "Además escribe en cualquier terminal y la cierra" },
};

export default function AjustesMcp() {
  const { t } = useT();
  const [clientes, setClientes] = useState<ClienteMcp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mcpClientesLeer()
      .then(setClientes)
      .catch((e) => setError(String(e)));
  }, []);

  const poner = useCallback((nombre: string, nivel: ModoCapataz | null) => {
    mcpClientesPoner(nombre, nivel)
      .then(setClientes)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <section className="panel-card" data-sin-mods="">
      <h2>{t("Qué puede hacer cada cliente por el MCP")}</h2>
      <p className="card-hint">
        {t("Va por el programa que abriste en cada terminal de Adeorq: ")}
        <b>{t("Claude Code puede escribir en las demás")}</b>
        {t("; los otros abren terminales y miran. ")}
        <b>{t("Lo que llega de fuera de Adeorq")}</b>
        {t(" (un Claude Code en otra consola, cualquier programa) solo abre y mira, hasta que lo subas aquí. El Capataz y el conserje no cuentan.")}
      </p>
      {error && <p className="card-hint">{error}</p>}
      {clientes?.map((c) => {
        const fuera = c.nombre === FUERA;
        const nombre = fuera ? t("Fuera de Adeorq") : (proveedorDe(c.nombre)?.label ?? c.nombre);
        return (
          <div className="mcp-cliente" key={c.nombre}>
            <div className="mcp-cliente-quien">
              <b>{nombre}</b>
              <span>
                {!fuera && c.version ? `v${c.version} · ` : ""}
                {c.veces
                  ? t(c.veces === 1 ? "una vez, {cuando}" : "{n} veces, la última {cuando}", {
                      n: c.veces,
                      cuando: t(hace(c.ultima_vez * 1000).clave, { n: hace(c.ultima_vez * 1000).valor }),
                    })
                  : t("nunca se ha conectado")}
                {c.fabrica ? ` · ${t("de fábrica")}` : ""}
              </span>
            </div>
            <div className="chip-row">
              {MODOS.map((m) => (
                <button
                  key={m}
                  className="choice"
                  data-on={c.nivel === m}
                  data-tip={t(PASO[m].que)}
                  onClick={() => poner(c.nombre, m)}
                >
                  {t(PASO[m].nombre)}
                </button>
              ))}
              {!c.fabrica && (
                <button className="choice" onClick={() => poner(c.nombre, null)}>
                  {t("Como de fábrica")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
