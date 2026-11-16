// La copia aparte de lo que trabaja solo (`lib/copiaAparte.ts`).
//
// Lo que no puede pasar: que la hija de una terminal de la noche nazca en la
// carpeta de verdad por pedirla con su nombre; montar un espejo encima de otro;
// cerrar por el MCP la dueña de una copia con trabajo dentro, también cuando ese
// trabajo ya está en commits o no se ha podido contar; o no dejar cerrar a una
// hija que solo trabaja dentro.
//
//   pnpm bancos copia-aparte

import {
  apuntarCopia,
  archivoElegido,
  carpetaDeVerdad,
  carpetaEnLaCopia,
  carpetaParaNacer,
  conTechoDeGit,
  copiaCerrada,
  copiaDe,
  copiaPorCarpeta,
  dentroDe,
  dondeNace,
  notaDeCopia,
  parteDeCopia,
  porQueNoSeCierra,
  porQueNoSeSuelta,
  proyectoDe,
  soltarCopia,
  vivasDentro,
  type Copia,
} from "../src/lib/copiaAparte";
import { espejoPropio } from "../src/lib/reenganche";

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

const RAIZ = "C:\\proyectos";
// Como lo devuelve `shadow_init`: la barra del medio va al revés.
const madre: Copia = { proyecto: "C:\\proyectos\\Demo", arbol: "C:\\proyectos\\Demo\\.adeorq/espejo\\5-abc", base: "main", duena: 5 };
const ARBOL = "C:\\proyectos\\Demo\\.adeorq\\espejo\\5-abc";

// ─── El techo del git de dentro ─────────────────────────────────────────────
// Al aceptar o tirar, su `.git` cae primero y el resto tarda; sin techo, el git de dentro
// llegaba a tu repo (revisión aparte de la t204, 2026-11-16).
const techo = (c: string) => conTechoDeGit(c, { CLAUDE_CONFIG_DIR: "x" })?.GIT_CEILING_DIRECTORIES;
es("la dueña, en la raíz de su copia, nace con el techo en la carpeta de las copias", techo(madre.arbol), "C:\\proyectos\\Demo\\.adeorq\\espejo");
es("y en una subcarpeta de la copia, el mismo", techo(`${ARBOL}\\web\\src`), "C:\\proyectos\\Demo\\.adeorq\\espejo");
es("en macOS y Linux, con sus barras", techo("/Users/m/p/Demo/.adeorq/espejo/5-abc/web"), "/Users/m/p/Demo/.adeorq/espejo");
es("sin perder el resto de su entorno", conTechoDeGit(ARBOL, { CLAUDE_CONFIG_DIR: "x" })?.CLAUDE_CONFIG_DIR, "x");
es("fuera de una copia no se le pone nada", conTechoDeGit("C:\\proyectos\\Demo", { A: "1" }), { A: "1" });
es("ni a una carpeta que se llama parecido", techo("C:\\proyectos\\espejo\\5-abc"), undefined);
es(
  "el techo que ya traía su entorno se queda, detrás del de la copia",
  conTechoDeGit(ARBOL, { GIT_CEILING_DIRECTORIES: "D:\\otro" })?.GIT_CEILING_DIRECTORIES,
  "C:\\proyectos\\Demo\\.adeorq\\espejo;D:\\otro",
);
es(
  "en macOS y Linux se juntan con dos puntos",
  conTechoDeGit("/Users/m/p/Demo/.adeorq/espejo/5-abc", { GIT_CEILING_DIRECTORIES: "/srv" })?.GIT_CEILING_DIRECTORIES,
  "/Users/m/p/Demo/.adeorq/espejo:/srv",
);
es(
  "y si ya lo llevaba, no se repite",
  conTechoDeGit(ARBOL, { GIT_CEILING_DIRECTORIES: "C:\\proyectos\\Demo\\.adeorq\\espejo" })?.GIT_CEILING_DIRECTORIES,
  "C:\\proyectos\\Demo\\.adeorq\\espejo",
);
// Cuarta revisión aparte: una ruta de Windows escrita solo con «/» (un agente por
// `open_pane`) se juntaba con «:», y git para Windows leía una sola entrada que no existe.
es(
  "una ruta de Windows con barras «/» se junta igual con punto y coma",
  conTechoDeGit("C:/proyectos/Demo/.adeorq/espejo/5-abc/web", { GIT_CEILING_DIRECTORIES: "D:\\otro" })?.GIT_CEILING_DIRECTORIES,
  "C:\\proyectos\\Demo\\.adeorq\\espejo;D:\\otro",
);

