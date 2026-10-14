// El enjambre del lienzo, sin ventana: de qué color es cada enjambre, qué dice la
// fila, qué se le cuenta a Adeo, quién acaba de terminar y sobre quién se ha
// soltado una terminal.
//
//   pnpm bancos enjambre
//
// Existe por tres cosas que no se ven mirando la pieza: que una sesión de un
// CLI que no cuenta cómo va no se dé por «trabajando» ni por libre; que el
// estado de una que pregunta le llegue a Rust con la palabra que su reja busca
// (si no, un reparto caería en su menú); y que dos terminales que se rozan al
// ordenarlas no se fundan solas.

import {
  acabanDeTerminar,
  alLado,
  COLORES,
  colorLibre,
  daEstado,
  dondeNace,
  ENJAMBRE_W,
  estadoDeFila,
  estadosLeidos,
  estadosParaAdeo,
  filaDe,
  lectorDeRespuesta,
  nombreNuevo,
  porQueNoSeJuntan,
  puedeEntrar,
  recuento,
  sobreQuien,
  solape,
  SOLAPE_PARA_JUNTAR,
  tinteDe,
  trabajoDe,
  type EstadoFila,
  type SesionVista,
} from "../src/lib/enjambre";
import { PALABRA } from "../src/lib/conserje";
import type { PaneStatus, WorkState } from "../src/lib/pty";

declare const process: { exit(code?: number): never };

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const panel = (id: number, state: WorkState, mas: Partial<PaneStatus> = {}): PaneStatus => ({
  id,
  name: `sesión ${id}`,
  cwd: "C:\\proyectos\\Adeorq",
  agent: true,
  agentsLive: 0,
  state,
  porque: "",
  ...mas,
});
const sesion = (id: number, cli: string, mas: Partial<SesionVista> = {}): SesionVista => ({
  panel: id,
  nombre: `terminal ${id}`,
  carpeta: "C:\\proyectos\\Vidorq",
  cli,
  ...mas,
});

/* ── los colores ──────────────────────────────────────────────────────────── */

const nombres = COLORES.map(([n]) => n);
caso("ningún color se llama igual que otro", new Set(nombres).size === nombres.length);
caso("ningún color pinta igual que otro", new Set(COLORES.map(([, t]) => t.cuerpo)).size === COLORES.length);
caso("el primer enjambre es el azul, que es el Adeo de siempre", colorLibre([]) === "azul");
caso("el segundo enjambre es el verde", colorLibre(["azul"]) === "verde");
caso("se coge el hueco que dejó el que se deshizo", colorLibre(["azul", "violeta"]) === "verde");
const todos = [...nombres];
caso("con todos cogidos se repite el menos usado, desde el azul", colorLibre(todos) === "azul" && colorLibre([...todos, "azul"]) === "verde");
caso("un color que no existe sale sin tinte", tinteDe("fucsia") === undefined && tinteDe(undefined) === undefined);
caso("el azul es el de la mascota", tinteDe("azul")?.cuerpo === "#39a9f6");

/* ── quién entra y de quién se sabe el estado ─────────────────────────────── */

caso("una consola no entra en un enjambre", !puedeEntrar("shell") && puedeEntrar("claude") && puedeEntrar("gemini"));
caso("de Claude Code y de Codex se sabe si trabajan", daEstado("claude") && daEstado("codex"));
caso("de Gemini, Kimi o una consola, no", !daEstado("gemini") && !daEstado("kimi") && !daEstado("shell"));

caso("un CLI con estado: trabajando", estadoDeFila("claude", panel(1, "a_medias")) === "trabajando");
caso("un CLI con estado: ha terminado", estadoDeFila("codex", panel(1, "lista")) === "termino");
caso("un CLI sin estado no se da por trabajando", estadoDeFila("gemini", panel(1, "")) === "nosesabe");
caso("ni por terminado, aunque su pantalla lo pareciera", estadoDeFila("gemini", panel(1, "lista")) === "nosesabe");
caso("pero si pregunta, pregunta: eso sale de la pantalla", estadoDeFila("gemini", panel(1, "pregunta")) === "pregunta");
caso("sin panel está cerrada, sea de quien sea", estadoDeFila("gemini", undefined) === "cerrada");

/* ── la fila ──────────────────────────────────────────────────────────────── */

const fila = filaDe({ panel: 3 }, sesion(3, "claude"), panel(3, "lista", { name: "Arreglar el login", model: "sonnet", percent: 41.6 }));
caso(
  "la fila lleva nombre, proyecto, modelo y CLI, y ningún color: el color es del enjambre",
  fila.nombre === "Arreglar el login" && fila.proyecto === "Adeorq" && fila.modelo === "sonnet" && fila.cli === "claude" && !("color" in fila),
  JSON.stringify(fila),
);
const reciente = filaDe({ panel: 4 }, sesion(4, "codex"), undefined);
caso(
  "sin estado todavía, tira de lo que sabe el lienzo",
  reciente.nombre === "terminal 4" && reciente.proyecto === "Vidorq" && reciente.modelo === "" && reciente.estado === "cerrada",
  JSON.stringify(reciente),
);
caso("sin terminal en el lienzo está cerrada, diga lo que diga un estado viejo", filaDe({ panel: 9 }, undefined, panel(9, "a_medias")).estado === "cerrada");

