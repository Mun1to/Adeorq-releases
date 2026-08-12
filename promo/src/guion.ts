/**
 * EL GUION. Es el único archivo que hay que tocar para cambiar el vídeo.
 *
 * Cada escena es una pantalla de la app con una frase encima. El montaje, las
 * transiciones y los tiempos los calcula `Promo.tsx` a partir de esta lista,
 * así que añadir, quitar o reordenar escenas es editar aquí y nada más. La
 * duración total sale sola de la suma.
 *
 * ⚠ LAS IMÁGENES DE AHORA SON PROVISIONALES. Son las capturas que ya estaban
 * en la web, y enseñan los proyectos reales de Munir, sus horarios y trozos de
 * conversación (auditado el 2026-08-11). Sirven para ver la pieza moverse, NO
 * para publicar. Al llegar las nuevas se sustituyen los archivos de
 * `public/pantallas/` con el mismo nombre y no hay que tocar ni una línea.
 */

export type Escena = {
  /** El archivo dentro de `public/pantallas/`. */
  imagen: string;
  /** La frase grande. Corta: se lee en dos segundos o no se lee. */
  titulo: string;
  /** La línea de apoyo, en gris. Puede faltar. */
  pie?: string;
  /** Segundos que dura en pantalla. */
  dura: number;
  /** Si la ventana se acerca o se aleja mientras está en pantalla. El
      movimiento es LENTO y siempre en la misma dirección dentro de una escena:
      un vaivén se nota como un tic. Se alternan para que dos escenas seguidas
      no se muevan igual. */
  hacia?: "acerca" | "aleja";
};

export const TITULO = "Adeorq";
export const LEMA = "El taller donde trabajan tus agentes";
export const CIERRE = "Descárgalo gratis";
export const WEB = "mun1to.github.io/Adeorq-releases";

export const ESCENAS: Escena[] = [
  {
    imagen: "dashboard.png",
    titulo: "Todo lo que está pasando, de un vistazo",
    pie: "Quién trabaja ahora, quién te espera y dónde se fue la semana",
    dura: 5.5,
    hacia: "acerca",
  },
  {
    imagen: "cockpit.png",
    titulo: "Terminales de verdad, no una imitación",
    pie: "Claude Code, Codex y Antigravity a la vez, cada uno en su panel",
    dura: 6.5,
    hacia: "aleja",
  },
  {
    imagen: "canvas.png",
    titulo: "Un tablero infinito para pensar",
    pie: "Terminales, notas, imágenes y relojes donde tú los pongas",
    dura: 5.5,
    hacia: "acerca",
  },
  {
    imagen: "accounts.png",
    titulo: "Tus cuentas, tus cuotas, tu control",
    pie: "Funciona con TU cuenta: Adeorq no revende acceso a nadie",
    dura: 5,
    hacia: "aleja",
  },
  {
    imagen: "commands.png",
    titulo: "Todo lo que puedes escribir, buscable",
    pie: "Por lo que quieres hacer, no por cómo se llama el comando",
    dura: 5,
    hacia: "acerca",
  },
];
