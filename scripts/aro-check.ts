// El borde de una terminal en tres estados (`lib/aroDeEstado.ts`), la señal de
// «trabajando» que lo enciende (`crearTrabajando` y `engancharFinDeTurno` en
// `lib/finDeTurno.ts`) y que la hoja no vuelva a pintar los brillos de antes.
//
// Munir, 2026-11-21: «que no hayan tantos colorines de neón alrededor de las
// terminales que molesta a la vista, solo hayan tres claros, rojo porque te
// necesita sí o sí, amarillo porque ha terminado y verde de que está
// trabajando». Eligió la 3: el trabajando en azul, con su tramo que da vueltas.
//
// Lo que no puede pasar, que es lo que se mira aquí:
//   · que una terminal con un permiso en pantalla no salga en rojo;
//   · que el tramo se corte en un respiro entre dos pasos del mismo turno, o
//     que se quede encendido para siempre al acabar;
//   · que el amarillo tape al rojo o al azul;
//   · que vuelva el aro azul del foco, el naranja que respira o el color de
//     cuadrilla y de proyecto en el marco;
//   · que algo de esto se mueva por fotograma;
//   · que el aro, que va encima de la terminal, vuelva a pintarse sobre la
//     primera letra de cada línea o sobre la última fila (la terminal deja su
//     hueco), ni que una regla de otra hoja de `src/` le cambie el padding a
//     `.xterm` o engorde el aro. Esto lee texto; lo que mueve el lienzo de otra
//     forma lo mide en el navegador `scripts/laboratorio/aro-tinta.js`.
//
//   pnpm bancos aro

import { readdirSync, readFileSync } from "node:fs";
import { estadoDelAro } from "../src/lib/aroDeEstado";
import { lectorDeCaja } from "../src/lib/cajaDeEntrada";
import { esperaEnSuCaja, trabajaEnPantalla } from "../src/lib/contexto";
import { ASIENTO_FIN_MS, crearTrabajando, engancharFinDeTurno, MIRAR_CADA_MS, SUELTA_TRABAJO_MS } from "../src/lib/finDeTurno";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
}
function es<T>(nombre: string, visto: T, esperado: T) {
  ok(nombre, JSON.stringify(visto) === JSON.stringify(esperado), `visto ${JSON.stringify(visto)}, esperado ${JSON.stringify(esperado)}`);
}

// --- El orden de los estados -------------------------------------------------
const BASE = {
  exited: false,
  ask: false,
  needsLogin: false,
  trabaja: false,
  seLee: true,
  transcript: undefined,
  agentesVivos: 0,
  termino: false,
} as const;
const de = (m: Partial<Parameters<typeof estadoDelAro>[0]>) => estadoDelAro({ ...BASE, ...m });

es("en reposo, sin color", de({}), "");
es("un permiso en pantalla: te necesita", de({ ask: true }), "necesita");
es("pide iniciar sesión: te necesita", de({ needsLogin: true }), "necesita");
es("trabajando: azul", de({ trabaja: true }), "trabaja");
es("terminó y no la has mirado: amarillo", de({ termino: true }), "termino");
es("el permiso manda sobre el pie que aún dice que trabaja", de({ ask: true, trabaja: true }), "necesita");
es("el permiso manda sobre un turno terminado", de({ ask: true, termino: true }), "necesita");
es("un turno terminado que vuelve a trabajar ya no es amarillo", de({ trabaja: true, termino: true }), "trabaja");
es("un AskUserQuestion que solo dice el transcript: te necesita", de({ transcript: "pregunta" }), "necesita");
es(
  "pero si su pie ya dice que trabaja, esa pregunta está contestada",
  de({ transcript: "pregunta", trabaja: true }),
  "trabaja",
);
es("acabar en una pregunta en prosa es terminar, no necesitarte", de({ transcript: "ofrece", termino: true }), "termino");
es("con la pantalla legible, el «a medias» del transcript no enciende nada", de({ transcript: "a_medias" }), "");
es("donde la pantalla no se sabe leer, el «a medias» del transcript es trabajar", de({ seLee: false, transcript: "a_medias" }), "trabaja");
es("y los subagentes vivos también", de({ seLee: false, agentesVivos: 2 }), "trabaja");
es("un proceso muerto no tiene estado, aunque quedara un menú", de({ exited: true, ask: true, trabaja: true, termino: true }), "");

