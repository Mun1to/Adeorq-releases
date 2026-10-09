// Cómo se abre un CLI: la regla, escrita UNA vez.
//
// Hasta el 2026-08-13 esta decisión estaba copiada SEIS veces dentro de
// `App.tsx` —el asistente, el Reparto, el MCP, el lienzo, el kanban y el
// arranque genérico—, cada una con sus matices, y ninguna sabía de las otras.
// Eso es lo que hacía caro añadir un cliente: no era la fila de la tabla, era
// acordarse de los seis sitios donde había que nombrarlo.
//
// Aquí solo se DECIDE. Quien ejecuta sigue siendo `App.tsx`, porque montar el
// comando de Claude necesita un id de sesión nuevo (`crypto.randomUUID`) y el
// modo guardado en `localStorage`, y nada de eso se puede probar sin abrir la
// app. Separando las dos mitades, la que se puede equivocar se comprueba en
// `scripts/clientes-check.ts` sin abrir nada.
//
// Los dos casos con nombre propio que quedan abajo son casos propios de verdad,
// no un descuido:
//
//   · **Claude** no se lanza con una línea fija sino con su modo, su esfuerzo y
//     un id que permite retomarlo luego. Por eso no cabe en la columna
//     `arranque` de la tabla, que es una cadena.
//   · **Antigravity** se llama por la RUTA que encontró Rust: su instalador solo
//     añade su carpeta al PATH de las consolas nuevas, así que en la nuestra no
//     está. Cuando Rust no la encuentra, cae en su columna `arranque` como
//     cualquier otro.
//
// Un cliente nuevo NO añade una rama: cae en `linea` y se abre con lo que diga
// su fila.

import { banderaDeEncargo, lineaDeArranque, proveedorDe, sabe } from "./providers";

/** Lo que se quiere abrir. Todo opcional menos el CLI: cada camino que llama
 *  aquí sabe unas cosas y otras no. */
export interface Peticion {
  cli: string;
  /** El encargo dictado por Munir. Solo viaja en la línea de arranque si ese
   *  CLI lo admite; si no, se le copia al portapapeles y se le dice. */
  encargo?: string;
  modelo?: string;
  esfuerzo?: string;
  /** Que nazca solo planificando, sin tocar archivos. Se ignora en los CLIs que
   *  no lo tienen, en vez de inventarles una bandera. */
  plan?: boolean;
  /** El modelo de casa, cuando el CLI es `ollama`. */
  modeloLocal?: string;
  /** La ruta de `agy` que encontró Rust, si la encontró. */
  agyExe?: string | null;
}

/** Qué hay que hacer para abrirlo. `App.tsx` traduce esto a un comando. */
export type Plan =
  /** Una consola pelada, sin nada dentro. */
  | { tipo: "consola" }
  /** Claude: `extra` son sus banderas ya ordenadas, y `encargo`, el texto
   *  escrito por una persona, que va APARTE y al final (`lineaConEncargo`). */
  | { tipo: "claude"; extra: string; encargo?: string; modo?: "plan" }
  /** Antigravity por su ruta absoluta. */
  | { tipo: "agy"; exe: string; encargo?: string }
  /** Todos los demás: su línea, tal cual la declara la tabla, con la bandera
   *  del encargo al final si la lleva; el texto, aparte en `encargo`. */
  | {
      tipo: "linea";
      inner: string;
      encargo?: string;
      alPortapapeles?: string;
      /** El id de sesión que lleva dentro, si ese CLI admite uno al nacer. */
      sesion?: string;
    };

/** Quién va a leer la línea: PowerShell 5.1 en Windows, bash en el resto. */
export type Shell = "powershell" | "bash";

/**
 * Una línea de arranque con un encargo escrito por una persona AL FINAL.
 *
 * En Windows no basta con meterlo entre comillas simples. PowerShell 5.1 decide
 * él si rodea de comillas un argumento de un programa nativo (solo si tiene un
 * espacio fuera de comillas, y cuenta también las escapadas) y no escapa las de
 * dentro: `allow="local-network; camera"` le llegaba partido en dos a
 * claude.exe (2026-10-08, por `open_pane`), y uno que empieza y acaba entre
 * comillas no hay forma de escaparlo bien así. Por eso el encargo va en una
 * variable de entorno y la línea acaba en `--% "%ADEORQ_ENCARGO%"`: después de
 * `--%` PowerShell pasa el resto tal cual, con la variable ya puesta y sin
 * volver a expandir lo que traiga dentro, y el texto va escapado con las reglas
 * de MSVC, que son con las que lo parte el programa. Medido con node y con
 * claude.exe de verdad, leyendo en su transcript lo que le llegó.
 *
 * Las comillas simples tipográficas (‘ ’ ‚ ‛) también cierran una cadena de
 * PowerShell, así que se doblan igual que la recta: un «it’s» dictado partía la
 * línea. En bash basta la comilla simple, con las de dentro como '\''.
 */
