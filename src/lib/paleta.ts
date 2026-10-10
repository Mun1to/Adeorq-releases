// La paleta de comandos (Ctrl+K): una sola caja para ir a cualquier pestaña,
// proyecto o terminal y para lanzar lo que ya tiene atajo.
//
// Existe por una promesa que la app no cumplía. La web la enseñaba funcionando
// («todo lo que hace la app, a un Ctrl+K») y `lib/cabecera.ts` decía que una
// pestaña quitada de la cabecera «se sigue abriendo con su atajo», pero ni la
// paleta ni ese atajo existían: quien apagaba una pestaña la perdía hasta
// volver a Ajustes (2026-10-10). No añade nada a la pantalla: solo aparece
// cuando la llamas.
//
// Aquí vive lo que se puede probar sin ventana: qué entradas hay y cuáles
// quedan al escribir (`scripts/paleta-check.ts`). El componente es `Paleta.tsx`.

import type { Translate } from "./i18n";
import type { Pestana, View } from "./vistas";

/** Lo que hace una entrada al elegirla. */
export type Accion =
  | { tipo: "vista"; view: View }
  | { tipo: "proyecto"; name: string; cwd: string }
  | { tipo: "terminal"; id: number; enLienzo: boolean }
  /** Pulsa por ti un atajo que la app ya tiene: una sola implementación. */
  | { tipo: "atajo"; key: string };

export interface Entrada {
  /** Estable entre repintados, para la `key` de React. */
  id: string;
  /** Qué es: una terminal, una pestaña, un proyecto. Se enseña a la derecha
      de la fila y también se busca por él («pestaña mem»). */
  grupo: string;
  texto: string;
  /** El atajo que hace lo mismo, si lo tiene. */
  atajo?: string;
  accion: Accion;
}

/**
 * Lo que ya se hace con Ctrl+Mayús+tecla (`lib/atajosGlobales.ts`). La paleta
 * no lo repite: dispara esa misma tecla, y así el atajo y la entrada no pueden
 * acabar haciendo cosas distintas. `key` es la de `KeyboardEvent.key`.
 */
export const ATAJOS: Array<{ texto: string; key: string; atajo: string }> = [
  { texto: "Abrir una terminal", key: "T", atajo: "Ctrl+Mayús+T" },
  { texto: "Dividir el panel a la derecha", key: "ArrowRight", atajo: "Ctrl+Mayús+→" },
  { texto: "Dividir el panel hacia abajo", key: "ArrowDown", atajo: "Ctrl+Mayús+↓" },
  { texto: "Maximizar o restaurar el panel", key: "F", atajo: "Ctrl+Mayús+F" },
  { texto: "Llamar al Asistente", key: "A", atajo: "Ctrl+Mayús+A" },
  { texto: "Dictarle al Asistente", key: "M", atajo: "Ctrl+Mayús+M" },
  { texto: "Modo emisión: tapar rutas, claves y datos", key: "E", atajo: "Ctrl+Mayús+E" },
  { texto: "Tapar la pantalla entera", key: "P", atajo: "Ctrl+Mayús+P" },
];

export interface LoQueHay {
  /** TODAS las pestañas, también las quitadas de la cabecera: esa es la gracia. */
  pestanas: Pestana[];
  proyectos: Array<{ name: string; path: string }>;
  panes: Array<{ id: number; name: string }>;
  delLienzo: Array<{ id: number; name: string }>;
}

/** Todas las entradas, en el orden en que se enseñan sin haber escrito nada. */
export function entradasDeLaPaleta(hay: LoQueHay, t: Translate): Entrada[] {
  const terminal = (enLienzo: boolean) => (p: { id: number; name: string }): Entrada => ({
    id: `terminal:${p.id}`,
    grupo: t("Terminal abierta"),
    texto: p.name,
    accion: { tipo: "terminal", id: p.id, enLienzo },
  });
  return [
    ...hay.panes.map(terminal(false)),
    ...hay.delLienzo.map(terminal(true)),
    ...hay.pestanas.map((p): Entrada => ({
      id: `vista:${p.key}`,
      grupo: t("Pestaña"),
      texto: t(p.label),
      accion: { tipo: "vista", view: p.key },
    })),
    ...ATAJOS.map((a): Entrada => ({
      id: `atajo:${a.key}`,
      grupo: t("Acción"),
      texto: t(a.texto),
      atajo: a.atajo.replace("Mayús", t("Mayús")),
      accion: { tipo: "atajo", key: a.key },
    })),
    ...hay.proyectos.map((p): Entrada => ({
      id: `proyecto:${p.path}`,
      grupo: t("Nueva sesión de Claude"),
      texto: p.name,
      accion: { tipo: "proyecto", name: p.name, cwd: p.path },
    })),
  ];
}

/** Sin tildes y en minúsculas: «memoria» encuentra «Memoria» y «camara», «cámara». */
const llano = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Las que quedan al escribir. Cada palabra tiene que estar, en cualquier orden,
 * en el texto o en lo que es («pesta mem» da la pestaña Memoria). Las que
 * EMPIEZAN por lo escrito van delante: tecleando «ca» se quiere la Cabina
 * antes que «Tapar la pantalla entera».
 */
export function filtrarPaleta(entradas: Entrada[], q: string): Entrada[] {
  const palabras = llano(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return entradas;
  const primera = palabras[0];
  return entradas
    .filter((e) => {
      const donde = llano(`${e.grupo} ${e.texto}`);
      return palabras.every((p) => donde.includes(p));
    })
    .map((e, i) => ({ e, i, delante: llano(e.texto).startsWith(primera) ? 0 : 1 }))
    .sort((a, b) => a.delante - b.delante || a.i - b.i)
    .map((x) => x.e);
}
