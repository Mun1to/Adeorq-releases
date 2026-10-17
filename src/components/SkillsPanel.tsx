import { useEffect, useMemo, useState } from "react";
import { listSkills, type Skill } from "../lib/pty";
import { useT } from "../lib/i18n";

interface Props {
  canPaste: boolean;
  onUse: (text: string) => void;
  /** Qué se hace con una skill AQUÍ. En la Cabina se suelta sobre una terminal;
      en el Chat no hay ninguna que soltar, así que la frase de siempre mentiría. */
  pista?: string;
}

export default function SkillsPanel({ canPaste, onUse, pista }: Props) {
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
      {/* Una línea, no tres. Lo que decía («arrástrala, o clic para mandarla al
          panel activo») ahora lo dice el globo de cada skill, que es donde se
          lee cuando hace falta; aquí solo robaba dos renglones a la lista. */}
      <p className="skills-hint">{pista ?? t("Clic la manda · arrastrar la pega")}</p>
      <input
        className="finder"
        placeholder={t("Buscar skill")}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      {/* El nombre y una sola línea de lo que hace (2026-10-17, «B1»); entera,
          al pasar el ratón. El 2026-08-24 se quedó en el nombre solo porque con
          dos líneas cabían seis en la columna; ahora el Uso tiene su pestaña y
          esta lista, el panel entero. */}
      <div className="skills-list">
        {shown.map((s) => (
          <div
            key={s.invocation}
            className="skill"
            draggable
            /* Tres piezas y en este orden: el nombre (el globo pinta la primera
               línea en negrita), para qué sirve, y qué pasa si la pulsas. Lo
               último es lo que la pista de arriba ya no alcanza a decir cuando
               cada fila es un renglón pelado. */
            data-tip={[
              s.invocation,
              s.description || s.name,
              canPaste ? t("Clic para mandarla · arrástrala sobre una terminal") : "",
            ]
              .filter(Boolean)
              .join("\n")}
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
            {s.description && <span className="skill-desc">{s.description}</span>}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="skills-hint">{t("Sin skills en ~/.claude/skills")}</p>
        )}
      </div>
    </>
  );
}
