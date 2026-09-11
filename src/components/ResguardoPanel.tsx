/* Que una terminal que se cae no se lleve la app entera, NI al agente.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 *
 * El 3 y el 10 de septiembre de 2026 xterm reventó dentro de un `TerminalPane`
 * (`Cannot set properties of undefined (setting 'isWrapped')`, en su
 * `lineFeed`). Lo atrapó el `Salvavidas` de la raíz, que hace lo único que
 * puede hacer: quitar el árbol entero y enseñar «Adeorq se ha tropezado». Ocho
 * terminales con agentes trabajando, y la pantalla en blanco por un panel.
 *
 * Los agentes no se enteran, que viven en Rust. Lo que se pierde es el DIBUJO,
 * y el dibujo de una terminal se rehace: el PTY sigue ahí y `TerminalPane` ya
 * sabe engancharse a uno que existe y volcar su historial (es lo que hace al
 * sacar una terminal a su propia ventana). Así que la respuesta a «se ha caído
 * un panel» es volver a montar ESE panel, no apagar los otros siete.
 *
 * ── LO QUE HACE ──────────────────────────────────────────────────────────────
 *
 * 1. Atrapa el error de sus hijos y lo anota en el rastro, CON el estado del
 *    búfer de esa terminal (`describirPanel`), que es lo que faltaba las dos
 *    veces anteriores para poder buscar la causa.
 * 2. Marca la terminal como «en mudanza» ANTES de que React desmonte la rota,
 *    porque la limpieza de `TerminalPane` mata el proceso de toda terminal que
 *    se va sin esa marca (ver `lib/mudanza.ts`). La primera versión de este
 *    resguardo (0.9.156) no lo hacía, y la frase «el agente sigue vivo» de la
 *    caja no la sostenía el código: remontar mataba al agente y el panel nuevo
 *    nacía vacío. Nunca llegó a pasar en producción; se vio leyendo.
 * 3. Pide a Rust lo ya dicho en ese panel (`pty_historial`) y lo deja en un
 *    contexto para que la terminal nueva lo escriba al nacer, igual que hace
 *    la que renace en su propia ventana.
 * 4. Vuelve a montar los hijos con otra `key`: terminal nueva, mismo PTY, misma
 *    conversación en pantalla.
 * 5. Si vuelve a caer en menos de diez segundos, deja de insistir y enseña una
 *    caja en el sitio del panel con el error y un botón de reabrir. Dos caídas
 *    seguidas es un bucle, y un bucle de remontar no se lo merece nadie. El
 *    proceso sigue vivo detrás de la caja; si el panel se cierra con la caja
 *    puesta, se mata entonces, que ya no hay terminal que lo haga.
 *
 * `anotar`, `ahora` e `historial` se inyectan para que
 * `scripts/resguardo-check.tsx` lo pruebe sin Tauri y sin esperar diez
 * segundos de verdad. */

