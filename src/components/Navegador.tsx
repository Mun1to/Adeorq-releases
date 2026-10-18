// El navegador de verdad: un panel grande a la derecha, junto a la franja.
//
// Munir lo pidió el 2026-10-18 («un navegador de verdad, Chromium, Brave o
// Google normal y corriente, que se abre a la derecha como un panel grande, y
// más animaciones y mejores tipografías») y eligió mirando maquetas: Chromium
// dentro de Adeorq (A1), panel grande fijo a la derecha que se estira (B1), dos
// filas como un navegador de cristal (C1), movimiento «vivo» (D2), Geist y
// Geist Mono (E3), y el editor por clic también aquí (F1).
//
// Antes era `WebPane`, un iframe en el mosaico. La página ahora la pinta Rust
// (`navegador.rs`) en un panel NATIVO que se coloca encima del hueco de abajo
// (`.nav-hueco`). Eso tiene tres consecuencias que explican medio archivo:
//
//  · El hueco se mide y se manda a Rust cada vez que se mueve o cambia de
//    tamaño, en un bucle de fotogramas mientras el panel se ve: el panel nativo
//    no sigue al DOM por sí solo.
//  · Nada de la interfaz puede pintarse ENCIMA de la página. Cuando un menú,
//    un diálogo o la paleta pisan el hueco (`pisado`), se pone una foto de la
//    página en su sitio y se esconde el panel nativo; al irse, al revés. Es lo
//    que hace VS Code con su navegador. La foto primero: WebView2 no fotografía
//    lo que ya está escondido.
//  · Con el foco en la página, las teclas no llegan a la interfaz. Rust devuelve
//    las de Adeorq (`nav-tecla`) y aquí se atienden.
//
// Donde no hay panel nativo (Linux, hasta que Tauri sepa colocarlos) y mientras
// el editor por clic está encendido, la pestaña se pinta en un iframe como
// antes: el editor habla con la página por `postMessage`, y ese canal solo
// existe con un iframe dentro de la interfaz.

import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useT } from "../lib/i18n";
import { puedeEmpotrarse } from "../lib/pty";
import { comoEmpotrable, comoUrl, PUERTOS } from "../lib/urlweb";
import {
  canalNativo,
  esLocal,
  huecoDe,
  navAbrir,
  navAccion,
  navCerrar,
  navColocar,
  navDisponible,
  navFoto,
  navFocoInterfaz,
  navIr,
  oirNavegador,
  pisado,
  type EstadoNav,
  type Hueco,
  type TeclaNav,
} from "../lib/navegador";
import { BrowserIcon, CandadoIcon, ChevronIcon, CloseIcon, ExternalIcon, PicarIcon, PlusIcon, RefreshIcon } from "./Icons";
import EditorWeb from "./EditorWeb";
import { canalDeMarco } from "../lib/editorWeb";
import Mascota from "./Mascota";

/** Una pestaña. `clave` es el número de su panel nativo en Rust (`nav-<clave>`). */
interface Pest {
  clave: number;
  url: string;
  titulo: string;
  icono: string;
  cargando: boolean;
  atras: boolean;
  adelante: boolean;
  error?: EstadoNav["error"];
  /** Se pinta en un iframe: sin panel nativo, o con el editor por clic. */
  marco: boolean;
  /** Cambia con cada recarga del iframe, que es lo que le obliga a volver a pedir. */
  vuelta: number;
  /** Cuántas veces ha terminado de cargar en el panel nativo: el editor por clic
      se vuelve a presentar a la sonda con cada una. */
  cargas: number;
  /** Se está yendo: su ancho se cierra antes de quitarla. */
  muere?: boolean;
}

/* Los paneles nativos que dejó libres una pestaña cerrada. Cerrar uno de verdad
   rompe en wry el redimensionado de la ventana, así que se esconden en blanco y
   la próxima pestaña reutiliza el suyo (`nav_abrir` con una clave que ya existe
   solo navega). Vive fuera del componente porque los paneles viven lo que Adeorq. */
const libres: number[] = [];
let ultima = 0;
const nuevaClave = () => libres.pop() ?? ++ultima;

/* Lo que una web puede abrir sola (`window.open`, `target=_blank`). Cada pestaña es
   un Chromium entero, así que una web con un bucle de ventanas se comía la máquina
   (revisión de seguridad del 2026-10-18): tres por ráfaga de dos segundos, y nunca
   por encima del tope. Las que abres tú no cuentan para la ráfaga. */
