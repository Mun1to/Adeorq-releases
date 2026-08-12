// Casos del reparto del Cerebro. Se corren de verdad, no se leen:
//
//   npx tsc scripts/cerebro-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/cerebro-check.js
//
// (El porqué de ese camino, en `docs/` y en la memoria: Adeorq no tiene runner
// de tests y la lógica pura se prueba compilando a CommonJS.)
//
// Lo que se comprueba aquí es lo que NO se puede mirar en pantalla y opinar:
// que nadie se queda sin sitio, que las regiones no se solapan, que un hilo no
// cruza el núcleo, y que el color de dos proyectos vecinos se distingue.

import {
  AJUSTES_FABRICA,
  TOPES,
  ajustesGuardados,
  altoDe,
  colorDeProyecto,
  coser,
  fib,
  normalDe,
  nucleo,
  rejilla,
  repartir,
  tiroDelHilo,
  R,
  R_LIBRE,
  R_NUCLEO,
} from "../src/lib/cerebro";

/* Sin `import` de node y sin sus tipos: este comprobador se compila suelto, con
   `--skipLibCheck` y sin `@types/node`, así que un `import` de `node:fs` no
   compilaría. Se declara aquí lo justo que se usa. */
declare const require: (m: string) => { readFileSync(p: string, e: string): string };
declare const process: { cwd(): string };

