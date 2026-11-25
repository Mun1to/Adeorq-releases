// Ajustes › Terminales: cuántas sesiones abre de golpe un proyecto, las que quepan
// en la memoria libre (de fábrica) o un número fijo. El porqué, en `lib/topeAbrir.ts`.

import { useT } from "../lib/i18n";
import { MAX_ABRIR, MIN_ABRIR, ponerAbrirPorMemoria, useAbrirPorMemoria } from "../lib/topeAbrir";
import NumeroAjuste from "./NumeroAjuste";

export default function AjusteAbrirDeGolpe({ valor, onCambiar }: { valor: number; onCambiar: (n: number) => void }) {
  const { t } = useT();
  const porMemoria = useAbrirPorMemoria();
  return (
    <>
      <label className="setting-row setting-switch">
        <span>{t("Abrir de golpe solo las sesiones que quepan en la memoria libre")}</span>
        <input
          type="checkbox"
          checked={porMemoria}
          onChange={(e) => ponerAbrirPorMemoria(e.currentTarget.checked)}
        />
      </label>
      <label className="setting-row">
        {/* Antes se llamaba «Cuántas sesiones abre el botón ⧉», que obliga a
            saberse un símbolo para entender un ajuste. Con la memoria, el número
            es el techo, como el tamaño máximo de la letra automática. */}
        <span>
          {porMemoria ? t("Como mucho, sesiones que abre de golpe un proyecto") : t("Cuántas sesiones abre de golpe un proyecto")}
        </span>
        <input
          type="range"
          min={MIN_ABRIR}
          max={MAX_ABRIR}
          value={valor}
          onChange={(e) => onCambiar(Number(e.currentTarget.value))}
        />
        <NumeroAjuste valor={valor} min={MIN_ABRIR} max={MAX_ABRIR} onCambiar={onCambiar} />
      </label>
    </>
  );
}
