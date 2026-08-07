// El encuadre del fondo. Cuentas puras, así que se comprueban sin abrir la app.
//
//   npx tsc scripts/encuadre-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/encuadre-check.js

// `leerEncuadre` y `guardarEncuadre` hablan con localStorage, que en node no
// existe. Un armario de verdad en cuatro líneas, puesto ANTES del import.
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
  ENCUADRE_DEFECTO,
  ORLA,
  ZOOM_MAX,
  ZOOM_MIN,
  acercar,
  alTope,
  arrastrar,
  esDefecto,
  estiloDe,
  guardarEncuadre,
  leerEncuadre,
  limitar,
  rueda,
  type Encuadre,
} from "../src/lib/encuadre";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const base = (p: Partial<Encuadre> = {}): Encuadre => ({ ...ENCUADRE_DEFECTO, ...p });

/** El número que hay dentro de `scale(...)`. */
function escalaDe(t: string): number {
  return Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? "0");
}
/** El porcentaje horizontal de `translate(...)`. */
function txDe(t: string): number {
  return Number(/translate\((-?[\d.]+)%/.exec(t)?.[1] ?? "0");
}

// --- lo de fábrica no toca nada ----------------------------------------------
{
  const e = estiloDe(ENCUADRE_DEFECTO, 0);
  ok(
    "de fabrica se pinta como se pintaba: rellenar, centrado y sin mover",
    e.objectFit === "cover" && e.objectPosition === "50% 50%" && txDe(e.transform) === 0,
  );
  ok("y sin desenfoque no se agranda nada", escalaDe(e.transform) === 1);
}
ok(
  "con desenfoque vuelve el 6 % que tapaba la orla del borde",
  escalaDe(estiloDe(ENCUADRE_DEFECTO, 12).transform) === (100 + ORLA) / 100,
  "era el scale(1.06) clavado en el CSS",
);
ok(
  "pero NO en «entera»: ahi agrandar seria desobedecer el modo pedido",
  escalaDe(estiloDe(base({ modo: "entera" }), 12).transform) === 1,
);
ok(
  "un zoom del usuario mayor que la orla manda sobre ella",
  escalaDe(estiloDe(base({ zoom: 150 }), 12).transform) === 1.5,
);

// --- los modos ---------------------------------------------------------------
ok("rellenar recorta", estiloDe(base(), 0).objectFit === "cover");
ok("entera cabe toda", estiloDe(base({ modo: "entera" }), 0).objectFit === "contain");

// --- el translate del zoom, que es la unica cuenta ---------------------------
ok(
  "sin zoom no hay translate, aunque el encuadre este en una esquina",
  txDe(estiloDe(base({ x: 0 }), 0).transform) === 0,
  "ahi mueve object-position, que es lo que sobra por el encaje",
);
{
  // Con scale(1.5) la imagen sobresale (1.5-1)/2 = 25 % por cada lado, así que
  // llevar el encuadre al extremo izquierdo pide exactamente +25 %.
  const t = estiloDe(base({ x: 0, zoom: 150 }), 0).transform;
  ok("con zoom 150 y el encuadre a la izquierda, el translate es el 25 %", txDe(t) === 25);
}
ok(
  "y al otro extremo, el mismo numero con el signo cambiado",
  txDe(estiloDe(base({ x: 100, zoom: 150 }), 0).transform) === -25,
);
ok(
  "en el centro no se mueve, tenga el zoom que tenga",
  txDe(estiloDe(base({ x: 50, zoom: 300 }), 0).transform) === 0,
);

// --- arrastrar ---------------------------------------------------------------
{
  const movido = arrastrar(base(), 40, 0, 400, 200);
  ok(
    "arrastrar la foto a la derecha enseña lo que tenia a la izquierda",
    movido.x === 40,
    "se agarra la foto, no la ventana: 50 - 10 = 40",
  );
  ok("y sin tocar el otro eje", movido.y === 50);
}
ok(
  "arrastrar hacia arriba sube la y",
  arrastrar(base(), 0, -20, 400, 200).y === 60,
);
ok(
  "no se puede empujar la foto fuera de sus limites",
  arrastrar(base(), 9999, 9999, 400, 200).x === 0 &&
    arrastrar(base(), -9999, -9999, 400, 200).y === 100,
);
ok(
  "una caja de tamaño cero no divide entre cero ni devuelve NaN",
  arrastrar(base(), 10, 10, 0, 0).x === 50,
);

// --- la rueda ----------------------------------------------------------------
ok("rueda arriba acerca", rueda(base(), -100).zoom === 108);
ok("rueda abajo aleja", rueda(base({ zoom: 150 }), 100).zoom === 142);
ok(
  "el paso es fijo: un raton que manda 240 y un trackpad que manda 3 hacen lo mismo",
  rueda(base(), -240).zoom === rueda(base(), -3).zoom,
);
ok(
  "no se puede alejar por debajo de lo que rellena, ni acercarse sin fin",
  rueda(base(), 999).zoom === ZOOM_MIN && rueda(base({ zoom: ZOOM_MAX }), -999).zoom === ZOOM_MAX,
);

// --- los botones de mas y menos ----------------------------------------------
ok("el boton de acercar sube un paso", acercar(base(), 1).zoom === 108);
ok("el de alejar baja uno", acercar(base({ zoom: 200 }), -1).zoom === 192);
ok(
  "el clic y la rueda mueven LO MISMO, o serian dos velocidades de zoom",
  acercar(base(), 1).zoom === rueda(base(), -100).zoom &&
    acercar(base({ zoom: 200 }), -1).zoom === rueda(base({ zoom: 200 }), 100).zoom,
);
ok(
  "los botones tampoco se salen de los limites",
  acercar(base(), -5).zoom === ZOOM_MIN && acercar(base({ zoom: ZOOM_MAX }), 5).zoom === ZOOM_MAX,
);
ok(
  "abajo del todo se apaga el menos y NO el mas",
  alTope(base({ zoom: ZOOM_MIN }), -1) === true && alTope(base({ zoom: ZOOM_MIN }), 1) === false,
);
ok(
  "arriba del todo, al reves",
  alTope(base({ zoom: ZOOM_MAX }), 1) === true && alTope(base({ zoom: ZOOM_MAX }), -1) === false,
);
ok(
  "y en medio no se apaga ninguno",
  alTope(base({ zoom: 150 }), 1) === false && alTope(base({ zoom: 150 }), -1) === false,
);

// --- lo que entra de fuera ---------------------------------------------------
ok("un encuadre sin nada es el de fabrica", esDefecto(limitar(null)));
ok(
  "un modo inventado cae en rellenar en vez de romper el CSS",
  limitar({ modo: "diagonal" as never }).modo === "rellenar",
);
ok(
  "un NaN guardado por un fallo antiguo no deja la pantalla en blanco",
  limitar({ x: NaN, zoom: NaN }).x === 0 && limitar({ zoom: NaN }).zoom === ZOOM_MIN,
);

// --- lo que se guarda --------------------------------------------------------
{
  guardarEncuadre(base({ modo: "entera", x: 12, y: 88, zoom: 175 }));
  const vuelto = leerEncuadre();
  ok(
    "lo guardado vuelve igual tras cerrar la app",
    vuelto.modo === "entera" && vuelto.x === 12 && vuelto.y === 88 && vuelto.zoom === 175,
  );
}
{
  armario.set("adeorq-fondo-encuadre", "{esto no es json");
  ok("un JSON roto devuelve el de fabrica, no tira la app", esDefecto(leerEncuadre()));
  armario.clear();
  ok("y sin nada guardado, tambien", esDefecto(leerEncuadre()));
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
