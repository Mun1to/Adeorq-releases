import { useCallback, useEffect, useMemo, useState } from "react";
import {
  nombreDeCuenta,
  planInfo,
  usageReport,
  type Account,
  type Limits,
  type UsageReport,
} from "../lib/pty";
import { enCache, limitesDe } from "../lib/cuota";
import { fotoRapida } from "../lib/mundo";
import type { CuentaViva } from "../lib/router";
import { providerOf, sabe } from "../lib/providers";
import { etiquetaCorta, hace, leerRenovacion, renovacion } from "../lib/uso";
import { useT } from "../lib/i18n";
import { latido } from "../lib/latido";
import { RefreshIcon } from "./Icons";

// La pestaña Uso del panel de la derecha: cuánto le queda a CADA cuenta, todas
// a la vista y la más gastada arriba.
//
// ── POR QUÉ ASÍ (Munir, 2026-10-17, «A1 B1») ──────────────────────────────
//
// Antes vivía al fondo de Skills, debajo de un hueco, y enseñaba UNA cuenta,
// elegida con dos filas de botones (el programa y luego la cuenta, con tres
// letras: «Pri», «Tra»). Para decidir a qué cuenta te cambias hay que verlas
// todas a la vez, así que ahora es su propia pestaña, la primera de la franja,
// y cada cuenta es una batería como las del Uso del móvil, que él ya eligió
// allí («la 2», 2026-10-16): el nombre entero, la cifra grande y una barra por
// ventana (las 5 horas, la semana, la de cada modelo) con cuándo se renueva.
//
// Dos cosas que no son de adorno:
//
//  · De dónde sale el número lo decide `lib/cuota.ts`, no este archivo: a
//    Claude se le pregunta con un proceso de cinco segundos que no gasta cuota,
//    y dos preguntas por la misma cuenta son una. Abrir esta pestaña con todo
//    leído hace menos de nueve minutos no lanza nada.
//  · El cliente que no publica su cuota lo DICE, con esas palabras. Un 0 % es
//    mentir con un número, y este panel existe para decidir a qué cuenta te
//    cambias. Como en el móvil: batería para lo instalado y con sesión que
//    dice cuánto lleva; lo demás instalado, en una lista aparte con el porqué;
//    y lo que no está instalado no sale (la lista trae la principal de cada
//    cliente que publica cuota, lo tengas o no).
//
// ── Y LA TRADUCCIÓN ───────────────────────────────────────────────────────
//
// La tarjeta la escribe el CLI y la escribe siempre en inglés. Sus etiquetas y
// sus fechas se traducen en `lib/uso.ts` (`scripts/uso-check.ts`).

const REFRESH_MS = 10 * 60 * 1000;

/** Lo que se sabe de una cuenta ahora mismo. */
interface Lectura {
  at: number;
  limits: Limits | null;
  error: string;
  busy: boolean;
}

const VACIA: Lectura = { at: 0, limits: null, error: "", busy: false };

/** El color de un gasto, como en el móvil: naranja desde el 78 %, rojo al final. */
const tonoDe = (p: number) => (p >= 90 ? "mal" : p >= 78 ? "alto" : "bien");

/** Cómo se llama cada ventana dicho para una persona: «sesión» es la de cinco horas. */
const NOMBRE_VENTANA: Record<string, string> = { sesión: "las 5 horas", semana: "la semana", mes: "el mes" };

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

interface Props {
  onUsage: (() => void) | null;
  /** Las cuentas que publican su gasto, de cualquier cliente. */
  cuentas: Account[];
}

const claveDe = (c: Account) => `${c.provider}|${c.dir}`;

