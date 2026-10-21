// El conserje, dentro de la vista Chat: el chat principal que lo conecta todo.
//
// Munir, 2026-09-30: «Es todo en un chat y dentro de ese chat se ven diferentes
// pestañas o cosas trabajando; si haces clic vas a esa sesión. El chat principal
// es un conserje que conecta todo. La mejora de prompt: le das, se mejora y lo
// envías.» La forma se eligió en una maqueta con el CSS de la app sobre su foto
// (`scratchpad/conserje`), antes de construirla aquí.
//
// Tres piezas, las tres fuera de `ChatView` (un componente declarado dentro de
// otro se remonta en cada render y pierde el foco del teclado, ver
// `scripts/anidado-check.mjs`):
//
//   ListaConserje     la sección de la izquierda, encima de las sesiones;
//   PestanasConserje  la tira de pestañas: el conserje y lo que trabaja;
//   HiloConserje      la conversación con él y su caja, con Mejorar y el router.
//
// Lo que hace de verdad (llamar al modelo, la reja, el índice) vive en
// `src-tauri/src/conserje.rs`; lo que decide el modelo de cada trabajo, en
// `lib/conserje.ts` con el router. Aquí solo se pinta y se conecta.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { Ocupado } from "./Espera";
import { aHtml } from "../lib/markdown";
import {
  animoDelChat,
  arranqueDeAhora,
  CONSERJE_CAMBIO,
  cerebroDe,
  claveDe,
  conserjeCerebro,
  conserjeFijo,
  conserjePensador,
  conserjePensadores,
  conserjePrograma,
  fijoDe,
  conserjeLeer,
  conserjeLista,
  conserjeMejorar,
  conserjeParar,
  conserjeRouter,
  enMarcha,
  estadoDe,
  hoja,
  onPaso,
  PALABRA,
  paneDe,
  pensadorDe,
  programaDe,
  programasDeSesion,
  tomarPedido,
  type ConserjeExec,
  type Conversacion,
  type Ficha,
  type Pensador,
  type Trabajo,
  type Turno,
} from "../lib/conserje";
import { enviarAlConserje } from "../lib/conserjeEnvio";
import type { PaneStatus } from "../lib/pty";
import { hace } from "../lib/uso";
import { A_MANO, cerebroPorDefecto, type ModelAlias } from "../lib/models";
import { proveedorDe, providerOf, sabe } from "../lib/providers";
import ProviderMark from "./ProviderMark";
import Mascota from "./Mascota";
import { abrirEnlacesFuera } from "../lib/enlacesFuera";
import {
  ChevronIcon,
  CloseIcon,
  SacarIcon,
  SendIcon,
  SparkIcon,
  TargetIcon,
  UndoIcon,
} from "./Icons";

/** Vive en `lib/conserje.ts`, que lo comparte con el envío desde el móvil. */
export type { ConserjeExec } from "../lib/conserje";

/** El arranque de esta app. Mientras llega es `null`, y `paneDe` no da ningún
 *  panel por suyo. */
let arranqueGuardado: number | null = null;
export function useArranque(): number | null {
  const [a, setA] = useState(arranqueGuardado);
  useEffect(() => {
    if (arranqueGuardado !== null) return;
    arranqueDeAhora()
      .then((n) => {
        arranqueGuardado = n;
        setA(n);
      })
      .catch(() => {});
  }, []);
  return a;
}

/** Para qué sirve cada modelo como cerebro del conserje, en una línea: lo que
 *  hace él es entender el encargo y repartirlo, no hacerlo. */
const PARA_QUE: Record<string, string> = {
  haiku: "Rápido y barato; entiende peor un encargo enredado.",
  sonnet: "El de siempre: entiende bien y no tarda.",
  opus: "Piensa más el reparto; tarda más y gasta más.",
};

/** Cómo se llama lo que trabaja: «Claude Opus», «Codex». La etiqueta de
 *  `providers.ts` es «Claude Code», que al lado del modelo en minúscula se leía
 *  «Claude Code opus»; con el modelo detrás basta con la marca. */
export function nombreDe(w: Pick<Trabajo, "cli" | "modelo">): string {
  const p = providerOf(w.cli);
  const marca = p.marca ?? p.label;
  const modelo = w.modelo ? ` ${w.modelo.charAt(0).toUpperCase()}${w.modelo.slice(1)}` : "";
  return `${marca}${modelo}`;
}

// ─── La lista de la izquierda ────────────────────────────────────────────────

