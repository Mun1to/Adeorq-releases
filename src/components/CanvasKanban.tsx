// El kanban del trabajo de los agentes, como una pieza más del lienzo.
//
// Con seis terminales abiertas, saber quién trabaja y quién lleva diez minutos
// esperando una respuesta tuya exige mirarlas una a una. El tablero de la
// cuadrilla ya resuelve eso en la cabina, pero solo para las terminales que
// reparte el Capataz y solo ahí. Esto es lo mismo llevado al lienzo y para
// TODOS los agentes, con una columna de más que el otro no tiene (Munir,
// 2026-07-30).
//
// Tres columnas se llenan solas y una es tuya, y esa mezcla es la razón de ser
// del tablero:
//
//   · Trabajando, Te espera y Hecho salen del estado que cada terminal reporta.
//     No se pregunta a ningún modelo ni se gasta cuota: se lee lo que el panel
//     ya sabe. Y por eso no se pueden arrastrar tarjetas ahí: el estado es del
//     agente, no tuyo. Moverla a mano solo serviría para mentirte.
//   · Por hacer son tarjetas que escribes tú, y esas sí se arrastran. Al soltar
//     una en Trabajando se abre una terminal con ese encargo, que es lo que
//     convierte el tablero en algo que hace cosas en vez de solo enseñarlas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { COLUMNAS, PINTA, TITULO, columnaDe, haceCuanto, type Columna } from "../lib/estados";
import type { WorkState } from "../lib/pty";
import ProviderMark, { tieneMarca } from "./ProviderMark";
import { kindDeComando } from "./KindIcon";
import {
  CloseIcon,
  EstadoIcon,
} from "./Icons";

/** Una tarjeta de «Por hacer»: lo único de este tablero que escribes tú. */
export interface Pendiente {
  id: string;
  texto: string;
  /** Dónde lanzarla. Vacío = el proyecto del lienzo, que es el caso normal. */
  ruta?: string;
}

/** Un agente vivo, tal como lo ve el tablero. */
export interface AgenteVivo {
  paneId: number;
  name: string;
  cwd: string;
  state: WorkState;
  /** Su línea de comando, para saber qué CLI es y ponerle su marca. */
  command?: string[];
  percent?: number;
  agentsLive: number;
  /** Si vive en el lienzo o en la cabina: la tarjeta lo dice, porque «ir a
      ella» significa cosas distintas y una no se puede enfocar desde aquí. */
  enLienzo: boolean;
}

export interface KanbanData extends Record<string, unknown> {
  nodeId: string;
  onClose: (id: string) => void;
  agentes: AgenteVivo[];
  pendientes: Pendiente[];
  onPendientes: (nodeId: string, lista: Pendiente[]) => void;
  onFocus: (paneId: number) => void;
  /** Devuelve si de verdad ha abierto algo. Importa: la tarjeta solo se retira
      de «Por hacer» cuando hay una terminal que la represente. */
  onLanzar: (texto: string, ruta?: string) => boolean;
  /** Varias tarjetas de golpe: pasan por el Reparto, que les separa los
      archivos y las abre como una cuadrilla. Una sola no lo necesita (una
      cuadrilla de uno no es una cuadrilla), por eso el botón sale a partir de
      dos. `alAbrir` retira las tarjetas SOLO si el reparto llegó a abrirse. */
  onRepartir: (textos: string[], ruta: string | undefined, alAbrir: () => void) => boolean;
}

/** El nombre de la terminal sin el prefijo del proyecto, que ya va aparte. */
function corto(name: string, cwd: string): string {
  const proyecto = cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return name.startsWith(`${proyecto} · `) ? name.slice(proyecto.length + 3) : name;
}

