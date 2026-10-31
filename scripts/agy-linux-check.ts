// Que Antigravity (agy) arranque también en Linux.
//
//   pnpm bancos agy-linux
//
// `agyCommand` armaba su línea con sintaxis de Windows aunque la shell fuera
// bash: `path <carpeta>;%path% && agy …` (la orden `path` es de cmd; en bash
// no existe y el `&&` corta antes de llegar a `agy`) y, con encargo, un
// `& '<ruta>'` de PowerShell (en bash un `&` suelto manda el comando al fondo
// y rompe la línea). Antigravity no arrancaba ni con el botón AG ni con un
// encargo. Medido leyendo la línea que sale para cada sistema.
//
// `ES_WINDOWS` se decide al cargar `comandos.ts`, mirando el `userAgent`: para
// probar las dos plataformas se finge ANTES y se vuelve a cargar `lanzar.ts`
// (y con él `comandos.ts`), como hace `comandos-check`.

declare const require: {
  (m: string): unknown;
  resolve(m: string): string;
  cache: Record<string, unknown>;
};
declare const process: { exit(codigo: number): never };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

// `lanzar.ts` arrastra módulos que miran `window` y `localStorage` al cargarse.
const g = globalThis as unknown as Record<string, unknown>;
const memoria = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
};
g.window = g;

type Lanzar = { agyCommand(exe: string, prompt?: string): string[] };
function cargar(ua: string): Lanzar {
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: ua }, configurable: true });
  for (const f of ["comandos", "lanzar"]) {
    const ruta = require.resolve(`../src/lib/${f}`);
    delete require.cache[ruta];
  }
  return require("../src/lib/lanzar") as Lanzar;
}

const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141.0";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

// --- Linux ------------------------------------------------------------------
{
  const { agyCommand } = cargar(LINUX);
  const sin = agyCommand("/home/ana/.local/bin/agy");
  const linea = sin[2] ?? "";
  ok("en Linux sin encargo va por bash", sin[0] === "/bin/bash" && sin[1] === "-lc", sin.join(" "));
  ok("sin la orden `path` ni `%path%` de cmd", !/\bpath\b/.test(linea.replace(/'[^']*'/g, "")) && !linea.includes("%path%"), linea);
  ok("llama al agy de verdad, por su ruta entre comillas", linea.includes("'/home/ana/.local/bin/agy' --mode accept-edits"), linea);

  const con = agyCommand("/home/ana/.local/bin/agy", "arregla el login & mira el 100%");
  const lineaCon = con[2] ?? "";
  ok("con encargo va por bash", con[0] === "/bin/bash", con.join(" "));
  ok("sin el `& '` de PowerShell", !lineaCon.includes("& '"), lineaCon);
  ok("ni `$env:` de PowerShell", !lineaCon.includes("$env:"), lineaCon);
  ok(
    "el encargo viaja entero, entre comillas",
    lineaCon.includes("--mode accept-edits 'arregla el login & mira el 100%'"),
    lineaCon,
  );

  const rara = agyCommand("/home/o'brien/mi carpeta/agy")[2] ?? "";
  ok("una ruta con espacio y comilla simple se cita bien", rara.includes("'/home/o'\\''brien/mi carpeta/agy' --mode accept-edits"), rara);
}

// --- Windows: no cambia ------------------------------------------------------
{
  const { agyCommand } = cargar(WINDOWS);
  const sin = agyCommand("C:\\Users\\Ana\\AppData\\Local\\agy\\bin\\agy.exe");
  ok("en Windows sin encargo sigue por cmd", sin[0] === "cmd.exe", sin.join(" "));
  ok(
    "con su `path` y su `agy` por nombre",
    (sin[2] ?? "").includes("path C:\\Users\\Ana\\AppData\\Local\\agy\\bin;%path% && agy --mode accept-edits"),
    sin[2],
  );
  const con = agyCommand("C:\\Users\\Ana\\AppData\\Local\\agy\\bin\\agy.exe", "hola");
  ok("en Windows con encargo sigue por PowerShell", con[0] === "powershell.exe", con.join(" "));
  ok("y con su `& '<ruta>'`", (con[con.length - 1] ?? "").includes("& 'C:\\Users\\Ana\\AppData\\Local\\agy\\bin\\agy.exe' --mode accept-edits"), con[con.length - 1]);
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
