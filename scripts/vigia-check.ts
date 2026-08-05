// Comprobación del vigía: casos que se ejecutan de verdad.
//
//   npx tsc scripts/vigia-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/vigia-check.js
//
// Mismo motivo que `router-check.ts` y `reparto-check.ts`: compilar demuestra
// que los tipos encajan, no que el vigía se calle cuando toca. Y aquí callarse
// es la mitad del trabajo: un vigía que suelta seis líneas seguidas convierte
// la bandeja de la Agenda en algo que Munir deja de mirar, y entonces no vigila
// nadie. La mayoría de estos casos comprueban SILENCIOS.
import {
  aProponer,
  anotar,
  memoriaVacia,
  podar,
  señalesDe,
  BLOQUEO,
  ENFRIA_CUADRILLA,
  ENFRIA_TODO,
  ESPERA,
  GRACIA,
  QUIETAS,
  TOPE,
  type CuadrillaVista,
  type PuestoVisto,
} from "../src/lib/vigia";
import type { CrewNote, WorkState } from "../src/lib/pty";

let fallos = 0;
function comprueba(titulo: string, cond: boolean, visto: unknown) {
  if (!cond) {
    fallos++;
    console.log(`FALLA  ${titulo}\n       visto: ${JSON.stringify(visto)}`);
  } else {
    console.log(`ok     ${titulo}`);
  }
}

const AHORA = 1_800_000_000_000;
const MIN = 60_000;

const puesto = (rol: string, estado: WorkState, hace = 1, frontera?: string): PuestoVisto => ({
  paneId: Math.abs(rol.length * 7 + estado.length),
  rol,
  frontera,
  estado,
  desde: AHORA - hace * MIN,
});

const cuadrilla = (p: Partial<CuadrillaVista> = {}): CuadrillaVista => ({
  teamId: "t1",
  objetivo: "la landing nueva",
  cwd: "C:/proyectos/Adeorq",
  proyecto: "Adeorq",
  nacida: AHORA - 30 * MIN,
  puestos: [puesto("Frontend", "a_medias"), puesto("Backend", "a_medias")],
  notas: [],
  buzonCambio: AHORA - MIN,
  ...p,
});

const nota = (who: string, text: string): CrewNote => ({ who, text });

// ── Las seis señales, cada una con su foto mínima ──────────────────────────

// 1. Terminada.
let c = cuadrilla({ puestos: [puesto("Frontend", "lista"), puesto("Backend", "lista")] });
let s = señalesDe(c, AHORA);
comprueba("todos en hecho -> terminada", s[0]?.clase === "terminada", s);
comprueba("y no dice nada más: ya está cerrada", s.length === 1, s);

// 2. Frontera pisada.
c = cuadrilla({
  puestos: [
    puesto("Frontend", "a_medias", 1, "src/components/**"),
    puesto("Backend", "a_medias", 1, "src-tauri/src/**"),
  ],
  notas: [nota("Frontend", "he tenido que tocar src-tauri/src/mcp.rs para probarlo")],
});
s = señalesDe(c, AHORA);
comprueba("nombrar el archivo de otro -> frontera", s.some((x) => x.clase === "frontera"), s);
comprueba(
  "y dice quién pisa a quién",
  s.find((x) => x.clase === "frontera")?.sujeto === "Frontend>Backend",
  s,
);

// 3. Bloqueo: pide algo Y el buzón lleva rato sin moverse.
const pidiendo = {
  notas: [nota("Backend", "necesito el endpoint de Frontend para seguir")],
};
c = cuadrilla({ ...pidiendo, buzonCambio: AHORA - BLOQUEO - MIN });
comprueba("petición + buzón parado -> bloqueo", señalesDe(c, AHORA).some((x) => x.clase === "bloqueo"), señalesDe(c, AHORA));
c = cuadrilla({ ...pidiendo, buzonCambio: AHORA - BLOQUEO + MIN });
comprueba(
  "la misma petición con el buzón vivo NO es bloqueo",
  !señalesDe(c, AHORA).some((x) => x.clase === "bloqueo"),
  señalesDe(c, AHORA),
);

