// El freno por cuota de los encargos programados, del lado de la ventana.
//
// Si un encargo se lanza o se salta lo decide Rust (`programados.rs`, con su
// tope): el presupuesto no lo guarda quien lo gasta. Pero cuánto lleva gastado
// la cuenta lo sabe la ventana, que guarda cuál es la predeterminada y por cuyo
// `lib/cuota.ts` pasa ya toda lectura de cuota. Aquí solo se contesta el número.

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { limitesDe, loQueTePara, type Cuenta } from "./cuota";
import { MAIN_ACCOUNT, mainAccount, type Account } from "./pty";
import { contestarCuota, EVENTO_CUOTA } from "./programados";

/** Una lectura de hace más de esto no vale para frenar: se pregunta otra vez. */
const VIDA_FRENO = 2 * 60 * 1000;

/**
 * La cuenta con la que nace la terminal de un encargo de ese CLI. Con `pedida`
 * (la que eligió el encargo), esa; sin ella, la predeterminada si es de ese
 * CLI, y si no la de siempre. Tiene que decir lo mismo que `entornoDePane`
 * (`App.tsx`) y que `cuentaPedida` al abrir, o el freno mediría una cuenta y
 * el encargo gastaría otra.
 */
export function cuentaDeArranque(cli: string, cuentas: { list: Account[]; def: string }, pedida = ""): Cuenta {
  const suya = [MAIN_ACCOUNT, mainAccount(cli), ...cuentas.list].find((a) => a.id === (pedida || cuentas.def));
  return { provider: cli, dir: suya && suya.provider === cli ? suya.dir : "" };
}

/** Las cuentas de ese CLI, la principal primero: las que puede elegir un encargo. */
export function cuentasDe(cli: string, lista: Account[]): Account[] {
  return [mainAccount(cli), ...lista.filter((a) => a.provider === cli && a.id !== mainAccount(cli).id)];
}

/** La cuenta que pidió un encargo, si sigue en Adeorq y es de ese CLI. Si no,
    por qué: el encargo falla diciéndolo en vez de nacer en otra sin avisar. */
export function cuentaPedida(id: string, cli: string, lista: Account[]): Account | { error: string } {
  const a = [mainAccount(cli), ...lista].find((x) => x.id === id);
  if (!a) return { error: "La cuenta de este encargo ya no está en Adeorq: elige otra en la Agenda." };
  if (a.provider !== cli) return { error: `La cuenta «${a.label}» no es de ese agente: elige otra en la Agenda.` };
  return a;
}

/** Cuánto lleva gastado, de 0 a 100, o `null` si esa cuenta no lo publica o
    no contesta: sin número, Rust no frena. */
export async function gastadoDe(cuenta: Cuenta): Promise<number | null> {
  try {
    return loQueTePara(await limitesDe(cuenta, VIDA_FRENO)).percent;
  } catch {
    return null;
  }
}

/** Contesta al reloj cada vez que pregunta. Va montado con la app entera,
    porque el reloj también pregunta con la ventana escondida. */
export function useFrenoCuota(accountsRef: { current: { list: Account[]; def: string } }): void {
  useEffect(() => {
    let vivo = true;
    const un = listen<{ peticion: number; cli?: string; cuenta?: string }>(EVENTO_CUOTA, (e) => {
      if (!vivo) return;
      const { peticion, cli, cuenta } = e.payload;
      const gastado = cli ? gastadoDe(cuentaDeArranque(cli, accountsRef.current, cuenta ?? "")) : Promise.resolve(null);
      void gastado.then((g) => contestarCuota(peticion, g)).catch(() => {});
    });
    return () => {
      vivo = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, [accountsRef]);
}
