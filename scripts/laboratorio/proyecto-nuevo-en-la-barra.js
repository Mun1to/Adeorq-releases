// Un proyecto nuevo sale solo en la barra de la izquierda (Munir, 2026-11-17: Moods tenía su
// carpeta, su terminal y sus sesiones, «y en adeorq no aparece a la izquierda»). La barra releía
// las sesiones cada 45 s pero los proyectos solo al arrancar o con ↻. Y al momento, no al
// siguiente latido de las sesiones: «me gustaría que al crear un proyecto aparezca
// instantáneamente a la izquierda» (Munir, el mismo día). Los proyectos llevan su latido de 3 s.
//
// Arranca con los tres proyectos del doble, crea «Moods» a mitad (el doble lo añade a
// `list_projects`), adelanta el reloj 4 s y mira que ya está en la barra, sin recargar.
//
// Con `pnpm dev` en marcha:
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/proyecto-nuevo-en-la-barra.js
// Devuelve { pasos, fallos }: `fallos` vacío es que va bien.
async (page) => {
  const fallos = [];
  const pasos = {};
  const debe = (ok, que) => { if (!ok) fallos.push(que); };

  await page.clock.install();
  // Con un orden hecho a mano, como el suyo: es el caso en que lo nuevo caía al final.
  await page.addInitScript(() => { window.__estadoBarra = { projectOrder: ["VoCript", "Vidorq", "Adeorq"] }; });
  await page.goto("http://localhost:1420/");
  const doble = await page.evaluate(async () => (await import(`/scripts/laboratorio/doble-conserje.js?raw&t=${Date.now()}`)).default);
  await (0, eval)(doble)(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.clock.runFor(2000);
  await page.locator('.topbar button[data-tip="Cabina"], .tabs button:has-text("Cabina")').first().click().catch(() => {});
  await page.clock.runFor(1000);

  const nombres = () => page.evaluate(() => [...document.querySelectorAll(".project-name")].map((e) => e.textContent.trim()));
  pasos.antes = await nombres();
  debe(pasos.antes.includes("Adeorq") && !pasos.antes.includes("Moods"), `al empezar: ${pasos.antes.join(", ")}`);

  await page.evaluate(() => { window.__proyectosNuevos = [{ name: "Moods", path: "C:\\proyectos\\Moods", hasGit: true }]; });
  await page.clock.runFor(4_000);
  await page.waitForTimeout(300);
  pasos.despues = await nombres();
  debe(pasos.despues.includes("Moods"), `a los 4 s Moods no sale en la barra: ${pasos.despues.join(", ")}`);
  // Y arriba del todo: con un orden hecho a mano, lo que nunca colocaste caía al final, y Moods
  // estaba en su barra pero debajo de veintitrés proyectos («no aparece cuando le doy a recargar»).
  debe(pasos.despues.join(",") === "Moods,VoCript,Vidorq,Adeorq", `Moods sale, pero no el primero sobre tu orden: ${pasos.despues.join(", ")}`);
  return { pasos, fallos };
}
