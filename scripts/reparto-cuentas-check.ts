// Banco del reparto entre cuentas: a qué cuenta va la siguiente terminal.
//
//   pnpm bancos reparto
//
// Existe por la queja de Munir del 2026-11-02: «tengo una cuenta pro de claude
// que no le han delegado casi ninguna tarea, va por el 17 % de la semana y se
// resetea en 2 días». La regla (`elegirCuenta`, `lib/router.ts`) es UNA para
// `recetar`, `open_pane` sin `account` y `get_usage`: gana la que más cuota
// perdería, (100 − % semanal) / días hasta renovarse (mínimo 0,25), fuera la
// parada por su tope de 5 horas o la que va por el 92 % o más, salvo que no
// quede otra. Sin gasto, 50 %; sin fecha, 7 días.
import { cuantasPesan, elegirCuenta, modeloParaSuPlan, recetar, sePierde, type CuentaViva, type Exigencia } from "../src/lib/router";
import { partesDe } from "../src/lib/cuota";
import { cuandoEnPalabras, conLasPrincipales, parteDelEquipo } from "../src/lib/mundo";
import { cuentaDelAgente, loQueNoVe } from "../src/lib/puenteMcp";
import { cuentaConocida, cuentaDeSuEntorno, cuentaDelNodo } from "../src/lib/frenoCuota";
import type { Account, Limits } from "../src/lib/pty";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

// Lunes 2 de noviembre de 2026, 10:00, hora de esta máquina.
const AHORA = new Date(2026, 10, 2, 10, 0).getTime();
const DIA = 86_400_000;

const viva = (label: string, o: Partial<CuentaViva> = {}, provider = "claude"): CuentaViva => ({
  cuenta: { id: label === "Principal" ? `main:${provider}` : `${provider}:${label}`, label, dir: label === "Principal" ? "" : `C:\\cuentas\\${label}`, provider },
  instalado: true,
  conectada: true,
  ...o,
});
const quien = (l: CuentaViva[], modelo?: Parameters<typeof elegirCuenta>[2]) => elegirCuenta(l, AHORA, modelo)?.viva.cuenta.label;

// 1. Los dos casos de Munir.
const pro2 = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
const main5 = viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA, plan: "max" });
let e = elegirCuenta([main5, pro2], AHORA);
comprueba("Pro al 17 % en 2 días gana a principal al 60 % en 5", e?.viva.cuenta.label === "2da MAIN", e);
comprueba("el porqué dice cuál, cuánto y frente a quién", !!e && /2da MAIN/.test(e.porque) && /17 %/.test(e.porque) && /Principal/.test(e.porque) && /en 2 días/.test(e.porque), e?.porque);
comprueba("41,5 frente a 8 puntos al día", Math.round(sePierde(pro2, AHORA) * 10) === 415 && sePierde(main5, AHORA) === 8, [sePierde(pro2, AHORA), sePierde(main5, AHORA)]);

const pro6 = viva("2da MAIN", { gastado: 17, renueva: AHORA + 6 * DIA, plan: "pro" });
const main1 = viva("Principal", { gastado: 30, renueva: AHORA + 1 * DIA, plan: "max" });
comprueba("Pro al 17 % en 6 días pierde contra principal al 30 % en 1", quien([pro6, main1]) === "Principal", quien([pro6, main1]));

