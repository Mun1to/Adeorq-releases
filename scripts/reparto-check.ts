// Comprobación del reparto: casos que se ejecutan de verdad.
//
//   npx tsc scripts/reparto-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/reparto-check.js
//
// Mismo motivo que `router-check.ts`: compilar demuestra que los tipos encajan,
// no que el reparto reparta bien. Lo que se comprueba aquí es lo que de verdad
// puede salir mal sin que se note: que un agente reciba instrucciones de otro
// cliente, que el papel común se quede sin alguien, o que el peso mienta.
import {
  interpretarLote,
  repartir,
  promptPara,
  rolDePuesto,
  tituloDelReparto,
  type Tarea,
} from "../src/lib/reparto";
import type { CuentaViva, Exigencia } from "../src/lib/router";

const cuenta = (provider: string, label: string, gastado?: number, plan?: string): CuentaViva => ({
  cuenta: { id: `${provider}:${label}`, label, dir: "", provider },
  instalado: true,
  conectada: true,
  gastado,
  plan,
});

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

const ex = (p: Partial<Exigencia> = {}): Exigencia => ({
  clase: "oficio",
  consecuencia: "baja",
  largo: false,
  trabajo: "codigo",
  ...p,
});

const tarea = (texto: string, e: Partial<Exigencia> = {}, extra: Partial<Tarea> = {}): Tarea => ({
  texto,
  ex: ex(e),
  ...extra,
});

const max = [cuenta("claude", "Principal", 15, "max")];

// 1. Cada tarea recibe el cerebro que su clase pide, dentro del mismo lote.
let r = repartir(
  [
    tarea("renombra las variables", { clase: "recado" }),
    tarea("monta el formulario", { clase: "oficio" }),
    tarea("audita la autenticación", { clase: "juicio", consecuencia: "alta" }),
  ],
  { cuentas: max },
);
comprueba(
  "un lote mezclado reparte tres cerebros distintos",
  r.puestos.map((p) => p.receta.modelo).join(",") === "haiku,sonnet,opus",
  r.puestos.map((p) => p.receta.modelo),
);

// 2. El peso es la suma real, no una media ni un adorno.
comprueba("el peso suma lo de cada uno", r.peso === 1 + 3 + 5, r.peso);
comprueba("el resumen ordena de caro a barato", r.resumen === "1 opus + 1 sonnet + 1 haiku", r.resumen);
comprueba("el título dice cuántos abre", tituloDelReparto(r).startsWith("Abre 3 agentes"), tituloDelReparto(r));

// 3. El papel común nombra a TODOS. Si alguien falta, ese agente trabaja a
//    ciegas y es justo el que va a pisar a otro.
comprueba(
  "el acta nombra a los tres",
  ["renombra las variables", "monta el formulario", "audita la autenticación"].every((t) =>
    r.acta.includes(t),
  ),
  r.acta,
);
comprueba("el acta avisa de que no se versiona", r.acta.includes("no se versiona"), r.acta);

// 4. Cada prompt conoce a los demás, que es lo que evita el trabajo repetido.
const primero = r.puestos[0].prompt;
comprueba("el prompt del primero menciona a los otros dos", primero.includes("monta el formulario") && primero.includes("audita"), primero);
comprueba("y no se menciona a sí mismo en la lista de al lado", primero.split("A la vez que tú")[1]?.includes("renombra las variables") !== true, primero);
comprueba("todos apuntan al buzón", r.puestos.every((p) => p.prompt.includes("BUZON.md")), true);

// 5. Las skills son de Claude Code: ofrecérselas a otro es mandarle a escribir
//    una barra que en su programa no hace nada.
const dis = tarea("rediseña el hero", { trabajo: "diseno" });
comprueba(
  "a Claude sí se le ofrece la skill de diseño",
  promptPara("claude", dis, []).includes("/frontlaxweb"),
  promptPara("claude", dis, []),
);
comprueba(
  "a Codex NO se le ofrece",
  !promptPara("codex", dis, []).includes("/frontlaxweb"),
  promptPara("codex", dis, []),
);

// 6. La frontera de archivos viaja al prompt y al acta.
r = repartir(
  [
    tarea("la interfaz", {}, { frontera: "src/components/**", proyecto: "Adeorq" }),
    tarea("el servidor", {}, { frontera: "src-tauri/src/**", proyecto: "Adeorq" }),
  ],
  { cuentas: max },
);
comprueba("la frontera propia va en el prompt", r.puestos[0].prompt.includes("src/components/**"), r.puestos[0].prompt);
comprueba("y la del otro también, para saber qué no tocar", r.puestos[0].prompt.includes("src-tauri/src/**"), r.puestos[0].prompt);
comprueba("con fronteras repartidas no hay aviso de pisarse", r.avisos.length === 0, r.avisos);

