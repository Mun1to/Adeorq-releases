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
  BoltIcon,
  BulbIcon,
  CalendarIcon,
  CheckIcon,
  ChevronIcon,
  DiamondIcon,
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
  scanSessions,
  type Metas,
  type Note,
  type Project,
} from "../lib/pty";
import { useT } from "../lib/i18n";
import ProjectAvatar from "./ProjectAvatar";
import AgendaSesiones, { ESPERAN } from "./AgendaSesiones";
import Objetivos from "./Objetivos";
import {
  goalsAdd,
  goalsMonth,
  goalsRead,
  goalsRemove,
  goalsToggle,
  hoy,
  useDiaDeHoy,
  type Goal,
  type GoalCount,
} from "../lib/goals";
import { accionDe, olvidarAccion, type AccionConsejo } from "../lib/acciones";
import { hueOf } from "../lib/colors";
import { providerOf } from "../lib/providers";
import { indiceValido, siguienteNota } from "../lib/agenda";
import { mesDe, mesVecino, rejillaDelMes } from "../lib/calendario";
import type { SessionInfo } from "../lib/pty";

interface Props {
  /** The project he is looking at in the cockpit, if any. */
  current: string | null;
  onOpenProject: (name: string) => void;
  /** El modelo local elegido en Ajustes, para la línea de «qué necesita». */
  modeloLocal: string;
  onResume: (s: SessionInfo) => void;
  /** Hacer lo que una propuesta del copiloto propone: abrir el otro cliente,
      dejar escrito el cambio de cerebro, abrir el chat con ese modelo. Devuelve
      la frase de qué ha pasado, para poder enseñarla donde ya se enseñan las
      demás. Es opcional porque la pantalla tiene que seguir en pie sin ella:
      una nota sin acción es lo normal, y sin este callback simplemente no sale
      el botón. */
  onHacer?: (a: AccionConsejo) => Promise<string>;
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

/** La portada, y una pantalla por cifra. */
type Modo = null | "propuestas" | "sesiones" | "objetivos" | "fechas" | "metas" | "ideas";

const TITULOS: Record<NonNullable<Modo>, string> = {
  propuestas: "De tus agentes",
  sesiones: "Tus sesiones",
  objetivos: "Objetivos de hoy",
  fechas: "Calendario",
  metas: "Próximos pasos",
  ideas: "Ideas",
};

/** «martes, 11 de agosto». Sin el año: hoy no necesita que le recuerden en qué
    año está, y es el único encabezado que queda en la portada. */
function fechaLarga(lang: string): string {
  return new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Las columnas del calendario: L M X J V S D, y M T W T F S S en inglés.
 *
 * Salen del idioma y no de una lista escrita a mano porque una lista habría
 * que traducirla, y traducir «X» de miércoles a mano es justo el tipo de
 * cadena que se queda sin traducir para siempre. El 1 de junio de 2026 es
 * lunes, que es donde empieza la semana aquí.
 */
function inicialesSemana(lang: string): string[] {
  const loc = lang === "en" ? "en-GB" : "es-ES";
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 5, 1 + i).toLocaleDateString(loc, { weekday: "narrow" }),
  );
}

/**
 * «jueves, 20 de agosto» a partir de un "AAAA-MM-DD".
 *
 * Se parte el texto en tres números en vez de pasárselo a `new Date(texto)`:
 * esa forma lo interpreta como UTC y en España, que va por delante, devuelve
 * el día ANTERIOR media jornada al año.
 */
function diaLargo(fecha: string, lang: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** «agosto de 2026», con el idioma de la app. */
function nombreDelMes(anio: number, mes: number, lang: string): string {
  return new Date(anio, mes - 1, 1).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    month: "long",
    year: "numeric",
  });
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

