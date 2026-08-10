import { useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FAMILIAS_TEMA, THEMES, useT, type Lang, type ThemeId } from "../lib/i18n";
import {
  apagon,
  FAMILIAS_TERM,
  guardarApagon,
  guardarTemaTerm,
  temaTermId,
  TEMAS_TERM,
} from "../lib/temasTerm";
import { guardarRendimiento, prefRendimiento, type ModoRend } from "../lib/rendimiento";
import {
  A_MANO,
  cerebroPorDefecto,
  guardarCerebroPorDefecto,
  type ModelAlias,
} from "../lib/models";
import type { PermissionMode } from "../App";
import type { NotifyMode } from "../lib/notify";
import { ADEORQ_APP_ID, type DiscordConfig } from "../lib/discord";
import { autostartGet, autostartSet, ollamaModels } from "../lib/pty";
import { guardarModoAviso, modoAviso, type ModoAviso } from "../lib/router";
import { guardarModoVigia, modoVigia, type ModoVigia } from "../lib/vigia";
import EncuadreFondo from "./EncuadreFondo";
import type { Encuadre } from "../lib/encuadre";
import {
  alternar,
  esDefecto as esDefectoCabecera,
  estaOculta,
  mover,
  paraAjustes,
  reiniciar as reiniciarCabecera,
  TAB_FIJA,
  type Cabecera,
} from "../lib/cabecera";

import {
  anadirProyecto,
  fijarRaiz,
  leerPerfil,
  quitarProyecto,
  tocarPerfil,
} from "../lib/perfil";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import AtajosEditor from "./AtajosEditor";
import GuideView from "./GuideView";
import { CheckIcon, ChevronIcon, CommandIcon, SearchIcon, TerminalIcon } from "./Icons";
import type { Atajos } from "../lib/atajos";

/** La documentación pública. Vive en el repo de descargas, que es el único
    sitio público del proyecto: adeorq.com no está comprado. Apunta a la guía
    directamente, no a la portada: quien pulsa "Ayuda" busca la guía. */
const DOCS_URL = "https://mun1to.github.io/Adeorq-releases/guia.html";

/**
 * Las nueve pestañas, solo con lo que hace falta aquí: su clave y su nombre.
 *
 * Se escriben otra vez en vez de importarlas de `App.tsx` porque allí cada una
 * lleva su icono ya construido, o sea JSX, y arrastrar eso hasta Ajustes obliga
 * a que App exporte parte de su render. Aquí solo se listan y se ordenan.
 * El orden ES el de fábrica y tiene que coincidir con el de allí: si algún día
 * entra una pestaña nueva, se añade en los dos sitios.
 */
const TABS_CABECERA = [
  { key: "panel", label: "Panel" },
  { key: "cabina", label: "Cabina" },
  { key: "chat", label: "Chat" },
  { key: "agenda", label: "Agenda" },
  { key: "lienzo", label: "Lienzo" },
  { key: "memoria", label: "Memoria" },
  { key: "cuentas", label: "Cuentas" },
  { key: "comandos", label: "Comandos" },
  { key: "ajustes", label: "Ajustes" },
];


interface Props {
  lang: Lang;
  onLang: (l: Lang) => void;
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  fontSize: number;
  onFontSize: (n: number) => void;
  autoFont: boolean;
  onAutoFont: (v: boolean) => void;
  openAll: number;
  onOpenAll: (n: number) => void;
  restore: boolean;
  onRestore: (v: boolean) => void;
  /** Cuando un agente acaba su turno, ponerlo delante a pantalla completa. */
  saltar: boolean;
  onSaltar: (v: boolean) => void;
  atajos: Atajos;
  onAtajos: (next: Atajos) => void;
  /** El modelo de Ollama que resume qué necesita cada sesión, o "" para ninguno. */
  modeloLocal: string;
  onModeloLocal: (m: string) => void;
  /** El fondo de detrás de las terminales: ruta ya dentro de la carpeta de la
   *  app, o "" si no hay ninguno. Pasar "" a onFondo lo quita. */
  fondo: string;
  /** Cambia al poner otro; la miniatura lo necesita para no servir el cacheado. */
  fondoSello: number;
  fondoOpacidad: number;
  fondoDesenfoque: number;
  fondoEncuadre: Encuadre;
  /** Qué pestañas salen arriba y en qué orden. Ver `lib/cabecera.ts`. */
  cabecera: Cabecera;
  onCabecera: (c: Cabecera) => void;
  onFondo: (ruta: string) => Promise<void>;
  onFondoOpacidad: (n: number) => void;
  onFondoDesenfoque: (n: number) => void;
  onFondoEncuadre: (e: Encuadre) => void;
  /** Cuánto se ve a través de las terminales; -1 = automático. */
  terminalVer: number;
  onTerminalVer: (n: number) => void;
  notifyMode: NotifyMode;
  onNotifyMode: (m: NotifyMode) => void;
  /** Con qué modo de permisos nace cada Claude nuevo, hasta que se cambie a
      mano con Mayús+Tab dentro de la sesión. */
  permissionMode: PermissionMode;
  onPermissionMode: (m: PermissionMode) => void;
  onUsage: () => void;
  canUsage: boolean;
  discord: DiscordConfig;
  onDiscord: (next: DiscordConfig) => void;
  /** Why the last attempt failed, if it did: an empty switch explains nothing. */
  discordError: string | null;
  /** Repetir la bienvenida o solo el recorrido por las funciones. */
  onVerBienvenida: () => void;
  onVerTour: () => void;
  /** Cambió la carpeta de proyectos: la barra lateral tiene que releerla. */
  onRaizCambiada: () => void;
}

/** Los grupos de la izquierda. El orden es de lo que más se toca a lo que
    menos: el aspecto se cambia a diario y las actualizaciones casi nunca.
    Solo el nombre: la línea de debajo que explicaba cada grupo hacía que el
    índice pesara más que lo que hay dentro (Munir, 2026-07-30). */
const SECCIONES = [
  { id: "aspecto", label: "Aspecto" },
  { id: "terminales", label: "Terminales" },
  { id: "avisos", label: "Avisos" },
  { id: "atajos", label: "Atajos" },
  { id: "modelo", label: "Modelo local" },
  { id: "discord", label: "Discord" },
  { id: "ayuda", label: "Ayuda" },
  { id: "adeorq", label: "Adeorq" },
] as const;

type SeccionId = (typeof SECCIONES)[number]["id"];

/**
 * Cuántos bloques tiene cada grupo. Sirve para UNA cosa: saber si su nombre
 * lleva flecha de desplegable estando CERRADO.
 *
 * Los bloques del grupo abierto se leen del DOM, que es lo correcto y no se
 * toca; pero los cerrados no están pintados, así que no hay nada que contar y
 * la flecha tenía que salir de algún sitio. Sin ella el índice no se lee como
 * un desplegable: no dice cuáles se abren (Munir, 2026-08-10).
 *
 * Es una semilla, no una verdad: cada vez que abres un grupo se apunta aquí lo
 * que de verdad tenía. Si alguien añade una tarjeta a un grupo de uno solo y se
 * olvida de esta línea, lo único que pasa es que a ese grupo le falta la flecha
 * hasta que lo abras una vez. El índice sigue sin poder mentir sobre lo que hay
 * dentro, que era la condición.
 */
const CUANTOS: Record<string, number> = {
  aspecto: 5,
  terminales: 2,
  avisos: 4,
  atajos: 1,
  modelo: 1,
  discord: 1,
  ayuda: 2,
  adeorq: 3,
};

/** La última que miraste. Ajustes se abre muchas veces seguidas cuando estás
    afinando algo, y volver siempre a la primera obliga a rebuscar cada vez. */
const RECUERDO = "adeorq-ajustes-seccion";

