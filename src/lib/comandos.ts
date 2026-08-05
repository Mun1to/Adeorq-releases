// Cómo se arranca cualquier cosa dentro de una terminal de Adeorq.
//
// Vivía en App.tsx, y desde que el lienzo también abre terminales con comandos
// propios (froede) hacían falta en dos sitios: aquí no lo tiene que importar
// nadie de nadie, y así el envoltorio es el mismo en toda la casa.

/**
 * Un comando, envuelto en PowerShell para que valgan el PATH y el perfil del
 * usuario. `-NoExit` deja la terminal viva cuando el programa acaba, que es lo
 * que permite leer lo que dejó escrito y seguir tecleando ahí.
 */
export function shellCommand(inner: string): string[] {
  return ["powershell.exe", "-NoLogo", "-NoExit", "-Command", inner];
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
