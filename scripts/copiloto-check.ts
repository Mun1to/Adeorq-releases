// Qué le dice el copiloto a una sesión, y sobre todo cuándo se calla.
//
//   npx tsc scripts/copiloto-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/copiloto-check.js
//
// Por qué existe: esto escribe en la bandeja de la Agenda sin que nadie se lo
// pida, y la regla R dice que con moderación. La mitad de los casos de aquí
// comprueban que NO habla, y esa mitad es la que de verdad importa: un copiloto
// que suelta una línea cada cinco minutos acaba silenciado, y entonces no
// avisa nadie. Es el mismo criterio que `vigia-check.ts`.
//
// Lo otro que se protege es que no opine. El copiloto no tiene ninguna tabla de
// qué modelo es más listo, porque ese dato no existe en ninguna parte pública.
// Solo dice lo medible: qué cuesta, cuánta semana queda y qué está pasando.

import {
  APRETADA,
  CASI_AGOTADA,
  CONTEXTO_LLENO,
  ENFRIA_SESION,
  GRACIA,
  MINIMO_HERRAMIENTAS,
  TOPE,
  anotar,
  aProponer,
  consejosDe,
  exigenciaDe,
  masBaratoPara,
  memoriaVacia,
  trabajoDe,
  type MundoCopiloto,
  type SesionVista,
} from "../src/lib/copiloto";
import { accionDe, guardarAccion, olvidarAccion, podarAcciones } from "../src/lib/acciones";
import type { PrecioModelo } from "../src/lib/coste";
import type { Account } from "../src/lib/pty";
import type { CuentaViva } from "../src/lib/router";

let fallos = 0;
const ok = (que: string, bien: boolean, extra = "") => {
  console.log(`${bien ? "  ok  " : "FALLA "} ${que}${extra ? "   " + extra : ""}`);
  if (!bien) fallos++;
};

const MIN = 60_000;
const AHORA = 1_800_000_000_000;

const cuenta = (
  provider: string,
  label: string,
  gastado?: number,
  plan = "max",
): CuentaViva => ({
  cuenta: { id: `${provider}-${label}`, label, provider } as Account,
  instalado: true,
  conectada: true,
  gastado,
  plan,
});

const sesion = (p: Partial<SesionVista> = {}): SesionVista => ({
  sessionId: "s1",
  cwd: "C:/proyectos/Adeorq",
  proyecto: "Adeorq",
  cli: "claude",
  modelo: "sonnet",
  cuenta: "Principal",
  contexto: 120_000,
  ventana: 1_000_000,
  estado: "a_medias",
  nacida: AHORA - 40 * MIN,
  ultimoEncargo: "escribe la funcion que guarda el ajuste",
  herramientas: Array(20).fill("Edit"),
  ...p,
});

/** Precios reales de OpenRouter (2026-08-19). */
const PRECIOS: Record<string, PrecioModelo & { nombre: string }> = {
  "qwen/qwen3-coder": {
    nombre: "Qwen3 Coder",
    entradaMillon: 0.3, salidaMillon: 1, cacheLeidaMillon: 0.1, cacheEscritaMillon: 0,
  },
  "google/gemini-3.7-flash": {
    nombre: "Gemini 3.7 Flash",
    entradaMillon: 0.375, salidaMillon: 1.875, cacheLeidaMillon: 0.0375, cacheEscritaMillon: 0.0208,
  },
  "anthropic/claude-opus-5": {
    nombre: "Claude Opus 5",
    entradaMillon: 5, salidaMillon: 25, cacheLeidaMillon: 0.5, cacheEscritaMillon: 6.25,
  },
};

const mundo = (p: Partial<MundoCopiloto> = {}): MundoCopiloto => ({
  cuentas: [cuenta("claude", "Principal", 30)],
  ...p,
});

const clases = (s: SesionVista, m: MundoCopiloto) => consejosDe(s, m).map((c) => c.clase);

