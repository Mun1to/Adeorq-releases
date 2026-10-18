// Probar el navegador como va en la app publicada: la interfaz en su perfil de WebView2 y las
// pestañas en el suyo (`<datos>\navegador`, ver `crear` en `navegador.rs`).
//
// Los laboratorios aíslan la interfaz con `WEBVIEW2_USER_DATA_FOLDER`, y esa variable mete TODOS
// los webviews en la misma carpeta: así las pestañas iban en el perfil de la interfaz y la
// configuración que usa Munir no la había probado nadie (destapado el 2026-10-18). Sin la
// variable, la interfaz cae en la carpeta de su identificador, que es la de la Adeorq instalada,
// y compartiría su navegador. Por eso este modo pide un binario con OTRO identificador:
//
//   node scripts/laboratorio/perfil-aparte.mjs          compila C:\ct\laboratorio\adeorq.exe
//   ADEORQ_PERFIL_APARTE=1 node scripts/laboratorio/navegador-en-pantalla.mjs <fotos> C:\ct\laboratorio\adeorq.exe
//
// (igual con `navegador-de-verdad.mjs` y `editor-en-el-navegador.mjs`, con el .exe de primer
// argumento). Compilar cambia `C:\ct\debug\adeorq.exe` un par de minutos y lo deja como estaba.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const IDENTIFICADOR = "com.orquio.adeorq-laboratorio";
export const APARTE = process.env.ADEORQ_PERFIL_APARTE === "1";

/** El entorno de la app de pruebas en modo aparte: sin la carpeta forzada ni el permiso de
    laboratorio para pestañas nativas, que entonces ya no hace falta. Comprueba antes el binario. */
export function aparte(env, exe) {
  if (!readFileSync(exe).includes(Buffer.from(IDENTIFICADOR))) {
    throw new Error(`${exe} lleva el identificador de la Adeorq instalada: compartiría su navegador. Compila el de pruebas con node scripts/laboratorio/perfil-aparte.mjs`);
  }
  const fuera = { ...env };
  delete fuera.WEBVIEW2_USER_DATA_FOLDER;
  delete fuera.ADEORQ_NAVEGADOR_LABORATORIO;
  return fuera;
}

/** Con dos perfiles hay dos motores, y los dos reciben el mismo `--remote-debugging-port`: el
    segundo no puede abrirlo y la página de la pestaña no se ve desde fuera. Con el puerto 0 cada
    uno coge uno libre y lo apunta en `DevToolsActivePort`, dentro de su perfil: esto los lee
    todos los que haya debajo de `base`. */
export function puertosDeDepuracion(base) {
  const puertos = [];
  const mirar = (dir, hondo) => {
    if (hondo > 8) return;
    let entradas = [];
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (e.isFile() && e.name === "DevToolsActivePort") {
        const n = Number(readFileSync(join(dir, e.name), "utf8").split(/\r?\n/)[0]);
        if (n > 0) puertos.push(n);
      } else if (e.isDirectory() && !/^(Cache|Code Cache|GPUCache|Service Worker|IndexedDB|blob_storage)$/.test(e.name)) {
        mirar(join(dir, e.name), hondo + 1);
      }
    }
  };
  mirar(base, 0);
  return puertos;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const destino = join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "laboratorio", "adeorq.exe");
  const debug = join(process.env.CARGO_TARGET_DIR ?? "C:\\ct", "debug", "adeorq.exe");
  const cargo = (config) => {
    const env = { ...process.env };
    delete env.TAURI_CONFIG;
    if (config) env.TAURI_CONFIG = JSON.stringify(config);
    return spawnSync("cargo", ["build", "--manifest-path", join(raiz, "src-tauri", "Cargo.toml")], { stdio: "inherit", env }).status === 0;
  };
  if (!cargo({ identifier: IDENTIFICADOR, productName: "Adeorq Laboratorio" })) process.exit(1);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(debug, destino);
  // Y el de siempre de vuelta, que lo usan los demás laboratorios.
  if (!cargo(null)) process.exit(1);
  console.log(`Listo: ${destino}`);
}
