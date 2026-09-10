// Que una terminal que revienta se vuelva a montar SOLA, y las demás ni se enteren.
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
//   5. y «Reabrir» vuelve a intentarlo.

import { JSDOM } from "jsdom";
import React, { useEffect, useRef, act } from "react";
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
import ResguardoPanel, { BUCLE_MS } from "../src/components/ResguardoPanel";
import { apuntarDiagnostico } from "../src/lib/diagnosticoPanel";

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

/* El panel que revienta: en su efecto de montaje, las veces que se le diga. */
let sustos = 0;
let montajesBomba = 0;
function Bomba() {
  useEffect(() => {
    montajesBomba++;
    if (sustos > 0) {
      sustos--;
      throw new TypeError("Cannot set properties of undefined (setting 'isWrapped')");
    }
  }, []);
  return <input id="bomba" readOnly value="viva" />;
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
      <ResguardoPanel id={7} anotar={anotar} ahora={ahora}>
        <Bomba />
      </ResguardoPanel>
      <ResguardoPanel id={8} anotar={anotar} ahora={ahora}>
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
});
const busca = (id: string) => dom.window.document.getElementById(id);

// Lo que la terminal 7 diría de sí misma al caer.
apuntarDiagnostico(7, () => "77x28 normal baseY=2971 cursorY=27 length=2999");

/* ── 1, 2 y 3: una caída ─────────────────────────────────────────────────── */
sustos = 1;
act(() => {
  root.render(<Mosaico />);
});
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

/* ── 4: dos seguidas ──────────────────────────────────────────────────────── */
reloj += BUCLE_MS / 2; // menos de diez segundos después
sustos = 2;
act(() => {
  root.render(<Mosaico key="segunda" />);
});
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

/* ── 5: Reabrir ───────────────────────────────────────────────────────────── */
sustos = 0;
act(() => {
  (dom.window.document.querySelector(".pane-caido-boton") as HTMLButtonElement).click();
});
ok("«Reabrir» vuelve a montar la terminal", !!busca("bomba") && !dom.window.document.querySelector(".pane-caido"));

/* ── Y una caída LEJOS de la anterior no cuenta como bucle ────────────────── */
reloj += BUCLE_MS * 2;
sustos = 1;
act(() => {
  root.render(<Mosaico key="tercera" />);
});
ok(
  "una caída pasado el plazo se remonta sola otra vez, sin caja",
  !!busca("bomba") && !dom.window.document.querySelector(".pane-caido"),
);

act(() => root.unmount());
console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
