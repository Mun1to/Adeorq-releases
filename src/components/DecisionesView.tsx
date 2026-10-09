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
import {
  faltan,
  guardarBorrador,
  leerBorrador,
  limpias,
  marcarEntregada,
  olvidarBorrador,
  responderDecision,
  type Decision,
  type Elecciones,
} from "../lib/decisiones";

/** Lo que tarda en mandarse, con «Deshacer» mientras tanto. */
const ESPERA_S = 5;

function useHace() {
  const { t } = useT();
  return (ms: number) => {
    const a = hace(ms);
    return t(a.clave, { n: a.valor });
  };
}

function Fila({ d, activa, onAbrir }: { d: Decision; activa: boolean; onAbrir: (id: string) => void }) {
  const { t } = useT();
  const deCuando = useHace();
  const n = d.preguntas.length;
  const de = [
    d.proyecto,
    d.panel ? t("panel {n}", { n: String(d.panel) }) : "",
    n === 1 ? t("1 pregunta") : t("{n} preguntas", { n: String(n) }),
    deCuando(d.creada),
  ].filter(Boolean);
  return (
    <button className="dec-fila" data-on={activa} data-espera={!d.respuesta} onClick={() => onAbrir(d.id)}>
      <span className="dec-fila-titulo">{d.titulo}</span>
      <span className="dec-fila-de">{de.join(" · ")}</span>
    </button>
  );
}

function Abierta({ d }: { d: Decision }) {
  const { t } = useT();
  const deCuando = useHace();
  const contestada = d.respuesta;
  const [el, setEl] = useState<Elecciones>(() => (contestada ? {} : leerBorrador(d.id)));
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
  const falta = contestada ? [] : faltan(d, el);

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

  return (
    <article className="dec-abierta">
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
        {d.contexto && <p className="dec-contexto">{d.contexto}</p>}
      </header>

      {d.preguntas.map((q) => (
        <fieldset key={q.id} className="dec-pregunta" disabled={Boolean(contestada) || quedan != null || mandando}>
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
                <b>{o.texto}</b>
                {o.recomendada && <em className="dec-rec">{t("Recomendada")}</em>}
                {o.detalle && <small>{o.detalle}</small>}
              </span>
            </label>
          ))}
          {(!contestada || escrita(q.id)) && (
            <>
              <div className="dec-o">{t("o")}</div>
              <textarea
                className="dec-libre"
                rows={2}
                value={escrita(q.id)}
                readOnly={Boolean(contestada)}
                placeholder={t("Otra cosa, con tus palabras")}
                aria-label={t("Otra cosa para la pregunta {q}, con tus palabras", { q: q.id })}
                onChange={(e) => poner(q.id, { texto: e.target.value })}
              />
            </>
          )}
        </fieldset>
      ))}

      {(!contestada || estado) && (
        <footer className="dec-pie">
          <p className="dec-estado" role="status" aria-live="polite">
            {estado || (quedan != null ? t("Se manda en {n} s.", { n: String(quedan) }) : avisoFalta)}
          </p>
          {!contestada && (
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
          )}
        </footer>
      )}
    </article>
  );
}

export default function DecisionesView({ decisiones }: { decisiones: Decision[] }) {
  const { t } = useT();
  const espera = decisiones.filter((d) => !d.respuesta);
  const hechas = decisiones.filter((d) => d.respuesta);
  const [abierta, setAbierta] = useState<string | null>(null);
  const d = decisiones.find((x) => x.id === abierta) ?? espera[0] ?? hechas[0];
  // La que se abre sola (la primera que te espera) se queda fijada: al
  // contestarla deja de ser la primera, y sin esto la vista saltaba a la
  // siguiente y se perdía el «Enviada. Se ha tecleado en el panel…».
  useEffect(() => {
    if (abierta == null && d) setAbierta(d.id);
  }, [abierta, d]);

  return (
    <div className="dec">
      <header className="dec-head">
        <h1>{t("Decisiones")}</h1>
        <p>{t("Lo que te preguntan tus agentes. Se contestan aquí o desde el móvil, y la respuesta vuelve sola a su terminal.")}</p>
      </header>
      {decisiones.length === 0 ? (
        <p className="dec-vacio">
          {t("No hay ninguna decisión. Cuando un agente te pregunte algo con ask_decision, sale aquí y en el móvil.")}
        </p>
      ) : (
        <div className="dec-cuerpo">
          <nav className="dec-lista" aria-label={t("Decisiones")}>
            {espera.length > 0 && <div className="dec-lista-eti">{t("Te esperan")}</div>}
            {espera.map((x) => (
              <Fila key={x.id} d={x} activa={x.id === d?.id} onAbrir={setAbierta} />
            ))}
            {hechas.length > 0 && <div className="dec-lista-eti">{t("Contestadas")}</div>}
            {hechas.map((x) => (
              <Fila key={x.id} d={x} activa={x.id === d?.id} onAbrir={setAbierta} />
            ))}
          </nav>
          <section className="dec-doc">
            {/* Con su id de clave: cada decisión empieza con su borrador y sin
                la cuenta atrás de la anterior. Al contestarla NO cambia, o se
                perdería el «Enviada. Se ha tecleado en el panel…». */}
            {d && <Abierta key={d.id} d={d} />}
          </section>
        </div>
      )}
    </div>
  );
}
