// Ajustes › Terminales: con qué buscador busca la barra del navegador lo que no es una dirección.
//
// Munir, 2026-10-18 (pregunta C de su página): «que se pueda elegir en Ajustes». Google de
// fábrica, porque pidió el navegador como «Google normal y corriente»; Brave Search es el de su
// Brave. Se guarda en este equipo (`BUSCADOR_KEY`) y la barra lo lee al buscar (`comoUrl`).

import { useState } from "react";
import { useT } from "../lib/i18n";
import { BUSCADOR_KEY, BUSCADORES, buscadorElegido, type Buscador } from "../lib/urlweb";

export default function AjusteBuscador() {
  const { t } = useT();
  const [elegido, setElegido] = useState<Buscador>(buscadorElegido);
  const cambiar = (b: Buscador) => {
    setElegido(b);
    try {
      localStorage.setItem(BUSCADOR_KEY, b);
    } catch {
      // Sin almacén se queda para esta sesión: la barra seguirá con Google al volver.
    }
  };
  return (
    <label className="setting-row setting-buscador">
      <span>{t("Buscador de la barra del navegador")}</span>
      <select value={elegido} onChange={(e) => cambiar(e.currentTarget.value as Buscador)}>
        {(Object.keys(BUSCADORES) as Buscador[]).map((b) => (
          <option key={b} value={b}>
            {BUSCADORES[b].nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
