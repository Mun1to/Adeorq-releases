import { useEffect, useRef } from "react";
import { apuntarAviso, ultimoAviso } from "../lib/bandeja";
import {
  anotar,
  aProponer,
  memoriaVacia,
  modoCopiloto,
  podar,
  type MemoriaCopiloto,
  type MundoCopiloto,
  type SesionVista,
} from "../lib/copiloto";
import type { PrecioModelo } from "../lib/coste";
import { chatModelos, chatPromos } from "../lib/chat";
import {
  sessionActivity,
  sessionMessages,
  type LlamadaModelo,
} from "../lib/conversacion";
import { mundoEnCache } from "../lib/mundo";
import { openrouterInfo, sessionContext, writeInbox, type Account } from "../lib/pty";
import { sessionIdOf } from "../lib/comandos";
import { kindDeComando } from "./KindIcon";
import type { ModelAlias } from "../lib/models";

/**
 * El copiloto: mira las sesiones abiertas y, si hay un sitio mejor donde estar
 * haciendo eso, lo PROPONE.
 *
 * Hermano de `Vigia.tsx` y montado igual que él: no pinta nada, sondea solo y
 * su única escritura en todo el sistema es una línea en la bandeja de la
 * Agenda. Deliberadamente NO importa `writePty` ni `addPane`: no puede cambiar
 * un modelo ni abrir una terminal aunque quisiera, y eso no es una limitación
 * pendiente de quitar, es la decisión (regla R: propone, tú aceptas).
 *
 * Quien decide QUÉ merece decirse es `lib/copiloto.ts`, que es puro y está
 * comprobado en `scripts/copiloto-check.ts`. Aquí solo se junta la foto.
 */

/** Más lento que el vigía, y por un motivo que se puede medir: cada vuelta lee
    el transcript de cada sesión abierta, y esos archivos son gordos. El vigía
    lee un BUZON.md de cuatro líneas y por eso puede ir cada minuto. */
const CADA_MS = 3 * 60_000;
/** La primera, más tarde todavía: al arrancar, la app está montando terminales
    y ninguna sesión recién abierta tiene nada que contar. */
const PRIMERA_MS = 4 * 60_000;
/** El catálogo de precios cambia poco y son 415 modelos. Una vez por hora. */
const PRECIOS_FRESCOS = 60 * 60_000;
/** De cuántos turnos hacia atrás se busca el último encargo. Con los últimos
    seis basta: lo que importa es lo que le pediste hace poco, no lo de ayer. */
const TURNOS = 6;
const MEMORIA_KEY = "adeorq-copiloto-memoria";

function leerMemoria(): MemoriaCopiloto {
  try {
    const v = JSON.parse(localStorage.getItem(MEMORIA_KEY) ?? "null") as MemoriaCopiloto | null;
    if (!v || typeof v !== "object") return memoriaVacia();
    return {
      dichos: v.dichos ?? {},
      ultimaDe: v.ultimaDe ?? {},
      vecesDe: v.vecesDe ?? {},
      ultima: v.ultima ?? 0,
    };
  } catch {
    return memoriaVacia();
  }
}

function guardarMemoria(m: MemoriaCopiloto): void {
  try {
    localStorage.setItem(MEMORIA_KEY, JSON.stringify(m));
  } catch {
    // Si el almacenamiento falla, el copiloto repetirá algún consejo. Es
    // molesto y no es grave: nunca es motivo para reventar la ventana.
  }
}

/** El alias que hay dentro de un nombre de modelo, venga como venga. */
function aliasDe(texto: string | undefined): ModelAlias | undefined {
  const v = texto?.toLowerCase();
  if (!v) return undefined;
  for (const m of ["fable", "opus", "sonnet", "haiku"] as ModelAlias[]) {
    if (v.includes(m)) return m;
  }
  return undefined;
}

