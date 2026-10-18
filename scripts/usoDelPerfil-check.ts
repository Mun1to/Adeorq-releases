// Tu uso dentro del Perfil (`lib/usoDelPerfil.ts`): el día de cada hora, las
// sumas con y sin caché, el porfolio, las casillas del año, el mes y cómo se
// dicen las cifras.
//
// Lo que no puede pasar: que una hora de las 23:00 de Madrid caiga en el día
// de Londres, que la noche del cambio de hora descuadre un día, que el año
// empiece en martes, que dos ids del mismo modelo salgan como dos modelos,
// que «Otros» se coma un proyecto que cabía, o que la raíz del disco, la
// carpeta de proyectos, una carpeta con punto o la memoria de Claude salgan
// como un proyecto.
//
//   pnpm bancos usoDelPerfil

// La zona se fija ANTES de la primera fecha: Node vuelve a leerla al cambiar
// la variable, y así el banco dice lo mismo en cualquier equipo.
process.env.TZ = "Europe/Madrid";

import {
  casillasDelAnio,
  cifra,
  columnaDe,
  conDia,
  cortes,
  diaLocal,
  diaMas,
  entre,
  fechaLarga,
  fueraDeProyecto,
  inicialesSemana,
  mesConTokens,
  mesEnCurso,
  nombreDelMes,
  record,
  nivelDe,
  nombreDeModelo,
  nombreDeProyecto,
  porcentaje,
  porDia,
  porfolio,
  SEMANAS,
  sumar,
  type Cubo,
} from "../src/lib/usoDelPerfil";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const a = JSON.stringify(sale);
  const b = JSON.stringify(esperado);
  const bien = a === b;
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${a}, se esperaba ${b}`}`);
}

const cubo = (hora: string, extra: Partial<Cubo> = {}): Cubo => ({
  hora,
  cli: "claude",
  modelo: "claude-opus-5-5",
  carpeta: "C:\\proyectos\\Adeorq",
  entrada: 10,
  salida: 20,
  cacheLeida: 1000,
  cacheEscrita: 5,
  respuestas: 1,
  ...extra,
});

// --- el día de cada hora --------------------------------------------------------
es("la zona del banco es la de Madrid (si no, lo de abajo no prueba nada)", new Date(Date.UTC(2026, 0, 1, 0)).getHours(), 1);
es("las 21 UTC de agosto son las 23 en Madrid: el mismo día", diaLocal("2026-08-10T21"), "2026-08-10");
es("las 22 UTC de agosto ya son las 00 en Madrid: el día siguiente", diaLocal("2026-08-10T22"), "2026-08-11");
es("en invierno el salto es a las 23 UTC", [diaLocal("2026-01-10T22"), diaLocal("2026-01-10T23")], ["2026-01-10", "2026-01-11"]);
es("la noche del cambio de hora de octubre (día 25): 22 UTC es medianoche del 25", diaLocal("2026-10-24T22"), "2026-10-25");
es("y tras el cambio la medianoche es a las 23 UTC", [diaLocal("2026-10-25T22"), diaLocal("2026-10-25T23")], ["2026-10-25", "2026-10-26"]);
es("la nochevieja cambia de año", diaLocal("2026-12-31T23"), "2027-01-01");
es("una hora mal escrita no tiene día", diaLocal("ayer"), "");

// --- avanzar de día en día --------------------------------------------------------
es("el día siguiente cruza el mes", diaMas("2026-10-31", 1), "2026-11-01");
es("y el año, hacia atrás", diaMas("2026-01-01", -1), "2025-12-31");
es("la noche del cambio de hora no se salta ni repite un día", [diaMas("2026-10-24", 1), diaMas("2026-10-25", 1), diaMas("2026-03-29", 1)], ["2026-10-25", "2026-10-26", "2026-03-30"]);
es("el 29 de febrero de un bisiesto existe", diaMas("2028-02-28", 1), "2028-02-29");
es("el 17 de octubre de 2026 es sábado (columna 5, con el lunes en la 0)", columnaDe("2026-10-17"), 5);
es("y el 12 de octubre, lunes", columnaDe("2026-10-12"), 0);

// --- el mes en curso y los nombres ------------------------------------------------
es("el mes en curso va del día 1 a hoy", mesEnCurso("2026-10-17"), ["2026-10-01", "2026-10-17"]);
es("el día 1, solo ese día", mesEnCurso("2026-11-01"), ["2026-11-01", "2026-11-01"]);
es("el nombre del mes", nombreDelMes(2026, 10), "octubre de 2026");
es("y en inglés", nombreDelMes(2026, 10, "en"), "October 2026");
es("la fecha larga", fechaLarga("2026-10-05"), "5 de octubre de 2026");
es("las iniciales empiezan en lunes", inicialesSemana(), ["L", "M", "X", "J", "V", "S", "D"]);