/** Los seis modos que admite `claude --permission-mode`, comprobados contra su
    propio `--help` y su documentación el 2026-08-01. acceptEdits va primero
    porque es el de hoy, para que el ajuste nuevo no obligue a buscar cuál era
    el de siempre. */
const PERMISSION_MODES: Array<[PermissionMode, string]> = [
  ["acceptEdits", "Ediciones automáticas"],
  ["plan", "Modo plan"],
  ["manual", "Manual"],
  ["auto", "Automático"],
  ["dontAsk", "Solo lo aprobado"],
  ["bypassPermissions", "Sin comprobaciones"],
];

/** Qué hace cada modo sin preguntar, para la línea que va debajo de los chips. */
const PERMISSION_MODE_HINT: Record<PermissionMode, string> = {
  acceptEdits:
    "Lee, edita archivos y usa comandos de carpeta corrientes (mkdir, mover, copiar…) sin preguntar; lo demás sigue pidiendo tu OK. Es el modo de hoy.",
  plan: "Solo lee: enseña un plan antes de tocar nada. Para mirar un proyecto antes de meterle mano.",
  manual: "Pregunta antes de cada lectura, edición o comando. El más lento y el más vigilado.",
  auto: "Todo, con un vigilante en segundo plano que frena lo que no encaje con la tarea. Para tareas largas sin estar pendiente.",
  dontAsk:
    "Solo las herramientas que ya tengas aprobadas; cualquier otra falla en vez de preguntar. Pensado para scripts y automatizaciones.",
  bypassPermissions:
    "Todo sin ninguna comprobación. Solo para un contenedor o una máquina virtual aislada, nunca en tu equipo normal.",
};

/**
 * Un icono por grupo.
 *
 * Iban dibujados en una rejilla de 20 y con trazo 1.6, y toda la app usa la de
 * 24 con trazo 1.9 (Icons.tsx): salían más finos y más pequeños que cualquier
 * otro icono de al lado, y eso es justo lo que los hacía costar de reconocer
 * (Munir, 2026-07-30). Ahora comparten rejilla y grosor con el resto.
 *
 * Y dos no se dibujan aquí porque ya existen: la terminal y la tecla de atajo.
 * Un segundo dibujo de lo mismo es un dibujo que un día se queda distinto.
 */
function IconoSeccion({ id }: { id: SeccionId }) {
  if (id === "terminales") return <TerminalIcon size={17} />;
  if (id === "atajos") return <CommandIcon size={17} />;

  const P = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      {/* La paleta del pintor: es de lo que va el grupo, y se lee antes que un
          círculo medio pintado, que puede ser cualquier cosa. */}
      {id === "aspecto" && (
        <>
          <path
            d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.3 0 2-.8 2-1.8 0-.9-.6-1.4-.6-2.1 0-.8.6-1.4 1.5-1.4h1.6a4.5 4.5 0 0 0 4.3-4.6c0-4.3-3.9-7.7-8.8-7.7Z"
            {...P}
          />
          <path d="M8.2 10.6h.01M12 8.2h.01M15.6 10.6h.01" {...P} strokeWidth="2.6" />
        </>
      )}
      {/* El salvavidas: se lee como «ayuda» antes que un interrogante suelto,
          que en una barra de iconos parece «no sé qué es esto». */}
      {id === "ayuda" && (
        <>
          <circle cx="12" cy="12" r="8.8" {...P} />
          <circle cx="12" cy="12" r="3.6" {...P} />
          <path d="m5.8 5.8 3.7 3.7M18.2 5.8l-3.7 3.7M5.8 18.2l3.7-3.7M18.2 18.2l-3.7-3.7" {...P} />
        </>
      )}
      {/* La campana, con su badajo: sin él es una seta. */}
      {id === "avisos" && (
        <>
          <path d="M18.4 9.6a6.4 6.4 0 1 0-12.8 0c0 5.4-2.2 7-2.2 7h17.2s-2.2-1.6-2.2-7Z" {...P} />
          <path d="M13.9 19.8a2.2 2.2 0 0 1-3.8 0" {...P} />
        </>
      )}
      {/* El chip: el cuadrado con su núcleo y sus patillas. Es el dibujo con el
          que se entiende «algo que corre en TU máquina». */}
      {id === "modelo" && (
        <>
          <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.8" {...P} />
          <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1" {...P} />
          <path
            d="M9.4 2.6v2.8M14.6 2.6v2.8M9.4 18.6v2.8M14.6 18.6v2.8M2.6 9.4h2.8M2.6 14.6h2.8M18.6 9.4h2.8M18.6 14.6h2.8"
            {...P}
          />
        </>
      )}
      {/* Discord: su silueta, con las dos patas de abajo, que es lo que la
          distingue de cualquier otro bocadillo con ojos. */}
      {id === "discord" && (
        <>
          <path
            d="M8.9 17.6c-2.3-.5-4.1-1.5-5.2-2.8.3-5 1.8-8.4 2.8-9.5 1.4-.8 3-1.3 3-1.3l.7 1.5a12.4 12.4 0 0 1 5.6 0l.7-1.5s1.6.5 3 1.3c1 1.1 2.5 4.5 2.8 9.5-1.1 1.3-2.9 2.3-5.2 2.8"
            {...P}
          />
          <path d="M8.9 17.6 7.4 20.6M15.1 17.6l1.5 3" {...P} />
          <path d="M9.4 12.4h.01M14.6 12.4h.01" {...P} strokeWidth="2.8" />
        </>
      )}
      {/* La app: el círculo con la i, que en todas partes significa «acerca de
          esto». Aquí dentro está la versión y la cuota. */}
      {id === "adeorq" && (
        <>
          <circle cx="12" cy="12" r="9" {...P} />
          <path d="M12 11.2v5M12 7.8h.01" {...P} strokeWidth="2.2" />
        </>
      )}
    </svg>
  );
}

