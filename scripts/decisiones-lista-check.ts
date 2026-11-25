// La lista única de la pestaña Decisiones (`lib/decisionesLista.ts`).
//
// Lo que no puede pasar: que algo que te toca salga detrás de lo que solo hay
// que mirar, que una terminal salga dos veces por lo mismo, que la pestaña
// cuente ideas o turnos acabados como si te esperaran, que al contestar una
// la vista salte arriba del todo, o que J pase del último al primero.
//
// Y desde el 2026-11-16 (P2 de la A1): H pospone lo marcado, que vuelve a la
// hora que digas o cuando el agente diga algo nuevo (lo que llegue antes), y U
// lo marca como visto o no visto. Lo que no puede pasar: que una pospuesta siga
// contando en la pestaña, que no vuelva a su hora, que no vuelva cuando el
// agente habla, que algo que ya pasó se pueda posponer, que lo visto siga
// visto cuando el agente dice algo nuevo, o que una hora mal escrita se acepte.
//
//   pnpm bancos decisiones-lista

import {
  SIN_REPOSO,
  avisoDormido,
  cuandoVuelve,
  cuantasTeTocan,
  despertar,
  diaDe,
  dormidas,
  idDeAviso,
  idDeNota,
  juntar,
  laAbierta,
  plazos,
  podar,
  posponer,
  proximoDespertar,
  reposoDe,
  siguienteTrasApartar,
  sinVerla,
  vecina,
  verla,
  type Fuentes,
} from "../src/lib/decisionesLista";
import type { Aviso } from "../src/lib/campana";
import type { Decision, Vigencia } from "../src/lib/decisiones";
import type { Programado } from "../src/lib/programados";
import type { Note } from "../src/lib/pty";

let fallos = 0;
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const dec = (id: string, vigencia: Vigencia, creada: number, panel?: number): Decision => ({
  id,
  titulo: id,
  creada,
  panel,
  preguntas: [],
  vigencia,
});
const aviso = (paneId: number, tipo: Aviso["tipo"], cuando: number): Aviso => ({
  n: paneId,
  paneId,
  nombre: `p${paneId}`,
  cwd: "C:\\proyectos\\Adeorq",
  tipo,
  porque: "",
  cuando,
  leido: false,
});
const prog = (id: string, cortado: number | null): Programado =>
  ({ id, nombre: id, cwd: "C:\\x", cortado: cortado == null ? null : { cuando: cortado, motivo: "tres fallos" } }) as unknown as Programado;
const nota = (line: number): Note => ({ line, kind: "idea", project: "Adeorq", text: `nota ${line}` });
const N = (line: number) => idDeNota(nota(line));

const vacio: Fuentes = { decisiones: [], avisos: [], programados: [], notas: [] };
const ids = (f: Partial<Fuentes>) => juntar({ ...vacio, ...f }).map((c) => c.id);

// --- el orden de las partes -----------------------------------------------------
{
  const todo = juntar({
    decisiones: [dec("vieja", "contestada", 50), dec("viva", "viva", 40, 7)],
    avisos: [aviso(2, "hecho", 90), aviso(3, "espera", 10)],
    programados: [prog("noche", 30), prog("sano", null)],
    notas: [nota(1), nota(2)],
  });
  es("primero te toca, luego terminó, ideas y lo que ya pasó", todo.map((c) => c.parte), [
    "toca", "toca", "toca", "termino", "ideas", "ideas", "pasado",
  ]);
  es("en Te toca, la terminal que espera, la decisión y el encargo parado", todo.slice(0, 3).map((c) => c.clase), ["contesta", "decide", "parado"]);
  ok("un «terminó» va detrás aunque sea lo más nuevo", todo[3].id === "aviso:2", todo[3].id);
  es("un encargo sano no sale", todo.filter((c) => c.clase === "parado").map((c) => c.id), ["prog:noche"]);
  es("la pestaña cuenta solo lo que te toca", cuantasTeTocan(todo), 3);
}

