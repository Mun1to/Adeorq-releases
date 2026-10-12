// Graba una sesión de verdad de un CLI en una terminal del motor de Adeorq.
// Uso: node grabar.mjs <guion.json>
// Deja rec/<nombre>.jsonl (cada trozo con su instante) y rec/<nombre>.bin (todo
// seguido, que es lo que luego reproduce bin/repetir.mjs en un panel).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arrancarMotor, dormir, sinAnsi } from "./motor.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const guion = JSON.parse(readFileSync(process.argv[2], "utf8"));
const REC = join(AQUI, "p", "rec");
mkdirSync(REC, { recursive: true });

const motor = await arrancarMotor({ datos: join(AQUI, "grabadora") });
const t0 = Date.now();
const trozos = [];
let todo = "";
let ultimo = Date.now();
let acabada = false;

const cola = (n = 4000) => sinAnsi(todo.slice(-n * 3)).slice(-n);
const patron = (texto) => new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i");

await motor.crear(
  { id: 1, cwd: guion.cwd, cols: guion.cols, rows: guion.rows, command: guion.command, env: guion.env },
  (texto) => {
    trozos.push({ t: Date.now() - t0, d: texto });
    todo += texto;
    ultimo = Date.now();
  },
  () => {
    acabada = true;
  },
);

const decir = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

for (const paso of guion.pasos) {
  if (acabada) break;
  if (paso.espera) {
    const re = patron(paso.espera);
    const fin = Date.now() + (paso.ms ?? 20000);
    let visto = false;
    while (Date.now() < fin && !(visto = re.test(cola()))) await dormir(150);
    decir(`espera «${paso.espera}»: ${visto ? "sí" : "no llegó"}`);
    if (!visto && !paso.opcional) {
      decir("ABORTO: no llegó lo que esperaba");
      break;
    }
    if (visto && paso.escribe) {
      for (const tecla of [paso.escribe].flat()) {
        await dormir(paso.antes ?? 500);
        motor.escribir(1, tecla);
      }
    }
    // Para los menús donde equivocarse cuesta (el de actualizar de Codex): la
    // segunda tecla solo sale si se ve que la primera movió el cursor.
    if (visto && paso.confirma) {
      const re2 = patron(paso.confirma);
      const fin2 = Date.now() + 4000;
      let movido = false;
      while (Date.now() < fin2 && !(movido = re2.test(cola(1200)))) await dormir(150);
      decir(`confirma «${paso.confirma}»: ${movido ? "sí" : "NO"}`);
      if (!movido) {
        decir("ABORTO: el cursor no está donde debe; no pulso nada más");
        break;
      }
      await dormir(400);
      motor.escribir(1, paso.entonces);
    }
  } else if (paso.quieto) {
    const fin = Date.now() + (paso.tope ?? 30000);
    while (Date.now() < fin && Date.now() - ultimo < paso.quieto) await dormir(100);
    decir(`quieto ${paso.quieto} ms`);
  } else if (paso.escribe !== undefined) {
    // Nunca se teclea con un menú de actualizar delante: un Intro lo aceptaría.
    if (/Update\s*now|Update\s*available/i.test(cola(700))) {
      decir("ABORTO: hay un aviso de actualización en pantalla; no tecleo");
      break;
    }
    motor.escribir(1, paso.escribe);
    decir(`escribe ${JSON.stringify(paso.escribe.slice(0, 60))}`);
  } else if (paso.duerme) {
    await dormir(paso.duerme);
  } else if (paso.hasta) {
    const h = paso.hasta;
    const fin = Date.now() + (h.tope ?? 180000);
    const desde = Date.now();
    const re = h.texto ? patron(h.texto) : null;
    let por = "tope";
    while (Date.now() < fin && !acabada) {
      await dormir(150);
      if (re && re.test(cola(2500))) {
        por = `texto «${h.texto}»`;
        break;
      }
      if (h.ms && Date.now() - desde >= h.ms) {
        por = `${h.ms} ms`;
        break;
      }
      // Un agente que trabaja repinta su reloj sin parar: el silencio es que acabó.
      if (h.ocioso && Date.now() - ultimo >= h.ocioso && Date.now() - desde > 4000) {
        por = "ocioso";
        break;
      }
    }
    decir(`hasta: ${por}`);
    if (h.luego) await dormir(h.luego);
  }
}

const cortar = trozos.length;
writeFileSync(join(REC, `${guion.nombre}.jsonl`), trozos.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync(join(REC, `${guion.nombre}.bin`), todo);
writeFileSync(join(REC, `${guion.nombre}.meta.json`), JSON.stringify({ inicio: t0, cols: guion.cols, rows: guion.rows, cwd: guion.cwd, sesion: guion.sesion ?? null }));
decir(`grabado: ${cortar} trozos, ${todo.length} caracteres`);
console.log("──── lo último que se veía ────");
console.log(
  cola(1800)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l, i, a) => l || a[i - 1])
    .join("\n"),
);
await motor.matar(1).catch(() => {});
await motor.cerrar();
process.exit(0);
