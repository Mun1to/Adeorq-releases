// El puente con el segundo cerebro. El trabajo está en `memoria.rs`.

import { invoke } from "@tauri-apps/api/core";

export interface Doc {
  /** Ruta relativa a la bóveda, con `/`. Es el identificador. */
  id: string;
  title: string;
  /** Carpeta que lo contiene, relativa. Vacía en la raíz. */
  folder: string;
  stamp: number;
  words: number;
  /** A qué otros documentos enlaza, ya resueltos. */
  links: string[];
}

export interface Vault {
  root: string;
  docs: Doc[];
  vistos: number;
  /** Si la carpeta tiene `.obsidian` dentro: es una bóveda de verdad. */
  obsidian: boolean;
}

export interface DocText {
  id: string;
  text: string;
  stamp: number;
  path: string;
}

export interface Hit {
  id: string;
  title: string;
  excerpt: string;
  hits: number;
  score: number;
}

/** Dónde vive el cerebro. Es un ajuste como la carpeta de proyectos, y por el
    mismo motivo: no todo el mundo la tiene donde Munir. */
const BOVEDA_KEY = "adeorq-boveda";

export function boveda(): string {
  return localStorage.getItem(BOVEDA_KEY) ?? "";
}

export function guardarBoveda(ruta: string): void {
  localStorage.setItem(BOVEDA_KEY, ruta);
}

export interface VaultInfo {
  path: string;
  name: string;
  docs: number;
  abierta: boolean;
}

/** Las bóvedas que Obsidian ya conoce, sin rastrear el disco: él lleva su
    propia lista y basta con leerla. Vacío si no usa Obsidian. */
export function memoriaVaults(): Promise<VaultInfo[]> {
  return invoke("memoria_vaults");
}

export function memoriaScan(root: string): Promise<Vault> {
  return invoke("memoria_scan", { root });
}

export function memoriaRead(root: string, id: string): Promise<DocText> {
  return invoke("memoria_read", { root, id });
}

/** Guardar. El `stamp` es el que traía el documento al abrirlo: si el archivo
    cambió por fuera desde entonces, Rust se niega en vez de pisarlo. */
export function memoriaWrite(
  root: string,
  id: string,
  text: string,
  stamp: number,
): Promise<DocText> {
  return invoke("memoria_write", { root, id, text, stamp });
}

export function memoriaSearch(q: string, limite?: number): Promise<Hit[]> {
  return invoke("memoria_search", { q, limite });
}

/** La carpeta de primer nivel de un documento: es lo que le da color en la
    constelación, porque en la bóveda de Munir cada una es un proyecto. */
export function familia(d: Doc): string {
  if (!d.folder) return "·";
  return d.folder.split("/")[0];
}
