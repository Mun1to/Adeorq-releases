// Las pestañas de la cabecera: su clave, su nombre y si están en beta.
//
// Vivían dos veces: en `App.tsx`, cada una con su icono ya construido, y en
// Ajustes, solo con la clave y el nombre para poder ordenarlas, más un
// comentario pidiendo que cada pestaña nueva se añadiera en los dos sitios.
// Ahora están una sola vez; el icono lo pone `IconoPestana`. El orden de esta
// lista ES el de fábrica (ver `lib/cabecera.ts`).
//
// Desde el 2026-10-17 Cuentas, Agenda, Memoria y Comandos ya no son pestañas:
// viven dentro del Perfil (Munir: «la pestaña perfil la cual se va a fusionar
// con cuentas y va estar la agenda también y la memoria y comandos»). Siguen
// siendo vistas, con su pantalla de siempre, y se llega a ellas igual que antes
// desde Ctrl+K y desde los botones de otras pantallas; lo único que cambia es
// que en la cabecera se enciende el Perfil (`pestanaDe`).

export type View =
  | "panel"
  | "cabina"
  | "chat"
  | "agenda"
  | "decisiones"
  | "lienzo"
  | "memoria"
  | "cuentas"
  | "comandos"
  | "perfil"
  | "ajustes";

export interface Pestana {
  key: View;
  label: string;
  beta?: boolean;
}

/* `beta` marca lo que todavía no está terminado. No es adorno: quien abre una
   sección sin saberlo la juzga como si estuviera acabada, y luego no vuelve. */
export const PESTANAS: Pestana[] = [
  { key: "panel", label: "Panel" },
  { key: "cabina", label: "Cabina" },
  // Justo detrás de la Cabina porque es la misma cosa vista de otra manera:
  // las mismas sesiones, sin la consola delante.
  { key: "chat", label: "Chat", beta: true },
  // Lo que te preguntan los agentes con `ask_decision` (Munir, 2026-10-09,
  // contestando desde el móvil la primera: «una sección Decisiones dentro de
  // la app»). Se quedó en la cabecera cuando la Agenda entró en el Perfil (F1):
  // lleva el aviso de las pendientes y se contesta en el momento.
  { key: "decisiones", label: "Decisiones" },
  { key: "lienzo", label: "Lienzo" },
  // La Guía ya no está aquí: se mira el primer día y casi nunca más, y una
  // pestaña permanente es sitio que le quitaba a lo que se usa a diario. Vive
  // entera en Ajustes › Ayuda, junto al enlace a la documentación de la web.
  { key: "perfil", label: "Perfil" },
  { key: "ajustes", label: "Ajustes" },
];

/** Las pantallas que viven dentro del Perfil, en el orden de sus resúmenes. */
export const DEL_PERFIL: Pestana[] = [
  { key: "cuentas", label: "Cuentas" },
  { key: "agenda", label: "Agenda" },
  { key: "memoria", label: "Memoria" },
  { key: "comandos", label: "Comandos" },
];

/** Todas las vistas a las que se puede ir, que es lo que lista la paleta: las
    de la cabecera, con las del Perfil justo detrás de él. */
export const VISTAS: Pestana[] = PESTANAS.flatMap((p) => (p.key === "perfil" ? [p, ...DEL_PERFIL] : [p]));

/** La pestaña de la cabecera que se enciende estando en `v`. */
export function pestanaDe(v: View): View {
  return DEL_PERFIL.some((p) => p.key === v) ? "perfil" : v;
}
