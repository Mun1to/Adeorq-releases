// La pestaña «Decisiones»: todo lo que necesita tu dedo, en una sola lista.
//
// Nació el 2026-10-09 para las preguntas de `ask_decision` (Munir, contestando
// desde el móvil la primera decisión de verdad, quería verlas también en el PC).
// El 2026-11-15 eligió (A1) que fuese la bandeja única: lo que te toca, lo que
// terminó y las ideas de tus agentes, como un programa de correo, con la lista a
// la izquierda, el detalle a la derecha y todo con el teclado. Qué entra y en
// qué orden vive en `lib/decisionesLista.ts`; una decisión abierta, en
// `DecisionAbierta.tsx`. La campana de Adeo sigue siendo la vista de un
// vistazo, y su último renglón trae aquí.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT, type Translate } from "../lib/i18n";
import { useAvisos } from "../lib/campana";
import { useReposo, type Decision } from "../lib/decisiones";
import {
  ACABO,
  PALABRA,
  PARTES,
  TITULO_DE,
  carpeta,
  cuandoVuelve,
  cuantasTeTocan,
  diaDe,
  juntar,
  laAbierta,
  plazos,
  siguienteTrasApartar,
  vecina,
  type Cosa,
} from "../lib/decisionesLista";
import { accionDe, type AccionConsejo } from "../lib/acciones";
import { enLaTienda, yaEnLaTienda } from "../lib/empaquetada";
import { latido } from "../lib/latido";
import { abrirAdeo, olvidarPlan, usePlanPendiente, type PlanPendiente } from "../lib/planPendiente";
import { aceptarPropuesta, descartarPropuesta, hacerPropuesta } from "../lib/propuestas";
import { providerOf } from "../lib/providers";
import { listProjects, readInbox, type Note, type Project } from "../lib/pty";
import { pantallaDe } from "../lib/terminales";
import type { View } from "../lib/vistas";
import { useProgramados } from "./AgendaProgramados";
import DecisionAbierta, { useHace, type MandoDecision } from "./DecisionAbierta";
import Mascota from "./Mascota";

interface Props {
  decisiones: Decision[];
  /** Ponerte delante la terminal de un «Contesta» o un «Mira». */
  irATerminal: (id: number) => void;
  /** A otra pestaña: la Agenda, para un encargo que el freno paró. */
  irA: (v: View) => void;
  /** Esc con el foco en la lista: volver adonde estabas. */
  onVolver: () => void;
  /** Hacer lo que propone una nota del copiloto (`hacerConsejo`, en `App`). */
  onHacer?: (a: AccionConsejo) => Promise<string>;
}

/** Qué pone el botón de hacer: lo que va a pasar, con el nombre dentro. */
const rotuloDe = (a: AccionConsejo, t: Translate): string =>
  a.hacer === "abrirCli"
    ? t("Abrir {c} aquí", { c: providerOf(a.cli).label })
    : a.hacer === "cambiarModelo"
      ? t("Cambiar a {m}", { m: a.modelo })
      : t("Probarlo en el chat");

/** La primera palabra de cada fila, en inglés. No pasa por el diccionario
    porque allí «Mira» ya es «Looks», el permiso de un bot que solo mira, y
    aquí es «mira esto». */
const PALABRA_EN: typeof PALABRA = { contesta: "Answer", decide: "Decide", plan: "Approve", parado: "Stopped", mira: "Look", idea: "Idea" };

/** Las teclas, para la chuleta del «?». */
const TECLAS: Array<[string, string]> = [
  ["J  K  ↓  ↑", "Bajar y subir por la lista"],
  ["Intro", "Abrir: contestar la decisión, o ir a su terminal"],
  ["1 a 9", "Elegir esa opción en la pregunta que tienes delante"],
  ["Tab  Mayús+Tab", "Pasar a la pregunta siguiente o a la anterior"],
  ["O", "Escribir otra cosa, con tus palabras"],
  ["Ctrl+Intro", "Enviar la respuesta (con cinco segundos para deshacer)"],
  ["H", "Posponer lo marcado, o traer de vuelta una pospuesta"],
  ["U", "Marcar como vista o como no vista"],
  ["Retroceso", "Quitar de la lista un turno que terminó"],
  ["Esc", "Salir de la caja de texto; otra vez, volver adonde estabas"],
  ["Ctrl+Mayús+B", "Abrir Decisiones desde cualquier sitio"],
];

/** Lo que admite H: lo que aún te pide algo y no duerme ya. */
const sePospone = (c: Cosa | undefined): c is Cosa => !!c && c.clase !== "pasada" && c.parte !== "pospuesto";

