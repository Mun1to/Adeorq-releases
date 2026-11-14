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
import { apuntarAgotada, comandoDeRelevo, conLasAgotadas, cuentaDelRelevo, deSuComando, olvidarAgotadas, textoDeSeguir } from "../src/lib/relevoCuota";
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

if (fallos) {
  console.log(`\n${fallos} FALLAN`);
  process.exit(1);
}
console.log("\nTodo en verde.");
