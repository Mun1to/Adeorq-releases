// Las pestañas de la cabecera: su clave, su nombre y si están en beta.
//
// Vivían dos veces: en `App.tsx`, cada una con su icono ya construido, y en
// Ajustes, solo con la clave y el nombre para poder ordenarlas, más un
// comentario pidiendo que cada pestaña nueva se añadiera en los dos sitios.
// Ahora están una sola vez; el icono lo pone `IconoPestana`. El orden de esta
// lista ES el de fábrica (ver `lib/cabecera.ts`).

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
  { key: "agenda", label: "Agenda" },
  // Al lado de la Agenda, que es lo otro que te espera a ti: lo que te
  // preguntan los agentes con `ask_decision` (Munir, 2026-10-09, contestando
  // desde el móvil la primera: «una sección Decisiones dentro de la app»).
  { key: "decisiones", label: "Decisiones" },
  { key: "lienzo", label: "Lienzo" },
  { key: "memoria", label: "Memoria" },
  { key: "cuentas", label: "Cuentas" },
  // La Guía ya no está aquí: se mira el primer día y casi nunca más, y una
  // pestaña permanente es sitio que le quitaba a lo que se usa a diario. Vive
  // entera en Ajustes › Ayuda, junto al enlace a la documentación de la web.
  { key: "comandos", label: "Comandos" },
  { key: "ajustes", label: "Ajustes" },
];
