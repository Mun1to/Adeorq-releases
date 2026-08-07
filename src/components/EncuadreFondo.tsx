import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { comoFuente, esVideo } from "../lib/fondo";
import {
  ENCUADRE_DEFECTO,
  ZOOM_MAX,
  ZOOM_MIN,
  acercar,
  alTope,
  arrastrar,
  esDefecto,
  estiloDe,
  rueda,
  type Encuadre,
} from "../lib/encuadre";
import { MinusIcon, PlusIcon } from "./Icons";

// El editor del encuadre: una ventana de Adeorq en pequeño con la foto dentro.
//
// Dos decisiones que sostienen todo lo demás:
//
//   · La miniatura tiene la PROPORCIÓN EXACTA de la ventana de verdad, no un
//     cuadrado. Un cuadrado enseñaría un recorte que no es el que va a quedar,
//     y entonces la vista previa mentiría, que es peor que no tenerla. Por eso
//     se mide `window.innerWidth/innerHeight` y se sigue midiendo al cambiar
//     el tamaño de la ventana.
//   · La foto de dentro se pinta con la MISMA función que la capa del fondo
//     (`estiloDe`), con los mismos números. Si se escribiera dos veces, se
//     separarían al primer arreglo.
//
// El arrastre va por punteros y no por el arrastre nativo del navegador: Tauri
// se queda los eventos de `dragstart` antes de que el WebView los vea, así que
// aquí eso no existe. `setPointerCapture` además sigue al ratón aunque se
// salga de la miniatura, que es justo lo que se hace al encuadrar.

interface Props {
  path: string;
  sello: number;
  desenfoque: number;
  encuadre: Encuadre;
  onEncuadre: (e: Encuadre) => void;
}

export default function EncuadreFondo({ path, sello, desenfoque, encuadre, onEncuadre }: Props) {
  const { t } = useT();
  const caja = useRef<HTMLDivElement | null>(null);
  const anterior = useRef<{ x: number; y: number } | null>(null);
  /** La forma de la ventana de verdad, para que la miniatura no mienta. */
  const [forma, setForma] = useState(() => window.innerWidth / window.innerHeight);

  useEffect(() => {
    const medir = () => setForma(window.innerWidth / window.innerHeight);
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  /**
   * La rueda se pone A MANO, y no con el `onWheel` de React, porque React monta
   * los suyos en la raíz como PASIVOS: dentro de uno, `preventDefault` no hace
   * nada (el navegador ni siquiera lo intenta, solo avisa por consola). El
   * resultado era que girar la rueda para acercar la foto acercaba la foto Y
   * además bajaba la pestaña de Ajustes entera, así que perdías de vista lo que
   * estabas encuadrando. Con `passive: false` el gesto se queda aquí.
   */
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const alGirar = (e: WheelEvent) => {
      e.preventDefault();
      onEncuadre(rueda(encuadre, e.deltaY));
    };
    el.addEventListener("wheel", alGirar, { passive: false });
    return () => el.removeEventListener("wheel", alGirar);
  }, [encuadre, onEncuadre]);

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    anterior.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const desde = anterior.current;
      if (!desde || !caja.current) return;
      const r = caja.current.getBoundingClientRect();
      onEncuadre(arrastrar(encuadre, e.clientX - desde.x, e.clientY - desde.y, r.width, r.height));
      anterior.current = { x: e.clientX, y: e.clientY };
    },
    [encuadre, onEncuadre],
  );

  const soltar = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    anterior.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const src = comoFuente(path, sello);
  // El desenfoque NO se aplica en la miniatura: a este tamaño 12 px de blur se
  // comen la foto entera y no se ve qué se está encuadrando. La escala sí lleva
  // su cuenta, así que el recorte que se ve es el que va a quedar.
  const style = estiloDe(encuadre, desenfoque);

  return (
    <div className="enc">
      <div
        ref={caja}
        className="enc-caja"
        style={{ aspectRatio: String(forma) }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        title={t("Arrastra para mover la foto. La rueda acerca y aleja.")}
      >
        {esVideo(path) ? (
          <video className="enc-medio" src={src} autoPlay loop muted playsInline style={style} />
        ) : (
          <img className="enc-medio" src={src} alt="" draggable={false} style={style} />
        )}
      </div>
      <p className="enc-pie">{t("Así se va a ver. Arrastra la foto y usa la rueda para acercarla.")}</p>
      <div className="enc-btns">
        <button
          className={`mini${encuadre.modo === "rellenar" ? " on" : ""}`}
          onClick={() => onEncuadre({ ...encuadre, modo: "rellenar" })}
        >
          {t("Rellenar")}
        </button>
        <button
          className={`mini${encuadre.modo === "entera" ? " on" : ""}`}
          onClick={() => onEncuadre({ ...encuadre, modo: "entera" })}
        >
          {t("Entera")}
        </button>
        <button className="mini" onClick={() => onEncuadre({ ...encuadre, x: 50, y: 50 })}>
          {t("Centrar")}
        </button>
        {!esDefecto(encuadre) && (
          <button className="mini" onClick={() => onEncuadre({ ...ENCUADRE_DEFECTO })}>
            {t("Como estaba")}
          </button>
        )}
      </div>
      {/* Los dos botones flanquean el deslizador en vez de flotar sobre la foto:
          ahí taparían justo lo que se está encuadrando, y además este es el
          sitio donde ya vive la idea de «zoom», con su porcentaje al lado. Dan
          el mismo paso que una muesca de rueda, así que el clic y la rueda no
          se mueven a dos velocidades distintas. */}
      {/* Un div y no un `label` como sus vecinas: un label con botones dentro
          les roba el clic para dárselo a su control, así que el más y el menos
          moverían el foco al deslizador en vez de hacer su trabajo. */}
      <div className="setting-row enc-zoom">
        <span>{t("Acercar")}</span>
        <button
          className="mini"
          disabled={alTope(encuadre, -1)}
          onClick={() => onEncuadre(acercar(encuadre, -1))}
          title={t("Alejar")}
          aria-label={t("Alejar")}
        >
          <MinusIcon size={15} />
        </button>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          value={encuadre.zoom}
          onChange={(e) => onEncuadre({ ...encuadre, zoom: Number(e.currentTarget.value) })}
        />
        <button
          className="mini"
          disabled={alTope(encuadre, 1)}
          onClick={() => onEncuadre(acercar(encuadre, 1))}
          title={t("Acercar")}
          aria-label={t("Acercar")}
        >
          <PlusIcon size={15} />
        </button>
        <span className="setting-value">{encuadre.zoom}%</span>
      </div>
    </div>
  );
}
