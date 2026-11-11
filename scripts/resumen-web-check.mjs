// El resumen de cada versión que enseña la portada (`summaryFrom`, en
// web/scripts/github.mjs). Las notas de 0.9.249 a 0.9.251 abrían con la cita de
// PROBADO/MEDIDO, seguían con títulos y listas, y separaban el inglés con una raya:
// el único «párrafo» era `---`, y la portada lo enseñó como la novedad de las tres.
import { splitLanguages, summaryFrom } from "../web/scripts/github.mjs";

let fallos = 0;
const es = (que, sale, debe) => {
  const ok = sale === debe;
  if (!ok) fallos++;
  console.log(`${ok ? "ok  " : "FALLA"} ${que}${ok ? "" : `\n      sale: ${JSON.stringify(sale)}\n      debe: ${JSON.stringify(debe)}`}`);
};

const notas = [
  "> MEDIDO: lo medido va aquí.",
  "",
  "## Novedades",
  "",
  "- **Con sesiones trabajando, la ventana gasta mucho menos.** El hilo gira en la tarjeta gráfica.",
  "- **Tapar una terminal la desenfoca otra vez.**",
  "",
  "## Lo medido",
  "",
  "- 130% + 74% antes, 51% + 27% después.",
  "",
  "---",
  "",
  "> MEDIDO: what was measured.",
  "",
  "## What is new",
  "",
  "- **The window costs much less.**",
].join("\n");
es("la raya entre los dos idiomas no es el resumen: sale la primera novedad",
  summaryFrom(notas),
  "**Con sesiones trabajando, la ventana gasta mucho menos.** El hilo gira en la tarjeta gráfica.");
es("con un párrafo de verdad, el párrafo", summaryFrom("> PROBADO: x\n\nUn párrafo que cuenta la versión.\n\n- una lista"), "Un párrafo que cuenta la versión.");
es("una raya de asteriscos tampoco", summaryFrom("***\n\n- la novedad"), "la novedad");

// Y la página en inglés: las notas de `publicar-version` no llevan `<!-- lang:en -->`,
// solo la raya, y la portada inglesa enseñaba el resumen en español.
const partidas = splitLanguages(notas);
es("la raya entre dos citas de escalón parte los idiomas: el inglés", partidas.en && summaryFrom(partidas.en), "**The window costs much less.**");
es("y el español se queda sin el inglés", partidas.es.includes("What is new"), false);
const conRaya = "> PROBADO: x\n\nUn párrafo.\n\n---\n\nOtro párrafo que no es inglés.";
es("una raya que no lleva una cita detrás no parte nada", splitLanguages(conRaya).en, null);
es("con la marca de siempre, la marca manda", splitLanguages("> PROBADO: x\n\nHola.\n\n<!-- lang:en -->\n\nHello.").en, "Hello.");

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
process.exitCode = fallos ? 1 : 0;