// ─── Dónde está cada carpeta ────────────────────────────────────────────────
es("dentro: la misma carpeta, sin resto", dentroDe("C:/proyectos/Demo/", "C:\\proyectos\\demo"), "");
es("dentro: una subcarpeta, con su resto", dentroDe("C:\\proyectos\\Demo\\src\\lib", "C:\\proyectos\\Demo"), "src/lib");
es("dentro, en Linux: la mayúscula sí cuenta", [dentroDe("/home/m/Demo/src", "/home/m/Demo"), dentroDe("/home/m/demo/src", "/home/m/Demo")], ["src", null]);
es("el proyecto en Linux y macOS, con su barra", proyectoDe("/home/m/proyectos/Demo/src", "/home/m/proyectos"), "/home/m/proyectos/Demo");
es("dentro: un nombre que empieza igual no está dentro", dentroDe("C:\\proyectos\\Demo2", "C:\\proyectos\\Demo"), null);
es("el proyecto de una subcarpeta es la de primer nivel", proyectoDe("C:\\proyectos\\Demo\\src", RAIZ), "C:\\proyectos\\Demo");
es("el proyecto de una carpeta de fuera es ella misma", proyectoDe("D:\\otra\\cosa", RAIZ), "D:\\otra\\cosa");
es("sin carpeta de proyectos, la propia carpeta", proyectoDe("C:\\proyectos\\Demo\\src", ""), "C:\\proyectos\\Demo\\src");

// ─── Dónde nace ─────────────────────────────────────────────────────────────
es("de día, sin madre en copia: donde pidió y sin espejo", dondeNace("C:\\proyectos\\Demo", false, undefined), { cwd: "C:\\proyectos\\Demo", copia: null, espejo: false });
es("un encargo de la noche: su propio espejo", dondeNace("C:\\proyectos\\Demo", true, undefined), { cwd: "C:\\proyectos\\Demo", copia: null, espejo: true });
es("la hija que pide la carpeta de verdad nace en la copia de su madre", dondeNace("C:\\proyectos\\Demo", false, madre), { cwd: madre.arbol, copia: madre, espejo: false });
es("y en la misma subcarpeta que pidió", dondeNace("c:/proyectos/demo/src/lib", false, madre).cwd, `${ARBOL}\\src\\lib`);
const madreMac: Copia = { proyecto: "/Users/m/p/Demo", arbol: "/Users/m/p/Demo/.adeorq/espejo/5-abc", base: "main", duena: 5 };
es("en macOS, la subcarpeta de la copia con su barra", dondeNace("/Users/m/p/Demo/web", false, madreMac).cwd, "/Users/m/p/Demo/.adeorq/espejo/5-abc/web");
es("en macOS, no se monta un espejo encima de otro", dondeNace("/Users/m/p/Demo/.adeorq/espejo/9-x", true, undefined).espejo, false);
es("la hija que pide la carpeta de la copia se queda ahí", dondeNace(`${ARBOL}\\web`, false, madre), { cwd: `${ARBOL}\\web`, copia: madre, espejo: false });
es("la hija en OTRO proyecto lleva su propio espejo", dondeNace("C:\\proyectos\\Otro", false, madre), { cwd: "C:\\proyectos\\Otro", copia: null, espejo: true });
es("no se monta un espejo encima del árbol de otro", dondeNace("C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x", true, undefined).espejo, false);
es("ni la hija se mete en la copia de otra terminal", dondeNace("C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x\\src", false, madre), { cwd: "C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x\\src", copia: null, espejo: false });

// ─── Recogida tras una caída, y relevo ──────────────────────────────────────
es("la dueña se reconoce por el número de su espejo", espejoPropio(ARBOL, 5)?.nombre, "5-abc");
es("una hija en la misma carpeta no se hace dueña", espejoPropio(ARBOL, 8), null);
es("la copia se lee de la carpeta de una hija sin registro", copiaPorCarpeta(`${ARBOL}\\src`), { proyecto: "C:\\proyectos\\Demo", arbol: ARBOL, base: "", duena: 5 });
es("y una carpeta normal no tiene copia", copiaPorCarpeta("C:\\proyectos\\Demo\\src"), undefined);
es("su hija nace dentro, aunque la madre se recogiera sin registro", dondeNace("C:\\proyectos\\Demo", false, copiaPorCarpeta(ARBOL)).cwd, ARBOL);

