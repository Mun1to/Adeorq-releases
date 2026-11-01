// La tarjeta para compartir tu uso, con su editor: una ventana encima de todo,
// con el fondo casi negro, que se abre con el evento `adeorq:abrir-tarjeta`
// (`detail: { desde, hasta }`, días locales; un día es `desde === hasta`). Lo
// lanza tu uso (`PerfilUso.tsx`): un día, el récord o el icono de compartir.
// La monta `PerfilView.tsx`, que la encuentra sola en cuanto existe.
//
// Es el editor que Munir aprobó el 2026-10-17 («ahora sí lo has hecho bien y
// como Axiom»), https://claude.ai/artifact/UvMFzPKUZoFegjcpgpUYCw: la tarjeta
// grande arriba; debajo «Imagen · Vídeo» y 16:9 · 9:16, la tira de fondos con
// «Subir» al final, y una barra corta: «Resaltar la cifra» (apagado de
// fábrica), Mes · Día · Récord · Total, Proyecto, cinco colores, Descargar y
// Copiar. Sin cárceles: lo elegido va con color y raya de acento, nunca en un
// recuadro.
//
// La tarjeta la pinta UNA función (`pintarTarjeta`, de `lib/pintarTarjeta.ts`)
// en un lienzo: aquí a su tamaño en pantalla, y en `lib/exportarTarjeta.ts` a
// 1920×1080 o 1080×1920 para el PNG y el MP4. Así lo que se guarda es lo que
// se ve. Un proyecto solo sale en la tarjeta si lo eliges (ningún nombre sale
// sin que lo pidas).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Account } from "../lib/pty";
import { useT, type Translate } from "../lib/i18n";
import { useYo } from "../lib/perfil";
import { cuentasQueLeer, historiaLeida, leerHistoria } from "../lib/historiaDeUso";
import { comoFecha, diasDelMes } from "../lib/calendario";
import { proveedorDe } from "../lib/providers";
import { comoFuente, esVideo as fondoDeCasaEsVideo, leerFondo } from "../lib/fondo";
import {
  cifra,
  conDia,
  entre,
  fechaLarga,
  fechaLocal,
  nombreDeProyecto,
  nombreDelMes,
  porcentaje,
  porDia,
  porfolio,
  record,
  sumar,
  type CuboDelDia,
  type Historia,
} from "../lib/usoDelPerfil";
import { SONIDOS, sonidoDe, subida, type IdSonido } from "../lib/sonidoTarjeta";
import {
  FORMATOS,
  MINIMO,
  RECOMENDADO,
  aDisco,
  audioDisponible,
  copiarImagen,
  exportarImagen,
  exportarVideo,
  fondoConSonido,
  fotogramasDelVideo,
  guardarTarjeta,
  pedirRutaVideo,
  segundosDelTramo,
  sonidoDelFondo,
  tramoDe,
  videoDisponible,
  type Fondo,
  type Formato,
  type Pintar,
  type Tramo,
} from "../lib/exportarTarjeta";
import {
  COLORES,
  FONDOS_DE_SERIE,
  imagenDeSerie,
  miniDeSerie,
  muestraDe,
  pintarTarjeta,
  type ColorTarjeta,
  type DatosTarjeta,
  type FilaTarjeta,
  type FondoDeSerie,
} from "../lib/pintarTarjeta";
import { BajarIcon, ChevronIcon, CloseIcon, DuplicarIcon, ImageIcon, PlusIcon, VideoIcon } from "./Icons";
import Espera, { Ocupado } from "./Espera";

const EVENTO = "adeorq:abrir-tarjeta";

type Tipo = "imagen" | "video";
/** Lo que cuenta la tarjeta. «total» es todo desde tu primer día con uso
    (Munir, 2026-10-18: «que puedas compartir tu total pnl»). */
type Que = "mes" | "dia" | "record" | "total";

/** Un fondo de la tira. */
interface FondoTarjeta {
  id: string;
  tipo: Tipo;
  nombre: string;
  /** Lo que se pinta en la miniatura y en la vista previa. */
  url: string;
  /** Lo que se le pasa al motor al exportar; los de serie se dibujan al tamaño. */
  fuente: Blob | string | null;
  serie?: FondoDeSerie;
  /** Los importados: su nombre en la carpeta de Adeorq, para poder quitarlo. */
  quitable?: string;
}

/** Un fondo importado, como lo cuenta Rust (`fondos_tarjeta.rs`). */
type Guardado = { nombre: string; ruta: string; video: boolean; bytes: number };

/** Lo que se deja importar, la misma lista cerrada que en Rust. */
const EXTENSIONES: Record<Tipo, string[]> = {
  imagen: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
  video: ["mp4", "m4v", "mov", "webm"],
};

const comoFondo = (g: Guardado): FondoTarjeta => {
  const url = convertFileSrc(g.ruta);
  return { id: `guardado:${g.nombre}`, tipo: g.video ? "video" : "imagen", nombre: g.nombre, url, fuente: url, quitable: g.nombre };
};

/** Lo que importaste: Rust lo copia a la carpeta de Adeorq y sigue en la tira
    al reabrir la app. Se relee al abrir la tarjeta; esto es lo último leído,
    para no abrir con la tira vacía mientras llega. */
let guardados: FondoTarjeta[] = [];

/** El recorte de cada vídeo (por su id) y los dos volúmenes, que se recuerdan
    también al reiniciar. */
const CLAVE_RECORTES = "adeorq-tarjeta-recortes";
const CLAVE_VOLUMEN = "adeorq-tarjeta-volumen";
type Volumen = { video: number; vista: number };
/** La vista previa nace al 30 %: añadir un vídeo nunca suena a tope (Munir:
    «tú añades un vídeo y de repente sale todo volumen»). */
const VOLUMEN_DE_FABRICA: Volumen = { video: 1, vista: 0.3 };

function leerGuardado<T extends object>(clave: string, defecto: T): T {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "null");
    return v && typeof v === "object" ? { ...defecto, ...(v as T) } : defecto;
  } catch {
    return defecto;
  }
}

const entre01 = (x: number) => Math.min(1, Math.max(0, x));

