import { useCallback, useEffect, useState } from "react";
import {
  planInfo,
  usageLimits,
  usageReport,
  type Account,
  type Limits,
  type PlanInfo,
  type UsageReport,
} from "../lib/pty";
import { hueOf } from "../lib/colors";
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
/** Qué cuenta estabas mirando, para no volver a la principal cada vez. */
const CUENTA_KEY = "adeorq-usage-cuenta";
const REFRESH_MS = 10 * 60 * 1000;

/* Una caché por cuenta. Con una sola clave para todas, cambiar de cuenta
   enseñaba durante un segundo los porcentajes de la anterior, que es la clase
   de dato que no puede aparecer mal ni un segundo: se lee para decidir si
   seguir trabajando o parar. */
const claveDe = (dir: string) => (dir ? `${CACHE_KEY}:${dir}` : CACHE_KEY);

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

interface Props {
  onUsage: (() => void) | null;
  /** Las cuentas de Claude, la de siempre incluida. */
  cuentas: Account[];
}

export default function UsagePanel({ onUsage, cuentas }: Props) {
  const { t } = useT();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [data, setData] = useState<UsageReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "0");

  /* La cuenta que estás mirando. Cada una tiene su propio plan, su propio
     límite y su propio gasto: son suscripciones distintas, y hasta ahora este
     panel solo sabía de la de siempre, así que trabajar con una segunda cuenta
     era hacerlo a ciegas (Munir, 2026-08-07). Se guarda por ID y no por
     posición, que una cuenta borrada movería a todas las demás. */
  const [cuentaId, setCuentaId] = useState(
    () => localStorage.getItem(CUENTA_KEY) ?? cuentas[0]?.id ?? "",
  );
  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? cuentas[0];
  const dir = cuenta?.dir ?? "";

  const [cache, setCache] = useState<Cached | null>(null);

  const refresh = useCallback(() => {
    setBusy(true);
    setError("");
    usageLimits(dir || undefined)
      .then((limits) => {
        const fresh = { at: Date.now(), limits };
        setCache(fresh);
        localStorage.setItem(claveDe(dir), JSON.stringify(fresh));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }, [dir]);

  useEffect(() => {
    // Lo último que se leyó de ESTA cuenta, mientras llega lo de ahora: el
    // panel enseña algo desde el primer instante en vez de tres huecos.
    try {
      setCache(JSON.parse(localStorage.getItem(claveDe(dir)) ?? "null"));
    } catch {
      setCache(null);
    }
    setPlan(null);
    setData(null);
    planInfo(dir || undefined).then(setPlan).catch(() => {});
    usageReport(dir || undefined).then(setData).catch(() => {});
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, dir]);

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
          {/* Una pestaña por cuenta, y solo cuando hay más de una: con una
              sola, un selector de un elemento es una fila que no decide nada
              (ver la regla de la casa sobre quitar antes que afinar). */}
          {cuentas.length > 1 && (
            <div className="usage-cuentas" role="tablist">
              {cuentas.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  className="usage-cuenta"
                  aria-selected={c.id === cuenta?.id}
                  style={{ ["--c" as string]: hueOf(c.label) }}
                  data-tip={t("Ver el gasto de la cuenta «{acc}»", { acc: c.label })}
                  onClick={() => {
                    setCuentaId(c.id);
                    localStorage.setItem(CUENTA_KEY, c.id);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

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

          {/* Una cuenta recién estrenada no tiene stats: Claude Code escribe
              ese archivo cuando trabaja. Sin esta línea, el bloque entero
              desaparecía y parecía que el panel se había roto al cambiar. */}
          {!data && cuenta && (
            <div className="usage-foot">
              {t("Todavía no hay trabajo apuntado en esta cuenta.")}
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
