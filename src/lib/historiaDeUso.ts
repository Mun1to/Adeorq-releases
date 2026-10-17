import { invoke } from "@tauri-apps/api/core";
import { listProjects, type Account } from "./pty";
import type { Historia } from "./usoDelPerfil";

// La lectura de tu uso (`uso_historia`), compartida por las dos piezas del
// Perfil que la necesitan: tu uso (`PerfilUso.tsx`) y la tarjeta para
// compartirlo (`PerfilTarjeta.tsx`).
//
// La primera lectura de sus transcripts tarda un minuto largo y la segunda un
// par de segundos: la tarjeta se abre desde tu uso, que ya la tiene, así que
// la toma de aquí en vez de pedírsela otra vez a Rust. Y si las dos piden a la
// vez, la segunda se engancha a la que ya está en marcha.

/** Solo estos dos dejan sus conversaciones donde `uso_historia` sabe leerlas. */
const LEE = new Set(["claude", "codex"]);

export type CuentaQueLeer = { provider: string; dir: string };

/** Cada carpeta de cuenta una sola vez: la principal de cada CLI va con la
    carpeta vacía y una cuenta añadida con la suya. */
export function cuentasQueLeer(cuentas: Account[]): CuentaQueLeer[] {
  const vistas = new Set<string>();
  return cuentas
    .filter((c) => LEE.has(c.provider))
    .map((c) => ({ provider: c.provider, dir: c.dir }))
    .filter((c) => {
      const k = `${c.provider}|${c.dir.trim().toLowerCase()}`;
      return !vistas.has(k) && vistas.add(k);
    });
}

/** Lo último leído, para no volver a una página vacía al entrar otra vez. */
let ultima: Historia | null = null;
let enCurso: { clave: string; promesa: Promise<Historia> } | null = null;

export const historiaLeida = (): Historia | null => ultima;

export function leerHistoria(cuentas: CuentaQueLeer[]): Promise<Historia> {
  const clave = JSON.stringify(cuentas);
  if (enCurso?.clave === clave) return enCurso.promesa;
  // Los proyectos del panel van SIEMPRE: sin ellos, `Orquio\web` y
  // `MarcaPersonal\web` salen como dos «web» sueltos (panel 1, f7d21ae).
  const promesa = listProjects()
    .catch(() => [])
    .then((ps) => invoke<Historia>("uso_historia", { cuentas, proyectos: ps.map((p) => p.path) }))
    .then((h) => {
      ultima = h;
      return h;
    })
    .finally(() => {
      if (enCurso?.promesa === promesa) enCurso = null;
    });
  enCurso = { clave, promesa };
  return promesa;
}
