// La web que estás construyendo, en un hueco del mosaico.
//
// Existía desde julio en el lienzo (`CanvasWeb.tsx`), que es donde se dibuja y
// se piensa. Munir lo pidió también aquí el 2026-08-15, y tiene todo el
// sentido: el sitio donde el agente escribe el código es donde hace falta ver
// el resultado. El agente toca a la izquierda y la página se recarga a la
// derecha, sin cambiar de ventana ni buscar la pestaña en Brave.
//
// El 2026-08-17 ganó pestañas y botones de atrás y adelante, pedidos con una
// captura de un navegador de verdad. Las pestañas van SIEMPRE a la vista,
// aunque haya una sola, al revés que en el editor: aquí la fila lleva el
// título y el icono del sitio, que la cabecera no enseña (lleva la dirección
// editable), y es donde vive el botón de abrir otra.
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
  cerrarNavegador,
  empotrarNavegador,
  enFisicos,
  moverNavegador,
  verNavegador,
} from "../lib/navegador";
import { comoUrl } from "./CanvasWeb";
import {
  BrowserIcon,
  ChevronIcon,
  CloseIcon,
  ExternalIcon,
  PlusIcon,
  RefreshIcon,
  RestoreIcon,
  MaximizeIcon,
  PicarIcon,
} from "./Icons";
import EditorWeb from "./EditorWeb";

interface Props {
  id: number;
  /** Las direcciones abiertas, una por pestaña, y cuál se está viendo. Solo
      son el ARRANQUE: el panel las hace suyas al montarse y a partir de ahí
      manda él, avisando por `onEstado` para que sobrevivan al reinicio. */
  tabs: string[];
  activa: number;
  focused: boolean;
  hidden: boolean;
  maximized: boolean;
  style: React.CSSProperties;
  onFocusPane: (id: number) => void;
  onClose: (id: number) => void;
  onToggleMax: (id: number) => void;
  onHeaderDown?: (id: number, e: React.PointerEvent) => void;
  /** Guardar las pestañas en el panel, para que vuelvan al reabrir Adeorq. */
  onEstado: (id: number, tabs: string[], activa: number) => void;
  /**
   * Una dirección que llega de fuera con el panel ya abierto.
   *
   * Existe para lo que pidió Munir el 2026-08-24: que al levantar un servidor
   * en una terminal, la web se abra sola. Y va con SELLO en vez de solo la
   * dirección por un motivo concreto: si el mismo servidor vuelve a anunciarse
   * (recargas, reinicios), la dirección es idéntica y sin el sello React no
   * vería ningún cambio; y al revés, un pintado cualquiera no puede reabrirla,
   * porque el sello no ha cambiado.
   *
   * Las `tabs` de arriba NO valen para esto: son el arranque, y este panel se
   * hace dueño de sus pestañas en cuanto se monta.
   */
  pedida?: { url: string; sello: number };
  /** Dejar un encargo escrito en la terminal que tengas delante. Lo usa el
      editor por clic para mandarle al agente el elemento que has señalado. */
  onAlAgente?: (texto: string) => boolean;
}

/** Una pestaña por dentro. La pila es el historial de atrás y adelante, y es
    el de las direcciones dadas DESDE Adeorq (la barra, los puertos, otra
    pestaña): lo que la página navegue por dentro no se puede leer desde fuera
    de un iframe de otro origen, así que prometer más sería mentir. */
interface Pest {
  url: string;
  pila: string[];
  pos: number;
  /** Cambia con cada recarga: es lo que obliga al iframe a volver a pedir. */
  vuelta: number;
}

const dePestana = (u: string): Pest => ({
  url: u,
  pila: u ? [u] : [],
  pos: u ? 0 : -1,
  vuelta: 0,
});

/** Los puertos donde suele estar servido lo que uno acaba de arrancar. Los
    mismos que en el lienzo: si un día cambian, cambian en los dos sitios. */
const PUERTOS = [1420, 5173, 3000, 4321, 8000, 8080];

