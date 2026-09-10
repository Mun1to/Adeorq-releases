// Que el vigilante de componentes anidados de verdad vigile.
//   `node scripts/anidado-check-check.mjs`   ·   `pnpm anidado`
//
// Un comprobador que siempre pasa es peor que no tenerlo, porque además
// tranquiliza. Los casos salen de lo real: los ocho de `AgendaView` y los cinco
// de `AccountsView` y `PanelView` del 2026-09-10, y el falso positivo que se
// coló nada más estrenarlo (el comentario que EXPLICA la regla se denunciaba a
// sí mismo, porque escribe `<Seccion />` para contar lo que ya no se hace).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { revisar } from "./anidado-check.mjs";

let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};

/* Un directorio POR CASO: `revisar` barre la carpeta entera, y con todos los
   casos en la misma el archivo de uno contaminaba el resultado del siguiente
   (los seis declaran un `Dentro`). El primer intento de este banco dio tres
   fallos por eso, no por el comprobador. */
const casas = [];
function cazadosEn(nombre, lineas) {
  const casa = fs.mkdtempSync(path.join(os.tmpdir(), "anidado-"));
  casas.push(casa);
  fs.writeFileSync(path.join(casa, nombre), lineas.join("\n"), "utf8");
  return revisar(casa).map((c) => c.nombre);
}

// 1. Lo que hay que cazar: declarado dentro, usado como etiqueta.
ok(
  "caza un componente declarado dentro y usado como etiqueta",
  cazadosEn("malo.tsx", [
    "export default function Vista() {",
    "  const [n, setN] = useState(0);",
    "  return <div>{n > 0 && <Dentro />}</div>;",
    "  function Dentro() {",
    "    return <input />;",
    "  }",
    "}",
  ]).includes("Dentro"),
);

// 2. La salida buena numero 2: se queda dentro, pero se LLAMA.
ok(
  "no señala el que se llama, que es el arreglo",
  !cazadosEn("llamado.tsx", [
    "export default function Vista() {",
    "  return <div>{Dentro()}</div>;",
    "  function Dentro() {",
    "    return <input />;",
    "  }",
    "}",
  ]).includes("Dentro"),
);

// 3. La salida buena numero 1: fuera del padre, como componente normal.
ok(
  "no señala el que vive FUERA, aunque se use como etiqueta",
  !cazadosEn("fuera.tsx", [
    "function Dentro() {",
    "  return <input />;",
    "}",
    "export default function Vista() {",
    "  return <div><Dentro /></div>;",
    "}",
  ]).includes("Dentro"),
);

// 4. El falso positivo del estreno.
ok(
  "un comentario que EXPLICA la regla no se denuncia a si mismo",
  !cazadosEn("comentado.tsx", [
    "export default function Vista() {",
    "  /* Ya no es `<Dentro />` sino `Dentro()`, para que no se remonte. */",
    "  return <div>{Dentro()}</div>;",
    "  function Dentro() {",
    "    return <input />;",
    "  }",
    "}",
  ]).includes("Dentro"),
  "paso al estrenarlo",
);

// 5. Una flecha anidada cuenta igual que una funcion.
ok(
  "caza tambien las flechas",
  cazadosEn("flecha.tsx", [
    "export default function Vista() {",
    "  const Dentro = () => <input />;",
    "  return <div><Dentro /></div>;",
    "}",
  ]).includes("Dentro"),
);

// 6. Un ayudante en minuscula no es un componente y no se toca.
ok(
  "deja en paz a los ayudantes en minuscula",
  cazadosEn("minuscula.tsx", [
    "export default function Vista() {",
    "  function pintar() {",
    "    return <input />;",
    "  }",
    "  return <div>{pintar()}</div>;",
    "}",
  ]).length === 0,
);

for (const c of casas) fs.rmSync(c, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
