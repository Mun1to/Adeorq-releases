// El conserje: que lo que pide se haga como toca, con el router o sin él.
//
//   npx tsc scripts/conserje-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   NODE_PATH=<repo>/node_modules node <tmp>/scripts/conserje-check.js
//
// Lo que persigue: el interruptor del router tiene que ser DE VERDAD. Encendido,
// cada trabajo pasa por `recetar` y queda apuntado que lo eligió el router con
// su porqué; apagado, se usa lo que tenga puesto Munir y queda apuntado que lo
// eligió él. Y lo que no se pudo hacer se dice, no desaparece.

import {
  claveDe,
  ejecutar,
  enMarcha,
  estadoDe,
  estadosParaElConserje,
  exigenciaDe,
  hoja,
  paneDe,
  resumenDePestanas,
  type Accion,
  type Manos,
  type Trabajo,
} from "../src/lib/conserje";
import type { PaneStatus } from "../src/lib/pty";
import type { Receta } from "../src/lib/router";

declare const process: { exit(codigo: number): never };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const abrirAdeorq: Accion = {
  tipo: "abrir",
  encargo: "que el scroll no salte al cambiar el ancho",
  carpeta: "C:\\proyectos\\Adeorq",
  clase: "juicio",
  consecuencia: "alta",
  largo: false,
  trabajo: "codigo",
};

// `null` y no `undefined` para decir «no se pudo abrir»: un `undefined` pasado
// a un parámetro con valor por defecto USA el valor por defecto, y la prueba del
// fallo abría la sesión igual.
function manos(router: boolean, abrirDa: number | null = 7): Manos & { abiertas: string[]; pedidas: unknown[] } {
  const abiertas: string[] = [];
  const pedidas: unknown[] = [];
  return {
    router,
    abiertas,
    pedidas,
    recetar: (ex) => {
      pedidas.push(ex);
      return { cli: "claude", modelo: "opus", esfuerzo: "high", porque: ["es de juicio", "tu cuenta tiene semana"] } as Receta;
    },
    fijo: { cli: "claude", modelo: "sonnet" },
    abrir: (r, cwd, label) => {
      abiertas.push(`${label}|${r.modelo}|${cwd}`);
      return abrirDa ?? undefined;
    },
    escribir: async (panel) => panel === 7,
    ahora: () => 1000,
  };
}