/** Con qué se pinta la página. Se recuerda porque es una preferencia, no una
    decisión por panel. */
const MODO_KEY = "adeorq-web-modo";
type Modo = "dentro" | "tuyo";

function origenDe(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** El icono del sitio, pedido a su ruta de siempre (`/favicon.ico`). Si no lo
    tiene, el globo de la casa: mejor un dibujo estable que un hueco roto. */
function Favicon({ url }: { url: string }) {
  const [roto, setRoto] = useState(false);
  const origen = origenDe(url);
  useEffect(() => setRoto(false), [origen]);
  if (!origen || roto) return <BrowserIcon size={12} />;
  return (
    <img
      className="web-pest-ico"
      src={`${origen}/favicon.ico`}
      alt=""
      onError={() => setRoto(true)}
    />
  );
}

export default function WebPane({
  id,
  tabs,
  activa,
  focused,
  hidden,
  maximized,
  style,
  onFocusPane,
  onClose,
  onToggleMax,
  onHeaderDown,
  onEstado,
  pedida,
  onAlAgente,
}: Props) {
  const { t } = useT();
  /** Las pestañas viven aquí; App solo guarda la foto para el reinicio. */
  const [pests, setPests] = useState<Pest[]>(() =>
    (tabs.length ? tabs : [""]).map(dePestana),
  );
  const [act, setAct] = useState(() => Math.max(0, Math.min(activa, tabs.length - 1)));
  const pest = pests[act];
  const urlAct = pest?.url ?? "";
  const [texto, setTexto] = useState(urlAct);
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
  /** El editor por clic. Solo con la página pintada aquí dentro: sobre tu
      navegador no hay forma de hablarle, que es una ventana de otro proceso. */
  const [editor, setEditor] = useState(false);
  /** El cuerpo, para poder dar con el iframe de la pestaña que se está viendo
      sin ponerle un `ref` a cada uno y provocar un pintado en cadena. */
  const cuerpo = useRef<HTMLDivElement>(null);
  const [marcoAct, setMarcoAct] = useState<HTMLIFrameElement | null>(null);
  /** Dónde estaba la última vez, para no pedirle a Windows que mueva la ventana
      a donde ya está sesenta veces por segundo. */
  const ultima = useRef("");

  // Cada cambio sube a App tal cual. `onEstado` es estable (useCallback allí):
  // si no lo fuera, este efecto se dispararía en cada pintado de App y los dos
  // se retroalimentarían sin parar.
  useEffect(() => {
    onEstado(
      id,
      pests.map((p) => p.url),
      act,
    );
  }, [id, pests, act, onEstado]);

  useEffect(() => {
    setTexto(urlAct);
  }, [act, urlAct]);

  /** Tocar solo la pestaña activa, que es la única que se navega. */
  const cambia = useCallback(
    (f: (p: Pest) => Pest) =>
      setPests((prev) => prev.map((p, i) => (i === act ? f(p) : p))),
    [act],
  );

  const ir = (destino: string) => {
    const limpia = comoUrl(destino);
    if (!limpia) return;
    setTexto(limpia);
    cambia((p) =>
      p.url === limpia
        ? { ...p, vuelta: p.vuelta + 1 }
        : { ...p, url: limpia, pila: [...p.pila.slice(0, p.pos + 1), limpia], pos: p.pos + 1 },
    );
  };

  const atras = () =>
    cambia((p) => (p.pos > 0 ? { ...p, pos: p.pos - 1, url: p.pila[p.pos - 1] } : p));
  const adelante = () =>
    cambia((p) =>
      p.pos < p.pila.length - 1 ? { ...p, pos: p.pos + 1, url: p.pila[p.pos + 1] } : p,
    );
  const recargar = () => cambia((p) => ({ ...p, vuelta: p.vuelta + 1 }));

  const nueva = () => {
    setPests((prev) => [...prev, dePestana("")]);
    setAct(pests.length);
  };

  /* Una dirección que llega de fuera (una terminal acaba de levantar algo).
     Va a una pestaña NUEVA salvo que la activa esté en blanco, que es el caso
     de acabar de abrir el panel: ahí meterla en una pestaña aparte dejaría una
     vacía al lado sin motivo. Y si ese servidor ya tiene su pestaña, se salta a
     ella en vez de duplicarla. */
  const selloRef = useRef(0);
  useEffect(() => {
    if (!pedida || pedida.sello === selloRef.current) return;
    selloRef.current = pedida.sello;
    const url = comoUrl(pedida.url);
    if (!url) return;
    setPests((prev) => {
      const ya = prev.findIndex((p) => p.url === url);
      if (ya >= 0) {
        setAct(ya);
        return prev;
      }
      const enBlanco = prev.findIndex((p) => !p.url);
      if (enBlanco >= 0) {
        setAct(enBlanco);
        return prev.map((p, i) => (i === enBlanco ? dePestana(url) : p));
      }
      setAct(prev.length);
      return [...prev, dePestana(url)];
    });
  }, [pedida]);

  const cerrar = (i: number) => {
    // La última pestaña cierra el panel: un navegador sin nada abierto no es
    // un estado, es un hueco muerto ocupando el mosaico.
    if (pests.length <= 1) {
      onClose(id);
      return;
    }
    setPests((prev) => prev.filter((_, j) => j !== i));
    setAct((a) => (i < a ? a - 1 : Math.min(a, pests.length - 2)));
  };

  const etiqueta = (url: string) => {
    if (!url) return t("Nueva pestaña");
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

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
    if (modo !== "tuyo" || !urlAct || !hueco.current) return;
    let vivo = true;
    setFallo("");
    ultima.current = "";
    const caja = enFisicos(hueco.current.getBoundingClientRect());
    void empotrarNavegador(id, urlAct, caja)
      .then((r) => vivo && setPrograma(r.programa))
      .catch((e) => vivo && setFallo(String(e)));
    /* Al irse el panel, o al cambiar de dirección, la ventana de antes se
       CIERRA. Soltarla la devolvía al escritorio, así que cerrar la pestaña
       hacía aparecer una ventana de navegador en vez de quitarla, y como este
       efecto también se rehace al navegar, cada dirección nueva dejaba la
       anterior tirada por ahí. */
    return () => {
      vivo = false;
      void cerrarNavegador(id).catch(() => {});
    };
  }, [id, urlAct, modo]);

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

  /* Cuál es el iframe que se está viendo, que es con quien habla el editor.
     Se busca en el DOM en cada pintado en vez de ponerle un `ref` a cada
     pestaña: un `ref` inline se vuelve a crear en cada render y dispararía
     otro pintado, y aquí hay uno por pestaña. Poner el MISMO elemento en el
     estado no repinta, así que esto se para solo. */
  useLayoutEffect(() => {
    if (!editor) return;
    const marcos = cuerpo.current?.querySelectorAll("iframe");
    setMarcoAct((marcos?.[act] as HTMLIFrameElement | undefined) ?? null);
  });

  // Se comprueba la pestaña ACTIVA, que es la que se ve: cambiar de pestaña o
  // de dirección vuelve a preguntar.
  useEffect(() => {
    if (!urlAct) return;
    let vivo = true;
    setRechaza(null);
    puedeEmpotrarse(urlAct)
      .catch((e) => vivo && setRechaza(String(e)))
      .then(() => {});
    return () => {
      vivo = false;
    };
  }, [urlAct, pest?.vuelta]);

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
          {/* Atrás, adelante y recargar, a la izquierda de la dirección: es el
              orden de cualquier navegador y el que la mano ya conoce. */}
          <button
            className="mini"
            data-tip={t("Atrás")}
            disabled={!pest || pest.pos <= 0}
            onClick={atras}
          >
            <ChevronIcon size={13} izq />
          </button>
          <button
            className="mini"
            data-tip={t("Adelante")}
            disabled={!pest || pest.pos >= pest.pila.length - 1}
            onClick={adelante}
          >
            <ChevronIcon size={13} der />
          </button>
          <button className="mini" data-tip={t("Recargar")} onClick={recargar}>
            <RefreshIcon size={13} />
          </button>
          <input
            className="web-url"
            value={texto}
            spellCheck={false}
            placeholder="localhost:1420"
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ir(e.currentTarget.value);
              if (e.key === "Escape") setTexto(urlAct);
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
          {/* Editar por clic. Solo con la página pintada aquí dentro: sobre tu
              navegador es una ventana de otro proceso y no hay forma de
              hablarle, así que el botón ni aparece. */}
          {modo === "dentro" && (
            <button
              className="mini"
              data-on={editor}
              data-tip={
                editor
                  ? t("Salir del editor")
                  : t("Editar esta página haciendo clic, y guardarlo en el código")
              }
              onClick={() => setEditor((e) => !e)}
            >
              <PicarIcon size={13} />
            </button>
          )}
          <button
            className="mini"
            data-tip={t("Abrirla en tu navegador de verdad")}
            onClick={() => void openUrl(urlAct).catch(() => {})}
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

      {/* Las pestañas, con la misma ropa que las del editor (`.ed-pest`): dos
          filas de pestañas con dos estilos serían dos apps. El botón central
          del ratón cierra, como en el navegador. */}
      <div className="ed-pestanas web-pestanas">
        {pests.map((p, i) => (
          <div
            key={i}
            className="ed-pest"
            data-on={i === act}
            title={p.url || undefined}
            onClick={() => setAct(i)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                cerrar(i);
              }
            }}
          >
            <Favicon url={p.url} />
            <span className="ed-pest-nom">{etiqueta(p.url)}</span>
            <button
              className="ed-pest-x"
              data-tip={t("Cerrar")}
              onClick={(e) => {
                e.stopPropagation();
                cerrar(i);
              }}
            >
              <CloseIcon size={10} />
            </button>
          </div>
        ))}
        <button className="web-pest-mas" data-tip={t("Abrir otra pestaña")} onClick={nueva}>
          <PlusIcon size={13} />
        </button>
      </div>

      <div className="web-bar">
        {PUERTOS.map((p) => (
          <button
            key={p}
            className="web-port"
            data-on={urlAct === `http://localhost:${p}`}
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
      <div className="web-coneditor">
        {editor && (
          <EditorWeb
            marco={marcoAct}
            sello={pest?.vuelta ?? 0}
            url={urlAct}
            onAlAgente={(texto) => onAlAgente?.(texto) ?? false}
          />
        )}
      <div className="web-body" ref={cuerpo}>
        {rechaza ? (
          <div className="web-nope">
            <p className="web-nope-tit">{t("Esta página no se deja abrir aquí dentro")}</p>
            <p className="web-nope-txt">{rechaza}</p>
            <p className="web-nope-txt">
              {t(
                "No es cosa de Adeorq: lo decide la propia web con una cabecera, y ningún navegador se la salta. Ábrela fuera y sigue aquí con lo demás.",
              )}
            </p>
            <button className="np-btn" onClick={() => void openUrl(urlAct).catch(() => {})}>
              {t("Abrirla en tu navegador")}
            </button>
          </div>
        ) : !urlAct ? (
          <p className="web-vacio">
            {t("Escribe arriba un puerto o una dirección, o toca uno de los de abajo.")}
          </p>
        ) : null}
        {/* TODAS montadas y solo se ve la activa, como las hojas del editor:
            cambiar de pestaña no recarga la página ni pierde lo que tuviera. */}
        {pests.map((p, i) =>
          p.url ? (
            <iframe
              key={`${i}:${p.url}#${p.vuelta}`}
              className="web-frame"
              style={
                i === act && !rechaza
                  ? undefined
                  : { visibility: "hidden", pointerEvents: "none" }
              }
              src={p.url}
              title={p.url}
            />
          ) : null,
        )}
      </div>
      </div>
      )}
    </section>
  );
}
