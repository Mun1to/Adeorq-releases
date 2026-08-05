import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import {
  openrouterConnect,
  openrouterForget,
  openrouterInfo,
  type OpenRouterInfo,
} from "../lib/pty";

// La tarjeta de OpenRouter, en el centro de cuentas.
//
// Va aparte de las demás porque es de otra especie: las otras son programas
// instalados que se conectan haciendo login en su propia terminal, y esta es
// una clave que se pega una vez. Lo que sí comparte con ellas es la promesa de
// la pantalla: saber de un vistazo cuánto te queda.
//
// La clave se manda al conectar y no vuelve nunca: vive cifrada en el Gestor de
// Credenciales de Windows y a partir de ahí se piden datos, no la llave. Por eso
// aquí no hay ningún estado que la contenga después de guardarla, y por eso al
// volver a esta pantalla el campo sale vacío aunque estés conectado.

/** Dólares, como los enseña OpenRouter. Cuatro decimales cuando es calderilla:
    con dos, todo lo que has gastado en un día pone $0.00 y parece roto. */
function money(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

export default function OpenRouterCard() {
  const { t } = useT();
  const [info, setInfo] = useState<OpenRouterInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const mirar = () => {
    setCargando(true);
    openrouterInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  };

  useEffect(mirar, []);

  const conectar = () => {
    setGuardando(true);
    setError(null);
    openrouterConnect(clave)
      .then((d) => {
        setInfo(d);
        // El campo se vacía en cuanto la clave está guardada: dejarla escrita
        // en pantalla es dejarla en una captura, y ya no hace falta.
        setClave("");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setGuardando(false));
  };

  const olvidar = () => {
    openrouterForget()
      .then(() => setInfo(null))
      .catch((e) => setError(String(e)));
  };

  return (
    <section className="account-group">
      <h2 className="account-group-title">{t("Por clave")}</h2>
      <div className="panel-grid accounts-grid">
        <article className="panel-card account-card">
          <div className="account-top">
            <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: "#6467f2" }}>
              OR
            </span>
            <span className="account-name">OpenRouter</span>
            {info && (
              <span className="account-plan">
                {info.is_free_tier ? t("gratis") : t("de pago")}
              </span>
            )}
          </div>

          {cargando ? (
            <p className="account-empty">{t("Mirando…")}</p>
          ) : info ? (
            <>
              {/* La etiqueta de la clave es un dato de la cuenta: fuera en
                  emisión, como los correos del resto de la pantalla. */}
              <p className="account-empty stream-hide">{info.label}</p>
              <ul className="or-lines">
                {info.limit_remaining !== null && (
                  <li>
                    <span>{t("Te queda")}</span>
                    <b>{money(info.limit_remaining)}</b>
                  </li>
                )}
                {info.limit === null && (
                  <li>
                    <span>{t("Tope de la clave")}</span>
                    <b>{t("sin tope")}</b>
                  </li>
                )}
                <li>
                  <span>{t("Hoy")}</span>
                  <b>{money(info.usage_daily)}</b>
                </li>
                <li>
                  <span>{t("Esta semana")}</span>
                  <b>{money(info.usage_weekly)}</b>
                </li>
                <li>
                  <span>{t("Este mes")}</span>
                  <b>{money(info.usage_monthly)}</b>
                </li>
              </ul>
              <div className="account-actions">
                <button className="np-btn ghost" onClick={mirar}>
                  {t("Volver a mirar")}
                </button>
                <button className="np-btn ghost" onClick={olvidar}>
                  {t("Olvidar la clave")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="account-empty">
                {t(
                  "Una sola clave y hablas con todos los modelos que tenga OpenRouter. Se guarda cifrada en el Gestor de Credenciales de Windows, nunca en un archivo de ajustes, y no vuelve a salir de ahí: aquí solo se piden los datos de consumo.",
                )}
              </p>
              <input
                className="or-key"
                type="password"
                placeholder="sk-or-v1-…"
                value={clave}
                spellCheck={false}
                onChange={(e) => setClave(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clave.trim()) conectar();
                }}
              />
              <div className="account-actions">
                <button
                  className="np-btn"
                  disabled={!clave.trim() || guardando}
                  onClick={conectar}
                >
                  {guardando ? t("Comprobando…") : t("Conectar")}
                </button>
              </div>
            </>
          )}

          {error && <p className="setting-line setting-bad">⚠ {error}</p>}
        </article>
      </div>
    </section>
  );
}
