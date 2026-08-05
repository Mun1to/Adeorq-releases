// Agenda: what is coming, what está pensado, and what toca hacer.
//
// Three blocks, and each one reads from where that thing already lives:
//   · Calendario  → external_windows de su brújula (munito.dev)
//   · Ideas       → ideas + idea_conditions de su brújula
//   · Próximos pasos → docs/METAS.md del proyecto, en su disco y en git
//
// Nothing is duplicated here and nothing is invented: if a date matters it is
// because he wrote it in the dashboard, and if a goal is open it is because
// its file says so. The panel's only job is putting the three in front of him
// without opening a browser.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BulbIcon,
  CalendarIcon,
  CheckIcon,
  DiamondIcon,
  InboxIcon,
  TargetIcon,
  UnlockIcon,
} from "./Icons";
import {
  addIdea,
  condiciones as fetchCondiciones,
  daysTo,
  ideas as fetchIdeas,
  isSignedIn,
  restore,
  signIn,
  signOut,
  urgency,
  ventanas as fetchVentanas,
  type Condicion,
  type Idea,
  type Ventana,
} from "../lib/brujula";
import {
  addParked,
  dropInbox,
  loadUiState,
  inboxWhere,
  listProjects,
  projectIcons,
  readInbox,
  readMetas,
  type Metas,
  type Note,
  type Project,
} from "../lib/pty";
import { useT } from "../lib/i18n";
import ProjectAvatar from "./ProjectAvatar";
import AgendaSesiones from "./AgendaSesiones";
import Objetivos from "./Objetivos";
import Secciones from "./Secciones";
import {
  IconoCalendario,
  IconoIdeas,
  IconoObjetivos,
  IconoPasos,
} from "./IconosSeccion";
import type { SessionInfo } from "../lib/pty";

interface Props {
  /** The project he is looking at in the cockpit, if any. */
  current: string | null;
  onOpenProject: (name: string) => void;
  /** El modelo local elegido en Ajustes, para la línea de «qué necesita». */
  modeloLocal: string;
  onResume: (s: SessionInfo) => void;
}

type Link = "checking" | "out" | "in" | "failing";

const STATUS_LABEL: Record<Idea["status"], string> = {
  live: "viva",
  parked: "aparcada",
  done: "hecha",
  discarded: "descartada",
};

/**
 * His METAS.md files are markdown, and the Aparcadero showed up here with its
 * asterisks and backticks in plain sight. Only two marks matter for one line:
 * **bold** becomes bold, `code` loses its ticks.
 */
