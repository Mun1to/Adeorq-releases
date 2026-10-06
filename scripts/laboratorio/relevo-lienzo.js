// El relevo entre dos terminales del lienzo, a mano y en automático, con huella.
//
// Una flecha del lienzo entrega al agente de destino el encargo de la flecha y
// la última respuesta del de origen, cuando este acaba su turno. A mano sale un
// aviso con su botón; en automático se entrega sola, y si se pasa el relevo
// tres veces seguidas se frena y vuelve a mano (un círculo de flechas
// automáticas gasta un turno de agente por vuelta).
//
// Esto monta dos terminales y una flecha, recorre los dos modos y devuelve una
// huella de lo que se le escribió al destino y de lo que quedó en la barra.
// Tiene que salir igual antes y después de tocar ese código (`lib/flechas.ts`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), que es quien hace sonar la campana:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/relevo-lienzo.js" })
async (page) => {
  const campana = async (id) => {
    await page.evaluate((x) => window.__emitir("pty-data", { id: x, data: "\x07" }), id);
    await page.waitForTimeout(1700);
  };
  const barra = () => page.evaluate(() => [...document.querySelectorAll(".relay-bar .relay")].map((r) => r.textContent.trim()));
  const guardarFlecha = async (encargo, auto) => {
    await page.locator(".modal .mission-text").fill(encargo);
    const casilla = page.locator(".modal .canvas-auto input");
    if ((await casilla.isChecked()) !== auto) await casilla.click();
    await page.locator(".modal .modal-actions .np-btn").last().click();
    await page.waitForTimeout(400);
  };

  // Con el lienzo vacío: el doble guarda el tablero en `sessionStorage`, y lo
  // que dejara una prueba anterior en esta pestaña volvería a montarse.
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(3000);
  await page.locator('.topbar button[data-tip="Lienzo"], .tabs button:has-text("Lienzo")').first().click();
  await page.waitForTimeout(1200);
  for (let i = 0; i < 2; i++) {
    await page.locator('.cb-spawn[data-tip^="Nueva sesión de Claude Code aquí"]').first().click();
    await page.waitForTimeout(1800);
  }
  // Encuadrar hasta que las dos se vean enteras: la cámara todavía puede ir de
  // camino a la última terminal, y un encuadre pedido a media animación se pierde.
  const asas = () => page.evaluate(() => [...document.querySelectorAll(".react-flow__node-term")].map((n) => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; };
    return { sale: r(n.querySelector(".react-flow__handle.source")), entra: r(n.querySelector(".react-flow__handle.target")) };
  }));
  const dentro = (p) => p.x > 5 && p.y > 60 && p.x < 795 && p.y < 495;
  let c = [];
  for (let intento = 0; intento < 5; intento++) {
    await page.waitForTimeout(900);
    await page.locator(".react-flow__controls-fitview").first().click();
    await page.waitForTimeout(1100);
    c = await asas();
    if (c.length === 2 && dentro(c[0].sale) && dentro(c[1].entra)) break;
  }
  await page.mouse.move(c[0].sale.x, c[0].sale.y);
  await page.mouse.down();
  await page.mouse.move(c[0].sale.x - 50, c[0].sale.y + 70, { steps: 6 });
  await page.mouse.move(c[1].entra.x, c[1].entra.y, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(800);
  // Al soltar la flecha se abre su ficha; si no, se abre pinchándola.
  if (!(await page.locator(".modal .mission-text").count())) {
    await page.locator(".react-flow__edge").first().click({ force: true });
    await page.waitForTimeout(400);
  }
  await guardarFlecha("resume lo anterior en tres líneas", false);

  await page.evaluate(() => {
    window.__respuesta = Array.from({ length: 30 }, (_, i) => `Paso ${i + 1}: revisé el módulo y dejé anotado qué cambia y por qué.`).join("\n");
    window.__antes = window.__llamadas.length;
  });

  /* ── A mano: la campana deja el aviso, y el botón entrega ─────────────── */
  await campana(1);
  const aviso = await barra();
  await page.locator(".relay-bar .relay-btn").first().click();
  await page.waitForTimeout(1200);
  const trasEntregar = await barra();

  /* ── En automático: tres entregas solas, y a la cuarta se frena ───────── */
  // La ficha se abre pinchando la flecha, y se pincha por su rótulo: el centro
  // de la caja de una curva casi nunca cae sobre el trazo.
  await page.locator(".react-flow__edge-text, .react-flow__edge-textwrapper").first().click({ force: true });
  await page.waitForTimeout(400);
  const fichaAbierta = await page.locator(".modal .mission-text").count();
  if (fichaAbierta) await guardarFlecha("resume lo anterior en tres líneas", true);
  for (let i = 0; i < 4; i++) await campana(1);
  const frenada = await barra();

  const r = await page.evaluate(() => ({
    escrito: window.__llamadas.slice(window.__antes).filter(([c]) => c === "pty_send" || c === "pty_write").map(([c, a]) => `${c} ${a.id} enviar=${a.enviar} ${(a.texto ?? a.data ?? "").length}: ${(a.texto ?? a.data ?? "").slice(0, 60)}`),
    flechas: [...document.querySelectorAll(".react-flow__edge")].map((e) => e.textContent.trim()),
  }));
  const todo = JSON.stringify({ aviso, trasEntregar, fichaAbierta, frenada, ...r });
  let h = 5381;
  for (let i = 0; i < todo.length; i++) h = ((h << 5) + h + todo.charCodeAt(i)) >>> 0;
  return { huella: h.toString(16), largo: todo.length, aviso, trasEntregar, fichaAbierta, frenada, escritos: r.escrito.length, primero: r.escrito[0], flechas: r.flechas };
}