// 2. Los bordes de la fórmula.
const yaMismo = viva("A", { gastado: 90, renueva: AHORA + 60_000 });
comprueba("a un minuto de renovarse cuenta como 0,25 días, no infinito", sePierde(yaMismo, AHORA) === 40, sePierde(yaMismo, AHORA));
const sinDato = viva("B", { renueva: AHORA + 2 * DIA });
comprueba("sin dato de gasto, 50 %", sePierde(sinDato, AHORA) === 25, sePierde(sinDato, AHORA));
const sinFecha = viva("C", { gastado: 30 });
comprueba("sin fecha, 7 días", sePierde(sinFecha, AHORA) === 10, sePierde(sinFecha, AHORA));
// R3.1 (revisor, 2026-11-02): una lectura de antes de renovarse que no se pudo
// refrescar NO dice que esté a cero: no se sabe (50 %, como sin dato).
const renovada = viva("D", { gastado: 95, renueva: AHORA - 3_600_000 });
comprueba("una lectura de antes de renovarse es dato desconocido: 50 % y 7 días", sePierde(renovada, AHORA) === 50 / 7, sePierde(renovada, AHORA));
comprueba("y no se descarta por el 95 % viejo", quien([renovada, viva("E", { gastado: 60, renueva: AHORA + 7 * DIA })]) === "D", null);
const vieja17 = viva("Vieja", { gastado: 17, renueva: AHORA - DIA });
comprueba("decía 17 % y renovó ayer: no gana a una que SÍ dice 40 % en 5 días", quien([vieja17, viva("Sabida", { gastado: 40, renueva: AHORA + 5 * DIA })]) === "Sabida", null);

// 3. Lo que se descarta.
const parada = viva("Parada", { gastado: 5, renueva: AHORA + DIA, sesion: 100, sesionRenueva: AHORA + 2 * 3_600_000 });
const llena = viva("Llena", { gastado: 93, renueva: AHORA + 0.5 * DIA });
const normal = viva("Normal", { gastado: 70, renueva: AHORA + 6 * DIA });
comprueba("la parada por su tope de 5 horas no se elige aunque perdería más", quien([parada, normal]) === "Normal", null);
comprueba("la que pasa del 92 % tampoco", quien([llena, normal]) === "Normal", null);
const elPorque = elegirCuenta([parada, llena, normal], AHORA)?.porque ?? "";
comprueba("y el porqué dice por qué quedaron fuera", /Parada.*tope de 5 horas/.test(elPorque) && /Llena.*92/.test(elPorque), elPorque);
const sesionVieja = viva("Vuelta", { gastado: 5, renueva: AHORA + DIA, sesion: 100, sesionRenueva: AHORA - 60_000 });
comprueba("un tope de 5 horas ya renovado no para", quien([sesionVieja, normal]) === "Vuelta", null);
e = elegirCuenta([parada, llena], AHORA);
comprueba("sin ninguna con sitio se elige igual y se dice", !!e?.sinSitio && /No queda ninguna con sitio/.test(e.porque), e);
e = elegirCuenta([parada], AHORA);
comprueba("con una sola, parada, se dice que está parada", !!e?.sinSitio && /única/.test(e.porque) && /tope de 5 horas/.test(e.porque), e?.porque);
comprueba("sin cuentas, nada", elegirCuenta([], AHORA) === undefined, null);

// 4. El techo del plan: una sin suscripción no se lleva un opus si hay otra.
const gratis = viva("Gratis", { gastado: 0, renueva: AHORA + DIA, plan: "free" });
const max = viva("Max", { gastado: 50, renueva: AHORA + 6 * DIA, plan: "max" });
comprueba("con opus pedido, la del plan que lo da", quien([gratis, max], "opus") === "Max", null);
comprueba("sin modelo, manda la cuota", quien([gratis, max]) === "Gratis", null);
comprueba("con sonnet, el plan gratis vale", quien([gratis, max], "sonnet") === "Gratis", null);

// 5. A igual pérdida, la que menos ha gastado; y luego la principal, que va primero.
const iguales = elegirCuenta([viva("Principal", { gastado: 50 }), viva("Otra", { gastado: 50 })], AHORA);
comprueba("empate perfecto: la primera de la lista", iguales?.viva.cuenta.label === "Principal", iguales);