/** «0:03», «12:40». */
function minSeg(s: number): string {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/** «10 s» por debajo del minuto, «1:30» desde ahí. */
function cuanto(s: number): string {
  return s < 59.5 ? `${Math.max(0, Math.round(s))} s` : minSeg(s);
}

/** Lo que elegiste la última vez, para que la siguiente se abra igual. El
    proyecto NO: cada vez sale en «Ninguno» hasta que lo pidas. */
const recuerdo: { tipo: Tipo; fondo: string; resaltar: boolean; sonido: boolean; origen: Origen; color: ColorTarjeta; formato: Formato } = {
  tipo: "imagen",
  fondo: "",
  resaltar: false,
  sonido: true,
  origen: SONIDOS[0].id,
  color: "azul",
  formato: "16:9",
};

/** De dónde sale el sonido del vídeo: uno de los hechos en código
    (`lib/sonidoTarjeta.ts`) o el que trae el propio vídeo de fondo. */
type Origen = IdSonido | "fondo";

/** El sonido de un vídeo de `segundos`, hecho una vez por origen, largo y
    tramo. Solo se pide con el recorte ya soltado: arrastrando un tirador no se
    hace ninguno. */
const sonidos = new Map<string, Promise<AudioBuffer | null>>();
function sonidoPara(origen: Origen, segundos: number, fondo: FondoTarjeta, tramo: Tramo): Promise<AudioBuffer | null> {
  const clave = origen === "fondo" ? `fondo|${fondo.url}|${segundos}|${tramo.desde}|${tramo.hasta}` : `${origen}|${segundos}`;
  let p = sonidos.get(clave);
  if (!p) {
    const archivo = fondo.fuente instanceof Blob || typeof fondo.fuente === "string" ? fondo.fuente : null;
    p = origen !== "fondo" ? sonidoDe(origen, segundos) : archivo ? sonidoDelFondo(archivo, segundos, 48000, tramo) : Promise.resolve(null);
    sonidos.set(clave, p);
    p.catch(() => sonidos.delete(clave));
  }
  return p;
}

/** La tarjeta en el segundo `t` del vídeo: la cifra sube de 0 a la suya en
    `LLEGADA` segundos, frenando, como suena el sonido. */
function enElSegundo(d: DatosTarjeta, total: number, t: number, lang: "es" | "en"): DatosTarjeta {
  const k = subida(t);
  return k >= 1 ? d : { ...d, total: cifra(total * k, lang) };
}

/** Donde suena la vista previa. Uno para toda la app: abrir uno por vez que se
    abre la tarjeta los va dejando vivos. Todo pasa por `ganancia`, que es el
    volumen del vídeo por el de la vista previa. */
let altavoz: AudioContext | null = null;
let ganancia: GainNode | null = null;
function salidaPrevia(): GainNode {
  altavoz ??= new AudioContext();
  if (!ganancia) {
    ganancia = altavoz.createGain();
    ganancia.connect(altavoz.destination);
  }
  return ganancia;
}

const mayuscula = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** «15 de octubre» («15 October»), sin el año: el del récord. */
function diaYMes(fecha: string, lang: "es" | "en"): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long" });
}

/** Los días del mes de una fecha que ya han pasado: del 1 al último, o a hoy. */
function mesHastaHoy(fecha: string, hoy: string): [string, string] {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const ultimo = comoFecha(anio, mes, diasDelMes(anio, mes));
  return [comoFecha(anio, mes, 1), ultimo < hoy ? ultimo : hoy];
}

/** El color de un CLI aclarado hacia el blanco: su tono tal cual se pierde
    sobre una foto oscura (el naranja de Claude, #d97757, sale #ffab8a en el
    prototipo). */
function aclarar(hex: string, cuanto = 0.35): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const canal = (c: number) => Math.round(c + (255 - c) * cuanto);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(canal);
  return `rgb(${r}, ${g}, ${b})`;
}

/** El proveedor que más pesa en esos cubos, como fila: «Claude Code 100 %». */
function filaDelProveedor(cubos: CuboDelDia[], lang: "es" | "en"): FilaTarjeta | null {
  const p = porfolio(cubos, "proveedor", 99)[0];
  if (!p) return null;
  const prov = proveedorDe(p.clave);
  return { etiqueta: prov?.label ?? p.clave, valor: porcentaje(p.parte, lang), color: aclarar(prov?.hue ?? "#ffffff") };
}

/** La frase del proyecto, partida donde va el nombre, que lleva su color. */
function partirFrase(t: Translate, n: string, proyecto: string, pct: string): DatosTarjeta["frase"] {
  const [antes, despues = ""] = t("{n} en {proyecto} · {pct}", { n, pct }).split("{proyecto}");
  return { antes, proyecto, despues };
}

/** Lo que dice la tarjeta, en una línea: el nombre del lienzo para quien no lo ve. */
function textoDe(d: DatosTarjeta): string {
  const partes = [`${d.titulo}: ${d.total} ${d.unidad}`];
  if (d.frase) partes.push(`${d.frase.antes}${d.frase.proyecto}${d.frase.despues}`);
  if (d.filas.length) partes.push(d.filas.map((f) => `${f.etiqueta} ${f.valor}`).join(", "));
  if (d.quien) partes.push(d.quien);
  return partes.join(". ");
}

/** Una imagen ya cargada de su dirección, para la vista previa. */
const imagenes = new Map<string, Promise<HTMLImageElement>>();
function imagenDe(url: string): Promise<HTMLImageElement> {
  let p = imagenes.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img.decode().then(() => img);
    imagenes.set(url, p);
    p.catch(() => imagenes.delete(url));
  }
  return p;
}

/** El vídeo de la vista previa: suena mudo y en bucle, y se pinta en el
    lienzo en cada fotograma. Al exportar NO se usa este, sino el archivo
    (`lib/exportarTarjeta.ts` lo lee fotograma a fotograma, sin reloj). */
const videos = new Map<string, HTMLVideoElement>();
function videoDe(url: string): HTMLVideoElement {
  let v = videos.get(url);
  if (!v) {
    v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    videos.set(url, v);
  }
  return v;
}

/** Los fotogramas de la línea de tiempo, una vez por vídeo. */
const tiras = new Map<string, Promise<string[]>>();
function fotosDe(f: FondoTarjeta): Promise<string[]> {
  let p = tiras.get(f.url);
  if (!p) {
    const archivo = f.fuente instanceof Blob || typeof f.fuente === "string" ? f.fuente : null;
    p = archivo ? fotogramasDelVideo(archivo, 12) : Promise.resolve([]);
    tiras.set(f.url, p);
    p.catch(() => tiras.delete(f.url));
  }
  return p;
}

type Cual = "desde" | "hasta";

/**
 * El recorte: los fotogramas del clip, dos tiradores (inicio y fin) y la marca
 * de por dónde va. Mientras se arrastra solo avisa con `alMover`; al soltar (o
 * al soltar la tecla), `alSoltar` con el tramo final, y solo entonces se rehace
 * la vista previa y su sonido. Con flechas, un segundo; con Mayúsculas, cinco.
 */
