// La ventana atendiendo al MCP.
//
// Un agente con el MCP de Adeorq puesto pide abrir otra terminal, cerrarla,
// unir dos con una flecha, o que se le diga qué hay pintado en una. Rust no sabe
// montar un panel (eso es React), así que emite el pedido por `mcp:pedido` y
// espera aquí la respuesta. Lo que DECIDE qué abrir vive aparte y es puro
// (`lib/supremo.ts`); los topes (seis vivas, doce por hora) están en Rust,
// porque el presupuesto no lo guarda quien lo gasta. El plano entero está en
// `docs/SUPREMA.md`.
//
// Vivía dentro de `App()`. Lo que necesita de allí le llega por refs, y no es
// por gusto: `closePane` y el estado de los paneles se declaran cientos de
// líneas más abajo que el sitio donde se monta este oyente.
//
// Para comprobarlo sin un agente de verdad: `scripts/laboratorio/pedidos-mcp.js`
// le manda doce pedidos a la ventana y devuelve una huella de lo que contestó.

import { useEffect } from "react";
import { confiarCarpeta, listProjects, mcpReply, onPedidoMcp, type Account, type PaneStatus } from "./pty";
import { pantallaDe } from "./terminales";
import { fotoRapida, parteDelEquipo } from "./mundo";
import { comandoDe } from "./lanzar";
import { sabe } from "./providers";
import {
  ARRANCAN_CON_ENCARGO,
  carpetaDe,
  cliPedido,
  nombreDe,
  parteDeApertura,
  type PedidoMcp,
} from "./supremo";

interface Ref<T> {
  current: T;
}

export interface ManosDelPuente {
  /** Abrir una terminal. Dice dónde quedó, o nada si no pudo. */
  addPane: (
    name: string,
    cwd: string,
    command?: string[],
  ) => { id: number; donde: "lienzo" | "cabina" } | null | undefined;
  /** Dibujar una flecha entre dos terminales del lienzo. */
  enlazarRef: Ref<((from: number, to: number, auto: boolean) => boolean) | null>;
  /** Cerrar una terminal, igual que su ✕. */
  cerrarRef: Ref<((id: number) => void) | null>;
  /** El estado de cada panel, para `paneles`. */
  panelesRef: Ref<() => PaneStatus[]>;
  accountsRef: Ref<{ list: Account[] }>;
  agyExe: Ref<string | null>;
}

