// La vuelta hacia arriba en marcha: mira los paneles, guarda la cola de cada
// madre y le teclea su línea cuando para con la caja vacía. Lo que decide es
// puro y vive en `vueltaArriba.ts`; aquí solo se engancha a la ventana.
//
// Se monta una vez, desde la campana (`Campana.tsx`, siempre montada), como
// `conectarAvisos`. Quién es hija de quién lo apunta `lib/puenteMcp.ts` al
// abrir una terminal por `open_pane`, y la entrega llega de Rust por el mismo
// puente (`entregar`, `src-tauri/src/mcp/entregar.rs`).

import { kindDeComando } from "../components/KindIcon";
import { useCabina } from "./cabina";
import { enPantalla, esperaEnSuCaja, trabajaEnPantalla } from "./contexto";
import { invoke } from "@tauri-apps/api/core";
import { proveedorDe, sabe } from "./providers";
import { datosPanel, sendPty } from "./pty";
import { xtermDe } from "./terminales";
import {
  alCambiarHijas,
  cabe,
  encolar,
  lineaPara,
  MIRAR_MS,
  paradasSinEntregar,
  puedeTeclear,
  type AvisoArriba,
  type EstadoEntrega,
  type Hija,
} from "./vueltaArriba";

/** Ajustes › Terminales, encendido de fábrica. */
const CLAVE = "adeorq-vuelta-arriba";
export function leerVueltaArriba(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "0";
  } catch {
    return true;
  }
}
export function guardarVueltaArriba(si: boolean): void {
  try {
    localStorage.setItem(CLAVE, si ? "1" : "0");
  } catch {
    /* sin almacén, se queda como estaba */
  }
}

/** Tras teclearle, se espera a que la madre se ponga a trabajar antes de la
    siguiente línea; si no se la ve (un turno de un segundo cae entre dos
    lecturas de su transcript), a esto como mucho. Con 120 s, en el laboratorio
    el «se cerró» llegó dos minutos tarde. Lo que de verdad impide teclearle a
    media faena es su pantalla («esc to interrupt») y su caja. */
const TRAS_TECLEAR_MS = 45_000;

let hijas = new Map<number, Hija>();
const colas = new Map<number, AvisoArriba[]>();
const enviados = new Map<number, number[]>();
const tecleadoEn = new Map<number, number>();
const clis = new Map<number, string>();

const nombreDe = (id: number) => useCabina.getState().estados[id]?.name ?? `terminal ${id}`;

function saberCli(madre: number): void {
  if (clis.has(madre)) return;
  void datosPanel(madre)
    .then((d) => clis.set(madre, kindDeComando(d.command?.join(" ") ?? "")))
    .catch(() => {});
}

/** La terminal `hija` la abrió la terminal `madre` con `open_pane`. */
export function apuntarHija(hija: number, madre: number): void {
  if (!Number.isFinite(hija) || !Number.isFinite(madre) || hija === madre) return;
  hijas.set(hija, { madre, nombre: nombreDe(hija), entrego: false, listaDesde: null, contadaParada: false });
  saberCli(madre);
}

/** La cerró alguien por `close_pane`. Si fue su madre, eso no es noticia para
    ella; si es un relevo por cuota, su conversación sigue en otra terminal
    (que llega por `sincronizar`). Las dos se olvidan sin aviso. */
export function alCerrarPorMcp(hija: number, quien: unknown, relevo: boolean): void {
  const h = hijas.get(hija);
  if (!h || (!relevo && quien !== h.madre)) return;
  hijas.delete(hija);
  const cola = colas.get(h.madre);
  if (cola) colas.set(h.madre, cola.filter((a) => a.hija !== hija));
}

function avisar(madre: number | undefined, a: AvisoArriba): void {
  if (madre == null || !leerVueltaArriba()) return;
  colas.set(madre, encolar(colas.get(madre) ?? [], a));
}

/** Lo que entregó una hija, desde Rust. «apagado» si Munir quitó los avisos;
    «sin_caja» si en la madre corre un CLI cuya caja no se sabe leer, y nunca
    se le va a teclear (`puedeTeclear`). */
