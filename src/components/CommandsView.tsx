import { useEffect, useMemo, useState } from "react";
import { listSkills, type Skill } from "../lib/pty";
import { COMMANDS, TOOL_LABEL, type CommandDoc, type Tool } from "../lib/commands";
import { useT } from "../lib/i18n";

interface Props {
  /** Sends the command to the focused pane; null when there is none. */
  onUse: ((cmd: string) => void) | null;
}

const TOOLS: Array<Tool | "todos"> = ["todos", "claude", "agy", "skill"];

export default function CommandsView({ onUse }: Props) {
  const { lang, t } = useT();
  const [q, setQ] = useState("");
  const [tool, setTool] = useState<Tool | "todos">("todos");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    listSkills().then(setSkills).catch(() => {});
  }, []);

  // Munir's own skills belong in the same list: they are commands too.
  const all: CommandDoc[] = useMemo(
    () => [
      ...COMMANDS,
      ...skills.map((s) => ({
        cmd: s.invocation,
        tool: "skill" as Tool,
        es: s.description,
        en: s.description,
        tags: s.name,
      })),
    ],
    [skills],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((c) => {
      if (tool !== "todos" && c.tool !== tool) return false;
      if (!needle) return true;
      return (
        c.cmd.toLowerCase().includes(needle) ||
        c.es.toLowerCase().includes(needle) ||
        c.en.toLowerCase().includes(needle) ||
        (c.tags ?? "").toLowerCase().includes(needle)
      );
    });
  }, [all, q, tool, ]);

  const use = (cmd: string) => {
    if (!onUse) return;
    onUse(cmd);
    setSent(cmd);
    window.setTimeout(() => setSent(null), 1600);
  };

  return (
    <div className="panel commands">
      <header className="panel-hero">
        <h1>{t("Comandos")}</h1>
        <p>
          {t(
            "Todo lo que puedes escribir dentro de cada agente. Busca por lo que quieres hacer, no por cómo se llama.",
          )}
        </p>
      </header>

      <div className="cmd-bar">
        <input
          className="finder cmd-search"
          placeholder={t("Buscar: contexto, cuota, deshacer, seguridad…")}
          value={q}
          autoFocus
          onChange={(e) => setQ(e.currentTarget.value)}
        />
        <div className="chip-row">
          {TOOLS.map((tl) => (
            <button
              key={tl}
              className="choice"
              data-on={tool === tl}
              onClick={() => setTool(tl)}
            >
              {tl === "todos" ? t("Todos") : TOOL_LABEL[tl][lang]}
            </button>
          ))}
        </div>
      </div>

      <p className="card-hint cmd-hint">
        {onUse
          ? t("Clic en un comando y se escribe en la terminal activa (tú le das Enter).")
          : t("Abre una terminal en la Cabina y podrás mandarlos con un clic.")}
      </p>

      <div className="cmd-sections">
        {(["claude", "agy", "skill"] as Tool[]).map((tl) => {
          const group = shown.filter((c) => c.tool === tl);
          if (!group.length) return null;
          return (
            <section key={tl} className="cmd-section">
              <h2 className="cmd-section-title">
                {TOOL_LABEL[tl][lang]}
                <span className="cmd-section-count">{group.length}</span>
              </h2>
              <div className="cmd-grid">
                {group.map((c) => (
                  <button
                    key={`${c.tool}-${c.cmd}`}
                    className="cmd-card"
                    data-tool={c.tool}
                    data-sent={sent === c.cmd}
                    disabled={!onUse}
                    onClick={() => use(c.cmd)}
                  >
                    <code className="cmd-name">{c.cmd}</code>
                    <span className="cmd-desc">{lang === "en" ? c.en : c.es}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {shown.length === 0 && (
          <p className="card-hint">{t("Nada con ese nombre. Prueba con otra palabra.")}</p>
        )}
      </div>
    </div>
  );
}
