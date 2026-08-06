import { useEffect, useMemo, useState } from "react";
import { listSkills, type Skill } from "../lib/pty";
import { useT } from "../lib/i18n";
import UsagePanel from "./UsagePanel";
import {
  ChevronIcon,
  SparkIcon,
} from "./Icons";

interface Props {
  canPaste: boolean;
  onUse: (text: string) => void;
  /** Types /usage into the focused pane; null when there is none. */
  onUsage: (() => void) | null;
}

const OPEN_KEY = "adeorq-skills-open";

export default function SkillsPanel({ canPaste, onUse, onUsage }: Props) {
  const { t } = useT();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "0");

  useEffect(() => {
    listSkills().then(setSkills).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query),
    );
  }, [skills, q]);

  const toggle = () => {
    setOpen((prev) => {
      localStorage.setItem(OPEN_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  // Cerrado no es una columna, es una pestaña.
  //
  // Antes se quedaba una franja de 34 px de ALTO COMPLETO con el rótulo girado
  // de arriba abajo: 34 píxeles de terminal cedidos en toda la pantalla para
  // enseñar dos palabras de canto (Munir, 2026-08-06). Ahora es una lengüeta
  // pegada al borde, a media altura, y el ancho que ocupaba se lo quedan las
  // terminales. Sigue diciendo lo que hay dentro, que era lo que se ganó al
  // ponerle el rótulo.
  if (!open) {
    return (
      <button className="skills-pestana" onClick={toggle} data-tip={t("Mostrar skills y uso")}>
        <SparkIcon size={13} />
        <span className="skills-vertical">{t("Skills · Uso")}</span>
      </button>
    );
  }

  return (
    <aside className="skills">
      <div className="skills-head">
        <span className="skills-title">
          <SparkIcon size={14} /> {t("Skills")}
        </span>
        {/* Hacia la derecha, que es por donde se va: el chevron hacia abajo
            señalaba un sitio al que este panel no se pliega. */}
        <button className="mini" onClick={toggle} data-tip={t("Ocultar panel")}>
          <ChevronIcon size={12} der />
        </button>
      </div>
      <p className="skills-hint">
        {t("Arrastra uno sobre una terminal para pegarlo, o clic para mandarlo al pane activo.")}
      </p>
      <input
        className="finder"
        placeholder={t("Buscar skill")}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      <div className="skills-list">
        {shown.map((s) => (
          <div
            key={s.invocation}
            className="skill"
            draggable
            data-tip={`${s.invocation}\n${s.description}`}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", `${s.invocation} `);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              if (canPaste) onUse(`${s.invocation} `);
            }}
            data-disabled={!canPaste}
          >
            <span className="skill-name">{s.invocation}</span>
            <span className="skill-desc">{s.description || s.name}</span>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="skills-hint">{t("Sin skills en ~/.claude/skills")}</p>
        )}
      </div>
      <UsagePanel onUsage={onUsage} />
    </aside>
  );
}
