// Seguir el claro/oscuro de Windows: un tema para cuando el sistema está en
// oscuro y otro para claro, y que cambie solo (MEJORAS, «Seguir el claro/oscuro
// del sistema»). Elegir un tema a mano lo desactiva: si lo acabas de elegir,
// es que lo quieres, y un cambio del sistema no debería quitártelo.

import { THEME_KEY, THEMES, type ThemeId } from "./i18n";

export interface TemaSistema {
  activo: boolean;
  /** El tema con Windows en oscuro. */
  oscuro: ThemeId;
  /** El tema con Windows en claro. */
  claro: ThemeId;
}

const CLAVE = "adeorq-tema-sistema";
const ids = new Set<string>(THEMES.map((t) => t.id));
const valido = (v: unknown, siNo: ThemeId): ThemeId => (typeof v === "string" && ids.has(v) ? (v as ThemeId) : siNo);

export const POR_DEFECTO: TemaSistema = { activo: false, oscuro: "azul", claro: "papel" };

export function leerTemaSistema(): TemaSistema {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    if (!v || typeof v !== "object") {
      // Una instalación nueva (aún sin tema guardado) sigue a Windows de
      // fábrica, y se guarda en el acto para que el segundo arranque no la
      // tome por vieja. Una de antes se queda con lo que tenía (Munir, F1 del
      // 2026-11-15: «tu Adeorq se queda con lo que ya elegiste»).
      if (localStorage.getItem(THEME_KEY) == null) {
        const nueva = { ...POR_DEFECTO, activo: true };
        guardarTemaSistema(nueva);
        return nueva;
      }
      return POR_DEFECTO;
    }
    return { activo: v.activo === true, oscuro: valido(v.oscuro, "azul"), claro: valido(v.claro, "papel") };
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarTemaSistema(c: TemaSistema): void {
  localStorage.setItem(CLAVE, JSON.stringify(c));
}

export function sistemaEnOscuro(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Qué tema toca ahora con esta configuración. */
export function temaQueToca(c: TemaSistema, oscuro = sistemaEnOscuro()): ThemeId {
  return oscuro ? c.oscuro : c.claro;
}

/** Avisa cada vez que Windows cambia de claro a oscuro o al revés. */
export function escucharSistema(cb: (oscuro: boolean) => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => {};
  const f = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener("change", f);
  return () => mq.removeEventListener("change", f);
}
