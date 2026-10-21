// Lo reciente del cajón, agrupado por proyecto y con lo último que usaste
// arriba (Munir, 2026-10-16: «que las sesiones o chats que se usen pasen arriba
// del panel de la izquierda y estén agrupados en proyectos»). Una conversación
// va con el proyecto de su última sesión; entrar en una terminal la sube, con
// su proyecto. Y cada proyecto como en la barra del PC (el mismo día: «que se
// pueda desplegar o no y esté el logo»): el proyecto es lo que cuelga de la
// carpeta madre, lleva su logo o su inicial, se pliega, y se acuerda.
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

  const abrir = async () => {
    await page.click("#abrir-cajon");
    await page.waitForSelector("#cajon .recientes .grupo-proy");
    await page.waitForTimeout(400);
  };
  const cerrar = async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  };
  const grupos = () => page.evaluate(() => [...document.querySelectorAll("#cajon .recientes .grupo-proy")].map((g) => {
    const cab = g.querySelector(".proyecto");
    const logo = cab.querySelector(".p-logo");
    return {
      proyecto: cab.querySelector("b").textContent.trim(),
      abierto: cab.getAttribute("aria-expanded") === "true",
      seVe: !g.querySelector(".p-filas").hidden,
      cuenta: cab.querySelector(".p-cuenta")?.textContent,
      logo: logo.querySelector("img") ? "img" : logo.textContent.trim(),
      filas: [...g.querySelectorAll(".p-filas > button[data-panel], .p-filas > button[data-conv]")].map((el) => (el.dataset.panel ? `t${el.dataset.panel}` : `c:${el.dataset.conv}`)),
    };
  }));
  const leerCajon = async () => { await abrir(); const r = await grupos(); await cerrar(); return r; };
  const entrarEn = async (panel) => {
    await page.goto(`${B}/?p=${panel}#terminal=${panel}@111`);
    await page.waitForSelector("#texto");
    await page.waitForTimeout(400);
  };

  pasos.alEmpezar = await leerCajon();
  const proyectos = pasos.alEmpezar.map((g) => g.proyecto);
  debe(new Set(proyectos).size === proyectos.length, `cada proyecto sale una vez (${proyectos})`);
  const webs = pasos.alEmpezar.find((g) => g.proyecto === "Webs");
  debe(webs && webs.filas.includes("t4") && webs.filas.includes("c:vieja1") && webs.cuenta === String(webs.filas.length), `la conversación va con el proyecto de su sesión, y se cuentan (${JSON.stringify(webs)})`);
  // Lo que trabaja va arriba (2026-10-16): la 1, de Adeorq, está a medias.
  debe(pasos.alEmpezar[0]?.proyecto === "Adeorq", `sin nada usado, arriba el proyecto que trabaja (${proyectos})`);
  // Lo que cuelga de una subcarpeta va con su proyecto, como en la barra del PC.
  debe(proyectos.includes("crypto") && !proyectos.includes("radar-bot"), `radar-bot (C:\\proyectos\\crypto\\radar-bot) va con crypto (${proyectos})`);
  debe(pasos.alEmpezar.every((g) => !g.abierto && !g.seVe), `desde el inicio, todos plegados (${JSON.stringify(pasos.alEmpezar.map((g) => [g.proyecto, g.abierto]))})`);
  const adeorq = pasos.alEmpezar.find((g) => g.proyecto === "Adeorq");
  debe(adeorq?.logo === "img" && webs?.logo === "W", `Adeorq con su logo y Webs con su inicial (${JSON.stringify([adeorq?.logo, webs?.logo])})`);

  // Tocar la cabeza lo despliega, y se acuerda la próxima vez.
  await abrir();
  await page.click('#cajon .proyecto[data-proyecto="Webs"]');
  pasos.trasTocar = (await grupos()).find((g) => g.proyecto === "Webs");
  await cerrar();
  debe(pasos.trasTocar.abierto && pasos.trasTocar.seVe, `tocar Webs lo despliega (${JSON.stringify(pasos.trasTocar)})`);
  pasos.otraVez = (await leerCajon()).find((g) => g.proyecto === "Webs");
  debe(pasos.otraVez.abierto, "y al volver a abrir el cajón sigue desplegado");

  // Dentro de una terminal, su proyecto nace abierto; y entrar la sube arriba.
  await entrarEn(3);
  pasos.trasVidorq = await leerCajon();
  const vidorq = pasos.trasVidorq.find((g) => g.proyecto === "Vidorq");
  debe(pasos.trasVidorq[1]?.proyecto === "Vidorq" && vidorq?.filas[0] === "t3" && vidorq?.abierto, `al usar la consola de Vidorq, su proyecto sube, abierto, justo debajo del que trabaja (${JSON.stringify(pasos.trasVidorq.slice(0, 2))})`);

  await entrarEn(2);
  pasos.trasRadar = await leerCajon();
  debe(JSON.stringify(pasos.trasRadar.slice(0, 3).map((g) => g.proyecto)) === JSON.stringify(["Adeorq", "crypto", "Vidorq"]), `y la última usada va primero tras la que trabaja (${pasos.trasRadar.map((g) => g.proyecto)})`);

  // Con el cajón abierto, otro se pone a trabajar: sube él solo. Y cuando para,
  // se queda arriba hasta que trabaje otro (Munir, 2026-10-16).
  const sembrar = (panel, estado) => page.request.post(`${B}/api/sembrar-estado`, { headers: { Authorization: "Bearer clave-de-mentira", "Content-Type": "application/json" }, data: { panel, estado } });
  await abrir();
  await sembrar(1, "lista");
  await sembrar(4, "a_medias");
  await page.waitForTimeout(5200);
  pasos.trabajaWebs = (await grupos()).map((g) => g.proyecto);
  debe(JSON.stringify(pasos.trabajaWebs.slice(0, 2)) === JSON.stringify(["Webs", "Adeorq"]), `con el cajón abierto, Webs se pone a trabajar y sube solo, y Adeorq, que acaba de parar, detrás (${pasos.trabajaWebs})`);
  await sembrar(4, "lista");
  await page.waitForTimeout(5200);
  pasos.paraWebs = (await grupos()).map((g) => g.proyecto);
  debe(pasos.paraWebs[0] === "Webs", `Webs para y se queda arriba hasta que trabaje otro (${pasos.paraWebs})`);
  await cerrar();

  // Lo abierto en la carpeta madre misma va a «Sueltas», como en el PC.
  pasos.sueltas = await page.evaluate(() => [proyectoDe("C:\\proyectos", "C:\\proyectos").nombre, proyectoDe("C:\\proyectos\\Adeorq\\src", "C:\\proyectos\\").nombre, proyectoDe("D:\\otra\\cosa", "C:\\proyectos").nombre]);
  debe(JSON.stringify(pasos.sueltas) === JSON.stringify(["Sueltas", "Adeorq", "cosa"]), `madre, subcarpeta y fuera de la madre (${pasos.sueltas})`);
  pasos.ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  debe(pasos.ancho <= 412, `nada se sale por la derecha (${pasos.ancho})`);
  return { pasos, fallos };
}
