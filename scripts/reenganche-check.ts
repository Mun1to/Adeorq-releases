// Qué panel guardado es qué terminal viva al volver tras una caída
// (`lib/reenganche.ts`).
//
// Lo que no puede pasar: que un panel se enganche a la terminal de OTRO (el
// mismo número de otro arranque, otra carpeta), que una viva se adopte dos
// veces, que lo vivo sin panel se pierda, o que un panel nuevo nazca con el
// número de una viva.
//
//   pnpm bancos reenganche

import { emparejar, espejoDe, mismaCarpeta, siguienteLibre, type Viva } from "../src/lib/reenganche";

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

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
