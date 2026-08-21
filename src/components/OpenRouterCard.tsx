import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { providerOf } from "../lib/providers";
import { DOCS_URL } from "./SettingsView";
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
//
// El vibecoding de aquí abajo reutiliza ESA MISMA clave para abrir una terminal
// de Aider (github.com/Aider-AI/aider) contra el modelo de OpenRouter que
// escribas: es el único CLI de la casa que acepta un modelo de OpenRouter con
// un simple `--model openrouter/<lo-que-sea>`, sin fichero de configuración de
// por medio (comprobado en aider.chat/docs/llms/openrouter.html, 2026-08-20).
// No pasa por `providers.ts`: esa tabla es de programas con su propio login, y
// esto es un CLI cualquiera hablando con una clave que ya vive aquí.

/** Dólares, como los enseña OpenRouter. Cuatro decimales cuando es calderilla:
    con dos, todo lo que has gastado en un día pone $0.00 y parece roto. */
function money(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

/** El modelo que se propone la primera vez: el que trajo esta tarjeta al
    mundo (Munir, 2026-08-20). Las veces siguientes gana el último que usaste. */
const MODELO_POR_DEFECTO = "moonshotai/kimi-k3";
const MODELO_KEY = "adeorq-vibecoding-modelo";

/** Un slug de OpenRouter es `organización/modelo`, a veces con `:variante`
    detrás. Esto se cuela en una línea de cmd.exe sin comillas (ver
    `shellCommand` en lib/comandos.ts), así que se valida el alfabeto ANTES de
    dejarlo salir de esta tarjeta: un modelo mal escrito tiene que devolver
    "OpenRouter no lo conoce", nunca partir el comando por la mitad. */
const MODELO_VALIDO = /^[a-z0-9]([a-z0-9._-]*\/)+[a-z0-9](?:[a-z0-9._:-]*[a-z0-9])?$/i;

interface Props {
  /** Si `aider` está instalado en este equipo. Sin él, el botón instala en vez
      de abrir: una terminal que empieza con "aider: command not found" no
      enseña nada. */
  aiderInstalado: boolean;
  onInstalarAider: () => void;
  onVibecoding: (modelo: string) => void;
}

export default function OpenRouterCard({ aiderInstalado, onInstalarAider, onVibecoding }: Props) {
  const { t } = useT();
  const aider = providerOf("aider");
  const [info, setInfo] = useState<OpenRouterInfo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [modelo, setModelo] = useState(
    () => localStorage.getItem(MODELO_KEY) || MODELO_POR_DEFECTO,
  );
  const [errorModelo, setErrorModelo] = useState<string | null>(null);

  const vibecoding = () => {
    const limpio = modelo.trim();
    if (!MODELO_VALIDO.test(limpio)) {
      setErrorModelo(t("Eso no parece un modelo de OpenRouter (va así: organización/modelo)"));
      return;
    }
    setErrorModelo(null);
    localStorage.setItem(MODELO_KEY, limpio);
    if (aiderInstalado) onVibecoding(limpio);
    else onInstalarAider();
  };

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
      {/* Se llamaba «Por clave», y justo debajo venía «Claves de API»: dos
          títulos que dicen lo mismo, uno detrás de otro, así que la pantalla
          parecía tener la misma sección repetida (Munir, 2026-08-12). Se llama
          por su nombre, que además es lo que distingue: una sola cuenta que
          abre muchos modelos, frente a una clave por proveedor. */}
      <header className="account-intro">
        <h2 className="account-group-title">OpenRouter</h2>
        <p className="card-hint">
          {t(
            "Una sola cuenta para modelos de muchos proveedores, pagando por lo que uses. Va bien para probar uno suelto sin darte de alta en su web.",
          )}
        </p>
      </header>
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

        {/* Solo con la clave puesta: sin ella, abrir la terminal es enseñarle
            a Aider un "OpenRouter dice que esa clave no vale" en vez de un
            campo vacío que explica lo mismo mejor. */}
        {info && (
          <article className="panel-card account-card" style={{ ["--c" as string]: aider.hue }}>
            <div className="account-top">
              <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: aider.hue }}>
                {aider.label.slice(0, 2)}
              </span>
              <span className="account-name">{t("Vibecoding")}</span>
            </div>
            <p className="account-empty">
              {t(
                "Abre una terminal de Aider con esta misma clave, contra el modelo que escribas.",
              )}
            </p>
            {/* La confusión de siempre, escrita aquí porque el botón la evita
                pero abrir Aider a mano no: sin --model coge la primera clave
                que encuentre (Gemini, Anthropic…) y prueba con OTRO
                proveedor, sin tocar OpenRouter. Vista en vivo (Munir,
                2026-08-20): arrancó "aider" a secas y acabó pidiéndole a un
                Gemini que ya no existe. */}
            <p className="card-hint">
              {t(
                "Con el botón no hace falta pensar en esto. Si lo abres a mano: dile siempre el modelo (",
              )}
              <code>aider --model openrouter/…</code>
              {t(") y pon la clave en ")}
              <code>OPENROUTER_API_KEY</code>
              {t(" en esa terminal, o cogerá otra clave que tengas puesta y ni tocará OpenRouter.")}
            </p>
            <input
              className="or-key"
              type="text"
              placeholder={MODELO_POR_DEFECTO}
              value={modelo}
              spellCheck={false}
              onChange={(e) => {
                setModelo(e.currentTarget.value);
                setErrorModelo(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && modelo.trim()) vibecoding();
              }}
            />
            <div className="account-actions">
              <button className="np-btn" disabled={!modelo.trim()} onClick={vibecoding}>
                {aiderInstalado ? t("Abrir terminal") : t("Instalar Aider primero")}
              </button>
              <button
                className="mini"
                onClick={() => void openUrl(`${DOCS_URL}#cuentas`).catch(() => {})}
              >
                {t("Ver cómo se hace")}
              </button>
            </div>
            {errorModelo && <p className="setting-line setting-bad">⚠ {errorModelo}</p>}
          </article>
        )}
      </div>
    </section>
  );
}
