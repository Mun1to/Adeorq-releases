// Lo que el agente toca en el panel de Archivos, probado sin la app.
//
//   pnpm bancos tocados
//
// Lo que se prueba es `src/lib/tocados.ts`: qué marca lleva cada archivo que la
// sesión dejó escrito en su transcript cuando se junta con lo que dice git. El
// recorrido es el del vídeo que trajo Munir el 2026-10-12 (abre un archivo,
// edita otro, hace el commit y los dos pasan a verde) y, detrás, las formas de
// equivocarse: el commit de otra sesión, el que es anterior a la edición, el
// archivo que git no sigue, lo de fuera de la carpeta y lo de turnos viejos.

import type { ArchivosSesion, Cambio, CommitReciente, EstadoArchivos, Tocado } from "../src/lib/archivos";
import { clave } from "../src/lib/estadoArchivos";
import { cambiadosPorCarpeta, EDITANDO_MS, LEYENDO_MS, lineasDe, marcaDeCarpeta, resumenDe, totalesDe } from "../src/lib/tocados";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const R = "C:\\proyectos\\Web";
const f = (p: string) => `${R}\\${p}`;
/** Las doce y un minuto de un día cualquiera: los segundos de cada caso se cuentan desde aquí. */
const T0 = Date.parse("2026-10-12T12:01:00.000Z");
const a = (seg: number) => new Date(T0 + seg * 1000).toISOString();

function tocado(ruta: string, t: Partial<Tocado>): Tocado {
  return { ruta: f(ruta), leido: "", editado: "", enCurso: "", turnoLeido: 0, turnoEditado: 0, ...t };
}
function sesion(tocados: Tocado[], s: Partial<ArchivosSesion> = {}): ArchivosSesion {
  return { tocados, turno: 1, enMarcha: false, commitEnCurso: false, lee: true, ...s };
}
function git(cambios: Cambio[], commits: CommitReciente[] = []): EstadoArchivos {
  return { git: true, cambios, rama: "main", delante: 0, commits };
}
const cambio = (ruta: string, mas = 0, menos = 0, estado: Cambio["estado"] = "M"): Cambio => ({ ruta: f(ruta), estado, cuando: T0, mas, menos });
const commit = (hash: string, seg: number, archivos: string[]): CommitReciente => ({ hash, cuando: T0 + seg * 1000, asunto: `fix: ${hash}`, archivos: archivos.map(f) });
const marcas = (r: ReturnType<typeof resumenDe>) => r.filas.map((x) => `${x.ruta.slice(R.length + 1).replace(/\\/g, "/")}=${x.marca}`).join(" ");

const TEST = "tests\\client.test.js";
const CLIENTE = "src\\api\\client.js";

// ── El recorrido del vídeo ────────────────────────────────────────────────
{
  // 1. Abre el test: la lectura está en el aire.
  let r = resumenDe(sesion([tocado(TEST, { enCurso: "leer" })], { enMarcha: true }), git([]), R, T0);
  caso("una lectura en el aire: «leyendo», y lo dice el titular", marcas(r) === "tests/client.test.js=leyendo" && r.titular.que === "leyendo" && r.enMarcha, marcas(r));

  // 2. La lectura contestó hace dos segundos: sigue diciendo «leyendo» un rato.
  const leido = tocado(TEST, { leido: a(0), turnoLeido: 1 });
  r = resumenDe(sesion([leido], { enMarcha: true }), git([]), R, T0 + 2_000);
  caso("recién leído sigue en «leyendo»", marcas(r) === "tests/client.test.js=leyendo", marcas(r));
  r = resumenDe(sesion([leido], { enMarcha: true }), git([]), R, T0 + LEYENDO_MS + 1);
  caso("pasado el rato se queda en «leído»", marcas(r) === "tests/client.test.js=leido" && r.titular.que === "abrio", marcas(r));

  // 3. Edita el cliente: la edición espera permiso.
  r = resumenDe(sesion([leido, tocado(CLIENTE, { enCurso: "editar" })], { enMarcha: true }), git([]), R, T0 + 20_000);
  caso("una edición en el aire: «editando», delante de lo leído", marcas(r) === "src/api/client.js=editando tests/client.test.js=leido", marcas(r));
  caso("el titular es lo que se mueve ahora", r.titular.que === "editando" && r.titular.ruta === f(CLIENTE));

  // 4. La edición se hizo hace tres segundos y git ya la ve.
  const editado = tocado(CLIENTE, { editado: a(20), turnoEditado: 1 });
  const sucio = git([cambio(CLIENTE, 1, 1)]);
  r = resumenDe(sesion([leido, editado], { enMarcha: true }), sucio, R, T0 + 23_000);
  caso("recién editado sigue en «editando»", marcas(r).startsWith("src/api/client.js=editando"), marcas(r));
  r = resumenDe(sesion([leido, editado]), sucio, R, T0 + 20_000 + EDITANDO_MS + 1);
  caso("pasado el rato: «editado», con sus líneas", marcas(r) === "src/api/client.js=editado tests/client.test.js=leido" && r.filas[0].mas === 1 && r.filas[0].menos === 1, marcas(r));
  caso("el titular cuenta lo editado y sus líneas", r.titular.que === "edito" && r.titular.n === 1 && r.titular.mas === 1 && r.titular.menos === 1 && !r.enMarcha && !r.cierre);

  // 5. Lanza el commit.
  r = resumenDe(sesion([leido, editado], { enMarcha: true, commitEnCurso: true, turno: 2 }), sucio, R, T0 + 60_000);
  caso("con el commit lanzado el titular lo dice, y las filas siguen como estaban", r.titular.que === "commitEnCurso" && r.haciendoCommit && marcas(r) === "src/api/client.js=editado tests/client.test.js=leido", marcas(r));

  // 6. El commit entra: el árbol queda limpio y git lo lista con su archivo.
  const hecho = git([], [commit("a1c9e42", 62, [CLIENTE]), commit("0000000", -500, ["README.md"])]);
  r = resumenDe(sesion([leido, editado], { turno: 2 }), hecho, R, T0 + 70_000);
  caso("lo editado pasa a «commit»; lo que solo leyó sigue leído", marcas(r) === "src/api/client.js=commit tests/client.test.js=leido", marcas(r));
  caso("el titular es el commit, con su hash", r.titular.que === "commit" && r.titular.n === 1 && r.titular.hash === "a1c9e42" && r.cierre?.hash === "a1c9e42");

  // 7. Empieza otra cosa: lo del commit ya no es lo que está haciendo.
  const otro = tocado("src\\index.js", { editado: a(200), turnoEditado: 3 });
  r = resumenDe(sesion([leido, editado, otro], { turno: 3 }), git([cambio("src\\index.js", 4, 0)], hecho.commits), R, T0 + 300_000);
  caso("al volver a editar empieza otro tramo: lo del commit y lo leído antes se van", marcas(r) === "src/index.js=editado" && !r.cierre && r.titular.que === "edito", marcas(r));
}