// ── Con el router encendido ─────────────────────────────────────────────────
(async () => {
  {
    const m = manos(true);
    const h = await ejecutar([abrirAdeorq], m);
    ok("con el router encendido, se le pregunta al router", m.pedidas.length === 1);
    ok("y lo que se le pasa es la exigencia que dijo el conserje", JSON.stringify(m.pedidas[0]) === JSON.stringify({ clase: "juicio", consecuencia: "alta", largo: false, trabajo: "codigo" }));
    ok("se abre con lo que recetó el router", m.abiertas[0] === "Adeorq · claude|opus|C:\\proyectos\\Adeorq", m.abiertas[0]);
    const t: Trabajo | undefined = h.abiertos[0];
    ok("la pestaña apunta que lo eligió el router", t?.eligio === "router");
    ok("y su porqué, para enseñarlo", t?.porque === "es de juicio tu cuenta tiene semana", t?.porque);
    ok("con su panel", t?.panel === 7);
  }

  // ── Con el router apagado ───────────────────────────────────────────────────
  {
    const m = manos(false);
    const h = await ejecutar([abrirAdeorq], m);
    ok("con el router apagado NO se le pregunta", m.pedidas.length === 0);
    ok("se abre con lo que tenga puesto Munir", m.abiertas[0]?.includes("|sonnet|"), m.abiertas[0]);
    ok("y queda apuntado que lo eligió él", h.abiertos[0]?.eligio === "tu");
    ok("sin un porqué inventado", h.abiertos[0]?.porque === "");
  }

  // ── Lo que falla se dice ────────────────────────────────────────────────────
  {
    const h = await ejecutar([abrirAdeorq], manos(true, null));
    ok("si no se pudo abrir, se dice y no hay pestaña", h.abiertos.length === 0 && h.fallos.length === 1);
  }
  {
    const h = await ejecutar(
      [
        { tipo: "escribir", panel: 7, texto: "sí, tócalo" },
        { tipo: "escribir", panel: 9, texto: "hola" },
      ],
      manos(true),
    );
    ok("escribir en su panel llega", h.escritos.join() === "7");
    ok("y lo que no llegó se cuenta", h.fallos.length === 1 && h.fallos[0].includes("9"));
  }

  // ── Los estados de las pestañas ─────────────────────────────────────────────
  const panel = (id: number, state: PaneStatus["state"]): PaneStatus => ({
    id,
    name: "",
    cwd: "",
    agent: true,
    agentsLive: 0,
    state,
  });
  ok("a medias es trabajando", estadoDe(panel(1, "a_medias")) === "trabajando");
  ok("recién abierta (sin estado) también es trabajando", estadoDe(panel(1, "")) === "trabajando");
  ok("una pregunta es que te pregunta", estadoDe(panel(1, "pregunta")) === "pregunta");
  ok("ofrecer algo también te pregunta", estadoDe(panel(1, "ofrece")) === "pregunta");
  ok("lista es que ha terminado", estadoDe(panel(1, "lista")) === "termino");
  ok("sin panel es que se cerró", estadoDe(undefined) === "cerrada");

  const trabajos = [{ panel: 7 }, { panel: 8 }] as Trabajo[];
  const estados = estadosParaElConserje(trabajos, [panel(7, "pregunta")]);
  ok("el conserje sabe cuál te pregunta", estados["7"] === "te pregunta algo");
  ok("y cuál se cerró", estados["8"] === "cerrada");

  // ── Los paneles vuelven a contar desde 1 al abrir Adeorq ─────────────────────
  // El «panel 1» de ayer es hoy otra terminal: solo es suyo con el arranque
  // de ahora. Sin esto, la pestaña de la semana pasada enseñaba el estado de
  // una terminal que no era la suya y se le apuntaba su sesión.
  const ayer = { panel: 1, arranque: 111 } as Trabajo;
  const hoy = { panel: 1, arranque: 222 } as Trabajo;
  const vivos = [panel(1, "a_medias")];
  ok("el panel de hoy es suyo", paneDe(hoy, vivos, 222)?.id === 1);
  ok("el mismo número de otro arranque no", paneDe(ayer, vivos, 222) === undefined);
  ok("sin saber aún el arranque, ninguno", paneDe(hoy, vivos, null) === undefined);
  ok("el de antes del campo (sin arranque) tampoco", paneDe({ panel: 1 } as Trabajo, vivos, 222) === undefined);
  ok("dos con el mismo panel son dos pestañas", claveDe(ayer) !== claveDe(hoy));

  // ── Lo que dice la pestaña del conserje y la cabecera ───────────────────────
  const r = (e: Parameters<typeof resumenDePestanas>[0]) => resumenDePestanas(e);
  ok("quien te pregunta va primero", r(["trabajando", "pregunta", "termino"]).clave === "{n} te espera");
  ok("con dos, en plural", r(["pregunta", "pregunta"]).clave === "{n} te esperan");
  ok("luego quien ha terminado", r(["trabajando", "termino"]).clave === "{n} ha terminado");
  ok("luego quien trabaja, con cuántos", r(["trabajando", "trabajando", "cerrada"]).n === 2);
  ok("todas cerradas no es «todo en marcha»", r(["cerrada", "cerrada"]).clave === "dime qué hacemos");
  ok("las cerradas no cuentan en marcha", enMarcha(["cerrada", "trabajando"]).clave === "1 sesión en marcha");
  ok("ninguna viva es nada en marcha", enMarcha(["cerrada"]).clave === "nada en marcha");

  ok("la carpeta se nombra por su hoja", hoja("C:\\proyectos\\crypto\\radar-bot") === "radar-bot");
  ok(
    "la exigencia no se inventa una consecuencia baja",
    exigenciaDe({ ...abrirAdeorq, consecuencia: "rara" } as Extract<Accion, { tipo: "abrir" }>).consecuencia === "alta",
  );

  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
  if (fallos) process.exit(1);
})();
