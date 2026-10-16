// El conserje en el móvil, del lado de la ventana.
//
// El servidor está en Rust (`src-tauri/src/movil.rs`) y la página del móvil va
// dentro del binario (`movil.html`). Lo que Rust no sabe hacer solo se lo pide
// a esta ventana por el evento `movil:pedido`, y aquí se contesta con
// `movil_reply`:
//
//   estados  cómo va cada pestaña de una conversación. Eso lo sabe la ventana,
//            que es quien tiene los paneles; con el arranque de ahora, que un
//            panel de ayer con el mismo número no es el suyo (ver `paneDe`).
//   enviar   mandarle un mensaje al conserje por el MISMO camino que el hilo del
//            PC (`enviarAlConserje`): router, reja, y abrir sin sacarte de nada.
//            Se contesta en el acto y el móvil va preguntando cómo va.
//
// Y las terminales (decisión E3 de Munir, 2026-10-07: texto libre desde el
// móvil a cualquier terminal):
//
//   terminales  la lista de paneles de las dos vistas, con su estado.
//   pantalla    las últimas líneas de uno, del búfer de xterm con su historial
//               (`historiaDe`); en la pantalla alternativa, la pantalla.
//   escribir    texto a un panel por `sendPty`, que es el camino del pegado
//               entre corchetes y el Intro aparte (ver `mandar_texto` en pty.rs).
//   tecla       Intro, Esc o Ctrl+C sueltos, por `writePty`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { sendPty, writePty, type PaneStatus } from "./pty";
import { historiaConColor, historiaDe } from "./terminales";
import {
  arranqueDeAhora,
  avisarCambio,
  claveDe,
  conserjeLeer,
  estadoDe,
  fijoDe,
  onPaso,
  paneDe,
  type ConserjeExec,
} from "./conserje";
import { enviarAlConserje } from "./conserjeEnvio";
import { FONDO_DESENFOQUE_KEY, FONDO_OPACIDAD_KEY } from "./fondo";
import { limitesDe } from "./cuota";
import { cerebroPorDefecto } from "./models";
import { fotoRapida } from "./mundo";
import type { CuentaViva } from "./router";
import { etiquetaCorta, leerRenovacion } from "./uso";
import { lineasEnVivo, providerOf, PROVIDERS, sabe } from "./providers";

export interface Dispositivo {
  /** El principio de su huella: sirve para quitarlo, no para entrar. */
  id: string;
  nombre: string;
  creado: number;
  visto: number;
  /** Si ese móvil pidió avisos. */
  avisos: boolean;
}

export interface EstadoMovil {
  encendido: boolean;
  /** Si el hilo tiene el puerto de verdad (otro Adeorq abierto se lo quita). */
  sirviendo: boolean;
  /** Mientras sirve, el PC no se duerme solo (Windows, enchufado). */
  despierto: boolean;
  /** Cuántos móviles pidieron avisos. */
  avisos: number;
  puerto: number;
  dispositivos: Dispositivo[];
  codigo: { valor: string; quedan: number } | null;
}

export interface Tailscale {
  instalado: boolean;
  conectado: boolean;
  /** Que `tailscale serve` de verdad lleva su puerto al conserje (leído de su configuración). */
  llevado: boolean;
  direccion: string | null;
  /** Lo que ya ocupa ese puerto de Tailscale y no es el conserje: no se pisa. */
  ajeno: string | null;
  /** Linux: tu usuario no puede tocar `serve` sin ser el operador. */
  denegado: boolean;
  salida: string;
  /** Los móviles de tu red de Tailscale, los conectados primero. */
  moviles: MovilEnTailscale[];
}

export interface MovilEnTailscale {
  nombre: string;
  en_linea: boolean;
  /** La última vez que Tailscale lo vio, en segundos Unix; 0 si no lo dice. */
  visto: number;
}

