// La tapa de la noche: a la hora de cierre de Ajustes › Salud, la ventana entera
// tapada con un aviso que se pospone con un clic; y antes, una franja que avisa
// sin tapar nada.
//
// Munir, 2026-11-24 (decisión d1a20f78a7b9, A1): «Avisa y tapa la ventana con un
// aviso (se pospone con un clic)», quince minutos antes (B2). Las horas salen de
// `lib/salud.ts` y de nada más; aquí solo se mira cada 30 s, al volver a la
// ventana y cuando otra ventana de Adeorq cambia lo guardado.
//
// Va antes que la ventana roja del escudo en `App.tsx`: con el mismo z-index,
// la que va después queda encima, y un permiso que pide un agente de noche se
// tiene que poder contestar.

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { faseDeSalud, guardarPospuesto, leerPospuesto, leerSalud, posponer, POSPONER_MIN } from "../lib/salud";

/** «1:00», «23:30»: la hora sin el cero de delante, y en los textos entre
    paréntesis y sin artículo: «a las 1:00» y «son las 1:05» están mal dichos. */
const horaDe = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const MIRAR_MS = 30_000;

export default function SaludTapa() {
  const { t } = useT();
  const [ahora, setAhora] = useState(() => Date.now());
  const [pospuesto, setPospuesto] = useState(leerPospuesto);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mirar = () => {
      setAhora(Date.now());
      setPospuesto(leerPospuesto());
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") mirar();
    };
    const id = window.setInterval(mirar, MIRAR_MS);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", mirar);
    window.addEventListener("storage", mirar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", mirar);
      window.removeEventListener("storage", mirar);
    };
  }, []);

  // Se lee en cada vuelta: lo que cambies en Ajustes vale a la siguiente mirada.
  const salud = leerSalud();
  const f = faseDeSalud(ahora, salud, pospuesto);
  const tapada = f.fase === "cerrado";

  // Con la ventana tapada, el foco va al único botón: Intro o espacio posponen.
  useEffect(() => {
    if (tapada) boton.current?.focus();
  }, [tapada]);

  if (f.fase === "libre") return null;

  const mas = () => {
    const momento = Date.now();
    const p = posponer(momento, salud, pospuesto);
    guardarPospuesto(p);
    setPospuesto(p);
    setAhora(momento);
  };
  const otroRato = t("{n} minutos más", { n: POSPONER_MIN });

  if (f.fase === "aviso") {
    return (
      <div className="salud-franja" role="status">
        <span>{t("Se acerca la hora de cierre ({hora}): ve guardando lo tuyo.", { hora: horaDe(f.cierre) })}</span>
        <button type="button" className="mini" onClick={() => mas()}>
          {otroRato}
        </button>
      </div>
    );
  }

  return (
    <div className="modal-overlay salud-tapa" data-sin-mods="" role="dialog" aria-modal="true" aria-labelledby="salud-titulo">
      <div className="modal salud-modal">
        <h3 id="salud-titulo" className="modal-title">
          {t("Hora de descansar")}
        </h3>
        <p className="modal-text">
          {t("Ya pasó la hora que pusiste para cerrar ({hora}). Adeorq se destapa sola a tu hora de despertar ({despierta}).", {
            hora: horaDe(f.cierre),
            despierta: horaDe(f.despierta),
          })}
        </p>
        <div className="modal-actions">
          <button ref={boton} type="button" className="np-btn" onClick={() => mas()}>
            {otroRato}
          </button>
        </div>
      </div>
    </div>
  );
}
