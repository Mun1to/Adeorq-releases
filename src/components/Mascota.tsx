// La mascota de Adeorq: la A con ojo, brazos y piernas, dibujada a cuadritos.
//
// Munir la pidió el 2026-10-10 («la A de Adeorq, el triángulo es el ojo, las
// patas son las piernas, solo le añades brazos») y de tres dibujos eligió este,
// el de píxeles. Vive en la barra de arriba y es la campana: su postura dice lo
// más urgente de todas tus terminales (`animoDe`, en `lib/campana.ts`).
//
// Se mueve poco a propósito. Parpadea, y solo se mueve de verdad cuando te
// esperan (saluda) o cuando algo termina (dos saltitos y se queda con los
// brazos arriba). Mientras tus agentes trabajan cambia de postura, pero no
// teclea sin parar: algo que se mueve todo el rato en una esquina cansa en dos
// días. Con el modo rendimiento se queda quieta del todo. La animación está en
// `estilos/08-movil-y-avisos.css`.

import type { Animo } from "../lib/campana";

/** Una rejilla de 20 × 12. B cuerpo, W blanco del ojo, P pupila. */
const CUERPO = [
  "......BBBBBBBB......",
  "......BBBWWBBB......",
  ".....BBBBWWBBBB.....",
  ".....BBBWWWWBBB.....",
  ".....BBBWPPWBBB.....",
  "....BBBBWWWWBBBB....",
  "....BBBBBBBBBBBB....",
  "....BBBBBBBBBBBB....",
  "...BBBBB....BBBBB...",
  "...BBBB......BBBB...",
  "...BBBB......BBBB...",
  "..BBBBB......BBBBB..",
];
type Punto = [number, number];
/** El brazo izquierdo en cada postura; el derecho es su espejo. */
const ABAJO: Punto[] = [[3, 6], [2, 7], [2, 8]];
const MEDIO: Punto[] = [[3, 6], [2, 6], [1, 7]];
const ARRIBA: Punto[] = [[3, 5], [2, 4], [2, 3]];
const SALUDA: Punto[] = [[3, 5], [2, 4], [1, 3]];

const AZUL = "#39a9f6";
const BRAZO = "#2389e0";
const BLANCO = "#f1faff";
const PUPILA = "#0e2c47";

type Ojo = "abierto" | "cerrado" | "bajo";
interface Cuadro {
  x: number;
  y: number;
  c: string;
}

function fotograma(izq: Punto[], der: Punto[], ojo: Ojo = "abierto"): Cuadro[] {
  const out: Cuadro[] = [];
  CUERPO.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      let ch = fila[x];
      if (ch === ".") continue;
      // Cerrado: del ojo queda una raya. Bajo: la pupila mira al teclado.
      if (ojo === "cerrado" && ch !== "B") ch = y === 4 && x >= 8 && x <= 11 ? "P" : "B";
      if (ojo === "bajo" && ch !== "B") ch = y === 5 && (x === 9 || x === 10) ? "P" : "W";
      out.push({ x, y: y + 1, c: ch === "B" ? AZUL : ch === "W" ? BLANCO : PUPILA });
    }
  });
  for (const [x, y] of izq) out.push({ x, y: y + 1, c: BRAZO });
  for (const [x, y] of der) out.push({ x: 19 - x, y: y + 1, c: BRAZO });
  return out;
}

/** Los dos fotogramas de cada ánimo. El segundo solo se ve si hay animación. */
const FOTOGRAMAS: Record<Animo, [Cuadro[], Cuadro[]]> = {
  quieta: [fotograma(ABAJO, ABAJO), fotograma(ABAJO, ABAJO, "cerrado")],
  trabaja: [fotograma(ABAJO, MEDIO, "bajo"), []],
  espera: [fotograma(ABAJO, ARRIBA), fotograma(ABAJO, SALUDA)],
  lista: [fotograma(ARRIBA, ARRIBA), []],
  dormida: [fotograma(ABAJO, ABAJO, "cerrado"), []],
};

const pintar = (cuadros: Cuadro[]) =>
  // Un pelo más ancho que la celda, para que no se vea la rejilla entre cuadros.
  cuadros.map((q) => <rect key={`${q.x}-${q.y}-${q.c}`} x={q.x} y={q.y} width={1.02} height={1.02} fill={q.c} />);

/** `alto` en píxeles; el ancho sale de la rejilla (20 × 13). */
export default function Mascota({ animo, alto = 26 }: { animo: Animo; alto?: number }) {
  const [f0, f1] = FOTOGRAMAS[animo];
  return (
    <svg
      className="mascota"
      data-animo={animo}
      viewBox="0 0 20 13.2"
      width={Math.round((alto * 20) / 13.2)}
      height={alto}
      aria-hidden="true"
    >
      <g className="mascota-f0">{pintar(f0)}</g>
      {f1.length > 0 && <g className="mascota-f1">{pintar(f1)}</g>}
    </svg>
  );
}