// --- dentro de una parte, lo más nuevo arriba --------------------------------------
es(
  "dos decisiones vivas, la más nueva primero",
  ids({ decisiones: [dec("a", "viva", 10), dec("b", "viva", 20)] }),
  ["dec:b", "dec:a"],
);
es("las ideas, la última del archivo arriba", ids({ notas: [nota(3), nota(9), nota(5)] }), [N(9), N(5), N(3)]);
es(
  "lo que ya pasó, por lo último que le pasó",
  ids({
    decisiones: [
      { ...dec("pedida-antes", "contestada", 10), respuesta: { cuando: 100, desde: "el PC", elecciones: {}, entregada: true } },
      dec("pedida-despues", "descartada", 50),
    ],
  }),
  ["dec:pedida-antes", "dec:pedida-despues"],
);
ok("una huérfana o una hablada ya no te toca", cuantasTeTocan(juntar({ ...vacio, decisiones: [dec("h", "huerfana", 1), dec("x", "hablada", 2)] })) === 0);
// Le escribiste a su terminal, pero no tiene por qué haber sido la respuesta: mientras
// esa terminal siga abierta se ve arriba, aparte y sin sumar (Munir, 2026-11-24: «no lo veo»).
{
  const l = juntar({
    ...vacio,
    decisiones: [{ ...dec("abierta", "hablada", 5, 1), se_teclea: true }, { ...dec("cerrada", "hablada", 4, 2), se_teclea: false }],
  });
  es(
    "la hablada de una terminal abierta sale en «Le escribiste después», la de una cerrada ya pasó",
    l.map((c) => `${c.id}@${c.parte}`),
    ["dec:abierta@hablaste", "dec:cerrada@pasado"],
  );
  ok("y no suma en lo que te toca", cuantasTeTocan(l) === 0);
}

// --- una terminal, una fila ------------------------------------------------------
es(
  "el «terminó» de la terminal que dejó una decisión viva no sale",
  ids({ decisiones: [dec("d", "viva", 5, 4)], avisos: [aviso(4, "hecho", 9)] }),
  ["dec:d"],
);
es(
  "pero un «te espera» de esa terminal sí: un permiso necesita su tecla",
  ids({ decisiones: [dec("d", "viva", 5, 4)], avisos: [aviso(4, "espera", 9)] }),
  ["aviso:4", "dec:d"],
);
es(
  "una decisión que ya pasó no esconde el «terminó» de su terminal",
  ids({ decisiones: [dec("d", "contestada", 5, 4)], avisos: [aviso(4, "hecho", 9)] }),
  ["aviso:4", "dec:d"],
);

// --- cuál se abre -----------------------------------------------------------------
{
  const lista = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], notas: [nota(1)], decisiones: [dec("x", "contestada", 1)] });
  ok("con nada que te toque, al entrar no se abre ninguna", laAbierta(lista, null, -1) === undefined);
  const conViva = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], decisiones: [dec("v", "viva", 1)] });
  ok("al entrar, la primera que te toca, no lo que terminó", laAbierta(conViva, null, -1)?.id === "dec:v");
  ok("la que tenías abierta sigue abierta", laAbierta(lista, N(1), 1)?.id === N(1));
  const sinLaIdea = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], decisiones: [dec("x", "contestada", 1)] });
  ok("si se va, la que ocupa su sitio", laAbierta(sinLaIdea, N(1), 1)?.id === "dec:x", laAbierta(sinLaIdea, N(1), 1)?.id);
  ok("si se va la última, la que queda encima", laAbierta(juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)] }), N(1), 1)?.id === "aviso:2");
  ok("con la lista vacía, ninguna", laAbierta([], N(1), 0) === undefined);
}

// --- J y K --------------------------------------------------------------------------
{
  const lista = juntar({ ...vacio, notas: [nota(1), nota(2), nota(3)] });
  ok("J baja", vecina(lista, N(3), 1)?.id === N(2));
  ok("K sube", vecina(lista, N(2), -1)?.id === N(3));
  ok("J en la última se queda en la última", vecina(lista, N(1), 1)?.id === N(1));
  ok("K en la primera se queda en la primera", vecina(lista, N(3), -1)?.id === N(3));
  ok("sin ninguna abierta, J abre la primera", vecina(lista, null, 1)?.id === N(3));
  ok("sin ninguna abierta, K abre la última", vecina(lista, null, -1)?.id === N(1));
  ok("en una lista vacía, nada", vecina([], null, 1) === undefined);
}

