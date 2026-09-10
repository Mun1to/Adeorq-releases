// La carrera de los tamaños del PTY, reproducida y cerrada.
//
//   npx tsc scripts/tamano-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/tamano-check.js
//
// ── EL SÍNTOMA ───────────────────────────────────────────────────────────────
//
// Un panel ancho y el agente escribiendo estrecho, con media pantalla vacía a
// la derecha (Munir, 2026-09-10). El búfer del panel enseñaba el proceso
// repintando a 77, a 110 y otra vez a 77 columnas con las filas iguales: un
// vaivén de anchura del que el proceso se quedó con el tamaño de en medio.
//
// ── LO QUE SE PRUEBA ─────────────────────────────────────────────────────────
//
// Un PTY de mentira que aplica cada `resize` tras una espera al azar, que es
// lo que hace Tokio con tareas independientes: las ejecuta en el orden que le
// viene bien. Contra él se lanza la ráfaga que produce un panel al animarse
// (un tamaño por frame) seguida del vaivén. Con la lógica de antes, el PTY
// acaba a veces con un tamaño que NO es el último pedido, y peor: el front lo
// da por confirmado, así que no lo vuelve a intentar. Con la cola, nunca.
//
// El PTY de verdad, con el Tokio de verdad, está en src-tauri/src/pty.rs
// (`cargo test --lib carrera -- --ignored --nocapture`).

import { colaDeTamanos, type Tamano } from "../src/lib/tamanoPty";

declare const process: { exit(codigo: number): never };

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

