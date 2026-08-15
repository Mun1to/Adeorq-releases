// La cara de chat: la misma máquina, con la consola escondida.
//
// No es otro producto ni otra app. Cada conversación de esta lista es una
// sesión de Claude Code de verdad, la misma que en la Cabina sale como una
// terminal: aquí se lee su transcript y se pinta como lo que es, una
// conversación, y lo que escribes abajo baja al mismo PTY.
//
// Por qué NO va por clave de API, que era la decisión bloqueada desde el
// 2026-08-01 (`docs/CHAT.md` §3): un chat que parece normal y por detrás cobra
// por tokens es una factura sorpresa. Yendo contra tu CLI gasta tu suscripción,
// que es lo que ya pagas, y de paso las dos caras no se convierten en dos apps
// que mantener.
//
// El aspecto sale de las referencias que trajo Munir el 2026-08-06 (Clodex).
// Lo que se ha copiado y lo que NO, y por qué:
//   · SÍ el conmutador de cliente, la lista por días, el par «Limpio/Terminal»,
//     la caja con sus pastillas, el selector de modelo en dos familias y el
//     anillo del contexto: todos esos datos Adeorq ya los tiene de verdad.
//   · NO el selector de permisos de cinco niveles. Se puede CAMBIAR el modo
//     (es Mayús+Tab dentro del CLI) pero no se puede LEER en cuál estás, y una
//     pastilla que enseña un estado que no ha comprobado miente. Vuelve cuando
//     el CLI lo publique.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { useT } from "../lib/i18n";
import {
  planInfo,
  projectDirty,
  scanSessions,
  sessionContext,
  type Account,
  type ContextInfo,
  type DirtyReport,
  type SessionInfo,
} from "../lib/pty";
import { encaja } from "../lib/buscar";
import { cajonDe, resumeHerramientas, sessionMessages, type Turno } from "../lib/conversacion";
import type { ModelAlias } from "../lib/models";
import { comoPeso, PESO, type Esfuerzo } from "../lib/router";
import { PROVIDERS, providerOf } from "../lib/providers";
import { hueOf } from "../lib/colors";
import ProjectAvatar from "./ProjectAvatar";
import ProviderMark from "./ProviderMark";
import SkillsPanel from "./SkillsPanel";
import ArchivosPanel from "./ArchivosPanel";
import PanelDerecho, { type Cara } from "./PanelDerecho";
import {
  ChatIcon,
  ChevronIcon,
  GitBranchIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  TerminalIcon,
} from "./Icons";

interface Props {
  /** Manda lo escrito a esa sesión: la abre si hace falta y la enfoca. */
  onEnviar: (s: SessionInfo, texto: string, modelo?: string, esfuerzo?: string) => void;
  /** Abrirla como terminal de verdad, para quien quiera ver la consola. */
  onResume: (s: SessionInfo) => void;
  /** El ＋ de siempre: elegir carpeta y herramienta. */
  onNueva: () => void;
  /** Las cuentas de Claude, para el panel de la derecha. */
  cuentas: Account[];
  /** Qué panel de la derecha se ve. Lo lleva App porque es el mismo en las dos
      vistas y hay dos instancias montadas a la vez. */
  cara: Cara;
  onCara: (c: Cara) => void;
  /** La carpeta del explorador y qué hacer al abrir un archivo. Abrirlo lleva a
      la Cabina, que es donde vive el mosaico. */
  raizArchivos: string;
  onAbrirArchivo: (ruta: string) => void;
  /** Abrir la vista previa de la web. Igual que un archivo: lleva a la Cabina,
      que es donde vive el mosaico. */
  onWeb: () => void;
  /** Teclear `/usage` en la conversación abierta y llevarte a verla. */
  onUsage: (s: SessionInfo) => void;
}

/** Cada cuánto se relee la conversación abierta. El transcript lo escribe el
    CLI mientras trabaja, así que sin esto la respuesta no aparecería nunca. */
const REFRESCO_MS = 3_000;

/** Los tres esfuerzos que se eligen aquí. Los cinco del router caben en el
    Asistente, que es donde se decide despacio; en una caja de escribir, cinco
    pastillas son cinco decisiones antes de cada frase. */
const ESFUERZOS_CAJA: Esfuerzo[] = ["low", "medium", "high"];