export const movilEstado = () => invoke<EstadoMovil>("movil_estado");
export const movilEncender = (encendido: boolean) => invoke<EstadoMovil>("movil_encender", { encendido });
export const movilEmparejar = () => invoke<{ valor: string; quedan: number }>("movil_emparejar");
export const movilOlvidar = (id: string) => invoke<EstadoMovil>("movil_olvidar", { id });
export const movilTailscale = (conectar: boolean) => invoke<Tailscale>("movil_tailscale", { conectar });
/** El idioma de la app, para que la página del móvil hable el mismo. */
export const movilIdioma = (idioma: string) => invoke<void>("movil_idioma", { idioma });
/** Un aviso a los móviles que los pidieron; devuelve a cuántos se intentó. */
export const movilAvisar = (titulo: string, cuerpo: string, url = "/") =>
  invoke<number>("movil_avisar", { titulo, cuerpo, url });

/** Lo que llega de Rust. Viene de una petición del móvil: se valida aquí. */
export interface PedidoMovil {
  peticion: number;
  clase: string;
  id?: unknown;
  texto?: unknown;
  panel?: unknown;
  tecla?: unknown;
  modelo?: unknown;
  que?: unknown;
}

/** Las teclas sueltas que el móvil puede mandar, y sus bytes. Como
    `TECLAS_DEL_MOVIL` en `movil.rs`, que es quien las deja pasar. */
const TECLAS: Record<string, string> = {
  // Esc es «Parar»; Shift+Tab cambia de modo en Claude Code. Intro, Ctrl+C y
  // las flechas se quitaron del móvil (2026-10-16): lo que no tiene botón no
  // se deja teclear.
  esc: "\x1b",
  "shift+tab": "\x1b[Z",
};
/** Cuántas líneas se mandan como mucho. Con la pantalla sola (60) desde el
    móvil no se veía el historial de una consola (Munir, 2026-10-08); el
    móvil las pide cada 3 s, así que tampoco el búfer entero. */
const TOPE_FILAS = 400;

const resumen = (s: PaneStatus) => ({
  panel: s.id,
  nombre: s.name,
  carpeta: s.cwd,
  agente: s.agent,
  modelo: s.model ?? null,
  estado: s.state,
  sesion: s.sessionId ?? null,
  // Cuánto contexto lleva gastado, para enseñarlo arriba en el móvil.
  contexto: typeof s.percent === "number" ? Math.round(s.percent) : null,
});

/** Cada ventana de cuota de una cuenta, para las baterías de «Uso» en el móvil:
    cuál es (las 5 horas, la semana, el mes; `etiquetaCorta`), cuánto lleva y
    cuándo se renueva, en milisegundos. Lo mismo que lee Cuentas en el PC
    (`limitesDe`, con su caché), con reloj: una que tarda se queda sin ventanas
    en vez de dejar al móvil esperando. */
async function ventanasDe(v: CuentaViva): Promise<{ clave: string; modelo: string | null; gastado: number; renueva: number | null }[]> {
  if (!v.conectada || !sabe(v.cuenta.provider, "usage")) return [];
  try {
    const l = await Promise.race([
      limitesDe({ provider: v.cuenta.provider, dir: v.cuenta.dir }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("tarde")), 7000)),
    ]);
    return l.lines.map((x) => {
      const e = etiquetaCorta(x.label);
      return {
        clave: e.clave,
        modelo: e.modelo ?? null,
        gastado: Math.round(x.percent),
        renueva: x.resetsAt > 0 ? x.resetsAt : (leerRenovacion(x.resets)?.getTime() ?? null),
      };
    });
  } catch {
    return [];
  }
}

/** Los modelos a los que el móvil puede cambiar una terminal en marcha: los que
    su programa entiende en vivo (`enVivo` en providers.ts), con el nombre que
    les da él. Vacío si ese programa no cambia en marcha: el móvil no enseña el botón. */