function richLine(text: string): React.ReactNode[] {
  return text
    .replace(/`/g, "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
}

/** "faltan 7 días", "hoy", "hace 3 días": the number he actually reads. */
function whenText(date: string): string {
  const left = daysTo(date);
  if (left === 0) return "hoy";
  if (left === 1) return "mañana";
  if (left > 0) return `faltan ${left} días`;
  if (left === -1) return "ayer";
  return `hace ${-left} días`;
}

export default function AgendaView({ current, onOpenProject, modeloLocal, onResume }: Props) {
  const { t } = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [link, setLink] = useState<Link>("checking");
  const [error, setError] = useState<string | null>(null);
  const [ventanas, setVentanas] = useState<Ventana[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [conds, setConds] = useState<Condicion[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState<string | null>(current);
  const [metas, setMetas] = useState<Metas | null>(null);
  const [step, setStep] = useState("");
  const [idea, setIdea] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  // What his agents have proposed from inside their sessions.
  const [notes, setNotes] = useState<Note[]>([]);
  const [trayPath, setTrayPath] = useState("");
  /** What the rail calls each project: one name for the same thing everywhere. */
  const [alias, setAlias] = useState<Record<string, string>>({});
  const shownName = (name: string) => alias[name] || name;

  const load = useCallback(async () => {
    try {
      const [v, i, c] = await Promise.all([fetchVentanas(), fetchIdeas(), fetchCondiciones()]);
      setVentanas(v);
      setIdeas(i);
      setConds(c);
      setLink("in");
      setError(null);
    } catch (e) {
      setLink(isSignedIn() ? "failing" : "out");
      setError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  const loadNotes = useCallback(() => {
    readInbox().then(setNotes).catch(() => {});
  }, []);

  useEffect(() => {
    loadNotes();
    inboxWhere().then(setTrayPath).catch(() => {});
    // Cheap enough to re-read on a slow beat: it is one small text file, and
    // an agent can drop a note at any moment while he is looking at this.
    const beat = window.setInterval(loadNotes, 20_000);
    return () => window.clearInterval(beat);
  }, [loadNotes]);

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        // The same logos as the rail, from the same cache in Rust.
        return projectIcons(list.map((p) => p.path));
      })
      .then(setIcons)
      .catch((e) => setError(String(e)));
    loadUiState()
      .then((ui) => setAlias(ui.projectAlias))
      .catch(() => {});
    restore()
      .then((ok) => (ok ? load() : setLink("out")))
      .catch(() => setLink("out"));
  }, [load]);

  // The local half works with no session at all: METAS.md is on his disk.
  useEffect(() => {
    const path = projects.find((p) => p.name === project)?.path;
    if (!path) {
      setMetas(null);
      return;
    }
    readMetas(path).then(setMetas).catch((e) => setError(String(e)));
  }, [project, projects]);

  const enter = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      setPassword("");
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setLink("out");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await signOut().catch(() => {});
    setVentanas([]);
    setIdeas([]);
    setLink("out");
  };

  const shownVentanas = useMemo(
    () => ventanas.filter((v) => showPast || daysTo(v.date) >= 0),
    [ventanas, showPast],
  );

  /** The soonest one still ahead: the headline of the whole page. */
  const next = useMemo(
    () => ventanas.filter((v) => daysTo(v.date) >= 0)[0] ?? null,
    [ventanas],
  );

  const projectIdeas = useMemo(() => {
    const live = ideas.filter((i) => i.status !== "discarded" && i.status !== "done");
    if (!project) return live;
    // Its own plus the ones filed under the ecosystem, which are everyone's.
    return live.filter((i) => i.project === project || i.project === "ecosistema");
  }, [ideas, project]);

  const condOf = (id: string | null) => (id ? conds.find((c) => c.id === id) : undefined);
  const path = projects.find((p) => p.name === project)?.path;

  const saveStep = async () => {
    if (!path || !step.trim()) return;
    try {
      await addParked(path, step.trim());
      setStep("");
      setNote(t("Apuntado en su METAS.md. Lo verás en el diff antes de commitear."));
      readMetas(path).then(setMetas).catch(() => {});
    } catch (e) {
      setError(String(e));
    }
  };

  /**
   * Accepting a note is where it stops being a suggestion: an idea goes into
   * the brújula, a paso into that project's METAS.md. Either way the line
   * leaves the tray, and only after the write succeeded.
   */
  const acceptNote = async (n: Note) => {
    try {
      if (n.kind === "paso") {
        const target = projects.find((p) => p.name === n.project)?.path;
        if (!target) {
          setError(t("No encuentro la carpeta de {p}, así que no sé dónde apuntarlo.", { p: n.project }));
          return;
        }
        await addParked(target, n.text);
        setNote(t("Apuntado en el METAS.md de {p}.", { p: n.project }));
        if (target === path) readMetas(target).then(setMetas).catch(() => {});
      } else {
        await addIdea(n.text, n.project);
        setNote(t("Idea guardada en tu brújula."));
        load();
      }
      await dropInbox(n.line);
      loadNotes();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const dropNote = async (n: Note) => {
    await dropInbox(n.line).catch((e) => setError(String(e)));
    loadNotes();
  };

  const saveIdea = async () => {
    if (!idea.trim()) return;
    try {
      await addIdea(idea.trim(), project ?? "ecosistema");
      setIdea("");
      setNote(t("Idea guardada en tu brújula."));
      load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="panel agenda">
      <header className="panel-hero">
        <h1>{t("Agenda")}</h1>
        <p>{t("Lo que viene, lo que pensaste y lo que toca.")}</p>
      </header>

      {/* The next window, alone and big: on any given day this is the one
          thing on the screen that has a deadline attached to it. */}
      {next && (
        <div className="agenda-next" data-urgency={urgency(next)}>
          <span className="next-when">{whenText(next.date)}</span>
          <span className="next-body">
            <span className="next-title stream-hide">{next.title}</span>
            <span className="next-date">{next.date}</span>
          </span>
          {next.url && (
            <a className="mini next-go" href={next.url} target="_blank" rel="noreferrer">
              {t("Abrir")}
            </a>
          )}
        </div>
      )}

      {/* The rail's own language instead of a system dropdown: with twenty-five
          projects that grey list filled the whole window (Munir, 2026-07-26). */}
      <div className="agenda-picker">
        <button
          className="pick-item"
          data-on={!project}
          onClick={() => setProject(null)}
          data-tip={t("Todo el ecosistema")}
        >
          <span className="pick-all"><DiamondIcon size={13} /></span>
        </button>
        {projects.map((p) => (
          <button
            key={p.path}
            className="pick-item"
            data-on={project === p.name}
            onClick={() => setProject(project === p.name ? null : p.name)}
            data-tip={p.name}
          >
            <ProjectAvatar name={p.name} src={icons[p.path]} className="pavatar-pick" />
          </button>
        ))}
      </div>

      <div className="agenda-where">
        <h2 className="where-name stream-hide">
          {project ? shownName(project) : t("Todo el ecosistema")}
        </h2>
        {project && (
          <button className="mini" onClick={() => onOpenProject(project)}>
            {t("Ir a sus sesiones")}
          </button>
        )}
        <span className="agenda-link" data-state={link}>
          {link === "in"
            ? t("brújula conectada")
            : link === "checking"
              ? t("comprobando…")
              : link === "failing"
                ? t("brújula con problemas")
                : t("brújula sin conectar")}
        </span>
        {link === "in" && (
          <button className="mini" onClick={() => void leave()}>
            {t("Salir")}
          </button>
        )}
      </div>

      {link === "out" && (
        <section className="panel-card agenda-login">
          <h2>{t("Conecta tu brújula")}</h2>
          <p className="card-hint">
            {t(
              "Con tu cuenta de munito.dev, para traer aquí tus fechas y tus ideas. La contraseña no se guarda en ningún sitio: solo el permiso de vuelta, y va al almacén cifrado de Windows.",
            )}
          </p>
          <div className="np-row">
            <input
              className="finder"
              type="email"
              placeholder={t("Tu correo")}
              value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <input
              className="finder"
              type="password"
              placeholder={t("Tu contraseña")}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void enter();
              }}
            />
            <button className="np-btn" disabled={busy} onClick={() => void enter()}>
              {busy ? t("Entrando…") : t("Entrar")}
            </button>
          </div>
        </section>
      )}

      {/* What his agents proposed while working. A proposal, never a decision:
          nothing reaches the brújula or a METAS.md until he says so here. */}
      {notes.length > 0 && (
        <section className="panel-card agenda-card tray-card">
          <h2>
            <InboxIcon size={16} />
            {t("De tus agentes")}
            <span className="tray-count">{notes.length}</span>
          </h2>
          <p className="card-hint">
            {t(
              "Lo que tus sesiones han ido apuntando mientras trabajaban. Aceptar una idea la manda a tu brújula; aceptar un paso lo escribe en el METAS.md de ese proyecto.",
            )}
          </p>
          <ul className="tray-list">
            {notes.map((n) => (
              <li key={n.line} className="tray-item" data-kind={n.kind}>
                <span className="tray-kind">{n.kind === "paso" ? t("paso") : t("idea")}</span>
                <span className="tray-body">
                  <span className="tray-text stream-hide">{n.text}</span>
                  <span className="tray-proj">{n.project}</span>
                </span>
                <button
                  className="mini tray-yes"
                  data-tip={
                    n.kind === "paso"
                      ? t("Escribirlo en el METAS.md de {p}", { p: n.project })
                      : t("Guardarlo como idea en tu brújula")
                  }
                  onClick={() => void acceptNote(n)}
                >
                  <CheckIcon size={14} />
                </button>
                <button
                  className="mini tray-no"
                  data-tip={t("Descartar: se borra de la bandeja y ya está")}
                  onClick={() => void dropNote(n)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="card-hint tray-path stream-hide">{trayPath}</p>
        </section>
      )}

      <Secciones
        memoria="adeorq-agenda-seccion"
        secciones={[
          { id: "objetivos", label: "Hoy", icon: <IconoObjetivos /> },
          {
            id: "calendario",
            label: "Calendario",
            icon: <IconoCalendario />,
            badge: shownVentanas.length || "",
          },
          {
            id: "ideas",
            label: "Ideas",
            icon: <IconoIdeas />,
            badge: projectIdeas.length || "",
          },
          { id: "pasos", label: "Próximos pasos", icon: <IconoPasos /> },
        ]}
      >
        {(activa) => (
          <>
            {activa === "objetivos" && (
              <>
                <Objetivos />
                {/* Tus sesiones aquí y no en su propia pestaña: lo que un
                    agente te está preguntando AHORA es parte de lo de hoy. */}
                <AgendaSesiones modelo={modeloLocal} onResume={onResume} />
              </>
            )}
            {activa === "calendario" && <CardCalendario />}
            {activa === "ideas" && <CardIdeas />}
            {activa === "pasos" && <CardPasos />}
          </>
        )}
      </Secciones>

      {note && <p className="np-ok agenda-note">{note}</p>}
      {error && <p className="np-err agenda-note">{error}</p>}
    </div>
  );

  function CardCalendario() {
    return (
        <section className="panel-card agenda-card">
          <h2>
            <CalendarIcon size={16} />
            {t("Calendario")}
          </h2>
          <p className="card-hint">
            {t(
              "Tus ventanas externas: lo que tiene fecha porque la pone otro. Cada una avisa con la antelación que le pusiste.",
            )}
          </p>
          <ul className="cal-list">
            {shownVentanas.map((v) => (
              <li key={v.id} className="cal-item" data-urgency={urgency(v)}>
                <span className="cal-when">{whenText(v.date)}</span>
                <span className="cal-title stream-hide">
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer">
                      {v.title}
                    </a>
                  ) : (
                    v.title
                  )}
                </span>
                <span className="cal-date">{v.date}</span>
              </li>
            ))}
            {shownVentanas.length === 0 && (
              <li className="card-hint">
                {link === "in" ? t("Nada a la vista.") : t("Conecta la brújula para verlo.")}
              </li>
            )}
          </ul>
          {ventanas.some((v) => daysTo(v.date) < 0) && (
            <button className="mini" onClick={() => setShowPast((v) => !v)}>
              {showPast ? t("Ocultar las pasadas") : t("Ver también las pasadas")}
            </button>
          )}
        </section>
    );
  }

  function CardIdeas() {
    return (
        <section className="panel-card agenda-card">
          <h2>
            <BulbIcon size={16} />
            {t("Ideas")}
          </h2>
          <p className="card-hint">
            {project
              ? t("Las de {p} y las del ecosistema, con su condición de desbloqueo.", { p: project })
              : t("Todas las que tienes vivas o aparcadas, con su condición de desbloqueo.")}
          </p>
          <ul className="idea-list">
            {projectIdeas.map((i) => {
              const c = condOf(i.conditionId);
              return (
                <li key={i.id} className="idea-item" data-status={i.status}>
                  <span className="idea-top">
                    <span className="idea-title stream-hide">{i.title}</span>
                    <span className="idea-state">{t(STATUS_LABEL[i.status])}</span>
                  </span>
                  {!project && <span className="idea-proj stream-hide">{i.project}</span>}
                  {c && (
                    <span className="idea-cond stream-hide" data-cond={c.status}>
                      <UnlockIcon size={12} />
                      {c.text}
                    </span>
                  )}
                </li>
              );
            })}
            {projectIdeas.length === 0 && (
              <li className="card-hint">
                {link === "in" ? t("Ninguna por aquí.") : t("Conecta la brújula para verlo.")}
              </li>
            )}
          </ul>
          {link === "in" && (
            <div className="np-row">
              <input
                className="finder"
                placeholder={t("Se me ocurre que…")}
                value={idea}
                onChange={(e) => setIdea(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveIdea();
                }}
              />
              <button className="np-btn" disabled={!idea.trim()} onClick={() => void saveIdea()}>
                {t("Apuntar")}
              </button>
            </div>
          )}
        </section>
    );
  }

  function CardPasos() {
    return (
        <section className="panel-card agenda-card">
          <h2>
            <TargetIcon size={16} />
            {t("Próximos pasos")}
          </h2>
          {!project ? (
            <p className="card-hint">{t("Elige un proyecto arriba para ver sus metas.")}</p>
          ) : !metas?.exists ? (
            <p className="card-hint">
              {t("{p} todavía no tiene docs/METAS.md. Lo que apuntes abajo lo crea.", {
                p: project,
              })}
            </p>
          ) : (
            <>
              <p className="card-hint stream-hide">{metas.path}</p>
              <ul className="meta-list">
                {metas.metas
                  .filter((m) => !m.done)
                  .map((m) => (
                    <li key={m.title} className="meta-item">
                      <span className="meta-title">
                        <ProjectAvatar name={project} className="pavatar-mini" />
                        <span className="stream-hide">{m.title}</span>
                      </span>
                      {m.when && (
                        <span className="meta-when stream-hide">
                          {t("Hecho cuando")}: {richLine(m.when)}
                        </span>
                      )}
                    </li>
                  ))}
                {metas.metas.every((m) => m.done) && (
                  <li className="card-hint">{t("Todas sus metas están cerradas.")}</li>
                )}
              </ul>
              {metas.parked.length > 0 && (
                <>
                  <p className="wiz-label">{t("Aparcadero")}</p>
                  <ul className="parked-list">
                    {metas.parked.slice(0, 8).map((p, i) => (
                      <li key={i} className="stream-hide">
                        {richLine(p)}
                      </li>
                    ))}
                    {metas.parked.length > 8 && (
                      <li className="card-hint">
                        {t("y {n} más en el archivo", { n: metas.parked.length - 8 })}
                      </li>
                    )}
                  </ul>
                </>
              )}
            </>
          )}
          {project && (
            <div className="np-row">
              <input
                className="finder"
                placeholder={t("Añadir al aparcadero de este proyecto")}
                value={step}
                onChange={(e) => setStep(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveStep();
                }}
              />
              <button className="np-btn" disabled={!step.trim()} onClick={() => void saveStep()}>
                {t("Apuntar")}
              </button>
            </div>
          )}
        </section>
    );
  }
}