/**
 * Los cerebros del selector, cada uno con PARA QUÉ es.
 *
 * Nació copiando el Lite/Frontier de la referencia, con sus dos cabeceras y un
 * punto de color por fila, y Munir lo cortó al verlo: para cuatro filas, dos
 * cabeceras son dos renglones que no dicen nada y el punto de color repite lo
 * que ya dice el peso. Lo que faltaba era lo contrario, la única cosa que
 * ayuda a elegir: qué hace bien cada uno. Sale de la misma tabla que usa el
 * router (`models.ts`), así que las dos pantallas no pueden decir cosas
 * distintas.
 */
const CEREBROS: Array<{ id: ModelAlias; para: string }> = [
  { id: "haiku", para: "recados: renombrar, traducir, formatear" },
  { id: "sonnet", para: "el día a día: escribir, refactorizar, probar" },
  { id: "opus", para: "juicio: seguridad, revisión, bugs difíciles" },
  { id: "fable", para: "lo más caro que hay; solo si sabes por qué" },
];

// El conmutador de arriba NO lleva una lista escrita a mano. Nació con «Claude
// Code» y «Codex» y Munir lo cortó al verlo (2026-08-06): en esta casa hay
// nueve clientes, y dos nombres largos ocupando la columna entera dicen que
// solo existen esos dos. Ahora salen TODOS los que de verdad tienen
// conversaciones, y solo por su marca.

