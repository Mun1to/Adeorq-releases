// Opening a session by hand, in two steps: where, and with what.
//
// The Foreman already opens terminals, but it decides for you: you describe a
// job and it picks the folder, the tool and how many agents. This is the other
// half, and the one that was missing from the cockpit: you point at a folder
// and you say what runs there. No prompt, no model reading your mind.
//
// Both entrances land here, the ＋ on the rail and the empty cockpit, because
// having to walk to the Dashboard to start something was the actual complaint.

import { useEffect, useMemo, useRef, useState } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import {
  createProject,
  detectClis,
  findAgy,
  listProjects,
  mainAccount,
  type Account,
  type Project,
} from "../lib/pty";
import { raiz } from "../lib/perfil";
import { PROVIDERS, providerOf } from "../lib/providers";
import { useT } from "../lib/i18n";
import ProjectAvatar from "./ProjectAvatar";
import { propsDeVelo } from "../lib/velo";
import { ClaudeMark } from "./KindIcon";

/** Everything needed to open one terminal, once both steps are answered. */
export interface Launch {
  /** Project name, for the pane's title. */
  name: string;
  cwd: string;
  /** "shell" for a plain PowerShell; otherwise a provider id. */
  provider: string;
  /** Claude only, and only when it is not the one he already has set. */
  model?: string;
  /** Claude only: nace en modo plan (mira y propone, no toca nada) sin tocar
      el modo por defecto de Ajustes, que sigue siendo el de todas las demás. */
  plan?: boolean;
  account?: Account;
  /** How many of them, placed in a grid: the wall of terminals in one go. */
  count: number;
}

interface Props {
  accounts: Account[];
  /** Ceiling from Settings: never offer more terminals than he allows. */
  maxPanes: number;
  /** Where to start looking, so the wizard opens on the project he is in. */
  suggested?: string | null;
  onLaunch: (launch: Launch) => void;
  onClose: () => void;
}

/**
 * The aliases Claude Code's own --help names, plus haiku, checked against the
 * CLI on this machine on 2026-07-26. "" means the one he already has set: the
 * wizard has no business overriding a choice made in /model.
 */
