// La configuracion que se le pasa a `tauri build` en la prueba T9 (`.github/workflows/tiendas.yml`).
//
//   node config-de-prueba.mjs <donde escribirla>
//
// Hace falta porque el WebView2 de un runner IGNORA la variable de entorno
// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` cuando la app trae sus propios argumentos
// (`additionalBrowserArgs` de `tauri.conf.json`, el permiso falso de microfono): medido en
// la pasada del 2026-11-05, la linea de ordenes del WebView2 llevaba solo los de la
// configuracion. Asi que el puerto de depuracion va EN la configuracion de esta compilacion:
// el mismo `adeorq.exe` de siempre salvo esos dos argumentos, que es lo unico que cambia.
//
// `--config` mezcla como JSON Merge Patch: un array se REEMPLAZA entero, asi que aqui va
// la ventana completa, leida de la configuracion de verdad para que no pueda separarse.
// Y sin artefactos del actualizador, que pedirian una clave que este repo no guarda.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const conf = JSON.parse(readFileSync(join(aqui, "..", "..", "..", "src-tauri", "tauri.conf.json"), "utf8"));
const ventanas = structuredClone(conf.app.windows);
if (ventanas.length !== 1) throw new Error(`Esperaba una ventana en tauri.conf.json y hay ${ventanas.length}`);
const ya = ventanas[0].additionalBrowserArgs ?? "";
ventanas[0].additionalBrowserArgs = `${ya} --remote-debugging-port=9333 --remote-allow-origins=*`.trim();
const destino = process.argv[2];
if (!destino) throw new Error("Uso: node config-de-prueba.mjs <fichero de salida>");
writeFileSync(destino, JSON.stringify({ app: { windows: ventanas }, bundle: { createUpdaterArtifacts: false } }, null, 2));
console.log(`Escrita ${destino}: additionalBrowserArgs = ${ventanas[0].additionalBrowserArgs}`);
