// Archivos abiertos, ocupando un hueco del mosaico como una terminal más.
//
// Munir eligió esta colocación entre tres, tocándolas en un prototipo
// (2026-08-15): el archivo se queda AL LADO del agente que lo está escribiendo,
// en vez de mandarte a otra pantalla. Por eso es un pane y no una vista.
//
// ── POR QUÉ UN PANE LLEVA VARIOS ARCHIVOS ───────────────────────────────────
//
// Porque un archivo por panel parte el mosaico en cuatro al tercer archivo, y
// entonces ni se lee el código ni se ven las terminales. Con pestañas, un panel
// es un SITIO donde se miran archivos, como en cualquier navegador o editor, y
// eso es lo que pidió Munir enseñando una captura de pestañas de navegador.
//
// Las hojas se montan TODAS y solo se ve la activa. Desmontar la que no miras
// perdería su texto sin guardar, su cursor y su deshacer, que es justo lo que
// una pestaña promete conservar.
//
// ── LO QUE ESTO TIENE Y UN EDITOR NORMAL NO ─────────────────────────────────
//
// En VS Code el archivo lo cambias tú. Aquí lo cambia un agente mientras lo
// miras, y entonces «guardar» puede borrar su trabajo sin que nadie se entere.
// Por eso Rust recibe CUÁNDO se leyó esto y se niega a escribir si el disco es
// más nuevo (`guardar_archivo`, `pisaria: true`). Ver `docs/ARCHIVOS.md`.
//
// Y no se espera a que guardes para enterarse (desde el 2026-10-10): la hoja
// que tienes delante le pregunta al disco cada poco cuándo se tocó el archivo.
// Si cambió y tú no habías escrito nada, se trae lo nuevo sin moverte de donde
// estabas; si tenías cambios sin guardar, salta el mismo aviso y decides tú.

import { useCallback, useEffect, useRef, useState } from "react";
import { Annotation, EditorState, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useT } from "../lib/i18n";
import { cuandoArchivo, guardarArchivo, leerArchivo, leerImagen, type Archivo } from "../lib/archivos";
import { nombreDeRuta, peso, rutaCorta } from "../lib/arbol";
import { latido } from "../lib/latido";
import { lenguajeDe } from "../lib/lenguajes";
import { extensionesDeCodigo, useVarsDeCodigo } from "../lib/editorCodigo";
import { useCabina } from "../lib/cabina";
import { CloseIcon, MaximizeIcon, RefreshIcon, RestoreIcon } from "./Icons";

/** Cada cuánto mira al disco la hoja que tienes delante. El mismo paso que el
    árbol de Archivos, para que el punto amarillo y el texto cambien a la vez. */
const VIGILA_MS = 2_500;

/** Marca un cambio del texto que viene del disco y no de tus manos: no cuenta
    como «sin guardar». */
const DEL_DISCO = Annotation.define<boolean>();

interface Props {
  id: number;
  /** Todos los abiertos en este panel, en el orden en que se abrieron. */
  archivos: string[];
  /** El que se está viendo. */
  activo: string;
  /** La carpeta del proyecto, solo para enseñar la ruta corta. */
  raiz: string;
  focused: boolean;
  hidden: boolean;
  maximized: boolean;
  style: React.CSSProperties;
  onFocusPane: (id: number) => void;
  /** Cerrar el panel entero. */
  onClose: (id: number) => void;
  onToggleMax: (id: number) => void;
  onHeaderDown?: (id: number, e: React.PointerEvent) => void;
  onActivar: (ruta: string) => void;
  /** Cerrar UNA pestaña. Si era la última, quien lo reciba cierra el panel. */
  onCerrarPestana: (ruta: string) => void;
}

/** Lo que cada hoja le cuenta a la cabecera sobre cómo va lo suyo. */
interface Parte {
  sucio: boolean;
  /** "450 líneas · 22 kB", o vacío si no hay texto que contar. */
  chip: string;
}

/* ── UNA HOJA: un archivo, con su texto, su guardado y su aviso ──────────── */

