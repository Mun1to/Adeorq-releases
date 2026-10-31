import { useEffect, useMemo, useState } from "react";
import { listSkills, type Skill } from "../lib/pty";
import { agrupar, fraseCorta, type QueGrupo } from "../lib/skills";
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
    listSkills(true).then(setSkills).catch(() => {});
  }, []);

  const grupos = useMemo(() => agrupar(skills, q), [skills, q]);

  // Escritos aquí y no en `lib/skills.ts` para que el comprobador de idiomas
  // vea cada `t()` con su texto.
  const titulo = (que: QueGrupo) =>
    que === "usadas"
      ? t("Las que más usas")
      : que === "demas"
        ? t("Las demás")
        : que === "tuyas"
          ? t("Las tuyas")
          : t("De claude.ai y plugins");

  // Ni marco ni cabecera ni franja de cerrado: eso lo pone `PanelDerecho`, que
  // es quien sabe cuántos inquilinos tiene la barra y cuál se está viendo.
  // Hasta el 2026-08-15 aquí vivía todo eso, porque este era el único panel de
  // la derecha que había.
  return (
    <>
      {/* Una línea, no tres. Lo de arrastrar lo dice el globo de cada skill,
          que es donde se lee cuando hace falta. */}
      <p className="skills-hint">{pista ?? t("Pulsa una y va a la terminal.")}</p>
      <input
        className="finder"
        placeholder={t("Buscar skill")}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />
      {/* Arriba las que más usas, luego las demás tuyas y al final, aparte, las
          de tu cuenta de claude.ai y los plugins (Munir, 2026-10-30, «A3 B2»,
          elegida entre cuatro con sus skills de verdad). Cada fila, el nombre y
          lo que hace en su primera frase, dos líneas como mucho; entera, en el
          globo. */}
      <div className="skills-list">
        {grupos.map((g) => (
          <div key={g.que} className="skills-grupo">
            <p className="skills-grupo-titulo">
              {titulo(g.que)}
              <span>{g.skills.length}</span>
            </p>
            {g.skills.map((s) => (
              <div
                key={s.invocation}
                className="skill"
                draggable
                /* Tres piezas y en este orden: el nombre (el globo pinta la
                   primera línea en negrita), para qué sirve, y qué pasa si la
                   pulsas. */
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
                <span className="skill-name">
                  <span className="skill-barra">/</span>
                  <span className="skill-orden">{s.invocation.slice(1)}</span>
                  {g.que === "usadas" && (
                    <span className="skill-veces">
                      {s.veces} {s.veces === 1 ? t("vez") : t("veces")}
                    </span>
                  )}
                </span>
                {s.description && <span className="skill-desc">{fraseCorta(s.description)}</span>}
              </div>
            ))}
          </div>
        ))}
        {skills.length === 0 && (
          <p className="skills-hint">{t("Sin skills en ~/.claude/skills")}</p>
        )}
      </div>
    </>
  );
}
