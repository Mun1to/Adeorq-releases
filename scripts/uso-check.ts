// Comprobación del panel de uso: las tres reglas que traducen la tarjeta.
//
//   npx tsc scripts/uso-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/uso-check.js
//
// Existe porque lo que se rompe aquí no da error: da una frase medio traducida
// («se renueva Aug 26, 9am») que se lee perfectamente y está mal. Compilar no
// lo ve, mirar la pantalla lo ve solo si te fijas, y el año de la renovación
// solo se puede comprobar en enero. Así que se ejecuta.
import { etiquetaCorta, hace, leerRenovacion, renovacion } from "../src/lib/uso";

let fallos = 0;
function ok(que: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    console.log(`  ok   ${que}`);
  } else {
    fallos++;
    console.log(`  MAL  ${que}\n         salió ${a}\n         debía ${b}`);
  }
}

// ── LAS ETIQUETAS, tal y como las escribe el CLI de verdad ────────────────
// Copiadas de una tarjeta real de esta máquina (2026-08-24).
console.log("\nEtiquetas");
ok("sesión", etiquetaCorta("Current session"), { clave: "sesión" });
ok("semana entera", etiquetaCorta("Current week (all models)"), { clave: "semana" });
ok("semana de un modelo", etiquetaCorta("Current week (Fable)"), {
  clave: "semana",
  modelo: "Fable",
});
ok("semana de Opus", etiquetaCorta("Current week (Opus)"), { clave: "semana", modelo: "Opus" });
// El mes lo trae Codex, no Claude: su plan gratuito cuenta por ventanas de
// treinta dias y `uso_clientes.rs` las nombra con este mismo vocabulario.
ok("mes", etiquetaCorta("Current month"), { clave: "mes" });
// Lo que no reconocemos NO se inventa: si el CLI cambia su tarjeta, se ve.
ok("línea desconocida", etiquetaCorta("Current something else"), { clave: "something else" });

// ── LA FECHA ──────────────────────────────────────────────────────────────
console.log("\nLa fecha de renovación");
const ahora = new Date(2026, 7, 24, 5, 30); // 24 de agosto de 2026, 5:30
ok(
  "con minutos",
  leerRenovacion("Aug 24, 7:10am", ahora)?.toISOString().slice(0, 16),
  new Date(2026, 7, 24, 7, 10).toISOString().slice(0, 16),
);
ok(
  "sin minutos",
  leerRenovacion("Aug 26, 9am", ahora)?.toISOString().slice(0, 16),
  new Date(2026, 7, 26, 9, 0).toISOString().slice(0, 16),
);
ok(
  "de tarde",
  leerRenovacion("Aug 24, 3:45pm", ahora)?.toISOString().slice(0, 16),
  new Date(2026, 7, 24, 15, 45).toISOString().slice(0, 16),
);
// Las dos trampas de las 12: 12am es medianoche y 12pm es mediodía.
ok(
  "12am es medianoche",
  leerRenovacion("Aug 25, 12am", ahora)?.getHours(),
  0,
);
ok("12pm es mediodía", leerRenovacion("Aug 25, 12:30pm", ahora)?.getHours(), 12);
// El año NO viene en la tarjeta. En diciembre, una renovación de enero es del
// año siguiente, y sin esta regla el panel diría que se renovó hace once meses.
const finDeAno = new Date(2026, 11, 30, 23, 0);
ok(
  "enero visto desde diciembre es del año que viene",
  leerRenovacion("Jan 2, 9am", finDeAno)?.getFullYear(),
  2027,
);
ok("una tarjeta que no entendemos", leerRenovacion("in about 3 hours", ahora), null);

// ── CÓMO SE DICE ──────────────────────────────────────────────────────────
console.log("\nCómo se dice");
ok("dentro de un rato", renovacion("Aug 24, 6:05am", ahora), {
  clave: "en {n} min",
  valor: "35",
});
ok("dentro de unas horas", renovacion("Aug 24, 8:30am", ahora), {
  clave: "en {n} h",
  valor: "3",
});
ok("hoy más tarde", renovacion("Aug 24, 11:30pm", ahora), {
  clave: "hoy a las {hora}",
  valor: "23:30",
});
ok("mañana", renovacion("Aug 25, 9am", ahora), { clave: "mañana a las {hora}", valor: "9:00" });
ok("la hora lleva sus dos cifras", renovacion("Aug 25, 9:05am", ahora)?.valor, "9:05");
{
  // La lejana devuelve la fecha cruda, sin formatear: el orden («26 ago» contra
  // «Aug 26») lo decide `Intl` en quien pinta, no una tabla de meses aquí.
  const lejos = renovacion("Aug 26, 9am", ahora);
  ok("lejana: qué frase", lejos?.clave, "el {fecha}");
  ok("lejana: qué día", lejos?.fecha?.getDate(), 26);
}
// Una renovación ya pasada no se dice: la tarjeta está vieja y el panel no
// puede inventarse un «en 1 min» que no es verdad. Ojo, quien pinta tiene que
// distinguir ESTE null del de una fecha ilegible: aquí la fecha se entiende
// perfectamente (`leerRenovacion` la lee), solo que ya pasó, y ahí la línea
// desaparece en vez de enseñar el texto en inglés del CLI.
ok("una que ya pasó", renovacion("Aug 24, 4:00am", ahora), null);
ok(
  "y esa misma SÍ se entiende, que es lo que la distingue de una ilegible",
  leerRenovacion("Aug 24, 4:00am", ahora) !== null,
  true,
);
ok("una ilegible no se entiende", leerRenovacion("in about 3 hours", ahora) !== null, false);

// ── CUÁNTO HACE QUE SE LEYÓ ───────────────────────────────────────────────
console.log("\nCuánto hace");
const t0 = new Date(2026, 7, 24, 12, 0).getTime();
ok("recién", hace(t0 - 20_000, t0), { clave: "ahora mismo", valor: "" });
ok("minutos", hace(t0 - 7 * 60_000, t0), { clave: "hace {n} min", valor: "7" });
ok("horas", hace(t0 - 3 * 3_600_000, t0), { clave: "hace {n} h", valor: "3" });
ok("días", hace(t0 - 50 * 3_600_000, t0), { clave: "hace {n} d", valor: "2" });

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
