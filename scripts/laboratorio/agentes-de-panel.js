// El robot de la cabecera de una terminal y su lista de agentes.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`), en la misma página.
//
// Abre una terminal de Claude, siembra cinco agentes en su sesión
// (`window.__agentes`) y mira lo que las reglas (`scripts/agentes-check.ts`) no
// pueden ver:
//   · El robot cuenta los que siguen fuera, y es un botón.
//   · Al posar el ratón sale la lista: cada agente con lo que se le mandó, su
//     clase, si sigue fuera y cuánto lleva; y arriba el recuento.
//   · La lista cabe en la ventana, y al quitar el ratón se va.
//   · Pulsado, se queda aunque el ratón se vaya; Esc la cierra.
//   · Un agente que vuelve cambia de fila sin cerrar la lista.
//
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  await page.evaluate(() => sessionStorage.removeItem("__tablero"));
  await page.goto("http://localhost:1420/");
  await page.locator('[data-tab="lienzo"]').waitFor({ timeout: 15000 });
  await page.locator('[data-tab="lienzo"]').click();
  await page.waitForTimeout(1500);
  const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
  await page.evaluate((h) => {
    window.__agentes = [
      { tipo: "Explore", que: "Mapa del editor de archivos", desde: h[0], hasta: null, vivo: true, fallo: false, fondo: false },
      { tipo: "Plan", que: "Plan de las terminales en proceso aparte", desde: h[1], hasta: null, vivo: true, fallo: false, fondo: false },
      { tipo: "general-purpose", que: "Inventario del código que sobra", desde: h[2], hasta: h[2], vivo: false, fallo: false, fondo: true },
      { tipo: "Explore", que: "Buscar dónde se pinta el estado", desde: h[3], hasta: h[4], vivo: false, fallo: false, fondo: false },
      { tipo: "Explore", que: "Leer un repositorio que no existe", desde: h[5], hasta: h[6], vivo: false, fallo: true, fondo: false },
    ];
  }, [hace(3), hace(12), hace(8), hace(40), hace(36), hace(50), hace(49)]);
  await page.locator('.cb-spawn[data-tip^="Nueva sesión de Claude Code aquí"]').first().click();

  // 1. El robot, con los que siguen fuera.
  const robot = page.locator("button.pane-agents").first();
  await robot.waitFor({ timeout: 25000 });
  pasos.robot = (await robot.innerText()).trim();
  debe(pasos.robot === "2", `el robot cuenta los dos que siguen fuera («${pasos.robot}»)`);

  // 2. Al posarse, la lista.
  await robot.hover();
  const lista = page.locator(".agentes");
  await lista.waitFor({ timeout: 4000 });
  await page.waitForTimeout(500);
  pasos.cabecera = (await lista.locator(".agentes-cab").innerText()).replace(/\s+/g, " ");
  pasos.filas = await lista.locator(".agente").evaluateAll((fs) => fs.map((f) => `${f.dataset.estado}: ${f.innerText.replace(/\s+/g, " ")}`));
  debe(/2 fuera · 1 en segundo plano · 1 de vuelta · 1 con fallo/.test(pasos.cabecera), `el recuento de arriba («${pasos.cabecera}»)`);
  debe(pasos.filas.length === 5, `cinco filas (${pasos.filas.length})`);
  debe(/^fuera: Mapa del editor de archivos Explore trabajando 3 min$/.test(pasos.filas[0] || ""), `el que sigue fuera dice qué hace y cuánto lleva («${pasos.filas[0]}»)`);
  debe(/^fondo: .*en segundo plano$/.test(pasos.filas[2] || ""), `al de segundo plano no se le inventa un final («${pasos.filas[2]}»)`);
  debe(/^volvio: .*terminó 4 min$/.test(pasos.filas[3] || ""), `el que volvió dice cuánto tardó («${pasos.filas[3]}»)`);
  debe(/^fallo: .*falló/.test(pasos.filas[4] || ""), `el que falló lo dice («${pasos.filas[4]}»)`);
  const caja = await lista.boundingBox();
  const ventana = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  pasos.caja = caja && { x: Math.round(caja.x), y: Math.round(caja.y), w: Math.round(caja.width), h: Math.round(caja.height) };
  debe(caja && caja.x >= 0 && caja.y >= 0 && caja.x + caja.width <= ventana.w + 1 && caja.y + caja.height <= ventana.h + 1, `la lista cabe en la ventana (${JSON.stringify(pasos.caja)} en ${JSON.stringify(ventana)})`);

  // 3. Del robot a la lista sin que se cierre; y fuera de las dos, se va.
  await lista.hover();
  await page.waitForTimeout(500);
  debe(await lista.count() === 1, "pasar del robot a la lista no la cierra");
  await page.mouse.move(5, ventana.h - 5);
  await page.waitForTimeout(700);
  debe(await lista.count() === 0, "al quitar el ratón, la lista se va");

  // 4. Pulsado se queda, y Esc la cierra.
  await robot.click();
  await lista.waitFor({ timeout: 3000 });
  await page.mouse.move(5, ventana.h - 5);
  await page.waitForTimeout(700);
  debe(await lista.count() === 1, "pulsado, se queda aunque el ratón se vaya");

  // 5. Un agente vuelve: cambia de fila sin cerrar la lista.
  await page.evaluate(() => { window.__agentes[0] = { ...window.__agentes[0], vivo: false, hasta: new Date().toISOString() }; });
  await page.waitForFunction(() => document.querySelectorAll('.agentes .agente[data-estado="fuera"]').length === 1, null, { timeout: 8000 }).catch(() => {});
  pasos.trasVolver = (await lista.locator(".agentes-cab").innerText()).replace(/\s+/g, " ");
  debe(/1 fuera/.test(pasos.trasVolver) && /2 de vuelta/.test(pasos.trasVolver), `la lista se pone al día sola («${pasos.trasVolver}»)`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  debe(await lista.count() === 0, "Esc la cierra");

  return { pasos, fallos };
}
