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
import { historiaDe } from "./terminales";
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
import { cerebroPorDefecto } from "./models";

export interface Dispositivo {
  /** El principio de su huella: sirve para quitarlo, no para entrar. */
  id: string;
  nombre: string;
  creado: number;
  visto: number;
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
}

export const movilEstado = () => invoke<EstadoMovil>("movil_estado");
export const movilEncender = (encendido: boolean) => invoke<EstadoMovil>("movil_encender", { encendido });
export const movilEmparejar = () => invoke<{ valor: string; quedan: number }>("movil_emparejar");
export const movilOlvidar = (id: string) => invoke<EstadoMovil>("movil_olvidar", { id });
export const movilTailscale = (conectar: boolean) => invoke<Tailscale>("movil_tailscale", { conectar });
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
}

/** Las teclas sueltas que el móvil puede mandar, y sus bytes. Como
    `TECLAS_DEL_MOVIL` en `movil.rs`, que es quien las deja pasar. */
const TECLAS: Record<string, string> = {
  intro: "\r", esc: "\x1b", "ctrl+c": "\x03",
  // Shift+Tab cambia de modo en Claude Code; las flechas, para los menús que no
  // hacen caso a los números (el del tema de la bienvenida).
  "shift+tab": "\x1b[Z", arriba: "\x1b[A", abajo: "\x1b[B",
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
});

async function atenderTerminal(p: PedidoMovil, exec: ConserjeExec): Promise<Record<string, unknown>> {
  if (p.clase === "terminales") return { terminales: exec.panes().map(resumen) };
  const panel = Number(p.panel);
  const st = Number.isInteger(panel) ? exec.panes().find((s) => s.id === panel) : undefined;
  if (!st) return { error: "Esa terminal ya no está." };
  if (p.clase === "pantalla") return { ...resumen(st), filas: historiaDe(panel, TOPE_FILAS) ?? [] };
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
  if (p.clase === "terminales" || p.clase === "pantalla" || p.clase === "escribir" || p.clase === "tecla") {
    return atenderTerminal(p, exec);
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
