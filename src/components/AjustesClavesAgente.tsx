// Ajustes > Terminales > las claves que pegaste para un agente (`adeorq
// secreto`, `pedir_secreto.rs`), con la última vez que se entregaron y a quién
// (decisión A1 de Munir, 2026-11-03), y para olvidarlas. Solo los nombres: el
// valor no vuelve nunca al front. Sin claves guardadas no sale nada.

//
// Desde el 2026-11-06 dice también cuándo caduca cada una o que ya no vale, si su
// servicio lo cuenta (`claves_caducan.rs`). Que valga no se dice: solo lo que pide algo.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../lib/i18n";
import { hace } from "../lib/uso";
import { type Caducidad, fechaDeClave, muerta, NOMBRE_SERVICIO } from "../lib/clavesCaducan";

interface Uso {
  /** Epoch en segundos. */
  cuando: number;
  /** La terminal que la recibió, o `null` si fue un programa de fuera de Adeorq. */
  terminal: number | null;
}

interface ClaveDeAgente {
  nombre: string;
  uso: Uso | null;
  caducidad: Caducidad | null;
}

export default function AjustesClavesAgente() {
  const { t, lang } = useT();
  const [claves, setClaves] = useState<ClaveDeAgente[]>([]);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(() => {
    invoke<ClaveDeAgente[]>("secretos_de_agente")
      .then(setClaves)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(leer, [leer]);

  const olvidar = useCallback(
    (nombre: string) => {
      invoke("secreto_de_agente_olvidar", { nombre })
        .then(leer)
        .catch((e) => setError(String(e)));
    },
    [leer],
  );

  if (claves.length === 0 && !error) return null;

  const cuandoFue = (u: Uso) => {
    const h = hace(u.cuando * 1000);
    const cuando = t(h.clave, { n: h.valor });
    return u.terminal == null
      ? t("la usó un programa de fuera de Adeorq {cuando}, con tu permiso", { cuando })
      : t("la usó la terminal {n} {cuando}", { n: u.terminal, cuando });
  };

  /* Solo lo que pide algo: que ya no vale, o la fecha en que caduca. */
  const cuandoCaduca = (c: Caducidad | null) => {
    if (!c?.servicio) return null;
    const servicio = NOMBRE_SERVICIO[c.servicio] ?? c.servicio;
    if (muerta(c)) return <b>{t("{servicio} ya no la acepta: pide otra", { servicio })}</b>;
    if (c.caduca) return t("{servicio} dice que caduca el {fecha}", { servicio, fecha: fechaDeClave(c.caduca, lang) });
    return null;
  };

  return (
    <section className="panel-card" data-sin-mods="">
      <h2>{t("Claves de los agentes")}</h2>
      <p className="card-hint">
        {t("Las que pegaste para un agente. ")}
        <b>{t("Una terminal de Adeorq las recibe sin preguntar")}</b>
        {t("; cualquier otro programa, solo si le dices que sí.")}
      </p>
      {error && <p className="card-hint">{error}</p>}
      {claves.map((c) => (
        <div className="mcp-cliente" key={c.nombre}>
          <div className="mcp-cliente-quien">
            <b>{c.nombre}</b>
            <span>{c.uso ? cuandoFue(c.uso) : t("todavía no se ha usado")}</span>
            {cuandoCaduca(c.caducidad) && <span>{cuandoCaduca(c.caducidad)}</span>}
          </div>
          <div className="chip-row">
            <button className="choice" onClick={() => olvidar(c.nombre)}>
              {t("Olvidar")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
