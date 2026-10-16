// Lo que le llega de verdad a un programa cuando Adeorq lo arranca con un
// encargo en Windows (`lineaConEncargo`, en `src/lib/arranque.ts`).
//
// Munir, 2026-10-16: un encargo programado con Codex nacía y Codex se moría
// con «error: unexpected argument '--%' found». La línea acaba en
// `--% "%ADEORQ_ENCARGO%"`, y `--%` solo lo entiende PowerShell al llamar a un
// PROGRAMA (claude.exe). Codex, Gemini, Qwen y OpenCode instalados con pnpm o
// npm son un script `.ps1`, y a un script PowerShell le pasa `--%` como un
// argumento más.
//
// Esto monta, en una carpeta temporal, los dos casos con un «programa» que solo
// apunta lo que recibe: uno que es un ejecutable de verdad (node.exe por su
// ruta) y otro detrás de un `.ps1` con el formato exacto que deja pnpm. Lanza
// la línea que arma Adeorq con PowerShell 5.1, como la terminal, y compara.
//
//   node scripts/laboratorio/encargo-en-powershell.mjs
//
// Solo en Windows. No toca nada de fuera de su carpeta temporal.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const BASE = join(tmpdir(), `adeorq-encargo-${process.pid}`);
const APUNTE = join(BASE, "recibido.json");
const BIN = join(BASE, "bin");
mkdirSync(join(BIN, "global", "paquete", "bin"), { recursive: true });

// El «programa»: apunta sus argumentos y sale.
const eco = join(BIN, "global", "paquete", "bin", "eco.js");
writeFileSync(eco, `require("fs").writeFileSync(${JSON.stringify(APUNTE)}, JSON.stringify(process.argv.slice(2)));\n`);
// Un ejecutable de verdad al lado del .ps1, como hace pnpm con su node.exe.
copyFileSync(process.execPath, join(BIN, "node.exe"));
// El .ps1 de pnpm, con su forma de siempre (leída de codex.ps1 en esta máquina).
writeFileSync(join(BIN, "eco.ps1"), `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe") {
  if ($MyInvocation.ExpectingInput) {
    $input | & "$basedir/node$exe"  "$basedir/global/paquete/bin/eco.js" $args
  } else {
    & "$basedir/node$exe"  "$basedir/global/paquete/bin/eco.js" $args
  }
  $ret=$LASTEXITCODE
} else {
  if ($MyInvocation.ExpectingInput) {
    $input | & "node$exe"  "$basedir/global/paquete/bin/eco.js" $args
  } else {
    & "node$exe"  "$basedir/global/paquete/bin/eco.js" $args
  }
  $ret=$LASTEXITCODE
}
exit $ret
`);

// La función de la app, compilada al vuelo (es TypeScript sin dependencias).
const fuente = readFileSync(new URL("../../src/lib/arranque.ts", import.meta.url), "utf8");
const ts = createRequire(import.meta.url)("typescript");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = join(BASE, "arranque.mjs");
writeFileSync(modulo, js.replace(/^import .*$/gm, ""));
const { lineaConEncargo } = await import(`file:///${modulo.replace(/\\/g, "/")}`);

const ENCARGOS = [
  "responde solo: hola",
  'allow="local-network; camera"',
  'dile "hola & adiós" | y 100% %PATH%',
  "it’s fine, it's fine",
  "acaba en barra\\",
];
let fallos = 0;
const probar = (como, linea, encargo) => {
  rmSync(APUNTE, { force: true });
  const r = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", lineaConEncargo(linea, encargo, "powershell")], {
    cwd: BASE,
    env: { ...process.env, PATH: `${BIN};${process.env.PATH}` },
    encoding: "utf8",
    timeout: 20_000,
  });
  const recibido = existsSync(APUNTE) ? JSON.parse(readFileSync(APUNTE, "utf8")) : null;
  const bien = JSON.stringify(recibido) === JSON.stringify([encargo]);
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${como}: ${JSON.stringify(encargo)}${bien ? "" : ` → ${JSON.stringify(recibido)} ${(r.stderr || r.stdout || "").trim().slice(0, 160)}`}`);
};
for (const e of ENCARGOS) probar("programa de verdad", `& '${join(BIN, "node.exe")}' '${eco}'`, e);
// Como `claude`: un programa de verdad llamado por su nombre, con una bandera detrás.
for (const e of ENCARGOS) probar("programa por su nombre", `node '${eco}'`, e);
for (const e of ENCARGOS) probar("detrás de un .ps1 de pnpm", "eco", e);
rmSync(BASE, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} en rojo.` : "\nTodo en verde.");
process.exit(fallos ? 1 : 0);
