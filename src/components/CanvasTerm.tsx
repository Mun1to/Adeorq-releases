import { useContext } from "react";
import { Handle, NodeResizer, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import TerminalPane from "./TerminalPane";
import ResguardoPanel from "./ResguardoPanel";
import { Grip } from "./CanvasWidgets";
import { ColoresLienzo } from "./ColoresLienzo";
import { initials } from "./ProjectAvatar";
import { hueOf } from "../lib/colors";
import type { PaneStatus } from "../lib/pty";
import type { NotifyMode } from "../lib/notify";
import type { Hit } from "../lib/redact";
import type { CanvasPane, SpawnKind } from "./CanvasView";

// La terminal como pieza del lienzo. Vivía en CanvasView.tsx, y era el único
// tipo de pieza que seguía dentro: el carril, la nota, la imagen, los widgets
// y el dibujo tienen cada uno su archivo.

export interface TermData extends Record<string, unknown> {
  pane: CanvasPane;
  /** Qué se abrió aquí y en qué proyecto. Un PTY vivo no cabe en un archivo:
   *  para poder reabrir el tablero hay que guardar la receta, no el proceso. */
  kind: SpawnKind;
  proyecto: string;
  /** El logo del proyecto (el de la barra lateral), para la marca de agua y
   *  la tapa; sin él van las iniciales. */
  logo?: string;
  fontSize: number;
  autoFont: boolean;
  stream: boolean;
  onSecret: (hits: Hit[], severe: boolean) => void;
  notifyMode: NotifyMode;
  focused: boolean;
  onFocus: (id: number) => void;
  onClose: (id: number) => void;
  onRename?: (id: number, nombre: string) => void;
  onSessionId?: (id: number, sessionId: string) => void;
  onNuevaConTraspaso?: (id: number) => void;
  onSplit: (id: number) => void;
  /** A lo grande (lo que se ve del lienzo) o de vuelta a su tamaño. */
  onAmpliar: (id: number) => void;
  grande?: boolean;
  /** Dónde y cómo era antes de ampliarla, para volver. */
  previo?: { x: number; y: number; w: number; h: number };
  onTurnEnd: (id: number) => void;
  /** Su estado hacia arriba: lo consume el kanban y el Capataz. */
  onStatus: (s: PaneStatus) => void;
}

/** A live terminal inside a node. The header doubles as the drag handle. */
export default function TermNode({ data, selected }: NodeProps<Node<TermData>>) {
  const d = data;
  // El color del proyecto EN EL LIENZO (`lib/colorLienzo.ts`): doce tonos bien
  // separados, sin repetir entre los proyectos que hay aquí. El de la casa
  // (`hueOf`) queda de respaldo; va todo en azul y aquí no distinguiría.
  const color = useContext(ColoresLienzo)[d.proyecto] ?? hueOf(d.proyecto);
  // Por debajo del 55 % de zoom una terminal es un rectángulo con hormigas y
  // pintar su texto es trabajo tirado: enseña su tapa (iniciales, nombre,
  // proyecto), que se lee desde lejos, y el cuerpo deja de pintarse. La
  // cabecera sigue a la vista porque es el asa para moverla.
  const lejos = useStore((s) => s.transform[2] < 0.55);
  return (
    // `nodrag` estaba aquí, en la raíz del nodo, y hacía imposible arrastrar la
    // terminal por su cabecera. React Flow exige LAS DOS cosas a la vez:
    //   (!noDragClassName || !hasSelector(target, '.nodrag')) &&
    //   (!handleSelector  ||  hasSelector(target, handleSelector))
    // y como `.pane-head` vive dentro de este div, la primera siempre daba
    // falso. Parecía intermitente porque el borde del nodo sí queda fuera.
    // Con `dragHandle: ".pane-head"` puesto, `nodrag` sobra: la segunda
    // condición ya impide que un arrastre empiece dentro del terminal.
    // `nowheel` se queda: eso es la rueda, y ahí sí hay que scrollear el
    // terminal en vez del lienzo.
    <div
      className="rf-term nowheel"
      data-selected={selected}
      data-lejos={lejos}
      // La franja de arriba, la cabecera teñida, el chip y la marca de agua
      // salen de aquí.
      style={{ ["--c" as string]: color }}
    >
      {/* Se estira por bordes y esquinas SIN tener que seleccionarla antes, y
          el tirador de abajo a la derecha sale al pasar el ratón, como en los
          widgets: estaba solo al seleccionar y nadie lo encontraba (Munir,
          2026-10-07: «no se puede ampliar fácilmente la terminal»). */}
      <NodeResizer minWidth={360} minHeight={220} isVisible />
      <Grip minWidth={360} minHeight={220} />
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <ResguardoPanel id={d.pane.id}>
      <TerminalPane
        id={d.pane.id}
        cwd={d.pane.cwd}
        name={d.pane.name}
        command={d.pane.command}
        env={d.pane.env}
        account={d.pane.account}
        hidden={false}
        focused={d.focused}
        maximized={!!d.grande}
        fontSize={d.fontSize}
        autoFont={d.autoFont}
        stream={d.stream}
        onSecret={d.onSecret}
        notifyMode={d.notifyMode}
        onClose={d.onClose}
        onRename={d.onRename}
        onSessionId={d.onSessionId}
        onNuevaConTraspaso={d.onNuevaConTraspaso}
        onFocusPane={d.onFocus}
        onSplit={(id) => d.onSplit(id)}
        onToggleMax={(id) => d.onAmpliar(id)}
        onTurnEnd={d.onTurnEnd}
        onStatus={d.onStatus}
        shadow={d.pane.shadow}
      />
      </ResguardoPanel>
      {d.logo ? (
        <img className="rf-marca rf-marca-logo" src={d.logo} alt="" draggable={false} aria-hidden="true" />
      ) : (
        <span className="rf-marca" aria-hidden="true">
          {initials(d.proyecto)}
        </span>
      )}
      <div className="rf-tapa" aria-hidden="true">
        {d.logo ? (
          <img className="rf-tapa-logo" src={d.logo} alt="" draggable={false} />
        ) : (
          <span className="rf-tapa-ini">{initials(d.proyecto)}</span>
        )}
        <b>{d.pane.name}</b>
        <span>{d.proyecto}</span>
      </div>
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  );
}
