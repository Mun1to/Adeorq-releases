// Avisar a un bot, del lado de la ventana. Lo que decide qué se manda, cuándo y
// a dónde está en Rust (`src-tauri/src/bots.rs`); esto solo lo pide y lo enseña.
//
// La clave del webhook de Grok Bot entra por `botsClavePoner` y no vuelve: la
// ventana solo sabe SI hay una (`clave_grok`).

import { invoke } from "@tauri-apps/api/core";

export interface AjustesDeBots {
  grok: { activo: boolean; url: string };
  hermes: { activo: boolean; destino: string };
  openclaw: { activo: boolean; canal: string; destino: string };
}

export interface ResultadoBot {
  ok: boolean;
  /** Milisegundos Unix. */
  cuando: number;
  error: string | null;
}

export interface EstadoBots {
  ajustes: AjustesDeBots;
  clave_grok: boolean;
  hermes_instalado: boolean;
  openclaw_instalado: boolean;
  /** Por nombre: «Grok Bot», «Hermes», «OpenClaw». */
  ultimos: Record<string, ResultadoBot>;
}

export type DestinoBot = "grok" | "hermes" | "openclaw";

/** Cómo se llama cada destino en `ultimos`. */
export const NOMBRE_BOT: Record<DestinoBot, string> = {
  grok: "Grok Bot",
  hermes: "Hermes",
  openclaw: "OpenClaw",
};

export const botsEstado = () => invoke<EstadoBots>("bots_estado");
export const botsGuardar = (ajustes: AjustesDeBots) => invoke<EstadoBots>("bots_guardar", { ajustes });
export const botsClavePoner = (clave: string) => invoke<EstadoBots>("bots_clave_poner", { clave });
export const botsClaveQuitar = () => invoke<EstadoBots>("bots_clave_quitar");
export const botsProbar = (destino: DestinoBot, ingles: boolean) => invoke<EstadoBots>("bots_probar", { destino, ingles });

/** Quién avisa y qué pasa: lo que `notify.ts` le pasa a Rust. Nunca la pantalla. */
export type EstadoDeAviso = "termino" | "espera";

/**
 * El estado que le toca a un aviso según su clase, o `null` si no es de las
 * dos que le importan a un bot. La clase sale del motivo del `tag` de la
 * campana («12:ask», «12:done»), igual que para el móvil.
 */
export function estadoDeAviso(tag: string): EstadoDeAviso | null {
  if (tag.endsWith(":ask")) return "espera";
  if (tag.endsWith(":done")) return "termino";
  return null;
}

type Traduce = (texto: string, vars?: Record<string, string | number>) => string;

/**
 * Los motivos de Rust salen en español y, los que llevan un dato, con el dato
 * pegado. Se traducen aquí: los fijos tal cual, y los de dato por su forma.
 * Lo que venga de otro programa (su propia última línea de error) se deja como
 * llega.
 */
export function traducirMotivo(motivo: string, t: Traduce): string {
  const m = motivo.trim();
  // «Hermes: falta el destino.»: el destino del que habla, y luego el motivo.
  const de = m.match(/^(Grok Bot|Hermes|OpenClaw): (.+)$/);
  if (de) return `${de[1]}: ${traducirMotivo(de[2], t)}`;
  const con = (re: RegExp, clave: string, nombres: string[]): string | null => {
    const r = m.match(re);
    if (!r) return null;
    return t(clave, Object.fromEntries(nombres.map((n, i) => [n, r[i + 1] ?? ""])));
  };
  const detalle = m.match(/^salió con el código (\d+): (.+)$/);
  if (detalle) return t("salió con el código {c}: {d}", { c: detalle[1], d: detalle[2] });
  return (
    con(/^salió con el código (\d+)$/, "salió con el código {c}", ["c"]) ??
    con(/^no contestó en (\d+) segundos$/, "no contestó en {s} segundos", ["s"]) ??
    con(/^el webhook contestó (\d+)$/, "el webhook contestó {c}", ["c"]) ??
    con(/^el webhook no aceptó la clave \((\d+)\)$/, "el webhook no aceptó la clave ({c})", ["c"]) ??
    con(/^no se pudo llamar al webhook: (.+)$/, "no se pudo llamar al webhook: {d}", ["d"]) ??
    con(/^no se pudo lanzar: (.+)$/, "no se pudo lanzar: {d}", ["d"]) ??
    t(m)
  );
}
