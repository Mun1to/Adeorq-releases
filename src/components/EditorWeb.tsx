// La barra de herramientas que flota sobre tu localhost.
//
// Vive FUERA del iframe, en Adeorq, y esa es la decisión de fondo: si la
// pintara la sonda, dentro de tu página, heredaría tu CSS y se pelearía con él
// en cada proyecto. Aquí es cristal de Adeorq y se ve siempre igual.
//
// La barra no sabe nada de tu web. Lo único que hace es mandarle recados a la
// sonda («ahora estás en la herramienta de color», «ponle este tamaño») y
// pintar lo que la sonda le cuenta del elemento que has señalado. Quien toca
// los ficheros es `editor.rs`, al final del todo.
//
// ── LA FORMA, QUE SE REHÍZO ─────────────────────────────────────────────────
//
// La columna es SOLO la lista de herramientas y el envío al agente, y no cambia
// de forma nunca. La primera versión le puso encima una cabecera con su botón
// de salir y le colgó debajo el panel de propiedades, y con eso dejaba de ser
// una barra de herramientas para ser un panel de ajustes: Munir la rechazó con
// la referencia delante. Los controles viven ahora en su propio panel al lado,
// y solo cuando hay algo señalado. Del editor se sale por el mismo botón del
// panel de web con el que se entra.
//
// La columna vive PLEGADA a solo iconos y se abre al acercar el ratón, elegido
// por Munir entre cuatro formas de plegarla. Eso es CSS entero (`:hover` sobre
// `.editor-web`): aquí no hay ni estado ni preferencia que guardar, que es
// justo lo que la hace no estorbar.

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import {
  aLaSonda,
  deLaSonda,
  escribirEstilo,
  escribirTexto,
  parteParaElAgente,
  type Elegido,
  type Herramienta,
} from "../lib/editorWeb";
import {
  DuplicarIcon,
  EnviarIcon,
  EspaciadoIcon,
  EsquinaIcon,
  GirarIcon,
  MoverIcon,
  PicarIcon,
  PinturaIcon,
  RecorteIcon,
  RecuadroIcon,
  TextoIcon,
  TrashIcon,
} from "./Icons";

interface Props {
  /** El iframe donde vive la página. Sin él no hay con quién hablar. */
  marco: HTMLIFrameElement | null;
  /** Cambia cuando la página se recarga: hay que volver a presentarse. */
  sello: number;
  url: string;
  /** Deja el encargo escrito en la terminal de al lado. Devuelve si encontró
      alguna: sin terminal abierta no hay a quién mandárselo. */
  onAlAgente: (texto: string) => boolean;
}

const HERRAMIENTAS: {
  id: Herramienta;
  etiqueta: string;
  Icono: (p: { size?: number }) => React.ReactElement;
}[] = [
  { id: "select", etiqueta: "Seleccionar", Icono: PicarIcon },
  { id: "mover", etiqueta: "Mover y estirar", Icono: MoverIcon },
  { id: "caja", etiqueta: "Recuadro al agente", Icono: RecuadroIcon },
  { id: "esquinas", etiqueta: "Esquinas", Icono: EsquinaIcon },
  { id: "espaciado", etiqueta: "Espaciado", Icono: EspaciadoIcon },
  { id: "recorte", etiqueta: "Recorte y sombra", Icono: RecorteIcon },
  { id: "color", etiqueta: "Color y degradado", Icono: PinturaIcon },
  { id: "texto", etiqueta: "Texto", Icono: TextoIcon },
  { id: "girar", etiqueta: "Girar y capa", Icono: GirarIcon },
  { id: "duplicar", etiqueta: "Duplicar y borrar", Icono: DuplicarIcon },
];

/** Los dos saltos con los que termina un encargo, para que el agente lo vea
    como un bloque acabado y no pegado a lo que ya hubiera escrito. */
const SALTOS = String.fromCharCode(10, 10);

/** Las que no tienen nada que enseñar aparte de la propia página. */
const SIN_CONTROLES: Herramienta[] = ["select", "caja"];