// --- un plan de Adeo que cerraste sin contestar ---------------------------------------
{
  const plan = { plan: { resumen: "Abrir dos", acciones: [] }, pedido: "abre dos", espejo: {}, cuando: 30 };
  const todo = juntar({ ...vacio, decisiones: [dec("vieja", "viva", 10), dec("nueva", "viva", 50)], avisos: [aviso(2, "espera", 5)], plan });
  es("va en Te toca, con las decisiones y por su hora", todo.map((c) => c.id), ["aviso:2", "dec:nueva", "plan:30", "dec:vieja"]);
  es("y cuenta para la pestaña", cuantasTeTocan(todo), 4);
  ok("sin plan, nada", !juntar({ ...vacio, plan: null }).length);
  ok("al entrar con solo el plan, se abre él", laAbierta(juntar({ ...vacio, plan }), null, -1)?.clase === "plan");
}

// --- una idea es la misma aunque cambie de renglón ------------------------------------
{
  // Tenías abierta «nota 2» (renglón 2); se quita «nota 1» y el archivo se
  // relee: «nota 2» sube al renglón 1 y «nota 3» al 2. Con el renglón por
  // nombre, la vista se quedaba sobre «nota 3» sin decirlo.
  const antes = juntar({ ...vacio, notas: [nota(1), nota(2), nota(3)] });
  const abierta = antes.find((c) => c.clase === "idea" && c.n.text === "nota 2")!.id;
  const despues = juntar({ ...vacio, notas: [{ ...nota(2), line: 1 }, { ...nota(3), line: 2 }] });
  const sigue = laAbierta(despues, abierta, 1);
  ok("la que tenías abierta sigue siendo la misma nota", sigue?.clase === "idea" && sigue.n.text === "nota 2", sigue?.id);
  const reordenada = juntar({ ...vacio, notas: [{ ...nota(3), line: 0 }, { ...nota(2), line: 7 }] });
  ok("aunque cambie de renglón", reordenada.some((c) => c.id === abierta));
  // Dos notas iguales: dos filas, cada una con su nombre.
  const dobles = juntar({ ...vacio, notas: [nota(4), { ...nota(4), line: 5 }] }).map((c) => c.id);
  ok("dos iguales no comparten nombre", new Set(dobles).size === 2, dobles.join(", "));
}