const TOPE_PESTANAS = 24;
const RAFAGA = { cuantas: 3, ms: 2000 };
const abiertasSolas: number[] = [];
function dejaAbrirSola(ahora = Date.now()): boolean {
  while (abiertasSolas.length && ahora - abiertasSolas[0] > RAFAGA.ms) abiertasSolas.shift();
  if (abiertasSolas.length >= RAFAGA.cuantas) return false;
  abiertasSolas.push(ahora);
  return true;
}

/** El icono de una pestaña lo da la web: solo se pinta si es una imagen de la red o
    un `data:` de imagen, nunca otra cosa en la ventana de la interfaz. */
const iconoValido = (u: string) => (/^(https?:|data:image\/)/i.test(u) ? u : "");

const dePestana = (url: string, marco: boolean): Pest => ({
  clave: nuevaClave(),
  url,
  titulo: "",
  icono: "",
  cargando: false,
  atras: false,
  adelante: false,
  marco,
  vuelta: 0,
  cargas: 0,
});

/** El ancho del panel se recuerda; nace con el 45 % de la ventana. */
const ANCHO_KEY = "adeorq-navegador-ancho";
const ANCHO_MIN = 360;
function anchoGuardado(): number {
  const n = Number(localStorage.getItem(ANCHO_KEY));
  return n > 0 ? n : Math.round(window.innerWidth * 0.45);
}
const limitar = (px: number) => Math.max(ANCHO_MIN, Math.min(px, Math.round(window.innerWidth * 0.75)));

/** Las teclas globales que la página devuelve, como las vería `atajosGlobales`. */
function teclaGlobal(t: string): string | null {
  const resto = t.replace(/^ctrl-mayus-/, "");
  if (resto === t) return null;
  return resto === "abajo" ? "ArrowDown" : resto === "derecha" ? "ArrowRight" : resto.toUpperCase();
}

function partes(url: string): { host: string; resto: string; segura: boolean } {
  try {
    const u = new URL(url);
    return { host: u.host, resto: `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`, segura: u.protocol === "https:" };
  } catch {
    return { host: url, resto: "", segura: false };
  }
}

const mismo = (a: Hueco | null, b: Hueco) =>
  !!a && a.x === b.x && a.y === b.y && a.ancho === b.ancho && a.alto === b.alto;

interface Props {
  /** El panel está abierto en la Cabina que se ve. Si no, sus páginas se esconden. */
  visible: boolean;
  /** Las pestañas con las que arranca: el panel se hace dueño de ellas al montarse. */
  tabs: string[];
  activa: number;
  /** Una dirección que llega de fuera (una terminal levantó un servidor). Con
      sello para que la misma dirección pueda pedirse dos veces. */
  pedida?: { url: string; sello: number };
  /** Guardar las pestañas, para que vuelvan al reabrir Adeorq. */
  onEstado: (tabs: string[], activa: number) => void;
  onCerrar: () => void;
  /** Dejar un encargo escrito en la terminal de delante (el editor por clic). */
  onAlAgente?: (texto: string) => boolean;
}

