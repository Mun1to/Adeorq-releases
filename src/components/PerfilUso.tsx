// Tu uso dentro del Perfil, debajo de la tarjeta: la cifra, el porfolio, el año
// en casillas y el mes. Lo monta `PerfilView.tsx` en cuanto existe este archivo.
//
// Lo que eligió Munir (2026-10-17): la cifra grande CON la caché y «Nuevos»
// debajo (D3); el año en casillas tipo GitHub y el mes en cuadrados pequeños
// SIN el número del día, solo los tokens (el plano de
// https://claude.ai/artifact/DSLTZrkb2PU1zY2tjQ9ciK). Después, con las opciones
// delante: el porfolio en UNA lista con pestañas (A4); la cifra y el porfolio
// cuentan SIEMPRE el mes en curso, sin elegir periodo; los tokens con K, M y B;
// tu récord de un día; y tocar un día abre la tarjeta de ese día con su editor
// (la tarjeta es de `PerfilTarjeta.tsx`, que escucha `adeorq:abrir-tarjeta`).
//
// Y el 2026-10-18, tras enseñar el Perfil en un Discord («it is too noisy»,
// «those bars has to go», «with color scales»), eligió entre tres variantes
// con sus datos: las barras del porfolio se quedan, pero TODAS de un solo
// color (el acento) y sin el punto de color de cada fila; la cifra dentro de
// cada día del mes se queda; el año como estaba, solo con el color calmado; y
// el bloque entero sin borde.
//
// Las cuentas y su prueba están en `lib/usoDelPerfil.ts` (`pnpm bancos
// usoDelPerfil`); la pieza en la ventana, en `scripts/laboratorio/perfil-uso.js`.
//
// La primera lectura de sus transcripts tarda un minuto largo (4,7 GB): se
// pinta la rueda de `Espera`, nunca la página vacía, y lo leído se queda en
// `lib/historiaDeUso.ts` para que volver al Perfil enseñe lo de antes mientras
// se relee (y para que la tarjeta no lo vuelva a pedir).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Account } from "../lib/pty";
import { cuentasQueLeer, historiaLeida, leerHistoria } from "../lib/historiaDeUso";
import { useEspera } from "../lib/espera";
import { useT, type Translate } from "../lib/i18n";
import {
  casillasDelAnio,
  cifra,
  conDia,
  cortes,
  entre,
  fechaLarga,
  fechaLocal,
  inicialesSemana,
  mesConTokens,
  mesEnCurso,
  nombreDelMes,
  porcentaje,
  porDia,
  porfolio,
  record,
  SEMANAS,
  sumar,
  type Casilla,
  type Eje,
  type Historia,
  type Parte,
} from "../lib/usoDelPerfil";
import { comoFecha, diasDelMes, mesVecino } from "../lib/calendario";
import { ChevronIcon, CompartirIcon } from "./Icons";
import Espera from "./Espera";

const EJES: { key: Eje; label: string }[] = [
  { key: "proveedor", label: "Proveedores" },
  { key: "modelo", label: "Modelos" },
  { key: "proyecto", label: "Proyectos" },
];

/** Las filas del porfolio, «Otros» incluido: diez, que a lo ancho van en dos
    columnas de cinco. Con cinco en una columna la mitad derecha del bloque se
    quedaba vacía (Munir, 2026-10-18: «esta parte está muy vacía, pon más
    proyectos o algo»). */
const FILAS = 10;

/** Hasta que exista `PerfilTarjeta.tsx` no hay a quién abrir: sin ella no salen los iconos de
    compartir ni la pista, y tocar un día solo lleva a su mes. La 0.9.219 salió así, antes que la
    tarjeta, y en cuanto el archivo existe todo aparece solo. */
const HAY_TARJETA = Object.keys(import.meta.glob("./PerfilTarjeta.tsx")).length > 0;

/** La tarjeta de unos días, con su editor encima de todo: la abre `PerfilTarjeta.tsx`. */
function abrirTarjeta(desde: string, hasta = desde) {
  if (!HAY_TARJETA) return;
  window.dispatchEvent(new CustomEvent("adeorq:abrir-tarjeta", { detail: { desde, hasta } }));
}

/** Los días de un mes que ya han pasado: del 1 al último, o a hoy si es el de ahora. */
function diasPasados(anio: number, mes: number, hoy: string): [string, string] | null {
  const primero = comoFecha(anio, mes, 1);
  if (primero > hoy) return null;
  const ultimo = comoFecha(anio, mes, diasDelMes(anio, mes));
  return [primero, ultimo < hoy ? ultimo : hoy];
}