/* ── el recuento ──────────────────────────────────────────────────────────── */

const cuenta = (e: EstadoFila[]) => recuento(e).map((p) => p.clave.replace("{n}", String(p.n))).join(" · ");
caso("lo urgente primero", cuenta(["trabajando", "pregunta", "termino", "trabajando"]) === "1 te espera · 2 trabajando · 1 ha terminado", cuenta(["trabajando", "pregunta", "termino", "trabajando"]));
caso("los plurales", cuenta(["pregunta", "pregunta", "termino", "termino", "cerrada", "cerrada"]) === "2 te esperan · 2 han terminado · 2 cerradas");
caso("lo que vale cero no sale", cuenta(["nosesabe"]) === "1 sin estado" && cuenta([]) === "");

/* ── lo que se le dice a Adeo ─────────────────────────────────────────────── */

const paraAdeo = estadosParaAdeo([
  fila,
  filaDe({ panel: 5 }, sesion(5, "claude"), panel(5, "pregunta", { percent: 12 })),
  filaDe({ panel: 6 }, sesion(6, "gemini"), panel(6, "")),
  filaDe({ panel: 7 }, undefined, undefined),
]);
caso("una que terminó lleva también cuánto contexto gasta", paraAdeo["3"] === "ha terminado, contexto al 42 %", paraAdeo["3"]);
caso("una que pregunta empieza por la palabra que busca la reja de Rust", paraAdeo["5"].startsWith("te pregunta") && paraAdeo["5"].startsWith(PALABRA.pregunta), paraAdeo["5"]);
caso("una sin estado lo dice", paraAdeo["6"] === "no se sabe", paraAdeo["6"]);
caso("una cerrada no presume de contexto", paraAdeo["7"] === "cerrada", paraAdeo["7"]);

const w = trabajoDe(fila, sesion(3, "claude", { cuenta: "Trabajo" }), "aaaa-1111", 100);
caso(
  "el trabajo que se apunta en Rust lleva nombre, sesión y cuenta",
  w.panel === 3 && w.nombre === "Arreglar el login" && w.sesion === "aaaa-1111" && w.cuenta === "Trabajo" && w.eligio === "tu",
  JSON.stringify(w),
);

/* ── quién acaba de terminar ──────────────────────────────────────────────── */

caso("la que trabajaba y termina", acabanDeTerminar({ 1: "trabajando" }, { 1: "termino" }).join() === "1");
caso("la que preguntaba y termina", acabanDeTerminar({ 1: "pregunta" }, { 1: "termino" }).join() === "1");
caso("la que ya estaba terminada no vuelve a contar", acabanDeTerminar({ 1: "termino" }, { 1: "termino" }).length === 0);
caso("la que entra al grupo ya terminada no trae su respuesta vieja", acabanDeTerminar({}, { 1: "termino" }).length === 0);
caso("la que sigue trabajando no ha terminado", acabanDeTerminar({ 1: "trabajando" }, { 1: "trabajando" }).length === 0);
caso("cada una por su lado", acabanDeTerminar({ 1: "trabajando", 2: "trabajando", 3: "termino" }, { 1: "termino", 2: "trabajando", 3: "termino" }).join() === "1");

// EL CASO DEL TABLERO QUE VUELVE (lo cazó el banco del programa de verdad): una
// terminal que todavía no ha leído su sesión se pinta «trabajando», y lo
// primero que lee de una que ya había acabado es «ha terminado».
const sinLeer = filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, ""));
const yaLeida = filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, "lista"));
caso("una recién abierta se pinta trabajando, pero ese estado no está leído", sinLeer.estado === "trabajando" && !sinLeer.sabido && yaLeida.sabido);
caso("y no entra entre los leídos", estadosLeidos([fila, sinLeer])[3] === "termino" && estadosLeidos([fila, sinLeer])[8] === undefined);
caso("así que de sin leer a terminada no es «acaba de terminar»", acabanDeTerminar(estadosLeidos([sinLeer]), estadosLeidos([yaLeida])).length === 0);
// La que acaba su turno PREGUNTANDO («¿lo conecto a Supabase?») se pinta «te
// pregunta algo», y su pregunta es justo lo que tiene que entrar en el chat.
// La que pide permiso a mitad de turno también pregunta, y no ha acabado nada.
const ofrece = filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, "ofrece"));
const pidePermiso = filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, "pregunta"));
const trabaja = filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, "a_medias"));
caso("acabar con una pregunta es acabar el turno", ofrece.estado === "pregunta" && ofrece.turnoAcabado && acabanDeTerminar(estadosLeidos([trabaja]), estadosLeidos([ofrece])).join() === "8");
caso("pedir permiso a mitad de turno no lo es", pidePermiso.estado === "pregunta" && !pidePermiso.turnoAcabado && acabanDeTerminar(estadosLeidos([trabaja]), estadosLeidos([pidePermiso])).length === 0);
caso("un CLI sin estado nunca tiene el turno acabado", !filaDe({ panel: 8 }, sesion(8, "gemini"), panel(8, "lista")).turnoAcabado);

