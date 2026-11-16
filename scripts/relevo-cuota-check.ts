// Banco del relevo por cuota, la mitad de la ventana (`lib/relevoCuota.ts`).
//
//   pnpm bancos relevo-cuota
//
// Munir, 2026-11-14: una delegada que se queda sin cuota sigue sola en la cuenta
// que tenga. Lo que se comprueba aquí es lo que decide la ventana: a qué cuenta
// va (la de `elegirCuenta`, nunca la agotada ni una sin sitio), que la agotada
// deje de elegirse aunque su lectura de uso diga «81 %» (terminal 19, 02:41), y
// el comando de la nueva (`--resume` de la misma conversación, su modelo, su
// esfuerzo, `auto` y el «sigue»). Lo que lee el 429 y muda la conversación es de
// Rust: `cargo test --lib relevo_cuota`.

// Las copias ya cerradas se apuntan ahí (`copiaCerrada`).
const armario = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => armario.get(k) ?? null,
  setItem: (k: string, v: string) => void armario.set(k, v),
  removeItem: (k: string) => void armario.delete(k),
  clear: () => armario.clear(),
  key: () => null,
  length: 0,
} as Storage;
import { abrirElRelevo, apuntarAgotada, comandoDeRelevo, conLasAgotadas, cuentaDelRelevo, deSuComando, elegirParaRelevo, olvidarAgotadas, textoDeSeguir, type ManosDelRelevo } from "../src/lib/relevoCuota";
import { apuntarCopia, copiaCerrada, copiaDe, soltarCopia } from "../src/lib/copiaAparte";
import { elegirCuenta, type CuentaViva } from "../src/lib/router";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

// Sábado 14 de noviembre de 2026, 02:45, hora de esta máquina.
const AHORA = new Date(2026, 10, 14, 2, 45).getTime();
const DIA = 86_400_000;
const viva = (label: string, o: Partial<CuentaViva> = {}): CuentaViva => ({
  cuenta: { id: label === "Principal" ? "main:claude" : `claude:${label}`, label, dir: label === "Principal" ? "" : `C:\\cuentas\\${label}`, provider: "claude" },
  instalado: true,
  conectada: true,
  ...o,
});
const SEGUNDA = "C:\\cuentas\\2da MAIN";

{
  olvidarAgotadas();
  // La 2da es la que más perdería sin usar, pero es la agotada: va a la principal.
  const l = [viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA }), viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA })];
  const r = cuentaDelRelevo(l, SEGUNDA, AHORA);
  comprueba("sin la agotada, aunque sea la que más perdería", "viva" in r && r.viva.cuenta.label === "Principal", r);
  // Y al revés: se agota la principal y va a la 2da.
  const r2 = cuentaDelRelevo(l, "", AHORA);
  comprueba("se agota la principal y va a la otra", "viva" in r2 && r2.viva.cuenta.label === "2da MAIN", r2);
  // Con la principal escrita con otra barra o mayúsculas, sigue siendo la misma.
  const r3 = cuentaDelRelevo(l, "c:\\cuentas\\2DA MAIN\\", AHORA);
  comprueba("la carpeta se compara sin mayúsculas ni barra final", "viva" in r3 && r3.viva.cuenta.label === "Principal", r3);
}

{
  olvidarAgotadas();
  // Ninguna otra con sitio: no se releva (Claude Code ya sigue solo al renovarse).
  const l = [viva("Principal", { sesion: 100, sesionRenueva: AHORA + 3_600_000 }), viva("2da MAIN"), viva("3ra", { gastado: 95, renueva: AHORA + DIA })];
  const r = cuentaDelRelevo(l, SEGUNDA, AHORA);
  comprueba("ninguna otra con sitio: error, no la menos mala", "error" in r && r.error.includes("ninguna otra cuenta tiene sitio"), r);
  const sola = cuentaDelRelevo([viva("2da MAIN")], SEGUNDA, AHORA);
  comprueba("solo la agotada: error", "error" in sola && sola.error.includes("no hay otra cuenta"), sola);
}

