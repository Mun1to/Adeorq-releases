import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import { noteRead, noteWrite } from "../lib/pty";
import { conCuerpo, conTitulo, cuerpoDe, leerLineas, tituloDe, voltear } from "../lib/notas";
import { Grip } from "./CanvasWidgets";
import {
  CloseIcon,
} from "./Icons";

// Una nota del lienzo: lo que apuntas al vuelo, con casillas si hace falta.
//
// Por dentro NO es un trozo del tablero, es un `.md` en disco
// (%LOCALAPPDATA%\Adeorq\notas). La razón es la que pidió Munir: que un agente
// conectado a la nota pueda MARCAR una casilla al terminar una tarea. Un
// agente sabe editar un archivo de texto y no sabe nada de nuestro formato de
// lienzo, así que el archivo es el terreno común. De regalo, la nota se guarda
// sola, sobrevive al tablero y se puede abrir fuera de Adeorq.
//
// Lo que el archivo NO guarda es dónde está la nota ni de qué color es: eso es
// del tablero, no de la nota.

export interface NoteData extends Record<string, unknown> {
  /** El id del archivo, distinto del id del nodo: el nodo se puede quitar y
      volver a poner, y la nota sigue siendo la misma. */
  noteId: string;
  color: string;
  nodeId: string;
  onClose: (nodeId: string) => void;
  onColor: (nodeId: string, color: string) => void;
}

/** Los colores de los post-it. Se guardan en el tablero, no en el archivo. */
export const NOTE_COLORS = ["#f2c14e", "#7ec9a8", "#7fb6f0", "#c9a5f0", "#f09a9a"];

const GUARDA_MS = 600;
const MIRA_MS = 2500;