/**
 * Un día cualquiera del calendario: lo que hay y lo que quieras dejar puesto.
 *
 * Se escribe igual que los objetivos de hoy, en el mismo markdown por día
 * (`goals_add` acepta cualquier fecha), así que un recordatorio para el jueves
 * es un objetivo del jueves: cuando llegue ya está donde tiene que estar, y un
 * agente puede tacharlo. No hace falta un almacén nuevo para esto.
 *
 * VA FUERA DE `AgendaView`, y no es un detalle de estilo. Estaba declarado
 * dentro, y una función declarada dentro de un componente es una función NUEVA
 * en cada render: React la ve como otro tipo de componente, desmonta el viejo y
 * monta este, con lo que su efecto vuelve a correr. Como el efecto avisaba
 * hacia arriba para refrescar el mes, eso re-renderizaba al padre y volvía a
 * empezar: la pantalla parpadeaba sin parar y no llegaba a pintar nada (Munir,
 * 2026-08-11). Aquí arriba su identidad es estable y el ciclo se rompe.
 *
 * Tampoco usa `aplicarDia`: eso guarda en la caché de HOY, y meter ahí el
 * jueves haría que la lista de hoy y el panel flotante enseñaran el día
 * equivocado hasta el siguiente latido.
 */
function DiaSuelto({
  fecha,
  onCambio,
  onError,
}: {
  fecha: string;
  /** Que el calendario se entere de que ese día ya cuenta otra cosa. */
  onCambio: () => void;
  onError: (e: string) => void;
}) {
  const { t } = useT();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [texto, setTexto] = useState("");

  const releer = useCallback(() => {
    goalsRead(fecha)
      .then((d) => setGoals(d.goals))
      .catch(() => setGoals([]));
  }, [fecha]);

  useEffect(releer, [releer]);

  /** Leer lo de este día y avisar arriba. Solo tras un cambio, nunca al montar:
      avisar al montar es justo lo que cerraba el bucle. */
  const trasCambiar = () => {
    releer();
    onCambio();
  };

  const añadir = () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setTexto("");
    goalsAdd(fecha, limpio).then(trasCambiar).catch((e) => onError(String(e)));
  };

  if (!goals) return null;
  return (
    <section className="panel-card agenda-card ag-dia-suelto">
      <ul className="obj-list">
        {goals.map((g, i) => (
          <li key={i} className="obj-item" data-done={g.done}>
            <button
              className="obj-fila"
              role="checkbox"
              aria-checked={g.done}
              onClick={() => goalsToggle(fecha, g).then(trasCambiar).catch(() => {})}
            >
              <span className="obj-mark" aria-hidden>
                {g.done ? <CheckIcon size={13} /> : ""}
              </span>
              <span className="obj-text stream-hide">{g.text}</span>
            </button>
            <button
              className="obj-del"
              data-tip={t("Quitar este objetivo")}
              onClick={() => goalsRemove(fecha, g).then(trasCambiar).catch(() => {})}
            >
              ×
            </button>
          </li>
        ))}
        {!goals.length && <li className="card-hint">{t("Ese día no apuntaste nada.")}</li>}
      </ul>
      <div className="np-row">
        <input
          className="finder"
          placeholder={t("Apuntar algo para este día…")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") añadir();
          }}
        />
        <button className="np-btn" disabled={!texto.trim()} onClick={añadir}>
          {t("Apuntar")}
        </button>
      </div>
    </section>
  );
}

