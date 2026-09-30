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
import { aHtml } from "../lib/markdown";
import {
  claveDe,
  conserjeArranque,
  conserjeEnviar,
  conserjeLeer,
  conserjeLista,
  conserjeMejorar,
  conserjeParar,
  conserjeRouter,
  conserjeTrabajo,
  ejecutar,
  enMarcha,
  estadoDe,
  estadosParaElConserje,
  hoja,
  onPaso,
  PALABRA,
  paneDe,
  resumenDePestanas,
  type Conversacion,
  type Ficha,
  type Trabajo,
  type Turno,
} from "../lib/conserje";
import type { Account, PaneStatus } from "../lib/pty";
import { recetar, type Receta } from "../lib/router";
import { fotoRapida } from "../lib/mundo";
import { hace } from "../lib/uso";
import { A_MANO, cerebroPorDefecto, type ModelAlias } from "../lib/models";
import { providerOf } from "../lib/providers";
import ProviderMark from "./ProviderMark";
import {
  ChevronIcon,
  CloseIcon,
  SacarIcon,
  SendIcon,
  SparkIcon,
  TargetIcon,
  UndoIcon,
} from "./Icons";

/** Lo que el conserje necesita del resto de la app. Llega por props desde App,
 *  que es quien sabe abrir paneles y escribir en ellos. */
export interface ConserjeExec {
  /** Abre la sesión sin sacarte del chat; devuelve su panel. */
  abrir: (r: Pick<Receta, "cli" | "cuenta" | "modelo" | "esfuerzo">, cwd: string, label: string, encargo: string) => number | undefined;
  escribir: (panel: number, texto: string) => Promise<boolean>;
  /** El estado de todos los paneles, de las dos vistas. */
  panes: () => PaneStatus[];
  /** Todas las cuentas: el router necesita las de los OTROS CLIs para proponerlos. */
  cuentas: () => Account[];
}

/** El arranque de esta app, pedido una vez: no cambia hasta cerrarla. Mientras
 *  llega es `null`, y `paneDe` no da ningún panel por suyo. */
let arranqueGuardado: number | null = null;
export function useArranque(): number | null {
  const [a, setA] = useState(arranqueGuardado);
  useEffect(() => {
    if (arranqueGuardado !== null) return;
    conserjeArranque()
      .then((n) => {
        arranqueGuardado = n;
        setA(n);
      })
      .catch(() => {});
  }, []);
  return a;
}

/** Cómo se llama lo que trabaja: «Claude Opus», «Codex». La etiqueta de
 *  `providers.ts` es «Claude Code», que al lado del modelo en minúscula se leía
 *  «Claude Code opus»; con el modelo detrás basta con la marca. */
