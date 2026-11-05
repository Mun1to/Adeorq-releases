// A qué cuenta nace cada terminal de un plan del Capataz.
//
// La regla de elegir es UNA y vive en `router.ts` (`elegirCuenta`). Lo que se
// añade aquí es lo propio de un plan: son varias terminales de golpe, y abrir
// una no reserva nada, así que sin contarlas entre ellas las seis verían la
// misma foto y caerían todas en la misma cuenta (la idea de `conSusAbiertas`
// en `puenteMcp.ts`, con `PESO_TERMINAL` dentro de `router.ts`).
import type { Account } from "./pty";
import { CLAUDE } from "./providers";
import type { CuentaViva, Receta } from "./router";

/**
 * La cuenta de Claude con la que debe abrirse lo que recetó el router. Si
 * propone otro CLI porque no queda semana, la acción del plan ya decidió abrir
 * un Claude: vale la de su `alternativa`. Si no hay ninguna de Claude, ninguna.
 */
export function cuentaDeLaReceta(r: Pick<Receta, "cuenta" | "alternativa">): Account | undefined {
  if (r.cuenta?.provider === CLAUDE.id) return r.cuenta;
  const alt = r.alternativa?.cuenta;
  return alt?.provider === CLAUDE.id ? alt : undefined;
}

/** El mundo con una terminal más abierta en esa cuenta, para la decisión siguiente. */
export function conUnaAbierta(mundo: CuentaViva[], cuenta: Account | undefined): CuentaViva[] {
  if (!cuenta) return mundo;
  return mundo.map((v) => (v.cuenta.id === cuenta.id ? { ...v, abiertas: (v.abiertas ?? 0) + 1 } : v));
}

/** Si es la cuenta principal de su CLI (la que no se enseña en la ficha). */
export function esLaPrincipal(cuenta: Account | undefined): boolean {
  return !cuenta || cuenta.id.startsWith("main:");
}

/**
 * Cuántas terminales de un plan van a cada cuenta, en el orden en que salen,
 * para el resumen de debajo de la tarjeta. Las que no llevan cuenta (una
 * terminal pelada, otro CLI) no cuentan. Vacío cuando todas nacen en la
 * principal: es donde nacería todo de todos modos, y «3 en Principal» no le dice
 * nada a quien tiene una sola cuenta.
 */
export function repartoDelPlan(cuentas: Array<Account | undefined>): Array<{ cuenta: Account; n: number }> {
  const por = new Map<string, { cuenta: Account; n: number }>();
  for (const c of cuentas) {
    if (!c) continue;
    const ya = por.get(c.id);
    if (ya) ya.n++;
    else por.set(c.id, { cuenta: c, n: 1 });
  }
  const lista = [...por.values()];
  return lista.some((e) => !esLaPrincipal(e.cuenta)) ? lista : [];
}