function Recorte({
  duracion,
  tramo,
  fotos,
  marca,
  apagado,
  t,
  alMover,
  alSoltar,
}: {
  duracion: number;
  tramo: Tramo;
  fotos: string[];
  marca: React.RefObject<HTMLElement | null>;
  apagado: boolean;
  t: Translate;
  alMover: (tramo: Tramo, cual: Cual) => void;
  alSoltar: (tramo: Tramo) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const ultimo = useRef<Tramo>(tramo);
  ultimo.current = tramo;
  const fijo = apagado || duracion <= MINIMO;
  const pct = (s: number) => `${duracion > 0 ? (s / duracion) * 100 : 0}%`;
  const mover = (cual: Cual, s: number) => {
    const { desde, hasta } = ultimo.current;
    const nuevo =
      cual === "desde"
        ? { desde: Math.max(0, Math.min(s, hasta - MINIMO)), hasta }
        : { desde, hasta: Math.min(duracion, Math.max(s, desde + MINIMO)) };
    ultimo.current = nuevo;
    alMover(nuevo, cual);
  };
  const enSegundo = (x: number) => {
    const r = caja.current?.getBoundingClientRect();
    return r && r.width > 0 ? entre01((x - r.left) / r.width) * duracion : 0;
  };
  return (
    <div className="pt-recorte" ref={caja} data-fijo={fijo || undefined}>
      <div className="pt-fotos" aria-hidden="true">
        {fotos.map((u, i) => (u ? <img key={i} src={u} alt="" draggable={false} /> : <span key={i} />))}
      </div>
      <div className="pt-fuera" style={{ left: 0, width: pct(tramo.desde) }} />
      <div className="pt-fuera" style={{ left: pct(tramo.hasta), right: 0 }} />
      <div className="pt-elegido" style={{ left: pct(tramo.desde), width: pct(tramo.hasta - tramo.desde) }} />
      <i className="pt-marca" ref={marca as React.RefObject<HTMLElement>} aria-hidden="true" />
      {(["desde", "hasta"] as const).map((cual) => {
        const v = tramo[cual];
        return (
          <span
            key={cual}
            className="pt-tirador"
            data-cual={cual}
            role="slider"
            tabIndex={fijo ? -1 : 0}
            aria-label={cual === "desde" ? t("Inicio del recorte") : t("Fin del recorte")}
            aria-valuemin={0}
            aria-valuemax={Math.round(duracion * 10) / 10}
            aria-valuenow={Math.round(v * 10) / 10}
            aria-valuetext={minSeg(v)}
            aria-disabled={fijo || undefined}
            style={{ left: pct(v) }}
            onPointerDown={(e) => {
              if (fijo) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) mover(cual, enSegundo(e.clientX));
            }}
            onPointerUp={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              e.currentTarget.releasePointerCapture(e.pointerId);
              alSoltar(ultimo.current);
            }}
            onKeyDown={(e) => {
              if (fijo) return;
              const paso = e.shiftKey ? 5 : 1;
              const ahora = ultimo.current[cual];
              const a =
                e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? ahora - paso
                  : e.key === "ArrowRight" || e.key === "ArrowUp"
                    ? ahora + paso
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? duracion
                        : null;
              if (a === null) return;
              e.preventDefault();
              mover(cual, a);
            }}
            onKeyUp={(e) => {
              if (!fijo && /^(Arrow|Home$|End$)/.test(e.key)) alSoltar(ultimo.current);
            }}
          />
        );
      })}
    </div>
  );
}

/** Un volumen de 0 a 100 %, con su nombre y su cifra: control propio, no el
    del sistema. Flechas de 5 en 5; con Mayúsculas, de 1 en 1. */
function Volumen({ nombre, valor, apagado, lang, alCambiar }: { nombre: string; valor: number; apagado: boolean; lang: "es" | "en"; alCambiar: (v: number) => void }) {
  const barra = useRef<HTMLSpanElement>(null);
  // El último valor puesto: con la tecla mantenida llegan varias pulsaciones
  // antes de que React pinte, y cada una tiene que sumar a la anterior.
  const ultimo = useRef(valor);
  ultimo.current = valor;
  const en = (x: number) => {
    const r = barra.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.round(entre01((x - r.left) / r.width) * 100) / 100 : valor;
  };
  return (
    <div className="pt-volumen" data-apagado={apagado || undefined}>
      <span>{nombre}</span>
      <span
        ref={barra}
        className="pt-deslizador"
        role="slider"
        tabIndex={apagado ? -1 : 0}
        aria-label={nombre}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(valor * 100)}
        aria-valuetext={porcentaje(valor, lang)}
        aria-disabled={apagado || undefined}
        style={{ "--v": `${valor * 100}%` } as React.CSSProperties}
        onPointerDown={(e) => {
          if (apagado) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          alCambiar(en(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) alCambiar(en(e.clientX));
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (apagado) return;
          const paso = e.shiftKey ? 0.01 : 0.05;
          const v = ultimo.current;
          const a = /^Arrow(Left|Down)$/.test(e.key) ? v - paso : /^Arrow(Right|Up)$/.test(e.key) ? v + paso : e.key === "Home" ? 0 : e.key === "End" ? 1 : null;
          if (a === null) return;
          e.preventDefault();
          ultimo.current = Math.round(entre01(a) * 100) / 100;
          alCambiar(ultimo.current);
        }}
      >
        <i aria-hidden="true" />
      </span>
      <span className="pt-volumen-cifra">{porcentaje(valor, lang)}</span>
    </div>
  );
}

/** «Guardada en {ruta}», con la ruta como enlace: al pulsarla se abre el
    explorador en su carpeta con el archivo marcado. */
function Guardada({ texto, ruta, t, alFallar }: { texto: string; ruta: string; t: Translate; alFallar: (e: unknown) => void }) {
  const [antes, despues = ""] = texto.split("{ruta}");
  return (
    <>
      {antes}
      <button className="pt-ruta" data-tip={t("Enseñar en el explorador")} onClick={() => void revealItemInDir(ruta).catch(alFallar)}>
        {ruta}
      </button>
      {despues}
    </>
  );
}

