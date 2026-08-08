// Las cuentas de la pantalla de bienvenida. Puras, así que se corren de verdad:
//
//   npx tsc scripts/rachas-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/rachas-check.js

import {
  cifra,
  horaBonita,
  horaPunta,
  hoyLocal,
  mapaDeCalor,
  rachaActual,
  rachaMasLarga,
  type DiaUso,
} from "../src/lib/rachas";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const d = (fecha: string, tokens = 1000): DiaUso => ({ fecha, mensajes: 10, sesiones: 1, tokens });

// --- la racha de ahora --------------------------------------------------------
ok(
  "tres dias seguidos acabando hoy son tres",
  rachaActual(["2026-08-06", "2026-08-07", "2026-08-08"], "2026-08-08") === 3,
);
ok(
  "y si hoy aun no has abierto nada, cuenta desde ayer",
  rachaActual(["2026-08-05", "2026-08-06", "2026-08-07"], "2026-08-08") === 3,
  "a media mañana no se te castiga por madrugar poco",
);
ok(
  "pero dos dias sin tocar nada la rompen",
  rachaActual(["2026-08-04", "2026-08-05", "2026-08-06"], "2026-08-08") === 0,
);
ok(
  "un hueco en medio corta por el hueco",
  rachaActual(["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05"], "2026-08-05") === 2,
);
ok("sin ningun dia, cero", rachaActual([], "2026-08-08") === 0);
ok("un solo dia, hoy, es uno", rachaActual(["2026-08-08"], "2026-08-08") === 1);
ok(
  "el cambio de mes no rompe una racha",
  rachaActual(["2026-07-30", "2026-07-31", "2026-08-01"], "2026-08-01") === 3,
);
ok(
  "ni el 29 de febrero de un bisiesto",
  rachaActual(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01") === 3,
  "2028 es bisiesto: sin el, la racha se partiria en dos",
);
ok(
  "un dia repetido no cuenta dos veces",
  rachaActual(["2026-08-07", "2026-08-07", "2026-08-08"], "2026-08-08") === 2,
);
ok(
  "una fecha con formato raro se ignora en vez de reventar",
  rachaActual(["ayer", "2026-08-08"], "2026-08-08") === 1,
);

// --- la racha mas larga -------------------------------------------------------
ok(
  "encuentra la mejor aunque este en medio",
  rachaMasLarga(["2026-01-01", "2026-02-01", "2026-02-02", "2026-02-03", "2026-03-01"]) === 3,
);
ok("con un solo dia es uno", rachaMasLarga(["2026-08-08"]) === 1);
ok("sin dias es cero", rachaMasLarga([]) === 0);
ok(
  "no depende del orden en que lleguen",
  rachaMasLarga(["2026-02-03", "2026-01-01", "2026-02-01", "2026-02-02"]) === 3,
);

// --- la hora punta ------------------------------------------------------------
{
  const horas = new Array(24).fill(0);
  horas[2] = 17;
  horas[16] = 10;
  ok("la hora con mas turnos", horaPunta(horas) === 2);
}
{
  const horas = new Array(24).fill(0);
  horas[9] = 5;
  horas[21] = 5;
  ok("a igualdad gana la mas temprana, y no la que salga antes del bucle", horaPunta(horas) === 9);
}
ok("sin datos no hay hora punta", horaPunta(new Array(24).fill(0)) === null);
ok(
  "y se escribe como lo diria cualquiera",
  horaBonita(0) === "12 AM" && horaBonita(2) === "2 AM" && horaBonita(12) === "12 PM" &&
    horaBonita(14) === "2 PM" && horaBonita(23) === "11 PM",
);

// --- el mapa de calor ---------------------------------------------------------
{
  const dias = [d("2026-08-08", 5_000_000), d("2026-08-07", 10), d("2026-08-01", 1000)];
  const mapa = mapaDeCalor(dias, "2026-08-08", 2);
  ok("son tantas casillas como semanas por siete", mapa.length === 14);
  ok("la ultima casilla es hoy", mapa[mapa.length - 1].fecha === "2026-08-08");
  ok("el dia mas cargado se lleva el nivel mas alto", mapa[mapa.length - 1].nivel === 4);
  ok("y un dia sin trabajar se queda en cero", mapa[0].nivel === 0);
}
{
  // El caso que justifica los cuartiles: si los cortes fueran fijos, todos
  // estos dias saldrian del mismo color y el mapa no diria nada.
  const dias = [d("2026-08-05", 100), d("2026-08-06", 200), d("2026-08-07", 300), d("2026-08-08", 400)];
  const niveles = mapaDeCalor(dias, "2026-08-08", 1)
    .filter((c) => c.nivel > 0)
    .map((c) => c.nivel);
  ok("cuatro dias distintos dan mas de un nivel", new Set(niveles).size > 1, `salieron ${niveles.join(",")}`);
}
{
  const mapa = mapaDeCalor([{ fecha: "2026-08-08", mensajes: 40, sesiones: 2, tokens: 0 }], "2026-08-08", 1);
  ok(
    "un dia con trabajo pero sin tokens contados no sale en blanco",
    mapa[mapa.length - 1].nivel === 1,
    "el CLI apunta los mensajes antes que los tokens",
  );
}

// --- los numeros grandes ------------------------------------------------------
ok("los millones", cifra(131_000_000) === "131.0M");
ok("los miles", cifra(122_324) === "122k");
ok("y lo pequeño se deja como esta", cifra(174) === "174");

// --- hoy ----------------------------------------------------------------------
ok(
  "hoy sale en el mismo formato que las fechas del CLI",
  /^\d{4}-\d{2}-\d{2}$/.test(hoyLocal(new Date(2026, 7, 8))),
);
ok(
  "y en hora local, no en UTC: a las once de la noche del 8 sigue siendo el 8",
  hoyLocal(new Date(2026, 7, 8, 23, 30)) === "2026-08-08",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
