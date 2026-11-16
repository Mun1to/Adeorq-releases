// Una decisión abierta en la lista de Decisiones: lo que te pregunta un agente
// con `ask_decision`.
//
// Sigue las reglas de la investigación del 2026-10-09 (GOV.UK Radios, Material 3,
// Microsoft HAX): ninguna opción sale marcada, la recomendada lleva su palabra
// y su porqué, los números son los del agente (es lo que se dicta: «la 2»),
// cada pregunta admite tus palabras, y se manda a los cinco segundos con
// «Deshacer» por medio. Al mandarla, la respuesta se teclea en la terminal que
// preguntó, si sigue siendo la misma.
//
// Desde el 2026-11-15 (A1) va de borde a borde, sin cajas alrededor: lo que
// llevas elegido y el botón de mandarlo están en una barra al pie, y se contesta
// con el teclado (1 a 9, Tab, O y Ctrl+Intro) por el `mando` que lee la lista.

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useT } from "../lib/i18n";
import { sendPty } from "../lib/pty";
import { hace } from "../lib/uso";
import {
  descartarDecision,
  faltan,
  guardarBorrador,
  leerBorrador,
  limpias,
  marcarEntregada,
  olvidarBorrador,
  responderDecision,
  type Decision,
  type Elecciones,
  type Pregunta,
} from "../lib/decisiones";

/** Lo que la lista le pide a la decisión abierta desde el teclado. */
export interface MandoDecision {
  /** Elige la opción `n` (desde 1) en la pregunta que tienes delante. */
  elegir: (n: number) => boolean;
  /** Pasa a la pregunta siguiente o a la anterior; desde la última, al botón
      de enviar. Devuelve `false` si ya no hay nada en esa dirección. */
  pasar: (paso: 1 | -1) => boolean;
  /** «Otra cosa, con tus palabras», en la pregunta de delante. */
  escribir: () => void;
  /** Ctrl+Intro: lo mismo que pulsar «Enviar respuesta» (o «Deshacer»). */
  enviar: () => void;
  /** Intro desde la lista: a la primera pregunta sin contestar. */
  entrar: () => void;
  /** En la cuenta atrás de «Enviar» o mandándose: no se pospone (sin su botón, la H
      tampoco), porque irse de ella la manda en el acto y se salta el «Deshacer». */
  ocupada: boolean;
}

/**
 * Aparta una decisión sin contestarla. Si una terminal la esperaba, se le dice
 * (lo teclea esta ventana, que es la que tiene las terminales): un agente que
 * espera una respuesta que no va a llegar se queda parado sin saber por qué.
 */
async function descartar(id: string): Promise<void> {
  const r = await descartarDecision(id);
  olvidarBorrador(id);
  if (r.panel != null && r.texto) await sendPty(r.panel, r.texto).catch(() => {});
}

/** Lo que tarda en mandarse, con «Deshacer» mientras tanto. */
const ESPERA_S = 5;

export function useHace() {
  const { t } = useT();
  return (ms: number) => {
    const a = hace(ms);
    return t(a.clave, { n: a.valor });
  };
}

/** Lo elegido en una pregunta, en una línea: la opción, tus palabras, o que falta. */
function Elegido({ q, opcion, texto, cerrada }: { q: Pregunta; opcion?: number; texto: string; cerrada: boolean }) {
  const { t } = useT();
  const o = opcion ? q.opciones[opcion - 1] : undefined;
  if (!o && !texto.trim()) {
    return <span className="dec-elegido" data-falta="true">{cerrada ? t("Sin contestar") : t("Falta")}</span>;
  }
  return (
    <span className="dec-elegido">
      {o && (
        <b>
          {opcion} · {o.texto}
        </b>
      )}
      {texto.trim() && <i>«{texto.trim()}»</i>}
    </span>
  );
}

