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
import { marcarDelegada, type FaseTraspaso } from "./contexto";
import { apuntarDelegada, olvidarDelegada } from "./delegadas";
import { confiarCarpeta, listProjects, mainAccount, mcpReply, onPedidoMcp, type Account, type PaneStatus } from "./pty";
import { pantallaDe } from "./terminales";
import { conLasPrincipales, fotoRapida, leidaEn, mundoEnCache, parteDelEquipo } from "./mundo";
import { comandoDe } from "./lanzar";
import { cuentaDeArranque, cuentaPedida, cuentasDe } from "./frenoCuota";
import { cuantasPesan, elegirCuenta, modeloParaSuPlan, type CuentaViva } from "./router";
import { isModelAlias } from "./models";
import { proveedorDe, sabe } from "./providers";
import {
  ARRANCAN_CON_ENCARGO,
  carpetaDe,
  cliPedido,
  nombreDe,
  parteDeApertura,
  tituloDeCabecera,
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
    at?: undefined,
    account?: Account,
    team?: undefined,
    shadow?: undefined,
    grupo?: undefined,
    envOverride?: undefined,
    opciones?: { abiertaPor?: string },
  ) => { id: number; donde: "lienzo" | "cabina" } | null | undefined;
  /** Dibujar una flecha entre dos terminales del lienzo. */
  enlazarRef: Ref<((from: number, to: number, auto: boolean) => boolean) | null>;
  /** Cerrar una terminal, igual que su ✕. */
  cerrarRef: Ref<((id: number) => void) | null>;
  /** El estado de cada panel, para `paneles`. */
  panelesRef: Ref<() => PaneStatus[]>;
  accountsRef: Ref<{ list: Account[]; def?: string }>;
  agyExe: Ref<string | null>;
}

/**
 * La cuenta que pide `account`: el id (lo manda un encargo programado) o la
 * etiqueta que el agente ve en `get_usage`, sin distinguir mayúsculas.
 * «principal» es la carpeta de siempre de ese CLI. Una que no existe o es de
 * otro CLI da error con las que sí hay: abrirla en otra sin decirlo sería
 * gastar la cuota que el agente quería guardar.
 */
export function cuentaDelAgente(pedida: string, cli: string, lista: Account[]): Account | { error: string } {
  const q = pedida.trim();
  if (lista.some((a) => a.id === q) || q === mainAccount(cli).id) return cuentaPedida(q, cli, lista);
  const suyas = cuentasDe(cli, lista);
  const hay = suyas.map((a) => `«${a.label}»`).join(", ");
  if (/^(principal|main)$/i.test(q)) return mainAccount(cli);
  const iguales = suyas.filter((a) => a.label.trim().toLowerCase() === q.toLowerCase());
  if (iguales.length === 1) return iguales[0];
  if (iguales.length > 1) return { error: `Hay ${iguales.length} cuentas de ${cli} que se llaman «${q}»: renombra una en Cuentas.` };
  const deOtro = lista.find((a) => a.label.trim().toLowerCase() === q.toLowerCase());
  if (deOtro) return { error: `La cuenta «${deOtro.label}» es de ${deOtro.provider}, no de ${cli}. Las de ${cli}: ${hay}.` };
  return { error: `No hay ninguna cuenta de ${cli} que se llame «${q}». Las que hay: ${hay}. Sin \`account\`, Adeorq elige sola.` };
}

/**
 * Lo que una terminal de Claude en OTRA cuenta no tiene de la casa, en una
 * frase para quien la abre. Cada `CLAUDE_CONFIG_DIR` es una casa aparte: la
 * memoria, el MCP de Adeorq y las skills viven en la principal (`~/.claude` y
 * `~/.claude.json`). Medido el 2026-11-02 en la «2da MAIN» contra la principal:
 * 0 de 3 servidores MCP, 1 de 25 skills y la memoria de 5 carpetas contra 48.
 * Los hooks y las reglas `deny` sí llegan (`sembrar_barreras` en `accounts.rs`).
 */
