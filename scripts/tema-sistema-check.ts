// Banco de seguir el claro u oscuro de Windows (`lib/temaSistema.ts`).
//
//   pnpm bancos tema-sistema
//
// Munir, F1 del 2026-11-15: encendido de fábrica en las instalaciones NUEVAS, y
// la suya (y cualquiera de antes) se queda con lo que ya eligió. Una instalación
// de antes se reconoce por tener ya su tema guardado (`THEME_KEY`).
import { THEME_KEY } from "../src/lib/i18n";
import { guardarTemaSistema, leerTemaSistema, TEMA_DE_FABRICA, temaInicial } from "../src/lib/temaSistema";

const almacen = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, String(v)),
  removeItem: (k: string) => void almacen.delete(k),
  clear: () => almacen.clear(),
};


let fallos = 0;
function ok(titulo: string, cond: boolean, visto?: unknown) {
  if (cond) console.log(`ok     ${titulo}`);
  else {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  }
}

// 1. Instalación nueva: nada guardado.
almacen.clear();
let c = leerTemaSistema();
ok("una instalación nueva sigue a Windows de fábrica", c.activo === true, c);
ok("y se guarda en el acto", almacen.has("adeorq-tema-sistema"), [...almacen.keys()]);
almacen.set(THEME_KEY, "azul"); // el primer arranque guarda su tema
c = leerTemaSistema();
ok("en el segundo arranque sigue encendido", c.activo === true, c);

// 2. Instalación de antes: con su tema guardado y sin haber tocado esto.
almacen.clear();
almacen.set(THEME_KEY, "papel");
c = leerTemaSistema();
ok("una de antes se queda apagada, con su tema", c.activo === false && !almacen.has("adeorq-tema-sistema"), c);

// 3. Lo que eligió a mano manda siempre.
almacen.clear();
guardarTemaSistema({ activo: false, oscuro: "azul", claro: "papel" });
c = leerTemaSistema();
ok("si lo apagó él, sigue apagado aunque no tenga tema guardado", c.activo === false, c);

// 4. Contraste, de fábrica desde el 2026-11-16: quien tenía Azul noche pasa UNA vez.
almacen.clear();
let t = temaInicial();
ok("una instalación nueva arranca en Contraste", t === "contraste" && TEMA_DE_FABRICA === "contraste", t);
ok("y sin guardar el tema todavía, para que el sistema la vea nueva", !almacen.has(THEME_KEY), [...almacen.keys()]);
ok("y sigue a Windows con Contraste en oscuro", leerTemaSistema().oscuro === "contraste", leerTemaSistema());

almacen.clear();
almacen.set(THEME_KEY, "azul");
guardarTemaSistema({ activo: true, oscuro: "azul", claro: "papel" });
t = temaInicial();
ok("quien tenía Azul noche pasa a Contraste", t === "contraste" && almacen.get(THEME_KEY) === "contraste", t);
ok("también en el tema del oscuro de Windows", leerTemaSistema().oscuro === "contraste" && leerTemaSistema().activo === true, leerTemaSistema());
almacen.set(THEME_KEY, "azul"); // vuelve a Azul noche en Ajustes
t = temaInicial();
ok("y si vuelve a Azul noche, se queda en Azul noche", t === "azul", t);

almacen.clear();
almacen.set(THEME_KEY, "nord");
t = temaInicial();
ok("quien eligió otro tema se queda con el suyo", t === "nord" && almacen.get(THEME_KEY) === "nord", t);
almacen.set(THEME_KEY, "un-tema-que-ya-no-existe");
ok("un tema que ya no existe arranca en el de fábrica", temaInicial() === "contraste");

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
if (fallos) process.exit(1);
