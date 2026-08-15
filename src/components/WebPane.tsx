// La web que estás construyendo, en un hueco del mosaico.
//
// Existía desde julio en el lienzo (`CanvasWeb.tsx`), que es donde se dibuja y
// se piensa. Munir lo pidió también aquí el 2026-08-15, y tiene todo el
// sentido: el sitio donde el agente escribe el código es donde hace falta ver
// el resultado. El agente toca a la izquierda y la página se recarga a la
// derecha, sin cambiar de ventana ni buscar la pestaña en Brave.
//
// Lo que sabe de webs NO se ha vuelto a escribir: `comoUrl`, `comoEmpotrable` y
// `puedeEmpotrarse` son las mismas de allí, con sus casos ya aprendidos (el
// puerto suelto, los enlaces de YouTube, las páginas que se niegan a entrar en
// un iframe). Aquí solo cambia el marco.
//
// Y una diferencia que se agradece: en el lienzo hacía falta una TAPA sobre la
// página, porque el nodo se arrastra desde cualquier punto y un iframe se queda
// con todo lo que pasa por encima. En el mosaico se arrastra por la cabecera,
// así que la página se usa directamente, sin un clic previo.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { puedeEmpotrarse } from "../lib/pty";
import {
  empotrarNavegador,
  enFisicos,
  moverNavegador,
  soltarNavegador,
  verNavegador,
} from "../lib/navegador";
import { comoUrl } from "./CanvasWeb";
import { BrowserIcon, CloseIcon, ExternalIcon, RefreshIcon, RestoreIcon, MaximizeIcon } from "./Icons";

interface Props {
  id: number;
  url: string;
  focused: boolean;
  hidden: boolean;
  maximized: boolean;
  style: React.CSSProperties;
  onFocusPane: (id: number) => void;
  onClose: (id: number) => void;
  onToggleMax: (id: number) => void;
  onHeaderDown?: (id: number, e: React.PointerEvent) => void;
  /** Guardar la dirección en el panel, para que vuelva al reabrir Adeorq. */
  onUrl: (id: number, url: string) => void;
}

/** Los puertos donde suele estar servido lo que uno acaba de arrancar. Los
    mismos que en el lienzo: si un día cambian, cambian en los dos sitios. */
const PUERTOS = [1420, 5173, 3000, 4321, 8000, 8080];

/** Con qué se pinta la página. Se recuerda porque es una preferencia, no una
    decisión por panel. */
const MODO_KEY = "adeorq-web-modo";
type Modo = "dentro" | "tuyo";

