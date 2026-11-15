// Ajustes › Terminales: qué hace un panel de Claude Code al llegar a la raya roja de contexto
// (450.000 tokens, o el 60 % de una ventana pequeña; `nivelDeContexto`).
//
// Munir, 2026-10-22: «que sea casi obligatorio compactar en ese rango». De fábrica el
// `/fin` entero desde el 2026-11-15 (su R1: memoria, traspaso y commits de su propio
// trabajo, y se compacta); «sin commits» manda `/fin sin commits`, que la skill entiende.
// Nunca con el agente trabajando, y subir sigue pidiendo su palabra. Lo leen los paneles
// al sonar su campana (`leerModoSolo`, en lib/contexto.ts), así que vale sin reiniciar nada.

import { useState } from "react";
import { guardarModoSolo, guardarSugerir, leerModoSolo, leerSugerir, type ModoSolo } from "../lib/contexto";
import { useT } from "../lib/i18n";
import { guardarVueltaArriba, leerVueltaArriba } from "../lib/vueltaArribaVivo";

export default function AjusteCompactar() {
  const { t } = useT();
  const [modo, setModo] = useState<ModoSolo>(leerModoSolo);
  const [sugerir, setSugerir] = useState(leerSugerir);
  const [vuelta, setVuelta] = useState(leerVueltaArriba);
  return (
    <>
      <label className="setting-row setting-compactar">
        <span>{t("A los 450.000 tokens de contexto, en Claude Code")}</span>
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
        <span>{t("Sugerir compactar al acabar una tarea grande, desde los 200.000 tokens")}</span>
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
      {/* Lo otro que se teclea solo en una terminal: el aviso a la que abrió
          otras por MCP cuando una de ellas acaba (`lib/vueltaArribaVivo.ts`). */}
      <label className="setting-row setting-switch">
        <span>{t("Contarle a la terminal que abrió otras cuándo acaban, se bloquean o preguntan")}</span>
        <input
          type="checkbox"
          checked={vuelta}
          onChange={(e) => {
            const si = e.currentTarget.checked;
            setVuelta(si);
            guardarVueltaArriba(si);
          }}
        />
      </label>
    </>
  );
}