export function loQueNoVe(cli: string, cuenta: Account, cwd: string): string | undefined {
  if (cli !== "claude" || !cuenta.dir) return undefined;
  const memoria = `~\\.claude\\projects\\${cwd.replace(/[^A-Za-z0-9]/g, "-")}\\memory`;
  return (
    `Ojo: en la cuenta «${cuenta.label}» esa terminal NO ve la memoria de la principal (${memoria}), ` +
    "ni el MCP de Adeorq ni sus skills: si le hace falta algo de ahí, pásale las rutas en el encargo."
  );
}

/** Las terminales que abrió `open_pane` en cada cuenta, para que pesen en ella
    hasta que su gasto salga en una lectura (`cuantasPesan` en `router.ts`). Se
    apuntan al ELEGIR la cuenta, con `panel` sin número mientras nace: el propio
    MCP pide abrirlas a la vez (`instrucciones` en `mcp.rs`), y apuntándolas al
    abrir, varios `await` después, dos a la vez no se veían entre ellas. Las
    cerradas dejan de contar solas: se miran las vivas. */
interface Apertura {
  panel: number | null;
  cuenta: string;
  at: number;
}
const aperturas: Apertura[] = [];

function abiertasDesdeLaLectura(cuenta: Account, vivos: Set<number>): number {
  return cuantasPesan(aperturas.filter((a) => a.cuenta === cuenta.id), leidaEn(cuenta) ?? 0, vivos);
}

