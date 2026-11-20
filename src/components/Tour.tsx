// El recorrido por las funciones, al terminar la bienvenida, y el de lo nuevo
// de cada versión (`Recorridos.tsx`), que es esta misma pieza con otras paradas.
//
// Señala los botones REALES de la ventana, no una captura: un foco recorta el
// elemento y el globo se coloca a su lado. Se busca cada parada por un
// selector, y la que no aparezca se salta sola en vez de dejar el foco vacío
// en una esquina, que es lo que rompe estos recorridos cuando la interfaz
// cambia de sitio. La barra lateral, por ejemplo, no existe en la vista de
// Ajustes.
//
// Una parada puede vivir en otra pestaña o en un grupo de Ajustes: entonces el
// recorrido te lleva allí antes de buscarla, y además del elemento enciende la
// pestaña de la cabecera y el grupo, para que se vea dónde estás («cuando pasa
// a otro apartado no se alumbra en el header el apartado», Munir, 14-nov).
//
// Lo que Munir quería que la gente descubriera sí o sí es la Agenda y los
// objetivos del día: casi nadie abre una pestaña que no sabe para qué es.

import { useEffect, useLayoutEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { pestanaDe, type View } from "../lib/vistas";
import Mascota from "./Mascota";

export interface Parada {
  /** Dónde está en la ventana. La primera que exista, gana. */
  donde: string[];
  titulo: string;
  texto: string;
  /** La pestaña de la cabecera donde vive: se va a ella antes de buscarla. */
  vista?: string;
  /** El grupo de Ajustes donde vive. */
  ajustes?: string;
  /** Un bloque de Ajustes por su título (el `h2` de su tarjeta), en español:
      se busca traducido, como lo pinta la tarjeta. */
  bloque?: string;
  /** De qué versión es, en el recorrido de lo nuevo. */
  version?: string;
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
    titulo: "Adeo",
    texto:
      "Le sueltas una frase de lo que quieres y te escribe el encargo entero, elige con qué cliente y qué modelo sale más a cuenta, y te lo deja escrito en la terminal. También sabe repartir el trabajo entre varios agentes.",
  },
  // La Agenda y Cuentas eran dos paradas, cada una en su pestaña. Desde el
  // 2026-10-17 viven dentro del Perfil y son una: dos globos seguidos sobre el
  // mismo botón se leen como el recorrido atascado.
  {
    donde: ['[data-tab="perfil"]'],
    titulo: "Tu Perfil: la Agenda y tus cuentas",
    texto:
      "Lo que tienes pendiente y las propuestas que te dejan los agentes viven en la Agenda; al lado, tus cuentas con cuánta semana te queda, tu memoria y tus comandos. Adeorq usa TU cuenta: no da acceso a ningún modelo ni guarda ninguna clave.",
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
    donde: ['[data-tab="ajustes"]'],
    titulo: "Ajustes, y la guía entera",
    texto:
      "El aspecto, los atajos, las notificaciones y la carpeta de proyectos. Y dentro, en Ayuda, la guía completa de todo lo que hay: esto de aquí era solo el paseo rápido.",
  },
];

/** El hueco que se recorta alrededor del elemento, en píxeles. */
const AIRE = 6;
/** El ancho del globo, con su margen a la pantalla (`.tour-globo`). */
const ANCHO_GLOBO = 360;
/** Lo que puede tardar en aparecer una parada al cambiar de pestaña. */
const ESPERA_MS = 1500;

const viaja = (p: Parada) => Boolean(p.vista || p.ajustes);

/** El elemento de una parada, si está pintado. */
function buscar(p: Parada, nombreBloque: string): Element | null {
  if (p.bloque) {
    const cajas = document.querySelectorAll(".set-hoja section.panel-card");
    return [...cajas].find((c) => c.querySelector(":scope > h2")?.textContent?.trim() === nombreBloque) ?? null;
  }
  for (const s of p.donde) {
    // Un selector mal escrito en `novedades.json` lanza, y desde un efecto eso
    // tiraba la ventana entera: se trata como «no está».
    try {
      const el = document.querySelector(s);
      if (el) return el;
    } catch {
      /* selector inválido: la parada se salta como cualquier otra que no aparece */
    }
  }
  return null;
}

/** Si una tecla es del control que tiene el foco y no del recorrido: con lo
    encendido tocable, ← → movían el volumen Y la parada. Cada control se queda
    solo las suyas: un campo de texto, todas; un deslizador, las flechas; un
    botón, el Intro (que ya lo pulsa). Lo demás, como Escape tras pulsar ▶, sigue
    siendo del recorrido. Fuera del globo solo cuenta si lo encendido se toca
    (`probar`); dentro, un Intro sobre «Siguiente» pasaba dos paradas. */
