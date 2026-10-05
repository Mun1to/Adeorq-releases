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

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  arranqueDeAhora,
  avisarCambio,
  claveDe,
  conserjeLeer,
  estadoDe,
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

/** Lo que llega de Rust. Viene de una petición del móvil: se valida aquí. */
export interface PedidoMovil {
  peticion: number;
  clase: string;
  id?: unknown;
  texto?: unknown;
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
        // Con el router apagado se usa tu modelo por defecto: el que eliges en
        // la caja del PC vive en esa caja y el móvil no lo ve.
        fijo: cerebroPorDefecto() ?? "sonnet",
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
