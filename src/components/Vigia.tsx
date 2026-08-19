import { useEffect, useRef } from "react";
import { apuntarAviso, ultimoAviso } from "../lib/bandeja";
import { readCrewInbox, writeInbox, type PaneStatus } from "../lib/pty";
import {
  anotar,
  aProponer,
  memoriaVacia,
  modoVigia,
  podar,
  type CuadrillaVista,
  type Memoria,
} from "../lib/vigia";
import type { Team } from "../App";

/**
 * El vigía: mira las cuadrillas y, si algo merece tu atención, lo PROPONE.
 *
 * No pinta nada. Vive montado igual que `AvisoCuota`, sondea solo y su única
 * escritura en todo el sistema es una línea en la bandeja de la Agenda, que es
 * una propuesta que Munir acepta o descarta (regla R). Deliberadamente NO
 * importa `writePty`, `killPty` ni `openTeam`: no puede escribir en una
 * terminal ni abrir ni cerrar un agente aunque quisiera, y eso no es una
 * limitación pendiente de quitar, es la decisión (Munir, 2026-08-01: vigila y
 * avisa, nunca decide solo).
 *
 * Quien decide QUÉ merece decirse es `lib/vigia.ts`, que es puro y está
 * comprobado en `scripts/vigia-check.ts`. Aquí solo se lee el disco, se guarda
 * lo dicho y se escribe la línea.
 */

/** Lento a propósito: leer un BUZON.md es barato, pero el vigía no tiene
    ninguna prisa y un sondeo nervioso solo gasta disco. */
const CADA_MS = 60_000;
/** La primera vuelta no es en el arranque: la app está montando terminales y
    ninguna cuadrilla recién abierta tiene nada que contar todavía. */
const PRIMERA_MS = 90_000;
const MEMORIA_KEY = "adeorq-vigia-memoria";

function leerMemoria(): Memoria {
  try {
    const v = JSON.parse(localStorage.getItem(MEMORIA_KEY) ?? "null") as Memoria | null;
    if (!v || typeof v !== "object") return memoriaVacia();
    return {
      dichas: v.dichas ?? {},
      ultimaDe: v.ultimaDe ?? {},
      vecesDe: v.vecesDe ?? {},
      ultima: v.ultima ?? 0,
    };
  } catch {
    return memoriaVacia();
  }
}

function guardarMemoria(m: Memoria): void {
  try {
    localStorage.setItem(MEMORIA_KEY, JSON.stringify(m));
  } catch {
    // Si el almacenamiento falla, el vigía repetirá algún aviso. Es molesto y
    // no es grave: nunca es motivo para reventar la ventana entera.
  }
}

interface Props {
  /** Los paneles vivos con su cuadrilla, si la tienen. */
  panes: Array<{ id: number; cwd: string; team?: Team }>;
  status: Record<number, PaneStatus>;
}

export default function Vigia({ panes, status }: Props) {
  // Todo en refs: este componente no pinta, así que no necesita repintarse
  // nunca. Con estado, cada vuelta del sondeo provocaría un render de balde.
  const panesRef = useRef(panes);
  const statusRef = useRef(status);
  panesRef.current = panes;
  statusRef.current = status;

  /** Desde cuándo cada puesto está como está, y desde cuándo no cambia su
      buzón. Ninguna de las dos cosas la dice el backend: se aprenden mirando. */
  const desdeRef = useRef<Record<number, { estado: string; t: number }>>({});
  const buzonRef = useRef<Record<string, { firma: string; t: number }>>({});

  useEffect(() => {
    let vivo = true;

    const vuelta = async () => {
      if (!vivo) return;
      if (modoVigia() === "nunca") return;

      const ahora = Date.now();
      const grupos = new Map<string, CuadrillaVista>();
      for (const p of panesRef.current) {
        if (!p.team) continue;
        const estado = statusRef.current[p.id]?.state ?? "";
        const prev = desdeRef.current[p.id];
        if (!prev || prev.estado !== estado) {
          desdeRef.current[p.id] = { estado, t: ahora };
        }
        const ya = grupos.get(p.team.id);
        const puesto = {
          paneId: p.id,
          rol: p.team.rol,
          frontera: p.team.frontera,
          estado,
          desde: desdeRef.current[p.id].t,
        };
        if (ya) {
          ya.puestos.push(puesto);
          continue;
        }
        grupos.set(p.team.id, {
          teamId: p.team.id,
          objetivo: p.team.objetivo,
          cwd: p.cwd,
          proyecto: p.cwd.split(/[\\/]/).filter(Boolean).pop() ?? p.cwd,
          // Sin `desde` (cuadrillas de antes de que existiera el campo) se toma
          // este momento: así entran en el periodo de gracia en vez de recibir
          // un aviso de golpe por algo que lleva horas pasando.
          nacida: p.team.desde ?? ahora,
          puestos: [puesto],
          notas: [],
          buzonCambio: ahora,
        });
      }
      if (grupos.size === 0) return;

      // El buzón de cada carpeta, y cuándo cambió. La firma es el texto entero:
      // comparar es más barato que cualquier otra forma de saberlo, y el
      // archivo no lleva marca de tiempo dentro.
      for (const c of grupos.values()) {
        const notas = await readCrewInbox(c.cwd).catch(() => null);
        if (!notas) continue;
        c.notas = notas;
        const firma = notas.map((n) => `${n.who}:${n.text}`).join("|");
        const antes = buzonRef.current[c.cwd];
        if (!antes || antes.firma !== firma) {
          buzonRef.current[c.cwd] = { firma, t: ahora };
        }
        c.buzonCambio = buzonRef.current[c.cwd].t;
      }

      // La marca del último aviso se comparte con el copiloto: la bandeja es
      // una sola y dos líneas seguidas de dos vigilantes distintos son
      // exactamente lo que el enfriamiento existe para evitar (`bandeja.ts`).
      let memoria = podar(leerMemoria(), ahora);
      memoria = { ...memoria, ultima: Math.max(memoria.ultima, ultimoAviso()) };
      for (const { cuadrilla, señal } of aProponer(
        [...grupos.values()],
        memoria,
        ahora,
        modoVigia(),
      )) {
        try {
          await writeInbox("paso", cuadrilla.proyecto, señal.texto);
        } catch {
          // Si no se pudo escribir, no se apunta: la señal sigue pendiente y se
          // vuelve a intentar en la siguiente vuelta.
          continue;
        }
        memoria = anotar(memoria, cuadrilla.teamId, señal, ahora);
        apuntarAviso(ahora);
      }
      guardarMemoria(memoria);
    };

    // Encadenado como AvisoCuota, y no un setTimeout + setInterval sueltos: el
    // intervalo arrancaba en t=0 y disparaba a los 60 s, o sea ANTES de la
    // «primera» de los 90, saltándose el periodo de gracia que el comentario
    // de arriba promete y metiendo dos vueltas con 30 s entre ellas.
    let timer = 0;
    const tick = () => {
      void vuelta().finally(() => {
        if (vivo) timer = window.setTimeout(tick, CADA_MS);
      });
    };
    timer = window.setTimeout(tick, PRIMERA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
