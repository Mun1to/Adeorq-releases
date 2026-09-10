// El búfer corto de xterm, reproducido con la xterm de verdad y reparado.
//
//   npx tsc scripts/reparar-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   NODE_PATH=<repo>/node_modules node <tmp>/scripts/reparar-check.js
//
// El porqué entero está en `src/lib/xtermReparar.ts`. Aquí:
//   1. el caso mínimo del fuzz deja el búfer corto (el control: sin reparar,
//      se queda así, y ESO es lo que tira la app con el siguiente salto de línea);
//   2. con scrollback real y el búfer lleno pasa lo mismo, que es el caso de
//      Adeorq;
//   3. `repararBufer` lo cuadra, la rejilla queda igual y el texto sigue ahí;
//   4. y sobre un búfer sano no hace nada.

import { buferCorto, repararBufer } from "../src/lib/xtermReparar";

declare const process: { exit(codigo: number): never };

// xterm da por hecho un navegador; con esto arranca en Node sin uno. Y se carga
// DESPUÉS de los apaños, con el `require` de CommonJS en vez de un `import`,
// porque un `import` se sube al principio del archivo y xterm miraría `window`
// antes de que existiera. No hay tipos de Node en el proyecto, de ahí el eval.
const g = globalThis as unknown as Record<string, unknown>;
g.self = globalThis;
g.window = globalThis;
const cargar = eval("require") as (modulo: string) => { Terminal: new (o: object) => Term };
const { Terminal } = cargar("@xterm/xterm/lib/xterm.js");

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

type Bufer = {
  length: number;
  baseY: number;
  type: string;
  getLine(i: number): { translateToString(t?: boolean): string } | undefined;
};
type Term = {
  cols: number;
  rows: number;
  buffer: { active: Bufer; normal: Bufer; alternate: Bufer };
  resize(c: number, r: number): void;
  write(s: string, cb?: () => void): void;
  dispose(): void;
};
const vaciar = (t: Term) => new Promise<void>((r) => t.write("", r));
const estado = (t: Term) =>
  `${t.buffer.active.type} length=${t.buffer.active.length} baseY=${t.buffer.active.baseY} rows=${t.rows}`;

/** Todo el texto del búfer, para ver que reparar no borra nada. */
function textoDe(t: Term): string {
  let s = "";
  for (let i = 0; i < t.buffer.active.length; i++) s += t.buffer.active.getLine(i)?.translateToString(true) ?? "";
  return s;
}

