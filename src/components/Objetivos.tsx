// Los objetivos del día: lo que quieres dejar hecho hoy, delante y en dos
// líneas.
//
// La Agenda ya sabía lo que se te viene encima (calendario), lo que el proyecto
// tiene vivo (ideas) y lo que toca después (METAS.md). Le faltaba lo más
// pequeño y lo que más se mira: qué tres cosas quieres cerrar HOY. Eso no vive
// en ningún proyecto ni en ninguna brújula, es tuyo y del día.
//
// Se guardan en un markdown por día para que un agente pueda tacharlos (ver
// `goals.rs`). Por eso hay un botón para abrir el archivo: lo que se ve aquí es
// exactamente lo que hay escrito ahí.
//
// Se pinta de dos maneras con el mismo componente: dentro de la Agenda, y como
// panel flotante desde cualquier pestaña (`ObjetivosFlotante`), porque una
// lista del día que solo se ve entrando a una pestaña no acompaña el día.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  aplicarDia,
  goalsAdd,
  goalsRemove,
  goalsToggle,
  hoy,
  useDiaDeHoy,
  type Goal,
} from "../lib/goals";
import { useT } from "../lib/i18n";
import { ChevronIcon, CloseIcon, CornerIcon, OpacityIcon } from "./Icons";

interface Props {
  /** Sin la caja del panel y con la lista con scroll propio: es como se pinta
      dentro del panel flotante, que tiene su propia caja y su propia altura. */
  compacto?: boolean;
}

/** «viernes, 31 de julio», con el idioma de la app. Sin el año: el día de hoy
    no necesita que le recuerden en qué año está. */
function fechaLarga(lang: string): string {
  return new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function Objetivos({ compacto = false }: Props) {
  const { t, lang } = useT();
  const dia = useDiaDeHoy();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const fecha = hoy();

  const añadir = () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setTexto("");
    goalsAdd(fecha, limpio).then(aplicarDia).catch((e) => setError(String(e)));
  };

  const marcar = (g: Goal) =>
    goalsToggle(fecha, g).then(aplicarDia).catch((e) => setError(String(e)));
  const quitar = (g: Goal) =>
    goalsRemove(fecha, g).then(aplicarDia).catch((e) => setError(String(e)));

  const goals = dia?.goals ?? [];
  const hechos = goals.filter((g) => g.done).length;
  const pct = goals.length ? Math.round((hechos / goals.length) * 100) : 0;
  const titulo = fechaLarga(lang);

  return (
    <section className={compacto ? "objetivos objetivos-compacto" : "panel-card objetivos"}>
      {!compacto && (
        <header className="obj-head">
          <div className="obj-title">
            <h2>{t("Objetivos de hoy")}</h2>
            <span className="obj-date">{titulo}</span>
          </div>
          {goals.length > 0 && <Progreso hechos={hechos} total={goals.length} pct={pct} />}
        </header>
      )}

      {/* La barra de avance, que es lo que convierte una lista en una carrera.
          Va debajo del título y a todo el ancho, no dentro del contador: de un
          vistazo se ve cuánto queda sin leer ningún número.
          En el flotante NO se pinta: allí el avance ya está en el anillo de su
          cabecera, y decir lo mismo dos veces en un panel de este tamaño es
          justo lo que lo hacía parecer un formulario. */}
      {!compacto && goals.length > 0 && (
        <div className="obj-barra" data-full={hechos === goals.length}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}

      <ul className="obj-list">
        {goals.map((g) => (
          <li key={`${g.idx}-${g.text}`} className="obj-item" data-done={g.done}>
            {/* La FILA ENTERA marca, no solo la casilla. Una casilla de
                diecinueve píxeles obliga a apuntar, y apuntar para tachar algo
                que ya has hecho sobra (Munir, 2026-07-31: «no me deja hacer
                clic de que he completado esa tarea»). El botón envuelve el
                texto, así que se acierta siempre. */}
            <button
              className="obj-fila"
              role="checkbox"
              aria-checked={g.done}
              onClick={() => marcar(g)}
            >
              <span className="obj-mark" aria-hidden="true">
                {/* El palito dibujado, no el cuadrado del sistema: el de
                    Windows no acepta color ni tamaño y quedaba como una pieza
                    prestada de otra aplicación. */}
                <svg viewBox="0 0 24 24" width="13" height="13">
                  <path
                    d="m4.5 12.6 5 5 10-11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {/* Sin `stream-hide` a propósito: en emisión los objetivos del
                  día se ven. Es lo que estás haciendo, no un dato tuyo. */}
              <span className="obj-text">{g.text}</span>
            </button>
            <button
              className="obj-del"
              data-tip={t("Quitar este objetivo")}
              onClick={() => quitar(g)}
            >
              ×
            </button>
          </li>
        ))}
        {goals.length === 0 && (
          <li className="obj-empty">
            {t("Nada apuntado para hoy. Escribe abajo lo que quieras dejar cerrado.")}
          </li>
        )}
      </ul>

      {/* Escribir aquí es la acción más frecuente del panel, así que deja de
          parecer un formulario: un «+» y una línea, con el mismo hueco a la
          izquierda que las casillas de arriba, para que lo que escribes caiga
          en la columna donde va a aparecer. La caja con borde de antes pesaba
          más que la propia lista. */}
      <div className="obj-add" data-lleno={!!texto.trim()}>
        <span className="obj-add-mas" aria-hidden="true">
          +
        </span>
        <input
          className="obj-add-input"
          placeholder={t("Qué quieres dejar hecho hoy")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") añadir();
          }}
        />
        {/* El botón solo aparece con algo escrito: vacío no hace nada y ocupaba
            un sitio que en el panel flotante no sobra. Enter también vale. */}
        {texto.trim() && (
          <button className="np-btn obj-add-btn" onClick={añadir}>
            {t("Añadir")}
          </button>
        )}
      </div>

      {error && <p className="np-err">{error}</p>}

      {!compacto && dia?.path && (
        <p className="card-hint obj-file">
          {t("Están en un archivo, así que un agente puede tacharlos al terminar.")}{" "}
          <button className="mini" onClick={() => void openPath(dia.path).catch(() => {})}>
            {t("Abrir el archivo")}
          </button>
        </p>
      )}
    </section>
  );
}