const MODELS: Array<[string, string]> = [
  ["", "El de siempre"],
  ["fable", "Fable"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
];

/** Same folder rule as create_project in Rust, so it fails here, not there. */
const NAME_OK = /^[a-zA-Z0-9 ._-]+$/;

export default function NewSession({
  accounts,
  maxPanes,
  suggested,
  onLaunch,
  onClose,
}: Props) {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState("");
  const [place, setPlace] = useState<{ name: string; path: string; suelta?: boolean } | null>(
    null,
  );
  /** Tu carpeta de usuario: es el «sitio» de una sesión suelta. Se pide al
      abrir, y si no se pudiera, el botón de suelta no se ofrece en vez de
      ofrecerse y fallar al pulsarlo. */
  const [casa, setCasa] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [count, setCount] = useState(1);
  const [agy, setAgy] = useState<string | null>(null);
  const [clis, setClis] = useState<string[]>([]);
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahi un arrastre. */
  const bajoEnVelo = useRef(false);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        // Opening on the project he is already in saves the usual first click.
        if (suggested) {
          const hit = list.find((p) => p.name === suggested);
          if (hit) setPlace({ name: hit.name, path: hit.path });
        }
      })
      .catch((e) => setError(String(e)));
    findAgy().then(setAgy).catch(() => {});
    homeDir()
      .then((h) => setCasa(h.replace(/[\\/]+$/, "")))
      .catch(() => {});
    detectClis(PROVIDERS.map((p) => [p.id, p.exe] as [string, string]))
      .then((found) => setClis(found.map((c) => c.id)))
      .catch(() => {});
  }, [suggested]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, filter]);

  /** Which accounts make sense for the tool that is selected. */
  const usable = useMemo(
    () => accounts.filter((a) => a.provider === provider),
    [accounts, provider],
  );

  const chosenAccount =
    accountId && accountId !== "main"
      ? usable.find((a) => a.id === accountId)
      : undefined;

  const browse = () => {
    pickFolder({ directory: true, defaultPath: raiz(), title: t("Elige la carpeta") })
      .then((path) => {
        if (typeof path !== "string") return;
        const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
        setPlace({ name, path });
        setError(null);
      })
      .catch((e) => setError(String(e)));
  };

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    if (!NAME_OK.test(name)) {
      setError(t("Usa solo letras, números, espacios, guiones o puntos"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await createProject(name);
      setPlace({ name: p.name, path: p.path });
      setCreating(false);
      setNewName("");
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const launch = () => {
    if (!place) return;
    onLaunch({
      name: place.name,
      cwd: place.path,
      provider,
      model: provider === "claude" && model ? model : undefined,
      plan: provider === "claude" && planMode ? true : undefined,
      account: chosenAccount,
      count,
    });
  };

  // PowerShell always; Claude and Antigravity when they are there; then
  // whatever else turned up on the PATH. Nothing offered that cannot run.
  const tools = useMemo(() => {
    const list: Array<{ id: string; label: string }> = [];
    if (clis.includes("claude")) list.push({ id: "claude", label: "Claude Code" });
    list.push({ id: "shell", label: "PowerShell" });
    if (agy) list.push({ id: "agy", label: "Antigravity (agy)" });
    for (const id of clis) {
      if (id === "claude" || id === "agy") continue;
      list.push({ id, label: providerOf(id).label });
    }
    return list;
  }, [clis, agy]);

  const toolLabel = tools.find((x) => x.id === provider)?.label ?? provider;

  return (
    <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, onClose)}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <header className="wiz-head">
          <h3 className="modal-title">{t("Abrir una sesión")}</h3>
          <span className="wiz-steps">
            <span className="wiz-pip" data-on={true} onClick={() => setStep(1)}>
              1 · {t("Dónde")}
            </span>
            <span className="wiz-pip" data-on={step === 2} onClick={() => place && setStep(2)}>
              2 · {t("Con qué")}
            </span>
          </span>
        </header>

        {step === 1 ? (
          <>
            <p className="modal-text modal-dim">
              {t("La carpeta donde va a trabajar. Puede ser una que ya tengas, una del disco o una nueva.")}
            </p>
            <input
              className="finder"
              placeholder={t("Filtrar proyectos")}
              value={filter}
              autoFocus
              onChange={(e) => setFilter(e.currentTarget.value)}
            />
            <ul className="wiz-list">
              {shown.map((p) => (
                <li key={p.path}>
                  <button
                    className="wiz-item"
                    data-on={place?.path === p.path}
                    onClick={() => {
                      setPlace({ name: p.name, path: p.path });
                      setStep(2);
                    }}
                  >
                    <ProjectAvatar name={p.name} />
                    <span className="wiz-item-name">{p.name}</span>
                    {p.hasGit && <span className="wiz-git">git</span>}
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="wiz-none">
                  {/* Sin ningún proyecto todavía la lista vacía parecía un
                      fallo de búsqueda. Aquí no falta nada: es que se trabaja
                      con carpetas sueltas hasta que decidas lo contrario. */}
                  {projects.length === 0 && !filter.trim()
                    ? t("Todavía no hay proyectos. Abre una carpeta del disco o una suelta.")
                    : t("Ningún proyecto con ese nombre.")}
                </li>
              )}
            </ul>
            {creating ? (
              <div className="np-row">
                <input
                  className="finder"
                  placeholder={t("Nombre del proyecto nuevo")}
                  value={newName}
                  autoFocus
                  onChange={(e) => setNewName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                    else if (e.key === "Escape") setCreating(false);
                  }}
                />
                <button className="np-btn" disabled={busy || !newName.trim()} onClick={() => void create()}>
                  {busy ? t("Creando…") : t("Crear")}
                </button>
              </div>
            ) : (
              <div className="wiz-row">
                <button className="mini wiz-alt" onClick={browse}>
                  {t("📁 Otra carpeta del disco…")}
                </button>
                <button className="mini wiz-alt" onClick={() => setCreating(true)}>
                  {t("＋ Proyecto nuevo…")}
                </button>
                {/* Sin proyecto: una terminal para lo de ahora mismo, que no es
                    de ningún proyecto y no tiene por qué inventarse uno. Nace en
                    tu carpeta de usuario, y como esa no está en C:\proyectos, la
                    barra lateral la pone sola en SUELTAS (Munir, 2026-07-30). */}
                {casa && (
                  <button
                    className="mini wiz-alt"
                    data-tip={casa}
                    onClick={() => {
                      setPlace({ name: t("suelta"), path: casa, suelta: true });
                      setStep(2);
                    }}
                  >
                    {t("↯ Suelta, sin proyecto")}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="modal-text modal-dim">
              {place?.suelta ? (
                <>
                  {t("Qué se abre, suelto y sin proyecto, en")} <strong>{place.path}</strong>.
                </>
              ) : (
                <>
                  {t("Qué se abre en")} <strong>{place?.name}</strong>.
                </>
              )}
            </p>
            <div className="chip-row">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  className="choice"
                  data-on={provider === tool.id}
                  onClick={() => {
                    setProvider(tool.id);
                    setAccountId("");
                  }}
                >
                  {tool.id === "claude" && <ClaudeMark />}
                  {tool.label}
                </button>
              ))}
            </div>

            {provider === "claude" && (
              <>
                <p className="wiz-label">{t("Modelo")}</p>
                <div className="chip-row">
                  {MODELS.map(([id, label]) => (
                    <button
                      key={id || "default"}
                      className="choice"
                      data-on={model === id}
                      onClick={() => setModel(id)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="card-hint">
                  {t("«El de siempre» respeta el que tengas puesto con /model. Dentro de la sesión se cambia igual, cuando quieras.")}
                </p>

                <p className="wiz-label">{t("Cómo empieza")}</p>
                <div className="chip-row">
                  <button
                    className="choice"
                    data-on={!planMode}
                    onClick={() => setPlanMode(false)}
                  >
                    {t("Normal")}
                  </button>
                  <button
                    className="choice"
                    data-on={planMode}
                    onClick={() => setPlanMode(true)}
                  >
                    {t("Modo plan")}
                  </button>
                </div>
                <p className="card-hint">
                  {t(
                    "En modo plan, Claude no toca nada: enseña un plan y espera tu OK antes de tocar el código. «Normal» abre con el modo que tengas puesto en Ajustes › Terminales.",
                  )}
                </p>
              </>
            )}

            {usable.length > 0 && (
              <>
                <p className="wiz-label">{t("Cuenta")}</p>
                <div className="chip-row">
                  <button
                    className="choice"
                    data-on={!chosenAccount}
                    onClick={() => setAccountId("main")}
                  >
                    {mainAccount(provider).label}
                  </button>
                  {usable.map((a) => (
                    <button
                      key={a.id}
                      className="choice"
                      data-on={accountId === a.id}
                      onClick={() => setAccountId(a.id)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="wiz-label">{t("Cuántas a la vez")}</p>
            <div className="chip-row">
              {[1, 2, 4, 6, 9].filter((n) => n <= maxPanes).map((n) => (
                <button
                  key={n}
                  className="choice"
                  data-on={count === n}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
              {/* And any other number, up to his ceiling: the shortcuts are the
                  common cases, not the whole answer. */}
              <span className="count-any">
                <input
                  className="finder count-input"
                  type="number"
                  min={1}
                  max={maxPanes}
                  value={count}
                  onChange={(e) => {
                    const n = Number(e.currentTarget.value);
                    if (Number.isFinite(n)) {
                      setCount(Math.max(1, Math.min(Math.trunc(n), maxPanes)));
                    }
                  }}
                />
                <span className="count-max">{t("hasta {n}", { n: maxPanes })}</span>
              </span>
            </div>
            <p className="card-hint">
              {t(
                "Más de una abre ese número de terminales en la misma carpeta, cada una con su propia conversación, y las coloca en rejilla. Si ya tenías terminales abiertas, estas se suman sin recolocar las tuyas.",
              )}
            </p>

            <p className="wiz-summary">
              {count === 1
                ? t("Se abrirá {tool} en {path}", { tool: toolLabel, path: place?.path ?? "" })
                : t("Se abrirán {n} {tool} en {path}", {
                    n: count,
                    tool: toolLabel,
                    path: place?.path ?? "",
                  })}
              {provider === "claude" && model ? ` · ${model}` : ""}
              {provider === "claude" && planMode ? ` · ${t("modo plan")}` : ""}
              {chosenAccount ? ` · ${chosenAccount.label}` : ""}
            </p>
          </>
        )}

        {error && <p className="np-err">{error}</p>}

        <div className="modal-actions">
          <button className="mini modal-cancel" onClick={step === 2 ? () => setStep(1) : onClose}>
            {step === 2 ? t("Atrás") : t("Cancelar")}
          </button>
          {step === 1 ? (
            <button className="np-btn" disabled={!place} onClick={() => setStep(2)}>
              {t("Siguiente")}
            </button>
          ) : (
            <button className="np-btn" onClick={launch}>
              {count === 1 ? t("Abrir") : t("Abrir las {n}", { n: count })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
