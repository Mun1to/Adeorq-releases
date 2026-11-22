// Ajustes › Terminales: si el rojo (te necesita) y el amarillo (terminó) del borde
// de cada terminal parpadean. Apagado de fábrica; el porqué en `lib/parpadeo.ts`.

import { useT } from "../lib/i18n";
import { ponerParpadeo, useParpadeo } from "../lib/parpadeo";

export default function AjusteParpadeo() {
  const { t } = useT();
  const si = useParpadeo();
  return (
    <label className="setting-row setting-switch">
      <span>{t("Que el borde rojo y el amarillo parpadeen")}</span>
      <input type="checkbox" checked={si} onChange={(e) => ponerParpadeo(e.currentTarget.checked)} />
    </label>
  );
}