/**
 * El cerebro que lleva puesto AHORA, no con el que nació.
 *
 * Manda la última llamada que el CLI apuntó en su transcript, porque dentro de
 * una sesión se puede cambiar de modelo escribiendo `/model` y el comando de
 * arranque se queda igual para siempre. Con el comando como única fuente, una
 * sesión que arrancó en sonnet y ahora corre en opus se veía en sonnet, y el
 * consejo de derroche —que es justo el que mira el cerebro— no saltaba nunca.
 *
 * El comando queda de respaldo, para la primera vuelta de una sesión que aún
 * no ha llamado a nadie.
 */
function modeloDe(command: string[] | undefined, llamadas: LlamadaModelo[]): ModelAlias | undefined {
  const ultima = llamadas.length ? llamadas[llamadas.length - 1].modelo : undefined;
  if (aliasDe(ultima)) return aliasDe(ultima);
  const i = command?.indexOf("--model") ?? -1;
  return i >= 0 ? aliasDe(command?.[i + 1]) : undefined;
}

interface Props {
  /** Los paneles vivos. El copiloto solo mira lo que está abierto: aconsejar
      sobre una sesión cerrada hace tres días no le sirve a nadie. */
  panes: Array<{ id: number; cwd: string; command?: string[]; account?: string }>;
  /** Para poder traducir el id de cuenta a su etiqueta, y para leer cuotas. */
  cuentas: Account[];
}

