// La pestaña «Decisiones»: lo que te preguntan tus agentes con `ask_decision`.
//
// Munir, 2026-10-09, contestando desde el móvil la primera decisión de verdad:
// quería verlas también en el PC, «una sección Decisiones dentro de la app de
// escritorio». Son las mismas que contesta el móvil (`decisiones.rs`) y siguen
// sus mismas reglas, que salieron de la investigación de ese día (GOV.UK
// Radios, Material 3, Microsoft HAX): ninguna opción sale marcada, la
// recomendada lleva su etiqueta y su porqué, los números son los del agente
// (es lo que se dicta: «la 2»), cada pregunta admite tus palabras, y se manda a
// los cinco segundos con «Deshacer» por medio. Al mandarla, la respuesta se
// teclea en la terminal que preguntó, si sigue siendo la misma.

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { sendPty } from "../lib/pty";
import { hace } from "../lib/uso";
import Mascota from "./Mascota";
import {
  descartarDecision,
  faltan,
  guardarBorrador,
  leerBorrador,
  limpias,
  marcarEntregada,
  olvidarBorrador,
  porVigencia,
  responderDecision,
  type Decision,
  type Elecciones,
  type Pregunta,
} from "../lib/decisiones";

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

function useHace() {
  const { t } = useT();
  return (ms: number) => {
    const a = hace(ms);
    return t(a.clave, { n: a.valor });
  };
}

/** Cómo acabó, en una palabra, para la fila de una anterior. */
const ACABO: Record<string, string> = {
  huerfana: "sin nadie detrás",
  hablada: "hablada",
  contestada: "contestada",
  descartada: "descartada",
};

