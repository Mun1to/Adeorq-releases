// El aviso de la noche a los agentes: la última pieza de Ajustes › Salud
// (`docs/contexto/salud.md`). Munir, 2026-11-24 (decisión d1a20f78a7b9, C):
// a la hora, Adeorq «manda cerrar a todas las terminales», sean del CLI que
// sean. Al entrar en el aviso (los minutos de antes del cierre) a cada
// terminal con un agente se le teclea, UNA vez por noche, que guarde lo suyo y
// cierre. La noche la dice su cierre original (`Fase.original`): posponer no
// la repite, y cambiar la hora en Ajustes es otra noche y sí.
//
// Cuándo se le teclea lo decide `puedeTeclear` (`lib/vueltaArriba.ts`), la
// misma llave con que Adeorq le teclea a una madre lo de sus hijas, revisada
// dos veces: solo parada en su caja vacía (ni un menú, ni un permiso, ni un
// borrador tuyo), sin nada en pantalla que diga que trabaja, sin subagentes
// fuera y, si su CLI deja el turno en disco, acabado en «lista» (una que acabó
// preguntándote en prosa te espera a ti, y no se le contesta); sin él (Gemini),
// vista quieta dos miradas seguidas. Una consola, o un CLI cuya caja no se
// sabe leer, nunca. Trabajando, se espera: se vuelve a mirar hasta que pare o
// se acabe la noche. Con una pregunta en pantalla no se teclea nada.
//
// Lo que decide es puro y vive aquí, para su banco (`pnpm bancos salud-agentes`);
// engancharlo a las terminales es `saludAgentesVivo.ts`.

import type { Translate } from "./i18n";
import { faseDeSalud, type Pospuesto, type Salud } from "./salud";
import { puedeTeclear, type Madre } from "./vueltaArriba";

/** Cada cuánto se mira. Fuera del aviso es leer el horario y nada más. */
export const MIRAR_SALUD_MS = 5_000;

/** «1:00», «23:30»: la hora como se escribe. Siempre entre paréntesis y sin
    artículo delante, que «a las 1:00» y «son las 1:05» están mal dichos. */
export const horaDe = (ms: number) => {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * La línea que se le teclea, en el idioma de la app y sin nombrar ningún CLI:
 * sale del gancho personal `~/.claude/hooks/hora-de-dormir.mjs`, que hacía lo
 * mismo solo en Claude Code. `cerrado`: se le teclea pasada ya la hora, porque
 * estuvo trabajando todo el aviso.
 */
export function lineaDeCierre(t: Translate, cierre: number, cerrado: boolean): string {
  // Sin «›»: Codex se lo come al pegarlo, que es el signo de su caja.
  const cuando = cerrado
    ? t("[adeorq] Aviso de Salud (Ajustes): ya pasó la hora de cierre de esta noche que puso quien usa Adeorq ({cierre}).", { cierre: horaDe(cierre) })
    : t("[adeorq] Aviso de Salud (Ajustes): se acerca la hora de cierre de esta noche que puso quien usa Adeorq ({cierre}).", { cierre: horaDe(cierre) });
  const que = t(
    "No empieces nada largo: acaba en unos minutos lo que tengas a medias o apúntalo en tus notas de traspaso con lo que falta, guarda lo tuyo (commits de tus cambios; subir, solo con su permiso) y cierra la sesión como la cierres siempre. Si te compactas, deja tu bloque para retomar como siempre. No apagues ni mandes apagar el ordenador.",
  );
  return `${cuando} ${que}`;
}

/** Lo que se mira de una terminal para teclearle: lo de `Madre` menos la
    mirada anterior, que la lleva el aviso. */
export type TerminalSalud = Omit<Madre, "quietaAntes">;

export interface DepsSaludAgentes {
  ahora: () => number;
  salud: () => Salud;
  pospuesto: () => Pospuesto | null;
  /** Las terminales abiertas, por su id. */
  paneles: () => number[];
  /** Cómo está ahora; `null` si todavía no se sabe (su CLI, su estado). */
  terminal: (id: number) => TerminalSalud | null;
  teclear: (id: number, linea: string) => void;
  /** Su caja tiene escrita, sin enviar, exactamente esa línea (`tieneEscrito`
      del lector de su CLI). Medido el 2026-11-25 con un Codex y un Gemini de
      verdad: con una línea de 500 caracteres el Intro caía dentro del pegado y
      la línea se quedaba escrita, como en la vuelta hacia arriba. */
  atascada: (id: number, linea: string) => boolean;
  /** Un Intro solo, para mandarla. */
  intro: (id: number) => void;
  t: () => Translate;
}

/** Los Intros de más para una línea que se quedó escrita, como `MAX_REINTENTOS`
    de la vuelta hacia arriba. */
export const MAX_INTROS = 3;

export function crearSaludAgentes(d: DepsSaludAgentes) {
  /** El cierre original de la noche que se está avisando. */
  let noche: number | null = null;
  /** A quién ya se le tecleó esa noche. */
  let avisadas = new Set<number>();
  /** Las que la mirada anterior vio paradas en su caja vacía. */
  let quietas = new Set<number>();

  /** Lo recién tecleado a cada una y los Intros de más que lleva. Se suelta en
      cuanto la línea deja de estar en su caja: si luego la recuperas con ↑, no
      se vuelve a mandar. */
  const enviando = new Map<number, { linea: string; n: number }>();

  /** Una mirada: devuelve a quién le tecleó. */
  const mirar = (): number[] => {
    for (const [id, x] of [...enviando]) {
      if (x.n < MAX_INTROS && d.atascada(id, x.linea)) {
        x.n++;
        d.intro(id);
      } else enviando.delete(id);
    }
    const ahora = d.ahora();
    const f = faseDeSalud(ahora, d.salud(), d.pospuesto());
    if (f.fase === "libre") {
      quietas = new Set();
      return [];
    }
    if (f.original !== noche) {
      noche = f.original;
      avisadas = new Set();
    }
    const vistas = new Set<number>();
    const tecleadas: number[] = [];
    for (const id of d.paneles()) {
      if (avisadas.has(id)) continue;
      const x = d.terminal(id);
      if (!x) continue;
      if (x.enSuCaja && !x.trabajando) vistas.add(id);
      if (!puedeTeclear({ ...x, quietaAntes: quietas.has(id) })) continue;
      avisadas.add(id);
      tecleadas.push(id);
      const linea = lineaDeCierre(d.t(), f.cierre, f.fase === "cerrado");
      enviando.set(id, { linea, n: 0 });
      d.teclear(id, linea);
    }
    quietas = vistas;
    return tecleadas;
  };

  return { mirar };
}