// 4. Entrega: uno acaba, el otro sigue.
c = cuadrilla({ puestos: [puesto("Frontend", "lista"), puesto("Backend", "a_medias")] });
comprueba("uno hecho y otro trabajando -> entrega", señalesDe(c, AHORA).some((x) => x.clase === "entrega"), señalesDe(c, AHORA));

// 5. Espera, con su umbral.
c = cuadrilla({ puestos: [puesto("Frontend", "pregunta", ESPERA / MIN + 1), puesto("Backend", "a_medias")] });
comprueba("esperándote de más -> espera", señalesDe(c, AHORA).some((x) => x.clase === "espera"), señalesDe(c, AHORA));
c = cuadrilla({ puestos: [puesto("Frontend", "pregunta", ESPERA / MIN - 1), puesto("Backend", "a_medias")] });
comprueba(
  "justo por debajo del umbral, ni una palabra",
  !señalesDe(c, AHORA).some((x) => x.clase === "espera"),
  señalesDe(c, AHORA),
);

// 6. Quietas: hacen falta DOS parados y el buzón también quieto.
const viejo = QUIETAS / MIN + 1;
c = cuadrilla({
  puestos: [puesto("Frontend", "a_medias", viejo), puesto("Backend", "a_medias", viejo)],
  buzonCambio: AHORA - QUIETAS - MIN,
});
comprueba("dos parados y buzón quieto -> quietas", señalesDe(c, AHORA).some((x) => x.clase === "quietas"), señalesDe(c, AHORA));
c = cuadrilla({
  puestos: [puesto("Frontend", "a_medias", viejo), puesto("Backend", "a_medias", 1)],
  buzonCambio: AHORA - QUIETAS - MIN,
});
comprueba(
  "con uno solo parado, no",
  !señalesDe(c, AHORA).some((x) => x.clase === "quietas"),
  señalesDe(c, AHORA),
);

// ── Lo que NO se puede saber: no se dice ───────────────────────────────────

// Dos cuadrillas en la misma carpeta comparten BUZON.md. Si la nota no se puede
// atribuir, callarse; culpar al puesto equivocado es peor que no avisar.
c = cuadrilla({
  puestos: [
    puesto("Frontend", "a_medias", 1, "src/components/**"),
    puesto("Backend", "a_medias", 1, "src-tauri/src/**"),
  ],
  notas: [nota("", "he tocado src-tauri/src/mcp.rs")],
});
comprueba(
  "una nota sin firma no acusa a nadie",
  !señalesDe(c, AHORA).some((x) => x.clase === "frontera"),
  señalesDe(c, AHORA),
);
c = cuadrilla({
  puestos: [
    puesto("Frontend", "a_medias", 1, "src/components/**"),
    puesto("Backend", "a_medias", 1, "src-tauri/src/**"),
  ],
  notas: [nota("Diseño", "he tocado src-tauri/src/mcp.rs")],
});
comprueba(
  "una firma de otra cuadrilla tampoco",
  !señalesDe(c, AHORA).some((x) => x.clase === "frontera"),
  señalesDe(c, AHORA),
);
comprueba("una cuadrilla sin puestos no dice nada", señalesDe(cuadrilla({ puestos: [] }), AHORA).length === 0, []);

// ── La moderación, que es la mitad del trabajo ─────────────────────────────

const acabada = (id: string): CuadrillaVista =>
  cuadrilla({
    teamId: id,
    puestos: [puesto("Frontend", "lista"), puesto("Backend", "lista")],
  });

// Gracia: recién abierta no se toca ni aunque haya señal.
comprueba(
  "dentro de la gracia, silencio",
  aProponer([{ ...acabada("t1"), nacida: AHORA - GRACIA + MIN }], memoriaVacia(), AHORA).length === 0,
  [],
);
comprueba(
  "pasada la gracia, habla",
  aProponer([acabada("t1")], memoriaVacia(), AHORA).length === 1,
  [],
);

// Una señal no se repite jamás.
let mem = memoriaVacia();
let salida = aProponer([acabada("t1")], mem, AHORA);
mem = anotar(mem, "t1", salida[0].señal, AHORA);
comprueba(
  "la misma señal no se dice dos veces",
  aProponer([acabada("t1")], mem, AHORA + ENFRIA_CUADRILLA + MIN).length === 0,
  [],
);