// 7. Sin fronteras y en el mismo proyecto, se avisa. No se prohíbe: a veces son
//    partes distintas y quien lo sabe es quien las escribió.
r = repartir(
  [tarea("una cosa", {}, { proyecto: "Adeorq" }), tarea("otra cosa", {}, { proyecto: "Adeorq" })],
  { cuentas: max },
);
comprueba("dos tareas sueltas en el mismo proyecto -> avisa", r.avisos.some((a) => a.includes("Adeorq")), r.avisos);

// 8. El tope. Lo que sobra se dice, no se tira en silencio.
r = repartir(
  Array.from({ length: 11 }, (_, i) => tarea(`tarea ${i}`)),
  { cuentas: max },
);
comprueba("el tope corta en 8", r.puestos.length === 8, r.puestos.length);
comprueba("y dice cuántas quedan fuera", r.avisos.some((a) => a.includes("3")), r.avisos);

// 9. El mundo manda igual que en una sola tarea: sin semana, el lote entero
//    se abarata salvo lo intocable.
r = repartir(
  [tarea("un arreglo", { clase: "oficio" }), tarea("una auditoría", { clase: "juicio" })],
  { cuentas: [cuenta("claude", "P", 96, "max")] },
);
comprueba(
  "sin semana: el oficio baja y la auditoría no",
  r.puestos[0].receta.modelo !== "sonnet" && r.puestos[1].receta.modelo === "opus",
  r.puestos.map((p) => p.receta.modelo),
);

// 10. Y el plan de pago también llega al lote.
r = repartir([tarea("un arreglo", { clase: "oficio", consecuencia: "alta" })], {
  cuentas: [cuenta("claude", "P", 5, "free")],
});
comprueba(
  "sin suscripción, lo de consecuencia alta sigue en opus",
  r.puestos[0].receta.modelo === "opus",
  r.puestos[0].receta,
);

// 11. Un lote vacío no revienta ni inventa un acta con gente dentro.
r = repartir([], { cuentas: max });
comprueba("lote vacío: cero puestos, peso cero", r.puestos.length === 0 && r.peso === 0, r);

// 12. El nombre del puesto en el tablero. Lo que NO puede hacer es inventarse
//     un rol: si nadie lo rotuló, dice la clase de trabajo y ya está.
comprueba(
  "una tarea rotulada conserva su rótulo",
  rolDePuesto(tarea("Frontend: arregla el hover del botón")) === "Frontend",
  rolDePuesto(tarea("Frontend: arregla el hover del botón")),
);
comprueba(
  "sin rótulo, el rol es la clase de trabajo",
  rolDePuesto(tarea("arregla el hover", { trabajo: "diseno" })) === "Diseño",
  rolDePuesto(tarea("arregla el hover", { trabajo: "diseno" })),
);
comprueba(
  "los dos puntos de una frase normal no son un rótulo",
  rolDePuesto(tarea("hay un problema con esto: el botón no responde")) === "Código",
  rolDePuesto(tarea("hay un problema con esto: el botón no responde")),
);
comprueba(
  "una ruta con dos puntos tampoco",
  rolDePuesto(tarea("mira C:/proyectos/Adeorq y dime qué falla")) === "Código",
  rolDePuesto(tarea("mira C:/proyectos/Adeorq y dime qué falla")),
);
comprueba(
  "el rol nunca sale vacío",
  ["Código", "Texto", "Lectura", "Diseño"].includes(rolDePuesto(tarea("x"))),
  rolDePuesto(tarea("x")),
);

// 13. EL CASO QUE MÁS IMPORTA: si el Capataz no contesta, el lote no puede
//     abaratarse en silencio. Antes salía todo como oficio de consecuencia
//     baja, así que un corte de red abría una auditoría de seguridad en sonnet
//     sin decir ni una palabra: el reparto seguía saliendo, más barato y peor.
const roto = interpretarLote("el modelo devolvió cualquier cosa", [
  "audita el login",
  "traduce los tooltips",
  "monta el formulario",
]);
comprueba(
  "sin Capataz, la auditoría sigue siendo de juicio",
  roto.tareas[0].ex.clase === "juicio" && roto.tareas[0].ex.consecuencia === "alta",
  roto.tareas[0].ex,
);
comprueba("y la traducción sí baja a recado", roto.tareas[1].ex.clase === "recado", roto.tareas[1].ex);
comprueba("y el trabajo normal se queda en oficio", roto.tareas[2].ex.clase === "oficio", roto.tareas[2].ex);
r = repartir(roto.tareas, { cuentas: max });
comprueba(
  "el reparto de emergencia no abarata la auditoría",
  r.puestos[0].receta.modelo === "opus" && r.puestos[1].receta.modelo === "haiku",
  r.puestos.map((p) => p.receta.modelo),
);

