import { useContext, useState } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { ColoresLienzo, colorDeProyecto } from "./ColoresLienzo";
import { CloseIcon } from "./Icons";

// Un carril del lienzo: una franja de color que separa un espacio de trabajo
// de los de al lado (Munir, 2026-10-06: «líneas como carriles de trabajo que
// separan espacios»). Va DEBAJO de las terminales y no se interpone: la franja
// deja pasar el ratón, solo su rótulo se coge, se arrastra y se renombra.
//
// Si se llama como un proyecto, las terminales nuevas de ese proyecto nacen
// dentro, en fila, y el carril se pinta con el color de ese proyecto en el
// lienzo (`lib/colorLienzo.ts`): así un lienzo con tres proyectos se lee de un
// vistazo, sin leer cabeceras.

export interface CarrilData extends Record<string, unknown> {
  nombre: string;
  color: string;
  nodeId: string;
  onClose: (nodeId: string) => void;
  onRename: (nodeId: string, nombre: string) => void;
}

export const CARRIL_W = 2400;
export const CARRIL_H = 520;

/** Los colores de un carril sin proyecto, por orden de creación. */
const COLORES = ["#4d9fff", "#7ec9a8", "#f2c14e", "#c9a5f0", "#f09a9a"];

/** El color con el que nace un carril: el siguiente de la paleta. Si luego se
 *  llama como un proyecto, manda el de ese proyecto (se decide al pintar, con
 *  `ColoresLienzo`, que es el mismo sitio del que lo leen sus terminales). */
export function colorDeCarril(n: number): string {
  return COLORES[n % COLORES.length];
}

export default function CarrilNode({ data, selected }: NodeProps<Node<CarrilData>>) {
  const { t } = useT();
  const [renombrando, setRenombrando] = useState(false);
  const [borrador, setBorrador] = useState(data.nombre);
  const color = colorDeProyecto(useContext(ColoresLienzo), data.nombre) ?? data.color;

  const confirmar = () => {
    const nuevo = borrador.trim();
    if (nuevo && nuevo !== data.nombre) data.onRename(data.nodeId, nuevo);
    setRenombrando(false);
  };

  return (
    <div className="carril" data-selected={selected} style={{ ["--carril" as string]: color }}>
      <NodeResizer isVisible={!!selected} minWidth={400} minHeight={200} />
      {/* El rótulo es el asa (`dragHandle`) y lo único del carril que recibe
          el ratón: el resto de la franja deja pasar los clics al lienzo. */}
      <div className="carril-rotulo">
        {renombrando ? (
          <input
            className="carril-nombre nodrag"
            value={borrador}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setBorrador(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar();
              else if (e.key === "Escape") setRenombrando(false);
            }}
            onBlur={confirmar}
          />
        ) : (
          <span
            className="carril-nombre-txt"
            data-tip={t("Doble clic para renombrar; con el nombre de un proyecto, sus terminales nacen aquí")}
            onDoubleClick={() => {
              setBorrador(data.nombre);
              setRenombrando(true);
            }}
          >
            {data.nombre}
          </span>
        )}
        <button
          className="carril-cerrar nodrag"
          data-tip={t("Quitar el carril (las terminales se quedan)")}
          onClick={() => data.onClose(data.nodeId)}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  );
}
