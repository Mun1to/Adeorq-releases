// El puente del conserje con el móvil (`lib/movil.ts`). No pinta nada: está
// aquí y no dentro de App para no tocar el orden de sus ganchos, y se monta
// una sola vez.

import { useEffect, useRef } from "react";
import { escucharMovil, movilIdioma } from "../lib/movil";
import type { ConserjeExec } from "../lib/conserje";
import { useT } from "../lib/i18n";

export default function PuenteMovil({ exec }: { exec: ConserjeExec }) {
  // Lo de AHORA cuando llega cada pedido, sin volver a suscribirse en cada
  // render de App.
  const ref = useRef(exec);
  ref.current = exec;
  useEffect(() => escucharMovil(() => ref.current), []);
  // La página del móvil habla el idioma de la app: solo la ventana lo sabe,
  // así que se lo dice a `movil.rs` al abrir y cada vez que cambia.
  const { lang } = useT();
  useEffect(() => {
    movilIdioma(lang).catch(() => {});
  }, [lang]);
  return null;
}
