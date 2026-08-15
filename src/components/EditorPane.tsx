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

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentUnit } from "@codemirror/language";
import { useT } from "../lib/i18n";
import { guardarArchivo, leerArchivo, type Archivo } from "../lib/archivos";
import { nombreDeRuta, peso, rutaCorta } from "../lib/arbol";
import { lenguajeDe } from "../lib/lenguajes";
import { CloseIcon, MaximizeIcon, RefreshIcon, RestoreIcon } from "./Icons";

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

/**
 * El aspecto del editor, sacado de las variables de Adeorq.
 *
 * A propósito NO se usa ninguno de los temas que trae CodeMirror. Adeorq tiene
 * doce temas y una firma visual (cristal sobre una foto): un editor con los
 * colores de otro producto se vería pegado encima, y además dejaría de seguir
 * el tema al cambiarlo. Todo sale de `var(--…)`, así que cambia solo.
 */
const TEMA = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--text)", height: "100%" },
  ".cm-content": { fontFamily: "var(--mono, Consolas, 'Cascadia Mono', monospace)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted)",
    border: "none",
    opacity: 0.7,
  },
  ".cm-activeLine": { backgroundColor: "var(--row)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-dim)",
  },
  ".cm-scroller": { overflow: "auto" },
});

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
  const { t } = useT();
  const caja = useRef<HTMLDivElement>(null);
  const vista = useRef<EditorView | null>(null);
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [estado, setEstado] = useState<"leyendo" | "listo" | "guardando" | "pisaria" | "error">(
    "leyendo",
  );
  const [error, setError] = useState("");
  const [sucio, setSucio] = useState(false);

  /* Cuándo se leyó lo que hay en pantalla. En un ref y no en el estado porque
     lo consulta el guardado, que corre desde un atajo de teclado: con estado,
     el manejador registrado vería el valor del primer pintado para siempre. */
  const visto = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    setEstado("leyendo");
    try {
      const a = await leerArchivo(ruta);
      setArchivo(a);
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
      lineNumbers(),
      highlightActiveLine(),
      history(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      indentUnit.of("  "),
      TEMA,
      EditorView.lineWrapping,
      keymap.of([
        // Ctrl+S guarda, que es lo que va a pulsar cualquiera sin pensarlo.
        { key: "Mod-s", preventDefault: true, run: () => (guardarRef.current(), true) },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) setSucio(true);
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
  }, [archivo, ruta]);

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
      : "";
  useEffect(() => {
    onParte(ruta, { sucio, chip });
  }, [ruta, sucio, chip, onParte]);

  return (
    <div className="ed-hoja" data-visible={visible}>
      {/* El aviso que hace que esto sea de un ADE y no un editor cualquiera. */}
      {estado === "pisaria" && (
        <div className="ed-aviso">
          <span>
            {t("Alguien ha cambiado este archivo mientras lo tenías abierto. No se ha guardado nada.")}
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

      {archivo?.pega === "grande" && (
        <p className="ed-nota">
          {t("Este archivo pesa {p}. No se abre entero para que la app no se atasque.", {
            p: peso(archivo.peso),
          })}
        </p>
      )}
      {archivo?.pega === "binario" && (
        <p className="ed-nota">{t("Esto no es texto: son {p} de datos.", { p: peso(archivo.peso) })}</p>
      )}

      <div className="ed-caja" ref={caja} />

      <footer className="ed-pie">
        <span>
          {estado === "guardando" ? t("Guardando…") : sucio ? t("Sin guardar") : t("Guardado")}
        </span>
        <span className="ed-ruta">{rutaCorta(ruta, raiz)}</span>
        <span className="ed-atajo">{t("Ctrl+S para guardar")}</span>
        {/* Traer del disco lo que haya ahora. Hace falta porque nadie vigila la
            carpeta todavía: si un agente reescribe esto mientras lo lees, aquí
            sigue lo de antes hasta que lo pidas (o hasta que intentes guardar,
            que es cuando salta el aviso). */}
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