export default function KanbanNode({ data, selected }: NodeProps<Node<KanbanData>>) {
  const { t } = useT();
  const d = data;
  const [ahora, setAhora] = useState(() => Date.now());
  const [nueva, setNueva] = useState("");
  /** La tarjeta que va en el aire, y la columna que está debajo del cursor. */
  const [llevando, setLlevando] = useState<string | null>(null);
  const [encima, setEncima] = useState<Columna | null>(null);
  /** Las marcadas para ir juntas. Marcar es explícito a propósito: un equipo
      es una afirmación de que trabajan en lo mismo, y adivinarlo por «las
      soltaste seguidas» sería el tablero inventándose una cuadrilla. */
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  /** La tarjeta que se está reescribiendo. Se escriben a mano y de una tirada,
      así que una errata obligaba a borrarla y volver a teclearla entera. */
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);

  // Desde cuándo cada terminal está como está. No lo dice el backend: se
  // aprende mirando, y por eso va en una ref, que sobrevive a los repintados
  // sin provocarlos.
  const desdeRef = useRef<Record<number, { estado: WorkState; t: number }>>({});

  // Un latido por minuto y solo si hay algo que contar: los rótulos son «4
  // min», así que un reloj por segundo repintaría sesenta veces para nada.
  useEffect(() => {
    if (!d.agentes.length) return;
    const id = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [d.agentes.length]);

  const porColumna = useMemo(() => {
    const out: Record<Exclude<Columna, "porhacer">, AgenteVivo[]> = {
      trabajando: [],
      espera: [],
      hecho: [],
    };
    for (const a of d.agentes) {
      const prev = desdeRef.current[a.paneId];
      if (!prev || prev.estado !== a.state) {
        desdeRef.current[a.paneId] = { estado: a.state, t: Date.now() };
      }
      out[columnaDe(a.state)].push(a);
    }
    // Los que te esperan, el que lleva más tiempo primero: es el que más te
    // está costando. En las otras dos el orden de apertura sirve igual.
    out.espera.sort(
      (x, y) => (desdeRef.current[x.paneId]?.t ?? 0) - (desdeRef.current[y.paneId]?.t ?? 0),
    );
    return out;
  }, [d.agentes]);

  const añadir = useCallback(() => {
    const texto = nueva.trim();
    if (!texto) return;
    const id = `p${Date.now().toString(36)}${d.pendientes.length}`;
    d.onPendientes(d.nodeId, [...d.pendientes, { id, texto }]);
    setNueva("");
  }, [nueva, d]);

  const quitarPendiente = useCallback(
    (id: string) => d.onPendientes(d.nodeId, d.pendientes.filter((p) => p.id !== id)),
    [d],
  );

  /** Guarda lo reescrito. Vaciarla del todo la borra: es lo que uno espera al
      seleccionar todo y darle a suprimir. */
  const guardarEdicion = useCallback(() => {
    if (!editando) return;
    const texto = editando.valor.trim();
    setEditando(null);
    d.onPendientes(
      d.nodeId,
      texto
        ? d.pendientes.map((p) => (p.id === editando.id ? { ...p, texto } : p))
        : d.pendientes.filter((p) => p.id !== editando.id),
    );
  }, [editando, d]);

  const marcar = useCallback((id: string) => {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (!s.delete(id)) s.add(id);
      return s;
    });
  }, []);

  /** Las marcadas, al Reparto: una sola llamada las clasifica, les separa los
      archivos y las abre como cuadrilla. */
  const repartirMarcadas = useCallback(() => {
    const lote = d.pendientes.filter((p) => marcadas.has(p.id));
    if (lote.length < 2) return;
    // No se retiran aquí: el Reparto se puede cerrar sin abrir nada, y unas
    // tarjetas que desaparecen por haber MIRADO lo que costaban son tarjetas
    // perdidas. Las quita `alAbrir`, que solo corre si se abrió la cuadrilla.
    d.onRepartir(
      lote.map((p) => p.texto),
      lote.find((p) => p.ruta)?.ruta,
      () => {
        d.onPendientes(d.nodeId, d.pendientes.filter((p) => !marcadas.has(p.id)));
        setMarcadas(new Set());
      },
    );
  }, [d, marcadas]);

  /** Soltar en una columna. Solo hace algo en las dos que tienen sentido:
      volver a Por hacer (deshacer el arrastre) o lanzar en Trabajando. */
  const soltar = useCallback(
    (id: string, col: Columna) => {
      const tarjeta = d.pendientes.find((p) => p.id === id);
      if (!tarjeta) return;
      if (col === "trabajando") {
        // Solo sale de Por hacer si de verdad se ha abierto: a partir de ahí la
        // representa la terminal, y tener las dos sería contar el mismo trabajo
        // dos veces. Pero si no se pudo abrir (sin proyecto elegido, por
        // ejemplo), quitarla igualmente perdería lo que escribiste.
        if (d.onLanzar(tarjeta.texto, tarjeta.ruta)) quitarPendiente(id);
      }
    },
    [d, quitarPendiente],
  );

  /** Reordenar dentro de Por hacer: se suelta encima de otra tarjeta. */
  const soltarSobre = useCallback(
    (id: string, destinoId: string) => {
      if (id === destinoId) return;
      const lista = [...d.pendientes];
      const desde = lista.findIndex((p) => p.id === id);
      const hasta = lista.findIndex((p) => p.id === destinoId);
      if (desde < 0 || hasta < 0) return;
      const [movida] = lista.splice(desde, 1);
      lista.splice(hasta, 0, movida);
      d.onPendientes(d.nodeId, lista);
    },
    [d],
  );

  /**
   * El arrastre entero, por puntero y no por el HTML5 nativo.
   *
   * El nativo (`draggable` + `onDragStart`/`onDrop`) dejó de arrastrar nada en
   * la ventana de verdad (Munir, 2026-08-02): ni por el texto ni por la
   * casilla, así que no era un elemento concreto comiéndose el gesto, era el
   * mecanismo entero. La barra lateral ya resuelve un arrastre parecido (el
   * ancho del panel) por puntero, y ese SÍ funciona en esta misma ventana. Se
   * captura el puntero en la tarjeta al empezar, así que `pointermove` y
   * `pointerup` le siguen llegando aunque el cursor se vaya a otra columna.
   */
  const arrastreRef = useRef<string | null>(null);

  const pointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, id: string) => {
      // Marcar, quitar y reescribir se manejan solos: que el gesto empiece ahí
      // no es coger la tarjeta, es tocar su control.
      if ((e.target as HTMLElement).closest("input, button, textarea")) return;
      if (editando) return;
      arrastreRef.current = id;
      setLlevando(id);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [editando],
  );

  const pointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastreRef.current) return;
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const col = bajo?.closest<HTMLElement>(".kb-col")?.dataset.col as Columna | undefined;
    setEncima(col === "porhacer" || col === "trabajando" ? col : null);
  }, []);

  const pointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const id = arrastreRef.current;
      arrastreRef.current = null;
      setLlevando(null);
      setEncima(null);
      if (!id) return;
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const destino = bajo?.closest<HTMLElement>(".kb-card-mia")?.dataset.id;
      if (destino) {
        soltarSobre(id, destino);
        return;
      }
      const col = bajo?.closest<HTMLElement>(".kb-col")?.dataset.col as Columna | undefined;
      if (col === "trabajando") soltar(id, col);
    },
    [soltar, soltarSobre],
  );

  const tarjetaAgente = (a: AgenteVivo) => {
    const pinta = PINTA[a.state] ?? PINTA[""];
    const desde = desdeRef.current[a.paneId]?.t;
    const rato = desde ? haceCuanto(ahora - desde) : "";
    const proyecto = a.cwd.split(/[\\/]/).filter(Boolean).pop() ?? a.cwd;
    const cli = kindDeComando((a.command ?? []).join(" "));
    return (
      <button
        key={a.paneId}
        className="kb-card kb-card-agente"
        data-urge={pinta.urge || undefined}
        // Solo las del lienzo: a una de la cabina no se puede ir desde aquí sin
        // cambiar de vista por debajo de tus pies, y eso no lo hace un tablero.
        disabled={!a.enLienzo}
        data-tip={
          a.enLienzo
            ? t("Ir a esta terminal")
            : t("Está en la cabina, no en el lienzo: cambia de vista para verla")
        }
        onClick={() => a.enLienzo && d.onFocus(a.paneId)}
      >
        <span className="kb-card-top">
          <span className="kb-cli" data-cli={cli}>
            {tieneMarca(cli) ? <ProviderMark id={cli} /> : cli.slice(0, 2).toUpperCase()}
          </span>
          <span className="kb-card-nombre">{corto(a.name, a.cwd)}</span>
        </span>
        <span className="kb-card-pie">
          <span className="kb-proy">{proyecto}</span>
          <span className="kb-estado">
            <EstadoIcon estado={a.state ?? ""} size={12} /> {t(pinta.label)}
            {rato && ` · ${rato}`}
          </span>
        </span>
        {(a.agentsLive > 0 || a.percent != null) && (
          <span className="kb-card-extra">
            {a.agentsLive > 0 && (
              <span className="kb-sub">
                {a.agentsLive} {t(a.agentsLive === 1 ? "ayudante" : "ayudantes")}
              </span>
            )}
            {a.percent != null && <span className="kb-ctx">{a.percent}%</span>}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="rf-kanban nowheel" data-selected={selected}>
      <NodeResizer minWidth={520} minHeight={280} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <header className="kb-head">
        <span className="kb-titulo">{t("Trabajo de los agentes")}</span>
        <span className="kb-cuenta">
          {d.agentes.length} {t(d.agentes.length === 1 ? "agente" : "agentes")}
        </span>
        <button
          className="kb-x"
          data-tip={t("Quitar el tablero del lienzo")}
          onClick={() => d.onClose(d.nodeId)}
        >
          <CloseIcon size={13} />
        </button>
      </header>

      {/* El nodo se arrastra por su cabecera y nada más (`dragHandle` al
          crearlo): aquí dentro arrastrar significa mover una tarjeta, y las dos
          cosas a la vez no pueden ser. */}
      <div className="kb-cols">
        {COLUMNAS.map((col) => {
          const mias = col === "porhacer";
          const puedeSoltar = mias || col === "trabajando";
          return (
            <section
              key={col}
              className="kb-col"
              data-col={col}
              data-suelta={encima === col && puedeSoltar ? true : undefined}
            >
              <h4 className="kb-col-tit">
                {t(TITULO[col])}
                <span className="kb-col-n">
                  {mias ? d.pendientes.length : porColumna[col].length}
                </span>
              </h4>

              <div className="kb-col-cuerpo">
                {mias ? (
                  <>
                    {d.pendientes.map((p) => (
                      <div
                        key={p.id}
                        className="kb-card kb-card-mia"
                        data-id={p.id}
                        data-llevando={llevando === p.id || undefined}
                        onPointerDown={(e) => pointerDown(e, p.id)}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerUp}
                        onPointerCancel={pointerUp}
                      >
                        <input
                          type="checkbox"
                          className="kb-mia-check"
                          checked={marcadas.has(p.id)}
                          data-tip={t("Marcarla para repartirla con otras")}
                          onChange={() => marcar(p.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {editando?.id === p.id ? (
                          <input
                            className="kb-mia-edit"
                            autoFocus
                            value={editando.valor}
                            onChange={(e) =>
                              setEditando({ id: p.id, valor: e.currentTarget.value })
                            }
                            onBlur={guardarEdicion}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                guardarEdicion();
                              } else if (e.key === "Escape") {
                                setEditando(null);
                              }
                            }}
                          />
                        ) : (
                          <span
                            className="kb-mia-txt"
                            data-tip={t("Doble clic para reescribirla")}
                            onDoubleClick={() => setEditando({ id: p.id, valor: p.texto })}
                          >
                            {p.texto}
                          </span>
                        )}
                        <button
                          className="kb-mia-x"
                          data-tip={t("Quitar esta tarjeta")}
                          onClick={() => quitarPendiente(p.id)}
                        >
                          <CloseIcon size={13} />
                        </button>
                      </div>
                    ))}
                    {marcadas.size > 1 && (
                      <button className="np-btn kb-repartir" onClick={repartirMarcadas}>
                        {t("Repartir las {n} juntas", { n: marcadas.size })}
                      </button>
                    )}
                    <div className="kb-nueva">
                      <input
                        className="kb-nueva-in"
                        placeholder={t("Qué hay que hacer…")}
                        value={nueva}
                        onChange={(e) => setNueva(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            añadir();
                          }
                        }}
                      />
                      <button className="kb-nueva-mas" disabled={!nueva.trim()} onClick={añadir}>
                        +
                      </button>
                    </div>
                    {d.pendientes.length > 0 && (
                      <p className="kb-pista">
                        {t(
                          "Arrastra una a Trabajando y se abre con ese encargo. Marca varias para repartirlas entre agentes que no se pisen.",
                        )}
                      </p>
                    )}
                  </>
                ) : porColumna[col].length ? (
                  porColumna[col].map(tarjetaAgente)
                ) : (
                  <p className="kb-vacia">
                    {t(
                      col === "trabajando"
                        ? "Nadie trabajando."
                        : col === "espera"
                          ? "Nadie te espera."
                          : "Nada terminado.",
                    )}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  );
}
