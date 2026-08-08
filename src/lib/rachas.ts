// Las cuentas de la pantalla de bienvenida: días seguidos, hora punta, favorito.
//
// Vive aparte del componente porque son reglas con casos límite de verdad (¿una
// racha se rompe si hoy no has trabajado todavía? ¿y el 1 de marzo de un año
// bisiesto?), y esas se enumeran y se prueban (`scripts/rachas-check.ts`) en vez
// de mirarlas en pantalla y opinar.
//
// Los datos salen del `stats-cache.json` que el propio Claude Code mantiene, ya
// sumado entre cuentas por `usage::stats_historia`. Aquí no se inventa ninguno:
// un día que no está en la lista es un día que no se trabajó.

export interface DiaUso {
  /** `AAAA-MM-DD`. En ese formato el orden de texto ES el de calendario. */
  fecha: string;
  mensajes: number;
  sesiones: number;
  tokens: number;
}

export interface Historia {
  dias: DiaUso[];
  total_sesiones: number;
  total_mensajes: number;
  por_modelo: { model: string; tokens: number }[];
  horas: number[];
  desde: string;
  calculado: string;
  cuentas: number;
}

/** Un día en número, para poder restar. Cuenta días desde la época, en UTC. */
function num(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
}

/** La fecha de hoy en el mismo formato, en la hora del reloj de casa. */
export function hoyLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Días seguidos trabajando hasta hoy.
 *
 * Cuenta hacia atrás desde HOY, y si hoy no hay nada, desde AYER: a media
 * mañana todavía no has abierto nada y decir que llevas cero días seguidos
 * sería castigarte por madrugar poco. Se rompe en el primer día sin trabajo.
 */
export function rachaActual(fechas: string[], hoy: string): number {
  const dias = new Set(fechas.map(num).filter((n): n is number => n !== null));
  const h = num(hoy);
  if (h === null || dias.size === 0) return 0;
  let cursor = dias.has(h) ? h : h - 1;
  if (!dias.has(cursor)) return 0;
  let n = 0;
  while (dias.has(cursor)) {
    n++;
    cursor--;
  }
  return n;
}

/** La racha más larga que hubo nunca, se haya roto o no. */
export function rachaMasLarga(fechas: string[]): number {
  const dias = [...new Set(fechas.map(num).filter((n): n is number => n !== null))].sort(
    (a, b) => a - b,
  );
  let mejor = 0;
  let actual = 0;
  let previo: number | null = null;
  for (const d of dias) {
    actual = previo !== null && d === previo + 1 ? actual + 1 : 1;
    if (actual > mejor) mejor = actual;
    previo = d;
  }
  return mejor;
}

/**
 * La hora a la que más se trabaja, de 0 a 23. `null` si no hay ni un dato.
 *
 * A igualdad gana la más temprana y no la primera que salga del bucle, para que
 * dos ejecuciones con los mismos datos digan siempre lo mismo.
 */
export function horaPunta(horas: number[]): number | null {
  let mejor: number | null = null;
  for (let i = 0; i < horas.length && i < 24; i++) {
    if (!horas[i]) continue;
    if (mejor === null || horas[i] > horas[mejor]) mejor = i;
  }
  return mejor;
}

/** «2 AM», como lo diría cualquiera. */
export function horaBonita(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/**
 * Los últimos `semanas` × 7 días, en columnas de semana para el mapa de calor,
 * y con el nivel ya decidido (0 a 4).
 *
 * El nivel se reparte por CUARTILES de lo que hay, no con números fijos: un día
 * de 2 millones de tokens es flojo aquí y sería el récord en otro sitio. Con
 * umbrales fijos, el mapa saldría entero del mismo color.
 */
export function mapaDeCalor(
  dias: DiaUso[],
  hoy: string,
  semanas = 9,
): { fecha: string; nivel: number; tokens: number }[] {
  const h = num(hoy);
  if (h === null) return [];
  const porDia = new Map<number, DiaUso>();
  for (const d of dias) {
    const n = num(d.fecha);
    if (n !== null) porDia.set(n, d);
  }
  const activos = [...porDia.values()].map((d) => d.tokens).filter((t) => t > 0).sort((a, b) => a - b);
  const corte = (p: number) => activos[Math.floor(activos.length * p)] ?? 0;
  const c1 = corte(0.25);
  const c2 = corte(0.5);
  const c3 = corte(0.75);

  const total = semanas * 7;
  const out: { fecha: string; nivel: number; tokens: number }[] = [];
  for (let i = total - 1; i >= 0; i--) {
    const n = h - i;
    const d = porDia.get(n);
    const tokens = d?.tokens ?? 0;
    // Un día con trabajo pero sin tokens contados (los hay: el CLI apunta los
    // mensajes antes que los tokens) vale 1, o saldría igual que uno en blanco.
    let nivel = 0;
    if (d && tokens === 0) nivel = 1;
    // El corte alto va con `<` y no con `<=`, y no es un detalle: `c3` ES el
    // día más cargado que hay, así que con `<=` el récord caía en el nivel 3 y
    // el 4 no lo alcanzaba nadie nunca.
    else if (tokens > 0) nivel = tokens <= c1 ? 1 : tokens <= c2 ? 2 : tokens < c3 ? 3 : 4;
    out.push({ fecha: new Date(n * 86_400_000).toISOString().slice(0, 10), nivel, tokens });
  }
  return out;
}

/** «131.0M», «122,3k», «174». Para que un número enorme se lea de un vistazo. */
export function cifra(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("es-ES");
}
