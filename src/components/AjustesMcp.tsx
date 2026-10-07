// Ajustes > Terminales > Qué puede hacer cada cliente por el MCP (decisión D1
// de Munir, 2026-10-07): una fila por programa que se ha conectado alguna
// vez, con su escalón (mirar · plan · auto, los del Capataz). La puerta está
// en Rust (`mcp_clientes.rs`); esto solo la enseña y la cambia.

import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import { MODOS, ROTULO, type ModoCapataz } from "../lib/manos";
import { mcpClientesLeer, mcpClientesPoner, type ClienteMcp } from "../lib/mcpClientes";

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
    <section className="panel-card">
      <h2>{t("Qué puede hacer cada cliente por el MCP")}</h2>
      <p className="card-hint">
        {t(
          "Cada programa que se conecta al MCP de Adeorq (Codex, Gemini, Kimi, un Claude Code tuyo…) tiene su escalón, los mismos tres del Capataz. De fábrica, plan: puede mirar y abrir terminales, nunca escribir en una que ya está trabajando. Claude Code nace en auto porque es lo que ya hace hoy. El Capataz y el conserje no cuentan: llevan su propio recorte.",
        )}
      </p>
      {error && <p className="card-hint">{error}</p>}
      {clientes && clientes.length === 0 && (
        <p className="card-hint">
          {t("Todavía no se ha conectado ninguno. Aparecen aquí la primera vez que hablan con el MCP.")}
        </p>
      )}
      {clientes?.map((c) => (
        <div className="mcp-cliente" key={c.nombre}>
          <div className="mcp-cliente-quien">
            <b>{c.nombre}</b>
            <span>
              {c.version ? `v${c.version} · ` : ""}
              {c.veces
                ? t("{n} veces, la última {cuando}", {
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
                data-tip={t(ROTULO[m].que)}
                onClick={() => poner(c.nombre, m)}
              >
                {t(ROTULO[m].nombre)}
              </button>
            ))}
            {!c.fabrica && (
              <button className="choice" onClick={() => poner(c.nombre, null)}>
                {t("Como de fábrica")}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
