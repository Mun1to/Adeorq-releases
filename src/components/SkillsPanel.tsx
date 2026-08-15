import { useEffect, useMemo, useState } from "react";
import { listSkills, type Account, type Skill } from "../lib/pty";
import { useT } from "../lib/i18n";
import UsagePanel from "./UsagePanel";

interface Props {
  canPaste: boolean;
  onUse: (text: string) => void;
  /** Types /usage into the focused pane; null when there is none. */
  onUsage: (() => void) | null;
  /** Las cuentas de Claude, para poder ver el gasto de cada una. */
  cuentas: Account[];
  /** Qué se hace con una skill AQUÍ. En la Cabina se suelta sobre una terminal;
      en el Chat no hay ninguna que soltar, así que la frase de siempre mentiría. */
  pista?: string;
}

export default function SkillsPanel({ canPaste, onUse, onUsage, cuentas, pista }: Props) {
  const { t } = useT();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [q, setQ] = useState("");

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

  // Ni marco ni cabecera ni franja de cerrado: eso lo pone `PanelDerecho`, que
  // es quien sabe cuántos inquilinos tiene la barra y cuál se está viendo.
  // Hasta el 2026-08-15 aquí vivía todo eso, porque este era el único panel de
  // la derecha que había.
  return (
    <>
      <p className="skills-hint">
        {pista ??
          t("Arrastra uno sobre una terminal para pegarlo, o clic para mandarlo al pane activo.")}
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
      <UsagePanel onUsage={onUsage} cuentas={cuentas} />
    </>
  );
}
