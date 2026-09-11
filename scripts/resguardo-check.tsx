// Que una terminal que revienta se vuelva a montar SOLA, con su agente vivo y su
// conversación en pantalla, y las demás ni se enteren.
//
//   npx tsc scripts/resguardo-check.tsx --module commonjs --target es2022 \
//     --lib es2022,dom --jsx react-jsx --esModuleInterop --skipLibCheck \
//     --moduleResolution node --outDir <tmp>
//   NODE_PATH=<repo>/node_modules node <tmp>/scripts/resguardo-check.js
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// El 3 y el 10 de septiembre de 2026 xterm reventó dentro de un panel y el
// Salvavidas de la raíz tiró la interfaz entera: ocho terminales con agentes
// trabajando y la pantalla en blanco. `ResguardoPanel` existe para que eso sea
// «un panel parpadea» y no «la app se cae». Aquí se comprueba con React de
// verdad sobre jsdom, tirando un panel de mentira a propósito:
//
//   1. el panel que revienta se vuelve a montar de cero, una vez;
//   2. el panel de al lado conserva su nodo del DOM, o sea que ni parpadea;
//   3. la caída se anota CON el diagnóstico del búfer, que es lo que faltaba;
//   4. dos caídas seguidas no hacen bucle: se para y se enseña «Reabrir»;
//   5. «Reabrir» vuelve a intentarlo;
//   6. la terminal rota se va MARCADA como mudanza, para que su limpieza no
//      mate al agente (la 0.9.156 no lo hacía y remontar lo mataba), y la marca
//      no se queda puesta cuando la rota no llegó a registrar limpieza;
//   7. la terminal nueva recibe por contexto lo que Rust guardaba del panel;
//   8. y con la caja puesta, cerrar el panel sí mata el proceso, que ya no hay
//      terminal que lo haga.

import { JSDOM } from "jsdom";
import React, { useContext, useEffect, useRef, act } from "react";
import { createRoot } from "react-dom/client";

declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["Element", dom.window.Element],
  ["Node", dom.window.Node],
  ["localStorage", dom.window.localStorage],
  ["IS_REACT_ACT_ENVIRONMENT", true],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

// Después de plantar el DOM, que los módulos de la app miran `window` al cargar.
import ResguardoPanel, { BUCLE_MS, RescateContext } from "../src/components/ResguardoPanel";
import { apuntarDiagnostico } from "../src/lib/diagnosticoPanel";
import { seMuda } from "../src/lib/mudanza";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/* Un reloj de mentira, para no esperar diez segundos de verdad. */
let reloj = 100_000;
const ahora = () => reloj;

/* Lo que llegaría al rastro. */
const anotado: string[] = [];
const anotar = (m: string) => {
  anotado.push(m);
  return Promise.resolve();
};

/* Lo que Rust guardaba del panel, y a quién se mató. */
const historial = (id: number) => Promise.resolve(`lo dicho en el ${id}`);
const matados: number[] = [];
const matar = (id: number) => {
  matados.push(id);
  return Promise.resolve();
};

/* El panel que revienta, como lo haría un `TerminalPane`: al montar registra
   una limpieza que hace lo que hace la de verdad, preguntar `seMuda(id)` y
   matar si no. Revienta en el efecto (tras registrar la limpieza no, porque un
   efecto que lanza no devuelve nada) o en el render, según se le diga. */
let sustos = 0;
let donde: "render" | "efecto" = "efecto";
let montajesBomba = 0;
const limpiezas: boolean[] = [];
function Bomba() {
  const rescate = useContext(RescateContext);
  if (donde === "render" && sustos > 0) {
    sustos--;
    throw new TypeError("Cannot set properties of undefined (setting 'isWrapped')");
  }
  useEffect(() => {
    montajesBomba++;
    if (donde === "efecto" && sustos > 0) {
      sustos--;
      throw new TypeError("Cannot set properties of undefined (setting 'isWrapped')");
    }
    return () => {
      limpiezas.push(seMuda(7));
    };
  }, []);
  return <input id="bomba" readOnly value={rescate || "viva"} />;
}

/* El panel sano de al lado. */
let montajesSano = 0;
function Sano() {
  const n = useRef(0);
  useEffect(() => {
    montajesSano++;
  }, []);
  n.current++;
  return <input id="sano" readOnly value={String(n.current)} />;
}

function Mosaico() {
  return (
    <main>
      <ResguardoPanel id={7} anotar={anotar} ahora={ahora} historial={historial} matar={matar}>
        <Bomba />
      </ResguardoPanel>
      <ResguardoPanel id={8} anotar={anotar} ahora={ahora} historial={historial} matar={matar}>
        <Sano />
      </ResguardoPanel>
    </main>
  );
}

const hueco = dom.window.document.getElementById("raiz")!;
const root = createRoot(hueco, {
  // React 19 imprime por consola cada error atrapado; aquí se atrapan a
  // propósito y el ruido tapa el resultado.
  onCaughtError: () => {},
  onRecoverableError: () => {},
});
const busca = (id: string) => dom.window.document.getElementById(id) as HTMLInputElement | null;
/* El rescate pide el historial y espera: hay que dejar correr las promesas. */
const asentar = () => act(async () => {});