// De quién se puede traer la respuesta, y de dónde.
caso("la de Claude Code sale de su transcript y la de Codex de su rollout", lectorDeRespuesta("claude") === "transcript" && lectorDeRespuesta("codex") === "rollout");
caso("la de Gemini, Kimi o una consola, de ningún sitio", lectorDeRespuesta("gemini") === undefined && lectorDeRespuesta("kimi") === undefined && lectorDeRespuesta("shell") === undefined);

caso("y de trabajando DE VERDAD a terminada, sí", acabanDeTerminar(estadosLeidos([filaDe({ panel: 8 }, sesion(8, "claude"), panel(8, "a_medias"))]), estadosLeidos([yaLeida])).join() === "8");

/* ── soltar una terminal sobre otra ───────────────────────────────────────── */

const T = { w: 640, h: 420 };
caso("encima del todo es un solape entero", solape({ x: 0, y: 0, ...T }, { x: 0, y: 0, ...T }) === 1);
caso("al lado no hay solape", solape({ x: 0, y: 0, ...T }, { x: 664, y: 0, ...T }) === 0);
caso("una pequeña dentro de una grande cuenta entera", solape({ x: 100, y: 100, w: 100, h: 100 }, { x: 0, y: 0, ...T }) === 1);
const otras = [
  { id: "a", caja: { x: 0, y: 0, ...T } },
  { id: "b", caja: { x: 700, y: 0, ...T } },
];
caso("soltada casi encima de «a», es sobre «a»", sobreQuien({ x: 60, y: 40, ...T }, otras) === "a");
caso("rozando el borde no es sobre nadie", sobreQuien({ x: 560, y: 380, ...T }, otras) === null, `umbral ${SOLAPE_PARA_JUNTAR}`);
caso("a caballo entre dos, la que más tapa", sobreQuien({ x: 500, y: 0, ...T }, otras) === "b");
caso("tapando la mitad justa todavía no", sobreQuien({ x: 320, y: 0, ...T }, [otras[0]]) === null);

// Soltar encima y que no se junten tiene que decir por qué: con dos consolas y
// una sola sesión de agente en el tablero, el silencio se leía como «no hace nada».
caso("una consola soltada sobre una sesión: lo dice", porQueNoSeJuntan(false, { entra: true }, false) === "consola");
caso("una sesión soltada sobre una consola: lo dice", porQueNoSeJuntan(true, { entra: false }, false) === "consola");
caso("dos consolas: lo dice", porQueNoSeJuntan(false, { entra: false }, false) === "consola");
caso("dos sesiones soltadas antes de tiempo: pide aguantar", porQueNoSeJuntan(true, { entra: true }, false) === "pronto");
caso("dos sesiones que sí aguantaron: nada que decir", porQueNoSeJuntan(true, { entra: true }, true) === null);
caso("movida a un hueco libre: nada que decir", porQueNoSeJuntan(true, null, false) === null && porQueNoSeJuntan(false, null, false) === null);

/* ── dónde cae cada cosa ──────────────────────────────────────────────────── */

const enj = { x: 1000, y: 200, w: ENJAMBRE_W, h: 520 };
const p0 = alLado(enj, 0, T.w, T.h);
const p1 = alLado(enj, 1, T.w, T.h);
const p2 = alLado(enj, 2, T.w, T.h);
caso("la que sale queda pegada a la derecha del enjambre, a su altura", p0.x === enj.x + enj.w + 24 && p0.y === enj.y, JSON.stringify(p0));
caso("la segunda, debajo; la tercera, en otra columna", p1.x === p0.x && p1.y === p0.y + T.h + 24 && p2.x === p0.x + T.w + 24 && p2.y === p0.y);
const todas = [0, 1, 2, 3, 4].map((n) => ({ ...alLado(enj, n, T.w, T.h), ...T }));
caso(
  "ninguna tapa a otra ni al enjambre",
  todas.every((a, i) => solape(a, enj) === 0 && todas.every((b, j) => i === j || solape(a, b) === 0)),
);
const nace = dondeNace([{ x: 400, y: 80, ...T }, { x: 100, y: 300, ...T }]);
caso("el enjambre nace a la izquierda de la terminal más a la izquierda", nace.x === 100 - ENJAMBRE_W - 24 && nace.y === 300, JSON.stringify(nace));
caso("y sin tapar ninguna", [{ x: 400, y: 80, ...T }, { x: 100, y: 300, ...T }].every((c) => solape({ ...nace, w: ENJAMBRE_W, h: 520 }, c) === 0));

caso("el nombre nuevo es el primer número libre", nombreNuevo("Enjambre", []) === "Enjambre 1" && nombreNuevo("Enjambre", ["Enjambre 1", "Enjambre 3"]) === "Enjambre 2");

console.log(fallos ? `\n${fallos} MAL` : "\ntodo ok");
process.exit(fallos ? 1 : 0);