// --- La señal de trabajando, con su margen para apagarse ---------------------
{
  let reloj = 0;
  const t = crearTrabajando(() => reloj);
  es("se enciende en cuanto lo ve trabajar", t.ver(true), { cambio: true });
  es("y verlo otra vez no cambia nada", t.ver(true), { cambio: false });
  reloj += 100;
  es("al dejar de verlo, espera", t.ver(false), { cambio: false, volverEn: SUELTA_TRABAJO_MS });
  reloj += 500;
  ok("encendido durante el margen", t.si);
  es("un respiro entre dos pasos no lo apaga", t.ver(true), { cambio: false });
  reloj += 10;
  t.ver(false);
  reloj += SUELTA_TRABAJO_MS;
  es("pasado el margen sin verlo, se apaga", t.ver(false), { cambio: true });
  ok("apagado", !t.si);
  es("apagado no vuelve a pedir que se mire", t.ver(false), { cambio: false });
  t.ver(true);
  ok("soltar lo apaga en el acto (un fin de turno dicho)", t.soltar() && !t.si);
  ok("y soltarlo apagado no dice que cambió", !t.soltar());
  ok("el margen es el del fin de turno: el azul y el amarillo se relevan en la misma mirada", SUELTA_TRABAJO_MS === ASIENTO_FIN_MS);
}

// --- Enganchado a un terminal de mentira -------------------------------------
const RAYA = "─".repeat(60);
const TRABAJANDO = ["✶ Drizzling…", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt"];
const PARADA = ["● Hola.", "✻ Brewed for 11s · done 18:44", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle)"];
const MENU = [RAYA, " Bash command", " Do you want to proceed?", " ❯ 1. Yes", "   2. No", "", " Esc to cancel · Tab to amend"];
const GEMINI_TRABAJA = ["", " ⠼ Thinking... (esc to cancel, 5s)", "╭────╮", "│ >   Type your message │", "╰────╯"];
ok("(las pantallas de mentira dicen lo que deben)", trabajaEnPantalla((i) => TRABAJANDO[i] ?? "", TRABAJANDO.length) && esperaEnSuCaja((i) => PARADA[i] ?? "", PARADA.length));

function terminal() {
  let reloj = 0;
  let pantalla = PARADA;
  const relojes: Array<{ en: number; f: () => void; vivo: boolean }> = [];
  const oyentes = { campana: [] as Array<() => void>, escrito: [] as Array<() => void> };
  const term = {
    get rows() {
      return pantalla.length;
    },
    buffer: { active: { baseY: 0, getLine: (y: number) => (pantalla[y] === undefined ? undefined : { translateToString: () => pantalla[y] }) } },
    onBell: (cb: () => void) => (oyentes.campana.push(cb), { dispose: () => {} }),
    onWriteParsed: (cb: () => void) => (oyentes.escrito.push(cb), { dispose: () => {} }),
  };
  return {
    term,
    ahora: () => reloj,
    programar: (f: () => void, ms: number) => {
      const x = { en: reloj + ms, f, vivo: true };
      relojes.push(x);
      return () => (x.vivo = false);
    },
    pasar(ms: number) {
      const hasta = reloj + ms;
      for (;;) {
        const x = relojes.filter((r) => r.vivo && r.en <= hasta).sort((a, b) => a.en - b.en)[0];
        if (!x) break;
        x.vivo = false;
        reloj = x.en;
        x.f();
      }
      reloj = hasta;
    },
    escribe(l: string[]) {
      pantalla = l;
      oyentes.escrito.forEach((f) => f());
    },
  };
}

{
  const m = terminal();
  const dicho: Array<[string, number]> = [];
  const soltar = engancharFinDeTurno(m.term, {
    esClaude: () => true,
    alAcabar: () => dicho.push(["fin", m.ahora()]),
    alTrabajar: (si) => dicho.push([si ? "trabaja" : "para", m.ahora()]),
    ahora: m.ahora,
    programar: m.programar,
  });
  m.escribe(TRABAJANDO);
  es("Claude Code: al verlo trabajar, se enciende", dicho.map((d) => d[0]), ["trabaja"]);
  m.pasar(1000);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS);
  m.escribe(TRABAJANDO);
  m.pasar(5000);
  es("un respiro entre dos pasos no corta el tramo", dicho.map((d) => d[0]), ["trabaja"]);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS + ASIENTO_FIN_MS + 100);
  es("al acabar, se apaga y luego el fin, sin que el programa escriba nada más", dicho.map((d) => d[0]), ["trabaja", "para", "fin"]);
  const [, apaga] = dicho[1];
  const [, fin] = dicho[2];
  ok("en la misma mirada: el azul no se queda un rato sin nada antes del amarillo", apaga === fin, `apaga a los ${apaga} ms, fin a los ${fin} ms`);
  m.escribe(TRABAJANDO);
  m.pasar(300);
  m.escribe(MENU);
  m.pasar(MIRAR_CADA_MS + SUELTA_TRABAJO_MS + 100);
  es(
    "parado en un permiso: deja de trabajar (el rojo lo pone el menú) y no hay fin",
    dicho.slice(3).map((d) => d[0]),
    ["trabaja", "para"],
  );
  soltar();
}

