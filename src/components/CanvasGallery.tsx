import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { useT } from "../lib/i18n";
import { nodragEnControles } from "../lib/arrastre";
import { deletePaste, listPastes, readPaste, type Paste } from "../lib/pty";
import {
  CloseIcon,
  RefreshIcon,
  TrashIcon,
} from "./Icons";
import { Grip } from "./CanvasWidgets";

// La galería: todo lo que has pegado alguna vez en Adeorq, en una rejilla.
//
// Hasta ahora una captura pegada se quedaba en el lienzo y punto; el archivo
// seguía en %LOCALAPPDATA%\Adeorq\pastes, pero para volver a usarlo había que
// ir a buscarlo al Explorador entre nombres como `pegado-1785155889688.png`.
//
// Se carga por tandas a propósito. Solo con las de esta máquina son 185
// archivos y 23 MB: pedirlos todos de golpe para pintar cuadrados de 90 px
// sería tirar de memoria sin motivo. Los metadatos llegan de una (son cuatro
// campos por archivo), y los bytes solo de lo que de verdad se enseña.

export interface GalleryData extends Record<string, unknown> {
  nodeId: string;
  onClose: (nodeId: string) => void;
  /** Suelta esa imagen en el lienzo, ya como nodo. */
  onSoltar: (src: string, w: number, h: number) => void;
}

const TANDA = 24;

/** Los bytes de un archivo, convertidos a lo que un <img> puede pintar. */
async function urlDe(path: string): Promise<string> {
  const bytes = await readPaste(path);
  return URL.createObjectURL(new Blob([bytes]));
}

/** Un data: URI, que es como viaja una imagen DENTRO del archivo del lienzo:
    un blob: se muere con la ventana y dejaría el tablero guardado en blanco. */
async function dataDe(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(blob);
  });
}

function cuanto(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export default function GalleryNode({ data }: NodeProps<Node<GalleryData>>) {
  const { t } = useT();
  const [todas, setTodas] = useState<Paste[]>([]);
  const [cuantas, setCuantas] = useState(TANDA);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [grande, setGrande] = useState<string | null>(null);
  // Las URLs de blob hay que devolverlas: si no, la memoria de las imágenes
  // se queda ocupada hasta que se cierra la ventana.
  const vivas = useRef<string[]>([]);

  const releer = useCallback(async () => {
    setCargando(true);
    try {
      setTodas(await listPastes());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void releer();
  }, [releer]);

  useEffect(
    () => () => {
      for (const u of vivas.current) URL.revokeObjectURL(u);
    },
    [],
  );

  // Solo se piden los bytes de lo que está a la vista.
  useEffect(() => {
    let vivo = true;
    const pendientes = todas.slice(0, cuantas).filter((p) => !urls[p.path]);
    if (!pendientes.length) return;
    void (async () => {
      for (const p of pendientes) {
        try {
          const u = await urlDe(p.path);
          if (!vivo) {
            URL.revokeObjectURL(u);
            return;
          }
          vivas.current.push(u);
          setUrls((prev) => ({ ...prev, [p.path]: u }));
        } catch {
          // Un archivo borrado por fuera no puede tumbar la galería entera.
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [todas, cuantas, urls]);

  const soltar = async (p: Paste) => {
    const url = urls[p.path];
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      void dataDe(url).then((src) => data.onSoltar(src, img.naturalWidth, img.naturalHeight));
    };
    img.src = url;
  };

  const tirar = async (p: Paste) => {
    await deletePaste(p.path);
    setTodas((prev) => prev.filter((x) => x.path !== p.path));
  };

  const vistas = todas.slice(0, cuantas);

  return (
    <div className="wdg gal" onPointerDownCapture={nodragEnControles}>
      <NodeResizer isVisible minWidth={260} minHeight={220} />
      <Grip minWidth={260} minHeight={220} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <header className="wdg-head">
        <span className="wdg-name">{t("Galería")}</span>
        <span className="gal-count">{todas.length}</span>
        <button className="wdg-x" onClick={() => void releer()} data-tip={t("Volver a mirar")}>
          <RefreshIcon size={13} />
        </button>
        <button className="wdg-x" onClick={() => data.onClose(data.nodeId)} data-tip={t("Quitar")}>
          <CloseIcon size={13} />
        </button>
      </header>

      <div className="gal-body nowheel">
        {cargando && !todas.length && <p className="gal-vacio">{t("Mirando…")}</p>}
        {!cargando && !todas.length && (
          <p className="gal-vacio">
            {t("Aquí aparecerán las capturas que pegues en el lienzo con Ctrl+V.")}
          </p>
        )}
        <div className="gal-grid">
          {vistas.map((p) => (
            <figure key={p.path} className="gal-item">
              {urls[p.path] ? (
                <img
                  src={urls[p.path]}
                  alt={p.name}
                  loading="lazy"
                  onClick={() => void soltar(p)}
                  onDoubleClick={() => setGrande(urls[p.path])}
                  data-tip={`${t("Clic: al lienzo")}\n${cuanto(p.bytes)}`}
                />
              ) : (
                <span className="gal-hueco" />
              )}
              <button
                className="gal-x"
                onClick={() => void tirar(p)}
                data-tip={t("A la papelera de Windows")}
              >
                <TrashIcon size={13} />
              </button>
            </figure>
          ))}
        </div>
        {cuantas < todas.length && (
          <button className="gal-mas" onClick={() => setCuantas((n) => n + TANDA)}>
            {t("Ver más")} ({todas.length - cuantas})
          </button>
        )}
      </div>

      {/* Una captura a tamaño, sin salir del lienzo ni abrir otro programa. */}
      {grande && (
        <div className="gal-lupa" onClick={() => setGrande(null)}>
          <img src={grande} alt="" />
        </div>
      )}
    </div>
  );
}