/** «hace 2 d · 3 sesiones». El «0 sesiones» debajo de cada charla no decía
    nada; cuándo fue es lo que sirve para encontrar una entre veinte. */
function subtitulo(f: Ficha, t: (s: string, v?: Record<string, string | number>) => string, lang: string): string {
  const ms = f.cuando * 1000;
  // Pasada una semana, «hace 40 d» obliga a contar: se dice el día.
  const cuando =
    Date.now() - ms > 7 * 86_400_000
      ? new Date(ms).toLocaleDateString(lang, { day: "numeric", month: "short" })
      : (() => {
          const a = hace(ms);
          return t(a.clave, { n: a.valor });
        })();
  if (!f.trabajos) return cuando;
  return `${cuando} · ${f.trabajos === 1 ? t("1 sesión") : t("{n} sesiones", { n: f.trabajos })}`;
}

export function ListaConserje({
  abierta,
  onAbrir,
  onNueva,
  version,
}: {
  abierta: string | null;
  onAbrir: (id: string) => void;
  onNueva: () => void;
  /** Sube cuando algo cambió y hay que releer la lista. */
  version: number;
}) {
  const { t, lang } = useT();
  const [fichas, setFichas] = useState<Ficha[]>([]);
  /** Cinco a la vista y las demás a un clic: la sección va encima de las
      sesiones de siempre, y con veinte conversaciones las empujaría fuera. Antes
      se cortaba en seis sin decirlo, y las viejas no se podían abrir. */
  const [todas, setTodas] = useState(false);
  /** Sube cuando el móvil cambia una conversación: una nueva tiene que salir aquí. */
  const [fuera, setFuera] = useState(0);
  useEffect(() => {
    const alCambiar = () => setFuera((v) => v + 1);
    window.addEventListener(CONSERJE_CAMBIO, alCambiar);
    return () => window.removeEventListener(CONSERJE_CAMBIO, alCambiar);
  }, []);
  useEffect(() => {
    conserjeLista()
      .then(setFichas)
      .catch(() => setFichas([]));
  }, [version, fuera]);
  const VISIBLES = 5;
  const vistas = todas ? fichas : fichas.slice(0, VISIBLES);
  // La abierta se ve siempre, aunque sea vieja: si no, al abrirla desde «ver
  // todas» y plegar, desaparecería la que estás mirando.
  const abiertaFuera = !todas && abierta && !vistas.some((f) => f.id === abierta);
  const lista = abiertaFuera ? [...vistas, ...fichas.filter((f) => f.id === abierta)] : vistas;

  return (
    <section className="cj-lista">
      <button className="cj-nueva" onClick={onNueva}>
        <Mascota animo="quieta" alto={16} />
        {t("Hablar con el conserje")}
      </button>
      {lista.map((f) => (
        <button key={f.id} className="chat-fila" data-on={abierta === f.id} onClick={() => onAbrir(f.id)}>
          <span className="chat-fila-txt">
            <span className="chat-fila-tit">{f.titulo || t("Conversación nueva")}</span>
            <span className="chat-fila-sub">{subtitulo(f, t, lang)}</span>
          </span>
        </button>
      ))}
      {fichas.length > VISIBLES && (
        <button className="cj-ver-todas" onClick={() => setTodas((v) => !v)}>
          {todas ? t("Ver menos") : t("Ver todas ({n})", { n: fichas.length })}
          <ChevronIcon size={11} up={todas} />
        </button>
      )}
    </section>
  );
}

// ─── Las pestañas ─────────────────────────────────────────────────────────────

/** Como la barra de arriba de la app: texto suelto, y la elegida con la raya
 *  de acento debajo. Eran tarjetas con borde, franja de color y dos renglones, y
 *  Munir las tiró el 2026-10-21 («slop») eligiendo esta forma entre tres. El
 *  estado lo dice el color del punto: verde trabajando, ámbar te pregunta,
 *  naranja ha terminado; la palabra y el modelo van al tooltip. */
