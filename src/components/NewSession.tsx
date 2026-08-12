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
  loadUiState,
  mainAccount,
  ollamaModels,
  scanSessions,
  type Account,
  type Project,
  type SessionInfo,
} from "../lib/pty";
import { porQueSale } from "../lib/enLaBarra";
import { raiz } from "../lib/perfil";
import { PROVIDERS, providerOf } from "../lib/providers";
import { useT } from "../lib/i18n";
import { encaja } from "../lib/buscar";
import ProjectAvatar from "./ProjectAvatar";
import ProviderMark, { tieneMarca } from "./ProviderMark";
import { propsDeVelo } from "../lib/velo";
import { ClaudeMark } from "./KindIcon";
import { ChevronIcon, FolderIcon, RefreshIcon, UnlinkIcon } from "./Icons";

/** Everything needed to open one terminal, once both steps are answered. */
export interface Launch {
  /** Project name, for the pane's title. */
  name: string;
  cwd: string;
  /** "shell" for a plain PowerShell; otherwise a provider id. */
  provider: string;
  /** Claude only, and only when it is not the one he already has set. */
  model?: string;
  /** Con qué modelo de casa se abre el chat, cuando el elegido es «ollama».
   *  Vacío nunca: si no hay ninguno descargado, esa opción no se ofrece. */
  localModel?: string;
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
  /** Las que YA están en un panel de Adeorq. Salen marcadas y no se pueden
      elegir: abrir dos veces la misma conversación bloquea a las dos. */
  yaAbiertas: Set<string>;
  /** Retomar las que ya tienes, todas de una tacada. Lo hace App, que es quien
      sabe cuáles están ya abiertas y cómo colocarlas en el mosaico. */
  onRetomar: (sesiones: SessionInfo[]) => void;
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
  yaAbiertas,
  onLaunch,
  onRetomar,
  onClose,
}: Props) {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2 | "retomar">(1);
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
  /** Los modelos que tienes descargados en este equipo. Lista vacía = Ollama no
   *  está escuchando, que no es un fallo: es que ahora no lo tienes abierto. */
  const [locales, setLocales] = useState<string[]>([]);
  const [local, setLocal] = useState("");
  /** Si `ollama` está en el PATH. Distinto de tener modelos: se puede tener el
   *  programa y ninguno descargado, y ahí lo útil es decirlo, no esconderlo. */
  const [tieneLocal, setTieneLocal] = useState(false);
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahi un arrastre. */
  const bajoEnVelo = useRef(false);

  /* --------------------------------------------------- retomar las que tienes
   *
   * El asistente sabía abrir cosas NUEVAS y nada más. Retomar una conversación
   * ya empezada solo se podía hacer buscándola a ojo en la barra lateral, de una
   * en una, y con un filtro que ni siquiera perdona una tilde.
   *
   * Aquí salen TODAS, incluidas las de hace más de una semana: `scan_sessions`
   * las devuelve, pero las cuatro pantallas que las pintan las descartan por
   * viejas, así que hasta ahora no había forma de llegar a ellas desde la app. */
  const [sesiones, setSesiones] = useState<SessionInfo[] | null>(null);
  /** Las que ya trajiste a mano a la barra (`ui.traidas`). Ver `irARetomar`. */
  const [traidas, setTraidas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

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
    // Ollama va en la misma detección que los demás: se busca su ejecutable en
    // el PATH, no si tiene modelos. Son dos preguntas distintas y confundirlas
    // escondía la opción entera a quien lo tiene instalado y todavía no se ha
    // bajado ninguno, que es exactamente el caso de Munir (2026-08-09).
    detectClis([
      ...PROVIDERS.map((p) => [p.id, p.exe] as [string, string]),
      ["ollama", "ollama"] as [string, string],
    ])
      .then((found) => {
        const ids = found.map((c) => c.id);
        setClis(ids.filter((id) => id !== "ollama"));
        setTieneLocal(ids.includes("ollama"));
      })
      .catch(() => {});
    // Y qué modelos hay descargados. Falla en silencio y hacia el lado bueno,
    // igual que el resto de Ollama en esta app.
    ollamaModels()
      .then((m) => {
        setLocales(m);
        setLocal((prev) => prev || m[0] || "");
      })
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

  /** Se pide al entrar en la pantalla, no al abrir el asistente: un escaneo
      recorre el historial de tres CLIs y no tiene por qué pagarlo quien solo
      venía a abrir una terminal. */
  const irARetomar = () => {
    setStep("retomar");
    if (sesiones) return;
    // Sin argumentos: lee el perfil por dentro, y ahí es donde se respeta el
    // permiso del onboarding de leer o no el historial.
    scanSessions()
      .then(setSesiones)
      .catch((e) => {
        setError(String(e));
        setSesiones([]);
      });
    /* Y las que ya trajiste a mano, que es la mitad de la respuesta a «¿cuáles
       me faltan?». Se lee aquí y no llega por props porque quien la guarda es
       la barra, y hacerla subir hasta App para volver a bajarla sería pasear un
       dato por tres componentes que no lo usan. Si falla, se sigue con la lista
       vacía: como mucho se ofrece traer algo que ya tienes, que es exactamente
       lo que pasaba antes, y no se rompe nada. */
    loadUiState()
      .then((ui) => setTraidas(new Set(ui.traidas)))
      .catch(() => {});
  };

  /** Lo que se enseña: todo lo que responda a la búsqueda, y lo más reciente
      arriba, que es como llega de Rust. */
  const visibles = useMemo(() => {
    if (!sesiones) return [];
    return sesiones.filter((s) => encaja(`${s.title} ${s.project} ${s.cwd}`, busca));
  }, [sesiones, busca]);

  const tope = Math.max(1, maxPanes);

  /** Por qué se ve ya cada sesión en la barra, o `null` si de verdad falta.
   *
   *  Lo decide `lib/enLaBarra.ts`, que es LA MISMA función con la que la barra
   *  elige qué pinta. Antes aquí solo se miraba si estaba abierta en un panel,
   *  y por eso este cuadro ofrecía traer sesiones que ya estaban en la barra y
   *  las seguía ofreciendo después de traerlas (Munir, 2026-08-12). */
  const motivo = useMemo(() => {
    const enPantalla = yaAbiertas;
    const m = new Map<string, ReturnType<typeof porQueSale>>();
    for (const s of visibles) m.set(s.id, porQueSale(s, { enPantalla, traidas }));
    return m;
  }, [visibles, yaAbiertas, traidas]);

  /** Las que de verdad se pueden traer: las que no están ya en la barra.
   *
   *  Lo de los paneles no es una comodidad, es lo que evita el fallo: abrir dos
   *  veces la misma conversación deja a las dos esperándose, y el aviso llegaba
   *  después de haberla abierto. Aquí se ve antes, y la casilla ni siquiera se
   *  deja marcar. */
  const traibles = useMemo(
    () => visibles.filter((s) => motivo.get(s.id) === null),
    [visibles, motivo],
  );
  const cuantasYa = visibles.length - traibles.length;
  const marcadas = traibles.filter((s) => elegidas.has(s.id));
  /** Cuántas se van a abrir al pulsar el botón grande: las que hayas marcado o,
      si no marcaste ninguna, todas las que te faltan. */
  const porTraer = marcadas.length || traibles.length;

  const marcar = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Lo que se trae. Sin marcar nada, las que te faltan: el botón grande hace
      el trabajo entero en un clic, que es lo que se le pedía a este cuadro y no
      hacía (Munir, 2026-08-06: «sigue sin haber un botón de abrir todas las que
      no hay dentro de Adeorq»). Va sin recorte: el tope lo decides tú y aquí
      solo se avisa de lo que cuesta. */
  const retomar = () => {
    if (!sesiones) return;
    // Se manda en el orden en que se ven, no en el que se fueron marcando: al
    // colocarse en el mosaico, lo de arriba de la lista queda arriba.
    onRetomar(marcadas.length ? marcadas : traibles);
  };

  const launch = () => {
    if (!place) return;
    onLaunch({
      name: place.name,
      cwd: place.path,
      provider,
      model: provider === "claude" && model ? model : undefined,
      localModel: provider === "ollama" ? local || locales[0] : undefined,
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
    // El modelo de casa, al final. Aparece si Ollama ESTÁ INSTALADO, no si hay
    // modelos: la regla de esta pantalla es no ofrecer lo que no puede correr,
    // y con Ollama instalado esto corre. Que no haya ninguno bajado se cuenta
    // dentro, con el comando para arreglarlo.
    if (tieneLocal) list.push({ id: "ollama", label: "Modelo local" });
    return list;
  }, [clis, agy, tieneLocal]);

  const toolLabel = tools.find((x) => x.id === provider)?.label ?? provider;

  return (
    <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, onClose)}>
      <div className="modal wizard" onClick={(e) => e.stopPropagation()}>
        <header className="wiz-head">
          <h3 className="modal-title">{t("Abrir una sesión")}</h3>
          {/* Retomar no es un paso de este camino, es otro camino: enseñar
              «1 · Dónde / 2 · Con qué» encima de una lista de conversaciones
              sería decir que falta un paso que no falta. */}
          {step !== "retomar" && (
            <span className="wiz-steps">
              <span className="wiz-pip" data-on={true} onClick={() => setStep(1)}>
                1 · {t("Dónde")}
              </span>
              <span className="wiz-pip" data-on={step === 2} onClick={() => place && setStep(2)}>
                2 · {t("Con qué")}
              </span>
            </span>
          )}
        </header>

        {step === "retomar" ? (
          <>
            <p className="modal-text modal-dim">
              {t("Tus conversaciones, las de esta semana y las de antes. Las que marques aparecen en la barra de la izquierda, listas para abrirlas cuando quieras.")}
            </p>
            <input
              className="finder"
              placeholder={t("Buscar por título, proyecto o carpeta")}
              value={busca}
              autoFocus
              onChange={(e) => setBusca(e.currentTarget.value)}
            />

            {sesiones === null ? (
              <p className="wiz-none">{t("Leyendo tus sesiones…")}</p>
            ) : (
              <>
                <div className="ret-cuenta">
                  <span>
                    {marcadas.length
                      ? t("{n} elegidas de {total}", {
                          n: marcadas.length,
                          total: visibles.length,
                        })
                      : t("{n} sesiones", { n: visibles.length })}
                    {/* Cuántas de esas ya las tienes puestas: dicho aquí, el
                        número de arriba deja de parecer que sobran.

                        Y cuando no falta NINGUNA se dice con todas las letras,
                        porque si no lo único que se ve es el botón grande en
                        gris, que se lee como una avería y no como un «ya está
                        todo». Pasa a menudo desde que el recuento sabe que una
                        sesión de esta semana ya sale sola en la barra.

                        Corto, y no «ya las tienes todas en Adeorq»: esta línea
                        comparte renglón con dos botones, y con la frase larga
                        se partía en dos y los mandaba a bailar contra el borde
                        derecho (Munir, 2026-08-12). Aquí dentro se sabe que
                        estamos en Adeorq. */}
                    {cuantasYa > 0 && (
                      <span className="ret-ya-n">
                        {traibles.length === 0
                          ? t("· ya las tienes todas")
                          : t("· {n} ya en Adeorq", { n: cuantasYa })}
                      </span>
                    )}
                  </span>
                  {/* Verbos, no sustantivos. Se llamaban «Las 8 que no tengo» y
                      «Ninguna», que en una línea gris de estadísticas se leen
                      como dos contadores más y no como dos botones (Munir,
                      2026-08-06). El número se fue al botón grande, que es
                      quien de verdad las trae. */}
                  <span className="ret-todas">
                    <button
                      className="mini"
                      disabled={!traibles.length}
                      onClick={() => setElegidas(new Set(traibles.map((s) => s.id)))}
                    >
                      {t("Marcar las que no tengo")}
                    </button>
                    <button
                      className="mini"
                      disabled={!elegidas.size}
                      onClick={() => setElegidas(new Set())}
                    >
                      {t("Quitar las marcas")}
                    </button>
                  </span>
                </div>

                <ul className="wiz-list ret-lista">
                  {visibles.map((s) => {
                    const por = motivo.get(s.id) ?? null;
                    const ya = por !== null;
                    return (
                      <li key={s.id}>
                        {/* Las que ya tienes se quedan a la vista, en dorado y
                            sin casilla: esconderlas dejaría el mismo hueco sin
                            explicación y volverías a buscarlas creyendo que el
                            buscador no las encuentra. */}
                        <label className="ret-item" data-on={elegidas.has(s.id)} data-ya={ya}>
                          <input
                            type="checkbox"
                            checked={elegidas.has(s.id)}
                            disabled={ya}
                            onChange={() => marcar(s.id)}
                          />
                          {tieneMarca(s.fuente ?? "claude") && (
                            <span className="ret-marca">
                              <ProviderMark id={s.fuente ?? "claude"} />
                            </span>
                          )}
                          <span className="ret-txt">
                            <span className="ret-tit">{s.title}</span>
                            <span className="ret-pie">
                              {/* En su propio elemento para poder recortarlo:
                                  un proyecto de nombre largo empujaba la
                                  pastilla fuera de la fila. */}
                              <span className="ret-donde">
                                {s.project} · {s.ago}
                              </span>
                              {/* Y se dice POR QUÉ ya la tienes, que son tres
                                  cosas distintas y antes las tres ponían «ya la
                                  tienes»: con eso, ver una sesión de ayer
                                  marcada como que ya la tenías parecía un fallo
                                  del buscador en vez de la regla de la semana
                                  haciendo su trabajo. */}
                              {por === "abierta" ? (
                                <span className="ret-ya">{t("en un panel")}</span>
                              ) : por === "traida" ? (
                                <span className="ret-ya">{t("en la barra")}</span>
                              ) : por === "reciente" ? (
                                <span className="ret-ya">{t("de esta semana")}</span>
                              ) : (
                                /* Que esté viva se dice AQUÍ y no después:
                                   abrir una que ya corre en otro sitio bloquea
                                   a las dos, y hasta ahora el aviso llegaba de
                                   una en una y se pisaba a sí mismo. */
                                s.live && <span className="ret-viva">{t("abierta ahora")}</span>
                              )}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {!visibles.length && (
                    <li className="wiz-none">
                      {busca.trim()
                        ? t("Ninguna sesión con eso.")
                        : t("Todavía no hay sesiones que retomar.")}
                    </li>
                  )}
                </ul>

                {/* Traer NO abre nada. Antes sí, y por eso hacía falta avisar
                    de los gigas: ciento veintidós conversaciones eran ciento
                    veintidós CLIs de 200 MB. Ahora van a la barra y se abren de
                    una en una, cuando tú quieras, así que la única pregunta que
                    queda es cuántas van a aparecer ahí. */}
                {porTraer > tope && (
                  <p className="ret-aviso">
                    {t("Van a la barra de la izquierda, no se abre ninguna terminal. Las abres tú desde ahí, una a una.")}
                  </p>
                )}
              </>
            )}

            <div className="modal-actions">
              <button className="mini volver modal-cancel" onClick={() => setStep(1)}>
                <ChevronIcon size={13} izq />
                {t("Atrás")}
              </button>
              {/* Encendido aunque no hayas marcado nada: sin marcas trae las
                  que te faltan, que es lo que se venía a hacer. Antes salía
                  apagado y el único botón con pinta de botón no hacía nada.
                  Y dice A DÓNDE van, que es lo que lo distingue de abrirlas. */}
              <button className="np-btn" disabled={!porTraer} onClick={retomar}>
                {porTraer > 1
                  ? t("Ponerlas en la barra ({n})", { n: porTraer })
                  : t("Ponerla en la barra")}
              </button>
            </div>
          </>
        ) : step === 1 ? (
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
                  <FolderIcon size={14} /> {t("Otra carpeta del disco…")}
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
                    <UnlinkIcon size={14} /> {t("Suelta, sin proyecto")}
                  </button>
                )}
                {/* El otro camino: no abrir nada nuevo, sino volver a algo que
                    ya empezaste. Es la mitad que le faltaba a este asistente. */}
                <button className="mini wiz-alt wiz-alt-ancho" onClick={irARetomar}>
                  <RefreshIcon size={14} /> {t("Retomar las que ya tienes…")}
                </button>
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

            {/* Con qué modelo de casa. Misma forma que el de Claude, porque es
                la misma pregunta: se abre un chat y hay que decir con quién.
                Sale la lista de lo que tienes descargado, sin escribir nada. */}
            {provider === "ollama" && (
              <>
                <p className="wiz-label">{t("Modelo")}</p>
                {locales.length > 0 ? (
                  <div className="chip-row">
                    {locales.map((m) => (
                      <button
                        key={m}
                        className="choice"
                        data-on={local === m}
                        onClick={() => setLocal(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Tienes Ollama y ningún modelo. Se dice con el comando que lo
                     arregla, en vez de esconder la opción y dejarte buscando por
                     qué no está: la pantalla sabe qué falta, así que lo dice. */
                  <p className="card-hint">
                    {t("Tienes Ollama pero ningún modelo descargado. Bájate uno con este comando y vuelve aquí:")}{" "}
                    <code>ollama pull qwen2.5:3b</code>
                  </p>
                )}
                <p className="card-hint">
                  {t("Corre en tu equipo y no gasta cuota de nadie. Es un chat: no lee ni toca tus archivos.")}
                </p>
              </>
            )}

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

        {/* Retomar trae los suyos: sin este `!==`, saldrían dos filas de botones
            y dos «Atrás» diciendo cosas distintas. */}
        {step !== "retomar" && (
          <div className="modal-actions">
            {/* El mismo botón hace dos cosas según el paso, así que el chevron
                sale solo cuando de verdad se vuelve: en «Cancelar» apuntaría a
                un sitio al que ese botón no lleva. */}
            <button
              className={step === 2 ? "mini volver modal-cancel" : "mini modal-cancel"}
              onClick={step === 2 ? () => setStep(1) : onClose}
            >
              {step === 2 && <ChevronIcon size={13} izq />}
              {step === 2 ? t("Atrás") : t("Cancelar")}
            </button>
            {step === 1 ? (
              <button className="np-btn" disabled={!place} onClick={() => setStep(2)}>
                {t("Siguiente")}
              </button>
            ) : (
              <button
                className="np-btn"
                /* Con el modelo de casa elegido y ninguno descargado no hay nada
                   que abrir: `ollama run` sin modelo se queda esperando. */
                disabled={provider === "ollama" && locales.length === 0}
                onClick={launch}
              >
                {count === 1 ? t("Abrir") : t("Abrir las {n}", { n: count })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
