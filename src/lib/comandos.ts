// Cómo se arranca cualquier cosa dentro de una terminal de Adeorq.
//
// Vivía en App.tsx, y desde que el lienzo también abre terminales con comandos
// propios (froede) hacían falta en dos sitios: aquí no lo tiene que importar
// nadie de nadie, y así el envoltorio es el mismo en toda la casa.

/** Si la app corre sobre Windows. Se mira el `userAgent` porque el WebView no
    tiene forma de preguntárselo a Rust sin una llamada asíncrona, y esto hace
    falta al construir cada comando. */
export const ES_WINDOWS = /win/i.test(navigator.userAgent.split(")")[0] ?? "");

/**
 * Un comando, envuelto en la shell del sistema para que valgan el PATH y el
 * perfil del usuario. Sin ese envoltorio, `claude` no se encuentra en la mitad
 * de las instalaciones, porque vive en una carpeta que añade el perfil.
 *
 * En Windows, PowerShell con `-NoExit`, que deja la terminal viva cuando el
 * programa acaba: es lo que permite leer lo que dejó escrito y seguir
 * tecleando ahí. En Linux se consigue lo mismo encadenando una shell
 * interactiva detrás (`; exec bash -i`), porque `bash -c` no tiene un `-NoExit`
 * y sin eso la terminal se cerraría en cuanto el agente termina.
 */
export function shellCommand(inner: string): string[] {
  if (ES_WINDOWS) return ["powershell.exe", "-NoLogo", "-NoExit", "-Command", inner];
  const shell = "/bin/bash";
  return [shell, "-lc", `${inner}; exec ${shell} -i`];
}

/**
 * De qué conversación es una terminal, leído de su propio comando.
 *
 * Hay DOS formas de decirlo y hace falta mirar las dos: una sesión retomada
 * lleva `--resume <id>` y una recién nacida lleva `--session-id <id>`, que
 * Adeorq acuña él mismo justo para poder identificarla después.
 *
 * Vive aquí, y no copiado en cada sitio, porque el 2026-07-29 aparecieron dos
 * copias que solo miraban `--resume`. Sin id, Rust cae en su plan B: leer el
 * transcript MÁS RECIENTE de esa carpeta. Con dos agentes nuevos en el mismo
 * proyecto —el caso normal de una cuadrilla— eso significaba que el relevo se
 * llevaba la respuesta del otro, y que el medidor de contexto enseñaba el de
 * otro. Ninguna de las dos cosas se nota mirando: por eso no puede depender de
 * que quien escriba la siguiente copia se acuerde.
 */
export function sessionIdOf(command: string | string[] | undefined): string | undefined {
  const txt = Array.isArray(command) ? command.join(" ") : command;
  return txt?.match(/--(?:resume|session-id)\s+([0-9a-f-]{8,})/i)?.[1];
}
