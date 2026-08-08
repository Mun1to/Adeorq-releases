import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../lib/i18n";
import { listAccountDirs } from "../lib/pty";
import {
  cifra,
  horaBonita,
  horaPunta,
  hoyLocal,
  mapaDeCalor,
  rachaActual,
  rachaMasLarga,
  type Historia,
} from "../lib/rachas";

// Lo que llevas trabajado, en la pantalla que ves cuando no hay ninguna terminal
// abierta. Antes ahí solo había un botón, y ese hueco es el único momento del
// día en que se puede mirar atrás sin quitar sitio a nada.
//
// Ni un token gastado: sale del `stats-cache.json` que el propio Claude Code
// mantiene, sumado entre todas tus cuentas por `usage::stats_historia`. Por eso
// no hay nada de Codex aquí y no es un olvido: no publica nada equivalente.
//
// Lo que NO se hace: rellenar huecos ni redondear hacia arriba. Si el archivo
// va tres días por detrás, se dice; si no hay datos, no se pinta la tarjeta en
// vez de enseñar ceros, que parecerían tuyos.

export default function Estadisticas() {
  const { t } = useT();
  const [h, setH] = useState<Historia | null>(null);

  useEffect(() => {
    // Las cuentas extra viven en carpetas propias y cada una lleva su archivo:
    // sin esto, trabajar con dos cuentas partía las cifras en dos mitades que
    // no se veían juntas en ningún sitio.
    void listAccountDirs()
      .catch(() => [] as string[])
      .then((dirs) => invoke<Historia>("stats_historia", { configDirs: dirs }))
      .then(setH)
      .catch(() => {});
  }, []);

  if (!h || !h.dias.length) return null;

  const hoy = hoyLocal();
  const fechas = h.dias.map((d) => d.fecha);
  const racha = rachaActual(fechas, hoy);
  const mejor = rachaMasLarga(fechas);
  const punta = horaPunta(h.horas);
  const tokens = h.dias.reduce((n, d) => n + d.tokens, 0);
  const mapa = mapaDeCalor(h.dias, hoy);
  const favorito = h.por_modelo[0]?.model ?? "";
  // La fecha del archivo, que puede ir por detrás: el CLI no lo rehace en cada
  // turno. Decirlo cuesta una línea y evita que un número viejo pase por nuevo.
  const viejo = h.calculado && h.calculado < hoy ? h.calculado : "";

  const dato = (etiqueta: string, valor: string) => (
    <div className="stat">
      <span className="stat-tag">{etiqueta}</span>
      <span className="stat-val">{valor}</span>
    </div>
  );

  return (
    <div className="stats">
      <div className="stats-rejilla">
        {dato(t("Sesiones"), String(h.total_sesiones))}
        {dato(t("Mensajes"), cifra(h.total_mensajes))}
        {dato(t("Tokens"), cifra(tokens))}
        {dato(t("Días activos"), String(h.dias.length))}
        {dato(t("Racha actual"), `${racha}d`)}
        {dato(t("Racha más larga"), `${mejor}d`)}
        {punta !== null && dato(t("Hora punta"), horaBonita(punta))}
        {favorito && dato(t("Modelo favorito"), favorito)}
      </div>

      {/* Nueve semanas, en columnas: es lo que cabe sin que las casillas se
          hagan ilegibles, y llega para ver una racha de un vistazo. */}
      <div className="stats-mapa" aria-hidden="true">
        {mapa.map((c) => (
          <span key={c.fecha} className="stats-dia" data-n={c.nivel} title={c.fecha} />
        ))}
      </div>

      <p className="stats-pie">
        {h.cuentas > 1 && t("Sumando tus {n} cuentas. ", { n: h.cuentas })}
        {viejo
          ? t("Claude Code calculó esto el {d}; lo de después todavía no está dentro.", { d: viejo })
          : t("Lo lleva Claude Code por su cuenta: mirar esto no gasta nada.")}
      </p>
    </div>
  );
}
