// El router de decisión: a quién se le da este encargo.
//
// Es la otra mitad de `models.ts`. Aquella tabla elige el modelo DENTRO de
// Claude a partir de una etiqueta de rol; esta pieza elige el destino entero
// (CLI, cuenta, modelo y esfuerzo) a partir de lo que la tarea exige de verdad
// y de lo que hay disponible AHORA en el equipo.
//
// El reparto de trabajo es el de la casa (`IDEAS.md`, 2026-07-22): **el modelo
// interpreta, el código determinista restringe**. El modelo lee el pedido de
// Munir y dice qué exige (¿recado o juicio?, ¿qué pasa si sale mal?); todo lo
// que viene después ocurre aquí, sin una sola llamada, porque depende de datos
// que el modelo no tiene y que además cambian cada hora: qué CLIs hay
// instalados, qué cuentas han iniciado sesión y cuánta semana queda en cada
// una.
//
// Y hay una razón de producto para que sea código y no prompt: una
// recomendación que no se puede explicar línea a línea no se puede corregir.
// Cada regla de aquí deja escrito su porqué en la receta, así que la ficha del
// Asistente puede decir «es un recado y te queda un 18 % de semana» en vez de
// «he decidido haiku».

import type { Account } from "./pty";
import { modelForRole, type ModelAlias } from "./models";
import { providerOf } from "./providers";

export const ESFUERZOS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Esfuerzo = (typeof ESFUERZOS)[number];

/** Lo que la tarea EXIGE, que es lo único que se le pide al modelo decidir. */
export type Clase = "recado" | "oficio" | "juicio";

/** De qué va el trabajo. Pesa en el contexto y en el CLI, no en el cerebro. */
export type Trabajo = "codigo" | "texto" | "lectura" | "diseno";

export interface Exigencia {
  /**
   * recado  cosas mecánicas: renombrar, traducir, formatear, un typo.
   * oficio  el grueso: escribir una función, un refactor, unos tests, estilos.
   * juicio  donde equivocarse sin que se note sale caro: seguridad, auditoría,
   *         revisión, arquitectura, un bug que no se reproduce.
   */
  clase: Clase;
  /** Qué pasa si sale mal Y NO SE NOTA. Es lo que sube de cerebro, no el tamaño. */
  consecuencia: "baja" | "alta";
  /** Si va a leer o escribir mucho. Pesa en el contexto, no en el modelo. */
  largo: boolean;
  trabajo: Trabajo;
}

/** Una cuenta con lo que se sabe de ella ahora mismo. */
export interface CuentaViva {
  cuenta: Account;
  /** Su CLI está en el PATH de este equipo. */
  instalado: boolean;
  /** Ha iniciado sesión, según sus propios archivos de credenciales. */
  conectada: boolean;
  /**
   * Porcentaje de la semana YA GASTADO (0-100), cuando se puede saber.
   *
   * Solo Claude Code publica esto (`providers.ts` lo marca con `usage`), así
   * que en los demás vale `undefined` y el router NO se lo inventa: una cuenta
   * de la que no sabemos el gasto se trata como disponible, y se dice.
   */
  gastado?: number;
  /**
   * El plan contratado, tal como lo escribe el CLI en sus credenciales:
   * "max", "pro"… Vacío o sin poner significa que no se ha podido leer, y
   * entonces NO se limita nada: tratar un plan desconocido como el más pobre
   * le quitaría opus a alguien que lo está pagando.
   */
  plan?: string;
}

/**
 * El techo que pone el plan de pago.
 *
 * Sin suscripción, cada turno de opus sale del bolsillo por tokens, así que la
 * recomendación baja sola. Con Pro cabe, pero se avisa. Con Max no se toca
 * nada. Lo intocable (juicio, o consecuencia alta) NO baja por esto, igual que
 * no baja por la cuota: ahorrar cerebro en una auditoría cuesta repetirla.
 */
export function techoDelPlan(plan: string | undefined): ModelAlias | null {
  const p = (plan ?? "").toLowerCase();
  if (!p) return null;
  if (p.includes("max")) return null;
  if (p.includes("pro") || p.includes("team") || p.includes("enterprise")) return null;
  // Lo que queda es gratis o algo que no reconocemos como suscripción de pago.
  return "sonnet";
}

