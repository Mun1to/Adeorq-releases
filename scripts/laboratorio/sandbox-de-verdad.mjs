// La caja de Windows, de punta a punta y de verdad: arranca un Windows Sandbox con una carpeta
// de proyecto de mentira, deja dentro un servidor SSH (`src-tauri/sandbox/arranque.ps1`), entra
// con `ssh` como lo haría una terminal de Adeorq, escribe un archivo en la carpeta, comprueba que
// sale en el PC y apaga la caja. Plano en `docs/contexto/cajas.md`, «Windows Sandbox».
//
//   node scripts/laboratorio/sandbox-de-verdad.mjs
//
// Va por `WindowsSandbox.exe` y un `.wsb` porque `wsb.exe` no viene con Windows: llega aparte, con
// el paquete de la Tienda. Enseña una ventana minimizada unos dos minutos y pide 8 GB libres.
// Sale con 0 si todo va bien, 1 si falla o la caja sigue encendida y 2 o 3 si no se puede probar.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { freemem, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SYS = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
const SANDBOX = join(SYS, "WindowsSandbox.exe");
const SSH = join(SYS, "OpenSSH");
const ARRANQUE = fileURLToPath(new URL("../../src-tauri/sandbox/arranque.ps1", import.meta.url));
const ENVOLTURA = fileURLToPath(new URL("../../src-tauri/sandbox/envoltura.ps1", import.meta.url));
const ESPERA_ESTADO_MS = 6 * 60 * 1000;

if (!existsSync(SANDBOX)) {
  console.error(`No está ${SANDBOX}: Windows Sandbox está apagado. Se enciende una vez, en un PowerShell de administrador:`);
  console.error('  Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All');
  process.exit(2);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (m) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)} s] ${m}`);
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const comillasPs = (s) => s.replace(/'/g, "''");
// Los procesos de la caja de ESTA prueba: a la hora de cerrar no se toca ningún otro.
const propios = new Set();

// `WindowsSandboxServer.exe` no cuenta: con el paquete de la Tienda se queda residente sin ninguna caja abierta.
function procesosCaja() {
  const crudo = execFileSync(join(SYS, "tasklist.exe"), ["/FO", "CSV", "/NH"], { encoding: "utf8" });
  return crudo
    .split(/\r?\n/)
    .map((l) => l.match(/^"([^"]+)","(\d+)"/))
    .filter((m) => m && /^(WindowsSandbox(?!Server)|vmmemWindowsSandbox)/i.test(m[1]))
    .map((m) => ({ nombre: m[1], pid: Number(m[2]) }));
}
const puertoAbierto = (host, puerto) =>
  new Promise((r) => {
    const s = connect({ host, port: puerto, timeout: 3000 });
    s.on("connect", () => (s.destroy(), r(true)));
    s.on("error", () => r(false));
    s.on("timeout", () => (s.destroy(), r(false)));
  });

const libresGb = freemem() / 1024 ** 3;
log(`memoria libre: ${libresGb.toFixed(1)} GB`);
if (libresGb < 8) {
  console.error("Menos de 8 GB libres: no se arranca la caja.");
  process.exit(3);
}
// Solo cabe una caja a la vez, y la que ya esté abierta no es de esta prueba.
const previos = procesosCaja();
if (previos.length) {
  console.error(`Ya hay una caja abierta y no se toca: ${JSON.stringify(previos)}`);
  process.exit(3);
}

const raiz = mkdtempSync(join(tmpdir(), "adeorq-sandbox-"));
const entrada = join(raiz, "entrada");
const proyecto = join(raiz, "MiProyecto");
mkdirSync(entrada);
mkdirSync(proyecto);
writeFileSync(join(proyecto, "marca-del-proyecto.txt"), "hola desde el PC\n");
copyFileSync(ARRANQUE, join(entrada, "arranque.ps1"));
copyFileSync(ENVOLTURA, join(entrada, "envoltura.ps1"));
const llave = join(raiz, "llave");
execFileSync(join(SSH, "ssh-keygen.exe"), ["-q", "-t", "ed25519", "-N", "", "-C", "adeorq-caja", "-f", llave]);
copyFileSync(`${llave}.pub`, join(entrada, "llave.pub"));

// Lo que no hace falta, apagado: ni portapapeles compartido, ni micrófono, ni cámara, ni GPU.
const archivoWsb = join(raiz, "caja.wsb");
writeFileSync(
  archivoWsb,
  `<Configuration>