{
  olvidarAgotadas();
  // La terminal 19: su lectura decía 81 % del tope de 5 horas con la cuenta ya parada.
  const l = [viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA }), viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, sesion: 81, sesionRenueva: AHORA + 3_600_000 })];
  comprueba("antes de saberlo, open_pane la elegiría", elegirCuenta(conLasAgotadas(l, AHORA), AHORA)?.viva.cuenta.label === "2da MAIN", null);
  apuntarAgotada(SEGUNDA, Math.floor((AHORA + 3_600_000) / 1000), "five_hour", AHORA);
  const e = elegirCuenta(conLasAgotadas(l, AHORA), AHORA);
  comprueba("apuntada su 429, open_pane ya no la elige", e?.viva.cuenta.label === "Principal", e);
  comprueba("y el porqué dice que está parada por su tope de 5 horas", !!e?.porque.includes("«2da MAIN» está parada por su tope de 5 horas"), e?.porque);
  const luego = elegirCuenta(conLasAgotadas(l, AHORA + 2 * 3_600_000), AHORA + 2 * 3_600_000);
  comprueba("pasada su hora de renovarse vuelve a contar", luego?.viva.cuenta.label === "2da MAIN", luego?.viva.cuenta.label);
  // La de la semana va como semana agotada, no como tope de 5 horas.
  olvidarAgotadas();
  apuntarAgotada("", Math.floor((AHORA + DIA) / 1000), "seven_day", AHORA);
  const semana = conLasAgotadas(l, AHORA).find((v) => v.cuenta.label === "Principal");
  comprueba("la semana agotada sale al 100 % de su semana", semana?.gastado === 100 && semana.renueva === AHORA + DIA, semana);
  // Una ya renovada no se apunta.
  olvidarAgotadas();
  apuntarAgotada(SEGUNDA, Math.floor((AHORA - 60_000) / 1000), "five_hour", AHORA);
  comprueba("una que ya se renovó no se apunta", conLasAgotadas(l, AHORA)[1].sesion === 81, conLasAgotadas(l, AHORA)[1]);
  olvidarAgotadas();
}

{
  // Lo que lleva el comando de una delegada de verdad (open_pane, 2026-11-14).
  const viejo = ["powershell.exe", "-NoLogo", "-Command", "& claude --permission-mode auto --session-id a454348a-ee53-43e4-9dbe-f7345ea44c87 --model opus --effort xhigh 'Eres la terminal «Mac» --model haiku'"];
  const de = deSuComando(viejo);
  comprueba("del comando viejo salen su modelo, su esfuerzo y su modo (y no los del encargo)", de.modelo === "opus" && de.esfuerzo === "xhigh" && de.modo === "auto", de);
  const sigue = textoDeSeguir({ agotada: "2da MAIN", cuenta: "Principal", tipo: "five_hour", renueva: Math.floor((AHORA + 3_600_000) / 1000) }, AHORA);
  comprueba("el «sigue» dice las dos cuentas, el tope y que es la misma conversación", sigue.includes("«2da MAIN»") && sigue.includes("«Principal»") && sigue.includes("tope de 5 horas") && sigue.includes("misma conversación") && sigue.includes("sin repetir"), sigue);
  const cmd = comandoDeRelevo("a454348a-ee53-43e4-9dbe-f7345ea44c87", viejo, sigue).join(" ");
  comprueba(
    "la nueva retoma la misma conversación con su modelo, su esfuerzo y en auto",
    cmd.includes("--resume a454348a-ee53-43e4-9dbe-f7345ea44c87") && cmd.includes("--model opus") && cmd.includes("--effort xhigh") && cmd.includes("--permission-mode auto") && !cmd.includes("--session-id"),
    cmd,
  );
  comprueba("y lleva el «sigue» como primer mensaje", cmd.includes("Sigue la tarea por donde la dejaste"), cmd);
  const sinNada = comandoDeRelevo("s1", undefined, "sigue").join(" ");
  comprueba("sin comando viejo, en auto y sin inventarse modelo", sinNada.includes("--permission-mode auto") && !sinNada.includes("--model"), sinNada);
}

