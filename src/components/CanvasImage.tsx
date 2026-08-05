import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import {
  CloseIcon,
  ImageIcon,
  UndoIcon,
} from "./Icons";

// Una captura pegada en el lienzo, anotable y entregable a un agente.
//
// El recorrido que resuelve: pegas un pantallazo (Ctrl+V), le pintas una flecha
// donde está el problema, y se lo pasas a la terminal que tengas al lado. Hasta
// ahora eso eran tres programas: recortes, algo para pintar encima y volver a
// pegar. Aquí no se sale del lienzo, y lo que recibe el agente es un PNG con la
// flecha ya dentro, no "mira arriba a la derecha".
//
// Las anotaciones se guardan en coordenadas de 0 a 100 sobre la imagen, no en
// píxeles de pantalla: así el nodo se puede redimensionar y hacer zoom sin que
// la flecha se despegue de lo que señalaba.

export type Tool = "flecha" | "caja" | "lapiz" | "texto";

export interface Shape {
  t: Tool;
  color: string;
  /** flecha y caja: [x1,y1,x2,y2]. lápiz: pares x,y seguidos.
      texto: [x,y] del punto donde empieza el rótulo. */
  p: number[];
  /** Solo para «texto»: lo que pone. Una flecha señala, pero no explica. */
  txt?: string;
}

export interface ImageData extends Record<string, unknown> {
  /** La imagen en data: URI, para que el nodo sea autónomo. */
  src: string;
  /** Tamaño natural, para exportar a resolución real y no a la de pantalla. */
  w: number;
  h: number;
  nodeId: string;
  onClose: (nodeId: string) => void;
  /** Anotaciones ya hechas: llegan al reabrir un lienzo exportado. */
  formas?: Shape[];
  /** Avisa de cada cambio para que el lienzo pueda exportarlas. */
  onFormas?: (nodeId: string, formas: Shape[]) => void;
  /** Terminales vivas del lienzo, para poder mandársela a una. */
  terminales: Array<{ id: number; name: string }>;
  /** Entrega el PNG aplanado a una terminal: lo guarda en disco y escribe
      la ruta en su prompt, junto con la nota si la hay. */
  onEnviar: (paneId: number, png: Blob, nota: string) => void;
  /** Una terminal a la que el lienzo acaba de engancharla con una flecha.
   *
   *  El aplanado (imagen + lo que le hayas pintado encima) solo sabe hacerlo
   *  este nodo, así que el lienzo no puede mandar la captura por su cuenta: le
   *  deja aquí el recado y el nodo se manda solo. El contador es para que
   *  volver a conectar la misma pareja funcione igual que la primera vez. */
  pedido?: { paneId: number; n: number };
}

const COLORES = ["#ff5c5c", "#ffd166", "#5fd0ff", "#6fe0bb", "#ffffff"];

/**
 * Lo que hace el ratón encima de la captura. No es lo mismo que `Tool`: `Tool`
 * es lo que queda dibujado y se guarda en el archivo, y «mano» no dibuja nada.
 *
 * Existe porque sin ella la captura era una trampa: la capa de dibujo se
 * tragaba todos los clics, así que en cuanto pintabas una flecha ya no podías
 * mover el nodo ni tirar de sus puertos para engancharlo a una terminal. Y no
 * había forma de salir, porque no había ningún estado «sin herramienta».
 */
type Modo = Tool | "mano";

const HERRAMIENTAS: Array<{ t: Modo; icon: string; label: string }> = [
  { t: "mano", icon: "✥", label: "Mover y conectar" },
  { t: "flecha", icon: "↗", label: "Flecha" },
  { t: "caja", icon: "▭", label: "Recuadro" },
  { t: "lapiz", icon: "✎", label: "Lápiz" },
  { t: "texto", icon: "T", label: "Texto" },
];

/** El tamaño del rótulo sobre la imagen, en unidades de 0..100 de su ALTO.
 *  Va en proporción como todo lo demás: al exportar a resolución real el
 *  texto crece con la captura en vez de quedarse en letra de hormiga. */
const TXT_ALTO = 4.2;