// --- H: posponer lo marcado ------------------------------------------------------------
const HORA = 3_600_000;
/** Una hora local del 16 de noviembre de 2026 (más `dias`): el banco no depende del huso. */
const reloj = (dias: number, h: number, m = 0) => new Date(2026, 10, 16 + dias, h, m, 0, 0).getTime();
const AHORA = reloj(0, 14, 20);
const base: Fuentes = {
  decisiones: [dec("v", "viva", 40, 7), dec("pasada", "contestada", 5)],
  avisos: [aviso(2, "espera", 10), aviso(3, "hecho", 20)],
  programados: [],
  notas: [nota(1)],
};
const con = (f: Partial<Fuentes>, reposo = SIN_REPOSO, ahora = AHORA) => juntar({ ...base, ...f, reposo, ahora });
const sitio = (lista: ReturnType<typeof juntar>) => lista.map((c) => `${c.id}:${c.parte}`);
{
  const antes = con({});
  const espera = antes.find((c) => c.id === "aviso:2")!;
  es("sin nada pospuesto, el orden de siempre", sitio(antes), ["aviso:2:toca", "dec:v:toca", "aviso:3:termino", N(1) + ":ideas", "dec:pasada:pasado"]);

  const r = posponer(SIN_REPOSO, espera, AHORA + HORA);
  const despues = con({}, r);
  es("lo pospuesto sale de «Te toca» y va a «Pospuesto», antes de lo que ya pasó", sitio(despues), [
    "dec:v:toca", "aviso:3:termino", N(1) + ":ideas", "aviso:2:pospuesto", "dec:pasada:pasado",
  ]);
  ok("y dice cuándo vuelve", despues.find((c) => c.id === "aviso:2")?.hasta === AHORA + HORA);
  es("una pospuesta no cuenta en la pestaña", [cuantasTeTocan(antes), cuantasTeTocan(despues)], [2, 1]);
  ok("al entrar no se abre la pospuesta, sino la primera que te toca", laAbierta(despues, null, -1)?.id === "dec:v");

  es("a su hora vuelve a su sitio", sitio(con({}, r, AHORA + HORA)), sitio(antes));
  es("un minuto antes, sigue dormida", sitio(con({}, r, AHORA + HORA - 60_000)).includes("aviso:2:pospuesto"), true);
  const habla = { avisos: [aviso(2, "espera", 99), aviso(3, "hecho", 20)] };
  es("y antes de su hora, si el agente dice algo nuevo", sitio(con(habla, r, AHORA + 60_000)).slice(0, 2), ["aviso:2:toca", "dec:v:toca"]);
  es("si el agente no dice nada nuevo, sigue dormida", sitio(con({ avisos: [aviso(2, "espera", 10), aviso(3, "hecho", 20)] }, r, AHORA + 60_000)).includes("aviso:2:pospuesto"), true);
  const hecho = { avisos: [aviso(2, "hecho", 99), aviso(3, "hecho", 20)] };
  ok("lo mismo si pasa de preguntar a terminar", con(hecho, r, AHORA + 60_000).find((c) => c.id === "aviso:2")?.parte === "termino");

  const idea = antes.find((c) => c.id === N(1))!;
  const rIdea = posponer(SIN_REPOSO, idea, AHORA + HORA);
  ok("una idea no habla: solo vuelve a su hora", con({}, rIdea, AHORA + 60_000).find((c) => c.id === N(1))?.parte === "pospuesto");
  ok("y a su hora vuelve", con({}, rIdea, AHORA + HORA).find((c) => c.id === N(1))?.parte === "ideas");

  const pasada = antes.find((c) => c.id === "dec:pasada")!;
  ok("lo que ya pasó no se pospone", con({}, posponer(SIN_REPOSO, pasada, AHORA + HORA)).find((c) => c.id === "dec:pasada")?.parte === "pasado");

  const viva = antes.find((c) => c.id === "dec:v")!;
  const dos = posponer(posponer(SIN_REPOSO, viva, AHORA + 3 * HORA), espera, AHORA + HORA);
  es("varias pospuestas, la que vuelve antes arriba", sitio(con({}, dos)).filter((x) => x.endsWith(":pospuesto")), ["aviso:2:pospuesto", "dec:v:pospuesto"]);
  es("sin nada que te toque, la pestaña a cero y no se abre ninguna", [cuantasTeTocan(con({}, dos)), laAbierta(con({}, dos), null, -1)], [0, undefined]);

  ok("despertarla la trae de vuelta", sitio(con({}, despertar(r, "aviso:2"))).join() === sitio(antes).join());
  ok("posponer no toca el reposo de antes", Object.keys(SIN_REPOSO.pospuestas).length === 0 && Object.keys(r.pospuestas).length === 1);
  // La campana y la cara de Adeo no cuentan lo que duerme (`Campana.tsx`).
  es("lo que duerme, por su nombre", [...dormidas(despues)], ["aviso:2"]);
  es("y el nombre de un aviso es el de su fila", [idDeAviso(2), espera.id], ["aviso:2", "aviso:2"]);
  es("sin nada pospuesto, nada duerme", dormidas(antes).size, 0);
  es("cuándo hay que volver a mirar",[proximoDespertar(SIN_REPOSO, AHORA), proximoDespertar(dos, AHORA), proximoDespertar(r, AHORA + HORA)], [undefined, AHORA + HORA, undefined]);
}

