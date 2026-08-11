// Las claves de API: la otra forma de pagar lo que consume un CLI.
//
// Una cuenta de las de arriba es un LOGIN: el CLI guarda su sesión y gasta tu
// suscripción. Una clave es lo otro: factura por tokens. Se elige a mano y no
// se adivina, porque la diferencia es dinero. Con suscripción no puedes
// pasarte; con clave sí, y sin verlo.
//
// La clave se pega una vez y no vuelve a salir: se guarda cifrada en el Gestor
// de Credenciales y de aquí en adelante esta pantalla solo sabe sus cuatro
// últimos caracteres, que sirven para reconocer CUÁL pusiste y para nada más.

import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  apiKeyForget,
  apiKeyPut,
  apiKeysEstado,
  guardarModoApi,
  leerModoApi,
  secretosDonde,
  type DondeSecretos,
  type EstadoClave,
} from "../lib/apikeys";
import { comoDinero, gastoLeer, type Gasto } from "../lib/chat";
import { PROVIDERS } from "../lib/providers";
import { useT } from "../lib/i18n";
import ProviderMark, { tieneMarca } from "./ProviderMark";

/** Dónde se saca cada una. Sin esto, «pega tu clave» es un callejón sin salida. */
const DONDE: Record<string, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  codex: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
};

