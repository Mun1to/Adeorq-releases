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

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useT } from "../lib/i18n";
import Espera from "./Espera";
import { latido } from "../lib/latido";
import { aHtml } from "../lib/markdown";
import {
  MAIN_ACCOUNT,
  nombreDeCuenta,
  planInfo,
  projectDirty,
  scanSessions,
  sessionContext,
  type Account,
  type ContextInfo,
  type DirtyReport,
  type PlanInfo,
  type SessionInfo,
} from "../lib/pty";
import { encaja } from "../lib/buscar";
import {
  cajonDe,
  igualQue,
  resumeHerramientas,
  sessionMessages,
  type Turno,
} from "../lib/conversacion";
import type { ModelAlias } from "../lib/models";
import { comoPeso, PESO, type Esfuerzo } from "../lib/router";
import { PROVIDERS, providerOf, sabe } from "../lib/providers";
import ProjectAvatar from "./ProjectAvatar";
import ProviderMark from "./ProviderMark";
import SkillsPanel from "./SkillsPanel";
import UsagePanel from "./UsagePanel";
import ArchivosPanel from "./ArchivosPanel";
import PanelDerecho, { type Cara } from "./PanelDerecho";
import {
  HiloConserje,
  PestanasConserje,
  subtituloFicha,
  useArranque,
  useConversacion,
  useFichasConserje,
  type ConserjeExec,
} from "./Conserje";
import Mascota from "./Mascota";
import { claveDe, conserjeSesion, conserjeSoltar, nuevoId, paneDe, pedidoPendiente, type Ficha, type Trabajo } from "../lib/conserje";
import { abrirEnlacesFuera } from "../lib/enlacesFuera";
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
  /** Devuelve si el mensaje llegó de verdad a una terminal. Que sea una
      promesa no es un detalle de implementación: la caja se vacía al enviar, y
      un `false` es lo único que permite devolverte lo escrito. */
  onEnviar: (
    s: SessionInfo,
    texto: string,
    modelo?: string,
    esfuerzo?: string,
  ) => Promise<boolean>;
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
  /** Lo que el conserje necesita para abrir sesiones y escribir en ellas. Sin
      esto (la instancia que no es la principal) no se enseña el conserje. */
  conserjeExec?: ConserjeExec;
  /** La cuenta predeterminada de Claude, que es con la que piensa Adeo, y
      cómo cambiarla desde el pie de la lista. */
  cuentaAdeo?: string;
  onCuentaAdeo?: (id: string) => void;
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


/**
 * Una burbuja, con su markdown ya convertido.
 *
 * Vive FUERA de `ChatView` y memoizada, y las dos cosas por el mismo motivo.
 * Fuera, porque un componente definido dentro de otro es un tipo nuevo en cada
 * render y React lo desmonta y lo vuelve a montar entero. Memoizada, porque la
 * conversación se relee cada tres segundos y convertir los 60 turnos otra vez
 * cuesta **30,6 ms medidos**, mientras que convertir solo el que ha cambiado
 * cuesta **0,43 ms**: setenta veces menos por el mismo resultado en pantalla.
 */
/** The projects root comes as «C:\proyectos (raíz)»: in a 288 px column the
    path says nothing the word does not. */
function proyectoCorto(p: string, t: (s: string) => string): string {
  return /\((raíz|root)\)$/.test(p) ? t("Raíz") : p;
}

