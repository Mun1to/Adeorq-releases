// Lo que Adeorq tiene guardado de su actividad de Discord, listo para el
// arranque.
//
// Existe por una sola razón: dentro del paquete de la Microsoft Store el
// interruptor parte APAGADO (política 10.5.2: el consentimiento va antes de
// mandar nada a un tercero, y una línea en tu perfil de Discord llega a
// Discord), y si esta Adeorq corre desde el paquete lo dice Rust, no el front.
// Hasta que contesta, `listo` es falso y no se publica nada: sin esa espera, el
// primer render publicaría con el valor de siempre (encendido) y la línea saldría
// en el perfil de alguien que nunca la pidió.
//
// Fuera del paquete la respuesta es «no», llega en un instante, y el resultado es
// el de siempre: `loadDiscord(false)` es lo que `loadDiscord()` ya devolvía.

import { useEffect, useState } from "react";
import { enLaTienda } from "./empaquetada";
import { loadDiscord, type DiscordConfig } from "./discord";

export function useDiscordConfig(): {
  discord: DiscordConfig;
  setDiscord: (next: DiscordConfig) => void;
  /** Ya se sabe si es la Tienda: solo entonces vale publicar. */
  listo: boolean;
} {
  const [discord, setDiscord] = useState<DiscordConfig>(() => loadDiscord());
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    void enLaTienda().then((tienda) => {
      if (!vivo) return;
      // Solo cambia lo que parte de fábrica; lo que la persona ya eligió queda.
      setDiscord(loadDiscord(tienda));
      setListo(true);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return { discord, setDiscord, listo };
}
