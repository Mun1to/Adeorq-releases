// Cuánto pesa el contexto de una sesión, y qué se le dice al agente para
// compactarla sin perder el hilo. Vivía en TerminalPane.tsx.

import { useRef } from "react";
import type { Translate } from "./i18n";
import { sendPty } from "./pty";

/**
 * Lo que cuesta una sesión cargada, dicho ANTES de que sea tarde.
 *
 * La cabecera ya pintaba el porcentaje en naranja, y eso no basta: un número
 * no dice que a partir de cierto punto CADA mensaje vuelve a pagar el
 * contexto entero, ni que compactar paga de golpe todo lo acumulado. Munir
 * llegó al 88 % de un millón sin saberlo, le dio a `/compact` tres veces
 * creyendo que arreglaba algo, y esos tres intentos gastaron más cuota que
 * un día completo de trabajo (2026-07-30). El aviso es para que esa decisión
 * se tome con el dato delante, que es lo único que faltaba.
 *
 * 0 = nada que decir · 1 = ya pesa · 2 = compactar sale peor que empezar.
 *
 * Se mide SOLO en porcentaje de la ventana, y eso corrige lo anterior.
 *
 * Antes había una doble vara: saltaba por tokens (150.000 y 400.000) o por
 * porcentaje, lo que ocurriera antes. La idea era que lo que cuesta dinero
 * son los tokens y no la fracción; el efecto real fue el contrario. Opus 5 y
 * Sonnet 5 declaran un MILLÓN de ventana, así que la vara de los tokens
 * disparaba siempre primero: el primer aviso al 15 % y el «compactar sale
 * peor que empezar de cero» al 40 %, con el 60 % de la ventana todavía libre.
 * Dicho de otra forma: cualquier sesión de trabajo de verdad nacía avisada, y
 * el aviso grave mentía (Munir, 2026-08-06: «son muy molestas y aunque el
 * contexto esté por debajo del 50 % siguen apareciendo»).
 *
 * Con una sola vara el aviso vuelve a querer decir algo en cualquier modelo:
 * con Haiku el 60 % son 120.000 tokens y con Opus 600.000, que es justo la
 * diferencia que la doble vara borraba. Y lo que cuesta la sesión sigue
 * estando a la vista sin que nadie avise: la píldora de la cabecera lleva el
 * número puesto todo el rato.
 */
export function nivelDeContexto(percent: number | undefined): 0 | 1 | 2 {
  if (percent == null) return 0;
  return percent >= 80 ? 2 : percent >= 60 ? 1 : 0;
}

/**
 * Compactar con traspaso, en dos pasos (Munir, 2026-10-07: «un botón que si le
 * das automáticamente se compacta con un mensaje de compactación y
 * actualizando los handoffs»). Primero se le pide al agente que deje el
 * traspaso escrito (el BUZON.md y los docs vivos, como un /fin sin commits);
 * cuando acaba ese turno suena la campana, y ahí va el `/compact` con qué
 * conservar. Los dos textos pasan por `t()` para que un agente de una app en
 * inglés los reciba en inglés.
 */
export function traspasoAntesDeCompactar(t: Translate): string {
  return t(
    "Antes de compactar, deja al día el traspaso: el BUZON.md del proyecto y sus docs vivos, con lo hecho (rutas exactas), lo pendiente y las trampas de hoy. Sin commits. Cuando acabes, te compacto yo.",
  );
}

/**
 * Recuperar (decisión E2): al 80 % compactar sale peor que empezar, así que la
 * salida buena es una terminal NUEVA que arranque con el traspaso ya escrito.
 * Mismo baile que compactar: el agente deja el traspaso, suena su campana, y
 * la nueva nace con el encargo de seguir desde ahí.
 */
export function traspasoAntesDeNueva(t: Translate): string {
  return t(
    "Esta sesión ya pesa demasiado: deja al día el traspaso, el BUZON.md del proyecto y sus docs vivos, con lo hecho (rutas exactas), lo pendiente y las trampas de hoy. Sin commits. Cuando acabes, abro una terminal nueva que sigue desde ahí.",
  );
}

export function encargoDeRecuperar(t: Translate): string {
  return t(
    "Retomas el trabajo de la sesión anterior, que se quedó sin contexto: lee el BUZON.md del proyecto y sus docs vivos, y sigue desde lo pendiente.",
  );
}

export function ordenDeCompactar(t: Translate): string {
  return t(
    "Conserva el estado real del repo, lo hecho con sus rutas exactas, lo pendiente y las trampas de hoy; lo demás, resumido.",
  );
}

/**
 * Los dos bailes en dos pasos de un panel (compactar y recuperar), con lo que
 * hay que recordar entre el clic y la campana. Se llama una vez por panel;
 * `alSonarCampana` va en la campana del terminal, por ref. Lo pendiente caduca
 * a los veinte minutos: no se compacta a destiempo encima de otro trabajo.
 */
export function useTraspaso(m: {
  id: number;
  t: Translate;
  /** El nivel del aviso que se está enseñando, para apagarlo al pulsar. */
  avisoCtx: number;
  setCtxVisto: (n: number) => void;
  onNueva?: (id: number) => void;
}) {
  const compactarPendiente = useRef<string | null>(null);
  const nuevaPendiente = useRef(false);
  const onNuevaRef = useRef(m.onNueva);
  onNuevaRef.current = m.onNueva;
  const CADUCA_MS = 20 * 60_000;

  const compactar = () => {
    compactarPendiente.current = ordenDeCompactar(m.t);
    void sendPty(m.id, traspasoAntesDeCompactar(m.t)).catch(() => {});
    m.setCtxVisto(m.avisoCtx);
    window.setTimeout(() => {
      compactarPendiente.current = null;
    }, CADUCA_MS);
  };

  const nueva = () => {
    nuevaPendiente.current = true;
    void sendPty(m.id, traspasoAntesDeNueva(m.t)).catch(() => {});
    m.setCtxVisto(m.avisoCtx);
    window.setTimeout(() => {
      nuevaPendiente.current = false;
    }, CADUCA_MS);
  };

  /** El traspaso ya está escrito: ahora el `/compact` (texto e Intro aparte,
      ver `mandar_texto`) o la terminal nueva. */
  const alSonarCampana = () => {
    if (compactarPendiente.current) {
      const orden = compactarPendiente.current;
      compactarPendiente.current = null;
      void sendPty(m.id, `/compact ${orden}`).catch(() => {});
    }
    if (nuevaPendiente.current) {
      nuevaPendiente.current = false;
      onNuevaRef.current?.(m.id);
    }
  };

  return { compactar, nueva, alSonarCampana };
}