export default function AgendaView({ current, onOpenProject, modeloLocal, onResume, onHacer }: Props) {
  const { t, lang } = useT();
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
  /** En qué está mirando. `null` es la portada: seis cifras y nada más. */
  const [modo, setModo] = useState<Modo>(null);
  /** Qué propuesta se está revisando, dentro del modo propuestas. */
  const [rev, setRev] = useState(0);
  /** Cuántas sesiones te esperan. Se cuenta aquí y no dentro de la pantalla de
      sesiones porque esa solo se monta al entrar, y la cifra de la portada
      tiene que ser verdad ANTES de entrar. Es leer disco: ni un token. */
  const [esperando, setEsperando] = useState(0);
  const dia = useDiaDeHoy();
  /** El mes que enseña el calendario. Empieza en el de hoy, claro. */
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  /** Qué días de ese mes tuvieron objetivos, y cuántos se cerraron. */
  const [cuenta, setCuenta] = useState<GoalCount[]>([]);
  /** El día que se está mirando, si entraste por una casilla del calendario. */
  const [diaElegido, setDiaElegido] = useState<string | null>(null);

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

  /* El mes del calendario, de una sola llamada. Se relee cuando cambias de mes
     y cuando tachas un objetivo (por eso `dia` está en las dependencias: al
     marcar uno, el día de hoy cambia y su casilla tiene que enterarse). */
  const releerMes = useCallback(() => {
    goalsMonth(`${anio}-${String(mes).padStart(2, "0")}`)
      .then(setCuenta)
      .catch(() => {});
  }, [anio, mes]);

  useEffect(() => {
    releerMes();
  }, [releerMes, dia]);

  const contarSesiones = useCallback(() => {
    void scanSessions()
      .then((s) => setEsperando(s.filter((x) => x.fresh !== "muerta" && ESPERAN.has(x.state)).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    contarSesiones();
    const beat = window.setInterval(contarSesiones, 60_000);
    return () => window.clearInterval(beat);
  }, [contarSesiones]);

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

  const projectIdeas = useMemo(() => {
    const live = ideas.filter((i) => i.status !== "discarded" && i.status !== "done");
    if (!project) return live;
    // Its own plus the ones filed under the ecosystem, which are everyone's.
    return live.filter((i) => i.project === project || i.project === "ecosistema");
  }, [ideas, project]);

  /* Ya no hay cifra de «objetivos para hoy» ni de «con fecha esta semana»: las
     dos las cuenta mejor el calendario, que además dice CUÁNDO, y repetirlas
     arriba sería decir dos veces lo mismo en la misma pantalla. */
  const pasos = useMemo(() => notes.filter((n) => n.kind === "paso").length, [notes]);
  const metasVivas = metas?.metas.filter((m) => !m.done).length ?? 0;

  /* Las dos reglas del índice viven en `lib/agenda.ts` con sus casos, porque
     son justo las que no se ven leyendo el JSX. */
  useEffect(() => {
    setRev((r) => indiceValido(r, notes.length));
  }, [notes.length]);

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
    olvidarAccion(n.text);
    loadNotes();
  };

  /**
   * Y la cuarta salida, la que faltaba: HACERLO.
   *
   * Las otras tres deciden qué pasa con la NOTA (a las metas, a la basura, para
   * luego). Esta hace lo que la nota propone, que es lo que uno quiere hacer
   * nueve de cada diez veces cuando lee «Codex está más fresco, ¿sigues ahí?».
   * Sin ella el consejo estaba a medias: te daba la respuesta y te dejaba el
   * recado de ejecutarla a mano.
   *
   * Solo aparece si la nota trae acción, y eso solo pasa con las que escribe el
   * copiloto. Una nota escrita a mano por un agente sigue teniendo sus tres
   * salidas de siempre y ninguna más.
   */
  const hacerNota = async (n: Note, a: AccionConsejo) => {
    if (!onHacer) return;
    try {
      const dicho = await onHacer(a);
      // Se borra DESPUÉS de que haya salido bien: si abrir la terminal falla,
      // la propuesta sigue en la bandeja y se puede volver a intentar.
      await dropInbox(n.line);
      olvidarAccion(n.text);
      setNote(dicho);
      loadNotes();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  /** Qué pone el botón. Cada acción dice lo que va a pasar al pulsarla, con el
      nombre concreto dentro: «Hacerlo» no dice si abre algo, escribe algo o
      gasta dinero, y esas tres cosas no se pulsan con la misma confianza. */
  const rotuloDe = (a: AccionConsejo): string =>
    a.hacer === "abrirCli"
      ? t("Abrir {c} aquí", { c: providerOf(a.cli).label })
      : a.hacer === "cambiarModelo"
        ? t("Cambiar a {m}", { m: a.modelo })
        : t("Probarlo en el chat");

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

  /* La portada NO enseña contenido, enseña cuánto hay de cada cosa.
     Munir, 2026-08-11, con doce notas de párrafo en pantalla: «me sigue
     pareciendo mucho texto, la Agenda debe aclarar las cosas, no hacerlas más
     difíciles». Trece notas de doscientos caracteres son un documento, y un
     documento no se lee de un vistazo. Así que el texto no aparece hasta que
     se entra a algo, y las propuestas se revisan de UNA EN UNA, porque cada
     una es una decisión y doce decisiones a la vez no se toman. */
  const contenido = () => {
    switch (modo) {
      case "propuestas":
        return <Revision />;
      case "sesiones":
        return <AgendaSesiones modelo={modeloLocal} onResume={onResume} />;
      case "objetivos":
        /* Hoy se edita; un día pasado se lee y ya está. `Objetivos` cuelga de
           `useDiaDeHoy`, que es un hook con caché compartida entre la Agenda y
           el panel flotante: pasarle una fecha cualquiera obligaría a partir esa
           caché en dos para un caso que es de consulta. */
        return diaElegido && diaElegido !== hoy() ? (
          <DiaSuelto fecha={diaElegido} onCambio={releerMes} onError={setError} />
        ) : (
          <Objetivos />
        );
      case "fechas":
        return link === "out" ? <Login /> : <CardCalendario />;
      case "ideas":
        return link === "out" ? <Login /> : <CardIdeas />;
      case "metas":
        return (
          <>
            <Picker />
            <CardPasos />
          </>
        );
      default:
        return null;
    }
  };

  if (modo) {
    return (
      <div className="panel agenda">
        <div className="ag-dia">
          <button
            className="mini volver ag-volver"
            onClick={() => {
              setModo(null);
              setDiaElegido(null);
            }}
          >
            <ChevronIcon size={13} izq />
            {t("Volver")}
          </button>
          <h1>
            {modo === "objetivos" && diaElegido && diaElegido !== hoy()
              ? diaLargo(diaElegido, lang)
              : t(TITULOS[modo])}
          </h1>
          {modo === "propuestas" && notes.length > 0 && (
            <span className="ag-quedan">
              {t("{i} de {n}", { i: rev + 1, n: notes.length })}
            </span>
          )}
          {modo === "fechas" && link === "in" && (
            <button className="mini ag-salir" onClick={() => void leave()}>
              {t("Salir de la brújula")}
            </button>
          )}
        </div>
        {contenido()}
        {note && <p className="np-ok agenda-note">{note}</p>}
        {error && <p className="np-err agenda-note">{error}</p>}
      </div>
    );
  }

  /* La portada: rail de proyectos a la izquierda como en la cabina, y el
     calendario ocupando lo ancho.

     La vuelta anterior se fue al extremo contrario del muro de texto: una
     columna de 720 px centrada, con media pantalla en blanco a los lados
     (Munir, 2026-08-11: «no aprovecha del todo el espacio, y me gustaría que
     en el menú principal haya literalmente un calendario y un menú como en el
     cockpit a la izquierda de los proyectos»). Un calendario es justo lo que
     pide ancho, así que las dos cosas se arreglan con la misma forma. */
  return (
    <div className="panel agenda ag-marco">
      {/* Las marcas son LAS MISMAS piezas que la tira de la cabina
          (`.project-logo` + `.pavatar-xl` + `--c`), no una copia parecida:
          «igualito, eh» (Munir, 2026-08-11). Compartiendo clase no se pueden
          separar mañana, que es lo que le pasó a la anterior. */}
      <aside className="ag-rail">
        <button
          className="project-logo"
          data-active={!project}
          style={{ ["--c" as string]: "var(--accent)" }}
          onClick={() => setProject(null)}
          data-tip={t("Todo el ecosistema")}
        >
          <span className="pick-all"><DiamondIcon size={20} /></span>
        </button>
        {projects.map((p) => (
          <button
            key={p.path}
            className="project-logo"
            data-active={project === p.name}
            style={{ ["--c" as string]: hueOf(p.name) }}
            onClick={() => setProject(project === p.name ? null : p.name)}
            data-tip={shownName(p.name)}
          >
            <ProjectAvatar name={p.name} src={icons[p.path]} className="pavatar-xl" />
          </button>
        ))}
      </aside>

      <div className="ag-cuerpo">
        <div className="ag-dia">
          <h1>{fechaLarga(lang)}</h1>
          {project && (
            <button className="mini" onClick={() => onOpenProject(project)}>
              {t("Ir a sus sesiones")}
            </button>
          )}
        </div>

        <div className="ag-cifras">
          <Cifra
            n={esperando}
            viva
            que={t("sesiones te esperan")}
            pie={esperando ? t("te preguntan algo o esperan tu OK") : t("ninguna te espera")}
            onClick={() => setModo("sesiones")}
          />
          <Cifra
            n={notes.length}
            que={t("propuestas de tus agentes")}
            pie={
              notes.length
                ? t("{p} pasos · {i} ideas", { p: pasos, i: notes.length - pasos })
                : t("nada apuntado")
            }
            onClick={() => setModo("propuestas")}
          />
          <Cifra
            n={metasVivas}
            que={t("metas activas")}
            pie={project ? shownName(project) : t("elige un proyecto")}
            onClick={() => setModo("metas")}
          />
          <Cifra
            n={projectIdeas.length}
            que={t("ideas vivas")}
            pie={link !== "in" ? t("brújula sin conectar") : t("en tu brújula")}
            onClick={() => setModo("ideas")}
          />
        </div>

        <Calendario />
      </div>
    </div>
  );

  /**
   * El calendario del mes, con lo que cae en cada día.
   *
   * Junta las dos cosas que SÍ tienen fecha y que hasta ahora vivían en dos
   * pestañas que no se veían a la vez: tus objetivos (un archivo por día) y
   * las ventanas de la brújula. Un día con objetivos lleva su punto; si están
   * todos hechos, el punto se apaga. Pinchar un día abre el suyo.
   */
  function Calendario() {
    const dias = useMemo(() => rejillaDelMes(anio, mes), [anio, mes]);
    const hoyTxt = hoy();
    const porFecha = useMemo(() => {
      const m = new Map<string, { objetivos?: GoalCount; ventanas: Ventana[] }>();
      for (const g of cuenta) m.set(g.date, { objetivos: g, ventanas: [] });
      for (const v of ventanas) {
        const e = m.get(v.date) ?? { ventanas: [] };
        e.ventanas.push(v);
        m.set(v.date, e);
      }
      return m;
    }, [cuenta, ventanas]);

    return (
      <section className="ag-cal">
        <header className="ag-cal-cab">
          <button
            className="ag-cal-mover"
            data-tip={t("El mes anterior")}
            onClick={() => {
              const v = mesVecino(anio, mes, -1);
              setAnio(v.anio);
              setMes(v.mes);
            }}
          >
            ‹
          </button>
          <h2>{nombreDelMes(anio, mes, lang)}</h2>
          <button
            className="ag-cal-mover"
            data-tip={t("El mes siguiente")}
            onClick={() => {
              const v = mesVecino(anio, mes, 1);
              setAnio(v.anio);
              setMes(v.mes);
            }}
          >
            ›
          </button>
          {mesDe(hoyTxt) !== `${anio}-${String(mes).padStart(2, "0")}` && (
            <button
              className="mini ag-cal-hoy"
              onClick={() => {
                setAnio(new Date().getFullYear());
                setMes(new Date().getMonth() + 1);
              }}
            >
              {t("Hoy")}
            </button>
          )}
        </header>

        <div className="ag-cal-dias">
          {inicialesSemana(lang).map((d, i) => (
            <span key={i} className="ag-cal-inicial">
              {d}
            </span>
          ))}
        </div>

        <div className="ag-cal-rejilla">
          {dias.map((d) => {
            const q = porFecha.get(d.fecha);
            const pendientes = q?.objetivos ? q.objetivos.total - q.objetivos.done : 0;
            return (
              <button
                key={d.fecha}
                className="ag-cal-celda"
                data-fuera={!d.delMes}
                data-hoy={d.fecha === hoyTxt}
                data-tip={q?.ventanas.length ? q.ventanas.map((v) => v.title).join(" · ") : undefined}
                onClick={() => {
                  setDiaElegido(d.fecha);
                  setModo("objetivos");
                }}
              >
                <span className="ag-cal-num">{d.numero}</span>
                {q?.objetivos && (
                  <span className="ag-cal-obj" data-todo={pendientes === 0}>
                    {q.objetivos.done}/{q.objetivos.total}
                  </span>
                )}
                {q?.ventanas.map((v) => (
                  <span key={v.id} className="ag-cal-ventana stream-hide" data-urgency={urgency(v)}>
                    {v.title}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  /** Una cifra de la portada. El número manda, la frase lo explica y el pie da
      el matiz que evita tener que entrar solo para comprobar algo. */
  function Cifra({
    n,
    que,
    pie,
    viva,
    onClick,
  }: {
    n: number;
    que: string;
    pie: string;
    viva?: boolean;
    onClick: () => void;
  }) {
    return (
      <button className="ag-cifra" data-viva={!!(viva && n)} data-cero={n === 0} onClick={onClick}>
        <span className="ag-n">{n}</span>
        <span className="ag-q">
          {que}
          <small className="stream-hide">{pie}</small>
        </span>
      </button>
    );
  }

  /** Las propuestas, de una en una: la nota entera, y tres salidas. */
  function Revision() {
    const n = notes[rev];
    if (!n) {
      return (
        <p className="ag-fin">
          {t("No queda ninguna propuesta. Tus agentes escribirán más mientras trabajan.")}
        </p>
      );
    }
    // Lo que esa nota permite hacer, si permite algo. Se lee aquí y no al
    // cargar la lista: es una lectura de localStorage por nota pintada, y solo
    // hay una en pantalla a la vez.
    const acc = accionDe(n.text);
    return (
      <div className="ag-uno">
        <div className="ag-caja" data-kind={n.kind}>
          <span className="ag-caja-cab">
            <span className="ag-k">{n.kind === "paso" ? t("paso") : t("idea")}</span>
            {shownName(n.project)}
          </span>
          <p className="ag-caja-texto stream-hide">{n.text}</p>
          {/* Las tres salidas van DENTRO de la tarjeta, no flotando debajo:
              sueltas caían sobre el fondo de escritorio con un 5 % de blanco y
              «Luego» era invisible del todo (Munir, 2026-08-11: «se ve como a
              los botones más transparentes»). Dentro heredan la superficie
              opaca de la caja y el conjunto se lee como una sola decisión. */}
          <div className="ag-botones">
            {/* La cuarta salida, y va primero porque es la que se quiere pulsar
                cuando existe: si el copiloto dice que Codex está más fresco, lo
                que uno hace al estar de acuerdo es abrir Codex, no apuntar en
                un fichero que Codex estaba más fresco. Solo sale en las notas
                que traen acción, que son las suyas. */}
            {acc && onHacer && (
              <button
                className="ag-hacer"
                data-tip={t("Hacerlo ahora. La propuesta se va de la bandeja.")}
                onClick={() => void hacerNota(n, acc)}
              >
                <BoltIcon size={14} />
                {rotuloDe(acc)}
              </button>
            )}
            <button
              className="ag-si"
              data-tip={
                n.kind === "paso"
                  ? t("Escribirlo en el METAS.md de {p}", { p: n.project })
                  : t("Guardarlo como idea en tu brújula")
              }
              onClick={() => void acceptNote(n)}
            >
              <CheckIcon size={14} />
              {t("Aceptar")}
            </button>
            <button
              data-tip={t("Descartar: se borra de la bandeja y ya está")}
              onClick={() => void dropNote(n)}
            >
              {t("Descartar")}
            </button>
            <button
              data-tip={t("Dejarla para otro rato y ver la siguiente")}
              onClick={() => setRev((r) => siguienteNota(r, notes.length))}
            >
              {t("Luego")}
            </button>
          </div>
          <p className="card-hint ag-donde stream-hide">{trayPath}</p>
        </div>
      </div>
    );
  }

  /** El rail's own language instead of a system dropdown: with twenty-five
      projects that grey list filled the whole window (Munir, 2026-07-26).
      Vive dentro de las metas, que es lo único que depende del proyecto. */
  function Picker() {
    return (
      <>
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
        {project && (
          <div className="agenda-where">
            <h2 className="where-name stream-hide">{shownName(project)}</h2>
            <button className="mini" onClick={() => onOpenProject(project)}>
              {t("Ir a sus sesiones")}
            </button>
          </div>
        )}
      </>
    );
  }

  function Login() {
    return (
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
    );
  }

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
