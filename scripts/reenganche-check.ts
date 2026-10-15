// Qué panel guardado es qué terminal viva al volver tras una caída
// (`lib/reenganche.ts`).
//
// Lo que no puede pasar: que un panel se enganche a la terminal de OTRO (el
// mismo número de otro arranque, otra carpeta), que una viva se adopte dos
// veces, que lo vivo sin panel se pierda, o que un panel nuevo nazca con el
// número de una viva.
//
//   pnpm bancos reenganche

import {
  emparejar,
  espejoDe,
  mismaCarpeta,
  panelesDelLienzo,
  repartir,
  siguienteLibre,
  type Viva,
} from "../src/lib/reenganche";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const bien = JSON.stringify(sale) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${JSON.stringify(sale)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

const viva = (id: number, cwd: string, command: string[] | null = null): Viva => ({ id, cwd, command });
const claude = (s: string) => ["cmd.exe", "/k", `claude --session-id ${s}`];

es("la misma carpeta sin mayúsculas ni barra final", mismaCarpeta("C:\\proyectos\\Adeorq\\", "c:/proyectos/adeorq"), true);
es("otra carpeta no", mismaCarpeta("C:\\proyectos\\Adeorq", "C:\\proyectos\\Adeorq2"), false);

const guardados = [
  { pty: 1, cwd: "C:\\proyectos\\Adeorq", command: claude("a") },
  { pty: 3, cwd: "C:\\proyectos\\Webs" },
  { cwd: "C:\\proyectos\\Vidorq" },
  { pty: 5, cwd: "C:\\proyectos\\Otra" },
];
const vivas = [
  viva(1, "c:\\proyectos\\adeorq", claude("a")),
  viva(3, "C:\\proyectos\\Webs\\"),
  viva(5, "C:\\proyectos\\NoEsLaSuya"),
  viva(8, "C:\\proyectos\\Huerfana"),
];
const r = emparejar(guardados, vivas);
es("cada panel con su número y su carpeta se queda la suya", [...r.adoptadas.entries()].map(([i, v]) => `${i}→${v.id}`), ["0→1", "1→3"]);
es("el mismo número en otra carpeta y con otro comando no es suyo", r.adoptadas.has(3), false);
es("un panel sin número no adopta nada", r.adoptadas.has(2), false);
es("lo vivo sin panel sale aparte, para enseñarlo y no matarlo", r.sueltas.map((v) => v.id), [5, 8]);

const porComando = emparejar([{ pty: 2, cwd: "C:\\proyectos\\Adeorq", command: claude("b") }], [viva(2, "C:\\x\\.espejo\\2-k", claude("b"))]);
es("el Modo Espejo corre en otra carpeta: vale el mismo comando", porComando.adoptadas.get(0)?.id, 2);

const dos = emparejar(
  [
    { pty: 4, cwd: "C:\\a" },
    { pty: 4, cwd: "C:\\a" },
  ],
  [viva(4, "C:\\a")],
);
es("una viva se adopta una vez como mucho", [dos.adoptadas.size, dos.sueltas.length], [1, 0]);

es("sin vivas no se adopta nada y no sobra nada", (() => {
  const x = emparejar(guardados, []);
  return [x.adoptadas.size, x.sueltas.length];
})(), [0, 0]);

// El Modo Espejo: la terminal corre en `<proyecto>\.adeorq\espejo\<nombre>`,
// con la barra mezclada tal cual la escribe `git_shadow.rs`.
const enEspejo = "C:\\proyectos\\Adeorq\\.adeorq/espejo\\3-mv8cm5kg";
es("de la carpeta de una viva sale su espejo", espejoDe(enEspejo), { proyecto: "C:\\proyectos\\Adeorq", nombre: "3-mv8cm5kg" });
es("una carpeta normal no es un espejo", espejoDe("C:\\proyectos\\Adeorq"), null);
es("ni una que solo se llama parecido", espejoDe("C:\\proyectos\\espejo\\3"), null);
const consola = emparejar([{ pty: 3, cwd: "C:\\proyectos\\Adeorq" }], [viva(3, enEspejo)]);
es("una consola en espejo, sin comando que comparar, se recoge por su espejo", consola.adoptadas.get(0)?.id, 3);
const deDentro = emparejar([{ pty: 3, cwd: "C:\\proyectos\\Adeorq\\src" }], [viva(3, enEspejo)]);
es("y también desde una carpeta de dentro del proyecto", deDentro.adoptadas.get(0)?.id, 3);
const deOtro = emparejar([{ pty: 3, cwd: "C:\\proyectos\\Webs" }], [viva(3, enEspejo)]);
es("el espejo de OTRO proyecto con el mismo número no es suyo", [deOtro.adoptadas.size, deOtro.sueltas.length], [0, 1]);
const parecido = emparejar([{ pty: 3, cwd: "C:\\proyectos\\Adeorq2" }], [viva(3, enEspejo)]);
es("ni el de un proyecto que empieza igual", parecido.adoptadas.size, 0);

es("los paneles nuevos nacen por encima de todo lo vivo", siguienteLibre(1, vivas), 9);
es("y sin vivas, donde iban", siguienteLibre(4, []), 4);

// El lienzo: sus terminales entran en el MISMO reparto que las de la Cabina.
const nodos = panelesDelLienzo([
  { tipo: "term", id: "7", ruta: "C:\\proyectos\\Vidorq", cmd: claude("l"), pty: 7 },
  { tipo: "term", id: "8", ruta: "C:\\proyectos\\VoCript" },
  { tipo: "nota", id: "9" },
  { tipo: "term", id: "w3k", ruta: "C:\\proyectos\\Webs" },
  { tipo: "term", id: "05", ruta: "C:\\proyectos\\Webs" },
]);
es("de un tablero del lienzo salen solo sus terminales, con el id del nodo", nodos.map((n) => n.nodo), ["7", "8", "w3k", "05"]);
es("con su número apuntado, o el del id en un tablero de antes", nodos.map((n) => n.pty ?? null), [7, 8, null, null]);
es("y su carpeta y su comando", [nodos[0].cwd, nodos[0].command], ["C:\\proyectos\\Vidorq", claude("l")]);

const cabina = [{ pty: 4, cwd: "C:\\proyectos\\Adeorq", command: claude("c") }];
const delLienzo = [
  { pty: 7, cwd: "C:\\proyectos\\Vidorq", command: claude("l") },
  { pty: 8, cwd: "C:\\proyectos\\VoCript" },
  { pty: 5, cwd: "C:\\proyectos\\Adeorq" },
];
const vivasDeLasDos = [
  viva(4, "C:\\proyectos\\Adeorq", claude("c")),
  viva(7, "c:\\proyectos\\vidorq", claude("l")),
  viva(8, "C:\\proyectos\\VoCript\\"),
  viva(9, "C:\\proyectos\\Huerfana"),
];
const rep = repartir(cabina, delLienzo, vivasDeLasDos);
const ids = (m: Map<number, Viva>) => [...m.entries()].map(([i, v]) => `${i}→${v.id}`);
es("una viva guardada en el lienzo la adopta el lienzo, por su índice en SU lista", ids(rep.lienzo), ["0→7", "1→8"]);
es("y deja de ser suelta: la Cabina no la enseña como recuperada", rep.sueltas.map((v) => v.id), [9]);
es("la de la Cabina sigue siendo de la Cabina", ids(rep.cabina), ["0→4"]);
es("un nodo del lienzo sin su terminal viva no adopta nada", rep.lienzo.has(2), false);
es("los nuevos de las dos vistas nacen por encima de todo lo vivo", siguienteLibre(1, vivasDeLasDos), 10);

const mismaEnLasDos = repartir([{ pty: 4, cwd: "C:\\a" }], [{ pty: 4, cwd: "C:\\a" }], [viva(4, "C:\\a")]);
es("una viva que reclaman las dos vistas es de una sola, la Cabina", [ids(mismaEnLasDos.cabina), ids(mismaEnLasDos.lienzo), mismaEnLasDos.sueltas.length], [["0→4"], [], 0]);

const sinLienzo = repartir(cabina, [], vivasDeLasDos);
es("sin el lienzo en el reparto (no devuelve sus terminales), lo suyo sale suelto", sinLienzo.sueltas.map((v) => v.id), [7, 8, 9]);
es("y lo de la Cabina va igual que con `emparejar`", ids(sinLienzo.cabina), ids(emparejar(cabina, vivasDeLasDos).adoptadas));

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
