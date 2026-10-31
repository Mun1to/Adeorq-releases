// La lista de skills de la barra derecha: qué se enseña de cada una y en qué
// orden. Munir eligió entre cuatro formas con sus skills de verdad (2026-10-30,
// «A3 B2»): arriba las que más usa, luego las demás suyas, y al final, aparte,
// las de su cuenta de claude.ai y las de los plugins.
//
//   pnpm bancos skills

import type { Skill } from "./pty";

/** Lo que hace, en su primera frase: hasta el primer «. » o «: ». Lo de detrás
    («Úsalo cuando…») le dice al modelo cuándo abrirla, no a quien la busca en
    la lista qué hace. */
export function fraseCorta(descripcion: string): string {
  const m = descripcion.match(/^(.+?)[.:]\s/);
  return (m ? m[1] : descripcion).replace(/\.$/, "").trim();
}

/** Qué grupo es, y no su título: el título lo pone el componente con `t()`
    escrito a mano, que es lo que el comprobador de idiomas sabe vigilar. */
export type QueGrupo = "usadas" | "demas" | "tuyas" | "fuera";

export interface Grupo {
  que: QueGrupo;
  skills: Skill[];
}

/** Los grupos con lo que pase el buscador; los vacíos no salen. Sin ninguna
    usada, las suyas son «las tuyas» y no «las demás» de nada. */
export function agrupar(skills: Skill[], buscar: string): Grupo[] {
  const q = buscar.trim().toLowerCase();
  const pasan = q
    ? skills.filter((s) =>
        [s.invocation, s.name, s.description].some((x) => x.toLowerCase().includes(q)),
      )
    : skills;
  const tuyas = pasan.filter((s) => s.origen === "tuya");
  // `sort` no mueve los empates, así que a igual número siguen por nombre,
  // que es como llegan de Rust.
  const usadas = tuyas.filter((s) => s.veces > 0).sort((a, b) => b.veces - a.veces);
  const grupos: Grupo[] = [
    { que: "usadas", skills: usadas },
    { que: usadas.length ? "demas" : "tuyas", skills: tuyas.filter((s) => s.veces === 0) },
    { que: "fuera", skills: pasan.filter((s) => s.origen !== "tuya") },
  ];
  return grupos.filter((g) => g.skills.length > 0);
}