export default function Navegador({ visible, tabs, activa, pedida, onEstado, onCerrar, onAlAgente }: Props) {
  const { t } = useT();
  /** null mientras se pregunta: sin saberlo no se crea nada. */
  const [nativo, setNativo] = useState<boolean | null>(null);
  const [pests, setPests] = useState<Pest[]>(() => (tabs.length ? tabs : [""]).map((u) => dePestana(u, false)));
  const [act, setAct] = useState(() => Math.max(0, Math.min(activa, tabs.length - 1)));
  const pest = pests[act] ?? pests[0];
  const [ancho, setAncho] = useState(() => limitar(anchoGuardado()));
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [editor, setEditor] = useState(false);
  const [rechaza, setRechaza] = useState<string | null>(null);
  /** La foto que tapa el hueco mientras algo de la interfaz está encima. */
  const [foto, setFoto] = useState<string | null>(null);
  const [marcoAct, setMarcoAct] = useState<HTMLIFrameElement | null>(null);

  const raiz = useRef<HTMLElement>(null);
  const hueco = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** Las claves que ya tienen panel nativo en Rust. */
  const creados = useRef(new Set<number>());
  const pestsRef = useRef(pests);
  pestsRef.current = pests;
  const actRef = useRef(pest);
  actRef.current = pest;

  useEffect(() => {
    void navDisponible().then((s) => {
      setNativo(s);
      if (!s) setPests((prev) => prev.map((p) => ({ ...p, marco: true })));
    });
  }, []);

  // Cada cambio sube a App tal cual (es estable allí, ver `onWebEstado`).
  useEffect(() => {
    onEstado(
      pests.filter((p) => !p.muere).map((p) => p.url),
      Math.max(0, pests.filter((p) => !p.muere).indexOf(pest)),
    );
  }, [pests, pest, onEstado]);

  const cambia = useCallback((clave: number, f: (p: Pest) => Pest) => {
    setPests((prev) => prev.map((p) => (p.clave === clave ? f(p) : p)));
  }, []);

  /* ── Lo que cuenta Rust ── */
  const nueva = useCallback((url = "", detras?: number) => {
    if (pestsRef.current.filter((x) => !x.muere).length >= TOPE_PESTANAS) return;
    const p = dePestana(url, nativo === false);
    setPests((prev) => {
      const i = detras == null ? prev.length : Math.max(0, prev.findIndex((x) => x.clave === detras) + 1);
      const out = [...prev.slice(0, i), p, ...prev.slice(i)];
      setAct(i);
      return out;
    });
    if (!url) requestAnimationFrame(() => entrada.current?.focus());
  }, [nativo]);

  const cerrar = useCallback((clave: number) => {
    const todas = pestsRef.current.filter((p) => !p.muere);
    // La última cierra el panel: un navegador sin nada abierto es un hueco muerto.
    if (todas.length <= 1) {
      onCerrar();
      return;
    }
    cambia(clave, (p) => ({ ...p, muere: true }));
    if (creados.current.has(clave)) {
      void navCerrar(clave).catch(() => {});
      creados.current.delete(clave);
      libres.push(clave);
    }
    window.setTimeout(() => {
      setPests((prev) => {
        const i = prev.findIndex((p) => p.clave === clave);
        const out = prev.filter((p) => p.clave !== clave);
        setAct((a) => Math.min(i < a ? a - 1 : a, out.length - 1));
        return out;
      });
    }, 180);
  }, [cambia, onCerrar]);

  useEffect(() => {
    let baja: (() => void) | null = null;
    let viva = true;
    void oirNavegador({
      estado: (e) =>
        cambia(e.id, (p) => ({
          ...p,
          ...(e.url != null && e.url !== "about:blank" ? { url: e.url } : {}),
          ...(e.titulo != null ? { titulo: e.titulo } : {}),
          ...(e.icono != null ? { icono: iconoValido(e.icono) } : {}),
          ...(e.atras != null ? { atras: e.atras } : {}),
          ...(e.adelante != null ? { adelante: e.adelante } : {}),
          ...(e.cargando != null
            ? { cargando: e.cargando, ...(e.cargando ? { error: undefined } : { cargas: p.cargas + 1 }) }
            : {}),
          ...(e.error != null ? { error: e.error, cargando: false } : {}),
        })),
      nueva: (id, url) => dejaAbrirSola() && nueva(url, id),
      tecla: (id, tecla: TeclaNav) => {
        const pp = pestsRef.current.filter((p) => !p.muere);
        const i = pp.findIndex((p) => p.clave === id);
        if (tecla === "nueva-pestana") nueva();
        else if (tecla === "cerrar-pestana") cerrar(id);
        else if (tecla === "pestana-siguiente") setAct((i + 1) % pp.length);
        else if (tecla === "pestana-anterior") setAct((i - 1 + pp.length) % pp.length);
        else if (tecla === "direccion") {
          // Primero el foco de vuelta a la interfaz, o el campo no lo recibe.
          void navFocoInterfaz()
            .catch(() => {})
            .then(() => entrada.current?.focus());
        } else {
          const key = teclaGlobal(tecla);
          if (key) {
            void navFocoInterfaz().catch(() => {});
            window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey: true }));
          }
        }
      },
    }).then((b) => (viva ? (baja = b) : b()));
    return () => {
      viva = false;
      baja?.();
    };
  }, [cambia, nueva, cerrar]);

  /* ── Colocar los paneles nativos ──
     Un bucle de fotogramas mientras el panel se ve: el hueco se mueve sin
     cambiar de tamaño (abrir Archivos al lado lo empuja) y eso no lo ve un
     ResizeObserver. Solo se habla con Rust cuando algo cambió. Y cada diez
     fotogramas se mira si algo de la interfaz pisa el hueco. */
  const ultimo = useRef<{ clave: number; hueco: Hueco; ver: boolean } | null>(null);
  const tapado = useRef(false);
  useEffect(() => {
    if (!nativo) return;
    let raf = 0;
    let n = 0;
    const paso = () => {
      raf = requestAnimationFrame(paso);
      const el = hueco.current;
      const p = actRef.current;
      if (!el || !p) return;
      const vivo = visible && !p.marco && !!p.url && creados.current.has(p.clave);
      if (vivo && ++n % 10 === 0) {
        const ahora = pisado(el);
        if (ahora !== tapado.current) {
          tapado.current = ahora;
          if (ahora) {
            // La foto primero y luego esconder: escondida no se deja fotografiar.
            const clave = p.clave;
            void navFoto(clave)
              .then((f) => tapado.current && setFoto(f))
              .catch(() => {})
              .finally(() => {
                if (tapado.current) void navColocar(clave, huecoDe(el), false).catch(() => {});
              });
          } else {
            ultimo.current = null;
            requestAnimationFrame(() => setFoto(null));
          }
        }
      }
      if (tapado.current && vivo) return;
      const h = huecoDe(el);
      const u = ultimo.current;
      if (u && u.clave === p.clave && u.ver === vivo && (!vivo || mismo(u.hueco, h))) return;
      // La que se veía antes, escondida.
      if (u && u.clave !== p.clave && creados.current.has(u.clave)) void navColocar(u.clave, u.hueco, false).catch(() => {});
      ultimo.current = { clave: p.clave, hueco: h, ver: vivo };
      if (creados.current.has(p.clave)) void navColocar(p.clave, h, vivo).catch(() => {});
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [nativo, visible]);

  // Con el panel cerrado o en otra vista, ninguna página a la vista.
  useEffect(() => {
    if (visible || !nativo) return;
    for (const c of creados.current) void navColocar(c, { x: 0, y: 0, ancho: 1, alto: 1 }, false).catch(() => {});
    ultimo.current = null;
  }, [visible, nativo]);

  /** Llevar la pestaña activa a `url`, creando su panel nativo si hace falta. */
  const ir = useCallback((destino: string) => {
    const p = actRef.current;
    // En un iframe, YouTube por su dirección que sí se deja meter; en el Chromium, tal cual.
    const url = p?.marco || !nativo ? comoEmpotrable(comoUrl(destino)) : comoUrl(destino);
    if (!url || !p) return;
    setEditando(false);
    if (p.marco || !nativo) {
      cambia(p.clave, (x) => (x.url === url ? { ...x, vuelta: x.vuelta + 1 } : { ...x, url, titulo: "", error: undefined }));
      return;
    }
    cambia(p.clave, (x) => ({ ...x, url, titulo: x.url === url ? x.titulo : "", error: undefined, cargando: true }));
    const el = hueco.current;
    if (creados.current.has(p.clave)) void navIr(p.clave, url).catch(() => {});
    else if (el) {
      creados.current.add(p.clave);
      ultimo.current = null;
      void navAbrir(p.clave, url, huecoDe(el)).catch(() => creados.current.delete(p.clave));
    }
  }, [cambia, nativo]);

  // Las pestañas que arrancan con dirección (las guardadas) nacen al verse.
  useEffect(() => {
    if (!nativo || !visible || !pest || pest.marco || !pest.url || creados.current.has(pest.clave)) return;
    const el = hueco.current;
    if (!el) return;
    creados.current.add(pest.clave);
    ultimo.current = null;
    void navAbrir(pest.clave, pest.url, huecoDe(el)).catch(() => creados.current.delete(pest.clave));
  }, [nativo, visible, pest]);

  /* Una dirección que llega de fuera: a la pestaña que ya la tenga, a la que
     esté en blanco o a una nueva. */
  const selloRef = useRef(0);
  useEffect(() => {
    if (!pedida || pedida.sello === selloRef.current) return;
    selloRef.current = pedida.sello;
    const url = comoUrl(pedida.url);
    if (!url) return;
    const pp = pestsRef.current;
    const ya = pp.findIndex((p) => p.url === url && !p.muere);
    if (ya >= 0) return setAct(ya);
    const blanco = pp.findIndex((p) => !p.url && !p.muere);
    if (blanco >= 0) {
      setAct(blanco);
      requestAnimationFrame(() => ir(url));
      return;
    }
    nueva(url);
  }, [pedida, ir, nueva]);

  /* El editor por clic. Con una web de esta máquina en el panel nativo, habla
     con ella por Rust (`canalNativo`) y la página no se mueve de donde está. En
     el resto de casos (sin panel nativo, o una web de fuera, que de todas formas
     no lleva la sonda) la pestaña pasa a un iframe, como antes; apagarlo la
     devuelve. */
  const nativaYLocal = !!nativo && !!pest && esLocal(pest.url);
  const alternarEditor = () => {
    const p = actRef.current;
    if (!p) return;
    const enciende = !editor;
    setEditor(enciende);
    if (nativo && !esLocal(p.url)) {
      cambia(p.clave, (x) => ({ ...x, marco: enciende }));
      if (!enciende && p.url && creados.current.has(p.clave)) void navIr(p.clave, p.url).catch(() => {});
      ultimo.current = null;
    }
  };

  useLayoutEffect(() => {
    if (!editor || nativaYLocal) return setMarcoAct(null);
    setMarcoAct(hueco.current?.querySelector<HTMLIFrameElement>(`iframe[data-clave="${pest?.clave}"]`) ?? null);
  }, [editor, pest, pests, nativaYLocal]);

  const clave = pest?.clave ?? 0;
  const canal = useMemo(
    () => (!editor ? null : nativaYLocal ? canalNativo(clave) : canalDeMarco(marcoAct)),
    [editor, nativaYLocal, clave, marcoAct],
  );

  // En iframe hay webs que se niegan a entrar: se pregunta antes, como siempre.
  const urlAct = pest?.url ?? "";
  useEffect(() => {
    setRechaza(null);
    if (!pest?.marco || !urlAct) return;
    let vivo = true;
    puedeEmpotrarse(urlAct).catch((e) => vivo && setRechaza(String(e)));
    return () => {
      vivo = false;
    };
  }, [urlAct, pest?.marco, pest?.vuelta]);

  const accion = (a: "atras" | "adelante" | "recargar") => {
    const p = actRef.current;
    if (!p) return;
    if (p.marco || !creados.current.has(p.clave)) {
      if (a === "recargar") cambia(p.clave, (x) => ({ ...x, vuelta: x.vuelta + 1 }));
      return;
    }
    void navAccion(p.clave, a).catch(() => {});
  };

  /* ── El tirador: el ancho del panel ── */
  const tirar = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const a0 = ancho;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    raiz.current?.setAttribute("data-tirando", "true");
    const mover = (m: PointerEvent) => setAncho(limitar(a0 + (x0 - m.clientX)));
    const soltar = () => {
      el.removeEventListener("pointermove", mover);
      raiz.current?.removeAttribute("data-tirando");
      setAncho((a) => {
        localStorage.setItem(ANCHO_KEY, String(a));
        return a;
      });
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar, { once: true });
  };

  const vivas = pests;
  const { host, resto, segura } = partes(urlAct);
  const ocupada = pests.some((p) => p.cargando && !p.muere);

  return (
    <section
      ref={raiz}
      className="nav"
      data-abierto={visible}
      data-cargando={pest?.cargando || undefined}
      style={{ width: ancho }}
      aria-label={t("Navegador")}
    >
      <div
        className="nav-tirador"
        onPointerDown={tirar}
        data-tip={t("Arrastra para darle más o menos ancho")}
      />

      <div className="nav-pestanas" role="tablist">
        {vivas.map((p, i) => (
          <div
            key={p.clave}
            role="tab"
            aria-selected={p === pest}
            className="nav-pest"
            data-on={p === pest}
            data-muere={p.muere || undefined}
            title={p.titulo || p.url || undefined}
            onClick={() => !p.muere && setAct(i)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                cerrar(p.clave);
              }
            }}
          >
            <span className="nav-pest-ico" data-cargando={p.cargando || undefined}>
              {p.cargando ? (
                <span className="nav-anillo" />
              ) : p.icono ? (
                <img src={p.icono} alt="" onError={() => cambia(p.clave, (x) => ({ ...x, icono: "" }))} />
              ) : (
                <BrowserIcon size={13} />
              )}
            </span>
            <span className="nav-pest-nom">{p.titulo || partes(p.url).host || t("Nueva pestaña")}</span>
            <button
              className="nav-pest-x"
              aria-label={t("Cerrar")}
              onClick={(e) => {
                e.stopPropagation();
                cerrar(p.clave);
              }}
            >
              <CloseIcon size={10} />
            </button>
          </div>
        ))}
        <button className="mini icono nav-mas" data-tip={t("Abrir otra pestaña")} onClick={() => nueva()}>
          <PlusIcon size={14} />
        </button>
      </div>

      <div className="nav-barra">
        <div className="nav-acts">
          <button className="mini icono" data-tip={t("Atrás")} disabled={!pest?.atras} onClick={() => accion("atras")}>
            <ChevronIcon size={14} izq />
          </button>
          <button className="mini icono" data-tip={t("Adelante")} disabled={!pest?.adelante} onClick={() => accion("adelante")}>
            <ChevronIcon size={14} der />
          </button>
          <button className="mini icono" data-tip={t("Recargar")} onClick={() => accion("recargar")}>
            <RefreshIcon size={14} />
          </button>
        </div>

        {/* Un campo de texto siempre, no una pastilla con la dirección dentro:
            en reposo enseña la dirección sin el `https://`, y al entrar la
            entera y seleccionada para escribir encima. */}
        <label className="nav-url" data-editando={editando || undefined} title={urlAct || undefined}>
          {urlAct && (
            <span className="nav-candado" data-segura={segura}>
              <CandadoIcon size={12} />
            </span>
          )}
          <input
            ref={entrada}
            value={editando ? texto : `${host}${resto}`}
            spellCheck={false}
            placeholder={t("Busca en Google o escribe una dirección")}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onFocus={(e) => {
              setTexto(urlAct);
              setEditando(true);
              const el = e.currentTarget;
              requestAnimationFrame(() => el.select());
            }}
            onBlur={() => setEditando(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                ir(e.currentTarget.value);
                e.currentTarget.blur();
              }
              if (e.key === "Escape") e.currentTarget.blur();
              e.stopPropagation();
            }}
          />
        </label>

        <div className="nav-acts">
          <button
            className="mini icono"
            data-on={editor}
            data-tip={editor ? t("Salir del editor") : t("Editar esta página haciendo clic, y guardarlo en el código")}
            onClick={alternarEditor}
          >
            <PicarIcon size={14} />
          </button>
          <button
            className="mini icono"
            data-tip={t("Abrirla en tu navegador de siempre")}
            disabled={!urlAct}
            onClick={() => void openUrl(urlAct).catch(() => {})}
          >
            <ExternalIcon size={14} />
          </button>
          <button className="mini icono" data-tip={t("Cerrar el navegador")} onClick={onCerrar}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="nav-carga" data-va={ocupada || undefined} />
      </div>

      {pest?.error && (
        <div className="nav-aviso" role="status">
          <Mascota animo="duda" alto={26} />
          <span>
            {pest.error === "sin-respuesta"
              ? t("Esta web no contesta. ¿Está levantado el servidor?")
              : pest.error === "certificado"
                ? t("El certificado de esta web no es de fiar")
                : t("Esta página no ha podido cargar")}
          </span>
          <button className="np-btn" onClick={() => accion("recargar")}>
            {t("Reintentar")}
          </button>
        </div>
      )}

      <div className="web-coneditor nav-cuerpo">
        {editor && (
          <EditorWeb
            canal={canal}
            sello={pest ? (pest.marco ? pest.vuelta : pest.cargas) : 0}
            url={urlAct}
            onAlAgente={(x) => onAlAgente?.(x) ?? false}
          />
        )}
        <div className="nav-hueco" ref={hueco}>
          {foto && <img className="nav-foto" src={foto} alt="" />}
          {!urlAct ? (
            <div className="nav-vacio">
              <p>{t("¿Qué quieres ver?")}</p>
              <div className="nav-puertos">
                {PUERTOS.map((n) => (
                  <button key={n} className="nav-puerto" onClick={() => ir(String(n))}>
                    localhost:{n}
                  </button>
                ))}
              </div>
            </div>
          ) : pest?.marco && rechaza ? (
            <div className="web-nope">
              <p className="web-nope-tit">{t("Esta página no se deja abrir aquí dentro")}</p>
              <p className="web-nope-txt">{rechaza}</p>
              <button className="np-btn" onClick={() => void openUrl(urlAct).catch(() => {})}>
                {t("Abrirla en tu navegador")}
              </button>
            </div>
          ) : null}
          {/* Las de iframe, todas montadas y solo se ve la activa: cambiar de
              pestaña no recarga ni pierde lo que tuviera. */}
          {vivas.map((p) =>
            p.marco && p.url ? (
              <iframe
                key={`${p.clave}:${p.url}#${p.vuelta}`}
                data-clave={p.clave}
                className="web-frame"
                style={p === pest && !rechaza ? undefined : { visibility: "hidden", pointerEvents: "none" }}
                src={p.url}
                title={p.url}
              />
            ) : null,
          )}
        </div>
      </div>
    </section>
  );
}