/** Si el plan da para opus sin que duela. Solo cambia el aviso, no la receta. */
function planJusto(plan: string | undefined): boolean {
  const p = (plan ?? "").toLowerCase();
  return p.includes("pro") && !p.includes("max");
}

export interface Mundo {
  cuentas: CuentaViva[];
  /** El panel que Munir tiene delante, para poder comparar con lo que hay puesto. */
  panel?: { model?: string; effort?: string; name?: string };
  /** Cuándo se avisa de que lo puesto no cuadra. Sin decir nada: solo lo gordo. */
  avisos?: ModoAviso;
  /** Los clientes que el usuario dijo que usa (bienvenida). Vacío o sin poner:
      valen todos los que estén instalados y conectados. */
  usa?: string[];
}

/**
 * Cuánto opina el router sin que se lo pidan.
 *
 * "gordas"  solo cuando el cerebro puesto y el que pide la tarea se llevan un
 *           abismo (un opus para un recado, un haiku para una auditoría).
 * "siempre" cualquier diferencia, aunque sea de un escalón.
 * "nunca"   ni una palabra: la recomendación sale igual, pero sin señalar el
 *           panel que tienes delante.
 */
export type ModoAviso = "gordas" | "siempre" | "nunca";

const AVISO_KEY = "adeorq-router-avisos";

/** Lo elegido en Ajustes. Por defecto solo lo gordo: un aviso que salta cada
    vez acaba ignorándose, que es peor que no tenerlo. */
export function modoAviso(): ModoAviso {
  const v = localStorage.getItem(AVISO_KEY);
  return v === "siempre" || v === "nunca" ? v : "gordas";
}

export function guardarModoAviso(m: ModoAviso): void {
  localStorage.setItem(AVISO_KEY, m);
}

export interface Receta {
  /** Id de proveedor (`providers.ts`): "claude", "codex", "agy"… */
  cli: string;
  cuenta?: Account;
  /** Solo para Claude: los demás CLIs no aceptan nuestros alias. */
  modelo?: ModelAlias;
  esfuerzo?: Esfuerzo;
  /** Las razones, en cristiano y en orden de peso. Se pintan tal cual. */
  porque: string[];
  /** Lo que se dice sin que lo pidas, cuando lo puesto no cuadra de verdad. */
  aviso?: string;
  /** El plan B, cuando existe uno con sentido. */
  alternativa?: { cli: string; cuenta?: Account; modelo?: ModelAlias; porque: string };
}

/**
 * Cuánto pesa cada cerebro, tomando haiku como 1.
 *
 * Son las proporciones del precio de entrada de la lista pública (haiku 1 $,
 * sonnet 3 $, opus 5 $, fable 10 $ por millón). Con una suscripción no se paga
 * en dólares sino en cuota, y ahí la proporción no es idéntica; el ORDEN sí,
 * que es lo único que este número decide. Por eso se enseña como «×5» y nunca
 * como una cantidad de dinero: sería inventarse una factura que no existe.
 */
export const PESO: Record<ModelAlias, number> = { haiku: 1, sonnet: 3, opus: 5, fable: 10 };

/** De menos a más cerebro, que es el orden en el que se sube y se baja. */
const ESCALA: ModelAlias[] = ["haiku", "sonnet", "opus"];

/** El cerebro que pide cada clase cuando nada más interviene. */
const POR_CLASE: Record<Clase, ModelAlias> = {
  recado: "haiku",
  oficio: "sonnet",
  juicio: "opus",
};

/** Cuánto se piensa las cosas, por clase. La otra palanca del precio. */
const ESFUERZO_CLASE: Record<Clase, Esfuerzo> = {
  recado: "low",
  oficio: "medium",
  juicio: "high",
};

/**
 * A partir de aquí la semana va justa y conviene no gastar de más.
 *
 * No es el 100 % a propósito: avisar cuando ya no queda nada no sirve de nada.
 * El 78 deja margen para terminar lo que estés haciendo con el cerebro bueno.
 */
const APRETADA = 78;

/** A partir de aquí esa cuenta se da por gastada para lo que no sea urgente. */
const AGOTADA = 92;

function subir(m: ModelAlias): ModelAlias {
  const i = ESCALA.indexOf(m);
  return i < 0 || i === ESCALA.length - 1 ? m : ESCALA[i + 1];
}

function bajar(m: ModelAlias): ModelAlias {
  const i = ESCALA.indexOf(m);
  return i <= 0 ? m : ESCALA[i - 1];
}

