// META 6: the account manager, now for every CLI Adeorq knows.
//
// One account = one config folder. Each CLI keeps its whole identity (login,
// history, settings) in a folder, and one environment variable moves it, so a
// terminal belongs to an account because its PTY was born with that variable.
// The variables live in lib/providers.ts, each one verified on this machine.
//
// What can be shown differs per CLI, and the screen says so instead of faking
// it: Claude hands out its limits for free through `/usage` (a local slash
// command, zero turns), and the others expose nothing local, so theirs read
// "signed in" or "not signed in" and nothing more.
//
// Streaming note: no emails, ever. An account is called whatever Munir types.
import OpenRouterCard from "./OpenRouterCard";
import ApiKeysCard from "./ApiKeysCard";
import { guardarAtajosProv, leerAtajosProv } from "../lib/atajosProveedor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Secciones from "./Secciones";
import {
  IconoAtajo,
  IconoCuentas,
  IconoDescargar,
  IconoLlave,
} from "./IconosSeccion";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  accountReady,
  detectClis,
  mainAccount,
  planInfo,
  usageLimits,
  type Account,
  type Limits,
  type PlanInfo,
} from "../lib/pty";
import { PROVIDERS, providerOf, type Provider } from "../lib/providers";
import { useT } from "../lib/i18n";
import { initials } from "./ProjectAvatar";
import { propsDeVelo } from "../lib/velo";
import ProviderMark, { tieneMarca } from "./ProviderMark";
import {
  RefreshIcon,
} from "./Icons";

interface Info {
  plan: PlanInfo | null;
  limits: Limits | null;
  ready: boolean;
  error: string;
}

interface Props {
  accounts: Account[];
  defaultAccount: string;
  onAdd: (provider: Provider, label: string) => Promise<void>;
  onRename: (id: string, label: string) => void;
  onRemove: (account: Account) => void;
  onSetDefault: (id: string) => void;
  onTerminal: (account: Account) => void;
  /** Abre una terminal que lo descarga y, si al acabar ya se le puede llamar,
      lo arranca para que hagas el login ahí mismo. */
  onInstall: (provider: Provider) => void;
}

/** "Current week (all models)" does not fit a row. */
function shortLabel(label: string): string {
  const inside = label.match(/\(([^)]+)\)/)?.[1];
  if (/session/i.test(label)) return "sesión";
  if (inside && /all models/i.test(inside)) return "semana";
  if (inside) return `semana · ${inside}`;
  return label.replace(/^current\s+/i, "");
}

/** Lo que se puede poner en la fila de un proyecto: los CLIs que Adeorq sabe
    abrir, más la terminal pelada, que ya no está de fábrica pero puede volver
    si a alguien le sirve. Se listan aquí y no se sacan de PROVIDERS enteros
    porque no todos los de ese catálogo se abren en una terminal. */
const ATAJOS_POSIBLES: Array<{ id: string; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "agy", label: "Antigravity" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "gemini", label: "Gemini" },
  { id: "qwen", label: "Qwen" },
  { id: "copilot", label: "Copilot" },
  { id: "crush", label: "Crush" },
  { id: "shell", label: "PowerShell" },
];

/** El color de cada chip. PowerShell no es un proveedor de PROVIDERS, así que
    sin esto heredaría el naranja de Claude, que es a donde cae providerOf(). */
function tonoDe(id: string): string {
  return id === "shell" ? "#5391fe" : providerOf(id).hue;
}