/** Dónde sale el menú de H abierto con el botón, en píxeles dentro de la pestaña. */
interface Ancla {
  left: number;
  top?: number;
  bottom?: number;
}

/** Junto al botón que lo abre, y dentro de la pestaña: encima si el botón está en la
    mitad de abajo (la barra del pie de una decisión, sin taparla), debajo si está
    arriba. Con la tecla H no hay botón y sale arriba a la derecha, como siempre. */
function anclaDe(boton: HTMLElement, caja: HTMLElement | null): Ancla | undefined {
  if (!caja) return undefined;
  const d = caja.getBoundingClientRect();
  const b = boton.getBoundingClientRect();
  const fila = (boton.closest(".dec-barra, .dec-acciones") ?? boton).getBoundingClientRect();
  const ancho = Math.min(360, d.width - 48);
  const left = Math.round(Math.max(24, Math.min(b.left - d.left, d.width - ancho - 24)));
  return b.top - d.top > d.height / 2 ? { left, bottom: Math.round(d.bottom - fila.top + 8) } : { left, top: Math.round(b.bottom - d.top + 8) };
}

/** El botón de posponer de lo que tienes abierto, para el ratón: abre el mismo menú
    que H. En una pospuesta la trae de vuelta, y cambia de nombre (Munir, 2026-11-16:
    «sí, pon el botón Posponer para el ratón»). */
function BotonPosponer({ c, onPulsar }: { c: Cosa; onPulsar: (c: Cosa, boton: HTMLElement) => void }) {
  const { t } = useT();
  return (
    <button className="mini" data-posponer onClick={(e) => onPulsar(c, e.currentTarget)}>
      {c.parte === "pospuesto" ? t("Traer de vuelta") : t("Posponer")}
    </button>
  );
}

/** Si tienes la ventana delante: a la vista (no minimizada ni tapada del todo) y
    con el foco en ella, no en otra app. */
const aLaVista = () => !document.hidden && document.hasFocus();