let fallos = 0;
function ok(nombre: string, cond: boolean, extra = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${extra ? " — " + extra : ""}`);
}

// ── El terreno ──────────────────────────────────────────────────────────────
{
  const n = 500;
  let peor = 0;
  for (let i = 0; i < n; i++) {
    const p = fib(i, n);
    peor = Math.max(peor, Math.abs(Math.hypot(p.x, p.y, p.z) - 1));
  }
  ok("la espiral reparte SOBRE la esfera", peor < 1e-12, `error máximo ${peor.toExponential(1)}`);

  // Sin claros ni grumos: el vecino más cercano de cada punto tiene que estar a
  // una distancia parecida en todos. Si hubiera grumos, el peor sería mucho
  // mayor que el mejor.
  let minD = Infinity, maxD = 0;
  const ps = Array.from({ length: 200 }, (_, i) => fib(i, 200));
  for (let i = 0; i < ps.length; i++) {
    let d = Infinity;
    for (let j = 0; j < ps.length; j++) {
      if (i === j) continue;
      d = Math.min(d, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z));
    }
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
  }
  ok(
    "y sin claros ni grumos",
    maxD / minD < 1.6,
    `el hueco mayor es ${(maxD / minD).toFixed(2)}x el menor`,
  );
}

// ── El reparto en regiones ──────────────────────────────────────────────────
interface D { id: string; fam: string; grado: number }
function boveda(forma: Record<string, number>): D[] {
  const out: D[] = [];
  for (const [fam, n] of Object.entries(forma)) {
    for (let i = 0; i < n; i++) out.push({ id: `${fam}/${i}`, fam, grado: (i * 7) % 20 });
  }
  return out;
}
// La forma REAL de la bóveda de Munir, medida con `medir-cerebro.mjs`.
const REAL = { "·": 1, "00-inbox": 2, "01-proyectos": 34, "02-areas": 2, "03-recursos": 93,
  "04-archivo": 201, "99-plantillas": 1, START: 1 };

{
  const docs = boveda(REAL);
  const { pos, regiones } = repartir(docs, (d) => d.fam, (d) => d.grado);

  ok("todos los documentos tienen sitio", pos.every((p) => !!p) && pos.length === docs.length);
  ok(
    "y todos caen en la superficie",
    pos.every((p) => Math.abs(Math.hypot(p.x, p.y, p.z) - R) < 1e-9),
    "un punto fuera de la bola rompe la forma y el contorno",
  );
  // Nadie ocupa el sitio de nadie: con el reparto por rondas, dos documentos no
  // pueden caer en el mismo solar.
  const vistos = new Set(pos.map((p) => `${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`));
  ok("y ninguno pisa a otro", vistos.size === pos.length,
    `${pos.length - vistos.size} repetidos`);

  ok("una región por proyecto", regiones.length === Object.keys(REAL).length);
  ok(
    "y con el número de documentos que le toca",
    regiones.every((r) => r.n === REAL[r.fam as keyof typeof REAL]),
  );
  ok(
    "el orden de los proyectos es alfabético y por tanto estable",
    regiones.map((r) => r.fam).join() === Object.keys(REAL).sort().join(),
    "con un orden por tamaño, esconder los sueltos recolocaría la bola entera",
  );

  /* Lo más enlazado en el centro de su región. Es lo que hace que una región se
     lea como un racimo y no como una salpicadura. */
  const porFam = new Map<string, D[]>();
  docs.forEach((d, i) => {
    const l = porFam.get(d.fam) ?? [];
    l.push({ ...d, id: String(i) });
    porFam.set(d.fam, l);
  });
  let coherentes = 0, mirados = 0;
  for (const rg of regiones) {
    const suyos = porFam.get(rg.fam)!;
    if (suyos.length < 6) continue;
    const dist = (d: D) => {
      const p = pos[Number(d.id)];
      return Math.hypot(p.x - rg.x, p.y - rg.y, p.z - rg.z);
    };
    const masEnlazado = [...suyos].sort((a, b) => b.grado - a.grado)[0];
    const menos = [...suyos].sort((a, b) => a.grado - b.grado)[0];
    mirados++;
    if (dist(masEnlazado) <= dist(menos)) coherentes++;
  }
  ok("lo más enlazado cae en el medio de su región", coherentes === mirados,
    `${coherentes}/${mirados}`);
}

{
  // Un proyecto de UNO no puede quedarse sin sitio ni comerse la bola.
  const docs = boveda({ solo: 1, otro: 400 });
  const { regiones } = repartir(docs, (d) => d.fam, (d) => d.grado);
  ok("un proyecto de un solo documento sigue teniendo su región",
    regiones.find((r) => r.fam === "solo")?.n === 1);
  ok("y el grande se queda el resto",
    regiones.find((r) => r.fam === "otro")?.n === 400);
}

{
  // Una bóveda vacía no puede reventar: pasa al abrir una carpeta sin notas.
  const { pos, regiones } = repartir([] as D[], (d) => d.fam, (d) => d.grado);
  ok("una bóveda vacía no revienta", pos.length === 0 && regiones.length === 0);
}

// ── Los hilos ───────────────────────────────────────────────────────────────
{
  const n = 300;
  let dentro = 0;
  let peorCerca = Infinity;
  for (let i = 0; i < n; i++) {
    const a = fib(i, n), b = fib((i * 37 + 11) % n, n);
    const c = tiroDelHilo(a, b);
    // La curva pasa por (medio + control) / 2 en su mitad: ese es el punto que
    // más se acerca al centro, y es el que no puede entrar en el núcleo.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    const px = (mx + c.x) / 2, py = (my + c.y) / 2, pz = (mz + c.z) / 2;
    const r = Math.hypot(px, py, pz);
    peorCerca = Math.min(peorCerca, r);
    if (r < R_NUCLEO) dentro++;
  }
  ok("ningún hilo entra en el anillo de las skills", dentro === 0,
    `el más cercano pasa a ${peorCerca.toFixed(3)} y el anillo está en ${R_NUCLEO}`);
  ok("y todos rozan la misma circunferencia, así que se leen como un haz",
    Math.abs(peorCerca - R_LIBRE) < 1e-9);
}

{
  // El caso que rompe la cuenta del punto medio: dos documentos OPUESTOS tienen
  // su medio en el origen exacto, y ahí no hay dirección que valga.
  const ejes = [
    ["Z", { x: 0, y: 0, z: 1 }],
    ["Y", { x: 0, y: 1, z: 0 }],
    ["X", { x: 1, y: 0, z: 0 }],
    ["diagonal", normalDe({ x: 1, y: 1, z: 1 })],
  ] as const;
  for (const [nom, a] of ejes) {
    const b = { x: -a.x, y: -a.y, z: -a.z };
    const c = tiroDelHilo(a, b);
    const r = Math.hypot(c.x / 2, c.y / 2, c.z / 2);
    ok(`antípodas en el eje ${nom}: tampoco cruzan el centro`,
      Number.isFinite(r) && Math.abs(r - R_LIBRE) < 1e-9, `pasa a ${r.toFixed(3)}`);
  }
}

// ── La malla del tejido ─────────────────────────────────────────────────────
{
  const ps = Array.from({ length: 120 }, (_, i) => fib(i, 120));
  const aristas = coser(ps, 3);
  ok("cada nodo queda cosido a alguien", new Set(aristas.flat()).size === ps.length);
  const claves = new Set(aristas.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  ok("y ninguna arista se guarda dos veces", claves.size === aristas.length,
    "si no, cada línea se pintaría el doble de fuerte");
  ok("ni ninguna va de un nodo a sí mismo", aristas.every(([a, b]) => a !== b));
  // Cosidas a los VECINOS: ninguna puede cruzar la bola de lado a lado.
  const largas = aristas.filter(([a, b]) =>
    Math.hypot(ps[a].x - ps[b].x, ps[a].y - ps[b].y, ps[a].z - ps[b].z) > R).length;
  ok("y ninguna cruza la bola entera", largas === 0, `${largas} cruzaban`);
}

// ── El núcleo y las normales ────────────────────────────────────────────────
{
  ok("sin skills no hay anillo", nucleo(0).length === 0);
  ok("con una sola, va al centro exacto",
    nucleo(1).length === 1 && Math.hypot(nucleo(1)[0].x, nucleo(1)[0].y, nucleo(1)[0].z) === 0,
    "con una sola no hay anillo que formar");
  const seis = nucleo(6);
  ok("y con varias, dentro del cascarón",
    seis.every((p) => Math.hypot(p.x, p.y, p.z) < R * 0.5),
    "si se acercaran al primer anillo se leerían como un proyecto más");

  const n = normalDe({ x: 3, y: -4, z: 12 });
  ok("la normal es unitaria", Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12);
  ok("y el centro exacto no da NaN", Number.isFinite(normalDe({ x: 0, y: 0, z: 0 }).x),
    "un punto en el origen dividiría por cero, y de ahí sale el contorno");
}

// ── El color ────────────────────────────────────────────────────────────────
{
  const tono = (c: string) => Number(c.slice(4).split(" ")[0]);
  const sat = (c: string) => Number(c.split(" ")[1].replace("%", ""));
  const luz = (c: string) => Number(c.split(" ")[2].replace("%)", ""));
  const N = 10;
  const cols = Array.from({ length: N }, (_, i) => colorDeProyecto(i, N));
  ok("todos los colores son válidos", cols.every((c) => c.startsWith("hsl(")));
  ok("usa la rueda ENTERA y no los ochenta grados azules de la app",
    Math.max(...cols.map(tono)) - Math.min(...cols.map(tono)) > 300,
    "en ochenta grados, diez proyectos salen del mismo color");
  /* Dos vecinos nunca coinciden en las TRES cosas: con el tono a secas se
     llevan 36 grados, y en la zona de los verdes eso es casi el mismo color. */
  let iguales = 0;
  for (let i = 1; i < N; i++) {
    if (sat(cols[i]) === sat(cols[i - 1]) && luz(cols[i]) === luz(cols[i - 1])) iguales++;
  }
  ok("y dos vecinos se distinguen por algo más que el tono", iguales === 0,
    `${iguales} parejas con la misma saturación y luz`);
  ok("con un solo proyecto no revienta", colorDeProyecto(0, 1).startsWith("hsl("));
}

// ── El alto de un nodo ──────────────────────────────────────────────────────
{
  ok("un documento suelto casi no sobresale", altoDe(0) < 0.03);
  ok("y uno muy enlazado tiene techo", altoDe(1000) <= 0.148,
    "sin techo, el más enlazado saldría como una antena");
  ok("y crece con los enlaces", altoDe(1) < altoDe(9) && altoDe(9) < altoDe(40));
}

// ── La rejilla ──────────────────────────────────────────────────────────────
{
  const lineas = rejilla();
  ok("la rejilla tiene meridianos y paralelos", lineas.length > 20);
  const todos = lineas.flat();
  ok("y va POR DENTRO de donde están los nodos",
    todos.every((p) => Math.hypot(p.x, p.y, p.z) < R),
    "por fuera, sus líneas cruzarían por encima de las luces");
  ok("cada punto lleva su normal, que es de donde sale el contorno",
    todos.every((p) => Math.abs(Math.hypot(p.n.x, p.n.y, p.n.z) - 1) < 1e-9));
}


/* ── LO QUE SE PUEDE TOCAR ───────────────────────────────────────────────────
   Esto viene de `localStorage`, o sea de lo que escribió una versión anterior,
   de algo a medio escribir, o de que alguien lo abrió a mano. Y un solo número
   malo no se nota hasta que es tarde: un `NaN` en el alfa de un canvas NO da
   error, simplemente deja de dibujarse esa capa. */
{
  ok("sin nada guardado, los de fábrica",
    JSON.stringify(ajustesGuardados(null)) === JSON.stringify(AJUSTES_FABRICA));
  ok("y con basura, también",
    JSON.stringify(ajustesGuardados("pues no")) === JSON.stringify(AJUSTES_FABRICA));
  ok("un ajuste suelto no borra los demás",
    ajustesGuardados({ brillo: 3 }).alto === AJUSTES_FABRICA.alto &&
    ajustesGuardados({ brillo: 3 }).brillo === 3);

  for (const malo of [NaN, Infinity, -Infinity, "0.5", null, {}, []] as unknown[]) {
    const a = ajustesGuardados({ brillo: malo, tejido: malo });
    ok(`un valor imposible (${JSON.stringify(malo) ?? String(malo)}) se descarta`,
      Number.isFinite(a.brillo) && Number.isFinite(a.tejido) &&
      a.brillo === AJUSTES_FABRICA.brillo,
      "un NaN en un alfa de canvas no avisa: deja de dibujarse esa capa");
  }

  const fuera = ajustesGuardados({ brillo: 9999, alto: -50, corte: 0 });
  ok("y uno fuera de rango se recorta a su tope",
    fuera.brillo === TOPES.brillo[1] && fuera.alto === TOPES.alto[0] &&
    fuera.corte === TOPES.corte[0],
    `salió ${fuera.brillo}, ${fuera.alto}, ${fuera.corte}`);

  ok("los interruptores solo aceptan sí o no",
    ajustesGuardados({ gira: "sí" }).gira === AJUSTES_FABRICA.gira &&
    ajustesGuardados({ gira: false }).gira === false);

  // Todo mando tiene su tope, y al revés: si se añade uno y se olvida su rango,
  // el deslizador saldría sin extremos y guardaría cualquier cosa.
  const mandos = Object.keys(AJUSTES_FABRICA).filter((k) => k !== "gira" && k !== "nombres");
  ok("cada mando tiene su rango declarado",
    mandos.every((k) => k in TOPES) && Object.keys(TOPES).length === mandos.length,
    mandos.join(", "));
  ok("y lo de fábrica cae dentro de su propio rango",
    mandos.every((k) => {
      const [min, max] = TOPES[k as keyof typeof TOPES];
      const v = AJUSTES_FABRICA[k as keyof typeof TOPES];
      return v >= min && v <= max;
    }));
}


/* ── EL TABLERO NO PUEDE COMERSE LOS CLICS ───────────────────────────────────
   Esto mira el CÓDIGO y no un resultado, que es raro y aquí está justificado:
   el tablero vive DENTRO de la caja que maneja el ratón, así que los eventos de
   sus botones burbujean hasta ella. Sin una guarda, `setPointerCapture` se lleva
   el puntero y el `pointerup` no vuelve al botón: el clic no llega a
   completarse. Le pasó a Munir con la 0.9.101 y no lo cazó ninguna prueba,
   porque las de interacción disparan eventos sin un `target` de verdad.

   Lo que se protege es que NO SE OLVIDE en un manejador nuevo, que es la forma
   en que esto vuelve. */
{
  /* Sin `import` de node y sin sus tipos: este comprobador se compila suelto,
     con `--skipLibCheck` y sin `@types/node`, así que un import de `node:fs`
     no compilaría. Y la raíz sale del directorio DE TRABAJO y no del del
     archivo: al compilar a un temporal, `__dirname` apunta ahí y no al repo. */
  const { readFileSync } = require("node:fs");
  const raiz = process.cwd();
  const src = readFileSync(raiz + "/src/components/MemoriaGrafo.tsx", "utf8");
  ok("la guarda del tablero existe", src.includes("const delTablero ="),
    "sin ella, cualquier botón encima del canvas deja de funcionar");
  for (const mano of ["onDown", "onMove", "onUp", "onWheel"]) {
    const i = src.indexOf(`const ${mano} = (`);
    const cuerpo = i < 0 ? "" : src.slice(i, i + 900);
    ok(`${mano} deja pasar lo que viene del tablero`,
      i >= 0 && cuerpo.includes("delTablero("),
      i < 0 ? "no encontrado" : "");
  }
  /* EL NODO CLAVADO tiene que poder soltarse SIEMPRE. Es un estado pegajoso: se
     queda puesto aunque apartes el ratón, que es justo su gracia, y por eso una
     salida que falte deja la vista atascada sin forma de volver.
     Se cuentan las salidas en vez de buscar cada una por su texto: así el caso
     no se rompe porque alguien mueva una llave de sitio. */
  const suelta = (src.match(/nodoFijo\.current = null/g) ?? []).length;
  ok("el nodo clavado tiene sus tres salidas", suelta >= 3,
    `encontradas ${suelta}: el clic en el vacío, el botón del tablero y quedarse sin nodo`);
  ok("y el botón de la rueda en el vacío también lo suelta",
    src.includes("nodoFijo.current = suyo ? suyo.id : null"),
    "clavar y soltar tienen que ser el MISMO gesto, o hay que buscar cómo salir");
  ok("se suelta solo si el nodo deja de existir",
    src.includes("!ps.some((p) => p.id === nodoFijo.current)"),
    "otra bóveda o el filtro de sueltos pueden llevárselo por delante");
  ok("y mientras está clavado, el ratón no decide",
    src.includes("const sel = fijo ?? bajo"),
    "si el señalado mandara, rozar otro punto al dar la vuelta lo perdería");

  // Y que nadie interactivo más se cuele encima del canvas sin pensarlo: los
  // otros dos que hay flotando tienen que ser transparentes al ratón.
  const css = readFileSync(raiz + "/src/App.css", "utf8");
  for (const clase of [".mem-cerebro-eti", ".mem-cerebro-ayuda"]) {
    const i = css.indexOf(`${clase} {`);
    const regla = i < 0 ? "" : css.slice(i, css.indexOf("}", i));
    ok(`${clase} no intercepta el ratón`, i >= 0 && regla.includes("pointer-events: none"),
      "flota sobre la bola: si captura clics, no se puede señalar lo que hay debajo");
  }
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