// --- U: vista o no vista --------------------------------------------------------------
{
  const antes = con({});
  const espera = antes.find((c) => c.id === "aviso:2")!;
  es("al llegar, todo es nuevo", antes.filter((c) => c.clase !== "pasada").map((c) => c.vista), [false, false, false, false]);
  ok("lo que ya pasó no es ni visto ni nuevo", antes.find((c) => c.clase === "pasada")?.vista === undefined);
  const r = verla(SIN_REPOSO, espera, AHORA);
  es("verla la marca, y solo a ella", con({}, r).filter((c) => c.clase !== "pasada").map((c) => c.vista), [true, false, false, false]);
  ok("si el agente dice algo nuevo, vuelve a ser nueva", con({ avisos: [aviso(2, "espera", 99), aviso(3, "hecho", 20)] }, r).find((c) => c.id === "aviso:2")?.vista === false);
  ok("con lo mismo de antes, sigue vista", con({ avisos: [aviso(2, "espera", 10), aviso(3, "hecho", 20)] }, r).find((c) => c.id === "aviso:2")?.vista === true);
  ok("sinVerla la deja nueva otra vez", con({}, sinVerla(r, "aviso:2")).find((c) => c.id === "aviso:2")?.vista === false);
  ok("verla una idea (que no tiene hora) la deja vista", con({}, verla(SIN_REPOSO, antes.find((c) => c.id === N(1))!, AHORA)).find((c) => c.id === N(1))?.vista === true);
  ok("verla algo que ya pasó no apunta nada", Object.keys(verla(SIN_REPOSO, antes.find((c) => c.clase === "pasada")!, AHORA).vistas).length === 0);
  const dormida = con({}, posponer(SIN_REPOSO, espera, AHORA + HORA)).find((c) => c.id === "aviso:2");
  ok("una pospuesta no es nueva ni vista: está apartada", dormida?.vista === undefined);
  // Para pulsar H estaba abierta, y abrirla la marca vista: tiene que volver sin ver.
  const apartada = posponer(r, espera, AHORA + HORA);
  const deVuelta = (x: typeof r, ahora: number) => con({}, x, ahora).find((c) => c.id === "aviso:2")?.vista;
  ok("a su hora vuelve sin ver, como un correo pospuesto", deVuelta(apartada, AHORA + HORA) === false);
  ok("abrirla mientras duerme no la deja vista para cuando vuelva", deVuelta(verla(apartada, espera, AHORA + 60_000), AHORA + HORA) === false);
  ok("y abrirla ya de vuelta sí", deVuelta(verla(apartada, espera, AHORA + HORA), AHORA + HORA) === true);
  ok("traerla de vuelta tú (H otra vez) no la cambia: la tienes delante", deVuelta(verla(despertar(apartada, "aviso:2"), espera, AHORA + 60_000), AHORA + 60_000) === true);
  ok("sin reposo, la lista no inventa nada", juntar({ ...base }).every((c) => c.vista === undefined && c.hasta === undefined));
}

// --- lo guardado no crece sin fin -------------------------------------------------------
{
  const MES = 30 * 86_400_000;
  const c = juntar({ ...base }).find((x) => x.id === "aviso:2")!;
  const viejo = verla(SIN_REPOSO, c, AHORA - MES - 1);
  ok("lo visto hace más de un mes se olvida", Object.keys(podar(viejo, AHORA).vistas).length === 0);
  ok("lo visto hace poco se guarda", Object.keys(podar(verla(SIN_REPOSO, c, AHORA - 86_400_000), AHORA).vistas).length === 1);
  const caducada = posponer(SIN_REPOSO, c, AHORA - 2 * 86_400_000);
  ok("una pospuesta que volvió hace más de un día se olvida", Object.keys(podar(caducada, AHORA).pospuestas).length === 0);
  ok("una que vuelve mañana se guarda", Object.keys(podar(posponer(SIN_REPOSO, c, AHORA + 86_400_000), AHORA).pospuestas).length === 1);
  // El mes cuenta desde la última vez que la miraste, no desde la primera.
  const otraVez = verla(verla(SIN_REPOSO, c, AHORA - 29 * 86_400_000), c, AHORA);
  ok("mirarla otra vez pone al día cuándo la miraste", otraVez.vistas[c.id]?.en === AHORA, JSON.stringify(otraVez.vistas));
  ok("y no se olvida a los treinta días de la primera vez", Object.keys(podar(otraVez, AHORA + 2 * 86_400_000).vistas).length === 1);
}

