// El Reparto: varias tareas de golpe, cada una con su cliente, su cerebro y su
// encargo escrito, y todas atadas por el mismo papel.
//
// Es el Capataz llevado a un lote. La diferencia con el plan de siempre no es
// el tamaño: es que aquí las tareas SE CONOCEN entre ellas. Cada encargo dice
// qué archivos son suyos, qué está haciendo el de al lado y dónde apuntar lo
// que termine, y todo eso vive además en un papel común (el `BUZON.md` de la
// regla Q) para que nadie dependa de haber leído bien su propio prompt.
//
// Como `router.ts`, esto es una función PURA: se le da un lote y un mundo
// inventado y contesta lo mismo siempre. Quien habla con el disco o con el
// modelo es otro (`mundo.ts`, `foreman.rs`), y por eso esto se puede probar.

import { providerOf } from "./providers";
import {
  comoPeso,
  exigenciaDeRol,
  PESO,
  recetar,
  type Exigencia,
  type Mundo,
  type Receta,
} from "./router";
import { cerebroPorDefecto, type ModelAlias } from "./models";

/** Una tarea del lote, tal como entra al reparto. */
export interface Tarea {
  /** Lo que se escribió, tal cual. Es lo que se enseña en la lista. */
  texto: string;
  /** El encargo ya redactado. Si falta, se usa `texto`. */
  encargo?: string;
  ex: Exigencia;
  /** Dónde va. Vacío = donde esté el usuario ahora. */
  proyecto?: string;
  /** Los archivos o carpetas que son SUYOS, para que nadie pise a nadie. */
  frontera?: string;
  /** Por qué el modelo la clasificó así, para poder discutirlo. */
  porque?: string;
  /** El cerebro que has elegido TÚ para esta tarea, cuando no te vale el que
      salió solo. Manda sobre la clasificación, y la cuota solo puede moverlo
      hacia abajo (eso lo decide `recetar`, no esto). Vacío = automático. */
  pedido?: ModelAlias;
}

/** Una tarea ya con destino y con su prompt escrito. */
export interface Puesto {
  tarea: Tarea;
  receta: Receta;
  /** El prompt inicial, ya en el idioma del cliente que le toca. */
  prompt: string;
}

export interface Reparto {
  puestos: Puesto[];
  /** El papel común, en markdown, listo para el `BUZON.md` del proyecto. */
  acta: string;
  /** Lo que pesa el lote entero, en la escala de `PESO`. */
  peso: number;
  /** «2 opus + 4 sonnet», para el botón. */
  resumen: string;
  /** Lo que hay que decir antes de aceptar, si hay algo. */
  avisos: string[];
}

/** Tope de sentido común: más de esto no es un reparto, es una avalancha. */
export const MAX_TAREAS = 8;

/** Cómo se llama cada clase de trabajo en el tablero. */
const TRABAJO: Record<string, string> = {
  codigo: "Código",
  texto: "Texto",
  lectura: "Lectura",
  diseno: "Diseño",
};

/**
 * El nombre corto del puesto, para la fila del tablero de cuadrillas.
 *
 * Un reparto no trae roles con nombre como los trae la Misión del Panel: trae
 * tareas sueltas. Si la tarea ya viene rotulada («Frontend: el hover del
 * botón»), ese rótulo manda, porque lo escribió quien pidió el trabajo. Si no,
 * se dice de qué CLASE de trabajo es, que es lo único que aquí se sabe de
 * verdad. Inventar un nombre bonito sería el tablero afirmando algo que nadie
 * ha decidido.
 */