export function usePuenteMcp({ addPane, enlazarRef, cerrarRef, panelesRef, accountsRef, agyExe }: ManosDelPuente): void {
  useEffect(() => {
    const atender = async (p: PedidoMcp) => {
      const responder = (r: Parameters<typeof mcpReply>[1]) =>
        void mcpReply(p.peticion, r).catch(() => {});
      try {
        if (p.clase === "link_panes") {
          const hecho = enlazarRef.current?.(Number(p.from), Number(p.to), !!p.auto);
          responder(
            hecho
              ? {}
              : {
                  error:
                    "No se pudo dibujar: las flechas solo existen en el Lienzo, y esas dos terminales tienen que estar las dos allí.",
                },
          );
          return;
        }
        /* Cerrar. Rust ya comprobó que la terminal existe en el mapa del PTY, así
           que aquí no se vuelve a juzgar: se hace. `closePane` mata el proceso y
           retira el panel de las dos listas (cabina y lienzo), que es exactamente
           lo mismo que hace la X, y por eso no hay un camino de muerte aparte
           para el MCP: dos formas de matar un agente se separan con el tiempo y
           una de las dos se queda sin arreglar. */
        if (p.clase === "close_pane") {
          const id = Number(p.paneId);
          if (!Number.isFinite(id) || id <= 0) {
            responder({ error: "`paneId` tiene que ser el número de una terminal." });
            return;
          }
          if (!cerrarRef.current) {
            responder({ error: "la ventana todavía no está lista para cerrar terminales" });
            return;
          }
          cerrarRef.current(id);
          responder({});
          return;
        }
        // Cuánto queda en cada cuenta. Lo contesta la ventana y no Rust porque
        // aquí ya está leído y guardado: preguntárselo otra vez a los CLIs
        // costaría un proceso de cinco segundos por cuenta para saber lo mismo.
        // Lo que se ve en un panel ahora mismo: la única fuente es el búfer
        // que xterm tiene pintado (`lib/terminales.ts`). En la pantalla
        // alternativa el historial de bytes no lo dice.
        if (p.clase === "pantalla") {
          const id = Number(p.paneId);
          const filas = Number.isFinite(id) ? pantallaDe(id) : null;
          responder(filas ? { datos: { filas } } : { error: `No tengo pintada la terminal ${p.paneId}.` });
          return;
        }
        // El nombre, el modelo y el estado de cada panel, que Rust no sabe:
        // los números vuelven a empezar al abrir Adeorq y el nombre es lo que
        // deja a un agente reconocer su terminal otro día.
        if (p.clase === "paneles") {
          const datos = panelesRef.current().map((s) => ({
            id: s.id,
            name: s.name,
            model: s.model ?? "",
            state: s.state,
            porque: s.porque,
            sessionId: s.sessionId ?? "",
          }));
          responder({ datos });
          return;
        }
        if (p.clase === "uso") {
          // Con reloj: el puente de Rust espera 25 s como mucho, y refrescar la
          // cuota de tres cuentas frías son tres procesos de cinco segundos.
          // Ocho segundos dan de sobra para refrescar lo que haga falta, y si
          // no llega se contesta con lo último que se supo, que es infinitamente
          // mejor que dejar al agente sin respuesta.
          const vivas = await fotoRapida(accountsRef.current.list, 8000);
          responder({ parte: parteDelEquipo(vivas) });
          return;
        }
        if (p.clase !== "open_pane") {
          responder({ error: `No sé atender «${p.clase}».` });
          return;
        }

        const elegido = cliPedido(p.cli);
        if ("error" in elegido) return responder({ error: elegido.error });
        const { cli } = elegido;

        const proyectos = await listProjects().catch(() => []);
        const donde = carpetaDe(p, proyectos);
        if ("error" in donde) return responder({ error: donde.error });
        const cwd = donde.cwd;

        const brief = (p.brief ?? "").trim();
        const label = nombreDe(p, cwd, cli);
        // Solo Claude y Antigravity aceptan el encargo en la línea de arranque.
        // Al resto se les abre la terminal y se le DICE al agente que lo mande
        // él: meterle texto suelto a un CLI que espera un subcomando es abrirle
        // una terminal con un error dentro.
        const conEncargo = !!brief && ARRANCAN_CON_ENCARGO.has(cli);
        const command = comandoDe({ cli, encargo: brief, agyExe: agyExe.current });

        /* Antes de abrirla, que pueda arrancar. Una terminal de Claude en una
           carpeta donde Munir no ha entrado nunca nace parada en «¿confías en
           esta carpeta?», y ahí se queda: quien la abrió es un agente, no hay
           nadie mirando la pantalla. Se marca la confianza primero (ver
           `confiar_carpeta` en `mcp.rs`, que explica qué NO toca y por qué).

           Se ignora el fallo A PROPÓSITO: esto ahorra un clic, no autoriza nada
           que el agente no pudiera hacer igual. Si no se puede escribir, la
           terminal se abre lo mismo y el diálogo lo contesta el agente leyendo
           la pantalla, que es lo que hacía antes de existir esto. */
        if (sabe(cli, "confianza")) {
          await confiarCarpeta(cwd).catch(() => false);
        }

        const abierto = addPane(label, cwd, command);
        if (!abierto) return responder({ error: "no pude abrir la terminal" });

        // La flecha de paso, si la pidió: así el árbol le queda hecho sin una
        // segunda llamada. Solo cuela en el lienzo, y se dice cuando no.
        let flecha: "hecha" | "sin-lienzo" | undefined;
        if (typeof p.from === "number" && p.from > 0) {
          const ok =
            abierto.donde === "lienzo" &&
            !!enlazarRef.current?.(p.from, abierto.id, false);
          flecha = ok ? "hecha" : "sin-lienzo";
        }

        responder({
          pane_id: abierto.id,
          donde: abierto.donde,
          parte: parteDeApertura({
            paneId: abierto.id,
            cli,
            donde: abierto.donde,
            conEncargo: conEncargo || !brief,
            flecha,
          }),
        });
      } catch (e) {
        responder({ error: String(e) });
      }
    };

    let vivo = true;
    const un = onPedidoMcp((p) => {
      if (vivo) void atender(p);
    });
    return () => {
      vivo = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, [addPane]);
}
