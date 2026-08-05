// Una fila de botones que se puede quedar sin sitio.
//
// La fila de un proyecto tenía cuatro botones fijos y ahora lleva los que TÚ
// elijas en Cuentas, que pueden ser nueve, más uno por cada cuenta extra. En
// 300px de barra lateral eso no cabe, y lo que hacía antes era `overflow:
// hidden`: los últimos botones simplemente no existían, sin barra, sin
// desvanecido y sin nada que dijera que estaban ahí.
//
// Se puede mover de TRES maneras, y son tres porque la primera versión solo
// tenía la rueda y la barrita de abajo era un adorno que no se podía agarrar
// (Munir, 2026-07-30):
//
//   · las flechas de los lados, que aparecen solo del lado que esconde algo;
//   · arrastrando el pulgar de abajo, como cualquier barra de desplazamiento;
//   · la rueda del ratón, si el puntero está encima.
//
// Tres decisiones que no son obvias:
//
//   · La barra del sistema se esconde y se pinta una propia. Una barra nativa
//     de Chromium mide 15px de alto y la fila entera mide 28: se comería media
//     fila, y si se la deja en `overlay` aparece y desaparece cambiando la
//     altura al pasar el ratón, que es justo el salto que marea.
//   · El desvanecido de los extremos solo se enciende del lado donde de verdad
//     queda algo oculto. Un degradado permanente en los dos bordes apagaría el
//     primer y el último botón siempre, incluso cuando caben todos.
//   · La rueda del ratón mueve la fila SOLO si la fila desborda. Si no, se deja
//     pasar para que siga desplazando la lista de proyectos, que es lo que
//     espera cualquiera con el ratón encima de la barra lateral.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../lib/i18n";

interface Props {
  className?: string;
  children: ReactNode;
}

/** Cuánto se mueve un clic de flecha: casi un ancho, dejando un botón a la
    vista para no perder el hilo de dónde estabas. */
const SALTO = 0.8;

export default function FilaBotones({ className, children }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const pistaRef = useRef<HTMLSpanElement>(null);
  /** Cuánto queda oculto a cada lado, en píxeles, y dónde va el pulgar. */
  const [izq, setIzq] = useState(0);
  const [der, setDer] = useState(0);
  const [pulgar, setPulgar] = useState({ w: 0, x: 0 });
  const [llevando, setLlevando] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const sobra = el.scrollWidth - el.clientWidth;
    // Un píxel de margen: los anchos fraccionarios del layout dejan sobras de
    // 0.5px que encenderían el desvanecido en una fila que cabe entera.
    const x = sobra > 1 ? el.scrollLeft : 0;
    setIzq(x);
    setDer(sobra > 1 ? sobra - x : 0);
    // Devolver el mismo objeto cuando no ha cambiado nada es lo que evita un
    // render por cada aviso de los observadores, que llegan a rachas.
    if (sobra > 1) {
      const pista = pistaRef.current?.clientWidth ?? el.clientWidth;
      const w = Math.max(24, (el.clientWidth / el.scrollWidth) * pista);
      const px = (x / sobra) * (pista - w);
      setPulgar((p) => (p.w === w && p.x === px ? p : { w, x: px }));
    } else {
      setPulgar((p) => (p.w === 0 ? p : { w: 0, x: 0 }));
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    // Dos cosas distintas mueven esto y ninguna avisa sola:
    //   · el hueco, al arrastrar el ancho de la barra lateral o al pasar la
    //     fila de escondida a visible, que es lo que hace el hover;
    //   · el contenido, al aparecer o desaparecer botones (las cuentas extra
    //     solo salen con el ratón encima) o al cambiarles el texto.
    // El segundo va con MutationObserver y no metiendo `children` en las
    // dependencias: `children` es un array nuevo en cada render, así que eso
    // desconectaba y reconectaba los observadores de cada proyecto de la lista
    // cada vez que la barra se pintaba por cualquier otro motivo.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    const mo = new MutationObserver(medir);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [medir]);

  const rueda = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || el.scrollWidth - el.clientWidth <= 1) return;
    // Sin deltaX propio (ratón normal), la rueda vertical mueve la fila. Con
    // trackpad el gesto horizontal ya llega como deltaX y se deja en paz.
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const antes = el.scrollLeft;
    el.scrollLeft += e.deltaY;
    // Solo se queda el evento si de verdad lo ha usado: al llegar al final la
    // rueda vuelve a ser de la lista, en vez de morir contra el borde.
    if (el.scrollLeft !== antes) e.preventDefault();
  };

  /** Una flecha: un salto suave hacia ese lado. */
  const saltar = (lado: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: lado * el.clientWidth * SALTO, behavior: "smooth" });
  };

  /** Arrastrar el pulgar. Se captura el puntero para que siga respondiendo
      aunque el ratón se salga de la fila, que en una barra de 4px de alto pasa
      en cuanto la mueves. */
  const agarrar = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    const pista = pistaRef.current;
    if (!el || !pista) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setLlevando(true);
    const x0 = e.clientX;
    const scroll0 = el.scrollLeft;
    const sobra = el.scrollWidth - el.clientWidth;
    const recorrido = pista.clientWidth - pulgar.w;
    const mover = (ev: PointerEvent) => {
      // Regla de tres entre lo que recorre el pulgar y lo que recorre la fila.
      if (recorrido > 0) el.scrollLeft = scroll0 + ((ev.clientX - x0) / recorrido) * sobra;
    };
    const soltar = () => {
      setLlevando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  };

  /** Pinchar la pista: la fila salta a ese punto, como en cualquier barra. */
  const irAhi = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    const pista = pistaRef.current;
    if (!el || !pista || e.target !== pista) return;
    const caja = pista.getBoundingClientRect();
    const sobra = el.scrollWidth - el.clientWidth;
    const dentro = (e.clientX - caja.left - pulgar.w / 2) / Math.max(1, caja.width - pulgar.w);
    el.scrollTo({ left: Math.max(0, Math.min(1, dentro)) * sobra, behavior: "smooth" });
  };

  const desborda = izq > 1 || der > 1;

  return (
    // El envoltorio lleva la clase de fuera y es el que posiciona: las flechas y
    // la barra van ENCIMA de la fila, no dentro. Dentro se irían con el scroll,
    // que es justo lo que no puede hacer una barra de desplazamiento.
    <div className={className ? `fila-caja ${className}` : "fila-caja"}>
      <div
        ref={ref}
        className="fila-btns"
        data-izq={izq > 1 || undefined}
        data-der={der > 1 || undefined}
        onScroll={medir}
        onWheel={rueda}
      >
        {children}
      </div>

      {izq > 1 && (
        <button
          className="fila-flecha"
          data-lado="izq"
          aria-label={t("Ver los de la izquierda")}
          onClick={() => saltar(-1)}
        >
          ‹
        </button>
      )}
      {der > 1 && (
        <button
          className="fila-flecha"
          data-lado="der"
          aria-label={t("Ver los de la derecha")}
          onClick={() => saltar(1)}
        >
          ›
        </button>
      )}

      {desborda && (
        <span className="fila-pista" ref={pistaRef} onPointerDown={irAhi}>
          <span
            className="fila-pulgar"
            data-llevando={llevando || undefined}
            style={{ width: pulgar.w, transform: `translateX(${pulgar.x}px)` }}
            onPointerDown={agarrar}
          />
        </span>
      )}
    </div>
  );
}