// ─── Cerrar ─────────────────────────────────────────────────────────────────
es("la dueña sin nada pendiente se cierra", porQueNoSeCierra(5, madre, { sueltos: 0, commits: 0 }), null);
const sueltos = porQueNoSeCierra(5, madre, { sueltos: 2, commits: 0 }) ?? "";
ok("la dueña con archivos sueltos NO se cierra, y dice cuántos", /2 archivos sin guardar/.test(sueltos) && /No la cierro/.test(sueltos), sueltos);
const commits = porQueNoSeCierra(5, madre, { sueltos: 0, commits: 1 }) ?? "";
ok("ni con el trabajo ya en commits de su rama", /trabajo sin aceptar: 1 commit\./.test(commits), commits);
ok("ni sin poder mirarlo", /no he podido mirar si tiene trabajo sin aceptar\. No la cierro/.test(porQueNoSeCierra(5, madre, null) ?? ""));
es("una hija que trabaja dentro se cierra como siempre", porQueNoSeCierra(8, madre, { sueltos: 3, commits: 2 }), null);
es("una terminal sin copia, también", porQueNoSeCierra(8, undefined, null), null);

// ─── Lo que se dice ─────────────────────────────────────────────────────────
const nota = notaDeCopia("C:\\proyectos\\Demo");
ok("la nota del encargo empieza en un párrafo aparte con [adeorq]", nota.startsWith("\n\n[adeorq] Trabajas en una copia aparte de C:\\proyectos\\Demo"), nota);
ok("y le pide no cambiar de rama ni hacer push", /No cambies de rama ni hagas push/.test(nota), nota);
ok("sin copia, la respuesta dice por qué y dónde trabaja", parteDeCopia({ sin: "esta carpeta no es un repositorio de git" }).includes("no es un repositorio de git, así que trabaja en la carpeta de verdad"));

// ─── El registro ────────────────────────────────────────────────────────────
apuntarCopia(5, madre);
apuntarCopia(8, madre);
apuntarCopia(9, { ...madre, arbol: "C:\\proyectos\\Demo\\.adeorq\\espejo\\9-x", duena: 9 });
soltarCopia(5);
es("soltar la dueña deja a su hija en la copia", [copiaDe(5), copiaDe(8)?.duena], [undefined, 5]);
// ─── Aceptar o tirar con una hija dentro ───────────────────────────────────
// Antes se aceptaba igual: lo que la hija escribiera después se perdía con la copia.
const PANELES = [
  { id: 5, name: "Noche: limpieza", cwd: ARBOL, porque: "" },
  { id: 8, name: "Web: hero", cwd: `${ARBOL}\\web`, porque: "" },
  { id: 11, name: "Otra cosa", cwd: "C:\\proyectos\\Demo", porque: "" },
  { id: 12, name: "Acabada", cwd: `${ARBOL}\\api`, porque: "el proceso de la terminal terminó" },
];
es("una hija abierta en una subcarpeta de la copia cuenta; la dueña, la de fuera y la ya terminada no", vivasDentro(ARBOL, 5, PANELES), [{ id: 8, name: "Web: hero" }]);
// La 8 sigue en el registro (de arriba): para «nadie dentro», su proceso ya terminó.
const sinNadie = [PANELES[0], { ...PANELES[1], porque: PANELES[3].porque }, PANELES[2]];
es("sin nadie dentro se acepta", porQueNoSeSuelta("aceptar", vivasDentro(ARBOL, 5, sinNadie)), null);
const noAcepta = porQueNoSeSuelta("aceptar", vivasDentro(ARBOL, 5, PANELES)) ?? "";
ok("con una hija dentro no se acepta, y dice cuál", noAcepta.startsWith("No acepto") && noAcepta.includes("«Web: hero» (panel 8)"), noAcepta);
apuntarCopia(13, madre);
const dosDentro = vivasDentro(ARBOL, 5, PANELES);
es("una del registro que no sale en estos paneles (mudada a otra ventana) cuenta también", dosDentro.map((v) => v.id), [8, 13]);
const noTira = porQueNoSeSuelta("tirar", dosDentro) ?? "";
ok("con dos dentro tampoco se tira, y nombra las dos", noTira.startsWith("No tiro") && noTira.includes("(panel 8) y «terminal 13» (panel 13)"), noTira);
soltarCopia(13);
es("una del registro ya cerrada deja de contar", vivasDentro(ARBOL, 5, sinNadie), []);