export function rolDePuesto(t: Tarea): string {
  const cabeza = t.texto.split("\n")[0].trim();
  // Un rótulo empieza en mayúscula y son una o dos palabras. Con la regla
  // suelta («lo que haya antes de los dos puntos») una frase como «hay un
  // problema: el botón no va» acababa siendo el nombre del puesto.
  const rotulo = cabeza.match(
    /^([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?):\s+\S/,
  );
  if (rotulo) return rotulo[1];
  return TRABAJO[t.ex.trabajo] ?? TRABAJO.codigo;
}

/**
 * El prompt inicial, adaptado al cliente que va a recibirlo.
 *
 * Lo que cambia de un cliente a otro NO es el encargo: es lo que ese programa
 * entiende. Las skills (`/frontlaxweb`) son de Claude Code y en Codex no
 * existen, así que mencionárselas es mandarle a escribir una barra que no hace
 * nada. Lo demás se pide EN EL TEXTO a propósito, y no se da por hecho que el
 * CLI lo cargue solo: así el encargo funciona igual en el que lee `AGENTS.md`
 * por su cuenta y en el que no.
 */
export function promptPara(cli: string, t: Tarea, otras: Tarea[], objetivo?: string): string {
  const partes: string[] = [];
  const encargo = (t.encargo ?? t.texto).trim();

  if (objetivo) {
    // «del día» no: un reparto puede ser la misión de la semana o un encargo de
    // diez minutos, y ponerle fecha a algo que no la tiene es mentirle al
    // agente sobre el plazo que se le da.
    partes.push(`Objetivo: ${objetivo}.`);
  }
  partes.push(encargo);

  if (t.frontera) {
    partes.push(
      `Tocas SOLO esto: ${t.frontera}. Si necesitas algo de fuera, anótalo en BUZON.md en vez de tocarlo.`,
    );
  }

  // Lo que hace que un lote sea un equipo y no seis desconocidos.
  if (otras.length) {
    const lista = otras
      .map((o) => `- ${(o.encargo ?? o.texto).split("\n")[0].slice(0, 110)}${o.frontera ? ` (suyo: ${o.frontera})` : ""}`)
      .join("\n");
    partes.push(
      `A la vez que tú están trabajando en:\n${lista}\nNo hagas su parte ni la esperes.`,
    );
  }

  partes.push(
    "Antes de empezar lee BUZON.md en la raíz del proyecto: ahí está el reparto entero. " +
      "Cuando termines o te bloquees, escribe ahí en una línea qué has hecho y qué te falta.",
  );
  partes.push("Si el proyecto tiene AGENTS.md o CLAUDE.md, síguelos.");

  // Solo Claude Code tiene skills invocables por barra.
  if (cli === "claude" && t.ex.trabajo === "diseno") {
    partes.push("Si vas a diseñar interfaz con movimiento, invoca antes la skill /frontlaxweb.");
  }

  partes.push("Empieza proponiendo tu plan en tres líneas y espera mi OK antes de tocar archivos.");
  return partes.join("\n\n");
}

/**
 * El papel común que ata el lote.
 *
 * Va al `BUZON.md` del proyecto, que es el sitio que la casa ya usa para que
 * las sesiones se hablen entre ellas (regla Q: efímero, local y JAMÁS
 * versionado). Se escribe entero de una vez, antes de abrir a nadie: si cada
 * agente solo tuviera su prompt, el que llegara tarde no sabría quién más está
 * dentro.
 */
export function actaDeReparto(puestos: Puesto[], objetivo?: string, cuando?: string): string {
  const filas = puestos.map((p, i) => {
    const r = p.receta;
    const quien = providerOf(r.cli).label + (r.modelo ? ` · ${r.modelo}` : "");
    const frontera = p.tarea.frontera ? ` — suyo: \`${p.tarea.frontera}\`` : "";
    return `${i + 1}. **${(p.tarea.encargo ?? p.tarea.texto).split("\n")[0].slice(0, 120)}**\n   ${quien}${frontera}`;
  });

  return [
    "# BUZÓN del reparto",
    "",
    objetivo ? `> Objetivo: ${objetivo}` : "> Reparto abierto desde Adeorq.",
    cuando ? `> Abierto: ${cuando}` : "",
    "",
    "## Quién hace qué",
    "",
    ...filas,
    "",
    "## Reglas del reparto",
    "",
    "- Cada uno toca SOLO lo suyo. Lo que necesites de otro, pídelo aquí.",
    "- Al terminar o al bloquearte, escribe una línea debajo con tu nombre y el estado.",
    "- Este archivo es local y efímero: no se versiona nunca.",
    "",
    "## Parte de trabajo",
    "",
    "<!-- cada agente escribe aquí -->",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n")
    .concat("\n");
}

/**
 * El reparto entero.
 *
 * Una sola pasada: cada tarea pide su receta al router con el MISMO mundo, así
 * que todas ven la misma cuota y el mismo plan, y el peso de abajo es el que de
 * verdad se va a gastar si aceptas.
 */
export function repartir(tareas: Tarea[], mundo: Mundo, objetivo?: string, cuando?: string): Reparto {
  const dentro = tareas.slice(0, MAX_TAREAS);
  const puestos: Puesto[] = dentro.map((tarea) => {
    const receta = recetar(tarea.ex, mundo, tarea.pedido, cerebroPorDefecto());
    const otras = dentro.filter((o) => o !== tarea);
    return { tarea, receta, prompt: promptPara(receta.cli, tarea, otras, objetivo) };
  });

  const avisos: string[] = [];
  if (tareas.length > dentro.length) {
    avisos.push(
      `Solo entran ${MAX_TAREAS} tareas de golpe: quedan ${tareas.length - dentro.length} fuera para la próxima tanda.`,
    );
  }
  // Dos tareas sin frontera en el mismo proyecto se van a pisar, y eso cuesta
  // más que hacerlas seguidas. Se avisa, no se prohíbe: a veces son de partes
  // distintas y quien lo sabe es el que las escribió.
  const porProyecto = new Map<string, number>();
  for (const p of puestos) {
    if (p.tarea.frontera) continue;
    const key = p.tarea.proyecto ?? "";
    porProyecto.set(key, (porProyecto.get(key) ?? 0) + 1);
  }
  for (const [proyecto, n] of porProyecto) {
    if (n > 1) {
      avisos.push(
        `${n} tareas ${proyecto ? `en ${proyecto}` : "en el mismo sitio"} sin archivos repartidos: si se tocan, van más lento que una detrás de otra.`,
      );
    }
  }

  const modelos = puestos.map((p) => p.receta.modelo).filter(Boolean) as Array<
    NonNullable<Receta["modelo"]>
  >;
  const peso = modelos.reduce((n, m) => n + PESO[m], 0);

  const cuenta = new Map<string, number>();
  for (const m of modelos) cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  const resumen = [...cuenta.entries()]
    .sort((a, b) => PESO[b[0] as keyof typeof PESO] - PESO[a[0] as keyof typeof PESO])
    .map(([m, n]) => `${n} ${m}`)
    .join(" + ");

  return { puestos, acta: actaDeReparto(puestos, objetivo, cuando), peso, resumen, avisos };
}

/**
 * La frontera con el modelo: lo que conteste, sale de aquí utilizable.
 *
 * Mismo criterio que `interpretar` en el router: NUNCA falla. Si el JSON viene
 * roto, envuelto en markdown o directamente no viene, se reparte igual usando
 * las líneas tal cual las escribió el usuario, con la clasificación de en
 * medio. Un lote que se niega a salir porque el modelo puso una coma de más es
 * peor que un lote con encargos sin pulir.
 */
export function interpretarLote(
  raw: string,
  crudas: string[],
): { objetivo?: string; tareas: Tarea[] } {
  // Si el Capataz no contesta, se deduce de las palabras de la propia tarea con
  // la misma tabla que usa el Asistente. Antes se marcaba TODO como oficio de
  // consecuencia baja, y eso significaba que un fallo de red abría «audita el
  // login» en sonnet sin decir nada: el reparto seguía saliendo, más barato y
  // peor, que es justo el fallo que no se ve.
  const porDefecto = (): Tarea[] =>
    crudas.map((texto) => ({ texto, ex: exigenciaDeRol(texto) }));

  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return { tareas: porDefecto() };

  try {
    const j = JSON.parse(raw.slice(a, b + 1)) as Record<string, unknown>;
    const lista = Array.isArray(j.tareas) ? (j.tareas as Array<Record<string, unknown>>) : [];
    if (!lista.length) return { tareas: porDefecto() };

    const tareas: Tarea[] = lista.map((t, i) => ({
      // El texto original manda sobre lo que el modelo diga que era: es lo que
      // el usuario reconoce en la lista, y si se reordenaran no lo encontraría.
      texto: crudas[i] ?? (typeof t.texto === "string" ? t.texto : `tarea ${i + 1}`),
      encargo: typeof t.encargo === "string" && t.encargo.trim() ? t.encargo.trim() : undefined,
      frontera: typeof t.frontera === "string" && t.frontera.trim() ? t.frontera.trim() : undefined,
      porque: typeof t.porque === "string" ? t.porque.trim() : undefined,
      ex: {
        clase: unaDe(t.clase, ["recado", "oficio", "juicio"], "oficio"),
        consecuencia: unaDe(t.consecuencia, ["baja", "alta"], "baja"),
        largo: t.largo === true,
        trabajo: unaDe(t.trabajo, ["codigo", "texto", "lectura", "diseno"], "codigo"),
      },
    }));

    // Si contestó de menos, las que falten entran sin clasificar en vez de
    // desaparecer: una tarea perdida en silencio es la peor de las salidas.
    for (let i = tareas.length; i < crudas.length; i++) {
      tareas.push({ texto: crudas[i], ex: exigenciaDeRol(crudas[i]) });
    }

    return {
      objetivo: typeof j.objetivo === "string" && j.objetivo.trim() ? j.objetivo.trim() : undefined,
      tareas: tareas.slice(0, crudas.length),
    };
  } catch {
    return { tareas: porDefecto() };
  }
}

function unaDe<T extends string>(v: unknown, ok: readonly T[], def: T): T {
  return typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : def;
}

/** El peso del lote entero, para el botón: «Abre 4 agentes · 1 opus + 3 sonnet · ×14». */
export function tituloDelReparto(r: Reparto): string {
  const n = r.puestos.length;
  const cabeza = n === 1 ? "Abre 1 agente" : `Abre ${n} agentes`;
  const cola = r.resumen ? ` · ${r.resumen}` : "";
  return `${cabeza}${cola} · ×${r.peso}`;
}

export { comoPeso };