// --- las sumas --------------------------------------------------------------------
const varios = conDia([
  cubo("2026-10-16T10"),
  cubo("2026-10-16T11", { respuestas: 2 }),
  cubo("2026-10-17T09", { cli: "codex", modelo: "gpt-5.6-terra", carpeta: "C:\\proyectos\\Orquio", cacheLeida: 0 }),
  cubo("2026-10-17T10", { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 }),
]);
es("un cubo sin tokens no cuenta ni como día", varios.length, 3);
const s = sumar(varios);
es("con la caché: entrada + salida + caché leída + caché escrita", s.todos, 1035 * 2 + 35);
es("nuevos: sin la caché leída", s.nuevos, 35 * 3);
es("las respuestas se suman", s.respuestas, 4);
es("los días con uso", s.dias, 2);
es("un tramo con sus dos bordes incluidos", entre(varios, "2026-10-17", "2026-10-17").length, 1);
es("sin bordes, todo", entre(varios, "", "").length, 3);
es("los tokens de cada día", [...porDia(varios)], [["2026-10-16", 2070], ["2026-10-17", 35]]);
es("el récord es el día de más tokens", record(porDia(varios)), { fecha: "2026-10-16", tokens: 2070 });
es("un empate se lo queda el más reciente", record(new Map([["2026-10-01", 5], ["2026-10-09", 5], ["2026-10-03", 2]])), { fecha: "2026-10-09", tokens: 5 });
es("sin uso no hay récord", record(new Map([["2026-10-01", 0]])), null);

// --- el porfolio --------------------------------------------------------------------
es("por proveedor, con el nombre de la tabla de proveedores", porfolio(varios, "proveedor").map((p) => p.nombre), ["Claude Code", "Codex"]);
const porModelo = porfolio(
  [cubo("2026-10-16T10"), cubo("2026-10-16T11", { modelo: "claude-opus-5-5[1m]" }), cubo("2026-10-16T12", { modelo: "claude-sonnet-4-5-20250929" })],
  "modelo",
);
es("el mismo modelo con la marca del millón es el mismo modelo", porModelo.map((p) => [p.nombre, p.tokens]), [["Opus 5.5", 2070], ["Sonnet 4.5", 1035]]);
es("las partes suman uno", Math.round(porModelo.reduce((x, p) => x + p.parte, 0) * 1000), 1000);
const muchos = ["A", "B", "C", "D", "E", "F", "G"].map((n, i) => cubo("2026-10-16T10", { carpeta: `C:\\proyectos\\${n}`, cacheLeida: 1000 * (10 - i) }));
const pf = porfolio(muchos, "proyecto");
es("con siete proyectos: los cuatro primeros y «Otros»", pf.map((p) => (p.otros ? "Otros" : p.nombre)), ["A", "B", "C", "D", "Otros"]);
es("«Otros» lleva lo de los tres que no caben", pf[4].tokens, muchos.slice(4).reduce((x, c) => x + c.entrada + c.salida + c.cacheLeida + c.cacheEscrita, 0));
es("con cinco caben todos, sin «Otros»", porfolio(muchos.slice(0, 5), "proyecto").some((p) => p.otros), false);
es("una respuesta sin carpeta va a su propia fila, sin nombre", porfolio([cubo("2026-10-16T10", { carpeta: undefined })], "proyecto")[0].clave, "");
es("sin nada, nada", porfolio([], "modelo"), []);
const dosFormas = porfolio(
  [cubo("2026-10-16T10", { carpeta: "C:\\proyectos\\adeorq" }), cubo("2026-10-16T11"), cubo("2026-10-16T12")],
  "proyecto",
);
es("en Windows la misma carpeta con otra mayúscula es el mismo proyecto", dosFormas.length, 1);
es("y se dice como la forma que más tokens lleva", dosFormas[0].nombre, "Adeorq");
es("en Linux no se juntan: son dos carpetas", porfolio([cubo("2026-10-16T10", { carpeta: "/home/m/Web" }), cubo("2026-10-16T10", { carpeta: "/home/m/web" })], "proyecto").length, 2);
es("un empate se ordena por nombre", porfolio([cubo("2026-10-16T10", { carpeta: "C:\\proyectos\\Zeta" }), cubo("2026-10-16T10", { carpeta: "C:\\proyectos\\Alfa" })], "proyecto").map((p) => p.nombre), ["Alfa", "Zeta"]);

