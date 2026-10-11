// Lo que se pinta mientras algo tarda. La regla y sus tiempos, en `lib/espera.ts`.
//
// Tres piezas, porque son tres sitios distintos donde se espera:
//
//   Espera   donde todavía no hay nada que enseñar (una lista que se lee por
//            primera vez): no pinta nada hasta el segundo, y entonces la rueda
//            con su texto.
//   Ocupado  el rótulo de un botón que has pulsado: sigue diciendo lo suyo si
//            aquello acaba en un suspiro, y si no, pasa a «Guardando…».
//   y para lo que ya está en pantalla y se está releyendo, no hace falta
//   pieza: `data-espera={useEspera(releyendo) || undefined}` en su caja la
//   deja apagada (la regla está en `01-base.css`).

import type { ReactNode } from "react";
import { useEspera } from "../lib/espera";

export default function Espera({
  activo,
  className,
  como: Como = "p",
  children,
}: {
  activo: boolean;
  className?: string;
  /** La etiqueta con la que se pinta: la que hubiera en ese sitio. */
  como?: "p" | "span" | "li" | "div";
  /** Qué se está esperando: «Leyendo tus sesiones…». */
  children: ReactNode;
}) {
  if (useEspera(activo) !== "rueda") return null;
  return (
    <Como className={className ? `espera ${className}` : "espera"} role="status">
      <span className="espera-rueda" aria-hidden="true" />
      {children}
    </Como>
  );
}

/** El rótulo de un botón: `children` de normal, `mientras` si lo que hace tarda. */
export function Ocupado({ activo, mientras, children }: { activo: boolean; mientras: ReactNode; children: ReactNode }) {
  return <>{useEspera(activo) ? mientras : children}</>;
}
