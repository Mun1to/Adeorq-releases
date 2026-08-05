import { useEffect, useMemo, useState } from "react";
import { listSkills, type Skill } from "../lib/pty";
import { useT } from "../lib/i18n";
import UsagePanel from "./UsagePanel";

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

  if (!open) {
    return (
      <aside className="skills skills-closed">
        <button
          className="skills-toggle"
          onClick={toggle}
          data-tip={t("Mostrar skills y uso")}
        >
          ✦
        </button>
        {/* Plegado también dice lo que hay dentro: aquí no viven solo las
            skills, debajo está el uso de la cuenta, y el rótulo de antes lo
            escondía. */}
        <span className="skills-vertical">{t("Skills · Uso")}</span>
      </aside>
    );
  }

  return (
    <aside className="skills">
      <div className="skills-head">
        <span className="skills-title">✦ {t("Skills")}</span>
        <button className="mini" onClick={toggle} data-tip={t("Ocultar panel")}>
          ▸
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
