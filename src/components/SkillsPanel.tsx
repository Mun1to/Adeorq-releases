import { useEffect, useMemo, useState } from "react";
import { listSkills, type Account, type Skill } from "../lib/pty";
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
  /** Las cuentas de Claude, para poder ver el gasto de cada una. */
  cuentas: Account[];
}

const OPEN_KEY = "adeorq-skills-open";

export default function SkillsPanel({ canPaste, onUse, onUsage, cuentas }: Props) {
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

  // Cerrado es una FRANJA de alto completo con el rótulo de canto.
  //
  // Ha sido las dos cosas. Nació así, el 6 de agosto pasó a ser una lengüeta a
  // media altura para devolverle esos 34 px a las terminales, y el 10 de agosto
  // Munir pidió la franja otra vez, señalando cuál de cinco maquetas quería y
  // con un cambio: la pestañita ARRIBA, no abajo.
  //
  // Y tiene sentido arriba: es lo primero que cae bajo el ojo cuando vas al
  // borde derecho, y queda a la altura de la cabecera del panel que va a
  // abrirse, así que el botón no se mueve de sitio al pulsarlo.
  if (!open) {
    return (
      <aside className="skills skills-cerrada">
        <button className="skills-abrir" onClick={toggle} data-tip={t("Mostrar skills y uso")}>
          {/* Un chevron y no la estrella (Munir, 2026-08-10). La estrella decía
              QUÉ hay dentro, y eso ya lo dice el rótulo de debajo; lo que no
              decía nadie es que esto se abre. Apunta hacia la izquierda, que es
              por donde sale el panel: mirando al borde en el que ya está pegado
              no significaría nada. */}
          <ChevronIcon size={13} der />
        </button>
        {/* Plegada también dice lo que hay dentro: aquí no viven solo las
            skills, debajo está el uso de la cuenta. */}
        <span className="skills-vertical">{t("Skills · Uso")}</span>
      </aside>
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
      <UsagePanel onUsage={onUsage} cuentas={cuentas} />
    </aside>
  );
}