export function modelosEnVivo(cli: string): { alias: string; nombre: string }[] {
  const p = PROVIDERS.find((x) => x.id === cli);
  if (!p?.enVivo?.modelo) return [];
  if (!p.modelos) return ["haiku", "sonnet", "opus", "fable"].map((a) => ({ alias: a, nombre: a[0].toUpperCase() + a.slice(1) }));
  return (["haiku", "sonnet", "opus"] as const).flatMap((a) => (p.modelos?.[a] ? [{ alias: a, nombre: p.modelos[a] as string }] : []));
}

/** La pantalla de un panel para el móvil: con color si se puede (y entonces
    sin el texto aparte, que el móvil lo saca de los trozos y se ahorra la
    mitad de lo que viaja cada 3 s por datos), o el texto solo. */
function pantallaDe(panel: number): Record<string, unknown> {
  const conColor = historiaConColor(panel, TOPE_FILAS);
  return conColor ?? { filas: historiaDe(panel, TOPE_FILAS) ?? [] };
}

async function atenderTerminal(p: PedidoMovil, exec: ConserjeExec): Promise<Record<string, unknown>> {
  if (p.clase === "terminales") return { terminales: exec.panes().map(resumen) };
  const panel = Number(p.panel);
  const st = Number.isInteger(panel) ? exec.panes().find((s) => s.id === panel) : undefined;
  if (!st) return { error: "Esa terminal ya no está." };
  if (p.clase === "pantalla") {
    const cli = exec.cliDe?.(panel) ?? "";
    return { ...resumen(st), cli, modelos: modelosEnVivo(cli), modos: sabe(cli, "modoPlan"), ...pantallaDe(panel) };
  }
  // «Compactar» o «Nueva con traspaso» desde el móvil: lo hace el panel, con su
  // traspaso y su campana (`useTraspaso`), como sus dos botones del PC.
  if (p.clase === "traspaso") {
    const que = p.que === "nueva" ? "nueva" : "compactar";
    const ev = new CustomEvent("adeorq:traspaso", { detail: { id: panel, que, hecho: false } });
    window.dispatchEvent(ev);
    return ev.detail.hecho ? { ok: true } : { error: "Esa terminal no se puede compactar desde aquí." };
  }
  // El botón «Modelo» del móvil: en el idioma del programa de ESE panel, que a
  // un Codex un «/model sonnet» se le iría como mensaje y se pondría a trabajar.
  if (p.clase === "modelo") {
    const lineas = typeof p.modelo === "string" ? lineasEnVivo(exec.cliDe?.(panel) ?? "", p.modelo) : [];
    if (!lineas.length) return { error: "Esta terminal no cambia de modelo en marcha." };
    for (const [i, linea] of lineas.entries()) {
      // Escalonadas: el programa repinta al cambiar y se comería la siguiente.
      if (i) await new Promise((r) => setTimeout(r, 400));
      await sendPty(panel, linea);
    }
    return { ok: true };
  }
  if (p.clase === "escribir") {
    const texto = typeof p.texto === "string" ? p.texto.trim() : "";
    if (!texto) return { error: "No hay nada que mandar." };
    await sendPty(panel, texto);
    return { ok: true };
  }
  const bytes = TECLAS[String(p.tecla)];
  if (!bytes) return { error: "Esa tecla no se manda desde el móvil." };
  await writePty(panel, bytes);
  return { ok: true };
}

/** Cómo va lo que se mandó desde el móvil, por conversación. */
export interface EnCurso {
  pensando: boolean;
  paso: string;
  /** Lo que se mandó, para que el móvil pueda reintentarlo tal cual. */
  texto: string;
  aviso: string | null;
  error: string | null;
}

const enCurso = new Map<string, EnCurso>();

