// Que el vigilante del error #31 de verdad lo cace.
//   `node scripts/handler-check-check.mjs`   ·   `pnpm handler`
//
// El primer caso es el error #31 tal cual estaba antes de arreglarse: si este
// banco no lo caza, el comprobador no sirve de nada. Los demás son las formas
// CORRECTAS, que tienen que pasar sin ruido, más el falso positivo que dio al
// estrenarlo (cruzaba dos props que solo compartían el nombre y acusaba a
// `RepartoView` de recibir algo que iba a `WebPane`).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { revisar } from "./handler-check.mjs";

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};

const casas = [];
/** Escribe un caso completo (varios archivos) en su propia carpeta y lo revisa. */
function revisarCaso(archivos) {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "handler-"));
  casas.push(casa);
  for (const [nombre, lineas] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(casa, nombre), lineas.join("\n"), "utf8");
  }
  return revisar(casa);
}

// 1. EL CASO REAL, tal como estaba: dos saltos, dos archivos.
const treintaYUno = revisarCaso({
  "PanelDerecho.tsx": [
    "interface Props {",
    "  onWeb?: () => void;",
    "}",
    "export default function PanelDerecho({ onWeb }: Props) {",
    "  return <button className='franja-btn' onClick={onWeb} />;",
    "}",
  ],
  "App.tsx": [
    "export default function App() {",
    "  const abrirWeb = useCallback((url?: string, traer = true) => {",
    "    setPane(url);",
    "  }, []);",
    "  return <PanelDerecho onWeb={abrirWeb} />;",
    "}",
  ],
});
ok(
  "caza el error #31 tal como estaba",
  treintaYUno.length === 1 && treintaYUno[0].porque.includes("abrirWeb"),
  treintaYUno[0]?.porque ?? "no cazo nada",
);

// 2. El arreglo que se le puso: envuelto en una flecha.
ok(
  "no señala el arreglo `onClick={() => onWeb()}`",
  revisarCaso({
    "PanelDerecho.tsx": [
      "interface Props {",
      "  onWeb?: () => void;",
      "}",
      "export default function PanelDerecho({ onWeb }: Props) {",
      "  return <button onClick={() => onWeb()} />;",
      "}",
    ],
    "App.tsx": [
      "export default function App() {",
      "  const abrirWeb = (url?: string) => setPane(url);",
      "  return <PanelDerecho onWeb={abrirWeb} />;",
      "}",
    ],
  }).length === 0,
);

// 3. Pasar la prop a un COMPONENTE no es conectar un evento.
ok(
  "no señala pasar la funcion a un componente",
  revisarCaso({
    "Medio.tsx": [
      "interface Props {",
      "  onWeb?: () => void;",
      "}",
      "export default function Medio({ onWeb }: Props) {",
      "  return <PanelDerecho onWeb={onWeb} />;",
      "}",
    ],
    "App.tsx": [
      "export default function App() {",
      "  const abrirWeb = (url?: string) => setPane(url);",
      "  return <Medio onWeb={abrirWeb} />;",
      "}",
    ],
  }).length === 0,
);

// 4. Un manejador local que SÍ espera el evento es lo correcto.
ok(
  "no señala un manejador que recibe el evento",
  revisarCaso({
    "Uno.tsx": [
      "export default function Uno() {",
      "  const alPulsar = (e: React.MouseEvent) => e.preventDefault();",
      "  return <button onClick={alPulsar} />;",
      "}",
    ],
  }).length === 0,
);

// 5. Un solo salto: la funcion esta en el mismo archivo y pide un dato.
const unSalto = revisarCaso({
  "Uno.tsx": [
    "export default function Uno() {",
    "  const borrar = (id: number) => quitar(id);",
    "  return <button onClick={borrar} />;",
    "}",
  ],
});
ok("caza tambien el de un solo salto", unSalto.length === 1, unSalto[0]?.porque ?? "no cazo nada");

// 6. Una funcion sin parametros es exactamente lo que se pide.
ok(
  "deja en paz a una funcion sin parametros",
  revisarCaso({
    "Uno.tsx": [
      "export default function Uno() {",
      "  const cerrar = () => setAbierto(false);",
      "  return <button onClick={cerrar} />;",
      "}",
    ],
  }).length === 0,
);

// 7. El falso positivo del estreno: dos props que solo comparten el nombre.
ok(
  "no cruza dos props que solo se llaman igual",
  revisarCaso({
    "RepartoView.tsx": [
      "interface Props {",
      "  onClose: () => void;",
      "}",
      "export default function RepartoView({ onClose }: Props) {",
      "  return <button onClick={onClose} />;",
      "}",
    ],
    "WebPane.tsx": [
      "interface Props {",
      "  onClose: (id: number) => void;",
      "}",
      "export default function WebPane({ onClose }: Props) {",
      "  return <div />;",
      "}",
    ],
    "App.tsx": [
      "export default function App() {",
      "  const closePane = (id: number) => quitar(id);",
      "  const cerrarReparto = () => setReparto(false);",
      "  return (",
      "    <div>",
      "      <WebPane onClose={closePane} />",
      "      <RepartoView onClose={cerrarReparto} />",
      "    </div>",
      "  );",
      "}",
    ],
  }).length === 0,
  "dio cinco de estos al estrenarlo",
);

for (const c of casas) fs.rmSync(c, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
