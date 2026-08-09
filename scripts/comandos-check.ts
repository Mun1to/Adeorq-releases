// Con qué envoltorio arranca cada terminal. Se corre:
//
//   npx tsc scripts/comandos-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/comandos-check.js
//
// Por qué existe: el 2026-08-08 el envoltorio de Windows pasó de
// `powershell.exe -NoExit` (74,8 MB por terminal) a `cmd.exe /k` (7,5 MB), y
// eso toca el arranque de TODAS las terminales de la casa. Compilar no
// demuestra que un comando arranque; estas cuentas sí dicen qué se le entrega
// al sistema.

declare const require: {
  (m: string): unknown;
  resolve(m: string): string;
  cache: Record<string, unknown>;
};

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** `ES_WINDOWS` se decide al importar el módulo, mirando el `userAgent`. Para
    probar las dos plataformas hay que fingirlo ANTES y volver a cargarlo. */
type Comandos = {
  shellCommand(inner: string): string[];
  powershellCommand(inner: string): string[];
  sessionIdOf(c: string | string[] | undefined): string | undefined;
};
function cargar(ua: string): Comandos {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: ua },
    configurable: true,
  });
  const ruta = require.resolve("../src/lib/comandos");
  delete require.cache[ruta];
  return require("../src/lib/comandos") as Comandos;
}

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141.0";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

// --- Windows: el envoltorio ligero, que es el del ahorro ----------------------
{
  const { shellCommand } = cargar(WINDOWS);
  const c = shellCommand("claude --permission-mode acceptEdits");
  ok("en Windows el envoltorio de siempre es cmd, no PowerShell", c[0] === "cmd.exe");
  ok(
    "abre con /k, que es el -NoExit de cmd",
    c[1] === "/k",
    "sin eso la terminal se cierra en cuanto el agente termina",
  );
  ok(
    "todo el comando viaja como UN solo argumento",
    c.length === 3,
    "partido, cmd se quedaría con el primer trozo y tiraría el resto",
  );
}
{
  const { shellCommand } = cargar(WINDOWS);
  const linea = shellCommand("claude")[2];
  ok("fuerza la codepage UTF-8", linea.includes("chcp 65001"));
  ok(
    "y la fuerza ANTES del programa",
    linea.indexOf("chcp") < linea.indexOf("claude"),
    "después no sirve: el CLI ya habría escrito sus tildes en la codepage vieja",
  );
  ok(
    "se traga el aviso de chcp",
    linea.includes(">nul"),
    "si no, cada terminal nace con «Página de códigos activa: 65001» escrito",
  );
  ok("encadena con && y no con &", /&&/.test(linea) && !/[^&]&[^&]/.test(linea));
}

// --- Windows: el envoltorio caro, solo para lo que habla PowerShell -----------
{
  const { powershellCommand } = cargar(WINDOWS);
  const c = powershellCommand("agy --mode accept-edits 'arregla el login'");
  ok("el envoltorio caro sigue siendo PowerShell", c[0] === "powershell.exe");
  ok("y sigue dejando la terminal viva", c.includes("-NoExit"));
  ok("entrega el comando por -Command", c[c.length - 2] === "-Command");
  ok(
    "no le mete chcp",
    !c.join(" ").includes("chcp"),
    "PowerShell ya habla UTF-8; la línea sobraría y se vería",
  );
}
{
  // La razón de que los dos existan: un encargo dictado lleva lo que lleve.
  const { shellCommand, powershellCommand } = cargar(WINDOWS);
  const encargo = "sube el margen un 20% y compara A & B > informe";
  ok(
    "un encargo con metacaracteres de cmd NO puede ir por el envoltorio ligero",
    /[&%>]/.test(encargo) && shellCommand(`claude '${encargo}'`)[2].includes("&"),
    "queda dicho aquí: por eso openClaudePrompt pasa conTexto = true",
  );
  ok(
    "y por PowerShell viaja entero",
    powershellCommand(`claude '${encargo}'`).at(-1)?.includes(encargo) === true,
  );
}

// --- Linux: no cambia nada ----------------------------------------------------
{
  const { shellCommand, powershellCommand } = cargar(LINUX);
  const c = shellCommand("claude --permission-mode acceptEdits");
  ok("en Linux sigue siendo bash", c[0] === "/bin/bash" && c[1] === "-lc");
  ok(
    "con la shell interactiva encadenada detrás",
    c[2].includes("; exec /bin/bash -i"),
    "bash -c no tiene -NoExit: sin esto la terminal muere con el agente",
  );
  ok("y no se cuela un chcp, que allí no existe", !c[2].includes("chcp"));
  ok(
    "los dos envoltorios son el mismo fuera de Windows",
    JSON.stringify(powershellCommand("claude")) === JSON.stringify(shellCommand("claude")),
    "allí no hay PowerShell que valga",
  );
}

// --- Lo que NO se puede romper al cambiar el envoltorio ------------------------
// `sessionIdOf` lee el id de la conversación del propio comando. Si dejara de
// encontrarlo, Rust cae en su plan B (el transcript más reciente de la carpeta)
// y con dos agentes en el mismo proyecto el relevo se lleva la respuesta del
// otro y el medidor de contexto enseña el de otro. Ninguna de las dos cosas se
// nota mirando: es el fallo del 2026-07-29, y este cambio lo rozaba.
{
  const { shellCommand, powershellCommand, sessionIdOf } = cargar(WINDOWS);
  const id = "41dba6b2-2757-4e94-97d0-7a5d796694a8";
  ok(
    "una sesión retomada se sigue reconociendo dentro del comando de cmd",
    sessionIdOf(shellCommand(`claude --permission-mode acceptEdits --resume ${id}`)) === id,
  );
  ok(
    "y una recién nacida también",
    sessionIdOf(shellCommand(`claude --permission-mode acceptEdits --session-id ${id}`)) === id,
  );
  ok(
    "y por el envoltorio de PowerShell, igual",
    sessionIdOf(powershellCommand(`claude --session-id ${id} 'arregla el login'`)) === id,
  );
  ok(
    "el chcp no se confunde con un id",
    sessionIdOf(shellCommand("claude --permission-mode acceptEdits")) === undefined,
    "65001 no es un identificador de sesión",
  );
}
{
  const { shellCommand, sessionIdOf } = cargar(LINUX);
  const id = "48834135-2df4-43d4-b32d-bc8f4fc943d1";
  ok(
    "en Linux el id también sobrevive al envoltorio",
    sessionIdOf(shellCommand(`claude --resume ${id}`)) === id,
  );
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