/**
 * Lo que NO se abarata por mucho que apriete la cuota.
 *
 * Vive en una función y no repetido en las dos ramas de cuota porque ya se
 * escribió dos veces y salieron distintas: la de «semana justa» miraba la
 * clase y la consecuencia, y la de «semana agotada» solo la consecuencia, así
 * que una auditoría se abarataba sola en cuanto la cuenta pasaba del 92 %. Lo
 * encontró `scripts/router-check.ts`, no el compilador.
 *
 * El criterio: en lo de juicio, ahorrar cerebro no ahorra nada. Una revisión
 * barata que no encuentra el fallo cuesta el trabajo entero otra vez, y encima
 * te deja tranquilo mientras tanto.
 */
function esIntocable(ex: Exigencia): boolean {
  return ex.clase === "juicio" || ex.consecuencia === "alta";
}

/**
 * En qué es razonable relevar a Claude, y por qué.
 *
 * OJO con cómo hay que leer esta tabla: es la OPINIÓN de la casa, no una
 * medida. No hay banco de pruebas detrás, así que solo entra en juego cuando
 * ya hay un motivo objetivo para no usar Claude (no queda semana), y nunca
 * para adelantarlo. Decir «esto se hace mejor con Codex» sin nada que lo
 * respalde sería exactamente el tipo de recomendación que no se puede
 * defender, y este router existe para lo contrario.
 *
 * El desempate real, y ese sí es un hecho: Adeorq lee de verdad las sesiones
 * de Claude (título, estado, contexto, transcript, cuota). Con otro CLI el
 * panel funciona igual pero ve menos, así que cambiar tiene un coste que no
 * aparece en ninguna factura.
 */
const RELEVOS: Array<{ cli: string; fuerte: Trabajo[]; porque: string }> = [
  { cli: "codex", fuerte: ["codigo", "texto"], porque: "es el relevo más parecido para código" },
  { cli: "agy", fuerte: ["lectura", "diseno"], porque: "Gemini aguanta bien leer mucho de golpe" },
  { cli: "gemini", fuerte: ["lectura", "texto"], porque: "va sobrado de contexto para leer" },
  { cli: "opencode", fuerte: ["codigo"], porque: "está conectado y sirve para esto" },
  { cli: "qwen", fuerte: ["codigo"], porque: "está conectado y sirve para esto" },
];

/** Las de un CLI que están instaladas y con sesión iniciada. */
function vivas(mundo: Mundo, cli: string): CuentaViva[] {
  return mundo.cuentas.filter((c) => c.cuenta.provider === cli && c.instalado && c.conectada);
}

/**
 * La que más semana le queda.
 *
 * Una cuenta sin dato de gasto cuenta como media semana, ni preferida ni
 * descartada. Tratarla como 0 la pondría siempre la primera, y entonces una
 * cuenta cuyo `/usage` falló adelantaría a otra que SÍ dijo que le sobra
 * semana, que es exactamente la decisión contraria a la que hay que tomar.
 */
const DESCONOCIDA = 50;

function laMasFresca(lista: CuentaViva[]): CuentaViva | undefined {
  if (lista.length === 0) return undefined;
  return [...lista].sort(
    (a, b) => (a.gastado ?? DESCONOCIDA) - (b.gastado ?? DESCONOCIDA),
  )[0];
}

/** «Principal» o el nombre que Munir le puso, para escribirlo en el porqué. */
function nombre(c: CuentaViva): string {
  return c.cuenta.label;
}

/**
 * La receta: a quién va este encargo y por qué.
 *
 * Se lee de arriba abajo como una conversación. Cada paso puede cambiar la
 * decisión y SIEMPRE deja dicho por qué la cambió, porque una recomendación
 * sin motivo no se puede discutir y esta se va a discutir.
 */
