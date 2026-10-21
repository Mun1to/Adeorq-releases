import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useT } from "../lib/i18n";
import type { Account } from "../lib/pty";
import { cuentasQueLeer, historiaLeida, leerHistoria } from "../lib/historiaDeUso";
import {
  casillasDelAnio,
  cifra,
  columnaDe,
  conCache,
  conDia,
  fechaLarga,
  fechaLocal,
  nombreDeModelo,
  porDia,
  sumar,
  type Historia,
} from "../lib/usoDelPerfil";
import { horaBonita, rachaActual, rachaMasLarga } from "../lib/rachas";

// Lo que llevas trabajado, en la pantalla que ves cuando no hay ninguna terminal
// abierta. Antes ahí solo había un botón, y ese hueco es el único momento del
// día en que se puede mirar atrás sin quitar sitio a nada.
//
// Sale de la MISMA lectura que el Perfil y el Panel (`lib/historiaDeUso.ts`):
// tus conversaciones de Claude Code y de Codex, al día. Antes leía el
// `stats-cache.json` de Claude Code, que el CLI dejó de rehacer: en octubre
// seguía diciendo «calculado el 2026-08-18», el mapa de nueve semanas salía
// vacío entero y la racha en cero (Munir, 2026-10-21).
//
// Lo que NO se hace: rellenar huecos ni redondear hacia arriba. Mientras se lee
// y si no hay datos no se pinta la tarjeta, en vez de enseñar ceros que
// parecerían tuyos.

/** Medio año, llenando la tarjeta a lo ancho (Munir, 2026-10-21, la opción 1). */
const SEMANAS_AQUI = 26;

export default function Estadisticas({ cuentas }: { cuentas: Account[] }) {
  const { t, lang } = useT();
  const [h, setH] = useState<Historia | null>(historiaLeida);
  const clave = JSON.stringify(cuentasQueLeer(cuentas));

  useEffect(() => {
    let vivo = true;
    leerHistoria(JSON.parse(clave)).then(
      (x) => vivo && setH(x),
      () => {},
    );
    return () => {
      vivo = false;
    };
  }, [clave]);

  const hoy = fechaLocal(new Date());
  const cubos = useMemo(() => conDia(h?.cubos ?? []), [h]);
  const dias = useMemo(() => porDia(cubos), [cubos]);
  const cifras = useMemo(() => {
    const total = sumar(cubos);
    // La hora punta en la hora de esta ventana: los cubos llegan en UTC.
    const horas = new Array<number>(24).fill(0);
    const modelos = new Map<string, number>();
    for (const c of cubos) {
      const [a, m, d, hh] = c.hora.split(/[-T]/).map(Number);
      horas[new Date(Date.UTC(a, m - 1, d, hh)).getHours()] += c.respuestas;
      const n = c.modelo ? nombreDeModelo(c.modelo) : "";
      if (n) modelos.set(n, (modelos.get(n) ?? 0) + conCache(c));
    }
    const pico = Math.max(...horas);
    const favorito = [...modelos].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
    return { total, punta: pico > 0 ? horas.indexOf(pico) : null, favorito };
  }, [cubos]);
  const casillas = useMemo(
    () => casillasDelAnio(hoy, dias).slice(-((SEMANAS_AQUI - 1) * 7 + columnaDe(hoy) + 1)),
    [hoy, dias],
  );

  if (!h || !dias.size) return null;

  const fechas = [...dias.keys()];
  // `repaso` y no `stats`: ese nombre de clase ya era de las tarjetas del Panel
  // y las dos reglas se pisaban, que es lo que descuadraba esta pantalla entera
  // (el porqué completo está escrito en `App.css`, encima de `.repaso`).
  const dato = (etiqueta: string, valor: string) => (
    <div className="repaso-dato" title={`${etiqueta}: ${valor}`}>
      <span className="repaso-tag">{etiqueta}</span>
      <span className="repaso-val">{valor}</span>
    </div>
  );

  return (
    <div className="repaso">
      <div className="repaso-datos">
        {dato(t("Sesiones"), String(h.sesiones?.length ?? h.archivos))}
        {/* Respuestas del modelo, no mensajes: es lo que cuentan los cubos, y
            llamarlo mensajes lo dejaba en la mitad de lo que decía antes. */}
        {dato(t("Respuestas"), cifra(cifras.total.respuestas, lang))}
        {dato(t("Tokens"), cifra(cifras.total.todos, lang))}
        {dato(t("Días activos"), String(cifras.total.dias))}
        {dato(t("Racha actual"), `${rachaActual(fechas, hoy)}d`)}
        {dato(t("Racha más larga"), `${rachaMasLarga(fechas)}d`)}
        {cifras.punta !== null && dato(t("Hora punta"), horaBonita(cifras.punta))}
        {cifras.favorito && dato(t("Modelo favorito"), cifras.favorito)}
      </div>

      {/* Una columna por semana y la última termina hoy, como el año del
          Perfil, con sus mismos tonos. */}
      <div className="repaso-mapa" style={{ "--semanas": SEMANAS_AQUI } as CSSProperties} aria-hidden="true">
        {casillas.map((c) => (
          <span
            key={c.fecha}
            className="repaso-dia"
            data-n={c.nivel}
            title={`${fechaLarga(c.fecha, lang)} · ${cifra(c.tokens, lang)}`}
          />
        ))}
      </div>

      <p className="repaso-pie">{t("Leído de tus conversaciones de Claude Code y Codex: mirar esto no gasta nada.")}</p>
    </div>
  );
}