// --- lo que no es un proyecto (Munir, 2026-10-18: «C:», «memory», «.playwright-mcp» y «proyectos») ---
const RAIZ = "C:\\proyectos";
const noSon = ["C:\\", "C:\\proyectos", "C:\\.playwright-mcp", "C:\\Users\\Muni\\.claude\\projects\\C--\\memory"];
es("sus cuatro no son proyectos", noSon.map((c) => fueraDeProyecto(c, RAIZ)), [true, true, true, true]);
es("la raíz de proyectos con otra mayúscula y su barra tampoco", fueraDeProyecto("c:\\Proyectos\\", RAIZ), true);
es("ni otro disco, ni la raíz de Unix", [fueraDeProyecto("D:", RAIZ), fueraDeProyecto("/", "/home/m/proyectos")], [true, true]);
es(
  "ni la carpeta de Claude Code de una sesión, ni su memoria en Linux",
  [fueraDeProyecto("C:\\Users\\Muni\\.claude\\projects\\C--", RAIZ), fueraDeProyecto("/home/m/.claude/projects/-home-m/memory", "/home/m/proyectos")],
  [true, true],
);
const siSon = ["C:\\proyectos\\Adeorq", "C:\\proyectos\\next.js-demo", "C:\\proyectos\\memory", "D:\\trabajo\\cliente.web", "/home/m/proyectos/Orquio"];
es("un proyecto dentro de la raíz, con un punto en medio o que se llama «memory» sí lo es", siSon.map((c) => fueraDeProyecto(c, RAIZ)), [false, false, false, false, false]);
es("sin carpeta madre (modo «sin carpeta»), la de proyectos no es especial", fueraDeProyecto("C:\\proyectos", ""), false);
es("sin carpeta no entra: tiene su fila, «Sin carpeta»", fueraDeProyecto("", RAIZ), false);
// Lo de su octubre, en pequeño: dos proyectos de verdad y sus cuatro carpetas que no lo son.
const suyo = [
  cubo("2026-10-16T10", { carpeta: "C:\\proyectos\\Adeorq", cacheLeida: 9000 }),
  cubo("2026-10-16T10", { carpeta: "C:\\proyectos", cacheLeida: 4000 }),
  cubo("2026-10-16T10", { carpeta: "C:\\", cacheLeida: 3000 }),
  cubo("2026-10-16T10", { carpeta: "C:\\proyectos\\next.js-demo", cacheLeida: 2000 }),
  cubo("2026-10-16T10", { carpeta: "C:\\.playwright-mcp", cacheLeida: 1000 }),
  cubo("2026-10-16T10", { carpeta: "C:\\Users\\Muni\\.claude\\projects\\C--\\memory", cacheLeida: 500 }),
];
const conRaiz = porfolio(suyo, "proyecto", 10, RAIZ);
es("van a «Otros» aunque quepan, y no ocupan sitio", conRaiz.map((p) => (p.otros ? "Otros" : p.nombre)), ["Adeorq", "next.js-demo", "Otros"]);
es("«Otros» lleva sus cuatro cifras", conRaiz[2].tokens, [4000, 3000, 1000, 500].reduce((x, l) => x + l + 35, 0));
es("y las partes siguen sumando uno", Math.round(conRaiz.reduce((x, p) => x + p.parte, 0) * 1000), 1000);
es("lo de la tarjeta (sin «Otros» ni sin carpeta) es lo mismo sin ese cajón", porfolio(suyo, "proyecto", 1000, RAIZ).filter((p) => p.clave && !p.otros).map((p) => p.nombre), ["Adeorq", "next.js-demo"]);
const llenos = [...muchos, ...suyo.slice(1, 3)];
es(
  "con más proyectos de los que caben, los que no lo son van al mismo «Otros»",
  porfolio(llenos, "proyecto", 5, RAIZ).map((p) => (p.otros ? "Otros" : p.nombre)),
  ["A", "B", "C", "D", "Otros"],
);
es("por proveedor o por modelo no cambia nada", porfolio(suyo, "proveedor", 5, RAIZ).map((p) => p.nombre), ["Claude Code"]);

