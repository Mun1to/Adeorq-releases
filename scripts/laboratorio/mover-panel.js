// Mover un panel de la Cabina cogiéndolo por su cabecera, con una huella.
//
// Se pulsa la cabecera, se arrastra sobre otro panel y se suelta: cae en la
// mitad o el borde que marque el puntero (como el acople de ventanas de
// Windows). Un clic sin arrastre no mueve nada. Esto abre dos terminales, hace
// tres gestos (un clic, soltar en la mitad derecha del otro, soltar en su
// mitad de abajo) y devuelve una huella de cómo queda el mosaico tras cada uno.
// Tiene que salir igual antes y después de tocar ese código (`lib/moverPanel.ts`).
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/mover-panel.js" })
async (page) => {
  const cabina = async () => {
    await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
    await page.waitForTimeout(600);
  };
  const mosaico = () => page.evaluate(() => [...document.querySelectorAll("[data-pane-id]")]
    .map((e) => `${e.getAttribute("data-pane-id")}: ${e.style.left} ${e.style.top} ${e.style.width} ${e.style.height}${e.querySelector(".pane")?.getAttribute("data-focused") === "true" ? " *" : ""}`)
    .sort());
  const caja = (id) => page.evaluate((x) => { const b = document.querySelector(`[data-pane-id="${x}"]`).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, id);
  /** Un punto de la cabecera del panel que no caiga sobre un botón: la cabecera
      no empieza a arrastrar desde ellos, y en un panel estrecho son casi todo. */
  const asidero = (id) => page.evaluate((x) => {
    const cab = document.querySelector(`[data-pane-id="${x}"] .pane-head`);
    const r = cab.getBoundingClientRect();
    const y = r.top + r.height / 2;
    for (let px = r.left + 3; px < r.right - 3; px += 4) {
      const el = document.elementFromPoint(px, y);
      if (el && cab.contains(el) && !el.closest("button, input")) return { x: px, y };
    }
    return null;
  }, id);
  /** Coge el panel `id` por su cabecera y lo suelta en (fx, fy) del panel `sobre`, en fracciones. */
  const llevar = async (id, sobre, fx, fy) => {
    const a = await asidero(id);
    const b = await caja(sobre);
    if (!a) return "la cabecera no tiene dónde cogerla";
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 20, a.y + 16, { steps: 4 });
    await page.mouse.move(b.x + b.w * fx, b.y + b.h * fy, { steps: 12 });
    await page.waitForTimeout(120);
    // Dónde dice que va a caer, mientras lo llevas en la mano.
    const vista = await page.evaluate(() => { const e = document.querySelector(".snap-preview"); return e ? `${e.getAttribute("data-edge")} ${Math.round(parseFloat(e.style.width))}x${Math.round(parseFloat(e.style.height))}` : "sin vista previa"; });
    await page.mouse.up();
    await page.waitForTimeout(500);
    return vista;
  };

  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(3000);
  await cabina();
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector("button.mini.mini-claude").click());
    await page.waitForTimeout(1800);
  }
  await cabina();
  const alEmpezar = await mosaico();

  // Un clic en la cabecera, sin arrastre: no mueve nada.
  const a = await asidero(1);
  if (!a) return { huella: "", error: "la cabecera del panel 1 no tiene dónde cogerla" };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const trasClic = await mosaico();

  const vistaDerecha = await llevar(1, 2, 0.85, 0.5);
  const trasDerecha = await mosaico();
  const vistaAbajo = await llevar(1, 2, 0.5, 0.9);
  const trasAbajo = await mosaico();

  const todo = JSON.stringify({ alEmpezar, trasClic, vistaDerecha, trasDerecha, vistaAbajo, trasAbajo });
  let h = 5381;
  for (let i = 0; i < todo.length; i++) h = ((h << 5) + h + todo.charCodeAt(i)) >>> 0;
  return { huella: h.toString(16), alEmpezar, trasClic, vistaDerecha, trasDerecha, vistaAbajo, trasAbajo };
}
