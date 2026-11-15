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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, type Translate } from "../lib/i18n";
import { useAvisos } from "../lib/campana";
import type { Decision } from "../lib/decisiones";
import {
  ACABO,
  PALABRA,
  PARTES,
  TITULO_DE,
  carpeta,
  cuantasTeTocan,
  juntar,
  laAbierta,
  vecina,
  type Cosa,
} from "../lib/decisionesLista";
import { accionDe, type AccionConsejo } from "../lib/acciones";
import { enLaTienda, yaEnLaTienda } from "../lib/empaquetada";
import { latido } from "../lib/latido";
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
const PALABRA_EN: typeof PALABRA = { contesta: "Answer", decide: "Decide", parado: "Stopped", mira: "Look", idea: "Idea" };

/** Las teclas, para la chuleta del «?». */
const TECLAS: Array<[string, string]> = [
  ["J  K  ↓  ↑", "Bajar y subir por la lista"],
  ["Intro", "Abrir: contestar la decisión, o ir a su terminal"],
  ["1 a 9", "Elegir esa opción en la pregunta que tienes delante"],
  ["Tab  Mayús+Tab", "Pasar a la pregunta siguiente o a la anterior"],
  ["O", "Escribir otra cosa, con tus palabras"],
  ["Ctrl+Intro", "Enviar la respuesta (con cinco segundos para deshacer)"],
  ["Retroceso", "Quitar de la lista un turno que terminó"],
  ["Esc", "Salir de la caja de texto; otra vez, volver adonde estabas"],
  ["Ctrl+Mayús+B", "Abrir Decisiones desde cualquier sitio"],
];

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
  const deCuando = useHace();
  const avisos = useAvisos((s) => s.lista);
  const quitarAviso = useAvisos((s) => s.quitar);
  const [programados] = useProgramados();
  const [notas, releerNotas] = useNotas();
  const lista = useMemo(
    () => juntar({ decisiones, avisos, programados: programados?.encargos ?? [], notas }),
    [decisiones, avisos, programados, notas],
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
    if (foco) requestAnimationFrame(() => filaDe(c.id)?.focus());
  };
  /** Intro: lo que hace cada cosa al abrirla de verdad. */
  const entrar = (c: Cosa) => {
    if (c.clase === "decide" || c.clase === "pasada") mando.current?.entrar();
    else if (c.clase === "contesta" || c.clase === "mira") irATerminal(c.a.paneId);
    else if (c.clase === "parado") irA("agenda");
    else requestAnimationFrame(() => raiz.current?.querySelector<HTMLButtonElement>(".dec-doc .dec-acciones button")?.focus());
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
                      data-clase={c.clase}
                      onClick={() => abrir(c, false)}
                      onDoubleClick={() => entrar(c)}
                    >
                      <span className="dec-fila-titulo">
                        <b className="dec-palabra">{f.palabra}</b> <span className="stream-hide">{f.titulo}</span>
                      </span>
                      <span className="dec-fila-de">{f.de.filter(Boolean).join(" · ")}</span>
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
            <DecisionAbierta key={abierta.id} d={abierta.d} mando={mando} />
          ) : abierta.clase === "contesta" || abierta.clase === "mira" ? (
            <Terminal key={abierta.id} c={abierta} onIr={() => irATerminal(abierta.a.paneId)} onQuitar={() => quitarAviso(abierta.a.paneId)} />
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
              </div>
            </article>
          ) : abierta.clase === "idea" ? (
            <Propuesta
              key={abierta.id}
              n={abierta.n}
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

/** Una terminal que te espera o que terminó: su pantalla de ahora, y a ella. */
function Terminal({ c, onIr, onQuitar }: { c: Extract<Cosa, { clase: "contesta" | "mira" }>; onIr: () => void; onQuitar: () => void }) {
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
  onHacer,
  onHecho,
}: {
  n: Note;
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
