// Ajustes › Avisos › Sonidos: el volumen de todo lo que suena, qué momentos
// suenan y, si quieres, un sonido tuyo para cada uno. Lo pidió Munir el
// 2026-11-20 al elegir los sonidos de la segunda ronda: «preguntar a los
// usuarios de Adeorq configuración» y «que también puedan añadir sus sonidos
// personalizados». Las reglas viven en `lib/sonidos.ts`; esto solo las enseña.

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import {
  guardarAjustes,
  leerAjustes,
  nombreDelPropio,
  OCASIONES,
  ponerPropio,
  probar,
  quitarPropio,
  type AjustesSonido,
  type Ocasion,
} from "../lib/sonidos";
import { FolderIcon, PlayIcon, UndoIcon } from "./Icons";

/** Qué es cada momento, con sus palabras de la página donde los eligió. */
const QUE: Record<Ocasion, { nombre: string; cuando: string }> = {
  termina: { nombre: "Un agente termina", cuando: "Dos notas que bajan. Sigue lo que digas en «Avisos», arriba." },
  pregunta: { nombre: "Un agente te pregunta", cuando: "Dos notas que suben. Sigue lo que digas en «Avisos», arriba." },
  pin: { nombre: "El escudo te pide el PIN", cuando: "Un agente se queda parado hasta que firmas con tu PIN de Windows." },
  decision: { nombre: "Una decisión nueva", cuando: "Un agente te deja preguntas en Decisiones." },
  adeo: { nombre: "Adeo te contesta", cuando: "Solo si no estás mirando el chat." },
  falla: { nombre: "Algo falla", cuando: "Una terminal se cae o un encargo programado se para." },
  actualizacion: { nombre: "Hay una versión nueva", cuando: "Una vez por versión, cuando está lista para instalar." },
  relevo: { nombre: "Cambio de cuenta", cuando: "Una cuenta se queda sin cuota y Adeorq pasa la terminal a otra." },
  temporizador: { nombre: "Acaba un temporizador", cuando: "Suena aunque estés mirando la ventana." },
  fijar: { nombre: "Fijar y clavar", cuando: "Al fijar arriba una sesión o clavar algo al tablero. Más bajo, porque lo haces tú." },
};

const MOTIVO: Record<string, string> = {
  grande: "Ese archivo pasa de 3 MB: para un aviso bastan unos segundos.",
  ilegible: "Ese archivo no es un sonido que se pueda leer. Vale wav, mp3 u ogg.",
  guardar: "No se pudo guardar en este equipo. Prueba con un archivo más pequeño.",
};

/** Las teclas que mueven un deslizador: llegar a él con Tab no tiene que sonar. */
const MUEVEN = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export default function AjustesSonidos() {
  const { t } = useT();
  const [a, setA] = useState<AjustesSonido>(leerAjustes);
  /** El nombre del archivo de cada sonido propio, leído de IndexedDB. */
  const [nombres, setNombres] = useState<Partial<Record<Ocasion, string>>>({});
  const [error, setError] = useState<{ o: Ocasion; texto: string } | null>(null);
  const [eligiendo, setEligiendo] = useState<Ocasion | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    void Promise.all(OCASIONES.filter((o) => a.propios[o] !== undefined).map(async (o) => [o, await nombreDelPropio(o)] as const)).then(
      (pares) => {
        if (!vivo) return;
        const n: Partial<Record<Ocasion, string>> = {};
        for (const [o, nombre] of pares) if (nombre) n[o] = nombre;
        setNombres(n);
      },
    );
    return () => {
      vivo = false;
    };
  }, [a.propios]);

  const cambiar = (b: AjustesSonido) => {
    guardarAjustes(b);
    setA(b);
  };

  const elegido = async (f: File | undefined) => {
    const o = eligiendo;
    setEligiendo(null);
    if (!f || !o) return;
    const motivo = await ponerPropio(o, f);
    if (motivo) {
      setError({ o, texto: MOTIVO[motivo] ?? MOTIVO.ilegible });
      return;
    }
    setError(null);
    const b = leerAjustes();
    setA(b);
    probar(o, b.volumen);
  };

  return (
    <section className="panel-card">
      <h2>{t("Sonidos")}</h2>
      <p className="card-hint">
        {t(
          "Cada momento tiene su sonido, y todos suenan igual de fuertes. Puedes apagar los que no quieras o poner uno tuyo: se iguala solo al ponerlo, para que ninguno te dé un susto.",
        )}
      </p>
      <label className="setting-row">
        <span>{t("Volumen de los sonidos")}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(a.volumen * 100)}
          onChange={(e) => cambiar({ ...a, volumen: Number(e.currentTarget.value) / 100 })}
          onPointerUp={() => probar("termina")}
          onKeyUp={(e) => MUEVEN.has(e.key) && probar("termina")}
        />
        <span className="setting-value">{Math.round(a.volumen * 100)} %</span>
      </label>
      <ul className="cab-lista">
        {OCASIONES.map((o) => {
          const apagada = a.apagados.includes(o);
          const propio = a.propios[o] !== undefined;
          return (
            <li key={o} className="cab-fila parte-fila sonido-fila" data-fuera={apagada || undefined}>
              <span className="cab-nombre">
                {t(QUE[o].nombre)}
                <small>{t(QUE[o].cuando)}</small>
                {propio && (
                  <small className="sonido-propio">
                    {t("Suena tu sonido: {nombre}", { nombre: nombres[o] ?? t("un archivo tuyo") })}
                  </small>
                )}
                {/* Siempre montado y vacío hasta que algo falla: un lector de
                    pantalla solo anuncia con fiabilidad lo que CAMBIA dentro de
                    un `role="status"` que ya estaba. */}
                <small className="parte-aviso" role="status">
                  {error?.o === o ? t(error.texto) : ""}
                </small>
              </span>
              <button
                type="button"
                className="mini icono"
                aria-label={t("Oír «{nombre}»", { nombre: t(QUE[o].nombre) })}
                data-tip={t("Oírlo")}
                onClick={() => probar(o)}
              >
                <PlayIcon size={14} />
              </button>
              {/* De icono y sueltos, como las flechas de «La cabecera»: diez
                  botones con texto y recuadro eran diez cárceles en fila. */}
              {propio ? (
                <button
                  type="button"
                  className="mini icono"
                  aria-label={t("Volver al de Adeorq en «{nombre}»", { nombre: t(QUE[o].nombre) })}
                  data-tip={t("Volver al de Adeorq")}
                  onClick={() => {
                    setError(null);
                    void quitarPropio(o).then(() => setA(leerAjustes()));
                  }}
                >
                  <UndoIcon size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  className="mini icono"
                  aria-label={t("Poner uno tuyo en «{nombre}»", { nombre: t(QUE[o].nombre) })}
                  data-tip={t("Poner uno tuyo")}
                  onClick={() => {
                    setEligiendo(o);
                    archivo.current?.click();
                  }}
                >
                  <FolderIcon size={14} />
                </button>
              )}
              <input
                type="checkbox"
                checked={!apagada}
                aria-label={t(QUE[o].nombre)}
                onChange={() =>
                  cambiar({ ...a, apagados: apagada ? a.apagados.filter((x) => x !== o) : [...a.apagados, o] })
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="card-hint">
        {t("Un sonido tuyo puede ser wav, mp3 u ogg de hasta 3 MB, y suena como mucho cinco segundos.")}
      </p>
      <input
        ref={archivo}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.flac"
        hidden
        onChange={(e) => {
          void elegido(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