function Fila({ d, activa, onAbrir }: { d: Decision; activa: boolean; onAbrir: (id: string) => void }) {
  const { t } = useT();
  const deCuando = useHace();
  const n = d.preguntas.length;
  const viva = d.vigencia === "viva";
  const de = [
    viva ? d.proyecto : t(ACABO[d.vigencia]),
    viva && d.panel ? t("panel {n}", { n: String(d.panel) }) : viva ? "" : d.proyecto,
    viva ? (n === 1 ? t("1 pregunta") : t("{n} preguntas", { n: String(n) })) : "",
    deCuando(d.creada),
  ].filter(Boolean);
  return (
    <button className="dec-fila" data-on={activa} data-espera={viva} data-v={d.vigencia} onClick={() => onAbrir(d.id)}>
      <span className="dec-fila-titulo">{d.titulo}</span>
      <span className="dec-fila-de">{de.join(" · ")}</span>
    </button>
  );
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

function Abierta({ d }: { d: Decision }) {
  const { t } = useT();
  const deCuando = useHace();
  const contestada = d.respuesta;
  // Descartada: se enseña como quedó, y ya no se contesta.
  const cerrada = Boolean(contestada) || d.vigencia === "descartada";
  const [el, setEl] = useState<Elecciones>(() => (cerrada ? {} : leerBorrador(d.id)));
  const [quedan, setQuedan] = useState<number | null>(null);
  const [mandando, setMandando] = useState(false);
  const [estado, setEstado] = useState("");
  const reloj = useRef<number | null>(null);
  const montada = useRef(true);
  // Lo último marcado, para mandarlo aunque cambies de pestaña en la cuenta atrás.
  const ultima = useRef(el);
  ultima.current = el;

  const elegida = (q: string) => (contestada ? contestada.elecciones[q]?.opcion : el[q]?.opcion);
  const escrita = (q: string) => (contestada ? contestada.elecciones[q]?.texto : el[q]?.texto) ?? "";
  const falta = cerrada ? [] : faltan(d, el);

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
    if (faltan(d, el).length) return;
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

  const de = [d.proyecto, d.panel ? t("panel {n}", { n: String(d.panel) }) : "", deCuando(d.creada)].filter(Boolean);
  const avisoFalta =
    falta.length === 0
      ? ""
      : falta.length === 1
        ? t("Falta la pregunta {q}.", { q: falta[0] })
        : t("Faltan las preguntas {lista} y {ultima}.", { lista: falta.slice(0, -1).join(", "), ultima: falta[falta.length - 1] });
  const anclaDe = (q: string) => `dec-q-${d.id}-${q}`;

  return (
    <article className="dec-abierta">
      <div className="dec-hoja">
        <header className="dec-abierta-cab">
          <h2>{d.titulo}</h2>
          <p className="dec-de">{de.join(" · ")}</p>
          {d.contexto && <p className="dec-contexto">{d.contexto}</p>}
        </header>

        {d.preguntas.map((q) => (
          <fieldset key={q.id} id={anclaDe(q.id)} className="dec-pregunta" disabled={cerrada || quedan != null || mandando}>
            <legend>
              <span className="dec-letra">{q.id}</span>
              {q.titulo}
            </legend>
            {q.contexto && <p className="dec-contexto">{q.contexto}</p>}
            {q.opciones.map((o, i) => (
              <label key={i} className="dec-opcion" data-marcada={elegida(q.id) === i + 1}>
                <input
                  type="radio"
                  name={`dec-${d.id}-${q.id}`}
                  checked={elegida(q.id) === i + 1}
                  onChange={() => poner(q.id, { opcion: i + 1 })}
                />
                <span className="dec-num">{i + 1}</span>
                <span className="dec-opcion-txt">
                  <span className="dec-opcion-linea">
                    <b>{o.texto}</b>
                    {o.recomendada && <em className="dec-rec">{t("Recomendada")}</em>}
                  </span>
                  {o.detalle && <small>{o.detalle}</small>}
                </span>
              </label>
            ))}
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

      {/* La ficha: si alguien la espera, lo que llevas elegido y el botón de
          mandarlo, siempre a la vista. Antes todo eso iba debajo de la última
          pregunta, y a la derecha quedaba una caja vacía (Munir, 2026-10-11:
          «a la derecha hay mucho espacio en blanco»). */}
      <aside className="dec-ficha" aria-label={t("Tu respuesta")}>
        {contestada && (
          <p className="dec-hecha">
            {/* «el PC» lo pone esta pestaña; el móvil, el nombre del aparato. */}
            {t("Contestada desde {desde}, {cuando}.", { desde: t(contestada.desde), cuando: deCuando(contestada.cuando) })}{" "}
            {contestada.entregada && d.panel
              ? t("Se tecleó en el panel {n}.", { n: String(d.panel) })
              : t("El agente la lee cuando la pide.")}
          </p>
        )}
        {d.vigencia === "viva" && (
          <p className="dec-vigencia" data-v="viva">
            {d.panel != null
              ? t("El panel {n} sigue abierto y espera tu respuesta.", { n: String(d.panel) })
              : t("Te espera: el agente la leerá cuando la pida.")}
          </p>
        )}
        {d.vigencia === "huerfana" && (
          <p className="dec-vigencia" data-v="huerfana">
            {t("Ya no la espera nadie: la terminal que preguntó se cerró. Si la contestas se guarda, pero no se teclea en ningún sitio.")}
          </p>
        )}
        {d.vigencia === "hablada" && d.hablada != null && (
          <p className="dec-vigencia" data-v="hablada">
            {t("La hablaste con el agente: le escribiste a su terminal {cuando}. Si no era eso, aún puedes contestarla aquí.", {
              cuando: deCuando(d.hablada),
            })}
          </p>
        )}
        {d.vigencia === "descartada" && d.descartada != null && (
          <p className="dec-vigencia" data-v="descartada">
            {t("La descartaste {cuando}, sin contestarla.", { cuando: deCuando(d.descartada) })}
          </p>
        )}

        <div className="dec-ficha-eti">{t("Tu respuesta")}</div>
        <ol className="dec-resumen">
          {d.preguntas.map((q) => (
            <li key={q.id}>
              <button
                className="dec-resumen-q"
                onClick={() => document.getElementById(anclaDe(q.id))?.scrollIntoView({ block: "start", behavior: "smooth" })}
              >
                <span className="dec-letra">{q.id}</span>
                <span className="dec-resumen-txt">
                  <span className="dec-resumen-titulo">{q.titulo}</span>
                  <Elegido q={q} opcion={elegida(q.id)} texto={escrita(q.id)} cerrada={cerrada} />
                </span>
              </button>
            </li>
          ))}
        </ol>

        {(!cerrada || estado) && (
          <footer className="dec-pie">
            <p className="dec-estado" role="status" aria-live="polite">
              {estado || (quedan != null ? t("Se manda en {n} s.", { n: String(quedan) }) : avisoFalta)}
            </p>
            {!cerrada && (
              <div className="dec-pie-botones">
                {quedan == null && !mandando && (
                  <button className="mini" onClick={() => void descartar(d.id)}>
                    {t("Descartar")}
                  </button>
                )}
                <button
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
      </aside>
    </article>
  );
}

/** Lo que se ve cuando nada te espera: Adeo tranquila y una línea. */
function Calma({ anteriores }: { anteriores: number }) {
  const { t } = useT();
  return (
    <div className="dec-calma">
      <Mascota animo="quieta" alto={56} />
      <h2>{t("No te espera ninguna decisión")}</h2>
      <p>
        {anteriores > 0
          ? t("Las anteriores están a la izquierda, por si quieres repasarlas. A la semana se borran solas.")
          : t("Cuando un agente te pregunte algo con ask_decision, sale aquí y en el móvil.")}
      </p>
    </div>
  );
}

export default function DecisionesView({ decisiones }: { decisiones: Decision[] }) {
  const { t } = useT();
  const { vivas, anteriores } = porVigencia(decisiones);
  const [abierta, setAbierta] = useState<string | null>(null);
  // Sola solo se abre una que te espera: con nada pendiente, la pestaña dice
  // eso y no te planta delante una de ayer.
  const d = decisiones.find((x) => x.id === abierta) ?? vivas[0];
  // La que se abre sola (la primera que te espera) se queda fijada: al
  // contestarla deja de ser la primera, y sin esto la vista saltaba a la
  // siguiente y se perdía el «Enviada. Se ha tecleado en el panel…».
  useEffect(() => {
    if (abierta == null && d) setAbierta(d.id);
  }, [abierta, d]);

  return (
    <div className="dec">
      <div className="dec-cuerpo">
        <nav className="dec-lista" aria-label={t("Decisiones")}>
          {/* El título dentro del cristal: suelto encima de la foto no se leía. */}
          <header className="dec-head">
            <h1>{t("Decisiones")}</h1>
            <p>
              {vivas.length === 0
                ? t("Nada te espera")
                : vivas.length === 1
                  ? t("1 te espera")
                  : t("{n} te esperan", { n: String(vivas.length) })}
            </p>
          </header>
          {vivas.length > 0 && <div className="dec-lista-eti">{t("Te esperan")}</div>}
          {vivas.map((x) => (
            <Fila key={x.id} d={x} activa={x.id === d?.id} onAbrir={setAbierta} />
          ))}
          {anteriores.length > 0 && <div className="dec-lista-eti">{t("Anteriores")}</div>}
          {anteriores.map((x) => (
            <Fila key={x.id} d={x} activa={x.id === d?.id} onAbrir={setAbierta} />
          ))}
          {anteriores.length > 0 && <p className="dec-lista-nota">{t("Ya no te esperan. A la semana se borran solas.")}</p>}
        </nav>
        <section className="dec-doc">
          {/* Con su id de clave: cada decisión empieza con su borrador y sin
              la cuenta atrás de la anterior. Al contestarla NO cambia, o se
              perdería el «Enviada. Se ha tecleado en el panel…». */}
          {d ? <Abierta key={d.id} d={d} /> : <Calma anteriores={anteriores.length} />}
        </section>
      </div>
    </div>
  );
}
