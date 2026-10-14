// Lo que Adeorq le está costando a tu equipo, en una píldora de la barra.
//
// Una ventana con seis terminales dentro no es una aplicación ligera por mucho
// que el instalador ocupe cuatro megas: cada agente es un Node entero. Saber si
// el equipo va lento por Adeorq o por otra cosa obligaba a abrir el
// Administrador de tareas y sumar a mano procesos con el mismo nombre.
//
// Va en la barra y en pequeño a propósito: es un dato de fondo, no el trabajo.
// Se mira de reojo y solo se abre cuando algo va raro (Munir, 2026-07-31: «en
// algún lado que no estorbe»).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../lib/i18n";
import { bonito } from "../lib/ram";
import { latido } from "../lib/latido";

interface Datos {
  ramMb: number;
  ramPct: number;
  sistemaMb: number;
  sistemaPct: number;
  totalMb: number;
  procesos: number;
  agentes: number;
  /** CPU del árbol entero sobre la del EQUIPO, de 0 a 100, como el
      Administrador de tareas. Ver `pulso.rs`: el gasto de Adeorq no está en su
      ventana sino en los procesos del WebView que cuelgan de ella. */
  cpuPct: number;
  nucleos: number;
}

/** Cada cinco segundos. Recorrer la tabla de procesos cuesta poco, pero no es
    gratis, y estos números no cambian de un parpadeo al otro. */
const CADA_MS = 5000;
/** El ancho del detalle, el de `.pulso-detalle` en `13-agenda.css`. */
const ANCHO = 320;

export default function Pulso() {
  const { t, lang } = useT();
  const [d, setD] = useState<Datos | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [sitio, setSitio] = useState({ x: 0, y: 0 });
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const leer = () => void invoke<Datos>("pulso").then(setD).catch(() => {});
    leer();
    // Ver `lib/latido.ts`: con la ventana oculta no se pregunta nada.
    return latido(leer, CADA_MS);
  }, []);

  // Se cierra pinchando fuera o con Escape, como la lista de avisos de Adeo.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !boton.current?.contains(n)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    window.addEventListener("mousedown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("mousedown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);

  const alternar = () => {
    if (abierto) return setAbierto(false);
    // Debajo del botón y con su borde derecho, sin salirse de la ventana.
    const r = boton.current?.getBoundingClientRect();
    if (r) setSitio({ x: Math.max(8, Math.min(r.right, window.innerWidth - 8) - ANCHO), y: r.bottom + 8 });
    setAbierto(true);
  };

  if (!d) return null;

  // Rojo cuando el equipo entero va apretado, ámbar cuando el que aprieta es
  // Adeorq. Distinguirlo es la mitad de la gracia: si el sistema está al 90 %
  // pero Adeorq lleva el 6 %, el problema no es este programa.
  // Rojo si el equipo va apretado O si Adeorq se está comiendo la mitad de la
  // máquina él solo: con la CPU dentro, lo segundo pasa más que lo primero.
  const nivel =
    d.sistemaPct >= 90 || d.cpuPct >= 50 ? "alto" : d.ramPct >= 25 || d.cpuPct >= 25 ? "medio" : "";

  return (
    <div className="pulso-caja">
      <button
        ref={boton}
        className="tab pulso"
        data-nivel={nivel || undefined}
        data-on={abierto || undefined}
        data-tip={abierto ? undefined : t("Lo que Adeorq está gastando en tu equipo")}
        aria-expanded={abierto}
        onClick={() => alternar()}
      >
        {/* La CPU va la PRIMERA: es la que se mueve, la que explica un tirón, y
            la que a Munir le hacía falta mirar. La RAM apenas cambia en horas. */}
        <span className="pulso-dato">
          <b>{d.cpuPct}%</b>
          <span>CPU</span>
        </span>
        <span className="pulso-sep" />
        <span className="pulso-dato">
          <b>{bonito(d.ramMb, lang)}</b>
          <span>RAM</span>
        </span>
        <span className="pulso-sep" />
        <span className="pulso-dato">
          <b>{d.agentes}</b>
          <span>{lang === "en" ? "AG" : "AG"}</span>
        </span>
      </button>

      {abierto &&
        // FUERA de la barra, como la lista de avisos. Dentro no se veía nunca:
        // la barra recorta lo que se sale de ella (`overflow: hidden`) y su
        // cristal hace de caja también para lo fijo. Y encima contaba como
        // contenido suyo, así que al abrirlo la barra creía que no cabía y
        // soltaba piezas (`lib/barraQueCabe.ts`); así vio Munir irse el
        // «Adeorq» de al lado de Adeo el 2026-10-12.
        createPortal(
        <div ref={panel} className="pulso-detalle" role="dialog" aria-label={t("Lo que gasta Adeorq")} style={{ left: sitio.x, top: sitio.y }}>
          <h4>{t("Lo que gasta Adeorq")}</h4>
          <Fila
            etiqueta={t("CPU de Adeorq y sus agentes")}
            valor={`${d.cpuPct}%`}
            pct={d.cpuPct}
            alto={d.cpuPct >= 50}
          />
          <Fila
            etiqueta={t("Memoria de Adeorq y sus agentes")}
            valor={`${bonito(d.ramMb, lang)} · ${d.ramPct}%`}
            pct={d.ramPct}
          />
          <Fila
            etiqueta={t("Memoria de todo el equipo")}
            valor={t("{a} de {b}", { a: bonito(d.sistemaMb, lang), b: bonito(d.totalMb, lang) })}
            pct={d.sistemaPct}
            alto={d.sistemaPct >= 90}
          />
          <p className="pulso-linea">
            {t("{n} procesos en marcha", { n: d.procesos })}
            {", "}
            {d.agentes === 1
              ? t("uno es un agente")
              : t("{n} son agentes", { n: d.agentes })}
            {"."}
          </p>
          <p className="card-hint">
            {t(
              "Cada agente es un programa aparte, así que la cuenta incluye lo que gastan tus terminales y no solo la ventana.",
            )}{" "}
            {t(
              "La CPU es del equipo entero, como en el Administrador de tareas: tu máquina tiene {n} hilos, así que el 100 % son todos a la vez.",
              { n: d.nucleos },
            )}
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Fila({
  etiqueta,
  valor,
  pct,
  alto = false,
}: {
  etiqueta: string;
  valor: string;
  pct: number;
  alto?: boolean;
}) {
  return (
    <div className="pulso-fila">
      <div className="pulso-fila-top">
        <span>{etiqueta}</span>
        <strong>{valor}</strong>
      </div>
      <span className="pulso-barra">
        <span style={{ width: `${Math.min(100, pct)}%` }} data-alto={alto} />
      </span>
    </div>
  );
}