function useMirando(): boolean {
  const [mirando, setMirando] = useState(aLaVista);
  useEffect(() => {
    const mirar = () => setMirando(aLaVista());
    window.addEventListener("focus", mirar);
    window.addEventListener("blur", mirar);
    document.addEventListener("visibilitychange", mirar);
    return () => {
      window.removeEventListener("focus", mirar);
      window.removeEventListener("blur", mirar);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, []);
  return mirando;
}

function useNotas(): [Note[], () => void] {
  const [notas, setNotas] = useState<Note[]>([]);
  const leer = useCallback(() => {
    readInbox()
      .then(setNotas)
      .catch(() => {});
  }, []);
  // Un archivo de texto pequeño: se relee a un ritmo lento, y un agente puede
  // dejar una nota en cualquier momento mientras miras.
  useEffect(() => latido(leer, 20_000), [leer]);
  useEffect(() => leer(), [leer]);
  return [notas, leer];
}

export default function DecisionesView({ decisiones, irATerminal, irA, onVolver, onHacer }: Props) {
  const { t, lang } = useT();
  const palabra = (c: keyof typeof PALABRA) => (lang === "en" ? PALABRA_EN : PALABRA)[c];
  /** «Vuelve a las 15:20», «Vuelve mañana a las 9:00» o «Vuelve el lun 23 a las 9:00». */
  const vuelveA = (hasta: number): string => {
    const lugar = lang === "en" ? "en-GB" : "es-ES";
    const hora = new Intl.DateTimeFormat(lugar, { hour: "numeric", minute: "2-digit" }).format(hasta);
    const dia = diaDe(hasta, Date.now());
    if (dia === "hoy") return t("Vuelve a las {hora}", { hora });
    if (dia === "manana") return t("Vuelve mañana a las {hora}", { hora });
    const cual = new Intl.DateTimeFormat(lugar, { weekday: "short", day: "numeric" }).format(hasta);
    return t("Vuelve el {dia} a las {hora}", { dia: cual, hora });
  };
  const deCuando = useHace();
  const avisos = useAvisos((s) => s.lista);
  const quitarAviso = useAvisos((s) => s.quitar);
  const [programados] = useProgramados();
  const [notas, releerNotas] = useNotas();
  const plan = usePlanPendiente((s) => s.pendiente);
  const reposo = useReposo((s) => s.reposo);
  const ahora = useReposo((s) => s.ahora);
  const lista = useMemo(
    () => juntar({ decisiones, avisos, programados: programados?.encargos ?? [], notas, plan, reposo, ahora }),
    [decisiones, avisos, programados, notas, plan, reposo, ahora],
  );
  const tocan = cuantasTeTocan(lista);

  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const dondeEstaba = useRef(-1);
  const abierta = laAbierta(lista, abiertaId, dondeEstaba.current);
  // La que se abre sola (la primera que te toca) se queda fijada: al
  // contestarla pasa a «Ya pasó», y sin esto la vista saltaba a la siguiente y
  // se perdía el «Enviada. Se ha tecleado en el panel…».
  useEffect(() => {
    if (!abierta) return;
    dondeEstaba.current = lista.indexOf(abierta);
    if (abierta.id !== abiertaId) setAbiertaId(abierta.id);
  }, [abierta, abiertaId, lista]);
  // Lo que se te pone delante, aunque sea solo, lo has visto; pero solo con la
  // ventana a la vista: minimizada o en otra app, lo que llega y se abre solo sigue
  // nuevo hasta que vuelvas. Una vez por cada vez que se abre: U la deja sin ver y
  // no se vuelve a marcar sola hasta que te vayas y vuelvas a ella.
  const mirando = useMirando();
  const vistaSola = useRef<string | null>(null);
  useEffect(() => {
    if (!abierta) {
      vistaSola.current = null;
      return;
    }
    if (!mirando || vistaSola.current === abierta.id) return;
    vistaSola.current = abierta.id;
    useReposo.getState().verla(abierta);
  }, [abierta, mirando]);

  const mando = useRef<MandoDecision | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const [chuleta, setChuleta] = useState(false);
  /** Lo que pasó con la última propuesta que atendiste. Se queda hasta que te
      mueves tú: al aceptarla se va de la lista y se abre la siguiente sola. */
  const [dicho, setDicho] = useState<{ ok: boolean; texto: string } | null>(null);

  const filaDe = (id: string) => raiz.current?.querySelector<HTMLButtonElement>(`.dec-fila[data-id="${CSS.escape(id)}"]`);
  const abrir = (c: Cosa | undefined, foco = true) => {
    if (!c) return;
    setDicho(null);
    setAbiertaId(c.id);
    // Abrirla tú es verla; U la devuelve a nueva y no se vuelve a marcar sola hasta
    // que te vayas y vuelvas a ella.
    vistaSola.current = c.id;
    useReposo.getState().verla(c);
    if (foco) requestAnimationFrame(() => filaDe(c.id)?.focus());
  };
  /** Intro: lo que hace cada cosa al abrirla de verdad. */
  const entrar = (c: Cosa) => {
    if (c.clase === "decide" || c.clase === "pasada") mando.current?.entrar();
    else if (c.clase === "contesta" || c.clase === "mira") irATerminal(c.a.paneId);
    else if (c.clase === "parado") irA("agenda");
    else if (c.clase === "plan") abrirAdeo();
    else requestAnimationFrame(() => raiz.current?.querySelector<HTMLButtonElement>(".dec-doc .dec-acciones button")?.focus());
  };

  // H: el menú de posponer, con sus plazos o una hora escrita. Es de la fila con la
  // que se abrió (`id`), no de la que esté abierta: si esa fila se va de la lista o
  // ya no se puede posponer (se contestó desde el móvil), el menú se cierra solo, en
  // vez de pasar a la vecina. Lo que pasa al elegir (qué se abre después) vive en
  // `dormir`.
  const [posponer, setPosponer] = useState<null | { modo: "menu" | "hora"; id: string; ancla?: Ancla }>(null);
  const [horaTexto, setHoraTexto] = useState("");
  const [horaMal, setHoraMal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const horaRef = useRef<HTMLInputElement>(null);
  const delMenu = posponer ? lista.find((c) => c.id === posponer.id) : undefined;
  const modo = posponer?.modo;
  useEffect(() => {
    if (modo === "menu") menuRef.current?.focus();
    else if (modo === "hora") horaRef.current?.focus();
  }, [modo]);
  /** Abre el menú de H para `c`; con el botón, junto a él (`ancla`). */
  const abrirMenu = (c: Cosa, ancla?: Ancla) => {
    setChuleta(false);
    setPosponer({ modo: "menu", id: c.id, ancla });
  };
  /** H o «Traer de vuelta» en una pospuesta: vuelve a su sitio, y como la tienes
      delante, vista. */
  const traerDeVuelta = (c: Cosa) => {
    useReposo.getState().despertar(c.id);
    useReposo.getState().verla(c);
  };
  /** El botón «Posponer» de lo abierto: lo mismo que H, y otra vez lo cierra. */
  const alBoton = (c: Cosa, boton: HTMLElement) => {
    if (c.parte === "pospuesto") return traerDeVuelta(c);
    if (posponer) return cerrarMenu();
    abrirMenu(c, anclaDe(boton, raiz.current));
  };
  const cerrarMenu = (foco = true) => {
    const id = posponer?.id;
    setPosponer(null);
    setHoraTexto("");
    setHoraMal(false);
    if (foco && id) requestAnimationFrame(() => filaDe(id)?.focus());
  };
  // Un clic fuera del menú lo cierra, y también pasar el foco fuera (Tab desde
  // «Cancelar»). El botón «Posponer» (`data-posponer`) no cuenta como fuera: lo abre
  // y lo cierra él.
  const esDelMenu = (n: EventTarget | null) =>
    n instanceof Node && (!!menuRef.current?.contains(n) || (n instanceof Element && !!n.closest("[data-posponer]")));
  const abiertoElMenu = !!posponer;
  useEffect(() => {
    if (!abiertoElMenu) return;
    const fuera = (e: MouseEvent) => {
      if (esDelMenu(e.target)) return;
      setPosponer(null);
      setHoraTexto("");
      setHoraMal(false);
    };
    window.addEventListener("mousedown", fuera, true);
    return () => window.removeEventListener("mousedown", fuera, true);
    // `esDelMenu` solo lee la referencia del menú, que no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertoElMenu]);
  const sinFila = !!posponer && !sePospone(delMenu);
  useEffect(() => {
    if (!sinFila) return;
    setPosponer(null);
    setHoraTexto("");
    setHoraMal(false);
  }, [sinFila]);
  /** Pospone la fila del menú hasta `hasta` y pasa a la siguiente que aún pide algo;
      si no queda ninguna, la calma. */
  const dormir = (hasta: number) => {
    const c = delMenu;
    // Con su «Enviar» ya pulsado (el menú quedó abierto y llegó Ctrl+Intro), irse la mandaría ya.
    if (!c || !sePospone(c) || (c.clase === "decide" && mando.current?.ocupada)) return cerrarMenu(false);
    const sigue = siguienteTrasApartar(lista, c.id);
    useReposo.getState().posponer(c, hasta);
    cerrarMenu(false);
    if (sigue) return abrir(sigue);
    dondeEstaba.current = -1;
    setAbiertaId(null);
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLButtonElement>(".dec-fila")?.focus());
  };
  const aplicarHora = () => {
    const hasta = cuandoVuelve(horaTexto, Date.now());
    if (hasta === null) return setHoraMal(true);
    dormir(hasta);
  };

  // El teclado. Escucha en la ventana mientras la pestaña está montada (solo se
  // monta a la vista), pero solo lo que pasa dentro de ella o sin foco en
  // ningún sitio: Adeo flotando por encima tiene sus propias teclas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && !raiz.current?.contains(el)) return;
      const escribe = !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && (el as HTMLInputElement).type !== "radio";
      const enRadio = !!el && el.tagName === "INPUT" && (el as HTMLInputElement).type === "radio";
      const enDetalle = !!el?.closest(".dec-doc");
      const hecho = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (posponer) {
        // El menú de H va encima de todo: lo suyo primero y nada se cuela a la lista.
        // Pero solo con el foco dentro de él y nunca con Ctrl: una tecla en otra caja
        // (la de «otra cosa» de la decisión) o un Ctrl+1 no son suyos.
        const enMenu = !el || el === document.body || !!menuRef.current?.contains(el);
        if (!enMenu || e.ctrlKey) return;
        const tecla = e.key.toLowerCase();
        if (e.key === "Escape") {
          hecho();
          if (posponer.modo === "hora") {
            setPosponer({ ...posponer, modo: "menu" });
            setHoraTexto("");
            setHoraMal(false);
          } else cerrarMenu();
          return;
        }
        if (posponer.modo === "hora") {
          // Intro aplica la hora desde su caja; sobre «Cancelar» o una opción, es
          // pulsar ese botón, como siempre.
          if (e.key === "Enter" && el === horaRef.current) {
            hecho();
            aplicarHora();
          }
          return;
        }
        const plazo = /^[1-4]$/.test(e.key) ? plazos(Date.now())[Number(e.key) - 1] : undefined;
        if (plazo) {
          hecho();
          dormir(plazo.hasta);
        } else if (tecla === "o") {
          hecho();
          setPosponer({ ...posponer, modo: "hora" });
        } else if (tecla === "h") {
          hecho();
          cerrarMenu();
        }
        return;
      }
      if (e.key === "Enter" && e.ctrlKey) {
        if (mando.current) {
          hecho();
          mando.current.enviar();
        }
        return;
      }
      if (e.ctrlKey) return;
      if (e.key === "Escape") {
        hecho();
        if (chuleta) return setChuleta(false);
        if (escribe) {
          // Primero sale de la caja de texto, a su pregunta.
          const q = el?.closest(".dec-pregunta");
          (q?.querySelector<HTMLInputElement>("input:checked") ?? q?.querySelector<HTMLInputElement>("input"))?.focus();
          return;
        }
        if (enDetalle && abierta) return filaDe(abierta.id)?.focus();
        return onVolver();
      }
      if (escribe) return;
      if (e.key === "Tab" && enRadio && mando.current) {
        if (mando.current.pasar(e.shiftKey ? -1 : 1)) return hecho();
        if (e.shiftKey && abierta) {
          hecho();
          filaDe(abierta.id)?.focus();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (!enRadio && (k === "j" || e.key === "ArrowDown")) return (hecho(), abrir(vecina(lista, abierta?.id ?? null, 1)));
      if (!enRadio && (k === "k" || e.key === "ArrowUp")) return (hecho(), abrir(vecina(lista, abierta?.id ?? null, -1)));
      if (e.key === "?") return (hecho(), setChuleta((v) => !v));
      if (k === "h" || k === "u") {
        // H pospone lo marcado (en una pospuesta, la trae de vuelta); U la marca
        // como vista o no vista. Lo que ya pasó no tiene ni una cosa ni otra.
        if (!abierta || abierta.clase === "pasada" || (k === "h" && mando.current?.ocupada)) return;
        hecho();
        if (k === "h") {
          if (abierta.parte === "pospuesto") traerDeVuelta(abierta);
          else abrirMenu(abierta);
        } else if (abierta.parte !== "pospuesto") {
          if (abierta.vista) useReposo.getState().sinVerla(abierta.id);
          else useReposo.getState().verla(abierta);
        }
        return;
      }
      if (!abierta) return;
      if (e.key === "Enter" && (el === document.body || !!el?.classList.contains("dec-fila"))) return (hecho(), entrar(abierta));
      if (/^[1-9]$/.test(e.key) && mando.current?.elegir(Number(e.key))) return hecho();
      if (k === "o" && mando.current) return (hecho(), mando.current.escribir());
      if (e.key === "Backspace" && abierta.clase === "mira") return (hecho(), quitarAviso(abierta.a.paneId));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Al entrar, el foco a la lista: así J y K funcionan sin un clic antes. Y
  // sobre todo si vienes de una terminal con Ctrl+Mayús+B: su caja de teclear
  // se queda con el foco aunque ya no se vea, y lo que pulsaras le llegaría.
  useEffect(() => {
    requestAnimationFrame(() => {
      if (raiz.current?.contains(document.activeElement)) return;
      (raiz.current?.querySelector<HTMLButtonElement>(".dec-fila[data-on='true']") ?? raiz.current?.querySelector<HTMLButtonElement>(".dec-fila"))?.focus();
    });
  }, []);

  const deDecision = (d: Decision) => [d.proyecto ?? "", d.panel ? t("panel {n}", { n: String(d.panel) }) : "", deCuando(d.creada)];
  const filas = (c: Cosa): { palabra: string; titulo: string; de: string[] } => {
    switch (c.clase) {
      case "decide":
        return { palabra: palabra("decide"), titulo: c.d.titulo, de: deDecision(c.d) };
      case "pasada":
        return { palabra: t(ACABO[c.d.vigencia] ?? ""), titulo: c.d.titulo, de: [c.d.proyecto ?? "", deCuando(c.cuando)] };
      case "contesta":
      case "mira":
        return { palabra: palabra(c.clase), titulo: c.a.nombre, de: [carpeta(c.a.cwd), deCuando(c.a.cuando)] };
      case "parado":
        return { palabra: palabra("parado"), titulo: c.p.nombre, de: [carpeta(c.p.cwd), deCuando(c.cuando)] };
      case "plan":
        return { palabra: palabra("plan"), titulo: c.plan.plan.resumen || c.plan.pedido, de: [t("plan de Adeo"), deCuando(c.cuando)] };
      case "idea":
        return { palabra: palabra("idea"), titulo: c.n.text, de: [c.n.project, c.n.kind === "paso" ? t("un paso para su METAS.md") : t("una idea")] };
    }
  };

  return (
    <div className="dec" ref={raiz}>
      <div className="dec-cuerpo">
        <nav className="dec-lista" aria-label={t("Decisiones")}>
          <header className="dec-head">
            <h1>{t("Decisiones")}</h1>
            <p>{tocan === 0 ? t("Nada te toca") : tocan === 1 ? t("1 te toca") : t("{n} te tocan", { n: String(tocan) })}</p>
          </header>
          {PARTES.map((parte) => {
            const suyas = lista.filter((c) => c.parte === parte);
            if (!suyas.length) return null;
            return (
              <section key={parte} className="dec-parte" data-parte={parte}>
                <h3 className="dec-lista-eti">{t(TITULO_DE[parte])}</h3>
                {suyas.map((c) => {
                  const f = filas(c);
                  return (
                    <button
                      key={c.id}
                      className="dec-fila"
                      data-id={c.id}
                      data-on={c.id === abierta?.id}
                      data-nueva={c.vista === false}
                      data-clase={c.clase}
                      onClick={() => abrir(c, false)}
                      onDoubleClick={() => entrar(c)}
                    >
                      <span className="dec-fila-titulo">
                        <b className="dec-palabra">{f.palabra}</b> <span className="stream-hide">{f.titulo}</span>
                      </span>
                      <span className="dec-fila-de">{[...f.de, c.hasta ? vuelveA(c.hasta) : ""].filter(Boolean).join(" · ")}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
          {lista.some((c) => c.parte === "pasado") && <p className="dec-lista-nota">{t("Lo que ya pasó se borra solo a la semana.")}</p>}
          <p className="dec-lista-nota">{t("Pulsa ? para ver las teclas.")}</p>
        </nav>
        <section className="dec-doc">
          {/* Con su id de clave: cada cosa empieza con su borrador y sin la
              cuenta atrás de la anterior. Al contestarla NO cambia, o se
              perdería el «Enviada. Se ha tecleado en el panel…». */}
          {!abierta ? (
            <Calma lista={lista} />
          ) : abierta.clase === "decide" || abierta.clase === "pasada" ? (
            <DecisionAbierta
              key={abierta.id}
              d={abierta.d}
              mando={mando}
              posponer={abierta.clase === "decide" ? <BotonPosponer c={abierta} onPulsar={alBoton} /> : undefined}
            />
          ) : abierta.clase === "contesta" || abierta.clase === "mira" ? (
            <Terminal
              key={abierta.id}
              c={abierta}
              onIr={() => irATerminal(abierta.a.paneId)}
              onQuitar={() => quitarAviso(abierta.a.paneId)}
              posponer={<BotonPosponer c={abierta} onPulsar={alBoton} />}
            />
          ) : abierta.clase === "parado" ? (
            <article className="dec-abierta">
              <header className="dec-abierta-cab">
                <h2>{abierta.p.nombre}</h2>
                <p className="dec-de">{[carpeta(abierta.p.cwd), t("lo paró el freno {cuando}", { cuando: deCuando(abierta.cuando) })].join(" · ")}</p>
                <p className="dec-contexto">
                  {t("Es un encargo programado que falló tres veces seguidas: el freno lo paró para que no siga gastando cuota. {motivo}", {
                    motivo: abierta.p.cortado?.motivo ?? "",
                  })}
                </p>
              </header>
              <div className="dec-acciones">
                <button className="np-btn" onClick={() => irA("agenda")}>
                  {t("Abrirlo en la Agenda")}
                </button>
                <BotonPosponer c={abierta} onPulsar={alBoton} />
              </div>
            </article>
          ) : abierta.clase === "plan" ? (
            <PlanAbierto key={abierta.id} p={abierta.plan} posponer={<BotonPosponer c={abierta} onPulsar={alBoton} />} />
          ) : abierta.clase === "idea" ? (
            <Propuesta
              key={abierta.id}
              n={abierta.n}
              posponer={<BotonPosponer c={abierta} onPulsar={alBoton} />}
              onHacer={onHacer}
              onHecho={(ok, texto) => {
                setDicho({ ok, texto });
                if (ok) releerNotas();
              }}
            />
          ) : null}
          {dicho && <p className={dicho.ok ? "np-ok dec-dicho" : "np-err dec-dicho"}>{dicho.texto}</p>}
        </section>
      </div>
      {chuleta && (
        <div className="dec-teclas" role="dialog" aria-label={t("Las teclas de Decisiones")}>
          <h2>{t("Las teclas de Decisiones")}</h2>
          <dl>
            {TECLAS.map(([k, que]) => (
              <div key={k}>
                <dt>{k.replace("Mayús", t("Mayús"))}</dt>
                <dd>{t(que)}</dd>
              </div>
            ))}
          </dl>
          <button className="mini" onClick={() => setChuleta(false)}>
            {t("Cerrar")}
          </button>
        </div>
      )}
      {posponer && sePospone(delMenu) && (
        <div
          className="dec-posponer"
          role="dialog"
          aria-label={t("Posponer")}
          tabIndex={-1}
          ref={menuRef}
          style={posponer.ancla ? { right: "auto", left: posponer.ancla.left, top: posponer.ancla.top ?? "auto", bottom: posponer.ancla.bottom ?? "auto", maxHeight: `calc(100% - ${(posponer.ancla.top ?? posponer.ancla.bottom ?? 0) + 24}px)` } : undefined}
          onBlur={(e) => {
            // Sin `relatedTarget` el foco no se va a ningún sitio (una caja que
            // desaparece al volver de «otra hora»): eso no es salir del menú.
            if (e.relatedTarget && !esDelMenu(e.relatedTarget)) cerrarMenu(false);
          }}
        >
          <h2>{t("Posponer")}</h2>
          <p className="dec-posponer-de stream-hide">{filas(delMenu).titulo}</p>
          <ul>
            {plazos(Date.now()).map((p) => (
              <li key={p.tecla}>
                <button className="dec-posponer-op" onClick={() => dormir(p.hasta)}>
                  <b>{p.tecla}</b>
                  <span>{t(p.clave)}</span>
                </button>
              </li>
            ))}
            <li>
              <button className="dec-posponer-op" onClick={() => setPosponer({ ...posponer, modo: "hora" })}>
                <b>O</b>
                <span>{t("Otra hora")}</span>
              </button>
            </li>
          </ul>
          {posponer.modo === "hora" && (
            <>
              <input
                ref={horaRef}
                className="dec-hora"
                value={horaTexto}
                onChange={(e) => {
                  setHoraTexto(e.target.value);
                  setHoraMal(false);
                }}
                placeholder={t("16:30, +45 (minutos) o en 2 h")}
                aria-label={t("Otra hora")}
                spellCheck={false}
                autoComplete="off"
              />
              {horaMal && <p className="np-err">{t("No entiendo esa hora. Prueba con 16:30, +45 o en 2 h.")}</p>}
            </>
          )}
          <p className="dec-posponer-nota">{t("Vuelve antes si el agente dice algo nuevo.")}</p>
          <button className="mini" onClick={() => cerrarMenu()}>
            {t("Cancelar")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Lo que se ve cuando nada te toca: Adeo tranquila y una línea. */
function Calma({ lista }: { lista: Cosa[] }) {
  const { t } = useT();
  return (
    <div className="dec-calma">
      <Mascota animo="quieta" alto={56} />
      <h2>{t("Nada te toca ahora")}</h2>
      <p>
        {lista.length > 0
          ? t("Lo demás está a la izquierda, por si quieres repasarlo.")
          : t("Cuando un agente te pregunte algo, termine o te deje una idea, sale aquí.")}
      </p>
    </div>
  );
}

/** Un plan de Adeo que cerraste sin contestar: qué pediste, qué haría y a Adeo. */
function PlanAbierto({ p, posponer }: { p: PlanPendiente; posponer: ReactNode }) {
  const { t } = useT();
  const deCuando = useHace();
  const n = p.plan.acciones.length;
  return (
    <article className="dec-abierta">
      <header className="dec-abierta-cab">
        <h2 className="stream-hide">{p.plan.resumen || p.pedido}</h2>
        <p className="dec-de">{[t("plan de Adeo"), deCuando(p.cuando)].join(" · ")}</p>
        <p className="dec-contexto">
          {n === 1
            ? t("Cerraste Adeo con este plan sin contestar, y no se ha abierto nada. Tiene 1 acción: ábrelo en Adeo para aprobarlo o cambiarlo.")
            : t("Cerraste Adeo con este plan sin contestar, y no se ha abierto nada. Tiene {n} acciones: ábrelo en Adeo para aprobarlo o cambiarlo.", { n: String(n) })}
        </p>
      </header>
      <ul className="dec-plan stream-hide">
        {p.plan.acciones.map((a, i) => (
          <li key={i}>{[a.proyecto, a.motivo ?? a.encargo ?? a.objetivo ?? a.prompt ?? a.comando].filter(Boolean).join(" · ").slice(0, 160)}</li>
        ))}
      </ul>
      <div className="dec-acciones">
        <button className="np-btn" onClick={() => abrirAdeo()}>
          {t("Abrirlo en Adeo")}
        </button>
        {posponer}
        <button className="mini" onClick={() => olvidarPlan()}>
          {t("Tirarlo")}
        </button>
      </div>
    </article>
  );
}

/** Una terminal que te espera o que terminó: su pantalla de ahora, y a ella. */
function Terminal({
  c,
  onIr,
  onQuitar,
  posponer,
}: {
  c: Extract<Cosa, { clase: "contesta" | "mira" }>;
  onIr: () => void;
  onQuitar: () => void;
  posponer: ReactNode;
}) {
  const { t } = useT();
  const deCuando = useHace();
  const [filas, setFilas] = useState<string[] | null>(() => pantallaDe(c.a.paneId));
  // Lo que se ve en ella, al día: leer el búfer que xterm ya tiene pintado es
  // recorrer unas pocas decenas de filas, nada que vaya a Rust.
  useEffect(() => {
    const id = window.setInterval(() => setFilas(pantallaDe(c.a.paneId)), 1500);
    return () => window.clearInterval(id);
  }, [c.a.paneId]);
  const ultimas = (filas ?? []).slice(-16);
  return (
    <article className="dec-abierta">
      <header className="dec-abierta-cab">
        <h2>{c.a.nombre}</h2>
        <p className="dec-de">{[carpeta(c.a.cwd), deCuando(c.a.cuando)].join(" · ")}</p>
        <p className="dec-contexto">
          {c.clase === "contesta"
            ? t("Está parada esperándote: te pregunta algo o te pide permiso. Se contesta en su terminal.")
            : t("Terminó su turno y todavía no lo has mirado.")}
        </p>
      </header>
      {ultimas.length > 0 && <pre className="dec-pantalla stream-hide">{ultimas.join("\n")}</pre>}
      <div className="dec-acciones">
        <button className="np-btn" onClick={() => onIr()}>
          {t("Ir a la terminal")}
        </button>
        {posponer}
        {c.clase === "mira" && (
          <button className="mini" onClick={() => onQuitar()}>
            {t("Quitar de la lista")}
          </button>
        )}
      </div>
    </article>
  );
}

/** Una idea o un paso que te dejó un agente (la regla R): aceptarla, hacerla o descartarla. */
function Propuesta({
  n,
  posponer,
  onHacer,
  onHecho,
}: {
  n: Note;
  posponer: ReactNode;
  onHacer?: (a: AccionConsejo) => Promise<string>;
  onHecho: (ok: boolean, texto: string) => void;
}) {
  const { t } = useT();
  const [proyectos, setProyectos] = useState<Project[]>([]);
  const [tienda, setTienda] = useState(yaEnLaTienda);
  const [ocupada, setOcupada] = useState(false);
  useEffect(() => {
    listProjects()
      .then(setProyectos)
      .catch(() => {});
    void enLaTienda().then(setTienda);
  }, []);
  // Lo que esa nota permite hacer, si permite algo: solo las del copiloto.
  const acc = accionDe(n.text);
  const hacer = async (que: () => Promise<string>) => {
    if (ocupada) return;
    setOcupada(true);
    try {
      onHecho(true, await que());
    } catch (e) {
      onHecho(false, String(e instanceof Error ? e.message : e));
    } finally {
      setOcupada(false);
    }
  };
  return (
    <article className="dec-abierta">
      <header className="dec-abierta-cab">
        <p className="dec-de">
          {[n.project, n.kind === "paso" ? t("un paso que te propone un agente") : t("una idea que te deja un agente")].join(" · ")}
        </p>
        <p className="dec-propuesta stream-hide">{n.text}</p>
      </header>
      <div className="dec-acciones">
        {/* Hacerlo va primero cuando existe: si el copiloto dice que Codex está
            más fresco, lo que uno hace al estar de acuerdo es abrir Codex. */}
        {acc && onHacer && (
          <button className="np-btn" disabled={ocupada} onClick={() => void hacer(() => hacerPropuesta(n, acc, onHacer))}>
            {rotuloDe(acc, t)}
          </button>
        )}
        {/* Una idea se guarda en la brújula; sin ella (la Tienda) solo se descarta. */}
        {!(tienda && n.kind !== "paso") && (
          <button
            className={acc && onHacer ? "mini" : "np-btn"}
            disabled={ocupada}
            data-tip={n.kind === "paso" ? t("Escribirlo en el METAS.md de {p}", { p: n.project }) : t("Guardarlo como idea en tu brújula")}
            onClick={() => void hacer(async () => (await aceptarPropuesta(n, proyectos, t)).dicho)}
          >
            {t("Aceptar")}
          </button>
        )}
        {posponer}
        <button
          className="mini"
          disabled={ocupada}
          data-tip={t("Descartar: se borra de la bandeja y ya está")}
          onClick={() =>
            void hacer(async () => {
              await descartarPropuesta(n);
              return t("Descartada: «{texto}».", { texto: n.text.length > 60 ? `${n.text.slice(0, 57)}…` : n.text });
            })
          }
        >
          {t("Descartar")}
        </button>
      </div>
    </article>
  );
}
