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

import { banderaDeEncargo, lineaDeArranque, sabe } from "./providers";

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
  /** Claude: `extra` son sus banderas ya ordenadas, `conTexto` dice si dentro
   *  viaja un encargo escrito por una persona y por tanto hace falta el
   *  envoltorio de PowerShell (ver `shellCommand` en `comandos.ts`). */
  | { tipo: "claude"; extra: string; conTexto: boolean; modo?: "plan" }
  /** Antigravity por su ruta absoluta. */
  | { tipo: "agy"; exe: string; encargo?: string }
  /** Todos los demás: su línea, tal cual la declara la tabla. `conTexto` avisa
   *  de que dentro va un encargo escrito por una persona, y entonces el
   *  envoltorio tiene que ser PowerShell y no el cmd ligero. */
  | { tipo: "linea"; inner: string; alPortapapeles?: string; conTexto?: boolean };

/**
 * Entrecomillado para PowerShell.
 *
 * Las comillas simples de PowerShell no interpretan nada de lo que llevan
 * dentro, y las de dentro se doblan. Sin esto, un «&» o un «%» dictados
 * partirían el encargo o, peor, ejecutarían lo que viniera detrás.
 */
export function entrecomillar(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
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
    const extra = [
      p.modelo ? `--model ${p.modelo}` : "",
      p.esfuerzo ? `--effort ${p.esfuerzo}` : "",
      enLinea ? entrecomillar(encargo) : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      tipo: "claude",
      extra,
      conTexto: enLinea,
      modo: p.plan && sabe(p.cli, "modoPlan") ? "plan" : undefined,
    };
  }

  if (p.cli === "agy" && p.agyExe) {
    return { tipo: "agy", exe: p.agyExe, encargo: enLinea ? encargo : undefined };
  }

  // Y aquí está lo que hace que la tabla valga para algo: un CLI que acepta el
  // encargo con una bandera entra SOLO declarándola, sin una rama con su nombre.
  // opencode fue el primero (`--prompt`, el 2026-08-13).
  const bandera = banderaDeEncargo(p.cli);
  if (enLinea && bandera) {
    return {
      tipo: "linea",
      inner: `${lineaDeArranque(p.cli)} ${bandera} ${entrecomillar(encargo)}`,
      conTexto: true,
    };
  }

  return {
    tipo: "linea",
    inner: lineaDeArranque(p.cli),
    // Se devuelve el texto en vez de un booleano para que quien copie no tenga
    // que acordarse de cuál era: el encargo y la decisión de copiarlo viajan
    // juntos o se separan a la primera.
    alPortapapeles: encargo || undefined,
  };
}