export function recetar(
  ex: Exigencia,
  mundo: Mundo,
  pedido?: ModelAlias,
  preferido?: ModelAlias,
): Receta {
  const porque: string[] = [];

  // 1. Lo que pide el trabajo, antes de mirar la cartera.
  //
  // `pedido` es el modelo que alguien ya eligió a conciencia PARA ESTA TAREA:
  // el Capataz cuando lo escribe en su plan, o Munir cambiándolo a mano en el
  // Reparto. Se respeta como punto de partida en vez de discutirlo, pero NO se
  // salta las reglas de cuota de más abajo: que alguien pida opus no hace que
  // aparezca semana.
  //
  // `preferido` es otra cosa: el cerebro por defecto de Ajustes, que se pone
  // una vez y se olvida. Por eso NO manda sobre una tarea de juicio: poner
  // haiku por defecto en enero no puede significar que en marzo una auditoría
  // de seguridad se haga con haiku. Un ajuste que se olvida no puede abaratar
  // lo que no se abarata ni con la cuota agotada (ver `esIntocable`).
  let modelo = pedido ?? POR_CLASE[ex.clase];
  if (!pedido && preferido && preferido !== modelo) {
    if (ex.clase === "juicio" && ESCALA.indexOf(preferido) < ESCALA.indexOf(modelo)) {
      porque.push(
        `Tienes ${preferido} como cerebro por defecto, pero esto es de los de juicio y ahí no se abarata.`,
      );
    } else {
      modelo = preferido;
      porque.push(`Tu cerebro por defecto es ${preferido}, así que se parte de ahí.`);
    }
  }
  const esfuerzo = ESFUERZO_CLASE[ex.clase];
  porque.push(
    ex.clase === "recado"
      ? "Es un recado mecánico: no hace falta pensar mucho, hace falta acertar rápido."
      : ex.clase === "juicio"
        ? "Es de los de juicio: si sale mal y no se nota, sale caro."
        : "Es oficio del día a día: escribir, refactorizar, probar.",
  );

  // 2. La consecuencia sube un escalón, y solo ella. El TAMAÑO de la tarea no
  //    sube de cerebro: una tarea grande y mecánica sigue siendo mecánica, y
  //    ahí subir de modelo es pagar el doble por lo mismo.
  if (ex.consecuencia === "alta" && ex.clase !== "juicio") {
    const antes = modelo;
    modelo = subir(modelo);
    if (modelo !== antes) {
      porque.push(`Sube a ${modelo} porque un fallo aquí no se ve hasta que ya ha hecho daño.`);
    }
  }

  // 3. Con qué cuenta. La más fresca de las que están de verdad conectadas.
  const claudes = vivas(mundo, "claude");
  const elegida = laMasFresca(claudes);

  if (claudes.length === 0) {
    // Sin Claude conectado no hay nada que optimizar: se busca quién queda.
    const relevo = primerRelevo(ex, mundo);
    if (relevo) {
      porque.push("No hay ninguna cuenta de Claude conectada ahora mismo.");
      porque.push(`Va a ${providerOf(relevo.cli).label}, que ${relevo.porque}.`);
      return { cli: relevo.cli, cuenta: relevo.cuenta, esfuerzo, porque };
    }
    porque.push("No hay ninguna cuenta conectada: conecta una en Cuentas.");
    return { cli: "claude", modelo, esfuerzo, porque };
  }

  const gastado = elegida?.gastado;
  if (claudes.length > 1 && gastado != null) {
    porque.push(`Con «${nombre(elegida!)}», que es la que más semana le queda (${100 - gastado} %).`);
  }

  // 4. La cuota corrige, y solo hacia abajo. Nunca al revés: que sobre semana
  //    no es motivo para gastar opus en un renombrado.
  if (gastado != null && gastado >= AGOTADA) {
    // Se acabó la semana. Y no hay que mirar si otra cuenta de Claude tiene
    // sitio: `laMasFresca` ya devolvió la que MENOS ha gastado, así que si esa
    // está agotada, todas lo están. Lo que queda es cambiar de CLI o abaratar.
    const relevo = primerRelevo(ex, mundo);
    if (relevo) {
      porque.push(`No queda semana en ninguna cuenta de Claude (${gastado} % gastado).`);
      porque.push(`Va a ${providerOf(relevo.cli).label}, que ${relevo.porque}.`);
      return {
        cli: relevo.cli,
        cuenta: relevo.cuenta,
        esfuerzo,
        porque,
        alternativa: {
          cli: "claude",
          cuenta: elegida?.cuenta,
          modelo,
          porque: "si prefieres gastar lo que queda de semana",
        },
      };
    }
    // Sin relevo: se sigue con Claude, pero barato y dicho.
    if (!esIntocable(ex) && modelo !== "haiku") {
      const antes = modelo;
      modelo = bajar(modelo);
      porque.push(
        `Baja de ${antes} a ${modelo}: te queda un ${100 - gastado} % de semana y no hay otro CLI conectado.`,
      );
    } else if (esIntocable(ex)) {
      // Que no se abarate no quiere decir que se calle: enterarte de que vas a
      // gastar el 4 % que queda en esto es justo lo que te deja decidir
      // hacerlo mañana.
      porque.push(
        `Te queda un ${100 - gastado} % de semana y esto se lleva ${modelo}: en lo de juicio, abaratar sale más caro.`,
      );
    }
  } else if (gastado != null && gastado >= APRETADA && modelo === "opus") {
    if (esIntocable(ex)) {
      // Aquí NO se baja. Bajar de opus en una auditoría para ahorrar cuota es
      // justo el error que sale caro: el trabajo hay que repetirlo entero.
      porque.push(
        `Se queda en opus aunque la semana va justa (${100 - gastado} %): en esto, ahorrar cerebro sale más caro que la cuota.`,
      );
    } else {
      modelo = "sonnet";
      porque.push(`Baja a sonnet: te queda un ${100 - gastado} % de semana y esto no lo necesita.`);
    }
  }

  // 4b. Y el plan contratado, que es el otro techo. La cuota dice cuánto queda
  //     de este mes; el plan dice qué puedes gastar sin que salga del bolsillo.
  //     Se aplica DESPUÉS de la cuota y con la misma regla: solo hacia abajo, y
  //     nunca en lo intocable.
  const techo = techoDelPlan(elegida?.plan);
  if (techo && PESO[modelo] > PESO[techo]) {
    if (esIntocable(ex)) {
      porque.push(
        `Sin suscripción esto se paga por tokens, pero se queda en ${modelo}: rehacer una revisión cuesta más que el turno.`,
      );
    } else {
      const antes = modelo;
      modelo = techo;
      porque.push(`Baja de ${antes} a ${modelo}: sin suscripción, cada turno se factura aparte.`);
    }
  } else if (planJusto(elegida?.plan) && modelo === "opus") {
    porque.push("Con el plan Pro, opus se come la semana mucho más rápido que sonnet.");
  }

  // 5. Lo largo pesa en el contexto, no en el cerebro. Se dice y ya: quien
  //    decide partir la tarea es Munir, no el router.
  if (ex.largo) {
    porque.push("Es larga: si el contexto se llena a la mitad, mejor partirla en dos encargos.");
  }

  const receta: Receta = {
    cli: "claude",
    cuenta: elegida?.cuenta,
    modelo,
    esfuerzo,
    porque,
  };
  receta.aviso = avisar(receta, ex, mundo);
  return receta;
}