async function principal() {
  /* ── 1. El caso mínimo del fuzz ──────────────────────────────────────────── */
  {
    const t: Term = new Terminal({ cols: 2, rows: 46, scrollback: 0, allowProposedApi: true });
    t.resize(135, 51);
    t.write("x".repeat(70) + "\n" + "x".repeat(36) + "\n");
    await vaciar(t);
    t.resize(3, 60);
    ok("el caso mínimo deja el búfer corto (fallo de xterm 6.1.0-beta.302)", buferCorto(t), estado(t));
    const antes = textoDe(t);
    const rebotes = repararBufer(t);
    ok("repararBufer lo cuadra", !buferCorto(t), estado(t));
    ok("con un rebote", rebotes === 1, `rebotes: ${rebotes}`);
    ok("y la rejilla queda como estaba", t.cols === 3 && t.rows === 60, `${t.cols}x${t.rows}`);
    ok("y el texto sigue ahí", textoDe(t) === antes);
    t.dispose();
  }

  /* ── 2. EL CASO DE ADEORQ, con su scrollback ───────────────────────────────
     Cazado con el fuzz limitado a los scrollback de la app (2.500 y 8.000) y
     reducido a cuatro pasos: el panel se ESTRECHA con la pantalla normal, un
     programa entra en la pantalla alternativa (`less`, `vim`, un TUI) y hace
     scroll, y luego el panel CRECE. La causa está en xterm: al estrechar, el
     alternativo vacío no recorta su `maxLength` (`Buffer.resize` salta todo el
     ajuste si `lines.length === 0`), así que al activarse se comporta como si
     tuviera scrollback y acumula un `ybase` que nunca debería tener; al crecer,
     la cuenta sale corta. En el fuzz sin reducir llegó a un déficit de
     DIECISÉIS líneas, y por eso el rebote es de tantas filas como faltan. */
  for (const scrollback of [2500, 8000]) {
    const t: Term = new Terminal({ cols: 134, rows: 45, scrollback, allowProposedApi: true });
    t.resize(82, 20);
    t.write("\x1b[?1049h" + "\n".repeat(20) + "\x1b[f");
    await vaciar(t);
    t.resize(194, 48);
    ok(
      `con scrollback ${scrollback}: estrechar, entrar en la pantalla alternativa, hacer scroll y crecer deja el búfer corto`,
      buferCorto(t),
      estado(t),
    );
    const antes = textoDe(t);
    const rebotes = repararBufer(t);
    ok(`y repararBufer lo cuadra (scrollback ${scrollback})`, !buferCorto(t) && rebotes >= 1, `${estado(t)} rebotes=${rebotes}`);
    ok(`sin perder texto (scrollback ${scrollback})`, textoDe(t) === antes);
    ok(`y con la rejilla intacta (scrollback ${scrollback})`, t.cols === 194 && t.rows === 48);
    t.write("\x1b[?1049l");
    await vaciar(t);
    ok(`y al volver a la pantalla normal sigue cuadrado (scrollback ${scrollback})`, !buferCorto(t), estado(t));
    t.dispose();
  }

  /* ── 2-bis. Un déficit grande se cierra en UN rebote, no en dieciséis ────── */
  {
    const t: Term = new Terminal({ cols: 134, rows: 45, scrollback: 8000, allowProposedApi: true });
    t.resize(82, 20);
    // Muchas vueltas de scroll en la alternativa: cada una suma al ybase falso.
    t.write("\x1b[?1049h" + "\n".repeat(200) + "\x1b[f");
    await vaciar(t);
    t.resize(194, 48);
    const d = t.buffer.active.baseY + t.rows - t.buffer.active.length;
    ok("con doscientos saltos el déficit es de varias líneas", buferCorto(t) && d > 1, `déficit=${d} ${estado(t)}`);
    const rebotes = repararBufer(t);
    ok("y se cuadra de un solo rebote", !buferCorto(t) && rebotes === 1, `${estado(t)} rebotes=${rebotes}`);
    t.dispose();
  }

  /* ── 3. El control: sin reparar, la pantalla miente ────────────────────────
     La lista circular de xterm hace `(inicio + índice) % maxLength`, así que
     con el búfer corto la última fila de la pantalla pide un índice de más y la
     lista DA LA VUELTA: enseña la primera línea del búfer como si fuera la
     última, y un salto de línea ahí marca `isWrapped` en la línea equivocada.
     El `undefined` que tiró la app de Munir es este mismo índice de más cuando
     la lista NO está llena (el búfer normal, con sus 8.000 de scrollback, tras
     un `ESC[3J` con el invariante ya roto): ahí la casilla no existe y revienta.
     Ese camino exacto no se ha reproducido; este sí, y es el mismo fallo. */
  {
    const t: Term = new Terminal({ cols: 2, rows: 46, scrollback: 0, allowProposedApi: true });
    t.resize(135, 51);
    t.write("PRIMERA" + "x".repeat(63) + "\n" + "x".repeat(36) + "\n");
    await vaciar(t);
    t.resize(3, 60);
    const b = t.buffer.active;
    const primera = b.getLine(0)?.translateToString(true) ?? "";
    const ultimaFila = b.getLine(b.baseY + t.rows - 1)?.translateToString(true) ?? "";
    // La primera línea que QUEDA: el reflow desbordó la lista y recortó por arriba.
    ok(
      "sin reparar, la última fila de la pantalla es la PRIMERA línea del búfer: la lista da la vuelta",
      primera !== "" && ultimaFila === primera,
      `primera=«${primera}» última fila=«${ultimaFila}»`,
    );
    repararBufer(t);
    const ultimaTrasReparar = b.getLine(b.baseY + t.rows - 1)?.translateToString(true) ?? "";
    ok(
      "reparado, la última fila es una línea de verdad y no la primera",
      ultimaTrasReparar !== primera,
      `última fila=«${ultimaTrasReparar}»`,
    );
    t.dispose();
  }

  /* ── 4. Sobre un búfer sano no toca nada ─────────────────────────────────── */
  {
    const t: Term = new Terminal({ cols: 80, rows: 24, scrollback: 100, allowProposedApi: true });
    t.write("hola\r\nadiós\r\n");
    await vaciar(t);
    ok("un búfer sano no está corto", !buferCorto(t), estado(t));
    ok("y repararBufer devuelve 0 sin tocarlo", repararBufer(t) === 0);
    t.dispose();
  }

  console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
}

void principal();