// --- lo guardado, leído: una entrada rota se tira y no tumba la app ------------------------
{
  // Con `{"pospuestas":{"x":null}}` en localStorage, `proximoDespertar` lanzaba al
  // cargar `lib/decisiones.ts`, antes de montar nada: la app, en blanco.
  const sinPospuesta = reposoDe({ vistas: {}, pospuestas: { x: null } });
  es("una pospuesta vacía se tira", sinPospuesta, SIN_REPOSO);
  let lanza = "";
  try {
    proximoDespertar(sinPospuesta, AHORA);
    podar(reposoDe({ vistas: { x: null, y: { cuando: 1, en: AHORA } }, pospuestas: {} }), AHORA);
  } catch (e) {
    lanza = String(e);
  }
  ok("y ni el reloj ni la poda lanzan con lo que queda", lanza === "", lanza);
  es("una vista vacía se tira y la buena se queda", reposoDe({ vistas: { x: null, y: { cuando: 1, en: 2 } }, pospuestas: {} }).vistas, { y: { cuando: 1, en: 2 } });
  es("un número escrito como texto tampoco vale", reposoDe({ vistas: { a: { cuando: "1", en: 2 } }, pospuestas: { b: { hasta: 5 } } }), SIN_REPOSO);
  es("lo que no es un objeto, nada", [null, [], "x", 5, { vistas: [], pospuestas: "y" }].map(reposoDe), Array(5).fill(SIN_REPOSO));
  const bueno = posponer(verla(SIN_REPOSO, { id: "a", cuando: 3 }, AHORA), { id: "b", cuando: 4 }, AHORA + HORA);
  es("lo bueno pasa entero", reposoDe(JSON.parse(JSON.stringify(bueno))), bueno);
  // Fuera del rango de una fecha, pintar «Vuelve a las…» lanzaba (`RangeError`) y tumbaba la pestaña.
  es("un número fuera de las fechas posibles se tira", reposoDe({ vistas: { a: { cuando: 1, en: 1e17 } }, pospuestas: { b: { hasta: 1e17, desde: 9e15 } } }), SIN_REPOSO);
}

