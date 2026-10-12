// Ajustes > Mods (META 14, `docs/contexto/mods.md`): lo que el usuario ha puesto
// encima de la app. Una fila por mod de su carpeta, con su estado, apagarlo,
// quitarlo y pasárselo a su agente cuando una versión nueva lo deja sin
// enganchar. La puerta está en Rust (`mods.rs`) y la lógica en `lib/mods.ts`;
// esto solo lo enseña. Es gemela de `AjustesMcp`, y lleva sus mismas piezas.

import { useCallback, useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import {
  alCambiarMods,
  apagarMod,
  carpetaDeMods,
  encargoDeMod,
  encargoDeRehacer,
  encenderMods,
  escribirGuia,
  estadoDeMods,
  modsEncendidos,
  quitarMod,
  type ModRepasado,
} from "../lib/mods";

interface Props {
  /** Escribe un texto en la terminal del agente, sin enviarlo. `false` si no hay ninguna. */
  onAlAgente?: (texto: string) => boolean;
}

/** Cada cuánto se relee la carpeta con la sección delante. */
const CADA_MS = 4000;

export default function AjustesMods({ onAlAgente }: Props) {
  const { t } = useT();
  const [encendidos, setEncendidos] = useState(modsEncendidos);
  const [mods, setMods] = useState<ModRepasado[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** El mod que está a un clic de irse a la papelera. */
  const [quitando, setQuitando] = useState<string | null>(null);

  // La lista se lee aquí y no de lo aplicado: con los mods apagados también se
  // enseña lo que hay en la carpeta, para verlo antes de encender nada.
  const releer = useCallback(() => {
    estadoDeMods()
      .then(setMods)
      .catch((e) => setAviso(String(e)));
  }, []);

  useEffect(() => {
    releer();
    const dejar = alCambiarMods(releer);
    const reloj = window.setInterval(releer, CADA_MS);
    return () => {
      dejar();
      window.clearInterval(reloj);
    };
  }, [releer]);

  const encender = (si: boolean) => {
    setEncendidos(si);
    void encenderMods(si).then(releer);
  };

  const alAgente = (encargo: (rutaGuia: string) => string) => {
    escribirGuia()
      .then((ruta) => {
        const llego = onAlAgente?.(encargo(ruta)) ?? false;
        setAviso(llego ? null : t("No hay ninguna terminal abierta. Abre una con tu agente y vuelve a pulsar."));
      })
      .catch((e) => setAviso(String(e)));
  };

  const abrirCarpeta = () => {
    carpetaDeMods()
      .then((c) => openPath(c))
      .catch((e) => setAviso(String(e)));
  };

  const quitar = (id: string) => {
    setQuitando(null);
    quitarMod(id)
      .then(releer)
      .catch((e) => setAviso(String(e)));
  };

  const estado = (m: ModRepasado): string => {
    const sueltas = m.sueltas.join(", ");
    if (m.estado === "rechazado") return t("No se carga: {porque}", { porque: m.fallo ?? "" });
    if (m.estado === "apagado") return sueltas ? t("Apagado · ya no engancha: {que}", { que: sueltas }) : t("Apagado");
    if (m.estado === "no_engancha") return t("Ya no engancha: {que} no existe en esta versión", { que: sueltas });
    return encendidos ? t("Puesto") : t("Listo para cuando los enciendas");
  };

  return (
    <section className="panel-card">
      <h2>{t("Mods")}</h2>
      <p className="card-hint">
        {t(
          "Un mod es un cambio tuyo en cómo se ve Adeorq: los iconos redondos, otro color, una pieza escondida. Vive en tu carpeta de datos, así que una actualización no lo toca. No hace falta escribirlo: pídeselo a tu agente.",
        )}
      </p>
      <div className="chip-row">
        <button className="choice" data-on={encendidos} onClick={() => encender(true)}>
          {t("Encendidos")}
        </button>
        <button className="choice" data-on={!encendidos} onClick={() => encender(false)}>
          {t("Apagados")}
        </button>
      </div>
      <p className="card-hint">
        {t(
          "Si un mod te deja la pantalla inservible, Ctrl+Alt+Mayús+0 los apaga todos desde cualquier sitio. Solo cambian el aspecto: Adeorq no carga código de un mod.",
        )}
      </p>
      <div className="chip-row">
        <button className="choice" onClick={() => alAgente(encargoDeMod)}>
          {t("Pedir un mod a tu agente")}
        </button>
        <button className="choice" onClick={() => abrirCarpeta()}>
          {t("Abrir la carpeta")}
        </button>
      </div>
      {aviso && <p className="card-hint mod-aviso">{aviso}</p>}
      {mods && mods.length === 0 && <p className="card-hint">{t("Todavía no tienes ninguno.")}</p>}
      {mods?.map((m) => (
        <div className="mcp-cliente" key={m.id}>
          <div className="mcp-cliente-quien">
            {/* El nombre de su carpeta, que es lo único que no se repite. */}
            <b>{m.id}</b>
            <span className="mod-estado" data-estado={m.estado}>
              {estado(m)}
            </span>
            {m.pedido && <span>«{m.pedido}»</span>}
          </div>
          <div className="chip-row">
            {(m.estado === "no_engancha" || m.estado === "rechazado" || (m.estado === "apagado" && m.sueltas.length > 0)) && (
              <button
                className="choice"
                data-tip={t("Le escribe a tu agente el encargo de rehacerlo para esta versión. Lo envías tú.")}
                onClick={() => alAgente((ruta) => encargoDeRehacer(m, ruta))}
              >
                {t("Pasárselo a tu agente")}
              </button>
            )}
            {m.estado !== "rechazado" && (
              <button
                className="choice"
                data-on={m.estado !== "apagado"}
                onClick={() => void apagarMod(m.id, m.estado !== "apagado").then(releer)}
              >
                {m.estado === "apagado" ? t("Encender") : t("Apagar")}
              </button>
            )}
            {quitando === m.id ? (
              <>
                <button className="choice" onClick={() => quitar(m.id)}>
                  {t("Sí, a la papelera")}
                </button>
                <button className="choice" onClick={() => setQuitando(null)}>
                  {t("No")}
                </button>
              </>
            ) : (
              <button className="choice" onClick={() => setQuitando(m.id)}>
                {t("Quitar")}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