export function usePuenteMcp({ addPane, enlazarRef, cerrarRef, panelesRef, accountsRef, agyExe }: ManosDelPuente): void {
  useEffect(() => {
    /** Cada cuenta con lo que ya lleva abierto, para `elegirCuenta`. Después de
        la foto, que puede tardar segundos: las vivas de ahora, no las de antes. */
    const conSusAbiertas = (vivas: CuentaViva[]): CuentaViva[] => {
      const vivos = new Set(panelesRef.current().map((s) => s.id));
      return vivas.map((v) => ({ ...v, abiertas: abiertasDesdeLaLectura(v.cuenta, vivos) }));
    };
    const atender = async (p: PedidoMcp) => {
      const responder = (r: Parameters<typeof mcpReply>[1]) =>
        void mcpReply(p.peticion, r).catch(() => {});
      let apertura: Apertura | undefined;
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
          // Cerrada por quien la abrió: si se retoma otro día, ya no es delegada.
          olvidarDelegada(panelesRef.current().find((s) => s.id === id)?.sessionId);
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
        // `compactar_terminal`: lo hace el panel con su traspaso, que espera a
        // que pare, manda `/fin sin commits` y luego `/compact` (`lib/contexto.ts`).
        // Rust ya comprobó que es de Claude Code y que la abrió un agente.
        if (p.clase === "compactar") {
          const detail: { id: number; que: string; hecho: boolean; deAgente: boolean; fase?: FaseTraspaso } = {
            id: Number(p.paneId),
            que: "compactar",
            hecho: false,
            deAgente: true,
          };
          window.dispatchEvent(new CustomEvent("adeorq:traspaso", { detail }));
          responder(detail.hecho ? { parte: detail.fase ?? "nada" } : { error: `No tengo pintada la terminal ${p.paneId}.` });
          return;
        }
        if (p.clase === "uso") {
          // Con reloj: el puente de Rust espera 25 s como mucho, y refrescar la
          // cuota de tres cuentas frías son tres procesos de cinco segundos.
          // Ocho segundos dan de sobra para refrescar lo que haga falta, y si
          // no llega se contesta con lo último que se supo, que es infinitamente
          // mejor que dejar al agente sin respuesta. Con lo que ya lleva abierto
          // cada cuenta: su última línea dice a cuál va la siguiente terminal, y
          // tiene que ser a la que irá de verdad.
          const vivas = conSusAbiertas(await fotoRapida(conLasPrincipales(accountsRef.current.list), 8000));
          responder({ parte: parteDelEquipo(vivas) });
          return;
        }
        // Lo que enseña la ventana de abrir desde fuera antes de abrir nada: la
        // carpeta de verdad, y si ese CLI va a recibir el encargo (`pedir_abrir.rs`).
        if (p.clase === "donde_abrir") {
          const quiere = cliPedido(p.cli);
          if ("error" in quiere) return responder({ error: quiere.error });
          const carpeta = carpetaDe(p, await listProjects().catch(() => []));
          if ("error" in carpeta) return responder({ error: carpeta.error });
          responder({
            datos: { cwd: carpeta.cwd, cli: proveedorDe(quiere.cli)?.label ?? quiere.cli, conEncargo: ARRANCAN_CON_ENCARGO.has(quiere.cli) },
          });
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
        // Solo los que la tabla marca con `encargoEnLinea` (`ARRANCAN_CON_ENCARGO`,
        // que sale de `providers.ts`) aceptan el encargo en la línea de arranque.
        // Al resto se les abre la terminal y se le DICE al agente que lo mande
        // él: meterle texto suelto a un CLI que espera un subcomando es abrirle
        // una terminal con un error dentro.
        const conEncargo = !!brief && ARRANCAN_CON_ENCARGO.has(cli);
        let modelo = typeof p.model === "string" && isModelAlias(p.model) ? p.model : undefined;
        let plan: string | undefined;
        // La cuenta. Pedida (un encargo programado, o un agente con `account`),
        // esa o un error, nunca otra en silencio. Sin pedir, la que más cuota
        // perdería (`elegirCuenta`, la misma regla de `get_usage` y el router):
        // hasta el 2026-11-02 todas las delegadas iban a la principal.
        let cuenta: Account | undefined;
        let deCuenta: string | undefined;
        if (typeof p.account === "string" && p.account.trim()) {
          const pedida = cuentaDelAgente(p.account, cli, accountsRef.current.list);
          if ("error" in pedida) return responder({ error: pedida.error });
          cuenta = pedida;
          plan = mundoEnCache([pedida])[0]?.plan;
          deCuenta = `Con la cuenta «${pedida.label}», la que pediste.`;
        } else if (p.elegir === true && cli !== "shell") {
          // Solo cuando lo pide el `open_pane` de un agente (`mcp.rs`). Un
          // encargo programado sin cuenta sigue en la predeterminada, que es
          // la que mide su freno (`cuentaDeArranque` en `frenoCuota.ts`).
          const suyas = cuentasDe(cli, accountsRef.current.list);
          // Cada terminal que ya abrió aquí un agente pesa en su cuenta
          // (`abiertas`): con la misma foto, tres aperturas caían en la misma.
          const vivas = conSusAbiertas((await fotoRapida(suyas, 4000)).filter((v) => v.instalado && v.conectada));
          const e = elegirCuenta(vivas, Date.now(), modelo);
          if (e) {
            cuenta = e.viva.cuenta;
            plan = e.viva.plan;
            deCuenta = e.porque;
          } else {
            cuenta = mainAccount(cli);
            deCuenta = "Con la principal: ninguna cuenta de ese CLI tiene la sesión iniciada según sus archivos.";
          }
        }
        // Apuntada ya, antes del siguiente `await`: otra apertura que esté
        // decidiendo a la vez tiene que verla, aunque esta aún no haya nacido.
        if (cuenta) {
          apertura = { panel: null, cuenta: cuenta.id, at: Date.now() };
          aperturas.push(apertura);
        }
        const otraCasa = cuenta ? loQueNoVe(cli, cuenta, cwd) : undefined;
        // Y dentro del techo de su plan: si ninguna cuenta daba el modelo,
        // `elegirCuenta` deja la que haya, y aquí se baja y se dice. Sin plan
        // leído (solo lo deja en disco quien `estadisticas`), no se toca.
        let porTecho: string | undefined;
        if (modelo) {
          const t = modeloParaSuPlan(modelo, plan);
          modelo = t.modelo;
          porTecho = t.porque;
        }
        // La principal va como cuenta y no como `undefined`: sin cuenta,
        // `entornoDePane` (`App.tsx`) usa la predeterminada de Cuentas, que
        // puede ser otra, y la respuesta diría una cosa y la terminal haría otra.
        // `desatendida`: quien la abre es un agente, así que un Claude nace en
        // modo auto y no en el de Ajustes (ver `Peticion` en `lib/arranque.ts`).
        // Salvo que venga de fuera de Adeorq: esa nace en el de Ajustes.
        const conSuModo = p.conSuModo === true;
        const command = comandoDe({ cli, encargo: brief, modelo, agyExe: agyExe.current, desatendida: !conSuModo });

        /* Antes de abrirla, que pueda arrancar. Una terminal de Claude en una
           carpeta donde Munir no ha entrado nunca nace parada en «¿confías en
           esta carpeta?», y ahí se queda: quien la abrió es un agente, no hay
           nadie mirando la pantalla. Se marca la confianza primero (ver
           `confiar_carpeta` en `mcp.rs`, que explica qué NO toca y por qué).

           Se ignora el fallo A PROPÓSITO: esto ahorra un clic, no autoriza nada
           que el agente no pudiera hacer igual. Si no se puede escribir, la
           terminal se abre lo mismo y el diálogo lo contesta el agente leyendo
           la pantalla, que es lo que hacía antes de existir esto.

           Lo de fuera de Adeorq no se marca: ahí la pregunta de la carpeta la
           contesta una persona, en la propia terminal. */
        if (sabe(cli, "confianza") && !conSuModo) {
          // En la carpeta de configuración de la cuenta con la que nace: cada
          // `CLAUDE_CONFIG_DIR` guarda su propia lista de carpetas de confianza,
          // y marcarla en la principal dejaba a la otra cuenta parada en la
          // pregunta. Sin cuenta, la que usará `entornoDePane`: la predeterminada.
          const dir = cuenta ? cuenta.dir : cuentaDeArranque(cli, { list: accountsRef.current.list, def: accountsRef.current.def ?? "" }).dir;
          await confiarCarpeta(cwd, dir).catch(() => false);
        }

        // Quién la pide, con el título que se ve ahora en su cabecera: la de la
        // nueva dirá «de: …» (Munir, 2026-10-17). Solo si su puente presentó su
        // panel; un agente sin panel no tiene cabecera que nombrar.
        const madre = typeof p.quien === "number" ? panelesRef.current().find((s) => s.id === p.quien) : undefined;
        // Un bot no tiene panel, pero sí nombre, y ese lo da su clave: lo pone Rust.
        const abiertaPor = p.deBot || (madre ? tituloDeCabecera(madre.name, madre.cwd).trim() || undefined : undefined);
        // Por su conversación, para que al recrear su panel (otro arranque,
        // Reanimar) vuelva siendo delegada (`lib/delegadas.ts`).
        apuntarDelegada(command, abiertaPor);
        const abierto = addPane(label, cwd, command, undefined, cuenta, undefined, undefined, undefined, undefined, {
          abiertaPor,
        });
        if (!abierto) return responder({ error: "no pude abrir la terminal" });
        marcarDelegada(abierto.id);
        if (apertura) apertura.panel = abierto.id;

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
          // Lo que Rust guarda por su conversación (`mcp/delegadas.rs`).
          datos: { name: label, cwd, command: command ?? [], abiertaPor: abiertaPor ?? null },
          parte: [
            parteDeApertura({
              paneId: abierto.id,
              cli,
              donde: abierto.donde,
              conEncargo: conEncargo || !brief,
              flecha,
              escribe: p.escribe,
            }),
            deCuenta,
            porTecho,
            otraCasa,
          ]
            .filter(Boolean)
            .join(" "),
        });
      } catch (e) {
        responder({ error: String(e) });
      } finally {
        // No llegó a nacer: no pesa en ninguna cuenta.
        if (apertura && apertura.panel == null) aperturas.splice(aperturas.indexOf(apertura), 1);
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