// --- a qué hora, con una tecla o escrita -------------------------------------------------
{
  const p = plazos(AHORA);
  es("cuatro plazos con su tecla", p.map((x) => x.tecla), ["1", "2", "3", "4"]);
  ok("cada uno más tarde que el anterior, ninguno repetido", p.every((x, i) => x.hasta > (i ? p[i - 1].hasta : AHORA)));
  es("en una hora y en tres", [p[0].hasta - AHORA, p[1].hasta - AHORA], [HORA, 3 * HORA]);
  ok("mañana a las 9", new Date(p[2].hasta).getDate() === 17 && new Date(p[2].hasta).getHours() === 9 && new Date(p[2].hasta).getMinutes() === 0);
  ok("dentro de una semana, a las 9", new Date(p[3].hasta).getDate() === 23 && new Date(p[3].hasta).getHours() === 9);
  ok("de madrugada, «mañana» sigue siendo mañana", new Date(plazos(reloj(0, 3, 0))[2].hasta).getDate() === 17);

  const hh = (dias: number, h: number, m = 0) => reloj(dias, h, m);
  es("«16:30» es hoy a las 16:30", cuandoVuelve("16:30", AHORA), hh(0, 16, 30));
  es("«16.30», «16h30» y «a las 16:30» igual", [cuandoVuelve("16.30", AHORA), cuandoVuelve("16h30", AHORA), cuandoVuelve("a las 16:30", AHORA)], [hh(0, 16, 30), hh(0, 16, 30), hh(0, 16, 30)]);
  es("«9» ya pasó hoy: mañana a las 9", cuandoVuelve("9", AHORA), hh(1, 9));
  es("«14:20» es ahora mismo: mañana", cuandoVuelve("14:20", AHORA), hh(1, 14, 20));
  es("con espacios y mayúsculas", cuandoVuelve("  A las 16:30 ", AHORA), hh(0, 16, 30));
  es("«+45» son minutos", cuandoVuelve("+45", AHORA), AHORA + 45 * 60_000);
  es("«+2h» son horas", cuandoVuelve("+2h", AHORA), AHORA + 2 * HORA);
  es("«en 30 min» y «en 2 horas»", [cuandoVuelve("en 30 min", AHORA), cuandoVuelve("en 2 horas", AHORA)], [AHORA + 30 * 60_000, AHORA + 2 * HORA]);
  es("lo que no es una hora, no es nada", ["", "mañana", "esto no", "25:00", "16:75", "+0", "+99999", "en 0 min", "16:3"].map((x) => cuandoVuelve(x, AHORA)), Array(9).fill(null));
  // En inglés, lo que enseñan la caja y la guía («in 2 h») y como se escribe allí una hora.
  es("«in 2 h», «in 30 min», «in 2 hours» e «in 45 minutes»", ["in 2 h", "in 30 min", "in 2 hours", "in 45 minutes"].map((x) => cuandoVuelve(x, AHORA)), [
    AHORA + 2 * HORA, AHORA + 30 * 60_000, AHORA + 2 * HORA, AHORA + 45 * 60_000,
  ]);
  es("«at 9» ya pasó hoy: mañana a las 9; «at 16:30», hoy", [cuandoVuelve("at 9", AHORA), cuandoVuelve("at 16:30", AHORA)], [hh(1, 9), hh(0, 16, 30)]);
  es("«4pm», «4 pm», «4:30pm» y «at 4 PM»", ["4pm", "4 pm", "4:30pm", "at 4 PM"].map((x) => cuandoVuelve(x, AHORA)), [hh(0, 16), hh(0, 16), hh(0, 16, 30), hh(0, 16)]);
  es("«9am» y «9 a.m.», mañana; «12am» es medianoche y «12pm» mediodía", ["9am", "9 a.m.", "12am", "12pm"].map((x) => cuandoVuelve(x, AHORA)), [hh(1, 9), hh(1, 9), hh(1, 0), hh(1, 12)]);
  es("con am o pm, de 1 a 12", ["13pm", "0am", "in 0 min"].map((x) => cuandoVuelve(x, AHORA)), [null, null, null]);
  // Un número con su unidad y nada más es lo que falta: «2 h» no son las dos de la
  // madrugada. La hora del reloj lleva sus minutos o «a las».
  es("«2 h», «2h», «1 h», «3 horas» y «2 hours» son horas que faltan", ["2 h", "2h", "1 h", "3 horas", "2 hours"].map((x) => cuandoVuelve(x, AHORA)), [
    AHORA + 2 * HORA, AHORA + 2 * HORA, AHORA + HORA, AHORA + 3 * HORA, AHORA + 2 * HORA,
  ]);
  es("«30 min», «45 minutos» y «20m» son minutos que faltan", ["30 min", "45 minutos", "20m"].map((x) => cuandoVuelve(x, AHORA)), [AHORA + 30 * 60_000, AHORA + 45 * 60_000, AHORA + 20 * 60_000]);
  // Revisión aparte: «16h» se escribe en España como la hora del reloj, y de 13 a 23 no
  // hay duda (nadie pospone dieciséis horas escribiendo «16h»). Por debajo, lo que falta.
  es("«16h» y «23h» sueltos son la hora del reloj; «9h», lo que falta", ["16h", "23h", "9h"].map((x) => cuandoVuelve(x, AHORA)), [hh(0, 16), hh(0, 23), AHORA + 9 * HORA]);
  es("«+1h30» y «en 1h30» son hora y media", ["+1h30", "en 1h30", "in 1h30"].map((x) => cuandoVuelve(x, AHORA)), Array(3).fill(AHORA + 90 * 60_000));
  es("«a la 1» y «a la 1:30», mañana", ["a la 1", "a la 1:30"].map((x) => cuandoVuelve(x, AHORA)), [hh(1, 1), hh(1, 1, 30)]);
  es("«4 p. m.» y «9 a. m.», como se escribe en español", ["4 p. m.", "9 a. m."].map((x) => cuandoVuelve(x, AHORA)), [hh(0, 16), hh(1, 9)]);
  es("pero «a las 16h», «16h30» y «16» son la hora del reloj", ["a las 16h", "16h30", "16"].map((x) => cuandoVuelve(x, AHORA)), [hh(0, 16), hh(0, 16, 30), hh(0, 16)]);

  es("hoy, mañana u otro día", [diaDe(AHORA + HORA, AHORA), diaDe(reloj(1, 9), AHORA), diaDe(reloj(3, 9), AHORA), diaDe(reloj(0, 23, 59), reloj(0, 0, 1))], ["hoy", "manana", "otro", "hoy"]);
}

