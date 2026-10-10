// El aviso al cerrar la ventana, y su ajuste. Lo que decide está en
// `lib/alCerrar.ts`; quien para el cierre y esconde la ventana, en `cierre.rs`.

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useCabina } from "../lib/cabina";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";
import {
  PEDIDO,
  cierreAcuse,
  cierreAFondo,
  cierrePuedeFondo,
  cierreSalir,
  fraseDeLoAbierto,
  guardarAlCerrar,
  leerAlCerrar,
  queHacer,
  recuento,
  type Abierto,
  type AlCerrar as Modo,
} from "../lib/alCerrar";

/**
 * Oye la X de la ventana y hace lo que toque: cerrar, esconderse o preguntar.
 *
 * No pinta nada hasta que hay que preguntar. Va montado una sola vez en `App`,
 * así que en una ventana suelta (que no monta `App`) no existe, y cerrarla no
 * pregunta nada.
 */
export default function AlCerrar() {
  const { t } = useT();
  const [aviso, setAviso] = useState<Abierto | null>(null);
  const [fijar, setFijar] = useState(false);
  const [fallo, setFallo] = useState("");
  const [puedeFondo, setPuedeFondo] = useState(true);
  const bajoEnVelo = useRef(false);

  const aFondo = (abierto: Abierto) =>
    cierreAFondo({
      abrir: t("Abrir Adeorq"),
      salir: t("Cerrar Adeorq del todo"),
      pista: t("Adeorq sigue en segundo plano"),
    }).then(
      () => setAviso(null),
      // Si no se pudo esconder, la X no puede quedarse en nada: se pregunta,
      // con el motivo delante.
      (e) => {
        setFallo(String(e));
        setAviso(abierto);
      },
    );

  // El oyente se monta una vez y lee lo último por aquí.
  const alPedir = useRef<() => void>(() => {});
  alPedir.current = () => {
    void cierreAcuse();
    const abierto = recuento(useCabina.getState().estados);
    const paso = queHacer(leerAlCerrar(), abierto, puedeFondo);
    if (paso === "cerrar") void cierreSalir();
    else if (paso === "fondo") void aFondo(abierto);
    else {
      setFijar(false);
      setFallo("");
      setAviso(abierto);
    }
  };

  useEffect(() => {
    void cierrePuedeFondo().then(setPuedeFondo, () => {});
    const quitar = listen(PEDIDO, () => alPedir.current());
    return () => {
      void quitar.then((f) => f());
    };
  }, []);

  const cancelar = () => setAviso(null);
  useEffect(() => {
    if (!aviso) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancelar();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [aviso]);

  if (!aviso) return null;

  const elegir = (paso: "fondo" | "cerrar") => {
    if (fijar) guardarAlCerrar(paso);
    if (paso === "cerrar") void cierreSalir();
    else void aFondo(aviso);
  };

  return (
    <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, cancelar)}>
      <div
        className="modal al-cerrar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="al-cerrar-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title" id="al-cerrar-titulo">
          {t("¿Cerrar Adeorq?")}
        </h3>
        <p className="modal-text">{fraseDeLoAbierto(t, aviso)}</p>
        <p className="modal-text modal-dim">
          {puedeFondo
            ? t(
                "En segundo plano la ventana se esconde y los agentes siguen trabajando; Adeorq se queda junto al reloj de Windows y vuelves con un clic. Si cierras todo se cierran también las terminales, y luego puedes retomar cada sesión.",
              )
            : t("Si cierras se cierran también las terminales, y luego puedes retomar cada sesión.")}
        </p>
        {fallo && <p className="modal-warn-note">{fallo}</p>}
        <label className="al-cerrar-fijar">
          <input type="checkbox" checked={fijar} onChange={(e) => setFijar(e.currentTarget.checked)} />
          {t("No volver a preguntar")}
        </label>
        <div className="modal-actions">
          <button className="mini modal-cancel" onClick={() => cancelar()}>
            {t("Cancelar")}
          </button>
          <button className="mini modal-cancel" data-paso="cerrar" autoFocus={!puedeFondo} onClick={() => elegir("cerrar")}>
            {t("Cerrar todo")}
          </button>
          {puedeFondo && (
            <button className="np-btn" data-paso="fondo" autoFocus onClick={() => elegir("fondo")}>
              {t("Seguir en segundo plano")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const OPCIONES: Array<[Modo, string]> = [
  ["preguntar", "Preguntar cada vez"],
  ["fondo", "Seguir en segundo plano"],
  ["cerrar", "Cerrar todo"],
];

/** El mismo ajuste, en Ajustes: para cambiar un «no volver a preguntar». */
export function AjusteAlCerrar() {
  const { t } = useT();
  const [modo, setModo] = useState<Modo>(leerAlCerrar);
  const [puedeFondo, setPuedeFondo] = useState(true);
  useEffect(() => {
    void cierrePuedeFondo().then(setPuedeFondo, () => {});
  }, []);
  // Donde no hay segundo plano no hay nada que elegir: la X cierra.
  if (!puedeFondo) return null;
  return (
    <section className="panel-card">
      <h2>{t("Al cerrar la ventana")}</h2>
      <p className="card-hint">
        {t(
          "Qué pasa cuando le das a la X con terminales abiertas. En segundo plano la ventana se esconde, los agentes siguen trabajando y Adeorq se queda junto al reloj de Windows: desde ahí vuelves con un clic o lo cierras del todo.",
        )}
      </p>
      <div className="chip-row">
        {OPCIONES.map(([id, etiqueta]) => (
          <button
            key={id}
            className="choice"
            data-al-cerrar={id}
            data-on={modo === id}
            onClick={() => {
              guardarAlCerrar(id);
              setModo(id);
            }}
          >
            {t(etiqueta)}
          </button>
        ))}
      </div>
    </section>
  );
}
