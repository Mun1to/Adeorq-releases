import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  iniciales,
  nombreDeCuenta,
  planInfo,
  usageReport,
  type Account,
  type Limits,
  type PlanInfo,
  type UsageReport,
} from "../lib/pty";
import { enCache, limitesDe } from "../lib/cuota";
import { hueOf } from "../lib/colors";
import { providerOf } from "../lib/providers";
import { etiquetaCorta, hace, leerRenovacion, renovacion } from "../lib/uso";
import { useT } from "../lib/i18n";
import { ChevronIcon, RefreshIcon } from "./Icons";
import ProviderMark from "./ProviderMark";

// El fondo del panel de la derecha: cómo va el depósito, en dos bloques.
//
// 1. LOS LÍMITES, que es lo que de verdad importa: sesión, semana, por modelo,
//    y cuándo se renueva cada uno.
// 2. EL TRABAJO, leído de la caché de estadísticas del propio cliente: tokens
//    por día y qué modelos los hicieron.
//
// ── DE UN CLIENTE A VARIOS (2026-08-24) ───────────────────────────────────
//
// Hasta hoy esto solo sabía leer Claude, así que trabajar con Codex era
// hacerlo sin ver el depósito (Munir: «en uso solo sale el de claude, haz que
// salga el de todos tus proveedores y cuentas»). Ahora la fila de arriba es de
// CLIENTES y la de debajo de CUENTAS de ese cliente, igual que en el Chat.
//
// Dos cosas que no son de adorno:
//
//  · De dónde sale el número lo decide `lib/cuota.ts`, no este archivo. A
//    Claude hay que preguntárselo (un proceso de cinco segundos que no gasta
//    cuota) y Codex ya lo tiene escrito en su propio rastro. Aquí solo se
//    pinta, y por eso una barra se pinta de una sola manera.
//  · El cliente que no publica su cuota lo DICE, con esas palabras. Un 0 % es
//    mentir con un número, y este panel existe para decidir a qué cuenta te
//    cambias.
//
// ── Y LA TRADUCCIÓN ───────────────────────────────────────────────────────
//
// La tarjeta la escribe el CLI y la escribe siempre en inglés. Sus etiquetas y
// sus fechas se traducen en `lib/uso.ts`, que es donde se pueden ejecutar de
// verdad (`scripts/uso-check.ts`). Antes se pegaban tal cual detrás de un «se
// renueva» traducido y salía «se renueva Aug 26, 9am».

const OPEN_KEY = "adeorq-usage-open";
/** Qué cuenta estabas mirando, para no volver a la principal cada vez. */
const CUENTA_KEY = "adeorq-usage-cuenta";
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

interface Props {
  onUsage: (() => void) | null;
  /** Las cuentas que publican su gasto, de cualquier cliente. */
  cuentas: Account[];
}

