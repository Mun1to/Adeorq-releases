// El puente del conserje con el móvil (`lib/movil.ts`). No pinta nada: está
// aquí y no dentro de App para no tocar el orden de sus ganchos, y se monta
// una sola vez.

import { useEffect, useRef } from "react";
import { escucharMovil } from "../lib/movil";
import type { ConserjeExec } from "../lib/conserje";

export default function PuenteMovil({ exec }: { exec: ConserjeExec }) {
  // Lo de AHORA cuando llega cada pedido, sin volver a suscribirse en cada
  // render de App.
  const ref = useRef(exec);
  ref.current = exec;
  useEffect(() => escucharMovil(() => ref.current), []);
  return null;
}
