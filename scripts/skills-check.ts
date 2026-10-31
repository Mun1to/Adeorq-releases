// La lista de skills de la barra derecha (`lib/skills.ts`): la frase que se
// enseña de cada una y los grupos que eligió Munir (2026-10-30, «A3 B2»).
//
// Lo que no puede pasar: que salga el «Úsalo cuando…» que es para el modelo,
// que una muy usada se quede abajo, que una de claude.ai o de un plugin se
// mezcle con las suyas, o un grupo vacío con su título.
//
//   pnpm bancos skills

import { agrupar, fraseCorta } from "../src/lib/skills";
import type { Skill } from "../src/lib/pty";

let fallos = 0;
function es(nombre: string, sale: unknown, esperado: unknown) {
  const a = JSON.stringify(sale);
  const b = JSON.stringify(esperado);
  if (a !== b) fallos++;
  console.log(`${a === b ? "ok  " : "FALLA"} ${nombre}${a === b ? "" : ` — sale ${a}, se esperaba ${b}`}`);
}

// Las descripciones de verdad de sus skills.
es("corta en el primer punto", fraseCorta("Cierre de sesión de Munir. Úsalo SIEMPRE que Munir escriba /fin"), "Cierre de sesión de Munir");
es("corta en los dos puntos", fraseCorta("Auditoría legal de un producto de software construido desde España o la UE: mira el repositorio"), "Auditoría legal de un producto de software construido desde España o la UE");
es("no corta en un punto sin espacio detrás", fraseCorta("Construye el vocabulario en un CONTEXT.md, y guarda cada decisión. Úsalo al arrancar"), "Construye el vocabulario en un CONTEXT.md, y guarda cada decisión");
es("sin punto, entera y sin el final", fraseCorta("Disciplina para bugs difíciles."), "Disciplina para bugs difíciles");
es("cortada por Rust, con sus puntos suspensivos", fraseCorta("Convierte varias preguntas sueltas (nombres, prioridades) en un cuestionario…"), "Convierte varias preguntas sueltas (nombres, prioridades) en un cuestionario…");
es("vacía, vacía", fraseCorta(""), "");

const s = (invocation: string, veces = 0, origen: Skill["origen"] = "tuya", description = ""): Skill => ({
  name: invocation.slice(1).toLowerCase(),
  description,
  invocation,
  folder: invocation.slice(1),
  origen,
  veces,
});
const lista = [
  s("/ateneo"),
  s("/Criteria", 3),
  s("/diretto", 12),
  s("/fin", 242),
  s("/galsas", 0, "tuya", "Auditoría legal"),
  s("/siteindex", 2),
  s("/anthropic-skills:pdf", 0, "claude.ai", "Use this skill whenever the user wants to do anything with PDF files"),
  s("/finito:finito", 5, "plugin"),
];
const ver = (q: string) => agrupar(lista, q).map((g) => [g.que, g.skills.map((x) => x.invocation)]);

es("arriba las usadas, de más a menos; luego las demás; al final las de fuera, aunque se usen", ver(""), [
  ["usadas", ["/fin", "/diretto", "/Criteria", "/siteindex"]],
  ["demas", ["/ateneo", "/galsas"]],
  ["fuera", ["/anthropic-skills:pdf", "/finito:finito"]],
]);
es("el buscador mira la orden, el nombre y lo que hace, y quita los grupos vacíos", ver("pdf"), [["fuera", ["/anthropic-skills:pdf"]]]);
es("busca sin mirar mayúsculas", ver("CRITERIA"), [["usadas", ["/Criteria"]]]);
es("por lo que hace; y si no pasa ninguna usada, son «las tuyas», no «las demás» de nada", ver("auditoría"), [["tuyas", ["/galsas"]]]);
es("sin ninguna usada, las suyas son «las tuyas»", agrupar([s("/a"), s("/b")], "").map((g) => g.que), ["tuyas"]);
es("a igual número de usos, por nombre como llegan", agrupar([s("/a", 2), s("/b", 2), s("/c", 9)], "")[0].skills.map((x) => x.invocation), ["/c", "/a", "/b"]);
es("nada que enseñar, ningún grupo", agrupar([], "").length, 0);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
