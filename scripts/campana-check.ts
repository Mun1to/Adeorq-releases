// La campana de avisos y el ánimo de la mascota (`lib/campana.ts`).
//
// Lo que no puede pasar: que un aviso salga dos veces por el mismo motivo, que
// siga en la lista cuando ya le contestaste o ya lo viste, o que arrancar la
// app te la llene con lo que dejaste terminado ayer.
//
//   pnpm bancos campana

import { alCambiar, animoDe, SALTO_MS, sinLeer, TOPE, trasEntrar, trasVerla, type Aviso } from "../src/lib/campana";
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
const resumen = (l: Aviso[]) => l.map((a) => `${a.paneId}:${a.tipo}${a.leido ? "(leído)" : ""}`);

// --- cuándo nace un aviso ------------------------------------------------------------
es("de trabajar a preguntarte: un aviso de «espera»", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")))), ["1:espera"]);
es("de trabajar a terminar: un aviso de «hecho»", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")))), ["1:hecho"]);
es("mientras sigue esperándote no sale otro", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")))), ["1:espera"]);
es("arrancar la app con paneles ya terminados no avisa de nada", resumen(pelicula({}, mapa(panel(1, "lista"), panel(2, "pregunta")))), []);
es("una terminal recién abierta que se pone a trabajar tampoco", resumen(pelicula(mapa(panel(1, "")), mapa(panel(1, "a_medias")))), []);
const a = pelicula(mapa(panel(7, "a_medias", { name: "Adeorq · barra" })), mapa(panel(7, "pregunta", { name: "Adeorq · barra", porque: "hay un menú en pantalla" })));
es("el aviso lleva el nombre del panel y el porqué", [a[0].nombre, a[0].porque, a[0].cuando], ["Adeorq · barra", "hay un menú en pantalla", 1000]);

// --- cuándo deja de ser verdad, y se va solo -----------------------------------------
es(
  "le contestas y vuelve a trabajar: el aviso se va",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "a_medias")))),
  [],
);
es("cierras su terminal: también", resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), {})), []);
es(
  "y si vuelve a reclamarte, es un aviso nuevo y del viejo no queda nada",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")), mapa(panel(1, "a_medias")), mapa(panel(1, "lista")))),
  ["1:hecho"],
);
es(
  "dos paneles no se pisan",
  resumen(pelicula(mapa(panel(1, "a_medias"), panel(2, "a_medias")), mapa(panel(1, "pregunta"), panel(2, "a_medias")), mapa(panel(1, "pregunta"), panel(2, "lista")))),
  ["1:espera", "2:hecho"],
);
es(
  "uno que había terminado y ahora pregunta, sin verle trabajar en medio: el aviso pasa a ser de «espera»",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), mapa(panel(1, "pregunta")))),
  ["1:espera"],
);
es(
  "también si arrancó ya terminado (sin aviso) y luego pregunta",
  resumen(pelicula({}, mapa(panel(1, "lista")), mapa(panel(1, "pregunta")))),
  ["1:espera"],
);
es(
  "cambiar entre dos formas de esperarte no es otra cosa: no repite",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "ofrece")), mapa(panel(1, "pregunta")), mapa(panel(1, "ofrece")))),
  ["1:espera"],
);
es(
  "arrancar la app de verdad: cada panel pasa por «» antes de leerse, y tampoco avisa",
  resumen(pelicula({}, mapa(panel(1, ""), panel(2, ""), panel(3, "")), mapa(panel(1, "lista"), panel(2, "tuya"), panel(3, "ofrece")))),
  [],
);
es(
  "le escribes a una que había terminado: su «terminó» se va y no sale ningún «te espera»",
  resumen(pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "lista")), mapa(panel(1, "tuya")))),
  [],
);
es(
  "y cuando contesta, aunque no se le viera trabajar, avisa de que terminó",
  resumen(pelicula(mapa(panel(1, "lista")), mapa(panel(1, "tuya")), mapa(panel(1, "lista")))),
  ["1:hecho"],
);
es(
  "una terminal nueva que pide permiso nada más nacer sí avisa",
  resumen(pelicula(mapa(panel(1, "")), mapa(panel(1, "pregunta")))),
  ["1:espera"],
);
const igual: Aviso[] = pelicula(mapa(panel(1, "a_medias")), mapa(panel(1, "pregunta")));
ok("si nada cambia devuelve la misma lista, para no repintar", alCambiar(igual, mapa(panel(1, "pregunta")), mapa(panel(1, "pregunta")), 9) === igual);
const numeros = pelicula(
  mapa(panel(1, "a_medias"), panel(2, "a_medias")),
  mapa(panel(1, "lista"), panel(2, "a_medias")),
  mapa(panel(1, "lista"), panel(2, "lista")),
).map((x) => x.n);
es("cada aviso lleva un número mayor que el anterior", numeros, [1, 2]);

