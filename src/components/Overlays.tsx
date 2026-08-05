import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

// Adeorq's own tooltips and right-click menu. The WebView's native ones belong
// to a browser (Back, Reload, Print, "send tab to your devices"...) and native
// title= tooltips are slow, grey and ignore the theme. Both live here so every
// view gets the same behaviour for free.

export interface MenuItem {
  label: string;
  hint?: string;
  /** Un icono dibujado a la izquierda. Antes se pegaba un emoji al principio
      del texto, que es otra cosa: no sigue al tema, cada sistema lo pinta de
      un tamaño y desalinea las filas entre sí. */
  icon?: ReactElement;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  /** Una cabecera: informa, no se pulsa. Sirve para contar de un vistazo lo
      que la fila no cabe (la ruta, cuántas sesiones, cuántas te esperan). */
  heading?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const MenuCtx = createContext<(e: React.MouseEvent, items: MenuItem[]) => void>(
  () => {},
);

/** Opens Adeorq's context menu at the pointer. */
export const useMenu = () => useContext(MenuCtx);

const TIP_DELAY_MS = 320;
const EDGE = 10;

export function Overlays({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuBox, setMenuBox] = useState<{ left: number; top: number } | null>(null);
  // `y` es el borde de abajo del elemento y `yTop` el de arriba: con los dos
  // el tooltip puede volcarse hacia arriba cuando no cabe debajo.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipBox, setTipBox] = useState<{ left: number; top: number } | null>(null);
  // El elemento viaja con el tooltip para poder volver a leerle el texto
  // mientras está abierto: ver el observador de más abajo.
  const [tip, setTip] = useState<
    { x: number; y: number; yTop: number; text: string; el: HTMLElement } | null
  >(null);
  const tipTimer = useRef<number | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Abre el menú. Dónde depende de con qué lo abriste, que es lo que uno
   * espera sin saber que lo espera:
   *
   * - Clic derecho: en el puntero. Es un menú contextual, va donde apuntaste.
   * - Clic en un botón: pegado al botón, por su esquina de abajo a la
   *   izquierda. Un desplegable que sale donde cayó el ratón baila cada vez
   *   que lo abres y a veces tapa el propio botón, que es justo lo que hacía
   *   el «＋ Añadir» del lienzo.
   */
  const showMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setTip(null);
    const boton = e.type !== "contextmenu" ? (e.currentTarget as HTMLElement) : null;
    const r = boton?.getBoundingClientRect();
    setMenu(r ? { x: r.left, y: r.bottom + 6, items } : { x: e.clientX, y: e.clientY, items });
  }, []);

  // The browser menu never appears; a component that wants a menu calls
  // showMenu itself.
  useEffect(() => {
    const block = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", block);
    return () => window.removeEventListener("contextmenu", block);
  }, []);

  // Tooltips: any element carrying data-tip gets one, delayed like a real
  // desktop app and clamped inside the window.
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-tip]");
      window.clearTimeout(tipTimer.current);
      // Con un menú abierto no salen globos. El menú se abre pegado al botón
      // que lo abrió, así que el globo de ESE botón se quedaba flotando encima
      // tapando la primera opción, justo donde vas a pulsar.
      if (menuRef.current) {
        setTip(null);
        return;
      }
      if (!el) {
        setTip(null);
        return;
      }
      const text = el.getAttribute("data-tip") ?? "";
      if (!text) return;
      const r = el.getBoundingClientRect();
      tipTimer.current = window.setTimeout(() => {
        setTip({
          x: r.left + r.width / 2,
          y: r.bottom + 8,
          yTop: r.top - 8,
          text,
          el: el as HTMLElement,
        });
      }, TIP_DELAY_MS);
    };
    const gone = () => {
      window.clearTimeout(tipTimer.current);
      setTip(null);
    };
    window.addEventListener("mouseover", over);
    window.addEventListener("mousedown", gone);
    window.addEventListener("wheel", gone, { passive: true });
    return () => {
      window.removeEventListener("mouseover", over);
      window.removeEventListener("mousedown", gone);
      window.removeEventListener("wheel", gone);
      window.clearTimeout(tipTimer.current);
    };
  }, []);

  // Un tooltip abierto puede quedarse mintiendo, y el que más lo hace es el que
  // más se lee: el del contexto. Su panel vuelve a leer el transcript cada
  // pocos segundos, así que la píldora dice 66% mientras el tooltip, copiado al
  // abrirlo, sigue diciendo 65% y otra cifra de tokens. Son el mismo dato en la
  // misma pantalla, y uno de los dos está mal.
  //
  // Ahora el texto se sigue mirando mientras el tooltip esté abierto. Un
  // observador y no un temporizador: solo despierta cuando el atributo cambia
  // de verdad, y no hay tooltip abierto el 99% del tiempo. La dependencia es el
  // ELEMENTO, no el tip entero, para que refrescar el texto no vuelva a montar
  // el observador cada vez.
  useEffect(() => {
    const el = tip?.el;
    if (!el) return;
    const obs = new MutationObserver(() => {
      const text = el.getAttribute("data-tip") ?? "";
      // Un data-tip vacío no borra lo que se está leyendo: un tooltip que
      // parpadea a vacío se lee peor que uno que se queda quieto.
      setTip((prev) =>
        prev && prev.el === el && text && text !== prev.text ? { ...prev, text } : prev,
      );
    });
    obs.observe(el, { attributes: true, attributeFilter: ["data-tip"] });
    return () => obs.disconnect();
  }, [tip?.el]);

  // El recorte del tooltip se MIDE. Antes eran dos números mágicos (90 de ancho
  // a cada lado, 60 de alto) que daban por hecho un tooltip de 180x60: uno más
  // largo, como "Renombrar, agrupar o archivar", se salía por el borde y caía
  // encima de la fila de al lado. Se pinta primero invisible, se mide y se
  // coloca; son dos frames y no se ve el salto.
  useLayoutEffect(() => {
    if (!tip) {
      setTipBox(null);
      return;
    }
    const el = tipRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const half = width / 2;
    // `left` es el CENTRO, porque la clase lleva translateX(-50%).
    const left =
      window.innerWidth < width + EDGE * 2
        ? window.innerWidth / 2
        : Math.min(Math.max(tip.x, EDGE + half), window.innerWidth - EDGE - half);
    // Debajo del elemento salvo que no quepa; entonces encima, que es lo que
    // hace cualquier app de escritorio.
    const fitsBelow = tip.y + height + EDGE <= window.innerHeight;
    const top = fitsBelow ? tip.y : Math.max(EDGE, tip.yTop - height);
    setTipBox({ left, top });
  }, [tip]);

  // Cerrar al pulsar fuera, EN CAPTURA.
  //
  // Escuchando en burbuja no se enteraba: el lienzo de React Flow para el
  // mousedown en seco (así funciona su arrastre), así que el evento nunca
  // llegaba a `window` y el menú se quedaba abierto por mucho que pulsaras el
  // fondo. En captura el evento pasa por aquí ANTES de que nadie lo pare.
  //
  // Y por eso hay que mirar si el clic cayó dentro del menú: sin esa
  // comprobación, el menú se desmontaría en el mousedown y el `click` de la
  // opción no llegaría nunca a su botón, que es peor que el fallo original.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    // Con el menú delante, el teclado es del menú: cualquier tecla lo cierra y
    // NO llega a lo que hay detrás. Antes solo miraba Escape y las demás
    // pasaban de largo: con el menú abierto, el espacio le activaba a React
    // Flow su modo mover, que enfoca el tablero entero y le saca un recuadro
    // blanco alrededor (visto el 2026-07-28). Un menú abierto que deja pasar
    // teclas a la app de detrás no es lo que hace ningún menú.
    //
    // En captura y cortando del todo (`stopImmediatePropagation`): los atajos
    // del lienzo escuchan en la misma ventana, y sin eso seguirían oyéndola.
    const onKey = (e: KeyboardEvent) => {
      setMenu(null);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  // El menú también se MIDE, y por lo mismo que el tooltip de aquí arriba.
  //
  // Se colocaba dando por hecho 232 px de ancho y 32 px por fila, y un menú
  // real casi nunca mide eso: las cabeceras, los separadores y las filas con
  // atajo a la derecha son más altas o más anchas. El cálculo creía que cabía,
  // no cabía, y en una ventana estrecha el menú se salía por el borde derecho
  // y se veía cortado por la mitad, sin poder leer ni pulsar media opción.
  //
  // Igual que el globo: se pinta invisible en la esquina, se mide y se coloca.
  // Y se mide en la esquina a propósito, porque si se midiera ya pegado al
  // borde el navegador lo estrecharía para que cupiese y estaríamos midiendo
  // una caja ya aplastada.
  useLayoutEffect(() => {
    if (!menu) {
      setMenuBox(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setMenuBox({
      left: Math.max(EDGE, Math.min(menu.x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(menu.y, window.innerHeight - height - EDGE)),
    });
  }, [menu]);

  // Los dos van al `body` por un portal, y no ahí donde caen en el árbol.
  //
  // Un menú y un globo son lo ÚLTIMO que se pinta de una ventana, siempre, y
  // como hermanos del resto de la app eso dependía de que nadie por encima
  // creara una capa propia: bastaba un `transform`, un `filter` o un
  // `backdrop-filter` en cualquier ancestro para que su z-index dejara de
  // competir con la ventana entera y solo compitiera dentro de esa capa. Por
  // eso el menú del clic derecho salía DEBAJO de una terminal, y por eso pasó
  // más de una vez en sitios distintos (Munir, 2026-08-02). Colgados del body
  // no hay ancestro que valga.
  return (
    <MenuCtx.Provider value={showMenu}>
      {children}
      {tip && createPortal(
        <div
          ref={tipRef}
          className="tip"
          style={
            tipBox
              ? { left: tipBox.left, top: tipBox.top }
              : // Primer frame: se mide, no se pinta. Y se mide en la ESQUINA,
                // sin el centrado, porque si se mide en su sitio definitivo y
                // ese sitio está pegado a un borde, el navegador estrecha la
                // caja para que quepa: medías el ancho ya aplastado y el globo
                // se quedaba en una columna alta y estrecha para siempre.
                { left: 0, top: 0, transform: "none", visibility: "hidden" }
          }
        >
          {tip.text.split("\n").map((line, i) => (
            <span key={i} className={i === 0 ? "tip-main" : "tip-sub"}>
              {line}
            </span>
          ))}
        </div>,
        document.body,
      )}
      {menu && createPortal(
        <div
          ref={menuRef}
          className="ctx-menu"
          style={menuBox ?? { left: 0, top: 0, visibility: "hidden" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.items.map((it, i) =>
            it.separator ? (
              <div key={i} className="ctx-sep" />
            ) : it.heading ? (
              <div key={i} className="ctx-head">
                <span>{it.label}</span>
                {it.hint && <span className="ctx-hint">{it.hint}</span>}
              </div>
            ) : (
              <button
                key={i}
                className="ctx-item"
                data-danger={it.danger}
                data-icon={!!it.icon}
                onClick={() => {
                  setMenu(null);
                  it.onClick?.();
                }}
              >
                {it.icon && <span className="ctx-ico">{it.icon}</span>}
                <span className="ctx-label">{it.label}</span>
                {it.hint && <span className="ctx-hint">{it.hint}</span>}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </MenuCtx.Provider>
  );
}
