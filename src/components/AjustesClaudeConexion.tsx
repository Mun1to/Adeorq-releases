// Ajustes › Terminales › Conectar tu Claude Code (decisión B1 de Munir, 2026-11-04).
//
// Una fila por cuenta de Claude que conoce Adeorq, con el archivo que se toca a la vista,
// su estado y «Conectar» o «Desconectar». Lo que se escribe y cómo se comprueba está en
// Rust (`claude_conexion.rs`); esto solo lo pide y lo cuenta. Va al lado de `AjustesMcp`,
// que dice qué puede hacer cada programa una vez conectado.

import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { nombreDeCuenta, type Account } from "../lib/pty";
import { claudeConectar, claudeConexiones, claudeDesconectar, type CuentaDeClaude, type PlanDeClaude } from "../lib/claudeConexion";
import Espera, { Ocupado } from "./Espera";

/** La ruta de una carpeta, para saber si dos son la misma aunque se escriban distinto. */
const norma = (ruta: string) => ruta.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Cómo se llama una cuenta donde la persona la ve: su etiqueta, o la de su carpeta. */
function nombreDe(c: CuentaDeClaude, cuentas: Account[], t: (s: string) => string): string {
  if (c.id === "principal") return t("Principal");
  const suya = cuentas.find((a) => a.dir && norma(a.dir) === norma(c.carpeta));
  return suya ? nombreDeCuenta(suya.label, t) : c.id.replace(/^claude-/, "");
}

/** Lo que cuenta la fila de cómo está esa cuenta. */
export function EstadoDeCuenta({ c }: { c: CuentaDeClaude }) {
  const { t } = useT();
  if (c.estado === "noentendido") {
    return (
      <span className="claude-estado" data-malo="">
        {t("No entiendo este archivo ({motivo}). No lo toco.", { motivo: t(c.detalle ?? "") })}
      </span>
    );
  }
  if (c.estado === "ajena") {
    return (
      <span className="claude-estado" data-malo="">
        {t("Hay una entrada llamada «adeorq» que no es la de Adeorq. No la toco.")}
      </span>
    );
  }
  if (c.estado === "conectado") {
    return (
      <span className="claude-estado">
        {c.detalle ? t("Conectado, pero apunta a {ruta}.", { ruta: c.detalle }) : t("Conectado.")}
      </span>
    );
  }
  return (
    <span className="claude-estado">
      {c.existe ? t("Sin conectar.") : t("Sin conectar. El archivo no existe todavía: se crea al conectar.")}
    </span>
  );
}

function Fila({ cuenta, nombre, alCambiar }: { cuenta: CuentaDeClaude; nombre: string; alCambiar: (p: PlanDeClaude) => void }) {
  const { t } = useT();
  const [ocupado, setOcupado] = useState<"escribiendo" | "quitando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  const intentar = async (que: "escribiendo" | "quitando", f: () => Promise<void>) => {
    setOcupado(que);
    setError(null);
    setNota(null);
    try {
      await f();
    } catch (e) {
      setError(t(String(e)));
    } finally {
      setOcupado(null);
    }
  };

  const conectar = () =>
    intentar("escribiendo", async () => {
      const r = await claudeConectar(cuenta.id);
      if (r.copia) setNota(t("Listo. El archivo de antes quedó en {copia}", { copia: r.copia }));
      alCambiar(r.plan);
    });

  const desconectar = () =>
    intentar("quitando", async () => {
      const r = await claudeDesconectar(cuenta.id);
      if (r.copia) setNota(t("Listo. El archivo de antes quedó en {copia}", { copia: r.copia }));
      alCambiar(r.plan);
    });

  return (
    <div className="mcp-cliente claude-cuenta" data-cuenta={cuenta.id}>
      <div className="mcp-cliente-quien claude-cuenta-quien">
        <b>{nombre}</b>
        <span className="claude-ruta">{cuenta.archivo}</span>
        <EstadoDeCuenta c={cuenta} />
        {nota && <span className="claude-nota">{nota}</span>}
        {error && <span className="claude-estado" data-malo="">{error}</span>}
      </div>
      {cuenta.estado === "conectado" ? (
        <button className="mini" disabled={ocupado !== null} onClick={() => void desconectar()}>
          <Ocupado activo={ocupado === "quitando"} mientras={t("Desconectando…")}>
            {t("Desconectar")}
          </Ocupado>
        </button>
      ) : (
        cuenta.estado === "libre" && (
          <button className="np-btn" disabled={ocupado !== null} onClick={() => void conectar()}>
            <Ocupado activo={ocupado === "escribiendo"} mientras={t("Escribiendo…")}>
              {t("Conectar")}
            </Ocupado>
          </button>
        )
      )}
    </div>
  );
}

export default function AjustesClaudeConexion({ cuentas }: { cuentas: Account[] }) {
  const { t } = useT();
  const [plan, setPlan] = useState<PlanDeClaude | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(() => {
    claudeConexiones()
      .then(setPlan)
      .catch((e) => setError(t(String(e))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(leer, [leer]);

  return (
    <section className="panel-card" data-sin-mods="">
      <h2>{t("Conectar tu Claude Code")}</h2>
      <p className="card-hint">
        {t("Con esto tu Claude Code puede ")}
        <b>{t("abrir terminales, leer las tuyas y mirar tu cuota")}</b>
        {t(". Se añade una entrada «adeorq» al archivo que ves en cada fila. Lo demás no se toca y queda una copia al lado.")}
      </p>
      <p className="card-hint">
        <b>{t("En una terminal de Adeorq")}</b>
        {t(" las usa con el permiso de esa terminal. ")}
        <b>{t("En otra consola")}</b>
        {t(" solo ve la lista de terminales y el uso, y abre terminales nuevas, hasta que lo subas en «Qué puede hacer cada cliente por el MCP». Las terminales de Claude que ya tengas abiertas lo cogen al reiniciarlas.")}
      </p>
      {error && <p className="card-hint">{error}</p>}
      {plan && !plan.instalado && <p className="card-hint">{t("No encuentro Claude Code en este equipo.")}</p>}
      {plan ? (
        <>
          {plan.cuentas.map((c) => (
            <Fila key={c.id} cuenta={c} nombre={nombreDe(c, cuentas, t)} alCambiar={setPlan} />
          ))}
          <p className="claude-nota">{t("Claude Code lanzará {comando}", { comando: plan.comando })}</p>
        </>
      ) : (
        !error && <Espera activo>{t("Leyendo tus cuentas de Claude…")}</Espera>
      )}
    </section>
  );
}