// --- el tope -------------------------------------------------------------------------
const muchos = Array.from({ length: TOPE + 15 }, (_, i) => i + 1);
const larga = alCambiar([], mapa(...muchos.map((id) => panel(id, "a_medias"))), mapa(...muchos.map((id) => panel(id, "lista"))), 5);
ok("la lista no crece sin fin", larga.length === TOPE, `mide ${larga.length}`);
ok("y se quedan los más nuevos", larga[larga.length - 1].n === TOPE + 15);

// --- el número de la campana ---------------------------------------------------------
const mezcla: Aviso[] = [
  { n: 1, paneId: 1, nombre: "a", cwd: "", tipo: "espera", porque: "", cuando: 0, leido: false },
  { n: 2, paneId: 2, nombre: "b", cwd: "", tipo: "espera", porque: "", cuando: 0, leido: true },
  { n: 3, paneId: 3, nombre: "c", cwd: "", tipo: "hecho", porque: "", cuando: 0, leido: false },
];
es("cuenta lo que no has visto, nada más", sinLeer(mezcla), 2);

// --- lo visto se quita solo ------------------------------------------------------------
es("cierras la lista: lo que terminó se va y lo que te espera se queda, leído", resumen(trasVerla(mezcla)), ["1:espera(leído)", "2:espera(leído)"]);
const yaVista = trasVerla(mezcla);
ok("y si no hay nada que quitar ni que marcar, devuelve la misma lista", trasVerla(yaVista) === yaVista);
es("entras en la terminal que terminó: su aviso se va", resumen(trasEntrar(mezcla, 3, SALTO_MS)), ["1:espera", "2:espera(leído)"]);
ok("entras en una que te espera: su aviso se queda hasta que le contestes", trasEntrar(mezcla, 1, SALTO_MS) === mezcla);
ok("entras en una sin avisos: la misma lista", trasEntrar(mezcla, 9, SALTO_MS) === mezcla);
ok(
  "si el foco llegó a la vez que el aviso (el salto automático), no cuenta como visto",
  trasEntrar(mezcla, 3, SALTO_MS - 1) === mezcla,
);

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

// --- lo que Adeo sabe además de las terminales ------------------------------------------
const trabajan = mapa(panel(1, "a_medias"));
es("una decisión viva la deja con la duda, aunque haya agentes trabajando", animoDe([], trabajan, { decisiones: 1 }), "duda");
es("pero una terminal que te espera va antes que una decisión", animoDe(esperan, mapa(panel(1, "pregunta")), { decisiones: 2 }), "espera");
es("la duda va antes que celebrar que uno terminó", animoDe(hecho, mapa(panel(1, "lista")), { decisiones: 1 }), "duda");
es("un encargo programado parado la apura", animoDe([], trabajan, { cortados: 1 }), "apurada");
es("aunque primero celebra lo que no has visto", animoDe(hecho, mapa(panel(1, "lista")), { cortados: 1 }), "lista");
es("con música y nadie trabajando, baila", animoDe([], mapa(panel(1, "lista")), { suena: true }), "baila");
es("también sin ninguna terminal abierta", animoDe([], {}, { suena: true }), "baila");
es("pero si hay agentes trabajando, teclea aunque suene música", animoDe([], trabajan, { suena: true }), "trabaja");
es("sin señales, lo de siempre", animoDe([], mapa(panel(1, "lista")), { decisiones: 0, cortados: 0, suena: false }), "quieta");

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