export default function SettingsView({
  lang,
  onLang,
  theme,
  onTheme,
  fontSize,
  onFontSize,
  autoFont,
  onAutoFont,
  openAll,
  onOpenAll,
  restore,
  onRestore,
  saltar,
  onSaltar,
  atajos,
  onAtajos,
  modeloLocal,
  onModeloLocal,
  fondo,
  fondoSello,
  fondoOpacidad,
  fondoDesenfoque,
  fondoEncuadre,
  cabecera,
  onCabecera,
  onFondo,
  onFondoOpacidad,
  onFondoDesenfoque,
  onFondoEncuadre,
  terminalVer,
  onTerminalVer,
  notifyMode,
  onNotifyMode,
  permissionMode,
  onPermissionMode,
  onUsage,
  canUsage,
  discord,
  onDiscord,
  discordError,
  onVerBienvenida,
  onVerTour,
  onRaizCambiada,
}: Props) {
  const { t } = useT();
  const [version, setVersion] = useState("");
  const [nombre, setNombre] = useState(() => leerPerfil().nombre);
  const [carpeta, setCarpeta] = useState(() => leerPerfil().raiz);
  const [sinCarpeta, setSinCarpeta] = useState(() => leerPerfil().sinRaiz);
  const [extras, setExtras] = useState(() => leerPerfil().extras);
  const [errorRaiz, setErrorRaiz] = useState<string | null>(null);
  /** null = todavía preguntando; [] = Ollama no está escuchando. */
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [fondoError, setFondoError] = useState<string | null>(null);
  /** El esquema de colores de las terminales. Vive en localStorage y no en el
      estado de la app porque quien lo lee es cada panel al abrirse; aquí solo
      hace falta para saber cuál sale marcado. */
  const [termTheme, setTermTheme] = useState(temaTermId);
  const [apagada, setApagada] = useState(apagon);
  const [rapida, setRapida] = useState<ModoRend>(prefRendimiento);
  /** Cuántas terminales hay abiertas ahora mismo, para decidir en el acto si el
   *  ahorro se aplica ya. No hace falta que el padre la pase: la cuenta que
   *  importa es la que ya está aplicada, y esa vive en el `<html>`. */
  const abiertas = document.querySelectorAll(".pane-term").length;
  const [cerebro, setCerebro] = useState<ModelAlias | undefined>(cerebroPorDefecto);
  /** Qué familia de temas se está mirando, y qué se ha escrito para buscar.
      No se guardan: son de este rato delante de la pantalla, no un ajuste. */
  const [famTema, setFamTema] = useState<string>("todas");
  const [qTema, setQTema] = useState("");
  const [checking, setChecking] = useState(false);
  const [news, setNews] = useState<string | null>(null);
  /** Cuánto lleva bajado, para que el botón diga algo mientras tarda. */
  const [updPct, setUpdPct] = useState(0);
  // Starting with Windows is a fact about the machine, not a preference of
  // ours: it is read from the system, never remembered here. null = still
  // asking, so the switch cannot flicker from off to on in front of him.
  const [boot, setBoot] = useState<boolean | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  /** Cuánto opina el Asistente sobre el cerebro que tienes puesto. */
  const [avisoRouter, setAvisoRouter] = useState<ModoAviso>(() => modoAviso());
  /** Cuánto interrumpe el vigía de las cuadrillas. */
  const [avisoVigia, setAvisoVigia] = useState<ModoVigia>(() => modoVigia());
  const [seccion, setSeccion] = useState<SeccionId>(() => {
    const guardada = localStorage.getItem(RECUERDO);
    return SECCIONES.some((s) => s.id === guardada) ? (guardada as SeccionId) : "aspecto";
  });

  /** Si la lista de bloques del grupo abierto está recogida. Volver a pulsar el
   *  grupo que ya estás viendo la esconde, que es lo que hace cualquier
   *  desplegable y lo que faltaba aquí (Munir, 2026-08-10: «cuando le das no se
   *  esconden las secciones»).
   *
   *  Ojo, no cierra la SECCIÓN: la hoja de la derecha sigue siendo la misma. Lo
   *  que se pliega es su índice, que es lo único que la flecha promete. Cerrar
   *  también la hoja dejaría la mitad de la pantalla en blanco y no hay ningún
   *  sitio al que volver. */
  const [plegado, setPlegado] = useState(false);

  const irA = (id: SeccionId) => {
    // El mismo grupo otra vez: se recoge o se despliega, y la hoja no se mueve.
    if (id === seccion) {
      setPlegado((v) => !v);
      return;
    }
    setPlegado(false);
    setSeccion(id);
    localStorage.setItem(RECUERDO, id);
  };

  /**
   * Los bloques de la sección abierta, para poder saltar a uno sin bajar a mano.
   *
   * Aspecto tiene cinco tarjetas y la primera es una lista de nueve pestañas,
   * así que llegar a «El fondo» eran varias pantallas de rueda (Munir,
   * 2026-08-10). Con esto, el grupo abierto despliega sus bloques debajo de su
   * nombre y se va de un clic.
   *
   * Se leen del DOM y NO de una lista escrita a mano. Es a propósito: una lista
   * paralela hay que acordarse de tocarla cada vez que se añade una tarjeta, y
   * el día que se olvide el índice mentirá sin que nadie se entere. Leyendo los
   * `h2` que hay pintados, el índice no puede desfasarse de lo que enseña.
   */
  const [bloques, setBloques] = useState<string[]>([]);
  useEffect(() => {
    const hoja = document.querySelector(".set-hoja");
    if (!hoja) {
      setBloques([]);
      return;
    }
    const titulos = [...hoja.querySelectorAll("section.panel-card > h2")].map(
      (h) => h.textContent?.trim() ?? "",
    );
    setBloques(titulos);
    // Y de paso se corrige la cuenta de este grupo, que es lo que decide si su
    // nombre lleva flecha cuando está cerrado (ver CUANTOS).
    CUANTOS[seccion] = titulos.length;
    // `lang` entra en las dependencias porque los títulos se traducen: sin él,
    // cambiar de idioma dejaría el índice en el anterior.
  }, [seccion, lang]);

  /** Lleva la hoja hasta el bloque n. Por posición y no por texto: dos títulos
   *  iguales en la misma sección llevarían siempre al primero. */
  const irABloque = (i: number) => {
    const hoja = document.querySelector(".set-hoja");
    const cajas = hoja?.querySelectorAll("section.panel-card");
    // Se busca la que TIENE h2, para que la cuenta cuadre con la lista de
    // arriba aunque alguna tarjeta se pinte sin título.
    const conTitulo = [...(cajas ?? [])].filter((c) => c.querySelector(":scope > h2"));
    conTitulo[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    // Se pregunta cada vez que se abre Ajustes, no una sola vez: Ollama se
    // abre y se cierra durante el día, y una lista de hace tres horas diría
    // que no está cuando sí, o al revés.
    ollamaModels().then(setModelos).catch(() => setModelos([]));
    getVersion().then(setVersion).catch(() => {});
    autostartGet()
      .then(setBoot)
      .catch((e) => {
        setBoot(false);
        setBootError(String(e));
      });
  }, []);

  const setBootTo = (on: boolean) => {
    autostartSet(on)
      .then(() => {
        setBoot(on);
        setBootError(null);
      })
      .catch((e) => setBootError(String(e)));
  };

  /**
   * Buscar actualizaciones Y ponerla, que es lo que se espera al pulsar eso.
   *
   * Hasta hoy solo COMPROBABA: te decía «hay una versión nueva» y ahí se
   * quedaba, sin un botón para traerla. La única forma de instalar era la
   * tarjeta de aviso, así que el día que esa tarjeta no respondió al clic
   * (Munir, 2026-08-08, en la 0.9.71) no quedaba ninguna puerta dentro de la
   * app: había que bajarse el instalador a mano. Dos caminos independientes
   * para lo mismo es exactamente lo que hace falta aquí, porque si el que falla
   * es el del aviso, el aviso es lo único que se ve.
   */
  const lookForUpdates = () => {
    setChecking(true);
    setNews(null);
    setUpdPct(0);
    check()
      .then((u) => {
        if (!u) {
          setNews(t("Ya tienes la última versión."));
          setChecking(false);
          return;
        }
        setNews(t("Bajando la {v}…", { v: u.version }));
        let total = 0;
        let got = 0;
        return u
          .downloadAndInstall((e) => {
            if (e.event === "Started") total = e.data.contentLength ?? 0;
            else if (e.event === "Progress") {
              got += e.data.chunkLength;
              if (total > 0) setUpdPct(Math.min(99, Math.round((got / total) * 100)));
            } else if (e.event === "Finished") setUpdPct(100);
          })
          .then(() => {
            setNews(t("Listo. Reinicia para estrenar la versión nueva."));
            setChecking(false);
          });
      })
      .catch((e) => {
        setNews(String(e));
        setChecking(false);
      });
  };

  return (
    <div className="panel settings">
      <header className="panel-hero">
        <h1>{t("Ajustes")}</h1>
        <p>{t("Cómo se ve y cómo habla tu taller.")}</p>
      </header>

      <div className="set-marco">
        {/* La izquierda: los grupos. Antes eran diez tarjetas en una
            rejilla, y como una tenia dos botones y otra veinticuatro
            temas, la rejilla quedaba llena de huecos (Munir, 2026-07-30). */}
        <nav className="set-nav">
          {SECCIONES.map((s) => {
            const abierto = seccion === s.id;
            // Abierto manda el dato real; cerrado, la cuenta aprendida.
            const despliega = abierto ? bloques.length > 1 : (CUANTOS[s.id] ?? 0) > 1;
            return (
              <div key={s.id} className="set-grupo">
                <button
                  className="set-tab"
                  data-on={abierto || undefined}
                  /* Abierto pero recogido: la flecha vuelve a apuntar de lado,
                     porque es lo que hay debajo lo que describe, no cuál es la
                     sección que estás viendo. */
                  data-plegado={(abierto && plegado && despliega) || undefined}
                  onClick={() => irA(s.id)}
                >
                  <IconoSeccion id={s.id} />
                  <span className="set-tab-nom">{t(s.label)}</span>
                  {/* La flecha, que es lo que convierte una lista de nombres en
                      un desplegable: de lado dice «aquí dentro hay más», abajo
                      dice «ya está abierto». Solo la llevan los que de verdad
                      se abren, así que su ausencia también informa. */}
                  {despliega && (
                    <span className="set-tab-chev" aria-hidden="true">
                      <ChevronIcon size={13} der />
                    </span>
                  )}
                </button>
                {/* Los bloques del grupo abierto, y solo si hay más de uno: con
                    uno solo, el desplegable repetiría el nombre del grupo justo
                    debajo del grupo. */}
                {abierto && !plegado && bloques.length > 1 && (
                  <div className="set-sub">
                    {bloques.map((b, i) => (
                      <button
                        key={`${b}-${i}`}
                        className="set-sub-item"
                        onClick={() => irABloque(i)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Y la derecha: una sola seccion, a todo el ancho. */}
        <div className="set-hoja">
          {seccion === "aspecto" && (
            <>
              {/* La cabecera a su gusto. Va la primera de Aspecto porque es lo
                  que más cambia el día a día: nueve pestañas iguales para todos
                  funcionan el primer día y dejan de funcionar al mes, cuando ya
                  sabes cuáles no vas a abrir nunca (Munir, 2026-08-08). */}
              <section className="panel-card">
                <h2>{t("La cabecera")}</h2>
                <p className="card-hint">
                  {t(
                    "Qué pestañas salen arriba y en qué orden. Apagar una la quita de la vista, no de Adeorq: su atajo de teclado la sigue abriendo, y los botones de otras pantallas que llevan a ella también. Ajustes no se puede apagar, porque es donde se vuelven a encender las demás.",
                  )}
                </p>
                <ul className="cab-lista">
                  {paraAjustes(TABS_CABECERA, cabecera).map((tab, i, fila) => {
                    const fuera = estaOculta(cabecera, tab.key);
                    const fija = tab.key === TAB_FIJA;
                    return (
                      <li key={tab.key} className="cab-fila" data-fuera={fuera || undefined}>
                        <span className="cab-nombre">{t(tab.label)}</span>
                        {/* Las flechas solo tienen sentido en las que se ven:
                            una apagada no está en la fila, así que no hay un
                            puesto suyo que subir o bajar. */}
                        {!fuera && (
                          <span className="cab-flechas">
                            <button
                              className="mini"
                              disabled={i === 0}
                              data-tip={t("Subir")}
                              aria-label={t("Subir")}
                              onClick={() => onCabecera(mover(TABS_CABECERA, cabecera, tab.key, -1))}
                            >
                              <ChevronIcon size={12} up />
                            </button>
                            <button
                              className="mini"
                              disabled={i + 1 >= fila.length || estaOculta(cabecera, fila[i + 1].key)}
                              data-tip={t("Bajar")}
                              aria-label={t("Bajar")}
                              onClick={() => onCabecera(mover(TABS_CABECERA, cabecera, tab.key, 1))}
                            >
                              <ChevronIcon size={12} />
                            </button>
                          </span>
                        )}
                        <input
                          type="checkbox"
                          checked={!fuera}
                          disabled={fija}
                          title={fija ? t("Ajustes no se puede apagar") : undefined}
                          onChange={() => onCabecera(alternar(cabecera, tab.key))}
                        />
                      </li>
                    );
                  })}
                </ul>
                {!esDefectoCabecera(cabecera) && (
                  <button className="mini" onClick={() => onCabecera(reiniciarCabecera())}>
                    {t("Como venía de fábrica")}
                  </button>
                )}
              </section>
              <section className="panel-card">
                <h2>{t("Idioma")}</h2>
                <p className="card-hint">
                  {t(
                    "El idioma de la app. Las terminales siguen hablando lo que hable cada agente.",
                  )}
                </p>
                <div className="chip-row">
                  <button
                    className="choice"
                    data-on={lang === "es"}
                    onClick={() => onLang("es")}
                  >
                    {t("Español")}
                  </button>
                  <button
                    className="choice"
                    data-on={lang === "en"}
                    onClick={() => onLang("en")}
                  >
                    {t("Inglés")}
                  </button>
                </div>
              </section>
              <section className="panel-card">
                <h2>{t("Tema")}</h2>
                <p className="card-hint">
                  {t("El color de la casa. El cristal y el desenfoque se mantienen.")}
                </p>
                {/* Un punto de color no dice cómo se ve un tema: dice de qué
                    color es. Cada tarjeta pinta una app en pequeño con la
                    paleta de verdad de ese tema (la misma regla de CSS que
                    viste la ventana entera, ver `[data-tema-prev]` en
                    App.css), así que se elige mirando y no imaginando.
                    Y con treinta y dos, filtro por familia y buscador: leer
                    treinta y dos nombres para encontrar el que ya sabes cómo
                    se llama no es elegir, es buscar a mano. */}
                <div className="tema-filtros">
                  <button
                    className="tema-tab"
                    data-on={famTema === "todas"}
                    onClick={() => setFamTema("todas")}
                  >
                    {t("Todos")}
                  </button>
                  {FAMILIAS_TEMA.map((fam) => (
                    <button
                      key={fam.id}
                      className="tema-tab"
                      data-on={famTema === fam.id}
                      onClick={() => setFamTema(fam.id)}
                    >
                      {lang === "es" ? fam.es : fam.en}
                    </button>
                  ))}
                </div>
                <div className="tema-buscar">
                  <SearchIcon size={14} />
                  <input
                    value={qTema}
                    placeholder={t("Buscar un tema")}
                    onChange={(e) => setQTema(e.currentTarget.value)}
                  />
                </div>
                <div className="tema-rejilla">
                  {THEMES.filter(
                    (th) =>
                      (famTema === "todas" || th.familia === famTema) &&
                      (!qTema.trim() ||
                        `${th.es} ${th.en}`.toLowerCase().includes(qTema.trim().toLowerCase())),
                  ).map((th) => (
                    <button
                      key={th.id}
                      className="tema-tarjeta"
                      data-on={theme === th.id}
                      onClick={() => onTheme(th.id)}
                    >
                      {/* La miniatura: barra lateral, cabecera y tres líneas,
                          que es la forma que tiene la app de verdad. */}
                      <span className="tema-prev" data-tema-prev={th.id} aria-hidden="true">
                        <span className="tema-prev-barra" />
                        <span className="tema-prev-cuerpo">
                          <i className="tema-prev-linea tema-prev-acento" />
                          <i className="tema-prev-linea" />
                          <i className="tema-prev-linea tema-prev-corta" />
                        </span>
                      </span>
                      <span className="tema-nombre">
                        {lang === "es" ? th.es : th.en}
                        {theme === th.id && <CheckIcon size={13} />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel-card">
                <h2>{t("El color de las terminales")}</h2>
                <p className="card-hint">
                  {t(
                    "Los dieciséis colores con los que los programas pintan dentro de la terminal, aparte del tema de la casa: el tema es el mueble y esto es la letra que lees ocho horas. El fondo no lo toca, para que las terminales sigan siendo cristal sobre tu fondo.",
                  )}
                </p>
                {/* El apagón. Va aquí arriba y no perdido entre los esquemas
                    porque manda sobre todos ellos: con esto encendido, el
                    fondo de una terminal es negro y punto. */}
                <label className="ajuste-fila mem-check apagon-fila">
                  <input
                    type="checkbox"
                    checked={apagada}
                    onChange={(e) => {
                      guardarApagon(e.currentTarget.checked);
                      setApagada(e.currentTarget.checked);
                    }}
                  />
                  <span>
                    <b>{t("Apagón")}</b>
                    <span className="card-hint">
                      {t(
                        "Negro sólido detrás de las terminales, aunque tengas fondo puesto. Para cuando lo que hay debajo estorba a lo que estás leyendo. No toca el resto de la app: para eso está el tema «Negro absoluto».",
                      )}
                    </span>
                  </span>
                </label>
                {/* Justo debajo del apagón porque son la misma familia: los dos
                    cambian lo que se ve DETRÁS del texto. La diferencia es que
                    el apagón lo hace para leer mejor y este para gastar menos. */}
                {/* Tres opciones y no un sí/no, desde el 2026-08-09. El sí/no
                    obligaba a elegir entre bonita y rápida de una vez para
                    siempre, y la respuesta buena depende de lo que tengas
                    abierto: con dos terminales el cristal no cuesta, con seis
                    se nota al escribir. */}
                <div className="ajuste-bloque">
                  <b>{t("Modo rendimiento")}</b>
                  <span className="card-hint">
                    {t(
                      "Menos cristal y terminales sólidas, para cuando tengas varios agentes trabajando a la vez. Adeorq apila treinta capas de cristal sobre tu foto y las terminales son transparentes para dejarla ver: eso es lo bonito y es lo que cuesta. Medido con TRES terminales: dibujarlo se lleva dos tercios de un núcleo, sin parar. No cambia nada de lo que Adeorq hace, solo lo que gasta en pintarlo.",
                    )}
                  </span>
                  <div className="chip-row">
                    {(
                      [
                        ["auto", "Automático", "El cristal se queda mientras va fino y se apaga solo al abrir la cuarta terminal. Al cerrarlas vuelve."],
                        ["nunca", "Siempre bonita", "El cristal no se apaga nunca, tengas las terminales que tengas."],
                        ["siempre", "Siempre rápida", "Sin cristal desde el primer momento, aunque no haga falta."],
                      ] as Array<[ModoRend, string, string]>
                    ).map(([id, label, tip]) => (
                      <button
                        key={id}
                        className="choice"
                        data-on={rapida === id}
                        data-tip={t(tip)}
                        onClick={() => {
                          // Cuántas hay abiertas AHORA lo sabe App, no esta
                          // pantalla: se le pregunta al DOM, que es donde vive
                          // aplicada la decisión, y App la recalcula sola en
                          // cuanto cambie el tablero.
                          guardarRendimiento(id, abiertas);
                          setRapida(id);
                        }}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Seis rayitas de color dentro de un chip no dicen cómo se va
                    a ver una terminal: dicen qué colores tiene. Cada esquema se
                    enseña como lo que es, cuatro líneas de terminal de verdad
                    escritas con SUS colores, con el fondo que le va a tocar (el
                    de la casa, que es quien lo pone). Así se elige mirando algo
                    que se parece a lo que vas a leer ocho horas. */}
                {FAMILIAS_TERM.map((fam) => (
                  <div key={fam.id} className="tema-familia">
                    <h3 className="tema-familia-eti">{lang === "es" ? fam.es : fam.en}</h3>
                    <div className="term-rejilla">
                      {TEMAS_TERM.filter((tt) => tt.familia === fam.id).map((tt) => {
                        const c = tt.colores;
                        return (
                          <button
                            key={tt.id}
                            className="tema-tarjeta term-tarjeta"
                            data-on={termTheme === tt.id}
                            onClick={() => {
                              guardarTemaTerm(tt.id);
                              setTermTheme(tt.id);
                            }}
                          >
                            <span className="term-prev" aria-hidden="true">
                              <span style={{ color: c.cyan }}>~/adeorq</span>{" "}
                              <span style={{ color: c.green }}>❯</span>{" "}
                              <span style={{ color: c.foreground }}>pnpm build</span>
                              <br />
                              <span style={{ color: c.green }}>✓</span>{" "}
                              <span style={{ color: c.foreground }}>listo en 3,1 s</span>
                              <br />
                              <span style={{ color: c.yellow }}>⚠</span>{" "}
                              <span style={{ color: c.brightBlack }}>2 avisos</span>
                              <br />
                              <span style={{ color: c.red }}>✗</span>{" "}
                              <span style={{ color: c.magenta }}>auth.ts</span>
                              <span style={{ color: c.brightBlack }}>:42</span>
                              <span className="term-prev-cursor" style={{ background: c.cursor }} />
                            </span>
                            <span className="tema-nombre">
                              {lang === "es" ? tt.es : tt.en}
                              {termTheme === tt.id && <CheckIcon size={13} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
              <section className="panel-card">
                <h2>{t("El fondo")}</h2>
                <p className="card-hint">
                  {t(
                    "Lo que se ve detrás de las terminales. Los paneles ya son cristal, así que debajo había un color plano desaprovechado. Vale una imagen o un vídeo, que se pone en bucle y sin sonido. El archivo se copia a la carpeta de Adeorq, así que el fondo no se rompe si luego mueves el original.",
                  )}
                </p>
                <div className="account-actions">
                  <button
                    className="np-btn"
                    onClick={() => {
                      void pickFile({
                        multiple: false,
                        filters: [
                          {
                            name: "Imagen o vídeo",
                            extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "mp4", "webm"],
                          },
                        ],
                      })
                        .then((r) => (typeof r === "string" ? onFondo(r) : undefined))
                        .catch((e) => setFondoError(String(e)));
                    }}
                  >
                    {fondo ? t("Cambiar el fondo…") : t("Elegir un fondo…")}
                  </button>
                  {fondo && (
                    <button
                      className="np-btn ghost"
                      onClick={() => void onFondo("").catch((e) => setFondoError(String(e)))}
                    >
                      {t("Quitarlo")}
                    </button>
                  )}
                </div>
                {fondoError && <p className="setting-line setting-bad">⚠ {fondoError}</p>}
                {fondo && (
                  <>
                    {/* El encuadre va lo PRIMERO tras elegir el archivo, y no al
                        final entre los deslizadores, porque es la pregunta que
                        se hace uno nada más poner una foto: «¿por qué sale
                        recortada así?». Los graduadores vienen después, cuando
                        ya se ve lo que se quiere ver. */}
                    <EncuadreFondo
                      path={fondo}
                      sello={fondoSello}
                      desenfoque={fondoDesenfoque}
                      encuadre={fondoEncuadre}
                      onEncuadre={onFondoEncuadre}
                    />
                    {/* Los dos mandos solo salen con fondo puesto: sin él no gradúan
                        nada y serían dos barras que no hacen visiblemente nada. */}
                    <label className="setting-row">
                      <span>{t("Cuánto se ve")}</span>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={fondoOpacidad}
                        onChange={(e) => onFondoOpacidad(Number(e.currentTarget.value))}
                      />
                      <span className="setting-value">{fondoOpacidad}%</span>
                    </label>
                    <label className="setting-row">
                      <span>{t("Desenfoque")}</span>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={fondoDesenfoque}
                        onChange={(e) => onFondoDesenfoque(Number(e.currentTarget.value))}
                      />
                      <span className="setting-value">{fondoDesenfoque}px</span>
                    </label>
                    <p className="card-hint">
                      {t(
                        "Si cuesta leer las terminales, baja «cuánto se ve» o sube el desenfoque: el texto manda sobre la foto.",
                      )}
                    </p>
                  </>
                )}
                {/* Este mando sale SIEMPRE, con foto y sin ella, y los otros dos
                    no: la ventana de Adeorq es acrílica, así que abriendo la
                    terminal se ve lo que haya detrás aunque no hayas puesto
                    ninguna foto. Y hace falta porque el fondo del lienzo de
                    xterm es lo único de la app que no es CSS: lo pinta su
                    renderer con el color de su tema, así que ni «cuánto se ve»
                    ni el desenfoque lo tocaban. */}
                <label className="setting-row setting-switch">
                  <span>{t("Terminales transparentes")}</span>
                  <input
                    type="checkbox"
                    checked={terminalVer !== 0}
                    // Al encender vuelve al automático, que es lo que hace la
                    // app sola: 55 % de fondo normalmente y 80 % con foto.
                    onChange={(e) => onTerminalVer(e.currentTarget.checked ? -1 : 0)}
                  />
                  <span className="setting-value">{terminalVer !== 0 ? t("sí") : t("no")}</span>
                </label>
                {terminalVer !== 0 && (
                  <>
                    <label className="setting-row">
                      <span>{t("Cuánto se ve a través de las terminales")}</span>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={terminalVer < 0 ? (fondo ? 80 : 55) : terminalVer}
                        onChange={(e) => onTerminalVer(Number(e.currentTarget.value))}
                      />
                      <span className="setting-value">
                        {terminalVer < 0 ? t("auto") : `${terminalVer}%`}
                      </span>
                    </label>
                    <p className="card-hint">
                      {t(
                        "Sube esto para que la foto, o el escritorio, se vean a través del texto de las terminales. Al 100% la terminal es un cristal.",
                      )}{" "}
                      {fondo && (
                        <>
                          {t(
                            "Ojo: «cuánto se ve», aquí arriba, manda sobre esto. Si está bajo, la foto llega apagada a todas partes y subir este mando no la trae de vuelta.",
                          )}{" "}
                        </>
                      )}
                      {terminalVer >= 0 && (
                        <button className="mini" onClick={() => onTerminalVer(-1)}>
                          {t("Volver al automático")}
                        </button>
                      )}
                    </p>
                  </>
                )}
              </section>
            </>
          )}
          {seccion === "terminales" && (
            <>
              <section className="panel-card">
                <h2>{t("Terminales")}</h2>
                <label className="setting-row setting-switch">
                  <span>{t("Ajustar la letra al tamaño de cada terminal")}</span>
                  <input
                    type="checkbox"
                    checked={autoFont}
                    onChange={(e) => onAutoFont(e.currentTarget.checked)}
                  />
                  <span className="setting-value">{autoFont ? t("sí") : t("no")}</span>
                </label>
                <label className="setting-row">
                  <span>{autoFont ? t("Tamaño máximo de la letra") : t("Tamaño de la letra")}</span>
                  <input
                    type="range"
                    min={11}
                    max={22}
                    value={fontSize}
                    onChange={(e) => onFontSize(Number(e.currentTarget.value))}
                  />
                  <span className="setting-value">{fontSize}px</span>
                </label>
                <label className="setting-row">
                  {/* Antes se llamaba «Cuántas sesiones abre el botón ⧉», que
                      obliga a saberse un símbolo para entender un ajuste. */}
                  <span>{t("Cuántas sesiones abre de golpe un proyecto")}</span>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={openAll}
                    onChange={(e) => onOpenAll(Number(e.currentTarget.value))}
                  />
                  <span className="setting-value">{openAll}</span>
                </label>
                <label className="setting-row setting-switch">
                  <span>{t("Recuperar las terminales al abrir")}</span>
                  <input
                    type="checkbox"
                    checked={restore}
                    onChange={(e) => onRestore(e.currentTarget.checked)}
                  />
                  <span className="setting-value">{restore ? t("sí") : t("no")}</span>
                </label>
                <label className="setting-row setting-switch">
                  <span>{t("Saltar a la sesión que termina, a pantalla completa")}</span>
                  <input
                    type="checkbox"
                    checked={saltar}
                    onChange={(e) => onSaltar(e.currentTarget.checked)}
                  />
                  <span className="setting-value">{saltar ? t("sí") : t("no")}</span>
                </label>
                <label className="setting-row setting-switch">
                  <span>{t("Arrancar Adeorq al encender el ordenador")}</span>
                  <input
                    type="checkbox"
                    checked={!!boot}
                    disabled={boot === null}
                    onChange={(e) => setBootTo(e.currentTarget.checked)}
                  />
                  <span className="setting-value">
                    {boot === null ? "…" : boot ? t("sí") : t("no")}
                  </span>
                </label>
                {bootError && <p className="setting-line setting-bad">⚠ {bootError}</p>}
                <p className="card-hint">
                  {t(
                    "Al abrir Adeorq vuelven las mismas terminales que tenías, en sus carpetas, y cada Claude retoma SU conversación. Con el ajuste automático, una terminal estrecha encoge la letra hasta que la línea vuelve a caber. Cada sesión es un programa aparte: unos 200 MB cada una.",
                  )}
                </p>
                <p className="card-hint">
                  {t(
                    "Con las dos cosas puestas, enciendes el ordenador y tu taller ya está montado. El arranque automático es una entrada normal de Windows: también puedes quitarla desde el Administrador de tareas, pestaña Inicio. Y siempre apunta a la Adeorq instalada, nunca a la de desarrollo.",
                  )}
                </p>
              </section>
              <section className="panel-card">
                <h2>{t("Modo de permisos")}</h2>
                <p className="card-hint">
                  {t(
                    "Con qué modo nace cada terminal de Claude nueva. Se puede pasar a otro dentro de la sesión con Mayús+Tab; esto solo decide cómo empieza.",
                  )}
                </p>
                <div className="chip-row">
                  {PERMISSION_MODES.map(([mode, label]) => (
                    <button
                      key={mode}
                      className="choice"
                      data-on={permissionMode === mode}
                      onClick={() => onPermissionMode(mode)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="card-hint">{t(PERMISSION_MODE_HINT[permissionMode])}</p>
              </section>
            </>
          )}
          {seccion === "avisos" && (
            <>
              <section className="panel-card">
                <h2>{t("Avisos")}</h2>
                <p className="card-hint">
                  {t(
                    "Aviso de Windows cuando un agente termina su turno o cuando espera tu OK, con el icono parpadeando en la barra de tareas. Nunca avisa del panel que estás mirando.",
                  )}
                </p>
                <div className="chip-row">
                  {(
                    [
                      ["fondo", "Solo en segundo plano"],
                      ["siempre", "Siempre"],
                      ["nunca", "Nunca"],
                    ] as Array<[NotifyMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      className="choice"
                      data-on={notifyMode === mode}
                      onClick={() => onNotifyMode(mode)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </section>

              {/* El cerebro de partida. Va JUSTO ANTES del aviso de «cuando el
                  cerebro no cuadra» porque son la misma conversación: uno
                  elige y el otro te avisa si lo elegido no pega. */}
              <section className="panel-card">
                <h2>{t("Tu cerebro por defecto")}</h2>
                <p className="card-hint">
                  {t(
                    "De fábrica decide Adeorq, mirando lo que exige cada tarea: un renombrado va en haiku y una auditoría en opus. Aquí puedes fijar uno para todo, si prefieres gastar de otra manera. Dos cosas que sigue haciendo igual: la cuota manda (con la semana agotada se abarata lo que se pueda), y una tarea de juicio NO se abarata nunca, porque un ajuste que se pone una vez no puede decidir meses después que una auditoría de seguridad se haga con el modelo barato.",
                  )}
                </p>
                <div className="chip-row">
                  <button
                    className="choice"
                    data-on={!cerebro}
                    onClick={() => {
                      guardarCerebroPorDefecto(undefined);
                      setCerebro(undefined);
                    }}
                  >
                    {t("Que decida Adeorq")}
                  </button>
                  {A_MANO.map((m) => (
                    <button
                      key={m}
                      className="choice"
                      data-on={cerebro === m}
                      onClick={() => {
                        guardarCerebroPorDefecto(m);
                        setCerebro(m);
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </section>

              {/* Lo que el Asistente dice sin que se lo pregunten sobre el
                  cerebro que tienes puesto. Vive aquí y no en el Asistente
                  porque es un ajuste de cuánto habla la app, igual que el de
                  arriba, y se busca donde se busca lo otro. */}
              <section className="panel-card">
                <h2>{t("Cuando el cerebro no cuadra")}</h2>
                <p className="card-hint">
                  {t(
                    "Al preparar un encargo, el Asistente mira con qué modelo está la terminal que tienes delante. Si es mucho más caro de lo que la tarea necesita (o mucho más flojo), te lo dice.",
                  )}
                </p>
                <div className="chip-row">
                  {(
                    [
                      ["gordas", "Solo diferencias gordas"],
                      ["siempre", "Cualquier diferencia"],
                      ["nunca", "Nunca"],
                    ] as Array<[ModoAviso, string]>
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      className="choice"
                      data-on={avisoRouter === m}
                      onClick={() => {
                        guardarModoAviso(m);
                        setAvisoRouter(m);
                      }}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </section>

              {/* El vigía de las cuadrillas. Va junto al de arriba porque es lo
                  mismo: cuánto habla la app sin que se lo pidas. */}
              <section className="panel-card">
                <h2>{t("El vigía de las cuadrillas")}</h2>
                <p className="card-hint">
                  {t(
                    "Con una cuadrilla abierta, mira cada minuto quién ha terminado, quién lleva rato esperándote y si alguien anda tocando los archivos de otro. Cuando algo lo merece deja una línea en la bandeja de la Agenda, para que la aceptes o la descartes. Nunca escribe en una terminal ni abre ni cierra nada.",
                  )}
                </p>
                <div className="chip-row">
                  {(
                    [
                      ["gordas", "Solo lo gordo"],
                      ["siempre", "Todo lo que vea"],
                      ["nunca", "Nunca"],
                    ] as Array<[ModoVigia, string]>
                  ).map((par) => (
                    <button
                      key={par[0]}
                      className="choice"
                      data-on={avisoVigia === par[0]}
                      onClick={() => {
                        guardarModoVigia(par[0]);
                        setAvisoVigia(par[0]);
                      }}
                    >
                      {t(par[1])}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {seccion === "atajos" && (
            <>
              <section className="panel-card">
                <h2>{t("Atajos del lienzo")}</h2>
                <p className="card-hint">
                  {t(
                    "Las teclas del lienzo, y puedes cambiarlas: pulsa el atajo de una acción y luego la combinación que quieras. Solo actúan con el lienzo delante y con el foco fuera de una terminal, así que nunca le quitan una tecla a lo que estés escribiendo. Los de abrir cosas van con Alt porque dentro de una terminal Ctrl+letra es del programa que corre ahí.",
                  )}
                </p>
                <AtajosEditor atajos={atajos} onChange={onAtajos} />
              </section>

              {/* META 7. It used to ask for an application id, because Adeorq had no
                  application of its own yet. Now it does, so the card asks for one
                  switch and nothing else: the id names the APP, never the person. */}
            </>
          )}
          {seccion === "modelo" && (
            <>
              <section className="panel-card">
                <h2>{t("Tu modelo local")}</h2>
                <p className="card-hint">
                  {t(
                    "En la Agenda, quién te espera sale del disco y es exacto: eso funciona siempre. Lo que no se puede saber sin leer es QUÉ te está preguntando cada sesión, y esa línea la escribe un modelo que corre en tu propio ordenador (Ollama), sin gastar cuota de nadie. Elige uno pequeño: es una frase, no un ensayo.",
                  )}
                </p>
                {modelos === null ? (
                  <p className="setting-line">{t("Mirando si Ollama está abierto…")}</p>
                ) : modelos.length === 0 ? (
                  <p className="setting-line setting-bad">
                    {t(
                      "⚠ Ollama no responde en 127.0.0.1:11434. Ábrelo y vuelve a esta pantalla; hasta entonces la Agenda funciona igual, solo que sin esa línea.",
                    )}
                  </p>
                ) : (
                  <div className="chip-row">
                    <button
                      className="choice"
                      data-on={modeloLocal === ""}
                      onClick={() => onModeloLocal("")}
                    >
                      {t("Ninguno")}
                    </button>
                    {modelos.map((m) => (
                      <button
                        key={m}
                        className="choice"
                        data-on={modeloLocal === m}
                        onClick={() => onModeloLocal(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          {seccion === "discord" && (
            <>
              <section className="panel-card">
                <h2>{t("Tu actividad de Discord")}</h2>
                <p className="card-hint">
                  {t(
                    "Que en tu perfil de Discord se vea que estás en Adeorq, como cuando alguien juega a algo. Habla con el Discord que ya tienes abierto en este equipo: no hay cuenta, ni servidor, ni contraseña de por medio.",
                  )}
                </p>
                <label className="setting-row setting-switch">
                  <span>{t("Mostrar Adeorq en mi Discord")}</span>
                  <input
                    type="checkbox"
                    checked={discord.on}
                    onChange={(e) => onDiscord({ ...discord, on: e.currentTarget.checked })}
                  />
                  <span className="setting-value">{discord.on ? t("sí") : t("no")}</span>
                </label>
                <label className="setting-row setting-switch">
                  <span>{t("Decir en qué proyecto estoy")}</span>
                  <input
                    type="checkbox"
                    checked={discord.showProject}
                    onChange={(e) =>
                      onDiscord({ ...discord, showProject: e.currentTarget.checked })
                    }
                  />
                  <span className="setting-value">
                    {discord.showProject ? t("sí") : t("no")}
                  </span>
                </label>
                <p className="card-hint">
                  {t(
                    "Apagado, pone «Programando con agentes» y cuántas terminales tienes abiertas, y nada más. Encendido, dice el nombre del proyecto que estás mirando: no lo dejes puesto con proyectos que aún no has publicado. En modo emisión vuelve solo a lo genérico, mande lo que mande este interruptor.",
                  )}
                </p>
                {discord.on && discordError && (
                  <p className="setting-line setting-bad">⚠ {discordError}</p>
                )}
                {discord.on && !discordError && discord.clientId && (
                  <p className="setting-line setting-good">
                    ✓ {t("Publicado en tu Discord.")}
                  </p>
                )}
                <p className="card-hint">
                  {t(
                    "No tienes que registrar nada: Adeorq ya es una aplicación de Discord, y es la suya la que sale con su nombre y su logo. El identificador de abajo solo se toca si quieres publicar la tuya propia, con otro nombre; vacío, vuelve a la de Adeorq.",
                  )}
                </p>
                <details className="setting-more">
                  <summary>{t("Publicar con otra aplicación (avanzado)")}</summary>
                  <label className="setting-row">
                    <span>{t("Identificador de la aplicación")}</span>
                    <input
                      className="finder setting-input"
                      value={discord.clientId}
                      placeholder={ADEORQ_APP_ID}
                      spellCheck={false}
                      onChange={(e) =>
                        onDiscord({ ...discord, clientId: e.currentTarget.value.trim() })
                      }
                    />
                  </label>
                  <div className="foreman-row">
                    <button
                      className="mini"
                      disabled={discord.clientId === ADEORQ_APP_ID}
                      onClick={() => onDiscord({ ...discord, clientId: ADEORQ_APP_ID })}
                    >
                      {t("Volver a la de Adeorq")}
                    </button>
                    <button
                      className="np-btn"
                      onClick={() =>
                        openUrl("https://discord.com/developers/applications").catch(() => {})
                      }
                    >
                      {t("Abrir el portal de Discord")}
                    </button>
                  </div>
                  <p className="card-hint">
                    {t(
                      "Con una aplicación propia, sube el logo en Rich Presence › Art Assets con el nombre exacto «adeorq» o saldrá sin imagen.",
                    )}
                  </p>
                </details>
              </section>
            </>
          )}
          {/* La guía dejó de ser una pestaña de la barra de arriba. Ocupaba
              sitio permanente para algo que se mira el primer día y casi nunca
              más, mientras que Cabina, Lienzo y Agenda son el trabajo diario.
              Aquí sigue entera, y al lado está la documentación de la web, que
              es la que se puede leer en el móvil o mandarle a alguien. */}
          {seccion === "ayuda" && (
            <>
              {/* Lo primero de Ayuda es lo primero que se ve al instalar: quien
                  entra aquí buscando «cómo va esto» quiere el paseo, no el
                  manual de veinte pantallas. */}
              <section className="panel-card">
                <h2>{t("Primeros pasos")}</h2>
                <p className="card-hint">
                  {t(
                    "La bienvenida pregunta tu nombre, dónde tienes los proyectos y qué clientes usas. El recorrido enseña para qué es cada parte de la ventana.",
                  )}
                </p>
                <div className="foreman-row">
                  <button className="np-btn" onClick={onVerTour}>
                    {t("Ver el recorrido")}
                  </button>
                  <button className="mini" onClick={onVerBienvenida}>
                    {t("Repetir la bienvenida")}
                  </button>
                </div>
              </section>

              <section className="panel-card">
                <h2>{t("Documentación")}</h2>
                <p className="card-hint">
                  {t(
                    "La documentación de Adeorq en la web: se abre en tu navegador, se lee desde cualquier sitio y siempre está al día, sin esperar a una actualización de la app.",
                  )}
                </p>
                <div className="foreman-row">
                  <button
                    className="np-btn"
                    onClick={() => void openUrl(`${DOCS_URL}docs.html`).catch(() => {})}
                  >
                    {t("Abrir la documentación")}
                  </button>
                  <button
                    className="mini"
                    onClick={() => void openUrl(DOCS_URL).catch(() => {})}
                  >
                    {t("Descargas y versiones")}
                  </button>
                </div>
                <p className="setting-line docs-url">{DOCS_URL}</p>
              </section>
              <GuideView />
            </>
          )}

          {seccion === "adeorq" && (
            <>
              {/* Lo que contestó en la bienvenida, para cambiarlo sin repetirla.
                  La carpeta es la más importante de las dos: es la que decide
                  qué proyectos existen para el panel entero. */}
              <section className="panel-card">
                <h2>{t("Tú y tus proyectos")}</h2>
                <p className="card-hint">
                  {t(
                    "Tu nombre es para el saludo del Panel. La carpeta es la que se lee para saber qué proyectos tienes: cada subcarpeta suya es uno. Puedes no tener ninguna y añadir tus proyectos uno a uno, de donde estén.",
                  )}
                </p>
                <label className="onb-campo">
                  <span>{t("Tu nombre")}</span>
                  <input
                    className="finder"
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.currentTarget.value);
                      tocarPerfil({ nombre: e.currentTarget.value });
                    }}
                  />
                </label>
                <div className="onb-ruta" data-off={sinCarpeta || undefined}>
                  <code>{sinCarpeta ? t("sin carpeta de proyectos") : carpeta || "…"}</code>
                  <button
                    className="mini"
                    onClick={() => {
                      void pickFile({
                        directory: true,
                        defaultPath: carpeta || undefined,
                        title: t("Dónde viven tus proyectos"),
                      })
                        .then(async (path) => {
                          if (typeof path !== "string") return;
                          const limpia = await fijarRaiz(path);
                          tocarPerfil({ raiz: limpia, sinRaiz: false });
                          setCarpeta(limpia);
                          setSinCarpeta(false);
                          setErrorRaiz(null);
                          onRaizCambiada();
                        })
                        .catch((e) => setErrorRaiz(String(e)));
                    }}
                  >
                    {t("Elegir carpeta")}
                  </button>
                  {!sinCarpeta && (
                    <button
                      className="mini"
                      data-tip={t("Tus proyectos dejan de salir solos: los añades tú, de donde estén")}
                      onClick={() => {
                        tocarPerfil({ sinRaiz: true });
                        setSinCarpeta(true);
                        setErrorRaiz(null);
                        onRaizCambiada();
                      }}
                    >
                      {t("Sin carpeta")}
                    </button>
                  )}
                </div>
                {errorRaiz && <p className="onb-mal">{errorRaiz}</p>}

                {/* Los de fuera de la carpeta madre. Viven aquí y no en la
                    barra porque quitarlos es una decisión de configuración, y
                    en la barra un aspa junto a un proyecto se parece
                    demasiado a borrarlo del disco. */}
                <p className="card-hint">
                  {extras.length
                    ? t("Proyectos que añadiste tú, de fuera de esa carpeta:")
                    : t("Puedes añadir proyectos sueltos de cualquier sitio del disco.")}
                </p>
                {extras.length > 0 && (
                  <ul className="ajuste-extras">
                    {extras.map((ruta) => (
                      <li key={ruta}>
                        <code title={ruta}>{ruta}</code>
                        <button
                          className="mini"
                          data-tip={t("Quitarlo del panel. La carpeta no se toca.")}
                          onClick={() => {
                            quitarProyecto(ruta);
                            setExtras(leerPerfil().extras);
                            onRaizCambiada();
                          }}
                        >
                          {t("Quitar")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  className="mini"
                  onClick={() => {
                    void pickFile({
                      directory: true,
                      title: t("Elige la carpeta del proyecto"),
                    })
                      .then((path) => {
                        if (typeof path !== "string") return;
                        if (!anadirProyecto(path)) {
                          setErrorRaiz(t("Ese proyecto ya estaba en el panel."));
                          return;
                        }
                        setExtras(leerPerfil().extras);
                        setErrorRaiz(null);
                        onRaizCambiada();
                      })
                      .catch((e) => setErrorRaiz(String(e)));
                  }}
                >
                  {t("＋ Añadir un proyecto")}
                </button>
              </section>

              <section className="panel-card">
                <h2>{t("Actualizaciones")}</h2>
                <p className="card-hint">
                  {t("Comprueba sola al arrancar y cada 6 horas.")}
                </p>
                <p className="setting-line">
                  {t("Versión instalada")}: <strong>{version || "…"}</strong>
                </p>
                <div className="foreman-row">
                  <button className="np-btn" disabled={checking} onClick={lookForUpdates}>
                    {checking
                      ? updPct > 0
                        ? `${updPct}%`
                        : t("Buscando…")
                      : t("Buscar e instalar")}
                  </button>
                  {/* Reiniciar solo sale cuando ya está bajada: un botón de
                      reiniciar siempre visible invita a cerrar la app por nada. */}
                  {updPct === 100 && (
                    <button className="np-btn" onClick={() => void relaunch()}>
                      {t("Reiniciar")}
                    </button>
                  )}
                </div>
                {news && <p className="np-ok">{news}</p>}
              </section>
              <section className="panel-card">
                <h2>{t("Tu cuota")}</h2>
                <p className="card-hint">
                  {t(
                    "Cuánto uso de tu suscripción llevas esta semana. Solo lo sabe Claude por dentro, así que el botón escribe /usage en la terminal que tengas activa y te lleva allí.",
                  )}
                </p>
                <div className="foreman-row">
                  <button className="np-btn" disabled={!canUsage} onClick={onUsage}>
                    {t("Ver mi uso semanal")}
                  </button>
                </div>
                {!canUsage && (
                  <p className="card-hint">
                    {t("Abre antes una sesión de Claude en la Cabina.")}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