copiaCerrada(ARBOL);
es("aceptar o tirar la copia la quita también a sus hijas, y no a otras", [copiaDe(8), copiaDe(9)?.duena], [undefined, 9]);

// ─── Un encargo en una subcarpeta ───────────────────────────────────────────
// Antes arrancaba en la raíz de la copia aunque se pidiera `Demo\web`.
es("la propuesta elegida sigue si sigue en la lista", archivoElegido("b", [{ path: "a" }, { path: "b" }]), "b");
es("y si no, la primera; sin lista, ninguna", [archivoElegido("z", [{ path: "a" }]), archivoElegido("a", [])], ["a", null]);
es("la carpeta de verdad de una subcarpeta del árbol", carpetaDeVerdad(`${ARBOL}\\web\\src`), "C:\\proyectos\\Demo\\web\\src");
es("y la de una carpeta que no está en ninguna copia, ella misma", carpetaDeVerdad("C:\\proyectos\\Demo\\web"), "C:\\proyectos\\Demo\\web");

const PROY = "C:\\proyectos\\Demo";
es("pedido en una subcarpeta: esa subcarpeta, dentro de la copia", carpetaEnLaCopia(`${PROY}\\web`, PROY, ARBOL), `${ARBOL}\\web`);
es("pedido en la raíz del proyecto: la raíz de la copia", carpetaEnLaCopia(PROY, PROY, ARBOL), ARBOL);
es("ya dentro del árbol (una recogida tras una caída): ahí mismo", carpetaEnLaCopia(`${ARBOL}\\web`, PROY, ARBOL), `${ARBOL}\\web`);

async function enUnaSubcarpeta() {
  // Un disco de mentira: lo que hay y lo que se crea.
  const discoCon = (...hay: string[]) => {
    const creadas: string[] = [];
    const todo = new Set(hay.map((r) => r.toLowerCase()));
    return {
      creadas,
      existe: async (r: string) => todo.has(r.toLowerCase()),
      crear: async (c: string, n: string) => {
        if (todo.has(`${c}\\${n}`.toLowerCase())) throw new Error("ya hay algo");
        todo.add(`${c}\\${n}`.toLowerCase());
        creadas.push(`${c}\\${n}`);
      },
    };
  };
  const conWeb = discoCon(`${ARBOL}\\web`);
  es("si git la trae, nace en ella sin crear nada", [await carpetaParaNacer(`${PROY}\\web`, PROY, ARBOL, conWeb), conWeb.creadas], [`${ARBOL}\\web`, []]);
  // La revisión aparte: con «mirar si existe» al nacer y al retomar, una carpeta que aparecía
  // después o un árbol aún por montar cambiaban la respuesta, y el --resume buscaba en otra.
  const sinNada = discoCon();
  es("si git no la trae, se crea tramo a tramo y nace en ella igual", [await carpetaParaNacer(`${PROY}\\informes\\2026`, PROY, ARBOL, sinNada), sinNada.creadas], [`${ARBOL}\\informes\\2026`, [`${ARBOL}\\informes`, `${ARBOL}\\informes\\2026`]]);
  const roto = { existe: async () => false, crear: async () => Promise.reject(new Error("hay un archivo")) };
  es("si no se puede crear, la raíz de la copia, nunca la de verdad", await carpetaParaNacer(`${PROY}\\web`, PROY, ARBOL, roto), ARBOL);
  es("en la raíz, sin tocar el disco", await carpetaParaNacer(PROY, PROY, ARBOL, roto), ARBOL);
}

void enUnaSubcarpeta()
  .catch((e) => ok("los casos de la subcarpeta no revientan", false, String(e)))
  .then(() => {
    console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
    process.exit(fallos ? 1 : 0);
  });
