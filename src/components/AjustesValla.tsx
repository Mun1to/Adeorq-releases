// Ajustes › Terminales › Valla del ratón (de Klipse; encargo «Cajas aparte», 2026-11-15):
// encierra el ratón en una pantalla o en una ventana para que un agente que lo mueve no se
// salga de ahí. La lleva `valla.rs` (la repone, sigue a la ventana, Ctrl+Alt+L la quita);
// esto solo la enseña. Solo en Windows: fuera, no sale.

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../lib/i18n";
import {
  EVENTO_VALLA,
  type EstadoValla,
  type Pantalla,
  type Sitios,
  vallaEstado,
  vallaPoner,
  vallaQuitar,
  vallaSitios,
} from "../lib/valla";

export default function AjustesValla() {
  const { t } = useT();
  const [estado, setEstado] = useState<EstadoValla | null>(null);
  const [sitios, setSitios] = useState<Sitios | null>(null);
  /** La lista de ventanas, abierta. Se lee al abrirla: las ventanas cambian cada rato. */
  const [eligiendo, setEligiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vallaEstado()
      .then(setEstado)
      .catch(() => setEstado(null));
    vallaSitios()
      .then(setSitios)
      .catch(() => {});
    const dejar = listen<EstadoValla>(EVENTO_VALLA, (e) => setEstado(e.payload));
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  if (!estado?.disponible) return null;

  const poner = (donde: { pantalla?: number; ventana?: number }) => {
    setError(null);
    vallaPoner(donde)
      .then((e) => {
        setEstado(e);
        setEligiendo(false);
      })
      .catch((e) => setError(String(e)));
  };

  const quitar = () => {
    vallaQuitar()
      .then(setEstado)
      .catch((e) => setError(String(e)));
  };

  const elegirVentana = () => {
    if (eligiendo) {
      setEligiendo(false);
      return;
    }
    setEligiendo(true);
    vallaSitios()
      .then(setSitios)
      .catch((e) => setError(String(e)));
  };

  const detalle = (p: Pantalla) =>
    [`${p.ancho} × ${p.alto}`, p.principal && t("la principal"), p.raton && t("aquí tienes el ratón")]
      .filter(Boolean)
      .join(", ");

  const puesta = estado.puesta;

  return (
    <section className="panel-card">
      <h2>{t("Valla del ratón")}</h2>
      <p className="card-hint">
        {t("Encierra el ratón en una pantalla o en una ventana, para que un agente que lo mueve ")}
        <b>{t("no se salga de ahí")}</b>
        {t(". Se quita con ")}
        <b>Ctrl+Alt+L</b>
        {t(", aunque el ratón no llegue a este botón.")}
      </p>
      {error && <p className="card-hint">{error}</p>}
      {!puesta && estado.motivo === "atajo" && <p className="card-hint">{t("Se quitó con Ctrl+Alt+L.")}</p>}
      {!puesta && estado.motivo === "ventanaFuera" && (
        <p className="card-hint">{t("Se quitó sola: la ventana se minimizó o se cerró.")}</p>
      )}
      {/* Todas las filas siempre a la vista: la puesta dice que lo está y se quita
          desde su fila, y «Encerrar aquí» en otra la cambia de sitio. */}
      {sitios?.pantallas.map((p) => {
        const aqui = puesta?.pantalla === p.n;
        return (
          <div className="mcp-cliente" key={p.n}>
            <div className="mcp-cliente-quien">
              <b>{t("Pantalla {n}", { n: p.n })}</b>
              <span>{aqui ? <b>{t("Puesta: el ratón no sale de esta pantalla.")}</b> : detalle(p)}</span>
            </div>
            <div className="chip-row">
              <button className="choice" onClick={() => (aqui ? quitar() : poner({ pantalla: p.n }))}>
                {aqui ? t("Quitar") : t("Encerrar aquí")}
              </button>
            </div>
          </div>
        );
      })}
      <div className="mcp-cliente">
        <div className="mcp-cliente-quien">
          <b>{puesta?.ventana != null ? `«${puesta.nombre}»` : t("Una ventana")}</b>
          <span>
            {puesta?.ventana != null ? (
              <b>{t("Puesta: se suelta sola si minimizas o cierras la ventana.")}</b>
            ) : (
              t("El ratón no sale de ella, y la sigue si la mueves.")
            )}
          </span>
        </div>
        <div className="chip-row">
          {puesta?.ventana != null ? (
            <button className="choice" onClick={() => quitar()}>
              {t("Quitar")}
            </button>
          ) : (
            <button className="choice" data-on={eligiendo} onClick={() => elegirVentana()}>
              {t("Elegir")}
            </button>
          )}
        </div>
      </div>
      {eligiendo && sitios?.ventanas.length === 0 && <p className="card-hint">{t("No hay ninguna ventana a la vista.")}</p>}
      {/* Su propio bloque, a lo ancho y en dos columnas: suelta en la rejilla de la
          tarjeta, se mezclaba con las pantallas. */}
      {eligiendo && !!sitios?.ventanas.length && (
        <div className="cab-lista">
          {sitios.ventanas.map((v) => (
            <div className="mcp-cliente" key={v.id}>
              <div className="mcp-cliente-quien">
                <b>{v.titulo}</b>
                {v.app && <span>{v.app}</span>}
              </div>
              <div className="chip-row">
                <button className="choice" onClick={() => poner({ ventana: v.id })}>
                  {t("Encerrar aquí")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
