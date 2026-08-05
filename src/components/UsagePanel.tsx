import { useCallback, useEffect, useState } from "react";
import {
  planInfo,
  usageLimits,
  usageReport,
  type Limits,
  type PlanInfo,
  type UsageReport,
} from "../lib/pty";
import { useT } from "../lib/i18n";
import {
  ChevronIcon,
  RefreshIcon,
} from "./Icons";

// Bottom right corner: how the plan is doing, in two blocks.
//
// 1. THE LIMITS, which is what actually matters: session, week, per model,
//    and when each one resets. They live on Anthropic's side, but `/usage` is
//    a local slash command, so `claude -p /usage` answers with the card at
//    zero cost (verified: zero turns, zero tokens). Adeorq refreshes it on
//    its own instead of typing into one of Munir's terminals.
// 2. THE WORK, read from Claude Code's stats cache: tokens per day and which
//    models did them.

const OPEN_KEY = "adeorq-usage-open";
const CACHE_KEY = "adeorq-limits";
const REFRESH_MS = 10 * 60 * 1000;

interface Cached {
  at: number;
  limits: Limits;
}

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** "Current week (all models)" is a mouthful in a 260px column. */
function shortLabel(label: string): string {
  const inside = label.match(/\(([^)]+)\)/)?.[1];
  if (/session/i.test(label)) return "sesión";
  if (inside && /all models/i.test(inside)) return "semana";
  if (inside) return `semana · ${inside}`;
  return label.replace(/^current\s+/i, "");
}

export default function UsagePanel({ onUsage }: { onUsage: (() => void) | null }) {
  const { t } = useT();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [data, setData] = useState<UsageReport | null>(null);
  const [cache, setCache] = useState<Cached | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "0");

  const refresh = useCallback(() => {
    setBusy(true);
    setError("");
    usageLimits()
      .then((limits) => {
        const fresh = { at: Date.now(), limits };
        setCache(fresh);
        localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    planInfo().then(setPlan).catch(() => {});
    usageReport().then(setData).catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const limits = cache?.limits.lines ?? [];
  const peak = Math.max(1, ...(data?.week ?? []).map((d) => d.tokens));

  return (
    <section className="usage" data-open={open}>
      <button
        className="usage-head"
        onClick={() =>
          setOpen((v) => {
            localStorage.setItem(OPEN_KEY, v ? "0" : "1");
            return !v;
          })
        }
      >
        <span className="usage-title">
          ◔ {t("Tu uso")}
          {plan?.subscription && <em className="usage-plan">{plan.subscription}</em>}
        </span>
        {limits[0] && <span className="usage-week">{limits[0].percent}%</span>}
        <span className="usage-caret"><ChevronIcon size={12} up={!open} /></span>
      </button>

      {open && (
        <>
          <div className="usage-block">
            <div className="usage-block-head">
              <span>{t("Límites del plan")}</span>
              <button
                className="mini usage-refresh"
                data-tip={t("Volver a preguntar (no gasta cuota)")}
                disabled={busy}
                onClick={refresh}
              >
                {busy ? "…" : <RefreshIcon size={13} />}
              </button>
            </div>

            {limits.map((l) => (
              <div key={l.label} className="limit" data-tip={`${l.label}: ${l.percent}%`}>
                <div className="limit-top">
                  <span className="limit-label">{shortLabel(l.label)}</span>
                  <strong data-hot={l.percent >= 80}>{l.percent}%</strong>
                </div>
                <span className="limit-track">
                  <span
                    className="limit-fill"
                    data-hot={l.percent >= 80}
                    style={{ width: `${Math.min(100, l.percent)}%` }}
                  />
                </span>
                {l.resets && (
                  <div className="limit-reset">
                    {t("se renueva")} {l.resets.replace(/\s*\([^)]*\)\s*$/, "")}
                  </div>
                )}
              </div>
            ))}

            {limits.length === 0 && (
              <div className="usage-foot">
                {error ? `${t("No pude leerlos")}: ${error}` : t("Preguntando a Claude…")}
              </div>
            )}
            {cache && <div className="usage-foot">{ago(cache.at)}</div>}
          </div>

          {data && (
            <div className="usage-block">
              <div className="usage-block-head">
                <span>{t("Trabajo de la semana")}</span>
                <span className="usage-week">{short(data.weekTokens)}</span>
              </div>
              <div className="usage-bars" data-tip={t("Tokens de cada uno de los últimos 7 días")}>
                {data.week.map((d) => (
                  <span
                    key={d.date}
                    className="usage-bar"
                    style={{ height: `${Math.max(6, (d.tokens / peak) * 100)}%` }}
                    data-tip={`${d.date}: ${short(d.tokens)} tokens · ${d.sessions} ${
                      d.sessions === 1 ? "sesión" : "sesiones"
                    }`}
                  />
                ))}
              </div>
              <div className="usage-line">
                <span>{t("sesiones")}</span>
                <strong>{data.weekSessions}</strong>
              </div>
              {data.byModel.slice(0, 3).map((m) => (
                <div key={m.model} className="usage-line">
                  <span className="usage-model">{m.model}</span>
                  <strong>{short(m.tokens)}</strong>
                </div>
              ))}
            </div>
          )}

          {onUsage && (
            <button className="mini usage-open" onClick={() => onUsage()}>
              {t("Ver la tarjeta entera en la terminal")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
