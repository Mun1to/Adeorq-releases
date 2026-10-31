// Ajustes › Terminales: si la barra de cada terminal lleva el modelo, el contexto y la memoria,
// o solo el proyecto y el nombre. El porqué y cómo llega a las terminales, en `lib/cabeceraTerminal.ts`.

import { useT } from "../lib/i18n";
import { ponerDatosCabecera, useDatosCabecera } from "../lib/cabeceraTerminal";

export default function AjusteCabeceraTerminal() {
  const { t } = useT();
  const datos = useDatosCabecera();
  return (
    <label className="setting-row setting-switch">
      <span>{t("Ver el modelo, el contexto y la memoria en la barra de cada terminal")}</span>
      <input
        type="checkbox"
        checked={datos === "todo"}
        onChange={(e) => ponerDatosCabecera(e.currentTarget.checked ? "todo" : "nombre")}
      />
    </label>
  );
}
