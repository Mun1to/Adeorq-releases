// Cerrar con Escape el panel de objetivos mientras lo arrastras no deja la app
// entera sin poder seleccionar texto.
//
// Medido el 2026-10-31: arrastrar el panel pone `arrastrando` en el <body>
// (cursor de agarre y `user-select: none` en toda la app) y solo se quitaba al
// soltar el ratón. Si Escape lo cerraba a medio arrastre, el panel se iba y la
// clase se quedaba puesta hasta el siguiente arrastre de cualquier cosa.
//
// Con el MCP de Playwright, Vite en marcha y DESPUÉS de cargar el doble
// (`doble-conserje.js`), en la misma página:
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/objetivos-escape.js" })
async (page) => {
  await page.goto(new URL(page.url()).origin);
  await page.waitForTimeout(2500);
  const boton = page.locator("button.objetivos-toggle").first();
  if ((await boton.getAttribute("data-on")) !== "true") await boton.click();
  await page.waitForTimeout(600);
  const cabeza = await page.locator(".obj-flota-head").first().boundingBox();
  await page.mouse.move(cabeza.x + 20, cabeza.y + cabeza.height / 2);
  await page.mouse.down();
  await page.mouse.move(cabeza.x - 40, cabeza.y - 30, { steps: 4 });
  const durante = await page.evaluate(() => document.body.classList.contains("arrastrando"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const cerrado = !(await page.locator(".obj-flota").count());
  const despues = await page.evaluate(() => document.body.classList.contains("arrastrando"));
  return [
    `${durante ? "ok  " : "FALLA"} durante el arrastre la app está en modo arrastre`,
    `${cerrado ? "ok  " : "FALLA"} Escape cierra el panel a medio arrastre`,
    `${!despues ? "ok  " : "FALLA"} y la app no se queda en modo arrastre`,
  ].join("\n");
}
