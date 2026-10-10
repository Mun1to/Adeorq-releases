// La campana de avisos y el ánimo de la mascota (`lib/campana.ts`).
//
// Lo que no puede pasar: que un aviso salga dos veces por el mismo motivo, que
// siga «vigente» cuando ya le contestaste, o que arrancar la app te llene la
// lista con lo que dejaste terminado ayer.
//
//   pnpm bancos campana

import { alCambiar, animoDe, sinLeer, TOPE, type Aviso } from "../src/lib/campana";
import type { PaneStatus, WorkState } from "../src/lib/pty";

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

const panel = (id: number, state: WorkState, extra: Partial<PaneStatus> = {}): PaneStatus => ({
  id,
  name: `p${id}`,
  cwd: "C:\\x",
  agent: true,
  agentsLive: 0,
  state,
  porque: `porque ${state}`,
  ...extra,
});
const mapa = (...p: PaneStatus[]) => Object.fromEntries(p.map((x) => [x.id, x]));
/** Pasa una serie de momentos y devuelve la lista final. */
function pelicula(...momentos: Array<Record<number, PaneStatus>>): Aviso[] {
  let lista: Aviso[] = [];
  for (let i = 1; i < momentos.length; i++) lista = alCambiar(lista, momentos[i - 1], momentos[i], i * 1000);
  return lista;
}
const resumen = (l: Aviso[]) => l.map((a) => `${a.paneId}:${a.tipo}${a.vigente ? "" : "(pasado)"}${a.leido ? "(leído)" : ""}`);

// --- cuándo nace un aviso ------------------------------------------------------------
es("de trabajar a preguntarte: un aviso de «espera»", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")))), ["1:espera"]);
es("de trabajar a terminar: un aviso de «hecho»", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")))), ["1:hecho"]);
es("mientras sigue esperándote no sale otro", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")))), ["1:espera"]);
es("arrancar la app con paneles ya terminados no avisa de nada", resumen(pelicula({}, mapa(panel(1, "lista"), panel(2, "pregunta")))), []);
es("una terminal recién abierta que se pone a trabajar tampoco", resumen(pelicula(mapa(panel(1, "")), mapa(panel(1, "a_medias")))), []);
const a = pelicula(mapa(panel(7, "a_medias", { name: "Adeorq · barra" })), mapa(panel(7, "pregunta", { name: "Adeorq · barra", porque: "hay un menú en pantalla" })));
es("el aviso lleva el nombre del panel y el porqué", [a[0].nombre, a[0].porque, a[0].cuando], ["Adeorq · barra", "hay un menú en pantalla", 1000]);

// --- cuándo deja de ser verdad -------------------------------------------------------
es(
  "le contestas y vuelve a trabajar: deja de estar vigente",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "a_medias")))),
  ["1:espera(pasado)"],
);
es("cierras su terminal: también", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), {})), ["1:hecho(pasado)"]);
es(
  "y si vuelve a reclamarte, es un aviso nuevo y el viejo se queda en la historia",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "a_medias")), mapa(panel(1, "lista")))),
  ["1:espera(pasado)", "1:hecho"],
);
es(
  "dos paneles no se pisan",
  resumen(pelicula(mapa(panel(1, "a_medias"), panel(2, "a_medias")), mapa(panel(1, "pregunta"), panel(2, "a_medias")), mapa(panel(1, "pregunta"), panel(2, "lista")))),
  ["1:espera", "2:hecho"],
);
es(
  "uno que había terminado y ahora pregunta, sin verle trabajar en medio: aviso nuevo",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), mapa(panel(1, "pregunta")))),
  ["1:hecho(pasado)", "1:espera"],
);
es(
  "también si arrancó ya terminado (sin aviso) y luego pregunta",
  resumen(pelicula({}, mapa(panel(1, "lista")), mapa(panel(1, "pregunta")))),
  ["1:espera"],
);
es(
  "cambiar entre dos formas de esperarte no es otra cosa: no repite",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "ofrece")), mapa(panel(1, "pregunta")), mapa(panel(1, "tuya")))),
  ["1:espera"],
);
const igual: Aviso[] = pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")));
ok("si nada cambia devuelve la misma lista, para no repintar", alCambiar(igual, mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")), 9) === igual);
const numeros = pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), mapa(panel(1, "a_medias")), mapa(panel(1, "lista"))).map((x) => x.n);
es("cada aviso lleva un número mayor que el anterior", numeros, [1, 2]);

// --- el tope -------------------------------------------------------------------------
let larga: Aviso[] = [];
for (let i = 0; i < TOPE + 15; i++) {
  larga = alCambiar(larga, mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), i);
  larga = alCambiar(larga, mapa(panel(1, "lista")), mapa(panel(1, "a_medias")), i);
}
ok("la historia no crece sin fin", larga.length === TOPE, `mide ${larga.length}`);
ok("y se quedan los más nuevos", larga[larga.length - 1].n === TOPE + 15);

// --- el número de la campana ---------------------------------------------------------
const mezcla: Aviso[] = [
  { n: 1, paneId: 1, nombre: "a", cwd: "", tipo: "espera", porque: "", cuando: 0, leido: false, vigente: false },
  { n: 2, paneId: 2, nombre: "b", cwd: "", tipo: "espera", porque: "", cuando: 0, leido: true, vigente: true },
  { n: 3, paneId: 3, nombre: "c", cwd: "", tipo: "hecho", porque: "", cuando: 0, leido: false, vigente: true },
];
es("cuenta lo vigente sin leer, nada más", sinLeer(mezcla), 1);

// --- el ánimo de la mascota ------------------------------------------------------------
const esperan = pelicula(mapa(panel(1, "a_medias"), panel(2, "a_medias")), mapa(panel(1, "pregunta"), panel(2, "lista")));
es("si alguien te espera, eso manda sobre uno que terminó", animoDe(esperan, mapa(panel(1, "pregunta"), panel(2, "lista"))), "espera");
es("aunque ya hayas abierto la lista: sigue esperándote", animoDe(esperan.map((x) => ({ ...x, leido: true })), mapa(panel(1, "pregunta"))), "espera");
const hecho = pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")));
es("uno que terminó y no has visto", animoDe(hecho, mapa(panel(1, "lista"))), "lista");
es("visto ya, y nadie trabajando: quieta", animoDe(hecho.map((x) => ({ ...x, leido: true })), mapa(panel(1, "lista"))), "quieta");
es("sin avisos y con un agente a medias: trabaja", animoDe([], mapa(panel(1, "a_medias"), panel(2, "lista"))), "trabaja");
es("con subagentes fuera también trabaja", animoDe([], mapa(panel(1, "lista", { agentsLive: 2 }))), "trabaja");
es("un PowerShell a secas no es un agente trabajando", animoDe([], mapa(panel(1, "a_medias", { agent: false }))), "quieta");
es("sin terminales, duerme", animoDe([], {}), "dormida");

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