// 6. `recetar` usa la misma regla.
const oficio: Exigencia = { clase: "oficio", consecuencia: "baja", largo: false, trabajo: "codigo" };
let r = recetar(oficio, { cuentas: [main5, pro2], ahora: AHORA });
comprueba("recetar manda a la Pro que se renueva antes", r.cuenta?.label === "2da MAIN" && r.porque.some((p) => /más cuota perdería/.test(p)), r);
r = recetar(oficio, { cuentas: [main1, pro6], ahora: AHORA });
comprueba("y al revés, a la principal", r.cuenta?.label === "Principal", r);
const codex = viva("Principal", { gastado: 10 }, "codex");
r = recetar(oficio, { cuentas: [parada, codex], ahora: AHORA });
comprueba("todas las de Claude paradas: relevo a Codex, dicho", r.cli === "codex" && r.porque.some((p) => /paradas por su tope de 5 horas/.test(p)), r);
r = recetar(oficio, { cuentas: [parada], ahora: AHORA });
comprueba("parada y sin relevo: sigue en Claude sin abaratar por semana", r.cli === "claude" && r.modelo === "sonnet" && r.porque.some((p) => /parada/.test(p)), r);

// 7. La tarjeta partida: semana y tope de 5 horas, cada uno con su fecha.
const tarjeta: Limits = {
  note: "",
  plan: "",
  lines: [
    { label: "Current session", percent: 95, resets: "Nov 2, 1pm (Europe/Madrid)", resetsAt: 0 },
    { label: "Current week (all models)", percent: 17, resets: "Nov 4, 8am (Europe/Madrid)", resetsAt: 0 },
    { label: "Current week (Fable)", percent: 40, resets: "Nov 4, 8am (Europe/Madrid)", resetsAt: 0 },
  ],
};
const pt = partesDe(tarjeta, AHORA);
comprueba("de Claude, la semana es la de «all models», no la peor", pt.semanal === 17 && pt.sesion === 95, pt);
comprueba("y su fecha sale del texto", pt.renueva === new Date(2026, 10, 4, 8, 0).getTime() && pt.sesionRenueva === new Date(2026, 10, 2, 13, 0).getTime(), pt);
const deCodex = partesDe({ note: "", plan: "plus", lines: [
  { label: "Current session", percent: 30, resets: "", resetsAt: AHORA + 3_600_000 },
  { label: "Current week", percent: 98, resets: "", resetsAt: AHORA + 3 * DIA },
] }, AHORA);
comprueba("de Codex, con la fecha en número", deCodex.semanal === 98 && deCodex.renueva === AHORA + 3 * DIA && deCodex.sesion === 30, deCodex);
const mensual = partesDe({ note: "", plan: "", lines: [{ label: "Current month (Premium)", percent: 75, resets: "", resetsAt: AHORA + 20 * DIA }] }, AHORA);
comprueba("sin semana, el mes hace de periodo largo", mensual.semanal === 75 && mensual.sesion === undefined, mensual);
const ilegible = partesDe({ note: "", plan: "", lines: [{ label: "Current week (all models)", percent: 10, resets: "pronto", resetsAt: 0 }] }, AHORA);
comprueba("una fecha que no se entiende queda sin poner", ilegible.semanal === 10 && ilegible.renueva === undefined, ilegible);

// 8. Las palabras.
comprueba("«en 2 días, el miércoles a las 8:00»", cuandoEnPalabras(new Date(2026, 10, 4, 8, 0).getTime(), AHORA) === "en 2 días, el miércoles a las 8:00", cuandoEnPalabras(new Date(2026, 10, 4, 8, 0).getTime(), AHORA));
comprueba("«en 3 h, hoy a las 13:00»", cuandoEnPalabras(AHORA + 3 * 3_600_000, AHORA) === "en 3 h, hoy a las 13:00", cuandoEnPalabras(AHORA + 3 * 3_600_000, AHORA));
comprueba("«en 1 día, mañana a las 10:00»", cuandoEnPalabras(AHORA + DIA, AHORA) === "en 1 día, mañana a las 10:00", cuandoEnPalabras(AHORA + DIA, AHORA));

