// Lo reciente del cajón, agrupado por proyecto y con lo último que usaste
// arriba (Munir, 2026-10-16: «que las sesiones o chats que se usen pasen arriba
// del panel de la izquierda y estén agrupados en proyectos»). Una conversación
// va con el proyecto de su última sesión; entrar en una terminal la sube, con
// su proyecto.
//
//   node scripts/laboratorio/doble-movil.mjs 4390
//   node scripts/laboratorio/banco-sin-mcp.mjs scripts/laboratorio/movil-cajon-proyectos.js
//
// Devuelve { pasos, fallos }.
async (page) => {
  const B = "http://127.0.0.1:4390";
  const fallos = [];
  const debe = (ok, que) => { if (!ok) fallos.push(que); };
  const pasos = {};
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${B}/`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("adeorq-movil-clave", "clave-de-mentira"); });
  await page.goto(`${B}/?v=1`);
  await page.waitForSelector("#portada-term");

  const leerCajon = async () => {
    await page.click("#abrir-cajon");
    await page.waitForSelector("#cajon .recientes .seccion");
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => [...document.querySelectorAll("#cajon .recientes .seccion")].map((h) => {
      const filas = [];
      for (let el = h.nextElementSibling; el && !el.classList.contains("seccion"); el = el.nextElementSibling) {
        filas.push(el.dataset.panel ? `t${el.dataset.panel}` : `c:${el.dataset.conv}`);
      }
      return { proyecto: h.textContent.trim(), filas };
    }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return r;
  };
  const entrarEn = async (panel) => {
    await page.goto(`${B}/?p=${panel}#terminal=${panel}@111`);
    await page.waitForSelector("#texto");
    await page.waitForTimeout(400);
  };

  pasos.alEmpezar = await leerCajon();
  const proyectos = pasos.alEmpezar.map((g) => g.proyecto);
  debe(new Set(proyectos).size === proyectos.length, `cada proyecto sale una vez (${proyectos})`);
  const webs = pasos.alEmpezar.find((g) => g.proyecto === "Webs");
  debe(webs && webs.filas.includes("t4") && webs.filas.includes("c:vieja1"), `la conversación va con el proyecto de su sesión (${JSON.stringify(webs)})`);
  debe(pasos.alEmpezar[0]?.proyecto === "Webs", `sin nada usado, arriba lo que tiene lo último dicho (${proyectos})`);

  await entrarEn(3);
  pasos.trasVidorq = await leerCajon();
  debe(pasos.trasVidorq[0]?.proyecto === "Vidorq" && pasos.trasVidorq[0]?.filas[0] === "t3", `al usar la consola de Vidorq, su proyecto sube arriba (${JSON.stringify(pasos.trasVidorq.slice(0, 2))})`);

  await entrarEn(2);
  pasos.trasRadar = await leerCajon();
  debe(JSON.stringify(pasos.trasRadar.slice(0, 2).map((g) => g.proyecto)) === JSON.stringify(["radar-bot", "Vidorq"]), `y la última usada va primero (${pasos.trasRadar.map((g) => g.proyecto)})`);
  return { pasos, fallos };
}
