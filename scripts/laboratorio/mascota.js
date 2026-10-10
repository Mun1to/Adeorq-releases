// La mascota, viva, en una página de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/mascota.js")
//
// Abre `mascota.html` (la hoja con los cinco ánimos) y mira lo que el banco de
// las reglas (`scripts/mascota-check.ts`) no puede ver, que es que SE MUEVA:
//   · En cada ánimo cambian los fotogramas con el paso del tiempo.
//   · Pulsarla la hace brincar en el acto, no cuando acabe lo que estaba haciendo.
//   · El ojo sigue al ratón a la derecha y hacia abajo, y vuelve al frente solo.
//   · Con el modo rendimiento se queda en una sola postura.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien. Para MIRAR los
// fotogramas uno a uno, la propia hoja los enseña debajo.
async (page) => {
  const fallos = [];
  const pasos = {};
  await page.goto("http://localhost:1420/scripts/laboratorio/mascota.html");
  await page.locator('[data-viva="quieta"] svg').first().waitFor({ timeout: 15000 });

  const ANIMOS = ["quieta", "trabaja", "espera", "lista", "dormida"];
  const firma = (a) => page.evaluate((a) => [...document.querySelector(`[data-viva="${a}"] svg`).querySelectorAll("rect")].map((r) => `${r.getAttribute("x")},${r.getAttribute("y")}${r.getAttribute("fill")}`).join(";"), a);
  /** Cuántas posturas distintas enseña cada ánimo en unos segundos. */
  const mirar = async (segundos) => {
    const vistas = Object.fromEntries(ANIMOS.map((a) => [a, new Set()]));
    for (let i = 0; i < segundos * 9; i++) {
      for (const a of ANIMOS) vistas[a].add(await firma(a));
      await page.waitForTimeout(110);
    }
    return Object.fromEntries(ANIMOS.map((a) => [a, vistas[a].size]));
  };

  // 1. Se mueven.
  pasos.posturas = await mirar(6);
  for (const a of ANIMOS) if (pasos.posturas[a] < 2) fallos.push(`«${a}» no se mueve: una sola postura en seis segundos`);

  // 2. Pulsarla: brinca ya.
  const antes = await firma("dormida");
  await page.locator("#toque").click();
  await page.waitForTimeout(120);
  pasos.brinca = (await firma("dormida")) !== antes;
  if (!pasos.brinca) fallos.push("pulsarla no la hace brincar en el acto");

  // 3. El ojo sigue al ratón. Se mira la pupila cuando el ojo está abierto.
  const pupila = () => page.evaluate(() => {
    const p = [...document.querySelector('[data-viva="quieta"] svg').querySelectorAll("rect")].filter((r) => r.getAttribute("fill") === "#0e2c47");
    return p.length === 2 ? p.map((r) => `${r.getAttribute("x")},${r.getAttribute("y")}`).sort().join(" ") : null;
  });
  const abierto = async () => {
    for (let i = 0; i < 50; i++) {
      const p = await pupila();
      if (p) return p;
      await page.waitForTimeout(60);
    }
    return null;
  };
  const caja = await page.locator('[data-viva="quieta"] svg').first().boundingBox();
  const cx = caja.x + caja.width / 2;
  const cy = caja.y + caja.height / 2;
  const llevar = async (x, y) => {
    await page.mouse.move(x, y);
    await page.waitForTimeout(120);
    await page.mouse.move(x + 3, y + 3);
    await page.waitForTimeout(200);
    return abierto();
  };
  // De frente primero: el ratón encima de ella (saluda, y al acabar mira al frente).
  pasos.frente = await llevar(cx, caja.y - 2 < 1 ? 1 : caja.y - 2);
  pasos.derecha = await llevar(cx + caja.width * 3, cy);
  pasos.abajo = await llevar(cx, cy + caja.height * 3);
  if (!pasos.derecha || pasos.derecha === pasos.abajo) fallos.push(`el ojo no distingue derecha de abajo (${pasos.derecha} / ${pasos.abajo})`);
  await page.waitForTimeout(3000);
  pasos.vuelve = await abierto();
  if (pasos.vuelve === pasos.abajo) fallos.push("con el ratón quieto el ojo no vuelve al frente");

  // 4. Modo rendimiento: quieta del todo.
  await page.evaluate(() => { document.documentElement.dataset.rendimiento = "1"; });
  await page.waitForTimeout(2000);
  pasos.enRendimiento = await mirar(3);
  for (const a of ANIMOS) if (pasos.enRendimiento[a] !== 1) fallos.push(`con el modo rendimiento «${a}» sigue moviéndose (${pasos.enRendimiento[a]} posturas)`);
  await page.evaluate(() => { delete document.documentElement.dataset.rendimiento; });

  return { pasos, fallos };
}
