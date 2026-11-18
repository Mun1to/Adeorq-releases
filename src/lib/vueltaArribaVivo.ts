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
import { lectorDeCaja } from "./cajaDeEntrada";
import { enPantalla, trabajaEnPantalla } from "./contexto";
import { invoke } from "@tauri-apps/api/core";
import { proveedorDe, sabe } from "./providers";
import { datosPanel, sendPty } from "./pty";
import { xtermDe } from "./terminales";
import {
  alCambiarHijas,
  aunParadas,
  cabe,
  encolar,
  lineaPara,
  MIRAR_MS,
  paradasSinEntregar,
  puedeTeclear,
  rearmarFondoRetirado,
  trabajoDeFondoEnPantalla,
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
/** Las madres que la última mirada vio paradas en su caja vacía. */
const quietas = new Set<number>();
/** La línea recién tecleada a cada madre y los Intros de más que lleva. Se
    suelta en cuanto la línea deja de estar en su caja: si luego Munir la
    recupera con ↑, no se vuelve a mandar. */
const atascadas = new Map<number, { linea: string; n: number }>();
const MAX_REINTENTOS = 3;

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
  if (cli !== undefined && !lectorDeCaja(cli)) return "sin_caja";
  const h = hijas.get(p.hija);
  const nombre = nombreDe(p.hija);
  hijas.set(p.hija, h ? { ...h, madre: p.madre, entrego: true } : { madre: p.madre, nombre, entrego: true, listaDesde: null, contadaParada: false });
  saberCli(p.madre);
  avisar(p.madre, { hija: p.hija, nombre, que: "entrega", estado: p.estado, texto: p.resumen, cuando: Date.now() });
  return "aceptado";
}

/** Si la pantalla de la terminal `m` dice que trabaja, con el lector de su CLI. */
function trabajaLaMadre(m: number): boolean {
  const term = xtermDe(m);
  const lector = lectorDeCaja(clis.get(m) ?? "");
  return enPantalla(term, trabajaEnPantalla) || (!!lector && enPantalla(term, lector.trabaja));
}

/** Si la hija `id` espera algo suyo: subagentes fuera, o lo que dice su pantalla. */
function conTrabajoDeFondo(id: number): boolean {
  if ((useCabina.getState().estados[id]?.agentsLive ?? 0) > 0) return true;
  return enPantalla(xtermDe(id), trabajoDeFondoEnPantalla);
}

/** Si la hija `id` está ahora mismo con algo: a una así no se le ofrece cerrarla,
    aunque su entrega de antes dijera «hecho». */
function sigueConAlgo(id: number): boolean {
  return useCabina.getState().estados[id]?.state === "a_medias" || conTrabajoDeFondo(id) || enPantalla(xtermDe(id), trabajaEnPantalla);
}

/** Cada `MIRAR_MS`: las paradas sin entregar, y teclear a quien ya se pueda. */
function mirar(): void {
  const ahora = Date.now();
  const r = paradasSinEntregar(hijas, ahora, conTrabajoDeFondo);
  for (const a of r.avisos) avisar(hijas.get(a.hija)?.madre, a);
  hijas = r.hijas;
  // Verla trabajar es lo que se esperaba tras teclearle. En un CLI sin turno en
  // disco (Gemini) es la única señal, porque su estado no sale de «»: sin
  // mirarlo aquí, la siguiente línea esperaba los 45 s enteros.
  for (const [m, t] of [...tecleadoEn]) {
    if (ahora - t >= TRAS_TECLEAR_MS || trabajaLaMadre(m)) {
      tecleadoEn.delete(m);
      atascadas.delete(m);
      continue;
    }
    // Su línea sigue escrita en la caja, ella sola: el Intro cayó dentro de la
    // ventana en que el CLI lo toma por un salto de línea del pegado (Codex,
    // 120 ms), y lo que hay escrito es exactamente lo nuestro: se pulsa otra vez.
    const a = atascadas.get(m);
    if (!a) continue;
    const tiene = lectorDeCaja(clis.get(m) ?? "")?.tieneEscrito;
    if (tiene && a.n < MAX_REINTENTOS && enPantalla(xtermDe(m), (l, f) => tiene(l, f, a.linea))) {
      a.n++;
      void sendPty(m, "", true).catch(() => {});
    } else atascadas.delete(m);
  }
  if (!colas.size) return;
  const estados = useCabina.getState().estados;
  for (const [m, enCola] of colas) {
    const st = estados[m];
    const cola = aunParadas(enCola, hijas);
    if (cola.length !== enCola.length) {
      colas.set(m, cola);
      hijas = rearmarFondoRetirado(hijas, enCola.filter((a) => !cola.includes(a)));
    }
    if (!cola.length || !st) {
      colas.delete(m);
      quietas.delete(m);
      continue;
    }
    const term = xtermDe(m);
    const cli = clis.get(m) ?? "";
    const lector = lectorDeCaja(cli);
    const trabajando = trabajaLaMadre(m);
    const antes = tecleadoEn.get(m);
    if (antes != null && ahora - antes < TRAS_TECLEAR_MS) continue;
    const enSuCaja = !!lector && enPantalla(term, lector.enSuCaja);
    const madre = {
      estado: st,
      deAgente: !!proveedorDe(cli),
      conCaja: !!lector,
      enSuCaja,
      trabajando,
      turnoEnDisco: sabe(cli, "compactaConTraspaso") || sabe(cli, "estadoDelDisco"),
      quietaAntes: quietas.has(m),
    };
    if (enSuCaja && !trabajando) quietas.add(m);
    else quietas.delete(m);
    if (!puedeTeclear(madre)) continue;
    colas.delete(m);
    quietas.delete(m);
    const suyos = (enviados.get(m) ?? []).filter((t) => ahora - t < 3_600_000);
    // Pasado el tope, solo la campana: sus hijas ya salen en ella.
    if (!cabe(suyos, ahora)) continue;
    enviados.set(m, [...suyos, ahora]);
    tecleadoEn.set(m, ahora);
    const linea = lineaPara(cola, sigueConAlgo, ahora);
    atascadas.set(m, { linea, n: 0 });
    void sendPty(m, linea).catch(() => {});
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
    // Salir de «lista» es ponerse a trabajar. Solo si estaba en ella: una madre
    // sin turno en disco (Gemini) nunca lo está, y esto le quitaba la espera
    // tras teclearle con cualquier cambio de cualquier panel.
    for (const m of [...tecleadoEn.keys()]) {
      const ya = s.estados[m]?.state;
      if (ya === undefined || (antes.estados[m]?.state === "lista" && ya !== "lista")) tecleadoEn.delete(m);
    }
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