export default function EditorWeb({ marco, sello, url, onAlAgente }: Props) {
  const { t } = useT();
  const [herramienta, setHerramienta] = useState<Herramienta>("select");
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [aviso, setAviso] = useState("");
  /** ¿Ha contestado la sonda? Si no, esta página no lleva el plugin. */
  const [haySonda, setHaySonda] = useState<boolean | null>(null);
  const raizRef = useRef("");
  const reloj = useRef(0);

  /* Lo que se enseña abajo a la derecha. Se fuerza a texto A PROPÓSITO: es lo
     único de este componente que se pinta tal cual, y si alguna vez le llegara
     un objeto (un error de Rust, un evento por descuido) React tira la
     interfaz entera con «Objects are not valid as a React child» en vez de
     enseñar un aviso feo. Un aviso feo se ve; una caída, no se perdona. */
  const decir = useCallback((texto: unknown) => {
    setAviso(typeof texto === "string" ? texto : String(texto));
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAviso(""), 4000);
  }, []);

  /* ── Lo que cuenta la sonda ───────────────────────────────────────────── */

  useEffect(() => {
    const oir = async (e: MessageEvent) => {
      const m = deLaSonda(e);
      if (!m) return;

      switch (m.tipo) {
        case "lista":
          raizRef.current = m.raiz || "";
          setHaySonda(true);
          break;

        case "seleccion":
          setElegido(m.elemento);
          break;

        case "escribir":
          try {
            const donde = await escribirEstilo(raizRef.current, m.loc, m.estilos);
            decir(t("Guardado en {f}", { f: donde }));
          } catch (err) {
            decir(String(err));
          }
          break;

        case "escribirTexto":
          try {
            const donde = await escribirTexto(raizRef.current, m.loc, m.valor, m.antes);
            decir(t("Guardado en {f}", { f: donde }));
          } catch (err) {
            decir(String(err));
          }
          break;

        case "caja":
          decir(
            m.elementos.length === 0
              ? t("Ahí dentro no había ningún elemento entero")
              : onAlAgente(parteParaElAgente(m.elementos, url))
                ? t("{n} elementos mandados al agente", { n: m.elementos.length })
                : t("Abre una terminal para poder mandarle esto"),
          );
          break;

        case "alagente":
          decir(
            onAlAgente(parteParaElAgente([m.elemento], url))
              ? t("Elemento mandado al agente")
              : t("Abre una terminal para poder mandarle esto"),
          );
          break;

        case "sinorigen":
          decir(t("Sin marca de origen: se ve el cambio pero no se guarda"));
          break;

        case "duplicar":
        case "borrar":
          // Los dos tocan la ESTRUCTURA del fichero, no un valor suelto, y eso
          // lo hace mucho mejor el agente que un recorte a ciegas: se le manda
          // el encargo en vez de reescribir el JSX desde aquí.
          decir(
            onAlAgente(
              (m.tipo === "duplicar"
                ? "Duplica este elemento justo debajo de sí mismo, tal cual: "
                : "Borra este elemento entero, con sus hijos: ") + m.loc + "\n\n",
            )
              ? t("Se lo he pedido al agente")
              : t("Abre una terminal para poder mandarle esto"),
          );
          break;
      }
    };
    window.addEventListener("message", oir);
    return () => window.removeEventListener("message", oir);
  }, [decir, onAlAgente, t, url]);

  /* ── Presentarse cada vez que la página vuelve a cargar ───────────────── */

  useEffect(() => {
    setElegido(null);
    setHaySonda(null);
    const saludar = () => aLaSonda(marco, { tipo: "hola" });
    saludar();
    // La sonda puede tardar en existir: la página quizá siga cargando.
    const reintento = window.setInterval(saludar, 400);
    // Y si a los tres segundos no ha contestado NADIE, es que esta página no
    // lleva el plugin. Sin este plazo el editor se queda mudo: el aviso de
    // «no lleva el plugin» dependía de un mensaje de la sonda, o sea de la
    // pieza que justamente no está, así que no salía nunca y encender el
    // editor no hacía aparentemente nada.
    const parar = window.setTimeout(() => {
      window.clearInterval(reintento);
      setHaySonda((antes) => (antes === null ? false : antes));
    }, 3200);
    return () => {
      window.clearInterval(reintento);
      window.clearTimeout(parar);
    };
  }, [marco, sello]);

  useEffect(() => {
    aLaSonda(marco, { tipo: "modo", editar: true });
    return () => aLaSonda(marco, { tipo: "modo", editar: false });
  }, [marco, sello]);

  useEffect(() => {
    aLaSonda(marco, { tipo: "herramienta", cual: herramienta });
  }, [marco, herramienta]);

  /* ── Cambiar un valor ─────────────────────────────────────────────────── */

  /** Mientras arrastras el control: se ve, pero no se escribe. */
  const previa = (estilos: Record<string, string>) =>
    aLaSonda(marco, { tipo: "previa", estilos });

  /** Al soltar: se ve Y se guarda. */
  const aplicar = (estilos: Record<string, string>) =>
    aLaSonda(marco, { tipo: "aplicar", estilos });

  const valor = (clave: string) => elegido?.puesto[clave] ?? elegido?.estilo[clave] ?? "";
  const conPanel = elegido && !SIN_CONTROLES.includes(herramienta);

  return (
    <>
      <aside className="editor-web" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ew-lista">
          {HERRAMIENTAS.map(({ id, etiqueta, Icono }) => (
            <button
              key={id}
              className="ew-tool"
              data-on={herramienta === id}
              onClick={() => setHerramienta(id)}
            >
              <Icono size={17} />
              <span>{t(etiqueta)}</span>
            </button>
          ))}
        </div>

        <div className="ew-hueco" />

        <div className="ew-pie">
          <button
            className="ew-enviar"
            disabled={!elegido}
            onClick={() => aLaSonda(marco, { tipo: "alagente" })}
          >
            <EnviarIcon size={17} />
            <span>{t("Mandar al agente")}</span>
          </button>
        </div>

      </aside>

      {conPanel && (
        <div className="ew-panel" onMouseDown={(e) => e.stopPropagation()}>
          <div className="ew-quien">
            <span className="ew-tag">{elegido.etiqueta}</span>
            {elegido.clases && <span className="ew-clases">.{elegido.clases.split(/\s+/)[0]}</span>}
            <span className="ew-medida">
              {Math.round(elegido.caja.ancho)} x {Math.round(elegido.caja.alto)}
            </span>
          </div>

          {herramienta === "mover" && (
            <>
              <Medida nombre={t("Ancho")} clave="width" v={valor("width")} previa={previa} aplicar={aplicar} />
              <Medida nombre={t("Alto")} clave="height" v={valor("height")} previa={previa} aplicar={aplicar} />
            </>
          )}

          {herramienta === "esquinas" && (
            <Medida
              nombre={t("Redondeo")}
              clave="borderRadius"
              v={valor("borderRadius")}
              max={80}
              previa={previa}
              aplicar={aplicar}
            />
          )}

          {herramienta === "espaciado" && (
            <>
              <Medida nombre={t("Relleno")} clave="padding" v={valor("padding")} max={80} previa={previa} aplicar={aplicar} />
              <Medida nombre={t("Margen")} clave="margin" v={valor("margin")} max={80} previa={previa} aplicar={aplicar} />
            </>
          )}

          {herramienta === "recorte" && (
            <>
              <Medida
                nombre={t("Opacidad")}
                clave="opacity"
                v={valor("opacity") || "1"}
                max={1}
                paso={0.05}
                unidad=""
                previa={previa}
                aplicar={aplicar}
              />
              <div className="ew-fila">
                <label>{t("Sombra")}</label>
                <select
                  value={valor("boxShadow") ? "si" : "no"}
                  onChange={(e) =>
                    aplicar({
                      boxShadow: e.target.value === "si" ? "0 8px 24px rgba(0, 0, 0, 0.18)" : "",
                    })
                  }
                >
                  <option value="no">{t("Sin sombra")}</option>
                  <option value="si">{t("Con sombra")}</option>
                </select>
              </div>
            </>
          )}

          {herramienta === "color" && (
            <>
              <Tono nombre={t("Texto")} clave="color" v={valor("color")} previa={previa} aplicar={aplicar} />
              <Tono
                nombre={t("Fondo")}
                clave="backgroundColor"
                v={valor("backgroundColor")}
                previa={previa}
                aplicar={aplicar}
              />
              <button
                className="ew-accion"
                onClick={() =>
                  aplicar({ backgroundImage: "linear-gradient(135deg, #6c63ff, #00c2a8)" })
                }
              >
                {t("Ponerle un degradado")}
              </button>
            </>
          )}

          {herramienta === "texto" && (
            <>
              <Medida nombre={t("Tamaño")} clave="fontSize" v={valor("fontSize")} max={96} previa={previa} aplicar={aplicar} />
              <div className="ew-fila">
                <label>{t("Grosor")}</label>
                <select value={valor("fontWeight") || "400"} onChange={(e) => aplicar({ fontWeight: e.target.value })}>
                  {["300", "400", "500", "600", "700", "800"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ew-fila">
                <label>{t("Alineado")}</label>
                <select value={valor("textAlign") || "left"} onChange={(e) => aplicar({ textAlign: e.target.value })}>
                  <option value="left">{t("Izquierda")}</option>
                  <option value="center">{t("Centro")}</option>
                  <option value="right">{t("Derecha")}</option>
                </select>
              </div>
              <p className="ew-pista">{t("Doble clic sobre el texto para cambiarlo")}</p>
            </>
          )}

          {herramienta === "girar" && (
            <>
              <Medida
                nombre={t("Giro")}
                clave="transform"
                v={elegido.estilo.rotate || "0"}
                max={180}
                min={-180}
                unidad="deg"
                envolver={(v) => `rotate(${v})`}
                previa={previa}
                aplicar={aplicar}
              />
              <Medida
                nombre={t("Capa")}
                clave="zIndex"
                v={valor("zIndex") || "0"}
                max={20}
                unidad=""
                previa={previa}
                aplicar={aplicar}
              />
            </>
          )}

          {herramienta === "duplicar" && (
            <div className="ew-pareja">
              <button className="ew-accion" onClick={() => aLaSonda(marco, { tipo: "duplicar" })}>
                <DuplicarIcon size={15} />
                {t("Duplicar")}
              </button>
              <button className="ew-accion peligro" onClick={() => aLaSonda(marco, { tipo: "borrar" })}>
                <TrashIcon size={15} />
                {t("Borrar")}
              </button>
            </div>
          )}

          {!elegido.loc && (
            <p className="ew-pista alerta">
              {t("Sin marca de origen: se ve el cambio pero no se guarda")}
            </p>
          )}
        </div>
      )}

      {haySonda === false && (
        <div className="ew-sinplugin">
          <p className="ew-sinplugin-tit">{t("Esta página no se puede editar todavía")}</p>
          <p className="ew-sinplugin-txt">
            {t(
              "Le falta el plugin de Adeorq, que es quien marca cada elemento con el trozo de fichero del que salió. Se añade una vez por proyecto.",
            )}
          </p>
          <button
            className="ew-accion"
            onClick={() =>
              onAlAgente(
                "Añade el plugin del editor de Adeorq a este proyecto: en su vite.config, " +
                  'importa `adeorq` desde "C:/proyectos/Adeorq/vite-plugin-adeorq/index.js" ' +
                  "y ponlo el PRIMERO del array de plugins, antes del de React. " +
                  "Es solo para desarrollo y no toca la web publicada." + SALTOS,
              )
                ? decir(t("Se lo he pedido al agente"))
                : decir(t("Abre una terminal para poder mandarle esto"))
            }
          >
            {t("Que lo añada el agente")}
          </button>
        </div>
      )}

      {aviso && <p className="ew-estado">{aviso}</p>}
    </>
  );
}

/* ── Los dos controles que se repiten ────────────────────────────────────── */

function Medida({
  nombre,
  clave,
  v,
  max = 400,
  min = 0,
  paso = 1,
  unidad = "px",
  envolver,
  previa,
  aplicar,
}: {
  nombre: string;
  clave: string;
  v: string;
  max?: number;
  min?: number;
  paso?: number;
  unidad?: string;
  envolver?: (v: string) => string;
  previa: (e: Record<string, string>) => void;
  aplicar: (e: Record<string, string>) => void;
}) {
  const numero = parseFloat(v) || 0;
  const arma = (n: number) => {
    const crudo = `${n}${unidad}`;
    return { [clave]: envolver ? envolver(crudo) : crudo };
  };
  return (
    <div className="ew-fila">
      <label>{nombre}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={numero}
        onChange={(e) => previa(arma(Number(e.target.value)))}
        // Se escribe al SOLTAR, no en cada píxel: arrastrar un deslizador
        // dispara decenas de cambios por segundo y no se va a guardar el
        // fichero cuarenta veces para acabar en el mismo sitio.
        onMouseUp={(e) => aplicar(arma(Number((e.target as HTMLInputElement).value)))}
        onKeyUp={(e) => aplicar(arma(Number((e.target as HTMLInputElement).value)))}
      />
      <span className="ew-num">
        {Math.round(numero * 100) / 100}
        {unidad}
      </span>
    </div>
  );
}

function Tono({
  nombre,
  clave,
  v,
  previa,
  aplicar,
}: {
  nombre: string;
  clave: string;
  v: string;
  previa: (e: Record<string, string>) => void;
  aplicar: (e: Record<string, string>) => void;
}) {
  return (
    <div className="ew-fila">
      <label>{nombre}</label>
      <input
        type="color"
        value={aHex(v)}
        onChange={(e) => previa({ [clave]: e.target.value })}
        onBlur={(e) => aplicar({ [clave]: e.target.value })}
      />
      <span className="ew-num">{aHex(v)}</span>
    </div>
  );
}

/** El selector de color del navegador solo entiende `#rrggbb`, y lo que llega
    de `getComputedStyle` es siempre `rgb(...)`. */
function aHex(v: string): string {
  if (!v) return "#000000";
  if (v.startsWith("#")) return v.length === 7 ? v : "#000000";
  const n = v.match(/rgba?\(([^)]+)\)/);
  if (!n) return "#000000";
  const [r, g, b] = n[1].split(",").map((x) => parseInt(x.trim(), 10));
  const dos = (x: number) => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, "0");
  return `#${dos(r)}${dos(g)}${dos(b)}`;
}
