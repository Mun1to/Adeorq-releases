// Perfil › Cuentas › «En la web»: en qué webs tiene sesión el navegador de los agentes, y
// «Añadir» y «Quitar» para cada una (Munir, 2026-11-27). Qué se lee y cómo, en
// `src-tauri/src/cuentas_web.rs`; cómo se enseña cada web, en `lib/cuentasWeb.ts`.
//
// La misma cara que «Tus cuentas»: el resumen en un renglón arriba, la lista sobre su cristal,
// cada web en una fila suelta con su logo y su estado en palabra, y el diálogo de siempre
// antes de quitar.

import { useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";
import {
  anadirCuentaWeb,
  botonesDe,
  contarDentro,
  ladoDe,
  presentacionDe,
  quitarCuentaWeb,
  type EstadoCuentasWeb,
  type Grupo,
  type SitioEstado,
} from "../lib/cuentasWeb";
import { AvisoIcon } from "./Icons";

const GRUPOS: { id: Grupo; titulo: string }[] = [
  { id: "cuentas", titulo: "Cuentas" },
  { id: "vivo", titulo: "Webs en vivo" },
  { id: "bloqueado", titulo: "Bloqueadas" },
];

const TRAZO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Logo({ id }: { id: string }) {
  const p = presentacionDe(id);
  return (
    <span className="cweb-logo" style={{ color: p.color ?? "var(--text)" }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        {p.d ? (
          <path d={p.d} fill="currentColor" />
        ) : p.dibujo === "banco" ? (
          <path d="M3.5 9.2 12 4.2l8.5 5M5.5 9.6v7.6M10 9.6v7.6M14 9.6v7.6M18.5 9.6v7.6M3.5 19.8h17" {...TRAZO} />
        ) : (
          <>
            <circle cx="12" cy="12" r="8.8" {...TRAZO} />
            <path d="M3.4 12h17.2M12 3.2c2.4 2.4 3.6 5.3 3.6 8.8s-1.2 6.4-3.6 8.8c-2.4-2.4-3.6-5.3-3.6-8.8S9.6 5.6 12 3.2Z" {...TRAZO} />
          </>
        )}
      </svg>
    </span>
  );
}

interface Props {
  estado: EstadoCuentasWeb;
  /** Vuelve a leer el perfil. `rapido`: durante un rato, cada pocos segundos (tras «Añadir»). */
  releer: (rapido?: boolean) => void;
}

export default function CuentasWeb({ estado, releer }: Props) {
  const { t, lang } = useT();
  const [quitando, setQuitando] = useState<SitioEstado | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const bajoEnVelo = useRef(false);

  const nombre = (id: string) => t(presentacionDe(id).nombre);
  const fecha = (s: number) =>
    new Date(s * 1000).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long" });

  const anadir = async (s: SitioEstado) => {
    setFallo(null);
    setOcupado(s.id);
    try {
      const r = await anadirCuentaWeb(s.id);
      setNota(
        r.en_el_abierto
          ? t("{w} está abierta en una pestaña del navegador de los agentes. Entra allí.", { w: nombre(s.id) })
          : null,
      );
      releer(true);
    } catch (e) {
      setFallo(String(e));
    } finally {
      setOcupado(null);
    }
  };

  const quitar = async (s: SitioEstado) => {
    setFallo(null);
    setOcupado(s.id);
    try {
      await quitarCuentaWeb(s.id);
      setQuitando(null);
      releer();
    } catch (e) {
      setFallo(String(e));
      setQuitando(null);
    } finally {
      setOcupado(null);
    }
  };

  const dentro = contarDentro(estado.sitios);
  const total = estado.sitios.filter((s) => s.grupo !== "bloqueado" && !s.con).length;
  const bloqueadasDentro = estado.sitios.filter((s) => s.grupo === "bloqueado" && s.dentro !== false).length;

  const sub = (s: SitioEstado): string | null => {
    const p = presentacionDe(s.id);
    if (p.porque) return t(p.porque);
    if (s.con) return t("Con tu sesión de {w}", { w: nombre(s.con) });
    if (s.pista) return t("con {c}", { c: s.pista });
    if (s.dentro && s.caduca) return t("hasta el {f}", { f: fecha(s.caduca) });
    return null;
  };

  const fila = (s: SitioEstado) => {
    const lado = ladoDe(s);
    const b = botonesDe(s);
    const linea = sub(s);
    return (
      <li key={s.id} className="cweb-fila" data-lado={lado} data-grupo={s.grupo}>
        <Logo id={s.id} />
        <span className="cweb-nombre">
          <b>{nombre(s.id)}</b>
          {linea && <span className={s.pista && !s.con ? "cweb-sub stream-hide" : "cweb-sub"}>{linea}</span>}
        </span>
        <span
          className="cweb-lado"
          data-lado={lado}
          data-tip={lado === "nose" ? t("Esta web no deja ver desde fuera si has entrado.") : undefined}
        >
          {lado === "dentro" ? t("Dentro") : lado === "fuera" ? t("Fuera") : t("No se sabe")}
        </span>
        <span className="cweb-botones">
          {b.anadir && (
            <button className="mini" disabled={ocupado !== null} onClick={() => void anadir(s)}>
              {t("Añadir")}
            </button>
          )}
          {b.quitar && (
            <button className="mini menu-warn" disabled={ocupado !== null} onClick={() => setQuitando(s)}>
              {t("Quitar")}
            </button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="cweb">
      <p className="accounts-linea">
        <span>
          <b>{dentro}</b> {t("con sesión abierta")}
          <em>{t("de {n} webs", { n: total })}</em>
        </span>
        {bloqueadasDentro > 0 && (
          <span data-hot="">
            <b>{bloqueadasDentro}</b> {bloqueadasDentro === 1 ? t("bloqueada con sesión") : t("bloqueadas con sesión")}
            <em>{bloqueadasDentro === 1 ? t("quítala abajo") : t("quítalas abajo")}</em>
          </span>
        )}
        <span>
          <b>{estado.abierto ? t("Abierto") : t("Cerrado")}</b> {t("el navegador de los agentes")}
          <em>{estado.abierto ? t("Añadir abre una pestaña en él") : t("Añadir abre una ventana suya")}</em>
        </span>
      </p>

      {estado.entrando && (
        <p className="accounts-note cweb-nota" data-aviso="">
          <AvisoIcon size={16} />
          <span>
            {t("Estás entrando en {w}.", { w: nombre(estado.entrando) })}{" "}
            <b>{t("Cuando acabes, cierra esa ventana")}</b>
            {t(": mientras siga abierta, los agentes no pueden usar el navegador.")}
          </span>
        </p>
      )}
      {!estado.entrando && nota && <p className="accounts-note cweb-nota">{nota}</p>}
      {fallo && <p className="side-error">{fallo}</p>}
      {estado.de_antes && !estado.entrando && (
        <p className="accounts-note cweb-nota">
          {t("Lo de las {h}: ahora no se puede leer.", {
            h: new Date(estado.de_antes * 1000).toLocaleTimeString(lang === "en" ? "en-GB" : "es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          })}
          {estado.error ? ` ${estado.error}` : ""}
        </p>
      )}

      <div className="accounts-groups cweb-lista">
        {GRUPOS.map((g) => {
          const suyas = estado.sitios.filter((s) => s.grupo === g.id);
          if (suyas.length === 0) return null;
          return (
            <section key={g.id} className="cweb-grupo">
              <h3 className="cweb-titulo">{t(g.titulo)}</h3>
              {g.id === "vivo" && (
                <p className="cweb-aviso">
                  <AvisoIcon size={16} />
                  {t("Cualquier agente con este navegador puede tocar tu web en vivo.")}
                </p>
              )}
              <ul className="cweb-filas">{suyas.map(fila)}</ul>
            </section>
          );
        })}
      </div>

      {quitando && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setQuitando(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Quitar {w}", { w: nombre(quitando.id) })}</h3>
            <p className="modal-text">
              {t(
                "El navegador de los agentes cierra tu sesión de {w}: ningún agente podrá entrar con ella. Para volver a usarla, la añades otra vez.",
                { w: nombre(quitando.id) },
              )}
            </p>
            {presentacionDe(quitando.id).local && !estado.abierto && (
              <p className="modal-warn-note">
                {t("Para borrarla, el navegador de los agentes se abre un momento.")}
              </p>
            )}
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setQuitando(null)}>
                {t("Cancelar")}
              </button>
              <button className="np-btn" disabled={ocupado !== null} onClick={() => void quitar(quitando)}>
                {ocupado ? "…" : t("Quitar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