{
  const m = terminal();
  const dicho: string[] = [];
  let cli = "codex";
  engancharFinDeTurno(m.term, {
    esClaude: () => false,
    trabajaCon: () => lectorDeCaja(cli)?.trabaja ?? null,
    alAcabar: () => dicho.push("fin"),
    alTrabajar: (si) => dicho.push(si ? "trabaja" : "para"),
    ahora: m.ahora,
    programar: m.programar,
  });
  m.escribe(TRABAJANDO);
  m.pasar(100);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS + SUELTA_TRABAJO_MS + 100);
  es("Codex: su «esc to interrupt» enciende y apaga el tramo, y el fin sigue siendo de su campana", dicho, ["trabaja", "para"]);
  cli = "gemini";
  m.escribe(GEMINI_TRABAJA);
  m.pasar(MIRAR_CADA_MS);
  es("Gemini: su «esc to cancel» también", dicho.slice(2), ["trabaja"]);
  cli = "opencode";
  ok("(opencode no tiene lector de pantalla)", lectorDeCaja(cli) === null);
  m.escribe(GEMINI_TRABAJA);
  m.pasar(MIRAR_CADA_MS);
  es("un CLI cuya pantalla no se sabe leer: se apaga y lo dice el transcript", dicho.slice(3), ["para"]);
}

{
  const m = terminal();
  let veces = 0;
  engancharFinDeTurno(m.term, { esClaude: () => false, alAcabar: () => {}, alTrabajar: () => veces++, ahora: m.ahora, programar: m.programar });
  m.escribe(TRABAJANDO);
  m.pasar(1000);
  ok("sin decirle cómo leer, fuera de Claude Code no mira la pantalla (como antes)", veces === 0);
}

