// Ajustes › Bots: avisar a un bot (Grok Bot, Hermes, OpenClaw) cuando una
// terminal termina o te espera. Lo que se manda, cuándo y a dónde lo decide
// `src-tauri/src/bots.rs`; esto solo lo enseña y lo guarda.
//
// Todo apagado de fábrica. Un destino que no está instalado no ofrece interruptor.
// Un aviso que falla no saca nada en mitad del trabajo: aquí queda dicho cuál fue
// el último que no llegó.

import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import {
  botsClavePoner,
  botsClaveQuitar,
  botsEstado,
  botsGuardar,
  botsProbar,
  NOMBRE_BOT,
  traducirMotivo,
  type AjustesDeBots,
  type DestinoBot,
  type EstadoBots,
} from "../lib/bots";
import Espera, { Ocupado } from "./Espera";

const VACIOS: AjustesDeBots = {
  grok: { activo: false, url: "" },
  hermes: { activo: false, destino: "" },
  openclaw: { activo: false, canal: "", destino: "" },
};

export default function AjustesBots() {
  const { t, lang } = useT();
  const [est, setEst] = useState<EstadoBots | null>(null);
  /** Lo que se está escribiendo; lo guardado es `est.ajustes`. */
  const [aj, setAj] = useState<AjustesDeBots>(VACIOS);
  const [errores, setErrores] = useState<Partial<Record<DestinoBot, string>>>({});
  const [clave, setClave] = useState("");
  const [probando, setProbando] = useState<DestinoBot | null>(null);
  const [llego, setLlego] = useState<DestinoBot | null>(null);

  const recibir = useCallback((e: EstadoBots, tambienCampos: boolean) => {
    setEst(e);
    if (tambienCampos) setAj(e.ajustes);
  }, []);

  useEffect(() => {
    let vivo = true;
    const leer = (primera: boolean) =>
      botsEstado()
        .then((e) => {
          if (!vivo) return;
          recibir(e, primera);
          // Lo que se está escribiendo se respeta; los interruptores siguen a lo guardado.
          if (!primera) {
            setAj((p) => ({
              grok: { ...p.grok, activo: e.ajustes.grok.activo },
              hermes: { ...p.hermes, activo: e.ajustes.hermes.activo },
              openclaw: { ...p.openclaw, activo: e.ajustes.openclaw.activo },
            }));
          }
        })
        .catch(() => {});
    void leer(true);
    // Que un aviso que falla se vea aquí sin tener que salir y volver a entrar.
    const reloj = window.setInterval(() => void leer(false), 6000);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [recibir]);

  const decir = (d: DestinoBot, texto: string | undefined) => setErrores((p) => ({ ...p, [d]: texto }));

  /** Guarda. Si Rust no lo acepta, el interruptor vuelve a como estaba y se dice por qué. */
  const guardar = async (d: DestinoBot, nuevo: AjustesDeBots) => {
    setLlego(null);
    try {
      recibir(await botsGuardar(nuevo), true);
      decir(d, undefined);
    } catch (e) {
      decir(d, traducirMotivo(String(e), t));
      const guardado = est?.ajustes[d];
      setAj({ ...nuevo, [d]: { ...nuevo[d], activo: guardado ? guardado.activo : false } });
    }
  };

  const probar = async (d: DestinoBot) => {
    setProbando(d);
    setLlego(null);
    try {
      // Lo que se está escribiendo se guarda primero: se prueba lo que ves.
      await botsGuardar({ ...aj, [d]: { ...aj[d], activo: est?.ajustes[d].activo ?? false } });
      const e = await botsProbar(d, lang === "en");
      recibir(e, false);
      const r = e.ultimos[NOMBRE_BOT[d]];
      if (r && !r.ok) decir(d, t("La prueba no llegó: {motivo}", { motivo: traducirMotivo(r.error ?? "", t) }));
      else {
        decir(d, undefined);
        setLlego(d);
      }
    } catch (e) {
      decir(d, traducirMotivo(String(e), t));
    } finally {
      setProbando(null);
    }
  };

  const guardarClave = async () => {
    try {
      recibir(await botsClavePoner(clave), false);
      setClave("");
      decir("grok", undefined);
    } catch (e) {
      decir("grok", traducirMotivo(String(e), t));
    }
  };

  const quitarClave = async () => {
    try {
      recibir(await botsClaveQuitar(), true);
      decir("grok", undefined);
    } catch (e) {
      decir("grok", traducirMotivo(String(e), t));
    }
  };

  if (!est) {
    return (
      <section className="panel-card">
        <h2>{t("Avisar a un bot")}</h2>
        <Espera activo>{t("Leyendo tus bots…")}</Espera>
      </section>
    );
  }

  /** El último aviso que no llegó, dicho una sola vez y solo si falló. */
  const fallo = (d: DestinoBot) => {
    const r = est.ultimos[NOMBRE_BOT[d]];
    if (!r || r.ok || errores[d] || !est.ajustes[d].activo) return null;
    const cuando = hace(r.cuando);
    return (
      <p className="setting-line setting-bad">
        {t("El último aviso no llegó ({cuando}): {motivo}", {
          cuando: t(cuando.clave, { n: cuando.valor }),
          motivo: traducirMotivo(r.error ?? "", t),
        })}
      </p>
    );
  };

  const lineas = (d: DestinoBot) => (
    <>
      {errores[d] && <p className="setting-line setting-bad">{errores[d]}</p>}
      {llego === d && <p className="setting-line setting-good">{t("La prueba llegó.")}</p>}
      {fallo(d)}
    </>
  );

  const botonProbar = (d: DestinoBot, nota?: string) => (
    <div className="foreman-row bot-probar">
      <button className="mini" disabled={probando !== null} onClick={() => void probar(d)}>
        <Ocupado activo={probando === d} mientras={t("Probando…")}>
          {t("Probar")}
        </Ocupado>
      </button>
      {nota && <small className="bot-nota">{nota}</small>}
    </div>
  );

  const interruptor = (d: DestinoBot, nombre: string, descripcion: string) => (
    <label className="setting-row setting-switch bot-cabecera">
      <span>
        {nombre}
        <small className="bot-nota">{descripcion}</small>
      </span>
      <input
        type="checkbox"
        checked={aj[d].activo}
        aria-label={nombre}
        onChange={(e) => void guardar(d, { ...aj, [d]: { ...aj[d], activo: e.currentTarget.checked } })}
      />
    </label>
  );

  const campo = (etiqueta: string, valor: string, poner: (v: string) => void, guardarAlSalir: () => void, pista: string) => (
    <label className="setting-row bot-campo">
      <span>{etiqueta}</span>
      <input
        className="finder setting-input"
        value={valor}
        placeholder={pista}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => poner(e.currentTarget.value)}
        onBlur={guardarAlSalir}
      />
    </label>
  );

  return (
    <section className="panel-card">
      <h2>{t("Avisar a un bot")}</h2>
      <p className="card-hint">
        {t(
          "Cuando una terminal termina o te espera, Adeorq avisa a tu bot. Manda solo el nombre de la terminal, su proyecto y qué pasa, nunca lo que hay en la pantalla.",
        )}
      </p>

      <div className="bot-bloque">
        {interruptor("grok", "Grok Bot", t("Un webhook de una rutina de tu Grok Bot."))}
        {campo(
          t("Dirección del webhook"),
          aj.grok.url,
          (v) => setAj({ ...aj, grok: { ...aj.grok, url: v } }),
          () => aj.grok.url !== est.ajustes.grok.url && void guardar("grok", aj),
          "https://…",
        )}
        {est.clave_grok ? (
          <div className="setting-row bot-campo">
            <span>{t("Clave")}</span>
            <small className="bot-nota bot-clave">{t("Guardada en el almacén de claves de este equipo.")}</small>
            <button className="mini" onClick={() => void quitarClave()}>
              {t("Quitar la clave")}
            </button>
          </div>
        ) : (
          <div className="setting-row bot-campo">
            <span>{t("Clave")}</span>
            <input
              className="finder setting-input"
              type="password"
              value={clave}
              placeholder={t("Pégala aquí")}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setClave(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && clave.trim() && void guardarClave()}
            />
            <button className="mini" disabled={!clave.trim()} onClick={() => void guardarClave()}>
              {t("Guardar la clave")}
            </button>
          </div>
        )}
        {botonProbar("grok", t("Cada aviso, y también Probar, lanza una ejecución de tu Bot y gasta de su cuota."))}
        {lineas("grok")}
      </div>

      <div className="bot-bloque">
        {est.hermes_instalado || est.ajustes.hermes.activo ? (
          <>
            {interruptor("hermes", "Hermes", t("Con tu Hermes, ya configurado en este equipo."))}
            {campo(
              t("Destino"),
              aj.hermes.destino,
              (v) => setAj({ ...aj, hermes: { ...aj.hermes, destino: v } }),
              () => aj.hermes.destino !== est.ajustes.hermes.destino && void guardar("hermes", aj),
              "telegram",
            )}
            {botonProbar("hermes")}
            {lineas("hermes")}
          </>
        ) : (
          <div className="setting-row bot-cabecera">
            <span>
              Hermes
              <small className="bot-nota">{t("No está instalado en este equipo.")}</small>
            </span>
          </div>
        )}
      </div>

      <div className="bot-bloque">
        {est.openclaw_instalado || est.ajustes.openclaw.activo ? (
          <>
            {interruptor("openclaw", "OpenClaw", t("Con tu OpenClaw, ya configurado en este equipo."))}
            {campo(
              t("Canal, si tienes varios"),
              aj.openclaw.canal,
              (v) => setAj({ ...aj, openclaw: { ...aj.openclaw, canal: v } }),
              () => aj.openclaw.canal !== est.ajustes.openclaw.canal && void guardar("openclaw", aj),
              "telegram",
            )}
            {campo(
              t("Destino"),
              aj.openclaw.destino,
              (v) => setAj({ ...aj, openclaw: { ...aj.openclaw, destino: v } }),
              () => aj.openclaw.destino !== est.ajustes.openclaw.destino && void guardar("openclaw", aj),
              "@mi_chat",
            )}
            {botonProbar("openclaw")}
            {lineas("openclaw")}
          </>
        ) : (
          <div className="setting-row bot-cabecera">
            <span>
              OpenClaw
              <small className="bot-nota">{t("No está instalado en este equipo.")}</small>
            </span>
          </div>
        )}
      </div>

      <p className="card-hint">
        {t("Avisa cuando no estás mirando Adeorq y sigue lo que elijas en Avisos. Si un aviso no llega, lo dice aquí y no te interrumpe.")}
      </p>
    </section>
  );
}
