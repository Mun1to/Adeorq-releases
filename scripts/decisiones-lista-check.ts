// La lista única de la pestaña Decisiones (`lib/decisionesLista.ts`).
//
// Lo que no puede pasar: que algo que te toca salga detrás de lo que solo hay
// que mirar, que una terminal salga dos veces por lo mismo, que la pestaña
// cuente ideas o turnos acabados como si te esperaran, que al contestar una
// la vista salte arriba del todo, o que J pase del último al primero.
//
//   pnpm bancos decisiones-lista

import { cuantasTeTocan, juntar, laAbierta, vecina, type Fuentes } from "../src/lib/decisionesLista";
import type { Aviso } from "../src/lib/campana";
import type { Decision, Vigencia } from "../src/lib/decisiones";
import type { Programado } from "../src/lib/programados";
import type { Note } from "../src/lib/pty";

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

const dec = (id: string, vigencia: Vigencia, creada: number, panel?: number): Decision => ({
  id,
  titulo: id,
  creada,
  panel,
  preguntas: [],
  vigencia,
});
const aviso = (paneId: number, tipo: Aviso["tipo"], cuando: number): Aviso => ({
  n: paneId,
  paneId,
  nombre: `p${paneId}`,
  cwd: "C:\\proyectos\\Adeorq",
  tipo,
  porque: "",
  cuando,
  leido: false,
});
const prog = (id: string, cortado: number | null): Programado =>
  ({ id, nombre: id, cwd: "C:\\x", cortado: cortado == null ? null : { cuando: cortado, motivo: "tres fallos" } }) as unknown as Programado;
const nota = (line: number): Note => ({ line, kind: "idea", project: "Adeorq", text: `nota ${line}` });

const vacio: Fuentes = { decisiones: [], avisos: [], programados: [], notas: [] };
const ids = (f: Partial<Fuentes>) => juntar({ ...vacio, ...f }).map((c) => c.id);

// --- el orden de las partes -----------------------------------------------------
{
  const todo = juntar({
    decisiones: [dec("vieja", "contestada", 50), dec("viva", "viva", 40, 7)],
    avisos: [aviso(2, "hecho", 90), aviso(3, "espera", 10)],
    programados: [prog("noche", 30), prog("sano", null)],
    notas: [nota(1), nota(2)],
  });
  es("primero te toca, luego terminó, ideas y lo que ya pasó", todo.map((c) => c.parte), [
    "toca", "toca", "toca", "termino", "ideas", "ideas", "pasado",
  ]);
  es("en Te toca, la terminal que espera, la decisión y el encargo parado", todo.slice(0, 3).map((c) => c.clase), ["contesta", "decide", "parado"]);
  ok("un «terminó» va detrás aunque sea lo más nuevo", todo[3].id === "aviso:2", todo[3].id);
  es("un encargo sano no sale", todo.filter((c) => c.clase === "parado").map((c) => c.id), ["prog:noche"]);
  es("la pestaña cuenta solo lo que te toca", cuantasTeTocan(todo), 3);
}

// --- dentro de una parte, lo más nuevo arriba --------------------------------------
es(
  "dos decisiones vivas, la más nueva primero",
  ids({ decisiones: [dec("a", "viva", 10), dec("b", "viva", 20)] }),
  ["dec:b", "dec:a"],
);
es("las ideas, la última del archivo arriba", ids({ notas: [nota(3), nota(9), nota(5)] }), ["nota:9", "nota:5", "nota:3"]);
es(
  "lo que ya pasó, por lo último que le pasó",
  ids({
    decisiones: [
      { ...dec("pedida-antes", "contestada", 10), respuesta: { cuando: 100, desde: "el PC", elecciones: {}, entregada: true } },
      dec("pedida-despues", "descartada", 50),
    ],
  }),
  ["dec:pedida-antes", "dec:pedida-despues"],
);
ok("una huérfana o una hablada ya no te toca", cuantasTeTocan(juntar({ ...vacio, decisiones: [dec("h", "huerfana", 1), dec("x", "hablada", 2)] })) === 0);

// --- una terminal, una fila ------------------------------------------------------
es(
  "el «terminó» de la terminal que dejó una decisión viva no sale",
  ids({ decisiones: [dec("d", "viva", 5, 4)], avisos: [aviso(4, "hecho", 9)] }),
  ["dec:d"],
);
es(
  "pero un «te espera» de esa terminal sí: un permiso necesita su tecla",
  ids({ decisiones: [dec("d", "viva", 5, 4)], avisos: [aviso(4, "espera", 9)] }),
  ["aviso:4", "dec:d"],
);
es(
  "una decisión que ya pasó no esconde el «terminó» de su terminal",
  ids({ decisiones: [dec("d", "contestada", 5, 4)], avisos: [aviso(4, "hecho", 9)] }),
  ["aviso:4", "dec:d"],
);

// --- cuál se abre -----------------------------------------------------------------
{
  const lista = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], notas: [nota(1)], decisiones: [dec("x", "contestada", 1)] });
  ok("con nada que te toque, al entrar no se abre ninguna", laAbierta(lista, null, -1) === undefined);
  const conViva = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], decisiones: [dec("v", "viva", 1)] });
  ok("al entrar, la primera que te toca, no lo que terminó", laAbierta(conViva, null, -1)?.id === "dec:v");
  ok("la que tenías abierta sigue abierta", laAbierta(lista, "nota:1", 1)?.id === "nota:1");
  const sinLaIdea = juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)], decisiones: [dec("x", "contestada", 1)] });
  ok("si se va, la que ocupa su sitio", laAbierta(sinLaIdea, "nota:1", 1)?.id === "dec:x", laAbierta(sinLaIdea, "nota:1", 1)?.id);
  ok("si se va la última, la que queda encima", laAbierta(juntar({ ...vacio, avisos: [aviso(2, "hecho", 9)] }), "nota:1", 1)?.id === "aviso:2");
  ok("con la lista vacía, ninguna", laAbierta([], "nota:1", 0) === undefined);
}

// --- J y K --------------------------------------------------------------------------
{
  const lista = juntar({ ...vacio, notas: [nota(1), nota(2), nota(3)] });
  ok("J baja", vecina(lista, "nota:3", 1)?.id === "nota:2");
  ok("K sube", vecina(lista, "nota:2", -1)?.id === "nota:3");
  ok("J en la última se queda en la última", vecina(lista, "nota:1", 1)?.id === "nota:1");
  ok("K en la primera se queda en la primera", vecina(lista, "nota:3", -1)?.id === "nota:3");
  ok("sin ninguna abierta, J abre la primera", vecina(lista, null, 1)?.id === "nota:3");
  ok("sin ninguna abierta, K abre la última", vecina(lista, null, -1)?.id === "nota:1");
  ok("en una lista vacía, nada", vecina([], null, 1) === undefined);
}

if (fallos) {
  console.error(`\n${fallos} en rojo:\n  ${rojos.join("\n  ")}`);
  process.exit(1);
}
console.log("\nLa lista de Decisiones, en verde.");
