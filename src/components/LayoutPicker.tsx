import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  columnasPara,
  equilibrada,
  MAX_COLS,
  MAX_FILAS,
  rejilla,
  unaGrande,
  type Preset,
} from "../lib/layout";
import { useT } from "../lib/i18n";

// Repartir lo que tienes abierto: una rejilla de columnas y filas, como al
// insertar una tabla, y debajo la de una grande con el resto al lado. Era una
// lista de doce dibujos sueltos que se acababa en nueve terminales y tenía
// varios que se leían igual; Munir eligió esta entre tres caminos el
// 2026-10-30. Lo que no cabe o sobra lo arregla `applyPreset`, así que
// cualquier casilla vale para cualquier número de terminales.

/** Las casillas, fila a fila, para pintarlas en orden en la rejilla. */
const CASILLAS = Array.from({ length: MAX_FILAS }, (_, r) =>
  Array.from({ length: MAX_COLS }, (_, c) => ({ c: c + 1, r: r + 1 })),
).flat();

/** El botón de la cabecera: una grande y dos al lado, del trazo de los demás. */
function RepartirIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M11 4.5v15M11 12h9.5" />
    </svg>
  );
}

function Thumb({ preset }: { preset: Preset }) {
  const total = preset.rows.reduce(
    (a, _, i) => a + (preset.weights?.[i] ?? 1),
    0,
  );
  let x = 0;
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  preset.rows.forEach((rows, i) => {
    const w = (preset.weights?.[i] ?? 1) / total;
    for (let r = 0; r < rows; r++) {
      boxes.push({ x, y: r / rows, w, h: 1 / rows });
    }
    x += w;
  });
  return (
    <svg viewBox="0 0 60 40" className="layout-thumb" aria-hidden="true">
      {boxes.map((b, i) => (
        <rect
          key={i}
          x={b.x * 60 + 1.5}
          y={b.y * 40 + 1.5}
          width={b.w * 60 - 3}
          height={b.h * 40 - 3}
          rx="2.5"
          fill="currentColor"
          fillOpacity="0.62"
        />
      ))}
    </svg>
  );
}

export default function LayoutPicker({
  onPick,
  abiertas,
}: {
  onPick: (p: Preset) => void;
  /** Las que se ven en el mosaico, sin las apartadas: es lo que se reparte. */
  abiertas: number;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // The popover goes to the body: inside the top bar it was clipped by it and
  // covered by the skills panel, so it looked like nothing happened.
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState({ top: 0, right: 0 });
  // La casilla bajo el ratón; sin ratón encima, la que le va a lo que tienes.
  const [sobre, setSobre] = useState<{ c: number; r: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".layout-pop, .layout-btn")) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const n = Math.max(1, abiertas);
  const justa = equilibrada(n, columnasPara(n));
  const marca = sobre ?? { c: justa.length, r: Math.min(MAX_FILAS, Math.max(...justa)) };
  const columnas = marca.c === 1 ? t("1 columna") : t("{n} columnas", { n: marca.c });
  const filas = marca.r === 1 ? t("1 fila") : t("{n} filas", { n: marca.r });

  const elegir = (p: Preset) => {
    onPick(p);
    setOpen(false);
    setSobre(null);
  };

  return (
    <>
      <button
        ref={btn}
        className="tab layout-btn"
        data-active={open}
        data-tip={t("Repartir las terminales en una plantilla")}
        aria-label={t("Disposición")}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          if (r) {
            setAt({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
          }
          setSobre(null);
          setOpen((v) => !v);
        }}
      >
        <span className="tab-icon">
          <RepartirIcon />
        </span>
      </button>
      {open &&
        createPortal(
          <div className="layout-pop" style={{ top: at.top, right: at.right }}>
            <div className="layout-pop-title">{t("Reparte lo que tienes abierto")}</div>
            <div className="layout-rejilla" onMouseLeave={() => setSobre(null)}>
              {CASILLAS.map(({ c, r }) => (
                <button
                  key={`${c}x${r}`}
                  className="layout-celda"
                  data-on={c <= marca.c && r <= marca.r}
                  aria-label={t("{c} por {r}", { c, r })}
                  onMouseEnter={() => setSobre({ c, r })}
                  onFocus={() => setSobre({ c, r })}
                  onClick={() => elegir(rejilla(c, r))}
                />
              ))}
            </div>
            <div className="layout-cuenta">
              {t("{columnas} y {filas}: caben {n}", { columnas, filas, n: marca.c * marca.r })}
            </div>
            {n >= 2 && (
              <button className="layout-grande" onClick={() => elegir(unaGrande(n))}>
                <Thumb preset={unaGrande(n)} />
                <span>{t("O una grande y el resto al lado")}</span>
              </button>
            )}
            <div className="layout-pop-foot">
              {t("Arrastra la barra de una terminal sobre otra para intercambiarlas, y los bordes entre ellas para repartir el espacio.")}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
