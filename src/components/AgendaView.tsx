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
  loadUiState,
  listProjects,
  projectIcons,
  readInbox,
  readMetas,
  scanSessions,
  type Metas,
  type Note,
  type Project,
} from "../lib/pty";
import { useT, type Translate } from "../lib/i18n";
import { enLaTienda, yaEnLaTienda } from "../lib/empaquetada";
import { latido } from "../lib/latido";
import ProjectAvatar from "./ProjectAvatar";
import AgendaSesiones, { ESPERAN } from "./AgendaSesiones";
import AgendaProgramados, { useProgramados } from "./AgendaProgramados";
import { cortados, cuandoFalta, elSiguiente } from "../lib/programados";
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
import { abrirEnlacesFuera } from "../lib/enlacesFuera";
import { hueOf } from "../lib/colors";
import { mesDe, mesVecino, rejillaDelMes } from "../lib/calendario";
import type { Account, SessionInfo } from "../lib/pty";

interface Props {
  /** The project he is looking at in the cockpit, if any. */
  current: string | null;
  onOpenProject: (name: string) => void;
  /** El modelo local elegido en Ajustes, para la línea de «qué necesita». */
  modeloLocal: string;
  onResume: (s: SessionInfo) => void;
  /** Las propuestas de tus agentes se atienden en Decisiones, en «Ideas de tus
      agentes» (A1, 2026-11-15): la cifra de la portada lleva allí. */
  onPropuestas?: () => void;
  /** Las cuentas de Cuentas: un encargo programado elige con cuál nace. */
  cuentas?: Account[];
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
type Modo = null | "sesiones" | "objetivos" | "fechas" | "metas" | "ideas" | "programados";

const TITULOS: Record<NonNullable<Modo>, string> = {
  sesiones: "Tus sesiones",
  objetivos: "Objetivos de hoy",
  fechas: "Calendario",
  metas: "Próximos pasos",
  ideas: "Ideas",
  programados: "Encargos programados",
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
function whenText(date: string, t: Translate): string {
  const left = daysTo(date);
  if (left === 0) return t("hoy");
  if (left === 1) return t("mañana");
  if (left > 0) return t("faltan {n} días", { n: left });
  if (left === -1) return t("ayer");
  return t("hace {n} días", { n: -left });
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

/**
 * Uno de los cuatro números de la portada de la Agenda.
 *
 * Vive fuera de `AgendaView` porque puede: no toca nada de su estado, solo sus
 * propias props. Dentro se declaraba de nuevo en cada render y React remontaba
 * los cuatro botones enteros cada vez que se movía cualquiera de los
 * veinticinco `useState` de la vista.
 */
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

export default function AgendaView({ current, onOpenProject, modeloLocal, onResume, onPropuestas, cuentas = [] }: Props) {
  const { t, lang } = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [link, setLink] = useState<Link>("checking");
  /** Dentro del paquete de la Microsoft Store no hay brújula (`lib/brujula.ts`):
      ni su cifra, ni su acceso, ni guardar una idea en ella. */
  const [enTienda, setEnTienda] = useState(yaEnLaTienda);
  useEffect(() => {
    void enLaTienda().then(setEnTienda);
  }, []);
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
  /** What the rail calls each project: one name for the same thing everywhere. */
  const [alias, setAlias] = useState<Record<string, string>>({});
  const shownName = (name: string) => alias[name] || name;
  /** Los encargos que se lanzan solos: su cifra en la portada y su pantalla. */
  const [programados, setProgramados] = useProgramados();
  const parados = cortados(programados?.encargos ?? []);
  const siguiente = elSiguiente(programados?.encargos ?? [], new Date());
  /** En qué está mirando. `null` es la portada: seis cifras y nada más. */
  const [modo, setModo] = useState<Modo>(null);
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
    // Ver `lib/latido.ts`: barrer las sesiones para un número que no está en
    // pantalla es la definición de trabajo tirado.
    return latido(contarSesiones, 60_000);
  }, [contarSesiones]);

  useEffect(() => {
    loadNotes();
    // Cheap enough to re-read on a slow beat: it is one small text file, and
    // an agent can drop a note at any moment while he is looking at this.
    return latido(loadNotes, 20_000);
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
     se entra a algo. Las propuestas se atienden en Decisiones desde el
     2026-11-15, una lista que se recorre con el teclado. */
  /* Los dos cálculos del calendario viven AQUÍ, en el cuerpo de la vista, y no
     dentro de `Calendario`. Ese dejó de ser un componente para no remontarse en
     cada render (el porqué está en el bloque de justo debajo), y un `useMemo`
     dentro de una función que se llama en una rama del `switch` sería un hook
     condicional: React cuenta los hooks por render y ahí ya no cuadrarían. */
  const diasDelMes = useMemo(() => rejillaDelMes(anio, mes), [anio, mes]);
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

  /* ── Estas ocho NO son componentes, y no pueden serlo ──────────────────────

     Están escritas dentro de la vista porque usan su estado (veinticinco
     `useState`) sin arrastrar quince props cada una. El precio es que, como
     COMPONENTES, se declaraban de nuevo en cada render: React compara el tipo
     de `{Login()}` con la función anterior, la ve distinta, y en vez de
     actualizar el `<input>` lo tira y monta otro. El foco del teclado se queda
     en el nodo que acaba de desaparecer, así que escribías una letra en el
     correo y salías del campo.

     Medido con React de verdad en `scripts/remonte-check.tsx`: con el hijo
     dentro, dos montajes y el foco perdido en UN solo render del padre; con el
     hijo fuera, uno y el foco intacto.

     Por eso se llaman `{Login()}` y no `{Login()}`: así su JSX entra en el
     árbol de la vista sin ser un tipo que React compare, y no hay nada que
     remontar. La condición para que esto valga es que NINGUNA use hooks, y por
     eso los del calendario están arriba. */
  const contenido = () => {
    // Sin brújula (la Tienda) estas dos pantallas no tienen de dónde leer, y a ellas
    // no se llega: la cifra que abría la de ideas no sale.
    if (enTienda && (modo === "ideas" || modo === "fechas")) return null;
    switch (modo) {
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
        return link === "out" ? Login() : CardCalendario();
      case "ideas":
        return link === "out" ? Login() : CardIdeas();
      case "metas":
        return (
          <>
            {Picker()}
            {CardPasos()}
          </>
        );
      case "programados":
        return (
          <AgendaProgramados
            proyectos={projects}
            cwdInicial={projects.find((p) => p.name === project)?.path ?? ""}
            estado={programados}
            onEstado={setProgramados}
            cuentas={cuentas}
          />
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
                ? `${pasos === 1 ? t("1 paso") : t("{n} pasos", { n: pasos })} · ${
                    notes.length - pasos === 1 ? t("1 idea") : t("{n} ideas", { n: notes.length - pasos })
                  }`
                : t("nada apuntado")
            }
            onClick={() => onPropuestas?.()}
          />
          <Cifra
            n={metasVivas}
            que={t("metas activas")}
            pie={project ? shownName(project) : t("elige un proyecto")}
            onClick={() => setModo("metas")}
          />
          {/* Las ideas viven en la brújula: sin ella (la Tienda) no hay cifra. */}
          {!enTienda && (
            <Cifra
              n={projectIdeas.length}
              que={t("ideas vivas")}
              pie={link !== "in" ? t("brújula sin conectar") : t("en tu brújula")}
              onClick={() => setModo("ideas")}
            />
          )}
          <Cifra
            n={programados?.encargos.length ?? 0}
            viva={parados > 0}
            que={t("encargos programados")}
            pie={
              parados
                ? parados === 1
                  ? t("1 parado por el freno")
                  : t("{n} parados por el freno", { n: parados })
                : siguiente
                  ? t("el siguiente, {c}", { c: cuandoFalta(siguiente.cuando, new Date(), t) })
                  : t("se lanzan solos a su hora")
            }
            onClick={() => setModo("programados")}
          />
        </div>

        {Calendario()}
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
    const dias = diasDelMes;
    const hoyTxt = hoy();

    return (
      <section className="ag-cal">
        <header className="ag-cal-cab">
          <button
            className="ag-cal-mover"
            data-tip={t("El mes anterior")}
            aria-label={t("El mes anterior")}
            onClick={() => {
              const v = mesVecino(anio, mes, -1);
              setAnio(v.anio);
              setMes(v.mes);
            }}
          >
            <ChevronIcon izq size={16} />
          </button>
          <h2>{nombreDelMes(anio, mes, lang)}</h2>
          <button
            className="ag-cal-mover"
            data-tip={t("El mes siguiente")}
            aria-label={t("El mes siguiente")}
            onClick={() => {
              const v = mesVecino(anio, mes, 1);
              setAnio(v.anio);
              setMes(v.mes);
            }}
          >
            <ChevronIcon der size={16} />
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
                <span className="cal-when">{whenText(v.date, t)}</span>
                <span className="cal-title stream-hide">
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noreferrer" onClick={abrirEnlacesFuera}>
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