/* ── 1. Qué está pasando, deducido de lo que ha hecho ──────────────────── */
console.log("── de que va la sesion, sin preguntarle a nadie ──");
ok("24 lecturas y ni una edicion es leer",
   trabajoDe([...Array(24).fill("Read"), "Glob", "Grep"]) === "lectura");
ok("con ediciones de por medio es codigo",
   trabajoDe([...Array(24).fill("Read"), "Edit", "Write"]) === "codigo");
// Un comando suelto entre treinta lecturas es ruido (un `git log`, un `ls`):
// sigue siendo estudiar. Dos ya no.
ok("un Bash suelto entre 30 lecturas sigue siendo leer",
   trabajoDe([...Array(30).fill("Read"), "Bash"]) === "lectura");
ok("pero dos ya es codigo",
   trabajoDe([...Array(30).fill("Read"), "Bash", "Edit"]) === "codigo");
// Dos lecturas sueltas NO deciden nada: se supone codigo, que es lo llano.
ok("sin herramientas se supone codigo, no se inventa", trabajoDe([]) === "codigo");
ok("una sola edicion entre muchas lecturas sigue siendo leer",
   trabajoDe([...Array(40).fill("Read"), "Edit"]) === "lectura");

console.log("\n── que exige la sesion ──");
ok("«audita el login» es de juicio",
   exigenciaDe(sesion({ ultimoEncargo: "audita la seguridad del login" })).clase === "juicio");
ok("y eso arrastra consecuencia alta",
   exigenciaDe(sesion({ ultimoEncargo: "audita la seguridad del login" })).consecuencia === "alta");
ok("un contexto gordo marca la tarea como larga",
   exigenciaDe(sesion({ contexto: 400_000 })).largo);
ok("sin encargo NO se supone consecuencia alta",
   exigenciaDe(sesion({ ultimoEncargo: "" })).consecuencia === "baja");

/* ── 2. El relevo: LA pregunta de Munir ────────────────────────────────── */
console.log("\n── «parate y sigue en otro cliente» ──");
{
  const s = sesion({ herramientas: Array(30).fill("Read"), ultimoEncargo: "leete los 24 README" });
  const m = mundo({
    cuentas: [cuenta("claude", "Principal", 85), cuenta("gemini", "Munito", 10)],
  });
  ok("con la semana justa y otro CLI fresco, lo propone", clases(s, m).includes("relevo"));
  const texto = consejosDe(s, m).find((c) => c.clase === "relevo")!.texto;
  ok("y dice el porcentaje real, no «vas justo»", /85 %/.test(texto), texto);
  ok("nombra al CLI al que ir", /Gemini/.test(texto));
}
{
  // El caso que hace que esto sea honesto: con semana de sobra NO se propone
  // cambiar. Mandar a otro CLI sin un motivo objetivo seria opinar sobre cual
  // es mejor, y ese dato no existe.
  const s = sesion({ herramientas: Array(30).fill("Read") });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 20), cuenta("gemini", "M", 5)] });
  ok("con semana de sobra NO manda a nadie a otro sitio", !clases(s, m).includes("relevo"));
}
{
  // Y no se cambia para nada: si al otro le queda casi lo mismo, callarse.
  const s = sesion({ herramientas: Array(30).fill("Read") });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 85), cuenta("gemini", "M", 82)] });
  ok("si al otro le queda casi lo mismo, no merece la pena", !clases(s, m).includes("relevo"));
}
{
  const s = sesion({ herramientas: Array(30).fill("Read") });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 85)] });
  ok("sin ningun otro CLI conectado, se calla", !clases(s, m).includes("relevo"));
}
{
  // Una cuenta instalada pero SIN sesion iniciada no es un sitio a donde ir.
  const dormida = { ...cuenta("gemini", "M", 5), conectada: false };
  const s = sesion({ herramientas: Array(30).fill("Read") });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 85), dormida] });
  ok("una cuenta sin sesion iniciada no cuenta", !clases(s, m).includes("relevo"));
}