// ── Las formas de equivocarse ─────────────────────────────────────────────
{
  const A = tocado("a.ts", { editado: a(10), turnoEditado: 1 });
  const B = tocado("b.ts", { editado: a(20), turnoEditado: 1 });
  const tarde = T0 + 600_000;

  let r = resumenDe(sesion([A, B]), git([cambio("b.ts", 3, 0)], [commit("aaaaaaa", 30, ["a.ts"])]), R, tarde);
  caso("un commit con solo uno de los dos: ese en verde y el otro sigue editado", marcas(r) === "b.ts=editado a.ts=commit" && r.titular.que === "commit" && r.titular.n === 1, marcas(r));

  r = resumenDe(sesion([A, B]), git([], [commit("bbbbbbb", 40, ["b.ts"]), commit("aaaaaaa", 30, ["a.ts"])]), R, tarde);
  caso("un commit por archivo: los dos en verde, y el cierre es el más nuevo", marcas(r) === "b.ts=commit a.ts=commit" && r.cierre?.hash === "bbbbbbb" && r.titular.que === "commit" && r.titular.n === 2, marcas(r));

  r = resumenDe(sesion([A, B]), git([cambio("a.ts", 1, 0), cambio("b.ts", 1, 0)], [commit("ccccccc", 50, ["otra\\cosa.md"])]), R, tarde);
  caso("el commit de otra sesión, sin archivos suyos, no cierra nada", marcas(r) === "b.ts=editado a.ts=editado" && !r.cierre, marcas(r));

  r = resumenDe(sesion([A]), git([cambio("a.ts", 2, 2)], [commit("ddddddd", 5, ["a.ts"])]), R, tarde);
  caso("un commit ANTERIOR a la edición no la lleva dentro", marcas(r) === "a.ts=editado" && !r.cierre, marcas(r));

  r = resumenDe(sesion([A]), git([cambio("a.ts", 9, 0)], [commit("eeeeeee", 30, ["a.ts"])]), R, tarde);
  caso("entró en el commit y alguien lo volvió a cambiar: ya no es del agente", r.filas.length === 0 && r.titular.que === "nada", marcas(r));

  // Git no lo sigue (un BUZON.md en el .gitignore) o no hay git: no hay «sucio» que mirar.
  const ignorado = tocado("BUZON.md", { editado: a(10), turnoEditado: 2 });
  r = resumenDe(sesion([ignorado], { turno: 2 }), git([]), R, tarde);
  caso("lo que git no sigue sale como editado mientras sea del último turno con archivos", marcas(r) === "BUZON.md=editado", marcas(r));
  r = resumenDe(sesion([ignorado, tocado("c.ts", { leido: a(90), turnoLeido: 3 })], { turno: 3 }), git([]), R, tarde);
  caso("y se va cuando toca archivos en un turno posterior", marcas(r) === "c.ts=leido", marcas(r));
  r = resumenDe(sesion([ignorado], { turno: 5 }), { git: false, cambios: [] }, R, tarde);
  caso("sin git, lo editado en el último turno con archivos sigue ahí aunque pasen turnos sin tocar ninguno", marcas(r) === "BUZON.md=editado", marcas(r));

  const viejo = tocado("viejo.ts", { leido: a(1), turnoLeido: 1 });
  const nuevo = tocado("nuevo.ts", { leido: a(100), turnoLeido: 2 });
  r = resumenDe(sesion([viejo, nuevo], { turno: 2 }), git([]), R, tarde);
  caso("lo leído en un turno anterior no sale", marcas(r) === "nuevo.ts=leido", marcas(r));

  const fuera: Tocado = { ruta: "C:\\Users\\Muni\\.claude\\memoria.md", leido: "", editado: a(10), enCurso: "", turnoLeido: 0, turnoEditado: 1 };
  const primo: Tocado = { ...fuera, ruta: "C:\\proyectos\\WebVieja\\a.ts" };
  r = resumenDe(sesion([fuera, primo, A]), git([cambio("a.ts")]), R, tarde);
  caso("lo de fuera de la carpeta se cuenta aparte (y «WebVieja» no es «Web»)", marcas(r) === "a.ts=editado" && r.fuera === 2, `${marcas(r)} fuera=${r.fuera}`);

  const raro: Tocado = { ...A, ruta: "c:/proyectos/web/SRC/App.tsx" };
  r = resumenDe(sesion([raro]), git([cambio("src\\App.tsx", 7, 2)]), R, tarde);
  caso("la ruta casa con la de git aunque venga con otras barras y mayúsculas", r.filas[0]?.marca === "editado" && r.filas[0].mas === 7 && r.marcas.get(clave(f("src\\App.tsx"))) === "editado");

  // Codex: solo ediciones, y una en el aire.
  r = resumenDe(sesion([tocado("a.rs", { editado: a(10), turnoEditado: 1 }), tocado("b.rs", { enCurso: "editar" })], { lee: false, enMarcha: true }), git([cambio("a.rs", 2, 1)]), R, tarde);
  caso("un CLI que solo deja escritas las ediciones", marcas(r) === "b.rs=editando a.rs=editado", marcas(r));

  r = resumenDe(null, git([cambio("a.ts", 1, 1)]), R, tarde);
  caso("sin transcript no hay nada del agente, y no falla", r.filas.length === 0 && r.titular.que === "nada" && !r.enMarcha && r.fuera === 0);

  r = resumenDe(
    sesion([
      tocado("l.ts", { leido: a(1), turnoLeido: 1 }),
      tocado("c.ts", { editado: a(2), turnoEditado: 1 }),
      tocado("e.ts", { editado: a(3), turnoEditado: 1 }),
      tocado("y.ts", { enCurso: "leer" }),
      tocado("x.ts", { enCurso: "editar" }),
      tocado("e2.ts", { editado: a(4), turnoEditado: 1 }),
    ]),
    git([cambio("e.ts"), cambio("e2.ts")], [commit("fffffff", 5, ["c.ts"])]),
    R,
    tarde,
  );
  caso("el orden: lo que se mueve, lo editado (lo último primero), el commit y lo leído", marcas(r) === "x.ts=editando y.ts=leyendo e2.ts=editado e.ts=editado c.ts=commit l.ts=leido", marcas(r));
}