export default function PerfilUso({ cuentas }: { cuentas: Account[] }) {
  const { t, lang } = useT();
  const [historia, setHistoria] = useState<Historia | null>(historiaLeida);
  const [error, setError] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [eje, setEje] = useState<Eje>("proyecto");
  const hoy = fechaLocal(new Date());
  const [visto, setVisto] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }));

  // La lectura es la de `lib/historiaDeUso.ts`, la misma que toma la tarjeta.
  const clave = JSON.stringify(cuentasQueLeer(cuentas));

  useEffect(() => {
    let vivo = true;
    setLeyendo(true);
    setError("");
    leerHistoria(JSON.parse(clave))
      .then((h) => {
        if (vivo) setHistoria(h);
      })
      .catch((e) => vivo && setError(String(e)))
      .finally(() => vivo && setLeyendo(false));
    return () => {
      vivo = false;
    };
  }, [clave]);

  const releyendo = useEspera(leyendo && historia != null);

  const cubos = useMemo(() => conDia(historia?.cubos ?? []), [historia]);
  const porDias = useMemo(() => porDia(cubos), [cubos]);
  const anio = useMemo(() => casillasDelAnio(hoy, porDias), [hoy, porDias]);
  const corte = useMemo(() => cortes(anio.map((c) => c.tokens)), [anio]);
  const mes = useMemo(() => mesConTokens(visto.anio, visto.mes, porDias, corte), [visto, porDias, corte]);
  const mejor = useMemo(() => record(porDias), [porDias]);
  const [desde, hasta] = mesEnCurso(hoy);
  const delMes = useMemo(() => entre(cubos, desde, hasta), [cubos, desde, hasta]);
  const suma = useMemo(() => sumar(delMes), [delMes]);
  const filas = useMemo(() => porfolio(delMes, eje, FILAS), [delMes, eje]);

  if (!historia) {
    return (
      <section className="pu" aria-label={t("Tu uso")}>
        {error ? (
          <p className="pu-error">{t("No se pudo leer tu uso: {e}", { e: error })}</p>
        ) : (
          <Espera activo={leyendo}>{t("Leyendo tus conversaciones… la primera vez tarda un minuto.")}</Espera>
        )}
      </section>
    );
  }

  const tocarDia = (fecha: string) => {
    setVisto({ anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) });
    abrirTarjeta(fecha);
  };
  const moverMes = (paso: number) => setVisto((v) => mesVecino(v.anio, v.mes, paso));
  const esteMes = nombreDelMes(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), lang);
  const elVisto = nombreDelMes(visto.anio, visto.mes, lang);
  const delVisto = diasPasados(visto.anio, visto.mes, hoy);

  return (
    <section className="pu" aria-label={t("Tu uso")} data-espera={releyendo || undefined}>
      <div className="pu-cifra">
        {HAY_TARJETA && (
          <button
            className="pu-compartir"
            data-tip={t("Compartir {mes}", { mes: esteMes })}
            aria-label={t("Compartir {mes}", { mes: esteMes })}
            onClick={() => abrirTarjeta(desde, hasta)}
          >
            <CompartirIcon size={16} />
          </button>
        )}
        <b>{cifra(suma.todos, lang)}</b>
        <em>{t("Tokens en {mes}", { mes: esteMes })}</em>
        <span className="pu-fila">
          <span
            className="pu-nuevos"
            data-tip={t("La caché es la conversación que el modelo relee en cada respuesta: la cifra grande la cuenta, «Nuevos» no.")}
          >
            {t("Nuevos")} <b>{cifra(suma.nuevos, lang)}</b>
          </span>
          <span>
            {t("Días activos")} <b>{suma.dias}</b>
          </span>
          {mejor && (
            <button
              className="pu-record"
              data-tip={HAY_TARJETA ? t("Tu día de más tokens. Tócalo para abrir su tarjeta.") : undefined}
              onClick={() => tocarDia(mejor.fecha)}
            >
              {t("Récord")} <b>{cifra(mejor.tokens, lang)}</b> {t("el {fecha}", { fecha: fechaLarga(mejor.fecha, lang) })}
            </button>
          )}
        </span>
      </div>

      <div className="pu-porfolio">
        <div className="pu-pestanas" role="tablist" aria-label={t("Tu porfolio")}>
          {EJES.map((e) => (
            <button key={e.key} role="tab" aria-selected={eje === e.key} onClick={() => setEje(e.key)}>
              {t(e.label)}
            </button>
          ))}
        </div>
        {filas.length ? (
          <Lista filas={filas} t={t} lang={lang} />
        ) : (
          <p className="pu-nada">{t("Este mes todavía no hay uso.")}</p>
        )}
      </div>

      <div className="pu-cal">
        <div className="pu-anio-caja">
          <h3 className="pu-titulo">{t("El año")}</h3>
          <div className="pu-anio-scroll">
            <div className="pu-anio" style={{ "--semanas": SEMANAS } as CSSProperties}>
              {anio.map((c) => (
                <button
                  key={c.fecha}
                  data-celda
                  data-n={c.nivel}
                  data-hoy={c.fecha === hoy || undefined}
                  data-tip={titulo(c, t, lang)}
                  aria-label={titulo(c, t, lang)}
                  disabled={c.tokens <= 0}
                  onClick={() => tocarDia(c.fecha)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="pu-mes-caja">
          <div className="pu-mes-cab">
            <h3 className="pu-titulo">{elVisto}</h3>
            {HAY_TARJETA && (
              <button
                className="pu-mover"
                data-tip={t("Compartir {mes}", { mes: elVisto })}
                aria-label={t("Compartir {mes}", { mes: elVisto })}
                disabled={!delVisto}
                onClick={() => delVisto && abrirTarjeta(...delVisto)}
              >
                <CompartirIcon size={13} />
              </button>
            )}
            <button className="pu-mover" data-tip={t("El mes anterior")} aria-label={t("El mes anterior")} onClick={() => moverMes(-1)}>
              <ChevronIcon size={13} izq />
            </button>
            <button className="pu-mover" data-tip={t("El mes siguiente")} aria-label={t("El mes siguiente")} onClick={() => moverMes(1)}>
              <ChevronIcon size={13} der />
            </button>
          </div>
          <div className="pu-mes">
            {inicialesSemana(lang).map((d, i) => (
              <em key={i}>{d}</em>
            ))}
            {Array.from({ length: mes.antes }, (_, i) => (
              <span key={`v${i}`} className="pu-vacio" />
            ))}
            {mes.dias.map((d) => (
              <button
                key={d.fecha}
                data-celda
                data-n={d.nivel}
                data-hoy={d.fecha === hoy || undefined}
                data-tip={titulo(d, t, lang)}
                aria-label={titulo(d, t, lang)}
                disabled={d.tokens <= 0}
                onClick={() => tocarDia(d.fecha)}
              >
                {d.tokens > 0 ? cifra(d.tokens, lang) : ""}
              </button>
            ))}
          </div>
          {HAY_TARJETA && <p className="pu-pista">{t("Toca un día para abrir su tarjeta.")}</p>}
        </div>
      </div>
    </section>
  );
}

/** «17 de octubre de 2026: 956 M tokens». */
function titulo(c: Casilla, t: Translate, lang: "es" | "en"): string {
  const f = fechaLarga(c.fecha, lang);
  return c.tokens > 0 ? t("{fecha}: {n} tokens", { fecha: f, n: cifra(c.tokens, lang) }) : t("{fecha}: sin uso", { fecha: f });
}

/** Las filas del porfolio: nombre, barra, cifra y parte. La barra va en el
    color del tema, el mismo para todas: el color de cada proyecto o CLI
    (rosa, verde, violeta) era «a lot of colors» (Munir, 2026-10-18, «solo un
    color, quita el cuadradito de la izquierda»). A lo ancho van en dos
    columnas que se leen de arriba abajo, primero una y luego la otra:
    `--filas` es lo que mide cada una. */
function Lista({ filas, t, lang }: { filas: Parte[]; t: Translate; lang: "es" | "en" }) {
  return (
    <div className="pu-lista" role="tabpanel" style={{ "--filas": Math.ceil(filas.length / 2) } as CSSProperties}>
      {filas.map((f) => (
        <div key={f.otros ? "otros" : `p:${f.clave}`} className="pu-parte" style={{ "--w": `${(f.parte * 100).toFixed(1)}%` } as CSSProperties}>
          <span className="pu-parte-nombre">{f.otros ? t("Otros") : f.nombre || t("Sin carpeta")}</span>
          <i aria-hidden="true" />
          <em>{cifra(f.tokens, lang)}</em>
          <b>{porcentaje(f.parte, lang)}</b>
        </div>
      ))}
    </div>
  );
}