// 9. El parte de `get_usage`: todas, la principal incluida, y a dónde va la siguiente.
const parte = parteDelEquipo([main5, { ...pro2, sesion: 100, sesionRenueva: AHORA + 2 * 3_600_000 }, viva("3ra codex", { gastado: 49, renueva: AHORA + 4 * DIA }, "codex")], AHORA);
comprueba("sale la principal de Claude", /Claude Code · «Principal»/.test(parte), parte);
comprueba("con su % y cuándo se renueva en palabras", /60 % de su semana · se renueva en 5 días, el sábado a las 10:00/.test(parte), parte);
comprueba("el tope de 5 horas va aparte", /«2da MAIN».*17 % de su semana.*PARADA ahora por su tope de 5 horas, vuelve en 2 h, hoy a las 12:00/.test(parte), parte);
comprueba("y la línea final por CLI", /A qué cuenta va la siguiente terminal/.test(parte) && /Claude Code → «Principal»/.test(parte) && /Codex → «3ra codex»/.test(parte), parte);
comprueba("sigue sin comparar unidades entre proveedores", /NO son comparables/.test(parte), null);

const lista: Account[] = [
  { id: "a1", label: "2da MAIN", dir: "C:\\c\\2", provider: "claude" },
  { id: "a2", label: "2da codex", dir: "C:\\c\\x", provider: "codex" },
];
const todas = conLasPrincipales(lista);
comprueba("conLasPrincipales pone la principal de cada CLI delante", todas[0].id === "main:claude" && todas.some((a) => a.id === "main:codex") && todas.slice(-2).map((a) => a.id).join() === "a1,a2", todas.map((a) => a.id));

// 10. `account` pedido: por etiqueta, por id, «principal», y error si no existe.
const pide = (q: string, cli = "claude") => cuentaDelAgente(q, cli, lista);
comprueba("por su etiqueta, sin mayúsculas", (pide("2da main") as Account).id === "a1", pide("2da main"));
comprueba("por su id (encargo programado)", (pide("a1") as Account).id === "a1", pide("a1"));
comprueba("«principal» es la carpeta de siempre", (pide("principal") as Account).id === "main:claude" && (pide("Principal") as Account).dir === "", pide("principal"));
const noHay = pide("4ta");
comprueba("una que no existe da error con las que hay", "error" in noHay && /«4ta»/.test(noHay.error) && /«2da MAIN»/.test(noHay.error), noHay);
const deOtro = pide("2da codex");
comprueba("una de otro CLI da error, no otra en silencio", "error" in deOtro && /codex, no de claude/.test(deOtro.error), deOtro);

// 11. Reanimar la retoma en SU cuenta, leída del entorno con que nació.
const deSuEnv = (env: Record<string, string> | undefined, cli = "claude") => cuentaDeSuEntorno(env, cli, lista);
comprueba("con el CLAUDE_CONFIG_DIR de una cuenta, esa", deSuEnv({ CLAUDE_CONFIG_DIR: "C:\\c\\2" }).id === "a1", deSuEnv({ CLAUDE_CONFIG_DIR: "C:\\c\\2" }));
comprueba("sin mayúsculas ni barra final de diferencia", deSuEnv({ CLAUDE_CONFIG_DIR: "c:\\C\\2\\" }).id === "a1", null);
comprueba("sin variable, la principal y no la predeterminada", deSuEnv(undefined).id === "main:claude" && deSuEnv({ OTRA: "x" }).id === "main:claude", null);
const borrada = deSuEnv({ CLAUDE_CONFIG_DIR: "C:\\c\\vieja" });
comprueba("una cuenta ya quitada de Cuentas: su carpeta, igual", borrada.dir === "C:\\c\\vieja" && borrada.provider === "claude", borrada);
comprueba("Codex por su CODEX_HOME", deSuEnv({ CODEX_HOME: "C:\\c\\x" }, "codex").id === "a2", deSuEnv({ CODEX_HOME: "C:\\c\\x" }, "codex"));

