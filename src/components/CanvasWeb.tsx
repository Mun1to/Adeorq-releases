import { useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import { Grip } from "./CanvasWidgets";
import { puedeEmpotrarse } from "../lib/pty";
import { comoUrl, PUERTOS } from "../lib/urlweb";
import {
  CloseIcon,
  ExternalIcon,
  MaximizeIcon,
  RefreshIcon,
} from "./Icons";

// La ventana de localhost dentro del lienzo.
//
// Es la pieza que faltaba para no cambiar de ventana: el agente toca el código
// a la izquierda y tú ves la página a la derecha, en el mismo tablero, con las
// flechas y las notas al lado. Antes había que ir a Brave, buscar la pestaña,
// recargar y volver.
//
// Lo que se ve aquí es un iframe, con dos límites que conviene saber de
// antemano en vez de descubrirlos con una pantalla en blanco:
//
//   1. Muchas webs de fuera se niegan a salir dentro de un iframe
//      (X-Frame-Options o su CSP). Localhost casi nunca lo hace, que es para
//      lo que existe esto. Cuando pasa, la página sale vacía y el botón de
//      abrirla fuera está justo ahí.
//   2. Esto NO es Brave: es el WebView de la app. No tiene tus extensiones ni
//      tus sesiones iniciadas. Por eso froede no se usa aquí dentro (su
//      extensión vive en el navegador) y el botón de froede abre la página
//      fuera además de arrancarle el companion.

export interface WebData extends Record<string, unknown> {
  nodeId: string;
  url: string;
  onClose: (nodeId: string) => void;
  /** Guarda la dirección en el nodo: así vuelve al abrir el lienzo. */
  onUrl: (nodeId: string, url: string) => void;
  /** Arranca el companion de froede en el proyecto y abre la página fuera. */
  onFroede: (url: string) => void;
}

export default function WebNode({ data }: NodeProps<Node<WebData>>) {
  const { t } = useT();
  const [texto, setTexto] = useState(data.url);
  /** Cambia con cada recarga: es lo que obliga al iframe a volver a pedir. */
  const [vuelta, setVuelta] = useState(0);
  /**
   * Mientras está echada, el ratón es del lienzo: la pieza se arrastra desde
   * cualquier punto, como las demás. Un clic la levanta y entonces el ratón es
   * de la página. Sin esto había que elegir entre poder mover el nodo o poder
   * usar la web, porque un iframe se queda con todo lo que pasa por encima.
   */
  const [tapa, setTapa] = useState(true);
  /** Por qué esta página no se puede enseñar aquí, si es que no se puede.
      Se pregunta ANTES de cargarla: un iframe al que le niegan la entrada no
      avisa de nada, se queda en blanco y parece que la app está rota. */
  const [rechaza, setRechaza] = useState<string | null>(null);
  /** Dónde empezó el gesto sobre la tapa: arrastrar la pieza y levantarla son
      el mismo botón, y sin esto mover el nodo la levantaba al soltar. */
  const desde = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    setTexto(data.url);
  }, [data.url]);

  useEffect(() => {
    if (!data.url) return;
    let vivo = true;
    setRechaza(null);
    puedeEmpotrarse(data.url)
      .catch((e) => vivo && setRechaza(String(e)))
      .then(() => {});
    return () => {
      vivo = false;
    };
  }, [data.url, vuelta]);

  const ir = (destino: string) => {
    const url = comoUrl(destino);
    if (!url) return;
    setTexto(url);
    data.onUrl(data.nodeId, url);
    setVuelta((n) => n + 1);
  };

  return (
    <div className="wdg web" onPointerDownCapture={nodragEnControles}>
      <NodeResizer isVisible minWidth={320} minHeight={260} />
      <Grip minWidth={320} minHeight={260} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <header className="wdg-head">
        <span className="wdg-icon" aria-hidden="true">
          <MaximizeIcon size={13} />
        </span>
        <input
          className="web-url"
          value={texto}
          spellCheck={false}
          placeholder="localhost:1420"
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ir(e.currentTarget.value);
            if (e.key === "Escape") setTexto(data.url);
            e.stopPropagation();
          }}
        />
        <button className="wdg-x" data-tip={t("Recargar")} onClick={() => setVuelta((n) => n + 1)}>
          <RefreshIcon size={13} />
        </button>
        <button
          className="wdg-x"
          data-tip={t("Abrirla en tu navegador de verdad")}
          onClick={() => void openUrl(data.url).catch(() => {})}
        >
          <ExternalIcon size={13} />
        </button>
        <button className="wdg-x" onClick={() => data.onClose(data.nodeId)} data-tip={t("Quitar")}>
          <CloseIcon size={13} />
        </button>
      </header>

      <div className="web-bar">
        {PUERTOS.map((p) => (
          <button
            key={p}
            className="web-port"
            data-on={data.url === `http://localhost:${p}`}
            onClick={() => ir(String(p))}
          >
            {p}
          </button>
        ))}
        <span className="web-sep" />
        <button
          className="web-froede"
          data-tip={t(
            "Arranca froede en la carpeta del proyecto y abre esta página en tu navegador, que es donde vive su extensión. Aquí dentro no puede editar.",
          )}
          onClick={() => data.onFroede(data.url)}
        >
          {t("Editar con froede")}
        </button>
      </div>

      <div className="web-body">
        {rechaza ? (
          <div className="web-nope">
            <p className="web-nope-tit">{t("Esta página no se deja abrir aquí dentro")}</p>
            <p className="web-nope-txt">{rechaza}</p>
            <p className="web-nope-txt">
              {t(
                "No es cosa de Adeorq: lo decide la propia web con una cabecera, y ningún navegador se la salta. Ábrela fuera y sigue aquí con lo demás.",
              )}
            </p>
            <button className="np-btn" onClick={() => void openUrl(data.url).catch(() => {})}>
              {t("Abrirla en tu navegador")}
            </button>
          </div>
        ) : data.url ? (
          <iframe
            key={`${data.url}#${vuelta}`}
            className="web-frame nowheel"
            src={data.url}
            title={data.url}
          />
        ) : (
          <p className="web-vacio">
            {t("Escribe arriba un puerto o una dirección, o toca uno de los de abajo.")}
          </p>
        )}
        {tapa && data.url && !rechaza && (
          <button
            className="web-tapa"
            onPointerDown={(e) => {
              desde.current = [e.clientX, e.clientY];
            }}
            onClick={(e) => {
              const [x, y] = desde.current;
              if (Math.hypot(e.clientX - x, e.clientY - y) < 4) setTapa(false);
            }}
          >
            <span>{t("Clic para usar la página")}</span>
          </button>
        )}
      </div>

      {!tapa && (
        <button className="web-soltar" onClick={() => setTapa(true)}>
          {t("Soltar la página (para poder mover la pieza)")}
        </button>
      )}
    </div>
  );
}