export async function atenderPedido(p: PedidoMovil, exec: ConserjeExec): Promise<Record<string, unknown>> {
  if (p.clase === "terminales" || p.clase === "pantalla" || p.clase === "escribir" || p.clase === "tecla" || p.clase === "modelo" || p.clase === "traspaso") {
    return atenderTerminal(p, exec);
  }
  // Lo que le queda a cada cuenta, para «Uso» en el cajón del móvil: lo mismo
  // que lee el router, con lo que haya a los seis segundos si alguna tarda.
  if (p.clase === "uso") {
    const vivas = await fotoRapida(exec.cuentas(), 6000);
    const ventanas = await Promise.all(vivas.map(ventanasDe));
    return {
      cuentas: vivas.map((v, i) => ({
        nombre: v.cuenta.label,
        programa: providerOf(v.cuenta.provider).label,
        agente: v.cuenta.provider !== "shell",
        instalada: v.instalado,
        conectada: v.conectada,
        gastado: typeof v.gastado === "number" ? Math.round(v.gastado) : null,
        plan: v.plan ?? null,
        ventanas: ventanas[i],
      })),
    };
  }
  // Cómo se ve el PC, para que el móvil arranque igual (Ajustes del móvil):
  // el acento del tema que está puesto y cuánto se ve y se desenfoca su foto.
  if (p.clase === "apariencia") {
    const numero = (clave: string, si: number) => {
      try {
        const n = Number(localStorage.getItem(clave) ?? si);
        return Number.isFinite(n) ? n : si;
      } catch {
        return si;
      }
    };
    return {
      acento: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || null,
      opacidad: numero(FONDO_OPACIDAD_KEY, 60),
      desenfoque: numero(FONDO_DESENFOQUE_KEY, 0),
    };
  }
  const id = typeof p.id === "string" ? p.id : "";
  if (!id) return { error: "Falta la conversación." };

  if (p.clase === "estados") {
    const [conv, arranque] = await Promise.all([conserjeLeer(id), arranqueDeAhora().catch(() => null)]);
    const panes = exec.panes();
    const estados: Record<string, string> = {};
    const sesiones: Record<string, string> = {};
    for (const w of conv.trabajos) {
      const pane = paneDe(w, panes, arranque);
      estados[claveDe(w)] = estadoDe(pane);
      const sid = pane?.sessionId || w.sesion;
      if (sid) sesiones[claveDe(w)] = sid;
    }
    return { estados, sesiones, en_curso: enCurso.get(id) ?? null };
  }

  if (p.clase === "enviar") {
    const texto = typeof p.texto === "string" ? p.texto.trim() : "";
    if (!texto) return { error: "No hay nada que mandar." };
    if (enCurso.get(id)?.pensando) return { error: "El conserje todavía está con lo anterior." };
    const estado: EnCurso = { pensando: true, paso: "", texto, aviso: null, error: null };
    enCurso.set(id, estado);
    void (async () => {
      const conv = await conserjeLeer(id).catch(() => null);
      const r = await enviarAlConserje(id, texto, {
        exec,
        conv,
        // Con el router apagado, el modelo que se fijó en esta conversación
        // (desde el PC o desde el móvil), y si no el de por defecto.
        fijo: fijoDe(conv) ?? cerebroPorDefecto() ?? "sonnet",
        alCambio: () => avisarCambio(id),
      });
      enCurso.set(id, { ...estado, pensando: false, paso: "", aviso: r.aviso, error: r.error });
      avisarCambio(id);
    })();
    return { ok: true };
  }

  return { error: `No sé hacer «${p.clase}».` };
}

/** Escucha lo que pide el móvil y lo atiende con lo que haya AHORA en la app. */
export function escucharMovil(exec: () => ConserjeExec): () => void {
  const quitar: Promise<UnlistenFn>[] = [
    listen<PedidoMovil>("movil:pedido", (ev) => {
      const p = ev.payload;
      void atenderPedido(p, exec())
        .catch((e) => ({ error: String(e) }))
        .then((datos) => invoke("movil_reply", { peticion: p.peticion, datos }));
    }),
    // Lo que va haciendo, para que el móvil no vea quince segundos en blanco.
    onPaso((x) => {
      const c = enCurso.get(x.id);
      if (c?.pensando) c.paso = x.paso;
    }),
  ];
  return () => quitar.forEach((q) => void q.then((f) => f()));
}
