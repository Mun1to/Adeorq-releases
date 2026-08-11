// La rejilla del mes de la Agenda.
//
// Un calendario parece trivial hasta que se escribe: la semana que empieza en
// lunes, los meses que ocupan seis filas, el 31 que no existe en febrero y las
// dos noches al año que no duran veinticuatro horas. Todo eso son casos, no
// opiniones, así que se prueban.
//
//   npx tsc scripts/calendario-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/calendario-check.js

import {
  columnaDelUno,
  comoFecha,
  diasDelMes,
  mesDe,
  mesVecino,
  rejillaDelMes,
} from "../src/lib/calendario";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- fechas como texto -------------------------------------------------------
ok("una fecha se escribe con dos cifras", comoFecha(2026, 8, 5) === "2026-08-05");
ok("y no se recorta el mes", comoFecha(2026, 12, 31) === "2026-12-31");
ok("el mes de una fecha", mesDe("2026-08-11") === "2026-08");

// --- cuantos dias tiene cada mes --------------------------------------------
ok("agosto tiene 31", diasDelMes(2026, 8) === 31);
ok("abril tiene 30", diasDelMes(2026, 4) === 30);
ok("febrero de 2026 tiene 28", diasDelMes(2026, 2) === 28);
ok("febrero de 2028 tiene 29", diasDelMes(2028, 2) === 29, "bisiesto");
ok("febrero de 2100 tiene 28", diasDelMes(2100, 2) === 28, "divisible por 100 pero no por 400");
ok("febrero de 2000 tiene 29", diasDelMes(2000, 2) === 29, "divisible por 400");

// --- la semana empieza en lunes ---------------------------------------------
// El 1 de agosto de 2026 es sabado; contando desde el lunes, es la columna 5.
ok("el 1 de agosto de 2026 cae en sabado", columnaDelUno(2026, 8) === 5);
// El 1 de junio de 2026 es lunes: primera columna.
ok("un mes que empieza en lunes va a la columna 0", columnaDelUno(2026, 6) === 0);
// El 1 de febrero de 2026 es domingo: la ULTIMA columna, no la primera.
ok(
  "un domingo va al final de la semana",
  columnaDelUno(2026, 2) === 6,
  "con la semana del domingo saldria en la columna 0 y el mes entero corrido",
);

// --- la rejilla --------------------------------------------------------------
const agosto = rejillaDelMes(2026, 8);
ok("siempre semanas enteras", agosto.length % 7 === 0);
ok(
  "agosto de 2026 necesita seis filas",
  agosto.length === 42,
  "empieza en sabado y tiene 31 dias: en cinco filas no cabe",
);
ok("los 31 dias del mes estan", agosto.filter((d) => d.delMes).length === 31);
ok("el primero del mes es el 1", agosto.find((d) => d.delMes)!.fecha === "2026-08-01");
ok(
  "los huecos del principio son del mes anterior",
  agosto[0].fecha === "2026-07-27" && !agosto[0].delMes,
  "una casilla vacia se lee como un dia sin nada, y no lo es",
);
ok("y los del final del siguiente", agosto[41].fecha === "2026-09-06" && !agosto[41].delMes);
ok(
  "no hay ni un hueco sin fecha",
  agosto.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)),
);
ok(
  "los dias van en orden y sin saltos",
  agosto.every((d, i) => i === 0 || d.fecha > agosto[i - 1].fecha),
  "aqui es donde se ve si el relleno de los bordes esta mal cosido",
);

const febrero = rejillaDelMes(2026, 2);
ok(
  "febrero de 2026 cabe en cinco filas",
  febrero.length === 35,
  "si la rejilla se fijara a seis, sobraria una semana entera en blanco",
);
ok("y sus 28 dias estan", febrero.filter((d) => d.delMes).length === 28);

// Enero: el borde de año, que es donde se rompen las cuentas con Date.
const enero = rejillaDelMes(2026, 1);
ok(
  "enero se rellena con diciembre del año ANTERIOR",
  enero[0].fecha.startsWith("2025-12"),
  "no con diciembre del mismo año",
);
const diciembre = rejillaDelMes(2026, 12);
ok(
  "diciembre se rellena con enero del SIGUIENTE",
  diciembre[diciembre.length - 1].fecha.startsWith("2027-01"),
);

// --- moverse de mes ----------------------------------------------------------
ok("el mes siguiente", JSON.stringify(mesVecino(2026, 8, 1)) === '{"anio":2026,"mes":9}');
ok("el anterior", JSON.stringify(mesVecino(2026, 8, -1)) === '{"anio":2026,"mes":7}');
ok(
  "de diciembre a enero cambia el año",
  JSON.stringify(mesVecino(2026, 12, 1)) === '{"anio":2027,"mes":1}',
);
ok(
  "de enero a diciembre tambien",
  JSON.stringify(mesVecino(2026, 1, -1)) === '{"anio":2025,"mes":12}',
);
ok(
  "de enero a febrero no se desborda",
  JSON.stringify(mesVecino(2026, 1, 1)) === '{"anio":2026,"mes":2}',
  "sumar un mes a un Date del 31 de enero da el 3 de marzo",
);
ok(
  "un año entero hacia delante",
  JSON.stringify(mesVecino(2026, 8, 12)) === '{"anio":2027,"mes":8}',
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
