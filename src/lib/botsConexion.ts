// Conectar un bot con las herramientas de Adeorq, del lado de la ventana. La puerta,
// la clave y lo que se escribe están en Rust (`bots_conexion.rs`, `bots_yaml.rs`);
// esto solo lo pide y lo enseña. La clave no llega aquí, salvo la línea para pegar en
// Grok Bot, que se enseña una vez y no se guarda.

import { invoke } from "@tauri-apps/api/core";

export type NivelDeBot = "mirar" | "plan" | "auto";

export const NIVELES: NivelDeBot[] = ["mirar", "plan", "auto"];

export interface HechoDeBot {
  cuando_ms: number;
  herramienta: string;
  terminal: number | null;
  fallo: boolean;
}

export interface FilaDeBot {
  bot: string;
  nombre: string;
  instalado: boolean;
  conectado: boolean;
  nivel: NivelDeBot;
  veces: number;
  /** Segundos Unix. */
  ultima_vez: number;
  /** De la más nueva a la más vieja. */
  hechos: HechoDeBot[];
}

export interface VistaDeConexion {
  archivo: string | null;
  texto: string;
}

export interface Conexion {
  filas: FilaDeBot[];
  copia: string | null;
  linea: string | null;
}

export interface Desconexion {
  filas: FilaDeBot[];
  aviso: string | null;
}

export const botsConexiones = () => invoke<FilaDeBot[]>("bots_conexiones");
export const botsConectarVista = (bot: string) => invoke<VistaDeConexion>("bots_conectar_vista", { bot });
export const botsConectar = (bot: string) => invoke<Conexion>("bots_conectar", { bot });
export const botsNivel = (bot: string, nivel: NivelDeBot) => invoke<FilaDeBot[]>("bots_nivel", { bot, nivel });
export const botsDesconectar = (bot: string) => invoke<Desconexion>("bots_desconectar", { bot });

/** Lo que dice cada escalón, en palabras de quien lo elige. */
export const NOMBRE_DE_NIVEL: Record<NivelDeBot, string> = {
  mirar: "Mira",
  plan: "Abre con mi clic",
  auto: "Manda sin preguntar",
};

export const QUE_HACE_EL_NIVEL: Record<NivelDeBot, string> = {
  mirar: "Ve la lista de terminales y el uso. No lee lo que hay dentro.",
  plan: "Además abre terminales. Si llevan un encargo, te pregunta antes. Solo lee las que abrió él.",
  auto: "Escribe en cualquier terminal, abre sin preguntar y lo lee todo.",
};

const QUE_HIZO: Record<string, string> = {
  get_active_panes: "Miró las terminales",
  get_usage: "Miró el uso",
  get_projects: "Miró los proyectos",
  open_pane: "Abrió una terminal",
  close_pane: "Cerró una terminal",
  read_pane_screen: "Leyó una terminal",
  read_pane_transcript: "Leyó una terminal",
  send_command: "Escribió en una terminal",
  send_keys: "Escribió en una terminal",
  compactar_terminal: "Compactó una terminal",
  link_panes: "Dibujó una flecha",
  ask_decision: "Te pidió una decisión",
  get_decision: "Miró las decisiones",
  buscar_memoria: "Buscó en la memoria",
  leer_memoria: "Leyó la memoria",
  leer_turno: "Leyó una conversación",
  get_agenda: "Miró la agenda",
  get_mods: "Miró los mods",
  otra: "Pidió algo que no existe",
};

/** Una herramienta en palabras llanas. Lo que no se conoce, con su nombre: es un dato. */
export function queHizo(herramienta: string): string {
  return QUE_HIZO[herramienta] ?? herramienta;
}

/** La hora, y el día si no es hoy. */
export function horaDe(ms: number, lang: string, ahora: Date = new Date()): string {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === ahora.toDateString() ? hora : `${d.toLocaleDateString(lang, { day: "numeric", month: "short" })} ${hora}`;
}
