// El robot de la cabecera de una terminal, y la lista que enseña.
//
// Hasta el 2026-10-10 era un número con un globo de texto: «3 agentes
// trabajando». Munir pidió «un mayor control de los agentes», y lo primero que
// hace falta para controlar algo es verlo: al pasar el ratón (o al pulsarlo,
// que la deja fija) sale quién es cada agente, qué se le mandó, si sigue fuera
// y cuánto lleva. Sale del historial de la sesión, que es el dato exacto.
//
// Una terminal sin historial que leer (una consola, un CLI que no escribe en
// `~/.claude`) solo tiene el número estimado por la pantalla: ahí se queda el
// globo de texto de siempre, sin lista, que una lista inventada sería peor.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { estadoDeAgente, recuento, sitioDeLaLista, tiempoDe, type EstadoDeAgente } from "../lib/agentes";
import { useT, type Translate } from "../lib/i18n";
import { sessionAgents, type AgenteDeSesion } from "../lib/pty";
import { RobotIcon } from "./Icons";

/** Lo que tarda en salir al posar el ratón, y en irse al quitarlo: lo justo
    para cruzar del robot a la lista sin que se cierre por el camino. */
const SALE_MS = 160;
const SE_VA_MS = 220;
/** Con la lista abierta, cada cuánto se vuelve a leer el historial. */
const REFRESCO_MS = 3000;
const ANCHO = 360;

/** Cómo se dice cada estado. Escritas una a una, y no por tabla, para que el
    comprobador de traducciones las vea. */
function palabra(t: Translate, e: EstadoDeAgente): string {
  if (e === "fuera") return t("trabajando");
  if (e === "fondo") return t("en segundo plano");
  return e === "fallo" ? t("falló") : t("terminó");
}

function resumen(t: Translate, lista: AgenteDeSesion[]): string {
  const n = recuento(lista);
  const partes = [
    n.fuera ? t("{n} fuera", { n: n.fuera }) : "",
    n.fondo ? t("{n} en segundo plano", { n: n.fondo }) : "",
    n.volvio ? t("{n} de vuelta", { n: n.volvio }) : "",
    n.fallo ? t("{n} con fallo", { n: n.fallo }) : "",
  ].filter(Boolean);
  return partes.join(" · ");
}

export default function AgentesDePanel({
  live,
  total,
  exact,
  cwd,
  sessionId,
}: {
  live: number;
  total: number;
  /** Contados en el historial (dato exacto) o estimados por la pantalla. */
  exact: boolean;
  cwd: string;
  sessionId?: string;
}) {
  const { t } = useT();
  const [abierta, setAbierta] = useState(false);
  /** Pulsada: se queda aunque el ratón se vaya, hasta pulsar fuera o Esc. */
  const [fija, setFija] = useState(false);
  const [lista, setLista] = useState<AgenteDeSesion[] | null>(null);
  const [sitio, setSitio] = useState({ x: 8, y: 8 });
  const [ahora, setAhora] = useState(() => Date.now());
  const robot = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reloj = useRef(0);

  const colocar = () => {
    const r = robot.current?.getBoundingClientRect();
    if (!r) return;
    const alto = panel.current?.offsetHeight ?? 180;
    setSitio(sitioDeLaLista(r, { ancho: ANCHO, alto }, { ancho: window.innerWidth, alto: window.innerHeight }));
  };
  const abrir = () => {
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => {
      colocar();
      setAbierta(true);
    }, SALE_MS);
  };
  const cerrar = () => {
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAbierta(false), SE_VA_MS);
  };
  const seQueda = () => window.clearTimeout(reloj.current);

  // Con la lista a la vista se lee el historial, y se vuelve a leer mientras
  // siga abierta: un agente que vuelve cambia de fila sin tener que cerrarla.
  useEffect(() => {
    if (!abierta && !fija) return;
    let viva = true;
    const leer = () =>
      sessionAgents(cwd, sessionId)
        .then((l) => {
          if (!viva) return;
          setLista(l);
          setAhora(Date.now());
        })
        .catch(() => viva && setLista([]));
    void leer();
    const cada = window.setInterval(() => void leer(), REFRESCO_MS);
    return () => {
      viva = false;
      window.clearInterval(cada);
    };
  }, [abierta, fija, cwd, sessionId]);

  // La lista cambia de alto al llegar los datos: se recoloca, por si ya no
  // cabe debajo.
  useEffect(() => {
    if (abierta || fija) colocar();
    // `colocar` lee refs y no cambia de un pintado a otro en nada que importe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, abierta, fija]);

  useEffect(() => {
    if (!fija) return;
    const fuera = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !robot.current?.contains(n)) {
        setFija(false);
        setAbierta(false);
      }
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setFija(false);
      setAbierta(false);
    };
    window.addEventListener("mousedown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("mousedown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [fija]);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  if (!(live > 0 || (exact && total > 0))) return null;

  // Sin historial no hay lista que enseñar: el globo de texto, y nada más.
  if (!exact) {
    return (
      <span
        className="pane-agents"
        data-live={live > 0}
        data-tip={`${live === 1 ? t("1 agente trabajando ahora dentro de esta sesión") : t("{n} agentes trabajando ahora dentro de esta sesión", { n: live })}\n${t("Estimado por lo que se lee en pantalla.")}`}
      >
        <RobotIcon size={13} /> {live}
      </span>
    );
  }

  const visible = abierta || fija;
  return (
    <>
      <button
        ref={robot}
        className="pane-agents"
        data-live={live > 0}
        data-on={visible || undefined}
        aria-expanded={visible}
        aria-label={t("Agentes de esta sesión")}
        onMouseEnter={() => abrir()}
        onMouseLeave={() => (fija ? undefined : cerrar())}
        onClick={() => {
          colocar();
          setFija((v) => !v);
        }}
      >
        <RobotIcon size={13} /> {live > 0 ? live : total}
      </button>
      {visible &&
        // Fuera de la cabecera: recorta lo que se sale de ella, y en el lienzo
        // el panel va además escalado por el zoom.
        createPortal(
          <div
            ref={panel}
            className="agentes"
            role="dialog"
            aria-label={t("Agentes de esta sesión")}
            style={{ left: sitio.x, top: sitio.y, width: ANCHO }}
            onMouseEnter={() => seQueda()}
            onMouseLeave={() => (fija ? undefined : cerrar())}
          >
            <header className="agentes-cab">
              <b>{t("Agentes de esta sesión")}</b>
              <span>{lista ? resumen(t, lista) : t("leyendo…")}</span>
            </header>
            {lista && lista.length === 0 ? (
              <p className="agentes-vacio">{t("Su historial reciente no trae ninguno.")}</p>
            ) : (
              <ul className="agentes-lista">
                {(lista ?? []).map((a, i) => {
                  const estado = estadoDeAgente(a);
                  const tiempo = tiempoDe(a, ahora);
                  return (
                    <li key={`${a.desde}-${i}`} className="agente" data-estado={estado}>
                      <i className="agente-punto" />
                      <span className="agente-cuerpo">
                        <span className="agente-que">{a.que || t("sin descripción")}</span>
                        <span className="agente-tipo">{a.tipo}</span>
                      </span>
                      <span className="agente-estado">
                        {palabra(t, estado)}
                        {tiempo && <em>{tiempo}</em>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <footer className="agentes-pie">
              {total > (lista?.length ?? 0)
                ? t("{n} desplegados en total; aquí, los que siguen fuera y los últimos.", { n: total })
                : t("Contados en el historial de la sesión: es el dato exacto.")}
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