// ── Lo que pinta el árbol ─────────────────────────────────────────────────
{
  const r = resumenDe(
    sesion([tocado(CLIENTE, { enCurso: "editar" }), tocado(TEST, { leido: a(0), turnoLeido: 1 }), tocado("src\\index.js", { editado: a(0), turnoEditado: 1 })]),
    git([cambio("src\\index.js", 2, 0)]),
    R,
    T0 + 60_000,
  );
  caso("una carpeta lleva la marca más importante de dentro", marcaDeCarpeta(f("src"), r.marcas) === "editando" && marcaDeCarpeta(f("src\\api"), r.marcas) === "editando" && marcaDeCarpeta(f("tests"), r.marcas) === "leido");
  caso("y ninguna si el agente no tocó nada dentro", marcaDeCarpeta(f("docs"), r.marcas) === null);

  const cambios = [cambio(CLIENTE, 1, 1), cambio("src\\index.js", 4, 0), cambio("README.md", 0, 3), cambio("logo.png")];
  const dentro = cambiadosPorCarpeta(R, cambios);
  caso("cada carpeta cuenta lo cambiado que tiene dentro, a cualquier hondura", dentro.get(clave(f("src"))) === 2 && dentro.get(clave(f("src\\api"))) === 1 && dentro.get(clave(f("tests"))) === undefined, [...dentro].join(" "));
  caso("la raíz no se cuenta a sí misma", !dentro.has(clave(R)));
  const lineas = lineasDe(cambios);
  caso("las líneas de cada archivo, y ninguna para el que no tiene", lineas.get(clave(f(CLIENTE)))?.mas === 1 && lineas.get(clave(f("README.md")))?.menos === 3 && !lineas.has(clave(f("logo.png"))));
  const t = totalesDe(cambios);
  caso("el total del árbol", t.n === 4 && t.mas === 5 && t.menos === 4, `${t.n} +${t.mas} -${t.menos}`);
}

if (fallos) {
  console.error(`\n${fallos} caso(s) MAL`);
  process.exit(1);
}
console.log("\ntodo bien");