export function alEntregar(p: { hija: number; madre: number; estado: EstadoEntrega; resumen: string }): "aceptado" | "apagado" | "sin_caja" {
  if (!leerVueltaArriba()) return "apagado";
  const cli = clis.get(p.madre);
  if (cli !== undefined && !sabe(cli, "compactaConTraspaso")) return "sin_caja";
  const h = hijas.get(p.hija);
  const nombre = nombreDe(p.hija);
  hijas.set(p.hija, h ? { ...h, madre: p.madre, entrego: true } : { madre: p.madre, nombre, entrego: true, listaDesde: null, contadaParada: false });
  saberCli(p.madre);
  avisar(p.madre, { hija: p.hija, nombre, que: "entrega", estado: p.estado, texto: p.resumen, cuando: Date.now() });
  return "aceptado";
}

/** Cada `MIRAR_MS`: las paradas sin entregar, y teclear a quien ya se pueda. */
function mirar(): void {
  const ahora = Date.now();
  const r = paradasSinEntregar(hijas, ahora);
  for (const a of r.avisos) avisar(hijas.get(a.hija)?.madre, a);
  hijas = r.hijas;
  if (!colas.size) return;
  const estados = useCabina.getState().estados;
  for (const [m, cola] of colas) {
    const st = estados[m];
    if (!cola.length || !st) {
      colas.delete(m);
      continue;
    }
    const antes = tecleadoEn.get(m);
    if (antes != null && ahora - antes < TRAS_TECLEAR_MS) continue;
    const term = xtermDe(m);
    const cli = clis.get(m) ?? "";
    const madre = {
      estado: st,
      deAgente: !!proveedorDe(cli),
      conCaja: sabe(cli, "compactaConTraspaso"),
      enSuCaja: enPantalla(term, esperaEnSuCaja),
      trabajando: enPantalla(term, trabajaEnPantalla),
    };
    if (!puedeTeclear(madre)) continue;
    colas.delete(m);
    const suyos = (enviados.get(m) ?? []).filter((t) => ahora - t < 3_600_000);
    // Pasado el tope, solo la campana: sus hijas ya salen en ella.
    if (!cabe(suyos, ahora)) continue;
    enviados.set(m, [...suyos, ahora]);
    tecleadoEn.set(m, ahora);
    void sendPty(m, lineaPara(cola)).catch(() => {});
  }
}

/** Quién es hija de quién, según Rust (`madres_de_delegadas`), con la madre
    buscada por su conversación. Lo de esta ventana vive en memoria: tras
    reiniciar o actualizar Adeorq, tras un Reanimar de la madre o un relevo por
    cuota de la hija, sin esto la madre dejaba de enterarse en silencio. */
const SINCRONIZAR_MS = 30_000;
function sincronizar(): void {
  void invoke<{ hija: number; madre: number; entrego: boolean }[]>("madres_de_delegadas")
    .then((lista) => {
      for (const x of lista) {
        const h = hijas.get(x.hija);
        if (h && h.madre === x.madre) continue;
        hijas.set(x.hija, h ? { ...h, madre: x.madre } : { madre: x.madre, nombre: nombreDe(x.hija), entrego: x.entrego, listaDesde: null, contadaParada: false });
        saberCli(x.madre);
      }
    })
    .catch(() => {});
}

/** Engancha la vuelta hacia arriba al estado de los paneles. Una vez, desde la
    campana; devuelve cómo soltarla. */
export function conectarVueltaArriba(): () => void {
  sincronizar();
  const resincronizar = window.setInterval(sincronizar, SINCRONIZAR_MS);
  const un = useCabina.subscribe((s, antes) => {
    if (s.estados === antes.estados) return;
    for (const m of [...tecleadoEn.keys()]) if (s.estados[m]?.state !== "lista") tecleadoEn.delete(m);
    if (!hijas.size) return;
    const viejas = hijas;
    const r = alCambiarHijas(hijas, antes.estados, s.estados, Date.now());
    hijas = r.hijas;
    for (const a of r.avisos) avisar(viejas.get(a.hija)?.madre, a);
  });
  const reloj = window.setInterval(mirar, MIRAR_MS);
  return () => {
    un();
    window.clearInterval(reloj);
    window.clearInterval(resincronizar);
  };
}
