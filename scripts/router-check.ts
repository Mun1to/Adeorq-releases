// Comprobación del router: 46 casos que se ejecutan de verdad.
//
//   npx tsc scripts/router-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <fuera>
//   node <fuera>/scripts/router-check.js
//
// Existe porque compilar no demuestra que decida bien: la primera versión
// pasaba el compilador con una rama inalcanzable dentro y un mensaje que
// nombraba dos veces la cuenta equivocada.
import {
  exigenciaDeRol,
  interpretar,
  pesoDelPlan,
  recetar,
  techoDelPlan,
  type CuentaViva,
  type Exigencia,
} from "../src/lib/router";

const cuenta = (provider: string, label: string, gastado?: number): CuentaViva => ({
  cuenta: { id: `${provider}:${label}`, label, dir: "", provider },
  instalado: true,
  conectada: true,
  gastado,
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

const ex = (p: Partial<Exigencia>): Exigencia => ({
  clase: "oficio",
  consecuencia: "baja",
  largo: false,
  trabajo: "codigo",
  ...p,
});

const soloClaude = [cuenta("claude", "Principal", 20)];

// 1. Cada clase pide su cerebro.
let r = recetar(ex({ clase: "recado" }), { cuentas: soloClaude });
comprueba("recado -> haiku/low", r.modelo === "haiku" && r.esfuerzo === "low", r);

r = recetar(ex({ clase: "oficio" }), { cuentas: soloClaude });
comprueba("oficio -> sonnet/medium", r.modelo === "sonnet" && r.esfuerzo === "medium", r);

r = recetar(ex({ clase: "juicio" }), { cuentas: soloClaude });
comprueba("juicio -> opus/high", r.modelo === "opus" && r.esfuerzo === "high", r);

// 2. La consecuencia sube un escalón; el tamaño no.
r = recetar(ex({ clase: "oficio", consecuencia: "alta" }), { cuentas: soloClaude });
comprueba("oficio + consecuencia alta -> opus", r.modelo === "opus", r);

r = recetar(ex({ clase: "recado", largo: true }), { cuentas: soloClaude });
comprueba("recado enorme sigue siendo haiku", r.modelo === "haiku", r);

// 3. La cuota corrige hacia abajo, pero nunca en lo que importa.
r = recetar(ex({ clase: "juicio" }), { cuentas: [cuenta("claude", "Principal", 85)] });
comprueba("semana justa + juicio -> NO baja de opus", r.modelo === "opus", r);

r = recetar(ex({ clase: "juicio", consecuencia: "baja" }), {
  cuentas: [cuenta("claude", "P", 85)],
});
comprueba("semana justa + juicio de consecuencia baja -> opus igual", r.modelo === "opus", r);

// Un oficio que subió a opus por consecuencia alta tampoco baja.
r = recetar(ex({ clase: "oficio", consecuencia: "alta" }), {
  cuentas: [cuenta("claude", "P", 85)],
});
comprueba("semana justa + consecuencia alta -> se queda en opus", r.modelo === "opus", r);

// 4. Sin semana y sin relevo: abarata y lo dice.
r = recetar(ex({ clase: "oficio" }), { cuentas: [cuenta("claude", "P", 96)] });
comprueba(
  "sin semana, sin relevo -> baja a haiku y lo explica",
  r.modelo === "haiku" && r.porque.some((p) => p.includes("96") || p.includes("4 %")),
  r,
);

// 5. Sin semana y CON relevo conectado: cambia de CLI y deja el plan B.
r = recetar(ex({ clase: "oficio" }), {
  cuentas: [cuenta("claude", "P", 96), cuenta("codex", "Principal")],
});
comprueba(
  "sin semana + codex conectado -> va a codex con alternativa a claude",
  r.cli === "codex" && r.alternativa?.cli === "claude",
  r,
);

// Pero con semana de sobra NO se va a otro CLI aunque esté conectado.
r = recetar(ex({ clase: "oficio" }), {
  cuentas: [cuenta("claude", "P", 10), cuenta("codex", "Principal")],
});
comprueba("con semana, codex conectado -> sigue claude", r.cli === "claude", r);

// 6. Elige la cuenta con más semana, y no la que no supo decir.
r = recetar(ex({}), {
  cuentas: [cuenta("claude", "Vieja", 90), cuenta("claude", "Nueva", 5)],
});
comprueba("elige la cuenta más fresca", r.cuenta?.label === "Nueva", r);

r = recetar(ex({}), {
  cuentas: [cuenta("claude", "SinDato", undefined), cuenta("claude", "Libre", 10)],
});
comprueba("una cuenta sin dato no adelanta a una que dice que le sobra", r.cuenta?.label === "Libre", r);

// 7. Una cuenta que NO está conectada no se usa.
r = recetar(ex({}), {
  cuentas: [{ ...cuenta("claude", "Desconectada", 1), conectada: false }],
});
comprueba("cuenta desconectada -> no la propone", r.cuenta === undefined, r);

// 8. Los avisos, y cuándo se callan.
r = recetar(ex({ clase: "recado" }), {
  cuentas: soloClaude,
  panel: { model: "claude-opus-5" },
});
comprueba("opus puesto para un recado -> avisa", !!r.aviso, r.aviso);

r = recetar(ex({ clase: "juicio" }), {
  cuentas: soloClaude,
  panel: { model: "haiku" },
});
comprueba("haiku puesto para juicio -> avisa", !!r.aviso, r.aviso);

r = recetar(ex({ clase: "oficio" }), {
  cuentas: soloClaude,
  panel: { model: "claude-opus-5" },
});
comprueba("opus donde tocaba sonnet -> NO avisa (gordas)", !r.aviso, r.aviso);

r = recetar(ex({ clase: "oficio" }), {
  cuentas: soloClaude,
  panel: { model: "claude-opus-5" },
  avisos: "siempre",
});
comprueba("el mismo caso con avisos=siempre -> sí avisa", !!r.aviso, r.aviso);

r = recetar(ex({ clase: "recado" }), {
  cuentas: soloClaude,
  panel: { model: "claude-opus-5" },
  avisos: "nunca",
});
comprueba("avisos=nunca -> callado", !r.aviso, r.aviso);

r = recetar(ex({ clase: "oficio" }), {
  cuentas: soloClaude,
  panel: { model: "claude-sonnet-5" },
});
comprueba("lo puesto ya coincide -> sin aviso", !r.aviso, r.aviso);

// 9. La frontera con el modelo aguanta lo que le echen.
let i = interpretar('{"encargo":"Haz X","clase":"juicio","consecuencia":"alta","largo":true,"trabajo":"lectura"}');
comprueba("JSON limpio", i.encargo === "Haz X" && i.ex.clase === "juicio" && i.ex.largo, i);

i = interpretar('Claro:\n```json\n{"encargo":"Haz Y","clase":"recado"}\n```');
comprueba("JSON envuelto en markdown", i.encargo === "Haz Y" && i.ex.clase === "recado", i);

i = interpretar("Esto es texto pelado, sin JSON.");
comprueba(
  "texto pelado -> se usa tal cual y clasifica por defecto",
  i.encargo === "Esto es texto pelado, sin JSON." && i.ex.clase === "oficio",
  i,
);

i = interpretar('{"encargo":"Z","clase":"inventada","trabajo":"marciano"}');
comprueba(
  "valores inventados -> caen al valor por defecto",
  i.ex.clase === "oficio" && i.ex.trabajo === "codigo",
  i,
);

i = interpretar('{"clase":"recado"}');
comprueba("JSON sin encargo -> no se pierde el texto", i.encargo.includes("recado"), i);

// 10. El modelo que alguien ya pidió a conciencia (el plan del Capataz, o
//     Munir a mano): se respeta, pero no crea semana donde no la hay.
r = recetar(ex({ clase: "recado" }), { cuentas: soloClaude }, "opus");
comprueba("lo pedido manda cuando hay semana", r.modelo === "opus", r);

r = recetar(ex({ clase: "oficio" }), { cuentas: [cuenta("claude", "P", 96)] }, "opus");
comprueba("lo pedido NO sobrevive a quedarse sin semana", r.modelo !== "opus", r);

r = recetar(ex({ clase: "juicio" }), { cuentas: [cuenta("claude", "P", 96)] }, "opus");
comprueba("pero una auditoría sin semana se queda en opus", r.modelo === "opus", r);

// 11. La exigencia deducida del rol del plan, que es lo que alimenta al router
//     cuando el Capataz reparte una cuadrilla.
comprueba("rol «Seguridad» -> juicio y consecuencia alta", (() => {
  const e = exigenciaDeRol("Seguridad");
  return e.clase === "juicio" && e.consecuencia === "alta";
})(), exigenciaDeRol("Seguridad"));

comprueba("rol «Traducciones» -> recado", exigenciaDeRol("Traducciones").clase === "recado", exigenciaDeRol("Traducciones"));
comprueba("rol «Frontend» -> oficio", exigenciaDeRol("Frontend").clase === "oficio", exigenciaDeRol("Frontend"));
comprueba("un rol raro -> oficio, que es el término medio", exigenciaDeRol("Pepito").clase === "oficio", exigenciaDeRol("Pepito"));

// Y el caso que motivó todo: una cuadrilla de seis con la semana agotada.
const cuadrilla = ["Seguridad", "Frontend", "Backend", "Tests", "Traducciones", "Docs"];
const conSemana = cuadrilla.map(
  (rol) => recetar(exigenciaDeRol(rol), { cuentas: [cuenta("claude", "P", 10)] }).modelo,
);
const sinSemana = cuadrilla.map(
  (rol) => recetar(exigenciaDeRol(rol), { cuentas: [cuenta("claude", "P", 96)] }).modelo,
);
comprueba(
  "cuadrilla de 6: sin semana pesa menos que con semana",
  pesoDelPlan(sinSemana) < pesoDelPlan(conSemana),
  { conSemana, sinSemana, pesos: [pesoDelPlan(conSemana), pesoDelPlan(sinSemana)] },
);
comprueba(
  "cuadrilla de 6: el puesto de Seguridad NO se abarata ni sin semana",
  sinSemana[0] === "opus",
  sinSemana,
);

// 12. Los clientes que el usuario dijo que usa en la bienvenida: el relevo no
//     puede mandarle a uno que no abre nunca, aunque esté instalado y con
//     sesión iniciada.
const agotadaConVecinos = [
  cuenta("claude", "P", 96),
  cuenta("codex", "Codex", 5),
  cuenta("gemini", "Gemini", 5),
];

r = recetar(ex({ clase: "oficio" }), { cuentas: agotadaConVecinos });
comprueba("sin lista, el relevo puede ser cualquiera de los conectados", r.cli !== "claude", r);

r = recetar(ex({ clase: "oficio" }), { cuentas: agotadaConVecinos, usa: ["claude", "gemini"] });
comprueba("con lista, releva al que sí usa", r.cli === "gemini", r);

r = recetar(ex({ clase: "oficio" }), { cuentas: agotadaConVecinos, usa: ["claude"] });
comprueba("si no usa ningún otro, se queda en Claude", r.cli === "claude", r);

r = recetar(ex({ clase: "oficio" }), { cuentas: agotadaConVecinos, usa: [] });
comprueba("lista vacía = como antes de que existiera la pregunta", r.cli !== "claude", r);

// 13. El plan contratado, que es el otro techo: la cuota dice cuánto queda del
//     mes, el plan dice qué se puede gastar sin que salga del bolsillo.
const conPlan = (plan: string | undefined, gastado = 10): CuentaViva[] => [
  { ...cuenta("claude", "P", gastado), plan },
];

r = recetar(ex({ clase: "juicio" }), { cuentas: conPlan("max") });
comprueba("con Max, opus sin tocar", r.modelo === "opus", r);

r = recetar(ex({ clase: "juicio" }), { cuentas: conPlan("pro") });
comprueba("con Pro, opus sigue saliendo (solo avisa)", r.modelo === "opus", r);

r = recetar(ex({ clase: "oficio", consecuencia: "alta" }), { cuentas: conPlan("free") });
comprueba("sin suscripción, lo que solo sube por consecuencia NO se abarata", r.modelo === "opus", r);

r = recetar(ex({ clase: "juicio" }), { cuentas: conPlan("free") });
comprueba("sin suscripción, una auditoría sigue en opus", r.modelo === "opus", r);

r = recetar(ex({ clase: "recado" }), { cuentas: conPlan("free") }, "opus");
comprueba("sin suscripción, un recado pedido en opus baja a sonnet", r.modelo === "sonnet", r);

r = recetar(ex({ clase: "recado" }), { cuentas: conPlan(undefined) }, "opus");
comprueba("plan desconocido NO limita: se respeta lo pedido", r.modelo === "opus", r);

r = recetar(ex({ clase: "recado" }), { cuentas: conPlan("free") });
comprueba("sin suscripción, un recado sigue siendo haiku (no sube al techo)", r.modelo === "haiku", r);

comprueba("el techo de Max y Pro es ninguno", techoDelPlan("max") === null && techoDelPlan("pro") === null, [
  techoDelPlan("max"),
  techoDelPlan("pro"),
]);
comprueba("el techo sin plan de pago es sonnet", techoDelPlan("free") === "sonnet", techoDelPlan("free"));

// Las tarjetas del kanban entran por aquí en texto libre: nadie las etiqueta,
// se escriben de una frase. Antes toda tarjeta arrastrada abría un Claude con
// el modelo por defecto, y «traduce los tooltips» costaba lo mismo que «audita
// el login». Si esta deducción falla, el tablero vuelve a decidir a ciegas.
const max2 = [cuenta("claude", "Principal", 10)];
const deTarjeta = (texto: string) => recetar(exigenciaDeRol(texto), { cuentas: max2 }).modelo;

comprueba("una tarjeta de auditoría abre en opus", deTarjeta("audita el login") === "opus", deTarjeta("audita el login"));
comprueba(
  "una de traducción abre en haiku",
  deTarjeta("traduce los tooltips al inglés") === "haiku",
  deTarjeta("traduce los tooltips al inglés"),
);
comprueba(
  "una de oficio se queda en sonnet",
  deTarjeta("monta el formulario de contacto") === "sonnet",
  deTarjeta("monta el formulario de contacto"),
);
comprueba(
  "un renombrado masivo no sube de cerebro por ser largo",
  deTarjeta("renombra las variables de todo el proyecto") === "haiku",
  deTarjeta("renombra las variables de todo el proyecto"),
);
comprueba(
  "lo que no dice nada cae en sonnet, no en opus",
  deTarjeta("mira esto cuando puedas") === "sonnet",
  deTarjeta("mira esto cuando puedas"),
);
comprueba(
  "una tarjeta vacía no revienta",
  typeof deTarjeta("") === "string",
  deTarjeta(""),
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