// --- a cuál se pasa tras posponer ------------------------------------------------------
{
  const lista = juntar({
    decisiones: [dec("a", "viva", 30), dec("b", "viva", 20), dec("vieja", "contestada", 1)],
    avisos: [aviso(2, "hecho", 50)],
    programados: [],
    notas: [],
  });
  es("el orden de partida", lista.map((c) => c.id), ["dec:a", "dec:b", "aviso:2", "dec:vieja"]);
  ok("la siguiente de abajo", siguienteTrasApartar(lista, "dec:a")?.id === "dec:b");
  ok("pasa a lo que terminó", siguienteTrasApartar(lista, "dec:b")?.id === "aviso:2");
  ok("si era la última pendiente, la de encima, no lo que ya pasó", siguienteTrasApartar(lista, "aviso:2")?.id === "dec:b");
  ok("nunca una que ya pasó", siguienteTrasApartar(lista.filter((c) => c.id !== "dec:b" && c.id !== "aviso:2"), "dec:a") === undefined);
  const dormidas = juntar({ ...vacio, decisiones: [dec("a", "viva", 30), dec("b", "viva", 20)], reposo: posponer(SIN_REPOSO, { id: "dec:b", cuando: 20 }, AHORA + HORA), ahora: AHORA });
  ok("tampoco una ya pospuesta", siguienteTrasApartar(dormidas, "dec:a") === undefined);
  ok("sola, no hay a dónde ir", siguienteTrasApartar(lista.slice(0, 1), "dec:a") === undefined);
}

// --- la campana: qué aviso duerme ------------------------------------------------------
// Revisión aparte de los arreglos de H (2026-11-16): el «terminó» de una terminal con su
// decisión viva no es fila (la representa la decisión), así que nunca dormía con ella, y
// Adeo seguía diciendo «un agente ha terminado» con la decisión pospuesta.
{
  const fuentes: Fuentes = { ...vacio, decisiones: [dec("d1", "viva", 30, 7)], avisos: [aviso(7, "hecho", 40), aviso(8, "hecho", 50)], ahora: AHORA };
  const despierta = juntar({ ...fuentes, reposo: SIN_REPOSO });
  const duerme = avisoDormido(juntar({ ...fuentes, reposo: posponer(SIN_REPOSO, { id: "dec:d1", cuando: 30 }, AHORA + HORA) }));
  es("el «terminó» de una terminal duerme con su decisión pospuesta, y el de otra no", [duerme(aviso(7, "hecho", 40)), duerme(aviso(8, "hecho", 50))], [true, false]);
  ok("con la decisión despierta, cuenta", !avisoDormido(despierta)(aviso(7, "hecho", 40)));
  ok("un «te espera» de esa terminal no duerme con su decisión: pide su tecla", !duerme(aviso(7, "espera", 45)));
  const dos: Fuentes = { ...fuentes, decisiones: [dec("d1", "viva", 30, 7), dec("d2", "viva", 35, 7)] };
  ok(
    "si otra decisión de esa terminal sigue despierta, su «terminó» cuenta",
    !avisoDormido(juntar({ ...dos, reposo: posponer(SIN_REPOSO, { id: "dec:d1", cuando: 30 }, AHORA + HORA) }))(aviso(7, "hecho", 40)),
  );
  ok("y un aviso duerme con su propia fila", avisoDormido(juntar({ ...fuentes, reposo: posponer(SIN_REPOSO, { id: "aviso:8", cuando: 50 }, AHORA + HORA) }))(aviso(8, "hecho", 50)));
}

if (fallos) {
  console.error(`\n${fallos} en rojo:\n  ${rojos.join("\n  ")}`);
  process.exit(1);
}
console.log("\nLa lista de Decisiones, en verde.");