export default function UsagePanel({ onUsage, cuentas }: Props) {
  const { t, lang } = useT();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [data, setData] = useState<UsageReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "0");

  /* La cuenta que estás mirando. Cada una tiene su propio plan, su propio
     límite y su propio gasto: son suscripciones distintas. Se guarda por ID y
     no por posición, que una cuenta borrada movería a todas las demás. */
  const [cuentaId, setCuentaId] = useState(
    () => localStorage.getItem(CUENTA_KEY) ?? cuentas[0]?.id ?? "",
  );
  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? cuentas[0];

  /* Los clientes que hay, en el orden en que llegan las cuentas (que es el de
     `providers.ts`). Un cliente sin ninguna cuenta que publique su cuota no
     sale: una pestaña que al pulsarla no puede decir nada es una pestaña que
     sobra. */
  const clientes = useMemo(() => {
    const vistos: string[] = [];
    for (const c of cuentas) if (!vistos.includes(c.provider)) vistos.push(c.provider);
    return vistos;
  }, [cuentas]);

  const suyas = useMemo(
    () => cuentas.filter((c) => c.provider === cuenta?.provider),
    [cuentas, cuenta?.provider],
  );

  const [cache, setCache] = useState<Cached | null>(null);

  /* La cuenta que estaba elegida cuando se lanzó cada petición. Leer la cuota
     de Claude tarda unos cinco segundos (lanza un `claude` entero), y en ese
     hueco da tiempo de sobra a cambiar de pestaña: sin esta marca, la respuesta
     LENTA de la cuenta A aterrizaba encima de la rápida de la B y el panel
     enseñaba los porcentajes de una bajo el nombre de la otra. En un panel cuyo
     único trabajo es decirte a qué cuenta cambiarte, ese cruce es mentir. */
  const clave = cuenta ? `${cuenta.provider}|${cuenta.dir}` : "";
  const vigenteRef = useRef(clave);
  vigenteRef.current = clave;

  /* Preguntar la cuota pasa por el portero de `lib/cuota.ts`, que la comparte
     con el aviso y con el router. `forzar` es el botón de refrescar: ahí sí lo
     has pedido tú. */
  const refresh = useCallback(
    (forzar = false) => {
      if (!cuenta) return;
      const mia = `${cuenta.provider}|${cuenta.dir}`;
      setBusy(true);
      setError("");
      limitesDe(cuenta, forzar ? 0 : undefined)
        .then((limits) => {
          if (vigenteRef.current !== mia) return;
          setCache({ at: enCache(cuenta)?.at ?? Date.now(), limits });
        })
        .catch((e) => {
          if (vigenteRef.current === mia) {
            setCache(null);
            setError(e instanceof Error ? e.message : String(e));
          }
        })
        .finally(() => {
          if (vigenteRef.current === mia) setBusy(false);
        });
    },
    [cuenta],
  );

  useEffect(() => {
    if (!cuenta) return;
    // Lo último que se leyó de ESTA cuenta, mientras llega lo de ahora: el
    // panel enseña algo desde el primer instante en vez de tres huecos.
    const mia = `${cuenta.provider}|${cuenta.dir}`;
    setCache(enCache(cuenta));
    setPlan(null);
    setData(null);
    // El plan y el trabajo de la semana los lee Adeorq de los archivos de
    // Claude Code. Ningún otro cliente escribe nada parecido, así que a los
    // demás ni se les pregunta en vez de dejar dos bloques en blanco.
    if (cuenta.provider === "claude") {
      planInfo(cuenta.dir || undefined)
        .then((p) => vigenteRef.current === mia && setPlan(p))
        .catch(() => {});
      usageReport(cuenta.dir || undefined)
        .then((d) => vigenteRef.current === mia && setData(d))
        .catch(() => {});
    }
    refresh();
    const timer = setInterval(() => refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, cuenta]);

  const limits = cache?.limits.lines ?? [];
  const peak = Math.max(1, ...(data?.week ?? []).map((d) => d.tokens));
  const suscripcion = plan?.subscription || cache?.limits.plan || "";

  /** «se renueva mañana a las 9:00», o el texto crudo del CLI si no se entiende.
   *
   *  El número (`resetsAt`) manda sobre el texto: Codex lo da como epoch, que
   *  no hay que adivinar. Claude solo lo escribe dentro de su tarjeta, y de ahí
   *  se saca leyendo. Cuando ninguna de las dos cosas sale, se enseña lo que
   *  dijo el CLI: feo, pero verdadero. */
  const cuandoSeRenueva = (resets: string, resetsAt: number): string => {
    const r = renovacion(resetsAt > 0 ? new Date(resetsAt) : resets);
    if (!r) {
      // Sin frase hay dos casos MUY distintos, y confundirlos es lo que dejaba
      // «se renueva Aug 24, 7:10am» en medio del español (visto en pantalla el
      // 2026-08-24, no leyendo el código).
      //
      //  · La fecha se entiende pero YA PASÓ. Ocurre de verdad: al arrancar, el
      //    panel pinta la última lectura guardada mientras pregunta de nuevo, y
      //    esa lectura puede ser de anoche. El dato está caducado, así que no se
      //    dice nada: en un segundo llega el bueno.
      //  · La fecha NO se entiende, porque el CLI ha cambiado su tarjeta.
      //    Entonces sí se enseña su texto crudo, feo pero verdadero, que es lo
      //    que permite darse cuenta de que hay que tocar `lib/uso.ts`.
      const seEntiende = resetsAt > 0 || (resets ? leerRenovacion(resets) !== null : false);
      if (seEntiende) return "";
      return resets ? `${t("se renueva")} ${resets}` : "";
    }
    const valor =
      r.clave === "el {fecha}" && r.fecha
        ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(r.fecha)
        : r.valor;
    return `${t("se renueva")} ${t(r.clave, { n: valor, hora: valor, fecha: valor })}`;
  };

  if (!cuenta) return null;

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
          {suscripcion && <em className="usage-plan">{suscripcion}</em>}
        </span>
        {limits[0] && <span className="usage-week">{limits[0].percent}%</span>}
        <span className="usage-caret">
          <ChevronIcon size={12} up={!open} />
        </span>
      </button>

      {open && (
        <>
          {/* Una pastilla por CLIENTE, y solo cuando hay más de uno. Con uno
              solo, un selector de un elemento es una fila que no decide nada
              (ver la regla de la casa sobre quitar antes que afinar). */}
          {clientes.length > 1 && (
            <div className="usage-clientes" role="tablist">
              {clientes.map((id) => {
                const p = providerOf(id);
                return (
                  <button
                    key={id}
                    role="tab"
                    className="usage-cliente"
                    aria-selected={id === cuenta.provider}
                    style={{ ["--c" as string]: p.hue }}
                    data-tip={t("Ver el gasto de {cli}", { cli: p.label })}
                    onClick={() => {
                      const suya = cuentas.find((c) => c.provider === id);
                      if (!suya) return;
                      setCuentaId(suya.id);
                      localStorage.setItem(CUENTA_KEY, suya.id);
                    }}
                  >
                    {/* Solo la marca (Munir, 2026-08-24). El nombre al lado
                        hacía que dos clientes ya no cupieran en una fila, y en
                        una columna de 270 px eso son dos renglones para elegir
                        entre dos cosas que se reconocen por su dibujo. Quién es
                        cada uno lo dice el globo. */}
                    <ProviderMark id={id} title={p.label} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Y una por CUENTA de ese cliente, con la misma regla. */}
          {suyas.length > 1 && (
            <div className="usage-cuentas" role="tablist">
              {suyas.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  className="usage-cuenta"
                  aria-selected={c.id === cuenta.id}
                  /* El color se calcula con la etiqueta CRUDA, nunca con la
                     traducida: «Principal» y «Main» darían dos tonos distintos
                     y la misma cuenta cambiaría de color al cambiar de idioma. */
                  style={{ ["--c" as string]: hueOf(c.label) }}
                  data-tip={t("Ver el gasto de la cuenta «{acc}»", {
                    acc: nombreDeCuenta(c.label, t),
                  })}
                  onClick={() => {
                    setCuentaId(c.id);
                    localStorage.setItem(CUENTA_KEY, c.id);
                  }}
                >
                  {/* Tres letras, como en la chapa de una terminal (Munir,
                      2026-08-24). Al lado de una fila de logos, un nombre
                      entero vuelve a partir la fila en dos renglones; y son
                      cuentas tuyas, así que tres letras bastan para saber cuál
                      es. El nombre completo, en el globo. */}
                  {iniciales(nombreDeCuenta(c.label, t))}
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
                onClick={() => refresh(true)}
              >
                {busy ? "…" : <RefreshIcon size={13} />}
              </button>
            </div>

            {limits.map((l) => {
              const e = etiquetaCorta(l.label);
              const cuando = cuandoSeRenueva(l.resets, l.resetsAt);
              return (
                <div
                  key={l.label}
                  className="limit"
                  data-tip={`${t(e.clave)}${e.modelo ? ` · ${e.modelo}` : ""}: ${l.percent}%${
                    cuando ? `\n${cuando}` : ""
                  }`}
                >
                  <div className="limit-top">
                    <span className="limit-label">
                      {t(e.clave)}
                      {e.modelo && <em className="limit-modelo">{e.modelo}</em>}
                    </span>
                    <strong data-hot={l.percent >= 80}>{l.percent}%</strong>
                  </div>
                  <span className="limit-track">
                    <span
                      className="limit-fill"
                      data-hot={l.percent >= 80}
                      style={{ width: `${Math.min(100, l.percent)}%` }}
                    />
                  </span>
                  {cuando && <div className="limit-reset">{cuando}</div>}
                </div>
              );
            })}

            {limits.length === 0 && (
              <div className="usage-foot">
                {error
                  ? error
                  : busy
                    ? t("Preguntando a {cli}…", { cli: providerOf(cuenta.provider).label })
                    : t("Sin datos todavía")}
              </div>
            )}
            {cache && limits.length > 0 && (
              <div className="usage-foot">
                {(() => {
                  const a = hace(cache.at);
                  return t(a.clave, { n: a.valor });
                })()}
              </div>
            )}
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
                    data-tip={`${d.date}: ${short(d.tokens)} tokens · ${
                      d.sessions === 1
                        ? t("{n} sesión", { n: d.sessions })
                        : t("{n} sesiones", { n: d.sessions })
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

          {/* Una cuenta de Claude recién estrenada no tiene stats: el CLI
              escribe ese archivo cuando trabaja. Sin esta línea, el bloque
              entero desaparecía y parecía que el panel se había roto al
              cambiar. A los demás clientes ni se les pide, así que tampoco se
              les echa de menos nada. */}
          {!data && cuenta.provider === "claude" && (
            <div className="usage-foot">
              {t("Todavía no hay trabajo apuntado en esta cuenta.")}
            </div>
          )}

          {onUsage && cuenta.provider === "claude" && (
            <button className="mini usage-open" onClick={() => onUsage()}>
              {t("Ver la tarjeta entera en la terminal")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