export default function PerfilTarjeta({ cuentas }: { cuentas: Account[] }) {
  const { t, lang } = useT();
  const yo = useYo();
  const [abierta, setAbierta] = useState<{ desde: string; hasta: string; dia: string | null } | null>(null);
  const [historia, setHistoria] = useState<Historia | null>(historiaLeida);
  const [que, setQue] = useState<Que>("mes");
  const [proy, setProy] = useState("");
  const [tipo, setTipo] = useState<Tipo>(recuerdo.tipo);
  const [fondoId, setFondoId] = useState(recuerdo.fondo);
  const [resaltar, setResaltar] = useState(recuerdo.resaltar);
  const [sonar, setSonar] = useState(recuerdo.sonido);
  const [origen, setOrigen] = useState<Origen>(recuerdo.origen);
  const [audioOk, setAudioOk] = useState<boolean | null>(null);
  // Los vídeos de fondo que traen sonido propio, por su dirección.
  const [conSonidoPropio, setConSonidoPropio] = useState<Record<string, boolean>>({});
  // Cuándo empezó la vuelta de la vista previa del vídeo, para saber en qué
  // segundo va la cifra que sube; `null` fuera de esa vista.
  const reloj = useRef<number | null>(null);
  const [color, setColor] = useState<ColorTarjeta>(recuerdo.color);
  const [formato, setFormato] = useState<Formato>(recuerdo.formato);
  const [casa, setCasa] = useState<FondoTarjeta | null>(null);
  const [subidas, setSubidas] = useState<FondoTarjeta[]>(() => guardados);
  const [copiando, setCopiando] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [fotos, setFotos] = useState<string[]>([]);
  const [recortes, setRecortes] = useState<Record<string, Tramo>>(() => leerGuardado(CLAVE_RECORTES, {}));
  // El tramo mientras se arrastra un tirador; al soltarlo pasa a `recortes`.
  const [arrastre, setArrastre] = useState<Tramo | null>(null);
  const [volumen, setVolumen] = useState<Volumen>(() => leerGuardado(CLAVE_VOLUMEN, VOLUMEN_DE_FABRICA));
  const marca = useRef<HTMLElement>(null);
  const tiraRef = useRef<HTMLDivElement>(null);
  const [videoOk, setVideoOk] = useState<boolean | null>(null);
  const [lista, setLista] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  // Con `ruta`, el texto lleva `{ruta}` donde va el enlace que abre la carpeta.
  const [estado, setEstado] = useState<{ texto: string; mal?: boolean; ruta?: string } | null>(null);
  const [fuente, setFuente] = useState<CanvasImageSource | null>(null);
  const [fotoImg, setFotoImg] = useState<HTMLImageElement | null>(null);
  const [tam, setTam] = useState(0);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const velo = useRef<HTMLDivElement>(null);
  const cancelar = useRef<AbortController | null>(null);
  const hoy = fechaLocal(new Date());

  const cubos = useMemo(() => conDia(historia?.cubos ?? []), [historia]);
  const mejor = useMemo(() => record(porDia(cubos)), [cubos]);
  // Tu primer día con uso: desde ahí cuenta el total.
  const primero = useMemo(() => cubos.reduce((p, c) => (!p || c.dia < p ? c.dia : p), ""), [cubos]);

  // Abrir: con lo leído por tu uso, o leyéndolo si aún no está.
  useEffect(() => {
    const abrir = (e: Event) => {
      const det = (e as CustomEvent<{ desde?: string; hasta?: string; que?: "mes" | "dia" }>).detail;
      if (!det?.desde) return;
      const desde = det.desde;
      const hasta = det.hasta || desde;
      // Qué es lo dice quien la abre. Sin `que` se deduce de las fechas, como
      // antes; pero el día 1 el mes en curso va «del 1 al 1» y se abría como
      // «Día» (2026-11-01).
      const esDia = det.que ? det.que === "dia" : desde === hasta;
      const leida = historiaLeida();
      setHistoria(leida);
      if (!leida) leerHistoria(cuentasQueLeer(cuentas)).then(setHistoria, () => {});
      // Un día abre ese día; si es tu récord, la tarjeta del récord.
      const elRecord = leida ? record(porDia(conDia(leida.cubos)))?.fecha : undefined;
      setQue(!esDia ? "mes" : desde === elRecord ? "record" : "dia");
      setProy("");
      setLista(false);
      setEstado(null);
      setAbierta({ desde, hasta, dia: esDia ? desde : null });
      invoke<Guardado[]>("tarjeta_fondos")
        .then((l) => {
          guardados = l.map(comoFondo);
          setSubidas(guardados);
        })
        .catch(() => {});
      const sello = Date.now();
      leerFondo()
        .then((ruta) => {
          if (!ruta) return setCasa(null);
          const url = comoFuente(ruta, sello);
          const video = fondoDeCasaEsVideo(ruta);
          setCasa({ id: "casa", tipo: video ? "video" : "imagen", nombre: t("Tu fondo de Adeorq"), url, fuente: url });
        })
        .catch(() => setCasa(null));
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, [cuentas, t]);

  // Si este equipo puede sacar vídeo (en Linux no: WebKitGTK no codifica).
  useEffect(() => {
    if (abierta && videoOk === null) void videoDisponible().then(setVideoOk);
    if (abierta && audioOk === null) void audioDisponible().then(setAudioOk);
  }, [abierta, videoOk, audioOk]);

  // Al abrir, el foco a la ventana: el tabulador y el lector de pantalla
  // empiezan dentro de ella y no en la página de detrás.
  useEffect(() => {
    if (abierta) velo.current?.focus();
  }, [abierta]);

  // Lo elegido se recuerda para la próxima vez que la abras.
  useEffect(() => {
    Object.assign(recuerdo, { tipo, fondo: fondoId, resaltar, sonido: sonar, origen, color, formato });
  }, [tipo, fondoId, resaltar, sonar, origen, color, formato]);
  useEffect(() => {
    localStorage.setItem(CLAVE_RECORTES, JSON.stringify(recortes));
  }, [recortes]);
  useEffect(() => {
    localStorage.setItem(CLAVE_VOLUMEN, JSON.stringify(volumen));
  }, [volumen]);

  // La rueda desliza la tira de lado, que no lleva barra de scroll a la vista.
  useEffect(() => {
    const el = tiraRef.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [abierta, historia]);

  // Tu foto, lista para el lienzo.
  useEffect(() => {
    if (!yo.foto) return setFotoImg(null);
    let vivo = true;
    imagenDe(yo.foto).then(
      (img) => vivo && setFotoImg(img),
      () => vivo && setFotoImg(null),
    );
    return () => {
      vivo = false;
    };
  }, [yo.foto]);

  // ── Los fondos ──
  const fondos = useMemo(() => {
    const serie: FondoTarjeta[] = FONDOS_DE_SERIE.map((f) => ({ id: `serie:${f.id}`, tipo: "imagen", nombre: t(f.nombre), url: miniDeSerie(f.id), fuente: null, serie: f.id }));
    return [...(casa ? [casa] : []), ...subidas, ...serie];
  }, [casa, subidas, t]);
  const visibles = fondos.filter((f) => f.tipo === tipo);
  const elegido = fondos.find((f) => f.id === fondoId) ?? visibles[0] ?? fondos.find((f) => f.tipo === "imagen") ?? null;
  const F = FORMATOS[formato];

  // La fuente de la vista previa: la imagen ya cargada, o el vídeo sonando.
  const exportando = ocupado || progreso !== null;
  useEffect(() => {
    if (!abierta || !elegido) return;
    let vivo = true;
    if (elegido.tipo === "video") {
      const v = videoDe(elegido.url);
      setFuente(v);
      if (!exportando) void v.play().catch(() => {});
      return () => {
        vivo = false;
        v.pause();
      };
    }
    const carga = elegido.serie ? imagenDeSerie(elegido.serie, F.ancho, F.alto) : imagenDe(elegido.url);
    carga.then(
      (img) => vivo && setFuente(img),
      () => vivo && setFuente(null),
    );
    return () => {
      vivo = false;
    };
  }, [abierta, elegido, F.ancho, F.alto, exportando]);

  // Si el vídeo de fondo trae sonido propio, que se pueda elegir.
  useEffect(() => {
    if (!abierta || elegido?.tipo !== "video" || elegido.url in conSonidoPropio) return;
    const { url, fuente: archivo } = elegido;
    if (!(archivo instanceof Blob || typeof archivo === "string")) return;
    void fondoConSonido(archivo).then((si) => setConSonidoPropio((c) => ({ ...c, [url]: si })));
  }, [abierta, elegido, conSonidoPropio]);

  // Lo que dura el vídeo elegido, y los fotogramas de su línea de tiempo.
  const urlVideo = elegido?.tipo === "video" && abierta ? elegido.url : "";
  useEffect(() => {
    setDuracion(0);
    setFotos([]);
    setArrastre(null);
    if (!urlVideo || !elegido) return;
    const v = videoDe(urlVideo);
    let vivo = true;
    const medir = () => vivo && setDuracion(Number.isFinite(v.duration) ? v.duration : 0);
    if (v.readyState >= 1) medir();
    else v.addEventListener("loadedmetadata", medir, { once: true });
    void fotosDe(elegido).then((f) => vivo && setFotos(f), () => {});
    return () => {
      vivo = false;
      v.removeEventListener("loadedmetadata", medir);
    };
    // Solo al cambiar de vídeo: `elegido` es un objeto nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlVideo]);

  // El tramo guardado de este vídeo (de fábrica, el clip entero hasta un minuto)
  // y el que se ve mientras se arrastra un tirador.
  const tramo = useMemo(() => tramoDe(duracion, elegido ? recortes[elegido.id] : null), [duracion, elegido, recortes]);
  const tramoVivo = arrastre ?? tramo;
  const segundos = segundosDelTramo(tramo);

  // La vista previa del vídeo va por vueltas, como el MP4: en cada una el fondo
  // vuelve al principio del tramo, la cifra sube y, con «Sonido», suena. Si el
  // clip dura menos de tres segundos da otra vuelta antes. El sonido del propio
  // vídeo es el del `<video>`, que se deja de silenciar; los otros, los mismos
  // que van dentro del MP4. Depende del tramo SOLTADO, no del que se arrastra.
  const enVideo = Boolean(abierta) && tipo === "video" && elegido?.tipo === "video" && !exportando && duracion > 0;
  const propio = elegido ? conSonidoPropio[elegido.url] === true : false;
  const de: Origen = origen === "fondo" && !propio ? SONIDOS[0].id : origen;
  const suena = sonar && audioOk === true;
  const nivel = volumen.video * volumen.vista;
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;
  useEffect(() => {
    if (!enVideo || !elegido) return;
    const v = videoDe(elegido.url);
    let vivo = true;
    let src: AudioBufferSourceNode | null = null;
    let espera = 0;
    v.muted = !(suena && de === "fondo");
    v.volume = entre01(nivelRef.current);
    const vuelta = async () => {
      const b = suena && de !== "fondo" ? await sonidoPara(de, segundos, elegido, tramo).catch(() => null) : null;
      if (!vivo) return;
      v.currentTime = tramo.desde;
      void v.play().catch(() => {});
      reloj.current = performance.now();
      if (b) {
        const salida = salidaPrevia();
        salida.gain.value = nivelRef.current;
        void altavoz?.resume().catch(() => {});
        src = salida.context.createBufferSource();
        src.buffer = b;
        src.connect(salida);
        src.start();
      }
      espera = window.setTimeout(() => void vuelta(), segundos * 1000);
    };
    void vuelta();
    return () => {
      vivo = false;
      clearTimeout(espera);
      v.muted = true;
      src?.stop();
      reloj.current = null;
    };
  }, [enVideo, elegido, suena, de, segundos, tramo]);

  // El volumen se cambia en vivo, sin rehacer la vuelta: la fuente por el
  // volumen del vídeo por el de la vista previa.
  useEffect(() => {
    if (elegido?.tipo === "video") {
      const v = videos.get(elegido.url);
      if (v) v.volume = entre01(nivel);
    }
    if (ganancia) ganancia.gain.value = nivel;
  }, [nivel, elegido]);

  // ── Lo que dice la tarjeta ──
  const dia = abierta?.dia ?? null;
  const tramoMes: [string, string] | null = abierta ? (dia ? mesHastaHoy(dia, hoy) : [abierta.desde, abierta.hasta]) : null;
  const [desde, hasta] =
    que === "record" && mejor
      ? [mejor.fecha, mejor.fecha]
      : que === "dia" && dia
        ? [dia, dia]
        : que === "total" && primero
          ? [primero, hoy]
          : (tramoMes ?? ["", ""]);
  const mesDesde = tramoMes?.[0] ?? "";
  const delTramo = useMemo(() => (desde ? entre(cubos, desde, hasta) : []), [cubos, desde, hasta]);
  const proyectos = useMemo(() => porfolio(delTramo, "proyecto", 1000, historia?.raiz).filter((p) => p.clave && !p.otros), [delTramo, historia?.raiz]);
  const proyecto = proyectos.find((p) => p.clave.toLowerCase() === proy) ?? null;

  const datos = useMemo<DatosTarjeta | null>(() => {
    if (!historia || !desde || !mesDesde) return null;
    const suma = sumar(delTramo);
    const nuevos: FilaTarjeta = { etiqueta: t("Nuevos"), valor: cifra(suma.nuevos, lang) };
    let titulo: string;
    let filas: (FilaTarjeta | null)[];
    if (que === "record" && mejor) {
      const delMes = sumar(entre(cubos, ...mesHastaHoy(mejor.fecha, hoy)));
      titulo = t("Tu récord · {fecha}", { fecha: diaYMes(mejor.fecha, lang) });
      filas = [nuevos, { etiqueta: t("Total del mes"), valor: cifra(delMes.todos, lang) }, { etiqueta: t("Días activos"), valor: String(delMes.dias) }];
    } else if (que === "dia" && dia) {
      titulo = mayuscula(fechaLarga(dia, lang));
      filas = [nuevos, filaDelProveedor(delTramo, lang)];
    } else if (que === "total" && primero) {
      titulo = t("Desde el {fecha}", { fecha: fechaLarga(primero, lang) });
      filas = [nuevos, filaDelProveedor(delTramo, lang), { etiqueta: t("Días activos"), valor: String(suma.dias) }];
    } else {
      titulo = mayuscula(nombreDelMes(Number(mesDesde.slice(0, 4)), Number(mesDesde.slice(5, 7)), lang));
      filas = [nuevos, filaDelProveedor(delTramo, lang), { etiqueta: t("Días activos"), valor: String(suma.dias) }];
    }
    return {
      titulo,
      total: cifra(suma.todos, lang),
      unidad: t("Tokens"),
      frase: proyecto && suma.todos ? partirFrase(t, cifra(proyecto.tokens, lang), nombreDeProyecto(proyecto.clave), porcentaje(proyecto.parte, lang)) : null,
      filas: filas.filter((f): f is FilaTarjeta => f !== null),
      quien: yo.arroba ? `@${yo.arroba}` : yo.nombre,
      foto: fotoImg,
      pie: ["adeorq.com", t("Hecho con Adeorq")],
      resaltar,
      color,
    };
  }, [historia, desde, mesDesde, que, mejor, dia, primero, delTramo, cubos, proyecto, yo.arroba, yo.nombre, fotoImg, resaltar, color, t, lang, hoy]);

  // ── La vista previa: la misma función que el PNG, al tamaño de la pantalla ──
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const medir = () => {
      const w = Math.max(1, Math.round(c.clientWidth * (window.devicePixelRatio || 1)));
      const h = Math.round((w * F.alto) / F.ancho);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        setTam(w * 10000 + h);
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, [abierta, F.ancho, F.alto, historia]);

  const totalDelTramo = useMemo(() => sumar(delTramo).todos, [delTramo]);
  const dibujar = useCallback(() => {
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !datos) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const t = reloj.current === null ? Infinity : (performance.now() - reloj.current) / 1000;
    pintarTarjeta(ctx, c.width, c.height, fuente, enElSegundo(datos, totalDelTramo, t, lang));
    // La marca de por dónde va, sin pasar por React en cada fotograma.
    if (marca.current && fuente instanceof HTMLVideoElement && duracion > 0) {
      marca.current.style.left = `${(entre01(fuente.currentTime / duracion) * 100).toFixed(3)}%`;
    }
  }, [datos, fuente, totalDelTramo, lang, duracion]);

  useEffect(() => {
    dibujar();
    // Con un vídeo de fondo se repinta en cada fotograma, menos mientras sale
    // el vídeo de verdad, que necesita la máquina entera.
    if (!(fuente instanceof HTMLVideoElement) || exportando) return;
    let id = requestAnimationFrame(function vuelta() {
      dibujar();
      id = requestAnimationFrame(vuelta);
    });
    return () => cancelAnimationFrame(id);
  }, [dibujar, fuente, tam, exportando]);

  // ── Cerrar ──
  const cerrar = useCallback(() => {
    cancelar.current?.abort();
    setAbierta(null);
    setLista(false);
    setFuente(null);
  }, []);

  // Escape desde la ventana y no desde el velo: un botón que se apaga mientras
  // trabaja (Copiar, Descargar) suelta el foco al `body`, y desde ahí la tecla
  // no pasaba por el velo. En captura, para que no le llegue a nada de detrás.
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (lista) setLista(false);
      else cerrar();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [abierta, lista, cerrar]);

  // ── Elegir ──
  const elegirTipo = (nuevo: Tipo) => {
    setTipo(nuevo);
    const primero = fondos.find((f) => f.tipo === nuevo);
    if (elegido?.tipo !== nuevo && primero) setFondoId(primero.id);
  };

  const elegirProyecto = (clave: string) => {
    setProy(clave);
    setLista(false);
  };

  // Importar: se elige con el diálogo y lo copia Rust a la carpeta de Adeorq,
  // archivo a archivo, sin pasar por la memoria de la ventana.
  const subir = async () => {
    const video = tipo === "video";
    setEstado(null);
    try {
      const ruta = await open({
        multiple: false,
        directory: false,
        filters: [{ name: video ? t("Vídeo") : t("Imagen"), extensions: EXTENSIONES[tipo] }],
      });
      if (typeof ruta !== "string") return;
      setCopiando(true);
      const nuevo = comoFondo(await invoke<Guardado>("tarjeta_fondo_importar", { path: ruta }));
      if (nuevo.tipo !== tipo) {
        setEstado({ texto: video ? t("Eso no es un vídeo.") : t("Eso no es una imagen."), mal: true });
      }
      guardados = [nuevo, ...guardados.filter((g) => g.id !== nuevo.id)];
      setSubidas(guardados);
      setTipo(nuevo.tipo);
      setFondoId(nuevo.id);
      tiraRef.current?.scrollTo({ left: 0 });
    } catch (e) {
      fallo(e);
    } finally {
      setCopiando(false);
    }
  };

  // Quitar uno borra solo la copia de Adeorq, nunca el archivo de donde vino.
  const quitar = async (f: FondoTarjeta) => {
    if (!f.quitable) return;
    setEstado(null);
    const v = videos.get(f.url);
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
      videos.delete(f.url);
    }
    tiras.delete(f.url);
    try {
      await invoke("tarjeta_fondo_quitar", { nombre: f.quitable });
      guardados = guardados.filter((g) => g.id !== f.id);
      setSubidas(guardados);
      setRecortes(({ [f.id]: _fuera, ...resto }) => resto);
      if (fondoId === f.id) setFondoId(visibles.find((x) => x.id !== f.id)?.id ?? "");
    } catch (e) {
      fallo(e);
    }
  };

  const soltarRecorte = (nuevo: Tramo) => {
    setArrastre(null);
    if (!elegido) return;
    const redondo = { desde: Math.round(nuevo.desde * 10) / 10, hasta: Math.round(nuevo.hasta * 10) / 10 };
    setRecortes((r) => ({ ...r, [elegido.id]: redondo }));
  };

  // Mientras se arrastra, el vídeo enseña el fotograma del tirador.
  const moverRecorte = (nuevo: Tramo, cual: Cual) => {
    setArrastre(nuevo);
    const v = elegido ? videos.get(elegido.url) : undefined;
    if (v) v.currentTime = nuevo[cual];
  };

  // ── Sacarla ──
  const pintar: Pintar = (ctx, w, h, f) => {
    if (datos) pintarTarjeta(ctx, w, h, f, datos);
  };
  // En el vídeo la cifra sube; en la imagen y al copiar, quieta.
  const pintarVideo: Pintar = (ctx, w, h, f, t) => {
    if (datos) pintarTarjeta(ctx, w, h, f, enElSegundo(datos, totalDelTramo, t, lang));
  };
  const fondoParaSacar = async (): Promise<Fondo> => {
    if (!elegido) return null;
    if (elegido.serie) return imagenDeSerie(elegido.serie, F.ancho, F.alto);
    return elegido.fuente;
  };
  const fallo = (e: unknown) => {
    if (e instanceof DOMException && e.name === "AbortError") return setEstado({ texto: t("Cancelado.") });
    const msg = e instanceof Error ? e.message : String(e);
    setEstado({ texto: t("No ha salido: {e}", { e: t(msg) }), mal: true });
  };
  const conVideo = tipo === "video" && elegido?.tipo === "video";

  const descargar = async () => {
    setEstado(null);
    try {
      if (conVideo && elegido) {
        // Primero dónde, y después sale a disco a trozos: un vídeo largo no
        // cabe entero en memoria esperando a que se elija la carpeta.
        const ruta = await pedirRutaVideo();
        if (!ruta) return;
        const senal = (cancelar.current = new AbortController()).signal;
        setProgreso(0);
        const sonido = suena ? await sonidoPara(de, segundos, elegido, tramo) : null;
        await aDisco(ruta, (escritor) =>
          exportarVideo(pintarVideo, {
            ancho: F.ancho,
            alto: F.alto,
            fps: 30,
            segundos,
            fondo: elegido.fuente,
            tramo,
            sonido,
            volumen: volumen.video,
            escritor,
            alProgreso: (h) => setProgreso(Math.floor(h * 100)),
            senal,
          }),
        );
        setProgreso(null);
        setEstado({ texto: t("Guardada en {ruta}"), ruta });
        return;
      }
      setOcupado(true);
      const png = await exportarImagen(pintar, { ancho: F.ancho, alto: F.alto, fondo: await fondoParaSacar() });
      const ruta = await guardarTarjeta(png);
      if (ruta) setEstado({ texto: t("Guardada en {ruta}"), ruta });
    } catch (e) {
      fallo(e);
    } finally {
      cancelar.current = null;
      setProgreso(null);
      setOcupado(false);
    }
  };

  const copiar = async () => {
    setEstado(null);
    setOcupado(true);
    try {
      const v = elegido?.tipo === "video" ? videos.get(elegido.url) : undefined;
      const png = await exportarImagen(pintar, { ancho: F.ancho, alto: F.alto, fondo: await fondoParaSacar(), t: v?.currentTime ?? 0 });
      await copiarImagen(png);
      setEstado({ texto: t("Copiada: pégala donde quieras.") });
    } catch (e) {
      fallo(e);
    } finally {
      setOcupado(false);
    }
  };

  if (!abierta) return null;

  const opciones: [Que, string, boolean][] = [
    ["mes", t("Mes"), true],
    ["dia", dia ? t("Día {n}", { n: Number(dia.slice(8)) }) : t("Día"), Boolean(dia)],
    ["record", t("Récord"), Boolean(mejor)],
    ["total", t("Total"), Boolean(primero)],
  ];
  const sinVideo = tipo === "video" && !conVideo;

  return createPortal(
    <>
      <div
        ref={velo}
        className="pt-velo"
        role="dialog"
        aria-modal="true"
        aria-label={t("Compartir tu uso")}
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === e.currentTarget) cerrar();
          else if (!(e.target as Element).closest(".pt-elegir")) setLista(false);
        }}
      >
        <div className={["pt-editor", formato === "9:16" && "pt-vertical", conVideo && duracion > 0 && "pt-con-tiempo"].filter(Boolean).join(" ")}>
          <div className="pt-marco">
            {historia ? (
              <canvas ref={lienzo} className="pt-lienzo" role="img" aria-label={datos ? textoDe(datos) : t("Vista previa de la tarjeta")} />
            ) : (
              <Espera activo>{t("Leyendo tus conversaciones… la primera vez tarda un minuto.")}</Espera>
            )}
          </div>

          <div className="pt-debajo">
            <div className="pt-pestanas">
              <button className="pt-op" aria-pressed={tipo === "imagen"} onClick={() => elegirTipo("imagen")}>
                <ImageIcon size={17} />
                {t("Imagen")}
              </button>
              <button className="pt-op" aria-pressed={tipo === "video"} disabled={videoOk === false} onClick={() => elegirTipo("video")}>
                <VideoIcon size={17} />
                {t("Vídeo")}
              </button>
              {videoOk === false && <span className="pt-nota">{t("Este equipo no puede sacar vídeo.")}</span>}

              {/* El formato es de lo que sale, como Imagen o Vídeo, y va en su fila:
                  en la barra, con «Total», ya no cabía (medía 892 px de 900 sin él). */}
              <div className="pt-grupo pt-formato">
                {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                  <button key={f} className="pt-op" aria-pressed={formato === f} onClick={() => setFormato(f)}>
                    {f}
                  </button>
                ))}
              </div>

              {/* El sonido es del vídeo y va a su lado, no en la barra: con él dentro
                  la barra medía 1.198 px en un hueco de 900 y se partía en tres. */}
              {tipo === "video" && (
                <div className="pt-sonido">
                  <button
                    className="pt-interruptor"
                    aria-pressed={sonar && audioOk !== false}
                    disabled={audioOk === false}
                    data-tip={audioOk === false ? t("Este equipo no puede meter sonido en el vídeo.") : undefined}
                    onClick={() => setSonar((s) => !s)}
                  >
                    <i aria-hidden="true" />
                    {t("Sonido")}
                  </button>
                  <div className="pt-grupo" role="group" aria-label={t("Sonido")}>
                    {[...SONIDOS.map((s): [Origen, string] => [s.id, t(s.nombre)]), ...(propio ? [["fondo", t("Del vídeo")] as [Origen, string]] : [])].map(([o, texto]) => (
                      <button key={o} className="pt-op" aria-pressed={de === o} disabled={!suena} onClick={() => setOrigen(o)}>
                        {texto}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* «Subir» va fuera de lo que se desliza: con siete vídeos se iba
                fuera de la vista. La tira se desliza con la rueda, sin barra. */}
            <div className="pt-tira">
              <div className="pt-tira-lista" ref={tiraRef}>
                {visibles.map((f) => (
                  <div key={f.id} className="pt-mini-sitio">
                    <button
                      className="pt-mini"
                      aria-pressed={elegido?.id === f.id}
                      aria-label={f.nombre}
                      aria-keyshortcuts={f.quitable ? "Delete" : undefined}
                      data-tip={f.nombre}
                      style={f.tipo === "imagen" ? { backgroundImage: `url("${f.url}")` } : undefined}
                      onClick={() => setFondoId(f.id)}
                      onKeyDown={(e) => {
                        if (f.quitable && (e.key === "Delete" || e.key === "Backspace")) {
                          e.preventDefault();
                          void quitar(f);
                        }
                      }}
                    >
                      {f.tipo === "video" && <video src={`${f.url}#t=0.1`} muted preload="metadata" />}
                    </button>
                    {f.quitable && (
                      <button
                        className="pt-quitar"
                        aria-label={t("Quitar {nombre}", { nombre: f.nombre })}
                        data-tip={t("Quitar de Adeorq")}
                        disabled={exportando}
                        onClick={() => void quitar(f)}
                      >
                        <CloseIcon size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="pt-subir" disabled={copiando} onClick={() => void subir()}>
                <PlusIcon size={20} />
                <Ocupado activo={copiando} mientras={t("Copiando…")}>
                  {tipo === "video" ? t("Subir vídeo") : t("Subir imagen")}
                </Ocupado>
              </button>
            </div>

            {conVideo && duracion > 0 && (
              <div className="pt-tiempo">
                <div className="pt-tiempo-fila">
                  <Recorte
                    duracion={duracion}
                    tramo={tramoVivo}
                    fotos={fotos}
                    marca={marca}
                    apagado={exportando}
                    t={t}
                    alMover={moverRecorte}
                    alSoltar={soltarRecorte}
                  />
                  {tramoVivo.hasta - tramoVivo.desde > RECOMENDADO + 0.05 && <span className="pt-aviso">{t("Recomendado: menos de 1 minuto")}</span>}
                </div>
                <div className="pt-tiempo-fila">
                  <span className="pt-tramo" aria-live="polite">
                    {t("Empieza {a} · Termina {b} · Dura {c}", { a: minSeg(tramoVivo.desde), b: minSeg(tramoVivo.hasta), c: cuanto(tramoVivo.hasta - tramoVivo.desde) })}
                  </span>
                  <Volumen
                    nombre={t("Volumen del vídeo")}
                    valor={volumen.video}
                    apagado={!suena || exportando}
                    lang={lang}
                    alCambiar={(v) => setVolumen((x) => ({ ...x, video: v }))}
                  />
                  <Volumen
                    nombre={t("Volumen de la vista previa")}
                    valor={volumen.vista}
                    apagado={!suena}
                    lang={lang}
                    alCambiar={(v) => setVolumen((x) => ({ ...x, vista: v }))}
                  />
                </div>
              </div>
            )}

            <div className="pt-barra">
              <button className="pt-interruptor" aria-pressed={resaltar} onClick={() => setResaltar((r) => !r)}>
                <i aria-hidden="true" />
                {t("Resaltar la cifra")}
              </button>

              <div className="pt-grupo">
                {opciones.map(([v, texto, se]) => (
                  <button key={v} className="pt-op" aria-pressed={que === v} disabled={!se} onClick={() => setQue(v)}>
                    {texto}
                  </button>
                ))}
              </div>

              <div className="pt-grupo">
                <span>{t("Proyecto")}</span>
                <div className="pt-elegir">
                  <button className="pt-elegir-btn" aria-expanded={lista} disabled={!proyectos.length} onClick={() => setLista((x) => !x)}>
                    {proyecto ? nombreDeProyecto(proyecto.clave) : t("Ninguno")}
                    <ChevronIcon size={14} />
                  </button>
                  {lista && (
                    <div className="pt-lista" role="listbox" aria-label={t("Proyecto")}>
                      <button role="option" aria-selected={!proyecto} onClick={() => elegirProyecto("")}>
                        {t("Ninguno")}
                      </button>
                      {proyectos.map((p) => (
                        <button
                          key={p.clave}
                          role="option"
                          aria-selected={proyecto?.clave === p.clave}
                          onClick={() => elegirProyecto(p.clave.toLowerCase())}
                        >
                          {nombreDeProyecto(p.clave)}
                          <em>{cifra(p.tokens, lang)}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-grupo pt-muestras">
                {(Object.keys(COLORES) as ColorTarjeta[]).map((c) => (
                  <button
                    key={c}
                    className="pt-muestra"
                    aria-pressed={color === c}
                    aria-label={t(COLORES[c].nombre)}
                    data-tip={t(COLORES[c].nombre)}
                    style={{ background: muestraDe(c) }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>

              <div className="pt-acciones">
                {progreso !== null ? (
                  <>
                    <span className="pt-progreso" role="status">
                      {t("Sacando el vídeo… {pct}", { pct: porcentaje(progreso / 100, lang) })}
                    </span>
                    <button className="pt-accion" onClick={() => cancelar.current?.abort()}>
                      {t("Cancelar")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="pt-accion"
                      disabled={exportando || !datos || sinVideo}
                      data-tip={sinVideo ? t("Elige o sube un vídeo de fondo.") : undefined}
                      onClick={() => void descargar()}
                    >
                      <BajarIcon size={17} />
                      <Ocupado activo={ocupado} mientras={t("Preparando…")}>
                        {tipo === "video" ? t("Descargar vídeo") : t("Descargar")}
                      </Ocupado>
                    </button>
                    <button className="pt-accion" disabled={exportando || !datos} onClick={() => void copiar()}>
                      <DuplicarIcon size={17} />
                      {t("Copiar")}
                    </button>
                  </>
                )}
              </div>
            </div>

            {estado && (
              <p className="pt-estado" data-mal={estado.mal || undefined} role="status">
                {estado.ruta ? <Guardada texto={estado.texto} ruta={estado.ruta} t={t} alFallar={fallo} /> : estado.texto}
              </p>
            )}
          </div>
        </div>
      </div>
      <button className="pt-cerrar" aria-label={t("Cerrar")} data-tip={t("Cerrar")} onClick={() => cerrar()}>
        <CloseIcon size={22} />
      </button>
    </>,
    document.body,
  );
}