/** «max» → «Max»: the plan as it reads on Claude's own page. */
function nombreDePlan(p: PlanInfo | null): string {
  const s = p?.subscription || p?.tier || "";
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Groups anything by the day boxes of the list (Hoy, Ayer, Esta semana…),
    keeping the order it comes in. */
function porCajones<T>(cosas: T[], horas: (x: T) => number, t: (s: string) => string): Array<[string, T[]]> {
  const cajones = new Map<string, T[]>();
  for (const x of cosas) {
    const c = cajonDe(horas(x), t);
    const l = cajones.get(c) ?? [];
    l.push(x);
    cajones.set(c, l);
  }
  return [...cajones];
}

/** Hours since an Adeo conversation was last touched. */
const horasDeFicha = (f: Ficha) => Math.max(0, (Date.now() / 1000 - f.cuando) / 3600);

/** Los turnos en bloques: cada pregunta tuya con lo que le contestaron. */
function enPares(turnos: Turno[]): Turno[][] {
  const pares: Turno[][] = [];
  for (const t of turnos) {
    if (t.rol === "tu" || !pares.length) pares.push([t]);
    else pares[pares.length - 1].push(t);
  }
  return pares;
}

/** La primera línea con algo, recortada: lo que cabe en la cabecera pegajosa. */
function primeraLinea(texto: string): string {
  const l = texto.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  return l.length > 140 ? `${l.slice(0, 139)}…` : l;
}

const Burbuja = memo(function Burbuja({ turno }: { turno: Turno }) {
  const { t } = useT();
  // El transcript es prosa en markdown, que es como lo escribe el agente.
  // Pintarlo en crudo sería enseñar asteriscos y comillas invertidas.
  //
  // Pasa por `markdown.ts` y no por `marked` a pelo: lo que hay aquí lo
  // escribió un modelo leyendo archivos que no son nuestros, y `marked` deja
  // pasar el HTML tal cual.
  const html = useMemo(() => aHtml(turno.texto), [turno.texto]);
  return (
    <article className="chat-turno" data-rol={turno.rol}>
      <div className="chat-burbuja" onClick={abrirEnlacesFuera} dangerouslySetInnerHTML={{ __html: html }} />
      {turno.herramientas.length > 0 && (
        <p className="chat-tools">{resumeHerramientas(turno.herramientas, t)}</p>
      )}
    </article>
  );
});

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
  conserjeExec,
  cuentaAdeo,
  onCuentaAdeo,
}: Props) {
  const { t, lang } = useT();
  const [sesiones, setSesiones] = useState<SessionInfo[]>([]);
  /** La conversación del conserje que está abierta, si lo está. Si vienes de
      la caja del Panel, la nueva con lo que pediste (`dejarPedido`). */
  const [conserjeId, setConserjeId] = useState<string | null>(() => pedidoPendiente()?.id ?? null);
  /** Dentro del conserje, qué pestaña se mira (`claveDe`): `null` es él. */
  const [mirando, setMirando] = useState<string | null>(null);
  const [versionLista, setVersionLista] = useState(0);
  const [conv, recargarConv] = useConversacion(conserjeId);
  const fichas = useFichasConserje(versionLista);
  const [pestana, setPestana] = useState<"adeo" | "sesiones">(conserjeExec ? "adeo" : "sesiones");
  const arranque = useArranque();
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
  /** Las cuentas de Claude con su plan, para el pie: la de Adeo y las demás. */
  const cuentasClaude = useMemo(() => {
    const suyas = cuentas.filter((a) => a.provider === MAIN_ACCOUNT.provider);
    return suyas.some((a) => a.id === MAIN_ACCOUNT.id) ? suyas : [MAIN_ACCOUNT, ...suyas];
  }, [cuentas]);
  const cuentaDeAdeo = cuentasClaude.find((a) => a.id === cuentaAdeo) ?? cuentasClaude[0];
  const [planes, setPlanes] = useState<Record<string, string>>({});
  const [eligeCuenta, setEligeCuenta] = useState(false);
  const yoRef = useRef<HTMLDivElement>(null);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  /** Lo que se dice justo encima de la caja cuando el envío no llegó. */
  const [seCayo, setSeCayo] = useState(false);
  /** La conversación abierta, mirable desde dentro de una promesa que empezó
      hace seis segundos. El estado de React de entonces ya no vale. */
  const abiertaRef = useRef<SessionInfo | null>(null);
  abiertaRef.current = abierta;
  const finRef = useRef<HTMLDivElement>(null);
  const hiloRef = useRef<HTMLDivElement>(null);
  /** Si estás pegado al final. Es un `ref` y no un estado a propósito: cambia
      con cada rueda del ratón y no tiene que repintar nada. */
  const pegado = useRef(true);

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

  // El plan de cada cuenta, para el pie. Se lee de sus credenciales sin tocar
  // los tokens.
  useEffect(() => {
    let vivo = true;
    for (const a of cuentasClaude) {
      planInfo(a.dir || undefined)
        .then((p) => vivo && setPlanes((antes) => ({ ...antes, [a.id]: nombreDePlan(p) })))
        .catch(() => {});
    }
    return () => {
      vivo = false;
    };
  }, [cuentasClaude]);

  // El menú de cuentas se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!eligeCuenta) return;
    const fuera = (e: MouseEvent) => {
      if (!yoRef.current?.contains(e.target as Node)) setEligeCuenta(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setEligeCuenta(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [eligeCuenta]);

  // La conversación abierta, y al ritmo del CLI: mientras el agente escribe, su
  // transcript crece, así que releerlo es lo que hace que la respuesta aparezca
  // sola. No cuesta nada: es un archivo del disco, no una llamada.
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    const leer = (primera: boolean) => {
      if (primera) setCargando(true);
      sessionMessages(abierta.cwd, abierta.id, 60)
        .then((ts) => vivo && setTurnos((antes) => (igualQue(antes, ts) ? antes : ts)))
        .catch((e) => vivo && setError(String(e)))
        .finally(() => vivo && setCargando(false));
      // El contexto y el estado salen del mismo transcript, así que se piden a
      // la vez: es lo que enciende el anillo y lo que dice si está trabajando.
      sessionContext(abierta.cwd, abierta.id)
        .then((c) => vivo && setCtx(c))
        .catch(() => {});
    };
    leer(true);
    // Ver `lib/latido.ts`: son DOS lecturas del transcript cada tres segundos,
    // o sea cuarenta viajes al disco por minuto que con la ventana tapada no
    // ve nadie. Al destapar se relee en el acto, así que no se ve una
    // conversación vieja ni un instante.
    const parar = latido(() => leer(false), REFRESCO_MS);
    return () => {
      vivo = false;
      parar();
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

  // Abajo del todo con cada turno nuevo, PERO solo si ya estabas abajo.
  //
  // Antes bajaba siempre, y como la conversación se relee cada tres segundos,
  // subir a leer algo mientras el agente escribía era imposible: al siguiente
  // turno te devolvía al final. Medido en Chromium con el código de antes: te
  // arrastraba **694 píxeles** de un salto, y otra vez con cada turno. Es la misma queja que las terminales (el
  // `ESC[3J` de xterm), con otra causa: aquí el culpable era nuestro código.
  //
  // Al cambiar de conversación sí se baja siempre, porque una conversación
  // recién abierta se lee por el final.
  useEffect(() => {
    if (pegado.current) finRef.current?.scrollIntoView({ block: "end" });
  }, [turnos.length]);

  useEffect(() => {
    pegado.current = true;
    finRef.current?.scrollIntoView({ block: "end" });
    // Y el aviso de «no pude enviar» se va con ella: hablaba de la de antes.
    setSeCayo(false);
  }, [abierta?.id]);

  /** Cuánto margen cuenta como «estoy abajo». Con 0 no valdría: el navegador
      da fracciones de píxel al redimensionar y la vista se despegaría sola. */
  const MARGEN_FINAL = 64;

  const mirarScroll = useCallback(() => {
    const el = hiloRef.current;
    if (!el) return;
    pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight <= MARGEN_FINAL;
  }, []);

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
    // Por proyecto, cada uno una sola vez de cabecera y sus conversaciones
    // debajo con cuánto hace (Munir, 2026-11-08: «que sea más sencillo de
    // ver»; antes iba por días, con el proyecto repetido en cada fila). El
    // escaneo trae lo más reciente primero, así que arriba queda el proyecto
    // que tocaste último.
    const grupos = new Map<string, SessionInfo[]>();
    for (const s of filtradas) {
      const p = proyectoCorto(s.project, t);
      grupos.set(p, [...(grupos.get(p) ?? []), s]);
    }
    return [...grupos];
  }, [sesiones, cliente, filtro, t]);

  /** Está trabajando ahora mismo: es lo que enciende el haz sobre la caja. */
  const trabajando = !!abierta && (ctx?.state === "a_medias" || (abierta.live && !ctx?.state));

  /**
   * Si a ESTE cliente se le pueden cambiar cerebro y esfuerzo por la terminal.
   *
   * El conmutador de arriba abre conversaciones de los 21 clientes de la casa,
   * pero los ajustes se mandan escribiendo `/model` y `/effort`, y eso solo lo
   * entiende quien lo declara en `providers.ts`. Enseñar las pastillas al resto
   * era ofrecer un botón que teclea una orden inventada delante de tu mensaje.
   */
  const ajustables = sabe(abierta?.fuente ?? "claude", "ajustesEnVivo");

  /**
   * Enviar, y devolver el texto si no llegó.
   *
   * La caja se vacía en el acto y no al confirmar, porque confirmar puede
   * tardar seis segundos (abrir la terminal, esperar a que el CLI pinte su
   * pantalla) y una caja que se queda llena todo ese rato parece que no ha
   * hecho nada, invita a darle otra vez y manda el mensaje dos veces.
   *
   * Lo que NO puede pasar es lo de antes: si la sesión no llegaba a abrirse,
   * `enviarAlChat` se rendía en silencio y el párrafo que habías escrito no
   * quedaba en ningún sitio, ni en la caja ni en la terminal.
   */
  const enviar = () => {
    const txt = texto.trim();
    if (!txt || !abierta) return;
    // A qué conversación se manda, capturado AHORA. Confirmar puede tardar seis
    // segundos y en ese rato te da tiempo a pinchar otra en la lista: sin esto,
    // el texto volvía a la caja de la que estuvieras mirando y el aviso hablaba
    // de una conversación que no era esa.
    const suya = abierta;
    setTexto("");
    setSeCayo(false);
    void onEnviar(suya, txt, modelo ?? undefined, esfuerzo ?? undefined).then((llego) => {
      if (llego) return;
      // Si ya estás en otra, no se toca su caja. El mensaje se ha perdido
      // igualmente, así que se dice por el sitio que no depende de dónde estés.
      if (abiertaRef.current?.id !== suya.id) {
        setError(t("No pude enviar tu mensaje a «{s}».", { s: suya.title || suya.cwd }));
        return;
      }
      setSeCayo(true);
      // Se devuelve delante de lo que hayas escrito mientras tanto, no encima:
      // en esos segundos puede haberte dado tiempo a empezar otra frase.
      setTexto((v) => (v.trim() ? `${txt}
${v}` : txt));
    });
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

  /* ── Las pestañas del conserje ────────────────────────────────────────────
     Una pestaña es un PANEL; lo que se pinta al pulsarla es la SESIÓN que corre
     en él, con la vista de siempre. La sesión se encuentra por el id que lleva
     el panel. Recién abierta puede no estar aún en el escaneo (el CLI tarda un
     segundo en escribir su transcript), así que se relee hasta que aparece. */
  const trabajoDe = useCallback(
    (clave: string): Trabajo | undefined => conv?.trabajos.find((w) => claveDe(w) === clave),
    [conv],
  );
  /** El panel de la pestaña, si sigue siendo el suyo (ver `paneDe`). */
  const panelDe = useCallback(
    (clave: string) => {
      const w = trabajoDe(clave);
      return w && conserjeExec ? paneDe(w, conserjeExec.panes(), arranque) : undefined;
    },
    [trabajoDe, conserjeExec, arranque],
  );
  const sesionDePanel = useCallback(
    (clave: string): SessionInfo | null => {
      // Del panel si sigue abierto; si ya se cerró, del id que se apuntó en la
      // pestaña. La conversación sigue en el disco aunque el panel no exista.
      const sid = panelDe(clave)?.sessionId || trabajoDe(clave)?.sesion;
      return sid ? (sesiones.find((s) => s.id === sid) ?? null) : null;
    },
    [panelDe, trabajoDe, sesiones],
  );

  // Apuntar en cada pestaña su sesión en cuanto el panel la dice. Es lo que
  // deja volver a ella cuando cierres el panel. Solo con SU panel: el de otro
  // arranque con el mismo número le apuntaría la sesión de otra terminal.
  useEffect(() => {
    if (!conserjeId || !conserjeExec || !conv) return;
    const panes = conserjeExec.panes();
    const sinSesion = conv.trabajos.filter((w) => !w.sesion);
    const cambios = sinSesion
      .map((w) => ({ w, sid: paneDe(w, panes, arranque)?.sessionId }))
      .filter((x): x is { w: typeof x.w; sid: string } => !!x.sid);
    if (!cambios.length) return;
    void Promise.all(cambios.map(({ w, sid }) => conserjeSesion(conserjeId, w, sid))).then(recargarConv);
  }, [conserjeId, conserjeExec, conv, recargarConv, arranque]);

  const soltarPestana = (w: Trabajo) => {
    if (!conserjeId) return;
    if (mirando === claveDe(w)) {
      setMirando(null);
      setAbierta(null);
    }
    void conserjeSoltar(conserjeId, w).then(recargarConv);
  };

  const irAPestana = (clave: string | null) => {
    setMirando(clave);
    setAbierta(clave === null ? null : sesionDePanel(clave));
  };

  useEffect(() => {
    if (mirando === null || abierta) return;
    const s = sesionDePanel(mirando);
    if (s) return setAbierta(s);
    const otra = window.setTimeout(releer, 1500);
    return () => window.clearTimeout(otra);
  }, [mirando, abierta, sesionDePanel, releer]);

  const abrirConserje = (id: string) => {
    setConserjeId(id);
    setMirando(null);
    setAbierta(null);
  };

  /** La vista de una sesión: la misma dentro del conserje (al pulsar su
      pestaña) y fuera (al elegirla en la lista). Se llama como función y no
      como componente a propósito: usa el estado de aquí y no tiene hooks, y
      declararla como componente dentro de este la remontaría en cada render. */
  const pintarSesion = (abierta: SessionInfo) => (
    <>
      <header className="chat-cabecera">
        <ProjectAvatar name={abierta.project} className="pavatar-mini" />
        <span className="chat-cab-id">
          <strong>{abierta.title === "(sin título)" ? t("(sin título)") : abierta.title || t("sin título")}</strong>
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

      <div className="chat-turnos" ref={hiloRef} onScroll={mirarScroll}>
        <Espera activo={cargando && !turnos.length} className="chat-vacio">
          {t("Leyendo…")}
        </Espera>
        {!cargando && !turnos.length && (
          <p className="chat-vacio">{t("Esta conversación todavía no tiene nada escrito.")}</p>
        )}
        {/* Cada pregunta tuya con las respuestas que le siguen, en un mismo
            bloque: así la línea pegada (`.chat-ancla`) se queda arriba
            mientras bajas por ESA respuesta y la siguiente pregunta la empuja.
            Sueltas en el hilo, dos pegadas se apilaban una encima de otra
            (medido en el banco: las dos a 21 px del borde). */}
        {enPares(turnos).map((par, i) => (
          <section key={i} className="chat-par">
            <Burbuja turno={par[0]} />
            {/* Entre la pregunta y las respuestas: solo pegada mientras hay
                respuesta por debajo que leer. */}
            {par[0].rol === "tu" && par.length > 1 && (
              <div className="chat-ancla" aria-hidden="true">
                {primeraLinea(par[0].texto)}
              </div>
            )}
            {par.slice(1).map((turno, j) => (
              <Burbuja key={j} turno={turno} />
            ))}
          </section>
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
          {seCayo && (
            <span className="chat-cayo">
              {t("No he podido abrir esa conversación, así que te devuelvo lo escrito.")}
            </span>
          )}
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
              onChange={(e) => {
                setTexto(e.currentTarget.value);
                if (seCayo) setSeCayo(false);
              }}
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

            {ajustables && (
              <>
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
              </>
            )}


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
  );

  // ── La barra de la izquierda: Adeo y Sesiones, en dos pestañas ────────────
  // Munir eligió esta forma el 2026-11-08 entre tres: una sola lista a la vez,
  // entera, en vez de las conversaciones de Adeo cortadas en cinco encima de
  // las sesiones.
  const abrirSesion = (s: SessionInfo) => {
    // Una sesión de la lista se abre FUERA del conserje: es la vista de
    // siempre, sin sus pestañas encima.
    setConserjeId(null);
    setMirando(null);
    setAbierta(s);
  };
  const tituloDe = (s: SessionInfo) => (s.title === "(sin título)" ? t("(sin título)") : s.title || t("sin título"));
  // One line per conversation: its title, and on the right how long ago (or
  // «abierta» when it is running in a terminal). The full line in the tooltip.
  const filaSesion = (s: SessionInfo) => (
    <button
      key={`s-${s.id}`}
      className="chat-fila"
      data-on={!conserjeId && abierta?.id === s.id}
      data-tip={`${tituloDe(s)}\n${s.project}`}
      onClick={() => abrirSesion(s)}
    >
      <span className="chat-fila-tit">{tituloDe(s)}</span>
      <span className="chat-fila-der" data-viva={s.live}>
        {s.live ? t("abierta") : s.ago}
      </span>
    </button>
  );
  const filaAdeo = (f: Ficha) => (
    <button
      key={`a-${f.id}`}
      className="chat-fila"
      data-on={conserjeId === f.id}
      data-tip={`${f.titulo || t("Conversación nueva")}\n${subtituloFicha(f, t, lang)}`}
      onClick={() => abrirConserje(f.id)}
    >
      <span className="chat-fila-tit">{f.titulo || t("Conversación nueva")}</span>
      <span className="chat-fila-der">{subtituloFicha(f, t, lang).split(" · ")[0]}</span>
    </button>
  );
  const cajones = (grupos: Array<[string, ReactElement[]]>, vacio: string) => (
    <div className="chat-cajones">
      {grupos.map(([cajon, filas]) => (
        <section key={cajon} className="chat-cajon">
          <button className="chat-cajon-tit" onClick={() => pliega(cajon)}>
            <span>{cajon}</span>
            <ChevronIcon size={12} up={!plegados.has(cajon)} />
          </button>
          {!plegados.has(cajon) && filas}
        </section>
      ))}
      {!grupos.length && <p className="chat-vacio">{vacio}</p>}
    </div>
  );
  const buscador = (
    <label className="chat-buscar">
      <SearchIcon size={14} />
      <input
        className="finder"
        value={filtro}
        placeholder={t("Buscar conversaciones…")}
        onChange={(e) => setFiltro(e.currentTarget.value)}
      />
    </label>
  );
  const q = filtro.trim();
  const sinPalabras = t("Ninguna conversación con esas palabras.");
  const enAdeo = !!conserjeExec && pestana === "adeo";
  const fichasVistas = q ? fichas.filter((f) => encaja(f.titulo, filtro)) : fichas;

  return (
    <div className="chat-view">
      {/* ── Izquierda: las conversaciones ─────────────────────────────── */}
      <aside className="chat-lista">
        {conserjeExec && (
          <div className="chat-pestanas" role="tablist">
            <button className="chat-pestana" role="tab" data-on={enAdeo} onClick={() => setPestana("adeo")}>
              <Mascota animo="quieta" alto={16} />
              Adeo
            </button>
            <button className="chat-pestana" role="tab" data-on={!enAdeo} onClick={() => setPestana("sesiones")}>
              {t("Sesiones")}
            </button>
          </div>
        )}
        {enAdeo ? (
          <>
            <button className="cj-nueva" onClick={() => abrirConserje(nuevoId())}>
              <Mascota animo="quieta" alto={16} />
              {t("Hablar con Adeo")}
            </button>
            {buscador}
            {cajones(
              porCajones(fichasVistas, horasDeFicha, t).map(([c, fs]) => [c, fs.map(filaAdeo)]),
              q ? sinPalabras : t("Todavía no has hablado con Adeo."),
            )}
          </>
        ) : (
          <>
            {/* Solo las marcas, en fila. El nombre lo dice el tooltip: con
                nueve clientes posibles, escribirlos se come la columna. */}
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
                      setConserjeId(null);
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
            {buscador}
            {cajones(
              lista.map(([p, ss]) => [p, ss.map(filaSesion)]),
              q ? sinPalabras : t("Todavía no tienes sesiones. Empieza una con «Nueva conversación»."),
            )}
          </>
        )}

        {/* El pie: cómo está el repo de lo que estás tocando, y con qué cuenta
            piensa Adeo, que es la predeterminada y se cambia aquí mismo
            (Munir, 2026-11-08). Los dos datos son de verdad: un `git status`
            y tus credenciales, sin tocar el token. */}
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
        <div className="chat-yo-sitio" ref={yoRef}>
          {eligeCuenta && (
            <div className="chat-cuentas" role="menu">
              <p className="chat-cuentas-tit">{t("Adeo piensa con esta cuenta")}</p>
              {cuentasClaude.map((a) => (
                <button
                  key={a.id}
                  className="chat-cuenta"
                  role="menuitemradio"
                  aria-checked={a.id === cuentaDeAdeo.id}
                  data-on={a.id === cuentaDeAdeo.id}
                  onClick={() => {
                    onCuentaAdeo?.(a.id);
                    setEligeCuenta(false);
                  }}
                >
                  <strong>{nombreDeCuenta(a.label, t)}</strong>
                  <em>{planes[a.id] || t("sin plan detectado")}</em>
                </button>
              ))}
            </div>
          )}
          <button
            className="chat-yo"
            data-abierto={eligeCuenta}
            disabled={cuentasClaude.length < 2}
            data-tip={cuentasClaude.length < 2 ? undefined : t("Cambiar la cuenta con la que piensa Adeo")}
            onClick={() => setEligeCuenta((v) => !v)}
          >
            <span className="chat-yo-marca" style={{ color: providerOf("claude").hue }}>
              <ProviderMark id="claude" />
            </span>
            <span className="chat-yo-txt">
              <strong>{nombreDeCuenta(cuentaDeAdeo.label, t)}</strong>
              <em>{[planes[cuentaDeAdeo.id], t("la usa Adeo")].filter(Boolean).join(" · ")}</em>
            </span>
            {cuentasClaude.length > 1 && <ChevronIcon size={12} up={!eligeCuenta} />}
          </button>
        </div>
        {error && <p className="side-error">{error}</p>}
      </aside>

      {/* ── Centro: la conversación ───────────────────────────────────── */}
      <main className="chat-hilo">
        {conserjeId && conserjeExec ? (
          <>
            <PestanasConserje
              trabajos={conv?.trabajos ?? []}
              panes={conserjeExec.panes()}
              viendo={mirando}
              onIr={irAPestana}
              onSoltar={soltarPestana}
            />
            {mirando === null ? (
              <HiloConserje
                id={conserjeId}
                conv={conv}
                exec={conserjeExec}
                onIr={irAPestana}
                onCambio={() => {
                  recargarConv();
                  setVersionLista((v) => v + 1);
                }}
              />
            ) : abierta ? (
              pintarSesion(abierta)
            ) : panelDe(mirando) ? (
              <div className="chat-elige">
                <p className="chat-elige-tit">{t("La sesión está arrancando…")}</p>
                <p className="chat-elige-sub">
                  {t("En cuanto escriba su primera línea aparece aquí. Si prefieres verla ya, está en la Cabina.")}
                </p>
              </div>
            ) : (
              // Un panel que ya no existe y cuya sesión no llegó a escribir
              // nada: esperar a que «arranque» sería esperar para siempre.
              <div className="chat-elige">
                <p className="chat-elige-tit">{t("Esta sesión se cerró sin llegar a escribir nada.")}</p>
                <p className="chat-elige-sub">{t("Puedes quitar su pestaña con la ✕, o pedirle a Adeo que la abra otra vez.")}</p>
              </div>
            )}
          </>
        ) : abierta ? (
          pintarSesion(abierta)
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
            pista={t("Clic en una skill para meterla en la caja de escribir.")}
          />
        }
        uso={<UsagePanel onUsage={abierta ? () => onUsage(abierta) : null} cuentas={cuentas} />}
        archivos={
          <ArchivosPanel
            raiz={raizArchivos}
            onAbrir={onAbrirArchivo}
            sesion={abierta ? { cwd: abierta.cwd, sessionId: abierta.id, cli: abierta.fuente ?? "claude" } : null}
          />
        }
      />
    </div>
  );
}