/** Números repetibles: el mismo desorden en cada pasada. */
function azar(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** El ConPTY de mentira: aplica cada tamaño cuando le toca, no cuando llega. */
function ptyDeMentira(rnd: () => number) {
  let tiene: Tamano = { cols: 0, rows: 0 };
  let vivas = 0;
  const cerradas: Array<() => void> = [];
  return {
    tiene: () => tiene,
    mandar(t: Tamano): Promise<void> {
      vivas++;
      return new Promise((res) => {
        setTimeout(
          () => {
            tiene = t;
            vivas--;
            res();
            if (vivas === 0) for (const c of cerradas.splice(0)) c();
          },
          Math.floor(rnd() * 8),
        );
      });
    },
    /** Hasta que no quede ninguna en vuelo. */
    sinVuelos: () => (vivas === 0 ? Promise.resolve() : new Promise<void>((r) => cerradas.push(r))),
  };
}

/**
 * LA LÓGICA DE ANTES, tal cual estaba en `TerminalPane.tsx` (2026-09-10):
 * cada pedido sale en cuanto llega, y cada respuesta marca su tamaño como
 * confirmado. Vive aquí solo para enseñar el número del fallo.
 */
function laDeAntes(mandar: (t: Tamano) => Promise<void>) {
  let last: Tamano = { cols: 0, rows: 0 };
  let confirmado: Tamano = { cols: 0, rows: 0 };
  const listo = Promise.resolve();
  const enviar = (cols: number, rows: number) => {
    if (last.cols === cols && last.rows === rows) return;
    last = { cols, rows };
    void listo
      .then(() => {
        const now = last;
        if (now.cols !== cols || now.rows !== rows) return;
        return mandar({ cols, rows }).then(() => {
          confirmado = { cols, rows };
        });
      })
      .catch(() => {
        last = { cols: -1, rows: -1 };
      });
  };
  return {
    pedir(t: Tamano) {
      if (t.cols !== confirmado.cols || t.rows !== confirmado.rows) enviar(t.cols, t.rows);
    },
    confirmado: () => confirmado,
  };
}

/** Lo que manda un panel al animarse y luego rebotar: 77 → … → 110 → 77 → 110. */
function rafaga(): Tamano[] {
  const r: Tamano[] = [];
  for (let c = 77; c <= 110; c += 3) r.push({ cols: c, rows: 28 });
  r.push({ cols: 77, rows: 28 }, { cols: 110, rows: 28 });
  return r;
}

const RONDAS = 300;

// Todo dentro de una función: se compila a CommonJS y ahí no hay `await` suelto.
async function principal() {

/* ── Control: la lógica de antes, con su número ─────────────────────────── */
let antesMal = 0;
let antesAtascado = 0;
for (let i = 0; i < RONDAS; i++) {
  const rnd = azar(1000 + i);
  const pty = ptyDeMentira(rnd);
  const cola = laDeAntes(pty.mandar);
  const pedidos = rafaga();
  for (const t of pedidos) {
    cola.pedir(t);
    await new Promise((r) => setTimeout(r, 1)); // un frame entre pedido y pedido
  }
  await pty.sinVuelos();
  const ultimo = pedidos[pedidos.length - 1];
  if (pty.tiene().cols !== ultimo.cols) antesMal++;
  /* Lo grave. El layout ya no cambia, así que lo único que vuelve a pasar es
     el `sincronizarPty` rutinario de cada ajuste, que pide OTRA VEZ el tamaño
     que la rejilla tiene. Con la lógica de antes ese pedido muere en «ese
     pedido ya está en vuelo» (`lastSizeRef` guarda lo último PEDIDO, y lo
     último pedido fue justo este), así que el proceso se queda descuadrado
     hasta que algo cambie de tamaño. Es la captura de Munir. */
  cola.pedir(ultimo);
  await pty.sinVuelos();
  if (pty.tiene().cols !== ultimo.cols) antesAtascado++;
}
console.log(
  `\nla lógica de antes, ${RONDAS} rondas: el PTY acaba mal en ${antesMal}, y en ${antesAtascado} sigue mal después del reintento rutinario\n`,
);
ok("el banco reproduce la carrera con la lógica de antes", antesMal > 0, `${antesMal} de ${RONDAS}`);
ok(
  "y reproduce lo peor: el reintento rutinario no lo arregla, se queda atascado",
  antesAtascado > 0,
  `${antesAtascado} de ${RONDAS}`,
);

/* ── La cola ─────────────────────────────────────────────────────────────── */
let ahoraMal = 0;
let ahoraIncoherente = 0;
let viajes = 0;
for (let i = 0; i < RONDAS; i++) {
  const rnd = azar(1000 + i);
  const pty = ptyDeMentira(rnd);
  const cola = colaDeTamanos((t) => {
    viajes++;
    return pty.mandar(t);
  });
  const pedidos = rafaga();
  for (const t of pedidos) {
    cola.pedir(t);
    await new Promise((r) => setTimeout(r, 1));
  }
  await cola.quieta();
  const ultimo = pedidos[pedidos.length - 1];
  // El mismo reintento rutinario que atascaba a la de antes.
  cola.pedir(ultimo);
  await cola.quieta();
  if (pty.tiene().cols !== ultimo.cols) ahoraMal++;
  if (pty.tiene().cols !== cola.confirmado().cols) ahoraIncoherente++;
}
ok("con la cola el PTY acaba SIEMPRE con lo último pedido", ahoraMal === 0, `${ahoraMal} de ${RONDAS}`);
ok(
  "y lo confirmado es lo que el PTY tiene de verdad",
  ahoraIncoherente === 0,
  `${ahoraIncoherente} de ${RONDAS}`,
);
ok(
  "y de paso viaja menos: se saltan los tamaños intermedios que ya no valen",
  viajes < RONDAS * rafaga().length,
  `${viajes} viajes para ${RONDAS * rafaga().length} pedidos`,
);

/* ── Los detalles que cuestan una tarde si se olvidan ────────────────────── */
{
  const pty = ptyDeMentira(azar(7));
  const cola = colaDeTamanos(pty.mandar);
  cola.pedir({ cols: 0, rows: 24 });
  cola.pedir({ cols: 80, rows: 0 });
  await cola.quieta();
  ok("una rejilla de cero no se manda: es un panel oculto", pty.tiene().cols === 0);
}
{
  // El PTY todavía no existe: la puerta retiene, y al abrirse sale lo ÚLTIMO.
  const pty = ptyDeMentira(azar(8));
  let abrir: () => void = () => {};
  const cola = colaDeTamanos(pty.mandar);
  cola.esperar(new Promise<void>((r) => (abrir = r)));
  cola.pedir({ cols: 80, rows: 24 });
  cola.pedir({ cols: 100, rows: 30 });
  await new Promise((r) => setTimeout(r, 15));
  ok("antes de que exista el PTY no se manda nada", pty.tiene().cols === 0);
  abrir();
  await cola.quieta();
  ok("y al existir recibe lo último, no lo primero", pty.tiene().cols === 100 && pty.tiene().rows === 30);
}
{
  // Un fallo no confirma, y el siguiente pedido lo vuelve a intentar.
  let falla = true;
  const pty = ptyDeMentira(azar(9));
  const cola = colaDeTamanos((t) => (falla ? Promise.reject(new Error("no such pty")) : pty.mandar(t)));
  cola.pedir({ cols: 90, rows: 20 });
  await cola.quieta();
  ok("un fallo deja lo confirmado como estaba", cola.confirmado().cols === 0);
  falla = false;
  cola.pedir({ cols: 90, rows: 20 });
  await cola.quieta();
  ok("y el mismo tamaño se vuelve a mandar en el siguiente pedido", pty.tiene().cols === 90);
}
{
  // Tras un PTY nuevo, el mismo tamaño se manda aunque ya estuviera confirmado.
  const pty = ptyDeMentira(azar(10));
  let viajes2 = 0;
  const cola = colaDeTamanos((t) => {
    viajes2++;
    return pty.mandar(t);
  });
  cola.pedir({ cols: 80, rows: 24 });
  await cola.quieta();
  cola.pedir({ cols: 80, rows: 24 });
  await cola.quieta();
  ok("lo ya confirmado no vuelve a viajar", viajes2 === 1);
  cola.olvidar();
  cola.pedir({ cols: 80, rows: 24 });
  await cola.quieta();
  ok("pero tras `olvidar` (PTY nuevo) sí", viajes2 === 2);
}

/* ── Lo que se vio en la 0.9.156: un viaje que no vuelve, y el vigilante ──
   Un minuto después de reiniciar, dos paneles con el proceso a 80 columnas y
   la rejilla más estrecha. Con un solo viaje en vuelo por terminal, uno que no
   contesta dejaría la cola muda para siempre. */
{
  const pty = ptyDeMentira(azar(11));
  let viajes3 = 0;
  const cola = colaDeTamanos((t) => {
    viajes3++;
    // El primer viaje no contesta JAMÁS; los demás, normal.
    return viajes3 === 1 ? new Promise<void>(() => {}) : pty.mandar(t);
  }, 40);
  cola.pedir({ cols: 80, rows: 17 });
  await new Promise((r) => setTimeout(r, 5));
  cola.pedir({ cols: 68, rows: 17 });
  await new Promise((r) => setTimeout(r, 15));
  ok("mientras el viaje mudo está en vuelo, no sale otro", viajes3 === 1 && pty.tiene().cols === 0);
  await cola.quieta();
  ok(
    "pasado el tope, el viaje mudo se da por perdido y sale el siguiente",
    viajes3 === 2 && pty.tiene().cols === 68,
    `viajes=${viajes3} pty=${pty.tiene().cols}`,
  );
  ok("y lo confirmado es lo que el PTY tiene", cola.confirmado().cols === 68);
}
{
  // El vigilante: reenvía si hay desacuerdo, calla si no.
  const pty = ptyDeMentira(azar(12));
  let viajes4 = 0;
  const cola = colaDeTamanos((t) => {
    viajes4++;
    return pty.mandar(t);
  });
  cola.pedir({ cols: 80, rows: 17 });
  await cola.quieta();
  ok("con el proceso al día, asegurar no viaja", !cola.asegurar({ cols: 80, rows: 17 }) && viajes4 === 1);
  // El proceso se quedó con otra cosa sin que la cola lo sepa (un viaje tardío,
  // un reinicio del ConPTY, lo que sea): la rejilla dice 68.
  ok("con desacuerdo, asegurar reenvía", cola.asegurar({ cols: 68, rows: 17 }));
  await cola.quieta();
  ok("y el PTY acaba con lo de la rejilla", pty.tiene().cols === 68 && viajes4 === 2);
  ok("mientras hay un viaje en vuelo, asegurar espera", (() => {
    cola.pedir({ cols: 70, rows: 17 });
    return !cola.asegurar({ cols: 70, rows: 17 });
  })());
  await cola.quieta();
  ok("estado() cuenta lo que hay", /confirmado=70x17 enVuelo=false pendiente=-/.test(cola.estado()), cola.estado());
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
}

void principal();
