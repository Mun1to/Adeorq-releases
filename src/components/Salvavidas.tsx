// La red que faltaba: un error de JavaScript ya no deja la app muda.
//
// Munir, 2026-08-26: «se me acaba de crashear Adeorq... se ha quedado todo con
// un fondo sólido con blur. El cual he tenido que hacer Ctrl+Shift+R para
// reiniciar».
//
// Ese síntoma es literalmente lo que se ve cuando React se cae y no hay nadie
// para recogerlo: al lanzar un render sin `ErrorBoundary`, React DESMONTA el
// árbol entero a propósito, así que `#root` se queda vacío y lo único que queda
// en pantalla es el fondo de la página, que en esta casa es una foto con su
// tinte de cristal. La app parece colgada y no lo está: el proceso vive, el
// WebView vive, y recargar la página lo arregla, que es justo por lo que
// Ctrl+Shift+R funcionaba.
//
// Y lo peor no era la pantalla, era el silencio: `rastro.log` no tenía NI UNA
// línea de aquel momento, porque solo escribe Rust y esto pasaba en el front.
// Un fallo que no deja rastro no se puede diagnosticar después, solo esperar a
// que se repita mirando.
//
// Así que esto hace tres cosas, y la tercera es la que de verdad importa:
//
//   1. Recoge el error en vez de dejar el hueco, y enseña qué pasó.
//   2. Da salida: recargar sin tocar un atajo que no todo el mundo sabe.
//   3. Lo ESCRIBE en `rastro.log`, con su mensaje y su pila. La próxima vez la
//      causa estará escrita antes de que nadie pregunte.
//
// Cubre también los dos que no pasan por React: un `window.onerror` suelto y
// una promesa rechazada sin capturar. Esos no rompen el árbol, así que no
// cambian la pantalla; solo se anotan, que es lo que hacía falta.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { anotarRastro } from "../lib/pty";
import { useT } from "../lib/i18n";

/** Un texto corto y útil para el rastro: sin esto solo queda «Error». */
function resumir(e: unknown): string {
  if (e instanceof Error) {
    // La primera línea de la pila basta para saber en qué componente fue, y el
    // comando de Rust recorta a 500 caracteres de todas formas.
    const donde = (e.stack ?? "").split("\n")[1]?.trim() ?? "";
    return `${e.name}: ${e.message}${donde ? ` · ${donde}` : ""}`;
  }
  return String(e);
}

interface Props {
  children: ReactNode;
}

interface Estado {
  error: Error | null;
}

export default class Salvavidas extends Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // El componente que lo lanzó, que es el dato que ahorra la mitad del
    // trabajo: sin él solo se sabe que «algo» falló.
    const pila = (info.componentStack ?? "").split("\n").slice(1, 4).join(" ← ").trim();
    void anotarRastro(`la interfaz se cayó · ${resumir(error)}${pila ? ` · en ${pila}` : ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Caida error={this.state.error} />;
  }
}

/** La pantalla de la caída. Aparte, para poder traducirla con el hook. */
function Caida({ error }: { error: Error }) {
  const { t } = useT();
  return (
    <div className="caida">
      <div className="caida-caja">
        <h1>{t("Adeorq se ha tropezado")}</h1>
        <p>
          {t(
            "La ventana sigue viva y tus terminales también: lo que se ha caído es solo el dibujo de la interfaz. Al recargar vuelven donde estaban.",
          )}
        </p>
        {/* El error, tal cual. No se esconde tras un «ha ocurrido un problema»:
            quien mira esto quiere saber qué pasó, y además ya está anotado en
            el rastro para poder pegarlo. */}
        <pre className="caida-error">{resumir(error)}</pre>
        <p className="caida-pie">
          {t("Queda anotado en el rastro, así que se puede mirar después.")}
        </p>
        <button className="caida-boton" onClick={() => location.reload()} autoFocus>
          {t("Recargar")}
        </button>
      </div>
    </div>
  );
}

/**
 * Los errores que NO pasan por React: un `onerror` suelto y una promesa
 * rechazada que nadie capturó.
 *
 * No tumban el árbol, así que no cambian la pantalla: solo se anotan. Un fallo
 * que no rompe nada pero deja la app rara es peor de diagnosticar que uno que la
 * rompe, porque no hay ni un momento al que señalar.
 *
 * Va FUERA de React, llamado desde `main.tsx`, y no en un `useEffect`: un efecto
 * vive dentro del árbol, así que se desmontaría con él justo cuando la app se
 * cae, que es cuando más falta hace escuchar. Se registra una vez al arrancar y
 * no se quita nunca.
 */
export function vigilarErrores() {
  window.addEventListener("error", (e: ErrorEvent) => {
    void anotarRastro(`error suelto · ${e.message} · ${e.filename}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    void anotarRastro(`promesa sin capturar · ${resumir(e.reason)}`);
  });
}
