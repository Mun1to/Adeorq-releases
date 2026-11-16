// Lo que la pestaña Decisiones necesita saber aunque no esté abierta: cuánto te
// toca (su número en la cabecera) y de dónde venías (Esc te devuelve allí).
//
// Vive fuera de `DecisionesView`, que se carga solo al abrirla, porque el número
// tiene que ser verdad ANTES de entrar. Lo que cuenta es lo mismo que la lista
// pone en «Te toca» (`lib/decisionesLista.ts`): una terminal que te espera, un plan de Adeo sin contestar, una
// decisión viva y un encargo que el freno paró. Lo que pospones (H) no cuenta
// mientras duerme y vuelve a contar a su hora.

import { useMemo } from "react";
import { useProgramados } from "../components/AgendaProgramados";
import { useAvisos } from "./campana";
import { useReposo, type Decision } from "./decisiones";
import { cuantasTeTocan, juntar } from "./decisionesLista";
import { usePlanPendiente } from "./planPendiente";
import type { View } from "./vistas";

export function useTeToca(decisiones: Decision[]): number {
  const avisos = useAvisos((s) => s.lista);
  const [programados] = useProgramados();
  const plan = usePlanPendiente((s) => s.pendiente);
  const reposo = useReposo((s) => s.reposo);
  const ahora = useReposo((s) => s.ahora);
  return useMemo(
    () => cuantasTeTocan(juntar({ decisiones, avisos, programados: programados?.encargos ?? [], notas: [], plan, reposo, ahora })),
    [decisiones, avisos, programados, plan, reposo, ahora],
  );
}

let vuelta: View = "panel";

/** Lo llama `setView` en cada cambio de pestaña con la que dejas: la última que
    no era Decisiones es adonde vuelve Esc. */
export function recordarVuelta(antes: View): void {
  if (antes !== "decisiones") vuelta = antes;
}

export const vueltaDeDecisiones = (): View => vuelta;