// 12. En otra cuenta, la respuesta dice lo que no ve y dónde está su memoria.
const aviso = loQueNoVe("claude", lista[0], "C:\\proyectos\\Adeorq") ?? "";
comprueba("en otra cuenta se dice que no ve la memoria, con su ruta", /«2da MAIN»/.test(aviso) && aviso.includes("~\\.claude\\projects\\C--proyectos-Adeorq\\memory") && /MCP de Adeorq/.test(aviso), aviso);
comprueba("en la principal, nada", loQueNoVe("claude", { id: "main:claude", label: "Principal", dir: "", provider: "claude" }, "C:\\x") === undefined, null);
comprueba("en Codex, nada (no comparte esa casa)", loQueNoVe("codex", lista[1], "C:\\x") === undefined, null);

// 13. R3.2: tres aperturas seguidas con la MISMA foto no van todas a la misma.
// Cada terminal abierta desde la última lectura y aún viva pesa en su cuenta.
{
  const A = viva("A", { gastado: 40, renueva: AHORA + 2 * DIA });
  const B = viva("B", { gastado: 45, renueva: AHORA + 2 * DIA });
  const abiertas: string[] = [];
  for (let i = 0; i < 3; i++) {
    const cuenta = (l: string) => abiertas.filter((x) => x === l).length;
    const e = elegirCuenta([{ ...A, abiertas: cuenta("A") }, { ...B, abiertas: cuenta("B") }], AHORA);
    abiertas.push(e!.viva.cuenta.label);
  }
  comprueba("tres seguidas se reparten (A, B, A) en vez de A, A, A", abiertas.join() === "A,B,A", abiertas);
  const e = elegirCuenta([{ ...A, abiertas: 1 }, B], AHORA);
  comprueba("y el porqué cuenta las que ya lleva", /1 terminal abierta/.test(e?.porque ?? "") || e?.viva.cuenta.label === "B", e?.porque);
}

// 14. R3.3: si ninguna cuenta da el modelo, se baja al techo del plan y se dice.
{
  const r = modeloParaSuPlan("opus", "free");
  comprueba("una cuenta gratis con opus pedido baja a sonnet", r.modelo === "sonnet" && /sonnet/.test(r.porque ?? "") && /plan/.test(r.porque ?? ""), r);
  comprueba("con Pro, opus se queda", modeloParaSuPlan("opus", "pro").modelo === "opus" && !modeloParaSuPlan("opus", "pro").porque, null);
  comprueba("sin plan conocido no se toca", modeloParaSuPlan("opus", undefined).modelo === "opus", null);
  comprueba("haiku en gratis, igual", modeloParaSuPlan("haiku", "free").modelo === "haiku", null);
}

// 15. R3.5: lo que va por mes se llama mes.
{
  const copilot = viva("Principal", { gastado: 75, renueva: AHORA + 20 * DIA, periodo: "mes" }, "copilot");
  const t = parteDelEquipo([copilot], AHORA);
  comprueba("Copilot dice «de su mes», no «de su semana»", /75 % de su mes/.test(t) && !/de su semana/.test(t.split("\n").find((l) => /Copilot/.test(l)) ?? ""), t.split("\n").find((l) => /Copilot/.test(l)));
  comprueba("partesDe dice el periodo", mensual.periodo === "mes" && pt.periodo === "semana", [mensual.periodo, pt.periodo]);
}

