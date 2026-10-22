// Ajustes › Terminales: qué hace un panel de Claude Code al llegar al 60 % de contexto.
//
// Munir, 2026-10-22: «que sea casi obligatorio compactar en ese rango». De fábrica
// «sin commits» (lo eligió él ese día): a la campana manda `/fin sin commits`, que la skill
// entiende, y nunca con el agente trabajando. El `/fin` entero commitea en sus repos sin su
// mano, así que ese solo va si lo elige aquí. Lo leen los paneles al sonar su campana
// (`leerModoSolo`, en lib/contexto.ts), así que vale sin reiniciar nada.

import { useState } from "react";
import { guardarModoSolo, guardarSugerir, leerModoSolo, leerSugerir, type ModoSolo } from "../lib/contexto";
import { useT } from "../lib/i18n";

export default function AjusteCompactar() {
  const { t } = useT();
  const [modo, setModo] = useState<ModoSolo>(leerModoSolo);
  const [sugerir, setSugerir] = useState(leerSugerir);
  return (
    <>
      <label className="setting-row setting-compactar">
        <span>{t("Al 60 % de contexto, en Claude Code")}</span>
        <select
          value={modo}
          onChange={(e) => {
            const m = e.currentTarget.value as ModoSolo;
            setModo(m);
            guardarModoSolo(m);
          }}
        >
          <option value="no">{t("Avisar y esperar al botón")}</option>
          <option value="sin-commits">{t("Compactar solo, sin commits")}</option>
          <option value="fin">{t("Compactar solo, con el /fin entero")}</option>
        </select>
      </label>
      <label className="setting-row setting-switch">
        <span>{t("Sugerir compactar al acabar una tarea grande, desde el 40 %")}</span>
        <input
          type="checkbox"
          checked={sugerir}
          onChange={(e) => {
            const si = e.currentTarget.checked;
            setSugerir(si);
            guardarSugerir(si);
          }}
        />
      </label>
    </>
  );
}