<vGPU>Disable</vGPU><Networking>Enable</Networking><AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput>
<ClipboardRedirection>Disable</ClipboardRedirection><PrinterRedirection>Disable</PrinterRedirection><MemoryInMB>3072</MemoryInMB>
<MappedFolders>
<MappedFolder><HostFolder>${xml(entrada)}</HostFolder><SandboxFolder>C:\\entrada</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>${xml(proyecto)}</HostFolder><SandboxFolder>C:\\work\\MiProyecto</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
</MappedFolders>
<LogonCommand><Command>powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\\entrada\\envoltura.ps1</Command></LogonCommand>
</Configuration>
`,
);

let salida = 1;
try {
  execFileSync(join(SYS, "WindowsPowerShell", "v1.0", "powershell.exe"), [
    "-NoProfile",
    "-Command",
    `Start-Process -FilePath '${comillasPs(SANDBOX)}' -ArgumentList '"${comillasPs(archivoWsb)}"' -WindowStyle Minimized`,
  ]);
  log("caja lanzada");

  const rutaEstado = join(proyecto, "estado.json");
  let vistos = "";
  while (!existsSync(rutaEstado) && Date.now() - t0 < ESPERA_ESTADO_MS) {
    const lista = procesosCaja();
    for (const p of lista) propios.add(p.pid);
    const ahora = lista.map((p) => p.nombre).sort().join(", ");
    if (ahora !== vistos) log(`procesos: ${ahora || "(ninguno)"}`);
    vistos = ahora;
    await esperar(3000);
  }
  if (!existsSync(rutaEstado)) throw new Error(`la caja no informó en ${ESPERA_ESTADO_MS / 60000} minutos`);

  const estado = JSON.parse(readFileSync(rutaEstado, "utf8").replace(/^\uFEFF/, ""));
  log(`estado de dentro: ${JSON.stringify(estado)}`);
  if (estado.codigo !== 0) throw new Error(`arranque.ps1 salió con ${estado.codigo}: el código dice dónde (en su cabecera)`);

  let abierto = false;
  for (let i = 0; i < 20 && !abierto; i++) {
    abierto = await puertoAbierto(estado.ip, 22);
    if (!abierto) await esperar(3000);
  }
  log(`puerto 22 de ${estado.ip}: ${abierto ? "abierto" : "cerrado"}`);
  if (!abierto) throw new Error("el puerto 22 no contesta desde el PC");

  const dentro = spawnSync(
    join(SSH, "ssh.exe"),
    [
      "-i", llave,
      "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
      `WDAGUtilityAccount@${estado.ip}`,
      "hostname; whoami; Get-Content C:\\work\\MiProyecto\\marca-del-proyecto.txt; Set-Content C:\\work\\MiProyecto\\hecho-dentro.txt 'escrito en la caja'",
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  log(`ssh salió con ${dentro.status}\n${dentro.stdout}${dentro.stderr}`);
  const hecho = join(proyecto, "hecho-dentro.txt");
  const llego = existsSync(hecho) && readFileSync(hecho, "utf8").includes("escrito en la caja");
  log(`lo escrito dentro está en el PC: ${llego}`);
  salida = dentro.status === 0 && dentro.stdout.includes("hola desde el PC") && llego ? 0 : 1;
} catch (e) {
  console.error(`FALLO: ${e.message}`);
  const registro = join(proyecto, "arranque.log");
  if (existsSync(registro)) console.error(`arranque.log:\n${readFileSync(registro, "utf8").slice(-1500)}`);
} finally {
  // La caja se apaga sola al ver este archivo; lo de cerrarla a la fuerza es por si se quedó colgada.
  writeFileSync(join(proyecto, "apagar.txt"), "ya\n");
  let quedan = procesosCaja();
  for (let i = 0; i < 30 && quedan.length; i++) {
    await esperar(2000);
    quedan = procesosCaja();
  }
  if (quedan.length) {
    log(`no se apagó sola, se cierra: ${JSON.stringify(quedan)}`);
    for (const p of quedan.filter((q) => propios.has(q.pid) && !/^vmmem/i.test(q.nombre))) {
      spawnSync(join(SYS, "taskkill.exe"), ["/PID", String(p.pid), "/T", "/F"]);
    }
    await esperar(5000);
    quedan = procesosCaja();
  }
  log(`procesos de la caja al acabar: ${quedan.length ? JSON.stringify(quedan) : "ninguno"}`);
  if (quedan.length) salida = 1;
  rmSync(raiz, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
}
console.log(salida === 0 ? "BIEN: la caja de Windows funciona de punta a punta" : "MAL");
process.exit(salida);
