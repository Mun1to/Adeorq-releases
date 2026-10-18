// La tarjeta para compartir tu uso, con su editor: una ventana encima de todo,
// con el fondo casi negro, que se abre con el evento `adeorq:abrir-tarjeta`
// (`detail: { desde, hasta }`, días locales; un día es `desde === hasta`). Lo
// lanza tu uso (`PerfilUso.tsx`): un día, el récord o el icono de compartir.
// La monta `PerfilView.tsx`, que la encuentra sola en cuanto existe.
//
// Es el editor que Munir aprobó el 2026-10-17 («ahora sí lo has hecho bien y
// como Axiom»), https://claude.ai/artifact/UvMFzPKUZoFegjcpgpUYCw: la tarjeta
// grande arriba; debajo «Imagen · Vídeo», la tira de fondos con «Subir» al
// final, y una barra corta: «Resaltar la cifra» (apagado de fábrica), Mes · Día
// · Récord, Proyecto, cinco colores, 16:9 · 9:16, Descargar y Copiar. Sin
// cárceles: lo elegido va con color y raya de acento, nunca en un recuadro.
//
// La tarjeta la pinta UNA función (`pintarTarjeta`, de `lib/pintarTarjeta.ts`)
// en un lienzo: aquí a su tamaño en pantalla, y en `lib/exportarTarjeta.ts` a
// 1920×1080 o 1080×1920 para el PNG y el MP4. Así lo que se guarda es lo que
// se ve. Un proyecto solo sale en la tarjeta si lo eliges (ningún nombre sale
// sin que lo pidas).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  audioDisponible,
  copiarImagen,
  exportarImagen,
  exportarVideo,
  fondoConSonido,
  guardarTarjeta,
  sonidoDelFondo,
  videoDisponible,
  type Fondo,
  type Formato,
  type Pintar,
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
type Que = "mes" | "dia" | "record";

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
}

/** Los tamaños que se dejan subir, los del prototipo. */
const MAX_IMAGEN = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

/** Lo que subiste mientras la app está abierta. No se guarda en disco: al
    cerrar Adeorq se olvida, como la foto que se pega en un chat. */
const subidos: FondoTarjeta[] = [];

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