/* ── 3. El derroche ────────────────────────────────────────────────────── */
console.log("\n── el cerebro caro para el recado ──");
{
  const s = sesion({ modelo: "opus", ultimoEncargo: "traduce los tooltips al ingles" });
  ok("opus para una traduccion se dice", clases(s, mundo()).includes("derroche"));
  const t = consejosDe(s, mundo()).find((c) => c.clase === "derroche")!.texto;
  ok("y dice cuantas veces mas barato sale", /veces más barato/.test(t), t);
}
{
  // Un escalon NO es un derroche: avisar de eso cada rato acaba en silenciarlo.
  const s = sesion({ modelo: "opus", ultimoEncargo: "refactoriza este modulo" });
  ok("opus donde tocaba sonnet no se dice (no es gordo)",
     !clases(s, mundo()).includes("derroche"));
}
{
  const s = sesion({ modelo: "opus", ultimoEncargo: "audita el login" });
  ok("y nunca se llama derroche a un opus en algo de juicio",
     !clases(s, mundo()).includes("derroche"));
}

/* ── 4. La via de API: el puente entre las dos economias ───────────────── */
console.log("\n── «esto por API costaria…» ──");
{
  const s = sesion({ contexto: 300_000, ultimoEncargo: "renombra las variables" });
  const m = mundo({
    cuentas: [cuenta("claude", "Principal", 92)],
    precios: PRECIOS,
    hayClaveApi: true,
  });
  ok("con la semana casi agotada, se ofrece la via de API", clases(s, m).includes("porApi"));
  const t = consejosDe(s, m).find((c) => c.clase === "porApi")!.texto;
  ok("y dice DOLARES, no dolares por millon", /\d,\d+ \$/.test(t), t);
  ok("y dice que no toca la cuota", /no tocaría tu cuota/.test(t));
}
{
  // Sin clave guardada, ofrecerlo seria mandarle a una pantalla que le pide
  // algo que no tiene.
  const s = sesion({ contexto: 300_000, ultimoEncargo: "renombra las variables" });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 92)], precios: PRECIOS });
  ok("sin clave de API guardada, ni se menciona", !clases(s, m).includes("porApi"));
}
{
  const s = sesion({ contexto: 300_000, ultimoEncargo: "renombra las variables" });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 40)], precios: PRECIOS, hayClaveApi: true });
  ok("con semana de sobra, gastar dinero de verdad es peor negocio",
     !clases(s, m).includes("porApi"));
}
{
  // EL VETO. En lo de juicio no se abarata, igual que en el router.
  const s = sesion({ contexto: 300_000, ultimoEncargo: "audita la seguridad del login" });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 95)], precios: PRECIOS, hayClaveApi: true });
  ok("para una auditoria NO se propone nada barato", !clases(s, m).includes("porApi"));
  ok("  ↳ y masBaratoPara devuelve nada, no el mas barato de todos",
     masBaratoPara(exigenciaDe(s), m) === undefined);
}
{
  // Elige por lo que cuesta LA PETICION, no por tarifa. Y por la via que se va
  // a proponer, que es la de API: `chat.rs` no manda `cache_control`, asi que
  // ahi la entrada se paga entera y manda su precio.
  //
  // Sale Qwen y no Gemini, y ESE es el hallazgo: por la via del CLI gana Gemini
  // (0,0135 $ frente a 0,0331 $) porque tiene la cache mas barata; por API gana
  // Qwen (0,0919 $ frente a 0,1156 $) porque tiene la entrada mas barata. Con
  // la via mal puesta, el copiloto recomendaba el equivocado Y con un precio
  // 8,5 veces mas bajo del real.
  const ex = { clase: "recado", consecuencia: "baja", largo: false, trabajo: "codigo" } as const;
  ok("por API elige el que menos cuesta SIN cache",
     masBaratoPara(ex, mundo({ precios: PRECIOS }))?.id === "qwen/qwen3-coder",
     masBaratoPara(ex, mundo({ precios: PRECIOS }))?.nombre ?? "ninguno");
  ok("y por la via del CLI seria otro",
     masBaratoPara(ex, mundo({ precios: PRECIOS }), 300_000, "agente")?.id ===
       "google/gemini-3.7-flash",
     masBaratoPara(ex, mundo({ precios: PRECIOS }), 300_000, "agente")?.nombre ?? "ninguno");
}

