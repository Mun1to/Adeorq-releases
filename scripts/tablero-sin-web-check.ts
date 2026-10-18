// Los paneles web del tablero guardado pasan al navegador de la derecha (`lib/tableroSinWeb.ts`).
//
// Lo que no puede pasar: que al quitar el panel web las columnas renazcan con los altos
// cambiados de panel (se guardan por posición), que una columna se quede vacía, o que las
// pestañas que tenías abiertas se pierdan.
//
//   pnpm bancos tablero-sin-web

import { sinPanelesWeb } from "../src/lib/tableroSinWeb";
import type { SavedLayout } from "../src/lib/tablero";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const a = JSON.stringify(sale);
  const b = JSON.stringify(esperado);
  const bien = a === b;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${a}, se esperaba ${b}`}`);
}

const term = (name: string) => ({ name, cwd: "C:/p" });

// Tres columnas: [A, WEB] con altos 2 y 1, [B] y [WEB2 suelto que no debería existir].
const tablero: SavedLayout = {
  panes: [
    term("A"),
    { name: "localhost", cwd: "C:/p", web: "http://localhost:5173", webTabs: ["http://localhost:5173", "https://github.com"], webActiva: 1 },
    term("B"),
    { name: "otra", cwd: "C:/p", web: "http://localhost:3000" },
    term("C"),
  ],
  cols: [
    { w: 1, hs: [2, 1], idx: [0, 1] },
    { w: 1, hs: [1], idx: [2] },
    { w: 1, hs: [1], idx: [3] },
    { w: 2, hs: [3], idx: [4] },
  ],
};

const r = sinPanelesWeb(tablero);
es("quedan solo las terminales", r.layout.panes.map((p) => p.name), ["A", "B", "C"]);
es("la primera columna conserva A con SU alto", r.layout.cols[0], { w: 1, hs: [2], idx: [0] });
es("B y C se renumeran detrás de lo quitado", r.layout.cols.map((c) => c.idx), [[0], [1], [2]]);
es("la columna que solo tenía web desaparece", r.layout.cols.length, 3);
es("C conserva su ancho y su alto", r.layout.cols[2], { w: 2, hs: [3], idx: [2] });
es("las pestañas del panel web pasan al navegador, con la que se veía", r.pestanas, {
  tabs: ["http://localhost:5173", "https://github.com"],
  activa: 1,
});

const sinPestanas = sinPanelesWeb({ panes: [{ name: "w", cwd: "C:/p", web: "http://localhost:1420" }], cols: [{ w: 1, hs: [1], idx: [0] }] });
es("un panel web de antes de las pestañas trae su única dirección", sinPestanas.pestanas, { tabs: ["http://localhost:1420"], activa: 0 });
es("y el tablero se queda vacío, sin columnas", sinPestanas.layout, { panes: [], cols: [] });

const limpio = { panes: [term("A")], cols: [{ w: 1, hs: [1], idx: [0] }] };
es("un tablero sin web sale tal cual (el mismo objeto)", sinPanelesWeb(limpio).layout === limpio, true);
es("y sin pestañas que pasar", sinPanelesWeb(limpio).pestanas, null);

const activaDeMas = sinPanelesWeb({ panes: [{ name: "w", cwd: "C:/p", web: "a", webTabs: ["a", "b"], webActiva: 7 }], cols: [] });
es("una pestaña activa que ya no existe cae en la última", activaDeMas.pestanas?.activa, 1);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