export default function NoteNode({ data }: NodeProps<Node<NoteData>>) {
  const { t } = useT();
  const [texto, setTexto] = useState("");
  const [ruta, setRuta] = useState("");
  const [editando, setEditando] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [renombrando, setRenombrando] = useState(false);
  const sello = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);

  // Al abrir se lee lo que haya en disco. Si el archivo no existe todavía
  // (nota recién creada) vuelve vacío, que es exactamente lo que queremos.
  useEffect(() => {
    let vivo = true;
    void noteRead(data.noteId).then((f) => {
      if (!vivo) return;
      setTexto(f.text);
      setRuta(f.path);
      sello.current = f.stamp;
    });
    return () => {
      vivo = false;
    };
  }, [data.noteId]);

  // Y se vuelve a mirar cada pocos segundos, que es como se entera la nota de
  // que un agente le ha marcado una casilla. Mientras escribes no se toca: lo
  // último que quiere uno es que le reescriban el texto bajo el cursor.
  useEffect(() => {
    if (editando) return;
    const id = window.setInterval(() => {
      void noteRead(data.noteId).then((f) => {
        if (f.stamp > sello.current) {
          sello.current = f.stamp;
          setTexto(f.text);
        }
      });
    }, MIRA_MS);
    return () => window.clearInterval(id);
  }, [data.noteId, editando]);

  /** Guarda con retardo: escribir no puede ser un viaje a disco por tecla. */
  const guardar = useCallback(
    (nuevo: string) => {
      setTexto(nuevo);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void noteWrite(data.noteId, nuevo).then((f) => {
          sello.current = f.stamp;
          setRuta(f.path);
        });
      }, GUARDA_MS);
    },
    [data.noteId],
  );

  // Y al desmontar se guarda ya, sin esperar al retardo: cerrar la pestaña del
  // lienzo con lo último sin escribir sería perderlo.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const lineas = leerLineas(cuerpoDe(texto));
  const titulo = tituloDe(texto);
  const tareas = lineas.filter((l) => l.hecha !== null);
  const hechas = tareas.filter((l) => l.hecha).length;

  /** Dónde empezó el último clic sobre el cuerpo, para distinguirlo de un
      arrastre que solo quería mover la nota. */
  const desdeRaton = useRef<[number, number]>([0, 0]);

  /** Una casilla nueva al final, con el cursor puesto para escribirla. */
  const nuevaTarea = () => {
    const cuerpo = cuerpoDe(texto);
    const conSalto = cuerpo && !cuerpo.endsWith("\n") ? `${cuerpo}\n` : cuerpo;
    guardar(conCuerpo(texto, `${conSalto}- [ ] `));
    setEditando(true);
    // El foco llega en el frame siguiente, cuando el textarea ya existe.
    window.setTimeout(() => {
      const el = area.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  return (
    <div
      className="wdg note"
      style={{ ["--note" as string]: data.color }}
      onPointerDownCapture={nodragEnControles}
    >
      <NodeResizer isVisible minWidth={200} minHeight={160} />
      <Grip minWidth={200} minHeight={160} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <header className="wdg-head note-head">
        {/* El nombre NO es un cuadro de escribir siempre abierto.
            Lo era, y como la cabecera es lo único de lo que se puede arrastrar
            la nota, ir a moverla te ponía a teclear en el título. Ahora es
            texto normal, la cabecera entera arrastra, y se renombra con doble
            clic, que es como se renombra todo lo demás. */}
        {renombrando ? (
          <input
            className="note-title nodrag"
            autoFocus
            value={titulo}
            placeholder={t("Nota")}
            onChange={(e) => guardar(conTitulo(texto, e.currentTarget.value))}
            onBlur={() => setRenombrando(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              e.stopPropagation();
            }}
          />
        ) : (
          <span
            className="note-title-txt"
            data-vacio={!titulo}
            onDoubleClick={() => setRenombrando(true)}
            data-tip={t("Doble clic para ponerle nombre")}
          >
            {titulo || t("Nota")}
          </span>
        )}
        {tareas.length > 0 && (
          <span className="note-count" data-full={hechas === tareas.length}>
            {hechas}/{tareas.length}
          </span>
        )}
        <button
          className="wdg-x note-tint"
          onClick={() => setPaleta((v) => !v)}
          data-tip={t("Color")}
        >
          <span className="note-dot" />
        </button>
        <button className="wdg-x" onClick={() => data.onClose(data.nodeId)} data-tip={t("Quitar")}>
          <CloseIcon size={13} />
        </button>
      </header>

      {paleta && (
        <div className="note-colors nodrag">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              style={{ background: c }}
              data-on={c === data.color}
              onClick={() => {
                data.onColor(data.nodeId, c);
                setPaleta(false);
              }}
            />
          ))}
          {/* Y el que no está en la fila: cinco colores están bien hasta que
              quieres el tuyo. */}
          <label className="note-pick" data-tip={t("Cualquier otro color")}>
            <span style={{ background: data.color }} />
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(data.color) ? data.color : NOTE_COLORS[0]}
              onChange={(e) => data.onColor(data.nodeId, e.currentTarget.value)}
            />
          </label>
        </div>
      )}

      {/* Se ve la nota escrita, y se edita al tocarla. Es lo que hace la app de
          notas del móvil: las casillas se pulsan, el texto se escribe. Un
          textarea permanente no dejaría marcar nada. */}
      {editando ? (
        <textarea
          ref={area}
          className="note-body nodrag nowheel"
          autoFocus
          value={cuerpoDe(texto)}
          placeholder={t("Escribe. Para una tarea, empieza la línea con - [ ]")}
          onChange={(e) => guardar(conCuerpo(texto, e.currentTarget.value))}
          onBlur={() => setEditando(false)}
          // Sin esto, Supr borraría el trazo seleccionado del lienzo y Ctrl+Z
          // desharía el dibujo mientras escribes dentro de la nota.
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
            e.stopPropagation();
          }}
        />
      ) : (
        <div
          className="note-body nowheel"
          // Un clic abre el cuadro de escribir; un arrastre, no.
          //
          // Desde que la nota se mueve agarrándola por donde sea, soltarla
          // contaba también como clic y acababas escribiendo sin querer cada
          // vez que la colocabas. Cuatro píxeles es el temblor de un clic.
          onPointerDown={(e) => {
            desdeRaton.current = [e.clientX, e.clientY];
          }}
          onClick={(e) => {
            const [x, y] = desdeRaton.current;
            if (Math.hypot(e.clientX - x, e.clientY - y) < 4) setEditando(true);
          }}
        >
          {lineas.map((l) =>
            l.hecha === null ? (
              <p key={l.n} className="note-line">
                {l.texto || " "}
              </p>
            ) : (
              // Ni `label` ni un `stopPropagation` a toda la fila.
              //
              // Era las dos cosas y por eso una tarea no se podía reescribir:
              // dentro de un `label` cualquier clic marca la casilla, así que
              // ir a corregir una palabra la daba por hecha; y el
              // `stopPropagation` de la fila entera impedía que el clic
              // llegara al cuerpo, que es lo que abre el cuadro de escribir.
              // Ahora la casilla marca, y el texto de al lado se edita.
              <div key={l.n} className="note-task" data-done={l.hecha}>
                <input
                  type="checkbox"
                  checked={l.hecha}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => guardar(conCuerpo(texto, voltear(cuerpoDe(texto), l.n)))}
                />
                <span className="note-task-txt">{l.texto || " "}</span>
              </div>
            ),
          )}
          {!texto && <p className="note-empty">{t("Toca para escribir")}</p>}
        </div>
      )}

      <footer className="note-foot">
        <button className="note-add nodrag" onClick={nuevaTarea}>
          + {t("tarea")}
        </button>
        <span className="note-where" data-tip={ruta}>
          {t("se guarda sola")}
        </span>
      </footer>
    </div>
  );
}