// Lo que la terminal 7 diría de sí misma al caer.
apuntarDiagnostico(7, () => "77x28 normal baseY=2971 cursorY=27 length=2999");

async function main() {
  /* ── 1, 2, 3, 6 y 7: una caída en el efecto de montaje ─────────────────── */
  sustos = 1;
  act(() => {
    root.render(<Mosaico />);
  });
  await asentar();
  const sanoAntes = busca("sano");

  ok("el panel que reventó está de vuelta", !!busca("bomba"), busca("bomba") ? "" : "no hay #bomba");
  ok("y se montó DOS veces: la que reventó y la buena", montajesBomba === 2, `montajes: ${montajesBomba}`);
  ok("el panel de al lado se montó UNA sola vez", montajesSano === 1, `montajes: ${montajesSano}`);
  ok("y conserva su nodo del DOM: ni parpadeó", sanoAntes !== null && busca("sano") === sanoAntes);
  ok("la caída queda anotada una vez", anotado.length === 1, `${anotado.length} apuntes`);
  ok(
    "con el número de terminal, el error y el estado del búfer",
    /terminal 7 se cayó .*isWrapped.*búfer: 77x28 normal baseY=2971/.test(anotado[0] ?? ""),
    anotado[0],
  );
  ok("y sin decir OTRA VEZ, que fue la primera", !/OTRA VEZ/.test(anotado[0] ?? ""));
  ok(
    "la terminal nueva recibe lo que Rust guardaba del panel",
    busca("bomba")?.value === "lo dicho en el 7",
    `valor: ${busca("bomba")?.value}`,
  );
  ok(
    "la rota no llegó a registrar limpieza y la marca de mudanza NO se queda puesta",
    limpiezas.length === 0 && !seMuda(7),
    `limpiezas: ${limpiezas.length}`,
  );
  ok("y nadie mató al agente", matados.length === 0, `matados: ${matados.join(",")}`);

  /* ── 6 bis: una caída con la terminal ya montada (revienta al re-render) ── */
  reloj += BUCLE_MS * 2;
  donde = "render";
  sustos = 1;
  act(() => {
    root.render(<Mosaico key="con-limpieza" />);
  });
  await asentar();
  ok(
    "la terminal rota se fue MARCADA como mudanza: su limpieza no mata al agente",
    limpiezas.length >= 1 && limpiezas[limpiezas.length - 1] === true,
    `limpiezas: ${limpiezas.join(",")}`,
  );
  ok("y tras el remontaje la marca ya no está", !seMuda(7));
  ok("sigue sin morir nadie", matados.length === 0, `matados: ${matados.join(",")}`);
  donde = "efecto";

  /* ── 4: dos seguidas ──────────────────────────────────────────────────── */
  reloj += BUCLE_MS / 2; // menos de diez segundos después
  sustos = 2;
  act(() => {
    root.render(<Mosaico key="segunda" />);
  });
  await asentar();
  ok(
    "dos caídas seguidas paran el bucle: sale la caja de «Reabrir»",
    !!dom.window.document.querySelector(".pane-caido") && !busca("bomba"),
  );
  ok(
    "y el apunte de la segunda dice OTRA VEZ",
    /OTRA VEZ/.test(anotado[anotado.length - 1] ?? ""),
    anotado[anotado.length - 1],
  );
  ok("el de al lado sigue intacto", !!busca("sano"), busca("sano") ? "" : "no hay #sano");
  ok("con la caja puesta el agente sigue vivo", matados.length === 0, `matados: ${matados.join(",")}`);

  /* ── 5: Reabrir ───────────────────────────────────────────────────────── */
  sustos = 0;
  act(() => {
    (dom.window.document.querySelector(".pane-caido-boton") as HTMLButtonElement).click();
  });
  await asentar();
  ok(
    "«Reabrir» vuelve a montar la terminal",
    !!busca("bomba") && !dom.window.document.querySelector(".pane-caido"),
  );
  ok("y con lo dicho hasta entonces", busca("bomba")?.value === "lo dicho en el 7", `valor: ${busca("bomba")?.value}`);

  /* ── Y una caída LEJOS de la anterior no cuenta como bucle ──────────────── */
  reloj += BUCLE_MS * 2;
  sustos = 1;
  act(() => {
    root.render(<Mosaico key="tercera" />);
  });
  await asentar();
  ok(
    "una caída pasado el plazo se remonta sola otra vez, sin caja",
    !!busca("bomba") && !dom.window.document.querySelector(".pane-caido"),
  );

  /* ── 8: cerrar el panel con la caja puesta mata el proceso ──────────────── */
  reloj += BUCLE_MS / 2;
  sustos = 2;
  act(() => {
    root.render(<Mosaico key="cuarta" />);
  });
  await asentar();
  ok("(preparación) la caja está puesta", !!dom.window.document.querySelector(".pane-caido"));
  act(() => root.unmount());
  ok("cerrar el panel con la caja puesta mata el proceso, y solo ese", matados.join(",") === "7", `matados: ${matados.join(",")}`);

  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
