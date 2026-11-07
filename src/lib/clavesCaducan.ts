// Lo que el front sabe de si una clave de agente caduca (`claves_caducan.rs`):
// la fecha para leerla y dónde se crea una nueva en cada servicio. Sin valores.

import type { Lang } from "./i18n";

/** Lo que Rust apunta de cada clave, sin su valor. */
export interface Caducidad {
  servicio: "cloudflare" | "github" | "supabase" | "vercel" | null;
  /** Segundos desde 1970, si el servicio lo dice. */
  caduca: number | null;
  /** `null`: todavía no se ha podido saber. */
  vale: boolean | null;
  comprobado: number;
}

/** El nombre de cada servicio como lo escribe él. */
export const NOMBRE_SERVICIO: Record<string, string> = {
  cloudflare: "Cloudflare",
  github: "GitHub",
  supabase: "Supabase",
  vercel: "Vercel",
};

/** Dónde se crea una nueva en cada servicio, con los nombres de su pantalla. */
export const DONDE_SE_CREA: Record<string, string> = {
  Cloudflare: "Mi perfil › Tokens de API",
  GitHub: "Settings › Developer settings › Personal access tokens",
  Supabase: "Account › Access Tokens",
  Vercel: "Account Settings › Tokens",
};

/** «12 de diciembre», con el año solo si no es este. */
export function fechaDeClave(seg: number, lang: Lang): string {
  const d = new Date(seg * 1000);
  const mismoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    day: "numeric",
    month: "long",
    ...(mismoAno ? {} : { year: "numeric" }),
  });
}

/** Ya no vale: su servicio la rechazó o su fecha ya pasó. */
export function muerta(c: Caducidad, ahora = Date.now() / 1000): boolean {
  return c.vale === false || (c.caduca != null && c.caduca <= ahora);
}