export default function ChatView({
  onEnviar,
  onResume,
  onNueva,
  cuentas,
  cara,
  onCara,
  raizArchivos,
  onAbrirArchivo,
  onWeb,
  onUsage,
}: Props) {
  const { t } = useT();
  const [sesiones, setSesiones] = useState<SessionInfo[]>([]);
  const [cliente, setCliente] = useState<string>("claude");
  const [abierta, setAbierta] = useState<SessionInfo | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [texto, setTexto] = useState("");
  const [modelo, setModelo] = useState<ModelAlias | null>(null);
  const [esfuerzo, setEsfuerzo] = useState<Esfuerzo | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [ctx, setCtx] = useState<ContextInfo | null>(null);
  const [git, setGit] = useState<DirtyReport | null>(null);
  const [plan, setPlan] = useState<string>("");
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const finRef = useRef<HTMLDivElement>(null);

  // Las sesiones, como las lee la barra. Sin las muertas: en un chat, una
  // conversación de hace tres meses no es historia, es ruido.
  const releer = useCallback(() => {
    scanSessions()
      .then((list) => setSesiones(list.filter((s) => s.fresh !== "muerta")))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    releer();
  }, [releer]);

  // Tu plan, para el pie. Se lee de tus credenciales sin tocar los tokens.
  useEffect(() => {
    planInfo()
      .then((p) => p && setPlan(p.subscription || p.tier))
      .catch(() => {});
  }, []);

  // La conversación abierta, y al ritmo del CLI: mientras el agente escribe, su
  // transcript crece, así que releerlo es lo que hace que la respuesta aparezca
  // sola. No cuesta nada: es un archivo del disco, no una llamada.
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    const leer = (primera: boolean) => {
      if (primera) setCargando(true);
      sessionMessages(abierta.cwd, abierta.id, 60)
        .then((ts) => vivo && setTurnos(ts))
        .catch((e) => vivo && setError(String(e)))
        .finally(() => vivo && setCargando(false));
      // El contexto y el estado salen del mismo transcript, así que se piden a
      // la vez: es lo que enciende el anillo y lo que dice si está trabajando.
      sessionContext(abierta.cwd, abierta.id)
        .then((c) => vivo && setCtx(c))
        .catch(() => {});
    };
    leer(true);
    const id = window.setInterval(() => leer(false), REFRESCO_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [abierta?.id, abierta?.cwd]);

  // Cómo está su repo, para la tarjeta del pie. Solo al cambiar de proyecto:
  // un `git status` cada tres segundos es trabajo de disco para nada.
  useEffect(() => {
    if (!abierta?.cwd) return setGit(null);
    let vivo = true;
    projectDirty(abierta.cwd)
      .then((d) => vivo && setGit(d))
      .catch(() => vivo && setGit(null));
    return () => {
      vivo = false;
    };
  }, [abierta?.cwd]);

  // Abajo del todo al abrir y con cada turno nuevo: una conversación que no
  // sigue al texto obliga a arrastrar la barra mientras el agente escribe.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [turnos.length, abierta?.id]);

  /** Qué clientes enseñar arriba: los que de verdad tienen conversaciones, en
      el orden de `providers.ts`. Uno sin sesiones no sale: un botón que lleva a
      una lista vacía es un botón que decepciona. */
  const clientes = useMemo(() => {
    const hay = new Set<string>(sesiones.map((s) => s.fuente ?? "claude"));
    return PROVIDERS.map((p) => p.id).filter((id) => hay.has(id));
  }, [sesiones]);

  const lista = useMemo(() => {
    const suyas = sesiones.filter((s) => (s.fuente ?? "claude") === cliente);
    const filtradas = filtro.trim()
      ? suyas.filter((s) => encaja(`${s.title} ${s.project}`, filtro))
      : suyas;
    // Por cajones de tiempo, como en las capturas: Hoy, Ayer, Esta semana. El
    // orden dentro es el que ya trae el escaneo (lo más reciente primero).
    const cajones = new Map<string, SessionInfo[]>();
    for (const s of filtradas) {
      const c = cajonDe(s.hours, t);
      const l = cajones.get(c) ?? [];
      l.push(s);
      cajones.set(c, l);
    }
    return [...cajones];
  }, [sesiones, cliente, filtro, t]);

  /** Está trabajando ahora mismo: es lo que enciende el haz sobre la caja. */
  const trabajando = !!abierta && (ctx?.state === "a_medias" || (abierta.live && !ctx?.state));

  const enviar = () => {
    const txt = texto.trim();
    if (!txt || !abierta) return;
    onEnviar(abierta, txt, modelo ?? undefined, esfuerzo ?? undefined);
    setTexto("");
  };

  /** Una skill del panel de la derecha entra en la CAJA, no en la terminal.
      En la Cabina se pega dentro del pane porque allí la conversación ES la
      terminal; aquí todo lo que sale pasa antes por este cuadro, así que
      dejarla donde estás escribiendo es lo que permite retocarla o añadirle
      algo antes de mandarla. */
  const meterSkill = (txt: string) =>
    setTexto((v) => (!v ? txt : /\s$/.test(v) ? v + txt : `${v} ${txt}`));

  const pliega = (cajon: string) =>
    setPlegados((prev) => {
      const s = new Set(prev);
      if (s.has(cajon)) s.delete(cajon);
      else s.add(cajon);
      return s;
    });

  return (
    <div className="chat-view">
      {/* ── Izquierda: las conversaciones ─────────────────────────────── */}
      <aside className="chat-lista">
        {/* Solo las marcas, en fila. El nombre lo dice el tooltip: con nueve
            clientes posibles, escribirlos se come la columna y además obliga a
            elegir cuáles caben. */}
        {clientes.length > 1 && (
          <div className="chat-clientes">
            {clientes.map((id) => (
              <button
                key={id}
                className="chat-cliente"
                data-on={cliente === id}
                data-tip={providerOf(id).label}
                style={{ ["--c" as string]: providerOf(id).hue }}
                onClick={() => {
                  setCliente(id);
                  setAbierta(null);
                }}
              >
                <ProviderMark id={id} />
              </button>
            ))}
          </div>
        )}

        <button className="chat-nueva" onClick={onNueva}>
          <PencilIcon size={14} /> {t("Nueva conversación")}
        </button>

        <label className="chat-buscar">
          <SearchIcon size={14} />
          <input
            className="finder"
            value={filtro}
            placeholder={t("Buscar conversaciones…")}
            onChange={(e) => setFiltro(e.currentTarget.value)}
          />
        </label>

        <div className="chat-cajones">
          {lista.map(([cajon, ss]) => (
            <section key={cajon} className="chat-cajon">
              <button className="chat-cajon-tit" onClick={() => pliega(cajon)}>
                <span>{cajon}</span>
                <ChevronIcon size={12} up={!plegados.has(cajon)} />
              </button>
              {!plegados.has(cajon) &&
                ss.map((s) => (
                  <button
                    key={s.id}
                    className="chat-fila"
                    data-on={abierta?.id === s.id}
                    style={{ ["--c" as string]: hueOf(s.project) }}
                    onClick={() => setAbierta(s)}
                  >
                    <span className="chat-fila-txt">
                      <span className="chat-fila-tit">{s.title || t("sin título")}</span>
                      <span className="chat-fila-sub">
                        {s.project}
                        {s.live && <span className="live-dot" />}
                      </span>
                    </span>
                  </button>
                ))}
            </section>
          ))}
          {!lista.length && (
            <p className="chat-vacio">
              {filtro.trim()
                ? t("Ninguna conversación con esas palabras.")
                : t("Todavía no hay conversaciones. Empieza una con el botón de arriba.")}
            </p>
          )}
        </div>

        {/* El pie de la referencia: cómo está el repo de lo que estás tocando,
            y quién eres. Los dos datos son de verdad: el primero es un `git
            status` y el segundo sale de tus credenciales, sin tocar el token. */}
        {git?.isRepo && (
          <div className="chat-git">
            <GitBranchIcon size={14} />
            <span className="chat-git-txt">
              <strong>{abierta?.project}</strong>
              <em>
                {git.total > 0
                  ? t("{n} archivos sin guardar", { n: git.total })
                  : t("todo guardado")}
              </em>
            </span>
          </div>
        )}
        <footer className="chat-yo">
          <ProjectAvatar name={plan || "Adeorq"} className="pavatar-mini" />
          <span className="chat-yo-txt">
            <strong>{providerOf(cliente).label}</strong>
            <em>{plan || t("sin plan detectado")}</em>
          </span>
        </footer>
        {error && <p className="side-error">{error}</p>}
      </aside>

      {/* ── Centro: la conversación ───────────────────────────────────── */}
      <main className="chat-hilo">
        {abierta ? (
          <>
            <header className="chat-cabecera">
              <ProjectAvatar name={abierta.project} className="pavatar-mini" />
              <span className="chat-cab-id">
                <strong>{abierta.title || t("sin título")}</strong>
                <em>{abierta.cwd}</em>
              </span>
              {/* El par de la referencia: la misma sesión, limpia o en crudo.
                  La consola no desaparece, se aparta. */}
              <div className="chat-modo">
                <button className="chat-modo-b" data-on>
                  {t("Limpio")}
                </button>
                <button className="chat-modo-b" onClick={() => onResume(abierta)}>
                  <TerminalIcon size={13} /> {t("Terminal")}
                </button>
              </div>
            </header>

            <div className="chat-turnos">
              {cargando && !turnos.length && <p className="chat-vacio">{t("Leyendo…")}</p>}
              {!cargando && !turnos.length && (
                <p className="chat-vacio">{t("Esta conversación todavía no tiene nada escrito.")}</p>
              )}
              {turnos.map((turno, i) => (
                <article key={i} className="chat-turno" data-rol={turno.rol}>
                  <div
                    className="chat-burbuja"
                    // El transcript es prosa en markdown, que es como lo
                    // escribe el agente. Pintarlo en crudo sería enseñar
                    // asteriscos y comillas invertidas.
                    dangerouslySetInnerHTML={{ __html: marked.parse(turno.texto) as string }}
                  />
                  {turno.herramientas.length > 0 && (
                    <p className="chat-tools">{resumeHerramientas(turno.herramientas)}</p>
                  )}
                </article>
              ))}
              <div ref={finRef} />
            </div>

            {/* ── La caja ───────────────────────────────────────────────
                El cuadro de composición propio, que es lo que permite que un
                agente lea lo que escribes ANTES de que salga: dentro de una
                terminal el texto va directo al CLI y Adeorq no lo tiene
                (`docs/CHAT.md` §2).

                El haz de luz de la referencia se hace con CSS y no con el
                componente WebGL que mandó Munir: aquel revela el contenido
                capturándolo con `drawElementImage`, que es experimental de
                Chromium y NO está en el WebView2 que embarca Adeorq. Con CSS
                sale la luz, que es lo que se ve, y sin un lienzo por encima
                del texto. */}
            <div className="chat-caja-zona">
              <span className="chat-haz" data-on={trabajando} aria-hidden="true" />
              <div className="chat-caja" data-trabajando={trabajando}>
                {trabajando && (
                  <span className="chat-live">
                    {t("Se lo digo ahora: entra en cuanto termine lo de ahora")}
                  </span>
                )}
                <div className="chat-caja-fila">
                  <button className="chat-mas" data-tip={t("Nueva conversación")} onClick={onNueva}>
                    <PlusIcon size={15} />
                  </button>
                  <textarea
                    className="chat-input"
                    value={texto}
                    rows={2}
                    placeholder={
                      trabajando
                        ? t("Añade algo más: se lo paso a continuación…")
                        : t("Escribe aquí. Enter envía, Mayús+Enter hace un párrafo.")
                    }
                    onChange={(e) => setTexto(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                  />
                  <button
                    className="chat-enviar"
                    disabled={!texto.trim()}
                    data-tip={t("Enviar")}
                    onClick={enviar}
                  >
                    <SendIcon size={15} />
                  </button>
                </div>

                <div className="chat-pastillas">
                  <span className="chat-donde">
                    <ProjectAvatar name={abierta.project} className="pavatar-mini" />
                    {abierta.project}
                  </span>

                  <span className="chat-hueco" />

                  {/* El cerebro, con su selector en dos familias. Cerrado
                      enseña lo puesto; abierto, lo que pesa cada uno. */}
                  <div className="chat-modelo">
                    <button
                      className="chat-pastilla chat-pastilla-fuerte"
                      data-on={eligiendo}
                      onClick={() => setEligiendo((v) => !v)}
                    >
                      {modelo ?? t("Automático")}
                      <ChevronIcon size={11} up={eligiendo} />
                    </button>
                    {eligiendo && (
                      <div className="chat-menu">
                        <button
                          className="chat-menu-fila"
                          data-on={modelo === null}
                          onClick={() => {
                            setModelo(null);
                            setEligiendo(false);
                          }}
                        >
                          <span className="chat-menu-txt">
                            <strong>{t("Automático")}</strong>
                            <em>{t("lo elige el router según la tarea y tu semana")}</em>
                          </span>
                        </button>
                        <span className="chat-menu-raya" />
                        {CEREBROS.map((c) => (
                          <button
                            key={c.id}
                            className="chat-menu-fila"
                            data-on={modelo === c.id}
                            onClick={() => {
                              setModelo(c.id);
                              setEligiendo(false);
                            }}
                          >
                            <span className="chat-menu-txt">
                              <strong>{c.id}</strong>
                              <em>{t(c.para)}</em>
                            </span>
                            {/* Lo que pesa, dibujado además de escrito: cuatro
                                muescas dicen «×5 sobre ×10» sin hacer la
                                cuenta. No es dinero y por eso no lleva €: con
                                una suscripción no existe esa factura. */}
                            <span className="chat-peso" data-tip={t("Lo que pesa: {p}", { p: comoPeso(c.id) })}>
                              {[1, 3, 5, 10].map((n) => (
                                <i key={n} data-on={PESO[c.id] >= n} />
                              ))}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {ESFUERZOS_CAJA.map((e) => (
                    <button
                      key={e}
                      className="chat-pastilla"
                      data-on={esfuerzo === e}
                      onClick={() => setEsfuerzo(esfuerzo === e ? null : e)}
                    >
                      {e}
                    </button>
                  ))}

                  {/* El anillo del contexto, como en las capturas. Sale del
                      transcript, así que es el de verdad y no una estimación. */}
                  {ctx && (
                    <span
                      className="chat-ctx"
                      data-tip={t("{u} de {w} tokens usados", {
                        u: ctx.used.toLocaleString(),
                        w: ctx.window.toLocaleString(),
                      })}
                    >
                      <span
                        className="chat-ctx-anillo"
                        data-alto={ctx.percent >= 80}
                        style={{ ["--p" as string]: `${Math.min(ctx.percent, 100)}%` }}
                      />
                      {ctx.percent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="chat-elige">
            <ChatIcon size={22} />
            <p className="chat-elige-tit">{t("Elige una conversación a la izquierda.")}</p>
            <p className="chat-elige-sub">
              {t(
                "Son tus sesiones de siempre, las mismas de la Cabina: aquí se leen como una conversación en vez de como una consola, y lo que escribas va a la misma terminal.",
              )}
            </p>
          </div>
        )}
      </main>

      {/* ── Derecha: la misma barra que la Cabina ──────────────────────────
          No es una copia: son los mismos componentes, y lo único que cambia
          entre las dos vistas va por fuera (dónde cae la skill, y qué es «la
          terminal» aquí). Sale de la decisión 5 del rumbo del 2026-08-13, que
          pedía los paneles de la derecha en los DOS modos. */}
      <PanelDerecho
        cara={cara}
        onCara={onCara}
        onWeb={onWeb}
        skills={
          <SkillsPanel
            canPaste={!!abierta}
            onUse={meterSkill}
            onUsage={abierta ? () => onUsage(abierta) : null}
            cuentas={cuentas}
            pista={t("Clic en una skill para meterla en la caja de escribir.")}
          />
        }
        archivos={<ArchivosPanel raiz={raizArchivos} onAbrir={onAbrirArchivo} />}
      />
    </div>
  );
}
