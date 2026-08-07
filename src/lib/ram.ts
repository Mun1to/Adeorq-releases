// Lo que ocupa cada terminal, por separado.
//
// El Pulso de la barra ya decía lo que gasta Adeorq ENTERO, y esa cifra
// responde a «¿va lento el equipo por esto?». La pregunta que quedaba sin
// responder es la otra, la que aparece con seis agentes abiertos y tres
// apartados: cuál de ellos me está costando. Ahora cada cabecera lo dice, y la
// tira del pie también, que es donde vive lo que se olvida.
//
// El trabajo de verdad lo hace `pulso.rs` (mide el árbol de procesos de cada
// panel con una sola foto del sistema); aquí solo se pregunta y se dibuja.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { latido } from "./latido";

export interface PanePulso {
  /** El mismo id del panel en la ventana. */
  id: number;
  ramMb: number;
  procesos: number;
  /** Si dentro hay un agente de verdad y no solo el PowerShell de paso. */
  agente: boolean;
}

/** Más lento que el Pulso de la barra (5 s) a propósito: son varios árboles de
    procesos en vez de uno, y la memoria de un agente no cambia de un parpadeo
    al otro. */
const CADA_MS = 8000;

/** Megas a algo que se lee: 1843 -> «1,8 GB». Vive aquí y no en el Pulso
    porque ahora la usan los dos. */
export function bonito(mb: number, lang: string): string {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace(".", lang === "en" ? "." : ",")} GB`;
}

/**
 * La memoria de cada terminal viva, indexada por id de panel.
 *
 * Sin terminales no pregunta nada: recorrer la tabla de procesos del sistema
 * cuesta poco pero no es gratis, y en el Panel o en Ajustes no hay a quién
 * medir.
 */
export function useRamPanes(activo: boolean): Map<number, PanePulso> {
  const [mapa, setMapa] = useState<Map<number, PanePulso>>(() => new Map());

  useEffect(() => {
    if (!activo) {
      // Se vacía al quedarse sin terminales: dejar el último número puesto
      // sería enseñar la memoria de un panel que ya no existe.
      setMapa((m) => (m.size ? new Map() : m));
      return;
    }
    let vivo = true;
    const leer = () =>
      void invoke<PanePulso[]>("pulso_panes")
        .then((lista) => {
          if (!vivo) return;
          setMapa(new Map(lista.map((p) => [p.id, p])));
        })
        .catch(() => {});
    leer();
    // Con la ventana minimizada esto no lo mira nadie, y recorrer la tabla de
    // procesos del sistema cada ocho segundos para no enseñárselo a nadie es
    // trabajo tirado. Al volver se pregunta en el acto (ver `lib/latido.ts`).
    const parar = latido(leer, CADA_MS);
    return () => {
      vivo = false;
      parar();
    };
  }, [activo]);

  return mapa;
}
