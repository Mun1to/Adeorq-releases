// The workspace avatar, Discord style: the logo of the thing that project
// actually builds, or its initials when there is none. A list of thirty
// identical text rows is a list you have to read; a wall of marks is one you
// recognise.
import { useEffect, useState } from "react";
import { hueOf } from "../lib/colors";

/** "Adeorq" → "Ad", "CCC Alex Web" → "CA", "layco-core" → "LC". */
export function initials(name: string): string {
  const words = name
    .replace(/[_\-.·]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) {
    const w = words[0];
    return (w[0] + (w[1] ?? "")).replace(/^./, (c) => c.toUpperCase());
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface Props {
  name: string;
  src?: string;
  /** Extra classes, e.g. to shrink the avatar in a denser row. */
  className?: string;
}

export default function ProjectAvatar({ name, src, className }: Props) {
  // A black favicon on a transparent background is invisible on a dark panel.
  // Measure the mark once and give the dark ones a light plate to sit on.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(false);
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const { data } = ctx.getImageData(0, 0, 16, 16);
        let sum = 0;
        let seen = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue; // transparent pixels say nothing
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          seen++;
        }
        if (alive && seen > 0) setDark(sum / seen < 72);
      } catch {
        // An SVG the engine refuses to rasterise: leave it on the dark plate.
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  return (
    <span
      className={`pavatar${className ? ` ${className}` : ""}`}
      data-plate={src ? (dark ? "light" : "none") : "tint"}
      style={{ ["--c" as string]: hueOf(name) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" draggable={false} /> : initials(name)}
    </span>
  );
}