import {
  Component,
  Fragment,
  createContext,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { anotarRastro, killPty, ptyHistorial } from "../lib/pty";
import { describirPanel } from "../lib/diagnosticoPanel";
import { cancelaMudanza, empiezaMudanza, seMuda } from "../lib/mudanza";
import { useT } from "../lib/i18n";

/** Dos caídas más cerca que esto son un bucle, no dos fallos. */
export const BUCLE_MS = 10_000;

/** Lo ya dicho en el panel que acaba de renacer tras una caída, para que la
    terminal nueva lo escriba antes de escuchar nada. Vacío fuera de un rescate. */
export const RescateContext = createContext<string>("");

interface Props {
  id: number;
  children: ReactNode;
  /** Dónde va el panel en el mosaico: la caja de la caída ocupa su sitio. */
  style?: CSSProperties;
  anotar?: (mensaje: string) => unknown;
  ahora?: () => number;
  /** De dónde sale el historial del panel. En la app, de Rust. */
  historial?: (id: number) => Promise<string>;
  /** Cómo se mata el proceso cuando el panel se cierra con la caja puesta. */
  matar?: (id: number) => Promise<void>;
}

interface Estado {
  /** Cada caída sube esto, y con ello la `key`: hijos nuevos de cero. */
  generacion: number;
  /** Puesto entre que React ve el error y `componentDidCatch` decide. */
  cayendo: boolean;
  /** Dos caídas seguidas: se para y se enseña. */
  caidoDelTodo: Error | null;
  /** Lo que la terminal nueva tiene que escribir al nacer. */
  historial: string;
}

function resumir(e: unknown): string {
  const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}

export default class ResguardoPanel extends Component<Props, Estado> {
  state: Estado = { generacion: 0, cayendo: false, caidoDelTodo: null, historial: "" };
  private ultimaCaida = 0;

  static getDerivedStateFromError(): Partial<Estado> {
    return { cayendo: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { id } = this.props;
    const ahora = (this.props.ahora ?? Date.now)();
    const anotar = this.props.anotar ?? anotarRastro;
    const donde = (info.componentStack ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x && !/^at (div|span|main|section|button|p|pre)\b/.test(x))
      .slice(0, 2)
      .join(" ← ");
    const seguida = ahora - this.ultimaCaida < BUCLE_MS;
    this.ultimaCaida = ahora;
    void anotar(
      `la terminal ${id} se cayó${seguida ? " OTRA VEZ" : ""} · ${resumir(error)} · búfer: ${describirPanel(id)}${donde ? ` · ${donde}` : ""}`,
    );
    if (seguida) {
      this.setState({ cayendo: false, caidoDelTodo: error });
      return;
    }
    void this.rescatar();
  }

  componentDidUpdate(_: Props, antes: Estado) {
    /* La marca de mudanza se puso en el render de la caída (ver `render`). Si
       la terminal rota se cayó a medio montar y no llegó a registrar limpieza,
       nadie la ha gastado y se quedaría puesta: la X del panel dejaría de
       matar. Se retira en el primer commit DESPUÉS de la caída (la terminal
       nueva, o la caja), que llega cuando la limpieza de la rota ya corrió:
       React vacía los efectos pendientes de un commit antes de empezar el
       render siguiente. Medido en `scripts/resguardo-check.tsx`. */
    if (antes.cayendo && !this.state.cayendo) cancelaMudanza(this.props.id);
  }

  componentWillUnmount() {
    /* Con la caja puesta no hay terminal que mate el proceso al cerrar el
       panel: se hace aquí. Salvo que se esté mudando a otra ventana, claro. */
    if (this.state.caidoDelTodo && !seMuda(this.props.id)) {
      void (this.props.matar ?? killPty)(this.props.id).catch(() => {});
    }
  }

  /** Lo ya dicho en el panel, y luego la terminal nueva. */
  private async rescatar() {
    const pedir = this.props.historial ?? ptyHistorial;
    let historial = "";
    try {
      historial = await pedir(this.props.id);
    } catch {
      // Sin historial se remonta igual: una terminal en blanco con el agente
      // vivo es mejor que ninguna.
    }
    this.setState((s) => ({
      cayendo: false,
      caidoDelTodo: null,
      generacion: s.generacion + 1,
      historial,
    }));
  }

  private reabrir = () => {
    // Sin marca: con la caja puesta no hay terminal que desmontar, y el
    // proceso lleva vivo desde la caída.
    this.ultimaCaida = 0;
    void this.rescatar();
  };

  render() {
    if (this.state.caidoDelTodo) {
      return (
        <PanelCaido error={this.state.caidoDelTodo} style={this.props.style} onReabrir={this.reabrir} />
      );
    }
    if (this.state.cayendo) {
      /* Un frame en blanco mientras se decide: es lo que React exige, y no se
         ve. Y la marca de mudanza va AQUÍ, en el render, aunque un render no
         deba tener efectos: es el único sitio que corre seguro ANTES de que
         React desmonte la terminal rota. Su limpieza mata el proceso si no
         encuentra la marca, y `componentDidCatch` llega tarde: la primera
         versión la ponía allí y el banco enseñó la limpieza corriendo antes
         (`limpiezas: false`). Poner la marca dos veces no hace nada. */
      empiezaMudanza(this.props.id);
      return null;
    }
    // Un Fragment y no un div: la terminal se coloca en el mosaico con su
    // propio `style`, y una caja de más la sacaría de la rejilla. La `key` es
    // lo que convierte «volver a renderizar» en «montar de cero»: sin ella
    // React intentaría reutilizar la terminal rota.
    return (
      <RescateContext.Provider value={this.state.historial}>
        <Fragment key={this.state.generacion}>{this.props.children}</Fragment>
      </RescateContext.Provider>
    );
  }
}

/** La caja que ocupa el sitio del panel cuando ya no vale la pena insistir. */
function PanelCaido({
  error,
  style,
  onReabrir,
}: {
  error: Error;
  style?: CSSProperties;
  onReabrir: () => void;
}) {
  const { t } = useT();
  return (
    <div className="pane-caido" style={style}>
      <div className="pane-caido-caja">
        <strong>{t("Esta terminal se ha tropezado dos veces seguidas")}</strong>
        <p>{t("El agente sigue vivo; lo que se ha caído es solo el dibujo de este panel.")}</p>
        <pre className="pane-caido-error">{resumir(error)}</pre>
        <button className="pane-caido-boton" onClick={onReabrir}>
          {t("Reabrir")}
        </button>
      </div>
    </div>
  );
}