function esDelControl(e: KeyboardEvent, probar: boolean): boolean {
  const el = e.target instanceof Element ? e.target : null;
  if (!el || (!probar && !el.closest(".tour-globo"))) return false;
  const c = el.closest("input, textarea, select, button, a[href], [contenteditable], [role=slider]");
  if (!c) return false;
  const tipo = c instanceof HTMLInputElement ? c.type : "";
  if (tipo === "range" || tipo === "radio" || c.getAttribute("role") === "slider") return e.key.startsWith("Arrow");
  if (c.tagName === "BUTTON" || c.tagName === "A" || ["checkbox", "button", "submit", "reset", "color", "file"].includes(tipo)) {
    return e.key === "Enter";
  }
  return true;
}

interface Hueco {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Lo que se ve de un elemento, con su aire, recortado a la ventana. */
function huecoDe(el: Element): Hueco {
  const r = el.getBoundingClientRect();
  const top = Math.max(4, r.top - AIRE);
  const left = Math.max(4, r.left - AIRE);
  const bottom = Math.min(window.innerHeight - 4, r.bottom + AIRE);
  const right = Math.min(window.innerWidth - 4, r.right + AIRE);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** La posición de un agujero como estilo, y no como atributos del dibujo: así
    el foco viaja de una parada a la siguiente en vez de saltar (`.tour-velo`). */
const geometria = (h: Hueco): React.CSSProperties =>
  ({ x: h.left, y: h.top, width: h.width, height: h.height }) as React.CSSProperties;

/** Dónde va el globo: debajo, encima, a la derecha o a la izquierda del hueco,
    lo primero que quepa; si no cabe en ningún lado, abajo a la derecha. */
function sitioDelGlobo(h: Hueco, alto: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margen = 14;
  const izq = Math.min(Math.max(12, h.left), Math.max(12, vw - ANCHO_GLOBO - 12));
  if (h.top + h.height + margen + alto < vh) return { top: h.top + h.height + margen, left: izq };
  if (h.top - margen - alto > 0) return { top: h.top - margen - alto, left: izq };
  const arriba = Math.min(Math.max(12, h.top), Math.max(12, vh - alto - 12));
  if (h.left + h.width + margen + ANCHO_GLOBO < vw) return { top: arriba, left: h.left + h.width + margen };
  if (h.left - margen - ANCHO_GLOBO > 0) return { top: arriba, left: h.left - margen - ANCHO_GLOBO };
  return { top: Math.max(12, vh - alto - 16), left: Math.max(12, vw - ANCHO_GLOBO - 16) };
}

export default function Tour({
  onClose,
  paradas: todas = PARADAS,
  ir,
  traducir = true,
  probar = false,
}: {
  onClose: () => void;
  paradas?: Parada[];
  /** Lleva la ventana a la pestaña o al grupo de Ajustes de una parada. */
  ir?: (p: Parada) => void;
  /** Los textos ya vienen en el idioma de la app (las novedades, que además
      llevan a Adeo en el globo: es él quien te enseña lo nuevo). */
  traducir?: boolean;
  /** Lo encendido se puede tocar: el recorrido de lo nuevo deja probarlo. */
  probar?: boolean;
}) {
  const { t } = useT();
  const tx = (s: string) => (traducir ? t(s) : s);
  const [i, setI] = useState(0);
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  const [altoGlobo, setAltoGlobo] = useState(190);
  /** Las paradas del recorrido. Las que no viajan se deciden UNA vez al abrir,
      mirando si están pintadas: recalcularlas en cada render tenía dos
      problemas. Si el recorrido se abre en el mismo pintado que la ventana,
      todavía no hay nada que buscar y se quedaba mudo para siempre; y si algo
      aparecía o desaparecía a mitad, la lista cambiaba de tamaño debajo del
      número que se está enseñando. Las que viajan se buscan al llegar, y la
      que no aparece se quita entonces. */
  const [paradas, setParadas] = useState<Parada[] | null>(null);

  useEffect(() => {
    // Una lista vacía cierra el recorrido: en el primer intento solo se apunta
    // si encontró algo, o se cerraría antes del segundo.
    const mirar = (ultimo: boolean) => {
      const ps = todas.filter((p) => viaja(p) || buscar(p, t(p.bloque ?? "")));
      if (ps.length || ultimo) setParadas(ps);
    };
    mirar(false);
    // Y un segundo intento por si se abrió antes de que la ventana pintara.
    const reloj = window.setTimeout(() => mirar(true), 120);
    return () => window.clearTimeout(reloj);
    // Solo al abrir: ver el comentario de `paradas`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parada = paradas?.[i];

  useLayoutEffect(() => {
    if (!parada) return;
    // La que viaja borra el foco de antes, que ya apunta a otra pestaña; la que
    // no, lo deja para que se deslice hasta la nueva.
    if (viaja(parada)) {
      setHuecos([]);
      ir?.(parada);
    }
    let el: Element | null = null;
    let vivo = true;
    const desde = performance.now();
    const medir = () => {
      if (!el || !vivo) return;
      const encendidos = [huecoDe(el)];
      // Dónde estás: la pestaña de la cabecera y el grupo de Ajustes.
      const pestana = parada.vista ? document.querySelector(`[data-tab="${pestanaDe(parada.vista as View)}"]`) : null;
      if (pestana) encendidos.push(huecoDe(pestana));
      const grupo = parada.ajustes ? document.querySelector(".set-tab[data-on]") : null;
      if (grupo) encendidos.push(huecoDe(grupo));
      setHuecos(encendidos);
    };
    let reloj = 0;
    const intentar = () => {
      if (!vivo) return;
      el = buscar(parada, t(parada.bloque ?? ""));
      if (el) {
        // Lo que está más abajo de la hoja se trae a la vista antes de medir.
        el.scrollIntoView({ block: "nearest" });
        requestAnimationFrame(medir);
        return;
      }
      if (performance.now() - desde < (viaja(parada) ? ESPERA_MS : 0)) {
        reloj = window.setTimeout(intentar, 80);
        return;
      }
      // No está: se quita, y el número de la cuenta pasa a la siguiente.
      setParadas((ps) => (ps ? ps.filter((p) => p !== parada) : ps));
    };
    intentar();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
    // `ir` y `tx` cambian de identidad en cada render de quien los da; la
    // parada es lo único que dice que hay que volver a buscar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parada]);

  const cuantas = paradas?.length ?? 0;

  // Todas las que viajaban fallaron: no queda nada que enseñar.
  useEffect(() => {
    if (paradas && cuantas === 0) onClose();
    else if (paradas && i >= cuantas) setI(cuantas - 1);
  }, [paradas, cuantas, i, onClose]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (esDelControl(e, probar)) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setI((n) => (n + 1 < cuantas ? n + 1 : n));
      }
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onClose, cuantas, probar]);

  // Todavía midiendo, o ninguna parada visible: mejor nada que un foco sobre el
  // vacío. Si la lista se queda corta porque el usuario cerró algo, la última
  // parada válida cierra el recorrido con su botón.
  if (!parada) return null;

  const principal = huecos[0];
  const estilo: React.CSSProperties = principal
    ? sitioDelGlobo(principal, altoGlobo)
    : { top: "40%", left: "50%", transform: "translateX(-50%)" };
  const siguiente = () => setI((n) => (n + 1 < cuantas ? n + 1 : n));
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div className="tour" data-probar={probar || undefined} onClick={probar ? undefined : siguiente}>
      {/* El velo, con un agujero por cada cosa encendida. Es un dibujo y no se
          toca: los clics los recogen el propio `.tour` o, si se deja probar,
          las cuatro piezas de alrededor del agujero principal. */}
      <svg className="tour-velo" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tour-agujeros">
            <rect width={vw} height={vh} fill="#fff" />
            {huecos.map((h, n) => (
              <rect key={n} style={geometria(h)} rx={6} fill="#000" />
            ))}
          </mask>
        </defs>
        <rect className="tour-sombra" width={vw} height={vh} mask="url(#tour-agujeros)" />
        {huecos.map((h, n) => (
          <rect key={n} className="tour-borde" data-principal={n === 0 || undefined} style={geometria(h)} rx={6} />
        ))}
      </svg>
      {/* Buscando todavía lo que hay que encender: nada se toca por debajo. */}
      {probar && !principal && <div className="tour-tapa" style={{ inset: 0 }} />}
      {probar && principal && (
        <>
          <div className="tour-tapa" onClick={siguiente} style={{ top: 0, left: 0, right: 0, height: principal.top }} />
          <div className="tour-tapa" onClick={siguiente} style={{ top: principal.top + principal.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-tapa" onClick={siguiente} style={{ top: principal.top, left: 0, width: principal.left, height: principal.height }} />
          <div
            className="tour-tapa"
            onClick={siguiente}
            style={{ top: principal.top, left: principal.left + principal.width, right: 0, height: principal.height }}
          />
        </>
      )}
      <div
        className="tour-globo"
        style={estilo}
        ref={(n) => {
          if (n && Math.abs(n.offsetHeight - altoGlobo) > 2) setAltoGlobo(n.offsetHeight);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="tour-cuenta">
          {!traducir && <Mascota animo="lista" alto={22} />}
          <span>
            {parada.version ? `${t("Lo nuevo de la {v}", { v: parada.version })} · ` : ""}
            {i + 1} / {cuantas}
          </span>
        </span>
        <h3>{tx(parada.titulo)}</h3>
        <p>{tx(parada.texto)}</p>
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
            {i + 1 < cuantas ? (
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
