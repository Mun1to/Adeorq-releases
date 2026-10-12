// Ajustes › Terminales: que las terminales vivan en su propio proceso.
//
// Munir, 2026-10-11, a si los agentes deben morir cuando Adeorq se cae sola:
// «aguantan». El proceso (`terminales.rs`) las guarda mientras la app no está y
// la que vuelve se reengancha (`lib/reenganche.ts`). En pruebas y apagado de
// fábrica, y se aplica al volver a abrir: se decide antes de que se abra
// ninguna terminal, que cambiar de motor con terminales abiertas no tiene
// sentido.

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { ponerTerminalesAparte, terminalesAparte } from "../lib/pty";

export default function TerminalesAparte() {
  const { t } = useT();
  const [encendido, setEncendido] = useState<boolean | null>(null);
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    void terminalesAparte().then(setEncendido);
  }, []);
  const cambiar = (v: boolean) => {
    setEncendido(v);
    setTocado(true);
    void ponerTerminalesAparte(v).catch(() => setEncendido(!v));
  };
  return (
    <>
      <label className="setting-row setting-switch">
        <span>{t("Que las terminales aguanten si Adeorq se cae")}</span>
        <input
          type="checkbox"
          checked={!!encendido}
          disabled={encendido === null}
          onChange={(e) => cambiar(e.currentTarget.checked)}
        />
      </label>
      <p className="setting-line" data-on={tocado || undefined}>
        {tocado
          ? t("Se aplica la próxima vez que abras Adeorq.")
          : t("En pruebas. Si Adeorq se cierra de golpe, tus agentes siguen trabajando y al volver a abrirla se reenganchan con lo que hicieron. Cerrarla tú las cierra, como siempre, y si en media hora no vuelves, se cierran solas.")}
      </p>
    </>
  );
}