export default function WebPane({
  id,
  url,
  focused,
  hidden,
  maximized,
  style,
  onFocusPane,
  onClose,
  onToggleMax,
  onHeaderDown,
  onUrl,
}: Props) {
  const { t } = useT();
  const [texto, setTexto] = useState(url);
  /** Cambia con cada recarga: es lo que obliga al iframe a volver a pedir. */
  const [vuelta, setVuelta] = useState(0);
  /** Por qué esta página no se puede enseñar aquí, si es que no se puede. Se
      pregunta ANTES de cargarla: un iframe al que le niegan la entrada no avisa
      de nada, se queda en blanco y parece que la app está rota. */
  const [rechaza, setRechaza] = useState<string | null>(null);
  /** El hueco donde va la página. Con tu navegador no se pinta nada dentro: es
      solo la MEDIDA, porque quien pinta ahí es una ventana de Windows puesta
      encima. */
  const hueco = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<Modo>(
    () => (localStorage.getItem(MODO_KEY) as Modo) ?? "dentro",
  );
  const [programa, setPrograma] = useState("");
  const [fallo, setFallo] = useState("");
  /** Dónde estaba la última vez, para no pedirle a Windows que mueva la ventana
      a donde ya está sesenta veces por segundo. */
  const ultima = useRef("");

  useEffect(() => {
    setTexto(url);
  }, [url]);

  /* ── Tu navegador, metido dentro ─────────────────────────────────────────
     Es una ventana de verdad puesta sobre el hueco, así que TODO lo que aquí
     es CSS allí es Win32: colocarla, taparla y soltarla. Y por eso se pinta
     siempre por encima del resto de la app: un menú de Adeorq que caiga sobre
     ella queda debajo. Es el precio de que sea tu navegador con tus
     extensiones y tus sesiones, y no un motor web pelado. */

  const colocar = useCallback(() => {
    if (modo !== "tuyo" || !hueco.current) return;
    const caja = enFisicos(hueco.current.getBoundingClientRect());
    const firma = `${caja.x},${caja.y},${caja.ancho},${caja.alto}`;
    if (firma === ultima.current) return;
    ultima.current = firma;
    void moverNavegador(id, caja).catch(() => {});
  }, [id, modo]);

  useEffect(() => {
    if (modo !== "tuyo" || !url || !hueco.current) return;
    let vivo = true;
    setFallo("");
    ultima.current = "";
    const caja = enFisicos(hueco.current.getBoundingClientRect());
    void empotrarNavegador(id, url, caja)
      .then((r) => vivo && setPrograma(r.programa))
      .catch((e) => vivo && setFallo(String(e)));
    return () => {
      vivo = false;
      void soltarNavegador(id).catch(() => {});
    };
  }, [id, url, modo]);

  /* Cada pintado se comprueba dónde ha quedado el hueco. Suena a bruto y no lo
     es: el panel solo se repinta cuando algo suyo cambia (lo mueves, lo
     estiras, se maximiza otro), que es exactamente cuando hay que mover la
     ventana. Un observador de tamaño no valdría solo, porque mover el panel
     por el mosaico le cambia el sitio sin cambiarle las medidas. */
  useLayoutEffect(colocar);

  useEffect(() => {
    if (modo !== "tuyo") return;
    const ro = new ResizeObserver(colocar);
    if (hueco.current) ro.observe(hueco.current);
    window.addEventListener("resize", colocar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", colocar);
    };
  }, [colocar, modo]);

  /* Escondida con el panel. Una ventana de Windows no sabe nada del CSS que la
     tapa: si no se le dice, se queda flotando sobre la app cuando otro panel se
     pone a pantalla completa. */
  useEffect(() => {
    if (modo !== "tuyo") return;
    void verNavegador(id, !hidden).catch(() => {});
  }, [id, hidden, modo]);

  const cambiarModo = (m: Modo) => {
    localStorage.setItem(MODO_KEY, m);
    setModo(m);
  };

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    setRechaza(null);
    puedeEmpotrarse(url)
      .catch((e) => vivo && setRechaza(String(e)))
      .then(() => {});
    return () => {
      vivo = false;
    };
  }, [url, vuelta]);

  const ir = (destino: string) => {
    const limpia = comoUrl(destino);
    if (!limpia) return;
    setTexto(limpia);
    onUrl(id, limpia);
    setVuelta((n) => n + 1);
  };

  return (
    <section
      className="pane pane-web"
      data-focused={focused}
      style={hidden ? { ...style, visibility: "hidden", pointerEvents: "none" } : style}
      onMouseDown={() => onFocusPane(id)}
    >
      <header
        className="pane-head"
        data-movable={!!onHeaderDown}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
          onHeaderDown?.(id, e);
        }}
      >
        <div className="ph-id">
          <input
            className="web-url"
            value={texto}
            spellCheck={false}
            placeholder="localhost:1420"
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ir(e.currentTarget.value);
              if (e.key === "Escape") setTexto(url);
              e.stopPropagation();
            }}
          />
        </div>
        <div className="ph-acts">
          {/* Con qué se pinta la página. No es un ajuste escondido porque las
              dos formas son distintas de verdad: la de dentro se porta como
              parte de la app, y la tuya trae tus extensiones y tus sesiones
              pero se pinta ENCIMA de todo lo demás. */}
          <button
            className="mini"
            data-on={modo === "tuyo"}
            data-tip={
              modo === "tuyo"
                ? t("Estás viendo tu navegador. Pulsa para volver al de dentro.")
                : t("Abrirla en TU navegador, aquí dentro (con tus extensiones y tus sesiones)")
            }
            onClick={() => cambiarModo(modo === "tuyo" ? "dentro" : "tuyo")}
          >
            <BrowserIcon size={13} />
          </button>
          <button className="mini" data-tip={t("Recargar")} onClick={() => setVuelta((n) => n + 1)}>
            <RefreshIcon size={13} />
          </button>
          <button
            className="mini"
            data-tip={t("Abrirla en tu navegador de verdad")}
            onClick={() => void openUrl(url).catch(() => {})}
          >
            <ExternalIcon size={13} />
          </button>
          <button
            className="mini"
            data-tip={maximized ? t("Restaurar") : t("Maximizar")}
            onClick={() => onToggleMax(id)}
          >
            {maximized ? <RestoreIcon size={13} /> : <MaximizeIcon size={13} />}
          </button>
          <button className="mini" data-tip={t("Cerrar")} onClick={() => onClose(id)}>
            <CloseIcon size={13} />
          </button>
        </div>
      </header>

      <div className="web-bar">
        {PUERTOS.map((p) => (
          <button
            key={p}
            className="web-port"
            data-on={url === `http://localhost:${p}`}
            onClick={() => ir(String(p))}
          >
            {p}
          </button>
        ))}
      </div>

      {/* CON TU NAVEGADOR: aquí no se pinta nada. Este hueco solo existe para
          medir dónde hay que poner la ventana de verdad. */}
      {modo === "tuyo" ? (
        <div className="web-body web-tuyo" ref={hueco}>
          {fallo ? (
            <div className="web-nope">
              <p className="web-nope-tit">{t("No se pudo meter tu navegador aquí")}</p>
              <p className="web-nope-txt">{fallo}</p>
              <button className="np-btn" onClick={() => cambiarModo("dentro")}>
                {t("Usar el de dentro")}
              </button>
            </div>
          ) : !programa ? (
            <p className="web-vacio">{t("Abriendo tu navegador…")}</p>
          ) : null}
        </div>
      ) : (
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
            <button className="np-btn" onClick={() => void openUrl(url).catch(() => {})}>
              {t("Abrirla en tu navegador")}
            </button>
          </div>
        ) : url ? (
          <iframe key={`${url}#${vuelta}`} className="web-frame" src={url} title={url} />
        ) : (
          <p className="web-vacio">
            {t("Escribe arriba un puerto o una dirección, o toca uno de los de abajo.")}
          </p>
        )}
      </div>
      )}
    </section>
  );
}