export default function ApiKeysCard() {
  const { t } = useT();
  // Solo los que tienen variable confirmada: ofrecer los demás sería prometer
  // algo que no funcionaría y que encima fallaría en silencio, gastando la
  // suscripción como si nada (ver providers.ts).
  const conApi = PROVIDERS.filter((p) => !!p.apiEnv);
  const [claves, setClaves] = useState<EstadoClave[]>([]);
  const [modo, setModo] = useState<string[]>(() => leerModoApi());
  const [pegando, setPegando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [error, setError] = useState("");
  /** Lo que llevas gastado por API. Es solo lo que ha pasado por los chats de
      Adeorq: lo que gaste un CLI con tu clave lo cuenta su proveedor, y decir
      que es «todo tu gasto» sería mentir sobre dinero. */
  const [gasto, setGasto] = useState<Gasto>({ total: 0, dias: {} });
  /** Dónde acaban las claves en ESTE sistema. Se pregunta a Rust, que es quien
      las guarda: un `#[cfg]` no se puede equivocar de plataforma. */
  const [donde, setDonde] = useState<DondeSecretos>("credenciales");
  useEffect(() => {
    void secretosDonde().then(setDonde);
  }, []);
  // La fecha, en el mismo formato que la escribe Rust.
  const hoy = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    gastoLeer()
      .then(setGasto)
      .catch(() => {});
  }, []);

  const releer = useCallback(() => {
    apiKeysEstado(conApi.map((p) => p.id))
      .then(setClaves)
      .catch((e) => setError(String(e)));
    // conApi se recalcula en cada render pero su contenido es constante: los
    // ids salen de una lista fija del código.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => releer(), [releer]);

  const guardar = async (id: string) => {
    const clave = valor.trim();
    if (!clave) return;
    setError("");
    try {
      await apiKeyPut(id, clave);
      setValor("");
      setPegando(null);
      releer();
    } catch (e) {
      setError(String(e));
    }
  };

  const olvidar = async (id: string) => {
    await apiKeyForget(id).catch((e) => setError(String(e)));
    // Y deja de usarse para abrir: dejarlo marcado sin clave haría que la
    // terminal naciera sin credenciales y sin decir por qué.
    const next = modo.filter((x) => x !== id);
    setModo(next);
    guardarModoApi(next);
    releer();
  };

  const cambiarModo = (id: string, usar: boolean) => {
    const next = usar ? [...new Set([...modo, id])] : modo.filter((x) => x !== id);
    setModo(next);
    guardarModoApi(next);
  };

  return (
    <section className="account-group">
      <h2 className="account-group-title">
        {t("Claves de API")}
        {gasto.total > 0 && (
          <em
            className="account-note"
            data-tip={t(
              "Solo lo gastado por los chats de Adeorq. Lo que gaste un CLI con tu clave lo cuenta su proveedor, no esto.",
            )}
          >
            {comoDinero(gasto.dias[hoy] ?? 0)} {t("hoy")} · {comoDinero(gasto.total)} {t("en total")}
          </em>
        )}
      </h2>
      <p className="card-hint">
        {t(
          "La otra forma de pagar lo que consume un CLI: por tokens en vez de con tu suscripción. Sirve para gastar menos plan en cosas pequeñas, o para seguir trabajando cuando el plan se agota.",
        )}
      </p>
      {/* DÓNDE ACABA LA CLAVE, dicho aquí y sin adornos.
          Esto ponía «se guarda cifrada» en los dos sistemas, y en Linux no hay
          Gestor de Credenciales: es un archivo con permisos 600, que protege de
          otros usuarios de la máquina pero no de otro programa tuyo. Prometer
          cifrado donde no lo hay es lo peor que puede hacer una pantalla que
          pide una clave, así que ahora dice lo que pasa en TU sistema.
          Lo que sí es igual en los dos: la clave no vuelve nunca al front. */}
      <p className="card-hint apikeys-donde" data-seguro={donde === "credenciales"}>
        {donde === "credenciales"
          ? t(
              "Se guarda en el Gestor de Credenciales de Windows, cifrada con tu sesión, y no vuelve a salir: al abrir una terminal la pone Rust justo antes de arrancar el proceso, así que no pasa por la pantalla ni aparece en una captura.",
            )
          : t(
              "En Linux no hay Gestor de Credenciales: se guarda en un archivo tuyo con permisos 600. Eso la protege de otros usuarios del equipo, pero NO de otro programa tuyo. Sí es igual que en Windows lo otro: no vuelve a salir, la pone Rust justo antes de arrancar el proceso.",
            )}
      </p>

      <div className="panel-grid accounts-grid">
        {conApi.map((p) => {
          const tiene = claves.find((c) => c.proveedor === p.id);
          const usando = modo.includes(p.id);
          return (
            <article
              key={p.id}
              className="panel-card account-card"
              style={{ ["--c" as string]: p.hue }}
            >
              <div className="account-top">
                <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: p.hue }}>
                  {tieneMarca(p.id) ? <ProviderMark id={p.id} /> : p.label.slice(0, 2)}
                </span>
                <span className="account-name">{p.label}</span>
                {tiene && <span className="account-badge">···{tiene.cola}</span>}
              </div>

              {pegando === p.id ? (
                <div className="np-row">
                  <input
                    className="finder"
                    type="password"
                    autoFocus
                    placeholder={t("Pega aquí la clave")}
                    value={valor}
                    onChange={(e) => setValor(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void guardar(p.id);
                      else if (e.key === "Escape") {
                        setPegando(null);
                        setValor("");
                      }
                    }}
                  />
                  <button className="np-btn" disabled={!valor.trim()} onClick={() => void guardar(p.id)}>
                    {t("Guardar")}
                  </button>
                </div>
              ) : (
                <>
                  {tiene ? (
                    <label className="api-modo">
                      <input
                        type="checkbox"
                        checked={usando}
                        onChange={(e) => cambiarModo(p.id, e.currentTarget.checked)}
                      />
                      <span>
                        {t(usando ? "Abre con la clave (por tokens)" : "Abre con tu suscripción")}
                      </span>
                    </label>
                  ) : (
                    <p className="account-empty">
                      {t("Sin clave. Con una, este CLI puede abrirse facturando por tokens en vez de gastar tu plan.")}
                    </p>
                  )}
                  <div className="account-actions">
                    <button className="mini" onClick={() => setPegando(p.id)}>
                      {t(tiene ? "Cambiar la clave" : "Pegar una clave")}
                    </button>
                    {DONDE[p.id] && (
                      <button className="mini" onClick={() => void openUrl(DONDE[p.id])}>
                        {t("Sacar una")}
                      </button>
                    )}
                    {tiene && (
                      <button className="mini menu-warn" onClick={() => void olvidar(p.id)}>
                        {t("Olvidarla")}
                      </button>
                    )}
                  </div>
                  <p className="api-var">
                    {t("Nace con")} <code>{p.apiEnv}</code>
                  </p>
                </>
              )}
            </article>
          );
        })}
      </div>
      {error && <p className="side-error">{error}</p>}
    </section>
  );
}