/** El anillo de avance. Dice lo mismo que «2/3» y se lee sin leerlo. */
function Progreso({ hechos, total, pct }: { hechos: number; total: number; pct: number }) {
  const R = 13;
  const vuelta = 2 * Math.PI * R;
  return (
    <span className="obj-anillo" data-full={hechos === total}>
      <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">
        <circle cx="16" cy="16" r={R} className="obj-anillo-pista" />
        <circle
          cx="16"
          cy="16"
          r={R}
          className="obj-anillo-avance"
          strokeDasharray={`${(pct / 100) * vuelta} ${vuelta}`}
        />
      </svg>
      <span className="obj-anillo-num">
        {hechos}/{total}
      </span>
    </span>
  );
}

/**
 * Los mismos objetivos, flotando sobre cualquier pestaña.
 *
 * Una lista del día que solo se ve entrando a la Agenda no acompaña el día: se
 * mira una vez por la mañana y se olvida. Aquí queda a un clic desde la Cabina,
 * el Lienzo o donde estés, y recuerda si lo dejaste abierto.
 *
 * Va anclado abajo a la derecha y no en medio: en medio taparía la terminal,
 * que es donde se trabaja, y este panel acompaña al trabajo, no lo sustituye.
 */
export function ObjetivosFlotante({ onCerrar }: { onCerrar: () => void }) {
  const { t, lang } = useT();
  const caja = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const g = localStorage.getItem(SITIO_KEY);
      return g ? (JSON.parse(g) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  /** Plegado: se queda en su barra de título, con el avance a la vista. Para
      cuando quieres tenerlo puesto sin que ocupe, que es la mayor parte del
      día (Munir, 2026-07-31). */
  const [plegado, setPlegado] = useState(() => localStorage.getItem(PLEGADO_KEY) === "1");
  const plegar = (v: boolean) => {
    localStorage.setItem(PLEGADO_KEY, v ? "1" : "0");
    setPlegado(v);
  };

  /** Cuánto tapa el panel lo que hay detrás. Es suyo y del sitio donde lo tenga
      puesto: encima de una terminal conviene traslúcido para seguir leyendo lo
      que pasa debajo, y en una esquina vacía, opaco para leerlo mejor. */
  const [opacidad, setOpacidad] = useState(() => {
    const g = Number(localStorage.getItem(OPACIDAD_KEY));
    return Number.isFinite(g) && g >= MIN_OPACIDAD && g <= 100 ? g : 100;
  });
  const [ajustando, setAjustando] = useState(false);
  const cambiarOpacidad = (v: number) => {
    localStorage.setItem(OPACIDAD_KEY, String(v));
    setOpacidad(v);
  };

  /**
   * Que el panel quepa entero en la pantalla.
   *
   * Plegado mide una barra de título y desplegado mide diez veces eso, así que
   * un panel dejado abajo del todo crecía HACIA ABAJO y se metía debajo de la
   * barra de tareas: se veía la cabecera y nada más (Munir, 2026-08-02). Al
   * arrastrar ya se comprobaba; lo que faltaba es comprobarlo también cuando lo
   * que cambia de tamaño es el panel y no el ratón.
   */
  useLayoutEffect(() => {
    const encajar = () => {
      const el = caja.current;
      if (!el) return;
      setPos((p) => {
        // Sin posición propia está anclado a su esquina por CSS y siempre cabe.
        if (!p) return p;
        const { width, height } = el.getBoundingClientRect();
        const x = Math.max(6, Math.min(p.x, window.innerWidth - width - 6));
        const y = Math.max(6, Math.min(p.y, window.innerHeight - height - 6));
        if (x === p.x && y === p.y) return p;
        localStorage.setItem(SITIO_KEY, JSON.stringify({ x, y }));
        return { x, y };
      });
    };
    encajar();
    window.addEventListener("resize", encajar);
    // Y cada vez que el panel cambia de alto por dentro, no solo al plegarlo:
    // la lista llega del disco un instante después de desplegar, y añadir un
    // objetivo lo hace crecer una línea más.
    const ojo = new ResizeObserver(encajar);
    if (caja.current) ojo.observe(caja.current);
    return () => {
      window.removeEventListener("resize", encajar);
      ojo.disconnect();
    };
  }, []);

  // Escape cierra, como cualquier otra cosa que se abra encima en esta app.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  // Arrastrar por la cabecera. En `window` y no en el propio panel: si el ratón
  // corre más que el repintado y se sale de la caja, el panel se quedaría
  // clavado a medio camino con el botón aún pulsado.
  useEffect(() => {
    const alMover = (e: MouseEvent) => {
      const a = arrastre.current;
      const el = caja.current;
      if (!a || !el) return;
      const { width, height } = el.getBoundingClientRect();
      // Dentro de la ventana siempre: un panel arrastrado fuera de la pantalla
      // no se puede recuperar, porque el sitio se guarda.
      const x = Math.max(6, Math.min(e.clientX - a.dx, window.innerWidth - width - 6));
      const y = Math.max(6, Math.min(e.clientY - a.dy, window.innerHeight - height - 6));
      setPos({ x, y });
    };
    const alSoltar = () => {
      if (!arrastre.current) return;
      arrastre.current = null;
      document.body.classList.remove("arrastrando");
      setPos((p) => {
        if (p) localStorage.setItem(SITIO_KEY, JSON.stringify(p));
        return p;
      });
    };
    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
    return () => {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
    };
  }, []);

  const empezar = (e: React.MouseEvent) => {
    const el = caja.current;
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    arrastre.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    // Al primer arrastre deja de estar anclado abajo a la derecha y pasa a
    // coordenadas, que es lo que permite moverlo.
    setPos({ x: r.left, y: r.top });
    document.body.classList.add("arrastrando");
    e.preventDefault();
  };

  return (
    <div
      className="obj-flota"
      data-plegado={plegado}
      ref={caja}
      style={{
        ["--obj-alpha" as string]: `${opacidad}%`,
        ...(pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : null),
      }}
    >
      <header className="obj-flota-head" onMouseDown={empezar}>
        {/* Título y fecha apilados, como en la Agenda. La fecha faltaba aquí y
            es la que dice de qué día son estos objetivos: sin ella, un panel
            abierto desde ayer parece el de hoy. */}
        <div className="obj-flota-titulo">
          <h3>{t("Objetivos de hoy")}</h3>
          {!plegado && <span className="obj-date">{fechaLarga(lang)}</span>}
        </div>
        {/* El avance, siempre: anillo cuando está abierto, píldora cuando está
            recogido. Antes solo existía plegado, así que el panel abierto no
            decía cuánto llevabas sin contar las casillas a ojo. */}
        <Avance plegado={plegado} />
        <div className="obj-flota-btns">
          <button
            className="obj-flota-x"
            data-on={ajustando}
            data-tip={t("Cuánto tapa lo que hay detrás")}
            onClick={() => setAjustando((v) => !v)}
          >
            <OpacityIcon size={16} />
          </button>
          {pos && (
            <button
              className="obj-flota-x"
              data-tip={t("Devolverlo a su esquina")}
              onClick={() => {
                localStorage.removeItem(SITIO_KEY);
                setPos(null);
              }}
            >
              <CornerIcon size={16} />
            </button>
          )}
          <button
            className="obj-flota-x"
            data-tip={plegado ? t("Desplegar") : t("Plegar")}
            onClick={() => plegar(!plegado)}
          >
            <ChevronIcon size={16} up={plegado} />
          </button>
          <button className="obj-flota-x" data-tip={t("Cerrar")} onClick={onCerrar}>
            <CloseIcon size={16} />
          </button>
        </div>
      </header>
      {/* El deslizador aparece solo cuando lo pides, y también estando plegado:
          la transparencia se elige mirando lo que hay detrás, y detrás está la
          terminal, no esta lista. Se cambia con el ratón y con las flechas, sin
          escribir un número: nadie sabe qué aspecto tiene un 62 %. */}
      {ajustando && (
        <div className="obj-alpha" onMouseDown={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={MIN_OPACIDAD}
            max={100}
            step={5}
            value={opacidad}
            aria-label={t("Cuánto tapa lo que hay detrás")}
            onChange={(e) => cambiarOpacidad(Number(e.currentTarget.value))}
          />
          <span>{opacidad}%</span>
        </div>
      )}
      {!plegado && <Objetivos compacto />}
    </div>
  );
}

/**
 * Cuántos llevas, en la barra de título del panel flotante.
 *
 * Lee del mismo sitio que la lista de debajo (`useDiaDeHoy`), así que marcar
 * algo lo mueve al instante: cuando cada uno leía el archivo por su cuenta, el
 * número podía pasarse veinte segundos contradiciendo a la lista que tenía
 * justo debajo.
 */
function Avance({ plegado }: { plegado: boolean }) {
  const dia = useDiaDeHoy();
  const goals = dia?.goals ?? [];
  if (goals.length === 0) return null;
  const hechos = goals.filter((g) => g.done).length;
  const pct = Math.round((hechos / goals.length) * 100);
  if (plegado) {
    return (
      <span className="obj-plegado-num" data-full={hechos === goals.length}>
        {hechos}/{goals.length}
      </span>
    );
  }
  return <Progreso hechos={hechos} total={goals.length} pct={pct} />;
}

/** Si lo dejaste plegado, sigue plegado. */
const PLEGADO_KEY = "adeorq-objetivos-plegado";

/** Dónde lo dejaste puesto. Si nunca lo has movido, va a su esquina. */
const SITIO_KEY = "adeorq-objetivos-sitio";

/** Cuánto tapa, de 0 a 100. */
const OPACIDAD_KEY = "adeorq-objetivos-opacidad";

/** Por debajo de esto el texto propio del panel deja de leerse sobre una
    terminal, así que el deslizador no baja más: un panel que no se lee no es
    un panel transparente, es un panel roto. */
const MIN_OPACIDAD = 25;
