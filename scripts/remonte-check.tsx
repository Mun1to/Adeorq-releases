// Un componente definido DENTRO de otro se remonta en cada render del padre.
//
//   npx tsc scripts/remonte-check.tsx --module commonjs --target es2022 \
//     --lib es2022,dom --jsx react-jsx --esModuleInterop --skipLibCheck \
//     --moduleResolution node --outDir <tmp>
//   NODE_PATH=<repo>/node_modules node <tmp>/remonte-check.js
//
// ── QUÉ PERSIGUE ────────────────────────────────────────────────────────────
//
// React decide si conserva un nodo del DOM comparando el TIPO del elemento, y
// el tipo de `<Hijo />` es la propia función `Hijo`. Declarada dentro del cuerpo
// del padre, cada render del padre crea una función nueva con otra identidad:
// React ve un tipo distinto, tira el subárbol entero y monta uno nuevo. El
// `<input>` de dentro pasa a ser OTRO nodo del DOM y el foco del teclado se
// queda en el que acaba de desaparecer.
//
// El síntoma que se ve es «escribo una letra y se me sale del campo», y no se
// deduce leyendo el JSX. Aquí se reproduce con React de verdad sobre jsdom.
//
// ── POR QUÉ NO SE ESCRIBE UNA LETRA ─────────────────────────────────────────
//
// El primer intento tecleaba de verdad (setter nativo de `value` + evento
// `input`). Salió que NINGUNA de las dos formas se remontaba, que es imposible,
// y con un `TypeError: activeElement.attachEvent is not a function` de por
// medio: React trae un polyfill de IE para el evento `input` que jsdom dispara
// por error y que aborta el despacho a mitad. O sea que el banco mentía, no el
// código. El re-render se provoca ahora desde fuera, que mide lo mismo (lo que
// remonta es el RENDER del padre, no la tecla) sin pasar por ese polyfill.

import { JSDOM } from "jsdom";
import React, { useState, useEffect, act } from "react";
import { createRoot } from "react-dom/client";

declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

// `defineProperty` y no una asignación: desde Node 22 `navigator` es un global
// de solo lectura, y `globalThis.navigator = ...` revienta con «has only a
// getter» antes de llegar a montar nada.
const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["Element", dom.window.Element],
  ["Node", dom.window.Node],
  ["IS_REACT_ACT_ENVIRONMENT", true],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** Cuántas veces se ha MONTADO el hijo, que es lo que se está midiendo. */
let montajes = 0;
/** El asa para provocar un render del padre desde fuera, como haría una tecla. */
let redibujar: () => void = () => {};

/** La forma MALA: el hijo nace dentro del cuerpo del padre. */
function PadreConHijoDentro() {
  const [n, setN] = useState(0);
  redibujar = () => setN((x) => x + 1);
  function Campo() {
    useEffect(() => {
      montajes++;
    }, []);
    return <input id="campo" readOnly value={String(n)} />;
  }
  return <Campo />;
}

/** La misma pantalla, con el hijo fuera y el dato por props. */
function CampoFuera({ n }: { n: number }) {
  useEffect(() => {
    montajes++;
  }, []);
  return <input id="campo" readOnly value={String(n)} />;
}
function PadreConHijoFuera() {
  const [n, setN] = useState(0);
  redibujar = () => setN((x) => x + 1);
  return <CampoFuera n={n} />;
}

/** Monta, enfoca el campo, provoca UN render del padre y mira qué sobrevivió. */
function trasUnRender(Componente: React.ComponentType) {
  montajes = 0;
  const hueco = dom.window.document.getElementById("raiz")!;
  hueco.innerHTML = "";
  const root = createRoot(hueco);
  act(() => {
    root.render(React.createElement(Componente));
  });

  const antes = dom.window.document.getElementById("campo") as HTMLInputElement;
  antes.focus();
  const arranca = {
    montajes,
    teniaElFoco: dom.window.document.activeElement === antes,
  };

  act(() => redibujar());

  const despues = dom.window.document.getElementById("campo") as HTMLInputElement;
  const salida = {
    ...arranca,
    redibujo: despues?.value === "1",
    montajesTotales: montajes,
    mismoNodo: antes === despues,
    conservaElFoco: dom.window.document.activeElement === despues,
  };
  act(() => root.unmount());
  return salida;
}

const malo = trasUnRender(PadreConHijoDentro);
const bueno = trasUnRender(PadreConHijoFuera);

console.log("\nhijo DENTRO del padre:", JSON.stringify(malo));
console.log("hijo FUERA del padre: ", JSON.stringify(bueno), "\n");

// Sin estas tres, un «no se remonta» podría ser que el banco no hizo nada.
ok("el banco monta y enfoca", malo.teniaElFoco && bueno.teniaElFoco);
ok("el banco monta el hijo una vez", malo.montajes === 1 && bueno.montajes === 1);
ok("y el padre SÍ se redibuja", malo.redibujo && bueno.redibujo, "si no, no se mide nada");

ok(
  "el hijo DENTRO se vuelve a montar",
  malo.montajesTotales === 2,
  `montajes: ${malo.montajesTotales}`,
);
ok("y por eso su input es otro nodo del DOM", !malo.mismoNodo);
ok(
  "y por eso pierde el foco del teclado",
  !malo.conservaElFoco,
  "el sintoma: escribes una letra y te sale del campo",
);

ok(
  "el hijo FUERA no se vuelve a montar",
  bueno.montajesTotales === 1,
  `montajes: ${bueno.montajesTotales}`,
);
ok("conserva el mismo nodo", bueno.mismoNodo);
ok("y conserva el foco, que es lo que se pedia", bueno.conservaElFoco);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
