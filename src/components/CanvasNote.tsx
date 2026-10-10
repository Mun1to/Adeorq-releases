import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { latido } from "../lib/latido";
import { nodragEnControles } from "../lib/arrastre";
import { noteRead, noteWrite } from "../lib/pty";
import { useCabina } from "../lib/cabina";
import { pasteInto } from "../lib/flechas";
import { PINTA } from "../lib/estados";
import { useEncargosDelLienzo } from "../lib/encargosDelLienzo";
import { leerArchivo, listarCarpeta } from "../lib/archivos";
import { carpetaDeFichas, fichasDe, notaDesdeFicha, type Ficha } from "../lib/fichas";
import {
  conCuerpo,
  conTitulo,
  cuerpoDe,
  destinosDeNota,
  encargoDeNota,
  leerLineas,
  proyectosDeNota,
  sobreNota,
  tareasPendientes,
  tituloDe,
  voltear,
  type DondeNace,
} from "../lib/notas";
import { Grip } from "./CanvasWidgets";
import { CloseIcon, EnviarIcon, EstadoIcon, FolderIcon, GroupIcon, NoteIcon } from "./Icons";

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
  /** El menú de «lanzar», y lo que se dice al lanzarla. */
  const [lanzando, setLanzando] = useState(false);
  const [dicho, setDicho] = useState("");
  /** Ya se leyó del disco: hasta entonces «vacía» solo quiere decir «aún no sé». */
  const [leida, setLeida] = useState(false);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const estados = useCabina((s) => s.estados);
  const lienzo = useEncargosDelLienzo();
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
      setLeida(true);
    });
    return () => {
      vivo = false;
    };
  }, [data.noteId]);

  // Una nota VACÍA ofrece las fichas del proyecto del lienzo: las recetas de
  // pasos que viven en su `docs/fichas`. Solo vacía, y solo después de leerla
  // del disco: con veinte notas escritas en el tablero no se mira ninguna
  // carpeta, y una nota a medio escribir no tiene sitio para una lista.
  const raizFichas = lienzo.proyectos.find((p) => p.name === lienzo.proyecto)?.path ?? "";
  const vacia = leida && !texto;
  useEffect(() => {
    if (!vacia || !raizFichas) {
      setFichas([]);
      return;
    }
    let vivo = true;
    listarCarpeta(carpetaDeFichas(raizFichas))
      .then((c) => vivo && setFichas(fichasDe(c.filas)))
      // Que no exista la carpeta es lo normal: no hay fichas y no se dice nada.
      .catch(() => vivo && setFichas([]));
    return () => {
      vivo = false;
    };
  }, [vacia, raizFichas]);

  // Y se vuelve a mirar cada pocos segundos, que es como se entera la nota de
  // que un agente le ha marcado una casilla. Mientras escribes no se toca: lo
  // último que quiere uno es que le reescriban el texto bajo el cursor.
  useEffect(() => {
    if (editando) return;
    return latido(() => {
      void noteRead(data.noteId).then((f) => {
        if (f.stamp > sello.current) {
          sello.current = f.stamp;
          setTexto(f.text);
        }
      });
    }, MIRA_MS);
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

  /** Una frase que se borra sola. El reloj es uno: con uno por frase, el de la
      anterior borraba la siguiente antes de que se pudiera leer. */
  const callar = useRef<number | undefined>(undefined);
  const decir = (frase: string) => {
    setDicho(frase);
    window.clearTimeout(callar.current);
    callar.current = window.setTimeout(() => setDicho(""), 4000);
  };

  /**
   * Lo último que escribiste, a disco ya y sin esperar al retardo: el encargo le
   * dice al agente que abra el ARCHIVO, y tiene que encontrar ahí lo mismo que
   * tú ves.
   */
  const guardarYa = async () => {
    window.clearTimeout(timer.current);
    const f = await noteWrite(data.noteId, texto);
    sello.current = f.stamp;
    setRuta(f.path);
    return { ...f, text: texto };
  };

  /** Lanza la nota en una terminal abierta: se la escribe y pulsa Intro. */
  const lanzarEn = async (paneId: number) => {
    setLanzando(false);
    try {
      pasteInto(paneId, encargoDeNota(await guardarYa()), true);
      decir(t("Lanzada: ya la tiene esa terminal."));
    } catch (e) {
      decir(String(e));
    }
  };

  /**
   * Una sesión nueva para la nota, en el proyecto que elijas. Con qué cliente y
   * con qué modelo nace lo decide el router, que es el mismo del Capataz, y lo
   * decide mirando lo que escribiste y no el envoltorio del encargo.
   */
  const nuevaEn = async (d: DondeNace) => {
    setLanzando(false);
    try {
      const abierta = lienzo.lanzar(encargoDeNota(await guardarYa()), d.ruta, sobreNota(texto));
      decir(abierta ? t("Abriendo una sesión en {p}.", { p: d.nombre }) : t("No se pudo abrir ahí."));
    } catch (e) {
      decir(String(e));
    }
  };

  /**
   * Varias tareas, al Reparto: el Capataz las clasifica, les separa los
   * archivos y las abre como cuadrilla. La nota no cambia: cerrar el Reparto sin
   * abrir nada no puede costarte lo que tenías apuntado.
   *
   * Se guarda antes y viaja la ruta, igual que al lanzarla en una sola
   * terminal: cada sesión del lote recibe cuál es SU casilla, y tiene que
   * encontrar en el archivo la misma línea que tú ves.
   */
  const repartir = async () => {
    setLanzando(false);
    try {
      const f = await guardarYa();
      const tareas = tareasPendientes(f.text);
      const abierto = lienzo.repartir(
        tareas,
        undefined,
        () => decir(t("Repartida: cada sesión marcará su casilla al terminar.")),
        { titulo: tituloDe(f.text), ruta: f.path, tareas },
      );
      if (!abierto) decir(t("No se pudo abrir ahí."));
    } catch (e) {
      decir(String(e));
    }
  };

  /** La nota nace con los pasos de esa ficha, todos sin marcar. La ficha no se
      toca: lo que se marca es la copia, que es esta nota. */
  const ponerFicha = async (f: Ficha) => {
    try {
      const a = await leerArchivo(f.ruta);
      if (a.texto === null) {
        decir(t("Esa ficha no se puede leer."));
        return;
      }
      guardar(notaDesdeFicha(a.texto, f.nombre));
      decir(t("Ficha puesta. Lánzala con la flecha de arriba."));
    } catch (e) {
      decir(String(e));
    }
  };

  const lineas = leerLineas(cuerpoDe(texto));
  const titulo = tituloDe(texto);
  const tareas = lineas.filter((l) => l.hecha !== null);
  const hechas = tareas.filter((l) => l.hecha).length;
  // Lo del menú de lanzar solo se calcula con el menú abierto: los estados de
  // la Cabina cambian a cada latido y una nota cerrada no tiene nada que decir.
  const destinos = lanzando ? destinosDeNota(estados) : [];
  const donde = lanzando ? proyectosDeNota(lienzo.proyectos, lienzo.proyecto, texto) : [];
  const pendientes = lanzando ? tareasPendientes(texto).length : 0;

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
          className="wdg-x"
          data-lanzar
          data-on={lanzando || undefined}
          onClick={() => {
            setPaleta(false);
            setLanzando((v) => !v);
          }}
          data-tip={t("Lanzar esta nota")}
        >
          <EnviarIcon size={13} />
        </button>
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

      {lanzando && (
        // `nowheel`: la lista tiene su propia rueda, y sin esto la rueda
        // acercaba el lienzo en vez de bajar por los proyectos.
        <div className="note-lanzar nodrag nowheel" role="menu">
          {destinos.length > 0 && <p>{t("En una terminal abierta")}</p>}
          {destinos.map((d) => (
            <button key={d.id} role="menuitem" data-terminal={d.id} disabled={!d.puede} onClick={() => void lanzarEn(d.id)}>
              <EstadoIcon estado={d.estado} size={13} />
              <span>{d.nombre}</span>
              <em>{d.puede ? t(PINTA[d.estado]?.label ?? "") : t("te está preguntando algo")}</em>
            </button>
          ))}
          {/* Con una sola tarea no hay nada que repartir: para eso está la
              sesión nueva de abajo. */}
          {pendientes > 1 && (
            <button role="menuitem" data-repartir onClick={() => void repartir()}>
              <GroupIcon size={13} />
              <span>{t("Repartir las {n} tareas", { n: pendientes })}</span>
              <em>{t("Capataz")}</em>
            </button>
          )}
          {donde.length > 0 && <p>{t("En una sesión nueva en")}</p>}
          {donde.map((d) => (
            <button key={d.ruta} role="menuitem" data-proyecto={d.nombre} onClick={() => void nuevaEn(d)}>
              <FolderIcon size={13} />
              <span>{d.nombre}</span>
              <em>
                {d.porque === "nombrado"
                  ? t("lo nombra la nota")
                  : d.porque === "lienzo"
                    ? t("el de este lienzo")
                    : ""}
              </em>
            </button>
          ))}
          {destinos.length === 0 && donde.length === 0 && <p>{t("No hay terminales abiertas.")}</p>}
        </div>
      )}
      {dicho && <p className="note-dicho nodrag">{dicho}</p>}

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
          {fichas.length > 0 && (
            // El clic se queda aquí: el del cuerpo abre el cuadro de escribir,
            // y elegir una ficha no es ponerse a teclear.
            <div className="note-fichas nodrag" onClick={(e) => e.stopPropagation()}>
              <p>{t("O empieza desde una ficha")}</p>
              {fichas.map((f) => (
                <button key={f.ruta} data-ficha={f.nombre} onClick={() => void ponerFicha(f)}>
                  <NoteIcon size={13} />
                  <span>{f.nombre}</span>
                </button>
              ))}
            </div>
          )}
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