/** El sonido de un vídeo de `segundos`, hecho una vez por origen y largo. */
const sonidos = new Map<string, Promise<AudioBuffer | null>>();
function sonidoPara(origen: Origen, segundos: number, fondo: FondoTarjeta): Promise<AudioBuffer | null> {
  const clave = origen === "fondo" ? `fondo|${fondo.url}|${segundos}` : `${origen}|${segundos}`;
  let p = sonidos.get(clave);
  if (!p) {
    const archivo = fondo.fuente instanceof Blob || typeof fondo.fuente === "string" ? fondo.fuente : null;
    p = origen !== "fondo" ? sonidoDe(origen, segundos) : archivo ? sonidoDelFondo(archivo, segundos) : Promise.resolve(null);
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
    abre la tarjeta los va dejando vivos. */
let altavoz: AudioContext | null = null;

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

/** Cuánto dura el vídeo que sale: lo que dure el fondo, entre 3 y 10 s. Diez
    segundos con un fondo de vídeo caben en los 10 MB de Discord. */
function segundosDe(url: string): number {
  const d = videos.get(url)?.duration ?? NaN;
  return Number.isFinite(d) && d > 0 ? Math.min(10, Math.max(3, Math.round(d * 10) / 10)) : 10;
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
  const [abierta, setAbierta] = useState<{ desde: string; hasta: string } | null>(null);
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
  const [subidas, setSubidas] = useState<FondoTarjeta[]>(() => [...subidos]);
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
  const archivo = useRef<HTMLInputElement>(null);
  const cancelar = useRef<AbortController | null>(null);
  const hoy = fechaLocal(new Date());

  const cubos = useMemo(() => conDia(historia?.cubos ?? []), [historia]);
  const mejor = useMemo(() => record(porDia(cubos)), [cubos]);

  // Abrir: con lo leído por tu uso, o leyéndolo si aún no está.
  useEffect(() => {
    const abrir = (e: Event) => {
      const det = (e as CustomEvent<{ desde?: string; hasta?: string }>).detail;
      if (!det?.desde) return;
      const desde = det.desde;
      const hasta = det.hasta || desde;
      const leida = historiaLeida();
      setHistoria(leida);
      if (!leida) leerHistoria(cuentasQueLeer(cuentas)).then(setHistoria, () => {});
      // Un día abre ese día; si es tu récord, la tarjeta del récord.
      const elRecord = leida ? record(porDia(conDia(leida.cubos)))?.fecha : undefined;
      setQue(desde !== hasta ? "mes" : desde === elRecord ? "record" : "dia");
      setProy("");
      setLista(false);
      setEstado(null);
      setAbierta({ desde, hasta });
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

  // La vista previa del vídeo va por vueltas, como el MP4: en cada una el fondo
  // vuelve al principio, la cifra sube y, con «Sonido», suena. Si el fondo dura
  // más de diez segundos se corta ahí, y si dura menos de tres da otra vuelta
  // antes. El sonido del propio vídeo es el del `<video>`, que se deja de
  // silenciar; los otros, los mismos que van dentro del MP4.
  const enVideo = Boolean(abierta) && tipo === "video" && elegido?.tipo === "video" && !exportando;
  const propio = elegido ? conSonidoPropio[elegido.url] === true : false;
  const de: Origen = origen === "fondo" && !propio ? SONIDOS[0].id : origen;
  const suena = sonar && audioOk === true;
  useEffect(() => {
    if (!enVideo || !elegido) return;
    const v = videoDe(elegido.url);
    let vivo = true;
    let src: AudioBufferSourceNode | null = null;
    let espera = 0;
    v.muted = !(suena && de === "fondo");
    const vuelta = async () => {
      const segundos = segundosDe(elegido.url);
      const b = suena && de !== "fondo" ? await sonidoPara(de, segundos, elegido).catch(() => null) : null;
      if (!vivo) return;
      v.currentTime = 0;
      void v.play().catch(() => {});
      reloj.current = performance.now();
      if (b) {
        altavoz ??= new AudioContext();
        void altavoz.resume().catch(() => {});
        src = altavoz.createBufferSource();
        src.buffer = b;
        src.connect(altavoz.destination);
        src.start();
      }
      espera = window.setTimeout(() => void vuelta(), segundos * 1000);
    };
    const empezar = () => void vuelta();
    // Lo que dura el fondo hace falta para saber cuánto dura la vuelta.
    if (v.readyState >= 1) empezar();
    else v.addEventListener("loadedmetadata", empezar, { once: true });
    return () => {
      vivo = false;
      clearTimeout(espera);
      v.removeEventListener("loadedmetadata", empezar);
      v.muted = true;
      src?.stop();
      reloj.current = null;
    };
  }, [enVideo, elegido, suena, de]);

  // ── Lo que dice la tarjeta ──
  const dia = abierta && abierta.desde === abierta.hasta ? abierta.desde : null;
  const tramoMes: [string, string] | null = abierta ? (dia ? mesHastaHoy(dia, hoy) : [abierta.desde, abierta.hasta]) : null;
  const [desde, hasta] =
    que === "record" && mejor ? [mejor.fecha, mejor.fecha] : que === "dia" && dia ? [dia, dia] : (tramoMes ?? ["", ""]);
  const mesDesde = tramoMes?.[0] ?? "";
  const delTramo = useMemo(() => (desde ? entre(cubos, desde, hasta) : []), [cubos, desde, hasta]);
  const proyectos = useMemo(() => porfolio(delTramo, "proyecto", 1000).filter((p) => p.clave && !p.otros), [delTramo]);
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
  }, [historia, desde, mesDesde, que, mejor, dia, delTramo, cubos, proyecto, yo.arroba, yo.nombre, fotoImg, resaltar, color, t, lang, hoy]);

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
  }, [datos, fuente, totalDelTramo, lang]);

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

  const subir = (f: File | undefined) => {
    if (!f) return;
    const video = tipo === "video";
    if (video ? !f.type.startsWith("video/") : !f.type.startsWith("image/")) {
      return setEstado({ texto: video ? t("Eso no es un vídeo.") : t("Eso no es una imagen."), mal: true });
    }
    if (f.size > (video ? MAX_VIDEO : MAX_IMAGEN)) {
      return setEstado({ texto: video ? t("Ese vídeo pasa de 50 MB.") : t("Esa imagen pasa de 10 MB."), mal: true });
    }
    const url = URL.createObjectURL(f);
    const nuevo: FondoTarjeta = { id: `subido:${subidos.length + 1}:${f.name}`, tipo, nombre: f.name, url, fuente: f };
    subidos.unshift(nuevo);
    setSubidas([...subidos]);
    setFondoId(nuevo.id);
    setEstado(null);
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
      let archivoHecho: Blob;
      if (conVideo && elegido) {
        cancelar.current = new AbortController();
        setProgreso(0);
        const segundos = segundosDe(elegido.url);
        archivoHecho = await exportarVideo(pintarVideo, {
          ancho: F.ancho,
          alto: F.alto,
          fps: 30,
          segundos,
          fondo: elegido.fuente,
          sonido: suena ? await sonidoPara(de, segundos, elegido) : null,
          alProgreso: (h) => setProgreso(Math.floor(h * 100)),
          senal: cancelar.current.signal,
        });
        setProgreso(null);
      } else {
        setOcupado(true);
        archivoHecho = await exportarImagen(pintar, { ancho: F.ancho, alto: F.alto, fondo: await fondoParaSacar() });
      }
      const ruta = await guardarTarjeta(archivoHecho);
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
        <div className={formato === "9:16" ? "pt-editor pt-vertical" : "pt-editor"}>
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

            <div className="pt-tira">
              {visibles.map((f) => (
                <button
                  key={f.id}
                  className="pt-mini"
                  aria-pressed={elegido?.id === f.id}
                  aria-label={f.nombre}
                  data-tip={f.nombre}
                  style={f.tipo === "imagen" ? { backgroundImage: `url("${f.url}")` } : undefined}
                  onClick={() => setFondoId(f.id)}
                >
                  {f.tipo === "video" && <video src={`${f.url}#t=0.1`} muted preload="metadata" />}
                </button>
              ))}
              <button className="pt-subir" onClick={() => archivo.current?.click()}>
                <PlusIcon size={20} />
                {tipo === "video" ? t("Subir vídeo") : t("Subir imagen")}
                <small>{tipo === "video" ? t("MP4, hasta 50 MB") : t("hasta 10 MB")}</small>
              </button>
              <input
                ref={archivo}
                type="file"
                hidden
                accept={tipo === "video" ? "video/mp4,video/webm,video/quicktime" : "image/*"}
                onChange={(e) => {
                  subir(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

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

              <div className="pt-grupo">
                {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                  <button key={f} className="pt-op" aria-pressed={formato === f} onClick={() => setFormato(f)}>
                    {f}
                  </button>
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
