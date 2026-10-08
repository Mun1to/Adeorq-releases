// La barra de sesiones en el lienzo: se ve, y lo que abre nace en el lienzo.
//
// Munir, 2026-10-08: «en el lienzo también un panel a la izquierda de las
// sesiones, como en la Cabina». Es la misma barra, montada una sola vez, y el
// lienzo vive a su derecha (`lib/barraEnLienzo.ts`). Esto comprueba:
//
//   en el lienzo  la barra se ve, el mosaico y el panel derecho no, y el lienzo
//                 empieza a la derecha de la barra;
//   abrir         el botón de Claude de un proyecto abre una pieza en el lienzo y
//                 ninguna terminal en la Cabina;
//   retomar       una sesión de la barra se retoma en el lienzo con su
//                 `--resume`, y pulsarla otra vez no abre otra;
//   ir y volver   cambiar de vista no relanza ninguna terminal;
//   la Cabina     sigue igual: su botón de Claude abre una terminal en el mosaico.
//
// Se lanza con el MCP de Playwright, con `pnpm dev` en marcha y DESPUÉS de
// cargar el doble (`doble-conserje.js`):
//   browser_run_code_unsafe({ filename: "scripts/laboratorio/barra-en-lienzo.js" })
async (page) => {
  const SID = "aaaa1111-2222-4333-8444-555555555555";
  await page.addInitScript((sid) => {
    window.__sesiones.push({ id: sid, cwd: "C:\\proyectos\\Vidorq", title: "Arreglar el login", project: "Vidorq", live: false, estado: "lista", hours: 1 });
  }, SID);
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(4000);
  const spawns = () => page.evaluate(() => window.__llamadas.filter(([c]) => c === "pty_spawn").map(([, a]) => `${a.cwd.split("\\").pop()} | ${(a.command ?? ["(consola)"]).join(" ").replace(/.*claude/, "claude").slice(0, 70)}`));
  const cuenta = () =>
    page.evaluate(() => ({
      nodos: document.querySelectorAll(".view-lienzo .react-flow__node-term").length,
      cabina: document.querySelectorAll(".cabina-work [data-pane-id]").length,
    }));
  const caja = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);

  const r = {};
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(1500);
  r.enLienzo = {
    barra: await caja(".view-cabina .sidebar"),
    mosaico: await caja(".cabina-work"),
    panelDerecho: await caja(".lateral-zona"),
    lienzo: await caja(".view-lienzo"),
  };

  const antes = (await spawns()).length;
  await page.evaluate(() => document.querySelector(".view-cabina .sidebar button.mini.mini-claude").click());
  await page.waitForTimeout(1500);
  r.abrir = { nuevos: (await spawns()).slice(antes), ...(await cuenta()) };

  // Los proyectos nacen plegados: se despliega el de la sesión.
  if (!(await page.locator(`[data-sesion="${SID}"]`).count())) {
    await page.locator(".view-cabina .sidebar .project-main", { hasText: "Vidorq" }).first().click();
    await page.waitForTimeout(600);
  }
  const antes2 = (await spawns()).length;
  await page.locator(`[data-sesion="${SID}"] button.session`).first().click();
  await page.waitForTimeout(1500);
  r.retomar = { nuevos: (await spawns()).slice(antes2), ...(await cuenta()) };
  await page.locator(`[data-sesion="${SID}"] button.session`).first().click();
  await page.waitForTimeout(1200);
  r.retomarOtraVez = { nuevos: (await spawns()).slice(antes2 + r.retomar.nuevos.length), ...(await cuenta()) };

  const antes3 = (await spawns()).length;
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-tab="lienzo"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-tab="cabina"]').first().click();
  await page.waitForTimeout(800);
  r.irYVolver = { relanzadas: (await spawns()).length - antes3, lienzo: await caja(".view-lienzo"), mosaico: await caja(".cabina-work") };

  const antes4 = (await spawns()).length;
  await page.evaluate(() => document.querySelector(".view-cabina .sidebar button.mini.mini-claude").click());
  await page.waitForTimeout(1500);
  r.cabina = { nuevos: (await spawns()).slice(antes4), ...(await cuenta()) };
  return r;
}