export function lineaConEncargo(linea: string, encargo: string, shell: Shell): string {
  if (shell === "bash") return `${linea} '${encargo.replace(/'/g, "'\\''")}'`;
  const msvc = encargo
    .replace(/(\\*)"/g, (_, barras: string) => `${barras}${barras}\\"`)
    .replace(/(\\+)$/, "$1$1");
  return `$env:ADEORQ_ENCARGO = '${msvc.replace(/['‘’‚‛]/g, "$&$&")}'; ${linea} --% "%ADEORQ_ENCARGO%"`;
}
export function planDeArranque(p: Peticion): Plan {
  const encargo = (p.encargo ?? "").trim();
  // Ojo con el orden: `shell` y `ollama` NO están en la tabla de proveedores, y
  // por eso se resuelven antes de preguntarle nada a `sabe()`.
  if (p.cli === "shell") return { tipo: "consola" };
  if (p.cli === "ollama") {
    // `ollama run` ya ES una conversación interactiva, así que no hace falta
    // nada más que abrirla. Sin cuota de nadie y sin acceso a los archivos.
    return { tipo: "linea", inner: `ollama run ${p.modeloLocal ?? ""}`.trim() };
  }

  // El encargo solo entra en la línea si ese CLI lo espera ahí. Meterle texto
  // suelto a uno que espera un subcomando es abrirle una terminal con un error
  // dentro, así que al resto se les copia y se les dice.
  const enLinea = !!encargo && sabe(p.cli, "encargoEnLinea");

  if (p.cli === "claude") {
    const extra = [p.modelo ? `--model ${p.modelo}` : "", p.esfuerzo ? `--effort ${p.esfuerzo}` : ""]
      .filter(Boolean)
      .join(" ");
    return {
      tipo: "claude",
      extra,
      encargo: enLinea ? encargo : undefined,
      modo: p.plan && sabe(p.cli, "modoPlan") ? "plan" : undefined,
    };
  }

  if (p.cli === "agy" && p.agyExe) {
    return { tipo: "agy", exe: p.agyExe, encargo: enLinea ? encargo : undefined };
  }

  // Y aquí está lo que hace que la tabla valga para algo: un CLI que acepta el
  // encargo con una bandera entra SOLO declarándola, sin una rama con su nombre.
  // opencode fue el primero (`--prompt`, el 2026-08-13). Desde el 2026-10-06 la
  // tabla también dice cómo se le pide el modelo, el esfuerzo y un id de
  // sesión, y con eso el router abre Codex y Gemini con lo que decidió.
  const prov = proveedorDe(p.cli);
  const partes = [lineaDeArranque(p.cli)];
  const nativo = p.modelo && prov?.modelos?.[p.modelo as "haiku" | "sonnet" | "opus"];
  if (prov?.banderaModelo && nativo) partes.push(`${prov.banderaModelo} ${nativo}`);
  if (prov?.banderaEsfuerzo && p.esfuerzo) {
    partes.push(prov.banderaEsfuerzo.endsWith("=") ? `${prov.banderaEsfuerzo}${p.esfuerzo}` : `${prov.banderaEsfuerzo} ${p.esfuerzo}`);
  }
  let sesion: string | undefined;
  if (prov?.banderaSesionNueva) {
    sesion = idDeSesionNuevo();
    partes.push(`${prov.banderaSesionNueva} ${sesion}`);
  }
  const bandera = banderaDeEncargo(p.cli);
  if (enLinea && bandera !== undefined) {
    if (bandera) partes.push(bandera);
    return { tipo: "linea", inner: partes.join(" "), encargo, sesion };
  }

  return {
    tipo: "linea",
    inner: partes.join(" "),
    // Se devuelve el texto en vez de un booleano para que quien copie no tenga
    // que acordarse de cuál era: el encargo y la decisión de copiarlo viajan
    // juntos o se separan a la primera.
    alPortapapeles: encargo || undefined,
    sesion,
  };
}

/** Un id de sesión acuñado por Adeorq, como el `--session-id` de Claude. */
function idDeSesionNuevo(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Sin `crypto` (un banco viejo): algo único igual, con la misma forma.
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}