// La copia aparte en el relevo (segunda revisión aparte, 2026-11-16). Rust cierra
// la vieja ENTRE `relevo_cuenta` y `relevo_abrir`, y al cerrarse su panel suelta
// su copia (`soltarCopia`): al abrir la nueva ya no se sabía de qué copia era, y
// se adivinaba por el número del nombre del espejo, que tras Reanimar o reiniciar
// no es el suyo.
async function laCopiaEnElRelevo() {
  const ARBOL = "C:\\proyectos\\Demo\\.adeorq\\espejo\\3-1700000000";
  const abiertas: { cwd: string; shadow?: boolean; espejo?: string }[] = [];
  const manos: ManosDelRelevo = {
    addPane: (_n, cwd, _c, _a, _acc, _t, shadow, _g, _e, op) => {
      abiertas.push({ cwd, shadow, espejo: op?.espejo });
      return { id: 40 + abiertas.length, donde: "cabina" };
    },
    vivas: async () => [viva("Principal", { gastado: 10, renueva: AHORA + 5 * DIA })],
    lista: () => [],
    nombreDe: () => "nocturna",
    confiar: async () => true,
    marcar: () => {},
  };
  const confiadas: string[] = [];
  manos.confiar = async (cwd) => (confiadas.push(cwd), true);
  const relevo = async (paneId: number, arbol = ARBOL, entre?: () => void) => {
    abiertas.length = 0;
    confiadas.length = 0;
    await elegirParaRelevo({ paneId, cli: "claude", agotada: SEGUNDA }, manos);
    entre?.(); // lo que pase entre `relevo_cuenta` y `relevo_abrir`
    soltarCopia(paneId); // lo que hace su panel al cerrarse, antes de `relevo_abrir`
    await abrirElRelevo({ paneId, cli: "claude", cuenta: { id: "main:claude" }, cwd: `${arbol}\\web`, nombre: "nocturna", sesion: "s1" }, manos);
    return abiertas[0];
  };

  // Una dueña reanimada: ahora es la 12, y su espejo se llama «3-…».
  apuntarCopia(12, { proyecto: "C:\\proyectos\\Demo", arbol: ARBOL, base: "main", duena: 12 });
  const duena = await relevo(12);
  comprueba("la dueña reanimada sigue en su copia, con su Aceptar y Tirar", duena?.shadow === true && duena.espejo === "3-1700000000", duena);

  // Una hija de la 12 que hoy tiene el número 3, el del nombre del espejo.
  apuntarCopia(3, { proyecto: "C:\\proyectos\\Demo", arbol: ARBOL, base: "main", duena: 12 });
  const hija = await relevo(3);
  comprueba("la hija con el número del espejo no se hace dueña de la copia", !!hija && !hija.shadow && !hija.espejo, hija);
  comprueba("y su relevo sigue apuntado dentro de la copia de su madre", copiaDe(41)?.duena === 12, copiaDe(41));

  // Una dueña cuya copia se aceptó con su agente aún dentro: siguió en el árbol
  // muerto hasta quedarse sin cuota. Su relevo vuelve a tu carpeta, con el nombre
  // del espejo para que `TerminalPane` no lo remonte y le traiga la conversación.
  const MUERTO = "C:\\proyectos\\Demo\\.adeorq\\espejo\\14-1700000500";
  apuntarCopia(14, { proyecto: "C:\\proyectos\\Demo", arbol: MUERTO, base: "main", duena: 14 });
  copiaCerrada(MUERTO);
  const tras = await relevo(14, MUERTO);
  comprueba("la dueña de una copia ya cerrada sigue en tu carpeta, no en el árbol muerto", tras?.cwd === "C:\\proyectos\\Demo\\web", tras);
  comprueba("con el nombre de su espejo, que no se vuelve a montar", tras?.shadow === true && tras.espejo === "14-1700000500", tras);
  comprueba("y la carpeta de confianza en la cuenta nueva es la tuya", confiadas[0] === "C:\\proyectos\\Demo\\web", confiadas);

  // Cuarta revisión aparte: la copia se acepta A MITAD del relevo, cuando ya se había
  // apuntado de qué copia era. Con eso apuntado no se miraba si estaba cerrada: la
  // confianza iba al árbol muerto y una hija se volvía a apuntar en él.
  const A_MITAD = "C:\\proyectos\\Demo\\.adeorq\\espejo\\15-1700000600";
  apuntarCopia(15, { proyecto: "C:\\proyectos\\Demo", arbol: A_MITAD, base: "main", duena: 15 });
  const duenaAMitad = await relevo(15, A_MITAD, () => copiaCerrada(A_MITAD));
  comprueba("la dueña cuya copia se cierra a mitad del relevo sigue en tu carpeta", duenaAMitad?.cwd === "C:\\proyectos\\Demo\\web" && duenaAMitad.espejo === "15-1700000600", duenaAMitad);
  comprueba("y la confianza va a tu carpeta, no al árbol muerto", confiadas[0] === "C:\\proyectos\\Demo\\web", confiadas);
  apuntarCopia(16, { proyecto: "C:\\proyectos\\Demo", arbol: A_MITAD, base: "main", duena: 15 });
  const hijaAMitad = await relevo(16, A_MITAD, () => copiaCerrada(A_MITAD));
  comprueba("su hija también vuelve a tu carpeta", hijaAMitad?.cwd === "C:\\proyectos\\Demo\\web", hijaAMitad);
  comprueba("y no se vuelve a apuntar en la copia cerrada", ![41, 42, 43, 44, 45, 46, 47, 48].some((id) => copiaDe(id)?.arbol === A_MITAD), [41, 42, 43, 44, 45, 46, 47, 48].map((id) => copiaDe(id)));
}

void laCopiaEnElRelevo().then(() => {
  if (fallos) {
    console.log(`\n${fallos} FALLAN`);
    process.exit(1);
  }
  console.log("\nTodo en verde.");
});