// --- La hoja ------------------------------------------------------------------
const hoja = (f: string) => readFileSync(`src/estilos/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const todas = ["01-base.css", "03-barra-lateral.css", "05-cabina.css", "06-barra-derecha.css", "10-lienzo.css", "14-lienzo-piezas.css", "19-temas.css", "41-contraste.css", "42-aspectos.css"];
const juntas = todas.map(hoja).join("\n");

ok("los tres colores están definidos", ["--estado-necesita:", "--estado-termino:", "--estado-trabaja:"].every((v) => hoja("01-base.css").includes(v)));
{
  // En el bloque de todos los claros (`data-claro`), no en cada uno: así un
  // claro nuevo no sale con el amarillo de los oscuros.
  const claros = /:root\[data-claro\]\s*\{([^}]*)\}/.exec(hoja("01-base.css"))?.[1] ?? "";
  ok(
    "y los temas claros llevan los suyos",
    ["--estado-necesita:", "--estado-termino:", "--estado-trabaja:"].every((v) => claros.includes(v)),
    "en `:root[data-claro]`: el amarillo de los oscuros sobre blanco no llega a 1,5:1",
  );
}
ok("el «terminó» ya no respira", !/pane-waiting|c3-termino/.test(juntas));
ok("ni pinta el marco ni la cabecera por su cuenta", !/\.pane\[data-done="true"\][^{]*\{/.test(juntas));
ok("el foco no lleva el color de la casa", !/\.pane\[data-focused="true"\][^{]*\{[^}]*var\(--accent\)/.test(juntas));
ok("la cuadrilla no pinta el marco ni la cabecera", !/\.pane\[data-team="true"\][^{]*\{/.test(juntas));
ok("el proyecto de una delegada tampoco, solo su «de: …»", !/\.pane\[data-delegada="true"\](?![^{]*\.pane-de)[^{]*\{/.test(juntas));
ok("el lienzo sin la franja de color arriba", !/\.rf-term::before/.test(juntas));
const cabina = hoja("05-cabina.css");
ok("el tramo va a pasos, no por fotograma", /animation:\s*aro-vuelta\s+4s\s+steps\(100\)/.test(cabina));
ok("el parpadeo, a dos cambios por vuelta y solo con el ajuste", /html\[data-parpadeo\][^{]*\{\s*animation:\s*aro-parpadeo\s+1\.2s\s+steps\(1, end\)/.test(cabina));
ok("y el hilo de la barra, a pasos también", /animation:\s*hilo-vuelta\s+3\.2s\s+steps\(80\)/.test(hoja("03-barra-lateral.css")));
{
  // El aro va por dentro del panel y encima de la terminal: sin hueco, sus 2-3
  // px tapaban la primera letra de cada línea (2026-11-22, medido con píxeles
  // en los cuatro estilos y los tres estados, a 100 % y 125 %), y la última
  // fila cuando sobraban menos de 3 px abajo al 100 % (624-1.872 píxeles de
  // tinta; al 125 % el grueso es de 3,75 px de pantalla).
  const grueso = Number(/--aro-grueso:\s*(\d+(?:\.\d+)?)px/.exec(cabina)?.[1] ?? 0);
  const sombras = [...cabina.matchAll(/\.pane-aro\s*\{[^}]*box-shadow:\s*inset 0 0 0 (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  ok("el grueso del aro cubre su sombra más ancha", grueso > 0 && sombras.length > 0 && sombras.every((s) => s <= grueso), `--aro-grueso ${grueso}px, sombras ${sombras.join(", ")} px`);
  ok("el tramo de «trabajando» tiene ese grueso", /data-estado="trabaja"\]\s*>\s*\.pane-aro\s*\{[^}]*padding:\s*var\(--aro-grueso\)/.test(cabina));
  // Y un píxel de aire: a 125 % el borde suavizado del tramo (3,75 px de
  // pantalla) teñía la primera columna con un hueco de solo 3.
  ok("el hueco es el grueso y un píxel de aire", /--aro-hueco:\s*calc\(var\(--aro-grueso\)\s*\+\s*1px\)/.test(cabina));

  // Esto es la primera red, la barata, y solo mira el texto. Con mirar un
  // bloque de dos hojas, se lo saltaba una regla de estilo en otra hoja
  // (`…[data-aspecto="liso"] .pane-term .xterm{padding:0}`), un `padding:`
  // abreviado detrás o las variables redefinidas en `.grid > .pane` (lo
  // encontró la revisión del 2026-11-22). Así que se leen TODAS las hojas de
  // `src/`, con las reglas que van dentro de un `@media`, un `@layer` o un
  // `@container`, y cada `padding` sobre `.xterm` (o `.terminal`, que xterm
  // pone en el mismo elemento) tiene que ser uno de estos, ni más ni menos.
  // Lo que NO ve, y dos revisiones lo midieron pintando encima de la tinta:
  //   · los selectores que no acaban en `.xterm` o `.terminal`: un anidado con `&`,
  //     un `:not()` o un `:where()` con espacios detrás, `> *`, `> div`, un nombre
  //     de clase escapado (`.x\74 erm`);
  //   · lo que mueve el lienzo sin padding: `margin`, `inset`, `top`/`left`,
  //     `transform` o `translate` en `.xterm`, `.xterm-screen` o su `canvas`,
  //     `all: revert`, y el padding de `.pane-term`;
  //   · lo que engorda el aro sin sombra ni borde: quitarle la `mask` al tramo,
  //     un `filter`, su `inset`, o una esquina interior mayor.
  // Eso lo caza `scripts/laboratorio/aro-tinta.js`, que fotografía la terminal
  // con el aro y sin él y cuenta los píxeles de tinta que pisa. Lo que no ve
  // NINGUNA de las dos redes: un `@keyframes` que engorde el aro (aquí no se
  // mira dentro, y el banco fotografía con las animaciones canceladas) y una
  // regla que solo valga en «terminó», con menos movimiento, el tema claro o el
  // modo rendimiento (el banco no los pone). Y escribir el
  // hueco abreviado (`padding: 0 0 var(--aro-hueco) var(--aro-hueco)`) da rojo
  // aunque esté bien: aquí se quieren las dos líneas largas.
  const hojasDeSrc = ["App.css", ...readdirSync("src/estilos").filter((f) => f.endsWith(".css")).map((f) => `estilos/${f}`)];
  const reglas = hojasDeSrc.flatMap((f) =>
    [...readFileSync(`src/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      f,
      sel: m[1].trim().replace(/\s+/g, " "),
      decl: m[2]
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " ").replace(/^([\w-]+)\s*:\s*/, "$1: "))
        .filter(Boolean),
    })),
  );
  const tocaXterm = (sel: string) =>
    sel.split(",").some((s) => /\.(xterm|terminal)(?![\w-])[^\s>+~]*$/.test(s.trim()) || /\[class[~*^|$]?=["']?(xterm|terminal)["'\s\]]/.test(s));
  const esperado: Record<string, string[]> = {
    "estilos/05-cabina.css|.pane-term .xterm": ["padding-left: var(--aro-hueco)", "padding-bottom: var(--aro-hueco)"],
    'estilos/42-aspectos.css|:root[data-aspecto="consola"] .grid > .pane > .pane-term .xterm': ["padding-top: var(--aro-hueco)", "padding-bottom: 0"],
  };
  const visto: Record<string, string[]> = {};
  for (const r of reglas.filter((r) => tocaXterm(r.sel))) {
    const pads = r.decl.filter((d) => /^padding(-[a-z-]+)?\s*:/.test(d));
    if (pads.length) (visto[`${r.f}|${r.sel}`] ??= []).push(...pads);
  }
  const igual = (a: string[] = [], b: string[] = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  ok("la terminal deja el hueco del aro a la izquierda y abajo", igual(visto[Object.keys(esperado)[0]], Object.values(esperado)[0]), JSON.stringify(visto[Object.keys(esperado)[0]] ?? []));
  ok("y en Consola, con la cabecera abajo, arriba en vez de abajo", igual(visto[Object.keys(esperado)[1]], Object.values(esperado)[1]), JSON.stringify(visto[Object.keys(esperado)[1]] ?? []));
  const intrusas = Object.keys(visto).filter((k) => !(k in esperado));
  ok("ninguna otra regla de src/ le cambia el padding a la terminal", intrusas.length === 0, intrusas.map((k) => `${k} → ${visto[k].join("; ")}`).join(" · "));
  // Y el aro no puede engordar desde otra hoja: su sombra y el padding del
  // tramo, en cualquier regla de `src/` que le dé estilo al propio `.pane-aro`.
  // Los colores (`var()`, `color-mix()`) llevan comas y números dentro: fuera.
  const sinParentesis = (t: string) => {
    let s = t;
    while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, "");
    return s;
  };
  const delAro = reglas.filter((r) => r.sel.split(",").some((s) => /\.pane-aro(?![\w-])[^\s>+~]*$/.test(s.trim())));
  const gordas = delAro.flatMap((r) =>
    r.decl
      .filter((d) => {
        const sombra = /^box-shadow: (.*)$/.exec(d);
        if (sombra) {
          // Una sombra entera dentro de una variable no se puede leer: rojo.
          if (/^var\(/.test(sombra[1].trim())) return true;
          // Cada sombra `inset`, sin desplazar ni difuminar, y de --aro-grueso como mucho.
          return sinParentesis(sombra[1])
            .split(",")
            .filter((s) => /\binset\b/.test(s))
            .some((s) => {
              const n = [...s.matchAll(/(-?\d+(?:\.\d+)?)(px)?\b/g)].map((m) => Number(m[1]));
              return n.length !== 4 || n.slice(0, 3).some((v) => v !== 0) || n[3] > grueso;
            });
        }
        // Un borde o un contorno en el aro también pintan por dentro (`border-radius` no).
        if (/^(border(?!-radius|-[a-z]+-radius)|outline)(-[a-z-]+)?:/.test(d)) return !/:\s*(0|none)(px)?$/.test(d);
        return /^padding(-[a-z-]+)?:/.test(d) && d !== "padding: var(--aro-grueso)";
      })
      .map((d) => `${r.f}|${r.sel} → ${d}`),
  );
  ok("ninguna regla de src/ le da al aro más sombra, padding, borde o contorno que --aro-grueso", gordas.length === 0, gordas.join(" · "));
  const dondeVariables = reglas.filter((r) => r.decl.some((d) => /^--aro-(grueso|hueco)\s*:/.test(d))).map((r) => `${r.f}|${r.sel}`);
  ok("las dos variables del aro se definen solo en `.pane {` de 05-cabina.css", dondeVariables.length === 1 && dondeVariables[0] === "estilos/05-cabina.css|.pane", dondeVariables.join(" · "));
}
const paso = (ms: number, pasos: number) => ms / pasos;
ok("el tramo y el hilo dan el paso a la vez (40 ms)", paso(4000, 100) === paso(3200, 80));
const temas = hoja("19-temas.css");
ok(
  "el modo rendimiento les quita pasos, no los apaga, y siguen a la vez (80 ms)",
  /steps\(50\)/.test(temas) && /steps\(40\)/.test(temas) && paso(4000, 50) === paso(3200, 40) && !/data-estado="trabaja"\][^{]*\{[^}]*animation:\s*none/.test(temas),
);

console.log(fallos ? `\n${fallos} en rojo` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
