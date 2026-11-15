// La caja de Windows, de punta a punta y de verdad: arranca un Windows Sandbox con una
// carpeta de proyecto de mentira, deja dentro un servidor SSH (`src-tauri/sandbox/arranque.ps1`),
// entra con `ssh` como lo haría una terminal de Adeorq, escribe un archivo en la carpeta y
// comprueba que sale en el PC, y la tira. Plano en `docs/contexto/cajas.md`, «Windows Sandbox».
//
//   node scripts/laboratorio/sandbox-de-verdad.mjs
//
// Pide Windows Sandbox encendido (una vez, de administrador:
// `Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All`
// y reiniciar si lo pide). Sin él, lo dice y sale con 2. Todo lo suyo va a una carpeta
// temporal que se borra al acabar, y la caja se para pase lo que pase.
// NO PROBADO todavía: escrito el 2026-11-15 con la característica apagada.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WSB = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wsb.exe");
const SSH = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "OpenSSH");
const ARRANQUE = new URL("../../src-tauri/sandbox/arranque.ps1", import.meta.url);

if (!existsSync(WSB)) {
  console.error(`No está ${WSB}: Windows Sandbox está apagado. Se enciende una vez, en un PowerShell de administrador:`);
  console.error('  Enable-WindowsOptionalFeature -Online -FeatureName "Containers-DisposableClientVM" -All');
  process.exit(2);
}

const wsb = (...a) => execFileSync(WSB, a, { encoding: "utf8" }).trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const puertoAbierto = (host, puerto) =>
  new Promise((r) => {
    const s = connect({ host, port: puerto, timeout: 3000 });
    s.on("connect", () => (s.destroy(), r(true)));
    s.on("error", () => r(false));
    s.on("timeout", () => (s.destroy(), r(false)));
  });
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const raiz = mkdtempSync(join(tmpdir(), "adeorq-sandbox-"));
const entrada = join(raiz, "entrada");
const proyecto = join(raiz, "MiProyecto");
mkdirSync(entrada);
mkdirSync(proyecto);
writeFileSync(join(proyecto, "marca-del-proyecto.txt"), "hola desde el PC\n");
copyFileSync(ARRANQUE, join(entrada, "arranque.ps1"));
const llave = join(raiz, "llave");
execFileSync(join(SSH, "ssh-keygen.exe"), ["-q", "-t", "ed25519", "-N", "", "-C", "adeorq-caja", "-f", llave]);
copyFileSync(`${llave}.pub`, join(entrada, "llave.pub"));

// Lo que no hace falta, apagado: ni portapapeles compartido, ni micrófono, ni GPU.
const configuracion = `<Configuration>
<vGPU>Disable</vGPU><Networking>Enable</Networking><AudioInput>Disable</AudioInput><ClipboardRedirection>Disable</ClipboardRedirection>
<MappedFolders>
<MappedFolder><HostFolder>${xml(entrada)}</HostFolder><SandboxFolder>C:\\entrada</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
<MappedFolder><HostFolder>${xml(proyecto)}</HostFolder><SandboxFolder>C:\\work\\MiProyecto</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
</MappedFolders>
</Configuration>`.replace(/\n/g, "");

let id = null;
let salida = 1;
const t0 = Date.now();
const cuando = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
try {
  const arrancada = wsb("start", "--raw", "--config", configuracion);
  console.log(`wsb start: ${arrancada}`);
  id = (() => {
    try {
      const j = JSON.parse(arrancada);
      return j.Id ?? j.id ?? j.ID ?? null;
    } catch {
      return arrancada.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
    }
  })();
  if (!id) throw new Error("wsb start no dio un id que se entienda");

  // Hasta que el Windows de dentro acepte órdenes.
  let lista = false;
  for (let i = 0; i < 40 && !lista; i++) {
    lista = spawnSync(WSB, ["exec", "--id", id, "-c", "cmd /c exit 0", "-r", "System"]).status === 0;
    if (!lista) await esperar(3000);
  }
  if (!lista) throw new Error("la caja no aceptó órdenes en 2 minutos");
  console.log(`la caja acepta órdenes (${cuando()})`);

  const arranque = spawnSync(WSB, ["exec", "--id", id, "-c", "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\entrada\\arranque.ps1", "-r", "System"]);
  console.log(`arranque.ps1 salió con ${arranque.status} (${cuando()})`);
  if (arranque.status !== 0) throw new Error("arranque.ps1 falló: el código dice dónde (en su cabecera), y C:\\arranque.log dentro de la caja");

  const ip = (() => {
    const crudo = wsb("ip", "--raw", "--id", id);
    try {
      const j = JSON.parse(crudo);
      return j.IpAddress ?? j.ipAddress ?? j.Ip ?? j.ip ?? JSON.stringify(j);
    } catch {
      return crudo.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ?? crudo;
    }
  })();
  console.log(`ip de la caja: ${ip}`);
  let abierto = false;
  for (let i = 0; i < 20 && !abierto; i++) {
    abierto = await puertoAbierto(ip, 22);
    if (!abierto) await esperar(3000);
  }
  if (!abierto) throw new Error(`el puerto 22 de ${ip} no contesta`);

  const dentro = spawnSync(
    join(SSH, "ssh.exe"),
    [
      "-i", llave,
      "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
      `WDAGUtilityAccount@${ip}`,
      "hostname; whoami; Get-Content C:\\work\\MiProyecto\\marca-del-proyecto.txt; Set-Content C:\\work\\MiProyecto\\hecho-dentro.txt 'escrito en la caja'",
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  console.log(`ssh (${dentro.status}):\n${dentro.stdout}${dentro.stderr}`);
  const hecho = join(proyecto, "hecho-dentro.txt");
  const llego = existsSync(hecho) && readFileSync(hecho, "utf8").includes("escrito en la caja");
  console.log(`lo escrito dentro está en el PC: ${llego} (${cuando()})`);
  salida = dentro.status === 0 && dentro.stdout.includes("hola desde el PC") && llego ? 0 : 1;
} catch (e) {
  console.error(`FALLO: ${e.message}`);
} finally {
  if (id) {
    spawnSync(WSB, ["stop", "--id", id]);
    const quedan = wsb("list");
    console.log(`tras wsb stop: ${quedan.includes(id) ? "SIGUE en la lista" : "fuera de la lista"}`);
  }
  rmSync(raiz, { recursive: true, force: true });
}
console.log(salida === 0 ? "BIEN: la caja de Windows funciona de punta a punta" : "MAL");
process.exit(salida);
