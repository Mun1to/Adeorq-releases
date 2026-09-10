/* Que una terminal que se cae no se lleve la app entera.
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
 * 2. Vuelve a montar los hijos con otra `key`: terminal nueva, mismo PTY.
 * 3. Si vuelve a caer en menos de diez segundos, deja de insistir y enseña una
 *    caja en el sitio del panel con el error y un botón de reabrir. Dos caídas
 *    seguidas es un bucle, y un bucle de remontar no se lo merece nadie.
 *
 * `anotar` y `ahora` se inyectan para que `scripts/resguardo-check.tsx` lo
 * pruebe sin Tauri y sin esperar diez segundos de verdad. */

import { Component, Fragment, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { anotarRastro } from "../lib/pty";
import { describirPanel } from "../lib/diagnosticoPanel";
import { useT } from "../lib/i18n";

/** Dos caídas más cerca que esto son un bucle, no dos fallos. */
export const BUCLE_MS = 10_000;

interface Props {
  id: number;
  children: ReactNode;
  /** Dónde va el panel en el mosaico: la caja de la caída ocupa su sitio. */
  style?: CSSProperties;
  anotar?: (mensaje: string) => unknown;
  ahora?: () => number;
}

interface Estado {
  /** Cada caída sube esto, y con ello la `key`: hijos nuevos de cero. */
  generacion: number;
  /** Puesto entre que React ve el error y `componentDidCatch` decide. */
  cayendo: boolean;
  /** Dos caídas seguidas: se para y se enseña. */
  caidoDelTodo: Error | null;
}

function resumir(e: unknown): string {
  const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}

export default class ResguardoPanel extends Component<Props, Estado> {
  state: Estado = { generacion: 0, cayendo: false, caidoDelTodo: null };
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
    this.setState((s) => ({ cayendo: false, generacion: s.generacion + 1 }));
  }

  private reabrir = () => {
    this.ultimaCaida = 0;
    this.setState((s) => ({ cayendo: false, caidoDelTodo: null, generacion: s.generacion + 1 }));
  };

  render() {
    if (this.state.caidoDelTodo) {
      return (
        <PanelCaido error={this.state.caidoDelTodo} style={this.props.style} onReabrir={this.reabrir} />
      );
    }
    // Un frame en blanco mientras se decide: es lo que React exige, y no se ve.
    if (this.state.cayendo) return null;
    // Un Fragment y no un div: la terminal se coloca en el mosaico con su
    // propio `style`, y una caja de más la sacaría de la rejilla. La `key` es
    // lo que convierte «volver a renderizar» en «montar de cero»: sin ella
    // React intentaría reutilizar la terminal rota.
    return <Fragment key={this.state.generacion}>{this.props.children}</Fragment>;
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
