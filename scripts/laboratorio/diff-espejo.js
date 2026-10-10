// Comentar una línea del diff del Modo Espejo, con el teclado de verdad.
//
//   1. `pnpm dev` (solo Vite)
//   2. browser_run_code_unsafe(filename = "scripts/laboratorio/diff-espejo.js")
//
// Abre `diff-espejo.html`, que monta `DiffEspejo` suelto con un diff de ejemplo
// (la lógica de qué línea es cuál tiene su banco aparte, `diff-espejo-check.ts`).
// Aquí se mira lo que solo se ve en un navegador: que una cabecera no se puede
// comentar y una línea sí, que la caja coge el teclado, que Enter manda la nota
// redactada y la línea queda marcada, que vacía no manda nada y que Esc cierra.
//
// Devuelve { notas, numeros, fallos }.
async (page) => {
  const fallos = [];
  await page.goto("http://localhost:1420/scripts/laboratorio/diff-espejo.html");
  await page.locator(".diff-line").first().waitFor({ timeout: 15000 });
  const lineas = page.locator(".diff-line");
  const caja = page.locator(".diff-nota input");

  // Los números son los del archivo, no los del diff.
  const numeros = await page.evaluate(() => [...document.querySelectorAll(".diff-ln")].map((n) => n.textContent));
  if (numeros.join(",") !== ",,,,,10,11,11,12,13,14") fallos.push(`los números de línea salen ${numeros.join(",")}`);

  // Una cabecera no abre nada.
  await lineas.nth(0).click();
  if (await caja.count()) fallos.push("una cabecera del diff abrió la caja de la nota");

  // La línea añadida «const b = 3;» sí, y la caja coge el teclado.
  await lineas.nth(7).click();
  if ((await caja.count()) !== 1) fallos.push("pulsar una línea no abre la caja de la nota");
  if (!(await page.evaluate(() => document.activeElement?.closest(".diff-nota")))) fallos.push("la caja no coge el teclado");

  // Vacía no manda nada.
  await page.keyboard.press("Enter");
  if (await page.evaluate(() => window.__notas.length)) fallos.push("mandó una nota vacía");

  // Escrita y con Enter, llega redactada y la línea queda marcada.
  await page.keyboard.type("mejor una constante con nombre");
  await page.keyboard.press("Enter");
  const notas = await page.evaluate(() => window.__notas);
  const esperada = "En src/uno.ts, sobre la línea 11 que añadiste («const b = 3;»): mejor una constante con nombre";
  if (notas.length !== 1 || notas[0] !== esperada) fallos.push(`la nota que sale es ${JSON.stringify(notas)}`);
  if (await caja.count()) fallos.push("la caja sigue abierta después de enviar");
  if (!(await lineas.nth(7).locator(".diff-enviada").count())) fallos.push("la línea no queda marcada como «nota enviada»");

  // Esc cierra sin mandar; y con el botón también se envía.
  await lineas.nth(6).click();
  await page.keyboard.type("no la mando");
  await page.keyboard.press("Escape");
  if (await caja.count()) fallos.push("Esc no cierra la caja");
  await lineas.nth(6).click();
  await page.keyboard.type("esta hacía falta");
  await page.getByRole("button", { name: "Enviar" }).click();
  const dos = await page.evaluate(() => window.__notas);
  if (dos.length !== 2 || !dos[1].includes("línea 11 que quitaste («const b = 2;»): esta hacía falta")) fallos.push(`la segunda nota: ${JSON.stringify(dos[1])}`);

  // Otro diff: las marcas de antes no valen para estas líneas.
  await page.evaluate(() => window.__pintar(window.__DIFF.replace("const c = 4", "const c = 5")));
  await page.waitForTimeout(200);
  if (await page.locator(".diff-enviada").count()) fallos.push("las marcas de «nota enviada» sobreviven a un diff nuevo");
  return { notas: dos, numeros, fallos };
}
