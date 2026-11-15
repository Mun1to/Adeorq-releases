// Las terminales nuevas caen ordenadas en la Cabina (`colocarNueva` en `lib/layout.ts`).
//
// Munir, 2026-11-15: «que cuando abran terminales nuevas se ordenen bien». Esto abre
// cinco terminales de una en una con el botón de Claude de la barra y, tras cada una,
// mira el mosaico de verdad: cuántas columnas, cuántas en cada una y si las de una
// columna miden lo mismo. Con cuatro tienen que quedar dos arriba y dos abajo.
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/ordenar-nuevas.js
// (carga el doble él mismo). Con FOTO=<carpeta> deja una foto de la Cabina con cuatro.
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const foto = globalThis.process?.env?.FOTO;

  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(1500);

  const cabina = async () => {
    await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
    await page.waitForTimeout(500);
  };
  /** Las columnas del mosaico, de izquierda a derecha: los altos de sus paneles, de arriba abajo. */
  const mosaico = () => page.evaluate(() => {
    const cols = new Map();
    for (const e of document.querySelectorAll("[data-pane-id]")) {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const x = Math.round(r.left);
      if (!cols.has(x)) cols.set(x, []);
      cols.get(x).push({ id: e.getAttribute("data-pane-id"), y: Math.round(r.top), h: Math.round(r.height) });
    }
    return [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => ps.sort((a, b) => a.y - b.y));
  });
  const ESPERADO = { 1: "1", 2: "1,1", 3: "1,1,1", 4: "2,2", 5: "1,2,2" };

  await cabina();
  for (let n = 1; n <= 5; n++) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude").click());
    await page.waitForTimeout(1500);
    await cabina();
    const m = await mosaico();
    const filas = m.map((c) => c.length).join(",");
    const altos = m.map((c) => c.map((p) => p.h).join("/")).join(" | ");
    pasos[n] = { filas, altos, orden: m.flat().map((p) => p.id).join(",") };
    debe(filas === ESPERADO[n], `con ${n}: columnas ${filas}, y tocaba ${ESPERADO[n]}`);
    debe(m.every((c) => c.every((p) => Math.abs(p.h - c[0].h) <= 2)), `con ${n}: una columna con altos distintos (${altos})`);
    if (n === 4 && foto) await page.screenshot({ path: `${foto}/cuatro-nuevas.png` });
  }
  return { pasos, fallos };
}
