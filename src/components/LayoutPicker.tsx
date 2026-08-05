import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRESETS, type Preset } from "../lib/layout";
import { useT } from "../lib/i18n";

// Windows' snap layouts, for terminals: pick a shape and the panes you already
// have are re-dealt into it. Each thumbnail is drawn from the preset itself,
// so a new template in lib/layout shows up here with no extra work.

const LABEL: Record<string, string> = {
  "1": "Una sola",
  "2": "Dos columnas",
  "3": "Tres columnas",
  "big-left": "Grande a la izquierda",
  "big-right": "Grande a la derecha",
  "2x2": "Cuadrícula 2x2",
  "2x3": "Cuadrícula 2x3",
  "1-2": "Dos y una partida",
  "3x3": "La pared de nueve",
  "4x2": "Cuadrícula 4x2",
  "4": "Cuatro columnas",
  "1-3": "Una grande y tres al lado",
};

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
          rx="3"
          fill="currentColor"
          fillOpacity="0.35"
        />
      ))}
    </svg>
  );
}

export default function LayoutPicker({ onPick }: { onPick: (p: Preset) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // The popover goes to the body: inside the top bar it was clipped by it and
  // covered by the skills panel, so it looked like nothing happened.
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState({ top: 0, right: 0 });

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

  return (
    <>
      <button
        ref={btn}
        className="tab layout-btn"
        data-active={open}
        data-tip={t("Repartir las terminales en una plantilla")}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          if (r) {
            setAt({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
          }
          setOpen((v) => !v);
        }}
      >
        <span className="tab-icon">⊞</span>
        <span className="tab-label">{t("Disposición")}</span>
      </button>
      {open &&
        createPortal(
          <div className="layout-pop" style={{ top: at.top, right: at.right }}>
          <div className="layout-pop-title">{t("Reparte lo que tienes abierto")}</div>
          <div className="layout-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="layout-choice"
                data-tip={t(LABEL[p.id] ?? p.id)}
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
              >
                <Thumb preset={p} />
              </button>
            ))}
          </div>
            <div className="layout-pop-foot">
              {t("Arrastra la barra de una terminal sobre otra para intercambiarlas, y los bordes entre ellas para repartir el espacio.")}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