/** El primer CLI conectado que encaja con el tipo de trabajo, o cualquiera. */
function primerRelevo(
  ex: Exigencia,
  mundo: Mundo,
): { cli: string; cuenta?: Account; porque: string } | undefined {
  // Si dijo en la bienvenida cuáles usa, los demás no se proponen aunque estén
  // instalados y conectados: mandar a alguien a un programa que no abre nunca
  // es un consejo que no va a seguir. Con la lista vacía valen todos, que es
  // como se comportaba antes de que existiera la pregunta.
  const suyos = mundo.usa?.length ? mundo.usa : null;
  const posibles = suyos ? RELEVOS.filter((r) => suyos.includes(r.cli)) : RELEVOS;
  const encaja = posibles.filter((r) => r.fuerte.includes(ex.trabajo));
  for (const r of [...encaja, ...posibles.filter((r) => !encaja.includes(r))]) {
    const cuenta = laMasFresca(vivas(mundo, r.cli));
    if (cuenta) return { cli: r.cli, cuenta: cuenta.cuenta, porque: r.porque };
  }
  return undefined;
}

/**
 * El aviso que sale sin que lo pidas, y SOLO cuando la diferencia es gorda.
 *
 * «Gorda» quiere decir dos cosas concretas, no un parecido: o el panel de
 * delante lleva un cerebro caro para un recado (tirar cuota), o lleva uno
 * barato para algo de juicio (repetir el trabajo). Un opus donde tocaba sonnet
 * no entra: es una diferencia real pero no arruina nada, y un aviso que salta
 * siempre acaba ignorándose, que es peor que no tenerlo.
 */