/* ── 5. El contexto ────────────────────────────────────────────────────── */
console.log("\n── el contexto que se llena ──");
ok("al 80 % avisa",
   clases(sesion({ contexto: 800_000, ventana: 1_000_000 }), mundo()).includes("contexto"));
ok("al 50 % no",
   !clases(sesion({ contexto: 500_000, ventana: 1_000_000 }), mundo()).includes("contexto"));
ok("sin ventana leida, no se inventa un porcentaje",
   !clases(sesion({ contexto: 900_000, ventana: 0 }), mundo()).includes("contexto"));
ok(`justo por debajo del ${CONTEXTO_LLENO} % se calla`,
   !clases(sesion({ contexto: 740_000, ventana: 1_000_000 }), mundo()).includes("contexto"));

/* ── 6. La moderacion, que es la mitad del trabajo ─────────────────────── */
console.log("\n── cuando se calla ──");
{
  const s = sesion({ nacida: AHORA - 2 * MIN, contexto: 900_000 });
  ok("recien abierta no dice nada (gracia)",
     aProponer([s], mundo(), memoriaVacia(), AHORA).length === 0);
}
{
  const s = sesion({ herramientas: ["Read"], ultimoEncargo: "", contexto: 900_000 });
  ok("sin haber hecho nada y sin encargo, tampoco",
     aProponer([s], mundo(), memoriaVacia(), AHORA).length === 0);
}
{
  // Con encargo SI habla aunque lleve pocas herramientas: el encargo ya dice
  // de que va.
  const s = sesion({ herramientas: ["Read"], contexto: 900_000 });
  ok("pero con un encargo escrito si", aProponer([s], mundo(), memoriaVacia(), AHORA).length === 1);
}
{
  const s = sesion({ contexto: 900_000 });
  const uno = aProponer([s], mundo(), memoriaVacia(), AHORA);
  const m2 = anotar(memoriaVacia(), s.sessionId, uno[0].consejo, AHORA);
  ok("lo mismo no se dice dos veces",
     aProponer([s], mundo(), m2, AHORA + ENFRIA_SESION + MIN).length === 0);
}
{
  const s = sesion({ contexto: 900_000 });
  const m2 = anotar(memoriaVacia(), s.sessionId, { clase: "relevo", sujeto: "x", texto: "y" }, AHORA);
  ok("y no se habla otra vez de la misma sesion enseguida",
     aProponer([s], mundo(), m2, AHORA + MIN).length === 0);
}
{
  let m = memoriaVacia();
  const s = sesion({ contexto: 900_000 });
  for (let i = 0; i < TOPE; i++) {
    m = anotar(m, s.sessionId, { clase: "contexto", sujeto: `x${i}`, texto: "y" }, AHORA);
  }
  ok(`con ${TOPE} consejos ya dados, esa sesion se acabo`,
     aProponer([s], mundo(), m, AHORA + 10 * ENFRIA_SESION).length === 0);
}
{
  const a = sesion({ sessionId: "a", contexto: 900_000 });
  const b = sesion({ sessionId: "b", contexto: 900_000, proyecto: "VoCript" });
  ok("con dos sesiones a la vez, solo habla de una",
     aProponer([a, b], mundo(), memoriaVacia(), AHORA).length === 1);
}
{
  const s = sesion({ contexto: 900_000 });
  ok("en modo «nunca» no dice nada, pase lo que pase",
     aProponer([s], mundo(), memoriaVacia(), AHORA, "nunca").length === 0);
}
{
  // En modo prudente, lo de afinar se calla y lo gordo no.
  const s = sesion({ modelo: "opus", ultimoEncargo: "traduce los tooltips" });
  const solas = aProponer([s], mundo(), memoriaVacia(), AHORA, "gordas");
  ok("en modo prudente, un derroche no interrumpe", solas.length === 0);
  ok("  ↳ pero en modo «siempre» si",
     aProponer([s], mundo(), memoriaVacia(), AHORA, "siempre").length === 1);
}