// Enfriamiento por cuadrilla: otra señal distinta, pero demasiado pronto.
const conEspera = cuadrilla({
  teamId: "t1",
  puestos: [puesto("Frontend", "pregunta", ESPERA / MIN + 1), puesto("Backend", "a_medias")],
});
comprueba(
  "otra señal de la misma cuadrilla espera su turno",
  aProponer([conEspera], mem, AHORA + MIN, "siempre").length === 0,
  [],
);

// Enfriamiento global: dos cuadrillas gritando a la vez, una sola línea.
salida = aProponer([acabada("t1"), acabada("t2")], memoriaVacia(), AHORA);
comprueba("dos cuadrillas a la vez -> una sola línea", salida.length === 1, salida.map((x) => x.cuadrilla.teamId));

// Tope de por vida.
mem = { ...memoriaVacia(), vecesDe: { t1: TOPE } };
comprueba("con el tope alcanzado, se calla para siempre", aProponer([acabada("t1")], mem, AHORA).length === 0, []);

// Prioridad: con varias a la vez sale la más gorda.
c = cuadrilla({
  puestos: [
    puesto("Frontend", "lista", 1, "src/components/**"),
    puesto("Backend", "pregunta", ESPERA / MIN + 1, "src-tauri/src/**"),
  ],
  notas: [nota("Frontend", "he mirado src-tauri/src/mcp.rs")],
  buzonCambio: AHORA - MIN,
});
salida = aProponer([c], memoriaVacia(), AHORA, "siempre");
comprueba("con varias señales sale la de más peso", salida[0]?.señal.clase === "frontera", salida[0]?.señal);

// Los modos.
comprueba(
  "modo nunca: ni una",
  aProponer([acabada("t1")], memoriaVacia(), AHORA, "nunca").length === 0,
  [],
);
const soloFloja = cuadrilla({
  puestos: [puesto("Frontend", "pregunta", ESPERA / MIN + 1), puesto("Backend", "a_medias")],
});
comprueba(
  "modo gordas: una espera no interrumpe",
  aProponer([soloFloja], memoriaVacia(), AHORA, "gordas").length === 0,
  [],
);
comprueba(
  "modo siempre: esa misma sí",
  aProponer([soloFloja], memoriaVacia(), AHORA, "siempre").length === 1,
  [],
);

// Dos cuadrillas distintas no se pisan la memoria.
mem = anotar(memoriaVacia(), "t1", { clase: "terminada", sujeto: "todos", texto: "x" }, AHORA);
comprueba(
  "silenciar una cuadrilla no silencia a la otra",
  aProponer([acabada("t2")], mem, AHORA + ENFRIA_TODO + MIN).length === 1,
  [],
);

// La poda: la memoria no crece para siempre.
mem = anotar(memoriaVacia(), "t1", { clase: "terminada", sujeto: "todos", texto: "x" }, AHORA);
comprueba(
  "lo de hace dos días se olvida",
  Object.keys(podar(mem, AHORA + 48 * 60 * MIN).dichas).length === 0,
  podar(mem, AHORA + 48 * 60 * MIN),
);
comprueba(
  "lo de hace un rato no",
  Object.keys(podar(mem, AHORA + 60 * MIN).dichas).length === 1,
  podar(mem, AHORA + 60 * MIN),
);

// El texto va a UNA línea de un archivo de texto: un salto lo partiría en dos
// entradas de la bandeja, y la segunda saldría sin formato.
const todas: string[] = [];
for (const foto of [
  acabada("t1"),
  cuadrilla({ puestos: [puesto("Frontend", "lista"), puesto("Backend", "a_medias")] }),
  cuadrilla({
    puestos: [puesto("Frontend", "pregunta", ESPERA / MIN + 1), puesto("Backend", "a_medias")],
  }),
  cuadrilla({
    objetivo: "un objetivo\ncon salto de línea dentro y además muy muy largo para que se recorte",
    puestos: [puesto("Frontend", "lista"), puesto("Backend", "lista")],
  }),
]) {
  todas.push(...señalesDe(foto, AHORA).map((x) => x.texto));
}
comprueba("ningún texto lleva salto de línea", todas.every((x) => !x.includes("\n")), todas);
comprueba("ningún texto viene vacío", todas.every((x) => x.trim().length > 10), todas);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