export function nombreDe(w: Pick<Trabajo, "cli" | "modelo">): string {
  const marca = w.cli === "claude" ? "Claude" : providerOf(w.cli).label;
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
  useEffect(() => {
    conserjeLista()
      .then(setFichas)
      .catch(() => setFichas([]));
  }, [version]);
  const VISIBLES = 5;
  const vistas = todas ? fichas : fichas.slice(0, VISIBLES);
  // La abierta se ve siempre, aunque sea vieja: si no, al abrirla desde «ver
  // todas» y plegar, desaparecería la que estás mirando.
  const abiertaFuera = !todas && abierta && !vistas.some((f) => f.id === abierta);
  const lista = abiertaFuera ? [...vistas, ...fichas.filter((f) => f.id === abierta)] : vistas;

  return (
    <section className="cj-lista">
      <button className="cj-nueva" onClick={onNueva}>
        <span className="cj-avatar cj-avatar-mini">
          <SparkIcon size={13} />
        </span>
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

/** La franja de color dice el estado sin leer: verde trabajando, ámbar te
 *  pregunta, naranja ha terminado. Los mismos colores que el resto de la app. */
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
  const resumen = resumenDePestanas(vivas.map((w) => estadoDe(paneDe(w, panes, arranque))));

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
        <span className="cj-avatar cj-avatar-mini">
          <SparkIcon size={12} />
        </span>
        <span className="cj-pestana-txt">
          <strong>{t("Conserje")}</strong>
          <span className="cj-estado">{t(resumen.clave, { n: resumen.n })}</span>
        </span>
      </button>
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
        return (
          <span key={claveDe(w)} className="cj-pestana-caja">
          <button
            className="cj-pestana"
            data-estado={estado}
            data-on={viendo === claveDe(w)}
            data-tip={`${nombreDe(w)} · ${w.encargo.slice(0, 160)}`}
            // Con el tabulador el navegador no la sacaba de debajo del
            // difuminado; el foco llega también con el clic, así que basta aquí.
            onFocus={(e) => e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" })}
            onClick={() => onIr(claveDe(w))}
          >
            <ProviderMark id={w.cli} />
            {/* Arriba el proyecto y abajo cómo va y con qué: al encoger la tira
                se cortaba justo el modelo («Adeorq · Cla…»), y el proyecto es
                lo que se busca con la vista. */}
            <span className="cj-pestana-txt">
              <strong>{hoja(w.carpeta)}</strong>
              <span className="cj-pestana-sub">
                <span className="cj-estado">
                  <span className="cj-punto" />
                  {t(PALABRA[estado])}
                </span>
                <span className="cj-pestana-modelo">{nombreDe(w)}</span>
              </span>
            </span>
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
      <div className="chat-burbuja" dangerouslySetInnerHTML={{ __html: html }} />
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
  const [fijo, setFijo] = useState<ModelAlias>(() => cerebroPorDefecto() ?? "sonnet");
  const [eligiendo, setEligiendo] = useState(false);
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

  const alternarRouter = () => {
    void conserjeRouter(id, !router).then(onCambio);
  };

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
    setPensando(true);
    try {
      const panes = exec.panes();
      const r = await conserjeEnviar(id, txt, estadosParaElConserje(conv?.trabajos ?? [], panes));
      onCambio();
      if (r.acciones.length) {
        const vivas = await fotoRapida(exec.cuentas());
        const hecho = await ejecutar(r.acciones, {
          router,
          recetar: (ex) => recetar(ex, { cuentas: vivas, avisos: "nunca" }, undefined, cerebroPorDefecto()),
          fijo: { cli: "claude", modelo: fijo },
          abrir: exec.abrir,
          escribir: exec.escribir,
        });
        // En qué turno lo pidió: el último de la conversación ya guardada, que
        // es su respuesta. Contarlo a mano (el último que había, más dos)
        // fallaba con un reintento, que no apunta tu mensaje otra vez.
        const guardada = await conserjeLeer(id).catch(() => null);
        const turno = guardada?.turnos[guardada.turnos.length - 1]?.n ?? 0;
        for (const w of hecho.abiertos) await conserjeTrabajo(id, { ...w, turno });
        const fuera = [...r.descartes, ...hecho.fallos];
        if (fuera.length) setAviso(fuera.join(" · "));
        onCambio();
      } else if (r.descartes.length) {
        setAviso(r.descartes.join(" · "));
      }
    } catch (e) {
      const s = String(e);
      // Parar no es un error: es lo que pediste. Tu mensaje ya está guardado
      // (Rust lo apunta antes de llamar al modelo), así que no vuelve a la
      // caja: se ofrece reintentarlo desde el hilo.
      if (s !== "parado") setFallo({ texto: txt, error: s });
      onCambio();
    } finally {
      setPensando(false);
      setPaso("");
    }
  };

  const trabajosDe = (n: number) => (conv?.trabajos ?? []).filter((w) => w.turno === n);
  const panes = exec.panes();
  const marcha = enMarcha((conv?.trabajos ?? []).map((w) => estadoDe(paneDe(w, panes, arranque))));

  return (
    <>
      <header className="chat-cabecera">
        <span className="cj-avatar">
          <SparkIcon size={15} />
        </span>
        <span className="chat-cab-id">
          <strong>{conv?.titulo || t("Conserje")}</strong>
          <em>
            {t(marcha.clave, { n: marcha.n })} ·{" "}
            {router ? t("el router elige el modelo") : t("el router está apagado")}
          </em>
        </span>
      </header>

      <div className="chat-turnos">
        {!conv?.turnos.length && !pendiente && (
          <div className="chat-elige cj-bienvenida">
            <span className="cj-avatar cj-avatar-grande">
              <SparkIcon size={22} />
            </span>
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
              <span className="cj-punto" />
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
        <div className="chat-caja" data-trabajando={pensando}>
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
              <button className="chat-enviar" data-tip={t("Parar")} onClick={() => void conserjeParar()}>
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
              {mejorando ? t("Mejorando…") : antes !== null ? t("Deshacer") : t("Mejorar")}
            </button>
            <button
              className="chat-pastilla cj-pastilla"
              data-on={router}
              data-tip={t("Encendido: el router elige el mejor modelo para cada trabajo")}
              onClick={alternarRouter}
            >
              <TargetIcon size={13} />
              {router ? t("Router: automático") : t("Router: apagado")}
            </button>
            {!router && (
              <div className="chat-modelo">
                {/* Con el mismo nombre que las pestañas y las tarjetas
                    («Claude Sonnet»), no el alias en minúscula. */}
                <button className="chat-pastilla chat-pastilla-fuerte cj-pastilla" data-on onClick={() => setEligiendo((v) => !v)}>
                  {nombreDe({ cli: "claude", modelo: fijo })}
                  <ChevronIcon size={11} up={eligiendo} />
                </button>
                {eligiendo && (
                  <div className="chat-menu">
                    {A_MANO.map((m) => (
                      <button
                        key={m}
                        className="chat-menu-fila"
                        data-on={fijo === m}
                        onClick={() => {
                          setFijo(m);
                          setEligiendo(false);
                        }}
                      >
                        <span className="chat-menu-txt">
                          <strong>{nombreDe({ cli: "claude", modelo: m })}</strong>
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
  return [conv, useCallback(() => setVuelta((v) => v + 1), [])];
}