/* ── 7. Y lo mas importante: que primero va lo que mas urge ────────────── */
console.log("\n── el orden ──");
{
  const s = sesion({
    contexto: 900_000, ventana: 1_000_000,
    modelo: "opus", ultimoEncargo: "traduce los tooltips",
    herramientas: Array(30).fill("Read"),
  });
  const m = mundo({ cuentas: [cuenta("claude", "Principal", 90), cuenta("gemini", "M", 10)] });
  const cs = clases(s, m);
  ok("saltan varias a la vez", cs.length >= 2, cs.join(", "));
  ok("y la primera es la del contexto, que es la que se pierde sola",
     cs[0] === "contexto", cs.join(" > "));
}

/* ── 8. Que ninguna frase salga rota ───────────────────────────────────── */
console.log("\n── las frases ──");
{
  const casos: Array<[string, SesionVista, MundoCopiloto]> = [
    ["contexto", sesion({ contexto: 900_000 }), mundo()],
    ["relevo", sesion({ herramientas: Array(30).fill("Read") }),
      mundo({ cuentas: [cuenta("claude", "Principal", 88), cuenta("gemini", "M", 5)] })],
    ["derroche", sesion({ modelo: "opus", ultimoEncargo: "traduce esto" }), mundo()],
    ["porApi", sesion({ contexto: 300_000, ultimoEncargo: "renombra" }),
      mundo({ cuentas: [cuenta("claude", "Principal", 93)], precios: PRECIOS, hayClaveApi: true })],
  ];
  for (const [nombre, s, m] of casos) {
    const c = consejosDe(s, m).find((x) => x.clase === nombre);
    if (!c) { ok(`«${nombre}» sale`, false); continue; }
    ok(`«${nombre}» sin saltos de linea (la bandeja es de una linea)`, !c.texto.includes("\n"));
    ok(`  ↳ y nombra el proyecto`, c.texto.includes("Adeorq"), c.texto.slice(0, 78) + "…");
    ok(`  ↳ y no lleva «undefined» ni «NaN»`, !/undefined|NaN/.test(c.texto));
  }
}

