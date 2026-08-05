// El recorrido por las funciones, al terminar la bienvenida.
//
// Señala los botones REALES de la ventana, no una captura: un foco recorta el
// elemento y el globo se coloca a su lado. Se busca cada parada por un
// selector, y la que no aparezca se salta sola en vez de dejar el foco vacío
// en una esquina, que es lo que rompe estos recorridos cuando la interfaz
// cambia de sitio. La barra lateral, por ejemplo, no existe en la vista de
// Ajustes.
//
// Lo que Munir quería que la gente descubriera sí o sí es la Agenda y los
// objetivos del día: casi nadie abre una pestaña que no sabe para qué es.

import { useEffect, useLayoutEffect, useState } from "react";
import { useT } from "../lib/i18n";

interface Parada {
  /** Dónde está en la ventana. La primera que exista, gana. */
  donde: string[];
  titulo: string;
  texto: string;
}

const PARADAS: Parada[] = [
  {
    donde: [".sidebar"],
    titulo: "Tus proyectos, a la izquierda",
    texto:
      "Cada carpeta con sus sesiones dentro, y al final las que no son de ningún proyecto, con su carpeta escrita. Arrastra una a un proyecto para meterla ahí, o pulsa ⊞ para que su carpeta sea un proyecto más. El punto verde es una sesión viva ahora mismo.",
  },
  {
    donde: ['[data-tab="cabina"]'],
    titulo: "La Cabina: las terminales",
    texto:
      "Aquí trabajan los agentes, en terminales de verdad repartidas por la pantalla. Puedes abrir varias y verlas a la vez, que es la gracia de todo esto.",
  },
  {
    donde: [".foreman-call"],
    titulo: "El Asistente",
    texto:
      "Le sueltas una frase de lo que quieres y te escribe el encargo entero, elige con qué cliente y qué modelo sale más a cuenta, y te lo deja escrito en la terminal. También sabe repartir el trabajo entre varios agentes.",
  },
  {
    donde: ['[data-tab="agenda"]'],
    titulo: "La Agenda",
    texto:
      "Lo que tienes pendiente y las ideas que van saliendo mientras trabajas. Los agentes pueden dejarte propuestas aquí: tú las aceptas o las descartas.",
  },
  {
    donde: [".objetivos-toggle"],
    titulo: "Los objetivos del día",
    texto:
      "Tres cosas que quieres terminar hoy, siempre a la vista. Un agente puede tachar el suyo al acabar, así que la lista se mueve sola mientras trabajas.",
  },
  {
    donde: ['[data-tab="lienzo"]'],
    titulo: "El Lienzo",
    texto:
      "Una pizarra donde caben terminales, notas, imágenes y ventanas de tu web en localhost. Para pensar un proyecto entero sin cambiar de ventana.",
  },
  {
    donde: ['[data-tab="cuentas"]'],
    titulo: "Tus cuentas",
    texto:
      "Los clientes que tienes instalados y cuánta semana te queda en cada uno. Adeorq usa TU cuenta: no da acceso a ningún modelo ni guarda ninguna clave.",
  },
  {
    donde: ['[data-tab="ajustes"]'],
    titulo: "Ajustes, y la guía entera",
    texto:
      "El aspecto, los atajos, las notificaciones y la carpeta de proyectos. Y dentro, en Ayuda, la guía completa de todo lo que hay: esto de aquí era solo el paseo rápido.",
  },
];

/** El hueco que se recorta alrededor del elemento, en píxeles. */
const AIRE = 6;

export default function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  /** Las paradas que de verdad están en pantalla, decididas UNA vez al abrir.
      Recalcularlas en cada render tenía dos problemas: si el recorrido se abre
      en el mismo pintado que la ventana, todavía no hay nada que buscar y se
      quedaba mudo para siempre; y si algo aparecía o desaparecía a mitad, la
      lista cambiaba de tamaño debajo del número que se está enseñando. */
  const [paradas, setParadas] = useState<Parada[]>([]);

  useEffect(() => {
    const mirar = () =>
      setParadas(PARADAS.filter((p) => p.donde.some((s) => document.querySelector(s))));
    mirar();
    // Y un segundo intento por si se abrió antes de que la ventana pintara.
    const t = window.setTimeout(mirar, 120);
    return () => window.clearTimeout(t);
  }, []);

  const parada = paradas[i];

  useLayoutEffect(() => {
    if (!parada) return;
    const el = parada.donde.map((s) => document.querySelector(s)).find(Boolean);
    if (!el) return;
    const medir = () => setCaja(el.getBoundingClientRect());
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [parada]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setI((n) => (n + 1 < paradas.length ? n + 1 : n));
      }
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onClose, paradas.length]);

  // Todavía midiendo, o ninguna parada visible: mejor nada que un foco sobre el
  // vacío. Si la lista se queda corta porque el usuario cerró algo, la última
  // parada válida cierra el recorrido con su botón.
  if (!parada) return null;

  // El globo va debajo del elemento, salvo que no quepa: entonces encima.
  const alto = caja?.height ?? 0;
  const arriba = caja ? caja.top + alto + 14 : 0;
  const cabeAbajo = arriba + 190 < window.innerHeight;
  const estilo: React.CSSProperties = caja
    ? {
        top: cabeAbajo ? arriba : Math.max(12, caja.top - 200),
        left: Math.min(Math.max(12, caja.left), Math.max(12, window.innerWidth - 372)),
      }
    : { top: "40%", left: "50%", transform: "translateX(-50%)" };

  return (
    <div className="tour" onClick={() => setI((n) => (n + 1 < paradas.length ? n + 1 : n))}>
      {caja && (
        <div
          className="tour-foco"
          style={{
            top: caja.top - AIRE,
            left: caja.left - AIRE,
            width: caja.width + AIRE * 2,
            height: caja.height + AIRE * 2,
          }}
        />
      )}
      <div className="tour-globo" style={estilo} onClick={(e) => e.stopPropagation()}>
        <span className="tour-cuenta">
          {i + 1} / {paradas.length}
        </span>
        <h3>{t(parada.titulo)}</h3>
        <p>{t(parada.texto)}</p>
        <div className="tour-pie">
          <button className="mini" onClick={onClose}>
            {t("Cerrar")}
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button className="mini" onClick={() => setI(i - 1)}>
                {t("Atrás")}
              </button>
            )}
            {i + 1 < paradas.length ? (
              <button className="np-btn" onClick={() => setI(i + 1)}>
                {t("Siguiente")}
              </button>
            ) : (
              <button className="np-btn" onClick={onClose}>
                {t("Ya está")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