export default function UsagePanel({ onUsage, cuentas }: Props) {
  const { t, lang } = useT();
  const [lecturas, setLecturas] = useState<Record<string, Lectura>>({});
  /** El plan de las de Claude, que no viene con la cuota sino de sus archivos. */
  const [planes, setPlanes] = useState<Record<string, string>>({});
  /** Qué está instalado y con sesión (`lib/mundo.ts`); null mientras se mira. */
  const [vivas, setVivas] = useState<CuentaViva[] | null>(null);
  /** El trabajo de la semana, de la primera cuenta que lo apunta. */
  const [trabajo, setTrabajo] = useState<{ cuenta: Account; data: UsageReport } | null>(null);

  const poner = (k: string, cambio: Partial<Lectura>) =>
    setLecturas((prev) => ({ ...prev, [k]: { ...VACIA, ...prev[k], ...cambio } }));

  /* Todas a la vez: el portero (`lib/cuota.ts`) junta las que ya están en
     vuelo y contesta de su memoria las recientes. `forzar` es el botón. */
  const instaladas = useMemo(
    () => (vivas ? cuentas.filter((c) => vivas.find((v) => v.cuenta.id === c.id)?.instalado) : []),
    [cuentas, vivas],
  );
  const conSesion = (c: Account) => vivas?.find((v) => v.cuenta.id === c.id)?.conectada ?? false;

  useEffect(() => {
    let vivo = true;
    fotoRapida(cuentas, 2500)
      .then((v) => vivo && setVivas(v))
      .catch(() => vivo && setVivas([]));
    return () => {
      vivo = false;
    };
  }, [cuentas]);

  const leer = useCallback(
    (forzar = false) => {
      for (const c of instaladas.filter(conSesion)) {
        const k = claveDe(c);
        const guardada = enCache(c);
        poner(k, { busy: true, ...(guardada ? { at: guardada.at, limits: guardada.limits } : {}) });
        limitesDe(c, forzar ? 0 : undefined)
          .then((limits) => poner(k, { limits, at: enCache(c)?.at ?? Date.now(), error: "", busy: false }))
          .catch((e) => poner(k, { error: e instanceof Error ? e.message : String(e), busy: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instaladas],
  );

  useEffect(() => {
    leer();
    return latido(() => leer(), REFRESH_MS);
  }, [leer]);

  useEffect(() => {
    let vivo = true;
    const conArchivos = cuentas.filter((c) => sabe(c.provider, "estadisticas"));
    for (const c of conArchivos) {
      planInfo(c.dir || undefined)
        .then((p) => vivo && p?.subscription && setPlanes((prev) => ({ ...prev, [claveDe(c)]: p.subscription })))
        .catch(() => {});
    }
    const primera = conArchivos[0];
    if (primera) {
      usageReport(primera.dir || undefined)
        .then((data) => vivo && setTrabajo(data ? { cuenta: primera, data } : null))
        .catch(() => {});
    }
    return () => {
      vivo = false;
    };
  }, [cuentas]);

  /** «mañana a las 9:00», o el texto crudo del CLI si no se entiende. */
  const cuandoSeRenueva = (resets: string, resetsAt: number): string => {
    const r = renovacion(resetsAt > 0 ? new Date(resetsAt) : resets);
    if (!r) {
      // Si se entiende pero ya pasó, es una lectura vieja que se está
      // renovando: no se dice nada. Si NO se entiende, el texto del CLI, feo
      // pero verdadero: es lo que avisa de que hay que tocar `lib/uso.ts`.
      const seEntiende = resetsAt > 0 || (resets ? leerRenovacion(resets) !== null : false);
      return seEntiende ? "" : resets;
    }
    const valor =
      r.clave === "el {fecha}" && r.fecha
        ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(r.fecha)
        : r.valor;
    return t(r.clave, { n: valor, hora: valor, fecha: valor });
  };

  /** Lo más gastado de una cuenta, que es lo que la para; null si no se sabe. */
  const cifraDe = (l?: Lectura) => (l?.limits?.lines.length ? Math.max(...l.limits.lines.map((x) => x.percent)) : null);

  // Con batería, lo que dice cuánto lleva (o lo está diciendo); lo más gastado arriba.
  const conDato = instaladas
    .filter((c) => conSesion(c) && (cifraDe(lecturas[claveDe(c)]) !== null || lecturas[claveDe(c)]?.busy !== false))
    .sort((a, b) => (cifraDe(lecturas[claveDe(b)]) ?? -1) - (cifraDe(lecturas[claveDe(a)]) ?? -1));
  const sinDato = instaladas.filter((c) => !conDato.includes(c));

  if (vivas && !instaladas.length) {
    return <p className="act-vacio">{t("Ninguna de tus cuentas dice cuánto lleva gastado.")}</p>;
  }

  const ultima = Math.max(0, ...Object.values(lecturas).map((l) => l.at));
  const busy = Object.values(lecturas).some((l) => l.busy);
  const peak = Math.max(1, ...(trabajo?.data.week ?? []).map((d) => d.tokens));

  return (
    <div className="uso">
      <div className="uso-cab">
        <span>
          {ultima > 0
            ? (() => {
                const a = hace(ultima);
                return t(a.clave, { n: a.valor });
              })()
            : t("Sin datos todavía")}
        </span>
        <button
          className="mini uso-refrescar"
          data-tip={t("Volver a preguntar (no gasta cuota)")}
          aria-label={t("Volver a preguntar (no gasta cuota)")}
          disabled={busy}
          onClick={() => leer(true)}
        >
          {busy ? "…" : <RefreshIcon size={13} />}
        </button>
      </div>

      {!vivas && <p className="act-vacio">{t("Mirando tus cuentas…")}</p>}
      {conDato.map((c) => {
        const k = claveDe(c);
        const l = lecturas[k];
        const cifra = cifraDe(l);
        const plan = planes[k] || l?.limits?.plan || "";
        const lineas = l?.limits?.lines ?? [];
        return (
          <div key={k} className="bat" data-tono={cifra === null ? undefined : tonoDe(cifra)}>
            <div className="bat-cab">
              <b>
                {nombreDeCuenta(c.label, t)}
                <small>{[providerOf(c.provider).label, plan].filter(Boolean).join(" · ")}</small>
              </b>
              {cifra !== null && <span className="bat-cifra">{t("{p} %", { p: cifra })}</span>}
            </div>
            {lineas.map((x) => {
              const e = etiquetaCorta(x.label);
              const cuando = cuandoSeRenueva(x.resets, x.resetsAt);
              return (
                <div key={x.label} className="bat-v" data-tono={tonoDe(x.percent)}>
                  <span className="bat-barra">
                    <i style={{ width: `${Math.min(100, Math.max(0, x.percent))}%` }} />
                  </span>
                  <small>
                    <span>
                      {[t(NOMBRE_VENTANA[e.clave] ?? e.clave), e.modelo].filter(Boolean).join(" · ")} ·{" "}
                      {t("{p} %", { p: x.percent })}
                    </span>
                    {cuando && <span>{cuando}</span>}
                  </small>
                </div>
              );
            })}
            {!lineas.length && (
              <small className="bat-nada">{t("Preguntando a {cli}…", { cli: providerOf(c.provider).label })}</small>
            )}
          </div>
        );
      })}

      {sinDato.length > 0 && (
        <div className="uso-sin">
          <span className="uso-sin-tit">{t("Sin datos de gasto")}</span>
          {sinDato.map((c) => {
            const l = lecturas[claveDe(c)];
            return (
              <div key={claveDe(c)} className="uso-sin-fila" data-tip={l?.error || undefined}>
                <b>{nombreDeCuenta(c.label, t)}</b>
                <span data-mal={!conSesion(c) || undefined}>
                  {providerOf(c.provider).label} · {conSesion(c) ? t("no dice cuánto lleva") : t("sin sesión")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {trabajo && (
        <div className="usage-block">
          <div className="usage-block-head">
            <span>
              {t("Trabajo de la semana")} · {nombreDeCuenta(trabajo.cuenta.label, t)}
            </span>
            <span className="usage-week">{short(trabajo.data.weekTokens)}</span>
          </div>
          <div className="usage-bars" data-tip={t("Tokens de cada uno de los últimos 7 días")}>
            {trabajo.data.week.map((d) => (
              <span
                key={d.date}
                className="usage-bar"
                style={{ height: `${Math.max(6, (d.tokens / peak) * 100)}%` }}
                data-tip={`${d.date}: ${short(d.tokens)} tokens · ${
                  d.sessions === 1 ? t("{n} sesión", { n: d.sessions }) : t("{n} sesiones", { n: d.sessions })
                }`}
              />
            ))}
          </div>
          <div className="usage-line">
            <span>{t("sesiones")}</span>
            <strong>{trabajo.data.weekSessions}</strong>
          </div>
          {trabajo.data.byModel.slice(0, 3).map((m) => (
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
    </div>
  );
}