export default function AccountsView({
  accounts,
  defaultAccount,
  onAdd,
  onRename,
  onRemove,
  onSetDefault,
  onTerminal,
  onInstall,
}: Props) {
  const { t } = useT();
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [atajosProv, setAtajosProv] = useState<string[]>(() => leerAtajosProv());
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahi un arrastre. */
  const bajoEnVelo = useRef(false);

  const allOf = useCallback(
    (p: Provider): Account[] => [
      mainAccount(p.id),
      ...accounts.filter((a) => a.provider === p.id),
    ],
    [accounts],
  );

  /**
   * Cómo se llama una cuenta en pantalla.
   *
   * La de casa de cada CLI se llama por su CLI. `mainAccount` las titula todas
   * «Principal», y con nueve programas instalados eso son nueve tarjetas con el
   * mismo nombre, que no distinguen nada (Munir, 2026-07-31). Se resuelve aquí
   * y no en `mainAccount` porque ese label también viaja a los títulos de
   * terminal y a la barra lateral, donde «Principal» sí dice lo que tiene que
   * decir; esto es solo cómo se presenta en esta pantalla.
   */
  const nombreDe = useCallback((acc: Account): string => {
    if (acc.dir) return acc.label; // una cuenta añadida ya tiene nombre propio
    return providerOf(acc.provider).label;
  }, []);

  /** Las tres respuestas por las que se abre esta pantalla, sacadas de lo que
      ya se ha leído: cuántas cuentas responden, cuál es la que peor va de
      cuota y con cuál nacen las terminales. */
  const resumen = useMemo(() => {
    const vistos = Object.values(info);
    const conectadas = vistos.filter((i) => i.ready).length;
    let peor: number | null = null;
    let peorCuenta = "";
    for (const [id, i] of Object.entries(info)) {
      for (const l of i.limits?.lines ?? []) {
        if (peor == null || l.percent > peor) {
          peor = l.percent;
          const acc = PROVIDERS.flatMap(allOf).find((a) => a.id === id);
          peorCuenta = acc ? `${nombreDe(acc)} · ${shortLabel(l.label)}` : shortLabel(l.label);
        }
      }
    }
    const suya = PROVIDERS.flatMap(allOf).find((a) => a.id === defaultAccount);
    const porDefecto = suya ? nombreDe(suya) : "";
    return {
      conectadas,
      programas: installed?.size ?? 0,
      peor,
      peorCuenta,
      porDefecto,
    };
  }, [info, installed, defaultAccount, allOf, nombreDe]);

  const load = useCallback(
    async (ids: Set<string>) => {
      setBusy(true);
      for (const p of PROVIDERS) {
        if (!ids.has(p.id)) continue;
        for (const acc of allOf(p)) {
          const ready = await accountReady(acc.dir, p.creds, p.homeDir).catch(() => false);
          // Only Claude publishes anything readable without spending quota.
          const plan = p.usage ? await planInfo(acc.dir || undefined).catch(() => null) : null;
          let limits: Limits | null = null;
          let err = "";
          if (ready && p.usage) {
            limits = await usageLimits(acc.dir || undefined).catch((e) => {
              err = String(e);
              return null;
            });
          }
          setInfo((prev) => ({ ...prev, [acc.id]: { plan, limits, ready, error: err } }));
        }
      }
      setBusy(false);
    },
    [allOf],
  );

  /** Vuelve a mirar qué CLIs hay en el equipo y relee sus límites. Es lo que
      hace falta después de instalar uno: aparece sin reiniciar la app. */
  const detectar = useCallback(() => {
    setError("");
    detectClis(PROVIDERS.map((p) => [p.id, p.exe] as [string, string]))
      .then((found) => {
        const ids = new Set(found.map((f) => f.id));
        setInstalled(ids);
        void load(ids);
      })
      .catch((e) => setError(String(e)));
  }, [load]);

  useEffect(() => {
    detectar();
    // Re-reads when an account is added or removed; opening the tab is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const add = (p: Provider) => {
    const name = label.trim();
    if (!name) return;
    setLabel("");
    setAdding(null);
    setError("");
    onAdd(p, name).catch((e: Error) => setError(e.message ?? String(e)));
  };

  const card = (p: Provider, acc: Account) => {
    const it = info[acc.id];
    const isDefault = acc.id === defaultAccount;
    const isMain = !acc.dir;
    return (
      <article
        key={acc.id}
        className="panel-card account-card"
        data-default={isDefault}
        style={{ ["--c" as string]: p.hue }}
      >
        <div className="account-top">
          {/* La marca del programa en la cuenta de casa, y las iniciales solo en
              las que tú has creado. Con `initials(acc.label)` salía «Pr» en
              todas, de «Principal», que es la misma pista para nueve tarjetas
              distintas. */}
          <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: p.hue }}>
            {isMain && tieneMarca(p.id) ? <ProviderMark id={p.id} /> : initials(nombreDe(acc))}
          </span>
          {/* «Principal» a secas se repetía en cada CLI y no distinguía nada:
              con nueve instalados eran nueve tarjetas con el mismo título. La
              cuenta de casa de cada programa se llama por su programa. */}
          {renaming === acc.id ? (
            <input
              className="finder account-rename"
              autoFocus
              defaultValue={acc.label}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRename(acc.id, e.currentTarget.value.trim());
                  setRenaming(null);
                } else if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={(e) => {
                onRename(acc.id, e.currentTarget.value.trim());
                setRenaming(null);
              }}
            />
          ) : (
            <span className="account-name stream-hide">{nombreDe(acc)}</span>
          )}
          {it?.plan?.subscription && <span className="account-plan">{it.plan.subscription}</span>}
          {isDefault && (
            <span className="account-badge" data-tip={t("Las terminales nuevas usan esta")}>
              {t("predeterminada")}
            </span>
          )}
          {/* El estado, donde se busca: arriba y a la derecha. Antes había que
              leer el párrafo de dentro para saber si esa cuenta responde. */}
          <span className="account-state" data-ok={it?.ready === true} data-off={it?.ready === false}>
            {it == null ? "…" : it.ready ? t("conectada") : t("sin conectar")}
          </span>
        </div>

        {p.creds.length === 0 ? (
          // Not every CLI writes a file that means "signed in", and inventing
          // one would show a wrong answer with total confidence.
          <p className="account-empty">
            {t("Instalado. De este programa no sé leer si has iniciado sesión, así que ábrelo y te lo dirá él.")}
          </p>
        ) : it && !it.ready ? (
          <p className="account-empty">
            {t("Sin conectar todavía. Abre una terminal aquí y haz el login.")}
          </p>
        ) : !p.usage ? (
          <p className="account-empty">
            {it ? t("Conectada.") : "…"}{" "}
            {t("Este CLI no publica su consumo en el equipo, así que no hay barras que enseñar.")}
          </p>
        ) : (
          <div className="account-limits">
            {(it?.limits?.lines ?? []).map((l) => (
              <div key={l.label} className="limit" data-tip={`${l.label}: ${l.percent}%`}>
                <div className="limit-top">
                  <span className="limit-label">{shortLabel(l.label)}</span>
                  <strong data-hot={l.percent >= 80}>{l.percent}%</strong>
                </div>
                <span className="limit-track">
                  <span
                    className="limit-fill"
                    data-hot={l.percent >= 80}
                    style={{ width: `${Math.min(100, l.percent)}%` }}
                  />
                </span>
                {l.resets && (
                  <div className="limit-reset">
                    {t("se renueva")} {l.resets.replace(/\s*\([^)]*\)\s*$/, "")}
                  </div>
                )}
              </div>
            ))}
            {!it && <p className="account-empty">{t("Preguntando a Claude…")}</p>}
            {it?.error && <p className="account-empty">{it.error}</p>}
          </div>
        )}

        <div className="account-actions">
          <button className="mini" onClick={() => onTerminal(acc)}>
            {t("Terminal con esta")}
          </button>
          {!isDefault && p.id === "claude" && (
            <button className="mini" onClick={() => onSetDefault(acc.id)}>
              {t("Usar por defecto")}
            </button>
          )}
          {!isMain && (
            <>
              <button className="mini" onClick={() => setRenaming(acc.id)}>
                {t("Renombrar")}
              </button>
              <button className="mini menu-warn" onClick={() => setConfirm(acc)}>
                {t("Quitar")}
              </button>
            </>
          )}
        </div>
      </article>
    );
  };

  const missing = PROVIDERS.filter((p) => installed && !installed.has(p.id));

  return (
    <div className="panel accounts">
      <header className="panel-hero accounts-hero">
        <div>
          <h1>{t("Cuentas")}</h1>
          <p>
            {t(
              "Cada cuenta es un login aparte del mismo CLI, con su propia carpeta. Las terminales nuevas de Claude nacen con la que marques como predeterminada.",
            )}
          </p>
        </div>
        <button
          className="mini"
          disabled={busy}
          data-tip={t("Buscar otra vez qué hay instalado y releer los límites (no gasta cuota)")}
          onClick={detectar}
        >
          {busy ? "…" : <RefreshIcon size={13} />}
        </button>
      </header>

      {/* El estado de un vistazo, antes de la lista.
          Esta pantalla se abre por dos motivos: para ver cuánto queda de cuota
          y para cambiar de cuenta. Los dos obligaban a bajar leyendo tarjeta
          por tarjeta, porque nueve tarjetas iguales que dicen todas «Principal»
          no se distinguen de lejos. Aquí arriba está la respuesta. */}
      <div className="accounts-summary">
        <div className="stat-card">
          <span className="stat-num">{resumen.conectadas}</span>
          <span className="stat-label">{t("cuentas conectadas")}</span>
          <span className="stat-foot">
            {t("de {n} programas instalados", { n: resumen.programas })}
          </span>
        </div>
        <div className="stat-card" data-hot={resumen.peor != null && resumen.peor >= 80}>
          <span className="stat-num">{resumen.peor != null ? `${resumen.peor}%` : "—"}</span>
          <span className="stat-label">{t("el límite más apretado")}</span>
          <span className="stat-foot">
            {resumen.peorCuenta || t("todavía preguntando…")}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-num stat-nombre">{resumen.porDefecto || "—"}</span>
          <span className="stat-label">{t("la predeterminada")}</span>
          <span className="stat-foot">{t("con la que nacen las terminales nuevas")}</span>
        </div>
      </div>

      {error && <p className="side-error">{error}</p>}

      <Secciones
        memoria="adeorq-cuentas-seccion"
        secciones={[
          {
            id: "cuentas",
            label: "Tus cuentas",
            icon: <IconoCuentas />,
            badge: resumen.conectadas || "",
          },
          { id: "claves", label: "Claves de API", icon: <IconoLlave /> },
          { id: "atajos", label: "Atajos", icon: <IconoAtajo />, badge: atajosProv.length || "" },
          {
            id: "faltan",
            label: "No instalados",
            icon: <IconoDescargar />,
            badge: missing.length || "",
          },
        ]}
      >
        {(activa) => (
          <>
            {activa === "cuentas" && <SeccionCuentas />}
            {activa === "claves" && (
              <>
                <OpenRouterCard />
                <ApiKeysCard />
              </>
            )}
            {activa === "atajos" && <SeccionAtajos />}
            {activa === "faltan" && <SeccionFaltan />}
          </>
        )}
      </Secciones>

      {confirm && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setConfirm(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Quitar cuenta")}</h3>
            <p className="modal-text">
              «{confirm.label}» ({providerOf(confirm.provider).label}) se cerrará y se
              borrará su carpeta de configuración, con su historial. Tu cuenta de siempre y
              tus proyectos no se tocan. Para volver a usarla habría que hacer el login otra vez.
            </p>
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setConfirm(null)}>
                {t("Cancelar")}
              </button>
              <button
                className="np-btn"
                onClick={() => {
                  onRemove(confirm);
                  setConfirm(null);
                }}
              >
                {t("Quitar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function SeccionCuentas() {
    return (
      <>
      {/* Envuelto para poder repartir los CLIs en columnas cuando hay pantalla
          de sobra: con seis instalados, uno debajo de otro obligaba a hacer
          scroll con media ventana vacía al lado. */}
      <div className="accounts-groups">
      {PROVIDERS.filter((p) => installed?.has(p.id)).map((p) => (
        <section key={p.id} className="account-group">
          <h2 className="account-group-title">
            {/* Su marca en lugar del punto de color de antes: doce puntos de
                doce colores no dicen cuál es cuál sin leer el nombre. */}
            {tieneMarca(p.id) ? (
              <span className="account-dot account-dot-marca" style={{ color: p.hue }}>
                <ProviderMark id={p.id} />
              </span>
            ) : (
              <span className="account-dot" style={{ background: p.hue }} />
            )}
            {p.label}
            {!p.envVar && (
              <em
                className="account-note"
                data-tip={t(
                  "No he encontrado forma de moverle la carpeta de configuración, así que solo puede tener una cuenta.",
                )}
              >
                {t("una sola cuenta")}
              </em>
            )}
          </h2>
          <div className="panel-grid accounts-grid">
            {allOf(p).map((acc) => card(p, acc))}

            {p.envVar &&
              (adding === p.id ? (
                <article className="panel-card account-card account-new">
                  <input
                    className="finder"
                    autoFocus
                    placeholder={t("Cómo la llamas (p. ej. Trabajo). Nunca tu correo.")}
                    value={label}
                    onChange={(e) => setLabel(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add(p);
                      else if (e.key === "Escape") setAdding(null);
                    }}
                  />
                  <p className="account-empty">
                    {t("Se crea una carpeta suya y se abre una terminal para que hagas el login. Tu cuenta de siempre no se toca.")}
                  </p>
                  <div className="account-actions">
                    <button className="np-btn" disabled={!label.trim()} onClick={() => add(p)}>
                      {t("Crear")}
                    </button>
                    <button className="mini" onClick={() => setAdding(null)}>
                      {t("Cancelar")}
                    </button>
                  </div>
                </article>
              ) : (
                <button
                  className="panel-card account-add"
                  onClick={() => {
                    setLabel("");
                    setAdding(p.id);
                  }}
                >
                  <span className="account-plus">+</span>
                  {t("Añadir cuenta")}
                </button>
              ))}
          </div>
        </section>
      ))}
      </div>
      <p className="accounts-note">
        {t(
          "Varias cuentas TUYAS, sin problema. Turnarte cuentas de otras personas para estirar los límites incumple los términos de Anthropic y lo que te juegas es el cierre de la cuenta.",
        )}
      </p>
      </>
    );
  }

  function SeccionAtajos() {
    return (
      /* Qué se puede abrir de un clic desde cada proyecto. Vive aquí y no en
         Ajustes porque va de CON QUÉ trabajas, que es de lo que trata esta
         pantalla entera. */
      <section className="panel-card">
        <h2>{t("Atajos en tus proyectos")}</h2>
        <p className="card-hint atajos-prov-hint">
          {t(
            "Los botones que salen al pasar el ratón por un proyecto en la barra lateral. Elige los que uses de verdad: los demás siguen estando en el clic derecho, que los lista todos.",
          )}
        </p>
        <div className="chip-row">
          {ATAJOS_POSIBLES.map((p) => {
            const puesto = atajosProv.includes(p.id);
            return (
              <button
                key={p.id}
                className="choice choice-prov"
                style={{ ["--c" as string]: tonoDe(p.id) }}
                data-on={puesto}
                onClick={() => {
                  // Se quita, o se añade AL FINAL: el orden de la fila es el
                  // orden en que los fuiste eligiendo, que es el único que
                  // significa algo para ti.
                  const next = puesto
                    ? atajosProv.filter((x) => x !== p.id)
                    : [...atajosProv, p.id];
                  setAtajosProv(next);
                  guardarAtajosProv(next);
                }}
              >
                {tieneMarca(p.id) && <ProviderMark id={p.id} />}
                {p.label}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function SeccionFaltan() {
    if (missing.length === 0) {
      return (
        <section className="panel-card">
          <h2>{t("No instalados")}</h2>
          <p className="card-hint">
            {t("Los tienes todos. No queda ningún programa de la lista por instalar.")}
          </p>
        </section>
      );
    }
    return (
      <>
        <section className="account-group">
          <div className="panel-grid accounts-grid">
            {missing.map((p) => (
              <article key={p.id} className="panel-card account-card account-missing">
                <div className="account-top">
                  <span className="pavatar" data-plate="tint" style={{ ["--c" as string]: p.hue }}>
                    {tieneMarca(p.id) ? <ProviderMark id={p.id} /> : initials(p.label)}
                  </span>
                  <span className="account-name">{p.label}</span>
                </div>
                {p.cmd ? (
                  <p className="account-empty">
                    {t("No está en este equipo. El botón abre una terminal y lo descarga con")}{" "}
                    <code>{p.cmd}</code>.{" "}
                    {t("No te pide ninguna cuenta: solo lo deja instalado, y ya decidirás si lo usas.")}
                  </p>
                ) : (
                  <p className="account-empty">
                    {t("No está en este equipo y no tiene un comando de instalación de fiar, así que hay que bajarlo de su web:")}{" "}
                    <code>{p.install}</code>
                  </p>
                )}
                <div className="account-actions">
                  {p.cmd && (
                    <button className="np-btn" onClick={() => onInstall(p)}>
                      {t("Descargar")}
                    </button>
                  )}
                  {p.web && (
                    <button
                      className="mini"
                      onClick={() => void openUrl(p.web ?? "").catch(() => {})}
                    >
                      {t("Abrir su web")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="accounts-note">
            {t("Cuando termine la instalación, vuelve aquí y dale a ↻: el que acabe de aparecer se coloca solo con los demás.")}
          </p>
        </section>
      </>
    );
  }
}