function avisar(receta: Receta, ex: Exigencia, mundo: Mundo): string | undefined {
  const modo = mundo.avisos ?? "gordas";
  if (modo === "nunca") return undefined;
  const puesto = (mundo.panel?.model ?? "").toLowerCase();
  if (!puesto || !receta.modelo) return undefined;
  const actual = ESCALA.find((m) => puesto.includes(m));
  if (!actual || actual === receta.modelo) return undefined;

  const salto = PESO[actual] - PESO[receta.modelo];
  if (modo === "siempre") {
    return salto > 0
      ? `El panel de delante lleva ${actual} y esto se hace con ${receta.modelo}.`
      : `El panel de delante lleva ${actual} y esto pide ${receta.modelo}.`;
  }
  if (salto >= 4 && ex.clase === "recado") {
    return `El panel de delante lleva ${actual} y esto es un recado: son unas ${Math.round(
      PESO[actual] / PESO[receta.modelo],
    )} veces más caro por el mismo resultado.`;
  }
  if (salto <= -4 && (ex.clase === "juicio" || ex.consecuencia === "alta")) {
    return `El panel de delante lleva ${actual} y esto es de los de juicio: lo barato aquí suele acabar en repetir el trabajo.`;
  }
  return undefined;
}

/** «×5 · opus», para la pastilla de la ficha. */
export function comoPeso(m: ModelAlias): string {
  return `×${PESO[m]}`;
}

/**
 * Qué exige una acción del plan del Capataz, deducido de su rol.
 *
 * El plan trae etiquetas («Bugs», «Seguridad», «Traducciones»), no una
 * clasificación, y pedirle además que clasifique sería alargar un prompt que ya
 * es largo para averiguar algo que su propia tabla de roles ya sabe. Así que se
 * reaprovecha `modelForRole`, que es la tabla que el Capataz ya usa, y se
 * traduce su respuesta a lo que este router entiende.
 *
 * La consecuencia sale de ahí también: los roles que mandan a opus son
 * exactamente los que la tabla considera «de consecuencia» (seguridad, bugs,
 * auditoría, revisión, arquitectura). No hay una segunda lista que mantener.
 */
export function exigenciaDeRol(rol: string, trabajo: Trabajo = "codigo"): Exigencia {
  const m = modelForRole(rol);
  const clase: Clase = m === "haiku" ? "recado" : m === "opus" ? "juicio" : "oficio";
  return { clase, consecuencia: clase === "juicio" ? "alta" : "baja", largo: false, trabajo };
}

/**
 * Lo que va a costar un plan entero, en pesos relativos.
 *
 * Sirve para lo que hoy no se puede saber antes de aceptar: que un plan de seis
 * agentes con tres opus dentro pesa lo mismo que quince haikus. No es una
 * factura, es la única cifra comparable que existe con una suscripción.
 */
export function pesoDelPlan(modelos: Array<ModelAlias | undefined>): number {
  return modelos.reduce((t, m) => t + (m ? PESO[m] : 0), 0);
}

/**
 * La frontera entre lo que dice el modelo y lo que decide el código.
 *
 * Tolerante a propósito: si el JSON viene envuelto en markdown, o le falta un
 * campo, o directamente no es JSON, esto NO falla. Devuelve el texto como
 * encargo y clasifica con lo que se pueda deducir, porque el peor resultado
 * aceptable es «el encargo mejorado sin recomendación», que es exactamente lo
 * que la app ya hacía antes de que existiera el router. Un error de formato no
 * puede quitarle a Munir la función que sí funcionaba.
 */
export function interpretar(raw: string): { encargo: string; ex: Exigencia; porque?: string } {
  const ex: Exigencia = { clase: "oficio", consecuencia: "baja", largo: false, trabajo: "codigo" };
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(raw.slice(a, b + 1)) as Record<string, unknown>;
      const encargo = typeof j.encargo === "string" ? j.encargo.trim() : "";
      if (encargo) {
        return {
          encargo,
          ex: {
            clase: unaDe(j.clase, ["recado", "oficio", "juicio"], "oficio"),
            consecuencia: unaDe(j.consecuencia, ["baja", "alta"], "baja"),
            largo: j.largo === true,
            trabajo: unaDe(j.trabajo, ["codigo", "texto", "lectura", "diseno"], "codigo"),
          },
          porque: typeof j.porque === "string" ? j.porque.trim() : undefined,
        };
      }
    } catch {
      // Cae al texto pelado de abajo, que es la respuesta de siempre.
    }
  }
  return { encargo: raw.trim(), ex };
}

function unaDe<T extends string>(v: unknown, ok: readonly T[], def: T): T {
  return typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : def;
}
