// Los parones de la ventana, escritos en el rastro con lo que los causó.
//
// Munir, 2026-11-10: «investiga por qué se congela a veces Adeorq». No se pudo
// saber de ESA vez: el rastro estaba limpio, porque un parón no es un fallo y
// nadie lo apuntaba. Ni pánico, ni caída del WebView, ni la gráfica reiniciada,
// ni memoria agotada; solo que a las 17:11 cerró la app y la volvió a abrir.
// Así que desde aquí cada parón deja dicho tres cosas, que son las tres formas
// distintas que tiene la ventana de quedarse quieta:
//
// 1. **Un fotograma de más de un segundo.** Lo cuenta el navegador con los
//    fotogramas largos (`long-animation-frame`): cuánto estuvo la página
//    ocupada de verdad (`blockingDuration`) frente a lo que tardó el fotograma
//    entero, que es lo que separa un código lento de un dibujo que no sale, y
//    QUÉ código corría (quién lo llamó, la función y el archivo). En la app
//    publicada el código va comprimido y la función sale con una o dos letras
//    (`keepNames` guarda el `.name`, pero el navegador no lo usa aquí), así que
//    con un archivo empaquetado se apunta también la posición dentro de él
//    (`index:123456`): esa misma versión, construida con mapa de fuentes, dice
//    la línea.
// 2. **La página libre pero sin fotogramas**: los relojes corren y el dibujo no
//    sale. Esa parada es del proceso de gráficos o de la tarjeta, no del código,
//    y es la que se parece a una pantalla congelada con todo vivo debajo.
// 3. **La página entera sin contestar**: ahí no puede apuntar nada ella misma,
//    así que late cada dos segundos hacia Rust (`vigia_ventana.rs`), y es Rust
//    quien escribe si deja de latir y cuánto tardó en volver.
//
// Lo de 1 y 2 solo se apunta si alguien estaba usando la app en el minuto de
// antes de pararse: con la pantalla apagada los fotogramas también se paran, y
// eso no es un parón de nadie. Usarla es teclear, pulsar o mover la rueda en
// esta página, o tener la ventana delante con el foco en el navegador de un
// panel, que es otro WebView y sus teclas no llegan aquí.

import { invoke } from "@tauri-apps/api/core";
import { anotarRastro } from "./pty";

/** Un fotograma de más de esto ya se nota como parón. */
export const PARON_MS = 1000;
/** Cada cuánto late la página hacia Rust y mira si salen fotogramas. */
export const LATIDO_MS = 2000;
/** Un fotograma pedido que no sale en este tiempo, con la página libre, es que
 *  el dibujo se ha parado. */
export const SIN_FOTOGRAMAS_MS = 3000;
/** Como mucho un apunte de parón cada tanto: un mal rato suele traer varios
 *  seguidos, y el rastro tiene que quedar legible. Los de en medio no se
 *  pierden: se cuentan en el siguiente, o solos al acabar el plazo. Y uno peor
 *  que el último escrito no espera. */
export const ENTRE_APUNTES_MS = 30_000;
/** El arranque no cuenta: montar la app entera es un fotograma largo siempre. */
export const ARRANQUE_MS = 15_000;
/** Con el último toque de teclado o ratón más viejo que esto, nadie lo ve. */
export const ATENDIDA_MS = 60_000;

/** Lo que trae un fotograma largo y aquí hace falta. Escrito a mano: las
 *  definiciones de TypeScript de esta versión todavía no lo traen. */
