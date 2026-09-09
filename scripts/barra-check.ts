// Casos de qué se ve en la barra. Se corren de verdad, no se leen:
//
//   npx tsc scripts/barra-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/barra-check.js
//
// (El porqué de ese camino, en `docs/` y en la memoria: Adeorq no tiene runner
// de tests y la lógica pura se prueba compilando a CommonJS.)
//
// Lo que se defiende aquí son DOS cosas:
//
//   1. que la barra y el asistente del ＋ contesten lo mismo a «¿ya la tengo?».
//      Cuando cada uno tenía su regla, el ＋ te ofrecía traer sesiones que ya
//      estaban en la barra y te las seguía ofreciendo después de traerlas.
//   2. que la barra mire treinta días hacia atrás y no siete. El corte de una
//      semana dejaba 13 sesiones a la vista de 452 en el disco, y Munir
//      preguntó el 2026-09-09 por qué habían «desaparecido».

import { HORAS_EN_LA_BARRA, porQueSale, saleEnLaBarra, type Mirable } from "../src/lib/enLaBarra";

let fallos = 0;
function ok(nombre: string, real: boolean, porque?: string) {
  if (!real) fallos++;
  console.log(`${real ? "ok  " : "FALLA"} ${nombre}${!real && porque ? ` — ${porque}` : ""}`);
}

const dias = (n: number): number => n * 24;

const vieja: Mirable = { id: "v", hours: dias(45) };
const deAyer: Mirable = { id: "a", hours: dias(1) };
const viva: Mirable = { id: "x", hours: 1 };
/** La que el corte de una semana escondía y el de un mes enseña. */
const deHaceDiezDias: Mirable = { id: "d", hours: dias(10) };
const nada = { enPantalla: new Set<string>(), traidas: new Set<string>() };

// ── El corte de la barra ────────────────────────────────────────────────────
ok("la barra mira un mes hacia atrás", HORAS_EN_LA_BARRA === dias(30));
ok(
  "una de hace diez días SE VE",
  saleEnLaBarra(deHaceDiezDias, nada),
  "es el caso de Munir del 2026-09-09: con el corte de una semana se veían 13 de 452 y parecían borradas",
);
ok(
  "y una de hace diez días no sale como que falta por traer",
  porQueSale(deHaceDiezDias, nada) === "reciente",
  "si la barra ya la enseña, el ＋ no puede ofrecerte traerla",
);
ok(
  "justo en el límite del mes ya NO se ve",
  !saleEnLaBarra({ id: "l", hours: HORAS_EN_LA_BARRA }, nada),
  "el corte es estricto por abajo, si no el límite no significa nada",
);

// ── Lo que se ve ────────────────────────────────────────────────────────────
ok("una de esta semana se ve sin más", saleEnLaBarra(deAyer, nada));
ok("una activa también", saleEnLaBarra(viva, nada));
ok("una de hace mes y medio NO se ve", !saleEnLaBarra(vieja, nada));
ok(
  "salvo que la tengas abierta en un panel",
  saleEnLaBarra(vieja, { ...nada, enPantalla: new Set(["v"]) }),
  "lo que está en pantalla manda sobre la edad, o verías un panel de una sesión que la barra niega",
);
ok(
  "o que la hayas traído tú a mano",
  saleEnLaBarra(vieja, { ...nada, traidas: new Set(["v"]) }),
  "ir a buscar una de hace dos meses y que la regla de la edad la esconda justo después es el fallo que traidas resuelve",
);
ok(
  "con «ver las viejas» puesto se ve todo",
  saleEnLaBarra(vieja, { ...nada, verViejas: true }),
);

// ── EL CASO QUE DA NOMBRE AL ARREGLO ────────────────────────────────────────
ok(
  "traer una vieja hace que deje de faltar",
  porQueSale(vieja, nada) === null &&
    porQueSale(vieja, { ...nada, traidas: new Set(["v"]) }) !== null,
  "es el fallo de Munir del 2026-08-12: marcabas las 60 que faltaban, las ponías, y al volver seguían saliendo como que faltaban",
);
ok(
  "y una reciente NO falta nunca, aunque no la hayas traído",
  porQueSale(deAyer, nada) !== null,
  "ya sale sola en la barra por ser reciente: ofrecerla es ofrecer algo que ya tienes",
);

// ── El porqué, que se dice con palabras distintas ───────────────────────────
ok("abierta gana a todo", porQueSale(vieja, { ...nada, enPantalla: new Set(["v"]), traidas: new Set(["v"]) }) === "abierta");
ok("traída, cuando no está abierta", porQueSale(vieja, { ...nada, traidas: new Set(["v"]) }) === "traida");
ok("reciente, cuando no es ninguna de las dos", porQueSale(deAyer, nada) === "reciente");
ok("y null es lo ÚNICO que de verdad falta", porQueSale(vieja, nada) === null);
ok(
  "una vieja abierta se dice «abierta», no «reciente»",
  porQueSale(vieja, { ...nada, enPantalla: new Set(["v"]) }) === "abierta",
  "con verViejas o con la edad se colaría el motivo equivocado y el usuario leería una explicación falsa",
);
ok(
  "con «ver las viejas», una vieja sin traer sale como reciente y no como que falta",
  porQueSale(vieja, { ...nada, verViejas: true }) === "reciente",
  "si el interruptor las enseña todas, no hay nada que traer",
);

// ── Las dos funciones no pueden contradecirse ───────────────────────────────
const mundos = [
  nada,
  { ...nada, enPantalla: new Set(["v", "a"]) },
  { ...nada, traidas: new Set(["v"]) },
  { ...nada, verViejas: true },
  { enPantalla: new Set(["x"]), traidas: new Set(["a"]), verViejas: false },
];
let coherente = true;
for (const s of [vieja, deAyer, viva, deHaceDiezDias]) {
  for (const e of mundos) {
    if (saleEnLaBarra(s, e) !== (porQueSale(s, e) !== null)) coherente = false;
  }
}
ok(
  "«se ve» y «por qué se ve» dicen siempre lo mismo",
  coherente,
  "si se separan, la barra pinta una cosa y el asistente cuenta otra, que es de donde venía todo esto",
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