export function PestanasConserje({
  trabajos,
  panes,
  viendo,
  onIr,
  onSoltar,
}: {
  trabajos: Trabajo[];
  panes: PaneStatus[];
  /** La pestaña que se está mirando (`claveDe`), o `null` si es el conserje. */
  viendo: string | null;
  onIr: (clave: string | null) => void;
  /** Quitar la pestaña de una sesión que ya se cerró. Solo esas: una que
   *  trabaja no se quita de la vista por accidente. */
  onSoltar: (w: Trabajo) => void;
}) {
  const { t } = useT();
  const arranque = useArranque();
  const vivas = trabajos.filter((w) => !w.soltado);
  const estados = vivas.map((w) => estadoDe(paneDe(w, panes, arranque)));

  /* Con tres pestañas la tira ya no cabe en la columna del chat, y la barra de
     desplazamiento está escondida: sin una pista, las de la derecha no
     existían. Un difuminado en el borde que tiene más, y la rueda la mueve de
     lado. */
  const tiraRef = useRef<HTMLDivElement>(null);
  const [sobra, setSobra] = useState({ izq: false, der: false });
  const medir = useCallback(() => {
    const el = tiraRef.current;
    if (!el) return;
    const izq = el.scrollLeft > 2;
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setSobra((s) => (s.izq === izq && s.der === der ? s : { izq, der }));
  }, []);
  useEffect(() => {
    const el = tiraRef.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);
  // Una pestaña nueva nace a la derecha, fuera de la vista: se enseña.
  const cuantas = vivas.length;
  const antes = useRef(cuantas);
  useEffect(() => {
    const el = tiraRef.current;
    if (el && cuantas > antes.current) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    antes.current = cuantas;
    medir();
  }, [cuantas, medir]);

  return (
    // La del conserje va FUERA de lo que se desplaza: es el ancla, y al saltar
    // a una pestaña nueva se iba por la izquierda.
    <nav className="cj-pestanas" aria-label={t("Sesiones")}>
      <button className="cj-pestana" data-estado="conserje" data-on={viendo === null} onClick={() => onIr(null)}>
        <Mascota animo={animoDelChat(false, estados)} alto={16} />
        {t("Conserje")}
      </button>
      <span className="cj-pestanas-raya" />
      <div
        ref={tiraRef}
        className="cj-pestanas-rueda"
        data-izq={sobra.izq}
        data-der={sobra.der}
        onScroll={() => medir()}
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
      >
      {vivas.map((w) => {
        const estado = estadoDe(paneDe(w, panes, arranque));
        const dice = `${hoja(w.carpeta)} · ${t(PALABRA[estado])} · ${nombreDe(w)}`;
        return (
          <span key={claveDe(w)} className="cj-pestana-caja">
          <button
            className="cj-pestana"
            data-estado={estado}
            data-on={viendo === claveDe(w)}
            aria-label={dice}
            data-tip={`${dice} · ${w.encargo.slice(0, 160)}`}
            // Con el tabulador el navegador no la sacaba de debajo del
            // difuminado; el foco llega también con el clic, así que basta aquí.
            onFocus={(e) => e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" })}
            onClick={() => onIr(claveDe(w))}
          >
            <ProviderMark id={w.cli} />
            {hoja(w.carpeta)}
            {/* Una cerrada no lleva punto: ya se apaga entera y lleva su ✕. */}
            {estado !== "cerrada" && <span className="cj-punto" />}
          </button>
          {/* Hermana y no hija de la pestaña: un botón dentro de otro no es
              HTML válido y el clic de dentro abriría también la sesión. */}
          {estado === "cerrada" && (
            <button className="cj-pestana-quitar" data-tip={t("Quitar esta pestaña")} onClick={() => onSoltar(w)}>
              <CloseIcon size={11} />
            </button>
          )}
          </span>
        );
      })}
      </div>
    </nav>
  );
}

// ─── La conversación ─────────────────────────────────────────────────────────

const TurnoConserje = memo(function TurnoConserje({ turno }: { turno: Turno }) {
  const html = useMemo(() => aHtml(turno.texto), [turno.texto]);
  return (
    <article className="chat-turno" data-rol={turno.rol === "tu" ? "tu" : "agente"}>
      <div className="chat-burbuja" onClick={abrirEnlacesFuera} dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
});

/** La tarjeta de una sesión abierta, en el sitio de la conversación donde se
 *  pidió. Dice quién eligió el modelo y por qué, que es lo que Munir pidió ver. */
function TarjetaTrabajo({ w, panes, onIr }: { w: Trabajo; panes: PaneStatus[]; onIr: (clave: string) => void }) {
  const { t } = useT();
  const estado = estadoDe(paneDe(w, panes, useArranque()));
  return (
    <article className="chat-turno" data-rol="agente">
      <button className="cj-trabajo" data-estado={estado} onClick={() => onIr(claveDe(w))}>
        <span className="cj-trabajo-cab">
          <ProviderMark id={w.cli} />
          <strong>
            {hoja(w.carpeta)} · {nombreDe(w)}
          </strong>
          <span className="cj-estado">
            <span className="cj-punto" />
            {t(PALABRA[estado])}
          </span>
        </span>
        <span className="cj-trabajo-para">{w.encargo.length > 180 ? `${w.encargo.slice(0, 180)}…` : w.encargo}</span>
        <span className="cj-porque">
          <TargetIcon size={13} />
          <span>
            {w.eligio === "router" ? (
              <>
                <b>{t("Lo eligió el router.")}</b> {w.porque}
              </>
            ) : (
              <b>{t("Elegido por ti: el router estaba apagado.")}</b>
            )}
          </span>
        </span>
        <span className="cj-trabajo-ir">
          {t("Ir a esta sesión")} <SacarIcon size={12} />
        </span>
      </button>
    </article>
  );
}

// ─── Con qué piensa Adeo y con qué abre las sesiones ─────────────────────────

/** Los tres escalones de la casa, con el nombre corto que se lee en el menú. */
const ESCALONES: [ModelAlias, string][] = [
  ["haiku", "Rápido"],
  ["sonnet", "Normal"],
  ["opus", "A fondo"],
];
const escalonDe = (m: string) => ESCALONES.find(([k]) => k === m)?.[1] ?? "Normal";

/** Lo de siempre, para cuando Rust todavía no sabe contestar la lista. */
const SOLO_CLAUDE: Pensador[] = [
  { id: "claude", modelos: { haiku: "haiku", sonnet: "sonnet", opus: "opus" }, instalado: true },
];
let pensadoresGuardados: Pensador[] | null = null;
/** Los programas que saben pensar como conserje, pedidos una vez a Rust. */
function usePensadores(): Pensador[] {
  const [lista, setLista] = useState(pensadoresGuardados ?? SOLO_CLAUDE);
  useEffect(() => {
    if (pensadoresGuardados) return;
    conserjePensadores()
      .then((l) => {
        pensadoresGuardados = l.length ? l : SOLO_CLAUDE;
        setLista(pensadoresGuardados);
      })
      .catch(() => {});
  }, []);
  return lista;
}

const marcaDe = (cli: string) => providerOf(cli).marca ?? providerOf(cli).label;

/** El nombre que entiende un programa para un escalón: «gpt-5.6-terra», o
 *  «Sonnet» cuando el programa los llama como la casa. */
function modeloDe(nombres: Partial<Record<string, string>> | undefined, k: string): string {
  const n = nombres?.[k] ?? k;
  return n === k ? `${k.charAt(0).toUpperCase()}${k.slice(1)}` : n;
}

/** El menú del cerebro: el programa arriba y su escalón debajo (Munir eligió
 *  esta forma entre tres, el 2026-10-21). */
function MenuCerebro({
  pensadores,
  pensador,
  cerebro,
  onPrograma,
  onEscalon,
}: {
  pensadores: Pensador[];
  pensador: string;
  cerebro: string;
  onPrograma: (id: string) => void;
  onEscalon: (m: ModelAlias) => void;
}) {
  const { t } = useT();
  const actual = pensadores.find((p) => p.id === pensador) ?? pensadores[0];
  return (
    <div className="chat-menu cj-menu-cerebro">
      <div className="cj-progs">
        {pensadores.map((p) => (
          <button
            key={p.id}
            className="cj-prog"
            data-on={p.id === actual.id}
            disabled={!p.instalado}
            data-tip={p.instalado ? undefined : t("No está instalado en este equipo")}
            onClick={() => onPrograma(p.id)}
          >
            <span className="cj-prog-marca" style={{ color: providerOf(p.id).hue }}>
              <ProviderMark id={p.id} />
            </span>
            {marcaDe(p.id)}
          </button>
        ))}
      </div>
      {ESCALONES.map(([k, esc]) => (
        <button key={k} className="chat-menu-fila" data-on={cerebro === k} onClick={() => onEscalon(k)}>
          <span className="cj-escalon">{t(esc)}</span>
          <span className="chat-menu-txt">
            <strong>{modeloDe(actual.modelos, k)}</strong>
            <em>{t(PARA_QUE[k])}</em>
          </span>
        </button>
      ))}
    </div>
  );
}

/** El menú de «Sesiones»: el router, o un programa fijo para todas. */
function MenuSesiones({
  programas,
  programa,
  onElegir,
}: {
  programas: string[];
  /** El elegido; vacío es el router. */
  programa: string;
  onElegir: (cli: string) => void;
}) {
  const { t } = useT();
  return (
    <div className="chat-menu cj-menu-ancho">
      <button className="chat-menu-fila" data-on={!programa} onClick={() => onElegir("")}>
        <span className="cj-prog-marca cj-prog-router">
          <TargetIcon size={15} />
        </span>
        <span className="chat-menu-txt">
          <strong>{t("Router")}</strong>
          <em>{t("Elige programa, modelo y cuenta para cada trabajo.")}</em>
        </span>
      </button>
      <span className="chat-menu-raya" />
      {programas.map((cli) => (
        <button key={cli} className="chat-menu-fila" data-on={programa === cli} onClick={() => onElegir(cli)}>
          <span className="cj-prog-marca" style={{ color: providerOf(cli).hue }}>
            <ProviderMark id={cli} />
          </span>
          <span className="chat-menu-txt">
            <strong>{marcaDe(cli)}</strong>
            <em>
              {sabe(cli, "modelo")
                ? t("Siempre este programa; el router elige solo el modelo.")
                : t("Siempre este programa, con su modelo de siempre.")}
            </em>
          </span>
        </button>
      ))}
    </div>
  );
}

export function HiloConserje({
  id,
  conv,
  onCambio,
  exec,
  onIr,
}: {
  id: string;
  conv: Conversacion | null;
  /** Algo cambió en la conversación: hay que releerla (y la lista). */
  onCambio: () => void;
  exec: ConserjeExec;
  onIr: (clave: string) => void;
}) {
  const { t } = useT();
  const arranque = useArranque();
  const [texto, setTexto] = useState("");
  /** Lo que había antes de pulsar Mejorar, para poder deshacerlo. */
  const [antes, setAntes] = useState<string | null>(null);
  const [mejorando, setMejorando] = useState(false);
  const [pensando, setPensando] = useState(false);
  /** Sube con cada mensaje que mandas: la mascota lo mira salir. */
  const [envios, setEnvios] = useState(0);
  const [paso, setPaso] = useState("");
  /** Lo que no se pudo hacer (la reja, una sesión que no abrió): una nota en
      el hilo, en el sitio de la conversación donde pasó. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** Lo que acabas de mandar, pintado YA. El conserje tarda unos quince
      segundos, y sin esto tu mensaje desaparecía de la caja sin aparecer en
      ningún otro sitio: parecía que se había perdido. */
  const [pendiente, setPendiente] = useState<string | null>(null);
  /** Si el conserje no pudo contestar: el error y lo que mandaste, para
      reintentarlo con un clic (Rust no lo apunta dos veces). */
  const [fallo, setFallo] = useState<{ texto: string; error: string } | null>(null);
  // El de la conversación, si se fijó uno (también desde el móvil); si no, el
  // de por defecto de Ajustes. Al elegirlo se guarda en la conversación.
  const [fijo, setFijo] = useState<ModelAlias>(() => fijoDe(conv) ?? cerebroPorDefecto() ?? "sonnet");
  useEffect(() => {
    const f = fijoDe(conv);
    if (f) setFijo(f);
  }, [conv?.fijo]);
  const [eligiendo, setEligiendo] = useState(false);
  const [eligiendoCerebro, setEligiendoCerebro] = useState(false);
  const [eligiendoSesiones, setEligiendoSesiones] = useState(false);
  const pensadores = usePensadores();
  const pensador = pensadorDe(conv);
  /** Un menú abierto cierra los otros dos. */
  const abrirMenu = (cual: "cerebro" | "sesiones" | "modelo") => {
    setEligiendoCerebro((v) => cual === "cerebro" && !v);
    setEligiendoSesiones((v) => cual === "sesiones" && !v);
    setEligiendo((v) => cual === "modelo" && !v);
  };
  /** Si Mejorar no pudo: se dice junto a la caja, que es donde lo pulsaste. */
  const [noMejora, setNoMejora] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLTextAreaElement>(null);
  /** La caja crece con lo que lleva, hasta ocho renglones: un texto mejorado
      ocupa cinco, y con la caja de dos se desplazaba y cortaba el primero. */
  useLayoutEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [texto]);
  const router = conv?.router ?? true;
  /** Con qué se abren las sesiones: vacío es el router; con el router apagado
      y sin programa elegido, Claude con su modelo fijo (lo de antes). */
  const programa = programaDe(conv) || (router ? "" : "claude");

  /** «Sesiones»: Router vuelve a dejarlo todo en sus manos; un programa sin
      bandera de modelo no puede ir con modelo fijo, así que lo elige el router. */
  const elegirPrograma = async (cli: string) => {
    setEligiendoSesiones(false);
    await conserjePrograma(id, cli).catch(() => {});
    if (!router && (!cli || !sabe(cli, "modelo"))) await conserjeRouter(id, true).catch(() => {});
    onCambio();
  };
  /** «Modelo»: el router, o uno fijo (el router apagado de antes). */
  const elegirModelo = async (m: ModelAlias | "router") => {
    setEligiendo(false);
    if (m === "router") {
      await conserjeRouter(id, true).catch(() => {});
    } else {
      setFijo(m);
      await conserjeFijo(id, m).catch(() => {});
      if (router) await conserjeRouter(id, false).catch(() => {});
    }
    onCambio();
  };

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [conv?.turnos.length, conv?.trabajos.length, pensando, pendiente, aviso, fallo]);

  // El mensaje pendiente se quita cuando ya está en la conversación de verdad,
  // no antes: quitarlo al volver la llamada lo hacía parpadear hasta que la
  // relectura llegaba.
  useEffect(() => {
    if (pendiente && conv?.turnos.some((t) => t.rol === "tu" && t.texto === pendiente)) setPendiente(null);
  }, [conv, pendiente]);

  // Lo que va haciendo mientras piensa. Sin esto, veinte segundos sin nada en
  // pantalla parecen un cuelgue y invitan a mandarlo otra vez.
  useEffect(() => {
    const un = onPaso((p) => {
      if (p.id === id) setPaso(p.paso);
    });
    return () => {
      void un.then((f) => f());
    };
  }, [id]);

  // Cambiar de conversación no arrastra lo que tenías a medias en la otra.
  useEffect(() => {
    setAntes(null);
    setAviso(null);
    setFallo(null);
    setPendiente(null);
  }, [id]);

  const mejorar = useCallback(() => {
    // Un solo botón para las dos direcciones: con la mejora puesta es Deshacer.
    if (antes !== null) {
      setTexto(antes);
      setAntes(null);
      return;
    }
    const original = texto;
    if (!original.trim()) return;
    setMejorando(true);
    setNoMejora(null);
    conserjeMejorar(original)
      .then((mejor) => {
        setAntes(original);
        setTexto(mejor);
      })
      .catch((e) => setNoMejora(String(e)))
      .finally(() => setMejorando(false));
  }, [antes, texto]);

  /** `repetir` es el reintento: manda lo mismo sin tocar lo que tengas en la caja. */
  const enviar = async (repetir?: string) => {
    const txt = (repetir ?? texto).trim();
    if (!txt || pensando) return;
    if (repetir === undefined) {
      setTexto("");
      setAntes(null);
    }
    setAviso(null);
    setFallo(null);
    setPaso("");
    setPendiente(txt);
    setEnvios((n) => n + 1);
    setPensando(true);
    // El mismo camino que usa el móvil (`lib/conserjeEnvio.ts`).
    const r = await enviarAlConserje(id, txt, { exec, conv, fijo, alCambio: onCambio });
    if (r.aviso) setAviso(r.aviso);
    if (r.error) setFallo({ texto: txt, error: r.error });
    setPensando(false);
    setPaso("");
  };

  // Lo que pediste en la caja del Panel para esta conversación: se manda al
  // abrirla, como si lo hubieras escrito aquí. Va detrás del efecto que limpia
  // al cambiar de conversación, que si no borraría lo que se acaba de mandar.
  useEffect(() => {
    const pedido = tomarPedido(id);
    if (pedido) void enviar(pedido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const trabajosDe = (n: number) => (conv?.trabajos ?? []).filter((w) => w.turno === n);
  const panes = exec.panes();
  const estados = (conv?.trabajos ?? []).map((w) => estadoDe(paneDe(w, panes, arranque)));
  const marcha = enMarcha(estados);

  return (
    <>
      <header className="chat-cabecera">
        {/* La mascota en vez de un destello en una burbuja (Munir, 2026-10-11:
            «quita esto cutre y pon a la mascota»). Dice cómo va la conversación:
            piensa mientras el conserje contesta, teclea si sus sesiones trabajan
            y te llama si alguna te pregunta. */}
        <Mascota animo={animoDelChat(pensando, estados, { fallo: !!fallo, escribiendo: !!texto.trim() })} alto={28} envio={envios} />
        <span className="chat-cab-id">
          <strong>{conv?.titulo || t("Conserje")}</strong>
          <em>
            {t(marcha.clave, { n: marcha.n })} ·{" "}
            {/* «el modelo» a secas, al lado de «Conserje: Claude Opus», se leía
                como si el router eligiera también el del conserje. */}
            {programa
              ? t("las sesiones van con {p}", { p: marcaDe(programa) })
              : t("el router elige el de cada sesión")}
          </em>
        </span>
      </header>

      <div className="chat-turnos">
        {!conv?.turnos.length && !pendiente && (
          <div className="chat-elige cj-bienvenida">
            <Mascota animo="quieta" alto={64} />
            <p className="chat-elige-tit">{t("Dime qué hay que hacer.")}</p>
            <p className="chat-elige-sub">
              {t(
                "Lo parto en trabajos y abro una sesión para cada uno, con el modelo que toque. Las verás arriba como pestañas; un clic y estás dentro.",
              )}
            </p>
          </div>
        )}
        {conv?.turnos.map((turno) => (
          <div key={turno.n} className="cj-grupo">
            <TurnoConserje turno={turno} />
            {turno.rol === "conserje" &&
              trabajosDe(turno.n).map((w) => <TarjetaTrabajo key={claveDe(w)} w={w} panes={panes} onIr={onIr} />)}
          </div>
        ))}
        {/* Las que se abrieron antes de apuntarse el turno (una versión vieja o
            una conversación a medias) no se pierden: van al final. */}
        {(conv?.trabajos ?? [])
          .filter((w) => !w.turno || !conv?.turnos.some((x) => x.n === w.turno))
          .map((w) => (
            <TarjetaTrabajo key={claveDe(w)} w={w} panes={panes} onIr={onIr} />
          ))}
        {/* Pintado igual que quedará: en un <p> suelto la lista de un texto
            mejorado salía aplastada en una línea, y al contestar cambiaba. */}
        {pendiente && !conv?.turnos.some((x) => x.rol === "tu" && x.texto === pendiente) && (
          <TurnoConserje turno={{ n: 0, rol: "tu", texto: pendiente, resumen: "", cuando: 0 }} />
        )}
        {pensando && (
          <article className="chat-turno" data-rol="agente">
            <p className="cj-pensando">
              <Mascota animo="piensa" alto={30} />
              {paso || t("Pensando…")}
            </p>
          </article>
        )}
        {aviso && (
          <article className="chat-turno" data-rol="agente">
            {/* La razón sola («no es una carpeta de tus proyectos») no decía
                qué había pasado: que eso no se hizo. */}
            <p className="cj-nota">
              <b>{t("Esto no lo he hecho:")}</b> {aviso}
            </p>
          </article>
        )}
        {fallo && (
          <article className="chat-turno" data-rol="agente">
            <div className="cj-nota" data-grave>
              <span>
                <b>{t("No he podido contestar.")}</b> {fallo.error}
              </span>
              <button className="mini cj-reintentar" onClick={() => void enviar(fallo.texto)}>
                {t("Reintentar")}
              </button>
            </div>
          </article>
        )}
        <div ref={finRef} />
      </div>

      <div className="chat-caja-zona">
        <span className="chat-haz" data-on={pensando} aria-hidden="true" />
        <div className="chat-caja cj-caja" data-trabajando={pensando}>
          {antes !== null && (
            <p className="cj-aviso-mejora">{t("Mejorado: lo mismo que dijiste, ordenado. Si no te gusta, Deshacer.")}</p>
          )}
          {noMejora && <p className="cj-aviso-mejora" data-grave>{noMejora}</p>}
          <div className="chat-caja-fila">
            <textarea
              ref={cajaRef}
              className="chat-input"
              data-mejorado={antes !== null}
              value={texto}
              rows={2}
              placeholder={t("Escribe o dicta. Enter lo manda al conserje.")}
              onChange={(e) => {
                setTexto(e.currentTarget.value);
                // En cuanto lo tocas es tuyo: ya no hay nada que deshacer.
                if (antes !== null) setAntes(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
            />
            {pensando ? (
              <button className="chat-enviar" data-tip={t("Parar")} onClick={() => void conserjeParar(id)}>
                <CloseIcon size={14} />
              </button>
            ) : (
              <button className="chat-enviar" disabled={!texto.trim()} data-tip={t("Enviar")} onClick={() => void enviar()}>
                <SendIcon size={15} />
              </button>
            )}
          </div>

          <div className="chat-pastillas cj-pastillas">
            <button
              className="chat-pastilla cj-pastilla"
              disabled={mejorando || (antes === null && !texto.trim())}
              data-tip={t("Reescribe lo que has puesto más claro, sin añadir nada")}
              onClick={mejorar}
            >
              {antes !== null ? <UndoIcon size={13} /> : <SparkIcon size={13} />}
              <Ocupado activo={mejorando} mientras={t("Mejorando…")}>
                {antes !== null ? t("Deshacer") : t("Mejorar")}
              </Ocupado>
            </button>
            {/* Con qué piensa el CONSERJE. No es lo mismo que el router: el
                router elige el modelo de las sesiones que abre. */}
            <div className="chat-modelo">
              <button
                className="chat-pastilla cj-pastilla"
                data-tip={t("Con qué piensa el conserje: el programa arriba y su escalón debajo. Las sesiones que abre van aparte.")}
                onClick={() => abrirMenu("cerebro")}
              >
                <SparkIcon size={13} />
                {t("Conserje: {m}", { m: `${marcaDe(pensador)} · ${t(escalonDe(cerebroDe(conv)))}` })}
                <ChevronIcon size={11} up={eligiendoCerebro} />
              </button>
              {eligiendoCerebro && (
                <MenuCerebro
                  pensadores={pensadores}
                  pensador={pensador}
                  cerebro={cerebroDe(conv)}
                  onPrograma={(p) => void conserjePensador(id, p).then(onCambio).catch(() => {})}
                  onEscalon={(m) => {
                    setEligiendoCerebro(false);
                    void conserjeCerebro(id, m).then(onCambio).catch(() => {});
                  }}
                />
              )}
            </div>
            {/* Con qué se ABREN las sesiones: el router por defecto, o un
                programa para todas (Munir, 2026-10-21). Sustituye al interruptor
                del router; el modelo fijo de antes es la pastilla de al lado. */}
            <div className="chat-modelo">
              <button
                className={`chat-pastilla cj-pastilla${programa ? " chat-pastilla-fuerte" : ""}`}
                data-on={!programa}
                data-tip={t("Con qué programa se abren las sesiones que reparte Adeo")}
                onClick={() => abrirMenu("sesiones")}
              >
                <TargetIcon size={13} />
                {programa ? t("Sesiones: {p}", { p: marcaDe(programa) }) : t("Sesiones: Router")}
                <ChevronIcon size={11} up={eligiendoSesiones} />
              </button>
              {eligiendoSesiones && (
                <MenuSesiones programas={programasDeSesion(exec.cuentas())} programa={programaDe(conv) || (router ? "" : "claude")} onElegir={(c) => void elegirPrograma(c)} />
              )}
            </div>
            {programa && sabe(programa, "modelo") && (
              <div className="chat-modelo">
                <button className="chat-pastilla cj-pastilla" onClick={() => abrirMenu("modelo")}>
                  {router
                    ? t("Modelo: lo elige el router")
                    : t("Modelo: {m}", { m: modeloDe(proveedorDe(programa)?.modelos, fijo) })}
                  <ChevronIcon size={11} up={eligiendo} />
                </button>
                {eligiendo && (
                  <div className="chat-menu">
                    <button className="chat-menu-fila" data-on={router} onClick={() => void elegirModelo("router")}>
                      <span className="chat-menu-txt">
                        <strong>{t("Lo elige el router")}</strong>
                        <em>{t("Según el trabajo y la semana que quede.")}</em>
                      </span>
                    </button>
                    <span className="chat-menu-raya" />
                    {A_MANO.map((m) => (
                      <button key={m} className="chat-menu-fila" data-on={!router && fijo === m} onClick={() => void elegirModelo(m)}>
                        <span className="cj-escalon">{t(escalonDe(m))}</span>
                        <span className="chat-menu-txt">
                          <strong>{modeloDe(proveedorDe(programa)?.modelos, m)}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <span className="chat-hueco" />
          </div>
        </div>
      </div>
    </>
  );
}

/** Leer una conversación del conserje y tenerla al día. */
export function useConversacion(id: string | null): [Conversacion | null, () => void] {
  const [conv, setConv] = useState<Conversacion | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!id) return setConv(null);
    let vivo = true;
    conserjeLeer(id)
      .then((c) => vivo && setConv(c))
      .catch(() => vivo && setConv(null));
    return () => {
      vivo = false;
    };
  }, [id, vuelta]);
  // Lo que se le dice desde el móvil cambia la conversación sin pasar por esta
  // ventana: sin esto, el PC seguía enseñando la de antes.
  useEffect(() => {
    const alCambiar = (ev: Event) => {
      if ((ev as CustomEvent<{ id: string }>).detail?.id === id) setVuelta((v) => v + 1);
    };
    window.addEventListener(CONSERJE_CAMBIO, alCambiar);
    return () => window.removeEventListener(CONSERJE_CAMBIO, alCambiar);
  }, [id]);
  return [conv, useCallback(() => setVuelta((v) => v + 1), [])];
}