// 14. Y si contesta de menos, las que faltan tampoco se abaratan.
const corto = interpretarLote(
  '{"tareas":[{"clase":"oficio","trabajo":"codigo"}]}',
  ["monta el formulario", "revisa las dependencias"],
);
comprueba(
  "la tarea que el Capataz se dejó se deduce igual",
  corto.tareas.length === 2 && corto.tareas[1].ex.clase === "juicio",
  corto.tareas.map((t) => t.ex.clase),
);

// 15. La misión del Panel entra como cuatro líneas rotuladas: cada puesto
//     conserva su nombre y recibe el cerebro de su oficio, no el de la tabla de
//     roles (que manda «Diseño» a opus por parecerse a «diseño de sistemas»).
const mision = [
  tarea("Frontend: la interfaz: HTML, CSS y componentes", { trabajo: "codigo" }),
  tarea("Backend: el servidor, los datos y las APIs", { trabajo: "codigo" }),
  tarea("Seguridad: revisar y endurecer", { clase: "juicio", consecuencia: "alta" }),
  tarea("Diseño: tipografías, paleta, espaciado", { trabajo: "diseno" }),
];
r = repartir(mision, { cuentas: max }, "una landing con formulario");
comprueba(
  "los cuatro puestos de la misión conservan su nombre",
  r.puestos.map((p) => rolDePuesto(p.tarea)).join(",") === "Frontend,Backend,Seguridad,Diseño",
  r.puestos.map((p) => rolDePuesto(p.tarea)),
);
comprueba(
  "solo Seguridad sube a opus; Diseño no",
  r.puestos.map((p) => p.receta.modelo).join(",") === "sonnet,sonnet,opus,sonnet",
  r.puestos.map((p) => p.receta.modelo),
);
comprueba("el acta los nombra a los cuatro", ["Frontend", "Backend", "Seguridad", "Diseño"].every((k) => r.acta.includes(k)), r.acta);

// 16. El objetivo ya no lleva fecha pegada: un reparto puede ser de diez
//     minutos o de toda la semana, y «del día» era una promesa que nadie hizo.
comprueba(
  "con objetivo, el prompt dice Objetivo: y no del día",
  r.puestos[0].prompt.includes("Objetivo: una landing con formulario") &&
    !r.puestos[0].prompt.includes("Objetivo del día"),
  r.puestos[0].prompt.split("\n")[0],
);
comprueba(
  "sin objetivo no se inventa ninguno",
  !promptPara("claude", tarea("una cosa"), []).includes("Objetivo:"),
  promptPara("claude", tarea("una cosa"), []),
);

// 17. El cerebro elegido a mano. El router acierta casi siempre, pero quien
//     escribió la tarea sabe cosas que no caben en su texto, así que puede
//     llevarle la contraria. Lo que NO puede es saltarse la cuota: eso no es
//     una opinión, es lo que te queda.
r = repartir([tarea("renombra las variables", { clase: "recado" })], { cuentas: max });
comprueba(
  "sin pedir nada, un recado sigue saliendo barato",
  r.puestos[0].receta.modelo === "haiku",
  r.puestos[0].receta.modelo,
);

r = repartir(
  [tarea("renombra las variables", { clase: "recado" }, { pedido: "opus" })],
  { cuentas: max },
);
comprueba(
  "lo que pides a mano manda sobre la clasificación",
  r.puestos[0].receta.modelo === "opus",
  r.puestos[0].receta.modelo,
);
comprueba(
  "y el peso del lote lo refleja, que es el número con el que decides",
  r.peso > 1,
  r.peso,
);

// Con la semana agotada, un capricho SÍ se baja: pedir opus para un recado no
// puede vaciar la cuota que hace falta para lo que sí importa.
r = repartir(
  [tarea("renombra las variables", { clase: "recado" }, { pedido: "opus" })],
  { cuentas: [cuenta("claude", "P", 99, "max")] },
);
comprueba(
  "sin semana, el cerebro pedido a mano para un recado se abarata igual",
  r.puestos[0].receta.modelo !== "opus",
  r.puestos[0].receta.modelo,
);

// Pero lo intocable sigue siendo intocable: una auditoría no se abarata ni
// pidiéndola tú, porque repetir ese trabajo cuesta más que la cuota.
r = repartir(
  [tarea("audita el login", { clase: "juicio", consecuencia: "alta" })],
  { cuentas: [cuenta("claude", "P", 99, "max")] },
);
comprueba(
  "una auditoría no se abarata ni con la semana agotada",
  r.puestos[0].receta.modelo === "opus",
  r.puestos[0].receta.modelo,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
