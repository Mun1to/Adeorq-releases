// El cajón del móvil como la barra del PC (Munir, 2026-10-21: «la 2» y «todas
// las sesiones que hay en el Adeorq de tu PC»): dentro de cada proyecto lo
// abierto, «Nueva sesión aquí» y sus sesiones de antes, y tocarlas las sigue en
// el PC. Contra el doble recién arrancado:
//
//   node scripts/laboratorio/bancos-movil.mjs cajon-sesiones
//
// El doble trae la s-1 ya abierta en la terminal 1 (no puede salir dos veces),
// la a-2 abierta fuera de Adeorq (no se sigue) y ocho de Layco («Ver las 8»).
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const AUT = { Authorization: "Bearer clave-de-mentira" };
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });
  const cajon = async () => {
    await page.goto(`${B}/?vez=${Math.random()}`);
    await page.waitForSelector("#abrir-cajon");
    await page.click("#abrir-cajon");
    await page.waitForSelector('#cajon .proyecto[data-proyecto="Layco"]');
    await page.waitForTimeout(300);
  };
  const desplegar = async (p) => {
    const b = `#cajon .proyecto[data-proyecto="${p}"]`;
    if ((await page.getAttribute(b, "aria-expanded")) !== "true") await page.click(b);
    await page.waitForTimeout(150);
  };
  const delProyecto = (p) => page.$eval(`#cajon .proyecto[data-proyecto="${p}"]`, (b) => {
    const filas = b.nextElementSibling;
    return {
      cuenta: b.querySelector(".p-cuenta")?.textContent ?? null,
      nueva: !!filas.querySelector(".p-nueva"),
      sesiones: [...filas.querySelectorAll("[data-sesion]")].map((x) => x.dataset.sesion),
      mas: filas.querySelector("[data-mas-ses]")?.textContent.trim() ?? null,
    };
  });
  const abiertas = async () => (await (await fetch(`${B}/api/abiertas`, { headers: AUT })).json()).abiertas;

  // 1. Un proyecto con solo sesiones de antes también sale, sin cuenta.
  await cajon();
  await desplegar("Orquio");
  pasos.orquio = await delProyecto("Orquio");
  debe(pasos.orquio.cuenta === null && pasos.orquio.nueva && pasos.orquio.sesiones.join() === "o-1", `Orquio, con su sesión y sin cuenta de abiertas (${JSON.stringify(pasos.orquio)})`);

  // 2. Adeorq: «Nueva sesión aquí» y sus sesiones, sin la que ya está en la terminal 1.
  await desplegar("Adeorq");
  pasos.adeorq = await delProyecto("Adeorq");
  debe(pasos.adeorq.nueva && pasos.adeorq.sesiones.join() === "a-1,a-2", `en Adeorq, nueva y las dos de antes, no la abierta (${JSON.stringify(pasos.adeorq)})`);

  // 3. Layco: cinco y «Ver las 8»; al tocarlo, las ocho.
  await desplegar("Layco");
  pasos.layco = await delProyecto("Layco");
  debe(pasos.layco.sesiones.length === 5 && /8/.test(pasos.layco.mas || ""), `Layco enseña cinco y «Ver las 8» (${JSON.stringify(pasos.layco)})`);
  await page.click('#cajon [data-mas-ses="Layco"]');
  await page.waitForTimeout(200);
  pasos.laycoTodas = await delProyecto("Layco");
  debe(pasos.laycoTodas.sesiones.length === 8 && !pasos.laycoTodas.mas, `y al tocarlo, las ocho (${JSON.stringify(pasos.laycoTodas)})`);
  pasos.ancho = await page.evaluate(() => ({ cajon: document.querySelector(".recientes").scrollWidth <= document.querySelector(".recientes").clientWidth + 1, doc: document.documentElement.scrollWidth }));
  debe(pasos.ancho.cajon && pasos.ancho.doc <= 390, `nada se sale de lado (${JSON.stringify(pasos.ancho)})`);
  await page.screenshot({ path: ".playwright-mcp/movil-cajon-sesiones-1.png" });

  // 4. La que está abierta fuera de Adeorq no se sigue: lo dice su fila.
  const antes = (await abiertas()).length;
  await page.click('#cajon [data-sesion="a-2"]');
  await page.waitForSelector('#cajon [data-sesion="a-2"] [data-mal]');
  pasos.viva = await page.textContent('#cajon [data-sesion="a-2"] [data-lado]');
  debe(/fuera de Adeorq/.test(pasos.viva) && (await abiertas()).length === antes, `la abierta fuera se queda como está y lo dice (${pasos.viva})`);

  // 5. «Nueva sesión aquí» en crypto: la pantalla nueva con crypto elegido y su sesión para seguir.
  await desplegar("crypto");
  await page.click('#cajon .proyecto[data-proyecto="crypto"] + .p-filas .p-nueva');
  await page.waitForSelector("#n-abrir");
  await page.waitForSelector("#n-seguir [data-sesion]");
  pasos.nueva = await page.evaluate(() => ({
    elegido: document.querySelector('#n-proyectos [aria-checked="true"] b')?.textContent,
    seguir: document.querySelector("#n-seguir .seccion")?.textContent,
    sesiones: [...document.querySelectorAll("#n-seguir [data-sesion]")].map((x) => x.dataset.sesion),
  }));
  debe(pasos.nueva.elegido === "crypto" && /crypto/.test(pasos.nueva.seguir || "") && pasos.nueva.sesiones.join() === "c-1", `llega con crypto elegido y su sesión para seguir (${JSON.stringify(pasos.nueva)})`);
  await page.screenshot({ path: ".playwright-mcp/movil-cajon-sesiones-2.png" });

  // 6. Seguirla: el PC la abre y el móvil entra en esa terminal.
  await page.click('#n-seguir [data-sesion="c-1"]');
  await page.waitForFunction(() => e.vista === "terminal", null, { timeout: 5000 }).catch(() => {});
  const pedido = (await abiertas()).slice(antes);
  pasos.seguida = { pedido, vista: await page.evaluate(() => ({ vista: e.vista, panel: e.panel })) };
  debe(pedido.length === 1 && pedido[0].seguida === "c-1" && pasos.seguida.vista.vista === "terminal" && pasos.seguida.vista.panel === pedido[0].panel, `seguir c-1 abre su terminal y entra (${JSON.stringify(pasos.seguida)})`);

  // 7. Y en el cajón ya no sale como sesión de antes: está en su terminal.
  await cajon();
  await desplegar("crypto");
  pasos.despues = await delProyecto("crypto");
  debe(!pasos.despues.sesiones.includes("c-1"), `la seguida ya no sale dos veces (${JSON.stringify(pasos.despues)})`);

  // 8. «Otro proyecto…»: la pantalla nueva con todos los proyectos.
  await page.click("#cajon .p-otro");
  await page.waitForSelector("#n-abrir");
  pasos.otro = await page.evaluate(() => document.querySelector('#n-proyectos [aria-checked="true"] b')?.textContent);
  debe(pasos.otro === "Adeorq", `«Otro proyecto…» abre la pantalla con el de hace menos elegido (${pasos.otro})`);

  return { pasos, fallos };
}
