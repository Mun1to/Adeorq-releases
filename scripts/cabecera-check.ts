// Qué pestañas salen en la cabecera y en qué orden. Lógica pura, se corre:
//
//   npx tsc scripts/cabecera-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/cabecera-check.js

const armario = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => armario.get(k) ?? null,
  setItem: (k: string, v: string) => void armario.set(k, v),
  removeItem: (k: string) => void armario.delete(k),
  clear: () => armario.clear(),
  key: () => null,
  length: 0,
} as Storage;

import {
  CABECERA_DEFECTO,
  TAB_FIJA,
  alternar,
  esDefecto,
  estaOculta,
  guardarCabecera,
  leerCabecera,
  limpiar,
  mover,
  paraAjustes,
  visibles,
  type Cabecera,
} from "../src/lib/cabecera";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// Las nueve de verdad, en su orden de fábrica.
const TODAS = [
  "panel",
  "cabina",
  "chat",
  "agenda",
  "lienzo",
  "memoria",
  "cuentas",
  "comandos",
  "ajustes",
].map((key) => ({ key }));

const claves = (l: { key: string }[]) => l.map((t) => t.key);
const c = (p: Partial<Cabecera> = {}): Cabecera => ({ ...CABECERA_DEFECTO, ...p });

// --- de fabrica ---------------------------------------------------------------
ok(
  "sin tocar nada salen las nueve en su orden",
  claves(visibles(TODAS, CABECERA_DEFECTO)).join() === claves(TODAS).join(),
);
ok("y eso es el estado de fabrica", esDefecto(CABECERA_DEFECTO));

// --- apagar -------------------------------------------------------------------
ok(
  "una apagada desaparece de la fila",
  claves(visibles(TODAS, c({ ocultas: ["chat"] }))).includes("chat") === false,
);
ok(
  "y las demas no se mueven de sitio por ello",
  claves(visibles(TODAS, c({ ocultas: ["chat"] }))).join() ===
    "panel,cabina,agenda,lienzo,memoria,cuentas,comandos,ajustes",
);
ok(
  "tres apagadas dejan seis",
  visibles(TODAS, c({ ocultas: ["chat", "lienzo", "memoria"] })).length === 6,
);
ok("alternar apaga", estaOculta(alternar(CABECERA_DEFECTO, "chat"), "chat"));
ok(
  "y volver a alternar enciende",
  estaOculta(alternar(alternar(CABECERA_DEFECTO, "chat"), "chat"), "chat") === false,
);

// --- ajustes es la puerta de vuelta -------------------------------------------
ok(
  "AJUSTES no se puede apagar, ni pidiendolo",
  estaOculta(alternar(CABECERA_DEFECTO, TAB_FIJA), TAB_FIJA) === false,
  "es donde se vuelven a encender las demas",
);
ok(
  "ni colandolo en el archivo guardado a mano",
  claves(visibles(TODAS, limpiar({ ocultas: [TAB_FIJA, "chat"] }))).includes(TAB_FIJA),
);
ok(
  "aunque se apaguen TODAS las demas, ajustes sigue",
  claves(
    visibles(
      TODAS,
      c({ ocultas: TODAS.map((t) => t.key) }),
    ),
  ).join() === TAB_FIJA,
);

// --- ordenar ------------------------------------------------------------------
{
  const movida = mover(TODAS, CABECERA_DEFECTO, "cuentas", -1);
  ok(
    "subir una la intercambia con la de arriba",
    claves(visibles(TODAS, movida)).join() ===
      "panel,cabina,chat,agenda,lienzo,cuentas,memoria,comandos,ajustes",
  );
}
{
  const movida = mover(TODAS, CABECERA_DEFECTO, "panel", 1);
  ok(
    "y bajarla, con la de abajo",
    claves(visibles(TODAS, movida)).slice(0, 2).join() === "cabina,panel",
  );
}
ok(
  "la primera no sube y la ultima no baja: se quedan como estan",
  claves(visibles(TODAS, mover(TODAS, CABECERA_DEFECTO, "panel", -1))).join() ===
    claves(TODAS).join() &&
    claves(visibles(TODAS, mover(TODAS, CABECERA_DEFECTO, "ajustes", 1))).join() ===
      claves(TODAS).join(),
);
ok(
  "una que no existe no descoloca nada",
  claves(visibles(TODAS, mover(TODAS, CABECERA_DEFECTO, "inventada", 1))).join() ===
    claves(TODAS).join(),
);
{
  // El caso que justifica guardar la lista ENTERA y no solo la movida: tras el
  // primer empujon, nada se recoloca solo nunca mas.
  const uno = mover(TODAS, CABECERA_DEFECTO, "cuentas", -1);
  ok("el primer empujon congela el orden entero", uno.orden.length === TODAS.length);
}
{
  // Mover cuenta sobre lo que SE VE, no sobre las nueve: con chat apagado,
  // subir agenda tiene que dejarla encima de cabina, no de un hueco.
  const con = c({ ocultas: ["chat"] });
  const movida = mover(TODAS, con, "agenda", -1);
  ok(
    "con una apagada en medio, subir salta por encima de ella",
    claves(visibles(TODAS, movida)).slice(0, 3).join() === "panel,agenda,cabina",
  );
}

// --- una pestaña nueva de una version futura ----------------------------------
{
  const futuras = [...TODAS, { key: "radar" }];
  const guardado = c({ orden: ["cuentas", "panel"] });
  const fila = claves(visibles(futuras, guardado));
  ok(
    "una pestaña que no estaba cuando el ordeno sale igualmente",
    fila.includes("radar"),
    "si no, una version nueva traeria funciones invisibles",
  );
  ok("y lo colocado a mano sigue delante", fila.slice(0, 2).join() === "cuentas,panel");
}

// --- la lista de Ajustes ------------------------------------------------------
{
  const con = c({ ocultas: ["chat", "lienzo"] });
  const lista = claves(paraAjustes(TODAS, con));
  ok("en Ajustes salen las nueve, apagadas incluidas", lista.length === 9);
  ok(
    "y las apagadas van al final, para poder recuperarlas",
    lista.slice(-2).sort().join() === "chat,lienzo",
  );
}

// --- lo que entra de fuera ----------------------------------------------------
ok("un archivo vacio es el de fabrica", esDefecto(limpiar(null)));
ok(
  "un orden con repetidos no duplica una pestaña en la fila",
  limpiar({ orden: ["panel", "panel", "chat"] }).orden.join() === "panel,chat",
);
ok(
  "y la basura que no sea texto se cae sola",
  limpiar({ orden: [1, null, "chat"] as never }).orden.join() === "chat",
);

// --- lo que se guarda ---------------------------------------------------------
{
  guardarCabecera(c({ orden: ["cuentas"], ocultas: ["chat"] }));
  const vuelto = leerCabecera();
  ok(
    "lo guardado vuelve igual tras cerrar la app",
    vuelto.orden.join() === "cuentas" && vuelto.ocultas.join() === "chat",
  );
}
{
  armario.set("adeorq-cabecera", "{roto");
  ok("un JSON roto no deja a Adeorq sin cabecera", esDefecto(leerCabecera()));
  armario.clear();
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
