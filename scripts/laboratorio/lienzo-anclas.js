// Una flecha dibujada que apunta a un carril o al kanban sigue anclada al volver.
//
// Medido el 2026-10-31: al devolver el tablero, carriles, chats y kanban nacían
// sin apuntarse en el mapa de ids viejos a nuevos, así que el anclaje de un
// trazo a cualquiera de ellos se tiraba en cada reinicio: la flecha se quedaba
// suelta y ya no seguía a su pieza.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/lienzo-anclas.js" })
async (page) => {
  const ancla = (nodo) => ({ nodo, rx: 0.5, ry: 0.5 });
  const flecha = (id, nodo) => ({ id, t: "flecha", color: "#e6edf7", w: 3, p: [10, 10, 200, 200], anclaA: ancla(nodo) });
  await page.evaluate((b) => sessionStorage.setItem("__tablero", b), JSON.stringify({
    kind: "adeorq-lienzo", v: 1, flechas: [],
    nodos: [
      { id: "car1", tipo: "carril", x: 0, y: 0, w: 2400, h: 520, nombre: "Mi carril", color: "#4d9fff" },
      { id: "kb1", tipo: "kanban", x: 0, y: 700, w: 760, h: 400, pendientes: [] },
    ],
    trazos: [flecha("d1", "car1"), flecha("d2", "kb1")],
  }));
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  await page.locator('.topbar button[data-tip="Lienzo"], .tabs button:has-text("Lienzo")').first().click();
  await page.waitForTimeout(3000);
  const f = JSON.parse(await page.evaluate(() => sessionStorage.getItem("__tablero")));
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  const tipoDe = (id) => f.nodos.find((n) => n.id === id)?.tipo;
  const de = (t) => f.trazos.find((s) => tipoDe(s.anclaA?.nodo) === t);
  return [
    `${f.trazos.length === 2 ? "ok  " : "FALLA"} vuelven los dos trazos (${f.trazos.length})`,
    `${de("carril") ? "ok  " : "FALLA"} la flecha sigue anclada al carril`,
    `${de("kanban") ? "ok  " : "FALLA"} la flecha sigue anclada al kanban`,
    `anclas guardadas: ${JSON.stringify(f.trazos.map((s) => s.anclaA ?? null))}`,
  ].join("\n");
}