/* -- 9. El boton: que el consejo se pueda HACER, no solo leer --------- */
console.log("\n-- lo que se puede hacer de un clic --");
{
  // Un almacen de mentira, que es lo que `acciones.ts` necesita para vivir
  // fuera de un navegador. Guarda de verdad, para que la ida y la vuelta se
  // prueben enteras y no solo la mitad que escribe.
  const caja: Record<string, string> = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => caja[k] ?? null,
    setItem: (k: string, v: string) => { caja[k] = v; },
    removeItem: (k: string) => { delete caja[k]; },
  };

  const s1 = sesion({ herramientas: Array(30).fill("Read"), ultimoEncargo: "leete los 24 README" });
  const m1 = mundo({ cuentas: [cuenta("claude", "Principal", 88), cuenta("gemini", "M", 5)] });
  const relevo = consejosDe(s1, m1).find((c) => c.clase === "relevo");
  ok("el relevo trae con que abrirlo", relevo?.accion?.hacer === "abrirCli");
  ok("  y en la MISMA carpeta, que es de lo que iba el consejo",
     relevo?.accion?.hacer === "abrirCli" && relevo.accion.cwd === "C:/proyectos/Adeorq");
  ok("  y al cliente que nombra la frase",
     relevo?.accion?.hacer === "abrirCli" && relevo.accion.cli === "gemini");

  const derr = consejosDe(sesion({ modelo: "opus", ultimoEncargo: "traduce esto" }), mundo())
    .find((c) => c.clase === "derroche");
  ok("el derroche en Claude ofrece cambiar el cerebro", derr?.accion?.hacer === "cambiarModelo");
  ok("  y al que dice la frase, no a otro",
     derr?.accion?.hacer === "cambiarModelo" && derr.accion.modelo === "haiku");
  // Codex no entiende «/model» dentro de una sesion: un boton ahi dejaria esa
  // palabra tirada en su caja de texto. El consejo sigue saliendo, sin boton.
  const derrCodex = consejosDe(
    sesion({ cli: "codex", modelo: "opus", ultimoEncargo: "traduce esto" }),
    mundo({ cuentas: [cuenta("codex", "Principal", 30)] }),
  ).find((c) => c.clase === "derroche");
  ok("pero en un cliente que no sabe cambiarlo en vivo, no hay boton",
     !!derrCodex && derrCodex.accion === undefined);

  const api = consejosDe(
    sesion({ contexto: 300_000, ultimoEncargo: "renombra" }),
    mundo({ cuentas: [cuenta("claude", "Principal", 93)], precios: PRECIOS, hayClaveApi: true }),
  ).find((c) => c.clase === "porApi");
  ok("el de API ofrece abrir el chat", api?.accion?.hacer === "abrirChat");
  ok("  y con el modelo que propuso, no con el de por defecto",
     api?.accion?.hacer === "abrirChat" && api.accion.modelo.includes("/"));

  // El de contexto NO lleva boton, y es a proposito: partir una tarea en dos
  // es trabajo de Munir. Un boton que hiciera «algo parecido» seria peor.
  const ctx = consejosDe(sesion({ contexto: 900_000 }), mundo()).find((c) => c.clase === "contexto");
  ok("el de contexto se queda sin boton, que es lo correcto",
     !!ctx && ctx.accion === undefined);

  // Y la ida y la vuelta por el TEXTO de la nota, que es como se emparejan al
  // otro lado: la bandeja es un fichero de texto y no lleva ningun id.
  const texto = relevo!.texto;
  guardarAccion(texto, relevo!.accion!, AHORA);
  ok("la accion vuelve por el texto de la nota", accionDe(texto)?.hacer === "abrirCli");
  ok("  aunque el texto vuelva con espacios de mas",
     accionDe(`  ${texto.replace(/ /g, "  ")}  `)?.hacer === "abrirCli");
  ok("una nota escrita a mano no tiene boton", accionDe("otra cosa cualquiera") === undefined);
  olvidarAccion(texto);
  ok("y al resolverla se olvida", accionDe(texto) === undefined);

  guardarAccion("vieja", { hacer: "abrirChat", modelo: "x/y", nombre: "X" }, AHORA - 30 * 60 * MIN);
  guardarAccion("nueva", { hacer: "abrirChat", modelo: "x/y", nombre: "X" }, AHORA);
  podarAcciones(AHORA, 25 * MIN);
  ok("las viejas se barren", accionDe("vieja") === undefined);
  ok("y las de ahora se quedan", accionDe("nueva")?.hacer === "abrirChat");
}

console.log(`\numbrales: gracia ${GRACIA / MIN} min · apretada ${APRETADA} % · casi agotada ${CASI_AGOTADA} % · minimo ${MINIMO_HERRAMIENTAS} herramientas`);
console.log(fallos === 0 ? "TODO BIEN" : `${fallos} cosa(s) mal.`);
process.exit(fallos === 0 ? 0 : 1);