function Hoja({
  ruta,
  raiz,
  visible,
  onParte,
}: {
  ruta: string;
  raiz: string;
  visible: boolean;
  onParte: (ruta: string, p: Parte) => void;
}) {
  const { t, lang } = useT();
  const colores = useVarsDeCodigo();
  const caja = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | null>(null);
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  /* `pisaria`: quisiste guardar y el disco era más nuevo. `cambiado`: lo mismo,
     visto antes de que guardaras, con cambios tuyos a medias. */
  const [estado, setEstado] = useState<
    "leyendo" | "listo" | "guardando" | "pisaria" | "cambiado" | "error"
  >("leyendo");
  const [error, setError] = useState("");
  const [sucio, setSucio] = useState(false);
  /** Sube cada vez que hay que montar el editor de nuevo. Traer del disco lo
      que cambió un agente NO lo sube: se cambia el texto dentro del mismo
      editor, que es lo que te deja donde estabas leyendo. */
  const [carga, setCarga] = useState(0);
  /** Si no es texto pero es una imagen, lista para un `<img>`; y su tamaño. */
  const [imagen, setImagen] = useState<string | null>(null);
  const [medida, setMedida] = useState("");
  /** Se acaba de traer del disco lo que cambió otro: se dice un momento. */
  const [fresco, setFresco] = useState(false);

  /* Cuándo se leyó lo que hay en pantalla. En un ref y no en el estado porque
     lo consulta el guardado, que corre desde un atajo de teclado: con estado,
     el manejador registrado vería el valor del primer pintado para siempre. */
  const visto = useRef<number | null>(null);
  const sucioRef = useRef(false);
  sucioRef.current = sucio;

  const cargar = useCallback(async () => {
    setEstado("leyendo");
    try {
      const a = await leerArchivo(ruta);
      const img = a.texto == null ? await leerImagen(ruta).catch(() => null) : null;
      setArchivo(a);
      setImagen(img);
      setCarga((n) => n + 1);
      visto.current = a.cuando;
      setSucio(false);
      setEstado("listo");
      setError("");
    } catch (e) {
      setError(String(e));
      setEstado("error");
    }
  }, [ruta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* El guardado vive en un ref: el atajo de CodeMirror se registra una sola
     vez, al construir la vista, y su closure se quedaría con el primer valor. */
  const guardarRef = useRef<() => void>(() => {});

  const guardar = useCallback(
    async (forzar = false) => {
      if (!vista.current || !archivo) return;
      setEstado("guardando");
      try {
        const texto = vista.current.state.doc.toString();
        const g = await guardarArchivo(ruta, texto, archivo.crlf, visto.current, forzar);
        if (g.pisaria) {
          // No se ha escrito NADA. Se avisa y se espera: decidir por ti cuál de
          // los dos textos vale es justo lo que no puede hacer un programa.
          visto.current = g.cuando;
          setEstado("pisaria");
          return;
        }
        visto.current = g.cuando;
        setSucio(false);
        setEstado("listo");
      } catch (e) {
        setError(String(e));
        setEstado("error");
      }
    },
    [ruta, archivo],
  );

  guardarRef.current = () => void guardar();

  /* La vista de CodeMirror se monta UNA vez por archivo. Recrearla en cada
     pintado perdería el cursor, la selección y el deshacer en cada tecla. */
  useEffect(() => {
    if (!caja.current || !archivo || archivo.texto == null) return;

    const lenguaje = lenguajeDe(nombreDeRuta(ruta));
    const extras: Extension[] = [
      // Los colores, las teclas y las ayudas: `lib/editorCodigo.ts`.
      ...extensionesDeCodigo({ lang, guardar: () => guardarRef.current() }),
      EditorView.updateListener.of((u) => {
        // Lo que llega del disco no es un cambio tuyo.
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(DEL_DISCO))) setSucio(true);
      }),
    ];
    if (lenguaje) extras.push(lenguaje);

    const view = new EditorView({
      state: EditorState.create({ doc: archivo.texto, extensions: extras }),
      parent: caja.current,
    });
    vista.current = view;
    return () => {
      view.destroy();
      vista.current = null;
    };
    // Por `carga` y no por `archivo`: traer del disco cambia `archivo` sin
    // querer un editor nuevo, que perdería el sitio por el que ibas leyendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga, ruta]);

  /* Un agente puede reescribir esto mientras lo miras. Solo la hoja que se ve
     pregunta, y con la ventana tapada tampoco (`latido`). */
  useEffect(() => {
    if (!visible) return;
    let viva = true;
    const mirar = async () => {
      const ahora = await cuandoArchivo(ruta).catch(() => 0);
      if (!viva || !ahora || visto.current == null || ahora <= visto.current) return;
      if (sucioRef.current) {
        // Tienes cambios sin guardar: no se toca nada, se avisa y decides tú.
        // `visto` se queda como estaba, para que guardar siga negándose.
        setEstado((e) => (e === "listo" ? "cambiado" : e));
        return;
      }
      const a = await leerArchivo(ruta).catch(() => null);
      if (!viva || !a || sucioRef.current) return;
      const v = vista.current;
      if (a.texto != null && v) {
        // El texto nuevo dentro del mismo editor: ni cuenta como cambio tuyo ni
        // entra en tu deshacer, y la vista se queda por donde ibas.
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: a.texto },
          annotations: [DEL_DISCO.of(true), Transaction.addToHistory.of(false)],
        });
        setArchivo(a);
      } else {
        // Dejó de ser texto, o era una imagen: se monta de nuevo lo que haya.
        const img = a.texto == null ? await leerImagen(ruta).catch(() => null) : null;
        if (!viva) return;
        setArchivo(a);
        setImagen(img);
        setCarga((n) => n + 1);
      }
      visto.current = a.cuando;
      setFresco(true);
    };
    const parar = latido(() => void mirar(), VIGILA_MS);
    return () => {
      viva = false;
      parar();
    };
  }, [ruta, visible]);

  // «Traído del disco» se dice cuatro segundos y se va.
  useEffect(() => {
    if (!fresco) return;
    const fin = window.setTimeout(() => setFresco(false), 4_000);
    return () => window.clearTimeout(fin);
  }, [fresco]);

  /* Al volver a esta pestaña, CodeMirror vuelve a medir. Mientras estaba
     escondida el ancho pudo cambiar (otro panel, otra ventana), y sin esto se
     queda con las medidas de entonces y parte las líneas donde no toca. */
  useEffect(() => {
    if (visible) vista.current?.requestMeasure();
  }, [visible]);

  // Lo que la cabecera necesita saber de esta hoja.
  const chip =
    archivo?.texto != null
      ? `${t("{n} líneas", { n: archivo.texto.split("\n").length })} · ${peso(archivo.peso)}`
      : archivo && imagen
        ? [medida, peso(archivo.peso)].filter(Boolean).join(" · ")
        : "";
  useEffect(() => {
    onParte(ruta, { sucio, chip });
  }, [ruta, sucio, chip, onParte]);
  // Y al árbol de Archivos, que la pinta como «sin guardar» (`lib/estadoArchivos.ts`).
  // Al cerrar la pestaña deja de estarlo: lo que no está abierto no tiene nada sin guardar.
  useEffect(() => {
    useCabina.getState().marcarSinGuardar(ruta, sucio);
  }, [ruta, sucio]);
  useEffect(() => () => useCabina.getState().marcarSinGuardar(ruta, false), [ruta]);

  return (
    <div className="ed-hoja" data-visible={visible}>
      {/* El aviso que hace que esto sea de un ADE y no un editor cualquiera. */}
      {(estado === "pisaria" || estado === "cambiado") && (
        <div className="ed-aviso">
          <span>
            {estado === "pisaria"
              ? t("Alguien ha cambiado este archivo mientras lo tenías abierto. No se ha guardado nada.")
              : t("Alguien acaba de cambiar este archivo en el disco, y tú tienes cambios sin guardar.")}
          </span>
          <button className="mini" onClick={() => void cargar()}>
            {t("Traer lo nuevo")}
          </button>
          <button className="mini ed-pisar" onClick={() => void guardar(true)}>
            {t("Guardar lo mío encima")}
          </button>
        </div>
      )}

      {estado === "error" && <p className="side-error">{error}</p>}

      {/* Una imagen se ve. Lo demás que no es texto, se dice lo que es. */}
      {archivo && imagen && (
        <div className="ed-imagen">
          <img
            src={imagen}
            alt={nombreDeRuta(ruta)}
            onLoad={(e) => setMedida(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
          />
        </div>
      )}
      {archivo?.pega === "grande" && !imagen && (
        <p className="ed-nota">
          {t("Este archivo pesa {p}. No se abre entero para que la app no se atasque.", {
            p: peso(archivo.peso),
          })}
        </p>
      )}
      {archivo?.pega === "binario" && !imagen && (
        <p className="ed-nota">{t("Esto no es texto: son {p} de datos.", { p: peso(archivo.peso) })}</p>
      )}

      <div className="ed-caja" ref={caja} style={colores} hidden={!!imagen} />

      <footer className="ed-pie">
        <span>
          {estado === "guardando"
            ? t("Guardando…")
            : sucio
              ? t("Sin guardar")
              : fresco
                ? t("Traído del disco: lo acaba de cambiar otro")
                : t("Guardado")}
        </span>
        <span className="ed-ruta">{rutaCorta(ruta, raiz)}</span>
        {!imagen && <span className="ed-atajo">{t("Ctrl+S para guardar")}</span>}
        {/* Traer del disco lo que haya ahora, a mano. La hoja ya lo vigila sola
            mientras la miras; esto queda para pedirlo sin esperar su turno. */}
        <button className="mini" data-tip={t("Releer del disco")} onClick={() => void cargar()}>
          <RefreshIcon size={12} />
        </button>
      </footer>
    </div>
  );
}

/* ── EL PANEL: la cabecera, las pestañas y las hojas ─────────────────────── */

export default function EditorPane({
  id,
  archivos,
  activo,
  raiz,
  focused,
  hidden,
  maximized,
  style,
  onFocusPane,
  onClose,
  onToggleMax,
  onHeaderDown,
  onActivar,
  onCerrarPestana,
}: Props) {
  const { t } = useT();
  const [partes, setPartes] = useState<Record<string, Parte>>({});

  /* Estable a propósito: si cambiara en cada pintado, el efecto de la hoja que
     lo llama se dispararía sin parar y el panel entraría en bucle. */
  const onParte = useCallback((ruta: string, p: Parte) => {
    setPartes((prev) => {
      const antes = prev[ruta];
      if (antes && antes.sucio === p.sucio && antes.chip === p.chip) return prev;
      return { ...prev, [ruta]: p };
    });
  }, []);

  const parte = partes[activo];

  return (
    <section
      className="pane pane-archivo"
      data-focused={focused}
      /* Escondido con `visibility` y no con el atributo `hidden` ni con
         `display: none`. Dos motivos: el atributo lo pisa el `display: flex` de
         la clase (gana la especificidad), y quitarlo del flujo haría que
         CodeMirror midiera cero al volver y se pintara con una línea de alto. */
      style={hidden ? { ...style, visibility: "hidden", pointerEvents: "none" } : style}
      onMouseDown={() => onFocusPane(id)}
    >
      <header
        className="pane-head"
        data-movable={!!onHeaderDown}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          onHeaderDown?.(id, e);
        }}
      >
        {/* Las mismas tres zonas que la cabecera de una terminal (identidad,
            estado, acciones): así al estrecharse cede lo mismo y en el mismo
            orden, y dos paneles distintos no se comportan distinto. */}
        <div className="ph-id">
          <span className="pane-name" data-tip={activo}>
            {nombreDeRuta(activo)}
            {parte?.sucio && <i className="pane-sucio" data-tip={t("Sin guardar")} />}
          </span>
        </div>
        <div className="ph-meta">{parte?.chip && <span className="pane-chip">{parte.chip}</span>}</div>
        <div className="ph-acts">
          <button
            className="mini"
            data-tip={maximized ? t("Restaurar") : t("Maximizar")}
            onClick={() => onToggleMax(id)}
          >
            {maximized ? <RestoreIcon size={13} /> : <MaximizeIcon size={13} />}
          </button>
          <button className="mini" data-tip={t("Cerrar")} onClick={() => onClose(id)}>
            <CloseIcon size={13} />
          </button>
        </div>
      </header>

      {/* Las pestañas, como las de un navegador: Munir lo pidió con una captura
          de una. Solo salen si hay más de una, igual que en cualquier navegador
          decente: una pestaña sola es un renglón que no dice nada y le quita
          altura al código. */}
      {archivos.length > 1 && (
        <div className="ed-pestanas">
          {archivos.map((ruta) => (
            <div
              key={ruta}
              className="ed-pest"
              data-on={ruta === activo}
              data-sucia={!!partes[ruta]?.sucio}
              title={ruta}
              onClick={() => onActivar(ruta)}
              /* El botón central del ratón cierra, como en el navegador. */
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCerrarPestana(ruta);
                }
              }}
            >
              <span className="ed-pest-nom">{nombreDeRuta(ruta)}</span>
              <button
                className="ed-pest-x"
                data-tip={t("Cerrar")}
                onClick={(e) => {
                  e.stopPropagation();
                  onCerrarPestana(ruta);
                }}
              >
                <CloseIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Las hojas se apilan dentro de este hueco, que es quien tiene la medida
          real: así ninguna necesita saber cuánto ocupan la cabecera ni las
          pestañas de arriba. */}
      <div className="ed-hojas">
        {archivos.map((ruta) => (
          <Hoja key={ruta} ruta={ruta} raiz={raiz} visible={ruta === activo} onParte={onParte} />
        ))}
      </div>
    </section>
  );
}