export default function DecisionAbierta({
  d,
  mando,
  posponer,
}: {
  d: Decision;
  mando: MutableRefObject<MandoDecision | null>;
  /** El botón de posponer de la lista, entre «Descartar» y «Enviar». */
  posponer?: ReactNode;
}) {
  const { t } = useT();
  const deCuando = useHace();
  const contestada = d.respuesta;
  // Descartada, o resuelta por el agente: se enseña como quedó, y ya no se contesta.
  const cerrada = Boolean(contestada) || d.vigencia === "descartada" || d.vigencia === "resuelta";
  const [el, setEl] = useState<Elecciones>(() => (cerrada ? {} : leerBorrador(d.id)));
  const [quedan, setQuedan] = useState<number | null>(null);
  const [mandando, setMandando] = useState(false);
  const [estado, setEstado] = useState("");
  /** La pregunta que tienes delante: la del foco, o a la que te llevó Tab. */
  const [delante, setDelante] = useState(0);
  const reloj = useRef<number | null>(null);
  const montada = useRef(true);
  const enviarRef = useRef<HTMLButtonElement>(null);
  // Lo último marcado, para mandarlo aunque cambies de pestaña en la cuenta atrás.
  const ultima = useRef(el);
  ultima.current = el;

  const elegida = (q: string) => (contestada ? contestada.elecciones[q]?.opcion : el[q]?.opcion);
  const escrita = (q: string) => (contestada ? contestada.elecciones[q]?.texto : el[q]?.texto) ?? "";
  const falta = cerrada ? [] : faltan(d, el);
  const quieta = cerrada || quedan != null || mandando;

  const poner = (q: string, cambio: { opcion?: number; texto?: string }) => {
    setEl((antes) => {
      const nuevo = { ...antes, [q]: { ...antes[q], ...cambio } };
      guardarBorrador(d.id, nuevo);
      return nuevo;
    });
  };

  const mandar = async (elecciones: Elecciones) => {
    if (montada.current) setMandando(true);
    try {
      const r = await responderDecision(d.id, limpias(d, elecciones));
      olvidarBorrador(d.id);
      let dicho = t("Enviada. El agente la leerá cuando la pida.");
      if (r.panel != null && r.texto) {
        try {
          await sendPty(r.panel, r.texto);
          await marcarEntregada(d.id);
          dicho = t("Enviada. Se ha tecleado en el panel {n}.", { n: String(r.panel) });
        } catch {
          dicho = t("Enviada, pero el panel {n} ya no está: el agente la leerá cuando la pida.", { n: String(r.panel) });
        }
      }
      if (montada.current) setEstado(dicho);
    } catch (e) {
      if (!montada.current) return;
      const texto = String(e);
      // Contestada ya desde otro sitio: lo que escribiste sigue en el borrador.
      setEstado(
        texto.includes("ya está contestada")
          ? t("Ya estaba contestada desde otro sitio. Lo que escribiste sigue guardado aquí.")
          : t("No se ha mandado: {e}", { e: texto }),
      );
    } finally {
      if (montada.current) setMandando(false);
    }
  };

  const parar = () => {
    if (reloj.current != null) window.clearInterval(reloj.current);
    reloj.current = null;
    setQuedan(null);
  };

  const pulsar = () => {
    if (reloj.current != null) {
      parar();
      setEstado(t("No se ha mandado."));
      return;
    }
    if (cerrada || mandando || faltan(d, el).length) return;
    setEstado("");
    let n = ESPERA_S;
    setQuedan(n);
    reloj.current = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setQuedan(n);
        return;
      }
      parar();
      void mandar(ultima.current);
    }, 1000);
  };

  // Si te vas de la pestaña en plena cuenta atrás, se manda ya: pulsaste
  // «Enviar», y «Deshacer» solo vale mientras lo estás viendo.
  useEffect(
    () => () => {
      montada.current = false;
      if (reloj.current != null) {
        window.clearInterval(reloj.current);
        reloj.current = null;
        void mandar(ultima.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const anclaDe = (q: string) => `dec-q-${d.id}-${q}`;
  /** El foco a una pregunta: a su opción marcada, o a la primera. Un grupo de
      botones de radio es una sola parada de Tab y se recorre con las flechas. */
  const enfocar = (i: number) => {
    const q = d.preguntas[i];
    if (!q) return;
    setDelante(i);
    requestAnimationFrame(() => {
      const caja = document.getElementById(anclaDe(q.id));
      const radio = caja?.querySelector<HTMLInputElement>("input:checked") ?? caja?.querySelector<HTMLInputElement>("input");
      radio?.focus();
      caja?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const m: MandoDecision = {
    elegir: (n) => {
      const q = d.preguntas[delante];
      if (quieta || !q || n < 1 || n > q.opciones.length) return false;
      poner(q.id, { opcion: n });
      enfocar(delante);
      return true;
    },
    pasar: (paso) => {
      const i = delante + paso;
      if (i < 0) return false;
      if (i >= d.preguntas.length) {
        if (!enviarRef.current || enviarRef.current.disabled) return false;
        enviarRef.current.focus();
        return true;
      }
      enfocar(i);
      return true;
    },
    escribir: () => {
      const q = d.preguntas[delante];
      if (quieta || !q) return;
      document.getElementById(anclaDe(q.id))?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    },
    enviar: () => pulsar(),
    entrar: () => {
      const i = d.preguntas.findIndex((q) => !elegida(q.id) && !escrita(q.id).trim());
      enfocar(i < 0 ? 0 : i);
    },
    ocupada: quedan != null || mandando,
  };
  useEffect(() => {
    mando.current = m;
    return () => {
      if (mando.current === m) mando.current = null;
    };
  });

  const de = [d.proyecto, d.panel ? t("panel {n}", { n: String(d.panel) }) : "", deCuando(d.creada)].filter(Boolean);
  const avisoFalta =
    falta.length === 0
      ? ""
      : falta.length === 1
        ? t("Falta la pregunta {q}.", { q: falta[0] })
        : t("Faltan las preguntas {lista} y {ultima}.", { lista: falta.slice(0, -1).join(", "), ultima: falta[falta.length - 1] });

  return (
    <article className="dec-abierta" data-decision>
      <div className="dec-hoja">
        <header className="dec-abierta-cab">
          <h2>{d.titulo}</h2>
          <p className="dec-de">{de.join(" · ")}</p>
          {contestada && (
            <p className="dec-hecha">
              {/* «el PC» lo pone esta pestaña; el móvil, el nombre del aparato. */}
              {t("Contestada desde {desde}, {cuando}.", { desde: t(contestada.desde), cuando: deCuando(contestada.cuando) })}{" "}
              {contestada.entregada && d.panel
                ? t("Se tecleó en el panel {n}.", { n: String(d.panel) })
                : t("El agente la lee cuando la pide.")}
            </p>
          )}
          <Vigencia d={d} />
          {d.contexto && <p className="dec-contexto">{d.contexto}</p>}
        </header>

        {d.preguntas.map((q, i) => (
          <fieldset
            key={q.id}
            id={anclaDe(q.id)}
            className="dec-pregunta"
            data-delante={i === delante && !quieta}
            disabled={quieta}
            onFocus={() => setDelante(i)}
          >
            <legend>
              <span className="dec-letra">{q.id}</span>
              {q.titulo}
            </legend>
            {q.contexto && <p className="dec-contexto">{q.contexto}</p>}
            <div className="dec-opciones">
              {q.opciones.map((o, j) => (
                <label key={j} className="dec-opcion" data-marcada={elegida(q.id) === j + 1}>
                  <input
                    type="radio"
                    name={`dec-${d.id}-${q.id}`}
                    checked={elegida(q.id) === j + 1}
                    onChange={() => poner(q.id, { opcion: j + 1 })}
                  />
                  <span className="dec-num">{j + 1}</span>
                  <span className="dec-opcion-txt">
                    <span className="dec-opcion-linea">
                      <b>{o.texto}</b>
                      {o.recomendada && <em className="dec-rec">{t("Recomendada")}</em>}
                    </span>
                    {o.detalle && <small>{o.detalle}</small>}
                  </span>
                </label>
              ))}
            </div>
            {(!cerrada || escrita(q.id)) && (
              <>
                <div className="dec-o">{t("o")}</div>
                <textarea
                  className="dec-libre"
                  rows={2}
                  value={escrita(q.id)}
                  readOnly={cerrada}
                  placeholder={t("Otra cosa, con tus palabras")}
                  aria-label={t("Otra cosa para la pregunta {q}, con tus palabras", { q: q.id })}
                  onChange={(e) => poner(q.id, { texto: e.target.value })}
                />
              </>
            )}
          </fieldset>
        ))}
      </div>

      {/* La barra del pie: lo que llevas elegido y el botón de mandarlo,
          siempre a la vista. Era una columna a la derecha («Tu respuesta») y
          pasó aquí con la lista única (A1, 2026-11-15). */}
      {(!cerrada || estado) && (
        <footer className="dec-barra" aria-label={t("Tu respuesta")}>
          {!cerrada && (
            <ol className="dec-resumen">
              {d.preguntas.map((q, i) => (
                <li key={q.id}>
                  <button className="dec-resumen-q" data-tip={q.titulo} onClick={() => enfocar(i)}>
                    <span className="dec-letra">{q.id}</span>
                    <Elegido q={q} opcion={elegida(q.id)} texto={escrita(q.id)} cerrada={cerrada} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="dec-estado" role="status" aria-live="polite">
            {estado || (quedan != null ? t("Se manda en {n} s.", { n: String(quedan) }) : avisoFalta)}
          </p>
          {!cerrada && (
            <div className="dec-pie-botones">
              {quedan == null && !mandando && (
                <>
                  <button className="mini" onClick={() => void descartar(d.id)}>
                    {t("Descartar")}
                  </button>
                  {posponer}
                </>
              )}
              <button
                ref={enviarRef}
                className={quedan != null ? "mini dec-deshacer" : "np-btn"}
                disabled={mandando || (quedan == null && falta.length > 0)}
                onClick={() => pulsar()}
              >
                {mandando
                  ? t("Mandando…")
                  : quedan != null
                    ? t("Deshacer ({n})", { n: String(quedan) })
                    : t("Enviar respuesta")}
              </button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

/** Si sigue viva o no: es lo primero que hay que saber antes de contestar. */
function Vigencia({ d }: { d: Decision }) {
  const { t } = useT();
  const deCuando = useHace();
  const texto =
    d.vigencia === "viva"
      ? d.panel != null
        ? t("El panel {n} sigue abierto y espera tu respuesta.", { n: String(d.panel) })
        : t("Te espera: el agente la leerá cuando la pida.")
      : d.vigencia === "huerfana"
        ? t("Ya no la espera nadie: la terminal que preguntó se cerró. Si la contestas se guarda, pero no se teclea en ningún sitio.")
        : d.vigencia === "hablada" && d.hablada != null
          ? t("La hablaste con el agente: le escribiste a su terminal {cuando}. Si no era eso, aún puedes contestarla aquí.", {
              cuando: deCuando(d.hablada),
            })
          : d.vigencia === "descartada" && d.descartada != null
            ? t("La descartaste {cuando}, sin contestarla.", { cuando: deCuando(d.descartada) })
            : d.vigencia === "resuelta" && d.resuelta
              ? d.resuelta.sustituta
                ? t("Ya está decidida: la sustituye otra que pregunta lo mismo ({id}).", { id: d.resuelta.sustituta })
                : t("Ya está decidida: el agente la dio por resuelta {cuando}. {como}", {
                    cuando: deCuando(d.resuelta.cuando),
                    como: d.resuelta.como,
                  })
              : "";
  if (!texto) return null;
  return (
    <p className="dec-vigencia" data-v={d.vigencia}>
      {texto}
    </p>
  );
}
