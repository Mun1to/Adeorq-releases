// Ajustes › Terminales: cuántas terminales pueden tener abiertas a la vez tus
// agentes (las que abren por MCP con `open_pane`). Lo decide y lo guarda Rust
// (`src-tauri/src/cabida.rs`), donde el agente no lo toca: de fábrica, las que
// quepan en la memoria libre y como mucho doce, que es lo que deja el tope por hora.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import NumeroAjuste from "./NumeroAjuste";

interface TopeAgentes {
  porMemoria: boolean;
  comoMucho: number;
}

/** El tope por hora de `mcp.rs` (`MAX_POR_HORA`): por encima no se llegaría nunca. */
const COMO_MUCHO_MAX = 12;

export default function AjusteTopeAgentes() {
  const { t } = useT();
  const [tope, setTope] = useState<TopeAgentes | null>(null);

  useEffect(() => {
    void invoke<TopeAgentes>("tope_agentes")
      .then((r) => r && setTope(r))
      .catch(() => {});
  }, []);

  // Sin respuesta de Rust no se enseña: unos controles que no guardan mentirían.
  if (!tope) return null;

  const cambiar = (nuevo: TopeAgentes) => {
    setTope(nuevo);
    void invoke<TopeAgentes>("fijar_tope_agentes", { tope: nuevo })
      .then((r) => r && setTope(r))
      .catch(() => {});
  };

  return (
    <>
      <label className="setting-row setting-switch" data-tope-agentes>
        <span>{t("Que tus agentes abran solo las terminales que quepan en la memoria libre")}</span>
        <input
          type="checkbox"
          checked={tope.porMemoria}
          onChange={(e) => cambiar({ ...tope, porMemoria: e.currentTarget.checked })}
        />
      </label>
      <label className="setting-row">
        <span>
          {tope.porMemoria
            ? t("Como mucho, terminales abiertas por tus agentes a la vez")
            : t("Terminales abiertas por tus agentes a la vez")}
        </span>
        <input
          type="range"
          min={1}
          max={COMO_MUCHO_MAX}
          value={tope.comoMucho}
          onChange={(e) => cambiar({ ...tope, comoMucho: Number(e.currentTarget.value) })}
        />
        <NumeroAjuste
          valor={tope.comoMucho}
          min={1}
          max={COMO_MUCHO_MAX}
          onCambiar={(n) => cambiar({ ...tope, comoMucho: n })}
        />
      </label>
    </>
  );
}
