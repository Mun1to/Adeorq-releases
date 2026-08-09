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
 * En Windows el envoltorio es `cmd.exe`, y el motivo es la memoria. Medido en
 * la máquina de Munir el 2026-08-08, con la app en marcha: un `powershell.exe
 * -NoExit` de envoltorio ocupa 74,8 MB y un `cmd.exe /k` haciendo exactamente
 * lo mismo ocupa 7,5. Ese proceso no hace ningún trabajo —arranca el CLI y se
 * queda ahí para que la terminal siga viva cuando el programa acaba, que es lo
 * que `/k` hace igual que `-NoExit`—, así que con seis agentes abiertos eran
 * 400 MB de peaje por nada. `-NoProfile` no era la solución: 74,4 MB, porque
 * el peso está en levantar .NET, no en leer el perfil.
 *
 * Y encuentra los CLIs igual de bien, que era lo que había que comprobar antes
 * de cambiar por dónde arranca TODA la casa: los seis instalados (claude,
 * codex, gemini, pi, qwen, agy) y `npx` ejecutan desde cmd, no solo aparecen
 * en su PATH. Los de pnpm son scripts `.ps1`, que cmd no sabe correr, pero
 * pnpm deja SIEMPRE un `.CMD` al lado (10 de 10 comprobados) y es el que coge
 * por PATHEXT.
 *
 * ⚠ `chcp 65001` no es un adorno. cmd nace en la codepage OEM del sistema (en
 * esta máquina la 850) y un CLI de agente escribe UTF-8 sin parar: tildes y
 * los dibujos de caja (─ ● ⎿). Sin esa línea la salida sale rota, que es la
 * misma familia de fallo que costó una noche entera en julio. El `>nul` se
 * come el aviso de que ha cambiado.
 *
 * ⚠ Y por lo mismo `inner` NO puede llevar texto escrito por una persona: en
 * cmd, `&`, `|`, `>` y `%` son metacaracteres, así que un encargo dictado con
 * un «&» partiría el comando por la mitad. Lo que lleve texto libre va por
 * `powershellCommand`, que sabe citarlo.
 *
 * En Linux no cambia nada: una shell interactiva encadenada detrás
 * (`; exec bash -i`), porque `bash -c` no tiene un `-NoExit` y sin eso la
 * terminal se cerraría en cuanto el agente termina.
 */
export function shellCommand(inner: string): string[] {
  if (ES_WINDOWS) return ["cmd.exe", "/k", `chcp 65001 >nul && ${inner}`];
  const shell = "/bin/bash";
  return [shell, "-lc", `${inner}; exec ${shell} -i`];
}

/**
 * El envoltorio caro, y solo para lo que de verdad habla PowerShell.
 *
 * Son dos casos, y ninguno de los dos es un agente que se queda horas abierto,
 * que es donde dolía la memoria: instalar un CLI (usa `$?` y `Write-Host` con
 * color, que en cmd no existen) y arrancar uno con un encargo dictado dentro
 * (las comillas simples de PowerShell no interpretan nada de lo que llevan
 * dentro y se escapan doblándolas, así que un encargo con `&`, `%` o `>` viaja
 * entero).
 */
export function powershellCommand(inner: string): string[] {
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