/** Dibuja una forma en un contexto 2D, con las coordenadas ya en píxeles. */
function pintar(ctx: CanvasRenderingContext2D, s: Shape, w: number, h: number, escala: number) {
  const X = (v: number) => (v / 100) * w;
  const Y = (v: number) => (v / 100) * h;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = 3 * escala;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.t === "caja") {
    const [a, b, c, d] = s.p;
    ctx.strokeRect(X(a), Y(b), X(c) - X(a), Y(d) - Y(b));
    return;
  }
  if (s.t === "lapiz") {
    ctx.beginPath();
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      const x = X(s.p[i]);
      const y = Y(s.p[i + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  if (s.t === "texto") {
    if (!s.txt) return;
    const px = (TXT_ALTO / 100) * h;
    ctx.font = `600 ${px}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    // Un borde oscuro detrás: el rótulo cae sobre la captura, y sin esto un
    // texto claro sobre un fondo claro no se lee y hay que repetir la foto.
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.lineJoin = "round";
    for (const [i, linea] of s.txt.split("\n").entries()) {
      const y = Y(s.p[1]) + i * px * 1.25;
      ctx.strokeText(linea, X(s.p[0]), y);
      ctx.fillText(linea, X(s.p[0]), y);
    }
    return;
  }
  // Flecha: el palo y una punta cuyo tamaño no depende del largo, para que una
  // flecha corta no acabe siendo solo punta.
  const [a, b, c, d] = s.p;
  const x1 = X(a);
  const y1 = Y(b);
  const x2 = X(c);
  const y2 = Y(d);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = 14 * escala;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - L * Math.cos(ang - Math.PI / 7), y2 - L * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(x2 - L * Math.cos(ang + Math.PI / 7), y2 - L * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

export default function ImageNode({ data, selected }: NodeProps<Node<ImageData>>) {
  const { t } = useT();
  const [shapes, setShapes] = useState<Shape[]>(data.formas ?? []);
  // Se empieza con la mano, no con la flecha: al pegar un pantallazo lo
  // primero que se hace es colocarlo, no pintarlo.
  const [tool, setTool] = useState<Modo>("mano");
  const [color, setColor] = useState(COLORES[0]);
  const [dibujando, setDibujando] = useState<Shape | null>(null);
  const [menu, setMenu] = useState(false);
  const [nota, setNota] = useState("");
  const capa = useRef<HTMLDivElement>(null);

  // El lienzo necesita las anotaciones para poder exportarlas, pero quien las
  // dibuja es este nodo. Se avisa por referencia y solo cuando cambian: meter
  // `data` en las dependencias haría que actualizar el nodo volviese a avisar,
  // y de ahí al bucle infinito hay un paso.
  const avisar = useRef(data.onFormas);
  avisar.current = data.onFormas;
  useEffect(() => {
    avisar.current?.(data.nodeId, shapes);
  }, [shapes, data.nodeId]);

  /** Punto del ratón en coordenadas 0..100 de la imagen. */
  const punto = (e: React.PointerEvent): [number, number] => {
    const r = capa.current!.getBoundingClientRect();
    return [
      Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    ];
  };

  /** Dónde se está escribiendo un rótulo, mientras se escribe. */
  const [escribiendo, setEscribiendo] = useState<{ x: number; y: number; txt: string } | null>(null);
  const cajaTxt = useRef<HTMLTextAreaElement>(null);

  // El foco, después de pintar y no durante.
  //
  // Con `autoFocus` el cuadro nacía, alguien le quitaba el foco en el mismo
  // clic que lo abrió y el `onBlur` lo cerraba antes de que se viera: pulsabas
  // la T, tocabas la imagen y no pasaba nada. Por eso el cierre ya no cuelga
  // del blur (lo hacen Enter, Escape y tocar fuera) y el foco se pide en el
  // fotograma siguiente, cuando el cuadro ya está puesto.
  useEffect(() => {
    if (!escribiendo) return;
    const id = requestAnimationFrame(() => cajaTxt.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [escribiendo?.x, escribiendo?.y]);

  /** Guarda el rótulo que se estaba escribiendo. Uno vacío no deja nada: un
      clic sin escribir nada fue un clic, no un rótulo invisible. */
  const cerrarTexto = () => {
    if (!escribiendo) return;
    const txt = escribiendo.txt.trim();
    if (txt) {
      setShapes((prev) => [...prev, { t: "texto", color, p: [escribiendo.x, escribiendo.y], txt }]);
    }
    setEscribiendo(null);
  };

  const abajo = (e: React.PointerEvent) => {
    // Con la mano puesta el clic no es nuestro: que baje al lienzo, que es
    // quien mueve el nodo y quien engancha los puertos.
    if (e.button !== 0 || tool === "mano") return;
    e.stopPropagation();
    const [x, y] = punto(e);
    // Cualquier trazo nuevo da por terminado el rótulo que estuvieras
    // escribiendo, igual que tocar fuera en cualquier programa de dibujo.
    cerrarTexto();
    // El rótulo se pone donde tocas y se escribe ahí mismo. Moverlo después es
    // cosa del propio rótulo, que se arrastra (ver `agarrarTexto`).
    if (tool === "texto") {
      setEscribiendo({ x, y, txt: "" });
      return;
    }
    capa.current?.setPointerCapture(e.pointerId);
    setDibujando({ t: tool, color, p: tool === "lapiz" ? [x, y] : [x, y, x, y] });
  };
  /**
   * Coger un rótulo ya puesto y llevarlo a otro sitio.
   *
   * Un rótulo casi nunca cae a la primera donde tiene que estar: lo pones, ves
   * la captura entera y resulta que tapa justo lo que querías enseñar. Sin
   * poder moverlo había que deshacerlo y volver a escribirlo.
   *
   * Se guarda el desfase entre el punto que agarras y la esquina del rótulo,
   * para que no salte a colocar su esquina bajo el dedo al empezar a mover.
   */
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const desfase = useRef<[number, number]>([0, 0]);

  const agarrarTexto = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0 || tool === "mano") return;
    e.stopPropagation();
    const [x, y] = punto(e);
    const s = shapes[idx];
    desfase.current = [x - s.p[0], y - s.p[1]];
    setArrastrando(idx);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const mueve = (e: React.PointerEvent) => {
    if (arrastrando !== null) {
      e.stopPropagation();
      const [x, y] = punto(e);
      const [dx, dy] = desfase.current;
      setShapes((prev) =>
        prev.map((s, i) =>
          i === arrastrando
            ? { ...s, p: [Math.min(98, Math.max(0, x - dx)), Math.min(97, Math.max(0, y - dy))] }
            : s,
        ),
      );
      return;
    }
    if (!dibujando) return;
    e.stopPropagation();
    const [x, y] = punto(e);
    setDibujando((s) =>
      !s ? s : s.t === "lapiz" ? { ...s, p: [...s.p, x, y] } : { ...s, p: [s.p[0], s.p[1], x, y] },
    );
  };
  const arriba = (e: React.PointerEvent) => {
    if (arrastrando !== null) {
      e.stopPropagation();
      setArrastrando(null);
      return;
    }
    if (!dibujando) return;
    e.stopPropagation();
    // Un clic sin arrastre no es una flecha, es un clic: no deja rastro.
    const largo =
      dibujando.t === "lapiz"
        ? dibujando.p.length > 4
        : Math.hypot(dibujando.p[2] - dibujando.p[0], dibujando.p[3] - dibujando.p[1]) > 1.5;
    if (largo) setShapes((prev) => [...prev, dibujando]);
    setDibujando(null);
  };

  /** Imagen + anotaciones en un solo PNG, al tamaño real de la captura. */
  const aplanar = useCallback((): Promise<Blob | null> => {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = data.w || img.naturalWidth;
        cv.height = data.h || img.naturalHeight;
        const ctx = cv.getContext("2d");
        if (!ctx) return res(null);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        // El trazo se escala con la imagen: una captura 4K no puede llevar la
        // misma flecha de 3 px que una miniatura.
        const escala = Math.max(1, cv.width / 900);
        for (const s of shapes) pintar(ctx, s, cv.width, cv.height, escala);
        cv.toBlob((b) => res(b), "image/png");
      };
      img.onerror = () => res(null);
      img.src = data.src;
    });
  }, [data.src, data.w, data.h, shapes]);

  /**
   * La captura ya anotada, al portapapeles.
   *
   * Faltaba, y era la salida más obvia: le pintas tres flechas y lo normal es
   * querer pegarla en otro sitio (un chat, un correo, otra terminal). Sin esto
   * la única forma de sacarla era «Mandar a…», que la guarda en disco y le da
   * la ruta a un agente: sirve para el agente y para nadie más.
   */
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    const png = await aplanar();
    if (!png) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 1600);
    } catch {
      // Algunos entornos no dejan escribir imágenes en el portapapeles. No se
      // dice nada porque no hay nada que el usuario pueda hacer al respecto.
    }
  };

  const enviar = async (paneId: number) => {
    setMenu(false);
    const png = await aplanar();
    if (png) data.onEnviar(paneId, png, nota.trim());
  };

  // El recado del lienzo: alguien ha tirado una flecha de esta captura a una
  // terminal. Antes la flecha se dibujaba y no pasaba nada, que es la peor
  // versión posible: parece que ha funcionado.
  const pedidoN = data.pedido?.n ?? 0;
  useEffect(() => {
    if (!pedidoN || !data.pedido) return;
    const paneId = data.pedido.paneId;
    void aplanar().then((png) => {
      if (png) data.onEnviar(paneId, png, nota.trim());
    });
    // Solo cuando llega un recado nuevo: ni al repintar ni al seguir dibujando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoN]);

  // Escape suelta la herramienta. Es la salida que uno prueba por instinto
  // cuando se ve atrapado dibujando, y hasta ahora no hacía nada.
  useEffect(() => {
    if (tool === "mano") return;
    const salir = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTool("mano");
    };
    window.addEventListener("keydown", salir);
    return () => window.removeEventListener("keydown", salir);
  }, [tool]);

  const vistas = dibujando ? [...shapes, dibujando] : shapes;
  return (
    // Los puertos van FUERA de la tarjeta, no dentro.
    //
    // Dentro los recortaba el `overflow: hidden` de `.wdg`, que está ahí para
    // que el contenido respete las esquinas redondeadas. Como asoman 7 px por
    // el borde, se cortaba la mitad de fuera y con ella media zona de clic:
    // enganchar una flecha era cuestión de puntería, y al lado de una terminal
    // (cuyos puertos sí se ven enteros) parecía que la captura no conectaba.
    <>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="wdg img-node" onPointerDownCapture={nodragEnControles}>
      <NodeResizer isVisible={selected} minWidth={240} minHeight={200} />

      <header className="wdg-head">
        <span className="wdg-icon" aria-hidden="true">
          <ImageIcon size={14} />
        </span>
        <span className="wdg-name">{t("Captura")}</span>
        <button className="wdg-x" onClick={() => data.onClose(data.nodeId)} data-tip={t("Quitar")}>
          <CloseIcon size={13} />
        </button>
      </header>

      <div className="img-tools">
        {HERRAMIENTAS.map((h) => (
          <button
            key={h.t}
            className="img-tool"
            data-on={tool === h.t}
            data-tip={t(h.label)}
            onClick={() => {
              cerrarTexto();
              setTool(h.t);
            }}
          >
            {h.icon}
          </button>
        ))}
        <span className="img-sep" />
        {COLORES.map((c) => (
          <button
            key={c}
            className="img-color"
            data-on={color === c}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
        <span className="img-sep" />
        <button
          className="img-tool"
          data-tip={t("Deshacer lo último")}
          disabled={shapes.length === 0}
          onClick={() => setShapes((s) => s.slice(0, -1))}
        >
          <UndoIcon size={13} />
        </button>
      </div>

      <div className="img-stage">
        <img src={data.src} alt="" draggable={false} />
        {/* La capa de dibujo va en SVG y encima de la imagen. Se guarda en
            0..100 y el viewBox hace el resto: al redimensionar el nodo, la
            flecha sigue señalando lo mismo. */}
        <div
          // Igual con la capa de dibujo: al soltar el arrastre por la cabecera
          // se podía mover la captura desde cualquier parte, y eso incluía
          // encima de la imagen, así que pintar una flecha la arrastraba.
          className={`img-layer${tool !== "mano" ? " nodrag" : ""}`}
          ref={capa}
          data-dibuja={tool !== "mano"}
          onPointerDown={abajo}
          onPointerMove={mueve}
          onPointerUp={arriba}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {vistas.map((s, i) => (
              <Trazo key={i} s={s} />
            ))}
          </svg>
          {/* Los rótulos, encima y en HTML: el tamaño va en cqh, o sea en
              proporción al alto de la captura, igual que al exportar. */}
          {vistas.map((s, i) =>
            s.t === "texto" && s.txt ? (
              <span
                key={`t${i}`}
                // `nodrag` y no un `stopPropagation`: React Flow engancha el
                // arrastre del nodo con un listener NATIVO sobre él, que corre
                // antes de que React despache nada nuestro. Por eso el intento
                // anterior movía la captura entera en vez del rótulo. Esta
                // clase es lo que React Flow mira para no arrastrar.
                className={`img-txt${tool !== "mano" && i < shapes.length ? " nodrag" : ""}`}
                data-movible={tool !== "mano" && i < shapes.length}
                style={{ left: `${s.p[0]}%`, top: `${s.p[1]}%`, color: s.color }}
                onPointerDown={(e) => agarrarTexto(e, i)}
                onPointerMove={mueve}
                onPointerUp={arriba}
                onDoubleClick={(e) => {
                  // Doble clic para reescribirlo: se saca de la lista y vuelve
                  // al cuadro de escribir, en su sitio y con lo que ponía.
                  e.stopPropagation();
                  if (tool === "mano") return;
                  setShapes((prev) => prev.filter((_, j) => j !== i));
                  setEscribiendo({ x: s.p[0], y: s.p[1], txt: s.txt ?? "" });
                }}
              >
                {s.txt}
              </span>
            ) : null,
          )}
          {/* El rótulo a medio escribir. Es un textarea del tamaño del texto
              que va a quedar, así que lo que ves mientras escribes es lo que
              queda al soltar, no una aproximación. */}
          {escribiendo && (
            <textarea
              className="img-txt img-txt-edit nodrag nowheel"
              ref={cajaTxt}
              value={escribiendo.txt}
              style={{ left: `${escribiendo.x}%`, top: `${escribiendo.y}%`, color }}
              onChange={(e) => setEscribiendo({ ...escribiendo, txt: e.currentTarget.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                // Enter cierra, Mayús+Enter hace otra línea: lo mismo que en
                // cualquier cuadro de escribir con el que ya ha tratado.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  cerrarTexto();
                }
                if (e.key === "Escape") setEscribiendo(null);
              }}
            />
          )}
        </div>
      </div>

      <div className="img-foot">
        <input
          className="finder img-note"
          placeholder={t("Qué quieres que mire (opcional)")}
          value={nota}
          onChange={(e) => setNota(e.currentTarget.value)}
        />
        <div className="img-send">
          <button
            className="tool-btn img-copy"
            onClick={() => void copiar()}
            data-tip={t("Copiar la captura con lo que le has pintado")}
          >
            {copiada ? t("Copiada") : t("Copiar")}
          </button>
          <button
            className="np-btn"
            disabled={data.terminales.length === 0}
            data-tip={
              data.terminales.length === 0
                ? t("Abre una terminal en el lienzo para poder mandársela")
                : t("Guardar el PNG con las anotaciones y darle la ruta a un agente")
            }
            onClick={() => setMenu((m) => !m)}
          >
            {t("Mandar a…")}
          </button>
          {menu && (
            <ul className="img-menu">
              {data.terminales.map((x) => (
                <li key={x.id}>
                  <button onClick={() => void enviar(x.id)}>{x.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

/** Una forma como SVG. `non-scaling-stroke` mantiene el grosor aunque el
    viewBox esté estirado a un rectángulo cualquiera. */
function Trazo({ s }: { s: Shape }) {
  const comun = {
    stroke: s.color,
    strokeWidth: 0.6,
    fill: "none",
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (s.t === "caja") {
    const [a, b, c, d] = s.p;
    return (
      <rect
        x={Math.min(a, c)}
        y={Math.min(b, d)}
        width={Math.abs(c - a)}
        height={Math.abs(d - b)}
        {...comun}
      />
    );
  }
  if (s.t === "lapiz") {
    const d = s.p.reduce(
      (acc, v, i) => (i % 2 === 0 ? `${acc}${i === 0 ? "M" : "L"}${v} ` : `${acc}${v} `),
      "",
    );
    return <path d={d} {...comun} />;
  }
  // El texto no se pinta aquí: este SVG lleva el viewBox estirado a la forma
  // del nodo (`preserveAspectRatio="none"`), que es lo que mantiene las
  // flechas señalando su sitio al redimensionar, pero deformaría las letras.
  // Va como HTML encima, en la misma proporción.
  if (s.t === "texto") return null;
  const [a, b, c, d] = s.p;
  const ang = Math.atan2(d - b, c - a);
  const L = 4;
  const pts = [
    `${c},${d}`,
    `${c - L * Math.cos(ang - Math.PI / 7)},${d - L * Math.sin(ang - Math.PI / 7)}`,
    `${c - L * Math.cos(ang + Math.PI / 7)},${d - L * Math.sin(ang + Math.PI / 7)}`,
  ].join(" ");
  return (
    <g>
      <line x1={a} y1={b} x2={c} y2={d} {...comun} />
      <polygon points={pts} fill={s.color} stroke="none" />
    </g>
  );
}