export interface ScriptLargo {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceFunctionName?: string;
  sourceCharPosition?: number;
  startTime?: number;
  duration: number;
  forcedStyleAndLayoutDuration?: number;
}
export interface FotogramaLargo {
  startTime: number;
  duration: number;
  blockingDuration?: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: ScriptLargo[];
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(n)} ms`);

/** La huella que le pega el empaquetador al nombre (`-AbC1_x-9`, ocho letras). */
const HUELLA = /-[A-Za-z0-9_-]{8}(?=\.[a-z]+$)/;
const ultimoTramo = (url: string) => url.split(/[\\/]/).pop()?.split(/[?#]/)[0] ?? "";

/** El nombre del archivo, sin la dirección ni el número de versión que le
 *  pega el empaquetador: `TerminalPane-AbC123xy.js` se queda en `TerminalPane`. */
export function archivoDe(url = ""): string {
  return ultimoTramo(url).replace(HUELLA, "").replace(/\.[a-z]+$/, "") || "?";
}

/** Una línea con lo que tuvo parada a la página: cuánto, cuánto de eso fue la
 *  página ocupada, qué código (los dos que más tardaron) y cuánto fue de
 *  renderizar. */
export function resumirParon(f: FotogramaLargo): string {
  const fin = f.startTime + f.duration;
  let cabeza = `la ventana se paró ${ms(f.duration)}`;
  if (f.blockingDuration !== undefined) {
    cabeza +=
      f.blockingDuration >= f.duration / 2
        ? `, con la página ocupada ${ms(f.blockingDuration)}`
        : `, con la página ocupada solo ${ms(f.blockingDuration)}: lo demás fue esperar al dibujo (el proceso de gráficos o la tarjeta)`;
  }
  const partes = [cabeza];
  const scripts = [...(f.scripts ?? [])].sort((a, b) => b.duration - a.duration).slice(0, 2);
  for (const s of scripts) {
    const quien = s.invoker || s.invokerType || "?";
    let archivo = "";
    if (s.sourceURL) {
      archivo = archivoDe(s.sourceURL);
      // Empaquetado: la función viene comprimida, y la posición es lo que la encuentra.
      if (HUELLA.test(ultimoTramo(s.sourceURL)) && (s.sourceCharPosition ?? -1) >= 0) archivo += `:${s.sourceCharPosition}`;
    }
    const donde = [s.sourceFunctionName, archivo ? `(${archivo})` : ""].filter(Boolean).join(" ");
    const forzado = (s.forcedStyleAndLayoutDuration ?? 0) >= 50 ? `, ${ms(s.forcedStyleAndLayoutDuration!)} de maqueta forzada` : "";
    partes.push(`${quien}${donde ? ` → ${donde}` : ""} ${ms(s.duration)}${forzado}`);
  }
  if (!scripts.length) partes.push("sin código propio a la vista (del navegador)");
  // Renderizar: desde que empieza (los `requestAnimationFrame`, los
  // ResizeObserver, estilos, maqueta y pintar) hasta el final. Lo de estilos y
  // maqueta va aparte, sin los scripts que corrieron después de empezar (los
  // ResizeObserver), que ya salen arriba con su nombre.
  if (f.renderStart && f.renderStart > f.startTime) {
    const renderizado = fin - f.renderStart;
    if (renderizado >= 50) {
      let txt = `renderizado ${ms(renderizado)}`;
      const sl = f.styleAndLayoutStart;
      if (sl && sl >= f.renderStart) {
        const despues = (f.scripts ?? []).filter((s) => (s.startTime ?? 0) >= sl).reduce((t, s) => t + s.duration, 0);
        const estilos = fin - sl - despues;
        if (estilos >= 50) txt += ` (estilos y maqueta ${ms(estilos)})`;
      }
      partes.push(txt);
    }
  }
  return partes.join(" · ");
}

/**
 * Quién decide si un parón se apunta ya o se guarda para el siguiente apunte.
 * Puro, para su banco (`scripts/parones-check.ts`): el reloj se le pasa.
 */
export class Apuntador {
  private ultimo = -Infinity;
  /** Cuánto duró el último que se escribió: uno peor no se calla. */
  private ultimoEscrito = 0;
  private callados = 0;
  private peorCallado = 0;

  /** Lo que hay que escribir AHORA, o null si toca callar. */
  apuntar(ahora: number, texto: string, duracion: number): string | null {
    if (ahora - this.ultimo < ENTRE_APUNTES_MS && duracion <= this.ultimoEscrito) {
      this.callados++;
      this.peorCallado = Math.max(this.peorCallado, duracion);
      return null;
    }
    const resto = this.callados ? ` · y ${this.callados} ${this.callados > 1 ? "parones" : "parón"} más antes de este, el mayor de ${ms(this.peorCallado)}` : "";
    this.ultimo = ahora;
    this.ultimoEscrito = duracion;
    this.callados = 0;
    this.peorCallado = 0;
    return texto + resto;
  }

  /** Los callados que ya no va a contar ningún apunte: pasado el plazo, o
   *  `ya` (la página se va). null si no hay ninguno o aún no toca. */
  vaciar(ahora: number, ya = false): string | null {
    if (!this.callados || (!ya && ahora - this.ultimo < ENTRE_APUNTES_MS)) return null;
    const linea = `la ventana se paró ${this.callados} ${this.callados > 1 ? "veces" : "vez"} más tras el último apunte, la mayor ${ms(this.peorCallado)}`;
    this.ultimo = ahora;
    this.ultimoEscrito = this.peorCallado;
    this.callados = 0;
    this.peorCallado = 0;
    return linea;
  }
}

/** Qué había en pantalla, para leer el apunte sin adivinar. Las terminales de
 *  una vista escondida siguen en la página: solo cuentan las que se pintan. */
function contexto(): string {
  const terminales = [...document.querySelectorAll(".pane:not(.pane-hidden) .xterm")].filter((e) => e.checkVisibility?.() ?? true).length;
  return `${terminales} terminal${terminales === 1 ? "" : "es"} a la vista`;
}

/** Se llama UNA vez desde `main.tsx`, fuera de React, como `vigilarErrores`. */
export function vigilarParones(): void {
  let ultimaInteraccion = performance.now();
  const tocar = () => {
    ultimaInteraccion = performance.now();
  };
  for (const ev of ["keydown", "pointerdown", "wheel"]) window.addEventListener(ev, tocar, { capture: true, passive: true });
  /** Si la estaban usando en el minuto de antes de `t`. Se mira desde que
   *  EMPEZÓ el parón, no desde que se supo: uno de dos minutos no se pierde
   *  porque el último toque quedara a un minuto y medio al soltarse. */
  const atendidaEn = (t: number) => t - ultimaInteraccion < ATENDIDA_MS;
  const apuntador = new Apuntador();

  // 3. El latido, para que Rust sepa si la página sigue viva. Rust contesta si
  // la ventana está delante: con eso y el foco fuera de esta página, se está
  // usando el navegador de un panel.
  const latir = () =>
    void invoke<boolean>("latido_ventana", { visible: !document.hidden })
      .then((delante) => {
        if (delante && !document.hidden && !document.hasFocus()) tocar();
      })
      .catch(() => {});
  window.setInterval(latir, LATIDO_MS);
  document.addEventListener("visibilitychange", latir);
  latir();

  // 1. Los fotogramas largos, con el código que los hizo.
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries() as unknown as FotogramaLargo[]) {
        if (e.duration < PARON_MS || e.startTime < ARRANQUE_MS || !atendidaEn(e.startTime)) continue;
        const linea = apuntador.apuntar(performance.now(), `${resumirParon(e)} · ${contexto()}`, e.duration);
        if (linea) void anotarRastro(linea);
      }
    }).observe({ type: "long-animation-frame", buffered: false });
  }
  const vaciar = (ya: boolean) => {
    const linea = apuntador.vaciar(performance.now(), ya);
    if (linea) void anotarRastro(linea);
  };
  window.addEventListener("pagehide", () => vaciar(true));

  // 2. Los fotogramas que no salen con la página libre. Se pide uno cada
  // latido: si el reloj vuelve a pasar y sigue sin llegar, el dibujo está
  // parado. Al llegar, se apunta cuánto duró. Cada sonda lleva su número, y la
  // respuesta de una vieja no toca a la nueva.
  let sonda = 0;
  let pedidoDesde = 0;
  let avisado = false;
  const olvidar = () => {
    sonda++;
    pedidoDesde = 0;
    avisado = false;
  };
  let tickAnterior = performance.now();
  window.setInterval(() => {
    vaciar(false);
    const ahora = performance.now();
    // Si el propio reloj llega tarde, la que estaba ocupada era la página (eso
    // lo cuenta el punto 1): el fotograma no salía porque nadie lo dejaba.
    const relojTarde = ahora - tickAnterior > LATIDO_MS + 1000;
    tickAnterior = ahora;
    if (document.hidden) {
      // Escondida no pinta nadie; si ya se dijo que estaba parada, que conste
      // que se fue así, o la línea de «volvió» no llegaría nunca.
      if (avisado) void anotarRastro(`la ventana se escondió con el dibujo todavía parado, tras ${ms(ahora - pedidoDesde)}`);
      olvidar();
      return;
    }
    if (relojTarde && !avisado) {
      olvidar();
      return;
    }
    if (pedidoDesde) {
      if (!avisado && ahora - pedidoDesde >= SIN_FOTOGRAMAS_MS && atendidaEn(pedidoDesde)) {
        avisado = true;
        void anotarRastro(
          `la ventana lleva ${ms(ahora - pedidoDesde)} sin sacar fotogramas con la página libre: la parada es del dibujo (el proceso de gráficos o la tarjeta), no del código · ${contexto()}`,
        );
      }
      return;
    }
    const esta = ++sonda;
    pedidoDesde = ahora;
    requestAnimationFrame(() => {
      if (esta !== sonda) return;
      if (avisado) void anotarRastro(`la ventana volvió a sacar fotogramas tras ${ms(performance.now() - pedidoDesde)}`);
      olvidar();
    });
  }, LATIDO_MS);
}
