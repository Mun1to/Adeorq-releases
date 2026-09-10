// Que ningún comando de Tauri vuelva a ir al disco desde el hilo de la ventana.
//   `node scripts/hilo-check.mjs`   ·   `pnpm hilo`
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Un `#[tauri::command]` sin `async` se ejecuta en el hilo principal: mientras
// dura, la app entera está congelada. Es la causa medida de los micro-congelones
// de julio de 2026 y está escrita en `AGENTS.md` desde entonces, pero escrita no
// impidió que en septiembre hubiera 55 comandos yendo al disco desde ahí. Por
// eso ahora hay un comprobador y no otro párrafo.
//
// El arreglo NO es convertirlos en `async fn`, que obliga a devolver `Result`
// cuando hay un `State<'_, _>` y rompe a los llamadores internos y a los tests
// que llaman la función directamente. Es esta anotación:
//
//     #[tauri::command(async)]
//     pub fn lo_que_sea(...) -> ... { }
//
// Sobre una función SÍNCRONA, Tauri la registra como «sync_threadpool» y la
// saca del hilo de la ventana sin tocar su firma. Comprobado en la fuente del
// macro: `tauri-macros/src/command/wrapper.rs`, donde
// `ExecutionContext::Async if function.sig.asyncness.is_none() => "sync_threadpool"`.
//
// Lo que este script NO puede ver: si una función auxiliar que llamas acaba
// tocando el disco. Mira el cuerpo del comando, no el árbol entero de llamadas.
// Así que pasar esto no demuestra que no bloquees; fallarlo sí demuestra que sí.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "src");

// Señales de que la función se va al disco, a la red o a un proceso.
const IO = [
  [/\bfs::(read|write|create|remove|copy|rename|metadata|read_dir|read_to_string|File)/, "disco"],
  [/\bFile::(open|create)/, "disco"],
  [/\.exists\(\)/, "disco"],
  [/\bWalkDir::/, "disco"],
  [/\bCommand::new/, "proceso"],
  [/\breqwest::/, "red"],
  [/\bTcpStream::/, "red"],
  [/\bthread::sleep/, "espera"],
  [/\brecv_timeout\(/, "espera"],
];

/**
 * Los que se quedan en el hilo de la ventana A PROPÓSITO.
 *
 * La misma tabla vive en `src-tauri/src/hilo.rs`, y un test comprueba que las
 * dos dicen lo mismo: una excepción que solo existe en el script se convierte
 * en una excepción que nadie recuerda por qué está.
 */
const EXENTOS = {
  pty_write: "paralelizarlo podría reordenar las teclas",
  pty_historial: "solo copia un buffer que ya está en memoria",
  mcp_reply: "solo suelta un valor en un cerrojo",
  forget_project_icons: "solo vacía un mapa en memoria",
  datos_panel: "solo lee un cerrojo que ya está en memoria",
  raton_en_pantalla: "pregunta por la ventana, y eso es del hilo principal",
  devolver_panel: "cierra una ventana, y eso es del hilo principal",
  media_set_volume: "COM de Windows, que se inicializa por hilo",
  secretos_donde: "devuelve un texto fijo",
  inbox_where: "arma una ruta, no la abre",
};

/** El cuerpo de la función, contando llaves desde la primera. */
function cuerpoDe(texto, desde) {
  const abre = texto.indexOf("{", desde);
  if (abre < 0) return "";
  let n = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "{") n++;
    else if (texto[i] === "}" && --n === 0) return texto.slice(abre, i + 1);
  }
  return texto.slice(abre);
}

export function revisar(dir = DIR) {
  const culpables = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".rs"))) {
    const texto = fs.readFileSync(path.join(dir, f), "utf8");
    const re = /#\[tauri::command(\([^)]*\))?\]/g;
    let m;
    while ((m = re.exec(texto))) {
      // `(async)` ya lo manda al threadpool.
      if (/async/.test(m[1] || "")) continue;

      const resto = texto.slice(m.index + m[0].length);
      const fn = resto.match(/^(?:\s|\/\/[^\n]*\n|#\[[^\]]*\]\s*)*?(pub\s+)?(async\s+)?fn\s+(\w+)/);
      if (!fn || fn[2]) continue; // no lo encuentro, o ya es `async fn`

      const nombre = fn[3];
      if (nombre in EXENTOS) continue;

      const cuerpo = cuerpoDe(resto, resto.indexOf(`fn ${nombre}`));
      const motivos = [...new Set(IO.filter(([r]) => r.test(cuerpo)).map(([, k]) => k))];
      if (motivos.length) {
        culpables.push({
          archivo: f,
          linea: texto.slice(0, m.index).split("\n").length,
          nombre,
          motivos,
        });
      }
    }
  }
  return culpables;
}

// `pathToFileURL` y no un `file://` a mano: en Windows la URL lleva TRES barras
// (`file:///C:/...`), así que la comparación escrita a pelo nunca casaba y el
// script se quedaba mudo en vez de comprobar nada.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const malos = revisar();
  if (malos.length) {
    console.error("\nESTOS COMANDOS CONGELAN LA VENTANA MIENTRAS TRABAJAN:\n");
    for (const c of malos) {
      console.error(`  ${c.archivo}:${c.linea}  ${c.nombre}  (toca ${c.motivos.join(", ")})`);
    }
    console.error(
      "\n  Ponles `#[tauri::command(async)]` en vez de `#[tauri::command]`.\n" +
        "  No hace falta tocar la firma ni convertirlos en `async fn`.\n" +
        "  Si alguno tiene que quedarse en el hilo de la ventana, añádelo a\n" +
        "  EXENTOS aquí y a EN_EL_HILO_DE_LA_VENTANA en src-tauri/src/hilo.rs,\n" +
        "  con el motivo escrito.\n",
    );
    process.exit(1);
  }
  console.log(`ok  ningún comando va al disco desde el hilo de la ventana`);
  console.log(`    (${Object.keys(EXENTOS).length} exentos a propósito, con su motivo)`);
}