// --- los nombres --------------------------------------------------------------------
es("claude-opus-5-5 es Opus 5.5", nombreDeModelo("claude-opus-5-5"), "Opus 5.5");
es("claude-opus-5 es Opus 5", nombreDeModelo("claude-opus-5"), "Opus 5");
es("claude-fable-5-1 es Fable 5.1", nombreDeModelo("claude-fable-5-1"), "Fable 5.1");
es("con fecha: claude-haiku-4-5-20251001 es Haiku 4.5", nombreDeModelo("claude-haiku-4-5-20251001"), "Haiku 4.5");
es("con fecha y sin decimal: claude-opus-4-20250514 es Opus 4", nombreDeModelo("claude-opus-4-20250514"), "Opus 4");
es("los de antes: claude-3-5-sonnet-20241022 es Sonnet 3.5", nombreDeModelo("claude-3-5-sonnet-20241022"), "Sonnet 3.5");
es("gpt-5.6-terra es GPT-5.6 Terra", nombreDeModelo("gpt-5.6-terra"), "GPT-5.6 Terra");
es("gpt-6 es GPT-6", nombreDeModelo("gpt-6"), "GPT-6");
es("codex a secas es Codex", nombreDeModelo("codex"), "Codex");
es("uno que no se conoce se dice tal cual", nombreDeModelo("codex-auto-review"), "codex-auto-review");
es("el proyecto es la última carpeta", nombreDeProyecto("C:\\proyectos\\Chain Web SIte"), "Chain Web SIte");
es("con barra al final y en Linux también", [nombreDeProyecto("C:\\proyectos\\Adeorq\\"), nombreDeProyecto("/home/munir/proyectos/Adeorq")], ["Adeorq", "Adeorq"]);

// --- las casillas -------------------------------------------------------------------
es("los cortes son los cuartiles de los días con uso", cortes([0, 0, 1, 2, 3, 4, 5, 6, 7, 8]), [3, 5, 7]);
es("sin ningún día con uso, todo a cero", cortes([0, 0]), [0, 0, 0]);
es("el nivel de cada tramo", [0, 1, 3, 5, 7, 99].map((v) => nivelDe(v, [3, 5, 7])), [0, 1, 2, 3, 4, 4]);
es("un año de un solo día con uso: ese día, en el tono más fuerte", nivelDe(10, cortes([10])), 4);

const hoy = "2026-10-17";
const año = casillasDelAnio(hoy, new Map([["2026-10-17", 900], ["2026-10-05", 100], ["2025-01-01", 5]]));
es("el año empieza en lunes", columnaDe(año[0].fecha), 0);
es("y termina hoy, sin los días que aún no han pasado", año[año.length - 1].fecha, hoy);
es("52 semanas enteras más la de hoy hasta el sábado", año.length, (SEMANAS - 1) * 7 + 6);
es("sin huecos ni repetidos: cada casilla es el día siguiente de la anterior", año.every((c, i) => i === 0 || c.fecha === diaMas(año[i - 1].fecha, 1)), true);
es("lo de fuera del año no se pinta ni cuenta para los cortes", año.some((c) => c.fecha === "2025-01-01"), false);
es("el día de hoy lleva sus tokens y el tono más fuerte", [año[año.length - 1].tokens, año[año.length - 1].nivel], [900, 4]);

// --- el mes ---------------------------------------------------------------------------
const octubre = mesConTokens(2026, 10, new Map([["2026-10-17", 900]]), [100, 200, 300]);
es("octubre de 2026 empieza en jueves: tres casillas vacías delante", octubre.antes, 3);
es("y tiene 31 días", octubre.dias.length, 31);
es("el 17 con sus tokens y su tono, con los cortes del año", [octubre.dias[16].fecha, octubre.dias[16].tokens, octubre.dias[16].nivel], ["2026-10-17", 900, 4]);
es("febrero de 2026 empieza en domingo y tiene 28", [mesConTokens(2026, 2, new Map(), [0, 0, 0]).antes, mesConTokens(2026, 2, new Map(), [0, 0, 0]).dias.length], [6, 28]);

// --- cómo se dicen las cifras -------------------------------------------------------
es("menos de mil, tal cual", cifra(850), "850");
es("miles con K, pegada a la cifra (Munir: «que esté junto»)", cifra(12_400), "12K");
es("casi un millón no es «1000K»", cifra(999_600), "1M");
es("pocos millones, con un decimal y coma", cifra(2_540_000), "2,5M");
es("en inglés el decimal es un punto", cifra(2_540_000, "en"), "2.5M");
es("millones enteros", cifra(141_300_000), "141M");
es("casi diez no es «10,0»", cifra(9_960_000), "10M");
es("casi mil millones no es «1000M»", cifra(999_600_000), "1B");
es("miles de millones con B y un decimal (Munir: «B de billones»)", cifra(9_787_000_000), "9,8B");
es("en inglés, con punto", cifra(9_787_000_000, "en"), "9.8B");
es("dos B justos, sin «,0»", cifra(2_033_000_000), "2B");
es("de diez B en adelante, sin decimal", cifra(38_472_000_000), "38B");
es("y sin separador de miles", cifra(1_234_000_000_000), "1234B");
es("el porcentaje lleva espacio en español", porcentaje(0.634), "63 %");
es("y no en inglés", porcentaje(0.634, "en"), "63%");
es("una parte pequeña no es «0 %»", porcentaje(0.001), "<1 %");
es("casi todo es 100", porcentaje(0.999), "100 %");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