export default function Copiloto({ panes, cuentas }: Props) {
  // Todo en refs: este componente no pinta, así que no necesita repintarse.
  const panesRef = useRef(panes);
  const cuentasRef = useRef(cuentas);
  panesRef.current = panes;
  cuentasRef.current = cuentas;

  /**
   * Desde cuándo se ve cada sesión, aprendido mirando y no preguntado.
   *
   * Un panel no guarda cuándo nació, y añadírselo obligaría a tocar el tablero
   * guardado. Se apunta aquí la primera vez que aparece, que además tiene un
   * efecto que conviene: al arrancar Adeorq con un tablero restaurado, todas
   * las sesiones entran en periodo de gracia a la vez, y no te recibe una
   * bandeja llena de consejos sobre lo que estabas haciendo ayer.
   */
  const vistasRef = useRef<Record<string, number>>({});

  /** El catálogo de precios, cacheado: son 415 modelos y cambian poco. */
  const preciosRef = useRef<{ t: number; datos: MundoCopiloto["precios"] } | null>(null);

  useEffect(() => {
    let vivo = true;

    const vuelta = async () => {
      if (!vivo) return;
      if (modoCopiloto() === "nunca") return;

      const ahora = Date.now();
      const abiertos = panesRef.current.filter((p) => p.command?.length);
      if (!abiertos.length) return;

      // ── La foto de cada sesión ────────────────────────────────────────
      // Todo sale de archivos que el CLI ya escribe, así que mirar no cuesta
      // ni un token: es la misma economía que el modo chat.
      //
      // Una detrás de otra y no todas a la vez, medido: el backend lee solo la
      // COLA del transcript (1,5 MB de `read_tail`, aunque el archivo pese
      // 167), así que una sesión cuesta 17 ms y doce en serie son 0,2 s cada
      // tres minutos, o sea un 0,12 % de un núcleo. Lanzarlas en paralelo serían
      // treinta y seis lecturas de disco a la vez compitiendo con las terminales
      // que están trabajando, para ahorrar dos décimas que nadie nota.
      const sesiones: SesionVista[] = [];
      for (const p of abiertos) {
        const sessionId = sessionIdOf(p.command);
        if (!sessionId) continue;
        const cli = kindDeComando(p.command?.join(" ") ?? "");

        const [ctx, act, turnos] = await Promise.all([
          sessionContext(p.cwd, sessionId).catch(() => null),
          sessionActivity(p.cwd, sessionId).catch(() => null),
          sessionMessages(p.cwd, sessionId, TURNOS).catch(() => null),
        ]);

        // Los eventos vienen agrupados («Read ×20»), y lo que hace falta para
        // saber de qué va la sesión es la proporción, así que se desagrupan.
        const herramientas: string[] = [];
        for (const e of act?.eventos ?? []) {
          if (e.clase !== "herramienta") continue;
          for (let i = 0; i < e.veces; i++) herramientas.push(e.nombre);
        }

        const mio = [...(turnos ?? [])].reverse().find((t) => t.rol === "tu");
        sesiones.push({
          sessionId,
          cwd: p.cwd,
          proyecto: p.cwd.split(/[\\/]/).filter(Boolean).pop() ?? p.cwd,
          cli,
          modelo: modeloDe(p.command, act?.llamadas ?? []),
          cuenta: cuentasRef.current.find((c) => c.id === p.account)?.label,
          contexto: ctx?.used ?? 0,
          ventana: ctx?.window ?? 0,
          estado: ctx?.state ?? "",
          nacida: (vistasRef.current[sessionId] ??= ahora),
          ultimoEncargo: mio?.texto,
          herramientas,
        });
      }
      if (!sesiones.length) return;

      // ── Y la foto del mundo, SIN preguntar nada nuevo ────────────────
      //
      // `mundoEnCache` y no `mirarMundo`, y esto no es una optimización sino un
      // arreglo: leer la cuota de una cuenta lanza un proceso `claude -p
      // /usage` de verdad (`usage.rs`). No cuesta tokens, pero arranca un
      // binario de 326 MB, y `AvisoCuota` ya lo hace cada 20 minutos con una
      // caché de 9. Como este sondea cada 3, la primera versión TRIPLICABA los
      // procesos que se lanzan en la máquina de Munir, y con doce terminales
      // trabajando eso no lo paga ningún consejo.
      //
      // Con la caché basta: la semana no se gasta en tres minutos. Y si nunca
      // se ha leído, `gastado` viene vacío y los consejos que dependen de la
      // cuota simplemente no salen, que es la respuesta correcta cuando no se
      // sabe el dato en vez de inventárselo.
      const vivas = mundoEnCache(cuentasRef.current);

      let precios = preciosRef.current;
      if (!precios || ahora - precios.t > PRECIOS_FRESCOS) {
        const lista = await chatModelos().catch(() => null);
        if (lista) {
          const datos: Record<string, PrecioModelo & { nombre: string }> = {};
          for (const m of lista) {
            datos[m.id] = {
              nombre: m.nombre,
              entradaMillon: m.entrada_millon,
              salidaMillon: m.salida_millon,
              cacheLeidaMillon: m.cache_leida_millon,
              cacheEscritaMillon: m.cache_escrita_millon,
            };
          }
          precios = { t: ahora, datos };
          preciosRef.current = precios;
        }
      }

      const [promos, orInfo] = await Promise.all([
        chatPromos().catch(() => null),
        openrouterInfo().catch(() => null),
      ]);

      const mundo: MundoCopiloto = {
        cuentas: vivas,
        precios: precios?.datos,
        promos: promos?.lista.map((p) => ({ id: p.id, nombre: p.nombre, descuento: p.descuento })),
        hayClaveApi: !!orInfo,
      };

      // ── Y lo que salga, a la bandeja ──────────────────────────────────
      // La marca del último aviso se comparte con el vigía: la bandeja es una
      // sola y dos líneas seguidas de dos vigilantes distintos son exactamente
      // lo que el enfriamiento existe para evitar (`bandeja.ts`).
      let memoria = podar(leerMemoria(), ahora);
      memoria = { ...memoria, ultima: Math.max(memoria.ultima, ultimoAviso()) };
      for (const { sesion, consejo } of aProponer(
        sesiones,
        mundo,
        memoria,
        ahora,
        modoCopiloto(),
      )) {
        try {
          await writeInbox("paso", sesion.proyecto, consejo.texto);
        } catch {
          // Si no se pudo escribir, no se apunta: el consejo sigue pendiente y
          // se vuelve a intentar en la siguiente vuelta.
          continue;
        }
        memoria = anotar(memoria, sesion.sessionId, consejo, ahora);
        apuntarAviso(ahora);
      }
      guardarMemoria(memoria);
    };

    const primera = window.setTimeout(() => void vuelta(), PRIMERA_MS);
    const reloj = window.setInterval(() => void vuelta(), CADA_MS);
    return () => {
      vivo = false;
      window.clearTimeout(primera);
      window.clearInterval(reloj);
    };
  }, []);

  return null;
}
