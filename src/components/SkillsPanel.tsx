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
      {/* Solo el NOMBRE, y lo demás al pasar el ratón (Munir, 2026-08-24).
          Cada skill ocupaba tres renglones porque llevaba dos líneas de
          descripción debajo, así que en una columna de 270 px cabían seis de
          las que tiene: la lista era un scroll de párrafos donde buscar un
          nombre. Ahora cabe entera de un vistazo, que es para lo que existe una
          lista, y la descripción sigue estando a un gesto. */}
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
