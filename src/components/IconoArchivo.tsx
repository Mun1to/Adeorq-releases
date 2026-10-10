// El icono de un archivo en el árbol, según su familia (`lib/tipoArchivo.ts`).
//
// Dibujados aquí, con la misma receta que `Icons.tsx` (trazo de 1.9, puntas
// redondas, sin relleno) y sin ninguna librería de iconos de archivo: son ocho
// formas, y cada una dice una cosa.

import type { TipoArchivo } from "../lib/tipoArchivo";

/** El papel con la esquina doblada: la base de «texto» y de «otro». */
const HOJA = "M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM13.5 3.5V8H18";

const TRAZOS: Record<TipoArchivo, string[]> = {
  // </> con su barra: lo que se abre en un navegador.
  web: ["M8 8.5 4.5 12 8 15.5", "M16 8.5l3.5 3.5-3.5 3.5", "M13.6 6.5l-3.2 11"],
  // <> a secas: cualquier otro lenguaje.
  codigo: ["M9 7.5 4.5 12 9 16.5", "M15 7.5l4.5 4.5-4.5 4.5"],
  // La almohadilla de un selector.
  estilo: ["M9.5 4.5 7.5 19.5", "M16.5 4.5l-2 15", "M5.5 9.5h14", "M4.5 14.5h14"],
  // Las llaves de un JSON.
  datos: [
    "M9 4.5c-1.9 0-2.7.9-2.7 2.7v1.9c0 1.5-.7 2.5-2 2.9 1.3.4 2 1.4 2 2.9v1.9c0 1.8.8 2.7 2.7 2.7",
    "M15 4.5c1.9 0 2.7.9 2.7 2.7v1.9c0 1.5.7 2.5 2 2.9-1.3.4-2 1.4-2 2.9v1.9c0 1.8-.8 2.7-2.7 2.7",
  ],
  // Un papel escrito.
  texto: [HOJA, "M9 12.5h6", "M9 16h4"],
  // Un marco con su sol y su monte.
  imagen: ["M5.5 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M5 17l4.5-4.5 3.5 3.5 2.5-2.5L20 17.5"],
  // El símbolo del sistema.
  consola: ["M5 8l4 4-4 4", "M12 16.5h7"],
  otro: [HOJA],
};

export default function IconoArchivo({ tipo, size = 13 }: { tipo: TipoArchivo; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[tipo].map((d) => (
        <path key={d} d={d} />
      ))}
      {tipo === "imagen" && <circle cx="9" cy="9.8" r="1.3" />}
    </svg>
  );
}