// 16. R3.4: el Lienzo guarda la cuenta (sin el entorno) y solo vuelve a una que existe.
{
  const nodo = cuentaDelNodo({ env: { CLAUDE_CONFIG_DIR: "C:\\c\\2", ANTHROPIC_API_KEY: "sk-secreta" }, account: "2da MAIN" }, "claude");
  comprueba("guarda carpeta y nombre, y nada del entorno", nodo.dir === "C:\\c\\2" && nodo.label === "2da MAIN" && !JSON.stringify(nodo).includes("sk-secreta"), nodo);
  comprueba("y vuelve a la de Cuentas con esa carpeta", cuentaConocida(nodo, lista)?.id === "a1", cuentaConocida(nodo, lista));
  const principal = cuentaDelNodo({}, "claude");
  comprueba("sin variable, la principal, y vuelve a ella", principal.dir === "" && cuentaConocida(principal, lista)?.id === "main:claude", principal);
  comprueba("una carpeta que no está en Cuentas no se acepta", cuentaConocida({ id: "x", label: "x", dir: "C:\\cualquiera", provider: "claude" }, lista) === undefined, null);
  comprueba("ni una «principal» de mentira con otro id", cuentaConocida({ id: "trampa", label: "Principal", dir: "", provider: "claude" }, lista) === undefined, null);
}

// 17. Revisión de R3 (2026-11-03): cuándo deja de pesar una terminal. En frío, la
// lectura que dispara la propia apertura llega segundos después de abrirla, y
// todavía no trae nada de lo que esa terminal va a gastar.
{
  const MIN = 60_000;
  const vivos = new Set([7]);
  comprueba("una lectura de segundos después de abrirla no le quita el peso", cuantasPesan([{ panel: 7, at: AHORA }], AHORA + 5_000, vivos) === 1, null);
  comprueba("una de más de diez minutos después, sí", cuantasPesan([{ panel: 7, at: AHORA }], AHORA + 11 * MIN, vivos) === 0, null);
  comprueba("una de antes de abrirla tampoco se lo quita", cuantasPesan([{ panel: 7, at: AHORA }], AHORA - MIN, vivos) === 1, null);
  comprueba("una ya cerrada no pesa", cuantasPesan([{ panel: 9, at: AHORA }], AHORA - MIN, vivos, AHORA + MIN) === 0, null);
  comprueba("una que todavía está naciendo sí pesa", cuantasPesan([{ panel: null, at: AHORA }], AHORA - MIN, vivos, AHORA + MIN) === 1, null);
  comprueba("y una recién abierta que la lista aún no trae, también", cuantasPesan([{ panel: 9, at: AHORA }], AHORA - MIN, vivos, AHORA + 1_000) === 1, null);
}

// 18. Revisión de R3: parada por su tope de 5 horas Y sin semana no es «solo parada».
{
  const ambas = viva("Ambas", { gastado: 95, renueva: AHORA + DIA, sesion: 100, sesionRenueva: AHORA + 3_600_000 });
  r = recetar(oficio, { cuentas: [ambas], ahora: AHORA }, "opus");
  comprueba("parada y sin semana, sin relevo: se abarata como sin semana", r.modelo === "sonnet" && r.porque.some((p) => /Baja de opus/.test(p)), r);
  r = recetar(oficio, { cuentas: [ambas, codex], ahora: AHORA });
  comprueba("y con relevo se dice que no queda semana", r.cli === "codex" && r.porque.some((p) => /No queda semana/.test(p)), r);
}

// 19. Revisión de R3: el mes tampoco se llama semana en el porqué de `elegirCuenta`.
{
  const mes = (label: string, gastado: number) => viva(label, { gastado, renueva: AHORA + 20 * DIA, periodo: "mes" }, "copilot");
  const una = elegirCuenta([mes("Principal", 95)], AHORA)?.porque ?? "";
  comprueba("una agotada de su mes dice «de su mes»", /de su mes/.test(una) && !/semana/.test(una), una);
  const dos = elegirCuenta([mes("Principal", 95), mes("Otra", 96)], AHORA)?.porque ?? "";
  comprueba("y con dos, tampoco «semana»", !/semana/.test(dos), dos);
}

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
if (fallos) process.exit(1);
